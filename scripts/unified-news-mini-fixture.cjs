/* Synthetic content fixtures executed through the current mini Page methods.
 * These snapshots mirror WXML/WXSS in Chromium; they are not WeChat screenshots. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const helper = require('../miniprogram/utils/content');
const guide = require('../miniprogram/utils/guide-md');
const clone = value => JSON.parse(JSON.stringify(value));
const fixtures = {
  articles: [
    { id: 9001, category: 'industry', title: '【合成展示】从一场比赛，认识马拉松赛道上的坚持', summary: '这是用于版式验收的合成资讯，不是实际报道。', source: '合成展示编辑部', publishedAt: '2026-11-11', featured: true, body: '## 一起认识跑圈\n这是一段合成正文，用于检查标题、段落和来源入口的排版。' },
    { id: 9002, category: 'club', title: '【合成展示】这个周末，和跑友一起出发', summary: '训练与赛事回顾的版式示例。', source: '合成跑团', publishedAt: '2026-11-10', body: '一段合成跑团资讯。' }
  ],
  athletes: gender => Array.from({ length: 20 }, (_, i) => ({ id: 'synthetic-' + gender + '-' + (i + 1), type: 'athlete', rank: i + 1, name: (gender === 'women' ? '女子跑者' : '男子跑者') + String(i + 1).padStart(2, '0'), gender, personalBest: gender === 'women' ? '2:23:10' : '2:08:15', eventName: '合成马拉松', eventDate: '2026-10-18', birthDate: '1998-01-01', bio: '用于检查人物档案排版的合成履历，不是真实运动员。', sources: [{ title: '合成来源入口', url: 'https://example.invalid/athlete' }], careerHighlights: [{ date: '2026-10-18', title: '合成马拉松', position: 1, result: '2:08:15', sourceUrl: 'https://example.invalid/results' }] })),
  pacers: Array.from({ length: 6 }, (_, i) => ({ id: 'synthetic-pacer-' + (i + 1), type: 'pacer', name: '私兔跑者' + String(i + 1).padStart(2, '0'), role: '合成带跑资料', personalBestDisplay: i === 1 ? '约2小时52分' : '', personalBest: i === 1 ? '' : '2:35:20', bio: '仅用于版式验收，不表示真实服务经历或排名。', pacingEvidence: [{ date: '2026-10', event: '合成马拉松', description: '合成带跑经历，用于检查版式。', url: 'https://example.invalid/evidence' }], sources: [{ title: '合成来源入口', url: 'https://example.invalid/pacer' }] }))
};
const meta = { asOf: '2026-11-11', rankingNotice: '按合成的中国籍全马历史个人最佳快照展示，包含历代选手，非现役实力排名。' };
const pacerMeta = { rankingNotice: '按公开带跑经历收录，顺序不代表全国排名；此处均为版式验收合成人物。' };
function createPage(pageName, scenario) {
  let definition, unavailable = false;
  const requests = [];
  const wx = { setNavigationBarTitle() {}, stopPullDownRefresh() {} };
  const request = url => {
    requests.push(url);
    if (unavailable) return Promise.reject(new Error('此功能暂不可用（HTTP 404），请联系管理员确认服务已更新。'));
    const parsed = new URL(url, 'https://fixture.invalid');
    if (parsed.pathname === '/content/profiles') {
      const pacer = parsed.searchParams.get('type') === 'pacer';
      const rows = pacer ? fixtures.pacers : fixtures.athletes(parsed.searchParams.get('gender') || 'men');
      return Promise.resolve({ profiles: clone(rows), page: 1, pages: 1, total: rows.length, meta: clone(pacer ? pacerMeta : meta) });
    }
    if (parsed.pathname.startsWith('/content/profiles/')) {
      const profile = scenario.includes('pacer') ? fixtures.pacers[1] : fixtures.athletes('women')[0];
      return Promise.resolve({ profile: clone(profile), meta: clone(profile.type === 'pacer' ? pacerMeta : meta) });
    }
    if (parsed.pathname === '/content/articles') return Promise.resolve({ articles: clone(fixtures.articles), page: 1, pages: 1, total: fixtures.articles.length });
    if (parsed.pathname.startsWith('/content/articles/')) return Promise.resolve({ article: clone(fixtures.articles[0]) });
    return Promise.reject(new Error('Unexpected synthetic fixture request ' + url));
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/pages/news', pageName + '.js'), 'utf8'), {
    Page(value) { definition = value; }, getApp: () => ({ globalData: { token: 'synthetic-token' } }), wx,
    require(name) {
      if (name === '../../utils/request') return { request };
      if (name === '../../utils/content') return helper;
      if (name === '../../utils/guide-md') return guide;
      throw new Error('Unexpected dependency ' + name);
    }
  }, { filename: 'pages/news/' + pageName + '.js' });
  const page = { ...definition, data: clone(definition.data), setData(patch) { Object.assign(this.data, clone(patch)); } };
  return { page, requests, fail() { unavailable = true; } };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await new Promise(resolve => setImmediate(resolve)); };
module.exports = {
  cases: [
    ...['base', 'athlete-men', 'athlete-women', 'pacer', 'unavailable'].map(scenario => ({ route: 'pages/news/news', scenario })),
    ...['base', 'athlete-detail', 'pacer-detail', 'unavailable-detail'].map(scenario => ({ route: 'pages/news/detail', scenario }))
  ],
  async prepare(route, initialData, scenario) {
    const pageName = route.endsWith('/detail') ? 'detail' : 'news';
    const f = createPage(pageName, scenario), page = f.page;
    if (pageName === 'news') {
      const tab = scenario.startsWith('athlete') || scenario === 'unavailable' ? 'athlete' : scenario === 'pacer' ? 'pacer' : 'all';
      page.onLoad({ tab }); page.onShow(); await settle();
      if (scenario === 'athlete-women') { page.setGender({ currentTarget: { dataset: { gender: 'women' } } }); await settle(); }
      if (scenario === 'unavailable') { f.fail(); await page.load(); }
    } else {
      page.onLoad({ id: 'synthetic-detail', type: scenario.includes('athlete') || scenario.includes('pacer') ? 'profile' : 'article' }); await settle();
      if (scenario === 'unavailable-detail') { f.fail(); await page.load(); }
    }
    return { data: page.data, components: {}, css: '' };
  },
  async audit({ page, route, scenario }) {
    const metrics = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('.journal-search button,.gender-tabs button,.journal-state button,.journal-shortcuts button')].map(el => ({ cls: el.className, height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width }));
      const first = document.querySelector('.journal-row'), filter = document.querySelector('.gender-tabs');
      return { firstRowBottom: first?.getBoundingClientRect().bottom, controls, filterCenters: filter ? [...filter.children].map(el => { const r = el.getBoundingClientRect(); return r.y + r.height / 2; }) : [], hasPromo: !!document.querySelector('.journal-features,.journal-footer'), text: document.body.innerText, noteCount: document.querySelectorAll('.ranking-note').length, countCount: document.querySelectorAll('.section-caption>span:nth-child(2)').length, state: document.querySelector('.journal-state')?.innerText };
    });
    const errors = [];
    if (metrics.hasPromo) errors.push('Oversized promotional content must not return');
    if (route.endsWith('/news') && !scenario.includes('unavailable') && !(metrics.firstRowBottom < 700)) errors.push('First actual content must appear within the opening screen: ' + metrics.firstRowBottom);
    if (metrics.controls.some(x => x.height < 43.9 || x.width < 43.9)) errors.push('Interactive controls must provide at least 44px targets: ' + JSON.stringify(metrics.controls));
    if (metrics.filterCenters.length && Math.max(...metrics.filterCenters) - Math.min(...metrics.filterCenters) > 3) errors.push('Male/female controls and PB label must remain on one row');
    if (scenario.includes('unavailable')) {
      if (/HTTP|404|管理员|0 位|Cannot GET/.test(metrics.text)) errors.push('Do not expose technical failures or misleading zero counts');
      if (!metrics.state?.includes('重新加载')) errors.push('Unavailable content needs a visible retry');
      if (metrics.noteCount || metrics.countCount) errors.push('Unavailable content must hide old ranking notes and counts');
    }
    return errors;
  }
};
