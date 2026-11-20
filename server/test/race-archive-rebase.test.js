const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeArchiveRecord, snapshotArchiveSeed } = require('../src/race-archive-schema');
const { publicEdition } = require('../src/race-catalog');

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

test('a snapshot from before schema versioning receives results and map links without losing manual changes', () => {
  const source = { id: 'map', title: '赛道图', url: 'https://example.org/map' };
  const oldResults = [{ group: '男子冠军', athlete: '选手一', time: '02:03:10' }];
  const oldGear = [{ category: '参赛服', name: '赛事背心' }];
  const oldSeed = {
    race: { name: '赛事' },
    archive: {
      intro: '旧介绍', updatedAt: '2026-11-14', sources: [source],
      editions: [
        { year: '2026', date: '2026-11-01', distance: '全程', results: oldResults, gear: oldGear, logistics: { collection: { time: '' } } },
        { year: '2025', date: '2025-11-01', distance: '全程', results: oldResults }
      ]
    }
  };
  const saved = structuredClone(oldSeed);
  saved.archive.updatedAt = '2026-11-17';
  saved.archive.intro = '人工撰写的介绍';
  saved.archive.editions[0].gear[0].name = '人工修订的物品名称';
  Object.assign(saved.archive.editions[1], { date: '2025-11-02', distance: '半程', results: [] });

  const refreshed = structuredClone(oldSeed);
  Object.assign(refreshed.archive, { schemaVersion: 2, updatedAt: '2026-11-20', introSourceIds: ['map'] });
  refreshed.archive.sources[0].applicableYears = ['2026'];
  Object.assign(refreshed.archive.editions[0], {
    date: '2026-11-08', status: 'completed',
    results: [...oldResults, { group: '男子第二名', athlete: '选手二', time: '02:05:10' }],
    officialResources: [{ category: 'route-map', title: source.title, url: source.url, sourceIds: ['map'] }],
    logistics: { collection: { time: '比赛前两天' } }
  });
  Object.assign(refreshed.archive.editions[1], { status: 'completed', events: [{ project: '全程' }] });

  const { archive } = mergeArchiveRecord(refreshed, saved, {
    normalized: snapshotArchiveSeed(refreshed),
    legacy: snapshotArchiveSeed(oldSeed)
  });
  const [current, previous] = archive.editions;
  assert.equal(archive.updatedAt, '2026-11-20');
  assert.equal(archive.intro, '人工撰写的介绍');
  assert.deepEqual(archive.introSourceIds, []);
  assert.equal(current.date, '2026-11-08');
  assert.equal(current.status, 'completed');
  assert.equal(current.results.length, 2);
  assert.equal(current.logistics.collection.time, '比赛前两天');
  assert.equal(current.gear[0].name, '人工修订的物品名称');
  assert.deepEqual(publicEdition(current, archive).officialResources, refreshed.archive.editions[0].officialResources);
  assert.equal(previous.date, '2025-11-02');
  assert.equal(previous.distance, '半程');
  assert.equal(previous.status, '');
  assert.deepEqual(previous.events, []);
  assert.deepEqual(previous.results, []);
});

test('a saved package photo does not hide updated shirt and medal descriptions in the same edition', () => {
  const pack = { category: '参赛包', name: '年度参赛包', description: '原参赛包说明' };
  const shirt = { category: '参赛服', name: '年度参赛服', description: '待补充' };
  const medal = { category: '奖牌', name: '年度奖牌', description: '待补充' };
  const old = { race: {}, archive: { editions: [{ year: '2025', gear: [pack, shirt, medal] }] } };
  const saved = structuredClone(old);
  saved.archive.editions[0].gear[0].imageUrl = '/marathon/api/race-archive-media/beijing/saved.jpg';
  saved.archive.editions[0].gear.pop();
  const seed = structuredClone(old);
  seed.archive.schemaVersion = 2;
  const [savedPack, savedShirt] = saved.archive.editions[0].gear;
  seed.archive.editions[0].gear[1].description = '红色参赛背心';
  seed.archive.editions[0].gear[1].sourceIds = ['kit-release'];
  seed.archive.editions[0].gear[2].description = '2025 年奖牌介绍';
  const historical = { legacy: snapshotArchiveSeed(old) };
  const { archive } = mergeArchiveRecord(seed, saved, historical);
  assert.deepEqual(archive.editions[0].gear, [
    savedPack,
    { ...savedShirt, description: '红色参赛背心', sourceIds: ['kit-release'] }
  ]);

  const hashesWithoutGearItems = { ...historical.legacy };
  for (const key of Object.keys(hashesWithoutGearItems)) {
    if (key.startsWith('/archive/editions/2025/gear/')) delete hashesWithoutGearItems[key];
  }
  saved.archive.schemaVersion = 2;
  saved.seedHashes = hashesWithoutGearItems;
  assert.deepEqual(mergeArchiveRecord(seed, saved).archive.editions[0].gear, saved.archive.editions[0].gear);
});
