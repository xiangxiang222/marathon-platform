/* Complete consumer route audit against a disposable real API. No production
 * configuration, live users, third-party calls or business database writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const { inspectUiPalette } = require('./ui-palette-metrics.cjs');
const ROOT = path.resolve(__dirname, '..');
const expectedAccent = (process.env.UI_EXPECTED_ACCENT || '#ff1838').toLowerCase();
if (!/^#[0-9a-f]{6}$/.test(expectedAccent)) throw new Error('UI_EXPECTED_ACCENT must be a six-digit hex color');
const out = path.resolve(ROOT, process.env.UI_AUDIT_OUT || 'design/previews/ui-refresh');
const reportFile = path.resolve(ROOT, process.env.UI_AUDIT_REPORT || 'design/previews/ui-full-audit-report.json');
fs.mkdirSync(out, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-ui-full-'));
Object.assign(process.env, { NODE_ENV: 'test', BASE_PATH: '/marathon', PORT: '0', MARATHON_DB: path.join(temporary, 'app.sqlite'), MARATHON_MEDIA: path.join(temporary, 'media'), ADMIN_TOKEN: crypto.randomBytes(24).toString('hex') });
const exists = fs.existsSync;
fs.existsSync = file => path.resolve(String(file)) === path.join(ROOT, '.env') ? false : exists(file);
let app;
try { ({ app } = require('../server/src/index')); } finally { fs.existsSync = exists; }
const { getDb } = require('../server/src/db');
const version = require('../shared/legal-documents.json').version;
const report = { startedAt: new Date().toISOString(), isolation: 'Disposable real SQLite and media; localhost-only browser', output: out, expectedAccent, typography: { minimumTextPx: 12, minimumControlTextPx: 12, rule: 'Minimum 12px for metadata, 14px for body and form controls; system fonts with natural Chinese spacing.' }, fixture: {}, views: [], errors: [], limitations: ['No WeChat device or external provider verification', 'Admin separately covered by admin-browser-regression.cjs and admin-ui-full-audit.cjs', 'Visible DOM layout checks do not imply every possible interactive state was exercised'] };
let server, origin, vite, browser;
const stamp = (days = 0) => new Date(Date.now() + (days * 24 + 8) * 3600000).toISOString().slice(0, 16);
const day = days => stamp(days).slice(0, 10);

async function api(method, suffix, actor, body) {
  const headers = actor ? { Authorization: 'Bearer ' + (typeof actor === 'string' ? actor : actor.token) } : {};
  const options = { method, headers };
  if (body instanceof FormData) options.body = body;
  else if (body != null) { options.body = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const response = await fetch(origin + '/marathon/api' + suffix, options);
  const data = await response.json();
  assert.ok(response.ok, `${method} ${suffix}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function fixtures() {
  const actors = {};
  for (const [key, nickname] of [['owner', '城市晨光团长'], ['manager', '河畔领跑员'], ['member', '周末快乐跑者'], ['other', '远方独立跑者']]) {
    const value = await api('POST', '/auth/register', null, { nickname, password: 'UI-audit-2026!', legalConsent: { version, accepted: true } });
    actors[key] = { ...value.user, token: value.token };
  }
  const owner = actors.owner, member = actors.member;
  const club = (await api('POST', '/clubs', owner, { name: '城市晨光马拉松跑团', city: '杭州', requestId: crypto.randomUUID() })).club;
  const other = (await api('POST', '/clubs', actors.other, { name: '山野同行越野跑团', city: '南京', requestId: crypto.randomUUID() })).club;
  for (const actor of [actors.manager, member]) {
    await api('POST', '/clubs/join', actor, { code: club.code });
    const pending = (await api('GET', '/clubs/' + club.id, owner)).requests.find(row => row.userId === actor.id || row.nickname === actor.nickname);
    assert.ok(pending);
    await api('POST', '/clubs/' + club.id + '/requests/' + pending.id, owner, { decision: 'approve' });
  }
  await api('PUT', '/clubs/' + club.id + '/members/' + actors.manager.id, owner, { role: 'manager' });
  const c = '/clubs/' + club.id;
  await api('PUT', c + '/mileage/rules', owner, { effectiveOn: day(-30), manualOk: true, runOn: true, runMin: 1, runMax: 60, paceFast: '3:00', paceSlow: '12:00', trailOn: true, trailMin: 1, trailClimb: 0, flagFemale: 0, flagMale: 0 });
  for (const [actor, offset, distanceKm, duration] of [[owner, -1, 10, '00:58:00'], [owner, -3, 6, '00:36:00'], [member, -1, 8, '00:48:00']]) {
    await api('POST', '/runs', actor, { type: 'run', startedAt: day(offset) + 'T06:00', distanceKm, duration, climb: 0 });
  }
  const g = (await api('POST', c + '/groups', owner, { name: '轻松跑组', pace: '6:00', capacity: 20 })).group;
  await api('POST', c + '/groups', owner, { name: '进阶跑组', pace: '5:00', capacity: 10 });
  const activity = (await api('POST', c + '/activities', owner, { title: '周末一起跑 · 城市绿道轻松十公里', place: '西湖绿道南入口', startsAt: stamp(3), plannedKm: 10, trainingType: 'easy', gatherPlace: '公园南门广场', gatherAt: '提前15分钟', note: '按自己的节奏跑，完成后一起拉伸。', minKm: 5, points: 2 })).activity;
  await api('POST', c + '/activities/' + activity.id + '/signup', member, { groupId: g.id });
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cX1kAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'ui-fixture.png');
  await api('POST', c + '/activities/' + activity.id + '/media', owner, form);
  const meetup = (await api('POST', c + '/meetups', member, { date: day(2), place: '河岸公园 · 日落恢复跑', note: '轻松5公里，东门集合。' })).meetup;
  const internal = (await api('POST', c + '/internals', owner, { title: '月度十公里 · 按自己的节奏突破', place: '滨江绿道', startsAt: stamp(7), deadline: stamp(6), distance: '10k', groups: [{ name: '轻松组', capacity: 20 }, { name: '挑战组', capacity: 10 }] })).race;
  await api('POST', c + '/internals/' + internal.id + '/signup', member, { groupId: internal.groups[0].id });
  const races = [];
  for (const [index, name, city] of [[0, '城市秋日马拉松', '杭州'], [1, '山海半程马拉松', '宁波'], [2, '一起奔跑城市十公里', '南京']]) {
    const value = await api('POST', '/admin/races', process.env.ADMIN_TOKEN, { name, city, province: index === 2 ? '江苏' : '浙江', raceDate: day(index + 20), distances: index === 0 ? ['full', 'half'] : index === 1 ? ['half'] : ['10k'], kind: 'road', meet: 'offline', regStart: day(-10), deadline: day(10) });
    races.push(value.id);
  }
  await api('PUT', '/me/races/' + races[0], owner, { status: '已报名' });
  await api('PUT', '/me/races/' + races[1], member, { status: '想跑' });
  const call = (await api('POST', c + '/calls', owner, { raceId: races[0], distances: ['full', 'half'], deadline: stamp(25) })).call;
  await api('POST', c + '/fees', owner, { name: '本赛季跑团会费', amount: 100, startsOn: day(-1), endsOn: day(100), blockSignup: false });
  await api('POST', c + '/gifts', owner, { name: '跑团纪念运动袜', cost: 20, stock: 30 });
  await api('POST', c + '/posts', member, { body: '周末一起出发！希望每个人都跑出自己喜欢的节奏。' });
  const news = (await api('POST', '/admin/news', process.env.ADMIN_TOKEN, { raceId: races[0], title: '比赛日交通与领物指引', body: '## 参赛提醒\n\n请提前核对领物时间，携带本人有效证件。\n\n比赛日优先公共交通，按分区有序入场。', source: '测试赛事组委会', publishedAt: day() })).news;
  const feedback = await api('POST', '/feedback', owner, { category: 'ui', module: 'clubs', title: '跑团活动信息希望更清楚', body: '希望把集合时间、地点和分组信息排在一起，方便大家出门前快速核对。' });
  const history = (await api('POST', '/me/race-history', owner, { name: '2025 城市秋日半程马拉松', raceDate: '2025-10-26', city: '杭州', province: '浙江', distance: 'half', kind: 'road', meet: 'offline', status: 'finished', timing: 'net', netTime: '01:48:32', story: '和朋友一起跑过了熟悉的城市。', tags: ['陪伴', '城市'] })).entry;
  report.fixture = { registeredUsers: Object.keys(actors).length, createdClubs: 2, mode: 'Real registration and business HTTP APIs; synthetic content' };
  return { actors, club, other, activity, meetup, internal, races, call, news, feedback, history };
}

function inventory(f) {
  const c = '/clubs/' + f.club.id, a = c + '/activities/' + f.activity.id;
  const pages = [
    ['home', '/', '.home-page'], ['calendar', '/calendar', '.calendar'], ['radar', '/radar', 'h1'],
    ['news', '/news', 'h1'], ['news-detail', '/news/' + f.news.id, 'h2'], ['race', '/races/' + f.races[0], '.detail'],
    ['clubs', '/clubs', '.clubs-page'], ['club-create', '/clubs/new', 'h1'],
    ['reports', '/clubs/reports', 'h1'], ['club-report', c + '/report', 'h1'], ['club-identity', c + '/identity', 'h1'],
    ['club-public', c + '/public', 'h1'], ['club-invite', '/clubs/invite/' + f.club.code, 'h1'],
    ['club-overview', c, '.club-page'], ['club-race', c + '?tab=race', '.club-page'], ['club-training', c + '?tab=act', '.club-page'],
    ['club-meetups', c + '?tab=act&view=meetup', '.club-page'], ['club-internals', c + '?tab=act&view=internal', '.club-page'],
    ['club-mileage', c + '?tab=km', '.club-page'], ['club-members', c + '?tab=people&view=members', '.club-page'],
    ['club-fees', c + '?tab=people&view=fees', '.club-page'], ['club-manage', c + '?tab=people&view=manage', '.club-page'],
    ['club-albums', c + '?tab=album', '.club-page'], ['club-feed', c + '?tab=feed', '.club-page'], ['club-partner', c + '?tab=partner', '.club-page'],
    ['activity-create', c + '/activities/new', '.activity-create'], ['activity', a, '.activity-page'],
    ['signup', a + '/signup', '.signup-page', 'owner'], ['album', a + '/album', 'h1'],
    ['call', c + '/calls/' + f.call.id, 'h1'], ['meetup', c + '/meetups/' + f.meetup.id, 'h1'], ['internal', c + '/internals/' + f.internal.id, 'h1'],
    ['sport', '/sport', '.exercise'], ['look', '/look', 'h1'], ['mine', '/mine', '.mine'],
    ['mine-plans', '/mine', '.mine', 'owner', '我的赛事'], ['mine-results', '/mine', '.mine', 'owner', '完赛记录'], ['mine-profile', '/mine', '.mine', 'owner', '个人资料'],
    ['history', '/history', '.history-page'], ['history-import', '/history', '.history-page', 'owner', '找回旧比赛'],
    ['history-review', '/history?race=' + encodeURIComponent(f.history.id), '.history-page'],
    ['feedback', '/feedback', '.feedback-page'], ['feedback-detail', '/feedback/' + (f.feedback.id || f.feedback.feedback?.id || f.feedback.item?.id), '.feedback-page'],
    ['not-found', '/unknown-audit-page', 'h1'], ['guest-home', '/', '.home-page', 'guest'], ['guest-clubs', '/clubs', '.clubs-page', 'guest'], ['guest-mine', '/mine', '.mine', 'guest'],
    ['manager-club-overview', c, '.club-page', 'manager'], ['manager-club-members', c + '?tab=people&view=members', '.club-page', 'manager'],
    ['manager-club-manage', c + '?tab=people&view=manage', '.club-page', 'manager'], ['manager-club-training', c + '?tab=act&view=training', '.club-page', 'manager'],
    ['manager-activity', a, '.activity-page', 'manager']
  ];
  pages.push(
    ['mine-settings', '/mine', '.mine', 'owner', '设置'],
    ['sport-target', '/sport', '.exercise', 'owner', '设置目标 ›'],
    ['sport-create', '/sport', '.exercise', 'owner', '＋ 记录跑步'],
    ['sport-edit', '/sport', '.exercise'],
    ['race-share-expanded', '/races/' + f.races[0], '.detail']
  );
  for (const view of ['stats', 'career', 'footprints', 'honors', 'media', 'devices', 'help']) pages.push(['runner-' + view, '/runner?view=' + view, '.runner-page']);
  for (const doc of ['terms', 'privacy', 'collection', 'sharing', 'rights', 'permissions', 'children']) pages.push(['legal-' + doc, '/legal/' + doc, 'h1']);
  return pages.map(([id, route, ready, actor = 'owner', click]) => ({ id, route, ready, actor, click }));
}

async function inspect(page) {
  return page.evaluate(() => {
    const displayed = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const text = [...document.querySelectorAll('p,small,label,button,a,span,b,strong,h1,h2,h3,h4,summary')].filter(el => displayed(el) && el.innerText?.trim() && !el.querySelector('*'));
    const describe = el => ({ tag: el.tagName, class: el.className, fontSize: getComputedStyle(el).fontSize, text: el.innerText.slice(0, 32) });
    const tiny = text.filter(el => parseFloat(getComputedStyle(el).fontSize) < 11.9).map(describe).slice(0, 12);
    const caption = text.filter(el => parseFloat(getComputedStyle(el).fontSize) < 11.9).map(describe).slice(0, 12);
    const tinyControls = text.filter(el => ['BUTTON', 'LABEL'].includes(el.tagName) && parseFloat(getComputedStyle(el).fontSize) < 11.9).map(describe).slice(0, 12);
    const over = [...document.querySelectorAll('main,section,article,form,input,textarea,select,button')].filter(el => displayed(el) && el.getBoundingClientRect().right > innerWidth + 1 && !el.closest('.rail,.filter-bar,.club-tabs,.runner-tabs,.history-nav,.table-wrap,.table-scroll,.scroll-table')).map(el => ({ tag: el.tagName, class: el.className, right: Math.round(el.getBoundingClientRect().right) })).slice(0, 8);
    const spacedText = text.filter(el => /[\u4e00-\u9fff]/.test(el.innerText) && !['normal','0px'].includes(getComputedStyle(el).letterSpacing)).map(describe);
    const heavyText = text.filter(el => Number(getComputedStyle(el).fontWeight) > 600).map(describe);
    const primaryControls = [...document.querySelectorAll('.activity-create .actions .primary')].filter(displayed).map(element => ({ text: element.innerText, color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, title: document.querySelector('h1')?.innerText || '', tinyText: tiny, captionText: caption, tinyControls, spacedText, heavyText, overflowingElements: over, primaryControls, primaryColor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), brokenImages: [...document.images].filter(img => displayed(img) && img.complete && img.naturalWidth === 0).length };
  });
}

async function main() {
  server = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); });
  origin = 'http://127.0.0.1:' + server.address().port;
  const fixture = await fixtures();
  const { createServer } = await import(pathToFileURL(path.join(ROOT, 'web/node_modules/vite/dist/node/index.js')).href);
  vite = await createServer({ root: path.join(ROOT, 'web'), configFile: path.join(ROOT, 'web/vite.config.js'), cacheDir: path.join(temporary, 'vite-cache'), server: { host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/marathon/api': { target: origin, changeOrigin: true } } } });
  await vite.listen();
  const base = 'http://127.0.0.1:' + vite.httpServer.address().port + '/marathon';
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const requestedIds = (process.env.UI_AUDIT_VIEW_IDS || '').split(',').filter(Boolean);
  const pages = inventory(fixture).filter(view => !requestedIds.length || requestedIds.includes(view.id));
  assert.ok(pages.length, 'No UI audit scenes selected');
  for (const id of requestedIds) assert.ok(pages.some(view => view.id === id), 'Unknown UI audit scene: ' + id);
  const widths = process.env.UI_AUDIT_WIDTHS ? process.env.UI_AUDIT_WIDTHS.split(',').map(Number) : [320, 390, 1440];
  assert.ok(widths.length && widths.every(width => [320, 390, 1440].includes(width)), 'UI_AUDIT_WIDTHS supports 320,390,1440');
  report.viewCount = pages.length;
  for (const width of widths) {
    const contexts = {};
    for (const actor of ['owner', 'manager', 'member', 'guest']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.route('**/*', route => /^(https?:\/\/(127\.0\.0\.1|localhost)(:|\/)|data:|blob:)/.test(route.request().url()) ? route.continue() : route.abort());
      if (actor !== 'guest') await context.addInitScript(({ token, nickname }) => { localStorage.setItem('marathon_token', token); localStorage.setItem('marathon_name', nickname); }, fixture.actors[actor]);
      contexts[actor] = context;
    }
    for (const view of pages) {
      const page = await contexts[view.actor].newPage();
      page.setDefaultTimeout(8000);
      const item = { id: view.id, route: view.route, role: view.actor, width, passed: false, errors: [], consoleErrors: [], apiErrors: [] };
      page.on('pageerror', error => item.errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') item.consoleErrors.push(message.text()); });
      page.on('response', response => { if (response.url().includes('/api/') && response.status() >= 500) item.apiErrors.push({ status: response.status(), path: new URL(response.url()).pathname }); });
      try {
        await page.goto(base + view.route, { waitUntil: 'networkidle' });
        await page.locator(view.ready).first().waitFor();
        assert.equal(new URL(page.url()).pathname, new URL(base + (view.id === 'club-invite' ? '/clubs/' + fixture.club.id + '/public' : view.route)).pathname, 'audit scene must remain on its requested route or resolved invite page');
        if (view.click) await page.getByRole('button', { name: view.click, exact: true }).click();
        if (view.id === 'sport-edit') await page.getByRole('button', { name:'编辑记录', exact:true }).first().click();
        if (view.id === 'race-share-expanded') await page.locator('.share-toggle').click();
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready);
        Object.assign(item, await inspect(page), await page.evaluate(inspectUiPalette));
        assert.ok(item.scrollWidth <= width + 1 && item.bodyWidth <= width + 1, 'page horizontally overflows');
        assert.deepEqual(item.errors, [], 'browser script errors');
        assert.deepEqual(item.consoleErrors, [], 'browser console errors');
        assert.deepEqual(item.apiErrors, [], 'real API server errors');
        assert.equal(item.brokenImages, 0, 'broken visible images');
        assert.equal(item.primaryColor.toLowerCase(), expectedAccent);
        const nonBrand = (item.colorRichness?.coloredSurfaces || []).filter(surface => surface.families.some(family => family !== 'coral'));
        assert.deepEqual(nonBrand, [], 'consumer UI backgrounds must use brand red or neutral surfaces');
        assert.deepEqual(item.heavyText, [], 'consumer text must use at most weight 600');
        assert.deepEqual(item.spacedText, [], 'Chinese text must retain natural letter spacing');
        if (view.id === 'activity-create') {
          assert.ok(item.primaryControls.length, 'activity form primary action must remain visible');
          assert.ok(item.primaryControls.every(control => control.color === 'rgb(255, 255, 255)'), 'activity primary action requires white text on brand red');
        }
        if (['activity', 'manager-activity'].includes(view.id)) {
          assert.ok(item.activityHero, 'activity hero must be visible');
          assert.ok(process.env.UI_PALETTE_PROFILE === 'colorful' ? item.activityHero.brightReadableSurface : item.activityHero.minimumBackgroundLuminance >= 0.85, 'activity hero must retain a bright readable background');
          assert.ok(item.activityHero.textLuminance <= 0.3, 'activity hero must use readable dark text on its bright background');
        }
        if (item.tinyText.length) throw new Error('visible text below 12px: ' + JSON.stringify(item.tinyText));
        if (item.tinyControls.length) throw new Error('button or form label below 12px: ' + JSON.stringify(item.tinyControls));
        item.passed = true;
      } catch (error) { item.error = error.message; report.errors.push({ id: view.id, width, error: error.message }); }
      if (process.env.UI_AUDIT_CAPTURE_ALL === '1' || width === 390 || !item.passed || ['home', 'clubs', 'mine', 'sport', 'club-overview', 'activity', 'manager-activity', 'activity-create', 'club-create'].includes(view.id)) {
        await page.evaluate(() => scrollTo(0, 0));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const filename = view.id + '-' + width + '.png';
        await page.screenshot({ path: path.join(out, filename), fullPage: true }).catch(() => {});
        item.screenshot = path.relative(path.dirname(reportFile), path.join(out, filename));
      }
      report.views.push(item);
      console.log((item.passed ? 'PASS ' : 'FAIL ') + view.id + ' ' + width + (item.error ? ': ' + item.error : ''));
      await page.close();
    }
    for (const context of Object.values(contexts)) await context.close();
  }
  report.passed = report.views.every(view => view.passed);
  if (!report.passed) process.exitCode = 1;
}

main().catch(error => { report.passed = false; report.fatal = error.stack; process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (vite) await vite.close();
  if (server) await new Promise(resolve => server.close(resolve));
  getDb().close();
  fs.rmSync(temporary, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  report.checkCount = report.views.length;
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, views: report.viewCount, checks: report.checkCount, failures: report.errors.length, fatal: report.fatal }));
});
