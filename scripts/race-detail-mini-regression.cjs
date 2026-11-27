'use strict';
// Run current Page methods with explicit transport and WeChat API doubles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const { race: baseRace, statuses } = require('./participation-mini-regression.cjs');
const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const day = offset => new Date(Date.now() + offset * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
function detailFixture(race, auth = true, now) {
  const app = { globalData: { token: auth ? 'runner-a' : '', baseUrl: 'https://runner.example' } };
  const requests = [], scrolls = [], clipboard = [], previews = [], storage = {}, navigation = [];
  const data = { race, statuses, following: false, myStatus: '', sharedClubIds: [], myResults: [], clubs: [], cards: [] };
  const file = path.join(root, 'miniprogram/pages/race/race.js'), localRequire = createRequire(file);
  const FixtureDate = now ? class extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return Date.parse(now); }
  } : Date;
  let definition;
  const wx = new Proxy({
    pageScrollTo(value) { scrolls.push(value); }, previewImage(value) { previews.push(value); },
    setClipboardData(value) { clipboard.push(value.data); if (value.success) value.success(); },
    setStorageSync(key, value) { storage[key] = value; }, switchTab(value) { navigation.push(value.url); },
    nextTick(fn) { fn(); }
  }, { get: (target, key) => target[key] || (() => {}) });
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { definition = value; }, getApp: () => app, wx, console, Date: FixtureDate, Promise, setTimeout, clearTimeout,
    require(id) {
      if (id === '../../utils/request') return { ready: () => !!app.globalData.token, request(url, method = 'GET', body) {
        requests.push({ url, method, body });
        if (url.endsWith('/news')) return Promise.resolve({ news: [] });
        if (url.endsWith('/outings')) return Promise.resolve({ outings: [] });
        return Promise.resolve(data);
      } };
      return localRequire(id);
    }
  }, { filename: file });
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch, done) { Object.assign(this.data, patch); if (done) done(); } };
  return { page, app, data, requests, scrolls, clipboard, previews, storage, navigation };
}
async function checkRaceService() {
  const now = '2026-11-17T12:00:00+08:00';
  const route = { id: baseRace.id };
  const open = { ...baseRace, raceDate: '2026-11-21', regStart: '2026-11-15', deadline: '2026-11-18T18:00:00+08:00', registrationStatus: 'open', open: true };
  const signupLink = { key: 'signup', url: 'https://official.example/entry' };
  const resultLink = { key: 'result', url: 'https://official.example/results' };
  const qrUrl = 'https://official.example/entry.png';
  const upcoming = { ...open, regStatus: '待开赛', registrationStatus: 'closed', open: false, deadline: '2026-11-16' };
  const failures = [];
  const check = async (name, race, verify) => {
    const f = detailFixture(race, false, now);
    f.page.onLoad(route);
    assert.equal(await f.page.load(), true, 'fixture race loaded successfully');
    try { await verify(f); }
    catch (error) { failures.push(new Error(name + ': ' + error.message, { cause: error })); }
  };
  await check('open registration with official link', { ...open, links: [signupLink] }, f => {
    assert.equal(f.page.data.serviceAction?.kind, 'link', 'the official signup link should be the primary action');
    assert.equal(f.page.data.serviceAction.label, '复制官方报名链接');
    assert.equal(f.page.data.publicStatus, '报名中');
    assert.equal(f.page.data.locationText, open.city);
    assert.match(f.page.data.phaseTitle, /报名截止.*2026-11-18 18:00/);
    f.page.openServiceAction();
    assert.deepEqual(f.clipboard, [signupLink.url]);
    assert.equal(f.page.data.planOpen, false, 'official action should leave the separate plan control alone');
    assert.equal(f.page.data.myStatus, '');
    assert.equal(f.page.data.following, false);
    assert.equal(f.requests.some(request => request.method !== 'GET'), false);
    f.page.loginForPlan();
    assert.equal(f.storage.marathon_return_after_login, '/pages/race/race?id=sample-race&plan=1');
    f.page.toggleFollow();
    assert.equal(f.storage.marathon_return_after_login, '/pages/race/race?id=sample-race&follow=1');
  });
  await check('QR-only registration', { ...open, signupQrAvailable: true, signupQrUrl: qrUrl }, f => {
    assert.equal(f.page.data.serviceAction?.kind, 'qr', 'a validated QR-only entry should supply the primary action');
    f.page.openServiceAction();
    assert.equal(f.previews[0]?.current, qrUrl);
    f.page.signupQrError();
    f.page.openServiceAction();
    assert.equal(f.previews.length, 1, 'a failed QR does not open until it can be loaded again');
    f.page.retrySignupQr();
    f.page.openServiceAction();
    assert.equal(f.previews[1]?.current, qrUrl);
    assert.deepEqual(f.clipboard, []);
  });
  await check('verified cutoff overrides a stale early-bird node and label', {
    ...open, deadline: '2026-11-17T11:00:00+08:00', deadlineName: '早鸟截止', nodes: [{ key: 'deadline', past: true }],
    details: { registration: { verified: true, closesAt: '2026-11-18T18:00:00+08:00' } }, links: [signupLink]
  }, f => {
    assert.equal(f.page.data.phaseTitle, '报名截止 · 2026-11-18 18:00（北京时间）');
    assert.equal(f.page.data.serviceAction?.url, signupLink.url);
  });
  await check('pickup before the race after registration closes', { ...upcoming, pickup: '周五到展览中心领取参赛包。', payDeadline: '2026-11-18', links: [signupLink] }, f => {
    assert.equal(f.page.data.serviceAction?.kind, 'pickup', 'verified pickup information should replace closed signup');
    assert.equal(f.page.data.publicStatus, '报名已截止');
    assert.equal(f.page.data.phaseTitle, '缴费截止 · 2026-11-18', 'the next known date remains visible after signup closes');
    f.page.openServiceAction();
    assert.equal(f.page.data.tab, 'guide');
    assert.equal(f.scrolls.at(-1)?.selector, '#guide-pickup');
  });
  const pickup = '周五到展览中心领取参赛包。';
  await check('pickup chapter when the guide already includes the same text', { ...upcoming, pickup, guideText: '## 参赛包领取\n\n' + pickup }, f => {
    assert.equal(f.page.data.serviceAction?.kind, 'pickup', 'pickup already recorded as a guide chapter still has a primary action');
    f.page.openServiceAction();
    assert.equal(f.page.data.tab, 'guide');
    assert.match(f.scrolls.at(-1)?.selector, /^#guide-chapter-/);
  });
  await check('official results for an ended race', { ...upcoming, raceDate: '2026-11-16', links: [signupLink, resultLink] }, f => {
    assert.equal(f.page.data.serviceAction?.label, '复制官方成绩链接', 'official results should become the primary action after the race');
    f.page.openServiceAction();
    assert.deepEqual(f.clipboard, [resultLink.url]);
    assert.equal(f.page.data.tab, 'signup', 'official results are separate from personal result records');
  });
  for (const [name, race, wording] of [
    ['no registration destination', open, /报名入口.*未录入/],
    ['explicitly unverified signup', { ...open, links: [signupLink], signupQrAvailable: true, signupQrUrl: qrUrl, details: { registration: { entranceVerified: false } } }, /报名入口.*未录入/],
    ['registration has not opened', { ...open, regStatus: '未开始', registrationStatus: 'not_open', open: false, regStart: '2026-11-19', links: [signupLink] }, /报名.*未开始/],
    ['pickup placeholder', { ...upcoming, pickup: '领物安排待公布' }, /领物安排.*未录入/],
    ['no official results', { ...upcoming, raceDate: '2026-11-16', eventUrl: 'https://official.example/home', links: [signupLink] }, /官方成绩.*未录入/],
    ['event cancelled', { ...upcoming, registrationStatus: 'cancelled', links: [signupLink, resultLink], pickup }, /赛事已取消/]
  ]) await check(name, race, f => {
    assert.equal(f.page.data.serviceAction, null, 'no unrelated action should appear in the primary slot');
    assert.match(f.page.data.servicePending, wording);
    f.page.openServiceAction();
    assert.deepEqual(f.clipboard, []);
    assert.deepEqual(f.previews, []);
  });
  const markup = fs.readFileSync(path.join(root, 'miniprogram/pages/race/race.wxml'), 'utf8');
  const service = markup.slice(markup.indexOf('class="race-service'), markup.indexOf('class="card personal-summary'));
  try {
    assert.match(service, /参赛服务.*raceDate.*locationText.*phaseTitle/s);
    assert.equal((service.match(/bindtap="openServiceAction"/g) || []).length, 1, 'only one bound primary action');
    assert.match(markup, /bindtap="toggleFollow"[\s\S]*bindtap="togglePersonal"/);
  } catch (error) { failures.push(new Error('first screen renders time, city and one official service with its own control: ' + error.message, { cause: error })); }
  if (failures.length) throw new AggregateError(failures, failures.map(error => error.message).join('\n'));
  return 'Race services show city, date and next deadline, choose one real registration/QR/pickup/results action, display honest missing states, and keep guest follow and plans independent';
}
async function checkPublicDetailBody() {
  const now = '2026-11-17T12:00:00+08:00';
  const route = { id: baseRace.id };
  const race = { ...baseRace, raceDate: '2026-11-22', registrationStatus: 'open', open: true };
  const load = async fields => {
    const f = detailFixture({ ...race, ...fields }, false, now);
    f.page.onLoad(route);
    assert.equal(await f.page.load(), true, 'public data loaded from the fixture');
    return f;
  };
  const failures = [];
  const check = async (name, run) => {
    try { await run(); }
    catch (error) { failures.push(new Error(name + ': ' + error.message, { cause: error })); }
  };
  await check('only the first real actionable timeline node is marked, in Beijing time', async () => {
    const f = await load({
      nodes: [
        { key: 'race', label: '比赛日', at: '2026-11-22', past: false },
        { key: 'bib', label: '号码公布', at: '2026-11-17T05:00:00Z', past: true },
        { key: 'deadline', label: '早鸟截止', at: '2026-11-16', past: true },
        { key: 'draw', label: '出签', at: '2026-11-18T09:00:00Z', past: false }
      ],
      details: { registration: { verified: true, closesAt: '2026-11-19T09:00:00Z' } }
    });
    const rows = Array.from(f.page.data.timelineRows || []);
    assert.deepEqual(rows.map(({ label, at }) => [label, at]), [
      ['早鸟截止', '2026-11-16'],
      ['号码公布', '2026-11-17 13:00'],
      ['出签', '2026-11-18 17:00'],
      ['报名截止', '2026-11-19 17:00'],
      ['比赛日', '2026-11-22']
    ]);
    assert.deepEqual(rows.filter(row => row.next).map(row => row.key), ['draw']);
  });
  await check('verified general cutoff replaces the legacy general cutoff, while a completed race has no next node', async () => {
    const deadline = { key: 'deadline', label: '报名截止', at: '2026-11-18', past: false };
    const f = await load({
      raceDate: '2026-11-16',
      registrationStatus: 'closed',
      nodes: [deadline, { key: 'race', label: '比赛日', at: '2026-11-16', past: true }],
      details: { registration: { verified: true, closesAt: '2026-11-15' } }
    });
    const rows = Array.from(f.page.data.timelineRows || []);
    assert.deepEqual(rows.map(row => row.at), ['2026-11-15', '2026-11-16']);
    assert.equal(rows.some(row => row.next), false);
    assert.equal(rows.every(row => row.past), true);
  });
  await check('deduplicated practical material links to the existing chapter and leaves other chapters discoverable', async () => {
    const pickup = '周五到展览中心领取参赛包。';
    const f = await load({
      registrationStatus: 'closed', open: false, pickup,
      guideText: '## 参赛资格\n\n须年满18岁。\n\n## 日程说明\n\n' + pickup,
      routeSheets: [{ id: 71 }], pacerSheets: [{ id: 72 }], guide: [{ id: 73 }]
    });
    const tasks = Array.from(f.page.data.guideTasks || []);
    assert.deepEqual(tasks.map(row => row.label), ['领物与比赛日', '赛道与路线', '配速资料']);
    assert.match(tasks[0].id, /^chapter-/);
    assert.deepEqual(Array.from(f.page.data.guideChapters || [], row => row.label), ['参赛资格', '规程原图参考']);
    assert.equal(f.page.data.guideSupplements.some(row => row.id === 'pickup'), false);
    f.page.openServiceAction();
    assert.equal(f.page.data.tab, 'guide');
    assert.equal(f.scrolls.at(-1)?.selector, '#guide-' + tasks[0].id);
    f.page.goToGuide({ currentTarget: { dataset: { id: 'originals' } } });
    assert.equal(f.page.data.guideOriginalsOpen, true);
    assert.equal(f.scrolls.at(-1)?.selector, '#guide-originals');
  });
  await check('placeholder information earns no practical control while original-only rules remain reachable', async () => {
    const f = await load({ pickup: '领物安排待公布', route: '赛道与路线待公布', pacers: '另行通知', guide: [{ id: 73 }] });
    assert.equal(f.page.data.guideTasks?.length, 0);
    assert.deepEqual(Array.from(f.page.data.guideChapters || [], row => row.id), ['originals']);
    assert.deepEqual(Array.from(f.page.data.guideSupplements, row => row.id), ['originals']);
  });
  await check('a known route sheet embedded in the rules opens the inline image without duplicating it', async () => {
    const f = await load({
      guideText: '## 附件\n\n![官方图表](/marathon/api/race-sheets/71)',
      routeSheets: [{ id: 71 }]
    });
    const target = f.page.data.guideTasks.find(task => task.kind === 'route');
    assert.match(target?.id, /^media-/);
    assert.equal(f.page.data.guideSupplements.some(row => row.id === 'route'), false);
    f.page.goToGuide({ currentTarget: { dataset: { id: target.id } } });
    assert.equal(f.scrolls.at(-1)?.selector, '#guide-' + target.id);
  });
  await check('native markup has one hooked timeline marker, two guide groups and fallback race information', async () => {
    const wxml = fs.readFileSync(path.join(root, 'miniprogram/pages/race/race.wxml'), 'utf8');
    assert.match(wxml, /重要时间[\s\S]*?timelineRows[\s\S]*?下一节点/);
    assert.match(wxml, /比赛日资料[\s\S]*?guideTasks[\s\S]*?规程章节目录[\s\S]*?guideChapters/);
    assert.match(wxml, /参赛项目与费用[\s\S]*?!detailGroups\.length[^}]*race\.distanceLabels/);
    assert.match(wxml, /guide-table-scroll/);
    assert.match(wxml, /id="guide-media-\{\{block\.i\}\}"/);
    assert.match(wxml, /guideOriginalsOpen \|\| !guideBlocks\.length/);
  });
  if (failures.length) throw new AggregateError(failures, failures.map(error => error.message).join('\n'));
  return 'Race information and guide show one trusted Beijing-time next step and route published service materials to their original chapter';
}
async function main() {
  const checks = [];
  const links = ['signup', 'draw', 'bib', 'result'].map(key => ({ key, url: 'https://official.example/' + key, label: key }));
  const cases = [
    { label: 'registration', extra: { raceDate: day(30), regStatus: '报名中', drawAt: day(10), bibAt: day(20) }, key: 'signup' },
    { label: 'draw', extra: { raceDate: day(30), regStatus: '待开赛', drawAt: today, bibAt: day(20) }, key: 'draw' },
    { label: 'bib', extra: { raceDate: day(1), regStatus: '待开赛', drawAt: day(-10), bibAt: today }, key: 'bib' },
    { label: 'results', extra: { raceDate: day(-1), regStatus: '已结束' }, key: 'result' }
  ];
  for (const row of cases) {
    const f = detailFixture({ ...baseRace, ...row.extra, links }); f.page.onLoad({ id: baseRace.id }); await f.page.load();
    const action = ['signup', 'result'].includes(row.key) ? f.page.data.serviceAction : f.page.data.queryLinks.find(link => link.key === row.key);
    assert.equal(action?.url, 'https://official.example/' + row.key, row.label + ' should expose the relevant real URL');
    if (action.kind) f.page.openServiceAction();
    else f.page.copyLink({ currentTarget: { dataset: action } });
    assert.equal(f.clipboard[0], 'https://official.example/' + row.key);
    assert.equal(f.page.data.myStatus, '', 'official links do not create a personal plan');
    assert.equal(f.page.data.following, false);
  }
  checks.push('CST race, draw and bib dates select real official actions; copying never records participation or following');
  {
    const f = detailFixture({ ...baseRace, links: [{ key: 'signup', url: 'javascript:alert(1)' }, { key: 'result', url: 'http://unsafe.example' }], eventUrl: '' });
    f.page.onLoad({ id: baseRace.id }); await f.page.load();
    assert.equal(f.page.data.queryLinks.length, 0);
    assert.equal(f.page.data.serviceAction, null);
    assert.equal(f.page.data.officialResultLink, '');
    assert.deepEqual(Array.from(f.page.data.tabs, item => item.id), ['signup', 'guide', 'news', 'result']);
    checks.push('Absent or invalid official URLs create no action; the four content destinations remain stable');
  }
  {
    const f = detailFixture({ ...baseRace, coverSheet: { id: 42 }, guide: [{ id: 43 }], routeSheets: [{ id: 44 }] });
    f.page.onLoad({ id: baseRace.id }); await f.page.load();
    const src = f.page.data.coverSrc;
    assert.ok(src.endsWith('/marathon/api/race-sheets/42'));
    f.page.previewGuide({ currentTarget: { dataset: { src } } });
    assert.equal(f.previews[0].current, src);
    assert.ok(f.previews[0].urls.includes(src));
    f.page.coverError({ currentTarget: { dataset: { src: 'old-race-cover' } } }); assert.equal(f.page.data.coverSrc, src);
    f.page.coverError({ currentTarget: { dataset: { src } } }); assert.equal(f.page.data.coverSrc, '');
    checks.push('Cover uses the existing public sheet endpoint, opens the gallery and falls back only for the current failed image');
  }
  {
    const f = detailFixture({ ...baseRace }, false); f.page.onLoad({ id: baseRace.id }); await f.page.load();
    assert.equal(f.page.data.planOpen, false); assert.equal(f.page.data.companionOpen, false); assert.equal(f.page.data.outingsOpen, false);
    for (const id of ['guide', 'news', 'result', 'signup']) f.page.pickTab({ currentTarget: { dataset: { id } } });
    assert.equal(f.scrolls.length, 0, 'ordinary tabs must never request page-top scrolling');
    f.page.loginForPlan(); assert.ok(f.storage.marathon_return_after_login.includes('plan=1'));
    checks.push('Guest retains all tabs and login; collapsed personal controls and normal tab changes preserve page position');
  }
  {
    const f = detailFixture({ ...baseRace }); f.page.onLoad({ id: baseRace.id, plan: '1', outings: '1', clubId: '7' }); await f.page.load();
    assert.equal(f.page.data.planOpen, true); assert.equal(f.page.data.outingsOpen, true);
    f.page.setData({ outingsOpen: false }); f.page.toggleOutingForm(); assert.equal(f.page.data.outingsOpen, true);
    f.page.setData({ outingsOpen: false }); f.page.showClubOutings({ currentTarget: { dataset: { club: 7 } } });
    assert.equal(f.page.data.outingsOpen, true); assert.equal(f.scrolls.at(-1).selector, '#race-outings');
    checks.push('Plan and outing deep links expand their controls; launching or locating an arrangement opens it without changing a plan');
  }
  {
    const f = detailFixture({ ...baseRace, raceDate: day(30), regStart: day(2), deadline: day(8), regStatus: '报名中', links });
    f.page.onLoad({ id: baseRace.id }); await f.page.load();
    assert.equal(f.page.data.publicStatus, '报名未开始');
    assert.equal(f.page.data.serviceAction, null);
    assert.equal(f.page.data.personalOpen, false);
    f.page.togglePersonal(); assert.equal(f.page.data.personalOpen, true);
    f.page.toggleSource(); assert.equal(f.page.data.sourceOpen, true);
    f.data.race = { ...baseRace, raceDate: day(30), deadline: '', regStart: '', regStatus: '报名时间未公布' }; await f.page.load();
    assert.equal(f.page.data.publicStatus, '报名时间未录入');
    assert.equal(f.page.data.phaseTitle, '报名时间尚未录入');
    assert.equal(f.scrolls.length, 0, 'ordinary expansions never request scrolling');
    checks.push('Future registration is labelled before opening; legacy unknown dates are shown as not recorded and personal/source summaries expand without scrolling');
  }
  {
    const timed = { ...baseRace, raceDate: '2026-12-17', regStart: '2026-11-17T10:00:00+08:00', deadline: '2026-11-20', links };
    const before = detailFixture({ ...timed, regStatus: '未开始', open: false }, true, '2026-11-17T09:59:59+08:00');
    before.page.onLoad({ id: baseRace.id }); await before.page.load();
    assert.equal(before.page.data.publicStatus, '报名未开始');
    assert.equal(before.page.data.serviceAction, null);
    assert.ok(before.page.data.phaseTitle.includes('2026-11-17 10:00（北京时间）'));
    const after = detailFixture({ ...timed, regStatus: '报名中', open: true }, true, '2026-11-17T10:00:00+08:00');
    after.page.onLoad({ id: baseRace.id }); await after.page.load();
    assert.equal(after.page.data.publicStatus, '报名中');
    assert.equal(after.page.data.serviceAction?.url, 'https://official.example/signup');
    assert.equal(after.page.data.serviceAction?.label, '复制官方报名链接');
    const serverAuthority = detailFixture({ ...timed, regStatus: '报名中', open: true }, true, '2026-11-17T08:00:00+08:00');
    serverAuthority.page.onLoad({ id: baseRace.id }); await serverAuthority.page.load();
    assert.equal(serverAuthority.page.data.publicStatus, '报名中', 'a device clock behind the server cannot override the API phase');
    checks.push('Exact China-time opening is pending before the recorded instant and open afterwards; device day comparisons never override the server timestamp phase');
  }
  {
    const timed = { ...baseRace, raceDate: '2026-12-17', regStart: '', deadline: '2026-11-17T18:00:00+08:00', drawAt: '2026-11-17T20:00:00+08:00', payDeadline: '2026-11-18T18:00:00+08:00', bibAt: '2026-11-19T09:00:00+08:00', links };
    const before = detailFixture({ ...timed, regStatus: '报名中', open: true }, true, '2026-11-17T17:59:59+08:00');
    before.page.onLoad({ id: baseRace.id }); await before.page.load();
    assert.equal(before.page.data.phaseTitle, '报名截止 · 2026-11-17 18:00（北京时间）');
    assert.equal(before.page.data.serviceAction?.label, '复制官方报名链接');
    const cutoff = detailFixture({ ...timed, regStatus: '待开赛', open: false }, true, '2026-11-17T18:00:00+08:00');
    cutoff.page.onLoad({ id: baseRace.id }); await cutoff.page.load();
    assert.equal(cutoff.page.data.phaseTitle, '中签结果 · 2026-11-17 20:00（北京时间）', 'the exact cutoff no longer remains the next moment');
    assert.equal(cutoff.page.data.serviceAction, null);
    const drawn = detailFixture({ ...timed, regStatus: '待开赛', open: false }, true, '2026-11-17T20:00:00+08:00');
    drawn.page.onLoad({ id: baseRace.id }); await drawn.page.load();
    assert.equal(drawn.page.data.phaseTitle, '缴费截止 · 2026-11-18 18:00（北京时间）');
    assert.equal(drawn.page.data.queryLinks.find(item => item.key === 'draw')?.url, 'https://official.example/draw');
    const paid = detailFixture({ ...timed, regStatus: '待开赛', open: false }, true, '2026-11-18T18:00:00+08:00');
    paid.page.onLoad({ id: baseRace.id }); await paid.page.load();
    assert.equal(paid.page.data.phaseTitle, '号码公布 · 2026-11-19 09:00（北京时间）');
    const numbered = detailFixture({ ...timed, regStatus: '待开赛', open: false }, true, '2026-11-19T09:00:00+08:00');
    numbered.page.onLoad({ id: baseRace.id }); await numbered.page.load();
    assert.equal(numbered.page.data.queryLinks.find(item => item.key === 'bib')?.url, 'https://official.example/bib');
    const serverAuthority = detailFixture({ ...timed, regStatus: '待开赛', open: false, nodes: [{ key: 'deadline', past: true, today: true }, { key: 'draw', past: false, today: true }] }, true, '2026-11-17T17:00:00+08:00');
    serverAuthority.page.onLoad({ id: baseRace.id }); await serverAuthority.page.load();
    assert.ok(serverAuthority.page.data.phaseTitle.startsWith('中签结果'), 'server node precision overrides a device clock behind the cutoff');
    const allDay = detailFixture({ ...timed, deadline: '2026-11-17', regStatus: '报名中', open: true }, true, '2026-11-17T23:59:00+08:00');
    allDay.page.onLoad({ id: baseRace.id }); await allDay.page.load();
    assert.equal(allDay.page.data.phaseTitle, '报名截止 · 2026-11-17', 'a date-only cutoff retains its full-day meaning');
    const closed = detailFixture({ ...timed, drawAt: '', payDeadline: '', bibAt: '', regStatus: '待开赛', open: false }, true, '2026-11-17T18:00:01+08:00');
    closed.page.onLoad({ id: baseRace.id }); await closed.page.load();
    assert.equal(closed.page.data.phaseTitle, '报名已截止', 'a passed timestamp without another recorded moment cannot become an unknown date');
    checks.push('Exact cutoff/draw/payment moments advance at their recorded instants, preserve API node authority and date-only full-day deadlines, and never retain a passed cutoff');
  }
  {
    const f = detailFixture({ ...baseRace, routeSheets: [{ id: 71 }], pacerSheets: [{ id: 72 }], guide: [{ id: 73 }], liveSheet: { id: 74 } });
    f.page.onLoad({ id: baseRace.id }); await f.page.load();
    const imageEvent = { currentTarget: { dataset: { kind: 'routeSheets', id: 71, src: f.page.data.routeSheets[0].src } } };
    f.page.mediaError(imageEvent); assert.equal(f.page.data.routeSheets[0].state, 'failed');
    f.page.retryMedia({ currentTarget: { dataset: { kind: 'routeSheets', id: 71 } } });
    assert.equal(f.page.data.routeSheets[0].state, 'loading');
    assert.ok(f.page.data.routeSheets[0].displaySrc.includes('?retry='));
    f.page.mediaError(imageEvent); assert.equal(f.page.data.routeSheets[0].state, 'loading', 'stale image failures cannot overwrite a retry');
    f.page.mediaLoaded({ currentTarget: { dataset: { kind: 'routeSheets', id: 71, src: f.page.data.routeSheets[0].displaySrc } } });
    assert.equal(f.page.data.routeSheets[0].state, 'ready');
    f.page.previewGuide({ currentTarget: { dataset: { src: f.page.data.routeSheets[0].src } } });
    assert.equal(f.previews[0].current, f.page.data.routeSheets[0].src, 'gallery retains the canonical original');
    await f.page.load(); assert.equal(f.page.data.routeSheets[0].state, 'ready', 'unrelated personal refresh keeps media state');
    const count = f.previews.length; f.page.previewGuide({ currentTarget: { dataset: { src: 'https://unlisted.example/image' } } });
    assert.equal(f.previews.length, count);
    checks.push('Public media supports field-specific failure/retry, ignores stale failed loads and opens canonical original images without changing plans');
  }
  checks.push(await checkRaceService());
  checks.push(await checkPublicDetailBody());
  console.log(JSON.stringify({ passed: true, kind: 'Current mini Page VM, not device testing', checks }, null, 2));
}
module.exports = { detailFixture, day, today };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
