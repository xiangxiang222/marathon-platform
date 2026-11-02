const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const mini = path.join(root, 'miniprogram');
const legal = require(path.join(mini, 'utils/legal-documents.js'));
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const event = (dataset, value) => ({ currentTarget: { dataset }, detail: { value } });
const report = { kind: 'Race history WeChat Page VM user journeys; fixtures only, no business data writes; not a device test', checks: [] };
const first = { id: 'exp:1', name: '一次真实的测试赛', raceDate: '2025-10-26', distance: 'full', distanceLabel: '全马', city: '天津', province: '天津', kind: 'road', meet: 'offline', status: 'finished', timing: 'net', netSeconds: 13962, gunSeconds: 14000, seconds: 13962, clock: '03:52:42', story: '', tags: [], coverMediaId: null, isPb: true, improvementSeconds: 438, sourceKey: 'a'.repeat(64), source: { kind: 'text', label: '导入后本人确认' }, media: [] };
const second = { ...first, id: 'result:old/full:half', name: '旧收藏测试赛', raceDate: '2024-01-01', distance: 'half', clock: '—', timing: 'unknown', seconds: null, netSeconds: null, gunSeconds: null, isPb: false, improvementSeconds: null, source: { kind: 'legacy', label: '原有成绩 · 计时口径待确认' } };
const review = { headline: '你的这一场', facts: ['已记录一场经历'], scope: '仅比较已确认同项目同计时口径线下路跑', missing: ['还没有分段成绩，无法判断前后程变化'] };
const list = () => ({ asOf: '2026-11-01', summary: { experienceCount: 2, finished: 2, cityCount: 1, totalKm: 63.2925, pb: [], years: [] }, entries: [clone(first), clone(second)] });

function fixture() {
  const app = { globalData: { token: 'fixture-owner-token', baseUrl: 'https://runner.example' } };
  const calls = [], uploads = [], chooses = [], modals = [], sheets = [], fileOps = [], storage = {};
  let definition, reader, writer, share;
  let reply = (url, method, body) => {
    if (url === '/me/race-history' && method === 'GET') return Promise.resolve(list());
    if (url === '/me/race-history' && method === 'POST') return Promise.resolve({ entry: { ...clone(first), ...body }, review: clone(review) });
    if (url.startsWith('/me/race-history/') && method === 'GET') return Promise.resolve({ entry: clone(first), review: clone(review) });
    if (method === 'PATCH') return Promise.resolve({ entry: { ...clone(first), ...body }, review: clone(review) });
    if (method === 'DELETE') return Promise.resolve({ ok: true });
    return Promise.reject(new Error('Unexpected request ' + method + ' ' + url));
  };
  const manager = {
    readFile(options) { reader = options; fileOps.push({ type: 'read', filePath: options.filePath }); },
    writeFile(options) { writer = options; fileOps.push({ type: 'write', filePath: options.filePath, data: options.data }); },
    unlink(options) { fileOps.push({ type: 'unlink', filePath: options.filePath }); }
  };
  const wx = {
    setStorageSync(key, value) { storage[key] = value; },
    switchTab(options) { calls.push({ type: 'switch', ...options }); },
    stopPullDownRefresh() { calls.push({ type: 'refresh-stop' }); },
    showModal(options) { modals.push(options); },
    showActionSheet(options) { sheets.push(options); },
    chooseMedia(options) { chooses.push(options); }, chooseMessageFile(options) { chooses.push(options); },
    uploadFile(options) { uploads.push(options); },
    previewImage(options) { calls.push({ type: 'preview', ...options }); },
    setClipboardData(options) { calls.push({ type: 'clipboard', data: options.data }); if (options.success) options.success({}); },
    getFileSystemManager() { return manager; }
  };
  const request = {
    ready: () => !!app.globalData.token,
    clearAuth() { app.globalData.token = ''; calls.push({ type: 'clear-auth' }); },
    request(url, method = 'GET', body = {}) { calls.push({ type: 'request', url, method, body: clone(body) }); return reply(url, method, body); }
  };
  const helperModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(mini, 'utils/race-history.js'), 'utf8'), { module: helperModule, getApp: () => app }, { filename: 'race-history.js' });
  vm.runInNewContext(fs.readFileSync(path.join(mini, 'pages/history/history.js'), 'utf8'), {
    Page(value) { definition = value; }, getApp: () => app, wx,
    require(name) {
      if (name === '../../utils/request') return request;
      if (name === '../../utils/race-history') return helperModule.exports;
      if (name === '../../utils/legal-documents') return legal;
      throw Error('Unexpected dependency ' + name);
    }
  }, { filename: 'history.js' });
  const page = { ...definition, data: clone(definition.data), setData(patch) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
      let target = this.data;
      for (const part of parts.slice(0, -1)) target = target[part];
      target[parts.at(-1)] = value;
    }
  } };
  page.onLoad({});
  return { page, app, wx, calls, uploads, chooses, modals, sheets, fileOps, storage, helper: helperModule.exports,
    setReply(fn) { reply = fn; }, reader() { return reader; }, writer() { return writer; }, share() { return share; },
    enableFileExport() { wx.env = { USER_DATA_PATH: '/local' }; wx.shareFileMessage = options => { share = options; }; },
    answer(confirm) { const modal = modals.at(-1); assert.ok(modal, 'Confirmation must precede user action'); return modal.success({ confirm, cancel: !confirm }); }
  };
}
async function check(name, fn) { await fn(); report.checks.push({ name, passed: true }); }
async function main() {
  await check('Growth and memory display the returned private history, year filters and actual review scope', async () => {
    const f = fixture(); await f.page.onShow();
    assert.equal(f.page.data.summary.experienceCount, 2); assert.equal(f.page.data.entries.length, 2);
    assert.equal(f.page.data.hero.id, first.id); assert.equal(f.page.data.hero.improvementLabel, '7 分 18 秒');
    f.page.pickMode(event({ mode: 'memory' })); assert.equal(f.page.data.mode, 'memory');
    f.page.pickYear(event({}, '2')); assert.equal(f.page.data.visibleEntries.length, 1); assert.equal(f.page.data.visibleEntries[0].id, second.id);
    await f.page.openEntryId(second.id);
    assert.equal(f.calls.filter(x => x.type === 'request').at(-1).url, '/me/race-history/' + encodeURIComponent(second.id));
    assert.equal(f.page.data.review.missing[0], review.missing[0]); assert.equal(f.page.data.review.scope, review.scope);
  });
  await check('Manual entries can save a finished experience without a time, with personal story and tags', async () => {
    const f = fixture(); await f.page.onShow(); f.page.openAdd();
    assert.equal(f.page.data.editor.timing, 'unknown');
    f.page.onEditor(event({ field: 'name' }, '旧赛历里没有的一场')); f.page.onEditor(event({ field: 'raceDate' }, '2020-01-02'));
    f.page.onEditor(event({ field: 'story' }, '朋友陪我跑到终点。')); f.page.toggleEditorTag(event({ tag: '陪伴' }));
    await f.page.saveEntry();
    const saved = f.calls.find(x => x.method === 'POST');
    assert.equal(saved.body.raceId, undefined); assert.equal(saved.body.status, 'finished'); assert.equal(saved.body.timing, 'unknown');
    assert.equal(saved.body.unknownTime, ''); assert.equal(saved.body.story, '朋友陪我跑到终点。'); assert.deepEqual(saved.body.tags, ['陪伴']);
    assert.equal(saved.body.selectedTags, undefined); assert.equal(f.page.data.section, 'review');
    assert.ok(f.helper.TAGS.includes('享受比赛'));
    f.page.setData({ selected: f.helper.decorateEntry({ ...first, raceId: 'old-catalog-entry' }) }); f.page.editEntry(); f.page.clearRaceAssociation();
    assert.equal(f.helper.payload(f.page.data.editor).raceId, '');
  });
  await check('Race and city search combines with year filters in both views and resets across accounts', async () => {
    const f = fixture(); await f.page.onShow(); f.page.searchInput(event({}, '  天津  ')); assert.equal(f.page.data.visibleEntries.length, 2);
    f.page.pickYear(event({}, '1')); assert.equal(f.page.data.visibleEntries.length, 1); assert.equal(f.page.data.visibleEntries[0].id, first.id);
    f.page.pickMode(event({ mode: 'memory' })); f.page.searchInput(event({}, '旧收藏')); assert.equal(f.page.data.visibleEntries.length, 0);
    f.page.pickYear(event({}, '0')); assert.equal(f.page.data.visibleEntries.length, 1); assert.equal(f.page.data.visibleEntries[0].id, second.id);
    f.app.globalData.token = 'another-owner'; await f.page.onShow(); assert.equal(f.page.data.keyword, ''); assert.equal(f.page.data.yearIndex, 0); assert.equal(f.page.data.visibleEntries.length, 2);
  });
  await check('DNF and DNS clear stale finish times; malformed times do not submit or erase a draft', async () => {
    const f = fixture(); await f.page.onShow(); f.page.openAdd();
    f.page.onEditor(event({ field: 'name' }, '未完赛的经历')); f.page.onEditor(event({ field: 'raceDate' }, '2025-09-01'));
    f.page.editorPick(event({ field: 'timing' }, '0')); f.page.onEditor(event({ field: 'netTime' }, '03:5:45'));
    await f.page.saveEntry(); assert.match(f.page.data.editorError, /时:分:秒/); assert.equal(f.calls.filter(x => x.method === 'POST').length, 0);
    f.page.editorPick(event({ field: 'status' }, '1'));
    assert.equal(f.page.data.editor.netTime, ''); assert.equal(f.page.data.editor.gunTime, ''); assert.equal(f.page.data.editor.timing, 'unknown');
    f.page.editorPick(event({ field: 'status' }, '2')); assert.equal(f.page.data.editor.status, 'dns');
    f.setReply((url, method) => method === 'POST' ? Promise.reject(new Error('网络中断')) : Promise.resolve(list()));
    await f.page.saveEntry(); assert.equal(f.page.data.editor.name, '未完赛的经历'); assert.equal(f.page.data.editorError, '网络中断');
    assert.equal(f.calls.filter(x => x.method === 'POST').at(-1).body.netTime, '');
  });
  await check('Clock validation matches the 72 hour contract and rejects net time after gun time', async () => {
    const f = fixture(), base = { ...f.helper.blankEntry(), name: '越野', raceDate: '2025-01-01', timing: 'net', netTime: '72:00:00' };
    assert.equal(f.helper.validation(base), '');
    assert.match(f.helper.validation({ ...base, netTime: '72:00:01' }), /72/);
    assert.match(f.helper.validation({ ...base, netTime: '00:00:00' }), /大于零/);
    assert.match(f.helper.validation({ ...base, netTime: '03:10:00', gunTime: '03:09:59' }), /不能长于/);
    assert.equal(f.helper.validation({ ...base, netTime: '3：09：58', gunTime: '03:09:59' }), '');
    assert.match(f.helper.validation({ ...base, raceDate: '2025-02-31' }), /真实比赛日期/);
    const unresolved = f.helper.formEntry({ ...base, distance: '' });
    assert.equal(unresolved.distanceIndex, -1); assert.match(f.helper.validation(unresolved), /比赛项目/);
  });
  await check('Growth nodes explain recorded beginnings, first distances and comparable improvements without assuming an absolute first race', async () => {
    const f = fixture(), entries = f.helper.decorateList([
      { ...first, id: 'new', raceDate: '2026-10-01', improvementSeconds: 60 },
      { ...first, id: 'half', distance: 'half', distanceLabel: '半马', raceDate: '2025-10-01', improvementSeconds: null },
      { ...second, id: 'start', distance: 'full', distanceLabel: '全马', raceDate: '2024-01-01', status: 'dns', improvementSeconds: null }
    ]);
    assert.equal(entries.find(x => x.id === 'start').growthNode, '这份跑史的起点');
    assert.equal(entries.find(x => x.id === 'half').growthNode, '已记录首场半马');
    assert.equal(entries.find(x => x.id === 'new').growthNode, '同口径进步 1 分 0 秒');
    f.setReply(() => Promise.resolve({ ...list(), entries: [{ ...second, status: 'dnf' }] })); await f.page.onShow();
    assert.equal(f.page.data.hero.id, second.id); assert.equal(f.page.data.hero.isPb, false);
  });
  await check('Import requires selection and a separate per race acknowledgement; failures retain edited candidates', async () => {
    const f = fixture(); await f.page.onShow(); f.page.openImport(); f.page.onImportText(event({}, '赛事名称,比赛日期,项目,净计时\n测试赛,2025-10-26,全马,03:52:42'));
    let confirmFails = true;
    f.setReply((url, method) => {
      if (url.endsWith('/preview')) return Promise.resolve({ candidates: [{ ...clone(first), candidateId: 'new', issues: [] }, { ...clone(second), candidateId: 'dup', duplicateId: 'exp:9', issues: [] }], warnings: ['请核对项目'] });
      if (url.endsWith('/confirm')) return confirmFails ? Promise.reject(new Error('连接暂时断开')) : Promise.resolve({ created: 1, skipped: 0, entries: [first] });
      return Promise.resolve(list());
    });
    await f.page.previewImport(); assert.equal(f.page.data.candidates[0].selected, false); assert.equal(f.page.data.candidates[0].acknowledged, false);
    f.page.selectCandidate(event({ index: 1 })); assert.equal(f.page.data.selectedCount, 0);
    f.page.selectCandidate(event({ index: 0 })); assert.equal(f.page.data.canConfirm, false);
    await f.page.confirmImport(); assert.equal(f.calls.filter(x => x.url.endsWith('/confirm')).length, 0);
    f.page.acknowledgeCandidate(event({ index: 0 })); assert.equal(f.page.data.canConfirm, true);
    f.page.onCandidate(event({ index: 0, field: 'name' }, '核对后的测试赛')); assert.equal(f.page.data.canConfirm, false);
    f.page.acknowledgeCandidate(event({ index: 0 })); await f.page.confirmImport();
    assert.equal(f.page.data.importError, '连接暂时断开'); assert.equal(f.page.data.candidates[0].name, '核对后的测试赛'); assert.equal(f.page.data.canConfirm, true);
    const body = f.calls.filter(x => x.url.endsWith('/confirm')).at(-1).body;
    assert.equal(body.candidates.length, 1); assert.equal(body.candidates[0].sourceKey, first.sourceKey); assert.equal(body.candidates[0].selected, undefined); assert.equal(body.candidates[0].media, undefined);
    confirmFails = false; await f.page.confirmImport(); assert.equal(f.page.data.candidates.length, 0); assert.match(f.page.data.importSuccess, /加入 1 场/);
  });
  await check('Unrecognized or conflicting projects remain unselected even after acknowledgement, until the runner chooses the actual project', async () => {
    const f = fixture(); await f.page.onShow(); f.page.openImport();
    const unknown = ['15公里', '25公里', '35公里', '50公里', '100公里', '半程/全程', '半全混合', undefined];
    const candidates = unknown.map((distance, index) => ({ ...clone(first), name: '项目待核对' + index, distance, distanceText: distance || '', candidateId: 'distance:' + index, issues: ['请确认比赛项目'] }));
    f.setReply((url, method, body) => {
      if (url.endsWith('/preview')) return Promise.resolve({ candidates, warnings: [] });
      if (url.endsWith('/confirm')) return Promise.resolve({ created: 1, skipped: 0, entries: [] });
      return Promise.resolve(list());
    });
    f.page.onImportText(event({}, '待核对的项目资料')); await f.page.previewImport();
    for (let index = 0; index < unknown.length; index++) {
      const item = f.page.data.candidates[index];
      assert.equal(item.distance, ''); assert.equal(item.distanceIndex, -1); assert.equal(item.distanceText, unknown[index] || '');
      f.page.selectCandidate(event({ index })); f.page.acknowledgeCandidate(event({ index }));
      assert.equal(f.page.data.canConfirm, false); assert.match(f.page.data.candidates[index].validationMessage, /比赛项目/);
      await f.page.confirmImport(); assert.equal(f.calls.filter(x => x.url && x.url.endsWith('/confirm')).length, 0);
      f.page.selectCandidate(event({ index }));
    }
    f.page.selectCandidate(event({ index: 0 }));
    f.page.candidatePick(event({ index: 0, field: 'distance' }, '4'));
    assert.equal(f.page.data.candidates[0].distance, 'other'); assert.equal(f.page.data.candidates[0].acknowledged, false); assert.equal(f.page.data.canConfirm, false);
    f.page.acknowledgeCandidate(event({ index: 0 })); assert.equal(f.page.data.canConfirm, true);
    await f.page.confirmImport();
    const saved = f.calls.find(x => x.url && x.url.endsWith('/confirm')).body.candidates[0];
    assert.equal(saved.distance, 'other');
    assert.equal(saved.distanceText, undefined);
  });
  await check('Actual text parsing keeps splits and aid-station intervals unresolved while an explicit five-kilometre project remains valid', async () => {
    const { parseImportText, normalizeEntry }=require(path.join(root,'server/src/race-history.js'));
    const f=fixture();await f.page.onShow();f.page.openImport();
    const makeText=clue=>'赛事名称：北京马拉松分段核对\n日期：2024-10-20\n'+clue+'\n净计时：03:12:45';
    f.setReply((url,method,body)=>{
      if(url.endsWith('/preview'))return Promise.resolve({candidates:parseImportText(body.text).map((raw,index)=>({...raw,candidateId:'split:'+index,issues:[...(raw.parseIssues||[]),...(!raw.distance?['请确认比赛项目']:[])]})),warnings:[]});
      if(url.endsWith('/confirm'))return Promise.resolve({created:1,skipped:0,entries:[]});
      return Promise.resolve(list());
    });
    for(const clue of ['上半程','前半程配速稳定','后半程状态不错','半程点：01:40:00','5公里','5公里：00:25:10','每5公里设置补给','10公里用时：00:51:00','补给距离：10公里','分段距离：5公里','分段：5公里','组别\n分段\n5公里','组别：每5公里\n10公里','组别\n上半程\n10公里','全程：计时组','全程：补给组','5公里：水站组','10公里：配速组','全程（计时组）','全程（补给组）','5公里（水站组）','10公里（配速组）',
      ...[['【','】'],['[',']'],['「','」'],['《','》'],['〈','〉'],['〖','〗']].flatMap(([open,close])=>['全程'+open+'补给组'+close,'5公里'+open+'00:25:10'+close,'10公里'+open+'配速组'+close]),
      ...['·','・','-','－'].flatMap(separator=>['全程'+separator+'计时组','5公里'+separator+'水站组','10公里'+separator+'配速组']),
      '5公里00:25:10','5公里3小时12分','5公里03时12分45秒','全程3小时12分45秒','全程03时12分45秒','上半程3小时12分','全程·补给组3小时12分45秒','10公里/配速组03时12分45秒','全程：03:12:45','全程 03:12:45','全程：03:12:45（补给组）','全程 03:12:45（配速组）','5公里水站组','配速组10公里','水站组-5公里','计时组全程','全程·补给组 03:12:45','全程、计时组','前半程男子组','上半程精英组','每5公里青年组','前半马男子组','后全马青年组']){
      const text=makeText(clue),raw=parseImportText(text)[0];assert.equal(raw.distance,'',clue);assert.throws(()=>normalizeEntry(raw),/项目/);
      f.page.onImportText(event({},text));await f.page.previewImport();
      assert.equal(f.page.data.candidates.length,1);assert.equal(f.page.data.candidates[0].distanceIndex,-1);assert.equal(f.page.data.candidates[0].netTime,'03:12:45');
      assert.match(f.page.data.candidates[0].issues.join('；'),/请确认.*项目/);
      f.page.selectCandidate(event({index:0}));f.page.acknowledgeCandidate(event({index:0}));assert.equal(f.page.data.canConfirm,false);
      await f.page.confirmImport();assert.equal(f.calls.filter(call=>call.url&&call.url.endsWith('/confirm')).length,0);
    }
    f.page.candidatePick(event({index:0,field:'distance'},'0'));assert.equal(f.page.data.candidates[0].distance,'full');assert.equal(f.page.data.candidates[0].acknowledged,false);
    f.page.acknowledgeCandidate(event({index:0}));await f.page.confirmImport();
    const saved=f.calls.find(call=>call.url&&call.url.endsWith('/confirm')).body.candidates[0];assert.equal(saved.distance,'full');assert.equal(saved.netTime,'03:12:45');
    const shortText='赛事名称：真实五公里比赛\n日期：2024-09-01\n项目：5公里\n净计时：00:23:45';
    f.page.onImportText(event({},shortText));await f.page.previewImport();assert.equal(f.page.data.candidates[0].distance,'5k');
    f.page.selectCandidate(event({index:0}));f.page.acknowledgeCandidate(event({index:0}));assert.equal(f.page.data.canConfirm,true);
    assert.equal(normalizeEntry(parseImportText(shortText)[0]).distance,'5k');
  });
  await check('Actual parsing preserves all separate project evidence while invalid earlier fields cannot veto a clear project', async () => {
    const { parseImportText, normalizeEntry } = require(path.join(root, 'server/src/race-history.js'));
    const f = fixture();
    const makeText = (clue, index) => '赛事名称：项目范围核对' + index + '\n日期：2024-10-20\n' + clue + '\n净计时：03:12:45';
    const saved = [];
    f.setReply((url, method, body) => {
      if (url.endsWith('/preview')) return Promise.resolve({ candidates: parseImportText(body.text).map((raw, index) => ({ ...raw, candidateId: 'project-clause:' + index, issues: [...(raw.parseIssues || []), ...(!raw.distance ? ['请确认比赛项目'] : [])] })), warnings: [] });
      if (url.endsWith('/confirm')) {
        saved.push(...body.candidates.map(candidate => normalizeEntry(candidate)));
        return Promise.resolve({ created: body.candidates.length, skipped: 0, entries: [] });
      }
      return Promise.resolve({ ...list(), entries: [], summary: { ...list().summary, experienceCount: 0, pb: [] } });
    });
    await f.page.onShow(); f.page.openImport();
    const englishUnitCases = [
      ['距离(m)：5000,项目：半程', ['5000', '半程']],
      ['距离(m)：5000,10000', ['5000', '10000']],
      ...[['5 kilometers', '半程'], ['10 kilometres', '半程'], ['5000 meters', '半程'], ['10000 metres', '全程'], ['26.2mi', '半程'], ['26.2 mile', '半程'], ['26.2miles', '半程'], ['13.1mi', '全程'], ['26.2英哩', '半程'], ['5kms', '半程'], ['10kms', '半程']].flatMap(([project, other]) => [
        ['完赛项目：' + project + '\n项目：' + other, [project, other]],
        ['项目：' + other + '\n完赛项目：' + project, [other, project]]
      ]),
      ...[['距离（米）', '42195', '半程'], ['距离（米）', '5000', '半程'], ['距离（米）', '21097.5', '全程'], ['距离（m）', '5000', '半程']].flatMap(([field, project, other]) => [
        [field + '：' + project + '\n项目：' + other, [project, other]],
        ['项目：' + other + '\n' + field + '：' + project, [other, project]]
      ]),
      ...[['比赛组别', '半程', '全程'], ['参赛组别', '10公里', '半程']].flatMap(([field, project, other]) => [
        [field + '：' + project + '\n完赛项目：' + other, [project, other]],
        ['完赛项目：' + other + '\n' + field + '：' + project, [other, project]]
      ])
    ];
    const metricUnitCases = [
      ...[['5000m', '半程'], ['10000m', '全程'], ['42195m', '半程'], ['21097.5m', '全程'], ['5,000m', '半程'], ['五千m', '半程'], ['5000公尺', '半程'], ['42195公尺', '半程'], ['五千公尺', '半程'], ['26.2英里', '半程']].flatMap(([project, other]) => [
        ['完赛项目：' + project + '\n项目：' + other, [project, other]],
        ['项目：' + other + '\n完赛项目：' + project, [other, project]]
      ]),
      ...[['报名项目', '半程', '全程'], ['竞赛项目', '10公里', '半程'], ['跑程', '全程', '半程']].flatMap(([field, project, other]) => [
        [field + '：' + project + '\n完赛项目：' + other, [project, other]],
        ['完赛项目：' + other + '\n' + field + '：' + project, [other, project]]
      ])
    ];
    const distanceNotationCases = [
      ...[['5000米', '半程'], ['10000米', '半程'], ['21097米', '全程'], ['42195米', '半程'], ['一万米', '半程'], ['42,195米', '半程']].flatMap(([project, other]) => [
        ['完赛项目：' + project + '\n项目：' + other, [project, other]],
        ['项目：' + other + '\n完赛项目：' + project, [other, project]]
      ]),
      ...[['赛程', '全程马拉松', '半程'], ['路程', '全程', '半程'], ['项目类型', '半程', '全程'], ['项目类别', '10公里', '半程'], ['赛项', '半程', '全程']].flatMap(([field, project, other]) => [
        [field + '：' + project + '\n项目：' + other, [project, other]],
        ['项目：' + other + '\n' + field + '：' + project, [other, project]]
      ]),
      ...['伍公里', '拾公里', '壹拾公里', '十公裡', '10公裡', '五km'].flatMap(project => [
        ['完赛项目：' + project + '\n项目：半程', [project, '半程']],
        ['项目：半程\n完赛项目：' + project, ['半程', project]],
        [project + '\n项目：半程', [project, '半程']],
        ['项目：半程\n' + project, ['半程', project]]
      ]),
      ['上半程和全程\n项目：5公里', ['上半程和全程', '5公里']],
      ['项目：5公里\n上半程和全程', ['5公里', '上半程和全程']]
    ];
    const standaloneNotationCases = [
      ...['26.2mi', '26.2 mile', '26.2miles', '13.1mi', '26.2英哩'].flatMap(project => [['完赛项目：' + project, [project]], [project, [project]]]),
      ['完赛项目：26.2英里', ['26.2英里']], ['26.2英里', ['26.2英里']],
      ...['十公里', '五公里', '十千米', '伍公里'].map(project => [project, [project]]),
      ['完赛项目：21097米', ['21097米']],
      ['21097米', ['21097米']]
    ];
    const explicitScopeCases = [
      ['完赛项目\n全程：03:12:45\n项目：半程', ['全程：03:12:45', '半程']],
      ['完赛项目：全程（5公里补给）\n项目：半程', ['全程（5公里补给）', '半程']],
      ['完赛项目：全程（分段10公里00:50:00）\n项目：半程', ['全程（分段10公里00:50:00）', '半程']],
      ['完赛项目：半程；全马用时03:12:45', ['半程', '全马用时03:12:45']],
      ['项目：半程\n完赛项目：全程马拉松 03:12:45', ['半程', '全程马拉松 03:12:45']],
      ['完赛项目：半程马拉松 01:35:00\n项目：全程', ['半程马拉松 01:35:00', '全程']],
      ...['全程马拉松 净计时：03:12:45', '全马用时03:12:45'].flatMap(project => [
        ['完赛项目：' + project + '\n项目：半程', [project, '半程']],
        ['项目：半程\n完赛项目：' + project, ['半程', project]]
      ]),
      ['完赛项目：全马用时\n03:12:45\n项目：半程', ['全马用时', '03:12:45', '半程']],
      ['项目：半程\n完赛项目：全马用时\n03:12:45', ['半程', '全马用时', '03:12:45']],
      ['完赛项目：全程马拉松\n净计时：03:12:45\n项目：半程', ['全程马拉松', '半程']],
      ['项目：半程\n完赛项目：全程马拉松\n净计时：03:12:45', ['半程', '全程马拉松']],
      ['完赛项目：全程（上半程 01:05:00）\n项目：半程', ['全程（上半程 01:05:00）', '半程']],
      ['距离：42.195公里\n项目：半程', ['42.195公里', '半程']],
      ['项目：半程\n距离：42.195公里', ['半程', '42.195公里']],
      ['距离：半程、全程\n项目：5公里', ['半程、全程', '5公里']],
      ['项目：5公里\n距离：半程、全程', ['5公里', '半程、全程']],
      ['里程：全马\n项目：半程', ['全马', '半程']],
      ['项目名称：半程\n项目：全程', ['半程', '全程']],
      ['项目名：半程\n项目：全程', ['半程', '全程']],
      ...['；', ';', '|', '｜'].map(separator => ['完赛项目：10公里' + separator + '半程：01:35:00', ['10公里', '半程：01:35:00']]),
      ...['全程 03:12:45', '全程：03:12:45', '全程（03:12:45）', '全程3小时12分45秒'].flatMap(project => [
        ['完赛项目：' + project + '\n项目：半程', [project, '半程']],
        ['项目：半程\n完赛项目：' + project, ['半程', project]]
      ]),
      ...['全程（上半程01:35:00）', '全程（每5公里补给）'].flatMap(project => [
        ['完赛项目：' + project + '\n项目：半程', [project, '半程']],
        ['项目：半程\n完赛项目：' + project, ['半程', project]]
      ]),
      ['完赛项目：上半程和全程\n项目：5公里', ['上半程和全程', '5公里']],
      ['项目：5公里\n完赛项目：上半程和全程', ['5公里', '上半程和全程']],
      ...['距离', '里程', '项目名称', '项目名'].flatMap(field => [
        [field + '：全程\n项目：半程', ['全程', '半程']],
        ['项目：半程\n' + field + '：全程', ['半程', '全程']]
      ]),
      ...['五公里', '十公里', '十千米'].flatMap(project => [
        ['完赛项目：' + project + '\n项目：半程', [project, '半程']],
        ['项目：半程\n完赛项目：' + project, ['半程', project]],
        [project + '\n项目：半程', [project, '半程']],
        ['项目：半程\n' + project, ['半程', project]]
      ]),
      ...['；', ';', '|', '｜'].flatMap(separator => [
        ['完赛项目：半程' + separator + '全程：03:12:45', ['半程', '全程：03:12:45']],
        ['完赛项目：全程：03:12:45' + separator + '半程', ['全程：03:12:45', '半程']]
      ])
    ];
    const timedOnlyProjectCases = [
      ...['全程 03:12:45', '全程：03:12:45', '全程（03:12:45）', '全程3小时12分45秒', '全程马拉松 03:12:45', '半程马拉松 01:35:00', '全程马拉松 净计时：03:12:45', '全马用时03:12:45'].map(project => ['完赛项目：' + project, [project]])
    ];
    const latestParallelCases = [
      ['完赛项目：半程、全程 03:12:45', ['半程', '全程 03:12:45']],
      ['完赛项目：全程、半程 01:35:00', ['全程', '半程 01:35:00']],
      ['完赛项目：5公里/10公里 00:48:00', ['5公里', '10公里 00:48:00']],
      ['完赛项目：全程（03:12:45）、半程（大众组）', ['全程（03:12:45）', '半程（大众组）']],
      ['项目：半程，全程 03:12:45', ['半程', '全程 03:12:45']],
      ['项目：半程,全程 03:12:45', ['半程', '全程 03:12:45']],
      ['完赛项目：半程、全程3小时12分', ['半程', '全程3小时12分']],
      ['完赛项目：半程、全程03时12分45秒', ['半程', '全程03时12分45秒']],
      ['完赛项目：全程、半程1小时35分', ['全程', '半程1小时35分']],
      ['完赛项目：半程、全程：03:12:45', ['半程', '全程：03:12:45']],
      ['完赛项目：半程、全程03:12:45', ['半程', '全程03:12:45']],
      ['完赛项目：全程·精英组3小时12分45秒\n项目：半程', ['全程·精英组3小时12分45秒', '半程']],
      ['项目：半程\n全程·精英组03时12分45秒', ['半程', '全程·精英组03时12分45秒']],
      ['完赛项目：半程·大众组 全程·精英组', ['半程·大众组 全程·精英组']],
      ['完赛项目：全程·精英组 半程·大众组', ['全程·精英组 半程·大众组']],
      ['半程·大众组 全程·精英组', ['半程·大众组 全程·精英组']],
      ['全程·精英组 半程·大众组', ['全程·精英组 半程·大众组']],
      ['完赛项目：半程01:35:00、全程03:12:45', ['半程01:35:00', '全程03:12:45']],
      ...['以及', '至', '到', '或者', '～', '~'].flatMap(separator => [
        ['完赛项目：半程' + separator + '全程\n项目：5公里', ['半程' + separator + '全程', '5公里']],
        ['项目：5公里\n完赛项目：全程' + separator + '半程', ['5公里', '全程' + separator + '半程']]
      ]),
      ['精英组～全程\n项目：半程', ['精英组～全程', '半程']],
      ['项目：半程\n精英组~全程', ['半程', '精英组~全程']],
      ['18岁-39岁全程\n项目：半程', ['18岁-39岁全程', '半程']],
      ['18周岁-39周岁全程\n项目：半程', ['18周岁-39周岁全程', '半程']],
      ['18周岁至39周岁半程\n项目：全程', ['18周岁至39周岁半程', '全程']],
      ['项目：半程\n18岁-39岁全程', ['半程', '18岁-39岁全程']],
      ['项目：半程\n18周岁-39周岁全程', ['半程', '18周岁-39周岁全程']],
      ['项目：全程\n18周岁至39周岁半程', ['全程', '18周岁至39周岁半程']]
    ];
    const orderedCategoryCases = [
      ...englishUnitCases, ...metricUnitCases, ...distanceNotationCases, ...standaloneNotationCases,
      ...explicitScopeCases, ...timedOnlyProjectCases,
      ...latestParallelCases,
      ['完赛项目：半程马拉松大众组\n项目：全程', ['半程马拉松大众组']],
      ['完赛项目：全程 精英组\n项目：半程', ['全程 精英组']],
      ['完赛项目：全程马拉松男子精英组\n项目：半程', ['全程马拉松男子精英组']],
      ['项目：半程，全程 精英组', ['全程 精英组']],
      ['项目：10公里\n5公里青年组', ['5公里青年组']],
      ['5公里 青年组\n项目：10公里', ['5公里 青年组']],
      ['完赛项目：精英组·全程马拉松\n项目：半程', ['精英组·全程马拉松']],
      ['完赛项目：男子【全程】\n项目：半程', ['男子【全程】']],
      ['项目：全程\n大众组-半程', ['大众组-半程']],
      ['项目：半程\n男子：全程', ['男子：全程']],
      ['18-39岁全程\n项目：半程', ['18-39岁全程']],
      ['完赛项目：全程·精英组 03:12:45\n项目：半程', ['全程·精英组 03:12:45']],
      ['全程·精英组：03:12:45\n项目：半程', ['全程·精英组：03:12:45']],
      ['半程马拉松 大众组 01:45:22\n全程马拉松 精英组 03:12:45', ['半程马拉松 大众组 01:45:22', '全程马拉松 精英组 03:12:45']],
      ['完赛项目：全程、男子组\n项目：半程', ['全程、男子组']],
      ['全程/男子\n项目：半程', ['全程/男子']],
      ['项目：半程\n完赛项目：精英组·全程马拉松', ['精英组·全程马拉松']],
      ['项目：半程\n完赛项目：男子【全程】', ['男子【全程】']],
      ['青年组5公里\n项目：10公里', ['青年组5公里']],
      ['项目：半程\n40岁以上 全程', ['40岁以上 全程']],
      ['项目：半程\n全程马拉松 追风跑者组', ['全程马拉松 追风跑者组']],
      ['项目：10公里\n15公里青年组', ['15公里青年组']],
      ['35公里精英组\n项目：5公里', ['35公里精英组']],
      ['半程马拉松·大众组\n精英组 全程马拉松', ['半程马拉松·大众组', '精英组 全程马拉松']]
    ];
    const conflicts = [
      ...orderedCategoryCases.map(([clue]) => clue),
      '完赛项目：半程，全程', '项目：5公里，10公里', '完赛项目：半程马拉松，全程', '项目：半程,全程', '项目：全程；半程', '项目：全程;半程',
      '组别：半程\n完赛项目：全程马拉松', '组别\n半程\n全程', '完赛项目\n全程\n半程', '比赛项目\n5 公里\n10 公里', '项目：半程、\n全程', '项目：全程\n5公里', '项目：10公里\n半程',
      '完赛项目：半程\n姓名：张三\n全程', '项目：5公里\n城市：北京\n10公里', '项目：半程\n号码布：A12345\n全程',
      '项目：全马\n后半程状态不错\n半程', '项目：5公里\n这是一行普通说明文字\n10公里',
      '项目：半程\n全程：男子', '项目：5公里\n10公里：公开组', '项目：半程\n全程:女子组',
      '项目：全程\n每5公里补给\n10公里', '项目：全马\n分段\n5公里', '项目：全马\n项目介绍\n5公里',
      '10公里\n城市：北京\n项目：5公里', '全程：男子\n号码布：A12345\n完赛项目：半程',
      ...['精英组', '家庭组', '公开男子组', '40岁以上', '男子40岁以上', '18-39岁', '40-59岁', '追风跑者组', '精英选手'].map(group => '项目：半程\n全程：' + group),
      '项目：全马\n半程：大众组', '项目：5公里\n10公里：青年组',
      '完赛项目：半程\n全程（精英组）', '项目：半程\n全程马拉松（大众组）', '项目：半程\n全程 （大众组）',
      '项目：全程（精英组）\n完赛项目：半程', '全程（精英组）\n半程（大众组）', '半程（大众组）\n全程（精英组）',
      '项目：5公里\n10公里（青年组）', '10公里（青年组）\n城市：北京\n项目：5公里',
      '项目：半程\n全程(男子40岁以上)', '项目：半程\n全程（追风跑者组）',
      '比赛项目\n全程（精英组）\n半程（大众组）',
      '项目：半程\n全程（精英组，40岁以上）', '项目：半程\n全程（精英组）、5公里（水站组）',
      ...[['【','】'],['[',']'],['「','」']].flatMap(([open,close])=>[
        '完赛项目：半程\n全程'+open+'精英组'+close,
        '完赛项目：全程'+open+'精英组'+close+'\n项目：半程',
        '全程'+open+'精英组'+close+'\n半程'+open+'大众组'+close,
        '项目：5公里'+open+'青年组'+close+'\n10公里'+open+'公开组'+close,
        '项目：半程\n全程'+open+'精英组，03:12:45'+close,
        '项目：半程\n全程'+open+'精英组'+close+open+'03:12:45'+close
      ]),
      '项目：半程\n全程（精英组，03:12:45）', '项目：半程\n全程（精英组）（03:12:45）',
      '全程（精英组，03:12:45）\n项目：半程', '全程（精英组）（03:12:45）\n项目：半程',
      ...['·','・','-','－'].flatMap(separator=>[
        '完赛项目：全程'+separator+'精英组\n项目：半程',
        '项目：半程\n全程'+separator+'大众组',
        '半程'+separator+'大众组\n全程'+separator+'精英组',
        '项目：5公里'+separator+'青年组\n10公里'+separator+'公开组'
      ]),
      ...[['【','】'],['《','》'],['〈','〉'],['〖','〗']].flatMap(([open,close])=>[
        '完赛项目：半程\n'+open+'全程'+close,
        '完赛项目：'+open+'全程'+close+'\n项目：半程',
        open+'半程'+close+'\n'+open+'全程'+close,
        '项目：半程\n全程'+open+'精英组'+close
      ]),
      '项目：半程\n全程：03:12:45（精英组）', '项目：半程\n全程 03:12:45（精英组）',
      '完赛项目：全程：03:12:45（精英组）\n项目：半程', '完赛项目：全程 03:12:45（精英组）\n项目：半程'
    ];
    for (const [index, clue] of conflicts.entries()) {
      const text = makeText(clue, index), raw = parseImportText(text)[0];
      assert.equal(raw.distance, '', clue); assert.throws(() => normalizeEntry(raw), /项目/);
      f.page.onImportText(event({}, text)); await f.page.previewImport();
      const candidate = f.page.data.candidates[0];
      assert.equal(candidate.distance, ''); assert.equal(candidate.distanceIndex, -1); assert.equal(candidate.netTime, '03:12:45');
      const requiresManualChoice = [...timedOnlyProjectCases, ...standaloneNotationCases].some(([text]) => text === clue);
      assert.match(candidate.issues.join('；'), requiresManualChoice ? /请确认.*项目/ : /多个比赛项目或距离.*请确认.*项目/, clue);
      const orderedCategoryEvidence = orderedCategoryCases.find(([text]) => text === clue)?.[1] || [];
      for (const evidence of orderedCategoryEvidence) {
        const reviewText = value => value.normalize('NFKC').replace(/\s+/g, '');
        assert.ok(reviewText(raw.distanceText).includes(reviewText(evidence)), 'the complete project and annotations remain in parser evidence: ' + clue);
        assert.ok(reviewText(candidate.distanceText).includes(reviewText(evidence)), 'the complete project and annotations remain visible: ' + clue);
      }
      if (clue.includes('\n') && !/^(?:净计时|用时|\d{1,3}[:：])/.test(clue.split('\n').at(-1))) {
        const evidenceText = value => value.normalize('NFKC').replace(/[【\[「《〈〖]/g, '(').replace(/[】\]」》〉〗]/g, ')').replace(/\s+/g, '');
        const trailing = evidenceText(clue.split('\n').at(-1)).replace(/^(?:完赛项目|比赛项目|报名项目|竞赛项目|比赛组别|参赛组别|项目名称|项目类型|项目类别|项目名|项目|组别|距离(?:\((?:米|m)\))?|里程|赛程|路程|跑程|赛项)[:：]?/, '').split(/[:：]/)[0];
        assert.ok(evidenceText(candidate.distanceText).includes(trailing), 'the trailing project remains visible: ' + clue);
        const heading = clue.split('\n').at(-1);
        if (/^(?:全程|半程|10公里)[:：]/.test(heading)) assert.ok(candidate.distanceText.replace(/\s+/g, '').includes(heading.normalize('NFKC').replace(/\s+/g, '')), 'the complete project and group remain visible: ' + clue);
      }
      for (const line of clue.split('\n')) {
        const evidenceText = value => value.normalize('NFKC').replace(/[【\[「《〈〖]/g, '(').replace(/[】\]」》〉〗]/g, ')').replace(/\s+/g, '');
        const heading = evidenceText(line).replace(/^(?:完赛项目|比赛项目|报名项目|竞赛项目|比赛组别|参赛组别|项目名称|项目类型|项目类别|项目名|项目|组别|距离(?:\((?:米|m)\))?|里程|赛程|路程|跑程|赛项)[:：]?/, '');
        if (/^(?:全程马拉松|半程马拉松|全程|半程|全马|半马|5公里|10公里)(?:\(|[·・-]|\d)|^\((?:全程|半程)/.test(heading)) assert.ok(evidenceText(candidate.distanceText).includes(heading), 'the complete bracketed project and its annotations remain visible: ' + clue);
      }
      f.page.selectCandidate(event({ index: 0 })); f.page.acknowledgeCandidate(event({ index: 0 }));
      assert.equal(f.page.data.canConfirm, false); await f.page.confirmImport();
      assert.equal(saved.length, 0); assert.equal(f.calls.filter(call => call.url && call.url.endsWith('/confirm')).length, 0);
      assert.equal(f.page.data.entries.length, 0); assert.equal(f.page.data.summary.experienceCount, 0); assert.deepEqual(Array.from(f.page.data.summary.pb), []);
    }
    f.page.candidatePick(event({ index: 0, field: 'distance' }, '0'));
    assert.equal(f.page.data.candidates[0].acknowledged, false); assert.equal(f.page.data.canConfirm, false);
    f.page.acknowledgeCandidate(event({ index: 0 })); await f.page.confirmImport();
    assert.equal(saved.length, 1); assert.equal(saved[0].distance, 'full'); assert.equal(saved[0].netSeconds, 11565);
    const clearProjects = [
      ['距离(m)：5,000,城市：北京', '5k'], ['距离(m)：42,195,号码布：5000 meters', 'full'],
      ...[['5 kilometers', '5k'], ['10 kilometres', '10k'], ['5000 meters', '5k'], ['10000 metres', '10k'], ['5kms', '5k'], ['10kms', '10k']].map(([project, distance]) => ['完赛项目：' + project, distance]),
      ['距离（米）：42195', 'full'], ['距离（米）：5000', '5k'], ['距离（米）：21097.5', 'half'], ['距离（m）：5000', '5k'],
      ...[['比赛组别', '男子', '全程', 'full'], ['参赛组别', '女子', '半程', 'half']].flatMap(([field, group, project, distance]) => [
        [field + '：' + group + '\n完赛项目：' + project, distance],
        ['完赛项目：' + project + '\n' + field + '：' + group, distance]
      ]),
      ['项目：全程\n5000 meters：00:25:10', 'full'], ['5000 meters：00:25:10\n项目：全程', 'full'],
      ...[["5000m", "5k"], ["10000m", "10k"], ["42195m", "full"], ["21097.5m", "half"], ["5,000m", "5k"], ["五千m", "5k"], ["5000公尺", "5k"], ["42195公尺", "full"], ["五千公尺", "5k"]].map(([project, distance]) => ['完赛项目：' + project, distance]),
      ['完赛项目：5km(5000米)', '5k'], ['完赛项目：四万二千一百九十五米', 'full'],
      ['项目：全程\n5000m：00:25:10', 'full'], ['5000m：00:25:10\n项目：全程', 'full'],
      ['完赛项目：5000米', '5k'], ['完赛项目：10000米', '10k'], ['完赛项目：42195米', 'full'],
      ...['计时组', '用时组', '耗时组', '成绩组', '时间组'].flatMap(group => [
        ['项目\n全程：' + group + '\n项目：半程', 'half'],
        ['完赛项目：全程（' + group + '）\n项目：半程', 'half']
      ]),
      ...[
        ['完赛项目：全程马拉松 精英组', 'full'], ['全程 精英组', 'full'], ['全程马拉松男子精英组', 'full'],
        ['半程马拉松大众组', 'half'], ['5公里青年组', '5k'], ['青年组5公里', '5k'],
        ['精英组·全程马拉松', 'full'], ['男子【全程】', 'full'], ['大众组-半程', 'half'],
      ['男子：全程', 'full'], ['18-39岁全程', 'full'], ['40岁以上 全程', 'full'], ['40岁以上全程马拉松', 'full'],
        ['全程·精英组 03:12:45', 'full'], ['全程·精英组：03:12:45', 'full'],
        ['全程·精英组3小时12分45秒', 'full'], ['全程·精英组03时12分45秒', 'full'],
        ['18岁-39岁全程', 'full'], ['18周岁-39周岁全程', 'full'], ['18周岁至39周岁半程', 'half'],
        ['精英组～全程', 'full'], ['精英组~全程', 'full'],
        ['全程、男子组', 'full'], ['全程/男子', 'full'],
        ['项目：全程\n5公里：00:25:10', 'full'], ['5公里：00:25:10\n项目：全程', 'full'],
        ['项目：全程\n上半程01:35:00\n每5公里补给', 'full'],
        ['完赛项目：五公里', '5k'], ['完赛项目：十公里', '10k'], ['完赛项目：十千米', '10k'],
        ...['距离', '里程', '项目名称', '项目名'].map(field => [field + '：全程', 'full']),
        ['项目：全马\n全程马拉松 精英组', 'full'], ['项目：半程\n大众组半程马拉松', 'half'],
        ['项目：全马\n组别：精英组', 'full'],
        ['项目：全马\n5公里水站组\n配速组10公里\n计时组全程', 'full'],
        ['项目：全马\n全程·补给组 03:12:45\n5公里/水站组', 'full']
      ],
      ['组别：男子\n完赛项目：全程马拉松', 'full'], ['组别：女子组\n完赛项目：半程马拉松', 'half'], ['组别：公开组\n完赛项目：全马', 'full'],
      ['项目介绍\n欢迎来到这场比赛\n完赛项目：全马', 'full'], ['项目介绍：欢迎参赛\n完赛项目：全马', 'full'],
      ['项目组：男子\n完赛项目：全马', 'full'], ['完赛项目：半马\n项目组：女子组', 'half'],
      ['项目：全程\n项目介绍：半程、10公里', 'full'], ['项目：半程\n5公里：00:25:10', 'half'],
      ['项目\n这是一行说明文字\n完赛项目：全马', 'full'], ['项目：上半程\n完赛项目：全马', 'full'],
      ['项目：每5公里补给\n完赛项目：全马', 'full'], ['项目：全马\n姓名：张三\n城市：北京\n号码布：A12345\n后半程状态不错', 'full'],
      ['项目：全马\n全程：公开组', 'full'], ['项目：全马\n每5公里补给\n10公里用时：00:50:00', 'full'],
      ['项目：全马\n5公里：00:25:10\n半程：补给点\n每5公里补给', 'full'],
      ['完赛项目：全马\n项目：上半程', 'full'],
      ['全程（精英组）', 'full'], ['全程马拉松（大众组）', 'full'], ['项目：全程 （大众组）', 'full'],
      ['全程（精英组）\n项目：全马', 'full'], ['项目：半程（女子40岁以上）', 'half'],
      ['项目：5公里（青年组）', '5k'], ['10公里（公开组）', '10k'],
      ['项目：全马\n5公里：水站组\n10公里：配速组\n半程：计时组\n半程：补给组', 'full'],
      ['项目：全马\n5公里（水站组）\n10公里（配速组）\n半程（计时组）\n半程（补给组）', 'full'],
      ['全程（精英组，40岁以上）', 'full'], ['全程（精英组）、5公里（水站组）', 'full'],
      ...[['【','】'],['[',']'],['「','」']].flatMap(([open,close])=>[
        ['全程'+open+'精英组'+close,'full'],
        ['项目：5公里'+open+'青年组'+close,'5k'],
        ['项目：全马\n5公里'+open+'水站组'+close+'\n10公里'+open+'00:50:00'+close,'full'],
        ['全程'+open+'精英组，03:12:45'+close,'full'],
        ['全程'+open+'精英组'+close+open+'03:12:45'+close,'full']
      ]),
      ['全程（精英组，03:12:45）','full'], ['全程（精英组）（03:12:45）','full'],
      ...['·','・','-','－'].flatMap(separator=>[
        ['全程'+separator+'精英组','full'],
        ['项目：5公里'+separator+'青年组','5k'],
        ['项目：全马\n全程'+separator+'大众组','full'],
        ['项目：全马\n5公里'+separator+'水站组\n10公里'+separator+'配速组','full']
      ]),
      ...[['【','】'],['《','》'],['〈','〉'],['〖','〗']].flatMap(([open,close])=>[
        [open+'全程'+close,'full'],
        ['完赛项目：'+open+'全程'+close,'full'],
        ['全程'+open+'精英组'+close,'full'],
        ['项目：全马\n5公里'+open+'水站组'+close+'\n10公里'+open+'00:50:00'+close,'full']
      ]),
      ['全程：03:12:45（精英组）','full'], ['全程 03:12:45（精英组）','full'],
      ['项目：全马\n全程：03:12:45（精英组）','full']
    ];
    for (const [index, [clue, distance]] of clearProjects.entries()) {
      const text = makeText(clue, index + conflicts.length);
      const raw = parseImportText(text)[0];
      assert.equal(raw.distance, distance, clue); assert.equal(normalizeEntry(raw).distance, distance, clue);
      if(/^距离\(m\)：(?:5,000|42,195),/.test(clue)) assert.ok(!/城市|北京|号码布|5000 meters/.test(raw.distanceText), 'field metadata stays out of project evidence: ' + clue);
      f.page.onImportText(event({}, text)); await f.page.previewImport();
      assert.equal(f.page.data.candidates[0].distance, distance); assert.equal(f.page.data.candidates[0].validationMessage, '');
      assert.ok(!f.page.data.candidates[0].issues.some(issue => /项目/.test(issue)), clue);
      if(/^距离\(m\)：(?:5,000|42,195),/.test(clue)) assert.ok(!/城市|北京|号码布|5000 meters/.test(f.page.data.candidates[0].distanceText), 'field metadata stays out of visible project evidence: ' + clue);
      f.page.selectCandidate(event({ index: 0 })); f.page.acknowledgeCandidate(event({ index: 0 }));
      assert.equal(f.page.data.canConfirm, true); await f.page.confirmImport();
      assert.equal(saved.at(-1).distance, distance);
    }
    assert.deepEqual(saved.map(candidate => candidate.distance), ['full', ...clearProjects.map(([, distance]) => distance)]);
  });
  await check('Candidates support trail, online and DNF corrections before any PB eligible data is saved', async () => {
    const f = fixture(); await f.page.onShow(); f.page.setData({ candidates: [{ ...f.helper.formEntry(first), selected: true, acknowledged: true }] });
    f.page.candidatePick(event({ index: 0, field: 'kind' }, '1')); f.page.candidatePick(event({ index: 0, field: 'meet' }, '1'));
    assert.equal(f.page.data.candidates[0].kind, 'trail'); assert.equal(f.page.data.candidates[0].meet, 'online'); assert.equal(f.page.data.candidates[0].acknowledged, false);
    f.page.onCandidate(event({ index: 0, field: 'netTime' }, 'broken')); assert.match(f.page.data.candidates[0].validationMessage, /时:分:秒/);
    f.page.acknowledgeCandidate(event({ index: 0 })); assert.equal(f.page.data.canConfirm, false);
    f.page.candidatePick(event({ index: 0, field: 'status' }, '1')); f.page.acknowledgeCandidate(event({ index: 0 }));
    assert.equal(f.page.data.candidates[0].netTime, ''); assert.equal(f.page.data.candidates[0].gunTime, ''); assert.equal(f.page.data.canConfirm, true);
  });
  await check('OCR only selects or uploads after explicit consent for this action, using the current legal version', async () => {
    const f = fixture(); await f.page.onShow(); f.page.openImport(); f.page.chooseScreenshots();
    assert.equal(f.chooses.length, 0); assert.equal(f.uploads.length, 0); assert.match(f.modals[0].content, /不发送第三方/);
    f.answer(false); assert.equal(f.page.data.busy, ''); assert.equal(f.chooses.length, 0);
    f.page.chooseScreenshots(); f.answer(true); assert.equal(f.chooses.at(-1).count, 5);
    const pending = f.chooses.at(-1).success({ tempFiles: [{ tempFilePath: '/tmp/score.jpg', size: 100 }] });
    assert.equal(f.uploads.length, 1); const upload = f.uploads[0];
    assert.equal(upload.url, 'https://runner.example/marathon/api/me/race-history/recognize');
    assert.equal(upload.header['X-Race-History-Consent'], legal.version); assert.equal(upload.header.Authorization, 'Bearer fixture-owner-token'); assert.equal(upload.timeout, 60000);
    upload.success({ statusCode: 200, data: JSON.stringify({ text: '测试赛 2025-10-26 全马 净计时03:52:42', warnings: ['请人工核对'], confidence: 91 }) }); await pending;
    assert.match(f.page.data.importText, /03:52:42/); assert.equal(f.page.data.candidates.length, 0); assert.equal(f.calls.some(x => /\/import\/confirm$/.test(x.url || '')), false);
    f.page.chooseScreenshots(); assert.equal(f.modals.length, 3); assert.equal(f.chooses.length, 1);
  });
  await check('Several OCR files keep successful text and explain failed images without saving originals', async () => {
    const f = fixture(); await f.page.onShow(); f.page.setData({ importText: '我已有的文字', candidates: [{ name: '此前候选' }] });
    const pending = f.page.recognizeFiles([{ tempFilePath: '/tmp/a.jpg', size: 1 }, { tempFilePath: '/tmp/b.jpg', size: 1 }, { tempFilePath: '/tmp/large.jpg', size: 9 * 1024 * 1024 }], f.page.session());
    f.uploads[0].success({ statusCode: 200, data: JSON.stringify({ text: '第一场 成绩', warnings: [] }) }); await tick();
    assert.equal(f.uploads.length, 2); f.uploads[1].fail({ errMsg: 'network' }); await pending;
    assert.match(f.page.data.importText, /我已有的文字\n\n第一场 成绩/); assert.match(f.page.data.importError, /第 2 张/); assert.match(f.page.data.importError, /第 3 张/);
    assert.equal(f.page.data.candidates.length, 0); assert.equal(f.calls.filter(x => x.method === 'POST').length, 0);
    const retry = f.page.recognizeFiles([{ tempFilePath: '/tmp/c.jpg', size: 1 }], f.page.session()); f.uploads.at(-1).fail({}); await retry;
    assert.match(f.page.data.importText, /第一场 成绩/);
  });
  await check('Account switching discards late OCR, detail and list responses and clears drafts and private URLs', async () => {
    const f = fixture(); await f.page.onShow(); await f.page.openEntryId(first.id); f.page.openAdd();
    const recognition = f.page.recognizeFiles([{ tempFilePath: '/tmp/earlier.jpg', size: 1 }, { tempFilePath: '/tmp/late.jpg', size: 1 }], f.page.session());
    f.uploads[0].success({ statusCode: 200, data: JSON.stringify({ text: '第一张旧资料已成功' }) }); await tick(); assert.equal(f.uploads.length, 2);
    let finishOld; f.setReply(() => new Promise(resolve => { finishOld = resolve; })); const oldList = f.page.load();
    f.app.globalData.token = ''; await f.page.onShow();
    finishOld(list()); f.uploads[1].fail({ errMsg: '第二张在换账号后失败' }); await Promise.all([recognition, oldList]);
    assert.equal(f.page.data.ready, false); assert.equal(f.page.data.entries.length, 0); assert.equal(f.page.data.editor, null); assert.equal(f.page.data.selected, null); assert.equal(f.page.data.importText, '');
    f.app.globalData.token = 'new-owner'; f.setReply(() => Promise.resolve({ ...list(), entries: [], summary: { experienceCount: 0 } })); await f.page.onShow(); assert.equal(f.page.data.entries.length, 0); assert.equal(f.page.data.section, 'history');
  });
  await check('The latest detail wins; a detail error can retry the same encoded private identity', async () => {
    const f = fixture(); await f.page.onShow(); let resolveOld;
    f.setReply(url => url.includes(encodeURIComponent(second.id)) ? Promise.resolve({ entry: clone(second), review }) : new Promise(resolve => { resolveOld = resolve; }));
    const old = f.page.openEntryId(first.id); await f.page.openEntryId(second.id); resolveOld({ entry: clone(first), review }); await old;
    assert.equal(f.page.data.selected.id, second.id);
    f.setReply(() => Promise.reject(new Error('这次暂未读到'))); await f.page.openEntryId(second.id); assert.equal(f.page.data.selected, null); assert.equal(f.page.data.error, '这次暂未读到');
    f.setReply(() => Promise.resolve({ entry: clone(second), review })); await f.page.retryEntry(); assert.equal(f.page.data.selected.id, second.id);
  });
  await check('Expired authentication clears all private state and authentication before retrying', async () => {
    const f = fixture(); await f.page.onShow(); f.page.openAdd(); f.page.setData({ importText: '私密文字', candidates: [{ name: '私密候选' }] });
    f.setReply(() => Promise.reject(Object.assign(new Error('请重新登录'), { status: 401 }))); await f.page.load();
    assert.equal(f.app.globalData.token, ''); assert.equal(f.page.data.ready, false); assert.equal(f.page.data.entries.length, 0); assert.equal(f.page.data.editor, null); assert.equal(f.page.data.importText, ''); assert.equal(f.page.data.candidates.length, 0);
    f.page.login(); assert.equal(f.storage.marathon_return_after_login, '/pages/history/history'); assert.equal(f.calls.at(-1).url, '/pages/mine/mine');
  });
  await check('Only own private media URLs get a token; inherited videos stay out of image preview and covers', async () => {
    const f = fixture(), entry = f.helper.decorateEntry({ ...first, coverMediaId: 'runner:3', media: [
      { id: 'history:1', kind: 'photo', url: '/marathon/api/me/race-history/exp%3A1/media/1/file' },
      { id: 'runner:3', kind: 'video', mime: 'video/mp4', inherited: true, url: '/marathon/api/me/runner/media/3/file' },
      { id: 'external', kind: 'photo', url: 'https://untrusted.example/a.jpg' }
    ] });
    assert.match(entry.coverSrc, /^https:\/\/runner.example\/marathon\/api\//); assert.equal(entry.coverDisplayId, 'history:1'); assert.equal(entry.media[2].src, '');
    f.page.setData({ selected: entry }); f.page.previewMedia(event({ id: 'history:1' })); assert.equal(f.calls.at(-1).urls.length, 1);
    const before = f.calls.length; f.page.previewMedia(event({ id: 'runner:3' })); assert.equal(f.calls.length, before);
    f.page.deleteMedia(event({ id: 'runner:3' })); assert.equal(f.modals.length, 0);
  });
  await check('Uploading a separate private souvenir uses its kind and never reuses OCR consent', async () => {
    const f = fixture(); await f.page.onShow(); await f.page.openEntryId(first.id); f.page.pickMediaKind(event({}, '1')); f.page.chooseMedia();
    const pending = f.chooses.at(-1).success({ tempFiles: [{ tempFilePath: '/tmp/certificate.jpg', size: 200 }] });
    const upload = f.uploads.at(-1); assert.match(upload.url, /exp%3A1\/media\?kind=certificate$/); assert.equal(upload.header['X-Race-History-Consent'], undefined);
    upload.success({ statusCode: 200, data: JSON.stringify({ media: { id: 'history:8' } }) }); await pending;
    assert.equal(f.page.data.busy, ''); assert.equal(f.page.data.section, 'review');
    f.page.chooseMedia(); f.chooses.at(-1).fail({ errMsg: 'chooseMedia:fail privacy permission denied' }); assert.match(f.page.data.message, /隐私授权/);
  });
  await check('New souvenir deletion is confirmed; deleting a legacy entry clearly preserves original results', async () => {
    const f = fixture(); await f.page.onShow(); f.page.setData({ selected: f.helper.decorateEntry({ ...second, media: [{ id: 'history:8', kind: 'photo', url: '/marathon/api/me/race-history/a/media/8/file' }] }) });
    f.page.deleteMedia(event({ id: 'history:8' })); assert.equal(f.calls.filter(x => x.method === 'DELETE').length, 0); f.answer(true); await tick();
    assert.ok(f.calls.some(x => x.method === 'DELETE' && x.url.endsWith('/media/history%3A8')));
    f.page.setData({ selected: f.helper.decorateEntry(second) }); f.page.deleteEntry(); assert.match(f.modals.at(-1).content, /原有赛事成绩和收藏仍保留/); f.answer(false); assert.equal(f.page.data.selected.id, second.id);
  });
  await check('Text file cancellation and read errors keep previous source and reviewed candidates', async () => {
    const f = fixture(); await f.page.onShow(); f.page.setData({ importText: '不能丢掉', candidates: [{ name: '已核对' }] });
    f.page.chooseTextFile(); f.chooses.at(-1).fail({ errMsg: 'chooseMessageFile:fail cancel' }); assert.equal(f.page.data.importText, '不能丢掉'); assert.equal(f.page.data.candidates.length, 1);
    f.page.chooseTextFile(); f.chooses.at(-1).success({ tempFiles: [{ path: '/tmp/in.csv', size: 100 }] }); f.reader().fail({}); assert.equal(f.page.data.importText, '不能丢掉'); assert.match(f.page.data.importError, /UTF-8/);
    f.page.chooseTextFile(); f.chooses.at(-1).success({ tempFiles: [{ path: '/tmp/in.csv', size: 100 }] }); f.reader().success({ data: '赛事名称,比赛日期\n导入赛,2020-01-01' }); assert.match(f.page.data.importText, /导入赛/); assert.equal(f.page.data.candidates.length, 0);
  });
  await check('Portable JSON export excludes authenticated media links, and temporary export files are cleaned', async () => {
    const f = fixture(); await f.page.onShow(); f.setReply(() => Promise.resolve({ ...list(), entries: [{ ...first, media: [{ url: '/private?t=secret' }] }] }));
    await f.page.exportHistory(); const text = f.calls.find(x => x.type === 'clipboard').data, exported = JSON.parse(text);
    assert.equal(exported.format, 'race-history'); assert.equal(exported.version, 1); assert.equal(exported.entries[0].media, undefined); assert.equal(exported.entries[0].story, ''); assert.equal(text.includes('secret'), false); assert.equal(text.includes('fixture-owner-token'), false);
    f.enableFileExport(); await f.page.exportHistory(); f.writer().success({}); assert.equal(f.share().fileName, '我的跑史.json'); assert.equal(f.fileOps.filter(x => x.type === 'unlink').length, 0);
    f.share().complete(); assert.equal(f.fileOps.filter(x => x.type === 'unlink').length, 1);
    await f.page.exportHistory(); f.app.globalData.token = ''; await f.page.onShow(); f.writer().success({}); assert.equal(f.fileOps.filter(x => x.type === 'unlink').length, 2);
  });
  await check('JSON and CSV exports retain unknown timing, source hashes, personal tags and multiline quoted stories on actual server reimport', async () => {
    const { parseImportText, normalizeEntry } = require(path.join(root, 'server/src/race-history.js'));
    const f = fixture(), row = { ...first, timing: 'unknown', netSeconds: null, gunSeconds: null, unknownSeconds: 12345, seconds: 12345, story: '我说："享受,比赛"\n慢慢跑。', tags: ['享受比赛'] };
    const exported = f.helper.exportEntry(row);
    assert.equal(exported.unknownTime, '03:25:45');
    const jsonRow = normalizeEntry(parseImportText(JSON.stringify({ format: 'race-history', version: 1, entries: [exported] }))[0]);
    const csvRow = normalizeEntry(parseImportText(f.helper.csvExport([exported]))[0]);
    for (const actual of [jsonRow, csvRow]) { assert.equal(actual.unknownSeconds, 12345); assert.equal(actual.sourceKey, first.sourceKey); assert.deepEqual(actual.tags, ['享受比赛']); assert.match(actual.story, /享受,比赛/); }
    await f.page.onShow(); f.setReply(() => Promise.resolve({ ...list(), entries: [row] })); f.page.chooseExport(); assert.equal(f.sheets.at(-1).itemList.length, 2); await f.sheets.at(-1).success({ tapIndex: 1 });
    const text = f.calls.filter(x => x.type === 'clipboard').at(-1).data; assert.match(text, /unknownTime/); assert.match(text, /03:25:45/); assert.equal(text.includes('fixture-owner-token'), false);
  });
  await check('A write in flight is submitted once; changing text cannot replace its candidate draft', async () => {
    const f = fixture(); await f.page.onShow(); f.page.openAdd(); f.page.onEditor(event({ field: 'name' }, '我的比赛')); f.page.onEditor(event({ field: 'raceDate' }, '2025-01-01'));
    let finish; f.setReply(() => new Promise(resolve => { finish = resolve; })); const pending = f.page.saveEntry(); await f.page.saveEntry();
    f.page.onEditor(event({ field: 'name' }, '被意外改掉')); assert.equal(f.page.data.editor.name, '我的比赛'); assert.equal(f.calls.filter(x => x.method === 'POST').length, 1);
    f.page.onUnload(); finish({ entry: first, review }); await pending; assert.equal(f.page.data.editor.name, '我的比赛');
  });
  await check('Registered mini entrances preserve runner pages and expose no charging or identity lookup flow', async () => {
    const app = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'));
    assert.ok(app.pages.includes('pages/history/history')); assert.ok(app.pages.includes('pages/runner/runner'));
    for (const file of ['pages/mine/mine.wxml', 'pages/runner/runner.wxml']) assert.match(fs.readFileSync(path.join(mini, file), 'utf8'), /\/pages\/history\/history/);
    const markup = fs.readFileSync(path.join(mini, 'pages/history/history.wxml'), 'utf8');
    assert.doesNotMatch(markup, /充值|会员|付费|身份证号/); assert.match(markup, /!item.inherited/); assert.match(markup, /review.scope/); assert.match(markup, /validationMessage/);
    const f = fixture(); for (const match of markup.matchAll(/(?:bindtap|bindinput|bindchange)="([A-Za-z0-9_]+)"/g)) assert.equal(typeof f.page[match[1]], 'function', 'WXML handler exists: ' + match[1]);
  });
  report.passed = true; fs.writeFileSync(path.join(__dirname, 'race-history-mini-report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { report.passed = false; report.error = error.stack; fs.writeFileSync(path.join(__dirname, 'race-history-mini-report.json'), JSON.stringify(report, null, 2)); console.error(error); process.exitCode = 1; });
