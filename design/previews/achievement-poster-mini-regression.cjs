'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '../..'), MODEL = require('../../miniprogram/utils/achievement-model');
const OUT = path.join(__dirname, 'achievement-poster-20261111/mini'); fs.mkdirSync(OUT, { recursive: true });
const report = { kind: 'Actual native Page logic, isolated wx/request/Canvas bridge mocks; no network or uploads', checks: [] };
const copy = value => JSON.parse(JSON.stringify(value)), tick = () => new Promise(resolve => setImmediate(resolve));
const event = dataset => ({ currentTarget: { dataset } }), input = (key, value) => ({ currentTarget: { dataset: { key } }, detail: { value } });
const wait = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function payload(n = 44) { return { asOf: '2026-11-11', results: Array.from({ length: n }, (_, index) => ({ distance: ['full', 'half', '10k', '5k'][index % 4], seconds: 2200 + index * 170,
  race: { id: 'fixture-' + index, name: '【模拟】' + (index % 2 ? '湖畔半程跑' : '公园训练赛') + ' ' + (index + 1), raceDate: (index % 3 ? '2026' : '2025') + '-04-' + String(index % 27 + 1).padStart(2, '0'), city: '杭州', province: '浙江', kind: 'road', meet: 'offline' } })) }; }
function fixture(n = 44) {
  let definition, sequence = 0;
  const app = { globalData: { token: 'fixture-a' } }, calls = { requests: [], rendered: [], exported: [], removed: [], preview: [], saved: [], setting: 0, navigate: [] };
  const state = { reply: route => Promise.resolve(route === '/me' ? { user: { id: 1, nickname: '测试跑者001' } } : payload(n)), auth: undefined, renderError: false, renderWait: null, exportWait: null, saveError: null };
  const wx = { hideShareMenu() {}, switchTab: x => calls.navigate.push(x.url), getFileSystemManager: () => ({ unlink: x => calls.removed.push(x.filePath) }),
    canvasToTempFilePath(options) { const finish = () => { const file = { tempFilePath: '/tmp/fixture-' + (++sequence) + '.png' }; calls.exported.push({ ...file, width: options.destWidth, height: options.destHeight }); options.success(file); }; state.exportWait ? state.exportWait.promise.then(finish) : finish(); },
    previewImage: x => calls.preview.push(x), getSetting: x => x.success({ authSetting: { 'scope.writePhotosAlbum': state.auth } }),
    saveImageToPhotosAlbum(x) { calls.saved.push(x.filePath); state.saveError ? x.fail({ errMsg: state.saveError }) : x.success({}); },
    openSetting(x) { calls.setting++; state.auth = true; x.success({ authSetting: { 'scope.writePhotosAlbum': true } }); } };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'miniprogram/pages/achievement-poster/achievement-poster.js'), 'utf8'), {
    Page: value => { definition = value; }, getApp: () => app, wx, setTimeout, clearTimeout, Promise, Set, Date, console,
    require: name => name.endsWith('/request') ? { ready: () => !!app.globalData.token, request: route => { calls.requests.push(route); return state.reply(route); } } : name.endsWith('/achievement-model') ? MODEL : name.endsWith('/achievement-poster') ? {
      async renderAchievementPoster(canvas, model, options) { calls.rendered.push({ model: copy(model), pageIndex: options.pageIndex }); if (state.renderWait) await state.renderWait.promise; if (state.renderError) throw Error('fixture renderer failed'); const rows = MODEL.paginateAchievement(model)[options.pageIndex].rows; return { width: 1080, height: model.mode === 'pb' ? 1440 : Math.max(1440, 860 + rows.length * 144), pages: MODEL.paginateAchievement(model).length, pageIndex: options.pageIndex }; }
    } : (() => { throw Error('Unexpected require ' + name); })()
  });
  const page = { ...definition, data: copy(definition.data), setData(patch) { Object.assign(this.data, patch); }, createSelectorQuery: () => ({ select() { return this; }, fields() { return this; }, exec(fn) { fn([{ node: {} }]); } }) };
  page.onLoad({});
  async function load() { await page.onShow(); page._canvasReady = true; await page.generate(); }
  return { page, app, calls, state, load, cleanup: () => page.onUnload() };
}
async function check(name, fn) { await fn(); report.checks.push({ name, passed: true }); }
async function run() {
  await check('only own identity and runner APIs are requested; default lifetime PB produces 1080px PNG', async () => {
    const f = fixture(); await f.load(); assert.deepEqual(f.calls.requests.sort(), ['/me', '/me/runner?period=all&offset=0'].sort()); assert.equal(f.page.data.mode, 'pb'); assert.equal(f.page.data.selectedCount, 4); assert.ok(f.page.data.posterPath); assert.equal(f.calls.exported[0].width, 1080); assert.equal(f.calls.saved.length, 0); assert.equal(f.page.data.showCity, false); f.cleanup();
  });
  await check('results over twenty retain every row and expose all three pages for individual saving', async () => {
    const f = fixture(); await f.load(); f.page.pickMode(event({ id: 'results' })); await f.page.generate(); assert.equal(f.page.data.selectedCount, 44); assert.equal(f.page.data.pageCount, 3);
    const seen = [];
    for (let i = 0; i < 3; i++) { if (i) { f.page.changePage(event({ direction: 1 })); await f.page.generate(); } const last = f.calls.rendered.at(-1); seen.push(...MODEL.paginateAchievement(last.model)[last.pageIndex].rows.map(row => row.key)); }
    assert.equal(new Set(seen).size, 44); assert.equal(f.page.data.pageNumber, 3); await f.page.savePoster(); assert.match(f.page.data.saveMessage, /第 3 张已保存/); assert.equal(f.calls.saved.length, 1); f.cleanup();
  });
  await check('year filter, selection clear/all and PB mode use lifetime records rather than selected year', async () => {
    const f = fixture(); await f.load(); const original = f.page._model.rows.map(r => r.key); f.page.pickMode(event({ id: 'results' })); f.page.pickYear({ detail: { value: 1 } }); assert.ok(f.page.data.choices.every(row => row.raceDate.startsWith('2026')));
    f.page.clearSelection(); assert.equal(f.page.data.selectedCount, 0); assert.equal(f.page.data.posterPath, ''); f.page.selectAll(); assert.equal(f.page.data.selectedCount, f.page.data.availableCount);
    f.page.pickMode(event({ id: 'pb' })); assert.deepEqual(f.page._model.rows.map(r => r.key), original); assert.equal(f.page._model.year, ''); f.cleanup();
  });
  await check('theme/quote and all four privacy flags reach the generated model with hidden values removed', async () => {
    const f = fixture(); await f.load(); f.page.pickStyle(event({ id: 'mint' })); f.page.pickQuote({ detail: { value: 2 } }); for (const key of ['showName', 'showRace', 'showDate']) f.page.changePrivacy(input(key, false)); f.page.changePrivacy(input('showCity', true)); await f.page.generate();
    const m = f.calls.rendered.at(-1).model; assert.equal(m.style.id, 'mint'); assert.equal(m.nickname, ''); assert.equal(m.quote, MODEL.QUOTES[2]); assert.ok(m.rows.every(row => !row.raceName && !row.raceDate && row.city === '杭州')); f.cleanup();
  });
  await check('failed Canvas export has a clear retry and no bogus image path', async () => {
    const f = fixture(); f.state.renderError = true; await f.load(); assert.equal(f.page.data.posterPath, ''); assert.match(f.page.data.generateError, /再试一次/); f.state.renderError = false; await f.page.generate(); assert.ok(f.page.data.posterPath); assert.equal(f.page.data.generateError, ''); f.cleanup();
  });
  await check('rapid generation is serialized and only the last style wins', async () => {
    const f = fixture(); await f.load(); const held = wait(); f.state.renderWait = held; const old = f.page.generate(); await tick(); f.page.pickStyle(event({ id: 'coral' })); const newest = f.page.generate(); held.resolve(); f.state.renderWait = null; await Promise.all([old, newest]); assert.equal(f.calls.rendered.at(-1).model.style.id, 'coral'); assert.ok(f.page.data.posterPath); assert.equal(f.page.data.generating, false); f.cleanup();
  });
  await check('late native PNG callback is discarded and unlinked after settings changed', async () => {
    const f = fixture(); await f.load(); const held = wait(); f.state.exportWait = held; const old = f.page.generate(); await tick(); f.page.pickStyle(event({ id: 'mint' })); const newest = f.page.generate(); held.resolve(); f.state.exportWait = null; await Promise.all([old, newest]); assert.ok(f.calls.removed.includes(f.calls.exported.at(-2).tempFilePath)); assert.equal(f.page.data.posterPath, f.calls.exported.at(-1).tempFilePath); f.cleanup();
  });
  await check('album authorization is requested only on explicit save; denied scope never repeats prompts', async () => {
    const f = fixture(); await f.load(); f.state.auth = false; await f.page.savePoster(); assert.equal(f.calls.saved.length, 0); assert.equal(f.page.data.needsSetting, true); assert.match(f.page.data.saveMessage, /去设置/); await f.page.savePoster(); assert.equal(f.calls.saved.length, 0);
    f.page.openAlbumSettings(); assert.equal(f.calls.setting, 1); assert.equal(f.calls.saved.length, 0); await f.page.savePoster(); assert.equal(f.calls.saved.length, 1); assert.equal(f.page.data.saved, true); f.cleanup();
  });
  await check('first save denial and storage failure are recoverable without claiming success', async () => {
    const f = fixture(); await f.load(); f.state.saveError = 'saveImageToPhotosAlbum:fail auth deny'; await f.page.savePoster(); assert.equal(f.page.data.needsSetting, true); assert.equal(f.page.data.saved, false); f.state.saveError = 'storage full'; await f.page.savePoster(); assert.equal(f.page.data.needsSetting, false); assert.match(f.page.data.saveMessage, /存储空间/); f.state.saveError = null; await f.page.savePoster(); assert.equal(f.page.data.saved, true); f.cleanup();
  });
  await check('preview opens the actual local PNG without uploads or a fabricated URL', async () => {
    const f = fixture(); await f.load(); f.page.previewPoster(); assert.equal(f.calls.preview.length, 1); assert.equal(f.calls.preview[0].current, f.page.data.posterPath); assert.deepEqual(Array.from(f.calls.preview[0].urls), [f.page.data.posterPath]); assert.ok(f.calls.requests.every(route => !route.includes('media') && !route.includes('upload'))); f.cleanup();
  });
  await check('hide/unload delete sensitive temporary PNG; show regenerates, unload cannot resurface it', async () => {
    const f = fixture(); await f.load(); const file = f.page.data.posterPath; f.page.onHide(); assert.equal(f.page.data.posterPath, ''); assert.ok(f.calls.removed.includes(file)); f.page.onShow(); await f.page.generate(); assert.ok(f.page.data.posterPath); f.page.onUnload(); assert.equal(f.page.data.posterPath, ''); await f.page.generate(); assert.equal(f.page.data.posterPath, '');
  });
  await check('account switch immediately clears old PNG before preview/save and ignores old responses', async () => {
    const f = fixture(); await f.load(); const held = wait(); f.state.reply = () => held.promise; f.app.globalData.token = 'fixture-b'; f.page.previewPoster(); assert.equal(f.page.data.posterPath, ''); assert.equal(f.calls.preview.length, 0); assert.equal(f.page.data.choices.length, 0); f.page.onHide(); held.resolve({}); await tick(); assert.equal(f.page.data.posterPath, ''); assert.equal(f.page._payload, null); f.cleanup();
  });
  await check('empty and invalid records create an intentional zero-state; guests never request private APIs', async () => {
    const f = fixture(0); await f.load(); assert.equal(f.page.data.selectedCount, 0); assert.match(f.page.data.emptyText, /还没有/); assert.equal(f.calls.exported.length, 0); f.cleanup(); const guest = fixture(); guest.app.globalData.token = ''; await guest.load(); assert.equal(guest.calls.requests.length, 0); assert.equal(guest.page.data.ready, false); guest.cleanup();
  });
  await check('existing entry handlers permit only the current runner and personal member profile', async () => {
    const base = require('./club-mileage-test-fixture.cjs');
    const mine = base.miniFixture('pages/mine/mine'); mine.instance.setData({ runner: require('./achievement-poster-mini-fixture.cjs').runnerPayload(4) }); mine.instance.openAchievementPoster(event({ mode: 'results' })); assert.match(mine.navigation[0], /achievement-poster.*mode=results/); mine.setAccount('', false); mine.instance.openAchievementPoster(event({})); assert.equal(mine.navigation.length, 1);
    const runner = base.miniFixture('pages/runner/runner'); runner.instance._lastToken = runner.app.globalData.token; runner.instance.setData({ payload: require('./achievement-poster-mini-fixture.cjs').runnerPayload(4) }); runner.instance.openAchievementPoster(event({})); assert.equal(runner.navigation.length, 1); runner.setAccount('other'); runner.instance.openAchievementPoster(event({})); assert.equal(runner.navigation.length, 1);
    const member = base.miniFixture('pages/member-profile/member-profile'); member.instance._alive = true; member.instance._account = member.app.globalData.token; member.instance.setData({ profile: { mine: false } }); member.instance.openAchievementPoster(); assert.equal(member.navigation.length, 0); member.instance.setData({ profile: { mine: true } }); member.instance.openAchievementPoster(); assert.equal(member.navigation.length, 1); member.setAccount('other'); member.instance.openAchievementPoster(); assert.equal(member.navigation.length, 1);
    const markup = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/member-profile/member-profile.wxml'), 'utf8'); assert.match(markup, /wx:if="{{profile.mine}}" class="achievement-poster-entry"/);
  });
  report.passed = true;
}
run().catch(error => { report.passed = false; report.failure = error.stack; process.exitCode = 1; }).finally(() => { fs.writeFileSync(path.join(OUT, 'vm-report.json'), JSON.stringify(report, null, 2)); process.stdout.write(JSON.stringify({ passed: report.passed, checks: report.checks.length, failure: report.failure }) + '\n'); });
