const fs = require('node:fs');
const { chromium } = require('@playwright/test');
const base = process.env.WAFFLE_URL || 'http://localhost:8777/index.html';
const output = process.env.WAFFLE_QA || 'artifacts/qa';
let browser;

(async () => {
  fs.mkdirSync(output, { recursive: true });
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'UTC' });
  const page = await context.newPage();
  await page.goto(base);
  await page.locator('[data-action=commit]').waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  const client = await context.newCDPSession(page);
  const results = [];
  for (const rate of [1, 4]) {
    await client.send('Emulation.setCPUThrottlingRate', { rate });
    for (const days of [0, 365, 1825, 3650]) {
      const result = await page.evaluate(async ({ days, rate }) => {
        const model = await import('./model.js');
        const storage = await import('./storage.js');
        const view = await import('./view.js');
        const state = model.createState();
        const today = model.dateKey();
        for (let index = 1; index <= days; index++) {
          const date = model.addDays(today, -index);
          const time = new Date(`${date}T09:00:00Z`).getTime();
          state.days[date] = {
            date, focus: 8, waffle: 4, committedAt: time, endedAt: time + 21600000, off: false, partials: [],
            sessions: Array.from({ length: 12 }, (_, session) => ({
              id: `session-${date}-${session}`, grade: session < 8 ? 'focus' : 'waffle', durationMs: model.SESSION_MS,
              completedAt: time + (session + 1) * model.SESSION_MS, ratedAt: time + (session + 1) * model.SESSION_MS,
            })),
          };
        }
        await storage.restoreBackup(state);
        const times = { validate: [], clone: [], update: [], storageSync: [], renderCalendar: [], paintCalendar: [], storageChange: [] };
        const ui = { page: 'calendar', selectedDay: today, month: today.slice(0, 7), sheet: null, toast: null };
        for (let run = 0; run < 5; run++) {
          let start = performance.now();
          model.validateState(state);
          times.validate.push(performance.now() - start);
          start = performance.now();
          structuredClone(state);
          times.clone.push(performance.now() - start);
          start = performance.now();
          model.updateState(state);
          times.update.push(performance.now() - start);
          start = performance.now();
          await storage.change();
          times.storageSync.push(performance.now() - start);
          start = performance.now();
          const html = view.render(state, ui);
          times.renderCalendar.push(performance.now() - start);
          const box = document.createElement('div');
          document.body.appendChild(box);
          start = performance.now();
          box.innerHTML = html;
          void box.offsetHeight;
          times.paintCalendar.push(performance.now() - start);
          box.remove();
          start = performance.now();
          await storage.change({ type: 'SETTING', key: 'sound', value: run % 2 === 0 });
          times.storageChange.push(performance.now() - start);
        }
        const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
        return {
          days, rate, sessions: days * 12, bytes: JSON.stringify(state).length,
          medianMs: Object.fromEntries(Object.entries(times).map(([key, values]) => [key, Math.round(median(values) * 10) / 10])),
          rawMs: times,
        };
      }, { days, rate });
      results.push(result);
      console.log(JSON.stringify({ days, rate, medianMs: result.medianMs }));
    }
  }
  fs.writeFileSync(`${output}/performance.json`, JSON.stringify(results, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => { await browser?.close(); });
