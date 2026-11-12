/* Synthetic presentation data for the current Mine WXML source mirror. */
const route = 'pages/mine/mine';
const cases = ['base', 'guest', 'settings', 'results', 'profile'].map(scenario => ({ route, scenario }));
function prepare(_route, data, scenario) {
  data = JSON.parse(JSON.stringify(data));
  data.nickname = '一路向前的跑者';
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
module.exports = { cases, prepare };
