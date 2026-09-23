const { [process.env.FAFF_BROWSER || 'chromium']: browserType, expect } = require(process.env.FAFF_PLAYWRIGHT || '@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.FAFF_URL || 'http://localhost:8777/';
const output = process.env.FAFF_QA || 'artifacts/qa';
fs.mkdirSync(output, { recursive: true });
const start = new Date('2026-09-22T09:00:00Z');
const browserErrors = [];
let browser;
async function saved(page) { return page.evaluate(async () => (await (await import('./storage.js')).change()).state); }
async function ready(page) { await expect(page.locator('[data-action=commit]')).toBeVisible(); }
async function choose(page, focus, faff) {
  for (let i = 8; i > focus; i--) await page.locator('[data-plan=draft][data-field=focus][data-step="-1"]').click();
  for (let i = 4; i > faff; i--) await page.locator('[data-plan=draft][data-field=faff][data-step="-1"]').click();
}
async function capture(page, name) { await page.screenshot({ path: `${output}/${name}.png` }); }
async function fresh(width=390, height=844, time=start) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, timezoneId:'UTC' });
  const page = await context.newPage();
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.clock.install({ time });
  await page.goto(base);
  await ready(page);
  return { context, page };
}
(async () => {
  browser = await browserType.launch({ headless: true });
  const {context,page} = await fresh();
  await capture(page,'morning');
  await choose(page,1,1);
  await page.locator('[data-action=commit]').click();
  await expect(page.locator('.countdown')).toHaveText('30:00');
  await page.locator('[data-action=start]').click();
  await page.clock.fastForward(5*60000);
  await expect(page.locator('.countdown')).toHaveText('25:00');
  await page.locator('[data-action=pause]').click();
  await expect(page.locator('[data-action=resume]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-action=resume]')).toBeVisible();
  await expect(page.locator('.countdown')).toHaveText('25:00');
  await page.clock.fastForward(10*60000);
  await expect(page.locator('.countdown')).toHaveText('25:00');
  await page.locator('[data-action=targets][data-mode=focus]').click();
  await page.locator('[data-plan=targets][data-field=focus][data-step="1"]').click();
  await page.locator('[data-action=save-plan]').click();
  assert.equal((await saved(page)).days['2026-09-22'].focus,2);
  await expect(page.locator('.countdown')).toHaveText('25:00');
  await page.locator('[data-action=resume]').click();
  await capture(page,'timer');
  await page.locator('.calendar-button').click();
  await expect(page.locator('.session-dock')).toBeVisible();
  await page.locator('.wordmark').click();
  await expect(page.locator('[data-action=pause]')).toBeVisible();
  await page.clock.fastForward(25*60000);
  await expect(page.locator('[data-grade=focus]')).toBeVisible();
  await capture(page,'rating');
  await page.locator('[data-grade=faff]').click();
  await expect(page.locator('[data-action=start]')).toBeVisible();
  assert.deepEqual((await saved(page)).days['2026-09-22'].sessions.map(x=>x.grade),['faff']);
  await page.locator('[data-action=undo]').click();
  await expect(page.locator('[data-grade=focus]')).toBeVisible();
  await page.locator('[data-grade=focus]').click();
  await page.locator('.calendar-button').click();
  assert.equal(await page.locator('[data-day="2026-09-22"] [data-unit=focus]').count(),1);
  await page.locator('.selected-day [data-action=history]').click();
  await page.locator('[data-correct]').click();
  await page.locator('[data-grade=faff]').click();
  await expect(page.locator('.session-list')).toContainText('faff');
  await page.locator('.wordmark').click();
  await page.locator('[data-action=options]').click();
  await page.locator('[data-action=settings]').click();
  await expect(page.locator('[role=dialog]')).toBeVisible();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[role=dialog]').count(),0);

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
  });
  const worker = await page.evaluate(async () => ({scope:(await navigator.serviceWorker.ready).scope,keys:await caches.keys()}));
  assert.equal(worker.scope,base);
  assert(worker.keys.some(key=>key.startsWith('faff-shell-')));
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-action=start]')).toBeVisible();
  await page.locator('[data-action=start]').click();
  await page.clock.fastForward(30*60000);
  await expect(page.locator('[data-grade=focus]')).toBeVisible();
  await page.locator('[data-grade=focus]').click();
  await context.setOffline(false);
  console.log('PASS timer, pause/reload, plan edits, logo navigation, rating/undo, correction, offline');

  // Test fixtures are imported only from this external test, never shipped as app controls.
  await page.evaluate(async () => {
    const model=await import('./model.js'), storage=await import('./storage.js');
    let state=model.createState(new Date('2026-09-01T09:00:00Z').getTime());
    for(let day=1;day<=22;day++) {
      const now=new Date(`2026-09-${String(day).padStart(2,'0')}T09:00:00Z`).getTime();
      const run=(action,time=now)=>{state=model.updateState(state,action,time).state;};
      if(day===6||day===13||day===20) {run({type:'DAY_OFF'});continue;}
      const count=4+day%9;
      run({type:'COMMIT',focus:count-2,faff:2});
      for(let index=0;index<count;index++) {
        run({type:'START',id:`fixture-${day}-${index}`},now+index*model.SESSION_MS);
        run({type:'RATE',id:`fixture-${day}-${index}`,grade:index<count-2?'focus':'faff'},now+(index+1)*model.SESSION_MS);
      }
    }
    await storage.restoreBackup(state);
  });
  await page.reload();
  await page.locator('.calendar-button').click();
  await expect(page.locator('.streak-total strong')).toHaveText('19');
  await expect(page.locator('[data-day="2026-09-20"] .day-off-label')).toHaveText('-');
  assert.equal(await page.locator('[data-day="2026-09-22"] rect').count(),8);
  const weekday = await page.locator('.weekdays span').first().evaluate(element=>({weight:getComputedStyle(element).fontWeight,transform:getComputedStyle(element).textTransform}));
  assert.equal(weekday.weight,'500'); assert.equal(weekday.transform,'uppercase');
  await capture(page,'calendar');
  await page.locator('.selected-day [data-action=history]').click();
  await capture(page,'history');
  await page.locator('.wordmark').click();
  await page.locator('[data-action=options]').click();
  await page.locator('[data-action=settings]').click();
  const download = page.waitForEvent('download');
  await page.locator('[data-action=export]').click();
  const exported = await download;
  await exported.saveAs(`${output}/backup.json`);
  const backup = JSON.parse(fs.readFileSync(`${output}/backup.json`,'utf8'));
  assert.equal(backup.kind,'faff-backup');
  await page.locator('#backup-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await expect(page.locator('[data-action=confirm-restore]')).toBeVisible();
  await page.locator('[data-action=confirm-restore]').click();
  await expect(page.locator('.result-page')).toBeVisible();
  assert.equal((await saved(page)).days['2026-09-22'].sessions.length,8);
  console.log('PASS calendar D, weekday distinction, streak, backup download and restore');
  await context.close();

  const parallel = await fresh();
  await choose(parallel.page,1,0);
  await parallel.page.locator('[data-action=commit]').click();
  await parallel.page.locator('[data-action=start]').click();
  const second = await parallel.context.newPage();
  second.on('pageerror', error => browserErrors.push(error.message));
  await second.clock.install({time:start});
  await second.goto(base);
  await expect(second.locator('[data-action=pause]')).toBeVisible();
  await Promise.all([parallel.page.clock.fastForward(30*60000),second.clock.fastForward(30*60000)]);
  await expect(parallel.page.locator('[data-grade=focus]')).toBeVisible();
  await expect(second.locator('[data-grade=focus]')).toBeVisible();
  await Promise.all([parallel.page,second].map(tab=>tab.evaluate(()=>document.querySelector('[data-grade=focus]')?.click())));
  await expect(parallel.page.locator('.result-page')).toBeVisible();
  await expect(second.locator('.result-page')).toBeVisible();
  assert.equal((await saved(second)).days['2026-09-22'].sessions.length,1);
  console.log('PASS concurrent windows count one session once');
  await parallel.context.close();

  const midnight = await fresh(390,844,new Date('2026-09-22T23:50:00Z'));
  await choose(midnight.page,1,0);
  await midnight.page.locator('[data-action=commit]').click();
  await midnight.page.locator('[data-action=start]').click();
  await expect(midnight.page.locator('[data-action=pause]')).toBeVisible();
  await midnight.page.clock.fastForward(30*60000);
  await expect(midnight.page.locator('[data-grade=focus]')).toBeVisible();
  await expect(midnight.page.locator('.previous-date')).toHaveText('22 sept');
  await midnight.page.reload();
  await expect(midnight.page.locator('[data-grade=focus]')).toBeVisible();
  await midnight.page.locator('[data-grade=focus]').click();
  await expect(midnight.page.locator('[data-action=commit]')).toBeVisible();
  const afterMidnight = await saved(midnight.page);
  assert.equal(afterMidnight.days['2026-09-22'].sessions.length,1);
  assert.equal(afterMidnight.days['2026-09-23'].sessions.length,0);
  assert.equal(afterMidnight.days['2026-09-23'].committedAt,null);
  await midnight.context.close();
  console.log('PASS midnight rollover and pending rating recovery');

  for(const [width,height] of [[320,568],[360,640],[412,915],[1024,768]]) {
    const small = await fresh(width,height);
    const overflow = await small.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    assert.equal(overflow,false,`horizontal overflow at ${width}`);
    await small.page.locator('[data-action=commit]').click();
    await expect(small.page.locator('[data-action=start]')).toBeInViewport();
    await capture(small.page,`timer-${width}`);
    await small.context.close();
  }
  assert.deepEqual(browserErrors,[]);
  console.log('PASS responsive layouts and no browser errors');
})().then(()=>browser.close()).catch(async error=>{console.error(error); if(browser) await browser.close(); process.exitCode=1;});
