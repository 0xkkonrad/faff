const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium, webkit, expect } = require('@playwright/test');
const root = path.resolve(__dirname,'..');
const priorCommit = '97955ca';
const prior = new Map(execFileSync('git',['ls-tree','-r','--name-only',priorCommit,'web'],{cwd:root,encoding:'utf8'}).trim().split('\n').map(file=>[file.slice(4),execFileSync('git',['show',`${priorCommit}:${file}`],{cwd:root})]));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json','.png':'image/png','.woff2':'font/woff2'};
const isWebKit = process.env.FAFF_BROWSER === 'webkit';
let deployed=false,disconnected=false,browser;
const server=http.createServer((request,response)=>{
  if (disconnected) { request.socket.destroy(); return; }
  const url=new URL(request.url,'http://localhost');
  const legacy=url.pathname.startsWith('/waffle/');
  const name=url.pathname.replace(/^\/(waffle|faff)\//,'')||'index.html';
  try {
    const body=legacy&&!deployed?prior.get(name):fs.readFileSync(path.join(root,legacy?'legacy':'web',name));
    if(!body)throw new Error('missing');
    response.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store'});response.end(body);
  } catch {response.writeHead(404);response.end('Not found');}
});
async function saved(page){return page.evaluate(async()=>(await(await import('./storage.js')).change()).state);}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  browser=await (isWebKit?webkit:chromium).launch();
  for(const phase of ['running','paused','review']) {
    deployed=false;
    const context=await browser.newContext();
    const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${base}/waffle/?source=installed#calendar`);
    await page.locator('[data-action=options]').waitFor();
    await page.evaluate(async phase=>{
      const model=await import('./model.js'),storage=await import('./storage.js');
      const now=Date.now(),start=now-model.SESSION_MS-60000;
      let state=model.createState(start);
      for(const [action,time] of [
        [{type:'COMMIT',focus:2,waffle:2},start],
        [{type:'START',id:'previous'},start],
        [{type:'RATE',id:'previous',grade:'waffle'},start+model.SESSION_MS],
        [{type:'START',id:'current'},now-30000],
      ])state=model.updateState(state,action,time).state;
      if(phase==='paused')state=model.updateState(state,{type:'PAUSE',id:'current'},now).state;
      if(phase==='review'){state.active.deadline=now-1000;state=model.updateState(state,{type:'SYNC'},now).state;}
      await storage.restoreBackup(state);
    },phase);
    await page.reload();
    const before=await saved(page);
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
    deployed=true;
    await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});
    await expect.poll(() => page.url()).toBe(`${base}/faff/?source=installed#calendar`);
    await expect(page.locator('.wordmark')).toHaveText('faff');
    const after=await saved(page);
    assert.equal(after.schemaVersion,2);assert.deepEqual(after.active,before.active);
    const expected=JSON.parse(JSON.stringify(before.days).replaceAll('"waffle"','"faff"'));
    assert.deepEqual(after.days,expected);
    assert(!JSON.stringify(after).includes('waffle'));
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
    await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/faff/sw.js'));
    await page.waitForLoadState('networkidle');
    // WebKit's offline emulation fails even for a minimal service worker; disconnect the server instead.
    if (isWebKit) disconnected=true; else await context.setOffline(true);
    await page.reload();await page.locator('[data-action=options]').waitFor();
    assert.deepEqual((await saved(page)).active,before.active);
    disconnected=false;
    await context.setOffline(false);
    await page.locator('[data-action=options]').click();await page.locator('[data-action=settings]').click();
    await page.locator('#backup-file').setInputFiles({name:'legacy-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({kind:'waffle-backup',data:before}))});
    await page.locator('[data-action=confirm-restore]').click();
    await expect(page.locator('[role=dialog]')).toHaveCount(0);
    assert.deepEqual((await saved(page)).days,expected);
    await page.evaluate(async()=>{const storage=await import('./storage.js');await storage.change({type:'SETTING',key:'sound',value:false});});
    await page.reload();assert.equal((await saved(page)).settings.sound,false,'reload must not reimport stale legacy state');
    const oldState=await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('waffle');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const saved=db.transaction('state').objectStore('state').get('app');saved.onsuccess=()=>{resolve(saved.result);db.close();};};}));
    assert.deepEqual(oldState,before,'migration leaves the original database intact');
    const alias=await context.newPage();await alias.goto(`${base}/waffle/`);await alias.waitForURL(`${base}/faff/`);await alias.locator('[data-action=options]').waitFor();
    assert.equal((await saved(alias)).settings.sound,false);
    assert.deepEqual(errors,[]);await context.close();
    console.log(`PASS real legacy worker redirects and migrates ${phase} timer; offline reload, backup import and stale-data protection`);
  }
  const context=await browser.newContext();const page=await context.newPage();
  await page.goto(`${base}/faff/brand/index.html`);
  await expect(page.locator('[data-choice]')).toHaveCount(50);
  await expect(page.locator('.direction')).toHaveCount(10);
  for(const section of await page.locator('.direction').all())assert.equal(await section.locator('[data-choice]').count(),5);
  await page.locator('[data-choice="03B"]').click();await expect(page.locator('#selected-id')).toHaveText('SELECTED / 03B');
  await page.locator('[data-save="03B"]').click();await page.locator('[data-filter="saved"]').click();await expect(page.locator('[data-choice]')).toHaveCount(1);
  await page.reload();await expect(page.locator('#selected-id')).toHaveText('SELECTED / 03B');await expect(page.locator('#saved-count')).toHaveText('1');
  await page.locator('#preview').click();await expect(page.locator('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('dialog')).not.toBeVisible();
  for(const width of [390,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'picker has no horizontal overflow');}
  const download=page.waitForEvent('download');await page.locator('#download').click();assert.equal((await download).suggestedFilename(),'faff-03B.svg');
  for(const concept of JSON.parse(fs.readFileSync(path.join(root,'web/brand/catalog.json'),'utf8')))for(const variant of concept.variants)assert.equal((await page.request.get(`${base}/faff/brand/${variant.file}`)).status(),200);
  await context.close();console.log('PASS 50 SVGs, 10 × 5 layout, choice persistence, favourites, preview, mobile and download');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(resolve=>server.close(resolve));});
