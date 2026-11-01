const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const mini = path.join(root, 'miniprogram');
const bundled = require(path.join(mini, 'utils/legal-documents.js'));
const ids = ['privacy', 'terms', 'collection', 'sharing', 'permissions', 'children', 'rights'];
const copy = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const event = id => ({ currentTarget: { dataset: { id } } });
const input = value => ({ detail: { value } });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Execute the actual Page and its local helper modules. Only transport and the
// WeChat runtime are replaced, so assertions exercise callbacks and account state.
function fixture(name = 'legal', token = '') {
  const app = { globalData: { token, nickname: '', avatar: '', baseUrl: 'https://mini.example', privacyResolvers: [], privacyReferrers: [] } };
  const calls = [], writes = [], storage = new Map(), modules = new Map();
  let definition;
  let reply = (endpoint) => endpoint === '/legal' ? Promise.resolve(copy(bundled)) : Promise.resolve({ requests: [] });
  const wx = {
    pageScrollTo(data) { calls.push({ kind: 'scroll', ...data }); },
    navigateTo(data) { calls.push({ kind: 'navigate', ...data }); },
    navigateBack(data) { calls.push({ kind: 'back', ...data }); },
    switchTab(data) { calls.push({ kind: 'switch', ...data }); },
    setStorageSync(key, value) { storage.set(key, value); },
    getStorageSync(key) { return storage.get(key); },
    removeStorageSync(key) { storage.delete(key); },
    getPrivacySetting(options) { calls.push({ kind: 'privacy-setting' }); options.success({ privacyContractName: '赛历用户隐私保护指引' }); },
    openPrivacyContract(options) { calls.push({ kind: 'open-contract' }); if (options.success) options.success({}); },
    login(options) { calls.push({ kind: 'wx-login' }); options.success({ code: 'one-use-code' }); },
    env: { USER_DATA_PATH: 'wxfile://test' },
    getFileSystemManager() { return { writeFile(options) { options.success(); }, unlink(options) { options.complete(); } }; }
  };
  const requestModule = {
    ready: () => Boolean(app.globalData.token),
    request(endpoint, method = 'GET', body) {
      const call = { kind: 'request', endpoint, method, body: body === undefined ? undefined : copy(body), token: app.globalData.token };
      calls.push(call);
      return reply(endpoint, method, body, call.token);
    },
    setAuth(value, nickname, avatar) { Object.assign(app.globalData, { token: value, nickname, avatar }); },
    clearAuth() { Object.assign(app.globalData, { token: '', nickname: '', avatar: '' }); }
  };
  const context = vm.createContext({ wx, getApp: () => app, Page(page) { definition = page; }, console, setTimeout, clearTimeout });
  function load(filename) {
    const full = path.resolve(filename);
    if (full === path.join(mini, 'utils/request.js')) return requestModule;
    // Native mini program require loads script modules, not Node's JSON loader.
    assert.equal(path.extname(full), '.js', 'Mini program require cannot load JSON as a script module: ' + full);
    if (modules.has(full)) return modules.get(full).exports;
    assert.ok(full.startsWith(mini + path.sep), 'Only actual mini program modules may be loaded');
    const module = { exports: {} };
    modules.set(full, module);
    const code = vm.runInContext('(function(require,module,exports){\n' + fs.readFileSync(full, 'utf8') + '\n})', context, { filename: full });
    code(relative => {
      assert.ok(relative.startsWith('.'), 'Unexpected nonlocal module: ' + relative);
      let target = path.resolve(path.dirname(full), relative);
      if (!path.extname(target)) target += '.js';
      return load(target);
    }, module, module.exports);
    return module.exports;
  }
  load(path.join(mini, 'pages', name, name + '.js'));
  const page = {
    ...definition,
    data: copy(definition.data),
    setData(patch) {
      writes.push(copy(patch));
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
        let target = this.data;
        for (const part of parts.slice(0, -1)) target = target[part];
        target[parts.at(-1)] = value;
      }
    }
  };
  return { page, app, wx, calls, writes, storage, setReply(handler) { reply = handler; }, requests() { return calls.filter(call => call.kind === 'request'); }, loadedModules() { return Array.from(modules.keys()); } };
}

const report = { kind: 'Actual mini program legal, privacy and login Page VM regression; mocked transport, no business data writes', checks: [] };
async function check(name, run) {
  try { await run(); report.checks.push({ name, passed: true }); }
  catch (error) { report.checks.push({ name, passed: false, error: error.stack || String(error) }); }
}

async function main() {
  await check('Each of the seven route entries renders the bundled script before any API responds', async () => {
    for (const id of ids) {
      const f = fixture();
      const pending = deferred();
      f.setReply(() => pending.promise);
      f.page.onLoad({ doc: id }); f.page.onShow();
      assert.ok(f.loadedModules().includes(path.join(mini, 'utils/legal-documents.js')), id + ' must execute the actual bundled script');
      assert.equal(f.page.data.selected.id, id);
      assert.equal(f.page.data.catalog.documents.length, 7);
      assert.equal(f.page.data.localCopy, true);
      assert.ok(f.page.data.selected.sections.length >= 3);
      assert.ok(f.requests().every(call => call.endpoint === '/legal'));
      pending.resolve(copy(bundled)); await tick();
    }
  });

  await check('Missing backend endpoint and network errors preserve every document route for guests', async () => {
    for (const id of ids) {
      for (const status of [404, 503]) {
        const f = fixture();
        f.setReply(() => Promise.reject(Object.assign(new Error(status === 404 ? '请求失败' : '网络不可用'), { status })));
        f.page.onLoad({ doc: id }); f.page.onShow(); await tick();
        assert.equal(f.page.data.selected.id, id);
        assert.ok(f.page.data.selected.sections.some(section => section.paragraphs.length || section.rows.length));
        assert.equal(f.page.data.catalog.documents.length, 7);
        assert.equal(f.page.data.localCopy, true);
        assert.equal(f.page.data.loading, false);
        assert.match(f.page.data.message, /内置版本/);
        assert.ok(f.requests().every(call => call.endpoint === '/legal'));
      }
    }
  });
  await check('Guest can read all seven bundled documents offline without fetching private requests', async () => {
    const f = fixture(); f.page.onLoad();
    assert.deepEqual(Array.from(f.page.data.catalog.documents, doc => doc.id), ids);
    assert.equal(f.page.data.localCopy, true);
    for (const id of ids) {
      f.page.pickDocument(event(id));
      assert.equal(f.page.data.selected.id, id);
      assert.ok(f.page.data.selected.title && f.page.data.selected.sections.length);
    }
    assert.equal(f.requests().length, 0);
    f.page.onDetail(input('游客不得发送的资料'));
    await f.page.submitRequest();
    assert.equal(f.requests().length, 0);
  });

  await check('Failed public fetch preserves readable offline policy and retry recovers', async () => {
    const f = fixture(); f.page.onLoad({ doc: 'sharing' });
    f.setReply(() => Promise.reject(new Error('offline')));
    f.page.onShow(); await tick();
    assert.equal(f.page.data.selected.id, 'sharing');
    assert.equal(f.page.data.localCopy, true);
    assert.equal(f.page.data.loading, false);
    assert.match(f.page.data.message, /当前显示.*内置版本.*可继续阅读/);
    assert.ok(f.requests().every(call => call.endpoint === '/legal'));
    f.setReply(() => Promise.resolve(copy(bundled)));
    await f.page.load();
    assert.equal(f.page.data.message, '');
    assert.equal(f.page.data.localCopy, false);
    assert.equal(f.page.data.selected.id, 'sharing');
  });

  await check('Unusable public response cannot erase the bundled documents', async () => {
    const f = fixture(); f.page.onLoad({ doc: 'terms' });
    f.setReply(() => Promise.resolve({ documents: [] }));
    await f.page.load();
    assert.equal(f.page.data.selected.id, 'terms');
    assert.equal(f.page.data.catalog.documents.length, 7);
    assert.match(f.page.data.message, /内置版本/);
  });

  await check('Collection tables and highlighted paragraphs are readable Page data from the actual bundle', async () => {
    const f = fixture(); f.page.onLoad({ doc: 'collection' });
    const section = f.page.data.selected.sections.find(item => item.rows.length);
    assert.ok(section.rows.length > 5);
    assert.ok(section.rows.every(row => row.every(cell => cell.label && cell.segments.some(segment => segment.text))));
    f.page.pickDocument(event('privacy'));
    assert.ok(f.page.data.selected.sections.some(item => item.paragraphs.some(para => para.some(segment => segment.strong))));
    f.page.jump({ currentTarget: { dataset: { anchor: f.page.data.selected.sections[2].anchor } } });
    assert.equal(f.calls.at(-1).selector, '#legal-section-2');
  });

  await check('Guest rights login returns to the private rights page without submitting a request', async () => {
    const f = fixture(); f.page.onLoad({ doc: 'rights' }); f.page.login();
    assert.equal(f.storage.get('marathon_return_after_login'), '/pages/legal/legal?doc=rights');
    assert.equal(f.calls.at(-1).url, '/pages/mine/mine');
    assert.equal(f.requests().length, 0);
  });

  await check('Authenticated rights requests map every type and status, preserving private replies', async () => {
    const f = fixture('legal', 'account-A'); f.page.onLoad({ doc: 'rights' });
    const types = ['access', 'copy', 'correct', 'delete', 'withdraw', 'close', 'other'];
    const labels = ['查阅个人信息', '复制个人信息', '更正或补充', '删除个人信息', '撤回同意', '注销账号', '其他权利或投诉'];
    const statuses = ['pending', 'processing', 'needs_info', 'completed', 'rejected'];
    const statusLabels = ['已提交', '处理中', '待你补充', '已回复办结', '未予办理'];
    f.setReply(() => Promise.resolve({ requests: types.map((type, index) => ({ id: index + 1, type, status: statuses[index % statuses.length], detail: '私密申请 ' + index, response: '本人可见的处理回复', createdAt: '2026-11-01T08:00:00Z' })) }));
    await f.page.loadRequests();
    assert.equal(f.page.data.requests.length, 7);
    f.page.data.requests.forEach((row, index) => {
      assert.equal(row.typeLabel, labels[index]);
      assert.equal(row.statusLabel, statusLabels[index % statusLabels.length]);
      assert.equal(row.dateLabel, '2026-11-01');
      assert.equal(row.response, '本人可见的处理回复');
    });
    assert.equal(f.requests()[0].token, 'account-A');
    assert.equal(f.requests()[0].endpoint, '/me/privacy-requests');
  });

  await check('Private form validates, sends the selected type and trimmed details, then refreshes replies', async () => {
    const f = fixture('legal', 'account-A'); f.page.onLoad({ doc: 'rights' });
    await f.page.submitRequest();
    f.page.onDetail(input('a'.repeat(2001))); await f.page.submitRequest();
    assert.equal(f.requests().length, 0);
    f.page.onType(input('5')); f.page.onDetail(input('  请注销我的账号与相关资料  '));
    f.setReply((endpoint, method, body) => Promise.resolve(method === 'POST' ? { id: 1 } : { requests: [{ id: 1, type: body?.type || 'close', status: 'pending', detail: '请注销我的账号与相关资料', response: '', createdAt: '2026-11-01T09:00:00Z' }] }));
    await f.page.submitRequest();
    assert.equal(f.requests().length, 2);
    assert.deepEqual(f.requests()[0].body, { type: 'close', detail: '请注销我的账号与相关资料' });
    assert.equal(f.requests()[0].method, 'POST');
    assert.equal(f.requests()[1].method, 'GET');
    assert.equal(f.page.data.detail, '');
    assert.equal(f.page.data.submitting, false);
    assert.equal(f.page.data.requests[0].typeLabel, '注销账号');
    assert.match(f.page.data.requestMessage, /不会立即删除账号/);
  });

  await check('Active submission cannot be duplicated or edited before transport completes', async () => {
    const f = fixture('legal', 'account-A'); f.page.onLoad({ doc: 'rights' });
    const pending = deferred(); f.setReply((_, method) => method === 'POST' ? pending.promise : Promise.resolve({ requests: [] }));
    f.page.onDetail(input('请提供我的信息副本')); const first = f.page.submitRequest();
    f.page.onType(input('5')); f.page.onDetail(input('不应覆盖正在发送的资料')); await f.page.submitRequest();
    assert.equal(f.requests().length, 1);
    assert.equal(f.page.data.type, 'access');
    assert.equal(f.page.data.detail, '请提供我的信息副本');
    pending.resolve({ id: 9 }); await first;
    assert.equal(f.page.data.submitting, false);
  });

  await check('Switching accounts ignores a late private list and clears the previous account material', async () => {
    const f = fixture('legal', 'account-A'); f.page.onLoad({ doc: 'rights' });
    const pending = deferred(); f.setReply(() => pending.promise);
    f.page.onDetail(input('A的草稿')); const loading = f.page.loadRequests();
    f.app.globalData.token = 'account-B'; f.page.syncAccount(); const writeCount = f.writes.length;
    pending.resolve({ requests: [{ id: 2, type: 'close', status: 'completed', detail: 'A的私密材料', response: 'A的处理回复' }] }); await loading;
    assert.equal(f.writes.length, writeCount);
    assert.equal(f.page.data.requests.length, 0);
    assert.equal(f.page.data.detail, '');
  });

  await check('Switching accounts before submit cannot send the previous form under the new token', async () => {
    const f = fixture('legal', 'account-A'); f.page.onLoad({ doc: 'rights' });
    f.page.onDetail(input('A的申请草稿')); f.app.globalData.token = 'account-B';
    await f.page.submitRequest();
    assert.equal(f.requests().length, 0);
    assert.equal(f.page.data.detail, '');
    f.page.onDetail(input('B自己的新申请')); await f.page.submitRequest();
    assert.equal(f.requests()[0].token, 'account-B');
    assert.equal(f.requests()[0].body.detail, 'B自己的新申请');
  });

  await check('Late success or failure from another account cannot restore material or refresh under the new token', async () => {
    for (const fail of [false, true]) {
      const f = fixture('legal', 'account-A'); f.page.onLoad({ doc: 'rights' });
      const pending = deferred(); f.setReply(() => pending.promise);
      f.page.onDetail(input('A正在发送的申请')); const sending = f.page.submitRequest();
      f.app.globalData.token = 'account-B'; f.page.syncAccount();
      f.page.onDetail(input('B的新资料')); const writeCount = f.writes.length;
      if (fail) pending.reject(new Error('A的服务端错误')); else pending.resolve({ id: 1 });
      await sending;
      assert.equal(f.writes.length, writeCount);
      assert.equal(f.page.data.detail, 'B的新资料');
      assert.equal(f.page.data.requestMessage, '');
      assert.equal(f.requests().length, 1);
    }
  });

  await check('Hide and unload invalidate late list callbacks without writing private data', async () => {
    for (const lifecycle of ['onHide', 'onUnload']) {
      const f = fixture('legal', 'account-A'); f.page.onLoad({ doc: 'rights' });
      const pending = deferred(); f.setReply(() => pending.promise);
      const loading = f.page.loadRequests(); f.page[lifecycle](); const writeCount = f.writes.length;
      pending.resolve({ requests: [{ id: 1, detail: '离开后迟到的材料', response: '不能写回页面' }] }); await loading;
      assert.equal(f.writes.length, writeCount);
      assert.equal(f.page.data.requests.length, 0);
    }
  });

  await check('Leaving during POST cannot clear a new draft or trigger a follow-up private GET', async () => {
    for (const lifecycle of ['onHide', 'onUnload']) {
      const f = fixture('legal', 'account-A'); f.page.onLoad({ doc: 'rights' });
      const pending = deferred(); f.setReply(() => pending.promise);
      f.page.onDetail(input('即将离开的申请')); const sending = f.page.submitRequest();
      f.page[lifecycle](); const writeCount = f.writes.length;
      pending.resolve({ id: 1 }); await sending;
      assert.equal(f.writes.length, writeCount);
      assert.equal(f.requests().length, 1);
    }
  });

  await check('Returning to the same account after an interrupted submission restores an editable form', async () => {
    const f = fixture('legal', 'account-A'); f.page.onLoad({ doc: 'rights' });
    const pending = deferred();
    f.setReply((endpoint, method) => method === 'POST' ? pending.promise : Promise.resolve(endpoint === '/legal' ? copy(bundled) : { requests: [] }));
    f.page.onDetail(input('离开前提交的申请')); const sending = f.page.submitRequest();
    f.page.onHide(); pending.resolve({ id: 1 }); await sending;
    f.page.onShow(); await tick();
    assert.equal(f.page.data.submitting, false, 'An invalidated callback must not leave the form permanently disabled');
    f.page.onDetail(input('返回后修改的新事项'));
    assert.equal(f.page.data.detail, '返回后修改的新事项');
  });

  await check('Switching documents during submission does not leave the rights form permanently busy', async () => {
    const f = fixture('legal', 'account-A'); f.page.onLoad({ doc: 'rights' });
    const pending = deferred();
    f.setReply((_, method) => method === 'POST' ? pending.promise : Promise.resolve({ requests: [] }));
    f.page.onDetail(input('切页前提交的申请')); const sending = f.page.submitRequest();
    f.page.pickDocument(event('privacy')); pending.resolve({ id: 1 }); await sending;
    f.page.pickDocument(event('rights')); await tick();
    assert.equal(f.page.data.submitting, false, 'Returning from another document must restore the form');
    f.page.onDetail(input('切页后修改的新事项'));
    assert.equal(f.page.data.detail, '切页后修改的新事项');
  });

  await check('Stale public document fetch does not rewrite a hidden or unloaded page', async () => {
    const f = fixture(); f.page.onLoad({ doc: 'privacy' });
    const pending = deferred(); f.setReply(() => pending.promise);
    const loading = f.page.load(); f.page.onUnload(); const writeCount = f.writes.length;
    pending.resolve({ ...copy(bundled), version: 'future-version' }); await loading;
    assert.equal(f.writes.length, writeCount);
    assert.equal(f.page.data.catalog.version, bundled.version);
  });

  await check('An authorization failure clears private request material rather than retaining stale replies', async () => {
    const f = fixture('legal', 'account-A'); f.page.onLoad({ doc: 'rights' });
    f.page.setData({ requests: [{ id: 1, detail: '旧材料', response: '旧回复' }], detail: '尚未发送的资料' });
    f.setReply(() => Promise.reject(Object.assign(new Error('请重新登录'), { status: 401 })));
    await f.page.loadRequests();
    assert.equal(f.page.data.requests.length, 0); assert.equal(f.page.data.detail, '');
    assert.match(f.page.data.requestMessage, /重新登录/);
    assert.equal(f.page.data.requestsLoading, false);
  });

  await check('Opening native privacy contract and document links never accepts privacy authorization', async () => {
    const f = fixture('privacy'); const decisions = [];
    f.app.globalData.privacyResolvers = [answer => decisions.push(copy(answer))];
    f.page.onShow(); f.page.openContract();
    for (const doc of ['privacy', 'collection', 'sharing', 'permissions', 'rights']) f.page.openFullPolicy({ currentTarget: { dataset: { doc } } });
    assert.equal(f.page.data.contractName, '赛历用户隐私保护指引');
    assert.equal(f.page.data.pending, true);
    assert.equal(decisions.length, 0);
    assert.equal(f.app.globalData.privacyResolvers.length, 1);
    assert.equal(f.calls.filter(call => call.kind === 'navigate').length, 5);
    assert.equal(f.requests().length, 0);
  });

  await check('Native privacy authorization is resolved only by explicit agreement, decline or leaving', async () => {
    for (const action of ['agreePrivacyAuthorization', 'decline', 'onUnload']) {
      const f = fixture('privacy'); const decisions = [];
      f.app.globalData.privacyResolvers = [answer => decisions.push(copy(answer))];
      f.page.onShow(); assert.equal(decisions.length, 0); f.page[action]();
      assert.equal(decisions.length, 1);
      assert.equal(decisions[0].event, action === 'agreePrivacyAuthorization' ? 'agree' : 'disagree');
      assert.equal(f.app.globalData.privacyResolvers.length, 0);
    }
  });

  await check('Password registration/login and WeChat login never start with the default unchecked consent', async () => {
    const f = fixture('mine');
    assert.equal(f.page.data.legalAccepted, false);
    f.page.onLegalConsent(input([]));
    f.page.setData({ draft: '跑者', password: 'Password123', password2: 'Password123' });
    for (const tab of ['login', 'register']) { f.page.setData({ tab }); await f.page.submitAuth(); }
    await f.page.wechatLogin();
    assert.equal(f.requests().length, 0);
    assert.equal(f.calls.filter(call => call.kind === 'wx-login').length, 0);
    assert.match(f.page.data.message, /自主勾选/);
    f.page.openLegal({ currentTarget: { dataset: { doc: 'terms' } } });
    assert.equal(f.page.data.legalAccepted, false);
    assert.equal(f.calls.at(-1).url, '/pages/legal/legal?doc=terms');
  });

  await check('Explicit consent sends the actual bundled legal version with password registration and WeChat login', async () => {
    for (const auth of ['password', 'wechat']) {
      const f = fixture('mine');
      assert.ok(f.loadedModules().includes(path.join(mini, 'utils/legal-documents.js')), 'Login consent version must come from the actual mini program script bundle');
      f.setReply(() => Promise.reject(Object.assign(new Error('请选择关联现有账号或明确创建新账号'), { status: 409, code: 'WECHAT_REGISTRATION_REQUIRED' })));
      f.page.setData({ tab: 'register', draft: ' 跑者 ', password: 'Password123', password2: 'Password123' });
      f.page.onLegalConsent(input(['accepted']));
      if (auth === 'password') await f.page.submitAuth(); else await f.page.wechatLogin();
      const call = f.requests()[0];
      assert.equal(call.endpoint, auth === 'password' ? '/auth/register' : '/auth/wechat');
      assert.equal(call.method, 'POST');
      assert.deepEqual(call.body.legalConsent, { version: bundled.version, accepted: true });
      assert.equal(call.token, '');
      assert.equal(f.page.data.wxLoading, false);
    }
  });


  await check('An online policy version change clears prior consent and requires a new decision for both auth flows', async () => {
    const nextVersion = bundled.version === '2026-11-02.1' ? '2026-11-03.1' : '2026-11-02.1';
    for (const auth of ['password', 'wechat']) {
      const f = fixture('mine');
      f.setReply((endpoint) => {
        if (endpoint === '/legal') return Promise.resolve({ ...copy(bundled), version: nextVersion });
        if (endpoint === '/meta') return Promise.resolve({ company: bundled.operator.name, icp: bundled.operator.icp });
        if (endpoint.startsWith('/auth/')) return Promise.reject(Object.assign(new Error('测试仅核对本次主动确认的版本'), { status: 409 }));
        throw new Error('Unexpected request in policy update flow: ' + endpoint);
      });
      f.page.setData({ tab: 'register', draft: ' 跑者 ', password: 'Password123', password2: 'Password123' });
      f.page.onLegalConsent(input(['accepted']));
      assert.equal(f.page.data.legalAccepted, true);
      f.page.onShow(); await tick();
      assert.equal(f.page.data.legalAccepted, false, auth + ': previous agreement cannot cover a changed version');
      if (auth === 'password') await f.page.submitAuth(); else await f.page.wechatLogin();
      assert.equal(f.requests().filter(call => call.endpoint.startsWith('/auth/')).length, 0);
      assert.equal(f.calls.filter(call => call.kind === 'wx-login').length, 0);
      f.page.onLegalConsent(input(['accepted']));
      if (auth === 'password') await f.page.submitAuth(); else await f.page.wechatLogin();
      const requests = f.requests().filter(call => call.endpoint.startsWith('/auth/'));
      assert.equal(requests.length, 1);
      assert.equal(requests[0].endpoint, auth === 'password' ? '/auth/register' : '/auth/wechat');
      assert.deepEqual(requests[0].body.legalConsent, { version: nextVersion, accepted: true });
    }
  });

  report.passed = report.checks.filter(item => item.passed).length;
  report.failed = report.checks.length - report.passed;
  console.log(JSON.stringify(report, null, 2));
  if (report.failed) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
