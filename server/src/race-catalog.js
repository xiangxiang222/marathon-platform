const catalog = require('../../shared/race-catalog.json');
const archives = Object.fromEntries(catalog.races.map(race => [race.id, require('../../shared/race-archives/' + race.id + '.json')]));

function raceArchiveId(race) {
  if (!race || race.meet === 'online' || /(?:half|trail)/.test(String(race.kind || race.kinds || ''))) return '';
  const distances = Array.isArray(race.distances) ? race.distances : String(race.distances || '').split(',').filter(Boolean);
  if (distances.length && !distances.includes('full')) return '';
  const name = String(race.name || '').replace(/[\s·・•]/g, '');
  // A city's half marathon and an online spin-off are distinct events.
  if (/(?:半程|半马|越野|线上|10公里|10千米|\d+k(?:m)?\b|接力|欢乐跑)/i.test(name)) return '';
  const match = catalog.races.find(item => name.includes(item.name));
  return match ? match.id : '';
}

function archiveSummary(race) {
  const archive = archives[race.id];
  const years = archive.editions.map(edition => edition.year).sort((a, b) => Number(b) - Number(a));
  const defaultYear = years.find(year => { const edition = archive.editions.find(item => item.year === year); return edition.route.sourceIds.length && edition.registration.sourceIds.length; }) || years[0] || '';
  return { ...race, archivesAvailable: true, years, latestYear: years[0] || '', defaultYear };
}

function listCatalog(query = {}) {
  const q = String(query.q || '').trim().toLowerCase().slice(0, 100);
  const wa = String(query.wa || '').trim();
  const caa = String(query.caa || '').trim();
  const races = catalog.races.filter(race =>
    (!q || [race.name, race.shortName, race.city, race.province].some(value => String(value || '').toLowerCase().includes(q))) &&
    (!wa || race.worldAthletics.label === wa) && (!caa || race.caa.label === caa)
  ).map(archiveSummary);
  return { ...catalog, updatedAt: '2026-11-14', selectionNote: '北京、上海、厦门三场赛事档案，按编辑顺序展示，不代表排名。年度资料以各届公开来源为准，尚未核验的统计不记为零。', races };
}

function getArchive(id, db) {
  const race = catalog.races.find(item => item.id === id);
  if (!race) return null;
  const archive = archives[id];
  const summary = archiveSummary(race);
  const relatedRaces = db.prepare('SELECT id, name, city, kinds, meet, distances, race_date AS raceDate FROM races ORDER BY race_date DESC, id').all()
    .filter(row => raceArchiveId(row) === id)
    .map(({ id, name, raceDate }) => ({ id, name, raceDate }));
  // Both basic certification sources and annual sources are local to this race.
  const sources = [...race.sources, ...archive.sources.filter(source => !race.sources.some(item => item.id === source.id))];
  return { race: summary, archive: { ...archive, sources }, relatedRaces, years: summary.years, latestYear: summary.latestYear, defaultYear: summary.defaultYear };
}

function mountRaceCatalog(app, { BASE, getDb }) {
  app.get(BASE + '/api/race-catalog', (req, res) => res.json(listCatalog(req.query)));
  app.get(BASE + '/api/race-catalog/:id', (req, res) => {
    const result = getArchive(req.params.id, getDb());
    if (!result) return res.status(404).json({ error: '尚未收录这场赛事档案' });
    res.json(result);
  });
}

module.exports = { mountRaceCatalog, listCatalog, getArchive, raceArchiveId };
