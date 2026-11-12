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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-club-identity-'));
Object.assign(process.env, { NODE_ENV: 'test', BASE_PATH: '/marathon', PORT: '0',
  MARATHON_DB: path.join(temp, 'test.sqlite'), MARATHON_MEDIA: path.join(temp, 'media'),
  ADMIN_TOKEN: crypto.randomBytes(24).toString('hex') });
const existsSync = fs.existsSync;
fs.existsSync = file => path.resolve(String(file)) === path.join(ROOT, '.env') ? false : existsSync(file);
let app;
try { ({ app } = require(path.join(ROOT, 'server/src/index'))); }
finally { fs.existsSync = existsSync; }
const db = require(path.join(ROOT, 'server/src/db')).getDb();
const report = { kind: 'Real HTTP and browser club identity journey; isolated temporary data', checks: [], screenshots: [], errors: [] };
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
  const filename = 'club-open-live-' + name + '.png';
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
  const first = await account('西湖晨跑发起人'), second = await account('绍兴晨跑发起人'), reporter = await account('寻找跑团的跑友'), member = await account('已加入的晨跑成员');
  const name = '西湖跑团';
  let firstClub, secondClub;
  await check('普通账号立即创建且不获得全局建团资格', async () => {
    firstClub = (await api('POST', '/clubs', first.token, { name, city: '杭州', intro: '周三西湖慢跑', requestId: crypto.randomUUID() })).club;
    const me = await api('GET', '/me', first.token);
    assert.equal(Boolean(me.user.leader), false);
    assert.equal(me.clubs.find(c => c.id === firstClub.id).role, 'owner');
  });
  const creator = await pageFor(second, 320);
  await check('网页同名提示仍允许普通账号创建并直接进入自己的跑团', async () => {
    await creator.goto(base + '/clubs/new');
    await creator.getByLabel(/跑团名称/).fill(name);
    await creator.locator('.same-name-row').filter({ hasText: '杭州' }).waitFor();
    await creator.getByLabel(/活动城市/).fill('绍兴');
    await creator.getByLabel(/一句话介绍/).fill('周末绍兴一起跑');
    await widthCheck(creator, 'create-320');
    await creator.getByRole('button', { name: /^创建跑团/ }).click();
    await creator.waitForURL(/\/clubs\/\d+\?created=1$/);
    const me = await api('GET', '/me', second.token);
    secondClub = me.clubs.find(c => c.name === name);
    assert.ok(secondClub && secondClub.id !== firstClub.id);
    assert.equal(secondClub.city, '绍兴');
    assert.equal(Boolean(me.user.leader), false);
  });
  await check('核验申请、管理员处理、公开标记及私密材料遵守接口边界', async () => {
    const owner = await pageFor(first);
    await owner.goto(base + '/clubs/' + firstClub.id + '/identity');
    await owner.getByLabel(/组织名称/).fill('杭州西湖跑步组织');
    await owner.getByLabel(/组织授权范围/).fill('杭州西湖分团管理');
    await owner.getByLabel(/管理授权与可核对材料/).fill('私密核验材料-不得公开-杭州渠道声明团号 ' + firstClub.id);
    await owner.getByLabel(/私密联系方式/).fill('private-owner@example.test');
    await owner.getByRole('button', { name: '提交核验申请', exact: true }).click();
    await owner.getByText('待核验', { exact: true }).waitFor();
    const mine = await api('GET', '/clubs/' + firstClub.id + '/identity', first.token);
    await api('GET', '/clubs/' + firstClub.id + '/identity', second.token, null, 403);
    await api('POST', '/admin/club-identity/verification/' + mine.verification.id + '/decision', process.env.ADMIN_TOKEN, { decision: 'approve', note: '已核对公共渠道控制权及本团管理授权' });
    const publicClub = (await api('GET', '/clubs/' + firstClub.id + '/public')).club;
    assert.equal(publicClub.verified, true);
    assert.equal(publicClub.verificationScope, '杭州西湖分团管理');
    assert.ok(!JSON.stringify(publicClub).includes('private-owner'));
    assert.ok(!JSON.stringify(publicClub).includes('私密核验材料'));
    await owner.reload();
    await owner.getByText('已核验', { exact: true }).waitFor();
    await widthCheck(owner, 'identity-390');
    await owner.evaluate(token => { localStorage.setItem('marathon_token', token); window.dispatchEvent(new Event('storage')); }, second.token);
    await owner.getByRole('alert').filter({ hasText: '只有本团团长' }).waitFor();
    assert.equal(await owner.getByLabel(/私密联系方式/).count(), 0);
    assert.ok(!(await owner.locator('body').innerText()).includes('private-owner'));
    await owner.context().close();
  });
  await check('两地同名目录按城市辨认并进入对应名片，名片展示团号和负责人', async () => {
    for (const width of [320, 390, 1440]) {
      const page = await pageFor(null, width);
      await page.goto(base + '/clubs');
      await page.getByRole('textbox', { name: '搜索跑团', exact: true }).fill(name);
      await page.locator('.club-hit').filter({ hasText: '绍兴' }).waitFor();
      const body = await page.locator('body').innerText();
      for (const value of ['杭州', '绍兴']) assert.ok(body.includes(value), 'directory missing ' + value);
      // Compact directory cards identify the city; full identity belongs to the
      // linked public card. Verify both real links and the API identity payload.
      const directory = await api('GET', '/clubs/directory?q=' + encodeURIComponent(name));
      for (const [club, who] of [[firstClub, first], [secondClub, second]]) {
        const row = directory.clubs.find(item => item.id === club.id);
        assert.equal(row.leader, who.user.nickname);
        assert.equal(row.city, club.city);
        assert.equal(await page.locator('.club-hit').filter({ hasText: club.city }).locator('.result-identity').getAttribute('href'), '/marathon/clubs/' + club.id + '/public');
      }
      await widthCheck(page, 'directory-' + width);
      await page.goto(base + '/clubs/' + firstClub.id + '/public');
      await page.getByRole('heading', { name, exact: true }).waitFor();
      const intro = await page.locator('body').innerText();
      for (const value of ['杭州', first.user.nickname, '#' + firstClub.id, '身份已核验']) assert.ok(intro.includes(value), 'intro missing ' + value);
      assert.ok(!intro.includes('private-owner'));
      await widthCheck(page, 'public-' + width);
      await page.context().close();
    }
  });
  await check('跑友私密提交反馈、不公开案件、不自动下架也不转移成员', async () => {
    await api('POST', '/clubs/join', member.token, { clubId: firstClub.id });
    const queued = db.prepare("SELECT id FROM club_requests WHERE club_id=? AND user_id=? AND status='pending'").get(firstClub.id, member.user.id);
    await api('POST', '/clubs/' + firstClub.id + '/requests/' + queued.id, first.token, { decision: 'approve' });
    const page = await pageFor(reporter, 320);
    await page.goto(base + '/clubs/' + firstClub.id + '/report');
    await page.getByLabel(/具体事实与可核对材料/).fill('私密工单-希望核对授权说明，尚不能据同名判断冒用');
    await page.getByLabel(/私密联系方式/).fill('private-reporter@example.test');
    await page.getByRole('button', { name: '私密提交反馈', exact: true }).click();
    await page.getByText(/反馈已私密提交/).waitFor();
    const own = (await api('GET', '/me/club-reports', reporter.token)).reports;
    assert.equal(own.length, 1);
    await page.getByRole('button', { name: /更新说明与联系方式/ }).click();
    assert.equal(await page.getByLabel(/具体事实与可核对材料/).inputValue(), own[0].detail);
    assert.equal(await page.getByLabel(/私密联系方式/).inputValue(), 'private-reporter@example.test');
    assert.equal(await page.getByLabel('需要核对的情况').isDisabled(), true);
    await page.getByLabel(/具体事实与可核对材料/).fill('新增私密事实-已核对另一个组织渠道，请以最新材料为准');
    await page.getByLabel(/私密联系方式/).fill('updated-private-reporter@example.test');
    await page.getByLabel(/相关公共来源/).fill('https://example.test/new-organization-evidence');
    await page.getByRole('button', { name: '保存工单更新', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '已更新' }).waitFor();
    const updated = (await api('GET', '/me/club-reports', reporter.token)).reports;
    assert.equal(updated.length, 1); assert.equal(updated[0].id, own[0].id);
    assert.equal(updated[0].createdAt, own[0].createdAt);
    assert.equal(updated[0].detail, '新增私密事实-已核对另一个组织渠道，请以最新材料为准');
    assert.equal(updated[0].contact, 'updated-private-reporter@example.test');
    assert.equal(updated[0].sourceUrl, 'https://example.test/new-organization-evidence');
    await page.getByRole('button', { name: /更新说明与联系方式/ }).click();
    await page.getByRole('button', { name: '保存工单更新', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '相同内容，无需重复提交' }).waitFor();
    assert.deepEqual((await api('GET', '/me/club-reports', reporter.token)).reports, updated);
    assert.equal((await api('GET', '/me/club-reports', first.token)).reports.length, 0);
    const directory = await api('GET', '/clubs/directory?q=' + encodeURIComponent(name));
    assert.equal(directory.clubs.length, 2);
    assert.ok(!JSON.stringify(directory).includes('private-reporter'));
    const memberIds = db.prepare('SELECT user_id FROM club_members WHERE club_id=? ORDER BY user_id').all(firstClub.id);
    await api('POST', '/admin/club-identity/report/' + own[0].id + '/decision', process.env.ADMIN_TOKEN, { decision: 'restrict', note: '需补充具体组织关系，暂时停止公开招募并提供复核入口' });
    assert.deepEqual(db.prepare('SELECT user_id FROM club_members WHERE club_id=? ORDER BY user_id').all(firstClub.id), memberIds);
    assert.equal(db.prepare('SELECT owner_id FROM clubs WHERE id=?').get(firstClub.id).owner_id, first.user.id);
    await api('GET', '/clubs/' + firstClub.id, first.token);
    await api('POST', '/clubs/join', reporter.token, { clubId: firstClub.id }, 403);
    await widthCheck(page, 'report-320');
    await page.context().close();
  });
  await check('受限公开名片和邀请页仍可供已有成员进入，游客与团外保持限制', async () => {
    const code = db.prepare('SELECT code FROM clubs WHERE id=?').get(firstClub.id).code;
    const before = db.prepare('SELECT user_id,role FROM club_members WHERE club_id=? ORDER BY user_id').all(firstClub.id);
    for (const width of [320, 390, 1440]) {
      for (const actor of [first, member, reporter, null]) {
        const page = await pageFor(actor, width);
        const joined = actor === first || actor === member;
        for (const path of ['/clubs/' + firstClub.id + '/public', '/clubs/invite/' + code]) {
          await page.goto(base + path);
          await page.getByRole('heading', { name: '暂时停止公开展示与招募', exact: true }).waitFor();
          const enter = page.getByRole('button', { name: '进入已加入的跑团', exact: true });
          assert.equal(await enter.count(), joined ? 1 : 0);
          const identity = page.getByRole('link', { name: /我是团长，查看说明与补充途径/ });
          assert.equal(await identity.count(), actor === first ? 1 : 0);
          assert.equal(await page.getByRole('link', { name: /向平台补充说明/ }).count(), 1);
          assert.equal(await page.getByRole('button', { name: /申请加入|分享跑团/ }).count(), 0);
          assert.ok(!(await page.locator('body').innerText()).includes('updated-private-reporter'));
          const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
          assert.ok(size.scroll <= size.width + 1);
          if (joined) {
            await enter.click();
            await page.waitForURL(new RegExp('/clubs/' + firstClub.id + '$'));
            await page.getByRole('heading', { name, exact: true }).waitFor();
          }
        }
        await page.context().close();
      }
    }
    const page = await pageFor(member);
    await page.goto(base + '/clubs/' + firstClub.id + '/public');
    await page.getByRole('button', { name: '进入已加入的跑团', exact: true }).waitFor();
    await page.evaluate(token => {
      localStorage.setItem('marathon_token', token);
      document.querySelector('.restricted-enter').click();
    }, reporter.token);
    await page.waitForLoadState('networkidle');
    assert.match(page.url(), /\/public$/);
    assert.equal(await page.getByRole('button', { name: '进入已加入的跑团', exact: true }).count(), 0);
    assert.deepEqual(db.prepare('SELECT user_id,role FROM club_members WHERE club_id=? ORDER BY user_id').all(firstClub.id), before);
    await page.context().close();
  });
  await check('受限团长入口在换号时清除，迟到的旧账号摘要不能恢复入口', async () => {
    const page = await pageFor(first);
    await page.goto(base + '/clubs/' + firstClub.id + '/public');
    await page.getByRole('link', { name: /我是团长，查看说明与补充途径/ }).waitFor();
    await page.evaluate(token => {
      localStorage.setItem('marathon_token', token);
      document.querySelector('a[href$="/identity"]').click();
    }, member.token);
    await page.waitForLoadState('networkidle');
    assert.match(page.url(), /\/public$/);
    assert.equal(await page.getByRole('link', { name: /我是团长，查看说明与补充途径/ }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '进入已加入的跑团', exact: true }).count(), 1);
    let release, pending;
    const intercepted = new Promise(resolve => { pending = resolve; });
    await page.route('**/marathon/api/clubs/' + firstClub.id + '/public', async route => {
      const response = await route.fetch();
      if (route.request().headers().authorization === 'Bearer ' + first.token) {
        await new Promise(resolve => { release = resolve; pending(); });
      }
      await route.fulfill({ response });
    });
    await page.evaluate(token => { localStorage.setItem('marathon_token', token); window.dispatchEvent(new Event('storage')); }, first.token);
    await intercepted;
    await page.evaluate(token => { localStorage.setItem('marathon_token', token); window.dispatchEvent(new Event('storage')); }, reporter.token);
    await page.getByRole('heading', { name: '暂时停止公开展示与招募', exact: true }).waitFor();
    release();
    await page.waitForLoadState('networkidle');
    assert.equal(await page.getByRole('link', { name: /我是团长，查看说明与补充途径/ }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '进入已加入的跑团', exact: true }).count(), 0);
    assert.equal(await page.getByRole('link', { name: /向平台补充说明/ }).count(), 1);
    await page.context().close();
  });
  await check('离开核验页后的迟到响应不会把私密材料带到公开页面', async () => {
    const page = await pageFor(first);
    let release, pending;
    const intercepted = new Promise(resolve => { pending = resolve; });
    await page.route('**/marathon/api/clubs/' + firstClub.id + '/identity', async route => {
      const response = await route.fetch();
      await new Promise(resolve => { release = resolve; pending(); });
      await route.fulfill({ response });
    });
    await page.goto(base + '/clubs/' + firstClub.id + '/identity');
    await intercepted;
    await page.getByRole('link', { name: '返回跑团', exact: true }).click();
    await page.waitForURL(new RegExp('/clubs/' + firstClub.id + '$'));
    release();
    await page.waitForLoadState('networkidle');
    assert.ok(!(await page.locator('body').innerText()).includes('私密核验材料'));
    await page.context().close();
  });
  await check('平台后台读取私密材料并记录核验决定，切换管理员凭据即清空材料', async () => {
    const v = (await api('POST', '/clubs/' + secondClub.id + '/identity', second.token, {
      organization: '绍兴西湖组织', scope: '绍兴独立分团', evidence: '后台私密材料-不得残留', contact: 'admin-private@example.test'
    })).verification;
    for (const width of [390, 1440]) {
      const page = await pageFor(null, width);
      await page.context().addInitScript(token => sessionStorage.setItem('marathon_admin', token), process.env.ADMIN_TOKEN);
      await page.goto(base + '/admin');
      await page.getByRole('heading', { name: '运营总览', exact: true }).waitFor();
      const toggle = page.getByRole('button', { name: '打开导航菜单', exact: true });
      if (await toggle.isVisible()) await toggle.click();
      await page.locator('.navigation-groups').getByRole('button', { name: /跑团身份/ }).click();
      await page.locator('.identity-case').filter({ hasText: '绍兴' }).click();
      await page.getByText('后台私密材料-不得残留', { exact: true }).waitFor();
      if (width === 390) {
        await page.getByLabel('下一步', { exact: true }).selectOption('approve');
        await page.getByLabel('处理依据与下一步说明', { exact: true }).fill('已核对绍兴分团公共渠道及管理授权，仅代表此团号。');
        await page.getByRole('button', { name: '确认并记录决定', exact: true }).click();
        await page.getByText('处理决定已记录，相关用户可查看回复并补充说明。', { exact: true }).waitFor();
        assert.equal((await api('GET', '/clubs/' + secondClub.id + '/identity', second.token)).verification.status, 'verified');
      }
      await widthCheck(page, 'admin-' + width);
      await page.evaluate(() => { sessionStorage.setItem('marathon_admin', 'another-admin-session'); window.dispatchEvent(new Event('storage')); });
      assert.equal(await page.locator('.identity-case-detail').filter({ hasText: '后台私密材料-不得残留' }).count(), 0);
      await page.context().close();
    }
    assert.ok(v.id);
  });
  assert.deepEqual(report.errors, []);
  await creator.context().close();
}
main().catch(error => { report.error = error.stack || String(error); process.exitCode = 1; console.error(report.error); }).finally(async () => {
  if (browser) await browser.close();
  if (vite) await vite.close();
  if (server) await new Promise(resolve => server.close(resolve));
  db.close(); fs.rmSync(temp, { recursive: true, force: true });
  report.passed = !report.error && report.errors.length === 0;
  fs.writeFileSync(path.join(__dirname, 'club-open-creation-live-report.json'), JSON.stringify(report, null, 2));
});
