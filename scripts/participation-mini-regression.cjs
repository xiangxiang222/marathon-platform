'use strict';
// Execute the current Page methods with isolated in-memory API replies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const copy = value => JSON.parse(JSON.stringify(value));
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
const event = (dataset = {}, value) => ({ currentTarget: { dataset }, detail: { value } });
const statuses = ['想跑', '已报名', '待抽签', '中签', '未中签', '确认参赛', '已缴费', '已领物', '完赛', '未完赛', '弃赛'];
const race = { id: 'sample-race', name: '合成参赛流程验收', city: '验收城市', province: '验收城市', raceDate: '2027-03-21', distances: ['full'], distanceLabels: ['全马'], kindLabels: [], groups: [], links: [], nodes: [], regStatus: '报名中' };

function fixture(name = 'race', handler) {
  const app = { globalData: { token: 'runner-a', nickname: '合成跑者', baseUrl: 'https://runner.example' } };
  const state = { following: false, status: '', sharedClubIds: [], note: '', results: [], outings: [], confirmDeletion: true }, requests = [], patches = [], storage = {}, navigation = [];
  const presentOuting = item => { const joined = item.members.some(member => member.userId === 1), canCancel = item.host.userId === 1;
    return { ...copy(item), memberCount: item.members.length, remaining: Math.max(0, item.capacity - item.members.length), joined, isHost: canCancel, canCancel, canJoin: !joined && item.members.length < item.capacity }; };
  const reply = async (url, method = 'GET', body) => {
    if (handler) return handler(url, method, body);
    if (url === '/races/' + race.id + '/outings') {
      if (method === 'GET') return { outings: state.outings.map(presentOuting) };
      const outing = { ...body, id: state.outings.length + 1, raceId: race.id, clubName: body.clubId === 7 ? '合成跑团' : '周末跑团', kindLabel: { carpool: '拼车', gather: '集合', pickup: '领物' }[body.kind], status: 'open', host: { userId: 1, nickname: '合成跑者' }, members: [{ userId: 1, nickname: '合成跑者' }] };
      state.outings.push(outing); return { outing: presentOuting(outing) };
    }
    const outingMatch = url.match(/\/outings\/(\d+)(\/membership)?$/);
    if (outingMatch) {
      const outing = state.outings.find(item => item.id === Number(outingMatch[1]));
      if (method === 'DELETE') { outing.status = 'cancelled'; return { ok: true }; }
      outing.members = outing.members.filter(member => member.userId !== 1);
      if (body.joined) outing.members.push({ userId: 1, nickname: '合成跑者' });
      return { outing: presentOuting(outing) };
    }
    if (url.endsWith('/news')) return { news: [] };
    if (url === '/reminders') return {};
    if (url.startsWith('/races?')) return { races: [{ ...race, following: state.following, myStatus: state.status }] };
    if (url === '/races/' + race.id) return { race: copy(race), statuses, following: state.following, myStatus: state.status, sharedClubIds: state.sharedClubIds, companionNote: state.note,
      clubs: [{ id: 7, name: '合成跑团', mates: [{ userId: 2, nickname: '团友', status: '确认参赛', note: '一起合影' }] }, { id: 8, name: '周末跑团', mates: [] }], myResults: state.results };
    if (url.endsWith('/follow')) { state.following = body.following; return { ok: true }; }
    if (url.endsWith('/sharing')) { state.sharedClubIds = body.clubIds; return { ok: true }; }
    if (url.endsWith('/companionship')) { state.note = body.note; return { ok: true }; }
    if (method === 'PUT' && url === '/me/races/' + race.id) { state.status = body.status; state.sharedClubIds = body.sharedClubIds || state.sharedClubIds; return { ok: true }; }
    if (method === 'DELETE' && url === '/me/races/' + race.id) { state.status = ''; state.sharedClubIds = []; state.note = ''; return { ok: true }; }
    if (url === '/me') return { user: { nickname: '合成跑者' }, plans: state.status ? [{ race, status: state.status }] : [], followedRaces: state.following ? [race] : [], results: [], clubs: [] };
    if (url.includes('/runner')) throw Error('isolated runner fixture unavailable');
    return {};
  };
  const file = path.join(root, 'miniprogram/pages', name, name + '.js');
  const localRequire = createRequire(file);
  let definition;
  const wx = new Proxy({ setStorageSync(key, value) { storage[key] = value; }, getStorageSync(key) { return storage[key]; }, removeStorageSync(key) { delete storage[key]; }, navigateTo(value) { navigation.push(value.url); }, switchTab(value) { navigation.push(value.url); }, showModal(options) { options.success({ confirm: state.confirmDeletion, cancel: !state.confirmDeletion }); } }, { get: (target, key) => target[key] || (() => {}) });
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { definition = value; }, getApp: () => app, wx, console, Date, Promise, setTimeout, clearTimeout,
    require(id) {
      if (id === '../../utils/request') return { request(url, method, body) { requests.push({ url, method: method || 'GET', body: copy(body || {}) }); return Promise.resolve().then(() => reply(url, method, body)); }, ready: () => !!app.globalData.token, setAuth() {}, clearAuth() { app.globalData.token = ''; } };
      return localRequire(id);
    }
  }, { filename: file });
  const page = { ...definition, data: copy(definition.data), setData(patch) { patches.push(copy(patch)); Object.assign(this.data, patch); } };
  return { page, state, app, requests, storage, navigation, patches, reply };
}

async function main() {
  const checks = [];
  const f = fixture(); f.page.onLoad({ id: race.id, plan: '1' }); await f.page.load();
  await f.page.toggleFollow();
  assert.equal(f.state.following, true); assert.equal(f.state.status, '');
  assert.equal(f.requests.filter(call => call.method === 'PUT' && call.url === '/me/races/' + race.id).length, 0);
  f.page.pickPlanStage(event({ id: 'confirmed' }));
  assert.ok(f.page.data.stageStatuses.includes('确认参赛')); assert.equal(f.page.data.planStages.length, 4);
  f.page.pickSharedClubs(event({}, ['7'])); await f.page.mark(event({ status: '确认参赛' }));
  assert.equal(f.state.status, '确认参赛'); assert.deepEqual(copy(f.state.sharedClubIds), []);
  assert.deepEqual(copy(f.page.data.sharingDraft), [7]); f.page.toggleCompanion(); await f.page.saveSharing(); assert.deepEqual(copy(f.state.sharedClubIds), [7]);
  assert.equal(f.page.data.companionOpen, false, 'successful sharing save and reload collapse the club selector');
  await f.page.toggleFollow(); assert.equal(f.state.following, false); assert.equal(f.state.status, '确认参赛');
  checks.push('Following remains separate from participation; direct entry skips the lottery and records one personal status');
  f.page.toggleCompanion(); f.page.pickSharedClubs(event({}, [])); await f.page.saveSharing();
  assert.equal(f.page.data.companionOpen, false, 'saving an empty audience also collapses the selector');
  assert.deepEqual(copy(f.state.sharedClubIds), []); assert.equal(f.state.status, '确认参赛');
  f.page.onCompanionNote(event({}, '  起点附近拼车  ')); await f.page.saveCompanionNote();
  assert.equal(f.state.note, '起点附近拼车');
  assert.ok(f.page.data.clubs[0].mates[0].note);
  assert.equal(f.requests.some(call => /activities|meetups/.test(call.url) && call.method !== 'GET'), false);
  checks.push('Per-club sharing can be cleared while personal status persists; companionship never signs up for club activities');
  for (const status of statuses) {
    f.state.status = status; await f.page.load();
    assert.ok(f.page.data.stageStatuses.includes(status));
    assert.ok(f.page.data.stageStatuses.length <= 4);
  }
  checks.push('All legacy and direct-entry statuses map to one of four stages without showing ten actions at once');

  const removed = fixture(); removed.state.status = '完赛'; removed.state.following = true; removed.state.sharedClubIds = [7]; removed.state.note = '赛后集合';
  removed.state.results = [{ distance: 'full', clock: '03:40:00', story: '首马' }]; removed.page.onLoad({ id: race.id }); await removed.page.load();
  removed.state.confirmDeletion = false; await removed.page.removePlan(); assert.equal(removed.state.status, '完赛');
  assert.equal(removed.requests.some(call => call.method === 'DELETE'), false);
  removed.state.confirmDeletion = true; await removed.page.removePlan();
  assert.equal(removed.page.data.myStatus, ''); assert.deepEqual(copy(removed.page.data.sharedClubIds), []); assert.equal(removed.page.data.companionNote, '');
  assert.equal(removed.page.data.following, true); assert.equal(removed.page.data.myResults[0].clock, '03:40:00');
  checks.push('Removing a confirmed plan clears sharing and note, retains following and results, and cancellation performs no mutation');

  const guest = fixture(); guest.app.globalData.token = ''; guest.page.onLoad({ id: race.id }); guest.page.toggleFollow();
  assert.equal(guest.storage.marathon_return_after_login, '/pages/race/race?id=' + race.id + '&follow=1');
  assert.equal(guest.navigation[0], '/pages/mine/mine');
  const resumed = fixture(); resumed.page.onLoad({ id: race.id, follow: '1' }); await resumed.page.load(); await settle();
  assert.equal(resumed.state.following, true); assert.equal(resumed.state.status, '');
  checks.push('Guest follow resumes after login as a follow operation only');

  let release;
  const late = fixture('race', url => url.endsWith('/news') ? { news: [] } : new Promise(resolve => { release = resolve; }));
  late.page.onLoad({ id: race.id }); const loading = late.page.load(); await settle(); late.page.onUnload();
  const patchCount = late.patches.length; release({ race, statuses }); await loading;
  assert.equal(late.patches.length, patchCount);
  let releaseMutation;
  const changing = fixture('race', (url, method) => method === 'PUT' ? new Promise(resolve => { releaseMutation = resolve; }) : { race, statuses });
  changing.page.onLoad({ id: race.id }); await changing.page.load(); const pending = changing.page.toggleFollow(); await settle();
  changing.app.globalData.token = 'runner-b'; const previous = changing.patches.length; releaseMutation({ ok: true }); await pending;
  assert.equal(changing.patches.length, previous);
  checks.push('Late loads after unload and mutations after account changes cannot write private state');

  const duplicate = fixture(); duplicate.page.onLoad({ id: race.id }); await duplicate.page.load();
  const first = duplicate.page.toggleFollow(); const second = duplicate.page.toggleFollow(); await Promise.all([first, second]);
  assert.equal(duplicate.requests.filter(call => call.url.endsWith('/follow')).length, 1);
  const failed = fixture('race', (url, method) => { if (method === 'PUT') throw Error('注入保存失败'); return url.endsWith('/news') ? {} : { race, statuses }; });
  failed.page.onLoad({ id: race.id }); await failed.page.load(); await failed.page.toggleFollow();
  assert.equal(failed.page.data.following, false); assert.equal(failed.page.data.followBusy, false); assert.equal(failed.page.data.message, '注入保存失败');
  checks.push('Repeated follow taps serialize; failed writes preserve state and show retryable errors');

  let failSharing = false;
  const sharing = fixture('race', (url, method, body) => {
    if (method === 'PUT' && url.endsWith('/sharing')) { failSharing = true; throw Error('注入同步失败'); }
    if (method === 'PUT') return { ok: true };
    return url.endsWith('/news') ? {} : { race, statuses, myStatus: '中签', sharedClubIds: [7], companionNote: '保存过的备注', clubs: [{ id: 7, name: '团一', mates: [] }, { id: 8, name: '团二', mates: [] }] };
  });
  sharing.page.onLoad({ id: race.id }); await sharing.page.load();
  sharing.page.pickSharedClubs(event({}, ['8'])); sharing.page.onCompanionNote(event({}, '尚未保存的备注'));
  await sharing.page.mark(event({ status: '已缴费' }));
  assert.deepEqual(copy(sharing.page.data.sharedClubIds), [7]); assert.deepEqual(copy(sharing.page.data.sharingDraft), [8]);
  assert.equal(sharing.page.data.companionNote, '尚未保存的备注');
  const written = sharing.requests.find(call => call.method === 'PUT' && call.url === '/me/races/' + race.id);
  assert.equal('sharedClubIds' in written.body, false);
  sharing.page.toggleCompanion(); await sharing.page.saveSharing(); assert.equal(failSharing, true); assert.deepEqual(copy(sharing.page.data.sharedClubIds), [7]);
  assert.equal(sharing.page.data.companionOpen, true, 'failed sharing save keeps choices open');
  assert.deepEqual(copy(sharing.page.data.sharingDraft), [8]); assert.equal(sharing.page.data.clubs[0].synced, true);
  assert.equal(sharing.page.data.planBusy, false); assert.equal(sharing.page.data.message, '注入同步失败');
  let failReadback = false;
  const readback = fixture('race', (url, method) => {
    if (method === 'PUT') { failReadback = true; return { ok: true }; }
    if (failReadback && !url.endsWith('/news')) throw Error('同步范围回读失败');
    return url.endsWith('/news') ? {} : { race, statuses, myStatus: '中签', sharedClubIds: [7], clubs: [{ id: 7, name: '团一', mates: [] }, { id: 8, name: '团二', mates: [] }] };
  });
  readback.page.onLoad({ id: race.id }); await readback.page.load(); readback.page.toggleCompanion(); readback.page.pickSharedClubs(event({}, ['8'])); await readback.page.saveSharing();
  assert.equal(readback.page.data.companionOpen, true, 'a successful write with failed reload must not collapse the selector');
  assert.deepEqual(copy(readback.page.data.sharingDraft), [8]); assert.equal(readback.page.data.message, '同步范围回读失败'); assert.equal(readback.page.data.planBusy, false);
  checks.push('Unsaved club choices and note drafts survive status refresh; failed sharing saves never change the displayed persisted audience');

  const list = fixture('races'); await list.page.load(); await settle();
  await list.page.toggleFollow(event({ id: race.id })); assert.equal(list.state.following, true); assert.equal(list.page.data.races[0].following, true); assert.equal(list.state.status, '');
  const mine = fixture('mine'); mine.state.following = true; mine.state.status = '中签'; await mine.page.load(); await settle();
  assert.equal(mine.page.data.followedRaces.length, 1); assert.equal(mine.page.data.plans.length, 1);
  await mine.page.unfollow(event({ id: race.id })); assert.equal(mine.page.data.followedRaces.length, 0); assert.equal(mine.page.data.plans.length, 1);
  checks.push('Race list and personal hub use the same independent follow state without deleting participation');
  const cal = fixture('calendar'); cal.page.year = 2027; cal.page.month = 3; cal.page.picked = race.raceDate;
  cal.page.paint([{ ...race, following: true, myStatus: '中签' }]);
  assert.equal(cal.page.data.dayRaces[0].following, true); assert.equal(cal.page.data.dayRaces[0].myStatus, '中签');
  const markup = fs.readFileSync(path.join(root, 'miniprogram/pages/race/race.wxml'), 'utf8');
  assert.match(markup, /仅自己可见/); assert.doesNotMatch(markup, /供自己与跑团留存/); assert.match(markup, /活动需单独报名/);
  checks.push('Calendar retains personal indicators; privacy and official versus club sign-up boundaries are explicit');

  const group = fixture(); group.page.onLoad({ id: race.id, clubId: '8', outings: '1' }); await group.page.load(); await group.page.loadOutings();
  assert.equal(group.page.data.outingFilterClubId, 8); assert.equal(group.page.data.outingClubId, 8);
  group.page.setData({ outingDate: '2099-03-20', outingTime: '08:30', outingPlace: '  终点北门  ', outingCapacity: '4', outingNote: '  一起领物  ', outingKind: 'pickup' });
  const creation = group.page.createOuting(); await group.page.createOuting(); await creation;
  assert.equal(group.state.outings.length, 1); assert.equal(group.state.outings[0].startsAt, '2099-03-20T08:30');
  assert.equal(group.state.outings[0].place, '终点北门'); assert.equal(group.state.outings[0].note, '一起领物');
  assert.equal(group.page.data.visibleOutings[0].memberCount, 1); assert.equal(group.page.data.visibleOutings[0].canCancel, true);
  assert.equal(group.state.status, ''); assert.equal(group.state.following, false); assert.deepEqual(group.state.sharedClubIds, []);
  assert.equal(group.requests.some(call => /activities|meetups|\/me\/races/.test(call.url) && call.method !== 'GET'), false);
  checks.push('Race-linked outings create once, include the host in capacity, preserve Beijing wall time, preselect the club, and never change personal plans, follows, sharing or ordinary activities');

  const own = group.page.data.visibleOutings[0]; await group.page.changeOutingMembership(event({ id: own.id }));
  assert.equal(group.requests.some(call => call.url.endsWith('/membership')), false, 'hosts cancel rather than leave');
  group.state.confirmDeletion = false; await group.page.cancelOuting(event({ id: own.id })); assert.equal(group.state.outings[0].status, 'open');
  group.state.confirmDeletion = true; const cancellation = group.page.cancelOuting(event({ id: own.id })); await group.page.cancelOuting(event({ id: own.id })); await cancellation;
  assert.equal(group.requests.filter(call => call.method === 'DELETE').length, 1); assert.equal(group.page.data.outings.length, 0);
  checks.push('Hosts cannot leave their own arrangement; cancellation is confirmed, serialized and removes only the outing');

  const join = fixture(); join.page.onLoad({ id: race.id }); await join.page.load();
  const baseOuting = { id: 31, raceId: race.id, clubId: 7, clubName: '合成跑团', kind: 'carpool', kindLabel: '拼车', startsAt: '2099-03-20T08:30', place: '起点东门', capacity: 2, note: '', status: 'open', host: { userId: 2, nickname: '团友' }, members: [{ userId: 2, nickname: '团友' }] };
  join.state.outings = [copy(baseOuting), { ...copy(baseOuting), id: 32, clubId: 8, status: 'cancelled' }, { ...copy(baseOuting), id: 33, capacity: 1 }, { ...copy(baseOuting), id: 34, startsAt: '2000-03-20T08:30' }]; await join.page.loadOutings();
  assert.equal(join.page.data.outings.length, 3); assert.equal(join.page.data.outings.find(item => item.id === 33).canJoin, false); assert.equal(join.page.data.outings.find(item => item.id === 34).canJoin, false);
  for (const id of [33, 34]) await join.page.changeOutingMembership(event({ id }));
  assert.equal(join.requests.some(call => call.url.endsWith('/membership')), false);
  const joining = join.page.changeOutingMembership(event({ id: 31 })); await join.page.changeOutingMembership(event({ id: 31 })); await joining;
  assert.equal(join.page.data.outings[0].joined, true); assert.equal(join.page.data.outings[0].memberCount, 2); assert.equal(join.page.data.outings[0].full, true);
  await join.page.changeOutingMembership(event({ id: 31 })); assert.equal(join.page.data.outings[0].joined, false); assert.equal(join.page.data.outings[0].remaining, 1);
  join.page.pickOutingFilter(event({}, '2')); assert.equal(join.page.data.visibleOutings.length, 0);
  join.page.showClubOutings(event({ club: 7 })); assert.equal(join.page.data.outingFilterClubId, 7); assert.equal(join.page.data.visibleOutings.length, 3);
  checks.push('Open outing lists filter by club, show rosters and capacity, serialize join and leave, and block full or elapsed arrangements');
  join.state.outings[0].members.push({ userId: 1, nickname: '合成跑者' });
  join.page.paintOutings([{ ...baseOuting, startsAt: '2000-03-20T08:30', joined: true, isHost: false, canCancel: true, memberCount: 2, remaining: 0, canJoin: false }]);
  assert.equal(join.page.data.outings[0].canLeave, true); await join.page.changeOutingMembership(event({ id: 31 }));
  assert.equal(join.requests.at(-2).body.joined, false); assert.equal(join.page.data.outings[0].joined, false);
  checks.push('A participating club manager can leave even when also allowed to cancel; elapsed outings remain leaveable by non-hosts');

  const invalid = fixture(); invalid.page.onLoad({ id: race.id }); await invalid.page.load(); invalid.page.setData({ outingDate: '2099-03-20', outingTime: '08:30', outingPlace: '集合点' });
  for (const capacity of ['0', '101', '1.5']) { invalid.page.setData({ outingCapacity: capacity }); await invalid.page.createOuting(); assert.match(invalid.page.data.outingFeedback, /1至100/); }
  invalid.page.setData({ outingCapacity: '1', outingNote: '多'.repeat(301) }); await invalid.page.createOuting(); assert.match(invalid.page.data.outingFeedback, /300/);
  invalid.page.setData({ outingNote: '', outingDate: '2000-01-01' }); await invalid.page.createOuting(); assert.match(invalid.page.data.outingFeedback, /未来/);
  invalid.page.setData({ outingDate: '2099-02-31' }); await invalid.page.createOuting(); assert.match(invalid.page.data.outingFeedback, /未来/);
  assert.equal(invalid.requests.some(call => call.method === 'POST'), false);
  checks.push('Outing form rejects invalid total capacity, overlong notes and elapsed Beijing times before posting');

  let failure = true;
  const retry = fixture('race', (url, method) => {
    if (url.endsWith('/outings')) { if (failure) throw Error('同行加载失败'); return { outings: [] }; }
    if (method === 'PUT') throw Error('名额刚刚已满');
    return url.endsWith('/news') ? {} : { race, statuses, myStatus: '中签', following: true, clubs: [{ id: 7, name: '合成跑团', mates: [] }] };
  });
  retry.page.onLoad({ id: race.id }); await retry.page.load(); await retry.page.loadOutings();
  assert.equal(retry.page.data.myStatus, '中签'); assert.equal(retry.page.data.following, true); assert.equal(retry.page.data.outingsError, '同行加载失败');
  failure = false; await retry.page.loadOutings(); assert.equal(retry.page.data.outingsError, '');
  retry.page.paintOutings([{ ...baseOuting, memberCount: 1, remaining: 1, joined: false, canCancel: false, canJoin: true }]); await retry.page.changeOutingMembership(event({ id: 31 }));
  assert.equal(retry.page.data.outings[0].joined, false); assert.equal(retry.page.data.outingBusy, ''); assert.equal(retry.page.data.outingFeedback, '名额刚刚已满');
  checks.push('Outing load and mutation errors are independent, retryable and retain the saved race and membership state');

  let releaseOuting;
  const stale = fixture('race', () => new Promise(resolve => { releaseOuting = resolve; })); stale.page.onLoad({ id: race.id });
  const staleLoad = stale.page.loadOutings(); await settle(); stale.page.raceId = 'other-race'; const staleCount = stale.patches.length; releaseOuting({ outings: [baseOuting] }); await staleLoad; assert.equal(stale.patches.length, staleCount);
  const staleWrite = fixture('race', () => new Promise(resolve => { releaseOuting = resolve; })); staleWrite.page.onLoad({ id: race.id });
  staleWrite.page.paintOutings([{ ...baseOuting, memberCount: 1, remaining: 1, joined: false, canCancel: false, canJoin: true }]);
  const staleMutation = staleWrite.page.changeOutingMembership(event({ id: 31 })); await settle(); staleWrite.app.globalData.token = 'runner-b'; const staleWriteCount = staleWrite.patches.length; releaseOuting({ outing: baseOuting }); await staleMutation; assert.equal(staleWrite.patches.length, staleWriteCount);
  guest.page.loginForOutings(); assert.match(guest.storage.marathon_return_after_login, /outings=1/);
  staleWrite.page.open = () => {}; staleWrite.page.onShow();
  assert.equal(staleWrite.page.data.outings.length, 0); assert.equal(staleWrite.page.data.outingFilters.length, 1); assert.equal(staleWrite.page.data.outingBusy, ''); assert.equal(staleWrite.page.data.outingNote, '');
  checks.push('Outing responses after route or account changes cannot write private data; guest login returns to the race outing flow');
  assert.match(markup, /mode="date"/); assert.match(markup, /mode="time"/); assert.match(markup, /北京时间/); assert.match(markup, /本场同行/);
  assert.match(fs.readFileSync(path.join(root, 'miniprogram/pages/club/club.wxml'), 'utf8'), /clubId=\{\{club.id\}\}.*outings=1/);
  console.log(JSON.stringify({ passed: true, kind: 'Current mini-program Page VM acceptance, not device testing', checks }, null, 2));
}
module.exports = { fixture, race, statuses, event, settle };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
