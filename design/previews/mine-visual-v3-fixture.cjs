/* Synthetic presentation data for the current Mine WXML source mirror. */
const route = 'pages/mine/mine';
const careerRoute = 'pages/runner/runner';
const cases = [...['base', 'guest', 'settings', 'results', 'profile'].map(scenario => ({ route, scenario })), { route: careerRoute, scenario: 'career-summary' }];
function prepare(_route, data, scenario) {
  data = JSON.parse(JSON.stringify(data));
  if (_route === careerRoute) {
    data.view = 'career';
    data.currentView = { title: '赛事生涯' };
    data.payload.asOf = '2026-11-27';
    Object.assign(data.payload.career, { finished: 2, raceYears: 2, kmLabel: '63.29', totalTime: '5:04:36', byDistance: [{ key: 'full', label: '全马', count: 1 }, { key: 'half', label: '半马', count: 1 }] });
    data.posterAvailable = true;
    data.filteredResults = [{ key: 'full', day: '10.18', year: '2026', clock: '3:28:16', pb: true, distanceLabel: '全程马拉松', race: { id: 'sample-full', name: '城市马拉松', city: '杭州' } }, { key: 'half', day: '09.20', year: '2025', clock: '1:36:20', pb: true, distanceLabel: '半程马拉松', race: { id: 'sample-half', name: '湖畔半程马拉松', city: '南京' } }];
    data.payload.results = data.filteredResults;
    return { data, components: {}, css: '' };
  }
  data.nickname = '参加城市马拉松与周末跑团训练的跑者';
  data.leader = false;
  data.posterAvailable = true;
  data.career = { finished: 12, provinces: ['浙江', '江苏'], cities: ['杭州', '南京', '上海'], pb: { full: '3:28:16', half: '1:36:20' }, yearKm: 168.7 };
  data.runner.career.pb = [
    { distance: 'full', distanceLabel: '全马最好成绩', clock: '3:28:16', race: { id: 'sample-full', name: '城市马拉松', raceDate: '2026-10-18' } },
    { distance: 'half', distanceLabel: '半马最好成绩', clock: '1:36:20', race: { id: 'sample-half', name: '湖畔半程马拉松', raceDate: '2026-09-20' } }
  ];
  data.results = [{ raceId: 'sample-full', distance: 'full', clock: '3:28:16', pb: true, race: { id: 'sample-full', name: '城市马拉松', raceDate: '2026-10-18' } }, { raceId: 'sample-half', distance: 'half', clock: '1:36:20', pb: true, race: { id: 'sample-half', name: '湖畔半程马拉松', raceDate: '2026-09-20' } }];
  if (scenario === 'guest') Object.assign(data, { nickname: '', runner: null, clubs: [], plans: [], results: [], nextRace: null, ready: false, posterAvailable: false });
  else data.mainTab = scenario === 'base' ? 'overview' : scenario;
  return { data, components: {}, css: '' };
}
async function sceneTone(page, selector, textSelector) {
  const scene = page.locator(selector);
  const screenshot = await scene.screenshot({ animations: 'disabled' });
  const color = await page.locator(textSelector).evaluate(node => getComputedStyle(node).color);
  return page.evaluate(async ({ screenshot, color }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + screenshot;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const luminance = ([r, g, b]) => [r, g, b].map(value => {
      const v = value / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
    const foreground = luminance(color.match(/[\d.]+/g).slice(0, 3).map(Number));
    const background = [0.04, 0.5, 0.96].map(x => luminance(ctx.getImageData(Math.round(x * img.width), 7, 1, 1).data));
    return { luminance: Math.min(...background), contrast: Math.min(...background.map(value => (Math.max(value, foreground) + 0.05) / (Math.min(value, foreground) + 0.05))) };
  }, { screenshot: screenshot.toString('base64'), color });
}
async function audit({ page, scenario }) {
  if (scenario === 'career-summary') {
    const issues = [];
    const tone = await sceneTone(page, '.page-heading', '.page-title');
    if (tone.luminance < 0.50 || tone.contrast < 4.5) issues.push('career identity should remain light and legible');
    const history = page.locator('.career-card .history-entry');
    if (await history.count() !== 1 || (await history.boundingBox()).height < 44) issues.push('career summary needs a linked history service');
    if (!(await page.locator('.career-number').innerText()).includes('2') || await page.locator('.timeline-row').count() !== 2) issues.push('career data shows actual finish and timeline counts');
    return issues;
  }
  if (scenario === 'results') {
    const title = page.locator('.results-overview .results-head');
    const right = title.getByRole('link', { name: '我的跑史' });
    if (await right.count() !== 1 || !(await title.textContent()).includes('完赛概览')) return ['complete-records summary needs its own heading and history link'];
    return (await right.boundingBox()).height >= 44 ? [] : ['history link should have a 44px touch target'];
  }
  if (!['base', 'guest'].includes(scenario)) return [];
  const scene = scenario === 'guest' ? '.guest-scene' : '.identity-panel';
  const tone = await sceneTone(page, scene, scenario === 'guest' ? '.guest-scene>div' : '.identity-panel .nickname');
  const header = await sceneTone(page, '.page-header', '.header-settings');
  const toneIssues = [];
  if (tone.luminance < 0.50 || tone.contrast < 4.5) toneIssues.push('identity scene requires bright lavender and readable ink ' + JSON.stringify(tone));
  if (header.luminance < 0.50 || header.contrast < 4.5) toneIssues.push('native header requires a light surface and readable controls ' + JSON.stringify(header));
  const matches = selector => page.locator(selector).count();
  if (scenario === 'guest') {
    const errors = toneIssues;
    if (await matches('.guest-scene') !== 1) errors.push('guest identity scene missing');
    if (await matches('.main-tabs,.runner-entry-grid,.account-stats')) errors.push('guest must not see personal workspace navigation');
    if (await matches('.guest-public-links a') !== 4) errors.push('guest public destinations missing');
    const login = await page.locator('.guest-login-row button').boundingBox();
    if (!login || login.height < 44 || login.width < 200) errors.push('guest login action must span the service card');
    const cta = await sceneTone(page, '.guest-login-row button', '.guest-login-row button');
    if (cta.contrast < 4.5) errors.push('guest login text requires readable button contrast ' + JSON.stringify(cta));
    return errors;
  }
  const boxes = await page.locator('.member-services .account-stats>*').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
  const hero = await page.locator('.identity-panel').boundingBox();
  const service = await page.locator('.member-services').boundingBox().catch(() => null);
  if (!(boxes.length === 3 && boxes.every(({ width, height }) => width >= 44 && height >= 44) && service && hero && service.y < hero.y + hero.height)) toneIssues.push('member service stats must be independently clickable and overlap the identity scene');
  return toneIssues;
}
module.exports = { cases, prepare, audit, sceneTone };
