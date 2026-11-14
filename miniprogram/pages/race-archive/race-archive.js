const { request } = require('../../utils/request');
const landmarks = {
  beijing: '/images/race-landmarks/beijing.png',
  shanghai: '/images/race-landmarks/shanghai.png',
  xiamen: '/images/race-landmarks/xiamen.png'
};
function safeUrl(v) { return /^https:\/\/[^\s/@?#]+(?:[/?#][^\s]*)?$/i.test(String(v || '')) || /^\/marathon\/images\/race-archives\/[a-z0-9_/-]+\.(?:png|jpe?g|webp)$/i.test(String(v || '')); }
function assetUrl(v) { if (!safeUrl(v)) return ''; return v.startsWith('/marathon/images/race-archives/') ? String(getApp().globalData.baseUrl || '').replace(/\/$/, '') + v : v; }
function certification(v) { return v && v.label ? v.label + (v.year ? ' · ' + v.year : '') : '待核实'; }
const TABS = [{ id: 'overview', label: '概览' }, { id: 'route', label: '赛道' }, { id: 'registration', label: '报名中签' }, { id: 'logistics', label: '参赛指南' }, { id: 'participation', label: '参赛完赛' }, { id: 'gear', label: '装备收藏' }, { id: 'stories', label: '赛事故事' }];
function lotteryTable(editions) {
  const known = value => value !== undefined && value !== null && String(value).trim() !== '';
  const lotteryColumns = [['lotteryRate', '公布中签率', 180], ['applicants', '报名人数', 160], ['eligibleApplicants', '有效报名', 160], ['lotteryPool', '抽签人数', 160], ['drawQuota', '抽签名额', 160], ['directQuota', '直通名额', 160]]
    .filter(([key]) => editions.some(edition => known(edition.registration && edition.registration[key])))
    .map(([key, label, width]) => ({ key, label, width }));
  return { lotteryColumns, lotteryTableWidth: 70 + lotteryColumns.reduce((sum, column) => sum + column.width, 0), lotteryRows: editions.map(edition => ({ year: String(edition.year), cells: lotteryColumns.map(column => ({ key: column.key, width: column.width, value: known(edition.registration && edition.registration[column.key]) ? edition.registration[column.key] : '—' })) })) };
}
function facts(object, labels) { return labels.filter(([key]) => object && object[key]).map(([key, label]) => ({ label, value: object[key] })); }
Page({
  data: { race: null, archive: null, landmarkSrc: '', relatedRaces: [], fromRace: null, years: [], yearIndex: 0, year: '', edition: null, tab: 'overview', tabs: TABS, loading: true, message: '', registrationFacts: [], participationFacts: [], logisticsSections: [], routeStages: [], coverageOpen: false, lotteryRows: [], lotteryColumns: [], lotteryTableWidth: 70, waLabel: '', caaLabel: '' },
  onLoad(query) { this._id = query.id || ''; this._fromRaceId = query.fromRaceId || ''; this._requestedYear = query.year || ''; this._seq = 0; this._disposed = false; this.setData({ tab: TABS.some(t => t.id === query.tab) ? query.tab : 'overview' }); this.load(); },
  onUnload() { this._disposed = true; this._seq++; },
  load() { const seq = ++this._seq; this.setData({ loading: true, message: '', race: null, archive: null, edition: null }); return request('/race-catalog/' + encodeURIComponent(this._id)).then(d => { if (this._disposed || seq !== this._seq) return; if (!d.race || !d.archive) throw Error('这场赛事尚无已收录档案'); this._archive = d.archive; this._editions = (d.archive.editions || []).slice().sort((a, b) => Number(b.year) - Number(a.year)); const relatedRaces = d.relatedRaces || [], linked = relatedRaces.find(r => String(r.id) === String(this._fromRaceId)), linkedYear = String(linked && linked.raceDate || '').slice(0, 4); const years = (d.years || this._editions.map(e => e.year)).map(String), preferred = String(this._requestedYear || linkedYear), year = years.includes(preferred) ? preferred : String(d.defaultYear || d.latestYear || years[0] || ''); this.setData({ race: d.race, archive: d.archive, landmarkSrc: landmarks[d.race.id] || '', years, year, yearIndex: Math.max(0, years.indexOf(year)), relatedRaces, fromRace: relatedRaces.find(r => String(r.id) === String(this._fromRaceId)) || null, loading: false, waLabel: certification(d.race.worldAthletics), caaLabel: certification(d.race.caa), ...lotteryTable(this._editions) }); this.paint(); wx.setNavigationBarTitle({ title: d.race.name + ' · 年度档案' }); }).catch(e => { if (!this._disposed && seq === this._seq) this.setData({ message: e.message || '赛事档案暂时无法加载', loading: false }); }); },
  paint() {
    const raw = this._editions.find(e => String(e.year) === this.data.year);
    if (!raw) { this.setData({ edition: null, logisticsSections: [], routeStages: [], coverageOpen: false }); return; }
    const route = { ...(raw.route || {}) };
    route.mapUrl = assetUrl(route.mapUrl);
    route.imageCredit = route.mediaRights && route.mediaRights.attribution || '';
    const routeStages = String(route.summary || '').includes('→') ? String(route.summary).split('→').map(name => name.trim()).filter(Boolean).map((name, index) => ({ order: String(index + 1).padStart(2, '0'), name })) : [];
    const gear = (raw.gear || []).map((item, index) => ({ ...item, order: String(index + 1).padStart(2, '0'), imageUrl: assetUrl(item.imageUrl), imageCredit: item.mediaRights && item.mediaRights.attribution || '' }));
    const edition = { ...raw, route, gear, registration: raw.registration || {}, participation: raw.participation || {}, results: raw.results || [], notes: raw.notes || [] };
    const logisticsSections = [
      { id: 'collection', title: '领物安排', labels: [['time','领物时间'],['place','领物地点'],['requirements','领取要求']] },
      { id: 'transport', title: '交通与离场', labels: [['expo','领物交通'],['start','前往起点'],['finish','终点离场']] },
      { id: 'raceDay', title: '比赛日服务', labels: [['startTime','发枪与分区'],['timeLimit','关门安排'],['bagDrop','存取包'],['aidStations','补给与饮水'],['toilets','卫生间'],['medical','医疗服务']] }
    ].map(section => ({ id: section.id, title: section.title, fields: section.labels.filter(([key]) => raw.logistics && raw.logistics[section.id] && raw.logistics[section.id][key]).map(([key,label]) => ({ label, value: raw.logistics[section.id][key] })) })).filter(section => section.fields.length);
    edition.coverageText = raw.coverage ? (raw.coverage.missing || []).join('、') : '';
    edition.upcoming = raw.coverage && raw.coverage.upcoming;
    this.setData({ edition, logisticsSections, routeStages, coverageOpen: false, registrationFacts: facts(edition.registration, [['opens','报名开始'],['closes','报名截止'],['drawDate','抽签公布'],['fee','报名费用'],['qualification','报名资格'],['applicants','报名人数'],['eligibleApplicants','有效报名'],['lotteryPool','实际抽签人数'],['drawQuota','抽签名额'],['directQuota','直通名额'],['lotteryRate','公布中签率']]), participationFacts: facts(edition.participation, [['planned','计划规模'],['starters','实际起跑'],['finishers','完赛人数'],['finishRate','完赛率']]) });
  },
  pickYear(e) { const index = Number(e.detail.value); this.setData({ yearIndex: index, year: this.data.years[index] }); this.paint(); },
  setYear(e) { const year = String(e.currentTarget.dataset.year); if (!this.data.years.includes(year)) return; this.setData({ year, yearIndex: this.data.years.indexOf(year) }); this.paint(); },
  pickTab(e) { const tab = e.currentTarget.dataset.id; if (!TABS.some(t => t.id === tab)) return; this.setData({ tab }); this.paint(); },
  toggleCoverage() { this.setData({ coverageOpen: !this.data.coverageOpen }); },
  previewImage(e) { const url = e.currentTarget.dataset.url; if (safeUrl(url)) wx.previewImage({ current: url, urls: [url] }); },
  routeImageError() { this.setData({ 'edition.route.imageFailed': true }); },
  gearImageError(e) { const index = Number(e.currentTarget.dataset.index); if (Number.isInteger(index) && index >= 0) this.setData({ ['edition.gear[' + index + '].imageFailed']: true }); },
  onShareAppMessage() { return { title: (this.data.race && this.data.race.name || '赛事档案') + ' · ' + this.data.year + '年度档案', path: '/pages/race-archive/race-archive?id=' + encodeURIComponent(this._id) + '&year=' + encodeURIComponent(this.data.year) + '&tab=' + encodeURIComponent(this.data.tab) }; }
});
