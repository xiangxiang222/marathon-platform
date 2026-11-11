/* Current mini Page methods + synthetic transport. Browser source mirrors only. */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..'), mini = path.join(root, 'miniprogram');
const newsFixture = require('./unified-news-mini-fixture.cjs');
const bundled = require('../miniprogram/utils/legal-documents');
const copy = value => JSON.parse(JSON.stringify(value));
const settle = async () => { await Promise.resolve(); await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
const event = (dataset = {}, value = '') => ({ currentTarget: { dataset }, detail: { value } });
const article = { id: 901, title: '【合成展示】周末团练资讯', summary: '用于检查编辑、预览及发布状态的合成文章。', body: '## 团练回顾\n这是版式验收的合成正文。\n\n**按自己的节奏出发。**', category: 'club', clubId: 99, source: '合成跑团', sourceUrl: 'https://mp.weixin.qq.com/s/synthetic', rights: 'original', status: 'draft', publishedAt: '2026-11-11', updatedAt: '2026-11-11' };
const feedback = { id: 801, title: '【合成展示】希望训练集合信息更清楚', body: '这是用于视觉验收的合成反馈。希望集合时间、地点和分组在出发前能够一眼确认。', category: 'ui', module: 'clubs', status: 'published', statusLabel: '征集意见', votes: 18, revision: 1, createdAt: '2026-11-11', updatedAt: '2026-11-11', publishedAt: '2026-11-11', author: { nickname: '合成跑者' }, reply: '已收到建议，正在整理具体场景。', isMine: false, canWithdraw: false, voted: false, images: [], events: [{ status: 'published', statusLabel: '已公示', createdAt: '2026-11-11', reply: '已公开征集意见。' }], reward: null };
const privacyRequest = { id: 701, type: 'correct', status: 'completed', detail: '合成申请：请更正一条训练记录。', response: '合成回复：已核对需要更正的事项。', createdAt: '2026-11-11' };
function fixture(route, scenario) {
  let definition;
  const guest = scenario.includes('guest'), app = { globalData: { token: guest ? '' : 'synthetic-reader-token', baseUrl: 'https://fixture.invalid', privacyResolvers: [], privacyReferrers: [] } }, storage = new Map(), calls = [];
  const wx = new Proxy({
    setNavigationBarTitle() {}, hideShareMenu() {}, showShareMenu() {}, pageScrollTo() {}, stopPullDownRefresh() {},
    setStorageSync(k,v) { storage.set(k,v); }, getStorageSync(k) { return storage.get(k); }, removeStorageSync(k) { storage.delete(k); },
    getPrivacySetting(options) { options.success({ privacyContractName: '小程序用户隐私保护指引' }); },
    showModal(options) { options.success({ confirm: true }); },
    env: { USER_DATA_PATH: '/tmp' }
  }, { get: (target, key) => target[key] || (() => {}) });
  const request = async (url, method = 'GET', body) => {
    calls.push({ url, method });
    if (scenario === 'loading') return new Promise(() => {});
    if (scenario === 'error' || scenario === 'offline' || scenario === 'editor-error') throw new Error('暂时无法加载，请稍后重试。');
    if (url === '/legal') return copy(bundled);
    if (url === '/me') return { user: { id: 1 } };
    if (url.startsWith('/me/privacy-requests')) {
      if (scenario === 'rights-error') throw new Error('申请记录暂时无法加载，请重试。');
      return { requests: scenario === 'rights-record' ? [copy(privacyRequest)] : [] };
    }
    if (url === '/clubs/99') return { club: { id: 99, name: '合成跑团', staff: scenario !== 'nonstaff' } };
    if (url === '/clubs/99/content/articles/901') return { article: copy(article) };
    if (url.startsWith('/clubs/99/content/articles')) return { articles: scenario === 'editor-empty' ? [] : [copy(article)], total: scenario === 'editor-empty' ? 0 : 1, page: 1, pages: 1 };
    if (url.startsWith('/feedback')) {
      if (url.includes('?')) return { items: scenario === 'empty' ? [] : [copy(feedback)], page: 1, pages: 1, total: scenario === 'empty' ? 0 : 1, unread: 1, summary: { published: 12, adopted: 3 } };
      const item = copy(feedback);
      if (scenario.includes('pending')) Object.assign(item, { status: 'pending', statusLabel: '待审核', isMine: true, canWithdraw: true, publishedAt: '', reply: '', events: [] });
      if (scenario.startsWith('reward')) Object.assign(item, { status: 'adopted', statusLabel: '已采纳', isMine: !scenario.includes('public'), canWithdraw: true, reward: { name: '合成运动礼品', status: scenario === 'reward-shipped' ? 'shipped' : 'unclaimed', statusLabel: scenario === 'reward-shipped' ? '已寄出' : '待领取', carrier: '合成快递', tracking: 'SYNTHETIC123', receiver: '合成收件人', phone: '13800000000', address: '合成地址，仅用于展示验收' } });
      return item;
    }
    throw new Error('Unexpected display fixture URL: ' + url);
  };
  const requestModule = { request, ready: () => Boolean(app.globalData.token), clearAuth() { app.globalData.token = ''; } };
  vm.runInNewContext(fs.readFileSync(path.join(mini, route + '.js'), 'utf8'), {
    Page(value) { definition = value; }, getApp: () => app, wx, console, setTimeout, clearTimeout,
    require(name) {
      if (name === '../../utils/request') return requestModule;
      if (name === '../../utils/legal-documents') return bundled;
      if (name === '../../utils/guide-md') return require('../miniprogram/utils/guide-md');
      throw new Error('Unexpected fixture module ' + name);
    }
  });
  const page = { ...definition, data: copy(definition.data), setData(patch) { for (const [key, value] of Object.entries(copy(patch))) { const parts = key.split('.'); let target = this.data; for (const part of parts.slice(0, -1)) target = target[part]; target[parts.at(-1)] = value; } } };
  return { page, app, calls };
}
const ownCases = [
  ...['base','editor-empty','editor-preview','editor-link','editor-error','editor-saving','nonstaff','guest'].map(scenario => ({ route: 'pages/news/editor', scenario })),
  ...['base','empty','error','loading','guest','mine','compose','compose-error','detail','pending','reward-claim','reward-shipped','reward-public'].map(scenario => ({ route: 'pages/feedback/feedback', scenario })),
  ...['base','terms','collection','sharing','permissions','children','rights-guest','rights-form','rights-record','rights-error','offline','missing'].map(scenario => ({ route: 'pages/legal/legal', scenario })),
  ...['base','pending','error'].map(scenario => ({ route: 'pages/privacy/privacy', scenario }))
];
module.exports = {
  cases: [...newsFixture.cases, ...ownCases],
  async prepare(route, initialData, scenario) {
    if (route === 'pages/news/news' || route === 'pages/news/detail') return newsFixture.prepare(route, initialData, scenario);
    const f = fixture(route, scenario), p = f.page;
    if (route === 'pages/news/editor') {
      p.onLoad({ club: '99' }); p.onShow(); await settle();
      if (['editor-preview','editor-link','editor-saving'].includes(scenario)) { p.setDraft({ ...article, ...(scenario === 'editor-link' ? { rights: 'link', body: '' } : {}) }); p.togglePreview(); }
      if (scenario === 'editor-saving') p.setData({ saving: true });
    } else if (route === 'pages/feedback/feedback') {
      const detail = ['detail','pending','reward-claim','reward-shipped','reward-public'].includes(scenario);
      p.onLoad(detail ? { id: '801' } : scenario === 'mine' ? { mine: '1' } : {}); p.onShow(); await settle();
      if (scenario.startsWith('compose')) { await p.openCompose(); p.inputDraft(event({field:'title'},'【合成展示】集合信息更清楚')); p.inputDraft(event({field:'body'},'用于视觉验收的合成表单内容，实际提交前可以继续修改。')); if (scenario === 'compose-error') p.setData({ actionError: '请补充问题场景后再提交。' }); }
      if (scenario === 'reward-claim') { p.openClaim(); p.inputClaim(event({field:'receiver'},'合成收件人')); p.inputClaim(event({field:'phone'},'13800000000')); p.inputClaim(event({field:'address'},'合成地址，仅用于展示验收')); }
    } else if (route === 'pages/legal/legal') {
      const doc = scenario.startsWith('rights') ? 'rights' : ['base','offline'].includes(scenario) ? 'privacy' : scenario;
      p.onLoad({ doc }); p.onShow(); await settle();
      if (scenario === 'rights-form') { p.onType(event({}, '2')); p.onDetail(event({}, '合成申请：请核对需要更正的一条训练记录。')); }
    } else {
      if (scenario === 'pending') f.app.globalData.privacyResolvers.push(() => {});
      p.onShow();
      if (scenario === 'error') p.setData({ message: '隐私指引暂时无法打开，请稍后重试。' });
    }
    return { data: p.data, components: {}, css: '' };
  },
  async audit(context) {
    const errors = context.route === 'pages/news/news' || context.route === 'pages/news/detail' ? await newsFixture.audit(context) : [];
    const metrics = await context.page.evaluate(() => {
      const visible = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
      const text = [...document.querySelectorAll('body *')].filter(el => visible(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
      const tooSmall = text.filter(el => parseFloat(getComputedStyle(el).fontSize) < 11.9).map(el => ({cls:el.className,text:el.textContent.trim().slice(0,30),size:getComputedStyle(el).fontSize}));
      const expanded = text.filter(el => { const spacing = getComputedStyle(el).letterSpacing; return spacing !== 'normal' && Math.abs(parseFloat(spacing)) > .01; }).map(el => ({cls:el.className,text:el.textContent.trim().slice(0,30),spacing:getComputedStyle(el).letterSpacing}));
      const controls = [...document.querySelectorAll('button,input:not([type=checkbox]):not([type=radio]),textarea,.type-picker,.module-picker,.editor-picker,.editor-filter,.document-nav button,.toc button,.scope-tabs>div,.sort-row>div,.back-link,.privacy-link')].filter(visible).map(el => ({cls:el.className,height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width}));
      return { tooSmall, expanded, smallControls: controls.filter(x => x.height < 43.8 || x.width < 43.8) };
    });
    if (metrics.tooSmall.length) errors.push('Visible text below 12px: ' + JSON.stringify(metrics.tooSmall.slice(0,12)));
    if (metrics.expanded.length) errors.push('Chinese and body text must use normal letter spacing: ' + JSON.stringify(metrics.expanded.slice(0,8)));
    if (metrics.smallControls.length) errors.push('Controls below 44px: ' + JSON.stringify(metrics.smallControls.slice(0,12)));
    return errors;
  }
};
