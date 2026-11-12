/* Current news Page behavior, rendered by the shared WXML/WXSS source mirror.
 * Synthetic rows; native button width modeled in the browser, not a device test. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..'), clone = value => JSON.parse(JSON.stringify(value));
const tick = async () => { await Promise.resolve(); await new Promise(resolve => setImmediate(resolve)); };
function fixture(unavailable = false) {
  let definition;
  const calls = [], helper = { exports: {} }, app = { globalData: { token: '' } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/utils/content.js'), 'utf8'), { module: helper, wx: {} });
  const request = async url => {
    calls.push(url); if (unavailable) throw Error('Isolated fixture unavailable');
    const gender = new URL(url, 'https://fixture.invalid').searchParams.get('gender');
    const profiles = Array.from({ length: 6 }, (_, i) => ({ id: 'synthetic-' + gender + '-' + i, type: 'athlete', name: (gender === 'women' ? '女子跑者' : '男子跑者') + (i + 1), gender, seasonRank: i + 1, seasonYear: 2026, seasonBest: gender === 'women' ? '2:21:15' : '2:05:58', seasonEventName: '2026赛季马拉松成绩记录' }));
    return { profiles, page: 1, pages: 1, total: profiles.length, meta: { seasonYear: 2026 } };
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/pages/news/news.js'), 'utf8'), { Page(value) { definition = value; }, getApp: () => app, wx: { setNavigationBarTitle() {} }, URL, Date, require(name) { if (name === '../../utils/request') return { request }; if (name === '../../utils/content') return helper.exports; throw Error(name); } });
  const page = { ...definition, data: clone(definition.data), setData(patch) { Object.assign(this.data, clone(patch)); } };
  return { page, calls };
}
module.exports = {
  cases: ['men', 'women', 'unavailable'].map(scenario => ({ route: 'pages/news/news', scenario })),
  async prepare(route, initial, scenario) {
    const f = fixture(scenario === 'unavailable'), p = f.page; p.onLoad({ tab: 'athlete' }); p.onShow(); await tick();
    if (scenario !== 'unavailable') {
      assert.equal(p.data.rows[0].gender, 'men'); p.setGender({ currentTarget: { dataset: { gender: 'women' } } }); await tick(); assert.equal(p.data.rows[0].gender, 'women'); assert.match(f.calls.at(-1), /gender=women/);
      p.setGender({ currentTarget: { dataset: { gender: scenario } } }); await tick(); assert.equal(p.data.rows[0].gender, scenario);
    } else assert.equal(p.data.rows.length, 0);
    const data = clone(p.data); p.onUnload();
    // Lower-specificity native width preserves the actual source selectors and
    // catches buttons which implicitly retain native full-width sizing in flex.
    return { data, components: {}, css: 'button{width:calc(100% - 32px)}' };
  },
  async audit({ page, scenario, metrics }) {
    const errors = [], layout = await page.evaluate(() => {
      const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
      return { viewport: innerWidth, container: rect(document.querySelector('.gender-tabs')), buttons: [...document.querySelectorAll('.gender-tabs button')].map(rect), season: rect(document.querySelector('.athlete-season')), seasonInsideTabs: !!document.querySelector('.gender-tabs .athlete-season') };
    });
    metrics.genderLayout = layout; metrics.nativeButtonDefault = 'width:calc(100% - 32px)';
    if (layout.buttons.length !== 2 || layout.seasonInsideTabs) errors.push('Gender row contains exactly two buttons and season is separate');
    if (layout.buttons.some(b => b.left < layout.container.left - 1 || b.right > layout.container.right + 1 || b.height < 44)) errors.push('Gender buttons must fit within the row and retain 44px tap height');
    if (Math.abs(layout.buttons[0].width - layout.buttons[1].width) > 1 || Math.abs(layout.buttons[0].top - layout.buttons[1].top) > 1) errors.push('Gender buttons must share equal width on one line');
    if (layout.season.bottom > layout.container.top + 1) errors.push('Season label must have its own row above gender buttons');
    if (scenario !== 'unavailable' && await page.locator('.gender-tabs button.on').innerText() !== (scenario === 'women' ? '女子' : '男子')) errors.push('Selected gender state is incorrect');
    return errors;
  }
};
