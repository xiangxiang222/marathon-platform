'use strict';
// Mobile browser acceptance for the current Vue page. Data is isolated unless RACE_RICH_API is explicitly supplied.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..'), out = process.env.RACE_RICH_OUTPUT || path.join(root, 'design/previews/race-rich-details-20261117/web');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'race-rich-ui-'));
const sample = require('./race-rich-detail-fixture.cjs');
const qr = require('../server/node_modules/qrcode');
let vite, browser, apiServer, savedDb, localApi;
let persistedPayload;
const report = { kind: process.env.RACE_RICH_API ? 'Current Vue page with saved API response; screenshots from desktop Chrome mobile viewport, not WeChat device testing.' : 'Current Vue page with isolated source-based sample response; no production save or deployment.', passed: false, views: [], errors: [], checks: [] };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  if (process.env.RACE_RICH_PILOT_JSON) {
    const pilot = JSON.parse(fs.readFileSync(process.env.RACE_RICH_PILOT_JSON, 'utf8'));
    const inventory = JSON.parse(fs.readFileSync(path.join(path.dirname(process.env.RACE_RICH_PILOT_JSON), 'inventory-before.json'), 'utf8'));
    const original = inventory.races.find(row => row.id === pilot.id);
    assert.ok(original, 'pilot must come from the existing target scope');
    Object.assign(process.env, { NODE_ENV: 'test', PORT: '0', BASE_PATH: '/marathon', MARATHON_DB: path.join(temp, 'app.sqlite'), MARATHON_MEDIA: path.join(temp, 'media') });
    const exists = fs.existsSync; fs.existsSync = file => path.resolve(String(file)) === path.join(root, '.env') ? false : exists(file);
    let app; try { ({ app } = require('../server/src/index')); } finally { fs.existsSync = exists; }
    savedDb = require('../server/src/db').getDb();
    const { writeDetails } = require('../server/src/race-details');
    const row = { ...original, guide_text: writeDetails(pilot.guideText, pilot.details), reg_start: '2026-09-15', deadline: '2026-11-10', organizer: '垫江县人民政府', phone: '17316784625' };
    const keys = savedDb.prepare('PRAGMA table_info(races)').all().map(column => column.name).filter(key => row[key] !== undefined);
    savedDb.prepare('INSERT OR REPLACE INTO races (' + keys.join(',') + ') VALUES (' + keys.map(() => '?').join(',') + ')').run(...keys.map(key => row[key]));
    const raceMedia = path.join(process.env.MARATHON_MEDIA, 'races');
    fs.mkdirSync(raceMedia, { recursive: true });
    for (let i = 0; i < pilot.details.media.length; i++) {
      const media = pilot.details.media[i]; if (!media.localFile) continue;
      const filename = 'pilot-' + i + path.extname(media.localFile);
      fs.copyFileSync(media.localFile, path.join(raceMedia, filename));
      savedDb.prepare('INSERT INTO race_sheets(race_id,kind,filename,sort,created_at) VALUES(?,?,?,?,?)').run(row.id, media.kind || 'guide', filename, i, new Date().toISOString());
    }
    apiServer = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
    localApi = 'http://127.0.0.1:' + apiServer.address().port;
    const response = await fetch(localApi + '/marathon/api/races/' + encodeURIComponent(row.id));
    assert.ok(response.ok); persistedPayload = await response.json();
    assert.equal(persistedPayload.race.details.groups.length, 4);
    const sheets = [...persistedPayload.race.guide, ...persistedPayload.race.routeSheets];
    assert.equal(sheets.length, pilot.details.media.length, 'every selected source image must be saved');
    for (const sheet of sheets) {
      const image = await fetch(localApi + '/marathon/api/race-sheets/' + sheet.id);
      assert.equal(image.status, 200, 'saved source image ' + sheet.id);
      assert.match(image.headers.get('content-type'), /^image\//);
      assert.ok((await image.arrayBuffer()).byteLength > 100);
    }
    report.savedImagesVerified = sheets.length;
    report.kind = 'Current Vue + real Express API + saved sample in disposable SQLite. Chrome mobile viewports, not production deployment or WeChat device testing.';
    report.storageVerified = true;
    const qrResponse = await fetch(localApi + persistedPayload.race.signupQrUrl);
    assert.ok(qrResponse.ok); fs.writeFileSync(path.join(out, 'dianjiang-signup-qr.png'), Buffer.from(await qrResponse.arrayBuffer()));
    fs.writeFileSync(path.join(out, 'saved-api.json'), JSON.stringify(persistedPayload, null, 2));
  }
  const { createServer } = await import(pathToFileURL(path.join(root, 'web/node_modules/vite/dist/node/index.js')).href);
  vite = await createServer({ root: path.join(root, 'web'), configFile: path.join(root, 'web/vite.config.js'), cacheDir: path.join(temp, 'vite'), server: { host: '127.0.0.1', port: 0 } });
  await vite.listen();
  const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let current = persistedPayload || (process.env.RACE_RICH_API ? await (await fetch(process.env.RACE_RICH_API)).json() : { race: sample });
  current = current.race ? current : { race: current };
  current.race = { guide: [], routeSheets: [], pacerSheets: [], nodes: [], links: [], kindLabels: [], distanceLabels: [], groups: [], ...current.race };
  report.raceId = current.race.id;
  report.source = process.env.RACE_RICH_PILOT_JSON || process.env.RACE_RICH_API || 'scripts/race-rich-detail-fixture.cjs';
  const png = await qr.toBuffer('https://reg.zuicool.com/verified-fixture-entry', { margin: 4, width: 288 });
  await ctx.route('**/marathon/api/**', async route => {
    const url = new URL(route.request().url());
    if (current.race.id !== 'race-service-fixture' && (localApi || process.env.RACE_RICH_API) && (url.pathname.includes('/race-sheets/') || url.pathname.endsWith('/signup-qr'))) {
      const remote = new URL(url.pathname + url.search, localApi || new URL(process.env.RACE_RICH_API).origin);
      const response = await fetch(remote); return route.fulfill({ status: response.status, contentType: response.headers.get('content-type') || 'image/png', body: Buffer.from(await response.arrayBuffer()) });
    }
    if (url.pathname.includes('/race-sheets/') || url.pathname.endsWith('/signup-qr')) return route.fulfill({ status: 200, contentType: 'image/png', body: png });
    const data = /\/news$/.test(url.pathname) ? { news: [] } : /\/outings$/.test(url.pathname) ? { outings: [] } : { statuses: [], myResults: [], clubs: [], cards: [], ...current };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const page = await ctx.newPage(); page.on('pageerror', error => report.errors.push(error.message));
  async function shot(name) {
    const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(metrics.scrollWidth <= metrics.width, name + ' has page overflow');
    await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
    report.views.push({ name, ...metrics });
  }
  const richPayload = current;
  const serviceRace = {
    ...sample,
    id: 'race-service-fixture',
    name: '2035 北京城市马拉松暨国际公路跑全民健身邀请赛长名称展示',
    province: '北京', city: '北京', district: '', place: '奥林匹克公园',
    raceDate: '2035-11-04', raceDateLabel: '11月4日 周日', raceEndDate: '',
    eventUrl: 'https://event.example.test/marathon', officialUrl: '',
    coverSheet: null, details: {}, guideText: '', pickup: '',
    registrationStatus: '', registrationLabel: '', regStatus: '', open: false,
    regStart: '', deadline: '', signupQrAvailable: false, signupQrUrl: '', signupHost: '',
    nodes: [], links: []
  };
  const serviceUrl = origin + '/marathon/races/' + serviceRace.id;
  const service = page.getByRole('region', { name: '参赛服务', exact: true });
  const primary = service.locator('.race-service-primary');
  const signup = { key: 'signup', url: 'https://entry.example.test/signup' };
  const result = { key: 'result', url: 'https://event.example.test/results' };
  const deadline = { key: 'deadline', label: '报名截止', at: '2035-10-19 18:00', past: false };
  async function openService(fields = {}, query = '') {
    current = { race: { ...serviceRace, ...fields } };
    await page.goto(serviceUrl + query, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('#race-title').textContent(), serviceRace.name, 'the race fixture must render before checking new behavior');
  }
  const serviceFailures = [];
  async function serviceCheck(name, check, failures = serviceFailures) {
    try { await check(); report.checks.push(name); }
    catch (error) { failures.push(name + '\n' + error.message); }
  }
  await page.clock.setFixedTime(new Date('2035-10-16T02:00:00Z'));
  await serviceCheck('Open registration shows one official signup action, facts and the next deadline', async () => {
    await openService({ registrationStatus: 'open', regStatus: '报名中', open: true, deadline: deadline.at, links: [signup], nodes: [deadline] });
    assert.equal(await primary.count(), 1, 'the service card must have one primary action');
    assert.equal(await primary.getAttribute('href'), signup.url);
    assert.equal(await primary.getAttribute('target'), '_blank');
    assert.match(await service.innerText(), /报名中[\s\S]*11月4日[\s\S]*北京[\s\S]*报名截止[\s\S]*2035-10-19 18:00/);
    assert.equal(await service.getByRole('link', { name: '官方入口', exact: true }).getAttribute('href'), serviceRace.eventUrl);
  });
  await serviceCheck('QR-only registration opens the official QR preview without a signup link', async () => {
    await openService({ registrationStatus: 'open', regStatus: '报名中', open: true, deadline: deadline.at, signupQrAvailable: true, nodes: [deadline] });
    assert.equal(await primary.count(), 1, 'QR-only registration must have one primary action');
    assert.match(await primary.textContent(), /报名二维码/);
    assert.equal(await primary.evaluate(element => element.tagName), 'BUTTON');
    await primary.click();
    await page.locator('dialog[open]').waitFor();
    assert.match(await page.locator('dialog[open] img').getAttribute('src'), /race-service-fixture\/signup-qr$/);
    await page.getByRole('button', { name: '关闭图片预览', exact: true }).click();
  });
  await serviceCheck('After registration closes, the pickup action opens the existing guide at pickup', async () => {
    const pickup = '10月20日 10:00–17:00 在奥林匹克公园北门领取参赛物品';
    await openService({ registrationStatus: 'closed', regStatus: '待开赛', deadline: '2035-10-15', pickup, links: [signup], nodes: [{ key: 'pickup', label: '参赛包领取', at: '2035-10-20 10:00', past: false }] });
    assert.equal(await primary.count(), 1, 'published pickup information must have one primary action');
    assert.match(await primary.textContent(), /领物/);
    await primary.click();
    assert.equal(await page.getByRole('tab', { name: '参赛指南', exact: true }).getAttribute('aria-selected'), 'true');
    assert.match(await page.locator('#guide-pickup').innerText(), /奥林匹克公园北门/);
  });
  await serviceCheck('A completed race makes the official results link primary', async () => {
    await openService({ raceDate: '2035-10-12', raceDateLabel: '10月12日', registrationStatus: 'closed', links: [signup, result] });
    assert.equal(await primary.count(), 1, 'a completed race with published results must have one primary action');
    assert.equal(await primary.getAttribute('href'), result.url);
    assert.match(await service.innerText(), /已结束/);
  });
  await serviceCheck('The earliest future node is displayed in Beijing time and verified deadlines replace stale raw dates', async () => {
    const draw = { key: 'draw', label: '出签', at: '2035-10-16T04:00:00Z', past: false };
    await openService({ registrationStatus: 'open', open: true, details: { registration: { verified: true, closesAt: '2035-10-16T10:00:00Z' } }, nodes: [deadline, draw], nextNode: deadline });
    const next = service.locator('.race-service-next');
    assert.match(await next.innerText(), /出签[\s\S]*2035-10-16 12:00/);
    await openService({ registrationStatus: 'open', open: true, details: { registration: { verified: true, closesAt: '2035-10-16T10:00:00Z' } }, nodes: [deadline], nextNode: deadline });
    assert.match(await next.innerText(), /报名截止[\s\S]*2035-10-16 18:00/);
  });
  await serviceCheck('Missing or invalid official details show no misleading primary action', async () => {
    await openService({ eventUrl: '', links: [{ ...signup, url: 'http://entry.example.test/signup' }] });
    assert.equal(await service.count(), 1, 'the service card must render even without official actions');
    assert.equal(await primary.count(), 0);
    assert.match(await service.innerText(), /未录入|暂未公布/);
    await openService({ registrationStatus: 'cancelled', signupQrAvailable: true, pickup: '已失效的领物安排', links: [signup, result] });
    assert.equal(await primary.count(), 0);
    assert.match(await service.innerText(), /赛事已取消/);
    await openService({ registrationStatus: 'open', details: { registration: { entranceVerified: false } }, signupQrAvailable: true, links: [signup] });
    assert.equal(await primary.count(), 0);
    assert.equal(await page.locator('.signup-qr-preview').count(), 0);
    await openService({ registrationStatus: 'closed', pickup: '领物安排待公布' });
    assert.equal(await primary.count(), 0);
    assert.match(await service.innerText(), /领物安排尚未录入/);
  });
  await serviceCheck('Follow and participation plan are distinct and keep their guest sign-in return routes', async () => {
    await openService();
    const follow = service.getByRole('button', { name: '关注' + serviceRace.name, exact: true });
    assert.equal(await follow.count(), 1, 'the service card must expose a separate follow action');
    await follow.click();
    await page.waitForURL('**/marathon/mine');
    assert.equal(await page.evaluate(() => localStorage.getItem('marathon_return_after_login')), '/races/' + serviceRace.id + '?follow=1');
    await openService();
    const plan = service.getByRole('button', { name: '参赛计划', exact: true });
    await plan.click();
    await page.waitForURL('**/marathon/mine');
    assert.equal(await page.evaluate(() => localStorage.getItem('marathon_return_after_login')), '/races/' + serviceRace.id + '?plan=1');
  });
  await serviceCheck('Signed-in participation shortcut opens the editor even from another race tab', async () => {
    await page.evaluate(() => localStorage.setItem('marathon_token', 'fixture-runner'));
    try {
      await openService({}, '?tab=result');
      await service.getByRole('button', { name: '参赛计划', exact: true }).click();
      await page.locator('#race-plan-editor').waitFor();
      assert.equal(await page.getByRole('tab', { name: '赛事信息', exact: true }).getAttribute('aria-selected'), 'true');
      assert.equal(page.url(), serviceUrl + '?tab=result');
    } finally { await page.evaluate(() => localStorage.removeItem('marathon_token')); }
  });
  assert.deepEqual(serviceFailures, [], 'race service browser scenarios');
  const bodyFailures = [];
  const bodyCheck = (name, check) => serviceCheck(name, check, bodyFailures);
  await bodyCheck('The timeline keeps independently labeled early-bird history and shares the next dated node with the service card', async () => {
    const nodes = [
      { key: 'race', label: '比赛日', at: '2035-11-04', past: false },
      { key: 'deadline', label: '早鸟截止', at: '2035-10-15 23:59', past: true },
      { key: 'draw', label: '出签', at: '2035-10-16T04:00:00Z', today: true, past: false },
      { key: 'pickup', label: '参赛包领取', at: '' }
    ];
    await openService({ registrationStatus: 'open', open: true, details: { registration: { verified: true, closesAt: '2035-10-16T10:00:00Z' } }, nodes });
    const timeline = page.locator('.race-timeline-card');
    assert.deepEqual(await timeline.locator('time').allTextContents(), ['2035-10-15 23:59', '2035-10-16 12:00', '2035-10-16 18:00', '2035-11-04']);
    assert.match(await timeline.locator('.is-past').innerText(), /早鸟截止/);
    assert.equal(await timeline.locator('.is-next').count(), 1);
    assert.match(await timeline.locator('.is-next').innerText(), /出签[\s\S]*下一节点/);
    assert.match(await service.locator('.race-service-next').innerText(), /出签[\s\S]*2035-10-16 12:00/);
    assert.doesNotMatch(await timeline.innerText(), /参赛包领取/);
  });
  await bodyCheck('The information body groups date, fee data and safe official resources ahead of optional entries', async () => {
    await openService({
      details: { groups: sample.details.groups }, nodes: [deadline], archiveId: 'beijing',
      organizer: '测试组委会', phone: '010-12345678', links: [result, { key: 'bib', url: 'http://example.test/bib' }]
    });
    const order = await page.locator('.race-timeline-card,.race-project-card,.race-resources-card,.race-archive-entry').evaluateAll(rows => rows.map(row => row.className.split(' ').at(-1)));
    assert.deepEqual(order, ['race-timeline-card', 'race-project-card', 'race-resources-card', 'race-archive-entry']);
    const group = page.locator('.race-project-card .race-group').last();
    assert.match(await group.innerText(), /亲子[\s\S]*196元\/组/);
    const resources = page.locator('.race-resources-card');
    assert.equal(await resources.getByRole('link', { name: /官方成绩/ }).getAttribute('href'), result.url);
    assert.equal(await resources.getByRole('link', { name: /参赛号码/ }).count(), 0);
    await resources.locator('summary').click();
    assert.match(await resources.locator('.race-source').innerText(), /测试组委会/);
    assert.equal(await resources.getByRole('link', { name: '赛事网站', exact: true }).getAttribute('href'), serviceRace.eventUrl);
  });
  await bodyCheck('Guide practical links lead to existing pickup, route and pacing content, with a separate nonduplicated chapter directory', async () => {
    const pickup = '携带有效证件到北门领取参赛包。';
    const guideText = '## 参赛资格与运动员装备核对说明\n凡报名选手请查看现有竞赛规程。\n\n## 日程领物\n' + pickup + '\n\n## 官方领跑员\n设置半程配速组。';
    await openService({ registrationStatus: 'closed', pickup, guideText, route: '从北门出发，沿湖闭环。' }, '?tab=guide');
    const tasks = page.getByRole('navigation', { name: '比赛日资料', exact: true });
    const chapters = page.getByRole('navigation', { name: '规程章节目录', exact: true });
    assert.equal(await tasks.count(), 1);
    assert.equal(await chapters.count(), 1);
    assert.deepEqual(await chapters.getByRole('button').allTextContents().then(rows => rows.map(row => row.replace(/[↓›]/g, '').trim())), ['参赛资格与运动员装备核对说明']);
    for (const [label, heading] of [['领物与比赛日', '日程领物'], ['赛道与路线', '赛道与路线'], ['配速资料', '官方领跑员']]) {
      const action = tasks.getByRole('button', { name: label, exact: true });
      const id = await action.getAttribute('aria-controls');
      assert.ok(id);
      await action.click();
      const target = page.locator('#' + id);
      assert.match(await target.innerText(), new RegExp(heading));
      await target.evaluate(element => { if (document.activeElement !== element) throw new Error('guide jump did not move focus to the destination'); });
    }
    assert.equal(await page.getByText(pickup, { exact: true }).count(), 1);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok((await tasks.getByRole('button').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height))).every(height => height >= 44));
      await shot('guide-actions-' + width);
    }
  });
  await bodyCheck('Unpublished guide placeholders provide a truthful empty state and original-only guides stay open', async () => {
    await openService({ registrationStatus: 'closed', pickup: '领物安排待公布', route: '待公布', pacers: '另行通知' }, '?tab=guide');
    assert.equal(await page.getByRole('navigation', { name: '比赛日资料', exact: true }).count(), 0);
    assert.equal(await page.getByText(/参赛指南尚未录入/).count(), 1);
    await openService({ guide: [{ id: 920, caption: '报名竞赛规程原页' }] }, '?tab=guide');
    assert.equal(await page.locator('#guide-original-images img').count(), 1);
    assert.ok(await page.locator('#guide-original-images').isVisible());
    assert.equal(await page.locator('.guide-originals-toggle').count(), 0);
  });
  await bodyCheck('An inline official route image has one practical shortcut and one preview', async () => {
    await openService({ routeSheets: [{ id: 921 }], guideText: '## 竞赛规程原文\n请查看组委会资料。\n\n![报名规程插图](/marathon/api/race-sheets/921)' }, '?tab=guide');
    const routeGuide = page.getByRole('navigation', { name: '比赛日资料', exact: true }).getByRole('button', { name: '赛道与路线', exact: true });
    assert.equal(await routeGuide.count(), 1);
    await routeGuide.click();
    const target = page.locator('#' + await routeGuide.getAttribute('aria-controls'));
    assert.ok(await target.locator('img').isVisible());
    assert.equal(await page.locator('img[alt="报名规程插图"]').count(), 1);
    await target.getByRole('button', { name: /放大查看/ }).click();
    assert.ok(await page.locator('dialog[open] img').isVisible());
    await page.getByRole('button', { name: '关闭图片预览', exact: true }).click();
  });
  assert.deepEqual(bodyFailures, [], 'race detail body browser scenarios');
  await page.clock.setFixedTime(new Date());
  current = richPayload;
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(origin + '/marathon/races/' + encodeURIComponent(current.race.id), { waitUntil: 'networkidle' });
    await page.locator('.race-group').last().waitFor();
    assert.equal(await page.locator('.race-group').count(), 4);
    assert.match(await page.locator('.race-group').nth(3).innerText(), /亲子.*196/s);
    assert.match(await page.locator('.race-group').nth(2).innerText(), /标称距离\s*10公里[\s\S]*实际里程\s*13.5公里/);
    assert.equal(await page.locator('.signup-entry img').count(), 1);
    assert.equal(await page.locator('.signup-entry a,.signup-entry summary').count(), 0);
    assert.match(await page.locator('.signup-entry').innerText(), /截止|关闭/);
    await page.locator('.signup-qr-preview').click();
    await page.locator('dialog[open]').waitFor();
    assert.match(await page.locator('dialog[open] img').getAttribute('src'), /signup-qr/);
    await page.getByRole('button', { name: '关闭图片预览', exact: true }).click();
    await shot('dianjiang-info-' + width);
    await page.getByRole('tab', { name: '参赛指南', exact: true }).click();
    assert.match(await page.locator('.guide-md').innerText(), /参赛资格|年龄/);
    assert.ok(await page.locator('.guide-table').count() >= 1);
    const table = await page.locator('.guide-table-scroll').first().evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth }));
    assert.ok(table.content >= table.width, 'wide tables retain a scroll region');
    if (await page.locator('.guide-originals-toggle').count()) {
      assert.equal(await page.locator('.guide-originals-toggle').getAttribute('aria-expanded'), 'false');
      await shot('dianjiang-guide-folded-' + width);
      await page.locator('.guide-originals-toggle').click();
      assert.equal(await page.locator('.guide-originals-toggle').getAttribute('aria-expanded'), 'true');
    }
    if (persistedPayload || process.env.RACE_RICH_API) {
      const images = page.locator('.guide-section img');
      assert.ok(await images.count() >= current.race.guide.length + current.race.routeSheets.length);
      for (const image of await images.all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(element => new Promise((resolve, reject) => {
          if (element.complete) return element.naturalWidth > 0 ? resolve() : reject(new Error('source image failed: ' + element.src));
          element.addEventListener('load', resolve, { once: true });
          element.addEventListener('error', () => reject(new Error('source image failed: ' + element.src)), { once: true });
        }));
      }
    }
    await shot('dianjiang-guide-' + width);
  }
  report.checks.push('All four options and the parent-child fee remain visible at 320/390px.', '10km branded distance and 13.5km actual distance have separate labels.', 'One directly visible QR opens its image preview; no registration button/link/toggle.', 'Closed status remains visible; guide chapters and source tables render without page overflow.');
  for (const state of ['cancelled', 'invalid']) {
    current = { ...current, race: { ...current.race, registrationStatus: state, registrationLabel: state === 'cancelled' ? '赛事已取消' : '报名入口已失效' } };
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('.signup-entry img').count(), 0);
  }
  report.checks.push('Cancelled and invalid entries show no registration QR.');
  assert.deepEqual(report.errors, []); report.passed = true;
  await ctx.close();
})().catch(error => { report.error = error.stack; process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (vite) await vite.close();
  if (apiServer) await new Promise(resolve => apiServer.close(resolve)); if (savedDb) savedDb.close();
  fs.rmSync(temp, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
