const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../..');
const clone = value => JSON.parse(JSON.stringify(value));
const event = (dataset = {}, value) => ({ currentTarget: { dataset }, detail: { value } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = () => new Promise(resolve => setImmediate(resolve));
const sampleConfig = () => ({
  trainingType: 'interval', title: '周三间歇跑', plannedKm: 10, place: '奥林匹克森林公园',
  gatherPlace: '南园南门地铁口', gatherAt: '06:20', route: '操场内圈',
  workout: '充分热身\n按组完成主训练\n慢跑放松', notice: '自备饮水', note: '',
  minPeople: 3, minKm: 5, points: 1, review: false,
  groups: [{ name: 'A 组', pace: '5:30–6:00 /km', capacity: 20, kind: 'pace' }],
  startTime: '06:30', durationMinutes: 90, signupLeadMinutes: 720, cancelLeadMinutes: 60
});
function createFixture(options = {}) {
  const app = { globalData: { token: 'account-a' } };
  const storage = new Map();
  const requests = [], toasts = [], modals = [], navigation = [], actionSheets = [];
  let nextAction = 0;
  let definition;
  const db = { templates: [{ id: 91, name: '周三间歇模板', config: sampleConfig(), version: 1, createdAt: '2026-11-10T13:00:00Z', updatedAt: '2026-11-10T13:00:00Z' }], published: [] };
  let handler = async (url, method = 'GET', body) => {
    if (url === '/me') return { user: { id: 7, nickname: '晨光团长' } };
    if (/^\/clubs\/\d+$/.test(url)) return { club: { id: Number(url.split('/')[2]), name: '奥森悦跑团', staff: options.staff !== false }, groups: [{ name: '常用组', pace: '轻松有氧', capacity: 0 }] };
    if (/\/activity-templates$/.test(url) && method === 'GET') return { templates: clone(db.templates) };
    if (/\/activity-templates$/.test(url) && method === 'POST') {
      const template = { ...clone(body), id: 92 + db.templates.length, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      db.templates.push(template); return { template: clone(template) };
    }
    const match = /\/activity-templates\/(\d+)$/.exec(url);
    if (match) {
      const index = db.templates.findIndex(t => t.id === Number(match[1]));
      if (index < 0) throw Object.assign(Error('没有这个模板'), { status: 404 });
      if (method === 'DELETE') { db.templates.splice(index, 1); return { ok: true }; }
      if (method === 'PUT') {
        if (body.version !== db.templates[index].version) throw Object.assign(Error('模板已更新，请重新载入'), { status: 409 });
        db.templates[index] = { ...db.templates[index], ...clone(body), version: body.version + 1, updatedAt: new Date().toISOString() };
        return { template: clone(db.templates[index]) };
      }
    }
    if (/\/activities$/.test(url) && method === 'POST') { db.published.push(clone(body)); return { activity: { id: 101 } }; }
    if (/\/activities\/\d+$/.test(url)) return { activity: { ...sampleConfig(), issue: '旧期次', startsAt: '2026-11-01T06:30', mine: { signed: true } }, groups: sampleConfig().groups };
    throw Error('Unexpected fixture request: ' + method + ' ' + url);
  };
  const moduleCache = new Map();
  function load(file) {
    file = path.resolve(file); if (!path.extname(file)) file += '.js';
    if (moduleCache.has(file)) return moduleCache.get(file).exports;
    const module = { exports: {} }; moduleCache.set(file, module);
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
      module, exports: module.exports,
      require(name) {
        if (name === '../../utils/request') return { request: async (...args) => { requests.push(clone(args)); return handler(...args); } };
        if (!name.startsWith('.')) throw Error('Unexpected module: ' + name);
        return load(path.resolve(path.dirname(file), name));
      },
      Page: value => { definition = value; }, getApp: () => app,
      wx: {
        hideShareMenu() {}, pageScrollTo() {}, setNavigationBarTitle() {},
        getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, clone(value)), removeStorageSync: key => storage.delete(key),
        showToast: opts => toasts.push(opts), showModal: opts => { modals.push(opts); if (opts.success) opts.success({ confirm: true, cancel: false }); },
        showActionSheet: opts => { actionSheets.push(opts); if (opts.success) opts.success({ tapIndex: nextAction }); },
        navigateTo: opts => navigation.push(opts.url), redirectTo: opts => navigation.push(opts.url), navigateBack: () => navigation.push('back')
      }, console, Date, setTimeout, clearTimeout, Promise
    }, { filename: file });
    return module.exports;
  }
  load(path.join(ROOT, 'miniprogram/pages/activity-create/activity-create.js'));
  const page = { ...definition, data: clone(definition.data), setData(patch) {
    for (const [raw, value] of Object.entries(patch)) {
      const keys = raw.replace(/\[(\d+)\]/g, '.$1').split('.');
      let target = this.data;
      for (let i = 0; i < keys.length - 1; i++) { if (target[keys[i]] == null) target[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {}; target = target[keys[i]]; }
      target[keys.at(-1)] = value;
    }
  } };
  page.clubId = '999';
  return { page, app, storage, requests, toasts, modals, navigation, actionSheets, db, action(value) { nextAction = value; }, setHandler(value) { const old = handler; handler = value; return old; }, async load() { await page.load(); await settle(); }, switchAccount(token = 'account-b') { app.globalData.token = token; } };
}
module.exports = { ROOT, createFixture, sampleConfig, clone, event, deferred, settle };
