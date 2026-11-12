/* Real /clubs browser journeys against disposable SQLite and localhost Vite.
 * Membership rows below are synthetic fixtures. No production env, services or writes. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = process.env.CLUB_DIRECTORY_OUT || path.join(ROOT, 'design/previews/club-directory-v5-20261112');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-club-directory-v5-'));
Object.assign(process.env, { NODE_ENV: 'test', BASE_PATH: '/marathon', PORT: '0', MARATHON_DB: path.join(temp, 'app.sqlite'), MARATHON_MEDIA: path.join(temp, 'media'), CONTENT_DATA_DIR: path.join(temp, 'content'), ADMIN_TOKEN: crypto.randomBytes(24).toString('hex') });
const exists = fs.existsSync; fs.existsSync = file => path.resolve(String(file)) === path.join(ROOT, '.env') ? false : exists(file);
let app; try { ({ app } = require('../server/src/index')); } finally { fs.existsSync = exists; }
const db = require('../server/src/db').getDb();
const report = { kind: 'Club directory v5 real HTTP/browser acceptance with disposable synthetic memberships', checks: [], views: [], errors: [], limitations: ['Chromium mobile viewports do not replace WeChat device testing.', 'Membership fixtures are inserted into a temporary database; search, navigation and creation use actual application APIs.'] };
let server, vite, browser, origin, base;
async function api(method, endpoint, token, body) { const response = await fetch(origin + '/marathon/api' + endpoint, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); const data = await response.json(); assert.equal(response.status, 200, method + ' ' + endpoint + ': ' + JSON.stringify(data)); return data; }
async function account(nickname) { return api('POST', '/auth/register', '', { nickname, password: 'Club-entry-2026!', legalConsent: { accepted: true, version: require('../shared/legal-documents.json').version } }); }
async function check(name, fn) { await fn(); report.checks.push({ name, passed: true }); console.log('PASS ' + name); }
async function screenshot(page, name) { const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth })); assert.ok(metrics.scrollWidth <= metrics.width + 1 && metrics.bodyWidth <= metrics.width + 1, name + ' overflow ' + JSON.stringify(metrics)); const filename = name + '-' + metrics.width + '.png'; await page.screenshot({ path: path.join(OUT, filename), fullPage: true }); report.views.push({ name, ...metrics, screenshot: filename }); }
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  server = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); }); origin = 'http://127.0.0.1:' + server.address().port;
  const { createServer } = await import(pathToFileURL(path.join(ROOT, 'web/node_modules/vite/dist/node/index.js')).href);
  vite = await createServer({ root: path.join(ROOT, 'web'), cacheDir: path.join(temp, 'vite-cache'), configFile: path.join(ROOT, 'web/vite.config.js'), server: { host: '127.0.0.1', port: 0, proxy: { '/marathon/api': { target: origin, changeOrigin: true } } } }); await vite.listen(); base = 'http://127.0.0.1:' + vite.httpServer.address().port + '/marathon';
  const actor = await account('拥有十个跑团的跑友'), other = await account('只有一个跑团的跑友'), owner = await account('目录公开负责人');
  const clubs = [];
  for (let i = 0; i < 10; i++) {
    const name = i === 8 ? '长名字也要完整辨认的西湖周末长距离跑团' : ['晨光', '河岸', '西湖', '追风', '向阳', '轻松', '山野', '星空', '', '城市'][i] + '跑团';
    const info = db.prepare('INSERT INTO clubs(name,code,owner_id,created_at,city,intro) VALUES(?,?,?,?,?,?)').run(name, 'V4-FIXTURE-' + i, owner.user.id, '2026-11-01T00:00:00Z', i < 8 ? '杭州' : '北京', '每周末按配速分组，一起轻松跑。'); const id = Number(info.lastInsertRowid);
    for (const who of [owner, actor]) db.prepare('INSERT INTO club_members(club_id,user_id,joined_at) VALUES(?,?,?)').run(id, who.user.id, '2026-11-01T00:00:00Z'); clubs.push({ id, name });
  }
  db.prepare('INSERT INTO club_members(club_id,user_id,joined_at) VALUES(?,?,?)').run(clubs[9].id, other.user.id, '2026-11-01T00:00:00Z');
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
  for (const width of [320, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript(({ token, nickname }) => { localStorage.setItem('marathon_token', token); localStorage.setItem('marathon_name', nickname); }, { token: actor.token, nickname: actor.user.nickname });
    await context.route('**/*', route => /^(https?:\/\/(127\.0\.0\.1|localhost)(:|\/)|data:|blob:)/.test(route.request().url()) ? route.continue() : route.abort());
    const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
    const mine = () => page.locator('.my-clubs .my-club');
    await check(width + 'px: memberships stack vertically and the creation entry sits before discovery', async () => {
      await page.goto(base + '/clubs', { waitUntil: 'networkidle' }); await mine().first().waitFor(); assert.equal(await mine().count(), 4);
      assert.equal(await page.locator('.clubs-header a[href$="/clubs/new"],.discover-feature').count(), 0); assert.equal(await page.locator('a[href$="/clubs/new"]').count(), 1);
      const order = await page.evaluate(() => {
        const mine = document.querySelector('.my-clubs'), create = document.querySelector('.create-club'), discover = document.querySelector('.discover');
        return { afterMine: Boolean(mine.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING), beforeDiscovery: Boolean(create.compareDocumentPosition(discover) & Node.DOCUMENT_POSITION_FOLLOWING), separated: create.getBoundingClientRect().bottom <= discover.getBoundingClientRect().top };
      });
      assert.deepEqual(order, { afterMine: true, beforeDiscovery: true, separated: true });
      assert.equal(await page.locator('input[name="name"],.create-form').count(), 0, 'The directory should open a dedicated creation page');
      const boxes = await mine().evaluateAll(rows => rows.map(row => { const r = row.getBoundingClientRect(); return { left: r.left, top: r.top, bottom: r.bottom }; })); assert.ok(boxes.every((r, i) => !i || r.top >= boxes[i - 1].bottom - 1 && Math.abs(r.left - boxes[0].left) < 2));
      const layout = await page.evaluate(() => { const search = document.querySelector('.search-row .club-search').getBoundingClientRect(), city = document.querySelector('.city-filter').getBoundingClientRect(); return { search: { top: search.top, bottom: search.bottom, width: search.width }, city: { top: city.top, bottom: city.bottom, width: city.width } }; }); assert.ok(layout.city.top >= layout.search.bottom - 1, 'City filter must have its own row');
      const visual = await page.evaluate(() => ({ background:getComputedStyle(document.querySelector('.clubs-page')).backgroundColor, headerColor:getComputedStyle(document.querySelector('.clubs-header')).color, buttonBorder:getComputedStyle(document.querySelector('.club-quick-actions a span')).borderTopWidth, target:document.querySelector('.club-quick-actions a').getBoundingClientRect().width, actionBackground:getComputedStyle(document.querySelector('.result-action')).backgroundColor }));
      assert.equal(visual.background,'rgb(245, 245, 245)'); assert.equal(visual.headerColor,'rgb(255, 255, 255)'); assert.equal(visual.buttonBorder,'1px'); assert.ok(visual.target>=44); assert.equal(visual.actionBackground,'rgba(0, 0, 0, 0)');
      await screenshot(page, 'web-default');
    });
    await check(width + 'px: expand all memberships, search the complete list, and enter a joined club', async () => {
      await page.locator('.my-clubs').getByRole('button', { name: /展开|查看全部/ }).click(); assert.equal(await mine().count(), 10); await screenshot(page, 'web-expanded');
      const search = page.getByRole('textbox', { name: '搜索我的跑团', exact: true });
      for (const [query, count, title] of [['杭州', 8], ['#' + clubs[8].id, 1, clubs[8].name], ['西湖周末', 1, clubs[8].name], ['找不到的跑团', 0]]) { await search.fill(query); await page.waitForFunction(count => document.querySelectorAll('.my-clubs .my-club').length === count, count); if (title) assert.match(await mine().innerText(), new RegExp(title)); }
      await search.fill('#' + clubs[8].id); await screenshot(page, 'web-membership-search');
      if(width===320){const enlarged=await page.addStyleTag({content:'.my-clubs .club-copy h3,.club-hit .club-copy strong{font-size:18px!important}.my-clubs .club-copy small{font-size:14px!important}'});await screenshot(page,'web-large-text-long-name');await enlarged.evaluate(node=>node.remove());} await mine().locator('a.club-main').click(); await page.waitForURL(new RegExp('/clubs/' + clubs[8].id + '$')); await page.getByRole('heading', { name: clubs[8].name, exact: true }).waitFor();
      await page.goto(base + '/clubs', { waitUntil: 'networkidle' }); assert.equal(await mine().count(), 4);
    });
    await check(width + 'px: discovery name, city and invitation search retain working routes', async () => {
      await page.getByRole('textbox', { name: '搜索跑团', exact: true }).fill('西湖'); await page.getByRole('textbox', { name: '筛选活动城市', exact: true }).fill('北京'); await page.locator('.club-search').getByRole('button', { name: '搜索', exact: true }).click(); await page.waitForFunction(() => document.querySelectorAll('.club-hit').length === 1); assert.match(await page.locator('.club-hit').innerText(), /北京/); await screenshot(page, 'web-discovery-search');
      await page.getByRole('tab', { name: '口令加入', exact: true }).click(); await page.getByRole('textbox', { name: '跑团口令', exact: true }).fill('V4-FIXTURE-8'); await page.locator('.club-search').getByRole('button', { name: '查看', exact: true }).click(); await page.waitForURL(/\/clubs\/invite\/V4-FIXTURE-8$/); await page.getByRole('heading', { name: clubs[8].name, exact: true }).waitFor();
    });
    await check(width + 'px: account switching clears the expanded list and search before showing the new memberships', async () => {
      await page.goto(base + '/clubs', { waitUntil: 'networkidle' }); await page.locator('.my-clubs').getByRole('button', { name: /展开|查看全部/ }).click(); await page.getByRole('textbox', { name: '搜索我的跑团', exact: true }).fill('杭州');
      await page.evaluate(token => { localStorage.setItem('marathon_token', token); window.dispatchEvent(new Event('storage')); }, other.token); await page.waitForFunction(() => document.querySelectorAll('.my-clubs .my-club').length === 1); assert.match(await mine().innerText(), new RegExp(clubs[9].name)); assert.ok(!(await page.locator('.my-clubs').innerText()).includes('杭州')); await screenshot(page, 'web-account-switch');
    });
    await context.close();
  }
  await check('Creation entry opens a separate page, supports returning, and creates a club for an ordinary account', async () => {
    const context = await browser.newContext({ viewport: { width: 320, height: 900 } }); await context.addInitScript(token => localStorage.setItem('marathon_token', token), other.token); const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message)); await page.goto(base + '/clubs', { waitUntil: 'networkidle' }); await page.locator('.create-club').click(); await page.waitForURL(/\/clubs\/new$/); await page.getByLabel('跑团名称', { exact: true }).waitFor(); await page.goBack(); await page.waitForURL(/\/clubs$/); await page.locator('.my-clubs .my-club').waitFor(); await page.locator('.create-club').click(); await page.waitForURL(/\/clubs\/new$/); await page.getByLabel('跑团名称', { exact: true }).fill('从独立创建页建立的跑团'); await page.getByLabel('活动城市', { exact: true }).fill('绍兴'); await page.getByLabel('一句话介绍', { exact: true }).fill('真实本地接口完成创建，按自己的节奏一起跑。'); await screenshot(page, 'web-create'); await page.getByRole('button', { name: /^创建跑团/ }).click(); await page.waitForURL(/\/clubs\/\d+\?created=1$/); const me = await api('GET', '/me', other.token); assert.equal(me.user.leader, false); assert.ok(me.clubs.some(club => club.name === '从独立创建页建立的跑团' && club.city === '绍兴' && club.role === 'owner')); await context.close();
  });
  await check('Guests see the same entry before discovery and are guided to sign in on the separate page', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } }); const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message)); await page.goto(base + '/clubs', { waitUntil: 'networkidle' });
    const entry = page.locator('.create-club'); await entry.waitFor();
    assert.ok(await entry.evaluate(node => Boolean(node.compareDocumentPosition(document.querySelector('.discover')) & Node.DOCUMENT_POSITION_FOLLOWING)));
    await screenshot(page, 'web-guest-directory'); await entry.click(); await page.waitForURL(/\/clubs\/new$/);
    await page.getByRole('button', { name: '登录并创建', exact: true }).waitFor(); await screenshot(page, 'web-guest-create'); await context.close();
  });
  assert.deepEqual(report.errors, []); report.passed = true;
}
main().catch(error => { report.passed = false; report.error = error.stack || String(error); console.error(report.error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (vite) await vite.close(); if (server) await new Promise(resolve => server.close(resolve)); try { db.close(); } catch {} fs.rmSync(temp, { recursive: true, force: true }); report.finishedAt = new Date().toISOString(); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, views: report.views.length, report: path.relative(ROOT, path.join(OUT, 'report.json')) })); });
