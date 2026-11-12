'use strict';
/* Real HTTP and built Vue acceptance for account experience seeding.
 * Always creates and removes a temporary SQLite/media tree. Never loads .env,
 * targets an external host, or persists credentials in reports. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'design/previews/account-experiences-20261112');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-account-experience-'));
Object.assign(process.env, { NODE_ENV: 'test', BASE_PATH: '/marathon', PORT: '0', MARATHON_DB: path.join(temporary, 'app.sqlite'), MARATHON_MEDIA: path.join(temporary, 'media'), ADMIN_TOKEN: crypto.randomBytes(32).toString('hex') });
const exists = fs.existsSync;
fs.existsSync = file => path.resolve(String(file)) === path.join(ROOT, '.env') ? false : exists(file);
let app;
try { ({ app } = require('../server/src/index')); } finally { fs.existsSync = exists; }
const { getDb } = require('../server/src/db');
const db = getDb();
const report = { startedAt: new Date().toISOString(), isolation: 'Temporary SQLite/media, ephemeral localhost HTTP, built web/dist, .env hidden, browser external requests blocked; no production writes.', checks: [], views: [], errors: [], accounts: [], limitations: ['Browser checks use desktop Chromium mobile viewports, not WeChat devices.', 'Homepage is the public race catalogue; account-specific data is checked on private pages and authenticated APIs.'] };
const TABLES = ['users', 'races', 'clubs', 'club_members', 'plans', 'results', 'activities', 'activity_signups', 'runs', 'mileage_counts', 'race_history_entries'];
const rowCounts = () => Object.fromEntries(TABLES.map(name => [name, db.prepare('SELECT COUNT(*) AS n FROM ' + name).get().n]));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
let server, browser, origin, base;
async function api(method, suffix, actor, body, expected = 200) {
  assert.ok(suffix.startsWith('/') && !suffix.includes('://'), 'Only local relative API paths are accepted');
  const options = { method, headers: {}, signal: AbortSignal.timeout(15000) };
  if (actor) options.headers.Authorization = 'Bearer ' + actor.token;
  if (body != null) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  const response = await fetch(origin + '/marathon/api' + suffix, options);
  const data = await response.json().catch(() => ({}));
  assert.equal(response.status, expected, method + ' ' + suffix + ': HTTP ' + response.status + (data.error ? ' ' + data.error : ''));
  return data;
}
async function check(name, fn) { await fn(); report.checks.push({ name, passed: true }); console.log('PASS ' + name); }
function ownedRunIds(userId) { return db.prepare('SELECT id FROM runs WHERE user_id=? ORDER BY id').all(userId).map(row => row.id); }
async function readAccount(actor) {
  const month = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7);
  const [me, runs, runner, history] = await Promise.all([
    api('GET', '/me', actor), api('GET', '/runs?month=' + month, actor), api('GET', '/me/runner?period=all', actor), api('GET', '/me/race-history', actor)
  ]);
  assert.equal(me.user.id, actor.id); assert.equal(me.user.nickname, actor.nickname);
  assert.ok(me.plans.length, 'Each account has a personal race plan');
  assert.ok(me.results.length, 'Each account has a personal race result');
  assert.ok(me.clubs.length, 'Each account has a club membership');
  assert.ok(runs.runs.length && runs.month.km > 0, 'Current month has personal training records');
  assert.ok(runner.overview.totalCount > 0 && runner.overview.totalKm > 0, 'Runner statistics use personal runs');
  assert.ok(history.entries.length, 'Personal race history is visible');
  const runIds = new Set(ownedRunIds(actor.id));
  assert.ok(runs.runs.every(run => runIds.has(run.id)), 'Run API never includes another account');
  const plans = db.prepare('SELECT race_id FROM plans WHERE user_id=?').all(actor.id).map(row => row.race_id).sort();
  assert.deepEqual(me.plans.map(row => row.race.id).sort(), plans, 'Plans belong to current account');
  const memberships = db.prepare('SELECT club_id FROM club_members WHERE user_id=?').all(actor.id).map(row => row.club_id).sort((a, b) => a - b);
  assert.deepEqual(me.clubs.map(row => row.id).sort((a, b) => a - b), memberships, 'Membership API matches account');
  const ownHistory = db.prepare('SELECT id FROM race_history_entries WHERE user_id=? AND deleted=0').all(actor.id).map(row => 'exp:' + row.id);
  for (const entry of history.entries.filter(row => row.id.startsWith('exp:'))) assert.ok(ownHistory.includes(entry.id), 'Private history is scoped to owner');
  const joinedActivities = [];
  for (const club of me.clubs) {
    const detail = await api('GET', '/clubs/' + club.id, actor);
    assert.ok(detail.members.some(row => row.id === actor.id), 'Club page contains current member');
    for (const activity of detail.activities || []) {
      const detailActivity = await api('GET', '/clubs/' + club.id + '/activities/' + activity.id, actor);
      if (detailActivity.signups.some(row => row.userId === actor.id && row.mine)) {
        assert.equal(detailActivity.viewerName, actor.nickname);
        assert.equal(detailActivity.activity.mine.signed, true);
        joinedActivities.push({ clubId: club.id, activityId: activity.id, title: activity.title });
      }
    }
  }
  assert.ok(joinedActivities.length, 'Each account has a visible personal training signup');
  report.accounts.push({ plans: me.plans.length, results: me.results.length, clubs: me.clubs.length, monthRuns: runs.runs.length, monthKm: runs.month.km, totalRuns: runner.overview.totalCount, histories: history.entries.length, signedActivities: joinedActivities.length });
  return { actor, me, runs, runner, history, joinedActivities };
}
async function context(actor, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
  await ctx.route('**/*', route => /^(https?:\/\/(127\.0\.0\.1|localhost)(:|\/)|data:|blob:)/.test(route.request().url()) ? route.continue() : route.abort());
  await ctx.addInitScript(({ token, nickname }) => { localStorage.setItem('marathon_token', token); localStorage.setItem('marathon_name', nickname); }, { token: actor.token, nickname: actor.nickname });
  const page = await ctx.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push({ kind: 'browser', message: error.message }));
  page.on('response', response => { if (response.url().includes('/api/') && response.status() >= 500) report.errors.push({ kind: 'HTTP', pathname: new URL(response.url()).pathname, status: response.status() }); });
  return { ctx, page };
}
async function snapshot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const size = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth }));
  assert.ok(size.scrollWidth <= size.width + 1 && size.bodyWidth <= size.width + 1, name + ' page has horizontal overflow: ' + JSON.stringify(size));
  const filename = name + '-' + size.width + '.png';
  await page.screenshot({ path: path.join(OUT, filename), fullPage: true }); report.views.push({ name, ...size, screenshot: filename });
}
async function main() {
  assert.ok(fs.existsSync(path.join(ROOT, 'web/dist/index.html')), 'Build web/dist before acceptance');
  const seedPath = path.join(ROOT, 'scripts/seed-account-experiences.cjs');
  assert.ok(fs.existsSync(seedPath), 'The account experience seed implementation must be available');
  const { seed } = require(seedPath); assert.equal(typeof seed, 'function');
  server = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); });
  origin = 'http://127.0.0.1:' + server.address().port; base = origin + '/marathon';
  const actors = [], version = require('../shared/legal-documents.json').version;
  for (const nickname of ['体验验收晨光', '体验验收湖畔', '体验验收山径', '体验验收原有记录']) {
    const registered = await api('POST', '/auth/register', null, { nickname, password: crypto.randomBytes(20).toString('hex'), legalConsent: { version, accepted: true } });
    actors.push({ ...registered.user, token: registered.token });
  }
  const prior = actors.at(-1), now = new Date(), day = offset => new Date(now.getTime() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
  const manual = await api('POST', '/runs', prior, { type: 'run', startedAt: day(-1) + 'T04:25', distanceKm: 6.75, duration: '00:38:40', climb: 0, city: '保留原有城市' });
  const originalHistory = await api('POST', '/me/race-history', prior, { name: '原有真实参赛回忆', raceDate: day(-10), city: '原有城市', province: '浙江', distance: '10k', kind: 'road', meet: 'offline', status: 'finished', timing: 'net', netTime: '00:49:39', tags: ['突破'], story: '这是本次补齐之前保存的个人记录，需要完整保留。' }, 201);
  const protectedRun = hash(db.prepare('SELECT * FROM runs WHERE id=?').get(manual.run.id));
  const historyId = Number(originalHistory.entry.id.split(':')[1]), protectedHistory = hash(db.prepare('SELECT * FROM race_history_entries WHERE id=?').get(historyId));
  const options = { now, accountIds: actors.map(actor => actor.id) };
  await check('Dry run describes account gaps without writing any business rows', async () => {
    const counts = rowCounts(); const planned = await seed(db, { ...options, dryRun: true });
    assert.equal(planned.dryRun, true); assert.deepEqual(rowCounts(), counts); report.preview = { accounts: planned.accounts, affectedAccounts: planned.affectedAccounts, before: planned.before, totalRows: planned.totalRows };
  });
  await check('Seed fills empty account experiences while preserving existing manual data', async () => {
    const applied = await seed(db, { ...options, dryRun: false });
    assert.equal(applied.dryRun, false); assert.ok(applied.totalRows > 0); report.seed = { accounts: applied.accounts, affectedAccounts: applied.affectedAccounts, inserted: applied.inserted, totalRows: applied.totalRows };
    assert.equal(hash(db.prepare('SELECT * FROM runs WHERE id=?').get(manual.run.id)), protectedRun);
    assert.equal(hash(db.prepare('SELECT * FROM race_history_entries WHERE id=?').get(historyId)), protectedHistory);
  });
  await check('Repeating seed is idempotent and virtual experience runs never enter club PK', async () => {
    const counts = rowCounts(); const repeated = await seed(db, { ...options, dryRun: false }); assert.deepEqual(rowCounts(), counts); assert.equal(repeated.totalRows, 0);
    const experienceRuns = db.prepare("SELECT id,run_mode FROM runs WHERE city='[体验]虚拟路线'").all(); assert.ok(experienceRuns.length); assert.ok(experienceRuns.every(row => row.run_mode === 'virtual'));
    const counted = db.prepare("SELECT COUNT(*) n FROM mileage_counts m JOIN runs r ON r.id=m.run_id WHERE r.city='[体验]虚拟路线' AND (m.counted<>0 OR m.volume_km<>0 OR m.manual<>1 OR m.decision<>'out')").get().n; assert.equal(counted, 0);
  });
  const accounts = [];
  await check('Authenticated business APIs show each account its own plans, runs, results, history and training membership', async () => { for (const actor of actors) accounts.push(await readAccount(actor)); });
  await check('Another account cannot read preserved private history and anonymous requests cannot read personal records', async () => {
    await api('GET', '/me/race-history/' + encodeURIComponent(originalHistory.entry.id), actors[0], null, 404);
    for (const route of ['/me', '/runs', '/me/runner', '/me/race-history']) await api('GET', route, null, null, 401);
  });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  await check('390px homepage, personal profile and club views display usable seeded account content', async () => {
    const account = accounts[0], { ctx, page } = await context(account.actor, 390);
    await page.goto(base + '/', { waitUntil: 'networkidle' }); await page.locator('.home-search').waitFor();
    await page.getByLabel('搜索赛事名称或城市').fill(account.me.plans[0].race.name); await page.locator('.home-search').getByRole('button', { name: '搜索', exact: true }).click();
    await page.getByRole('link').filter({ hasText: account.me.plans[0].race.name }).first().waitFor(); assert.ok(await page.locator('a[href*="/races/"]').count()); await snapshot(page, 'home');
    await page.goto(base + '/mine', { waitUntil: 'networkidle' }); await page.locator('.account-hero .nick').waitFor(); assert.equal(await page.locator('.nick').innerText(), account.actor.nickname); assert.ok(await page.locator('.account-stats').getByText(String(account.me.plans.length), { exact: true }).count()); assert.ok((await page.locator('.club-line').innerText()).includes(account.me.clubs[0].name)); await snapshot(page, 'mine');
    await page.getByRole('navigation', { name: '个人中心' }).getByRole('button', { name: '我的赛事', exact: true }).click(); await page.locator('.plan-row').first().waitFor(); assert.equal(await page.locator('.plan-row').count(), account.me.plans.length);
    await page.goto(base + '/clubs', { waitUntil: 'networkidle' }); await page.locator('.my-clubs .my-club').first().waitFor(); assert.match(await page.locator('.my-clubs').innerText(), /\[体验\]/); await snapshot(page, 'clubs');
    const activity = account.joinedActivities[0]; await page.goto(base + '/clubs/' + activity.clubId + '?tab=act', { waitUntil: 'networkidle' }); await page.getByText(activity.title, { exact: true }).first().waitFor();
    await ctx.close();
  });
  await check('320px second account sees its own month training, statistics and race history', async () => {
    const account = accounts[1], { ctx, page } = await context(account.actor, 320);
    await page.goto(base + '/mine', { waitUntil: 'networkidle' }); await page.locator('.nick').waitFor(); assert.equal(await page.locator('.nick').innerText(), account.actor.nickname); assert.doesNotMatch(await page.locator('.account-hero').innerText(), new RegExp(accounts[0].actor.nickname));
    await page.goto(base + '/sport', { waitUntil: 'networkidle' }); await page.locator('.run-record').first().waitFor(); assert.equal(await page.locator('.run-record').count(), account.runs.runs.length); assert.equal(Number((await page.locator('.mileage-value strong').innerText()).replace(/,/g, '')), account.runs.month.km); await snapshot(page, 'exercise');
    await page.goto(base + '/runner?view=stats', { waitUntil: 'networkidle' }); await page.locator('.training-card').waitFor(); assert.ok(await page.locator('.runner-page').getByText('运动明细', { exact: true }).count());
    await page.goto(base + '/history', { waitUntil: 'networkidle' }); await page.locator('.history-row').first().waitFor(); assert.equal(await page.locator('.history-row').count(), account.history.entries.length); assert.ok((await page.locator('.history-row').allInnerTexts()).some(text => text.includes('[体验]'))); await snapshot(page, 'history');
    await ctx.close();
  });
  assert.deepEqual(report.errors, []); assert.equal(db.pragma('integrity_check', { simple: true }), 'ok'); report.passed = true;
}
main().catch(error => { report.passed = false; report.error = error.stack || String(error); console.error(report.error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  try { db.close(); } catch {}
  fs.rmSync(temporary, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString(); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, accounts: report.accounts.length, views: report.views.length, errors: report.errors.length, report: path.relative(ROOT, path.join(OUT, 'report.json')) }));
});
