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
const OUT = process.env.RACE_ARCHIVE_OUT ? path.resolve(process.env.RACE_ARCHIVE_OUT) : path.join(ROOT, 'design/previews/race-archive-category-full-20261114');
const screenshots = process.env.RACE_ARCHIVE_SCREENSHOTS === '1';
Object.assign(process.env, { NODE_ENV: 'test', BASE_PATH: '/marathon', PORT: '0', MARATHON_DB: path.join(temporary, 'app.sqlite'), MARATHON_MEDIA: path.join(temporary, 'media'), CONTENT_DATA_DIR: path.join(temporary, 'content'), ADMIN_TOKEN: 'disposable-race-archive-client' });
const exists = fs.existsSync;
fs.existsSync = file => path.resolve(String(file)) === path.join(ROOT, '.env') ? false : exists(file);
let app;
try { ({ app } = require('../server/src/index')); } finally { fs.existsSync = exists; }
const db = require('../server/src/db').getDb();
const report = { startedAt: new Date().toISOString(), isolation: 'Actual local Express API and Vue with authored three-event archives; temporary registration rows/SQLite/media; .env hidden; external browser traffic blocked.', checks: [], views: [], errors: [], passed: false, limitations: ['Chromium viewports are not a WeChat or mobile device test.', '503 responses are injected only for the explicit failure/retry check.', 'Remote images are blocked to verify readable fallback; local archive assets are served by Vite.'] };
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
  assert.deepEqual(catalog.races.map(race => race.id), ['beijing', 'shanghai', 'xiamen']);
  const archives = Object.fromEntries(await Promise.all(catalog.races.map(async race => [race.id, await read('/race-catalog/' + race.id)])));
  const { createServer } = await import(pathToFileURL(path.join(ROOT, 'web/node_modules/vite/dist/node/index.js')).href);
  vite = await createServer({ root: path.join(ROOT, 'web'), configFile: path.join(ROOT, 'web/vite.config.js'), cacheDir: path.join(temporary, 'vite-cache'), server: { host: '127.0.0.1', port: 0, proxy: { '/marathon/api': apiOrigin } } });
  await vite.listen();
  const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  const executablePath = process.env.CHROME_PATH || process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(file => fs.existsSync(file));
  browser = await chromium.launch({ ...(executablePath ? { executablePath } : { channel: 'chrome' }), headless: true });
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => report.errors.push({ width, error: error.message }));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await check('home archive cards and directory entry at ' + width, async () => {
      await page.goto(origin + '/marathon/', { waitUntil: 'networkidle' });
      await page.locator('.catalog-race').first().waitFor();
      assert.equal(await page.locator('.home-catalog .catalog-race').count(), 3);
      for (const race of catalog.races) assert.ok((await page.locator('.home-catalog').innerText()).includes(race.name));
      await page.locator('.catalog-landmark img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
      for (const race of catalog.races) {
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
      assert.equal(await page.locator('.archive-directory-card').count(), 3);
      await snapshot(page, 'directory-all', width);
    });
    await check('independent certification filters and search at ' + width, async () => {
      await page.getByLabel('世界田联标牌').selectOption('白金标');
      await page.getByLabel('中国田协认证').selectOption('A类');
      await page.waitForFunction(() => document.querySelectorAll('.archive-directory-card').length === 2);
      assert.ok(!(await page.locator('.archive-directory').innerText()).includes('北京马拉松'));
      await page.getByLabel('搜索赛事档案').fill('北马');
      await page.getByRole('button', { name: '搜索', exact: true }).click();
      await page.getByRole('heading', { name: '没有符合条件的档案' }).waitFor();
      await page.getByRole('button', { name: '清除筛选', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.archive-directory-card').length === 3);
      await page.getByLabel('世界田联标牌').selectOption('金标');
      await page.waitForFunction(() => document.querySelectorAll('.archive-directory-card').length === 1);
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
        assert.ok(await page.locator('.hero-photo').evaluate(image => image.complete && image.naturalWidth > 0), 'Event cover loads');
        for (const [tab, label] of [['overview', '概况'], ['entry', '参赛'], ['route', '赛道'], ['results', '成绩'], ['gallery', '图鉴'], ['updates', '动态']]) {
          await page.locator('.main-tabs').getByRole('button', { name: label, exact: true }).click();
          assert.equal(new URL(page.url()).searchParams.get('tab'), tab);
          assert.equal(await page.locator('.main-tabs button[aria-selected=true]').innerText(), label);
          assert.equal(await page.locator('.archive-sources').count(), 0);
          assert.equal(await page.getByText('复制原文链接', {exact:true}).count(), 0);
          await snapshot(page, race.id + '-' + tab, width);
        }
        for (const year of data.years) {
          const edition = data.archive.editions.find(item => String(item.year) === String(year));
          await page.getByRole('button', { name: '参赛', exact: true }).click();
          await page.getByLabel('选择参赛年份').selectOption(String(year));
          await page.getByRole('button', { name: '报名中签', exact: true }).click();
          await page.getByRole('heading', { name: year + ' 报名安排', exact:true }).waitFor();
          const registrationText = await page.locator('.page-content').innerText();
          for (const key of ['opens','closes','drawDate','fee','qualification','applicants','eligibleApplicants','lotteryPool','drawQuota','directQuota','lotteryRate']) {
            if (edition.registration[key]) assert.ok(registrationText.includes(String(edition.registration[key])), race.id + ' ' + key + ' in ' + year);
          }
          await page.getByRole('button', { name: '参赛指南', exact: true }).click();
          const guideText = await page.locator('.page-content').innerText();
          for (const key of ['collection','transport','raceDay']) {
            const group = edition.logistics && edition.logistics[key] || {};
            for (const [field,value] of Object.entries(group)) if (field !== 'sourceIds' && value) assert.ok(guideText.includes(value), race.id + ' ' + year + ' guide: ' + field);
          }
          await page.getByRole('button', { name: '成绩', exact: true }).click();
          await page.getByLabel('选择成绩年份').selectOption(String(year));
          assert.equal(await page.locator('.champion,.result-row').count(), edition.results.length);
          const resultText = await page.locator('.page-content').innerText();
          for (const result of edition.results) {
            assert.ok(resultText.includes(result.group), 'Preserve actual result groups');
            assert.ok(resultText.includes(result.athlete), 'Preserve athlete names');
            assert.ok(resultText.includes(result.time), 'Preserve verified times');
          }
          for (const key of ['planned','starters','finishers','finishRate']) if (edition.participation[key]) assert.ok(resultText.includes(edition.participation[key]), race.id + ' ' + year + ' participation: ' + key);
        }
        const selectedYear = String(data.years.at(-1));
        await page.getByLabel('选择成绩年份').selectOption(selectedYear);
        await page.getByRole('button', { name: '参赛', exact: true }).click();
        await page.getByLabel('选择参赛年份').selectOption(String(data.years[0]));
        await page.getByRole('button', { name: '成绩', exact: true }).click();
        assert.equal(await page.getByLabel('选择成绩年份').inputValue(), selectedYear, 'Entry year does not change result year');
        await page.getByRole('button', { name: '图鉴', exact: true }).click();
        assert.equal(await page.locator('.page-content select').count(), 0, 'Gallery presents annual groups directly');
        for (const category of ['参赛服','奖牌','参赛包','完赛包']) {
          await page.getByRole('button', { name: category, exact:true }).click();
          const groups = data.archive.editions.flatMap(edition => (edition.gear||[]).filter(item=>item.category===category));
          assert.equal(await page.locator('.collection-year').count(), groups.length);
          const text = await page.locator('.page-content').innerText();
          for (const item of groups) if(item.description) assert.ok(text.includes(item.description), category + ': preserved description');
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
