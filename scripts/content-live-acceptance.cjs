/* Real HTTP/browser acceptance. The app serves web/dist on an ephemeral localhost
 * port; all writes use a temporary SQLite database and media directory. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.CONTENT_AUDIT_OUT ? path.resolve(process.env.CONTENT_AUDIT_OUT) : path.join(ROOT, 'design/previews/content-center-20261111');
assert.ok(fs.existsSync(path.join(ROOT, 'web/dist/index.html')), 'Build web/dist before running this acceptance.');
fs.mkdirSync(OUT, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'marathon-content-live-'));
Object.assign(process.env, { NODE_ENV: 'test', BASE_PATH: '/marathon', PORT: '0', MARATHON_DB: path.join(temporary, 'app.sqlite'), MARATHON_MEDIA: path.join(temporary, 'media'), ADMIN_TOKEN: crypto.randomBytes(24).toString('hex') });
const exists = fs.existsSync;
fs.existsSync = file => path.resolve(String(file)) === path.join(ROOT, '.env') ? false : exists(file);
let app;
try { ({ app } = require('../server/src/index')); } finally { fs.existsSync = exists; }
const { getDb } = require('../server/src/db');
const report = { startedAt: new Date().toISOString(), isolation: 'Temporary SQLite/media; ephemeral localhost port; built web/dist; .env not loaded; remote browser requests blocked.', checks: [], views: [], errors: [], limitations: ['No publication to production.', 'WeChat device behavior and official-article navigation require separate real-device verification.', 'UI fixtures are synthetic and removed with the temporary database. Real public athlete and pacer files are read without modification.'] };
let server, origin, base, browser;
async function api(method, suffix, actor, body, expected = 200) {
  const options = { method, headers: actor ? { Authorization: 'Bearer ' + (typeof actor === 'string' ? actor : actor.token) } : {} };
  if (body != null) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
  const response = await fetch(origin + '/marathon/api' + suffix, options);
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${suffix}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
async function check(name, fn) { await fn(); report.checks.push({ name, passed: true }); console.log('PASS ' + name); }
async function context(actor, width = 390, admin = false) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  await ctx.route('**/*', route => /^(https?:\/\/(127\.0\.0\.1|localhost)(:|\/)|data:|blob:)/.test(route.request().url()) ? route.continue() : route.abort());
  if (actor) await ctx.addInitScript(({ actor, admin }) => {
    if (admin) sessionStorage.setItem('marathon_admin', actor.token);
    else { localStorage.setItem('marathon_token', actor.token); localStorage.setItem('marathon_name', actor.nickname || ''); }
  }, { actor, admin });
  const p = await ctx.newPage(); p.setDefaultTimeout(12000);
  p.on('pageerror', error => report.errors.push({ url: p.url(), message: error.message }));
  p.on('response', response => { if (response.url().includes('/api/') && response.status() >= 500) report.errors.push({ url: response.url(), status: response.status() }); });
  return { ctx, p };
}
async function snapshot(p, name) {
  await p.evaluate(() => document.fonts.ready);
  const layout = await p.evaluate(() => {
    const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; };
    const overflow = [...document.querySelectorAll('main,section,article,form,input,textarea,select,button')].filter(el => visible(el) && el.getBoundingClientRect().right > innerWidth + 1 && !el.closest('.journal-tabs,.navigation-groups,.operations-sidebar,.gender-tabs')).map(el => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right })).slice(0, 8);
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, overflow };
  });
  const filename = name + '-' + layout.width + '.png';
  await p.screenshot({ path: path.join(OUT, filename), fullPage: true });
  report.views.push({ name, ...layout, screenshot: filename });
  assert.ok(layout.scrollWidth <= layout.width + 1 && layout.bodyWidth <= layout.width + 1, filename + ' page overflow: ' + JSON.stringify(layout));
  assert.deepEqual(layout.overflow, [], filename + ' visible element overflow');
}
async function adminSection(p) {
  await p.goto(base + '/admin', { waitUntil: 'networkidle' });
  const menu = p.getByRole('button', { name: '打开导航菜单', exact: true });
  if (await menu.isVisible()) await menu.click();
  await p.locator('.navigation-item').filter({ hasText: '资讯中心' }).click();
  await p.locator('.content-admin').waitFor();
}
async function main() {
  server = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); });
  origin = 'http://127.0.0.1:' + server.address().port; base = origin + '/marathon';
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const legalVersion = require('../shared/legal-documents.json').version;
  const registered = await api('POST', '/auth/register', null, { nickname: '资讯验收晨光团长', password: 'Content-live-2026!', legalConsent: { version: legalVersion, accepted: true } });
  const owner = { ...registered.user, token: registered.token };
  const club = (await api('POST', '/clubs', owner, { name: '晨光一起跑资讯验收团', city: '杭州', requestId: crypto.randomUUID() })).club;
  const men = await api('GET', '/content/profiles?type=athlete&gender=men&page=1&pageSize=20');
  const women = await api('GET', '/content/profiles?type=athlete&gender=women&page=1&pageSize=20');
  const pacers = await api('GET', '/content/profiles?type=pacer&page=1&pageSize=20');
  assert.equal(men.total, 100); assert.equal(women.total, 100); assert.ok(pacers.total > 0, 'At least one source-backed official pacer person is available.');
  assert.equal(new Set([...men.profiles, ...women.profiles, ...pacers.profiles].map(p => p.id)).size, 40 + pacers.profiles.length);
  report.fixture = { registeredUsers: 1, createdClubs: 1, athletes: men.total + women.total, pacers: pacers.total, requestedPacers: 10, pacerIdentityCoverage: pacers.meta?.coverage || {}, source: 'Real static research; synthetic temporary articles' };
  let industryId, clubArticleId;
  const actorBrowser = await context(owner), adminBrowser = await context({ token: process.env.ADMIN_TOKEN }, 1024, true);
  await check('Homepage exposes the single running-news entrance', async () => {
    const p = actorBrowser.p; await p.goto(base + '/', { waitUntil: 'networkidle' });
    await p.getByRole('link', { name: '跑圈资讯', exact: true }).click();
    await p.waitForURL('**/marathon/news'); await p.locator('.journal-intro h1').waitFor();
    assert.match(await p.locator('.journal-intro h1').innerText(), /跑圈/);
  });
  await check('Athlete filters show twenty men and twenty women with source-backed details', async () => {
    const p = actorBrowser.p; await p.getByRole('link', { name: '运动员', exact: true }).click();
    await p.locator('.person-row').nth(19).waitFor(); assert.equal(await p.locator('.person-row').count(), 20);
    await p.getByRole('button', { name: '女子', exact: true }).click(); await p.locator('.person-row').nth(19).waitFor();
    assert.equal(await p.locator('.person-row').count(), 20); assert.ok((await p.locator('.person-row').first().innerText()).includes(women.profiles[0].name));
    await p.locator('.person-row').first().click(); await p.locator('.profile-hero h1').waitFor();
    assert.equal(await p.locator('.profile-hero h1').innerText(), women.profiles[0].name);
    assert.ok((await p.locator('.profile-article .guide-md').innerText()).length>200); assert.equal(await p.locator('a[href^="http"]').count(),0);
  });
  await check('Pacer profiles match collected evidence without claiming a national ranking', async () => {
    const p = actorBrowser.p; await p.goto(base + '/news?tab=pacer', { waitUntil: 'networkidle' }); await p.locator('.person-row').nth(pacers.profiles.length - 1).waitFor();
    assert.equal(await p.locator('.person-row').count(), pacers.profiles.length); assert.ok(await p.locator('#pacer-race option').count()>1);
    assert.ok(pacers.profiles.every(profile=>profile.profileKind==='official_pacer_person'&&profile.assignments.length&&profile.assignments.every(a=>a.raceGrade==='A'&&a.sourceUrl)));
    await p.locator('.person-row').first().click(); await p.locator('.profile-hero').waitFor(); assert.ok(await p.locator('.pacer-assignment').count()); assert.ok((await p.locator('.profile-article .guide-md').innerText()).length>100); assert.equal(await p.locator('a[href^="http"]').count(),0);
  });
  await check('Club publishing UI saves a private draft, publishes it, then withdraws it', async () => {
    const p = actorBrowser.p; await p.goto(base + '/clubs/' + club.id + '/news', { waitUntil: 'networkidle' });
    await p.getByRole('link', { name: '发布', exact: true }).click(); await p.locator('.journal-editor form').waitFor();
    await p.getByLabel('标题', { exact: true }).fill('周末十公里，记录一起跑过的晨光');
    await p.getByLabel('摘要', { exact: true }).fill('本篇仅供临时隔离验收，记录跑团训练与分享的发布流程。');
    await p.getByLabel('正文', { exact: true }).fill('## 一起出发\n\n这是一篇浏览器真实发布的临时跑团文章。');
    const created = p.waitForResponse(r => r.url().endsWith('/clubs/' + club.id + '/content/articles') && r.request().method() === 'POST');
    await p.getByRole('button', { name: '保存草稿', exact: true }).click(); clubArticleId = (await (await created).json()).article.id;
    await p.getByText('草稿已保存，仅管理人员可见。', { exact: true }).waitFor();
    await api('GET', '/content/articles/' + clubArticleId, null, null, 404);
    await p.getByRole('button', { name: '发布文章', exact: true }).click();
    await p.getByRole('status').filter({hasText:'已发布'}).waitFor();
    assert.equal((await api('GET', '/content/articles/' + clubArticleId)).article.clubId, club.id);
    await p.goto(base + '/clubs/' + club.id + '/news', { waitUntil: 'networkidle' }); await p.locator('.journal-row').filter({ hasText: '记录一起跑过的晨光' }).waitFor();
    await p.locator('.journal-row').first().click(); await p.locator('.journal-detail').waitFor(); assert.match(await p.locator('.journal-detail').innerText(), /真实发布/);
    await p.goto(base + '/clubs/' + club.id + '/news/manage', { waitUntil: 'networkidle' });
    await p.locator('.editor-list>button').filter({ hasText: '记录一起跑过的晨光' }).click();
    await p.getByRole('button', { name: '下架', exact: true }).click(); await p.getByText('文章已下架。', { exact: true }).waitFor();
    await api('GET', '/content/articles/' + clubArticleId, null, null, 404);
    // Restore this temporary fixture for the responsive club-reader screenshots.
    await api('PUT', '/clubs/' + club.id + '/content/articles/' + clubArticleId, owner, { status: 'published' });
  });
  await check('New backend Content Center publishes an industry article through the real editor', async () => {
    const p = adminBrowser.p; await adminSection(p); await p.getByRole('button', { name: '新建内容', exact: true }).first().click();
    await p.getByLabel(/^标题/).fill('从成绩记录到人物档案：认识中国马拉松');
    await p.getByLabel(/^摘要/).fill('这篇临时验收文章用于核对后台内容发布、来源查阅和前台阅读效果。');
    await p.getByLabel(/^正文/).fill('## 从一条成绩开始\n\n每一份人物档案都保留公开来源、比赛日期与个人最佳成绩的排名口径。');
    await p.getByLabel('来源名称', { exact: true }).fill('临时验收编辑部');
    await p.getByLabel('原文 / 来源链接', { exact: true }).fill('https://worldathletics.org/records/all-time-toplists/road-running/marathon/outdoor/men/senior?regionType=countries&region=chn&bestResultsOnly=true');
    const created = p.waitForResponse(r => r.url().endsWith('/admin/content/articles') && r.request().method() === 'POST');
    await p.getByRole('button', { name: '发布内容', exact: true }).click(); industryId = (await (await created).json()).article.id;
    await p.getByText('已发布到资讯中心。', { exact: true }).waitFor();
    assert.equal((await api('GET', '/content/articles/' + industryId)).article.category, 'industry');
    const reader = actorBrowser.p; await reader.goto(base + '/news/articles/' + industryId, { waitUntil: 'networkidle' }); await reader.locator('.journal-detail h1').waitFor();
    assert.match(await reader.locator('.guide-md').innerText(), /每一份人物档案/); assert.equal(await reader.locator('a[href^="http"]').count(),0);
  });
  await check('Compact mobile sections show the first profile on the opening screen and keep filters on one line', async () => {
    const mobile = await context(owner, 320), p = mobile.p;
    await p.goto(base + '/news?tab=athlete', { waitUntil: 'networkidle' });
    await p.locator('.person-row').nth(19).waitFor();
    const layout = await p.evaluate(() => {
      const row = document.querySelector('.person-row').getBoundingClientRect();
      const controls = [...document.querySelector('.gender-tabs').children].map(el => { const r = el.getBoundingClientRect(); return { center: r.y + r.height / 2, height: r.height }; });
      return { firstRowBottom: row.bottom, controls, hasPromo: !!document.querySelector('.journal-features,.journal-footer') };
    });
    assert.ok(layout.firstRowBottom < 700, JSON.stringify(layout)); assert.equal(layout.hasPromo, false);
    assert.ok(Math.max(...layout.controls.map(x => x.center)) - Math.min(...layout.controls.map(x => x.center)) < 3, 'Gender filters stay on one row');
    assert.ok(layout.controls.slice(0, 2).every(x => x.height >= 44), 'Gender filters have 44px tap targets');
    await mobile.ctx.close();
  });
  await check('Unavailable content hides counts and stale notes, offers a friendly retry, then recovers real profiles', async () => {
    const reader = await context(owner), p = reader.p; let unavailable = true;
    await p.route(/\/marathon\/api\/content\/profiles(?:\?|$)/, route => unavailable ? route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Cannot GET /content/profiles HTTP 404' }) }) : route.continue());
    await p.goto(base + '/news?tab=athlete', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: '重新加载', exact: true }).waitFor();
    assert.doesNotMatch(await p.locator('.journal-page').innerText(), /HTTP|404|Cannot GET|管理员|0 位/);
    assert.equal(await p.locator('.ranking-note').count(), 0); assert.equal(await p.locator('.section-caption>span').count(), 0);
    await snapshot(p, 'athletes-unavailable');
    unavailable = false; await p.getByRole('button', { name: '重新加载', exact: true }).click();
    await p.locator('.person-row').nth(19).waitFor(); assert.equal(await p.locator('.journal-state').count(), 0);
    await reader.ctx.close();
  });
  await actorBrowser.ctx.close(); await adminBrowser.ctx.close();
  const scenes = [
    ['hub', '/news', '.journal-row'], ['athletes-men', '/news?tab=athlete', '.person-row'],
    ['athletes-women', '/news?tab=athlete', '.person-row', 'women'], ['pacers', '/news?tab=pacer', '.person-row'],
    ['athlete-detail', '/news/profiles/' + women.profiles[0].id, '.profile-hero'], ['pacer-detail', '/news/profiles/' + pacers.profiles[0].id, '.profile-hero'],
    ['industry-detail', '/news/articles/' + industryId, '.journal-detail'], ['club-news', '/clubs/' + club.id + '/news', '.journal-row'],
    ['club-editor', '/clubs/' + club.id + '/news/manage', '.journal-editor form']
  ];
  const approximatePacer = pacers.profiles.find(p => p.personalBestDisplay);
  if (approximatePacer) scenes.push(['pacer-approximate-detail', '/news/profiles/' + approximatePacer.id, '.profile-hero']);
  for (const width of [320, 390, 1024]) {
    const actor = await context(owner, width);
    for (const [name, route, selector, action] of scenes) {
      await actor.p.goto(base + route, { waitUntil: 'networkidle' }); await actor.p.locator(selector).first().waitFor();
      if (action === 'women') { await actor.p.getByRole('button', { name: '女子', exact: true }).click(); await actor.p.locator('.person-row').nth(19).waitFor(); }
      await snapshot(actor.p, name);
    }
    await actor.ctx.close();
    const operator = await context({ token: process.env.ADMIN_TOKEN }, width, true); await adminSection(operator.p);
    await operator.p.locator('.content-row').filter({ hasText: '从成绩记录到人物档案' }).click(); await operator.p.locator('.content-editor').waitFor();
    await snapshot(operator.p, 'admin-content-editor'); await operator.ctx.close();
  }
  // Keep synthetic screenshots above as acceptance evidence. The final public
  // preview uses only the two researched starter articles, still in this run's
  // disposable database; never invoke the CLI or open its default local file.
  const db = getDb();
  assert.equal(path.resolve(db.name), path.resolve(process.env.MARATHON_DB));
  assert.ok(path.resolve(db.name).startsWith(path.resolve(temporary) + path.sep));
  const archived = db.prepare("UPDATE content_articles SET status='archived',updated_at=? WHERE status!='archived'").run(new Date().toISOString()).changes;
  const starters = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared/content-starter-articles.json'), 'utf8'));
  const { importStarters } = require('./import-content-starters.cjs');
  const imported = importStarters(db, Array.isArray(starters) ? starters : starters.articles);
  assert.equal(imported.inserted, starters.length);
  const curated = await api('GET', '/content/articles?page=1&pageSize=20');
  assert.equal(curated.total, starters.length);
  assert.ok(curated.articles.every(row => row.sourceUrl && row.category === 'industry'));
  const curatedArticle = curated.articles.find(row => row.title === starters[0].title);
  assert.ok(curatedArticle);
  report.curatedPreview = { syntheticArticlesArchived: archived, importedArticles: imported.inserted, sourceFile: 'shared/content-starter-articles.json', isolation: 'Same temporary database only; default local and production databases were never opened.' };
  for (const width of [320, 390, 1024]) {
    const reader = await context(null, width);
    await reader.p.goto(base + '/news', { waitUntil: 'networkidle' });
    await reader.p.locator('.journal-row').nth(1).waitFor();
    assert.equal(await reader.p.locator('.journal-row').count(), Math.min(starters.length,20));
    assert.doesNotMatch(await reader.p.locator('.journal-content').innerText(), /临时验收|临时隔离/);
    await snapshot(reader.p, 'hub-curated');
    await reader.p.goto(base + '/news/articles/' + curatedArticle.id, { waitUntil: 'networkidle' });
    await reader.p.locator('.journal-detail h1').waitFor();
    assert.equal(await reader.p.locator('.journal-detail h1').innerText(), curatedArticle.title);
    assert.equal(await reader.p.locator('a[href^="http"]').count(),0); assert.match(await reader.p.locator('.detail-meta').innerText(), /跑圈编辑部/);
    assert.doesNotMatch(await reader.p.locator('.journal-detail').innerText(), /临时验收|临时隔离/);
    await snapshot(reader.p, 'industry-curated-detail');
    await reader.ctx.close();
  }
  assert.deepEqual(report.errors, [], 'No browser runtime or server errors');
  report.passed = true;
}
main().catch(error => { report.passed = false; report.error = error.stack; console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  try { getDb().close(); } catch {}
  fs.rmSync(temporary, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, views: report.views.length, errors: report.errors.length, report: path.relative(ROOT, path.join(OUT, 'report.json')) }));
});
