const { createHash } = require('node:crypto');
const OFFICIAL_RESOURCE_CATEGORIES = new Set(['route-map', 'shirt', 'medal', 'results', 'guide']);

function officialResourceUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
function collectionKey(path) {
  if (path === '/archive/editions') return item => String(item.year);
  if (path === '/archive/sources') return item => item.id;
  if (/^\/archive\/editions\/\d{4}\/officialResources$/.test(path)) return item => item.category + ':' + officialResourceUrl(item.url);
  if (/^\/archive\/editions\/\d{4}\/gear$/.test(path)) return item => JSON.stringify([item.category, item.name]);
}
function isCollectionItem(path) { return /^\/archive\/(?:sources\/[^/]+|editions\/\d{4}\/(?:officialResources|gear)\/[^/]+)$/.test(path); }
function comparable(value) {
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().flatMap(key => {
    const child = comparable(value[key]);
    return child === undefined ? [] : [[key, child]];
  }));
  if (Array.isArray(value)) return value.length ? value.map(comparable) : undefined;
  return value === '' || value == null ? undefined : value;
}
function stamp(value) {
  const comparableValue = comparable(value);
  return comparableValue === undefined ? '' : createHash('sha256').update(JSON.stringify(comparableValue)).digest('hex').slice(0, 24);
}
function pathFor(path, key) { return path + '/' + encodeURIComponent(key); }
function snapshotArchiveSeed(record) {
  const hashes = {};
  function visit(value, path) {
    const hash = stamp(value);
    if (hash) hashes[path] = hash;
    if (isCollectionItem(path)) return;
    const key = collectionKey(path);
    if (key && Array.isArray(value)) for (const item of value) visit(item, pathFor(path, key(item)));
    else if (isObject(value)) for (const [name, child] of Object.entries(value)) visit(child, pathFor(path, name));
  }
  visit(record, '');
  return hashes;
}

// Saved forms are complete snapshots. Rebase fields the editor did not change
// onto refreshed research while keeping deliberate edits and removals.
function rebaseArchive(seed, saved, prior, alternatives, legacy) {
  function merge(current, edited, path) {
    if (legacy && edited === undefined) return current;
    const baseHash = prior[path] || '';
    const editedHash = stamp(edited);
    if (editedHash === baseHash || alternatives.some(alt => Object.hasOwn(alt, path) && editedHash === alt[path])) return current;
    const key = collectionKey(path);
    if (key && Array.isArray(current) && Array.isArray(edited)) {
      const currentByKey = new Map(current.map(item => [key(item), item]));
      const existing = new Set(edited.map(key));
      // Older fingerprints may only describe the gear array. Without historic
      // item identities retain the stored edits, including duplicate names.
      if (path.endsWith('/gear') && (
        currentByKey.size !== current.length || existing.size !== edited.length ||
        baseHash && !Object.keys(prior).some(item => item.startsWith(path + '/'))
      )) return edited;
      return edited.map(item => merge(currentByKey.get(key(item)), item, pathFor(path, key(item))))
        .concat(current.filter(item => !existing.has(key(item)) && !prior[pathFor(path, key(item))])).filter(Boolean);
    }
    if (!isCollectionItem(path) && isObject(current) && isObject(edited)) return Object.fromEntries([...new Set([...Object.keys(current), ...Object.keys(edited)])].flatMap(key => {
      const field = merge(current[key], edited[key], pathFor(path, key));
      return field === undefined ? [] : [[key, field]];
    }));
    return edited;
  }
  return merge(seed, saved, '');
}

function upgradeLegacyEvidence(archive, seed, saved) {
  const uncited = [];
  if (saved.intro !== undefined && archive.intro !== seed.intro && !saved.introSourceIds) {
    archive.introSourceIds = [];
    uncited.push('简介');
  }
  for (const [field, citation] of [['foundingYear','foundingYearSourceIds'], ['positioning','positioningSourceIds'], ['entryNotes','entrySourceIds']]) {
    if (saved.profile?.[field] !== undefined && archive.profile?.[field] !== seed.profile?.[field] && !saved.profile[citation]) {
      archive.profile[citation] = [];
      uncited.push(field);
    }
  }
  if (uncited.length) archive.gaps = [...(archive.gaps || []), { fields: uncited, reason: '旧维护版本中的人工修改已保留，相关资料依据需由维护者重新确认。' }];
  archive.editions = archive.editions.map(edition => {
    const initial = seed.editions.find(item => String(item.year) === String(edition.year));
    const previous = saved.editions?.find(item => String(item.year) === String(edition.year));
    if (!initial || !previous) return edition;
    const merged = { ...edition };
    if (edition.date !== initial.date && previous.status === undefined) merged.status = '';
    if (edition.distance !== initial.distance && previous.events === undefined) merged.events = [];
    return merged;
  });
  return archive;
}

// Upgrade missing structure only. Existing editorial text, images and explicit
// empty arrays in a current schema remain authoritative over the seed JSON.
function mergeArchiveRecord(baseline, edited, previousSeed) {
  if (!baseline) return null;
  if (!edited) return baseline;
  const seed = baseline.archive, saved = edited.archive || {};
  const legacy = (saved.schemaVersion || 1) < 2;
  // The original archive editor saved a full form before recording schema
  // versions. Compare those rows with that editor's own normalized baseline.
  const prior = edited.seedHashes || (legacy ? previousSeed?.legacy : previousSeed?.normalized);
  if (prior) {
    const alternatives = edited.seedHashes || legacy ? [] : [previousSeed.raw, ...(previousSeed.older || [])];
    const { archive: rebased, race } = rebaseArchive(baseline, { race: edited.race, archive: saved }, prior, alternatives, legacy);
    const updatedAt = [baseline.archive.updatedAt, rebased.updatedAt].filter(Boolean).sort().at(-1);
    // Early editors saved the URL and title but omitted source scope. The
    // researched scope is safe to restore only for the same original URL.
    const baselineSources = new Map((baseline.archive.sources || []).map(source => [source.id, source]));
    const sources = (rebased.sources || []).map(source => {
      const known = baselineSources.get(source.id);
      if (edited.seedHashes || !known || known.url !== source.url || source.applicableYears?.length) return source;
      return { ...source, applicableYears: known.applicableYears, verifiedAt: source.verifiedAt || known.verifiedAt };
    });
    const archive = { ...rebased, sources, updatedAt };
    return { race, archive: legacy ? upgradeLegacyEvidence(archive, seed, saved) : archive };
  }
  const sources = new Map((seed.sources || []).map(source => [source.id, source]));
  for (const source of saved.sources || []) sources.set(source.id, source);
  const archive = { ...seed, ...saved, profile: { ...seed.profile, ...saved.profile }, sources: [...sources.values()] };
  if (saved.editions) archive.editions = saved.editions.map(edition => {
    if (edition.officialResources != null) return edition;
    const initial = seed.editions.find(item => String(item.year) === String(edition.year));
    return initial?.officialResources ? { ...edition, officialResources: initial.officialResources } : edition;
  }).concat(seed.editions.filter(edition => !saved.editions.some(item => String(item.year) === String(edition.year))));
  if (legacy) {
    archive.editions = saved.editions == null ? seed.editions : saved.editions.map(edition => {
      const initial = seed.editions.find(item => String(item.year) === String(edition.year));
      return initial ? { ...initial, ...edition } : edition;
    }).concat(seed.editions.filter(edition => !saved.editions.some(item => String(item.year) === String(edition.year))));
    upgradeLegacyEvidence(archive, seed, saved);
  }
  return { race: { ...baseline.race, ...edited.race }, archive };
}

module.exports = { mergeArchiveRecord, snapshotArchiveSeed, OFFICIAL_RESOURCE_CATEGORIES, officialResourceUrl };
