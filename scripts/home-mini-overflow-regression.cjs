'use strict';
// Current WXML/WXSS in Chromium with isolated Page data. This is not a WeChat device test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { fixture, event, settle } = require('./participation-mini-regression.cjs');
const root = path.resolve(__dirname, '..');
const route = 'pages/races/races';
const scenarios = ['base', 'long-selected', 'native-buttons', 'long-native', 'sdk-buttons', 'long-sdk', 'large-count', 'more', 'time'];
const fullWidthPressure = 'button{width:100%;margin-left:auto;margin-right:auto}';
// Local WeChat WAWebview.js uses wx-button:not([size=mini]) at 184px. The mirror
// maps wx-button to button, preserving the selector's specificity and dimensions.
const sdkButtonDefault = 'button:not([size=mini]){width:184px;margin-left:auto;margin-right:auto}';
const out = path.resolve(root, process.env.HOME_MINI_OVERFLOW_OUT || 'design/previews/home-overflow-regression/mini');
const observations = [];
const race = { city: '北京', raceDate: '2027-03-21', kind: 'road', kindLabels: ['路跑'], distanceLabels: ['全程马拉松'], regStatus: '报名中', deadlineLabel: '11月18日 18:00 截止', open: true, daysLeft: 2 };
const rows = [
  { ...race, id: 'beijing', name: '2027北京马拉松（合成验收）', myStatus: '确认参赛', following: true },
  { ...race, id: 'long', name: '2027环大美兴安岭森林湿地国际山地超级越野挑战赛暨城市半程马拉松（合成验收）', city: '呼和浩特', myStatus: '待抽签', following: false },
  { ...race, id: 'unknown', name: '下一场马拉松（合成验收）', city: '上海', raceDate: '', myStatus: '', following: false, regStatus: '报名未公布', deadlineLabel: '' }
];
const catalog = ['beijing', 'shanghai', 'xiamen'].map((id, index) => ({ id, name: ['北京马拉松', '上海马拉松', '厦门马拉松'][index], worldAthletics: { label: '金标', year: 2026 }, caa: { label: 'A类', year: 2026 }, years: [2026, 2025] }));

async function prepare(_route, _initial, scenario) {
  const f = fixture('races', url => url.startsWith('/races?') ? { races: rows, total: 238, page: 1, pages: 1 } : url === '/race-catalog' ? { races: catalog } : {});
  f.page.paint();
  await f.page.load();
  await f.page.loadCatalog();
  await settle();
  f.page.setData({ statusBarHeight: 47, navHeight: 44, headerRight: 104, todayLabel: '11月16日 星期一' });
  if (['long-selected', 'long-native', 'long-sdk'].includes(scenario)) {
    f.page.paint({ kind: 'trail', city: '新疆维吾尔自治区伊犁哈萨克自治州', month: '2027-12', full: true, status: 'open', meet: 'offline' });
    f.page.setData({ monthLabel: '2027年12月', total: 12345 });
  }
  if (scenario === 'large-count') f.page.setData({ total: 123456789, statusLabel: '报名时间尚未公布' });
  if (scenario === 'more') {
    f.page.openSheet(event({ sheet: 'status' }));
    f.page.setMeet(event({ meet: 'online' }));
  }
  if (scenario === 'time') f.page.openSheet(event({ sheet: 'time' }));
  // 100% is a controlled width-pressure scenario, not a claim about WeChat's default.
  // The separate SDK scenarios reproduce the observed 184px rule and specificity.
  const css = ['native-buttons', 'long-native'].includes(scenario) ? fullWidthPressure : ['sdk-buttons', 'long-sdk'].includes(scenario) ? sdkButtonDefault : '';
  return { data: f.page.data, components: {}, css };
}

async function audit({ page, scenario, width }) {
  const errors = [];
  const expect = (condition, message) => { if (!condition) errors.push(message); };
  const metrics = await page.evaluate(() => {
    const box = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const outside = [...document.querySelectorAll('body *')].map(e => ({ tag: e.tagName, cls: e.className, text: e.textContent.slice(0, 50), ...box(e) })).filter(e => e.width > 0 && (e.right > innerWidth + 1 || e.left < -1));
    const controls = [...document.querySelectorAll('.kind-tab,.filter-more,.filter-chip,.race-plan-link,.race-follow,.clear-filters')].map(e => ({ cls: e.className, ...box(e) }));
    const pseudoOverflow = [];
    for (const e of document.querySelectorAll('body *')) {
      for (const pseudo of ['::before', '::after']) {
        const s = getComputedStyle(e, pseudo);
        if (s.content === 'none' || s.content === 'normal') continue;
        if (parseFloat(s.width) > innerWidth || parseFloat(s.right) < 0 || parseFloat(s.left) < 0) pseudoOverflow.push({ cls: e.className, pseudo, width: s.width, left: s.left, right: s.right, hostOverflow: getComputedStyle(e).overflowX });
      }
    }
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, root: box(document.querySelector('.page')), controls, outside, pseudoOverflow };
  });
  expect(metrics.documentWidth <= width, 'The document must not be wider than the viewport');
  expect(metrics.root.width <= width + 1, 'The page root must fit the viewport');
  expect(metrics.controls.every(e => e.height >= 43.5 && e.width >= 1 && e.left >= -1 && e.right <= width + 1), 'Every filter and race action must fit; clipping overflow must not hide broken controls');
  const kindButtons = metrics.controls.filter(e => e.cls.includes('kind-tab'));
  expect(kindButtons.length === 3 && kindButtons.every(e => e.width < width / 2), 'Category buttons must use their content width under SDK and width-pressure rules');
  expect(await page.locator('.race-name').count() === 3, 'Long-name and empty-date race fixtures must still render');
  await page.evaluate(() => scrollTo(110, 0));
  const pan = await page.evaluate(() => ({ scrollX, rootLeft: document.querySelector('.page').getBoundingClientRect().left, headerRight: document.querySelector('.home-header').getBoundingClientRect().right }));
  expect(pan.scrollX === 0 && Math.abs(pan.rootLeft) < 1 && Math.abs(pan.headerRight - width) < 1, 'A horizontal pan must not shift the entire page away from the native tab bar');
  await page.evaluate(() => scrollTo(0, 250));
  const sticky = await page.locator('.home-navigation').evaluate(e => ({ top: e.getBoundingClientRect().top, position: getComputedStyle(e).position }));
  expect(sticky.position === 'sticky' && Math.abs(sticky.top) < 1, 'The red navigation must keep its sticky position after horizontal containment');
  if (['more', 'time'].includes(scenario)) {
    const drawer = await page.locator('.drop').evaluate(e => {
      const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, viewportHeight: innerHeight };
    });
    expect(drawer.left >= -1 && drawer.right <= width + 1 && drawer.top >= 0 && Math.abs(drawer.bottom - drawer.viewportHeight) < 1, 'The filter drawer must remain visible at the bottom of the viewport');
    if (scenario === 'more') expect(await page.locator('.act.ok').evaluate(e => {
      const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }), 'The filter confirmation must remain visible and clickable');
  }
  if (scenario === 'more' && [320, 390].includes(width)) {
    const originalViewport = page.viewportSize();
    const shortHeight = width === 320 ? 780 : 844;
    await page.setViewportSize({ width, height: shortHeight });
    // Fitting the page must not hide the drawer's confirmation under either
    // the actual SDK selector or the separate full-width pressure scenario.
    for (const [name, css] of [['native-drawer', fullWidthPressure], ['sdk-drawer', sdkButtonDefault]]) {
      const nativeStyle = await page.addStyleTag({ content: css });
      const drawerControls = await page.locator('.drop button').evaluateAll(elements => elements.map(e => {
        const r = e.getBoundingClientRect();
        return { label: e.getAttribute('aria-label') || e.textContent.trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height, clickable: e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
      }));
      expect(drawerControls.every(e => e.left >= -1 && e.right <= width + 1 && e.top >= 0 && e.bottom <= shortHeight + 1 && e.height >= 43.5 && e.clickable), 'Every ' + name + ' button must remain visible and clickable at ' + width + 'x' + shortHeight);
      const shortName = name + '-' + width + 'x' + shortHeight + '.png';
      await page.screenshot({ path: path.join(out, shortName) });
      observations.push({ scenario: name + '-short-height', width, height: shortHeight, controls: drawerControls, errors: errors.slice() });
      await nativeStyle.evaluate(element => element.remove());
    }
    await page.setViewportSize(originalViewport);
  }
  await page.evaluate(() => scrollTo(0, 0));
  observations.push({ scenario, width, ...metrics, pan, sticky, errors });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'overflow-metrics.json'), JSON.stringify({ kind: 'Browser source mirror; not a native WeChat runtime or device', passed: observations.every(row => !row.errors.length), observations }, null, 2));
  return errors;
}

module.exports = { cases: scenarios.map(scenario => ({ route, scenario })), prepare, audit };
if (require.main === module) {
  Object.assign(process.env, { MINI_AUDIT_FIXTURE: __filename, MINI_AUDIT_ROUTES: route, UI_AUDIT_OUT: out, UI_AUDIT_REPORT: path.join(out, 'report.json') });
  // Reuse the repository's WXML renderer and asset resolver, adding the affected
  // 402px iPhone width to its normal 320/390 sweep without modifying that harness.
  const renderer = path.join(root, 'design/previews/mini-ui-source-audit.cjs');
  const source = fs.readFileSync(renderer, 'utf8');
  const widths = 'for(const width of[320,390])';
  assert.ok(source.includes(widths), 'The mirror runner must still expose its viewport sweep');
  const instance = new Module(renderer, module);
  instance.filename = renderer;
  instance.paths = Module._nodeModulePaths(path.dirname(renderer));
  instance._compile(source.replace(widths, 'for(const width of[320,390,402])'), renderer);
}
