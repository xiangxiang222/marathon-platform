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
    assert.equal(f.page.data.officialActions[0].key, row.key, row.label + ' should promote the relevant real URL');
    f.page.copyLink({ currentTarget: { dataset: f.page.data.officialActions[0] } });
    assert.equal(f.clipboard[0], 'https://official.example/' + row.key);
    assert.equal(f.page.data.myStatus, '', 'official links do not create a personal plan');
    assert.equal(f.page.data.following, false);
  }
  checks.push('CST race, draw and bib dates select real official actions; copying never records participation or following');
  {
    const f = detailFixture({ ...baseRace, links: [{ key: 'signup', url: 'javascript:alert(1)' }, { key: 'result', url: 'http://unsafe.example' }], eventUrl: '' });
    f.page.onLoad({ id: baseRace.id }); await f.page.load();
    assert.equal(f.page.data.officialActions.length, 0);
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
    assert.equal(f.page.data.officialActions.find(item => item.key === 'signup').label, '报名安排');
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
    assert.equal(before.page.data.officialActions.find(item => item.key === 'signup').label, '报名安排');
    assert.ok(before.page.data.phaseTitle.includes('2026-11-17 10:00（北京时间）'));
    const after = detailFixture({ ...timed, regStatus: '报名中', open: true }, true, '2026-11-17T10:00:00+08:00');
    after.page.onLoad({ id: baseRace.id }); await after.page.load();
    assert.equal(after.page.data.publicStatus, '报名中');
    assert.equal(after.page.data.officialActions[0].key, 'signup');
    assert.equal(after.page.data.officialActions[0].label, '官方报名');
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
    assert.equal(before.page.data.officialActions[0].label, '官方报名');
    const cutoff = detailFixture({ ...timed, regStatus: '待开赛', open: false }, true, '2026-11-17T18:00:00+08:00');
    cutoff.page.onLoad({ id: baseRace.id }); await cutoff.page.load();
    assert.equal(cutoff.page.data.phaseTitle, '中签结果 · 2026-11-17 20:00（北京时间）', 'the exact cutoff no longer remains the next moment');
    assert.equal(cutoff.page.data.officialActions.find(item => item.key === 'signup').label, '报名信息');
    const drawn = detailFixture({ ...timed, regStatus: '待开赛', open: false }, true, '2026-11-17T20:00:00+08:00');
    drawn.page.onLoad({ id: baseRace.id }); await drawn.page.load();
    assert.equal(drawn.page.data.phaseTitle, '缴费截止 · 2026-11-18 18:00（北京时间）');
    assert.equal(drawn.page.data.officialActions[0].key, 'draw', 'a timestamp query becomes available at its recorded instant');
    const paid = detailFixture({ ...timed, regStatus: '待开赛', open: false }, true, '2026-11-18T18:00:00+08:00');
    paid.page.onLoad({ id: baseRace.id }); await paid.page.load();
    assert.equal(paid.page.data.phaseTitle, '号码公布 · 2026-11-19 09:00（北京时间）');
    const numbered = detailFixture({ ...timed, regStatus: '待开赛', open: false }, true, '2026-11-19T09:00:00+08:00');
    numbered.page.onLoad({ id: baseRace.id }); await numbered.page.load();
    assert.equal(numbered.page.data.officialActions[0].key, 'bib');
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
  console.log(JSON.stringify({ passed: true, kind: 'Current mini Page VM, not device testing', checks }, null, 2));
}
module.exports = { detailFixture, day, today };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
