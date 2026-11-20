'use strict';
/* Real local Express + Vue acceptance. Public archive JSON is read unchanged;
 * all registration rows, SQLite, media and output are disposable test data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-archives-runtime-'));
const OUT = process.env.RACE_ARCHIVE_OUT ? path.resolve(process.env.RACE_ARCHIVE_OUT) : path.join(ROOT, 'design/previews/race-archive-expansion-20261118');
const screenshots = process.env.RACE_ARCHIVE_SCREENSHOTS === '1';
const widths = process.argv.length > 2 ? process.argv.slice(2).map(Number) : [320, 390, 1440];
assert.ok(widths.every(width => Number.isInteger(width) && width > 0), 'Expected browser viewport widths');
Object.assign(process.env, { NODE_ENV: 'test', BASE_PATH: '/marathon', PORT: '0', MARATHON_DB: path.join(temporary, 'app.sqlite'), MARATHON_MEDIA: path.join(temporary, 'media'), CONTENT_DATA_DIR: path.join(temporary, 'content'), ADMIN_TOKEN: 'disposable-race-archive-client' });
const exists = fs.existsSync;
fs.existsSync = file => path.resolve(String(file)) === path.join(ROOT, '.env') ? false : exists(file);
let app;
try { ({ app } = require('../server/src/index')); } finally { fs.existsSync = exists; }
const db = require('../server/src/db').getDb();
const report = { startedAt: new Date().toISOString(), isolation: 'Actual local Express API and Vue with versioned event archives; temporary registration rows/SQLite/media; .env hidden; external browser traffic blocked.', checks: [], views: [], errors: [], passed: false, limitations: ['Chromium viewports are not a WeChat or mobile device test.', '503 responses are injected only for the explicit failure/retry check.', 'Remote images are blocked to verify readable fallback; local archive assets are served by Vite.'] };
let server, vite, browser;
async function check(name, run) { await run(); report.checks.push(name); }
async function snapshot(page, name, width) {
  const metrics = await page.evaluate(() => {
    const area = document.querySelector('.event-shell,.home-catalog,.archive-directory');
    const visible = element => { const box = element.getBoundingClientRect(), css = getComputedStyle(element); return box.width > 0 && box.height > 0 && css.display !== 'none' && css.visibility !== 'hidden'; };
    const text = area ? [...area.querySelectorAll('*')].filter(element => visible(element) && [...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) : [];
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, tinyText: text.filter(element => parseFloat(getComputedStyle(element).fontSize) < 11.9).map(element => ({ class: element.className, text: element.textContent.trim().slice(0, 35) })) };
  });
  assert.ok(metrics.scrollWidth <= width, name + ': horizontal overflow');
  assert.deepEqual(metrics.tinyText, [], name + ': fonts below 12px');
  const filename = name + '-' + width + '.png';
  if (screenshots) await page.screenshot({ path: path.join(OUT, filename), fullPage: true });
  const view = { name, ...metrics, ...(screenshots ? {screenshot:filename} : {}) };
  if (name.startsWith('home')) {
    const module = page.locator('.home-catalog');
    const moduleMetrics = await module.evaluate(element => {
      const box = element.getBoundingClientRect();
      const cards = [...element.querySelectorAll('.catalog-race')].map(card => { const rect = card.getBoundingClientRect(); return { left: rect.left, top: rect.top, right: rect.right, width: rect.width, height: rect.height }; });
      const images = [...element.querySelectorAll('.catalog-landmark img')].map(image => ({ src: image.getAttribute('src'), loaded: image.complete && image.naturalWidth > 0 }));
      return { width: box.width, height: box.height, cards, images };
    });
    for (const card of moduleMetrics.cards) {
      assert.ok(card.width >= 44 && card.height >= 44, name + ': archive card hit area');
      assert.ok(card.left >= 0 && card.right <= width, name + ': card stays inside viewport');
    }
    if (moduleMetrics.cards.length) {
      assert.equal(moduleMetrics.cards.length, 3);
      assert.ok(moduleMetrics.cards.every(card => Math.abs(card.top - moduleMetrics.cards[0].top) < 1), 'Three archive cards remain on one row');
      assert.equal(moduleMetrics.images.length, 3);
      assert.ok(moduleMetrics.images.every(image => image.loaded), 'All three local landmark icons load');
    }
    const moduleFilename = name + '-module-' + width + '.png';
    if (screenshots) await module.screenshot({ path: path.join(OUT, moduleFilename) });
    view.module = { ...moduleMetrics, ...(screenshots ? {screenshot:moduleFilename} : {}) };
  }
  report.views.push(view);
}
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const insert = db.prepare('INSERT INTO races(id,name,city,province,distances,race_date,deadline,place,kinds,meet) VALUES(?,?,?,?,?,?,?,?,?,?)');
  for (const [id, name, city] of [['beijing', '北京马拉松', '北京'], ['shanghai', '上海马拉松', '上海'], ['xiamen', '厦门马拉松', '厦门']]) {
    insert.run('archive-client-' + id, '2026' + name, city, city, 'full', '2026-11-01', '', city, 'road', 'offline');
  }
  insert.run('archive-client-beijing-2025', '2025北京马拉松', '北京', '北京', 'full', '2025-11-02', '', '北京', 'road', 'offline');
  insert.run('archive-client-half', '2026北京半程马拉松', '北京', '北京', 'half', '2026-11-01', '', '北京', 'road', 'offline');
  insert.run('archive-client-online', '2026北京马拉松', '北京', '北京', 'full', '2026-11-01', '', '北京', 'road', 'online');
  server = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); });
  const apiOrigin = 'http://127.0.0.1:' + server.address().port;
  const read = async suffix => { const response = await fetch(apiOrigin + '/marathon/api' + suffix); assert.equal(response.status, 200, suffix); return response.json(); };
  const catalog = await read('/race-catalog');
  assert.deepEqual(catalog.races.map(race => race.id), require('../shared/race-catalog.json').races.map(race => race.id));
  const featured=(catalog.featuredIds||['beijing','shanghai','xiamen']).map(id=>catalog.races.find(race=>race.id===id)).filter(Boolean).slice(0,3);
  const archives = Object.fromEntries(await Promise.all(catalog.races.map(async race => [race.id, await read('/race-catalog/' + race.id)])));
  const { createServer } = await import(pathToFileURL(path.join(ROOT, 'web/node_modules/vite/dist/node/index.js')).href);
  vite = await createServer({ root: path.join(ROOT, 'web'), configFile: path.join(ROOT, 'web/vite.config.js'), cacheDir: path.join(temporary, 'vite-cache'), server: { host: '127.0.0.1', port: 0, proxy: { '/marathon/api': apiOrigin } } });
  await vite.listen();
  const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  const executablePath = process.env.CHROME_PATH || process.env.CHROME_BIN || [path.join(process.env.PROGRAMFILES||'C:/Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env.LOCALAPPDATA||'','Google/Chrome/Application/chrome.exe'),'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(file => fs.existsSync(file));
  browser = await chromium.launch({ ...(executablePath ? { executablePath } : { channel: 'chrome' }), headless: true });
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => report.errors.push({ width, error: error.message }));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await check('home archive cards and directory entry at ' + width, async () => {
      await page.goto(origin + '/marathon/', { waitUntil: 'networkidle' });
      await page.locator('.catalog-race').first().waitFor();
      assert.equal(await page.locator('.home-catalog .catalog-race').count(), 3);
      for (const race of featured) assert.ok((await page.locator('.home-catalog').innerText()).includes(race.name));
      await page.locator('.catalog-landmark img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
      for (const race of featured) {
        assert.equal(await page.locator('.home-catalog .catalog-race').filter({ has: page.getByRole('heading', { name: race.name, exact: true }) }).getAttribute('href'), '/marathon/race-catalog/' + race.id);
      }
      await snapshot(page, 'home', width);
      await page.locator('.home-catalog .catalog-race').first().click();
      await page.locator('.main-tabs').waitFor();
      assert.equal(new URL(page.url()).pathname, '/marathon/race-catalog/beijing');
      await page.goBack({ waitUntil: 'networkidle' });
      await page.locator('.home-catalog .catalog-race').first().waitFor();
      await page.getByLabel('搜索赛事名称或城市').fill('北京');
      await page.waitForFunction(() => !document.querySelector('.home-catalog'));
      await page.getByLabel('搜索赛事名称或城市').fill('');
      await page.locator('.home-catalog').waitFor();
      let unavailable = true;
      const homeFault = async route => unavailable ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '测试注入：首页档案暂时不可用' }) }) : route.fallback();
      await page.route('**/marathon/api/race-catalog', homeFault);
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('.catalog-error').waitFor();
      assert.equal(await page.locator('.home-results .load-error').count(), 0, 'Archive failure is isolated from the race calendar');
      await snapshot(page, 'home-error', width);
      unavailable = false;
      await page.locator('.catalog-error').getByRole('button', { name: '重试', exact: true }).click();
      await page.locator('.home-catalog .catalog-race').first().waitFor();
      assert.equal(await page.locator('.home-catalog .catalog-race').count(), 3);
      await page.unroute('**/marathon/api/race-catalog', homeFault);
      await page.getByRole('link', { name: '全部档案 ›', exact: true }).click();
      await page.locator('.archive-directory-card').first().waitFor();
      assert.equal(await page.locator('.archive-directory-card').count(), catalog.races.length);
      const landmarks = page.locator('.archive-directory-card img');
      assert.equal(await landmarks.count(), catalog.races.length);
      await landmarks.evaluateAll(images => Promise.all(images.map(image => image.decode())));
      await snapshot(page, 'directory-all', width);
    });
    await check('independent certification filters and search at ' + width, async () => {
      await page.getByLabel('世界田联标牌').selectOption('白金标');
      await page.getByLabel('中国田协认证').selectOption('A类');
      const platinum=catalog.races.filter(race=>race.worldAthletics?.label==='白金标'&&race.caa?.label==='A类');
      await page.waitForFunction(count => document.querySelectorAll('.archive-directory-card').length === count,platinum.length);
      assert.ok(!(await page.locator('.archive-directory').innerText()).includes('北京马拉松'));
      await page.getByLabel('搜索赛事档案').fill('北马');
      await page.getByRole('button', { name: '搜索', exact: true }).click();
      await page.getByRole('heading', { name: '没有符合条件的档案' }).waitFor();
      await page.getByRole('button', { name: '清除筛选', exact: true }).click();
      await page.waitForFunction(count => document.querySelectorAll('.archive-directory-card').length === count,catalog.races.length);
      await page.getByLabel('世界田联标牌').selectOption('金标');
      await page.waitForFunction(count => document.querySelectorAll('.archive-directory-card').length === count,catalog.races.filter(race=>race.worldAthletics?.label==='金标').length);
      assert.match(await page.locator('.archive-directory').innerText(), /北京马拉松/);
      await snapshot(page, 'directory-filtered', width);
      await page.getByLabel('世界田联标牌').selectOption('');
    });
    for (const race of catalog.races) {
      const data = archives[race.id];
      await check(race.id + ' categories, annual facts and local year state at ' + width, async () => {
        await page.goto(origin + '/marathon/race-catalog/' + race.id, { waitUntil: 'networkidle' });
        await page.locator('.main-tabs').waitFor();
        assert.equal(await page.locator('.main-tabs button').count(), 6);
        assert.equal(await page.locator('.page-content select').count(), 0, 'Overview has no global year selector');
        if(await page.locator('.hero-photo').count())assert.ok(await page.locator('.hero-photo').evaluate(image => image.complete && image.naturalWidth > 0), 'Event cover loads');
        else assert.equal(await page.locator('.hero-city').innerText(),race.city,'Unknown city uses readable fallback without a missing asset');
        assert.equal(await page.locator('.archive-history li').count(),Math.min(5,data.archive.history?.length||0));
        if((data.archive.history?.length||0)>5){await page.locator('.history-section button').click();assert.equal(await page.locator('.archive-history li').count(),data.archive.history.length);}
        if(data.archive.profile?.positioning)assert.ok((await page.locator('.page-content').innerText()).includes(data.archive.profile.positioning));
        for (const [tab, label] of [['overview', '概况'], ['entry', '参赛'], ['route', '赛道'], ['results', '成绩'], ['gallery', '图鉴'], ['updates', '动态']]) {
          await page.locator('.main-tabs').getByRole('button', { name: label, exact: true }).click();
          assert.equal(new URL(page.url()).searchParams.get('tab'), tab);
          assert.equal(await page.locator('.main-tabs button[aria-selected=true]').innerText(), label);
          assert.equal(await page.locator('.archive-sources').count(), 1);
          assert.equal(await page.getByText('复制原文链接', {exact:true}).count(), 0);
          await snapshot(page, race.id + '-' + tab, width);
        }
        await page.locator('.archive-sources summary').click();
        assert.equal(await page.locator('.archive-sources li').count(),data.archive.sources.length);
        const sourceText=await page.locator('.archive-sources').innerText();
        for(const source of data.archive.sources){assert.ok(sourceText.includes(source.title));assert.ok(sourceText.includes(source.verifiedAt||source.accessedAt||'待补充'));}
        for(const href of await page.locator('.archive-sources a').evaluateAll(items=>items.map(item=>item.href)))assert.ok(['https:','http:'].includes(new URL(href).protocol));
        await snapshot(page,race.id+'-sources',width);
        await page.locator('.archive-sources summary').click();
        for (const year of data.years) {
          const edition = data.archive.editions.find(item => String(item.year) === String(year));
          await page.getByRole('button', { name: '参赛', exact: true }).click();
          await page.getByLabel('选择参赛年份').selectOption(String(year));
          await page.getByRole('button', { name: '报名中签', exact: true }).click();
          await page.getByRole('heading', { name: year + ' 报名安排', exact:true }).waitFor();
          const registrationText = await page.locator('.page-content').innerText();
          for(const note of [].concat(data.archive.profile?.entryNotes||[]))assert.ok(registrationText.includes(note),race.id+' long-term entry notes');
          for(const project of edition.events||[]){assert.ok(registrationText.includes(project.project),race.id+' '+year+' project: '+project.project);if(project.plannedParticipants)assert.ok(registrationText.includes(String(project.plannedParticipants)),race.id+' '+year+' project scale: '+project.project);}
          for (const key of ['opens','closes','drawDate','fee','qualification','applicants','eligibleApplicants','lotteryPool','drawQuota','directQuota','lotteryRate']) {
            if (edition.registration[key]) assert.ok(registrationText.includes(String(edition.registration[key])), race.id + ' ' + key + ' in ' + year);
          }
          await page.getByRole('button', { name: '参赛指南', exact: true }).click();
          const guideText = await page.locator('.page-content').innerText();
          for(const tip of edition.logistics?.tips||[]){assert.ok(guideText.includes(tip.title));assert.ok(guideText.includes(tip.body));}
          for (const key of ['collection','transport','raceDay']) {
            const group = edition.logistics && edition.logistics[key] || {};
            for (const [field,value] of Object.entries(group)) if (field !== 'sourceIds' && value) assert.ok(guideText.includes(value), race.id + ' ' + year + ' guide: ' + field);
          }
          await page.getByRole('button', { name: '成绩', exact: true }).click();
          assert.equal(await page.locator('.archive-record').count(),data.archive.records?.length||0);
          await page.getByLabel('选择成绩年份').selectOption(String(year));
          assert.equal(await page.locator('.champion,.result-row').count(), edition.results.length);
          const resultText = await page.locator('.page-content').innerText();
          for(const record of data.archive.records||[]){assert.ok(resultText.includes(record.athlete));assert.ok(resultText.includes(record.time));}
          for (const result of edition.results) {
            assert.ok(resultText.includes(result.group), 'Preserve actual result groups');
            assert.ok(resultText.includes(result.athlete), 'Preserve athlete names');
            assert.ok(resultText.includes(result.time), 'Preserve verified times');
          }
          for (const key of ['planned','starters','finishers','finishRate']) if (edition.participation[key]) assert.ok(resultText.includes(edition.participation[key]), race.id + ' ' + year + ' participation: ' + key);
          await page.getByRole('button', { name: '赛道', exact: true }).click();
          await page.locator('.version-card').filter({has:page.getByText(String(year),{exact:true})}).first().click();
          if(await page.getByLabel('选择版本内年份').count())await page.getByLabel('选择版本内年份').selectOption(String(year));
          const routeText=await page.locator('.road-order').innerText();
          for(const stage of String(edition.route.summary||'').split('→').map(value=>value.trim()).filter(Boolean))assert.ok(routeText.includes(stage),race.id+' '+year+' correct route');
          for(const item of (edition.officialResources||[]).filter(item=>item.category==='route-map')) {
            assert.equal(await page.getByRole('link',{name:item.title+' ↗',exact:true}).getAttribute('href'),item.url);
          }
        }
        await page.getByRole('button', { name: '成绩', exact: true }).click();
        const selectedYear = String(data.years.at(-1));
        await page.getByLabel('选择成绩年份').selectOption(selectedYear);
        await page.getByRole('button', { name: '参赛', exact: true }).click();
        await page.getByLabel('选择参赛年份').selectOption(String(data.years[0]));
        await page.getByRole('button', { name: '成绩', exact: true }).click();
        assert.equal(await page.getByLabel('选择成绩年份').inputValue(), selectedYear, 'Entry year does not change result year');
        await page.waitForFunction(year=>new URL(location.href).searchParams.get('year')===year,selectedYear);
        await page.getByRole('button', { name: '图鉴', exact: true }).click();
        assert.equal(await page.locator('.page-content select').count(), 0, 'Gallery presents annual groups directly');
        for (const category of ['参赛服','奖牌','参赛包','完赛包']) {
          await page.getByRole('button', { name: category, exact:true }).click();
          const resourceCategory = {'参赛服':'shirt','奖牌':'medal'}[category];
          const groups = data.archive.editions.map(edition => ({items:(edition.gear||[]).filter(item=>item.category===category), resources:(edition.officialResources||[]).filter(item=>item.category===resourceCategory)})).filter(group=>group.items.length || group.resources.length);
          assert.equal(await page.locator('.collection-year').count(), groups.length);
          const text = await page.locator('.page-content').innerText();
          for (const group of groups) {
            for (const item of group.items) if(item.description) assert.ok(text.includes(item.description), category + ': preserved description');
            for (const item of group.resources) assert.ok(text.includes(item.title), category + ': preserved official source link');
          }
        }
        await page.getByRole('button', { name: '官方图集', exact:true }).click();
        assert.equal(await page.locator('.album-card').count(), data.archive.photoAlbums?.length || 0);
        await page.reload({ waitUntil: 'networkidle' });
        await page.locator('.main-tabs').waitFor();
        assert.equal(await page.locator('.main-tabs button[aria-selected=true]').innerText(), '图鉴', 'Reload restores category');
        await page.goto(origin + '/marathon/race-catalog/' + race.id + '?tab=entry&year=1900&fromRaceId=untrusted', { waitUntil: 'networkidle' });
        assert.equal(await page.getByLabel('选择参赛年份').inputValue(), data.defaultYear || data.latestYear);
        assert.equal(await page.locator('.return-link').count(), 0);
      });
    }
    await check('registration and archive round trip only for matching full race at ' + width, async () => {
      await page.goto(origin + '/marathon/races/archive-client-beijing', { waitUntil: 'networkidle' });
      await page.locator('.race-archive-entry').waitFor();
      await page.locator('.race-archive-entry').click();
      await page.locator('.return-link').waitFor();
      assert.equal(new URL(page.url()).searchParams.get('fromRaceId'), 'archive-client-beijing');
      assert.equal(await page.locator('.return-link').getAttribute('href'), '/marathon/races/archive-client-beijing');
      const related = archives.beijing.relatedRaces;
      assert.ok(!related.some(item=>['archive-client-half','archive-client-online'].includes(item.id)), 'Half/online races stay outside the archive return links');
      await page.locator('.return-link').click();
      await page.locator('.race-archive-entry').waitFor();
      await page.goto(origin + '/marathon/races/archive-client-beijing-2025', { waitUntil: 'networkidle' });
      await page.locator('.race-archive-entry').click();
      await page.locator('.return-link').waitFor();
      await page.getByRole('button', {name:'参赛',exact:true}).click();
      assert.equal(await page.getByLabel('选择参赛年份').inputValue(), '2025', 'Registration entry selects its matching year inside the participant category');
    });
    await check('explicit presentation fixture for long history, missing art, record evidence and HTTP sources at ' + width,async()=>{
      const edition={year:'2025',date:'2025-03-23',editionName:'2025本地展示夹具',status:'completed',route:{summary:'测试起点 → 测试地标 → 测试终点'},registration:{method:'仅用于测试的2025规则'},participation:{},results:[],gear:[],logistics:{tips:[{title:'测试建议',body:'2025届指南的本地展示测试',kind:'editorial-advice'}]},events:[{project:'马拉松',plannedParticipants:12345,sourceIds:['fixture-source']}]};
      const fixture={race:{id:'fixture-city',name:'本地展示夹具赛事',city:'测试城市'},archive:{intro:'仅用于浏览器验收的本地夹具，不写入档案数据。',profile:{foundingYear:'2014',entryNotes:['2025届测试报名特点']},history:Array.from({length:7},(_,i)=>({date:String(2014+i),title:'测试历史节点'+i,body:'较长的历史说明用于窄屏排版验证。'})),records:[{group:'男子赛会纪录',athlete:'Test Runner',time:'02:08:01',editionId:'fixture-2025',verifiedThroughEditionId:'fixture-2025',verifiedAt:'2026-11-18'}],editions:[edition],sources:[{id:'fixture-source',title:'本地HTTP来源夹具',publisher:'测试发布者',url:'http://official.example/notice',applicableYears:['2025'],verifiedAt:'2026-11-18'}],gaps:[{reason:'仅用于测试的待补充说明'}]},years:['2025'],defaultYear:'2025'};
      const fixtureRoute=route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture)});
      await page.route('**/marathon/api/race-catalog/wuxi',fixtureRoute);
      await page.goto(origin+'/marathon/race-catalog/wuxi',{waitUntil:'networkidle'});await page.locator('.main-tabs').waitFor();
      assert.equal(await page.locator('.hero-photo').count(),0);assert.equal(await page.locator('.hero-city').innerText(),'测试城市');
      assert.equal(await page.locator('.archive-history li').count(),5);await page.locator('.history-section button').click();assert.equal(await page.locator('.archive-history li').count(),7);await snapshot(page,'fixture-history',width);
      await page.getByRole('button',{name:'成绩',exact:true}).click();assert.equal(await page.locator('.archive-record strong').innerText(),'02:08:01');await snapshot(page,'fixture-record',width);
      await page.getByRole('button',{name:'参赛',exact:true}).click();assert.ok((await page.locator('.page-content').innerText()).includes('12345'));await page.getByRole('button',{name:'参赛指南',exact:true}).click();assert.ok((await page.locator('.page-content').innerText()).includes('2025届指南的本地展示测试'));
      await page.locator('.archive-sources summary').click();assert.equal(await page.locator('.archive-sources a').getAttribute('href'),'http://official.example/notice');await page.locator('.archive-coverage summary').click();assert.ok((await page.locator('.archive-coverage').innerText()).includes('仅用于测试的待补充说明'));await snapshot(page,'fixture-evidence',width);
      await page.unroute('**/marathon/api/race-catalog/wuxi',fixtureRoute);
    });
    await check('injected 503 retry and actual API 404 at ' + width, async () => {
      let unavailable = true;
      const fault = async route => { if (unavailable) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '测试注入：暂时无法读取档案' }) }); return route.fallback(); };
      await page.route('**/marathon/api/race-catalog/beijing', fault);
      await page.goto(origin + '/marathon/race-catalog/beijing', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: '重新加载', exact: true }).waitFor();
      unavailable = false;
      await page.getByRole('button', { name: '重新加载', exact: true }).click();
      await page.locator('.main-tabs').waitFor();
      await page.unroute('**/marathon/api/race-catalog/beijing', fault);
      await page.goto(origin + '/marathon/race-catalog/missing-race', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: '重新加载', exact: true }).waitFor();
      assert.equal(await page.locator('.main-tabs').count(), 0);
      const response = await fetch(apiOrigin + '/marathon/api/race-catalog/missing-race');
      assert.equal(response.status, 404);
      await snapshot(page, 'missing-archive', width);
    });
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
}
main().catch(error => { report.error = error.stack; process.exitCode = 1; console.error(error); }).finally(async () => {
  if (browser) await browser.close();
  if (vite) await vite.close();
  if (server) await new Promise(resolve => server.close(resolve));
  try { db.close(); } catch {}
  fs.rmSync(temporary, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, views: report.views.length, errors: report.errors.length, report: path.join(OUT, 'report.json') }));
});
