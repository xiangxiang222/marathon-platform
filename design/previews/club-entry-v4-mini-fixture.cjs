/* Current clubs Page behavior + WXML/WXSS display fixture. No transport/device claim. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const clone = value => value === undefined ? value : JSON.parse(JSON.stringify(value));
const tick = async () => { await Promise.resolve(); await new Promise(resolve => setImmediate(resolve)); };
const event = (dataset = {}, value = '') => ({ currentTarget: { dataset }, detail: { value } });
const memberships = Array.from({ length: 10 }, (_, i) => ({ id: 101 + i, name: i === 8 ? '长名字也要完整辨认的西湖周末长距离跑团' : ['晨光', '河岸', '西湖', '追风', '向阳', '轻松', '山野', '星空', '', '城市'][i] + '跑团', city: i < 8 ? '杭州' : '北京', leader: '负责人' + (101 + i), role: i ? 'member' : 'owner', roleLabel: i ? '成员' : '团长', memberCount: 20 + i, joined: true }));
const directory = [{ id: 201, name: '发现同城的长名字周末跑步俱乐部', city: '杭州', memberCount: 52, leader: '发现跑友', joined: false }, { ...memberships[0] }];
function instance(scenario = 'base') {
  let definition, override;
  const calls = [], navigation = [], app = { globalData: { token: scenario === 'guest' ? '' : 'fixture-account-a' } };
  const request = async (url, method = 'GET', body) => {
    calls.push({ url, method, body });
    if (override) return override(url, method, body);
    if (url === '/me') return { user: { id: 1, leader: false }, clubs: scenario === 'empty' ? [] : clone(memberships) };
    if (url.startsWith('/clubs/directory')) return { clubs: clone(directory), page: 1, pages: 1, total: directory.length };
    throw Error('Unexpected display fixture request: ' + method + ' ' + url);
  };
  const native = { navigateTo: options => navigation.push(options.url), switchTab: options => navigation.push(options.url), pageScrollTo() {}, showModal() {} };
  const identity = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/utils/club-identity.js'), 'utf8'), { module: identity, wx: native });
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/pages/clubs/clubs.js'), 'utf8'), { Page(value) { definition = value; }, getApp: () => app, wx: native, console, setTimeout, clearTimeout, require(name) { if (name === '../../utils/request') return { request, ready: () => Boolean(app.globalData.token) }; if (name === '../../utils/club-identity') return identity.exports; throw Error(name); } });
  const page = { ...definition, data: clone(definition.data), setData(patch) { for (const [key, value] of Object.entries(patch)) { const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.'); let target = this.data; for (const part of parts.slice(0, -1)) target = target[part]; target[parts.at(-1)] = clone(value); } } };
  return { page, calls, navigation, account(token) { app.globalData.token = token; }, handler(fn) { override = fn; } };
}
async function behavior() {
  const f = instance(), p = f.page;
  p.onShow(); await tick();
  assert.equal(p.data.clubs.length, 10); assert.equal(p.data.shownClubs.length, 4); assert.equal(p.data.mineExpanded, false);
  p.toggleMineExpanded(); assert.equal(p.data.shownClubs.length, 10); assert.equal(p.data.mineExpanded, true);
  p.toggleMineExpanded(); assert.equal(p.data.shownClubs.length, 4);
  for (const [query, count, id] of [['杭州', 8], ['#109', 1, 109], ['西湖周末', 1, 109], ['没有加入过', 0]]) {
    p.onMineQuery(event({}, query)); assert.equal(p.data.shownClubs.length, count, query); if (id) assert.equal(p.data.shownClubs[0].id, id);
  }
  p.onMineQuery(event({}, '')); assert.equal(p.data.shownClubs.length, 4);
  p.toggleMineExpanded(); p.setData({ createOpen: true, name: '旧账户建团草稿', query: '旧目录搜索' });
  f.account('fixture-account-b'); f.handler(url => Promise.resolve(url === '/me' ? { user: { id: 2 }, clubs: [memberships[9]] } : { clubs: [], pages: 1, total: 0 }));
  p.onShow(); await tick(); assert.equal(p.data.mineExpanded, false); assert.equal(p.data.mineQuery, ''); assert.equal(p.data.name, ''); assert.equal(p.data.query, ''); assert.equal(p.data.createOpen, false); assert.equal(p.data.shownClubs.length, 1); assert.equal(p.data.shownClubs[0].id, 110);
  p.onUnload();
  const late = instance(); let release;
  late.handler(url => url === '/me' ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ clubs: [], pages: 1 }));
  late.page.onShow(); await tick(); late.account('fixture-account-b'); late.handler(url => Promise.resolve(url === '/me' ? { user: { id: 2 }, clubs: [] } : { clubs: [], pages: 1 })); late.page.onShow(); await tick();
  release({ user: { id: 1 }, clubs: clone(memberships) }); await tick(); assert.equal(late.page.data.clubs.length, 0); assert.equal(late.page.data.shownClubs.length, 0); late.page.onUnload();
  return { passed: true, checks: ['default four vertical memberships', 'expand/collapse all ten', 'search all memberships by name/city/club number', 'account change clears expansion/search/create drafts', 'late prior-account memberships ignored'] };
}
module.exports = {
  instance, memberships, behavior,
  cases: ['base', 'expanded', 'search', 'create', 'code', 'empty', 'guest'].map(scenario => ({ route: 'pages/clubs/clubs', scenario })),
  async prepare(route, initial, scenario) {
    const { page: p } = instance(scenario); p.onShow(); await tick();
    if (scenario === 'base') assert.equal(p.data.shownClubs.length, 4);
    if (scenario === 'expanded') { p.toggleMineExpanded(); assert.equal(p.data.shownClubs.length, 10); }
    if (scenario === 'search') { p.onMineQuery(event({}, '杭州')); assert.equal(p.data.shownClubs.length, 8); }
    if (scenario === 'create') { p.toggleCreate(); assert.equal(p.data.createOpen, true); p.onName(event({}, '同城周末一起跑')); p.onCreateField(event({ key: 'city' }, '杭州')); p.onCreateField(event({ key: 'intro' }, '每周末按配速分组，一起轻松跑。')); await p.checkDuplicates(); }
    if (scenario === 'code') { p.pickMode(event({ mode: 'code' })); p.onCode(event({}, 'RUN-TOGETHER')); }
    const data = clone(p.data); p.onUnload(); return { data, components: {}, css: '' };
  },
  async audit({ page, scenario }) {
    const errors = [];
    if (await page.locator('.clubs-header-create,.discover-feature').count()) errors.push('Redundant header creation or large discovery promotion remains');
    const expected = { base: 4, expanded: 10, search: 8, create: 4, code: 4, empty: 0, guest: 0 }[scenario];
    if (await page.locator('.my-club').count() !== expected) errors.push('Incorrect visible membership count for ' + scenario);
    const layout = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }; };
      return { rows: [...document.querySelectorAll('.my-club')].map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }), search: rect('.search-field'), city: rect('.city-filter'), container: rect('.search-row') };
    });
    if (layout.rows.some((r, i, rows) => i && (r.top < rows[i - 1].bottom - 1 || Math.abs(r.left - rows[0].left) > 1))) errors.push('Memberships must stack vertically');
    if (scenario !== 'code' && layout.search && layout.city && layout.city.top < layout.search.bottom - 1) errors.push('City filter must be on a separate row below search');
    if (scenario !== 'guest' && await page.locator('.create-entry').count() !== 1) errors.push('Exactly one bottom creation entry is required');
    if (scenario === 'create' && await page.locator('.create-submit').count() !== 1) errors.push('Expanded creation form missing');
    return errors;
  }
};
if (require.main === module) behavior().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
