// Shared isolated test harness. It loads actual Mini sources and never touches a server.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../..');
const MINI = path.join(ROOT, 'miniprogram');
const overview = require('./club-overview-fixture.cjs');
const now = Date.parse('2026-12-31T16:30:00Z'); // Beijing 2027-01-01 00:30; New York is still Dec 31.
const clock = class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
const copy = value => JSON.parse(JSON.stringify(value));
const event = dataset => ({ currentTarget: { dataset } });
const input = value => ({ detail: { value } });
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const groups = [
  { id: 701, name: '晨光轻松组', pace: '6′00″–6′30″ /km', description: '保持轻松，一起稳定出发', memberCount: 3 },
  { id: 702, name: '稳步进阶组', pace: '5′00″–5′30″ /km', description: '每周间歇与长距离', memberCount: 2 },
  { id: 703, name: '周末长距离训练组', pace: '按当天状态', description: '周末轻松长距离，按当天状态选择配速。', memberCount: 0 }
];
groups.forEach((group, index) => Object.assign(group, { capacity: 0, sort: index, clubGroupId: group.id + 1000 }));
const members = overview.members.map((member, index) => ({ ...member, introduction: index === 1 ? '每一步都算数，喜欢清晨沿河跑。' : '', groupId: index < 3 ? 701 : index < 5 ? 702 : 0, groupName: index < 3 ? groups[0].name : index < 5 ? groups[1].name : '未分组', joinedAt: '2020-01-01T00:00:00.000Z' }));
function miniFixture(relative, properties = {}) {
  let definition;
  let reply = () => Promise.resolve({});
  let valid = true;
  const requests = [], navigation = [], modals = [], sheets = [], emitted = [];
  const storage = {};
  const app = { globalData: { token: 'mileage-account-a', userId: 1, nickname: members[0].nickname, baseUrl: 'https://fixture.invalid' } };
  const request = { ready: () => valid, request: (...args) => { requests.push(args); return reply(...args); } };
  const native = { navigateTo: options => navigation.push(options.url), switchTab: options => navigation.push(options.url), navigateBack: options => navigation.push({ back: options?.delta || 1 }), showModal: options => modals.push(options), showActionSheet: options => sheets.push(options), getStorageSync: key => storage[key], setStorageSync: (key, value) => { storage[key] = value; }, removeStorageSync: key => { delete storage[key]; }, getSystemInfoSync: () => ({ windowWidth: 390, statusBarHeight: 47 }), getWindowInfo: () => ({ windowWidth: 390, statusBarHeight: 47 }), getMenuButtonBoundingClientRect: () => ({ top: 51, height: 32, left: 296, width: 87, right: 383 }) };
  const wx = new Proxy(native, { get: (target, key) => target[key] || (() => {}) });
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (!path.extname(file)) file += '.js';
    if (!file.startsWith(MINI + path.sep)) throw Error('Test Mini import cannot leave package: ' + file);
    if (file === path.join(MINI, 'utils/request.js')) return request;
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, require: name => { if (!name.startsWith('.')) throw Error('Unexpected Mini import ' + name); return load(path.resolve(path.dirname(file), name)); }, Page: value => { definition = value; }, Component: value => { definition = value; }, getApp: () => app, wx, Date: clock, setTimeout, clearTimeout, console, Promise, URL, URLSearchParams }, { filename: file });
    return module.exports;
  }
  load(path.join(MINI, relative + '.js'));
  if (!definition) throw Error('No Page/Component definition in ' + relative);
  const defaultProperties = Object.fromEntries(Object.entries(definition.properties || {}).map(([key, value]) => [key, value && typeof value === 'object' && 'value' in value ? copy(value.value) : value === Number ? 0 : value === Boolean ? false : '']));
  const instance = { ...definition, ...(definition.methods || {}), properties: { ...defaultProperties, ...properties }, data: { ...copy(definition.data || {}), ...defaultProperties, ...properties }, setData(patch) { for (const [key, value] of Object.entries(patch)) { const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.'); let target = this.data; for (const part of parts.slice(0, -1)) { if (target[part] == null) target[part] = {}; target = target[part]; } target[parts.at(-1)] = value; } }, triggerEvent(name, detail) { emitted.push({ name, detail }); }, selectComponent() { return null; } };
  return { instance, definition, app, wx, requests, navigation, modals, sheets, emitted, storage, setReply(handler) { reply = handler; }, setAccount(token, loggedIn = true) { app.globalData.token = token; valid = loggedIn; }, async lifecycle(name) { const method = definition.lifetimes?.[name] || definition[name]; if (method) return method.call(instance); }, async pageLifecycle(name) { const method = definition.pageLifetimes?.[name]; if (method) return method.call(instance); } };
}
module.exports = { ROOT, MINI, now, clock, copy, event, input, tick, deferred, groups, members, miniFixture };

// Strict transport fixtures for UI contracts; arithmetic/window behavior has an
// independent actual-SQL regression in club-mileage-data-regression.cjs.
const factors = { day: 1, week: 4, month: 12, year: 80, all: 200 };
function boardFixture(query = {}, state = {}) {
  const window = require('../../server/src/training-groups').windowOf({ range: query.range || 'month', date: query.date || '2027-01-01' });
  const roster = state.members || members, permanent = state.groups || groups;
  const baseKm = [18.4, 16.2, 12.8, 0, 7.6, 5];
  const rank = roster.map((person, i) => ({ place: 0, userId: person.id, nickname: person.nickname, avatar: person.avatar, groupId: person.groupId, group: permanent.find(g => g.id === person.groupId)?.name || '未分组', km: Math.round(baseKm[i % baseKm.length] * factors[window.range] * 100) / 100, times: baseKm[i % baseKm.length] ? ({ day:1,week:4,month:12,year:80,all:200 })[window.range] : 0, days: baseKm[i % baseKm.length] ? Math.min(factors[window.range],180) : 0, durationSec: Math.round(baseKm[i % baseKm.length] * factors[window.range] * 360), paceLabel: baseKm[i % baseKm.length] ? '6:00' : '', mine: person.id === 1 })).sort((a,b) => b.km-a.km || a.userId-b.userId);
  const summary = rows => ({ km: Math.round(rows.reduce((total,row)=>total+row.km,0)*100)/100, times: rows.reduce((total,row)=>total+row.times,0), activeMembers: rows.filter(row=>row.times>0).length, members: rows.length });
  const groupRows = [...permanent, {id:0,name:'未分组',pace:'',description:''}].map(group => { const rows = rank.filter(row=>row.groupId===group.id);return {...group,memberCount:rows.length,...summary(rows)}; });
  const selected = query.groupId == null || query.groupId === '' ? rank : rank.filter(row=>String(row.groupId)===String(query.groupId));
  let previous,place=0;selected.forEach((row,i)=>{if(row.km!==previous)place=i+1;previous=row.km;row.place=place;});
  return {...window,summary:summary(selected),rank:selected,groups:groupRows,staff:state.staff!==false,owner:state.staff!==false};
}
function profileFixture(userId, query = {}, state = {}) {
  const person=(state.members || members).find(member=>member.id===Number(userId));
  if(!person)return null;
  const current=boardFixture(query,state), mileage=Object.fromEntries(Object.keys(factors).map(range=>[range,boardFixture({...query,range},state).rank.find(row=>row.userId===person.id)]));
  const group=(state.groups || groups).find(row=>row.id===person.groupId)||null;
  const stats=current.rank.find(row=>row.userId===person.id);
  return {user:copy(person),group:group?copy(group):null,mileage,range:current.range,date:current.date,period:current.period,stats,mine:person.id===1,recentRuns:stats?.times?[{id:91,startedAt:current.date+'T00:10',typeLabel:'户外跑',distanceKm:5,km:5,durationSec:1800,durationLabel:'00:30:00',paceLabel:'6:00'},{id:92,startedAt:current.date+'T00:20',typeLabel:'越野',distanceKm:4,km:5,durationSec:1800,durationLabel:'00:30:00',paceLabel:'7:30'}]:[]};
}
function clubFixture(id = 44, state = {}) { return { club:{id,name:id===44?'晨光跑团':'河岸跑团',city:'杭州',code:'FIXTURE-ONLY',owner:state.staff!==false,staff:state.staff!==false,role:state.staff===false?'member':'owner',roleLabel:state.staff===false?'成员':'团长'},members:copy(state.members||members),board:[],ranks:[],groups:[],activities:[],gifts:[],requests:[],checkins:[],checkedIn:false,myPoints:0 }; }
Object.assign(module.exports,{factors,boardFixture,profileFixture,clubFixture});
