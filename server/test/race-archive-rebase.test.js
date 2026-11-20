const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeArchiveRecord, snapshotArchiveSeed } = require('../src/race-archive-schema');

test('new research reaches an archive with saved edits without restoring deliberately removed material', () => {
  const map = { category: 'route-map', title: '2025 年图', url: 'https://example.org/2025', sourceIds: ['2025'] };
  const original = { race: { name: '赛事' }, archive: { updatedAt: '2026-11-19', editions: [{ year:'2025', registration: { fee:'100' }, officialResources:[map] }, { year:'2024' }] } };
  const edited = structuredClone(original);
  edited.archive.editions.pop();
  edited.archive.editions[0].registration.fee = '120';
  edited.archive.editions[0].officialResources[0].title = '人工维护的原图标题';
  edited.seedHashes = snapshotArchiveSeed(original);
  const refreshed = structuredClone(original);
  refreshed.archive.updatedAt = '2026-11-20';
  refreshed.archive.editions.unshift({ year:'2026' });
  refreshed.archive.editions[1].registration.payment = '11月9日前';
  refreshed.archive.editions[1].officialResources.push({ category:'results', url:'https://example.org/results-2025', title:'2025 年成绩公示', sourceIds:['2025'] });
  const merged = mergeArchiveRecord(refreshed, edited).archive;
  assert.deepEqual(merged.editions.map(item => item.year).sort(), ['2025','2026']);
  const edition = merged.editions.find(item => item.year === '2025');
  assert.deepEqual(edition.registration, { fee:'120', payment:'11月9日前' });
  assert.deepEqual(edition.officialResources.map(item=>item.title), ['人工维护的原图标题','2025 年成绩公示']);
  assert.equal(merged.updatedAt, '2026-11-20');
});

test('a classified old archive snapshot receives corrected links and results while keeping editorial text', () => {
  const source = { id:'2026-result', url:'https://example.org/2026', title:'2026 年成绩' };
  const currentSeed = { race: { name: '赛事' }, archive: { intro:'旧介绍', schemaVersion:2, sources:[{ ...source, applicableYears:['2026'], verifiedAt:'2026-11-20' }], editions:[{ year:'2026', results:[1,2,3], logistics:{collection:{time:'比赛前两天'}} }] } };
  const oldSaved = { ...currentSeed, archive: { intro:'人工介绍', schemaVersion:2, sources:[{ ...source, title:'运营修订了标题' }], editions:[{ year:'2026', results:[1], logistics:{collection:{time:''}} }] } };
  const older = { ...oldSaved, archive:{ ...oldSaved.archive, intro:'旧介绍', sources:[source] } };
  const fingerprints = snapshotArchiveSeed(older);
  fingerprints['/archive/editions/2026/logistics'] ||= '';
  const merged = mergeArchiveRecord(currentSeed, oldSaved, { normalized:snapshotArchiveSeed(currentSeed), raw:{}, older:[fingerprints] });
  assert.equal(merged.archive.intro, '人工介绍');
  assert.deepEqual(merged.archive.editions[0].results, [1,2,3]);
  assert.equal(merged.archive.editions[0].logistics.collection.time, '比赛前两天');
  assert.equal(merged.archive.sources[0].title, '运营修订了标题');
  assert.deepEqual(merged.archive.sources[0].applicableYears, ['2026']);
});
