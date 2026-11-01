const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const file = path.join(root, 'miniprogram/pages/feedback/feedback.js');
const copy = value => JSON.parse(JSON.stringify(value));
const report = { kind: 'WeChat page logic regression in VM; not a simulator or device test', checks: [] };
const base = { id: 31, revision: 3, title: '跑团页面优先显示下次团练', body: '希望在跑团首页清晰显示下一场团练，点一下就能报名。', category: 'ui', module: 'clubs', status: 'published', statusLabel: '征集中', author: { nickname: '跑者甲' }, votes: 5, voted: false, isMine: false, canVote: true, canWithdraw: false, createdAt: '2026-10-30T01:00:00Z', updatedAt: '2026-10-30T01:00:00Z', publishedAt: '2026-10-30T01:00:00Z', reply: '', unread: false, images: [], events: [], reward: null };
function fixture(options = {}) {
  const app = { globalData: { token: 'owner-token', nickname: '跑者甲', baseUrl: 'https://example.test', ...options } }, storage = {}, calls = [];
  let definition, choose, uploadReply = { statusCode: 200, data: JSON.stringify(base) };
  let reply = endpoint => Promise.resolve(endpoint === '/me' ? { user: { id: app.globalData.token === 'second-token' ? 12 : 11 } } : endpoint.includes('?') ? { items: [copy(base)], page: 1, pages: 2, total: 14, summary: { published: 14, adopted: 2 }, unread: 3 } : copy(base));
  const wx = {
    getStorageSync: key => storage[key], setStorageSync(key, value) { storage[key] = copy(value); }, removeStorageSync(key) { delete storage[key]; },
    setNavigationBarTitle(data) { calls.push({ type: 'title', ...data }); }, navigateTo(data) { calls.push({ type: 'navigate', ...data }); }, switchTab(data) { calls.push({ type: 'switch', ...data }); }, redirectTo(data) { calls.push({ type: 'redirect', ...data }); },
    showShareMenu(data) { calls.push({ type: 'share', visible: true, ...data }); }, hideShareMenu(data) { calls.push({ type: 'share', visible: false, ...data }); },
    pageScrollTo() {}, stopPullDownRefresh() {}, chooseMedia(data) { choose = data; }, previewImage(data) { calls.push({ type: 'preview', ...data }); }, setClipboardData(data) { calls.push({ type: 'clipboard', ...data }); },
    uploadFile(data) { calls.push({ type: 'upload', ...data }); data.success(copy(uploadReply)); },
    showModal(data) { calls.push({ type: 'modal', ...data }); data.success({ confirm: true }); }
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Page(value) { definition = value; }, getApp: () => app, wx, require(name) { assert.equal(name, '../../utils/request'); return { ready: () => !!app.globalData.token, clearAuth() { app.globalData.token = ''; app.globalData.nickname = ''; }, request(endpoint, method = 'GET', data) { calls.push({ type: 'request', endpoint, method, data }); return reply(endpoint, method, data); } }; } }, { filename: file });
  const page = { ...definition, data: copy(definition.data), setData(patch) { for (const [key, value] of Object.entries(patch)) { const parts = key.split('.'); let target = this.data; for (const part of parts.slice(0, -1)) target = target[part]; target[parts.at(-1)] = value; } } };
  page.onLoad({});
  return { page, app, calls, storage, setReply(fn) { reply = fn; }, choose(files) { return choose.success({ tempFiles: files }); }, setUpload(value) { uploadReply = value; } };
}
const event = dataset => ({ currentTarget: { dataset } });
const input = (field, value) => ({ currentTarget: { dataset: { field } }, detail: { value } });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function check(name, fn) { await fn(); report.checks.push({ name, passed: true }); }
async function main() {
  await check('Guests browse publicly and return through the existing login for mine, compose and voting', async () => {
    const f = fixture({ token: '', nickname: '' }); await f.page.onShow(); assert.equal(f.page.data.items.length, 1);
    f.page.pickScope(event({ scope: 'mine' })); assert.equal(f.storage.marathon_return_after_login, '/pages/feedback/feedback?mine=1');
    await f.page.openCompose(); assert.equal(f.storage.marathon_return_after_login, '/pages/feedback/feedback?compose=1'); assert.equal(f.page.data.composeOpen, false);
    f.page.setData({ id: 31, detail: copy(base) }); await f.page.toggleVote(); assert.equal(f.storage.marathon_return_after_login, '/pages/feedback/feedback?id=31');
    assert.equal(f.calls.filter(call => call.type === 'request' && call.method === 'PUT').length, 0);
  });
  await check('Category, sort and pagination build independent server queries and refuse invalid navigation', async () => {
    const f = fixture(); await f.page.onShow(); await f.page.movePage(event({ direction: 1 })); assert.equal(f.calls.filter(call => call.type === 'request').at(-1).endpoint, '/feedback?category=all&sort=hot&page=2&mine=0');
    await f.page.pickCategory(event({ key: 'ui' })); assert.match(f.calls.filter(call => call.type === 'request').at(-1).endpoint, /category=ui&sort=hot&page=1/);
    await f.page.pickSort(event({ key: 'adopted' })); assert.match(f.calls.filter(call => call.type === 'request').at(-1).endpoint, /sort=adopted&page=1/);
    const before = f.calls.length; f.page.movePage(event({ direction: -1 })); f.page.pickCategory(event({ key: 'evil' })); assert.equal(f.calls.length, before);
  });
  await check('Private pending detail marks own progress read and cannot be shared', async () => {
    const f = fixture(); f.page.onLoad({ id: '31' }); const item = { ...copy(base), status: 'pending', publishedAt: null, isMine: true, unread: true, images: [{ id: 1, url: '/marathon/api/feedback/31/images/1?t=owner-token' }], events: [{ status: 'pending', createdAt: base.createdAt }] }; f.setReply(() => Promise.resolve(item)); await f.page.onShow();
    assert.equal(f.page.data.detail.publicShare, false); assert.equal(f.calls.filter(call => call.type === 'share').at(-1).visible, false);
    assert.ok(f.calls.some(call => call.endpoint === '/feedback/31/read' && call.method === 'POST' && call.data.revision === 3));
    assert.match(f.page.data.detail.images[0].url, /^https:\/\/example.test\/marathon/); assert.equal(f.page.onShareAppMessage().path, '/pages/feedback/feedback');
    assert.equal(f.page.data.detail.events[0].key, '0:' + base.createdAt);
  });
  await check('Published decisions share the stable public detail, while a withdrawn idea shares only the board', async () => {
    const f = fixture(); f.page.setDetail({ ...copy(base), status: 'declined' }); assert.equal(f.page.onShareAppMessage().path, '/pages/feedback/feedback?id=31'); assert.equal(f.page.onShareTimeline().query, 'id=31');
    f.page.setDetail({ ...copy(base), status: 'withdrawn' }); assert.equal(f.page.onShareAppMessage().path, '/pages/feedback/feedback');
  });
  await check('Account switching clears private addresses and ignores a late response from the previous account', async () => {
    const f = fixture(); let resolve; f.setReply(() => new Promise(done => { resolve = done; })); f.page.onLoad({ id: '31' }); const pending = f.page.onShow();
    f.app.globalData.token = 'second-token'; f.app.globalData.nickname = '跑者乙'; resolve({ ...copy(base), isMine: true, reward: { name: '跑帽', receiver: '私人姓名', phone: '13800000000', address: '北京市朝阳区测试路一号' } }); await pending; assert.equal(f.page.data.detail, null);
    f.setReply(() => Promise.resolve(copy(base))); await f.page.onShow(); assert.equal(f.page.data.claim.receiver, ''); assert.equal(f.page.data.detail.isMine, false);
  });
  await check('Text drafts are account isolated; images and reward addresses are never persisted as drafts', async () => {
    const f = fixture(); await f.page.onShow(); await f.page.openCompose(); f.page.inputDraft(input('title', '跑团页面优化建议')); f.page.inputDraft(input('body', '请把下一场训练放在首页，方便直接查看并报名。')); f.page.setData({ draftImages: [{ path: 'temp-private-photo' }] }); f.page.onHide();
    const saved = f.storage['marathon_feedback_draft_user_11']; assert.equal(saved.title, '跑团页面优化建议'); assert.equal(saved.images, undefined); assert.equal(saved.receiver, undefined);
    f.app.globalData.token = 'second-token'; f.app.globalData.nickname = '跑者乙'; await f.page.onShow(); await f.page.openCompose(); assert.equal(f.page.data.draft.title, ''); assert.equal(f.page.data.draftImages.length, 0);
    f.app.globalData.token = 'owner-token'; f.app.globalData.nickname = '跑者甲'; await f.page.onShow(); await f.page.openCompose(); assert.equal(f.page.data.draft.title, '跑团页面优化建议');
  });
  await check('Changing a nickname keeps the stable owner draft; a new account reusing the nickname cannot read it', async () => {
    const f = fixture(); await f.page.onShow(); await f.page.openCompose(); f.page.inputDraft(input('title', '原账号的私人草稿')); f.page.closeCompose();
    f.app.globalData.nickname = '改名后的跑者'; await f.page.openCompose(); assert.equal(f.page.data.draft.title, '原账号的私人草稿'); f.page.closeCompose();
    f.app.globalData.token = 'second-token'; f.app.globalData.nickname = '跑者甲'; await f.page.onShow(); await f.page.openCompose(); assert.equal(f.page.data.draft.title, ''); assert.equal(f.page.draftKey(), 'marathon_feedback_draft_user_12');
  });
  await check('Validation preserves drafts; duplicate taps cannot create two ideas', async () => {
    const f = fixture(); await f.page.onShow(); await f.page.openCompose(); await f.page.submit(); assert.match(f.page.data.actionError, /4–80/);
    f.page.inputDraft(input('title', '跑团页面优化建议')); await f.page.submit(); assert.match(f.page.data.actionError, /10–3000/);
    f.page.inputDraft(input('body', '请把下一场训练放在首页，方便直接查看并报名。')); let resolve; f.setReply((url, method) => method === 'POST' ? new Promise(done => { resolve = done; }) : Promise.resolve(copy(base))); const pending = f.page.submit(); await f.page.submit();
    assert.equal(f.calls.filter(call => call.endpoint === '/feedback' && call.method === 'POST').length, 1); resolve({ ...copy(base), isMine: true, status: 'pending', publishedAt: null }); await pending;
    assert.equal(f.page.data.composeOpen, false); assert.equal(f.page.data.id, 31); assert.equal(f.storage['marathon_feedback_draft_user_11'], undefined);
  });
  await check('A failed image upload keeps the created pending idea and offers retry instead of resubmitting the text', async () => {
    const f = fixture(); await f.page.onShow(); await f.page.openCompose(); f.page.inputDraft(input('title', base.title)); f.page.inputDraft(input('body', base.body)); f.page.setData({ draftImages: [{ path: 'wxfile://first.jpg' }] }); f.setReply(() => Promise.resolve({ ...copy(base), status: 'pending', publishedAt: null, isMine: true })); f.setUpload({ statusCode: 503, data: JSON.stringify({ error: '网络忙' }) }); await f.page.submit();
    assert.match(f.page.data.notice, /建议已提交/); assert.equal(f.page.data.detail.status, 'pending'); assert.equal(f.page.data.composeOpen, false); assert.equal(f.calls.filter(call => call.endpoint === '/feedback' && call.method === 'POST').length, 1);
    f.setUpload({ statusCode: 200, data: JSON.stringify({ ...copy(base), status: 'pending', publishedAt: null, isMine: true, images: [{ id: 9, url: '/marathon/api/feedback/31/images/9' }] }) }); f.page.chooseImages(); await f.choose([{ size: 100, tempFilePath: 'wxfile://retry.jpg' }]);
    assert.equal(f.page.data.detail.images.length, 1); const upload = f.calls.filter(call => call.type === 'upload').at(-1); assert.equal(upload.header.Authorization, 'Bearer owner-token'); assert.match(upload.url, /feedback\/31\/images$/); assert.equal(upload.name, 'file');
  });
  await check('Screenshot selection rejects oversized files, caps three images and previews only the selected set', async () => {
    const f = fixture(); await f.page.onShow(); await f.page.openCompose(); f.page.chooseImages(); await f.choose([{ size: 5 * 1024 * 1024 + 1, tempFilePath: 'too-big.jpg' }]); assert.match(f.page.data.actionError, /5 MB/); assert.equal(f.page.data.draftImages.length, 0);
    f.page.chooseImages(); await f.choose([{ size: 100, tempFilePath: '1.jpg' }, { size: 100, tempFilePath: '2.jpg' }, { size: 100, tempFilePath: '3.jpg' }, { size: 100, tempFilePath: '4.jpg' }]); assert.equal(f.page.data.draftImages.length, 3);
    f.page.previewImage(event({ url: '2.jpg' })); assert.equal(f.calls.at(-1).urls.length, 3); f.page.removeDraftImage(event({ index: 1 })); assert.equal(f.page.data.draftImages.length, 2);
  });
  await check('Voting sends an idempotent target boolean, ignores duplicate taps, and honors author and closed-state restrictions', async () => {
    const f = fixture(); await f.page.onShow(); f.page.setData({ id: 31 }); f.page.setDetail(copy(base)); let resolve; f.setReply(() => new Promise(done => { resolve = done; })); const pending = f.page.toggleVote(); await f.page.toggleVote(); assert.equal(f.calls.filter(call => call.method === 'PUT').length, 1); assert.equal(f.calls.at(-1).data.voted, true);
    resolve({ ...copy(base), voted: true, votes: 6 }); await pending; assert.equal(f.page.data.detail.votes, 6);
    f.setReply((url, method, data) => Promise.resolve({ ...copy(base), voted: data.voted })); await f.page.toggleVote(); assert.equal(f.calls.filter(call => call.method === 'PUT').at(-1).data.voted, false);
    const count = f.calls.length; f.page.setDetail({ ...copy(base), isMine: true }); await f.page.toggleVote(); f.page.setDetail({ ...copy(base), status: 'released', canVote: false }); await f.page.toggleVote(); assert.equal(f.calls.length, count + 2);
  });
  await check('Expired login clears private claim data and routes back to exactly the same idea', async () => {
    const f = fixture(); await f.page.onShow(); f.page.setData({ id: 31, claim: { receiver: '姓名', phone: '13800000000', address: '北京某个地址' } }); f.page.setDetail(copy(base)); f.setReply(() => Promise.reject(Object.assign(new Error('登录失效'), { status: 401 }))); await f.page.toggleVote();
    assert.equal(f.app.globalData.token, ''); assert.equal(f.page.data.detail, null); assert.equal(f.page.data.claim.receiver, ''); assert.equal(f.page.data.busy, false); assert.equal(f.storage.marathon_return_after_login, '/pages/feedback/feedback?id=31');
  });
  await check('Reward receipt requires owner eligibility and explicit consent before sending private data', async () => {
    const f = fixture(); await f.page.onShow(); f.page.setData({ id: 31 }); f.page.setDetail({ ...copy(base), isMine: false, reward: { name: '跑帽', status: 'unclaimed' } }); f.page.openClaim(); assert.equal(f.page.data.claimOpen, false);
    f.page.setDetail({ ...copy(base), isMine: true, reward: { name: '跑帽', status: 'unclaimed' } }); f.page.openClaim(); f.page.inputClaim(input('receiver', '跑者甲')); f.page.inputClaim(input('phone', '13800000000')); f.page.inputClaim(input('address', '北京市朝阳区测试街道一号')); await f.page.submitClaim(); assert.match(f.page.data.actionError, /同意/); assert.equal(f.calls.some(call => /reward\/claim/.test(call.endpoint || '')), false);
    f.page.toggleConsent(); f.setReply(() => Promise.resolve({ ...copy(base), isMine: true, reward: { name: '跑帽', status: 'claimed', receiver: '跑者甲', phone: '13800000000', address: '北京市朝阳区测试街道一号' } })); await f.page.submitClaim(); assert.equal(f.calls.filter(call => /reward\/claim/.test(call.endpoint || '')).at(-1).data.consent, true); assert.equal(f.page.data.claimOpen, false); assert.equal(f.page.data.claim.address, '');
    assert.equal(Object.values(f.storage).some(value => JSON.stringify(value).includes('13800000000')), false);
  });
  await check('Withdrawal and receiving rewards require confirmation and return authoritative server state', async () => {
    const f = fixture(); await f.page.onShow(); f.page.setData({ id: 31 }); f.page.setDetail({ ...copy(base), isMine: true, canWithdraw: true }); f.setReply(() => Promise.resolve({ ...copy(base), status: 'withdrawn', isMine: true, canWithdraw: false })); await f.page.withdraw(); assert.equal(f.page.data.detail.status, 'withdrawn'); assert.equal(f.page.onShareAppMessage().path, '/pages/feedback/feedback');
    f.page.setDetail({ ...copy(base), isMine: true, reward: { name: '跑帽', status: 'shipped', tracking: 'ABC123' } }); f.page.copyTracking(); assert.equal(f.calls.at(-1).data, 'ABC123'); f.setReply(() => Promise.resolve({ ...copy(base), isMine: true, reward: { name: '跑帽', status: 'received' } })); await f.page.receiveReward(); assert.equal(f.page.data.detail.reward.status, 'received'); assert.ok(f.calls.some(call => call.type === 'modal' && call.title === '确认已收到奖励'));
  });
  await check('Mine progress badge loads quietly, ignores old-account responses and clears on logout or errors', async () => {
    const app = { globalData: { token: 'account-a', nickname: '跑者甲' } }; let definition, resolve, fail = false; const calls = [];
    vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/pages/mine/mine.js'), 'utf8'), {
      Page(value) { definition = value; }, getApp: () => app, wx: { removeStorageSync() {} },
      require(name) { if (name === '../../utils/request') return { ready: () => !!app.globalData.token, clearAuth() { app.globalData.token = ''; }, request(url) { calls.push(url); return fail ? Promise.reject(new Error('offline')) : new Promise(done => { resolve = done; }); } }; if (name === '../../utils/runner-center') return { VIEWS: [] }; return {}; }
    });
    const page = { ...definition, data: copy(definition.data), setData(patch) { Object.assign(this.data, patch); } };
    const first = page.loadFeedbackSummary(); resolve({ total: 4, unread: 2 }); await first; assert.equal(page.data.feedbackUnread, 2); assert.equal(calls[0], '/me/feedback/summary');
    const stale = page.loadFeedbackSummary(); app.globalData.token = 'account-b'; resolve({ unread: 99 }); await stale; assert.equal(page.data.feedbackUnread, 2);
    fail = true; await page.loadFeedbackSummary(); assert.equal(page.data.feedbackUnread, 0); assert.equal(page.data.message, '');
    fail = false; const pending = page.loadFeedbackSummary(); page.logout(); resolve({ unread: 9 }); await pending; assert.equal(page.data.feedbackUnread, 0); assert.equal(app.globalData.token, '');
    const before = calls.length; await page.loadFeedbackSummary(); assert.equal(calls.length, before);
  });
  await check('My entry remains visible to guests and login-return only allows this known page shape', async () => {
    const mine = fs.readFileSync(path.join(root, 'miniprogram/pages/mine/mine.wxml'), 'utf8'); assert.match(mine, /class="feedback-entry" url="\/pages\/feedback\/feedback/);
    const logic = fs.readFileSync(path.join(root, 'miniprogram/pages/mine/mine.js'), 'utf8'); assert.match(logic, /id=\\d\+\|compose=1\|mine=1/);
    const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8')); assert.ok(app.pages.includes('pages/feedback/feedback'));
  });
}
main().then(() => { report.passed = true; console.log(JSON.stringify({ passed: true, checks: report.checks.length }, null, 2)); }).catch(error => { report.passed = false; report.error = error.stack; console.error(error.stack); process.exitCode = 1; }).finally(() => fs.writeFileSync(path.join(__dirname, 'feedback-mini-regression-report.json'), JSON.stringify(report, null, 2)));
