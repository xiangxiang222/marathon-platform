'use strict';
const fs = require('node:fs'), path = require('node:path');
const base = require('./club-mileage-test-fixture.cjs');
const route = 'pages/achievement-poster/achievement-poster';
const out = path.join(__dirname, 'achievement-poster-20261111/mini');
function runnerPayload(count = 44) {
  const titles = ['春日城市马拉松', '湖畔半程马拉松', '公园十公里挑战', '清晨五公里跑'];
  return { asOf: '2026-11-11', results: Array.from({ length: count }, (_, i) => ({ distance: ['full', 'half', '10k', '5k'][i % 4], seconds: [13568, 6445, 2843, 1316][i % 4] + Math.floor(i / 4) * 36,
    race: { id: 'achievement-fixture-' + i, name: titles[i % 4] + (i < 4 ? '' : ' · 第' + (Math.floor(i / 4) + 1) + '季'), raceDate: (i % 3 ? '2026' : '2025') + '-' + String(i % 9 + 1).padStart(2, '0') + '-' + String(i % 27 + 1).padStart(2, '0'), city: '杭州', province: '浙江', kind: i > 10 && i % 9 === 0 ? 'trail' : 'road', meet: i > 10 && i % 11 === 0 ? 'online' : 'offline' } })) };
}
const cases = ['base', 'mint', 'coral', 'results', 'results-last', 'privacy', 'selection', 'permission-denied', 'empty', 'error'].map(scenario => ({ route, scenario }));
async function prepare(_route, _data, scenario) {
  const x = base.miniFixture(route); x.instance.onLoad({ mode: scenario.startsWith('results') ? 'results' : 'pb' });
  x.setReply(async url => { if (scenario === 'error') throw Error('成绩暂时无法读取，请重新加载'); return url === '/me' ? { user: { id: 1, nickname: '向前跑的我' } } : runnerPayload(scenario === 'empty' ? 0 : 44); });
  await x.instance.onShow();
  if (['mint', 'coral'].includes(scenario)) x.instance.pickStyle(base.event({ id: scenario }));
  if (scenario === 'privacy') { for (const key of ['showName', 'showRace', 'showDate']) x.instance.changePrivacy({ currentTarget: { dataset: { key } }, detail: { value: false } }); x.instance.setData({ privacyOpen: true }); }
  if (scenario === 'selection') x.instance.setData({ selectionOpen: true });
  if (scenario === 'permission-denied') x.instance.setData({ needsSetting: true, saveMessage: '相册权限尚未开启。点「去设置」允许后，再保存这张海报。' });
  const poster = scenario === 'mint' ? 'pb-mint' : scenario === 'coral' ? 'pb-coral' : scenario === 'privacy' ? 'pb-private' : scenario === 'results' ? 'results-1' : scenario === 'results-last' ? 'results-3' : 'pb-cream';
  const data = JSON.parse(JSON.stringify(x.instance.data)); x.instance.onUnload();
  data.generating = false;
  if (!['error', 'empty'].includes(scenario)) data.posterPath = 'data:image/png;base64,' + fs.readFileSync(path.join(out, poster + '.png')).toString('base64');
  if (scenario === 'results-last') { data.pageIndex = 2; data.pageNumber = 3; }
  return { data, components: {}, css: '' };
}
module.exports = { route, cases, prepare, runnerPayload };
