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
  await check('Featured entries use real profile photos and target times, cache previews and retain readable image fallbacks', async () => {
    const f = fixture();
    f.setReply(url => {
      const parsed = new URL(url, 'https://fixture.example');
      if (parsed.pathname === '/content/profiles') return Promise.resolve({ profiles: parsed.searchParams.get('type') === 'pacer' ? [{ id:'pacer-real',type:'pacer',name:'配速员',primaryTargetTime:'3:15:00' }] : [{...athlete,avatar:'/marathon/images/athletes/verified.jpg'},{...woman,avatar:'javascript:alert(1)'}] });
      return Promise.resolve({ articles:[article],page:1,pages:1,total:1 });
    });
    f.page.onLoad({}); f.page.onShow(); await settle();
    assert.equal(f.page.data.rows[0].id, article.id);
    assert.equal(f.page.data.previewPhotos.athlete.length,1);
    assert.equal(f.page.data.previewPhotos.athlete[0].image,'https://runner.example/marathon/images/athletes/verified.jpg');
    assert.equal(f.page.data.previewPhotos.pacer.length,0); assert.equal(f.page.data.previewTarget,'3:15:00');
    assert.equal(f.requests().filter(x=>x.url.includes('pageSize=6')).length,2);
    f.page.switchTab(event({tab:'industry'})); await settle(); f.page.switchTab(event({tab:'all'})); await settle();
    assert.equal(f.requests().filter(x=>x.url.includes('pageSize=6')).length,2,'Cached public previews do not refetch when switching back');
    f.page.previewImageError(event({type:'athlete',id:athlete.id})); assert.equal(f.page.data.previewPhotos.athlete.length,0);
    assert.equal(f.page.data.message,'');
  });
  await check('Preview failures are independent of news and never apply after leaving the featured section or unloading', async () => {
    const f=fixture(),late=deferred();
    f.setReply(url=>url.includes('pageSize=6') ? late.promise : Promise.resolve({articles:[article],page:1,pages:1,total:1}));
    f.page.onLoad({});f.page.onShow();await settle();assert.equal(f.page.data.ready,true);assert.equal(f.page.data.rows[0].id,article.id);
    f.page.switchTab(event({tab:'industry'}));await settle();
    late.resolve({profiles:[{...athlete,avatar:'https://example.com/verified.jpg'}]});await settle();assert.equal(f.page.data.previewPhotos.athlete.length,0);assert.equal(f.page.data.message,'');
    const retry=deferred();f.setReply(url=>url.includes('pageSize=6')?retry.promise:Promise.resolve({articles:[article],page:1,pages:1,total:1}));
    f.page.switchTab(event({tab:'all'}));await settle();f.page.onUnload();const before=f.patches.length;
    retry.resolve({profiles:[{...athlete,avatar:'https://example.com/verified.jpg'}]});await settle();assert.equal(f.patches.length,before);
    const failed=fixture();failed.setReply(url=>url.includes('type=athlete')?Promise.reject(Error('preview unavailable')):url.includes('type=pacer')?Promise.resolve({profiles:[{id:'p1',type:'pacer',name:'配速员',primaryTargetTime:'3:30'}]}):Promise.resolve({articles:[article],page:1,pages:1,total:1}));
    failed.page.onLoad({});failed.page.onShow();await settle();assert.equal(failed.page.data.message,'');assert.equal(failed.page.data.ready,true);assert.equal(failed.page.data.previewTarget,'3:30');
  });
  await check('Male and female filters and Unicode search are encoded', async () => {
    const f = fixture(); f.page.onLoad({ tab: 'athlete' }); f.page.onShow(); await settle(); assert.equal(f.page.data.rows[0].gender, 'men');
    f.page.setGender(event({ gender: 'women' })); await settle(); assert.equal(f.page.data.rows[0].gender, 'women'); assert.match(f.requests().at(-1).url, /gender=women/);
    f.page.onQuery(event({}, '  张 德顺&  ')); f.page.search(); await settle(); const url = new URL(f.requests().at(-1).url, 'https://fixture.example');
    assert.equal(url.searchParams.get('q'), '张 德顺&');
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
    assert.ok(f.page.data.rows.length);
    f.setReply(() => Promise.reject(new Error('此功能暂不可用（HTTP 404），请联系管理员确认服务已更新。')));
    await f.page.load(); assert.equal(f.page.data.ready, true); assert.equal(f.page.data.rows.length, 0);
    assert.match(f.page.data.message, /稍后再试/); assert.doesNotMatch(f.page.data.message, /HTTP|404|管理员/);
    const template = fs.readFileSync(path.join(mini, 'pages/news/news.wxml'), 'utf8');
    assert.match(template, /ready && !message && total/); assert.doesNotMatch(template, /rankingNote|verificationNote/);
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
  await check('Image URL validation rejects unsafe schemes and credentials; profile numbering remains stable', async () => {
    const { helper } = fixture();
    for (const value of ['', 'javascript:alert(1)', 'data:text/html,test', '//example.com/x', 'http://example.com', 'https://user:password@example.com', 'https://example.com bad']) assert.equal(helper.safeUrl(value), false, value);
    assert.equal(helper.safeUrl('https://example.com/person.jpg'), true);
    assert.equal(helper.decorate({ rank: 17 }, 0, 2).number, '17');
    assert.equal(helper.decorate({}, 2, 2).number, '23');
    assert.equal(helper.decorate({ type:'athlete', editorialOrigin:'manual' }, 0, 1).number, '—', 'An editorial profile must not receive a fabricated season rank');
  });
  await check('All reader details omit source links, original-media names and verification-process labels', async () => {
    const f = fixture('detail'); f.page.onLoad({ type: 'profile', id: athlete.id }); await settle();
    assert.equal(f.page.data.item.sources[0].url, athlete.sources[0].url); // retained in response, never rendered
    assert.equal(typeof f.page.openSource, 'undefined'); assert.equal(f.page.data.sources, undefined); assert.equal(f.clipboard.length, 0); assert.equal(f.official.length, 0);
    for (const name of ['web/src/views/ContentDetail.vue', 'web/src/views/News.vue', 'miniprogram/pages/news/detail.wxml']) {
      const markup = fs.readFileSync(path.join(root, name), 'utf8').split('<script')[0];
      assert.doesNotMatch(markup, /source-box|source-button|sourceUrl|sourceRefs|verificationNote|rankingNote|查阅来源|资料来源|查看原文|照片来源|target="_blank"|bindtap="openSource"/);
      assert.doesNotMatch(markup, /:href=|href="https?:/);
    }
  });
  await check('Pacer race filters retain a person list and reset paging without opening a race page', async () => {
    const f = fixture();
    const raceFilters = [{ id: 'caa-bj', name: '北京马拉松', edition: 2026, count: 2 }, { id: 'caa-sh', name: '上海马拉松', edition: 2025, count: 1 }];
    f.setReply(url => { const q = new URL(url, 'https://example.com').searchParams; return Promise.resolve({ profiles: [{ id: 'person-one', type: 'pacer', name: '配速员甲' }], total: 40, pages: 2, page: Number(q.get('page')), meta: { raceFilters } }); });
    f.page.onLoad({ tab: 'pacer' }); f.page.onShow(); await settle();
    assert.equal(f.page.data.raceId, ''); assert.equal(f.page.data.rows[0].id, 'person-one'); assert.equal(f.page.data.raceFilterOptions.length, 3); assert.equal(f.page.data.isProfile, true);
    f.page.nextPage(); await settle(); assert.equal(new URL(f.requests().at(-1).url, 'https://example.com').searchParams.get('page'), '2');
    f.page.setRace(event({}, '1')); await settle(); let q = new URL(f.requests().at(-1).url, 'https://example.com').searchParams;
    assert.equal(q.get('raceId'), 'caa-bj'); assert.equal(q.get('page'), '1'); assert.equal(f.page.data.rows[0].id, 'person-one'); assert.equal(f.calls.filter(x => x.type === 'navigate').length, 0);
    f.page.onQuery(event({}, '测试兔')); f.page.search(); await settle(); q = new URL(f.requests().at(-1).url, 'https://example.com').searchParams; assert.equal(q.get('raceId'), 'caa-bj'); assert.equal(q.get('q'), '测试兔');
    f.page.resetPacerFilters(); await settle(); q = new URL(f.requests().at(-1).url, 'https://example.com').searchParams; assert.equal(q.get('raceId'), null); assert.equal(q.get('page'), '1'); assert.equal(q.get('q'), '');
    f.page.setRace(event({}, '1')); await settle(); f.page.switchTab(event({ tab: 'athlete' })); await settle(); assert.equal(f.page.data.raceId, ''); assert.equal(f.page.data.raceFilterIndex, 0);
  });
  await check('Legacy detail links still open race news and keep race associations and sharing', async () => {
    const f = fixture('detail'); f.page.onLoad({ id: '12' }); await settle();
    assert.equal(f.requests()[0].url, '/news/12'); assert.equal(f.page.data.item.raceId, race.raceId); assert.equal(f.page.data.isRace, true);
    assert.ok(f.page.data.blocks.length); assert.equal(f.page.onShareAppMessage().path, '/pages/news/detail?type=race&id=12');
    const a = fixture('detail'); a.page.onLoad({ type: 'article', id: '71' }); await settle(); assert.equal(a.requests()[0].url, '/content/articles/71'); assert.equal(a.page.data.item.title, article.title);
  });
  await check('Person articles render complete Markdown paragraphs before compact athlete results', async () => {
    const personArticle = { title: '从起跑线到马拉松赛道', lead: '一位跑者的成长与突破。', body: '## 初上赛道\n第一段完整人物经历。\n\n第二段成长经历。\n\n## 比赛突破\n第三段**重要比赛**与成绩。', version: 1, updatedAt: '2026-11-12' };
    const f = fixture('detail'); f.setReply(() => Promise.resolve({ profile: { ...athlete, article: personArticle } })); f.page.onLoad({ type: 'profile', id: athlete.id }); await settle();
    assert.equal(f.page.data.profileArticle.title, personArticle.title); assert.equal(f.page.data.profileArticle.lead, personArticle.lead); assert.equal(f.page.data.profileBlocks.length, 5); assert.ok(f.page.data.profileBlocks.some(b => b.runs.some(r => r.strong && r.text === '重要比赛')));
    assert.equal(f.page.data.highlights[0].position, '1'); assert.equal(f.page.data.backUrl, '/pages/news/news?tab=athlete');
    const markup = fs.readFileSync(path.join(mini, 'pages/news/detail.wxml'), 'utf8'); assert.ok(markup.indexOf('class="profile-article"') < markup.indexOf('个人最好成绩'));
  });
  await check('Pacer people show written articles and distinguish provisional selection from previous service', async () => {
    const person = { id: 'official-pacer-test', type: 'pacer', profileKind: 'official_pacer_person', name: '测试兔', gender: 'men', personalBest: '2:35:20', primaryTargetTime: '3:00', targetTimes: ['3:00', '3:15'], raceCount: 2, verifiedPacerRaceNames: ['2025上海马拉松'], raceBadges: [{ raceId: 'bj', raceName: '2026北京马拉松', label: '2026北马', status: 'provisional', statusLabel: '初步公示' }, { raceId: 'sh', label: '2025上马', status: 'published', statusLabel: '曾任官兔' }], assignments: [
      { raceId: 'bj', raceName: '2026北京马拉松', raceDate: '2026-11-01', city: '北京', targetTime: '3:00', status: 'provisional', statusLabel: '初步公示', sourceUrl: 'https://example.com/pacer' },
      { raceId: 'sh', raceName: '2025上海马拉松', targetTime: '3:15', status: 'published', statusLabel: '已确认' }
    ], article: { title: '测试兔：以稳定的节奏陪伴跑者', lead: '在赛道上把握节奏。', body: '## 配速任务\n完整的第一段人物介绍。\n\n完整的第二段配速经历。' } };
    const f = fixture('detail'); f.setReply(() => Promise.resolve({ profile: clone(person) })); f.page.onLoad({ type: 'profile', id: person.id }); await settle();
    assert.equal(f.page.data.isPacerPerson, true); assert.equal(f.page.data.isOfficialPacer, false); assert.equal(f.page.data.item.pacerTarget, '3:00'); assert.equal(f.page.data.profileBlocks.length, 3);
    assert.equal(f.page.data.assignments[0].statusLabel, '入选公示'); assert.equal(f.page.data.assignments[1].statusLabel, '已确认'); assert.equal(f.page.data.raceBadges[0].statusLabel, '入选公示'); assert.deepEqual(f.page.data.item.verifiedPacerRaceNames, ['2025上海马拉松']);
    const row = f.helper.decorate(person, 0, 1); assert.equal(row.avatarLabel, '测'); assert.equal(row.raceBadges[0].statusLabel, '入选公示'); assert.equal(row.verifiedPacerRacesLabel, '2025上海马拉松');
    const markup = fs.readFileSync(path.join(mini, 'pages/news/news.wxml'), 'utf8'); assert.match(markup, /位官兔/); assert.match(markup, /item\.raceBadges/); assert.doesNotMatch(markup, /item\.avatar \|\| item\.photo \|\| item\.coverUrl/);
    f.setReply(() => Promise.resolve({ profile: { type: 'pacer', profileKind: 'official_pacer_race', name: '旧赛事官兔', pacerGroups: [{ label: '300', names: ['张三'] }] } })); await f.page.load(); assert.equal(f.page.data.isOfficialPacer, true); assert.equal(f.page.data.isPacerPerson, false); assert.equal(f.page.data.pacerGroups[0].namesText, '张三');
  });
  await check('News digests use the editorial byline and preserve full text without source navigation', async () => {
    const f = fixture('detail'); f.setReply(() => Promise.resolve({ article: { ...article, rights: 'digest', source: '原媒体名称', sourceUrl: 'https://example.com/main', sourceRefs: [{ title: '赛事公告', url: 'https://example.com/official' }], body: '## 赛况\n第一段详细赛事事实。\n\n## 成绩\n第二段公开成绩。' } })); f.page.onLoad({ type: 'article', id: '71' }); await settle();
    assert.equal(f.page.data.authorLabel, '跑圈编辑部'); assert.ok(f.page.data.blocks.length >= 4); assert.equal(f.page.data.sources, undefined); assert.equal(f.clipboard.length, 0); assert.equal(f.official.length, 0);
    const row = f.helper.decorate({ ...article, rights: 'digest', source: '原媒体名称' }, 0, 1); assert.equal(row.authorLabel, '跑圈编辑部'); assert.equal(f.helper.authorLabel(article), '测试跑团');
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
