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
  await page.clock.install();
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
    ['home-past', (yr-4)+'杭州往届马拉松（合成验收）','杭州','浙江','full',(yr-4)+'-02-03','2020-01-01','合成起点','road','offline']
  ];
  entries.forEach(row=>insert.run(...row));
  for(const [id,status] of [['home-full','已报名'],['home-half','想跑'],['home-trail','确认参赛']]) db.prepare('INSERT INTO plans(user_id,race_id,status,updated_at) VALUES(?,?,?,?)').run(userId,id,status,stamp);
  db.prepare('INSERT INTO race_follows(user_id,race_id,created_at) VALUES(?,?,?)').run(userId,'home-half',stamp);
  const home = origin+'/marathon/';
  const listing = page.locator('.home-results');
  const finder = page.locator('.race-finder');
  const submitFilters = () => finder.getByRole('button', {name:'查找比赛', exact:true}).click();
  async function editFilters(run, expected={}) {
    const before = raceRequests.length;
    await run();
    assert.equal(raceRequests.length,before,'editing conditions does not query');
    return action(submitFilters,expected);
  }
  const raceRequests=[];
  page.on('request',request=>{const u=new URL(request.url()); if(u.pathname==='/marathon/api/races')raceRequests.push(Object.fromEntries(u.searchParams));});
  async function action(run, expected={}) {
    const response = page.waitForResponse(response=>new URL(response.url()).pathname==='/marathon/api/races' && response.request().method()==='GET');
    await run();
    const result=await response;assert.equal(result.status(),200);
    const data=await result.json();
    await page.waitForFunction(()=>!document.querySelector('.home-results .results-loading'));
    await page.waitForFunction(count=>document.querySelectorAll('.home-results .race-card-shell').length===count,data.races.length);
    const query=Object.fromEntries(new URL(result.url()).searchParams);
    for(const [key,value] of Object.entries(expected))assert.equal(query[key],value,key+' query');
    return {data,query};
  }
  const drawer=page.locator('.home-filter-sheet[open]');
  async function openFilter(name){await finder.getByRole('button',{name,exact:true}).click();await drawer.waitFor();}
  async function more(){await openFilter('更多筛选');await page.locator('.status-sheet').waitFor();}
  async function picked(run,expected={}){return editFilters(async()=>{await run();await drawer.waitFor({state:'hidden'});},expected);}
  async function distance(value,expected={}){await more();return picked(()=>page.getByRole('navigation',{name:'比赛距离',exact:true}).getByRole('button',{name:value,exact:true}).click(),expected);}
  async function format(value,expected={}){await more();return picked(()=>page.getByRole('navigation',{name:'赛事形式',exact:true}).getByRole('button',{name:value,exact:true}).click(),expected);}
  async function publicStatus(value,expected={}){await more();return picked(()=>page.locator('.status-sheet').getByRole('button',{name:value,exact:true}).click(),expected);}
  async function chooseCity(province,city,expected={}){await openFilter('比赛地点');await page.getByRole('navigation',{name:'省份导航'}).getByRole('button',{name:province,exact:true}).click();return picked(()=>page.locator('.cities').getByRole('button',{name:city,exact:true}).click(),expected);}
  async function chooseMonth(year,month,expected={}){await openFilter('比赛时间');await page.getByRole('navigation',{name:'年份导航'}).getByRole('button',{name:year+'年',exact:true}).click();return picked(()=>page.locator('.months').getByRole('button',{name:month+'月',exact:true}).click(),expected);}
  async function reset(){
    const button=finder.getByRole('button',{name:/^(清空筛选|清空|重置筛选|重置)$/});
    if(await button.count())return editFilters(()=>button.first().click(),{status:'upcoming'});
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
    const filename=name+'-'+width+'.png';
    if(await drawer.count()){
      // Capturing the background locator while a modal is open can scroll its
      // nested panes in Chromium. Capture the live dialog before any full-page sizing.
      await drawer.screenshot({path:path.join(out,name+'-dialog-'+width+'.png')});
      await page.screenshot({path:path.join(out,filename),timeout:30000});
    }else{
      await listing.evaluate(el=>el.scrollIntoView({block:'start'}));
      await page.screenshot({path:path.join(out,filename),fullPage:true,timeout:30000});await listing.screenshot({path:path.join(out,name+'-section-'+width+'.png'),timeout:30000});
    }
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
    await finder.getByRole('button',{name:'更多筛选',exact:true}).evaluate(element=>element.focus());
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
  const reminders = entries.slice(0, 2).map(([id, name], index) => ({ race: { id, name }, hit: { key: 'deadline', reason: index ? '明天截止' : '今日截止' } }));
  const reminderBanner = page.locator('.deadline-banner');
  const reminderLink = reminderBanner.locator('.deadline-copy');
  const reminderNext = reminderBanner.getByRole('button', { name: '查看下一条提醒' });
  const summary = listing.locator('.results-summary');
  const errors = [];
  async function checkHome(name, run) {
    try { await check(name, run); }
    catch (error) { errors.push(name + ': ' + error.message); }
  }
  async function reminderFixture(rows) {
    await page.unroute('**/api/reminders');
    await page.route('**/api/reminders', route => route.fulfill({ json: { mine: [], reminders: rows } }));
    const response = page.waitForResponse('**/api/reminders');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await (await response).json()).reminders.length, rows.length, 'reminder fixture response reached the app');
    if (rows.length) await reminderLink.waitFor();
    await listing.locator('.race-card-shell').first().waitFor();
  }
  await reminderFixture(reminders);
  await checkHome('Home places race services and results before supplementary content', async () => {
    const sections = await page.locator('.home-shortcuts,.deadline-banner,.home-results,.home-discover,.home-catalog').evaluateAll(nodes => nodes.map(node => node.className));
    assert.deepEqual(sections, ['home-shortcuts', 'deadline-banner', 'home-results', 'home-discover', 'home-catalog']);
    assert.deepEqual(await page.locator('.home-shortcuts a').evaluateAll(links => links.map(link => new URL(link.href).pathname)), ['/marathon/calendar','/marathon/radar','/marathon/clubs','/marathon/news']);
    const calendar = page.locator('.discover-calendar');
    assert.equal(await calendar.getAttribute('href'), '/marathon/calendar');
    assert.ok(!(await calendar.textContent()).includes(entries[0][1]), 'calendar teaser must not mirror the first filtered result');
  });
  await checkHome('Multiple reminders change by choice and retain the selected event link without refetching', async () => {
    assert.equal(await reminderLink.getAttribute('href'), '/marathon/races/home-full');
    assert.match(await reminderLink.innerText(), /今日截止/);
    await page.clock.fastForward(5500);
    assert.equal(await reminderLink.getAttribute('href'), '/marathon/races/home-full', 'idle time does not advance the reminder');
    const before = raceRequests.length;
    await reminderNext.click();
    assert.equal(await reminderLink.getAttribute('href'), '/marathon/races/home-half');
    assert.match(await reminderLink.innerText(), /明天截止/);
    await reminderNext.click();
    assert.equal(await reminderLink.getAttribute('href'), '/marathon/races/home-full');
    assert.equal(raceRequests.length, before);
  });
  await checkHome('A lone reminder has only a real detail link and no placeholder switch', async () => {
    await reminderFixture(reminders.slice(0, 1));
    assert.equal(await reminderBanner.getByRole('button').count(), 0);
    assert.equal(await reminderLink.getAttribute('href'), '/marathon/races/home-full');
    await reminderLink.click();
    await page.waitForURL('**/races/home-full');
  });
  await checkHome('The result summary updates on submit only and keyword results hide supplemental panels', async () => {
    await page.goto(home, { waitUntil: 'networkidle' });
    await chooseCity('北京','北京全市',{city:'北京'});
    assert.equal(await summary.count(), 1, 'submitted filters have a result summary');
    assert.match(await summary.innerText(), /北京/);
    await openFilter('比赛地点');
    await page.getByRole('navigation',{name:'省份导航'}).getByRole('button',{name:'浙江',exact:true}).click();
    await page.locator('.cities').getByRole('button',{name:'杭州',exact:true}).click();
    assert.match(await summary.innerText(), /北京/);
    await action(submitFilters,{city:'杭州'});
    assert.match(await summary.innerText(), /杭州/);
    await finder.getByRole('button',{name:'搜赛事',exact:true}).click();
    const search = finder.getByRole('textbox');
    await search.fill('往届马拉松');
    await action(() => search.press('Enter'),{q:'往届马拉松',status:'all'});
    await search.fill('下一次输入');
    assert.match(await summary.innerText(), /往届马拉松/);
    assert.equal(await page.locator('.home-shortcuts,.deadline-banner,.home-discover,.home-catalog').count(), 0);
    assert.equal(await listing.locator('.race-card-shell').count(), 1);
  });
  await checkHome('Pagination preserves the submitted filters and keeps results in view on a narrow screen', async () => {
    const fixtureIds = Array.from({ length: 41 }, (_, index) => 'home-paged-' + index);
    db.transaction(() => {
      for (const id of fixtureIds) insert.run(id, '分页赛事实例 ' + id, '北京', '北京', 'full', yr + '-05-10', future, '合成起点', 'road', 'offline');
    })();
    try {
      await page.setViewportSize({ width: 320, height: 780 });
      await page.goto(home, { waitUntil: 'networkidle' });
      const first = await chooseCity('北京','北京全市',{city:'北京'});
      assert.ok(first.data.pages > 1, 'pagination fixture must include a second page');
      const pager = listing.getByRole('navigation', { name: '翻页' });
      const targets = await pager.getByRole('button').evaluateAll(buttons => buttons.map(button => ({ width: button.offsetWidth, height: button.offsetHeight })));
      assert.ok(targets.every(({ width, height }) => width >= 44 && height >= 44), 'every paging control has a 44px touch target');
      const next = await action(() => pager.getByRole('button', { name: '下一页', exact: true }).click(), { city: '北京', status: 'upcoming', page: '2' });
      assert.equal(next.data.page, 2);
      assert.equal(await pager.locator('[aria-current="page"]').innerText(), '2');
      assert.match(await summary.innerText(), /北京/);
      assert.equal(await page.locator('#race-results-title').evaluate(title => document.activeElement === title), true);
    } finally {
      db.prepare("DELETE FROM races WHERE id LIKE 'home-paged-%'").run();
      await page.setViewportSize({ width: 390, height: 1000 });
    }
  });
  assert.deepEqual(errors, [], 'new home services and results behavior');
  await page.unroute('**/api/reminders');
  await page.goto(home, { waitUntil: 'networkidle' });
  await check('Track type and independent distance options are submitted together and remain selected',async()=>{
    const nav=page.getByRole('navigation',{name:'赛事类型'});
    let r=await editFilters(()=>nav.getByRole('button',{name:'越野赛',exact:true}).click(),{kind:'trail'});assert.deepEqual(r.data.races.map(r=>r.id),['home-trail']);
    r=await distance('马拉松',{kind:'trail',distance:'full'});assert.deepEqual(r.data.races,[],'distance must not silently replace the track type');
    await more();assert.equal(await page.getByRole('navigation',{name:'比赛距离'}).getByRole('button',{name:'马拉松',exact:true}).getAttribute('aria-pressed'),'true');
    r=await picked(()=>page.getByRole('navigation',{name:'比赛距离'}).getByRole('button',{name:'半程马拉松',exact:true}).click(),{kind:'trail',distance:'half'});assert.deepEqual(r.data.races.map(r=>r.id),['home-trail']);
    await distance('10公里',{kind:'trail',distance:'10k'});
    r=await distance('不限距离',{kind:'trail'});assert.ok(!r.query.distance);assert.deepEqual(r.data.races.map(r=>r.id),['home-trail']);
    await reset();
  });
  await check('Province and year only browse; city and month are saved to the card and submitted',async()=>{
    await openFilter('比赛地点');const before=raceRequests.length;
    assert.equal(await page.getByRole('navigation',{name:'省份导航'}).getByRole('button',{name:'全国',exact:true}).getAttribute('aria-pressed'),'true','no city starts with nationwide navigation');
    for(const city of ['北京','上海','杭州','成都'])assert.equal(await page.locator('.cities').getByRole('button',{name:city,exact:true}).count(),1,'nationwide grid includes API city '+city);
    await page.getByRole('navigation',{name:'省份导航'}).getByRole('button',{name:'浙江',exact:true}).click();
    assert.equal(raceRequests.length,before,'province navigation must not query');assert.equal(await drawer.count(),1);
    const provinceLayout=await page.locator('.loc').evaluate(panel=>{
      const nav=panel.querySelector('.prov'),content=panel.querySelector('.city-content'),first=panel.querySelector('.cities button');
      const box=e=>{const r=e.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height};};
      return {scrollTop:panel.scrollTop,panel:box(panel),nav:box(nav),content:box(content),first:box(first)};
    });
    assert.ok(Math.abs(provinceLayout.scrollTop)<1,'province navigation must not pan the entire two-column grid: '+JSON.stringify(provinceLayout));
    assert.ok(provinceLayout.nav.height<=provinceLayout.panel.height+1,'the province list must scroll within its own column: '+JSON.stringify(provinceLayout));
    assert.ok(provinceLayout.first.top>=provinceLayout.content.top-1&&provinceLayout.first.bottom<=provinceLayout.content.bottom+1,'the initial city options must remain visible after province navigation: '+JSON.stringify(provinceLayout));
    await shot('home-list-location',390);
    let r=await picked(()=>page.locator('.cities').getByRole('button',{name:'杭州',exact:true}).click(),{city:'杭州'});assert.deepEqual(r.data.races.map(r=>r.id),['home-trail']);
    await openFilter('比赛地点');assert.equal(await page.getByRole('navigation',{name:'省份导航'}).getByRole('button',{name:'浙江',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.cities').getByRole('button',{name:'杭州',exact:true}).getAttribute('aria-pressed'),'true');
    r=await picked(()=>page.locator('.cities').getByRole('button',{name:'全国不限',exact:true}).click(),{status:'upcoming'});assert.ok(!r.query.city);
    await chooseCity('北京','北京全市',{city:'北京'});
    await openFilter('比赛时间');const beforeYear=raceRequests.length;
    const historyYear=page.getByRole('navigation',{name:'年份导航'}).getByRole('button',{name:(yr-4)+'年',exact:true});
    assert.equal(await historyYear.count(),1,'API historical months extend the default year range');await historyYear.click();
    assert.equal(await historyYear.getAttribute('aria-pressed'),'true','an API historical year can be browsed');
    assert.equal(raceRequests.length,beforeYear,'historical year navigation also avoids a race query');
    await page.getByRole('navigation',{name:'年份导航'}).getByRole('button',{name:yr+'年',exact:true}).click();
    assert.equal(raceRequests.length,beforeYear,'year navigation must not query');assert.equal(await drawer.count(),1);assert.equal(await page.locator('.months button').count(),13,'one unrestricted option and twelve months');
    r=await picked(()=>page.locator('.months').getByRole('button',{name:'3月',exact:true}).click(),{city:'北京',month:yr+'-03'});assert.deepEqual(r.data.races.map(r=>r.id),['home-full']);
    await openFilter('比赛时间');assert.equal(await page.getByRole('navigation',{name:'年份导航'}).getByRole('button',{name:yr+'年',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.months').getByRole('button',{name:'3月',exact:true}).getAttribute('aria-pressed'),'true');
    await shot('home-list-time',390);
    r=await picked(()=>page.locator('.months').getByRole('button',{name:'不限时间',exact:true}).click(),{city:'北京'});assert.ok(!r.query.month);await reset();
  });
  await check('Format and public state use the card submit; all states includes past races',async()=>{
    let r=await format('线上赛',{meet:'online'});assert.deepEqual(r.data.races.map(r=>r.id),['home-trail']);
    await more();assert.equal(await page.getByRole('navigation',{name:'赛事形式'}).getByRole('button',{name:'线上赛',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await drawer.getByRole('button',{name:/^(确认|查看赛事)$/}).count(),0);
    const count=raceRequests.length;await page.getByRole('button',{name:'关闭筛选',exact:true}).click();assert.equal(raceRequests.length,count,'closing is not an extra apply action');
    r=await publicStatus('报名中',{meet:'online',status:'open'});assert.deepEqual(r.data.races.map(r=>r.id),['home-trail']);
    r=await format('全部形式',{status:'open'});assert.ok(!r.query.meet);
    r=await publicStatus('全部状态',{status:'all'});assert.equal(r.data.races.length,6);assert.ok(r.data.races.some(row=>row.id==='home-past'));
    await more();assert.equal(await drawer.getByRole('button',{name:'全部状态',exact:true}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'关闭筛选',exact:true}).click();await reset();
  });
  await check('Every selected condition has its own clear action and updates only on submit',async()=>{
    const nav=page.getByRole('navigation',{name:'赛事类型'});
    await listing.evaluate(el=>el.scrollIntoView({block:'start'}));
    await editFilters(()=>nav.getByRole('button',{name:'路跑',exact:true}).click(),{kind:'road'});
    await chooseCity('北京','北京全市',{kind:'road',city:'北京'});
    await chooseMonth(yr,3,{kind:'road',city:'北京',month:yr+'-03'});
    await distance('马拉松',{kind:'road',city:'北京',month:yr+'-03',distance:'full'});
    await format('线下赛',{kind:'road',city:'北京',month:yr+'-03',distance:'full',meet:'offline'});
    await publicStatus('报名中',{kind:'road',city:'北京',month:yr+'-03',distance:'full',meet:'offline',status:'open'});
    assert.equal(await finder.locator('.filter-tag').count(),6);
    await shot('home-list-selected',390);
    await more();await picked(()=>page.getByRole('navigation',{name:'赛事形式'}).getByRole('button',{name:'线上赛',exact:true}).click(),{kind:'road',city:'北京',month:yr+'-03',distance:'full',meet:'online',status:'open'});
    const expected={kind:'road',city:'北京',month:yr+'-03',distance:'full',meet:'online',status:'open'};
    for(const [category,label,key] of [['距离','马拉松','distance'],['时间',yr+'年3月','month'],['地点','北京','city'],['类型','路跑','kind'],['形式','线上赛','meet'],['状态','报名中','status']]){
      delete expected[key];if(key==='status')expected.status='upcoming';
      const result=await editFilters(()=>finder.getByRole('button',{name:'取消'+category+'：'+label,exact:true}).click(),expected);
      if(key!=='status')assert.ok(!result.query[key],key+' alone is removed');
    }
    assert.equal(await finder.locator('.filter-tag').count(),0);assert.equal(await finder.getByRole('button',{name:'清空筛选',exact:true}).count(),0);
  });
  await check('Search ignores active filters; switching back preserves and distinguishes both drafts',async()=>{
    await chooseCity('北京','北京全市',{city:'北京'});
    await finder.getByRole('button',{name:'搜赛事',exact:true}).click();
    const search=page.getByRole('textbox',{name:'搜索赛事名称或城市',exact:true});
    await search.fill('云上越野');
    const r=await action(()=>search.press('Enter'),{q:'云上越野',status:'all'});assert.deepEqual(r.data.races.map(r=>r.id),['home-trail']);assert.ok(!r.query.city&&!r.query.kind&&!r.query.month&&!r.query.meet&&!r.query.distance);
    await finder.getByRole('button',{name:'按条件找赛',exact:true}).click();
    assert.match(await finder.getByRole('button',{name:'比赛地点',exact:true}).innerText(),/北京/);
    await finder.getByRole('button',{name:'搜赛事',exact:true}).click();
    assert.equal(await search.inputValue(),'云上越野');
    await finder.getByRole('button',{name:'按条件找赛',exact:true}).click();
    await reset();
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
      assert.equal(await finder.getByRole('button',{name:'更多筛选',exact:true}).evaluate(element=>document.activeElement===element),true,'Closing restores focus to the filter trigger');
      for(const name of ['比赛地点','比赛时间']){
        await openFilter(name);await auditDialog(width);
        for(const option of await drawer.locator('button').all()){
          await option.scrollIntoViewIfNeeded();const box=await option.boundingBox();assert.ok(box&&box.x>=-1&&box.x+box.width<=width+1&&box.height>=43.5,name+' controls remain reachable');
        }
        await page.getByRole('button',{name:'关闭筛选',exact:true}).click();
      }
      await more();await page.keyboard.press('Escape');
      await page.waitForFunction(value=>!document.querySelector('.home-filter-sheet')&&document.body.style.overflow===value,originalOverflow);
      assert.equal(await finder.getByRole('button',{name:'更多筛选',exact:true}).evaluate(element=>document.activeElement===element),true,'Escape restores focus to the filter trigger');
      await finder.getByRole('button',{name:'搜赛事',exact:true}).click();
      const search=page.getByRole('textbox',{name:'搜索赛事名称或城市',exact:true});
      await search.fill('云上越野');
      await action(()=>search.press('Enter'),{q:'云上越野'});await shot('home-list-search',width);
    }
    for(const [width,height] of [[320,780],[390,844]]){
      await page.setViewportSize({width,height});await page.goto(home,{waitUntil:'networkidle'});await more();
      for(const option of await drawer.locator('button').all()){
        await option.scrollIntoViewIfNeeded();const metrics=await option.evaluate(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height,hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
        assert.ok(metrics.left>=-1&&metrics.right<=width+1&&metrics.top>=0&&metrics.bottom<=height+1&&metrics.height>=43.5&&metrics.hit,'short-screen options must be reachable: '+JSON.stringify(metrics));
      }
      await page.getByRole('button',{name:'关闭筛选',exact:true}).click();
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
