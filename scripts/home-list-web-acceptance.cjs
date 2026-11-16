'use strict';
// Actual Vue and Express against a disposable database. External requests are blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'home-list-web-'));
const out = process.env.HOME_LIST_OUT || path.join(root, 'design/previews/home-list-redesign-20261116/web');
Object.assign(process.env, { NODE_ENV: 'test', PORT: '0', BASE_PATH: '/marathon', MARATHON_DB: path.join(temporary, 'app.sqlite'), MARATHON_MEDIA: path.join(temporary, 'media'), CONTENT_DATA_DIR: path.join(temporary, 'content') });
const exists = fs.existsSync;
fs.existsSync = file => path.resolve(String(file)) === path.join(root, '.env') ? false : exists(file);
let app;
try { ({ app } = require('../server/src/index')); } finally { fs.existsSync = exists; }
const db = require('../server/src/db').getDb();
const report = { checks: [], views: [], errors: [], passed: false };
let server, vite, browser;
const token = 'home-list-browser-synthetic';
async function check(name, run) { await run(); report.checks.push(name); process.stderr.write('PASS ' + name + '\n'); }
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString();
  const userId = Number(db.prepare('INSERT INTO users(nickname,token,created_at) VALUES(?,?,?)').run('合成跑者', token, stamp).lastInsertRowid);
  server = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); });
  const apiOrigin = 'http://127.0.0.1:' + server.address().port;
  async function read(suffix) {
    const response = await fetch(apiOrigin + '/marathon/api' + suffix, { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(response.status, 200, suffix); return response.json();
  }
  const { createServer } = await import(pathToFileURL(path.join(root, 'web/node_modules/vite/dist/node/index.js')).href);
  vite = await createServer({ root: path.join(root, 'web'), configFile: path.join(root, 'web/vite.config.js'), cacheDir: path.join(temporary, 'vite-cache'), server: { host: '127.0.0.1', port: 0, proxy: { '/marathon/api': apiOrigin } } });
  await vite.listen();
  const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || process.env.CHROME_BIN, ...(process.env.CHROME_PATH || process.env.CHROME_BIN ? {} : { channel: 'chrome' }), headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(token => { localStorage.setItem('marathon_token', token); localStorage.setItem('marathon_name', '合成跑者'); }, token);
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push(error.message));

  // All races and personal records below are disposable local fixtures.
  db.prepare('DELETE FROM races').run();
  const yr = new Date(Date.now() + 8*3600000).getUTCFullYear()+1;
  const future = new Date(Date.now()+10*86400000).toISOString();
  const insert = db.prepare('INSERT INTO races(id,name,city,province,distances,race_date,deadline,place,kinds,meet) VALUES(?,?,?,?,?,?,?,?,?,?)');
  const entries = [
    ['home-full', yr+'北京环城马拉松暨城市绿道长距离邀请赛（合成验收）','北京','北京','full',yr+'-03-21',future,'合成起点','road','offline'],
    ['home-half', yr+'上海滨江半程马拉松（合成验收）','上海','上海','half',yr+'-03-28',future,'合成起点','road','offline'],
    ['home-trail', yr+'杭州云上越野挑战赛（合成验收）','杭州','浙江','half',yr+'-04-14',future,'合成起点','trail','online'],
    ['home-wait', yr+'北京城郊马拉松（合成验收）','北京','北京','full',yr+'-04-18','2020-01-01','合成起点','road','offline'],
    ['home-unknown', yr+'成都公园半程马拉松（合成验收）','成都','四川','half',yr+'-05-09','','合成起点','road','offline'],
    ['home-past', (yr-2)+'杭州往届马拉松（合成验收）','杭州','浙江','full',(yr-2)+'-02-03','2020-01-01','合成起点','road','offline']
  ];
  entries.forEach(row=>insert.run(...row));
  for(const [id,status] of [['home-full','已报名'],['home-half','想跑'],['home-trail','确认参赛']]) db.prepare('INSERT INTO plans(user_id,race_id,status,updated_at) VALUES(?,?,?,?)').run(userId,id,status,stamp);
  db.prepare('INSERT INTO race_follows(user_id,race_id,created_at) VALUES(?,?,?)').run(userId,'home-half',stamp);
  const home = origin+'/marathon/';
  const listing = page.locator('.home-results');
  const raceRequests=[];
  page.on('request',request=>{const u=new URL(request.url()); if(u.pathname==='/marathon/api/races')raceRequests.push(Object.fromEntries(u.searchParams));});
  async function action(run, expected={}) {
    const response = page.waitForResponse(response=>new URL(response.url()).pathname==='/marathon/api/races' && response.request().method()==='GET');
    await run();
    const result=await response;assert.equal(result.status(),200);
    const data=await result.json();
    await page.waitForFunction(()=>!document.querySelector('.home-results .empty')?.textContent.includes('正在加载'));
    await page.waitForFunction(count=>document.querySelectorAll('.home-results .race-card-shell').length===count,data.races.length);
    const query=Object.fromEntries(new URL(result.url()).searchParams);
    for(const [key,value] of Object.entries(expected))assert.equal(query[key],value,key+' query');
    return {data,query};
  }
  async function more(){await listing.getByRole('button',{name:'更多筛选',exact:true}).click();await page.locator('.status-sheet').waitFor();}
  async function reset(){
    const button=listing.getByRole('button',{name:/^(清空筛选|清空|重置筛选|重置)$/});
    if(await button.count())return action(()=>button.first().click(),{status:'upcoming'});
    await page.goto(home,{waitUntil:'networkidle'});
  }
  async function shot(name,width){
    if(process.env.HOME_LIST_NO_SHOTS)return;
    const metrics=await page.evaluate(()=>{
      const area=document.querySelector('.home-results'), tinyText=[],smallControls=[];
      const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0'&&!e.closest('svg,.visually-hidden');};
      const walker=document.createTreeWalker(area,NodeFilter.SHOW_TEXT);
      for(let n;(n=walker.nextNode());){const e=n.parentElement;if(!n.textContent.trim()||!visible(e))continue;const range=document.createRange();range.selectNodeContents(n);if(![...range.getClientRects()].some(r=>r.width>1&&r.height>1))continue;const size=parseFloat(getComputedStyle(e).fontSize);if(size<11.9)tinyText.push({text:n.textContent.trim(),size});}
      for(const e of area.querySelectorAll('button,a[href]')){if(!visible(e)||e.closest('.pager'))continue;const r=e.getBoundingClientRect();if(r.width<43.5||r.height<43.5)smallControls.push({text:e.getAttribute('aria-label')||e.textContent.trim(),width:r.width,height:r.height});}
      for(const e of document.querySelectorAll('.drop button')){if(!visible(e))continue;const r=e.getBoundingClientRect();if(r.width<43.5||r.height<43.5)smallControls.push({text:e.getAttribute('aria-label')||e.textContent.trim(),width:r.width,height:r.height});}
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,tinyText,smallControls};
    });
    assert.ok(metrics.scrollWidth<=width,name+' overflow');assert.deepEqual(metrics.tinyText,[],name+' tiny text');assert.deepEqual(metrics.smallControls,[],name+' small targets');
    await listing.evaluate(el=>el.scrollIntoView({block:'start'}));
    const filename=name+'-'+width+'.png';await page.screenshot({path:path.join(out,filename),fullPage:true,timeout:30000});await listing.screenshot({path:path.join(out,name+'-section-'+width+'.png'),timeout:30000});
    if(await page.locator('.home-filter-sheet[open]').count())await page.locator('.home-filter-sheet').screenshot({path:path.join(out,name+'-dialog-'+width+'.png')});
    report.views.push({name,screenshot:filename,...metrics});
  }
  async function auditDialog(width) {
    const dialog=page.locator('.home-filter-sheet[open]');
    const metrics=await dialog.evaluate(element=>{
      const box=element.getBoundingClientRect(),css=getComputedStyle(element);
      return {width:box.width,left:box.left,right:box.right,bottom:box.bottom,viewport:innerWidth,height:innerHeight,paddingLeft:css.paddingLeft,topLeft:parseFloat(css.borderTopLeftRadius),topRight:parseFloat(css.borderTopRightRadius),bodyOverflow:document.body.style.overflow};
    });
    assert.ok(Math.abs(metrics.width-Math.min(430,width))<1,'Filter drawer width: '+JSON.stringify(metrics));
    assert.ok(Math.abs(metrics.bottom-metrics.height)<1,'Filter drawer must sit on viewport bottom: '+JSON.stringify(metrics));
    assert.ok(metrics.left>=-1&&metrics.right<=width+1,'Filter drawer must stay in the viewport');
    assert.equal(metrics.paddingLeft,'0px','Page-specific drawer layout must override generic dialog padding');
    assert.ok(Math.abs(metrics.topLeft-23)<1&&Math.abs(metrics.topRight-23)<1,'Drawer needs 23px top corners');
    assert.equal(metrics.bodyOverflow,'hidden','The background cannot scroll while a filter is open');
    for(const key of ['Tab','Tab','Shift+Tab']){
      await page.keyboard.press(key);
      const focus=await dialog.evaluate(element=>({contained:element.contains(document.activeElement),active:document.activeElement?.outerHTML.slice(0,240),modal:element.matches(':modal')}));
      assert.equal(focus.contained,true,'Tab focus stays inside the modal: '+JSON.stringify({key,...focus}));
    }
    await listing.getByRole('button',{name:'更多筛选',exact:true}).evaluate(element=>element.focus());
    assert.equal(await dialog.evaluate(element=>element.contains(document.activeElement)),true,'Inert background cannot receive focus while the modal is open');
    const filename='home-list-drawer-'+width+'.png';await dialog.screenshot({path:path.join(out,filename)});
    report.views.push({name:'home-list-drawer-geometry',screenshot:filename,...metrics});
  }
  await page.goto(home,{waitUntil:'networkidle'});
  await page.locator('.race-card-shell').first().waitFor();
  await check('Default upcoming list separates public event state and private plan state',async()=>{
    assert.equal(await listing.locator('.race-card-shell').count(),5);
    const row=listing.locator('.race-card-shell').filter({hasText:entries[0][1]});
    assert.ok((await row.innerText()).includes('已报名'));assert.ok((await row.innerText()).includes('报名中'));
    assert.equal((await read('/me')).plans.length,3);
  });
  await check('Track type and distance filters compose and can be cleared',async()=>{
    const nav=page.getByRole('navigation',{name:'赛事类型'});
    let r=await action(()=>nav.getByRole('button',{name:'越野赛',exact:true}).click(),{kind:'trail'});assert.deepEqual(r.data.races.map(r=>r.id),['home-trail']);
    await action(()=>nav.getByRole('button',{name:'路跑',exact:true}).click(),{kind:'road'});
    r=await action(()=>listing.getByRole('button',{name:'半程马拉松',exact:true}).click(),{kind:'road',distance:'half'});assert.deepEqual(r.data.races.map(r=>r.id),['home-half','home-unknown']);
    await reset();
  });
  await check('City and month filters compose and current filter reset clears them',async()=>{
    await listing.getByRole('button',{name:/比赛地点/,exact:false}).click();
    await page.locator('.prov').getByRole('button',{name:'北京',exact:true}).click();
    let r=await action(()=>page.locator('.cities').getByRole('button',{name:'北京',exact:true}).click(),{city:'北京'});assert.equal(r.data.races.length,2);
    await listing.getByRole('button',{name:/比赛时间/,exact:false}).click();
    const year=page.locator('.time section').filter({hasText:yr+'年'});
    r=await action(()=>year.getByRole('button',{name:'3月',exact:true}).click(),{city:'北京',month:yr+'-03'});assert.deepEqual(r.data.races.map(r=>r.id),['home-full']);
    await reset();
    assert.ok(!raceRequests.at(-1).city&&!raceRequests.at(-1).month&&!raceRequests.at(-1).distance&&!raceRequests.at(-1).kind);
  });
  await check('Participation format and status commit together; closing the sheet discards draft changes',async()=>{
    await more();
    await page.getByRole('navigation',{name:'赛事形式'}).getByRole('button',{name:'线上赛',exact:true}).click();
    await page.locator('.status-sheet').getByRole('button',{name:'报名中',exact:true}).click();
    const requests=raceRequests.length;
    await page.getByRole('button',{name:/关闭筛选|关闭/}).click();assert.equal(raceRequests.length,requests);
    await more();
    assert.equal(await page.getByRole('navigation',{name:'赛事形式'}).getByRole('button',{name:'全部形式',exact:true}).getAttribute('aria-pressed'),'true');
    await page.getByRole('navigation',{name:'赛事形式'}).getByRole('button',{name:'线上赛',exact:true}).click();
    await page.locator('.status-sheet').getByRole('button',{name:'报名中',exact:true}).click();
    const r=await action(()=>page.locator('.status-sheet').getByRole('button',{name:/确认|查看赛事/}).click(),{meet:'online',status:'open'});assert.deepEqual(r.data.races.map(r=>r.id),['home-trail']);
    await more();await page.locator('.status-sheet').getByRole('button',{name:'重置',exact:true}).click();
    await action(()=>page.locator('.status-sheet').getByRole('button',{name:/确认|查看赛事/}).click(),{status:'upcoming'});
    assert.ok(!raceRequests.at(-1).meet);
  });
  await check('Search ignores active filters without losing them after clearing the query',async()=>{
    await listing.getByRole('button',{name:/比赛地点/,exact:false}).click();await page.locator('.prov').getByRole('button',{name:'北京',exact:true}).click();
    await action(()=>page.locator('.cities').getByRole('button',{name:'北京',exact:true}).click(),{city:'北京'});
    const search=page.getByRole('textbox',{name:'搜索赛事名称或城市',exact:true});
    const r=await action(()=>search.fill('云上越野'),{q:'云上越野',status:'all'});assert.deepEqual(r.data.races.map(r=>r.id),['home-trail']);assert.ok(!r.query.city&&!r.query.kind&&!r.query.month&&!r.query.meet&&!r.query.distance);
    await action(()=>search.fill(''),{city:'北京'});await reset();
  });
  await check('Following remains independent from the card navigation and personal plan',async()=>{
    const row=listing.locator('.race-card-shell').filter({hasText:entries[3][1]});
    await row.getByRole('button',{name:'关注'+entries[3][1],exact:true}).click();
    await row.getByRole('button',{name:'取消关注'+entries[3][1],exact:true}).waitFor();
    assert.equal(new URL(page.url()).pathname,'/marathon/');assert.equal((await read('/me')).plans.length,3);
    assert.ok((await read('/me')).followedRaces.some(r=>r.id==='home-wait'));
    await page.reload({waitUntil:'networkidle'});await row.getByRole('button',{name:'取消关注'+entries[3][1],exact:true}).waitFor();
    await row.getByRole('button',{name:'取消关注'+entries[3][1],exact:true}).click();await row.getByRole('button',{name:'关注'+entries[3][1],exact:true}).waitFor();
  });
  await check('Personal-plan action opens the selected race editor without changing state',async()=>{
    const row=listing.locator('.race-card-shell').filter({hasText:entries[0][1]});
    const link=row.locator('a[href*="plan=1"]');assert.equal(await link.count(),1);await link.click();
    await page.locator('.race-plan .plan-editor').waitFor();assert.equal(new URL(page.url()).searchParams.get('plan'),'1');assert.equal((await read('/me')).plans.length,3);
    await page.goto(home,{waitUntil:'networkidle'});
  });
  await check('Small screens and desktop retain readable labels and accessible actions',async()=>{
    for(const width of [320,390,1440]){
      await page.setViewportSize({width,height:1000});await page.goto(home,{waitUntil:'networkidle'});await page.locator('.race-card-shell').first().waitFor();
      await shot('home-list-default',width);
      const originalOverflow=await page.evaluate(()=>document.body.style.overflow);
      await more();await auditDialog(width);await shot('home-list-filters',width);
      await page.getByRole('button',{name:/关闭筛选|关闭/}).click();
      await page.waitForFunction(value=>!document.querySelector('.home-filter-sheet')&&document.body.style.overflow===value,originalOverflow);
      assert.equal(await listing.getByRole('button',{name:'更多筛选',exact:true}).evaluate(element=>document.activeElement===element),true,'Closing restores focus to the filter trigger');
      await more();await page.keyboard.press('Escape');
      await page.waitForFunction(value=>!document.querySelector('.home-filter-sheet')&&document.body.style.overflow===value,originalOverflow);
      assert.equal(await listing.getByRole('button',{name:'更多筛选',exact:true}).evaluate(element=>document.activeElement===element),true,'Escape restores focus to the filter trigger');
      await action(()=>page.getByRole('textbox',{name:'搜索赛事名称或城市',exact:true}).fill('云上越野'),{q:'云上越野'});await shot('home-list-search',width);
    }
  });
  const guest=await browser.newContext({viewport:{width:390,height:1000}});await guest.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await check('Guest following returns through login without creating personal data',async()=>{
    const p=await guest.newPage();await p.goto(home,{waitUntil:'networkidle'});const row=p.locator('.race-card-shell').filter({hasText:entries[3][1]});await row.getByRole('button',{name:'关注'+entries[3][1],exact:true}).click();await p.waitForURL('**/marathon/mine');
    assert.equal(await p.evaluate(()=>localStorage.getItem('marathon_return_after_login')),'/races/home-wait?follow=1');assert.equal((await read('/me')).plans.length,3);
  });
  await guest.close();assert.deepEqual(report.errors,[]);report.passed=true;await context.close();
}
main().catch(error => { report.error = error.stack; process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (vite) await vite.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(temporary, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
