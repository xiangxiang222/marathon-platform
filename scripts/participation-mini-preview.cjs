'use strict';
// Current Page methods and WXML/WXSS with explicit synthetic transport fixtures.
const path = require('node:path');
const { spawn } = require('node:child_process');
const { fixture, race, event, settle } = require('./participation-mini-regression.cjs');
const { inspectUiPalette } = require('./ui-palette-metrics.cjs');
const root = path.resolve(__dirname, '..');
const cases = [
  ...['wish', 'signup', 'confirmed', 'finished', 'private', 'guest', 'error', 'native-buttons'].map(scenario => ({ route: 'pages/race/race', scenario })),
  { route: 'pages/races/races', scenario: 'following-list' },
  { route: 'pages/mine/mine', scenario: 'following-hub' },
  { route: 'pages/calendar/calendar', scenario: 'personal-calendar' }
];
async function prepare(route, initial, scenario) {
  const name = route.split('/').at(-1), f = fixture(name);
  if (name === 'race') {
    f.state.status = scenario === 'finished' ? '完赛' : scenario === 'wish' ? '想跑' : scenario === 'signup' ? '待抽签' : '确认参赛';
    f.state.following = scenario !== 'guest';
    f.state.sharedClubIds = scenario === 'private' || scenario === 'guest' ? [] : [7];
    f.state.note = '想找跑友拼车，赛后一起合影';
    f.page.onLoad({ id: race.id, plan: '1' }); await f.page.load();
    f.page.toggleCompanion();
    if (scenario === 'guest') { f.app.globalData.token = ''; await f.page.load(); f.page.setData({ ready: false, clubs: [], sharedClubIds: [], myStatus: '', following: false }); }
    if (scenario === 'error') f.page.setData({ message: '状态保存失败，请稍后重试。' });
  } else if (name === 'races') {
    f.state.status = '中签'; f.state.following = true; await f.page.load(); await settle();
    f.page.setData({ catalogLoaded: true, catalogLoading: false, catalogRaces: [], statusBarHeight: 20, navHeight: 44, headerRight: 108, todayLabel: '11月16日 周一' });
  } else if (name === 'mine') {
    f.state.status = '确认参赛'; f.state.following = true; await f.page.load(); await settle();
    f.page.setData({ mainTab: 'plans', nickname: '合成跑者' });
  } else {
    f.page.year = 2027; f.page.month = 3; f.page.picked = race.raceDate;
    f.page.setData({ year: 2027, month: 3 }); f.page.paint([{ ...race, following: true, myStatus: '确认参赛' }]);
  }
  return { data: f.page.data, components: {}, css: scenario === 'native-buttons' ? 'button{width:100%;margin-left:auto;margin-right:auto}' : '' };
}
async function audit({ page, route, scenario, width }) {
  const errors = [], text = await page.locator('body').innerText();
  const hero = { race: '.race-hero', races: '.home-search-area', calendar: '.calendar-scene' }[route.split('/').at(-1)];
  if (hero) {
    const { activityHero } = await page.evaluate(inspectUiPalette, hero);
    if (!activityHero?.brightReadableSurface) errors.push('Bright lavender with readable dark text required: ' + JSON.stringify(activityHero));
  }
  if (route === 'pages/race/race') {
    if (scenario !== 'guest') {
      if (await page.locator('.plan-stages .stage').count() !== 4) errors.push('Four participation stages must remain available');
      if (await page.locator('.plan-statuses button').count() > 4) errors.push('Only the active stage actions may appear');
      if (!text.includes('不会替你报名团内活动') || !text.includes('仅自己可见')) errors.push('Sharing and private proof boundaries must remain visible');
      const stages = await page.locator('.stage').evaluateAll(items => items.map(item => { const box = item.getBoundingClientRect(); return { width: box.width, height: box.height, left: box.left, right: box.right }; }));
      if (stages.some(box => box.width < 44 || box.height < 44 || box.right > width || box.left < 0)) errors.push('Stage targets must stay usable and in bounds');
    } else if (!text.includes('登录后标记')) errors.push('Guest must retain login path');
    if (scenario === 'error' && !text.includes('状态保存失败')) errors.push('Save errors must stay readable');
  }
  if (route === 'pages/races/races' && (!text.includes('已关注') || !(await page.locator('.race-personal .my-state').allTextContents()).some(value => value.trim() === '中签'))) errors.push('List must show independent follow and personal status');
  if (route === 'pages/mine/mine' && (!text.includes('关注的比赛') || !text.includes('我的参赛计划'))) errors.push('Personal hub must separate follows from plans');
  if (route === 'pages/calendar/calendar' && (!text.includes('已关注') || !text.includes('我 · 确认参赛'))) errors.push('Calendar must retain personal status');
  return errors;
}
module.exports = { cases, prepare, audit };
if (require.main === module) {
  const child = spawn(process.execPath, ['design/previews/mini-ui-source-audit.cjs'], { cwd: root, env: { ...process.env, MINI_AUDIT_FIXTURE: 'scripts/participation-mini-preview.cjs', MINI_AUDIT_ROUTES: [...new Set(cases.map(item => item.route))].join(','), UI_AUDIT_OUT: process.env.PARTICIPATION_MINI_OUT || 'design/previews/participation-20261116/mini', UI_AUDIT_REPORT: process.env.PARTICIPATION_MINI_REPORT || 'design/previews/participation-20261116/mini/report.json' }, stdio: 'inherit' });
  child.on('error', error => { console.error(error); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code || 0; });
}
