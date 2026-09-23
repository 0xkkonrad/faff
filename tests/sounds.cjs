const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { [process.env.FAFF_BROWSER || 'chromium']: browserType, expect } = require('@playwright/test');
let base = process.env.FAFF_URL, browser, server, disconnected = false;

async function instrument(page) {
  await page.addInitScript(() => {
    const Native = window.AudioContext || window.webkitAudioContext;
    window.soundContexts = [];
    window.AudioContext = class extends Native {
      constructor() {
        super();
        const analyser = this.createAnalyser();
        analyser.fftSize = 2048;
        analyser.connect(this.destination);
        const record = { context: this, analyser, tones: [], backgrounds: 0, playing: 0 };
        window.soundContexts.push(record);
        const gain = this.createGain.bind(this);
        this.createGain = () => {
          const node = gain(), connect = node.connect.bind(node);
          node.connect = (destination, ...args) => connect(destination === this.destination ? analyser : destination, ...args);
          return node;
        };
        for (const method of ['createOscillator', 'createBufferSource']) {
          const create = this[method].bind(this);
          this[method] = () => {
            const node = create(), start = node.start.bind(node);
            node.start = (...args) => {
              if (method === 'createOscillator') record.tones.push(Number(node.frequency.value.toFixed(2)));
              else { record.backgrounds++; record.playing++; }
              return start(...args);
            };
            if (method === 'createBufferSource') node.addEventListener('ended', () => record.playing--);
            return node;
          };
        }
      }
    };
  });
}

async function audio(page) {
  return page.evaluate(() => window.soundContexts.map(record => {
    const values = new Float32Array(record.analyser.fftSize);
    record.analyser.getFloatTimeDomainData(values);
    return { tones: record.tones, backgrounds: record.backgrounds, playing: record.playing,
      rms: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length) };
  }));
}
async function playing(page) { return (await audio(page)).reduce((sum, item) => sum + item.playing, 0); }
async function volume(page, key, value) {
  await page.evaluate(({ key, amount }) => {
    const input = document.querySelector(`[data-setting=${key}]`);
    input.value = String(amount);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { key, amount: value });
  await expect(page.locator(`[data-setting=${key}]`)).toHaveValue(String(value));
  await expect.poll(() => page.evaluate(async key => (await (await import('./storage.js')).change()).state.settings[key], key)).toBe(value);
}

(async () => {
  if (!base) {
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
    server = http.createServer((request, response) => {
      if (disconnected) { request.socket.destroy(); return; }
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const file = path.join(__dirname, '../web', pathname === '/' ? '/index.html' : pathname);
      try {
        const body = fs.readFileSync(file);
        response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
        response.end(body);
      } catch { response.writeHead(404); response.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/`;
  }
  browser = await browserType.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await instrument(page);
  await page.clock.install({ time: new Date('2026-09-23T10:00:00Z') });
  await page.goto(base);
  await page.locator('[data-action=options]').click();
  await page.locator('[data-action=sounds]').click();
  assert.deepEqual(await audio(page), [], 'opening settings does not autoplay');
  for (const [choice, expected] of [['bell', [880, 1760]], ['chime', [523.25, 659.25, 783.99]], ['beep', [660, 660]]]) {
    await page.locator('[data-setting=chime]').selectOption(choice);
    await page.locator('[data-action=preview-chime]').click();
    await expect.poll(async () => (await audio(page))[0]?.tones.slice(-expected.length)).toEqual(expected);
    await expect.poll(async () => (await audio(page))[0]?.rms).toBeGreaterThan(0.0001);
  }
  await volume(page, 'soundVolume', 35);
  await page.locator('[data-setting=sound]').click();
  await expect(page.locator('[data-action=preview-chime]')).toBeDisabled();
  await expect.poll(async () => (await audio(page))[0]?.rms).toBeLessThan(0.00001);
  await page.locator('[data-setting=sound]').click();
  await page.locator('[data-setting=ambience]').selectOption('rain');
  await expect.poll(() => playing(page)).toBe(0);
  await page.locator('[data-action=preview-ambience]').click();
  await expect.poll(() => playing(page)).toBe(1);
  await expect.poll(async () => (await audio(page))[0]?.rms).toBeGreaterThan(0.001);
  await page.clock.fastForward(5100);
  await expect(page.locator('[data-action=preview-ambience]')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => playing(page)).toBe(0);
  await page.locator('[data-setting=ambience]').selectOption('brown');
  await volume(page, 'ambienceVolume', 40);
  await page.locator('[data-action=preview-ambience]').click();
  await expect.poll(() => playing(page)).toBe(1);
  await expect.poll(async () => (await audio(page))[0]?.rms).toBeGreaterThan(0.001);
  fs.mkdirSync('artifacts/qa', { recursive: true });
  await page.screenshot({ path: `artifacts/qa/sounds-${process.env.FAFF_BROWSER || 'chromium'}.png` });
  await page.keyboard.press('Escape');
  await expect.poll(() => playing(page)).toBe(0);
  await page.locator('[data-action=commit]').click();
  await page.locator('[data-action=start]').click();
  await expect.poll(() => playing(page)).toBe(1);
  await page.locator('[data-action=pause]').click();
  await expect.poll(() => playing(page)).toBe(0);
  await page.locator('[data-action=resume]').click();
  await expect.poll(() => playing(page)).toBe(1);
  await page.reload();
  await expect(page.locator('[data-action=enable-sound]')).toBeVisible();
  assert.deepEqual(await audio(page), [], 'reload waits for a sound gesture');
  await page.locator('[data-action=enable-sound]').click();
  await expect.poll(() => playing(page)).toBe(1);
  const second = await context.newPage();
  second.on('pageerror', error => errors.push(error.message));
  await instrument(second);
  await second.clock.install({ time: new Date('2026-09-23T10:00:10Z') });
  await second.goto(base);
  await second.locator('[data-action=enable-sound]').click();
  await second.clock.runFor(1100);
  assert.equal(await playing(second), 0, 'second window does not double the background sound');
  await second.locator('[data-action=pause]').click();
  await expect.poll(() => playing(page)).toBe(0);
  await page.locator('[data-action=resume]').click();
  await expect.poll(() => playing(page)).toBe(1);
  await second.reload();
  await expect(second.locator('[data-action=enable-sound]')).toBeVisible();
  await second.clock.fastForward(30 * 60000);
  await expect(page.locator('[data-grade=focus]')).toBeVisible();
  await expect.poll(() => playing(page)).toBe(0);
  await expect.poll(async () => (await audio(page))[0]?.tones).toEqual([660, 660]);
  assert.deepEqual(await audio(second), [], 'an unarmed window can finish the timer while the armed window plays the chime');
  await second.close();
  await page.locator('[data-grade=focus]').click();
  await page.locator('[data-action=sounds]').click();
  await expect(page.locator('[data-setting=chime]')).toHaveValue('beep');
  await expect(page.locator('[data-setting=soundVolume]')).toHaveValue('35');
  await expect(page.locator('[data-setting=ambienceVolume]')).toHaveValue('40');
  await page.locator('[data-setting=ambience]').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-action=preview-ambience]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-setting=ambienceVolume]')).toBeFocused();
  await volume(page, 'ambienceVolume', 0);
  await expect(page.locator('[data-action=preview-ambience]')).toBeDisabled();
  await volume(page, 'ambienceVolume', 40);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  // WebKit's offline emulation bypasses service workers; disconnect our server instead.
  if (server) disconnected = true;
  else await context.setOffline(true);
  await page.reload();
  await page.locator('[data-action=start]').click();
  await expect.poll(() => playing(page)).toBe(1);
  await page.locator('[data-action=pause]').click();
  await expect.poll(() => playing(page)).toBe(0);
  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS audible chimes and ambience, previews, mute, volume, timer lifecycle, reload, multiple windows, keyboard controls, and offline audio');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
