const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const mini = path.join(root, 'miniprogram');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => { await tick(); await tick(); };
const event = (dataset = {}, value = '') => ({ currentTarget: { dataset }, detail: { value } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const article = { id: 71, title: '一起把晨跑写成故事', summary: '本周团练回顾', body: '## 团练回顾\n一起轻松跑。', category: 'club', clubId: 9, clubName: '测试跑团', source: '测试跑团', sourceUrl: '', rights: 'original', status: 'draft', publishedAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' };
const athlete = { id: 'athlete-men-1', type: 'athlete', name: '测试男子', gender: 'men', rank: 1, personalBest: '2:05:58', bio: '公开成绩记录。', verificationNote: '姓名待进一步交叉核实。', sources: [{ title: '官方榜单', url: 'https://worldathletics.org/records/test' }], careerHighlights: [{ date: '2023-10-05', title: '亚运会马拉松', result: '2:13:02', position: '1', sourceUrl: 'https://worldathletics.org/test' }] };
const woman = { ...athlete, id: 'athlete-women-1', name: '测试女子', gender: 'women' };
const race = { id: 12, title: '旧赛事资讯', body: '旧链接仍能打开。', source: '赛事组委会', raceId: 'caa-test', raceName: '测试马拉松', publishedAt: '2026-10-01' };
const report = { kind: 'Content mini-program VM journeys with mocked HTTP and wx APIs; no production data writes or device claims', checks: [] };

function fixture(pageName = 'news') {
  const app = { globalData: { token: 'test-owner', baseUrl: 'https://runner.example' } };
  const calls = [], patches = [], clipboard = [], official = [], toasts = [];
  let definition;
  let reply = (url, method, body) => {
    const parsed = new URL(url, 'https://fixture.example');
    if (parsed.pathname === '/clubs/9') return Promise.resolve({ club: { id: 9, name: '测试跑团', staff: true } });
    if (parsed.pathname === '/clubs/9/content/articles' && method === 'GET') return Promise.resolve({ articles: [clone(article)], page: 1, pages: 1, total: 1 });
    if (parsed.pathname === '/clubs/9/content/articles/71' && method === 'GET') return Promise.resolve({ article: clone(article) });
    if (parsed.pathname.startsWith('/clubs/9/content/articles') && ['POST', 'PUT'].includes(method)) return Promise.resolve({ article: { ...clone(article), ...clone(body), id: 71 } });
    if (parsed.pathname === '/content/profiles') {
      const female = parsed.searchParams.get('gender') === 'women';
      return Promise.resolve({ profiles: [clone(female ? woman : athlete)], total: parsed.searchParams.get('pageSize') === '1' ? 40 : 20, page: 1, pages: 1, meta: { rankingNotice: '历史个人最佳成绩榜单快照，非实时排名。', asOf: '2026-11-11' } });
    }
    if (parsed.pathname.startsWith('/content/profiles/')) return Promise.resolve({ profile: clone(athlete), meta: { rankingNotice: '中国籍全马历史PB快照' } });
    if (parsed.pathname === '/content/articles') return Promise.resolve({ articles: [clone(article)], total: 1, page: 1, pages: 1 });
    if (parsed.pathname.startsWith('/content/articles/')) return Promise.resolve({ article: clone(article) });
    if (parsed.pathname === '/news') return Promise.resolve({ news: [clone(race)], total: 1, page: 1, pages: 1 });
    if (parsed.pathname.startsWith('/news/')) return Promise.resolve({ news: clone(race) });
    return Promise.reject(new Error('Unexpected request ' + method + ' ' + url));
  };
  const wx = {
    setNavigationBarTitle(options) { calls.push({ type: 'title', ...options }); },
    hideShareMenu() { calls.push({ type: 'hide-share' }); },
    pageScrollTo(options) { calls.push({ type: 'scroll', ...options }); },
    stopPullDownRefresh() { calls.push({ type: 'refresh-stop' }); },
    canIUse() { return true; },
    openOfficialAccountArticle(options) { official.push(options); },
    setClipboardData(options) { clipboard.push(options.data); if (options.success) options.success({}); },
    showToast(options) { toasts.push(options); },
    navigateTo(options) { calls.push({ type: 'navigate', ...options }); }
  };
  const request = { request(url, method = 'GET', body = {}) { calls.push({ type: 'request', url, method, body: clone(body) }); return Promise.resolve().then(() => reply(url, method, body)); }, ready: () => !!app.globalData.token };
  const helperModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(mini, 'utils/content.js'), 'utf8'), { module: helperModule, wx }, { filename: 'utils/content.js' });
  vm.runInNewContext(fs.readFileSync(path.join(mini, 'pages/news', pageName + '.js'), 'utf8'), {
    Page(value) { definition = value; }, getApp: () => app, wx,
    require(name) {
      if (name === '../../utils/request') return request;
      if (name === '../../utils/content') return helperModule.exports;
      if (name === '../../utils/guide-md') return require(path.join(mini, 'utils/guide-md.js'));
      throw new Error('Unexpected dependency ' + name);
    }
  }, { filename: 'pages/news/' + pageName + '.js' });
  const page = { ...definition, data: clone(definition.data), setData(patch) {
    patches.push(clone(patch));
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.'); let target = this.data;
      for (const part of parts.slice(0, -1)) { if (!target[part]) target[part] = {}; target = target[part]; }
      target[parts.at(-1)] = value;
    }
  } };
  return { page, app, wx, helper: helperModule.exports, calls, patches, clipboard, official, toasts,
    requests() { return calls.filter(x => x.type === 'request'); },
    setReply(fn) { reply = fn; }
  };
}
async function check(name, run) {
  try { await run(); report.checks.push({ name, passed: true }); }
  catch (error) { report.checks.push({ name, passed: false, error: error.stack }); }
}
async function openEditor() { const f = fixture('editor'); f.page.onLoad({ club: '9' }); f.page.onShow(); await settle(); return f; }
async function main() {
  await check('News sections select distinct public APIs, preserve race news and reset search', async () => {
    const f = fixture(); f.page.onLoad({}); f.page.onShow(); await settle();
    assert.equal(f.page.data.rows[0].id, article.id);
    f.page.onQuery(event({}, '旧关键词')); f.page.setData({ page: 3 }); f.page.switchTab(event({ tab: 'industry' })); await settle();
    assert.equal(f.page.data.page, 1); assert.equal(f.page.data.query, ''); assert.match(f.requests().at(-1).url, /category=industry/);
    f.page.switchTab(event({ tab: 'pacer' })); await settle(); assert.match(f.requests().at(-1).url, /\/content\/profiles\?type=pacer/); assert.equal(f.page.data.isProfile, true);
    f.page.switchTab(event({ tab: 'race' })); await settle(); assert.match(f.requests().at(-1).url, /^\/news\?/); assert.equal(f.page.data.rows[0].id, race.id); assert.equal(f.page.data.isProfile, false);
  });
  await check('Male and female filters and Unicode search are encoded and retain the ranking notice', async () => {
    const f = fixture(); f.page.onLoad({ tab: 'athlete' }); f.page.onShow(); await settle(); assert.equal(f.page.data.rows[0].gender, 'men');
    f.page.setGender(event({ gender: 'women' })); await settle(); assert.equal(f.page.data.rows[0].gender, 'women'); assert.match(f.requests().at(-1).url, /gender=women/);
    f.page.onQuery(event({}, '  张 德顺&  ')); f.page.search(); await settle(); const url = new URL(f.requests().at(-1).url, 'https://fixture.example');
    assert.equal(url.searchParams.get('q'), '张 德顺&'); assert.match(f.page.data.rankingNote, /快照/);
    const shared = f.page.onShareAppMessage(); assert.match(shared.path, /tab=athlete/);
  });
  await check('Only the newest list request may update rows or report an error; unload ignores pending results', async () => {
    const f = fixture(), first = deferred(), second = deferred(); let index = 0;
    f.setReply(() => (++index === 1 ? first : second).promise); f.page.setData({ tab: 'athlete', isProfile: true });
    const old = f.page.load(); await tick(); f.page.setGender(event({ gender: 'women' })); await tick();
    second.resolve({ profiles: [woman], page: 1, pages: 1, total: 1 }); await settle(); first.resolve({ profiles: [athlete], page: 1 }); await old;
    assert.equal(f.page.data.rows[0].id, woman.id);
    const staleSuccess = deferred(), latestError = deferred(); let round = 0;
    f.setReply(() => (++round === 1 ? staleSuccess : latestError).promise);
    const stale = f.page.load(); await tick(); const latest = f.page.load(); await tick();
    latestError.reject(new Error('最新请求连接失败')); await latest; staleSuccess.resolve({ profiles: [athlete], page: 1 }); await stale;
    assert.equal(f.page.data.message, '请稍后再试，或切换其他栏目继续浏览。'); assert.equal(f.page.data.rows.length, 0); assert.equal(f.page.data.ready, true);
    const late = deferred(); f.setReply(() => late.promise); const pending = f.page.load(); await tick(); f.page.onUnload(); const before = f.patches.length;
    late.resolve({ profiles: [athlete], page: 1 }); await pending; assert.equal(f.patches.length, before);
  });
  await check('Older staff permissions cannot overwrite a new account response', async () => {
    const f = fixture(), first = deferred(), second = deferred(); let index = 0;
    f.setReply(url => url === '/clubs/9' ? (++index === 1 ? first : second).promise : Promise.resolve({ articles: [], page: 1 }));
    f.page.onLoad({ club: '9' }); f.page.onShow(); await tick(); f.app.globalData.token = 'new-account'; f.page.onShow(); await tick();
    second.resolve({ club: { id: 9, name: '测试跑团', staff: false } }); await settle();
    first.resolve({ club: { id: 9, name: '测试跑团', staff: true } }); await settle(); assert.equal(f.page.data.canManage, false);
  });
  await check('Unavailable content clears stale rows and notes without exposing technical HTTP details', async () => {
    const f = fixture(); f.page.onLoad({ tab: 'athlete' }); f.page.onShow(); await settle();
    assert.ok(f.page.data.rows.length); assert.ok(f.page.data.rankingNote);
    f.setReply(() => Promise.reject(new Error('此功能暂不可用（HTTP 404），请联系管理员确认服务已更新。')));
    await f.page.load(); assert.equal(f.page.data.ready, true); assert.equal(f.page.data.rows.length, 0); assert.equal(f.page.data.rankingNote, '');
    assert.match(f.page.data.message, /稍后再试/); assert.doesNotMatch(f.page.data.message, /HTTP|404|管理员/);
    const template = fs.readFileSync(path.join(mini, 'pages/news/news.wxml'), 'utf8');
    assert.match(template, /ready && !message && total/); assert.match(template, /rows.length && rankingNote/);
    assert.doesNotMatch(template, /journal-features|journal-footer|THE RUNNING JOURNAL/);
  });
  await check('Club journal requests only that club and exposes publishing after a staff response', async () => {
    const f = fixture(); f.page.onLoad({ club: '9' }); f.page.onShow(); await settle();
    assert.equal(f.page.data.tab, 'club'); assert.equal(f.page.data.canManage, true); assert.equal(f.page.data.clubName, '测试跑团');
    assert.ok(f.requests().some(x => x.url.startsWith('/content/articles?clubId=9&')));
    assert.equal(f.page.onShareAppMessage().path, '/pages/news/news?club=9');
    f.setReply(url => Promise.resolve(url === '/clubs/9' ? { club: { id: 9, name: '测试跑团', staff: false } } : { articles: [] }));
    f.page.onShow(); await settle(); assert.equal(f.page.data.canManage, false);
  });
  await check('HTTPS source validation rejects scripts, insecure schemes, credentials and official-account lookalikes', async () => {
    const { helper } = fixture();
    for (const value of ['', 'javascript:alert(1)', 'data:text/html,test', '//mp.weixin.qq.com/s/x', 'http://example.com', 'https://user:password@example.com', 'https://example.com bad']) assert.equal(helper.safeUrl(value), false, value);
    for (const value of ['https://mp.weixin.qq.com/s/example', 'https://mp.weixin.qq.com/s?__biz=test&mid=1', 'https://mp.weixin.qq.com/mp/appmsgalbum?__biz=test']) assert.equal(helper.officialUrl(value), true, value);
    for (const value of ['https://mp.weixin.qq.com.evil.example/s/test', 'https://evil.example/mp.weixin.qq.com/s/test', 'https://mp.weixin.qq.com@evil.example/s/test', 'https://mp.weixin.qq.com/other']) assert.equal(helper.officialUrl(value), false, value);
    assert.equal(helper.decorate({ rank: 17 }, 0, 2).number, '17');
    assert.equal(helper.decorate({}, 2, 2).number, '23');
  });
  await check('A source click invokes the official-account article API immediately and copies only after native failure', async () => {
    const f = fixture('detail'), url = 'https://mp.weixin.qq.com/s/test';
    f.page.openSource(event({ url })); assert.equal(f.official.length, 1); assert.equal(f.official[0].url, url); assert.equal(f.clipboard.length, 0); assert.equal(f.requests().length, 0);
    f.official[0].fail({ errMsg: 'openOfficialAccountArticle:fail' }); assert.deepEqual(f.clipboard, [url]);
    f.wx.canIUse = () => false; f.page.openSource(event({ url })); assert.equal(f.official.length, 1); assert.equal(f.clipboard.length, 2);
    delete f.wx.openOfficialAccountArticle; f.wx.canIUse = () => true; f.page.openSource(event({ url })); assert.equal(f.clipboard.length, 3);
  });
  await check('Non-WeChat sources copy their original URL while unsafe URLs trigger no action', async () => {
    const f = fixture('detail'), url = 'https://worldathletics.org/records/test'; f.page.openSource(event({ url }));
    assert.deepEqual(f.clipboard, [url]); assert.equal(f.official.length, 0);
    for (const bad of ['javascript:alert(1)', 'http://example.com', 'https://user:secret@example.com']) f.page.openSource(event({ url: bad }));
    assert.deepEqual(f.clipboard, [url]); assert.equal(f.official.length, 0);
  });
  await check('Legacy detail links still open race news and keep race associations and sharing', async () => {
    const f = fixture('detail'); f.page.onLoad({ id: '12' }); await settle();
    assert.equal(f.requests()[0].url, '/news/12'); assert.equal(f.page.data.item.raceId, race.raceId); assert.equal(f.page.data.isRace, true);
    assert.ok(f.page.data.blocks.length); assert.equal(f.page.onShareAppMessage().path, '/pages/news/detail?type=race&id=12');
    const a = fixture('detail'); a.page.onLoad({ type: 'article', id: '71' }); await settle(); assert.equal(a.requests()[0].url, '/content/articles/71'); assert.equal(a.page.data.item.title, article.title);
  });
  await check('Profile details preserve evidence, pending verification, official sources and the snapshot explanation', async () => {
    const f = fixture('detail'); f.page.onLoad({ type: 'profile', id: athlete.id }); await settle();
    assert.equal(f.requests()[0].url, '/content/profiles/' + athlete.id); assert.equal(f.page.data.isProfile, true); assert.match(f.page.data.item.verificationNote, /核实/);
    assert.equal(f.page.data.sources[0].url, athlete.sources[0].url); assert.equal(f.page.data.highlights[0].position, '1'); assert.match(f.page.data.rankingNote, /历史PB/);
    assert.equal(f.page.data.backUrl, '/pages/news/news?tab=athlete');
    const markup = fs.readFileSync(path.join(mini, 'pages/news/detail.wxml'), 'utf8'); assert.match(markup, /item\.verificationNote/);
  });
  await check('Detail retries and unload cannot apply an older response or an older failure', async () => {
    const f = fixture('detail'), first = deferred(), second = deferred(); let index = 0; f.setReply(() => (++index === 1 ? first : second).promise);
    f.page.onLoad({ type: 'article', id: '71' }); await tick(); const current = f.page.load(); await tick();
    second.resolve({ article: { ...article, title: '新请求的文章' } }); await current; first.reject(new Error('旧请求失败')); await settle();
    assert.equal(f.page.data.item.title, '新请求的文章'); assert.equal(f.page.data.message, '');
    const late = deferred(); f.setReply(() => late.promise); const pending = f.page.load(); await tick(); assert.equal(typeof f.page.onUnload, 'function'); f.page.onUnload(); const count = f.patches.length;
    late.resolve({ article }); await pending; assert.equal(f.patches.length, count);
  });
  await check('Club editors save drafts then publish the same article through PUT', async () => {
    const f = await openEditor(); assert.equal(f.page.data.allowed, true); assert.equal(f.page.data.draft.source, '测试跑团');
    f.page.input(event({ field: 'title' }, '本周团练记录')); f.page.input(event({ field: 'body' }, '一起慢跑十公里。'));
    await f.page.save(event({ status: 'draft' })); const draft = f.requests().find(x => x.method === 'POST');
    assert.equal(draft.body.status, 'draft'); assert.equal(draft.body.clubId, 9); assert.equal(draft.body.category, 'club'); assert.equal(draft.body.title, '本周团练记录'); assert.match(f.page.data.success, /草稿已保存/);
    await f.page.save(event({ status: 'published' })); const published = f.requests().find(x => x.method === 'PUT');
    assert.equal(published.url, '/clubs/9/content/articles/71'); assert.equal(published.body.status, 'published'); assert.equal(f.page.data.draft.id, 71); assert.match(f.page.data.success, /已发布/);
  });
  await check('Recommended articles submit an original link and summary without copying a stale full body', async () => {
    const f = await openEditor(); f.page.input(event({ field: 'title' }, '值得一读的公众号文章')); f.page.input(event({ field: 'summary' }, '跑团自己的推荐语。'));
    f.page.input(event({ field: 'body' }, '先前写过的正文')); f.page.input(event({ field: 'sourceUrl' }, 'https://mp.weixin.qq.com/s/test'));
    f.page.rightsChanged(event({}, '2')); f.page.togglePreview(); assert.equal(f.page.data.previewBlocks.length, 0);
    await f.page.save(event({ status: 'published' })); const sent = f.requests().find(x => x.method === 'POST');
    assert.equal(sent.body.rights, 'link'); assert.equal(sent.body.body, ''); assert.equal(sent.body.summary, '跑团自己的推荐语。'); assert.equal(sent.body.sourceUrl, 'https://mp.weixin.qq.com/s/test');
  });
  await check('An editor save submits once, freezes edits and retains a recoverable draft after network failure', async () => {
    const f = await openEditor(); f.page.input(event({ field: 'title' }, '不能丢掉的草稿')); const held = deferred();
    f.setReply((url, method) => method === 'POST' ? held.promise : Promise.resolve({ articles: [] }));
    const pending = f.page.save(event({ status: 'draft' })); await tick(); await f.page.save(event({ status: 'published' })); f.page.input(event({ field: 'title' }, '意外覆盖'));
    assert.equal(f.requests().filter(x => x.method === 'POST').length, 1); assert.equal(f.page.data.draft.title, '不能丢掉的草稿');
    held.reject(new Error('网络暂时中断')); await pending; assert.equal(f.page.data.saving, false); assert.equal(f.page.data.draft.title, '不能丢掉的草稿'); assert.equal(f.page.data.message, '网络暂时中断');
  });
  await check('Nonstaff, expired sessions and account changes cannot keep or publish another account draft', async () => {
    const denied = fixture('editor'); denied.setReply(() => Promise.resolve({ club: { id: 9, staff: false } })); denied.page.onLoad({ club: '9' }); denied.page.onShow(); await settle();
    assert.equal(denied.page.data.allowed, false); await denied.page.save(event({ status: 'published' })); assert.equal(denied.requests().filter(x => x.method !== 'GET').length, 0);
    const f = await openEditor(); f.page.input(event({ field: 'title' }, '原账号的私密草稿')); f.app.globalData.token = 'another-user';
    await f.page.save(event({ status: 'published' })); assert.equal(f.page.data.allowed, false); assert.equal(f.page.data.draft.title, ''); assert.equal(f.requests().filter(x => x.method !== 'GET').length, 0);
    const waiting = await openEditor(); const held = deferred(); waiting.page.input(event({ field: 'title' }, '提交中的草稿')); waiting.setReply(() => held.promise);
    const pending = waiting.page.save(event({ status: 'draft' })); await tick(); waiting.app.globalData.token = ''; waiting.page.onShow(); const before = waiting.patches.length;
    held.resolve({ article }); await pending; assert.equal(waiting.patches.length, before); assert.equal(waiting.page.data.allowed, false); assert.equal(waiting.page.data.draft.title, '');
  });
  await check('Registered pages and WXML handlers cover the list, detail and editor journeys', async () => {
    const app = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'));
    for (const name of ['news', 'detail', 'editor']) {
      assert.ok(app.pages.includes('pages/news/' + name), 'Registered page ' + name);
      const f = fixture(name), markup = fs.readFileSync(path.join(mini, 'pages/news', name + '.wxml'), 'utf8');
      for (const match of markup.matchAll(/(?:bindtap|bindinput|bindchange|bindconfirm)="([A-Za-z0-9_]+)"/g)) assert.equal(typeof f.page[match[1]], 'function', name + ' handler: ' + match[1]);
    }
  });
  report.passed = report.checks.every(x => x.passed); console.log(JSON.stringify(report, null, 2)); if (!report.passed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
