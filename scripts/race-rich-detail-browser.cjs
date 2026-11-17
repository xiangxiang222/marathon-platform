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
    if ((localApi || process.env.RACE_RICH_API) && (url.pathname.includes('/race-sheets/') || url.pathname.endsWith('/signup-qr'))) {
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
