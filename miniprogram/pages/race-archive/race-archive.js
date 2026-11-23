const { request } = require('../../utils/request');
const { landmarkSrc } = require('../../utils/race-landmarks');

const TABS = [
  { id: 'overview', label: '概况' }, { id: 'entry', label: '参赛' }, { id: 'route', label: '赛道' },
  { id: 'results', label: '成绩' }, { id: 'gallery', label: '图鉴' }, { id: 'updates', label: '动态' }
];
const GALLERY = ['参赛服', '奖牌', '参赛包', '完赛包', '官方图集'];
const LEGACY = { registration: 'entry', logistics: 'entry', participation: 'results', gear: 'gallery', stories: 'updates' };
const REGISTRATION_METRICS = [
  ['applicants', '报名人数'], ['lotteryRate', '公布中签率'], ['eligibleApplicants', '有效报名'],
  ['lotteryPool', '抽签人数'], ['drawQuota', '抽签名额'], ['directQuota', '直通名额']
];
const GUIDE_SECTIONS = [
  ['collection', '领物安排', [['time', '时间'], ['place', '地点'], ['requirements', '领取要求']]],
  ['transport', '交通与离场', [['expo', '领物交通'], ['start', '前往起点'], ['finish', '终点离场']]],
  ['raceDay', '比赛日服务', [['startTime', '发枪与分区'], ['timeLimit', '关门安排'], ['bagDrop', '存取包'],
    ['aidStations', '补给与饮水'], ['toilets', '卫生间'], ['medical', '医疗服务']]]
];
const MEDIA_PATH = /^\/marathon\/(?:api\/race-archive-media\/(?:beijing|shanghai|xiamen|wuxi|wuhan|guangzhou|chongqing|dongying|hengshuihu|xian|taiyuan|changsha|chengdu|dalian|lanzhou|shenzhen|hangzhou)\/[a-f0-9]{64}\.(?:jpg|png|webp)|images\/race-archives\/[a-z0-9_/-]+\.(?:png|jpe?g|webp))$/i;
const REMOTE_IMAGE = /^https:\/\/[^\s/@?#]+(?:[/?#][^\s]*)?$/i;

function asset(value) {
  const url = String(value || '');
  if (MEDIA_PATH.test(url)) return String(getApp().globalData.baseUrl || '').replace(/\/$/, '') + url;
  return REMOTE_IMAGE.test(url) ? url : '';
}

function photoList(items, fallback, failed) {
  const images = [
    ...(fallback?.url ? [fallback] : []),
    ...(items || [])
  ].map(item => ({
    url: asset(item.url),
    caption: plainText(item.caption || ''),
    credit: plainText(item.credit || item.mediaRights?.attribution || '')
  }));
  const seen = new Set();
  return images.filter(item => {
    if (!item.url || seen.has(item.url) || failed.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function plainText(value) {
  return String(value || '')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/gi, '$1')
    .replace(/https?:\/\/[^\s<>"“”。，；、）]+/gi, '')
    .trim();
}

function fields(value, labels) {
  return labels.filter(([key]) => value?.[key] != null && value[key] !== '')
    .map(([key, label]) => ({ label, value: value[key] }));
}

function statusLabel(value) {
  return { completed: '已举办', scheduled: '已公告', cancelled: '已取消', postponed: '延期', upcoming: '待举办' }[value] || value || '';
}

function certification(value) {
  return value?.label ? value.label + (value.year ? ' · ' + value.year : '') : '';
}

function indexFor(years, year) {
  return Math.max(0, years.indexOf(String(year)));
}

function annualCoverage(edition) {
  const missing = new Set(edition.coverage?.missing || []);
  const hasImage = (images, url) => Boolean(asset(url) || images?.some(item => asset(item.url)));
  const routeVisible = hasImage(edition.route?.images, edition.route?.mapUrl);
  const gearVisible = category => (edition.gear || []).some(item => item.category === category && hasImage(item.images, item.imageUrl));
  const media = {
    route: [routeVisible, '赛道图'],
    shirt: [gearVisible('参赛服'), '参赛服图片'],
    medal: [gearVisible('奖牌'), '奖牌图片']
  };
  missing.delete('官方路线图');
  for (const [present, label] of Object.values(media)) {
    if (!present) missing.add(label);
  }
  return {
    year: String(edition.year), status: statusLabel(edition.status),
    available: (edition.coverage?.available || []).filter(item => !media[item.id] || media[item.id][0]),
    missing: [...missing].join('、')
  };
}

function articleIndex(archive) {
  const titles = new Set();
  const articles = [
    ...[...(archive.updates || []), ...(archive.stories || [])].map((item, index) => ({ ...item, id: item.id || 'story-' + index, type: 'stories' })),
    ...(archive.news || []).map((item, index) => ({ ...item, id: item.id || 'news-' + index, type: 'news' }))
  ];
  return articles.flatMap(item => {
    const body = plainText(item.body);
    const title = plainText(item.title);
    if (!title || !body || titles.has(title)) return [];
    titles.add(title);
    return [{ ...item, title, body, key: item.type + ':' + item.id,
      editionYear: String(item.editionYear || item.publishedAt || '').slice(0, 4),
      summary: plainText(item.summary) || body.split('\n')[0] }];
  }).sort((a, b) => (b.publishedAt || b.editionYear).localeCompare(a.publishedAt || a.editionYear));
}

Page({
  data: {
    race: null, archive: null, tabs: TABS, tab: 'overview', scrollTarget: 'archive-top-a', loading: true, message: '',
    landmarkSrc: '', heroUrl: '', heroFailed: false, waLabel: '', caaLabel: '', foundingYear: '', years: [],
    entryYear: '', entryIndex: 0, entrySection: 'registration', entryEdition: null, entryMetrics: [], entrySummary: [], entryFacts: [],
    guideSections: [], registrationExpanded: false, routeYear: '', routeIndex: 0, routeEdition: null, routeImages: [],
    resultsYear: '', resultsIndex: 0, resultsEdition: null, resultFacts: [], resultNotesExpanded: false,
    galleryTypes: GALLERY, galleryType: '参赛服', galleryGroups: [], albums: [], galleryYear: '', storyYear: '',
    galleryYearIndex: 0, storyYearIndex: 0, yearFilters: [], storyYearFilters: [], annualCoverage: [], annualExpanded: false,
    stories: [], activeArticle: null, latestEdition: null, fromRace: null, lotteryRows: [], history: [], visibleHistory: [],
    historyExpanded: false, records: [], entryNotes: [], entryTips: [], entryEvents: [], entryStatus: '',
    sources: [], sourcesExpanded: false, gaps: [], conflicts: [], coverageExpanded: false, overviewHighlights: [],
    directoryUrl: '/pages/race-catalog/race-catalog'
  },

  onLoad(query) {
    this._id = query.id || '';
    this._query = query;
    this._seq = 0;
    this._disposed = false;
    this._failedImages = new Set();
    const tab = LEGACY[query.tab] || query.tab;
    this.setData({
      tab: TABS.some(item => item.id === tab) ? tab : 'overview',
      entrySection: query.tab === 'logistics' || query.section === 'guide' ? 'guide' : 'registration',
      galleryType: GALLERY.includes(query.category) ? query.category : '参赛服'
    });
    return this.load();
  },

  onUnload() {
    this._disposed = true;
    this._seq++;
  },

  async load() {
    const seq = ++this._seq;
    this.setData({ loading: true, message: '' });
    try {
      const data = await request('/race-catalog/' + encodeURIComponent(this._id));
      if (this._disposed || seq !== this._seq) return;
      const { race, archive } = data;
      if (!race || !archive) throw Error('这场赛事尚无档案');
      this._failedImages.clear();
      this._editions = (archive.editions || []).slice().sort((a, b) => Number(b.year) - Number(a.year));
      this._articles = articleIndex(archive);
      this._albums = archive.photoAlbums || [];
      const years = this._editions.map(e => String(e.year));
      const lastResult = this._editions.find(e => e.results?.length);
      const linked = (data.relatedRaces || []).find(r => String(r.id) === String(this._query.fromRaceId || ''));
      const preferred = String(this._query.year || linked?.raceDate?.slice(0, 4) || '');
      const initial = years.includes(String(data.defaultYear)) ? String(data.defaultYear) : years[0] || '';
      const selected = years.includes(preferred) ? preferred : initial;
      const { tab } = this.data;
      const entryYear = tab === 'entry' ? selected : initial;
      const routeYear = tab === 'route' ? selected : initial;
      const resultsYear = tab === 'results' && years.includes(preferred) ? selected : String(lastResult?.year || initial);
      const filteredYear = years.includes(String(this._query.year || '')) ? String(this._query.year) : '';
      const galleryYear = tab === 'gallery' ? filteredYear : '';
      const updateYears = [...new Set([...years, ...this._articles.map(item => item.editionYear).filter(Boolean)])]
        .sort((a, b) => Number(b) - Number(a));
      const yearFilters = ['全部年份', ...years];
      const storyYearFilters = ['全部年份', ...updateYears];
      const queryYear = String(this._query.year || '');
      const storyYear = tab === 'updates' && updateYears.includes(queryYear) ? queryYear : '';
      const profile = archive.profile || {};
      const history = archive.history || [];
      const sources = (archive.sources || []).map(source => ({
        id: source.id, title: plainText(source.title), publisher: plainText(source.publisher), publishedAt: source.publishedAt || '',
        yearsLabel: [...new Set((source.applicableYears || []).map(String))].join('、'), checkedAt: source.verifiedAt || source.accessedAt || ''
      })).filter(item => item.title);
      const directoryQuery = ['q', 'wa', 'caa'].filter(key => this._query[key])
        .map(key => key + '=' + encodeURIComponent(this._query[key])).join('&');
      const lotteryRows = this._editions.map(e => ({ year: String(e.year), cells: fields(e.registration, REGISTRATION_METRICS) }))
        .filter(row => row.cells.length);
      this.setData({
        race, archive: { intro: archive.intro || '', positioning: profile.positioning || '', updatedAt: archive.updatedAt || '' },
        landmarkSrc: landmarkSrc(race.id), heroUrl: asset(archive.hero?.imageUrl), heroFailed: false,
        waLabel: certification(race.worldAthletics), caaLabel: certification(race.caa), foundingYear: profile.foundingYear || '',
        years, entryYear, entryIndex: indexFor(years, entryYear), routeYear, routeIndex: indexFor(years, routeYear),
        resultsYear, resultsIndex: indexFor(years, resultsYear), yearFilters, storyYearFilters, galleryYear,
        galleryYearIndex: indexFor(yearFilters, galleryYear), storyYear,
        storyYearIndex: indexFor(storyYearFilters, storyYear), latestEdition: this._editions[0] || null,
        fromRace: linked || null, lotteryRows, history, visibleHistory: history.slice(0, 5), historyExpanded: false,
        records: archive.records || [], entryNotes: Array.isArray(profile.entryNotes) ? profile.entryNotes : profile.entryNotes ? [profile.entryNotes] : [],
        sources, sourcesExpanded: false, gaps: archive.gaps || [],
        conflicts: (archive.conflicts || []).map(item => typeof item === 'string' ? item : item.reason || item.resolution || item.note || '资料口径待核实'),
        coverageExpanded: false, overviewHighlights: (archive.highlights || []).slice(0, 3),
        directoryUrl: '/pages/race-catalog/race-catalog' + (directoryQuery ? '?' + directoryQuery : ''),
        annualCoverage: this._editions.map(annualCoverage),
        annualExpanded: false, loading: false
      });
      this.paint();
      wx.setNavigationBarTitle({ title: race.name + ' · 赛事专题' });
    } catch (error) {
      if (!this._disposed && seq === this._seq) this.setData({ loading: false, message: error.message || '赛事档案暂时无法加载' });
    }
  },

  paint() {
    const { entryYear, routeYear, resultsYear, galleryYear, galleryType, storyYear } = this.data;
    const entry = this._editions.find(e => String(e.year) === entryYear);
    const route = this._editions.find(e => String(e.year) === routeYear);
    const result = this._editions.find(e => String(e.year) === resultsYear);
    const photo = (items, fallback) => photoList(items, fallback, this._failedImages);
    const routeImages = photo(route?.route?.images, { url: route?.route?.mapUrl, credit: route?.route?.mediaRights?.attribution });
    const guideSections = GUIDE_SECTIONS.map(([id, title, labels]) => ({ id, title, fields: fields(entry?.logistics?.[id], labels) }))
      .filter(section => section.fields.length);
    const galleryGroups = this._editions.filter(e => !galleryYear || String(e.year) === galleryYear).map(e => {
      const year = String(e.year);
      const items = (e.gear || []).filter(item => item.category === galleryType).map((item, index) => {
        const name = plainText(item.name).replace(new RegExp('^' + year + '\\s*年?\\s*'), '');
        return { id: year + '-' + index, name: name || galleryType, category: item.category,
          labels: (item.items || []).map(plainText).filter(Boolean).join(' · '),
          images: photo(item.images, { url: item.imageUrl, credit: item.mediaRights?.attribution }) };
      });
      const resourceCategory = { 参赛服: 'shirt', 奖牌: 'medal' }[galleryType];
      const hasResource = resourceCategory && e.officialResources?.some(item => item.category === resourceCategory);
      return { year, items, visible: Boolean(items.length || hasResource || galleryYear) };
    }).filter(group => group.visible);
    const resultsEdition = result ? { ...result, results: (result.results || []).map((item, key) => ({ ...item, key })) } : null;
    const entryMetrics = fields(entry?.registration, REGISTRATION_METRICS);
    const entrySummary = fields({
      ...entry?.registration,
      date: entry?.date,
      plannedQuota: entry?.registration?.plannedQuota || entry?.participation?.planned
    }, [['date', '比赛日期'], ['opens', '报名开始'], ['closes', '报名截止'],
      ['drawDate', '抽签公布'], ['plannedQuota', '计划名额'], ['fee', '报名费用']]);
    if (!entrySummary.length && !entryMetrics.length && entry?.registration?.direct) {
      entrySummary.push({ label: '已公布安排', value: entry.registration.direct });
    }
    const entryFacts = fields(entry?.registration, [
      ['qualification', '报名资格'], ['direct', '直通规则'],
      ['waitlist', '候补规则'], ['payment', '缴费时间与方式']
    ]).filter(item => entrySummary[0]?.label !== '已公布安排' || item.label !== '直通规则');
    // Older editions used name, distance and planned for the same fields.
    const entryEvents = (entry?.events || []).map(item => ({
      ...item, project: item.project || item.name || '', distanceKm: item.distanceKm === '' ? item.distance : item.distanceKm ?? item.distance,
      plannedParticipants: item.plannedParticipants === '' ? item.planned : item.plannedParticipants ?? item.planned
    }));
    const albums = this._albums.filter(item => !galleryYear || String(item.year) === galleryYear)
      .map((item, index) => ({ ...item, id: item.id || 'album-' + index, media: photo(item.media) }))
      .filter(item => item.media.length).sort((a, b) => Number(b.year) - Number(a.year));
    const stories = this._articles.filter(item => !storyYear || item.editionYear === storyYear)
      .map(({ key, title, tag, publishedAt, editionYear, summary }) => ({ key, title, tag, publishedAt, editionYear, summary }));
    this.setData({
      entryEdition: entry || null, entryMetrics, entrySummary, entryFacts, guideSections,
      entryTips: entry?.logistics?.tips || [], entryEvents, entryStatus: statusLabel(entry?.status), routeEdition: route || null, routeImages,
      resultsEdition, resultFacts: fields(result?.participation, [['planned', '计划规模'], ['starters', '实际起跑'],
        ['finishers', '完赛人数'], ['finishRate', '完赛率']]), galleryGroups, albums, stories
    });
  },

  switchTab(tab, patch = {}) {
    if (!TABS.some(item => item.id === tab)) return;
    const scrollTarget = this.data.scrollTarget === 'archive-top-a' ? 'archive-top-b' : 'archive-top-a';
    this.setData({ tab, activeArticle: null, scrollTarget, ...patch });
    this.paint();
  },

  pickTab(e) { this.switchTab(e.currentTarget.dataset.id); },
  openEdition(e) {
    const { id, year } = e.currentTarget.dataset;
    const selected = String(year);
    const index = this.data.years.indexOf(selected);
    if (index < 0) return;
    if (id === 'shirt' || id === 'medal') {
      this.switchTab('gallery', { galleryType: id === 'shirt' ? '参赛服' : '奖牌', galleryYear: selected, galleryYearIndex: index + 1 });
    } else if (id === 'stories') {
      this.switchTab('updates', { storyYear: selected, storyYearIndex: indexFor(this.data.storyYearFilters, selected) });
    } else if (id === 'route') {
      this.switchTab('route', { routeYear: selected, routeIndex: index });
    } else if (id === 'participation') {
      this.switchTab('results', { resultsYear: selected, resultsIndex: index, resultNotesExpanded: false });
    } else {
      this.switchTab('entry', { entrySection: id === 'logistics' ? 'guide' : 'registration', entryYear: selected, entryIndex: index, registrationExpanded: false });
    }
  },

  pickFilterYear(e) {
    const { scope } = e.currentTarget.dataset;
    const index = Number(e.detail.value);
    if (!['gallery', 'story'].includes(scope)) return;
    const years = scope === 'story' ? this.data.storyYearFilters : this.data.yearFilters;
    if (!Number.isInteger(index) || !years[index]) return;
    this.setData({ [scope + 'Year']: index ? years[index] : '', [scope + 'YearIndex']: index });
    this.paint();
  },

  pickEntrySection(e) {
    const value = e.currentTarget.dataset.id;
    if (['registration', 'guide'].includes(value)) this.setData({ entrySection: value });
  },

  pickYear(e) {
    const { scope } = e.currentTarget.dataset;
    const index = Number(e.detail.value);
    if (!['entry', 'route', 'results'].includes(scope) || !this.data.years[index]) return;
    this.setData({ [scope + 'Year']: this.data.years[index], [scope + 'Index']: index, resultNotesExpanded: false, registrationExpanded: false });
    this.paint();
  },

  setEntryYear(e) {
    const year = String(e.currentTarget.dataset.year);
    const index = this.data.years.indexOf(year);
    if (index >= 0) this.switchTab('entry', { entryYear: year, entryIndex: index, registrationExpanded: false });
  },
  openGallery(e) {
    const galleryType = e.currentTarget.dataset.id;
    if (GALLERY.includes(galleryType)) this.switchTab('gallery', { galleryType });
  },
  pickGallery(e) {
    const galleryType = e.currentTarget.dataset.id;
    if (!GALLERY.includes(galleryType)) return;
    this.setData({ galleryType });
    this.paint();
  },

  openArticle(e) {
    const article = this._articles.find(item => item.key === e.currentTarget.dataset.key);
    if (!article) return;
    this.setData({
      activeArticle: {
        title: article.title, tag: article.tag || '', date: article.publishedAt || article.editionYear,
        paragraphs: article.body.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean),
        images: photoList(article.images, null, this._failedImages),
        sources: this.data.sources.filter(source => (article.sourceIds || []).includes(source.id))
      }
    });
  },

  closeArticle() { this.setData({ activeArticle: null }); },
  stopTap() {},
  previewImage(e) {
    const { url, images } = e.currentTarget.dataset;
    const origin = String(getApp().globalData.baseUrl || '').replace(/\/$/, '');
    const valid = value => value?.startsWith(origin + '/marathon/') ? MEDIA_PATH.test(value.slice(origin.length)) : REMOTE_IMAGE.test(value);
    const urls = (images || []).map(item => item.url).filter(item => valid(item) && !this._failedImages.has(item));
    if (urls.includes(url)) wx.previewImage({ current: url, urls });
  },
  previewAlbum(e) {
    const album = this.data.albums.find(item => item.id === e.currentTarget.dataset.id);
    if (album?.media.length) wx.previewImage({ current: album.media[0].url, urls: album.media.map(item => item.url) });
  },
  imageError(e) {
    const { url } = e.currentTarget.dataset;
    if (!url || this._failedImages.has(url)) return;
    this._failedImages.add(url);
    this.paint();
    if (this.data.activeArticle) {
      this.setData({ 'activeArticle.images': this.data.activeArticle.images.filter(item => item.url !== url) });
    }
  },
  heroError() { this.setData({ heroFailed: true }); },
  toggleAnnual() { this.setData({ annualExpanded: !this.data.annualExpanded }); },
  toggleHistory() {
    const expanded = !this.data.historyExpanded;
    this.setData({ historyExpanded: expanded, visibleHistory: expanded ? this.data.history : this.data.history.slice(0, 5) });
  },
  toggleRegistration() { this.setData({ registrationExpanded: !this.data.registrationExpanded }); },
  toggleResultNotes() { this.setData({ resultNotesExpanded: !this.data.resultNotesExpanded }); },
  toggleSources() { this.setData({ sourcesExpanded: !this.data.sourcesExpanded }); },
  toggleCoverage() { this.setData({ coverageExpanded: !this.data.coverageExpanded }); },

  onShareAppMessage() {
    const { tab, entryYear, routeYear, resultsYear, galleryYear, storyYear, galleryType, entrySection } = this.data;
    const year = { entry: entryYear, route: routeYear, results: resultsYear, gallery: galleryYear, updates: storyYear }[tab];
    const query = 'id=' + encodeURIComponent(this._id) + '&tab=' + tab + (year ? '&year=' + year : '') +
      (tab === 'gallery' ? '&category=' + encodeURIComponent(galleryType) : '') +
      (tab === 'entry' ? '&section=' + entrySection : '');
    return { title: (this.data.race?.name || '赛事') + ' · 赛事专题', path: '/pages/race-archive/race-archive?' + query };
  }
});
