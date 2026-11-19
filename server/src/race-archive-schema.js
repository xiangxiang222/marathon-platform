// Upgrade missing structure only. Existing editorial text, images and explicit
// empty arrays in a current schema remain authoritative over the seed JSON.
function mergeArchiveRecord(baseline, edited) {
  if (!baseline) return null;
  if (!edited) return baseline;
  const seed = baseline.archive, saved = edited.archive || {};
  const sources = new Map((seed.sources || []).map(source => [source.id, source]));
  for (const source of saved.sources || []) sources.set(source.id, source);
  const archive = { ...seed, ...saved, profile: { ...seed.profile, ...saved.profile }, sources: [...sources.values()] };
  if ((saved.schemaVersion || 1) < 2) {
    const uncited = [];
    if (saved.intro !== undefined && saved.intro !== seed.intro && !saved.introSourceIds) {
      archive.introSourceIds = [];
      uncited.push('简介');
    }
    for (const [field, citation] of [['foundingYear','foundingYearSourceIds'], ['positioning','positioningSourceIds'], ['entryNotes','entrySourceIds']]) {
      if (saved.profile?.[field] !== undefined && saved.profile[field] !== seed.profile?.[field] && !saved.profile[citation]) {
        archive.profile[citation] = [];
        uncited.push(field);
      }
    }
    if (uncited.length) archive.gaps = [...(archive.gaps || []), { fields: uncited, reason: '旧维护版本中的人工修改已保留，相关资料依据需由维护者重新确认。' }];
    archive.editions = saved.editions == null ? seed.editions : saved.editions.map(edition => {
      const initial = seed.editions.find(item => String(item.year) === String(edition.year));
      if (!initial) return edition;
      const merged = { ...initial, ...edition };
      if (edition.date !== initial.date && edition.status === undefined) merged.status = '';
      if (edition.distance !== initial.distance && edition.events === undefined) merged.events = [];
      return merged;
    });
  }
  return { race: { ...baseline.race, ...edited.race }, archive };
}

module.exports = { mergeArchiveRecord };
