const catalog = require('../../shared/race-catalog.json');
const archives = Object.fromEntries(catalog.races.map(race => [race.id, require('../../shared/race-archives/' + race.id + '.json')]));
const { readArchiveEdit } = require('./race-archive-editor');
const { mergeArchiveRecord, OFFICIAL_RESOURCE_CATEGORIES, officialResourceUrl } = require('./race-archive-schema');
const previousSeeds = require('./race-archive-previous-seed.json');

function archiveBaseline(id) {
  const race = catalog.races.find(item => item.id === id);
  return race ? JSON.parse(JSON.stringify({ race, archive: archives[id] })) : null;
}
function archiveRecord(id, db) { return mergeArchiveRecord(archiveBaseline(id), readArchiveEdit(db, id), previousSeeds[id]); }

function raceArchiveId(race) {
  if (!race || race.meet === 'online' || /trail/.test(String(race.kind || race.kinds || ''))) return '';
  const distances = Array.isArray(race.distances) ? race.distances : String(race.distances || '').split(',').filter(Boolean);
  if (distances.length && !distances.includes('full')) return '';
  const name = String(race.name || '').replace(/[\s·・•]/g, '');
  // A city's half marathon and an online spin-off are distinct events.
  if (/(?:半程|半马|越野|线上|10公里|10千米|\d+k(?:m)?\b|接力|欢乐跑)/i.test(name)) return '';
  const city = String(race.city || '').replace(/市$/, '');
  const officialId = String(race.officialId || race.official_id || '');
  const match = catalog.races.find(item => {
    if (city && city !== String(item.city).replace(/市$/, '')) return false;
    if (officialId && (item.identity?.officialIds || []).some(value => String(typeof value === 'object' ? value.id : value) === officialId)) return true;
    const names = [item.name, ...(item.aliases || []), ...(item.identity?.raceNames || [])];
    // A verified brand must end the title (optional championship suffix). City
    // search aliases such as “东营” never grant an automatic race association.
    return names.some(value => {
      const normalized = String(value).replace(/[\s·・•]/g, '');
      const variants = [normalized, normalized.replace(/赛$/, '')];
      return variants.some(variant => {
        const index = name.lastIndexOf(variant);
        return index >= 0 && /^(?:赛)?(?:暨全国马拉松锦标赛.*)?$/.test(name.slice(index + variant.length));
      });
    });
  });
  return match ? match.id : '';
}

function archiveSummary(race, archive = archives[race.id]) {
  const years = archive.editions.map(edition => edition.year).sort((a, b) => Number(b) - Number(a));
  const defaultYear = years.find(year => { const edition = archive.editions.find(item => item.year === year); return edition.route?.summary && edition.registration?.method; }) || years[0] || '';
  return { ...race, archivesAvailable: true, years, latestYear: years[0] || '', defaultYear };
}

function listCatalog(query = {}, db) {
  const q = String(query.q || '').trim().toLowerCase().slice(0, 100);
  const wa = String(query.wa || '').trim();
  const caa = String(query.caa || '').trim();
  const records = catalog.races.map(item => archiveRecord(item.id, db));
  const filterOptions = Object.fromEntries(['worldAthletics', 'caa'].map(key => [key, [...new Set(records.map(({ race }) => race[key]?.label).filter(Boolean))]]));
  const races = records.filter(({ race }) =>
    (!q || [race.name, race.shortName, race.city, race.province, ...(race.aliases || [])].some(value => String(value || '').toLowerCase().includes(q))) &&
    (!wa || race.worldAthletics?.label === wa) && (!caa || race.caa?.label === caa)
  ).map(({ race, archive }) => archiveSummary(race, archive));
  return { ...catalog, filterOptions, featuredIds: catalog.featuredIds || ['beijing', 'shanghai', 'xiamen'], races };
}

function editionCoverage(edition, archive) {
  const asOf = archive.updatedAt || '2026-11-14';
  const route = edition.route || {}, registration = edition.registration || {}, participation = edition.participation || {};
  const gear = edition.gear || [], logistics = edition.logistics || {}, resources = edition.officialResources || [];
  const hasResource = category => resources.some(item => item.category === category);
  const hasGearImage = name => gear.some(item => item.category === name && (item.imageUrl || item.images?.length));
  const shirt = hasGearImage('参赛服') || hasResource('shirt');
  const medal = hasGearImage('奖牌') || hasResource('medal');
  const hasStory = [...(archive.stories || []), ...(archive.updates || [])].some(item => String(item.editionYear) === String(edition.year));
  const upcoming = edition.status === 'scheduled' || edition.status !== 'completed' && Boolean(edition.date && edition.date > asOf);
  const hasLogistics = ['collection', 'transport', 'raceDay'].some(key =>
    Object.entries(logistics[key] || {}).some(([field, value]) => field !== 'sourceIds' && typeof value === 'string' && value.trim())
  );
  const available = [
    ['route', '赛道', route.summary || route.mapUrl || route.images?.length || hasResource('route-map')],
    ['registration', '报名中签', registration.method],
    ['logistics', '参赛指南', hasLogistics || hasResource('guide')],
    ['participation', '参赛成绩', participation.starters || participation.finishers || (edition.results || []).length || hasResource('results')],
    ['shirt', '参赛服', shirt], ['medal', '奖牌', medal],
    ['stories', '赛事故事', hasStory]
  ].filter(([, , known]) => known).map(([id, label]) => ({ id, label }));
  const missing = [
    ['官方路线图', route.mapUrl || route.images?.length || hasResource('route-map')],
    ['报名起止时间', registration.opens && registration.closes],
    ['报名费用', registration.fee],
    ['报名人数', registration.applicants],
    ['官方中签率', registration.lotteryRate],
    ...(upcoming || ['cancelled','postponed'].includes(edition.status) ? [] : [['代表性成绩', (edition.results || []).length], ['实际起跑人数', participation.starters], ['完赛人数', participation.finishers]]),
    ['领物时间与地点', logistics.collection?.time && logistics.collection?.place],
    ['参赛服图片', shirt],
    ['奖牌图片', medal]
  ].filter(([, known]) => !known).map(([label]) => label);
  return { available, missing, asOf, upcoming };
}

// A publicly accessible original is evidence, not a reuse licence.
function mediaCanPublish(rights) {
  if (!rights || !rights.title) return false;
  if (rights.status === 'admin-confirmed') return Boolean(rights.holder && rights.confirmedAt);
  if (rights.status === 'original') return Boolean(rights.holder);
  return ['licensed', 'public-domain'].includes(rights.status) && /^https:\/\//.test(rights.licenseUrl || '') && Boolean(rights.holder) && (rights.status !== 'licensed' || Boolean(rights.attribution));
}

function publicEdition(edition, archive) {
  const publicImages = images => (images || []).filter(item => mediaCanPublish(item.mediaRights));
  const route = { ...edition.route, mapUrl: mediaCanPublish(edition.route?.mediaRights) ? edition.route.mapUrl : '', images: publicImages(edition.route?.images) };
  const gear = (edition.gear || []).map(item => ({ ...item, imageUrl: mediaCanPublish(item.mediaRights) ? item.imageUrl : '', images: publicImages(item.images) }));
  const knownSources = new Map((archive.sources || []).map(item => [item.id, item]));
  const officialResources = (edition.officialResources || []).flatMap(item => {
    const url = officialResourceUrl(item.url);
    if (!url || !item.title || !OFFICIAL_RESOURCE_CATEGORIES.has(item.category)) return [];
    if (!Array.isArray(item.sourceIds) || !item.sourceIds.length || !item.sourceIds.every(id => knownSources.has(id))) return [];
    if (!item.sourceIds.some(id => knownSources.get(id).applicableYears?.some(year => String(year) === String(edition.year)))) return [];
    return [{ category: item.category, title: item.title, url, sourceIds: item.sourceIds }];
  });
  const visible = { ...edition, route, gear, officialResources };
  return { ...visible, coverage: editionCoverage(visible, archive) };
}

function getArchive(id, db) {
  const record = archiveRecord(id, db);
  if (!record) return null;
  const { race, archive } = record;
  const summary = archiveSummary(race, archive);
  const relatedRaces = db.prepare('SELECT id, name, city, kinds, meet, distances, race_date AS raceDate FROM races ORDER BY race_date DESC, id').all()
    .filter(row => raceArchiveId(row) === id)
    .map(({ id, name, raceDate }) => ({ id, name, raceDate }));
  // Both basic certification sources and annual sources are local to this race.
  const sources = [...(race.sources || []), ...(archive.sources || []).filter(source => !(race.sources || []).some(item => item.id === source.id))];
  const editions = archive.editions.map(edition => publicEdition(edition, { ...archive, sources }));
  const publicMedia = items => (items || []).filter(item => mediaCanPublish(item.mediaRights));
  const hero = archive.hero ? { ...archive.hero, imageUrl: mediaCanPublish(archive.hero.mediaRights) ? archive.hero.imageUrl : '' } : undefined;
  const photoAlbums = (archive.photoAlbums || []).map(album => ({ ...album, media: publicMedia(album.media) }));
  const publicArticles = items => (items || []).map(item => ({ ...item, images: publicMedia(item.images) }));
  return { race: summary, archive: { ...archive, editions, sources, hero, photoAlbums, updates: publicArticles(archive.updates), news: publicArticles(archive.news), stories: publicArticles(archive.stories) }, relatedRaces, years: summary.years, latestYear: summary.latestYear, defaultYear: summary.defaultYear };
}

function mountRaceCatalog(app, { BASE, getDb }) {
  // Also prevent direct access to old cached images whose reuse is unconfirmed.
  const publicImages = new Set(Object.values(archives).flatMap(archive => archive.editions.flatMap(edition => [
    mediaCanPublish(edition.route?.mediaRights) ? edition.route.mapUrl : '',
    ...(edition.gear || []).filter(item => mediaCanPublish(item.mediaRights)).map(item => item.imageUrl)
  ])).filter(url => url.startsWith('/marathon/images/race-archives/')));
  app.use(BASE + '/images/race-archives', (req, res, next) => {
    if (!publicImages.has('/marathon/images/race-archives' + req.path)) return res.status(404).end();
    next();
  });
  app.get(BASE + '/api/race-catalog', (req, res) => res.json(listCatalog(req.query, getDb())));
  app.get(BASE + '/api/race-catalog/:id', (req, res) => {
    const result = getArchive(req.params.id, getDb());
    if (!result) return res.status(404).json({ error: '尚未收录这场赛事档案' });
    res.json(result);
  });
}

module.exports = { mountRaceCatalog, listCatalog, getArchive, raceArchiveId, editionCoverage, mediaCanPublish, publicEdition, archiveBaseline };
