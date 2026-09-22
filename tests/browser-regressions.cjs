const { [process.env.WAFFLE_BROWSER || 'chromium']: browserType, expect } = require(process.env.WAFFLE_PLAYWRIGHT || '@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.WAFFLE_URL || 'http://localhost:8777/index.html';
const output = process.env.WAFFLE_QA || 'artifacts/qa/regressions';
fs.mkdirSync(output, { recursive: true });
const start = new Date('2026-09-22T09:00:00Z');
const results = [];
let browser;
async function fresh(width = 390, height = 844) {
  const context = await browser.newContext({ viewport: { width, height }, timezoneId: 'UTC' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: start });
  await page.goto(base);
  await expect(page.locator('[data-action=commit]')).toBeVisible();
  return { context, page, errors };
}
async function saved(page) {
  return page.evaluate(async () => (await (await import('./storage.js')).change()).state);
}
async function completeOne(page) {
  await page.locator('[data-action=commit]').click();
  await expect(page.locator('[data-action=start]')).toBeVisible();
  await page.locator('[data-action=start]').click();
  await expect(page.locator('[data-action=pause]')).toBeVisible();
  await page.clock.fastForward(30 * 60000);
  await expect(page.locator('[data-grade=focus]')).toBeVisible();
  await page.locator('[data-grade=focus]').click();
  await expect(page.locator('[data-action=undo]')).toBeVisible();
}
async function run(name, fn, width, height) {
  browser = await browserType.launch({ headless: true });
  const test = await fresh(width, height);
  try {
    await fn(test);
    assert.deepEqual(test.errors, [], 'Unexpected browser error');
    results.push({ name, status: 'PASS' });
  } catch (error) {
    await test.page.screenshot({ path: `${output}/${name}.png` }).catch(() => {});
    results.push({ name, status: 'FAIL', message: error.message, browserErrors: test.errors });
  } finally {
    await test.context.close();
    await browser.close();
  }
}
(async () => {
  await run('keyboard-timer-and-completion', async ({ page }) => {
    await page.locator('[data-action=commit]').focus();
    for (const next of ['start', 'pause', 'resume', 'pause']) {
      await page.keyboard.press('Enter');
      await expect(page.locator(`[data-action=${next}]`)).toBeFocused();
    }
    const statusNode = await page.locator('#session-status').elementHandle();
    await page.clock.fastForward(30 * 60000);
    await expect(page.locator('[data-grade=focus]')).toBeFocused();
    await expect(page.locator('#session-status')).toHaveAttribute('role', 'status');
    await expect(page.locator('#session-status')).toHaveText('Session finished. Rate your session as focused or waffle.');
    assert(await statusNode.evaluate(node => node === document.querySelector('#session-status')), 'Live region must survive app repaint');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-action=start]')).toBeFocused();
    await expect(page.locator('#session-status')).toHaveText('');
  }, 1024, 768);
  await run('modal-hides-undo-without-losing-it', async ({ page }) => {
    await completeOne(page);
    await page.locator('[data-action=options]').click();
    await expect(page.locator('[role=dialog]')).toBeVisible();
    await expect(page.locator('[data-action=undo]')).toHaveCount(0);
    await expect(page.locator('[data-action=end]')).toBeVisible();
    await page.screenshot({ path: `${output}/modal-mobile.png` });
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-action=undo]')).toBeVisible();
    await page.locator('[data-action=undo]').click();
    await expect(page.locator('[data-grade=focus]')).toBeVisible();
    assert.equal((await saved(page)).days['2026-09-22'].sessions.length, 0);
  });
  for (const [width, height] of [[390,844], [1024,768], [667,375]]) {
    await run(`dialog-keyboard-${width}`, async ({ page }) => {
      await page.locator('[data-action=options]').click();
      await page.locator('[data-action=settings]').click();
      const dialog = page.locator('[role=dialog]');
      await expect(dialog).toBeFocused();
      assert(await page.locator('.app-header').evaluate(node => node.inert));
      assert(await page.locator('.app-body').evaluate(node => node.inert));
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator('[data-action=import]')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('[data-action=close-sheet]')).toBeFocused();
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        assert(await dialog.evaluate(node => node.contains(document.activeElement)), 'Focus escaped the modal');
      }
      await page.locator('[data-setting=sound]').focus();
      const checked = await page.locator('[data-setting=sound]').getAttribute('aria-checked');
      await page.keyboard.press('Space');
      await expect(page.locator('[data-setting=sound]')).toHaveAttribute('aria-checked', checked === 'true' ? 'false' : 'true');
      await expect(page.locator('[data-setting=sound]')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('[data-action=options]')).toBeFocused();
    }, width, height);
  }
  await run('history-reload-today', async ({ page }) => {
    await completeOne(page);
    await page.locator('.calendar-button').click();
    await page.locator('.selected-day [data-action=history]').click();
    await expect(page.locator('.history-page')).toBeVisible();
    await page.reload();
    await expect(page.locator('.history-page')).toBeVisible();
    await expect(page.locator('.session-row[data-correct]')).toHaveCount(1);
  });
  await run('history-reload-retains-selected-date', async ({ page }) => {
    await seedPastSession(page);
    await page.locator('.calendar-button').click();
    await page.locator('[data-day="2026-09-21"]').click();
    await page.locator('.selected-day [data-action=history]').click();
    await expect(page.locator('.back-row .back')).toHaveText('21 sept');
    await page.reload();
    await expect(page.locator('.history-page')).toBeVisible();
    await expect(page.locator('.back-row .back')).toHaveText('21 sept');
    await expect(page.locator('.session-row[data-correct]')).toHaveCount(1);
  });
  await run('null-backup-retains-data', async ({ page }) => {
    await completeOne(page);
    const before = await saved(page);
    await page.locator('[data-action=options]').click();
    await page.locator('[data-action=settings]').click();
    await page.locator('#backup-file').setInputFiles({ name: 'null.json', mimeType: 'application/json', buffer: Buffer.from('null') });
    await expect(page.locator('.app-toast')).toHaveText('Choose a Waffle backup file.');
    await expect(page.locator('[data-action=confirm-restore]')).toHaveCount(0);
    assert.deepEqual(await saved(page), before);
  });
  for (const preserveDay of [false, true]) {
    await run(`cross-tab-restore-stale-correction-${preserveDay ? 'session' : 'day'}`, async ({ context, page, errors }) => {
      await seedPastSession(page);
      await page.locator('.calendar-button').click();
      await page.locator('[data-day="2026-09-21"]').click();
      await page.locator('.selected-day [data-action=history]').click();
      await page.locator('[data-correct]').click();
      await expect(page.locator('[role=dialog]')).toHaveAttribute('aria-label', 'session 1');
      const second = await context.newPage();
      second.on('pageerror', error => errors.push(error.message));
      await second.clock.install({ time: start });
      await second.goto(base);
      await expect(second.locator('[data-action=commit]')).toBeVisible();
      const backup = await second.evaluate(async preserve => {
        const model = await import('./model.js');
        const data = model.createState();
        if (preserve) data.days['2026-09-21'] = model.newDay('2026-09-21', data.defaults);
        return { kind: 'waffle-backup', data };
      }, preserveDay);
      await second.locator('[data-action=options]').click();
      await second.locator('[data-action=settings]').click();
      await second.locator('#backup-file').setInputFiles({ name: 'fresh.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
      await second.locator('[data-action=confirm-restore]').click();
      await expect(second.locator('.app-toast')).toHaveText('backup restored');
      await expect(page.locator('[role=dialog]')).toHaveCount(0);
      await expect(page.locator('.history-page')).toContainText('no sessions yet');
      await expect(page.locator('[data-correct]')).toHaveCount(0);
      await page.locator('.wordmark').click();
      await expect(page.locator('[data-action=commit]')).toBeVisible();
    });
  }
  await run('unchanged-sync-preserves-the-view', async ({ page }) => {
    const header = await page.locator('.app-header').elementHandle();
    await page.evaluate(() => new Promise(resolve => {
      const root = document.querySelector('#waffle-app');
      const observer = new MutationObserver(() => {
        if (!root.hasAttribute('aria-busy')) { observer.disconnect(); resolve(); }
      });
      observer.observe(root, { attributes: true, attributeFilter: ['aria-busy'] });
      window.dispatchEvent(new Event('focus'));
    }));
    assert(await header.evaluate(node => node === document.querySelector('.app-header')), 'Unchanged sync replaced the view');
  });
  await run('idle-title-is-stable', async ({ page }) => {
    await page.evaluate(() => {
      window.titleMutations = 0;
      new MutationObserver(records => { window.titleMutations += records.length; }).observe(document.querySelector('title'), { childList: true });
    });
    await page.clock.fastForward(3000);
    assert.equal(await page.evaluate(() => window.titleMutations), 0);
  });
  fs.writeFileSync(`${output}/results.json`, JSON.stringify({ base, results }, null, 2));
  console.log(JSON.stringify({ base, results }, null, 2));
  if (results.some(result => result.status === 'FAIL')) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
async function seedPastSession(page) {
  await page.evaluate(async () => {
    const model = await import('./model.js');
    const storage = await import('./storage.js');
    const data = model.createState();
    const now = new Date('2026-09-21T09:00:00Z').getTime();
    data.days['2026-09-21'] = {
      ...model.newDay('2026-09-21', data.defaults), committedAt: now, endedAt: now + model.SESSION_MS,
      sessions: [{ id: 'past-session', grade: 'focus', durationMs: model.SESSION_MS, completedAt: now + model.SESSION_MS, ratedAt: now + model.SESSION_MS }],
    };
    await storage.restoreBackup(data);
  });
  await page.reload();
  await expect(page.locator('[data-action=commit]')).toBeVisible();
}
