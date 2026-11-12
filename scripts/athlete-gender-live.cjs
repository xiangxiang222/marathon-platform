/* Mobile gender filter acceptance with real local content APIs, disposable DB. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { pathToFileURL } = require('node:url'), { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'design/previews/athlete-gender-20261112'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-athlete-gender-'));
Object.assign(process.env, { NODE_ENV: 'test', BASE_PATH: '/marathon', PORT: '0', MARATHON_DB: path.join(temp, 'app.sqlite'), MARATHON_MEDIA: path.join(temp, 'media'), CONTENT_DATA_DIR: path.join(temp, 'content'), ADMIN_TOKEN: crypto.randomBytes(24).toString('hex') });
const exists = fs.existsSync; fs.existsSync = file => path.resolve(String(file)) === path.join(ROOT, '.env') ? false : exists(file);
let app; try { ({ app } = require('../server/src/index')); } finally { fs.existsSync = exists; }
const db = require('../server/src/db').getDb(), report = { kind: 'Real localhost athlete content API and source web browser gender-filter acceptance', isolation: 'Temporary SQLite/media/content overlays; .env hidden; browser remote requests blocked; no production writes', checks: [], views: [], errors: [] };
let server, vite, browser;
async function main() {
  fs.mkdirSync(OUT, { recursive: true }); server = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); }); const origin = 'http://127.0.0.1:' + server.address().port;
  const { createServer } = await import(pathToFileURL(path.join(ROOT, 'web/node_modules/vite/dist/node/index.js')).href); vite = await createServer({ root: path.join(ROOT, 'web'), cacheDir: path.join(temp, 'vite-cache'), configFile: path.join(ROOT, 'web/vite.config.js'), server: { host: '127.0.0.1', port: 0, proxy: { '/marathon/api': { target: origin, changeOrigin: true } } } }); await vite.listen(); const base = 'http://127.0.0.1:' + vite.httpServer.address().port + '/marathon';
  const first = {}; for (const gender of ['men', 'women']) { const response = await fetch(origin + '/marathon/api/content/profiles?type=athlete&gender=' + gender + '&page=1&pageSize=20'); assert.equal(response.status, 200); const data = await response.json(); assert.ok(data.total >= 20); first[gender] = data.profiles[0].name; }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const width of [320, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' }); await ctx.route('**/*', route => /^(https?:\/\/(127\.0\.0\.1|localhost)(:|\/)|data:|blob:)/.test(route.request().url()) ? route.continue() : route.abort()); const page = await ctx.newPage(); page.on('pageerror', error => report.errors.push(error.message)); await page.goto(base + '/news?tab=athlete', { waitUntil: 'networkidle' });
    for (const gender of ['men', 'women', 'men']) {
      const button = page.locator('.gender-tabs').getByRole('button', { name: gender === 'women' ? '女子' : '男子', exact: true });
      if (await button.getAttribute('aria-pressed') !== 'true') { const response = page.waitForResponse(r => r.url().includes('/content/profiles?') && new URL(r.url()).searchParams.get('gender') === gender); await button.click(); assert.equal((await response).status(), 200); }
      await page.waitForFunction(name => document.querySelector('.person-row h3')?.textContent === name, first[gender]);
      const layout = await page.evaluate(() => { const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; }; return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, container: rect(document.querySelector('.gender-tabs')), buttons: [...document.querySelectorAll('.gender-tabs button')].map(rect), season: rect(document.querySelector('.athlete-season')), firstRowBottom: document.querySelector('.person-row').getBoundingClientRect().bottom }; });
      assert.ok(layout.scrollWidth <= width + 1 && layout.bodyWidth <= width + 1, JSON.stringify(layout)); assert.equal(layout.buttons.length, 2); assert.ok(Math.abs(layout.buttons[0].width - layout.buttons[1].width) <= 1 && Math.abs(layout.buttons[0].top - layout.buttons[1].top) <= 1, JSON.stringify(layout)); assert.ok(layout.buttons.every(b => b.height >= 44 && b.left >= layout.container.left - 1 && b.right <= layout.container.right + 1)); assert.ok(layout.season.bottom <= layout.container.top + 1); assert.ok(layout.firstRowBottom < 700); assert.equal(await button.getAttribute('aria-pressed'), 'true');
      const filename = 'web-' + gender + '-' + width + '.png'; await page.screenshot({ path: path.join(OUT, filename), fullPage: true }); report.views.push({ gender, ...layout, screenshot: filename });
    }
    report.checks.push({ name: width + 'px: real men/women/men switching, equal tap targets, separate season label and no horizontal overflow', passed: true }); await ctx.close();
  }
  assert.deepEqual(report.errors, []); report.passed = true;
}
main().catch(error => { report.passed = false; report.error = error.stack || String(error); console.error(report.error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (vite) await vite.close(); if (server) await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(temp, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, views: report.views.length, report: path.relative(ROOT, path.join(OUT, 'report.json')) })); });
