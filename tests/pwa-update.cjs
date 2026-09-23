const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');

const currentRoot = path.resolve(__dirname, '../web');
const previousRoot = process.env.FAFF_PREVIOUS_WEB || currentRoot;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
let version = 1;
let browser;
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = pathname === '/' ? '/index.html' : pathname;
  try {
    let body = fs.readFileSync(path.join(version === 1 ? previousRoot : currentRoot, file));
    if (file === '/sw.js') body = body.toString().replace(/faff-shell-[\w-]+/, `faff-shell-update-test-${version}`);
    if (file === '/app.js') body = `${body}\nwindow.testShellVersion = ${version};\n`;
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

async function snapshot(page) {
  return page.evaluate(async () => ({
    state: (await (await import('./storage.js')).change()).state,
    version: window.testShellVersion,
    caches: await caches.keys(),
  }));
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
  for (const phase of ['running', 'paused', 'review']) {
    version = 1;
    const context = await browser.newContext();
    const first = await context.newPage();
    const errors = [];
    first.on('pageerror', error => errors.push(error.message));
    await first.goto(base);
    await first.locator('[data-action=commit]').click();
    await first.locator('[data-action=start]').click();
    await first.locator('[data-action=pause]').waitFor();
    if (phase === 'paused') await first.locator('[data-action=pause]').click();
    if (phase === 'review') {
      await first.evaluate(async () => {
        const storage = await import('./storage.js');
        const state = (await storage.change()).state;
        state.active.deadline = Date.now() - 1000;
        await storage.restoreBackup(state);
      });
      await first.reload();
      await first.locator('[data-grade=focus]').waitFor();
    }
    await first.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    });
    const before = await snapshot(first);
    const second = await context.newPage();
    second.on('pageerror', error => errors.push(error.message));
    await second.goto(base);
    await second.locator('[data-action=options]').waitFor();
    version = 2;
    await first.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    for (const page of [first, second]) {
      await page.locator('[data-action=options]').click();
      await expect(page.locator('[data-action=update]')).toBeVisible();
      assert.equal(await page.evaluate(() => window.testShellVersion), 1);
    }
    await first.locator('[data-action=update]').click();
    for (const page of [first, second]) {
      await expect.poll(() => page.evaluate(() => window.testShellVersion).catch(() => null)).toBe(2);
    }
    await context.setOffline(true);
    await first.reload();
    await first.locator('[data-action=options]').waitFor();
    const after = await snapshot(first);
    assert.deepEqual(after.state.active, before.state.active, `${phase} timer survives update and offline reload`);
    assert.deepEqual(after.state.days, before.state.days);
    assert.equal(after.version, 2);
    assert.deepEqual(after.caches, ['faff-shell-update-test-2']);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS two-window update and offline reload preserve ${phase} timer`);
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
});
