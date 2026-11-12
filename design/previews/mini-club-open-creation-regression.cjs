const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../..');
const report = { kind: 'Mini Page VM: open creation, identity and private reports; mocked native APIs, no device claim', checks: [] };
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const input = (key, value) => ({ currentTarget: { dataset: { key } }, detail: { value } });
const sample = { id: 44, name: '西湖跑团', city: '杭州', leader: '小林', intro: '每周绕湖慢跑', verified: false };
function fixture(name, query = { id: '44' }) {
  let definition, handler = () => Promise.resolve({}), loggedIn = true;
  const app = { globalData: { token: 'account-a' } };
  const requests = [], navigation = [], storage = [], saved = new Map();
  const native = { navigateTo: options => navigation.push(options.url), redirectTo: options => navigation.push(options.url), switchTab: options => navigation.push(options.url), showModal() {}, showShareMenu() {}, hideShareMenu() {}, getStorageSync: key => saved.get(key), removeStorageSync: key => saved.delete(key), setStorageSync: (key, value) => { storage.push([key, value]); saved.set(key, value); } };
  const common = { wx: native, getApp: () => app, setTimeout, clearTimeout };
  const identityModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'miniprogram/utils/club-identity.js'), 'utf8'), { ...common, module: identityModule });
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'miniprogram/pages', name, name + '.js'), 'utf8'), {
    ...common,
    require(moduleName) {
      if (moduleName === '../../utils/request') return { request: (...args) => { requests.push(args); return handler(...args); }, ready: () => loggedIn, clearAuth: () => { app.globalData.token = ''; loggedIn = false; } };
      if (moduleName === '../../utils/club-logo') return { logoData: {}, logoMethods: { invalidateLogo() {} } };
      if (moduleName === '../../utils/club-identity') return identityModule.exports;
      if (moduleName === '../../utils/captcha') return { saveCaptchaFile() {} };
      if (moduleName === '../../utils/avatar') return { networkAvatar: value => value, prepareAvatar() {} };
      if (moduleName === '../../utils/runner-center') return { VIEWS: [] };
      if (moduleName === '../../utils/achievement-model') return { normalizeResults: () => [] };
      if (moduleName === '../../utils/legal-documents') return { version: 'fixture' };
      throw new Error('Unexpected dependency ' + moduleName);
    },
    Page: page => { definition = page; }
  });
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.'); let target = this.data;
      for (const part of parts.slice(0, -1)) target = target[part];
      target[parts.at(-1)] = value;
    }
  } };
  if (page.onLoad) page.onLoad(query);
  return { page, requests, navigation, storage, saved, handler(fn) { handler = fn; }, account(token, valid = true) { app.globalData.token = token; loggedIn = valid; } };
}
async function check(name, fn) { await fn(); report.checks.push({ name, passed: true }); console.log('PASS ' + name); }
async function main() {
  await check('普通非 leader 账号可创建同名团，连点只发一次且失败重试复用幂等键', async () => {
    const f = fixture('club-create'); const pending = deferred(); let fail = true;
    f.handler((url, method) => {
      if (url === '/me') return Promise.resolve({ user: { leader: false }, clubs: [] });
      if (method === 'POST') return fail ? pending.promise : Promise.resolve({ club: { id: 88 } });
      return Promise.resolve({ clubs: [sample], pages: 1, total: 1 });
    });
    f.page.onShow(); await settle();
    f.page.setData({ name: sample.name, city: '绍兴', intro: '同名可以并存', duplicates: [sample] });
    const first = f.page.create(); f.page.create();
    assert.equal(f.requests.filter(r => r[1] === 'POST').length, 1);
    const requestId = f.requests.find(r => r[1] === 'POST')[2].requestId;
    assert.ok(requestId);
    pending.reject(new Error('网络暂不可用')); await first;
    assert.equal(f.page.data.creating, false);
    fail = false; await f.page.create();
    assert.equal(f.requests.filter(r => r[1] === 'POST')[1][2].requestId, requestId);
    assert.deepEqual(f.navigation, ['/pages/club/club?id=88&created=1']);
    assert.equal(f.page.data.name, ''); f.page.onUnload();
  });
  await check('创建完成前换账号或离页，迟到回调不跳转到旧账号跑团', async () => {
    for (const change of ['account', 'unload']) {
      const f = fixture('club-create'); const pending = deferred();
      f.handler((url, method) => method === 'POST' ? pending.promise : Promise.resolve(url === '/me' ? { user: { leader: false }, clubs: [] } : { clubs: [] }));
      f.page.onShow(); await settle(); f.page.setData({ name: sample.name, city: '杭州' });
      const work = f.page.create();
      if (change === 'account') { f.account('account-b'); f.page.onShow(); } else f.page.onUnload();
      pending.resolve({ club: { id: 99 } }); await work; await settle();
      assert.deepEqual(f.navigation, []);
      if (change === 'account') assert.equal(f.page.data.name, '');
      f.page.onUnload();
    }
  });
  await check('旧待审批申请由本人确认，城市必填，且保留旧申请标识', async () => {
    const f = fixture('club-create');
    f.handler((url, method) => method === 'POST' ? Promise.resolve({ club: { id: 77 } }) : Promise.resolve(url === '/me' ? { user: {}, clubs: [], applications: [{ id: 12, name: sample.name, status: 'pending' }] } : { clubs: [] }));
    f.page.onShow(); await settle(); f.page.continueApplication();
    await f.page.create(); assert.equal(f.requests.filter(r => r[1] === 'POST').length, 0);
    f.page.onCreateField(input('city', '杭州')); await f.page.create();
    assert.equal(f.requests.find(r => r[1] === 'POST')[2].applicationId, 12);
    f.page.onUnload();
  });
  await check('创建入口位于我的跑团和发现跑团之间，目录不再包含创建表单', async () => {
    const f = fixture('clubs');
    f.page.openCreate();
    assert.deepEqual(f.navigation, ['/pages/club-create/club-create']);
    const markup = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/clubs/clubs.wxml'), 'utf8');
    assert.ok(markup.indexOf('class="my-clubs"') < markup.indexOf('id="create-club"'));
    assert.ok(markup.indexOf('id="create-club"') < markup.indexOf('id="discover-clubs"'));
    assert.doesNotMatch(markup, /create-form|bindtap="create"|createOpen|textarea/);
    const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'miniprogram/app.json'), 'utf8'));
    assert.ok(app.pages.includes('pages/club-create/club-create'));
    f.page.onUnload();
  });
  await check('访客登录恢复独立创建页，续办旧申请仍需补充城市和确认提交', async () => {
    const f = fixture('club-create', { continue: '1' });
    f.account('', false); await f.page.onShow(); f.page.login();
    assert.deepEqual(f.storage, [['marathon_return_after_login', '/pages/club-create/club-create?continue=1']]);
    assert.deepEqual(f.navigation, ['/pages/mine/mine']);
    assert.equal(f.requests.length, 0);
    f.account('account-b');
    f.handler(url => Promise.resolve(url === '/me' ? { applications: [{ id: 12, name: '续办跑团', status: 'pending' }] } : { clubs: [] }));
    await f.page.onShow(); await settle();
    assert.equal(f.page.data.name, '续办跑团'); assert.equal(f.page.data.applicationId, 12);
    await f.page.create(); assert.equal(f.requests.filter(r => r[1] === 'POST').length, 0);
    const mine = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/mine/mine.js'), 'utf8');
    assert.ok(mine.includes('returnPath === "/pages/club-create/club-create"'));
    assert.ok(mine.includes('returnPath === "/pages/club-create/club-create?continue=1"'));
    f.page.onUnload();
  });
  await check('我的登录恢复方法实际跳回两种创建路径并消费回跳意图', async () => {
    for (const destination of ['/pages/club-create/club-create', '/pages/club-create/club-create?continue=1']) {
      const f = fixture('mine'); f.saved.set('marathon_return_after_login', destination);
      f.account('', false); f.page.resumePendingClub(); assert.deepEqual(f.navigation, []);
      f.account('account-b'); f.page.resumePendingClub();
      assert.deepEqual(f.navigation, [destination]); assert.equal(f.saved.has('marathon_return_after_login'), false);
      f.page.resumePendingClub(); assert.equal(f.navigation.length, 1);
    }
  });
  await check('创建时登录过期会清空表单并恢复登录入口，普通错误仍可重试', async () => {
    const f = fixture('club-create'); f.handler(() => Promise.resolve({})); await f.page.onShow();
    f.page.setData({ name: '过期会话的跑团', city: '杭州' });
    f.handler(() => Promise.reject(Object.assign(new Error('登录已失效'), { status:401 })));
    await f.page.create(); assert.equal(f.page.data.ready, false); assert.equal(f.page.data.name, ''); assert.equal(f.page.data.creating, false);
    f.page.login(); assert.deepEqual(f.navigation, ['/pages/mine/mine']); f.page.onUnload();
  });
  await check('同账号查看同名团后保留草稿与未知结果幂等键，旧响应不跳转', async () => {
    const f = fixture('club-create'); const pending = deferred();
    f.handler((url, method) => method === 'POST' ? pending.promise : Promise.resolve(url === '/me' ? {} : { clubs: [sample] }));
    await f.page.onShow(); f.page.setData({ name: sample.name, city: '杭州', intro: '每周三夜跑' });
    const work = f.page.create(); const requestId = f.requests.find(r => r[1] === 'POST')[2].requestId;
    f.page.onHide(); await f.page.onShow();
    pending.resolve({ club: { id: 88 } }); await work;
    assert.deepEqual(f.navigation, []); assert.equal(f.page.data.name, sample.name); assert.equal(f.page.data.intro, '每周三夜跑');
    f.handler((url, method) => Promise.resolve(method === 'POST' ? { club: { id: 88 } } : {}));
    await f.page.create();
    assert.equal(f.requests.filter(r => r[1] === 'POST')[1][2].requestId, requestId);
    assert.deepEqual(f.navigation, ['/pages/club/club?id=88&created=1']);
    f.page.onUnload();
  });
  await check('换账号和离页使旧同名检查失效，清空名称不显示迟到建议', async () => {
    for (const change of ['account', 'hide', 'empty']) {
      const f = fixture('club-create'); const pending = deferred();
      f.handler(url => url === '/me' ? Promise.resolve({}) : pending.promise);
      await f.page.onShow(); f.page.setData({ name: sample.name }); const work = f.page.checkDuplicates();
      if (change === 'account') { f.account('account-b'); await f.page.onShow(); }
      else if (change === 'hide') f.page.onHide();
      else f.page.onName(input('name', ''));
      pending.resolve({ clubs: [sample] }); await work;
      assert.equal(f.page.data.duplicates.length, 0); f.page.onUnload();
    }
  });
  await check('读取申请失效后清空创建资料并引导重新登录', async () => {
    const f = fixture('club-create'); f.handler(() => Promise.resolve({}));
    await f.page.onShow(); f.page.setData({ name: '私密团名', city: '杭州', intro: '旧账号介绍' });
    f.handler(() => Promise.reject(Object.assign(new Error('登录已失效'), { status: 401 })));
    await f.page.load();
    assert.equal(f.page.data.ready, false); assert.equal(f.page.data.name, ''); assert.equal(f.page.data.intro, '');
    f.page.login(); assert.deepEqual(f.navigation, ['/pages/mine/mine']); f.page.onUnload();
  });
  await check('核验材料只在团长页读取和提交，换账号后清空草稿与已有材料', async () => {
    const f = fixture('club-identity');
    f.handler((url, method, body) => Promise.resolve(method === 'POST' ? { verification: { ...body, id: 8, status: 'pending' } } : { club: sample, verification: null }));
    await f.page.onShow();
    for (const [key, value] of Object.entries({ organization: '西湖组织', scope: '杭州分团', evidence: '私密授权说明', contact: 'private@example.test' })) f.page.onField(input(key, value));
    await f.page.submit();
    assert.equal(f.page.data.statusLabel, '待核验');
    assert.equal(f.requests.find(r => r[1] === 'POST')[0], '/clubs/44/identity');
    assert.deepEqual(f.storage, []);
    f.account('account-b'); f.handler(() => Promise.reject(new Error('只有本团团长可以管理跑团身份')));
    await f.page.onShow();
    for (const key of ['organization', 'scope', 'evidence', 'contact']) assert.equal(f.page.data[key], '');
    assert.equal(f.page.data.club, null);
    f.page.onUnload();
  });
  await check('核验加载或提交离页后返回，不恢复私密材料或提交状态', async () => {
    for (const action of ['load', 'submit']) {
      const f = fixture('club-identity'); const pending = deferred();
      f.handler((url, method) => action === 'load' || method === 'POST' ? pending.promise : Promise.resolve({ club: sample }));
      let work = f.page.onShow();
      if (action === 'submit') { await work; f.page.setData({ organization: '西湖组织', scope: '杭州', evidence: '旧材料', contact: '旧联系方式' }); work = f.page.submit(); }
      f.page.onUnload(); const before = JSON.stringify(f.page.data);
      pending.resolve({ club: sample, verification: { status: 'pending', evidence: '绝不迟到显示', contact: 'private@example.test' } });
      await work;
      assert.equal(JSON.stringify(f.page.data), before);
    }
  });
  await check('反馈按团号私密提交，本人工单刷新，换账号后不保留联系方式', async () => {
    const f = fixture('club-report'); let submitted;
    f.handler((url, method, body) => {
      if (method === 'POST') { submitted = { id: 7, ...body, clubId: 44, clubName: sample.name, status: 'pending' }; return Promise.resolve({ report: submitted }); }
      return Promise.resolve(url === '/me/club-reports' ? { reports: submitted ? [submitted] : [] } : { club: sample });
    });
    await f.page.onShow();
    f.page.pickType({ currentTarget: { dataset: { type: 'impersonation' } } });
    f.page.onField(input('detail', '私密反馈说明')); f.page.onField(input('contact', 'private-reporter@example.test'));
    await f.page.submit();
    assert.equal(f.requests.find(r => r[1] === 'POST')[0], '/clubs/44/reports');
    assert.equal(f.page.data.reports[0].id, 7); assert.equal(f.page.data.contact, '');
    f.account('account-b'); submitted = null; await f.page.onShow();
    assert.equal(f.page.data.reports.length, 0); assert.equal(f.page.data.detail, '');
    assert.deepEqual(f.storage, []); f.page.onUnload();
  });
  await check('分享标题含城市、负责人和团号，分享路径不夹带登录凭据', async () => {
    const f = fixture('club-intro');
    f.handler(() => Promise.resolve({ club: { ...sample, code: 'private-invitation' } }));
    f.page.onShow(); await settle();
    const share = f.page.onShareAppMessage();
    for (const item of [sample.name, sample.city, sample.leader, '#44']) assert.ok(share.title.includes(item));
    assert.equal(share.path, '/pages/club-intro/club-intro?id=44');
    assert.ok(!share.path.includes('account-a') && !share.path.includes('private-invitation'));
    f.page.onUnload();
  });
  await check('切换账号尚未 onShow 时，创建和私密表单不把旧草稿交给新账号', async () => {
    for (const name of ['club-create', 'club-identity', 'club-report']) {
      const f = fixture(name);
      f.handler(url => Promise.resolve(url === '/me' ? { user: {}, clubs: [] } : url.startsWith('/clubs/directory') ? { clubs: [] } : url === '/me/club-reports' ? { reports: [] } : { club: sample }));
      f.page.onShow(); await settle();
      f.page.setData({ name: '旧账号团名', city: '杭州', organization: '旧账号组织', scope: '杭州', evidence: '旧私密材料', detail: '旧私密反馈', contact: '旧联系方式' });
      f.account('account-b');
      await (name === 'club-create' ? f.page.create() : f.page.submit());
      assert.equal(f.requests.filter(r => ['POST', 'PUT'].includes(r[1])).length, 0, name);
      f.page.onUnload();
    }
  });
  await check('受限公开页不打开分享或发送加入请求，保留稳定团号的申诉入口', async () => {
    const f = fixture('club-intro');
    f.handler(() => Promise.resolve({ club: { id: 44, name: sample.name, publicStatus: 'restricted', restricted: true } }));
    f.page.onShow(); await settle(); f.page.openShare(); f.page.apply(); f.page.submitApplication();
    assert.equal(f.page.data.shareOpen, false);
    assert.equal(f.requests.filter(r => r[1] === 'POST').length, 0);
    const shared = f.page.onShareAppMessage();
    assert.ok(!shared.path.includes('id=44'), 'restricted native share cannot recruit');
    f.page.reportIdentity();
    assert.deepEqual(f.navigation, ['/pages/club-report/club-report?id=44']);
    f.page.onUnload();
  });
  await check('受限名片和邀请页保留已加入成员入口，非成员与迟到账号状态不能进入', async () => {
    for (const query of [{ id: '44' }, { code: 'existing-invitation' }]) {
      const f = fixture('club-intro', query);
      f.handler(() => Promise.resolve({ club: { ...sample, joined: true, publicStatus: 'restricted', restricted: true } }));
      f.page.onShow(); await settle();
      assert.equal(f.page.data.club.joined, true);
      f.page.enterClub();
      assert.deepEqual(f.navigation, ['/pages/club/club?id=44']);
      f.page.apply(); f.page.submitApplication(); f.page.openShare();
      assert.equal(f.page.data.shareOpen, false);
      assert.equal(f.requests.filter(r => r[1] === 'POST').length, 0);
      f.navigation.length = 0;
      f.account('account-b'); f.page.enterClub();
      assert.deepEqual(f.navigation, [], 'membership from the previous account cannot navigate');
      f.handler(() => Promise.resolve({ club: { ...sample, joined: false, publicStatus: 'restricted', restricted: true } }));
      f.page.onShow(); await settle(); f.page.enterClub();
      assert.deepEqual(f.navigation, [], 'a nonmember cannot enter a restricted club');
      f.page.onUnload();
    }
    const markup = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/club-intro/club-intro.wxml'), 'utf8');
    assert.match(markup, /wx:if="\{\{club\.joined\}\}"[^>]*bindtap="enterClub">进入已加入的跑团/);
  });
  await check('待处理反馈可预填更新且固定团号类型，按返回结果区分更新和相同内容', async () => {
    const f = fixture('club-report');
    let saved = { id: 7, clubId: 44, clubName: sample.name, type: 'impersonation', status: 'pending', detail: '原情况', sourceUrl: 'https://example.test/old', contact: 'old@example.test' };
    let outcome = 'updated';
    f.handler((url, method, body) => {
      if (method === 'POST') { saved = { ...saved, ...body }; return Promise.resolve({ report: saved, outcome }); }
      return Promise.resolve(url === '/me/club-reports' ? { reports: [saved] } : { club: sample });
    });
    await f.page.onShow();
    assert.equal(f.page.data.reports[0].canRespond, true);
    f.page.prepareReport({ currentTarget: { dataset: { id: 7 } } });
    assert.equal(f.page.data.detail, '原情况');
    assert.equal(f.page.data.sourceUrl, 'https://example.test/old');
    assert.equal(f.page.data.contact, 'old@example.test');
    assert.equal(f.page.data.editingReportId, 7);
    f.page.onField(input('targetId', '55'));
    f.page.pickType({ currentTarget: { dataset: { type: 'management' } } });
    assert.equal(f.page.data.targetId, '44'); assert.equal(f.page.data.type, 'impersonation');
    f.page.onField(input('detail', '新发生的情况'));
    f.page.onField(input('sourceUrl', 'https://example.test/new'));
    f.page.onField(input('contact', 'new@example.test'));
    await f.page.submit();
    const sent = f.requests.find(r => r[1] === 'POST');
    assert.equal(sent[0], '/clubs/44/reports');
    assert.equal(sent[2].detail, '新发生的情况'); assert.equal(sent[2].contact, 'new@example.test');
    assert.equal(f.page.data.reports.length, 1); assert.equal(f.page.data.reports[0].id, 7);
    assert.equal(f.page.data.reports[0].sourceUrl, 'https://example.test/new');
    assert.match(f.page.data.message, /原工单 #7 的材料已更新/);
    assert.equal(f.page.data.detail, ''); assert.equal(f.page.data.contact, '');
    outcome = 'unchanged';
    f.page.prepareReport({ currentTarget: { dataset: { id: 7 } } });
    await f.page.submit();
    assert.match(f.page.data.message, /工单 #7 已收到相同内容，无需重复提交/);
    assert.doesNotMatch(f.page.data.message, /材料已更新|已新建/);
    f.page.onUnload();
  });
  await check('反馈提示使用服务端实际工单号，新建与复核合并不混淆', async () => {
    const f = fixture('club-report'); let outcome = 'created';
    f.handler((url, method) => Promise.resolve(method === 'POST' ? { report: { id: 19 }, outcome } : url === '/me/club-reports' ? { reports: [] } : { club: sample }));
    await f.page.onShow();
    f.page.setData({ detail: '完整新情况', contact: 'private@example.test' });
    await f.page.submit();
    assert.match(f.page.data.message, /私密工单 #19 已新建/);
    outcome = 'updated';
    f.page.setData({ detail: '复核的新事实', contact: 'new@example.test', editingReportId: 4, editingReportStatus: 'dismissed' });
    await f.page.submit();
    assert.match(f.page.data.message, /原工单 #19 的材料已更新/);
    assert.doesNotMatch(f.page.data.message, /#4/);
    f.page.onUnload();
  });
  await check('更换反馈团号后，旧公开名片响应不能造成目标错位', async () => {
    const f = fixture('club-report'); const pending = deferred();
    f.handler(url => url === '/clubs/44/public' ? pending.promise : Promise.resolve({ reports: [] }));
    const loading = f.page.onShow();
    f.page.onField(input('targetId', '55'));
    pending.resolve({ club: sample }); await loading;
    assert.equal(f.page.data.targetId, '55'); assert.equal(f.page.data.club, null);
    f.handler(url => Promise.resolve(url === '/clubs/55/public' ? { club: { ...sample, id: 55, city: '绍兴' } } : { reports: [] }));
    await f.page.lookupTarget();
    assert.equal(f.page.data.club.id, 55); f.page.onUnload();
  });
  await check('有效公共授权链接可以独立作为核验材料', async () => {
    const f = fixture('club-identity');
    f.handler((url, method) => Promise.resolve(method === 'POST' ? { verification: { id: 9, status: 'pending' } } : { club: sample }));
    await f.page.onShow();
    f.page.setData({ organization: '西湖组织', scope: '杭州', sourceUrl: 'https://example.test/authorization', evidence: '', contact: '私密联系方式' });
    await f.page.submit();
    assert.equal(f.requests.filter(r => r[1] === 'POST').length, 1); f.page.onUnload();
  });
}
main().catch(error => { report.error = error.stack || String(error); process.exitCode = 1; console.error(report.error); }).finally(() => {
  report.passed = !report.error;
  fs.writeFileSync(path.join(__dirname, 'mini-club-open-creation-report.json'), JSON.stringify(report, null, 2));
});
