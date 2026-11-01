/* Browser + HTTP integration against an ephemeral database. No production env,
 * accounts, files or services are used. Run: npm run test:club-identity */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const ROOT = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-legal-'));
Object.assign(process.env, { NODE_ENV: 'test', BASE_PATH: '/marathon', PORT: '0',
  MARATHON_DB: path.join(temp, 'test.sqlite'), MARATHON_MEDIA: path.join(temp, 'media'),
  ADMIN_TOKEN: crypto.randomBytes(24).toString('hex') });
const existsSync = fs.existsSync;
fs.existsSync = file => path.resolve(String(file)) === path.join(ROOT, '.env') ? false : existsSync(file);
let app;
try { ({ app } = require(path.join(ROOT, 'server/src/index'))); }
finally { fs.existsSync = existsSync; }
const db = require(path.join(ROOT, 'server/src/db')).getDb();
const report = { kind: 'Real HTTP and browser legal documents and privacy rights journey; isolated temporary data', checks: [], screenshots: [], errors: [] };
let server, origin, vite, browser, base;
async function api(method, url, token, body, status = 200) {
  const response = await fetch(origin + '/marathon/api' + url, { method,
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  assert.equal(response.status, status, `${method} ${url}: ${JSON.stringify(data)}`);
  return data;
}
async function check(name, fn) {
  await fn(); report.checks.push({ name, passed: true }); console.log('PASS ' + name);
}
async function account(nickname) { return api('POST', '/auth/register', null, { nickname, password: 'Club-identity-2026!', legalConsent: { accepted: true, version: require('../../shared/legal-documents.json').version } }); }
async function pageFor(who, width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  if (who) await context.addInitScript(({ token, nickname }) => { localStorage.setItem('marathon_token', token); localStorage.setItem('marathon_name', nickname); }, { token: who.token, nickname: who.user.nickname });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  return page;
}
async function widthCheck(page, name) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth }));
  assert.ok(size.body <= size.viewport + 1 && size.document <= size.viewport + 1, name + ' overflows: ' + JSON.stringify(size));
  const filename = 'legal-live-' + name + '.png';
  await page.screenshot({ path: path.join(__dirname, filename), fullPage: true });
  report.screenshots.push(filename);
}
async function main() {
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  origin = 'http://127.0.0.1:' + server.address().port;
  const { createServer } = await import(pathToFileURL(path.join(ROOT, 'web/node_modules/vite/dist/node/index.js')).href);
  vite = await createServer({ root: path.join(ROOT, 'web'), cacheDir: path.join(temp, 'vite-cache'), configFile: path.join(ROOT, 'web/vite.config.js'), server: { host: '127.0.0.1', port: 0, proxy: { '/marathon/api': { target: origin, changeOrigin: true } } } });
  await vite.listen();
  base = 'http://127.0.0.1:' + vite.httpServer.address().port + '/marathon';
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const catalog = await api('GET', '/legal');
  await check('网页七个入口在接口404或不可用时仍能读内置正文，恢复后可更新', async () => {
    for (const status of [404, 503]) {
      const page = await pageFor(null);
      let online = false;
      const updated = structuredClone(catalog);
      updated.operator.contactEmail = 'recovered-privacy@example.test';
      await page.route('**/marathon/api/legal', route => route.fulfill({
        status: online ? 200 : status, contentType: 'application/json',
        body: JSON.stringify(online ? updated : { error: 'Unavailable test endpoint' })
      }));
      for (const doc of catalog.documents) {
        await page.goto(base + '/legal/' + doc.id);
        await page.getByRole('heading', { name: doc.title, exact: true }).waitFor();
        await page.getByRole('alert').filter({ hasText: '当前显示内置版本' }).waitFor();
        assert.equal(await page.locator('.legal-directory a').count(), 7);
        for (const section of doc.sections) assert.ok((await page.locator('body').innerText()).includes(section.title));
      }
      online = true;
      await page.getByRole('button', { name: '重新读取', exact: true }).click();
      await page.getByText('recovered-privacy@example.test', { exact: true }).waitFor();
      assert.equal(await page.getByRole('alert').count(), 0);
      await page.context().close();
    }
  });
  await check('游客直接读取七份完整文档，未核实经营资料保持待确认', async () => {
    assert.deepEqual(catalog.documents.map(d => d.id), ['privacy', 'terms', 'collection', 'sharing', 'permissions', 'children', 'rights']);
    assert.equal(catalog.ready, false);
    assert.ok(catalog.documents.every(d => d.sections.length >= 3));
    await api('GET', '/me/privacy-requests', null, null, 401);
    for (const width of [320, 390, 1440]) {
      const page = await pageFor(null, width);
      for (const doc of catalog.documents) {
        await page.goto(base + '/legal/' + doc.id);
        await page.getByRole('heading', { name: doc.title, exact: true }).waitFor();
        const body = await page.locator('body').innerText();
        assert.ok(body.includes(catalog.version));
        assert.ok(!body.includes('marathon_token'));
        for (const section of doc.sections) assert.ok(body.includes(section.title), doc.id + ' missing ' + section.title);
        await widthCheck(page, doc.id + '-' + width);
      }
      await page.context().close();
    }
  });
  let first;
  await check('网页不默认勾选、阅读不会代替同意，主动同意后记录版本', async () => {
    const page = await pageFor(null);
    await page.goto(base + '/mine');
    await page.getByRole('button', { name: '登录 / 注册', exact: true }).click();
    const checkbox = page.getByRole('checkbox');
    await checkbox.waitFor();
    assert.equal(await checkbox.isChecked(), false);
    await page.getByRole('link', { name: '用户协议', exact: true }).click();
    await page.getByRole('heading', { name: '赛历用户服务协议', exact: true }).waitFor();
    await page.goBack();
    await page.getByRole('button', { name: '登录 / 注册', exact: true }).click();
    assert.equal(await checkbox.isChecked(), false);
    await page.getByRole('button', { name: '注册账号', exact: true }).click();
    await page.getByRole('textbox', { name: '昵称', exact: true }).fill('网页主动确认协议');
    await page.getByPlaceholder('密码，至少 8 位', { exact: true }).fill('Legal-web-2026!');
    await page.getByPlaceholder('再输入一次密码', { exact: true }).fill('Legal-web-2026!');
    await page.getByRole('button', { name: '注册', exact: true }).click();
    await page.getByText(/请先阅读/).waitFor();
    await checkbox.check();
    await page.getByRole('button', { name: '注册', exact: true }).click();
    await page.getByRole('heading', { name: '网页主动确认协议', exact: true }).waitFor();
    await page.context().close();
    first = await account('隐私权利申请人');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM legal_acceptances WHERE user_id=? AND scope='terms'").get(first.user.id).n, 1);
  });
  let caseId;
  const second = await account('另一个隐私申请人');
  await check('本人在网页私密提交注销申请，账号与业务数据未被误删', async () => {
    const page = await pageFor(first, 320);
    await page.goto(base + '/legal/rights');
    await page.getByLabel('需要办理的事项').selectOption('close');
    await page.getByLabel('具体事项', { exact: true }).fill('仅本人可见-注销申请资料-请先核对关联记录与必要保留范围');
    await page.getByRole('button', { name: '私密提交申请', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '申请已私密提交' }).waitFor();
    await page.locator('.rights-record').filter({ hasText: '仅本人可见-注销申请资料' }).waitFor();
    const own = (await api('GET', '/me/privacy-requests', first.token)).requests;
    assert.equal(own.length, 1); caseId = own[0].id;
    assert.equal((await api('GET', '/me/privacy-requests', second.token)).requests.length, 0);
    assert.ok(db.prepare('SELECT id FROM users WHERE id=?').get(first.user.id));
    await widthCheck(page, 'private-request-320');
    await page.evaluate(token => { localStorage.setItem('marathon_token', token); window.dispatchEvent(new Event('storage')); }, second.token);
    await page.waitForLoadState('networkidle');
    assert.ok(!(await page.locator('body').innerText()).includes('仅本人可见-注销申请资料'));
    assert.equal(await page.getByLabel('具体事项', { exact: true }).inputValue(), '');
    await page.context().close();
  });
  await check('平台后台记录回复，本人可读，办结不会伪装成自动注销', async () => {
    for (const width of [390, 1440]) {
      const page = await pageFor(null, width);
      await page.context().addInitScript(token => sessionStorage.setItem('marathon_admin', token), process.env.ADMIN_TOKEN);
      await page.goto(base + '/admin');
      await page.getByRole('heading', { name: '运营总览', exact: true }).waitFor();
      const toggle = page.getByRole('button', { name: '打开导航菜单', exact: true });
      if (await toggle.isVisible()) await toggle.click();
      await page.locator('.navigation-groups').getByRole('button', { name: /个人信息权利/ }).click();
      await page.locator('.case').filter({ hasText: '隐私权利申请人' }).click();
      await page.getByText('仅本人可见-注销申请资料-请先核对关联记录与必要保留范围', { exact: true }).waitFor();
      if (width === 390) {
        await page.getByLabel('处理状态', { exact: true }).selectOption('needs_info');
        await page.getByLabel('向申请人的回复', { exact: true }).fill('请确认是否一并删除指定收藏；不需要提供密码或证件。');
        await page.getByRole('button', { name: '记录处理结果', exact: true }).click();
        await page.getByRole('status').filter({ hasText: '处理回复已记录' }).waitFor();
      }
      await widthCheck(page, 'rights-admin-' + width);
      await page.evaluate(() => { sessionStorage.setItem('marathon_admin', 'changed-session'); window.dispatchEvent(new Event('storage')); });
      assert.equal(await page.locator('.case-detail').filter({ hasText: '仅本人可见-注销申请资料' }).count(), 0);
      await page.context().close();
    }
    const page = await pageFor(first);
    await page.goto(base + '/legal/rights');
    await page.getByText('请确认是否一并删除指定收藏；不需要提供密码或证件。', { exact: true }).waitFor();
    await page.getByLabel('需要办理的事项').selectOption('close');
    await page.getByLabel('具体事项', { exact: true }).fill('本人补充确认：请同时删除指定收藏和个人资料。');
    await page.getByRole('button', { name: '私密提交申请', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '申请已私密提交' }).waitFor();
    const own = (await api('GET', '/me/privacy-requests', first.token)).requests;
    assert.equal(own.length, 1); assert.equal(own[0].id, caseId);
    assert.ok(own[0].detail.includes('本人补充确认'));
    await api('POST', '/admin/privacy-requests/' + caseId + '/decision', process.env.ADMIN_TOKEN, { status: 'completed', response: '已核对并回复，本测试记录不执行实际注销。' });
    assert.ok(db.prepare('SELECT id FROM users WHERE id=?').get(first.user.id));
    await page.context().close();
  });
  await check('离开权利页后迟到的工单响应不把私密材料渲染到公开文档', async () => {
    const page = await pageFor(first);
    let release, pending;
    const intercepted = new Promise(resolve => { pending = resolve; });
    await page.route('**/marathon/api/me/privacy-requests', async route => {
      const response = await route.fetch();
      await new Promise(resolve => { release = resolve; pending(); });
      await route.fulfill({ response });
    });
    await page.goto(base + '/legal/rights');
    await intercepted;
    await page.getByRole('link', { name: '赛历用户服务协议', exact: true }).click();
    await page.getByRole('heading', { name: '赛历用户服务协议', exact: true }).waitFor();
    release(); await page.waitForLoadState('networkidle');
    assert.ok(!(await page.locator('body').innerText()).includes('本人补充确认'));
    await page.context().close();
  });
  assert.deepEqual(report.errors, []);
}
main().catch(error => { report.error = error.stack || String(error); process.exitCode = 1; console.error(report.error); }).finally(async () => {
  if (browser) await browser.close();
  if (vite) await vite.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close(); fs.rmSync(temp, { recursive: true, force: true });
  report.passed = !report.error && report.errors.length === 0;
  fs.writeFileSync(path.join(__dirname, 'legal-live-acceptance-report.json'), JSON.stringify(report, null, 2));
});
