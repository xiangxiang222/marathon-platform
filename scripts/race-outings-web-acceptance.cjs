'use strict';
// Real Vue/Express flows in a temporary database; production and external traffic are excluded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'race-outings-web-'));
const out = process.env.RACE_OUTINGS_WEB_OUT || path.join(root, 'design/previews/race-outings-20261116/web');
Object.assign(process.env, { NODE_ENV: 'test', PORT: '0', BASE_PATH: '/marathon', MARATHON_DB: path.join(temporary, 'app.sqlite'), MARATHON_MEDIA: path.join(temporary, 'media'), CONTENT_DATA_DIR: path.join(temporary, 'content') });
const exists = fs.existsSync;
fs.existsSync = file => path.resolve(String(file)) === path.join(root, '.env') ? false : exists(file);
let app;
try { ({ app } = require('../server/src/index')); } finally { fs.existsSync = exists; }
const db = require('../server/src/db').getDb();
const report = { checks: [], views: [], errors: [], passed: false };
let server, vite, browser;
async function check(name, run) { await run(); report.checks.push(name); }
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString();
  const future = new Date(Date.now() + 86400000 + 8 * 3600000).toISOString().slice(0, 10);
  const raceDay = new Date(Date.now() + 14 * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
  const token = 'outings-host', buddyToken = 'outings-buddy', soloToken = 'outings-solo';
  const hostId = Number(db.prepare('INSERT INTO users(nickname,token,created_at) VALUES(?,?,?)').run('合成发起人', token, stamp).lastInsertRowid);
  const buddyId = Number(db.prepare('INSERT INTO users(nickname,token,created_at) VALUES(?,?,?)').run('合成同行者', buddyToken, stamp).lastInsertRowid);
  db.prepare('INSERT INTO users(nickname,token,created_at) VALUES(?,?,?)').run('合成独行者', soloToken, stamp);
  const clubIds = ['合成晨光跑团', '合成周末跑团'].map((name, i) => Number(db.prepare('INSERT INTO clubs(name,code,owner_id,created_at) VALUES(?,?,?,?)').run(name, 'OUTINGS-' + i, hostId, stamp).lastInsertRowid));
  for (const clubId of clubIds) db.prepare('INSERT INTO club_members(club_id,user_id,joined_at) VALUES(?,?,?)').run(clubId, hostId, stamp);
  db.prepare('INSERT INTO club_members(club_id,user_id,joined_at) VALUES(?,?,?)').run(clubIds[0], buddyId, stamp);
  const raceId = 'outings-sample', otherId = 'outings-other';
  const deadline = future + 'T18:00:00+08:00';
  for (const [id, name] of [[raceId, '合成城市马拉松'], [otherId, '合成另一场赛事']]) {
    db.prepare('INSERT INTO races(id,name,city,province,distances,race_date,deadline,place,kinds,meet) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, name, '合成城市', '合成地区', 'full', raceDay, deadline, '合成公园', 'road', 'offline');
  }
  server = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); });
  const apiOrigin = 'http://127.0.0.1:' + server.address().port;
  async function api(suffix, method = 'GET', body, auth = token) {
    const response = await fetch(apiOrigin + '/marathon/api' + suffix, { method, headers: { Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.ok(response.ok, suffix + ': ' + response.status + ' ' + (response.ok ? '' : await response.text()));
    return response.json();
  }
  const { createServer } = await import(pathToFileURL(path.join(root, 'web/node_modules/vite/dist/node/index.js')).href);
  vite = await createServer({ root: path.join(root, 'web'), configFile: path.join(root, 'web/vite.config.js'), cacheDir: path.join(temporary, 'vite-cache'), server: { host: '127.0.0.1', port: 0, proxy: { '/marathon/api': apiOrigin } } });
  await vite.listen();
  const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  browser = await chromium.launch({ ...(process.env.CHROME_PATH || process.env.CHROME_BIN ? { executablePath: process.env.CHROME_PATH || process.env.CHROME_BIN } : { channel: 'chrome' }), headless: true });
  async function runner(auth, name) {
    const context = await browser.newContext({ viewport: { width: 390, height: 1100 }, reducedMotion: 'reduce' });
    await context.addInitScript(({ auth, name }) => { localStorage.setItem('marathon_token', auth); localStorage.setItem('marathon_name', name); }, { auth, name });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', error => report.errors.push(error.message));
    return { context, page };
  }
  const host = await runner(token, '合成发起人'), buddy = await runner(buddyToken, '合成同行者');
  const page = host.page, racePath = origin + '/marathon/races/' + raceId;
  await check('Follow-only race produces personal node reminders without a participation plan', async () => {
    await api('/me/races/' + raceId + '/follow', 'PUT', { following: true });
    const mine = await api('/me');
    assert.equal(mine.plans.length, 0);
    assert.ok(mine.reminders.some(item => item.race.id === raceId && item.hit.key === 'deadline'));
    const reminders = await api('/reminders');
    assert.equal(reminders.mine.filter(item => item.race.id === raceId && item.hit.key === 'deadline').length, 1);
    const today = await api('/today');
    assert.equal(today.tasks.filter(item => item.raceId === raceId && item.kind === 'reminder').length, 1);
    await page.goto(origin + '/marathon/mine', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '我的赛事', exact: true }).click();
    await page.getByRole('button', { name: /关注的比赛/ }).click();
    await page.locator('.race-reminders').getByText('合成城市马拉松', { exact: true }).waitFor();
    await api('/me/races/' + raceId, 'PUT', { status: '待抽签' });
    assert.equal((await api('/reminders')).mine.filter(item => item.race.id === raceId && item.hit.key === 'deadline').length, 1);
    await api('/me/races/' + raceId + '/follow', 'PUT', { following: false });
    assert.ok((await api('/me')).reminders.some(item => item.race.id === raceId));
    await api('/me/races/' + raceId, 'DELETE');
    assert.equal((await api('/me')).reminders.some(item => item.race.id === raceId), false);
  });

  // The following browser assertions deliberately use the shipped component's controls.
  await page.goto(racePath, { waitUntil: 'networkidle' });
  await page.locator('#race-outings').waitFor();
  const panel = page.locator('#race-outings');
  async function create(kind, place, capacity = 2, clubId = clubIds[0]) {
    await panel.getByRole('button', { name: '发起安排', exact: true }).click();
    const form = panel.locator('form');
    await form.getByLabel('安排类型', { exact: true }).selectOption(kind);
    await form.getByLabel('所属跑团', { exact: true }).selectOption(String(clubId));
    await form.getByLabel('集合时间（北京时间）', { exact: true }).fill(future + 'T07:00');
    await form.getByLabel('集合地点', { exact: true }).fill(place);
    await form.getByLabel('人数上限（含发起人）', { exact: true }).fill(String(capacity));
    await form.getByLabel('补充说明', { exact: true }).fill('仅为自动验收创建的合成安排');
    await form.getByRole('button', { name: '发布安排', exact: true }).click();
    await panel.locator('.outing-card').filter({ hasText: place }).waitFor();
    return (await api('/races/' + raceId + '/outings')).outings.find(item => item.place === place);
  }
  let carpool;
  await check('Explicit carpool creation persists with one host seat and no implicit plan or activity signup', async () => {
    carpool = await create('carpool', '合成公园东门');
    assert.equal(carpool.memberCount, 1); assert.equal(carpool.remaining, 1); assert.equal(carpool.joined, true);
    assert.equal(carpool.host.userId, hostId);
    const mine = await api('/me'); assert.equal(mine.plans.length, 0); assert.equal(mine.followedRaces.length, 0);
    for (const table of ['plan_club_shares', 'activity_signups', 'meetup_joins']) assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ' + table + ' WHERE user_id=?').get(hostId).n, 0);
    await page.reload({ waitUntil: 'networkidle' });
    await panel.locator('.outing-card').filter({ hasText: '合成公园东门' }).waitFor();
  });
  await check('Only explicit joins take a seat; leaving releases it without changing participation or sharing', async () => {
    await buddy.page.goto(racePath, { waitUntil: 'networkidle' });
    const card = buddy.page.locator('.outing-card').filter({ hasText: '合成公园东门' });
    await card.getByRole('button', { name: '加入安排', exact: true }).click();
    await card.getByRole('button', { name: '退出安排', exact: true }).waitFor();
    const joined = (await api('/races/' + raceId + '/outings', 'GET', undefined, buddyToken)).outings.find(item => item.id === carpool.id);
    assert.equal(joined.memberCount, 2); assert.equal(joined.remaining, 0); assert.equal(joined.joined, true);
    assert.equal((await api('/me', 'GET', undefined, buddyToken)).plans.length, 0);
    await card.getByRole('button', { name: '退出安排', exact: true }).click();
    await card.getByRole('button', { name: '加入安排', exact: true }).waitFor();
    assert.equal((await api('/races/' + raceId + '/outings')).outings.find(item => item.id === carpool.id).remaining, 1);
  });
  await check('Failed membership request preserves state and offers a usable retry', async () => {
    const card = buddy.page.locator('.outing-card').filter({ hasText: '合成公园东门' });
    const pattern = '**/api/races/' + raceId + '/outings/' + carpool.id + '/membership';
    await buddy.page.route(pattern, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '合成网络错误，请重试' }) }));
    await card.getByRole('button', { name: '加入安排', exact: true }).click();
    await buddy.page.getByText('合成网络错误，请重试', { exact: true }).waitFor();
    assert.equal(await card.getByRole('button', { name: '加入安排', exact: true }).isEnabled(), true);
    await buddy.page.unroute(pattern);
    await card.getByRole('button', { name: '加入安排', exact: true }).click();
    await card.getByRole('button', { name: '退出安排', exact: true }).waitFor();
  });
  await check('Gathering and pickup are stored separately for the current race and selected club', async () => {
    await create('gather', '合成起点集合区', 20);
    await create('pickup', '合成领物大厅', 8, clubIds[1]);
    const all = (await api('/races/' + raceId + '/outings')).outings;
    assert.deepEqual(new Set(all.map(item => item.kind)), new Set(['carpool', 'gather', 'pickup']));
    assert.equal((await api('/races/' + otherId + '/outings')).outings.length, 0);
    assert.equal((await api('/races/' + raceId + '/outings', 'GET', undefined, buddyToken)).outings.some(item => item.clubId === clubIds[1]), false);
    await page.goto(racePath + '?clubId=' + clubIds[1] + '#race-outings', { waitUntil: 'networkidle' });
    await panel.locator('.outing-card').filter({ hasText: '合成领物大厅' }).waitFor();
    assert.equal(await panel.locator('.outing-card').count(), 1);
    const anchor = await panel.evaluate(element => ({ top: element.getBoundingClientRect().top, heading: element.querySelector('h2').getBoundingClientRect().top }));
    assert.ok(anchor.top >= 60 && anchor.top <= 90, 'Club entry must scroll to the arrangements below the fixed header: ' + JSON.stringify(anchor));
  });
  await check('Redesigned cards and creation form remain usable at 320, 390 and 1440px', async () => {
    await page.goto(racePath, { waitUntil: 'networkidle' });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await panel.getByRole('button', { name: '发起安排', exact: true }).click();
      const metrics = await panel.evaluate(area => {
        const visible = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 1 && r.height > 1 && s.display !== 'none' && s.visibility !== 'hidden'; };
        const controls = [...area.querySelectorAll('button,input,select,textarea,a[href]')].filter(visible).map(e => ({ label: e.getAttribute('aria-label') || e.textContent.trim().slice(0, 35), width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height }));
        const smallText = [], walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) { const node = walker.currentNode, element = node.parentElement; if (node.textContent.trim() && visible(element) && parseFloat(getComputedStyle(element).fontSize) < 12) smallText.push(node.textContent.trim().slice(0, 50)); }
        return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, smallControls: controls.filter(c => c.width < 43.5 || c.height < 43.5), smallText };
      });
      assert.ok(metrics.scrollWidth <= width, 'Horizontal overflow at ' + width);
      assert.deepEqual(metrics.smallControls, [], 'Small controls at ' + width);
      assert.deepEqual(metrics.smallText, [], 'Visible text below 12px at ' + width);
      await panel.getByRole('combobox', { name: '按跑团筛选' }).focus();
      await page.keyboard.press('Tab');
      const focusButton = panel.getByRole('button', { name: '收起安排表单', exact: true });
      const focus = await focusButton.evaluate(button => ({ focused: document.activeElement === button, outline: getComputedStyle(button).outlineStyle, width: parseFloat(getComputedStyle(button).outlineWidth) }));
      assert.ok(focus.focused && focus.outline !== 'none' && focus.width >= 2, 'Keyboard focus must remain visible at ' + width);
      await focusButton.evaluate(button => button.blur());
      await panel.scrollIntoViewIfNeeded();
      const filename = 'race-outings-form-' + width + '.png';
      await page.screenshot({ path: path.join(out, filename), fullPage: true });
      report.views.push({ screenshot: filename, ...metrics });
      await panel.getByRole('button', { name: '收起安排表单', exact: true }).click();
    }
  });
  await check('Cancellation requires an explicit confirmation and does not remove personal plans', async () => {
    const card = panel.locator('.outing-card').filter({ hasText: '合成公园东门' });
    page.once('dialog', dialog => dialog.dismiss());
    await card.getByRole('button', { name: '取消安排', exact: true }).click();
    assert.ok((await api('/races/' + raceId + '/outings')).outings.some(item => item.id === carpool.id));
    page.once('dialog', dialog => dialog.accept());
    await card.getByRole('button', { name: '取消安排', exact: true }).click();
    await card.waitFor({ state: 'detached' });
    assert.equal((await api('/races/' + raceId + '/outings')).outings.some(item => item.id === carpool.id), false);
    assert.equal((await api('/me')).plans.length, 0);
  });

  await check('Arrangement loading can fail and retry independently while race facts and participation remain usable', async () => {
    const retryPage = buddy.page, pattern = '**/api/races/' + raceId + '/outings';
    await retryPage.route(pattern, intercepted => intercepted.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '合成同行安排加载失败' }) }));
    await retryPage.goto(racePath, { waitUntil: 'networkidle' });
    const retryPanel = retryPage.locator('#race-outings');
    await retryPanel.getByText('合成同行安排加载失败', { exact: true }).waitFor();
    await retryPage.getByRole('heading', { name: '合成城市马拉松', exact: true }).waitFor();
    assert.equal(await retryPage.locator('.race-plan .plan-action').isEnabled(), true);
    await retryPanel.screenshot({ path: path.join(out, 'race-outings-load-error-390.png') });
    report.views.push({ screenshot: 'race-outings-load-error-390.png', state: 'independent-loading-error', width: 390 });
    await retryPage.unroute(pattern);
    await retryPanel.getByRole('button', { name: '重新加载同行安排', exact: true }).click();
    await retryPanel.locator('.outing-card').filter({ hasText: '合成起点集合区' }).waitFor();
    assert.equal(await retryPanel.getByText('合成同行安排加载失败', { exact: true }).count(), 0);
  });
  await check('Guests and runners without clubs receive clear entry states without exposing arrangements', async () => {
    const guest = await runner('', ''), solo = await runner(soloToken, '合成独行者');
    let guestOutingRequests = 0;
    guest.page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/outings')) guestOutingRequests++; });
    await guest.page.goto(racePath + '?clubId=' + clubIds[0], { waitUntil: 'networkidle' });
    const guestPanel = guest.page.locator('#race-outings');
    await guestPanel.getByRole('button', { name: '登录查看同行安排', exact: true }).waitFor();
    assert.equal(await guestPanel.locator('.outing-card, .outing-form').count(), 0);
    assert.equal(guestOutingRequests, 0);
    await guestPanel.screenshot({ path: path.join(out, 'race-outings-guest-390.png') });
    report.views.push({ screenshot: 'race-outings-guest-390.png', state: 'guest', width: 390 });
    await guestPanel.getByRole('button', { name: '登录查看同行安排', exact: true }).click();
    await guest.page.waitForURL('**/mine');
    assert.equal(await guest.page.evaluate(() => localStorage.getItem('marathon_return_after_login')), '/races/' + raceId + '?clubId=' + clubIds[0] + '#race-outings');
    await solo.page.goto(racePath, { waitUntil: 'networkidle' });
    const soloPanel = solo.page.locator('#race-outings');
    await soloPanel.getByText('先找到你的跑团', { exact: true }).waitFor();
    const discover = soloPanel.getByRole('link', { name: /发现跑团/ });
    assert.ok((await discover.getAttribute('href')).endsWith('/clubs'));
    assert.equal(await soloPanel.locator('.outing-card, .outing-form').count(), 0);
    await soloPanel.screenshot({ path: path.join(out, 'race-outings-no-club-390.png') });
    report.views.push({ screenshot: 'race-outings-no-club-390.png', state: 'no-club', width: 390 });
    await guest.context.close(); await solo.context.close();
  });

  async function delayedOutingPage() {
    const runnerPage = await runner(token, '合成发起人');
    let resolveArrival, release, first = true, responseFinished;
    const arrived = new Promise(resolve => { resolveArrival = resolve; });
    const released = new Promise(resolve => { release = resolve; });
    const finished = new Promise(resolve => { responseFinished = resolve; });
    const pattern = '**/api/races/' + raceId + '/outings';
    await runnerPage.page.route(pattern, async intercepted => {
      if (!first) return intercepted.continue();
      first = false;
      const response = await intercepted.fetch();
      resolveArrival(); await released;
      try { await intercepted.fulfill({ response }); } finally { responseFinished(); }
    });
    await runnerPage.page.goto(racePath, { waitUntil: 'domcontentloaded' });
    await arrived;
    return { ...runnerPage, release, finished };
  }
  async function nextPaint(targetPage) { await targetPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
  await check('A late arrangements response cannot leak into a different race after SPA navigation', async () => {
    const delayed = await delayedOutingPage();
    try {
      await delayed.page.evaluate(id => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/races/' + id), otherId);
      await delayed.page.getByRole('heading', { name: '合成另一场赛事', exact: true }).waitFor();
      const currentPanel = delayed.page.locator('#race-outings');
      await currentPanel.getByText('第一份同行约定，等你发起', { exact: true }).waitFor();
      delayed.release(); await delayed.finished; await nextPaint(delayed.page);
      assert.equal(await currentPanel.locator('.outing-card').count(), 0);
      assert.equal(await delayed.page.getByText('合成领物大厅', { exact: true }).count(), 0);
    } finally { delayed.release(); await delayed.context.close(); }
  });
  await check('A late response from the previous account cannot reveal its private club arrangements', async () => {
    const delayed = await delayedOutingPage();
    try {
      await delayed.page.evaluate(auth => { localStorage.setItem('marathon_token', auth); window.dispatchEvent(new Event('focus')); }, buddyToken);
      const currentPanel = delayed.page.locator('#race-outings');
      await currentPanel.locator('.outing-card').filter({ hasText: '合成起点集合区' }).waitFor();
      assert.equal(await currentPanel.locator('.outing-card').filter({ hasText: '合成领物大厅' }).count(), 0);
      delayed.release(); await delayed.finished; await nextPaint(delayed.page);
      assert.equal(await currentPanel.locator('.outing-card').filter({ hasText: '合成领物大厅' }).count(), 0);
      assert.equal(await currentPanel.locator('.outing-card').count(), 1);
      const clubs = await currentPanel.getByRole('combobox', { name: '按跑团筛选' }).locator('option').allTextContents();
      assert.deepEqual(clubs, ['全部跑团', '合成晨光跑团']);
    } finally { delayed.release(); await delayed.context.close(); }
  });
  assert.deepEqual(report.errors, []); report.passed = true;
  await host.context.close(); await buddy.context.close();
}
main().catch(error => { report.error = error.stack; process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (vite) await vite.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close(); fs.rmSync(temporary, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
