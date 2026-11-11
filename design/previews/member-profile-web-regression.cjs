'use strict';
// Actual Vue routes; all business API/media requests are intercepted in memory.
// Uses synthetic illustrations and inert auth strings, never production data.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { spawn } = require('node:child_process'), { chromium } = require('playwright-core');
const f = require('./club-mileage-test-fixture.cjs'), legal = require('../../shared/legal-documents.json');
const out = path.resolve(process.env.MEMBER_PROFILE_OUT || path.join(__dirname, 'member-profile-20261111/independent-web'));
const base = (process.env.MEMBER_PROFILE_URL || 'http://127.0.0.1:5193/marathon').replace(/\/$/, '');
fs.mkdirSync(out, { recursive: true });
const report = { kind: 'Independent real Vue / isolated API and media; New York timezone / Beijing fixture clock', checks: [], screenshots: [], errors: [], unexpected: [] };
let server, browser;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready() { try { return (await fetch(base + '/')).ok; } catch { return false; } }
async function check(width, name, fn) { await fn(); report.checks.push({ width, name, passed: true }); }
async function capture(page, name, width) { await page.evaluate(() => window.scrollTo(0, 0)); const file = name + '-' + width + '.png'; await page.screenshot({ path: path.join(out, file), fullPage: true }); report.screenshots.push(file); }
async function overflow(page) { const box = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth })); assert.ok(box.document <= box.width + 1, JSON.stringify(box)); }
function sharedProfile(uid, query, state) {
  const p = f.profileFixture(uid, query, state); if (!p) return null;
  p.user.roleLabel = uid === 1 ? '团长' : '成员';
  const races = [
    { id: 'wish', name: '【模拟】城市迎春跑', raceDate: '2027-03-15', status: '想跑' },
    { id: 'drawn', name: '【模拟】湖畔冬日半程', raceDate: '2027-01-20', status: '中签' },
    ...['full', 'half', '10k', '5k'].map((distance, i) => ({ id: 'past-' + distance, name: ['【模拟】春日城市马拉松', '【模拟】湖畔初夏半程跑', '【模拟】滨江十公里挑战', '【模拟】秋日公园五公里'][i], raceDate: ['2026-03-15', '2026-05-15', '2026-09-02', '2026-11-04'][i], status: '完赛', distance }))
  ];
  const distances = { full: '全程马拉松', half: '半程马拉松', '10k': '10 公里', '5k': '5 公里' }, clocks = ['03:28:59', '01:38:36', '00:44:12', '00:20:55'];
  const results = races.filter(r => r.distance).map((r, i) => ({ id: r.id + ':' + r.distance, raceId: r.id, name: r.name, raceDate: r.raceDate, race: { ...r, city: '杭州', province: '浙江', kind: 'road', meet: 'offline' }, distance: r.distance, distanceLabel: distances[r.distance], seconds: 12000 - i * 3000, clock: clocks[i], pace: '5:00', status: 'finished', pb: true }));
  const albums = [{ id: 901, title: '【模拟】周末公园训练时光', date: '2026-11-08', photoCount: 4, videoCount: 0, coverId: 1901, items: ['park', 'track', 'trail', 'medal'].map((variant, i) => ({ id: 1901 + i, kind: 'photo', type: 'photo', variant, url: '/ignored-untrusted-media-url' })) }];
  const empty = state.empty;
  Object.assign(p, { races: empty ? [] : races.map(r => ({ race: { ...r, city: '杭州', province: '浙江', kind: 'road', meet: 'offline' }, raceId: r.id, status: r.status, hasResult: !!r.distance, results: results.filter(x => x.raceId === r.id) })), results: empty ? [] : results, albums: empty ? [] : albums, pbs: empty ? [] : results,
    summary: { raceCount: empty ? 0 : 6, upcomingRaceCount: empty ? 0 : 1, finishedRaceCount: empty ? 0 : 4, resultCount: empty ? 0 : 4, photoCount: empty ? 0 : 4, videoCount: 0, pb: empty ? [] : results } });
  if (empty) { p.group = null; p.user.groupName = ''; p.recentRuns = []; for (const r of Object.values(p.mileage)) Object.assign(r, { km: 0, times: 0, days: 0, durationSec: 0, paceLabel: '' }); Object.assign(p.stats, { km: 0, times: 0, days: 0, durationSec: 0, paceLabel: '' }); }
  return p;
}
async function setup(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'America/New_York' });
  await context.addInitScript(now => { Date.now = () => now; localStorage.setItem('marathon_token', 'member-fixture-a'); }, f.now);
  const page = await context.newPage(), state = { members: f.copy(f.members), groups: f.copy(f.groups), staff: true, requests: [], media: [], empty: false, error: false, hold: false };
  page.on('pageerror', error => report.errors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.startsWith('/marathon/api/')) return url.origin === new URL(base).origin ? route.continue() : route.abort();
    const endpoint = url.pathname.slice('/marathon/api'.length), query = Object.fromEntries(url.searchParams), method = request.method();
    const account = request.headers().authorization === 'Bearer member-fixture-a' ? 'a' : request.headers().authorization === 'Bearer member-fixture-b' ? 'b' : 'none';
    const send = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (endpoint.startsWith('/media/')) {
      const id = Number(endpoint.split('/').at(-1)), authed = query.t === 'member-fixture-a'; state.media.push({ id, authenticated: authed });
      if (!authed) return send({ error: '请先登录' }, 401);
      return route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(f.ROOT, 'scripts/fixtures/member-art', ['park', 'track', 'trail', 'medal'][id - 1901] + '.png')) });
    }
    state.requests.push({ endpoint, query, method, account });
    if (endpoint === '/legal') return send(legal);
    if (endpoint === '/me') return send({ user: { id: account === 'b' ? 99 : 1, nickname: '模拟验收账号' }, clubs: [{ id: 44, name: '晨光跑团', roleLabel: '成员' }] });
    if (endpoint === '/me/feedback/summary') return send({ total: 0, unread: 0 });
    const match = /^\/clubs\/44(.*)$/.exec(endpoint);
    if (match) {
      const suffix = match[1];
      if (!suffix) return send(f.clubFixture(44, state));
      if (suffix === '/fees') return send({ current: null, history: [] });
      if (suffix === '/calls') return send({ calls: [] });
      if (suffix === '/meetups') return send({ meetups: [], tiers: [] });
      if (suffix === '/internals') return send({ races: [] });
      if (suffix === '/posts') return send({ posts: [] });
      if (suffix === '/albums') return send({ albums: [] });
      if (suffix === '/attendance') return send({ rows: [], me: { count: 0, placeLabel: '未上榜' } });
      if (/^\/members\/\d+\/profile$/.test(suffix)) {
        if (account !== 'a') return send({ error: '当前账号无法查看该跑团成员' }, 403);
        const profile = sharedProfile(Number(suffix.split('/')[2]), query, state);
        if (state.hold) { const held = f.deferred(); state.release = () => held.resolve(); await held.promise; }
        return state.error ? send({ error: '成员已不在跑团' }, 404) : send(profile);
      }
      if (suffix === '/mileage/board') return send(f.boardFixture(query, state));
      if (suffix === '/mileage') return send({ rank: [], groups: [], feed: [], members: state.members.length, staff: true, owner: false });
      if (suffix === '/mileage/report') return send({ title: '历史' + ({ week: '周', month: '月', year: '年' }[query.kind]) + '报', rows: state.members.slice(0, 3).map(u => ({ userId: u.id, nickname: u.nickname, km: 42.5, dayText: '4 / 5', durationLabel: '04:15:00', paceLabel: '6:00', flag: '已达标' })), total: { km: 127.5, dayText: '12 / 15', durationLabel: '12:45:00' } });
    }
    report.unexpected.push({ endpoint, method }); return send({ error: 'Unmocked API' }, 500);
  });
  return { context, page, state };
}
async function run() {
  if (!await ready()) {
    assert.ok(!process.env.MEMBER_PROFILE_URL, 'Configured preview must already be running');
    server = spawn(process.execPath, [path.join(f.ROOT, 'web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', new URL(base).port, '--strictPort'], { cwd: path.join(f.ROOT, 'web'), stdio: 'ignore' });
    for (let i = 0; i < 60 && !await ready(); i++) await delay(100); assert.ok(await ready());
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
  for (const width of [320, 390]) {
    const { context, page, state } = await setup(width), profilePath = '/clubs/44/members/2?range=month&date=2026-11-11';
    await check(width, 'default information; five complete tabs; other member cannot edit introduction', async () => {
      await page.goto(base + profilePath); await page.locator('.profile-tabs').waitFor();
      assert.deepEqual(await page.locator('.profile-tabs button').allTextContents(), ['资料', '跑量', '赛事', '成绩', '相册']);
      assert.equal(await page.locator('.profile-tabs [aria-current="page"]').innerText(), '资料');
      assert.equal(await page.getByRole('button', { name: /编辑介绍|写下介绍/ }).count(), 0);
      await overflow(page); await capture(page, 'info', width);
    });
    await check(width, 'five mileage periods, explicit profileTab refresh, no private runner endpoint', async () => {
      await page.getByRole('navigation', { name: '跑者主页栏目' }).getByRole('button', { name: '跑量', exact: true }).click();
      for (const label of ['日', '周', '月', '年', '累计']) {
        await page.getByRole('navigation', { name: '成员跑量时间范围' }).getByRole('button', { name: label, exact: true }).click();
        await page.waitForLoadState('networkidle');
        assert.equal(await page.getByRole('navigation', { name: '成员跑量时间范围' }).getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed'), 'true');
      }
      await page.reload(); await page.locator('.personal-volume').waitFor(); assert.match(page.url(), /profileTab=mileage/); assert.match(await page.locator('.personal-volume').innerText(), /累计跑量/);
      assert.equal(state.requests.filter(r => r.endpoint.includes('/me/runner')).length, 0); await overflow(page); await capture(page, 'mileage', width);
    });
    await check(width, 'public races filter wanted/upcoming/finished with meaningful dates', async () => {
      await page.getByRole('navigation', { name: '跑者主页栏目' }).getByRole('button', { name: '赛事', exact: true }).click();
      assert.equal(await page.locator('.profile-race-card').count(), 6);
      const filters = page.getByRole('navigation', { name: '成员赛事筛选' });
      for (const [label, count] of [['想跑', 1], ['待参赛', 1], ['已完赛', 4], ['全部', 6]]) {
        await filters.getByRole('button', { name: label, exact: true }).click(); assert.equal(await page.locator('.profile-race-card').count(), count);
        if (label === '想跑') assert.match(await page.locator('.profile-race-card').innerText(), /想跑/);
        if (label === '待参赛') { assert.match(await page.locator('.profile-race-card').innerText(), /中签/); assert.doesNotMatch(await page.locator('.profile-race-card').innerText(), /想跑/); }
      }
      await overflow(page); await capture(page, 'races', width);
    });
    await check(width, 'four PB clocks and project filter remain readable at 320px', async () => {
      await page.getByRole('navigation', { name: '跑者主页栏目' }).getByRole('button', { name: '成绩', exact: true }).click();
      assert.equal(await page.locator('.pb-card').count(), 4); assert.equal(await page.locator('.result-row').count(), 4);
      await page.getByLabel('筛选成绩项目').selectOption('half'); assert.equal(await page.locator('.result-row').count(), 1); await page.getByLabel('筛选成绩项目').selectOption('');
      assert.match(await page.locator('.pb-card').first().innerText(), /03:28:59/); await overflow(page); await capture(page, 'results', width);
    });
    await check(width, 'album uses authenticated real-size synthetic photos; preview keyboard navigation and focus restoration', async () => {
      await page.getByRole('navigation', { name: '跑者主页栏目' }).getByRole('button', { name: '相册', exact: true }).click();
      await page.locator('.album-tile img').first().waitFor(); await page.locator('.album-tile').last().scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.querySelectorAll('.album-tile img')].every(i => i.complete && i.naturalWidth === 960));
      assert.ok(state.media.length >= 4 && state.media.every(m => m.authenticated));
      await overflow(page); await capture(page, 'album', width);
      const trigger = page.locator('.album-tile').first(); await trigger.click(); const dialog = page.getByRole('dialog', { name: '团内影像预览' }); await dialog.waitFor();
      await page.keyboard.press('ArrowRight'); assert.match(await dialog.innerText(), /2 \/ 4/); await page.keyboard.press('ArrowLeft'); assert.match(await dialog.innerText(), /1 \/ 4/);
      await capture(page, 'album-preview', width); await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      assert.equal(await trigger.evaluate(e => document.activeElement === e), true);
      assert.equal(await page.evaluate(async () => (await fetch('/marathon/api/media/1901')).status), 401);
    });
    await check(width, 'ranking return context preserves historical period/group/search', async () => {
      await page.goto(base + '/clubs/44?tab=km&range=week&date=2026-11-11&groupId=701&q=' + encodeURIComponent('河畔'));
      const row = page.locator('.rank-row').filter({ hasText: '河畔领跑员' }); await row.waitFor(); await row.click(); await page.locator('.personal-volume').waitFor();
      const query = new URL(page.url()).searchParams; assert.equal(query.get('profileTab'), 'mileage'); assert.equal(query.get('range'), 'week');
      const returnTo = new URL(query.get('returnTo'), 'https://fixture.invalid'); for (const [k, v] of [['range', 'week'], ['date', '2026-11-11'], ['groupId', '701'], ['q', '河畔']]) assert.equal(returnTo.searchParams.get(k), v);
      await page.getByRole('link', { name: '返回跑量看板' }).click(); await page.locator('.volume-number').waitFor(); assert.equal(await page.getByLabel('搜索跑量排行榜成员').inputValue(), '河畔');
    });
    await check(width, 'historical week/month/year report names open member mileage and preserve report return context', async () => {
      for (const kind of ['week', 'month', 'year']) {
        await page.goto(base + '/clubs/44?tab=km&range=month&date=2026-08-15&groupId=701&q=' + encodeURIComponent('河畔') + '&tools=1&report=' + kind);
        const row = page.locator('.report-member-link').filter({ hasText: '河畔领跑员' }); await row.waitFor();
        const href = new URL(await row.getAttribute('href'), base); assert.equal(href.searchParams.get('range'), kind); assert.equal(href.searchParams.get('date'), '2026-08-15'); assert.equal(href.searchParams.get('profileTab'), 'mileage');
        const savedContext = new URL(href.searchParams.get('returnTo'), 'https://fixture.invalid');
        for (const [key, value] of [['range', 'month'], ['date', '2026-08-15'], ['groupId', '701'], ['q', '河畔'], ['tools', '1'], ['report', kind]]) assert.equal(savedContext.searchParams.get(key), value);
        await row.click(); await page.locator('.personal-volume').waitFor(); assert.equal(state.requests.filter(r => /\/members\/2\/profile$/.test(r.endpoint)).at(-1).query.range, kind);
        await page.getByRole('link', { name: '返回跑量看板' }).click(); await page.locator('.report-member-link').first().waitFor(); const returned = new URL(page.url()).searchParams; assert.equal(returned.get('report'), kind); assert.equal(returned.get('tools'), '1');
      }
      await overflow(page); await capture(page, 'history-report', width);
    });
    await check(width, 'empty races/results/albums/mileage have intentional content; no broken images', async () => {
      state.empty = true; await page.goto(base + profilePath); await page.locator('.profile-tabs').waitFor();
      for (const [label, text] of [['跑量', '这个周期，等待下一次出发'], ['赛事', '新的赛道，值得期待'], ['成绩', '每一份努力，值得记录'], ['相册', '把一起跑的日子，留在这里']]) {
        await page.getByRole('navigation', { name: '跑者主页栏目' }).getByRole('button', { name: label, exact: true }).click(); await page.getByText(text, { exact: true }).waitFor(); await overflow(page);
      }
      await capture(page, 'empty-album', width); state.empty = false;
    });
    await check(width, 'untrusted returnTo cannot send member navigation outside this club', async () => {
      await page.goto(base + profilePath + '&returnTo=' + encodeURIComponent('//untrusted.invalid/redirect'));
      await page.locator('.profile-tabs').waitFor();
      assert.equal(await page.getByRole('link', { name: '返回跑团', exact: true }).getAttribute('href'), '/marathon/clubs/44');
    });
    await check(width, 'error retry; old account response cannot reveal profile after account switch', async () => {
      state.error = true; await page.goto(base + profilePath); await page.getByRole('heading', { name: '暂时无法查看' }).waitFor(); await capture(page, 'error', width);
      state.error = false; await page.getByRole('button', { name: '重新加载', exact: true }).click(); await page.locator('.profile-tabs').waitFor();
      state.hold = true; await page.goto(base + profilePath, { waitUntil: 'domcontentloaded' }); for (let i = 0; i < 100 && !state.release; i++) await delay(10); assert.equal(typeof state.release, 'function');
      state.hold = false; await page.evaluate(() => { localStorage.setItem('marathon_token', 'member-fixture-b'); window.dispatchEvent(new Event('focus')); });
      await page.getByRole('heading', { name: '暂时无法查看' }).waitFor(); state.release(); await page.waitForLoadState('networkidle'); assert.equal(await page.locator('.profile-tabs').count(), 0); assert.equal(await page.getByRole('heading', { name: '河畔领跑员' }).count(), 0); await overflow(page);
    });
    await context.close();
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.unexpected, []); report.passed = true;
}
run().catch(error => { report.passed = false; report.failure = error.stack; process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (server) server.kill();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); process.stdout.write(JSON.stringify({ passed: report.passed, checks: report.checks.length, screenshots: report.screenshots.length, errors: report.errors.length, unexpected: report.unexpected.length, failure: report.failure, report: path.join(out, 'report.json') }) + '\n');
});
