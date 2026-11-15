'use strict';
// Real Vue and Express flow in a disposable local database. No production data or external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'participation-web-'));
const out = process.env.PARTICIPATION_WEB_OUT || path.join(root, 'design/previews/participation-20261116/web');
Object.assign(process.env, { NODE_ENV: 'test', PORT: '0', BASE_PATH: '/marathon', MARATHON_DB: path.join(temporary, 'app.sqlite'), MARATHON_MEDIA: path.join(temporary, 'media'), CONTENT_DATA_DIR: path.join(temporary, 'content') });
const exists = fs.existsSync;
fs.existsSync = file => path.resolve(String(file)) === path.join(root, '.env') ? false : exists(file);
let app;
try { ({ app } = require('../server/src/index')); } finally { fs.existsSync = exists; }
const db = require('../server/src/db').getDb();
const report = { checks: [], views: [], errors: [], passed: false };
let server, vite, browser;
const token = 'participation-browser-synthetic';
async function check(name, run) { await run(); report.checks.push(name); }
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString(), day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const userId = Number(db.prepare('INSERT INTO users(nickname,token,created_at) VALUES(?,?,?)').run('合成跑者', token, stamp).lastInsertRowid);
  const buddyId = Number(db.prepare('INSERT INTO users(nickname,token,created_at) VALUES(?,?,?)').run('合成团友', 'participation-buddy', stamp).lastInsertRowid);
  const clubIds = ['合成甲团', '合成乙团'].map((name, index) => Number(db.prepare('INSERT INTO clubs(name,code,owner_id,created_at) VALUES(?,?,?,?)').run(name, 'PARTICIPATION-' + index, buddyId, stamp).lastInsertRowid));
  for (const clubId of clubIds) for (const id of [userId, buddyId]) db.prepare('INSERT INTO club_members(club_id,user_id,joined_at) VALUES(?,?,?)').run(clubId, id, stamp);
  const raceId = 'participation-web-race', otherId = 'participation-other-race';
  for (const [id, name] of [[raceId, '合成同行马拉松'], [otherId, '合成另一场马拉松']]) db.prepare('INSERT INTO races(id,name,city,province,distances,race_date,deadline,place,kinds,meet) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, name, '合成城市', '合成地区', 'full', day, '', '合成起点', 'road', 'offline');
  server = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); });
  const apiOrigin = 'http://127.0.0.1:' + server.address().port;
  async function read(suffix, userToken = token) { const response = await fetch(apiOrigin + '/marathon/api' + suffix, { headers: { Authorization: 'Bearer ' + userToken } }); assert.equal(response.status, 200, suffix); return response.json(); }
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
  const racePath = origin + '/marathon/races/' + raceId;

  await check('List follows independently without navigating or creating a plan', async () => {
    await page.goto(origin + '/marathon/', { waitUntil: 'networkidle' });
    const row = page.locator('.race-card-shell').filter({ hasText: '合成同行马拉松' });
    await row.getByRole('button', { name: '关注合成同行马拉松', exact: true }).click();
    await row.getByRole('button', { name: '取消关注合成同行马拉松', exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/marathon/');
    const mine = await read('/me');
    assert.equal(mine.plans.length, 0);
    assert.ok(mine.followedRaces.some(race => race.id === raceId));
  });
  await check('Four stages allow direct registration and explicit confirmation without lottery', async () => {
    await page.goto(racePath, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '标记参赛状态', exact: false }).click();
    assert.equal(await page.locator('.plan-stages button').count(), 4);
    assert.equal(await page.locator('.race-plan .statuses .status').count(), 1);
    await page.getByRole('button', { name: '3 确认参赛', exact: true }).click();
    await page.locator('.race-plan .statuses').getByRole('button', { name: '确认参赛', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.race-plan .plan-status')?.textContent === '确认参赛');
    const race = await read('/races/' + raceId);
    assert.equal(race.myStatus, '确认参赛');
    assert.deepEqual(race.sharedClubIds, []);
    assert.equal(race.following, true);
    assert.equal(await page.getByText('报名截图仅本人可见，不会同步给跑团。', { exact: true }).count(), 1);
  });
  await check('Sharing is selected per club and companion note has the same audience', async () => {
    await page.getByRole('button', { name: '同步设置与同行需求', exact: false }).click();
    await page.getByRole('checkbox', { name: /合成甲团/ }).check();
    await page.getByRole('button', { name: '保存同步范围', exact: true }).click();
    await page.getByText('已更新同步范围，后续参赛状态会自动同步。', { exact: true }).waitFor();
    await page.getByLabel('我的同行需求', { exact: true }).fill('合成需求：比赛日想拼车，领物后一起集合');
    await page.getByRole('button', { name: '保存同行需求', exact: true }).click();
    await page.getByText('同行需求已保存。', { exact: true }).waitFor();
    const buddyRace = await read('/races/' + raceId, 'participation-buddy');
    assert.ok(buddyRace.clubs.find(club => club.id === clubIds[0]).mates.some(mate => mate.nickname === '合成跑者' && mate.note.includes('拼车')));
    assert.ok(!buddyRace.clubs.find(club => club.id === clubIds[1]).mates.some(mate => mate.nickname === '合成跑者'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meetup_joins').get()?.n || 0, 0);
  });
  await check('Status updates preserve selected sharing and cancelling follow preserves plan', async () => {
    await page.locator('.race-plan .statuses').getByRole('button', { name: '已缴费', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.race-plan .plan-status')?.textContent === '已缴费');
    await page.locator('.race-follow-row').getByRole('button').click();
    await page.locator('.race-follow-row').getByRole('button', { name: '关注合成同行马拉松', exact: true }).waitFor();
    const race = await read('/races/' + raceId);
    assert.equal(race.following, false); assert.equal(race.myStatus, '已缴费'); assert.deepEqual(race.sharedClubIds, [clubIds[0]]);
  });
  await check('Unsharing removes existing plan and note from fellow runners', async () => {
    await page.getByRole('checkbox', { name: /合成甲团/ }).uncheck();
    await page.getByRole('button', { name: '保存同步范围', exact: true }).click();
    await page.getByText('已设为仅自己可见。', { exact: true }).waitFor();
    const buddyRace = await read('/races/' + raceId, 'participation-buddy');
    assert.ok(buddyRace.clubs.every(club => !club.mates.some(mate => mate.nickname === '合成跑者')));
    const mine = await read('/races/' + raceId); assert.ok(mine.companionNote.includes('拼车'));
  });
  await check('Failed follow and state saves retain existing data and allow retry', async () => {
    const failFollow = route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '合成关注保存失败' }) });
    await page.route('**/api/me/races/' + raceId + '/follow', failFollow);
    await page.locator('.race-follow-row').getByRole('button').click();
    await page.locator('.race-follow-row').getByRole('alert').waitFor();
    assert.equal((await read('/races/' + raceId)).following, false);
    assert.equal(await page.locator('.race-follow-row').getByRole('button').isEnabled(), true);
    await page.unroute('**/api/me/races/' + raceId + '/follow', failFollow);
    const failState = route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '合成状态保存失败' }) });
    await page.route('**/api/me/races/' + raceId, failState);
    await page.locator('.race-plan .statuses').getByRole('button', { name: '已领物', exact: true }).click();
    await page.locator('.race-plan [role=status]').filter({ hasText: '合成状态保存失败' }).waitFor();
    assert.equal((await read('/races/' + raceId)).myStatus, '已缴费');
    assert.equal(await page.locator('.race-plan .statuses').getByRole('button', { name: '已领物', exact: true }).isEnabled(), true);
    await page.unroute('**/api/me/races/' + raceId, failState);
  });
  await check('Unsaved sharing and companion drafts survive status and independent section saves', async () => {
    const draft = '尚未保存的同行需求：等待团友确认';
    await page.getByLabel('我的同行需求', { exact: true }).fill(draft);
    await page.getByRole('checkbox', { name: /合成乙团/ }).check();
    await page.locator('.race-plan .statuses').getByRole('button', { name: '已领物', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.race-plan .plan-status')?.textContent === '已领物');
    assert.equal(await page.getByLabel('我的同行需求', { exact: true }).inputValue(), draft);
    assert.equal(await page.getByRole('checkbox', { name: /合成乙团/ }).isChecked(), true);
    assert.deepEqual((await read('/races/' + raceId)).sharedClubIds, []);
    await page.getByRole('button', { name: '保存同步范围', exact: true }).click();
    await page.getByText('已更新同步范围，后续参赛状态会自动同步。', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('我的同行需求', { exact: true }).inputValue(), draft);
    await page.getByRole('checkbox', { name: /合成乙团/ }).uncheck();
    await page.getByRole('button', { name: '保存同行需求', exact: true }).click();
    await page.getByText('同行需求已保存。', { exact: true }).waitFor();
    assert.equal(await page.getByRole('checkbox', { name: /合成乙团/ }).isChecked(), false);
    assert.deepEqual((await read('/races/' + raceId)).sharedClubIds, [clubIds[1]], 'saving a note must not silently save the audience draft');
    await page.getByRole('button', { name: '保存同步范围', exact: true }).click();
    await page.getByText('已设为仅自己可见。', { exact: true }).waitFor();
    await page.locator('.race-plan .statuses').getByRole('button', { name: '已缴费', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.race-plan .plan-status')?.textContent === '已缴费');
  });
  await check('Mine separates followed races from participation plans', async () => {
    await page.locator('.race-follow-row').getByRole('button').click();
    await page.locator('.race-follow-row').getByRole('button', { name: '取消关注合成同行马拉松', exact: true }).waitFor();
    await page.goto(origin + '/marathon/mine', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '我的赛事', exact: true }).click();
    await page.locator('.plan-row').filter({ hasText: '合成同行马拉松' }).waitFor();
    await page.getByRole('button', { name: '关注的比赛 1', exact: true }).click();
    await page.locator('.followed-races .race-card-shell').filter({ hasText: '合成同行马拉松' }).waitFor();
    await page.locator('.followed-races').getByRole('button', { name: '取消关注合成同行马拉松', exact: true }).click();
    await page.getByText('先关注，慢慢选下一场', { exact: true }).waitFor();
    assert.equal((await read('/races/' + raceId)).myStatus, '已缴费');
  });
  await check('Calendar displays personal state separately from event state', async () => {
    await page.goto(origin + '/marathon/calendar', { waitUntil: 'networkidle' });
    await page.locator('.calendar-race-row').filter({ hasText: '合成同行马拉松' }).waitFor();
    assert.ok((await page.locator('.calendar-race-row').filter({ hasText: '合成同行马拉松' }).innerText()).includes('我的状态 · 已缴费'));
  });
  await check('Responsive layouts preserve all controls at 320, 390 and 1440px', async () => {
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(racePath + '?plan=1', { waitUntil: 'networkidle' });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'race detail overflow at ' + width);
      await page.screenshot({ path: path.join(out, 'race-' + width + '.png'), fullPage: true });
      report.views.push('race-' + width + '.png');
      await page.goto(origin + '/marathon/', { waitUntil: 'networkidle' });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'list overflow at ' + width);
      const row = page.locator('.race-card-shell').filter({ hasText: '合成同行马拉松' });
      const overlaps = await row.evaluate(element => { const link = element.querySelector('.body').getBoundingClientRect(), button = element.querySelector('.follow-race').getBoundingClientRect(); return link.right > button.left; });
      assert.equal(overlaps, false, 'follow does not overlap race text at ' + width);
    }
  });
  await check('A pending update cannot duplicate requests or change another event after navigation', async () => {
    await page.goto(racePath + '?plan=1', { waitUntil: 'networkidle' });
    let release, arrived, done, requests = 0;
    const requestArrived = new Promise(resolve => { arrived = resolve; });
    const hold = new Promise(resolve => { release = resolve; });
    const finished = new Promise(resolve => { done = resolve; });
    const delayed = async route => { if (route.request().method() !== 'PUT') return route.continue(); requests++; const response = await route.fetch(); arrived(); await hold; await route.fulfill({ response }); done(); };
    await page.route('**/api/me/races/' + raceId, delayed);
    const stateButton = page.locator('.race-plan .statuses').getByRole('button', { name: '已领物', exact: true });
    await stateButton.click(); await requestArrived;
    assert.equal(await stateButton.isDisabled(), true);
    await stateButton.evaluate(button => button.click());
    assert.equal(requests, 1);
    await page.locator('header.topbar a').first().click();
    await page.locator('.race-card').filter({ hasText: '合成另一场马拉松' }).click();
    await page.waitForURL('**/races/' + otherId);
    release();
    await finished;
    await page.unroute('**/api/me/races/' + raceId, delayed);
    await page.locator('.race-plan .plan-status').filter({ hasText: '未标记' }).waitFor();
    assert.equal((await read('/races/' + otherId)).myStatus, '');
    assert.equal(await page.getByText('已标记为「已领物」', { exact: true }).count(), 0);
  });
  await check('Guest follow returns to the same event after login', async () => {
    const guest = await browser.newContext(); const guestPage = await guest.newPage();
    await guest.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await guestPage.goto(racePath, { waitUntil: 'networkidle' });
    await guestPage.locator('.race-follow-row').getByRole('button').click();
    await guestPage.waitForURL('**/marathon/mine');
    assert.equal(await guestPage.evaluate(() => localStorage.getItem('marathon_return_after_login')), '/races/' + raceId + '?follow=1');
    await guestPage.evaluate(token => localStorage.setItem('marathon_token', token), token);
    await guestPage.goto(racePath + '?follow=1', { waitUntil: 'networkidle' });
    await guestPage.getByText('已关注这场比赛。', { exact: true }).waitFor();
    assert.equal((await read('/races/' + raceId)).following, true);
    await guest.close();
  });
  assert.deepEqual(report.errors, []);
  report.passed = true;
  await context.close();
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
