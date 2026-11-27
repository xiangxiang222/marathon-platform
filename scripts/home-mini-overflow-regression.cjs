'use strict';
// Current WXML/WXSS in Chromium with isolated Page data. This is not a WeChat device test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { fixture, event, settle } = require('./participation-mini-regression.cjs');
const root = path.resolve(__dirname, '..');
const route = 'pages/races/races';
const scenarios = ['base', 'long-selected', 'native-buttons', 'long-native', 'sdk-buttons', 'long-sdk', 'large-count', 'keyword', 'retry', 'more', 'city', 'time', 'one-reminder'];
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
const notices = [
  { race: rows[0], hit: { key: 'deadline', reason: '今日报名截止' } },
  { race: rows[1], hit: { key: 'bib', reason: '号码公布' } }
];

async function checkHomeBehavior() {
  const failures = [];
  const check = async (label, action) => {
    try { await action(); }
    catch (error) { failures.push(label + ': ' + error.message); }
  };
  const f = fixture('races', url => {
    if (url === '/reminders') return { mine: [notices[1]], reminders: notices };
    if (url.startsWith('/races?')) return { races: rows, total: rows.length, page: Number(new URLSearchParams(url.split('?')[1]).get('page')), pages: 2 };
    if (url === '/race-catalog') return { races: catalog };
    throw Error('Fixture has no reply for ' + url);
  });
  const setData = f.page.setData;
  f.page.setData = (patch, done) => { setData.call(f.page, patch); if (done) done(); };
  f.page.onShow();
  await settle();
  assert.equal(f.page.data.races.length, rows.length, 'home fixtures loaded');
  assert.ok(f.requests.some(call => call.url === '/reminders'), 'reminders API fixture was requested');
  await check('Personal reminders precede general reminders, with duplicate events merged', () => {
    assert.equal(f.page.data.reminders.map(item => item.race.id).join(','), 'long,beijing');
  });
  const callsBefore = f.requests.filter(call => call.url === '/reminders').length;
  await check('Selecting another reminder and wrapping around sends no request', () => {
    assert.equal(typeof f.page.nextReminder, 'function', 'manual reminder rotation is missing');
    f.page.nextReminder();
    assert.equal(f.page.data.reminderIndex, 1);
    f.page.nextReminder();
    assert.equal(f.page.data.reminderIndex, 0);
  });
  await check('Result summary follows submitted filters, across draft edits and pagination', async () => {
    f.page.paint({ city: '北京', kind: 'road', month: '2027-03', status: 'open' });
    await f.page.submitFind();
    assert.match(f.requests.at(-1).url, /status=open.*kind=road.*month=2027-03/);
    assert.equal(f.page.data.resultSummary, '路跑 · 北京 · 2027年3月');
    f.page.pickCity(event({ name: '上海' }));
    await f.page.nextPage();
    assert.match(f.requests.at(-1).url, /city=%E5%8C%97%E4%BA%AC.*page=2$/);
    assert.equal(f.page.data.resultSummary, '路跑 · 北京 · 2027年3月');
  });
  await check('Keyword summary tracks the submitted word without draft filters', async () => {
    f.page.switchMode(event({ mode: 'keyword' }));
    f.page.onQ(event({}, '  北京马拉松  '));
    await f.page.submitFind();
    f.page.onQ(event({}, '上海马拉松'));
    assert.equal(f.page.data.resultSummary, '北京马拉松');
    assert.equal(f.page.data.city, '上海');
  });
  await check('Working with results does not reload reminders', () => {
    assert.equal(f.requests.filter(call => call.url === '/reminders').length, callsBefore, 'only home entry requested reminders');
  });
  await check('Turning pages scrolls back to results', () => {
    assert.equal(f.scrolls.filter(item => item.selector === '#race-results').length, 3, 'first filters, then pagination, then keyword');
  });
  await check('A late reminder from the previous account stays hidden and cannot replace the current selection', async () => {
    let release;
    const firstReply = new Promise(resolve => { release = resolve; });
    let count = 0;
    const account = fixture('races', url => url === '/reminders' ? ++count === 1 ? firstReply : { reminders: [notices[0]] } : { races: rows, total: rows.length });
    account.page.setData({ reminders: [notices[1]] });
    account.page.onShow();
    await settle();
    account.page.onHide();
    account.app.globalData.token = 'runner-b';
    account.page.onShow();
    assert.equal(account.page.data.reminders.length, 0);
    await settle();
    release({ mine: [notices[1]] });
    await settle();
    assert.equal(account.page.data.reminders.map(item => item.race.id).join(','), 'beijing');
  });
  await check('Reminder and archive shortcuts use the existing destinations', () => {
    const markup = fs.readFileSync(path.join(root, 'miniprogram', route + '.wxml'), 'utf8');
    assert.match(markup, /class="results-archive" url="\/pages\/race-catalog\/race-catalog"/);
    assert.match(markup, /class="reminder-item" url="\/pages\/race\/race\?id=\{\{reminders\[reminderIndex\]\.race\.id\}\}"/);
  });
  assert.deepEqual(failures, []);
  console.log('Mini home behavior passed: reminder order, manual navigation and committed result summaries.');
}

async function prepare(_route, _initial, scenario) {
  const f = fixture('races', url => {
    if (url.startsWith('/races?')) {
      const params = new URLSearchParams(url.split('?')[1]);
      if (scenario === 'retry' && params.has('q')) throw Error('赛事暂时无法加载，请稍后重试');
      return { races: rows, total: 238, page: 1, pages: ['base', 'sdk-buttons'].includes(scenario) ? 12 : 1 };
    }
    if (url === '/reminders') return { reminders: scenario === 'one-reminder' ? notices.slice(0, 1) : notices };
    return url === '/race-catalog' ? { races: catalog } : {};
  });
  f.page.onShow();
  await f.page.load();
  await f.page.loadCatalog();
  await settle();
  f.page.setData({ statusBarHeight: 47, navHeight: 44, headerRight: 104, todayLabel: '11月16日 星期一' });
  if (['long-selected', 'long-native', 'long-sdk'].includes(scenario)) {
    f.page.paint({ kind: 'trail', city: '新疆维吾尔自治区伊犁哈萨克自治州', month: '2027-12', distance: 'full', status: 'open', meet: 'offline' });
    f.page.setData({ monthLabel: '2027年12月', total: 12345 });
  }
  if (scenario === 'large-count') f.page.setData({ total: 123456789, resultStatusLabel: '报名时间尚未公布' });
  if (['keyword', 'retry'].includes(scenario)) {
    f.page.switchMode(event({ mode: 'keyword' }));
    f.page.onQ(event({}, '环大美兴安岭森林湿地国际山地超级越野挑战赛'));
    await f.page.submitFind();
  }
  if (scenario === 'more') {
    await f.page.setMeet(event({ meet: 'online' }));
    f.page.openSheet(event({ sheet: 'status' }));
  }
  if (scenario === 'time') { f.page.openSheet(event({ sheet: 'time' })); f.page.pickYear(event({year:2027})); }
  if (scenario === 'city') { f.page.openSheet(event({ sheet: 'city' })); f.page.pickProvince(event({name:'贵州'})); }
  // 100% is a controlled width-pressure scenario, not a claim about WeChat's default.
  // The separate SDK scenarios reproduce the observed 184px rule and specificity.
  const pressure = ['native-buttons', 'long-native'].includes(scenario) ? fullWidthPressure : ['sdk-buttons', 'long-sdk', 'keyword', 'retry'].includes(scenario) ? sdkButtonDefault : '';
  return { data: f.page.data, components: {}, css: pressure };
}

async function audit({ page, scenario, width }) {
  const errors = [];
  const expect = (condition, message) => { if (!condition) errors.push(message); };
  const metrics = await page.evaluate(() => {
    const box = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const outside = [...document.querySelectorAll('body *')].map(e => ({ tag: e.tagName, cls: e.className, text: e.textContent.slice(0, 50), ...box(e) })).filter(e => e.width > 0 && (e.right > innerWidth + 1 || e.left < -1));
    const controls = [...document.querySelectorAll('.find-card button,.quick-entry,.reminder-next,.results-archive,.race-plan-link,.race-follow,.pager button,.retry')].map(e => ({ cls: e.className, ...box(e) }));
    const pseudoOverflow = [];
    for (const e of document.querySelectorAll('body *')) {
      for (const pseudo of ['::before', '::after']) {
        const s = getComputedStyle(e, pseudo);
        if (s.content === 'none' || s.content === 'normal') continue;
        if (parseFloat(s.width) > innerWidth || parseFloat(s.right) < 0 || parseFloat(s.left) < 0) pseudoOverflow.push({ cls: e.className, pseudo, width: s.width, left: s.left, right: s.right, hostOverflow: getComputedStyle(e).overflowX });
      }
    }
    const cta = document.querySelector('.find-submit');
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, root: box(document.querySelector('.page')), modes: box(document.querySelector('.find-modes')), cta: box(cta), controls, outside, pseudoOverflow };
  });
  expect(metrics.documentWidth <= width, 'The document must not be wider than the viewport');
  expect(metrics.root.width <= width + 1, 'The page root must fit the viewport');
  expect(metrics.controls.every(e => e.height >= 43.5 && e.width >= 44 && e.left >= -1 && e.right <= width + 1), 'Every finder and race action must fit; clipping overflow must not hide broken controls');
  expect(Math.abs(metrics.cta.width - metrics.modes.width) < 1, 'The primary button spans the full width even under SDK button defaults');
  const kindButtons = metrics.controls.filter(e => e.cls.includes('kind-tab'));
  const keyword = ['keyword', 'retry'].includes(scenario);
  if (keyword) {
    expect((await page.locator('.result-summary').allTextContents())[0] === '环大美兴安岭森林湿地国际山地超级越野挑战赛', 'Search results show the submitted keyword');
    expect(await page.locator('.quick-entries,.reminder,.results-archive,.home-discover,.home-race-catalog').count() === 0, 'Search keeps focus on results');
  } else {
    const order = await page.locator('.quick-entries,.reminder,.results,.home-discover,.home-race-catalog').evaluateAll(nodes => nodes.map(node => node.className));
    expect(order.join(',') === 'quick-entries,reminder,results,home-discover,home-race-catalog', 'Show the shortcuts and actual reminder before races, and optional discovery and archive after the results');
    expect(await page.locator('.reminder-next').count() === (scenario === 'one-reminder' ? 0 : 1), 'Only multiple reminders receive the next button');
    expect(await page.locator('.reminder-item').count() === 1, 'A single active reminder links directly to race details');
    expect(await page.locator('.results-head .results-archive').count() === 1, 'Archive directory is available without scrolling past the list');
    expect(!(await page.locator('.home-discover').textContent()).includes(rows[0].name), 'The calendar shortcut is not populated from the filtered race list');
  }
  if (['base', 'sdk-buttons'].includes(scenario)) {
    expect(await page.locator('.pager button').count() === 12, 'The numeric pagination and both ends remain available');
    expect(await page.locator('.pager button[disabled]').count() === 1, 'The previous button is disabled on the first page');
  }
  expect(kindButtons.length === (keyword ? 0 : 3) && kindButtons.every(e => e.width < width / 2), 'Category buttons must use their content width under SDK and width-pressure rules');
  expect(await page.locator('.race-name').count() === (scenario === 'retry' ? 0 : 3), 'Long-name and empty-date race fixtures must still render after a successful request');
  if (scenario !== 'retry') expect(await page.locator('.race-name').nth(1).evaluate(e => e.scrollWidth <= e.clientWidth && e.clientHeight > 25), 'The long race name must wrap inside its card');
  if (!['more', 'city', 'time'].includes(scenario)) {
    const target = page.locator(scenario === 'retry' ? '.retry' : '.find-submit');
    await target.scrollIntoViewIfNeeded();
    expect(await target.evaluate(e => {
      const r = e.getBoundingClientRect();
      return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }), 'The primary or retry button must be reachable');
  }
  await page.evaluate(() => scrollTo(110, 0));
  const pan = await page.evaluate(() => ({ scrollX, rootLeft: document.querySelector('.page').getBoundingClientRect().left, headerRight: document.querySelector('.home-header').getBoundingClientRect().right }));
  expect(pan.scrollX === 0 && Math.abs(pan.rootLeft) < 1 && Math.abs(pan.headerRight - width) < 1, 'A horizontal pan must not shift the entire page away from the native tab bar');
  await page.evaluate(() => scrollTo(0, 250));
  const sticky = await page.locator('.home-navigation').evaluate(e => ({ top: e.getBoundingClientRect().top, position: getComputedStyle(e).position }));
  expect(sticky.position === 'sticky' && Math.abs(sticky.top) < 1, 'Navigation must keep its sticky position after horizontal containment');
  if (['more', 'city', 'time'].includes(scenario)) {
    const drawer = await page.locator('.drop').evaluate(e => {
      const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, viewportHeight: innerHeight };
    });
    expect(drawer.left >= -1 && drawer.right <= width + 1 && drawer.top >= 0 && Math.abs(drawer.bottom - drawer.viewportHeight) < 1, 'The filter drawer must remain visible at the bottom of the viewport');
    expect(await page.locator('.drop .find-submit').count() === 0, 'The drawer must leave submission to the finder card');
    const options = page.locator('.drop button');
    for (let index = 0; index < await options.count(); index++) {
      const option = options.nth(index); await option.scrollIntoViewIfNeeded();
      const target = await option.evaluate(e => {
        const r=e.getBoundingClientRect();return {label:e.textContent.trim(),left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
      });
      expect(target.left>=-1 && target.right<=width+1 && target.top>=0 && target.bottom<=page.viewportSize().height+1 && target.height>=43.5 && target.width>=43.5 && target.hit, 'Drawer option must remain reachable with a 44px target: '+JSON.stringify(target));
    }
    if(scenario==='time')expect(await page.locator('.month-grid button').count()===12,'The time drawer exposes all twelve months for the selected year');
    if(scenario==='city')expect(await page.locator('.panel-menu button').count()>=30,'Complete province navigation remains available');
  }
  if (scenario === 'more' && [320, 390].includes(width)) {
    const originalViewport = page.viewportSize();
    const shortHeight = width === 320 ? 780 : 844;
    await page.setViewportSize({ width, height: shortHeight });
    // Every choice must remain reachable under both the actual
    // SDK selector and the separate full-width pressure scenario.
    for (const [name, css] of [['native-drawer', fullWidthPressure], ['sdk-drawer', sdkButtonDefault]]) {
      const nativeStyle = await page.addStyleTag({ content: css });
      const drawerControls = [];
      const buttons = page.locator('.drop button');
      for (let index=0;index<await buttons.count();index++) {
        const button=buttons.nth(index);await button.scrollIntoViewIfNeeded();
        drawerControls.push(await button.evaluate(e=>{
          const r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label')||e.textContent.trim(),left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,clickable:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
        }));
      }
      expect(drawerControls.every(e=>e.left>=-1&&e.right<=width+1&&e.top>=0&&e.bottom<=shortHeight+1&&e.height>=43.5&&e.width>=43.5&&e.clickable),'Every '+name+' option must remain reachable with a 44px target at '+width+'x'+shortHeight+': '+JSON.stringify(drawerControls.filter(e=>!e.clickable||e.bottom>shortHeight+1)));
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

module.exports = { cases: scenarios.map(scenario => ({ route, scenario })), prepare, audit, checkHomeBehavior };
if (require.main === module) {
  checkHomeBehavior().catch(error => { console.error(error); process.exitCode = 1; });
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
