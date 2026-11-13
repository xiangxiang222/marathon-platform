require('./setup-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/index');
const { getDb } = require('../src/db');
const { raceArchiveId } = require('../src/race-catalog');
const base = '/marathon/api';

test('catalog searches names and aliases and intersects independent certification filters', async () => {
  const read = async suffix => (await request(app).get(base + '/race-catalog' + suffix).expect(200)).body.races;
  assert.deepEqual((await read('?q=' + encodeURIComponent('北马'))).map(r => r.id), ['beijing']);
  assert.deepEqual((await read('?wa=' + encodeURIComponent('白金标') + '&caa=' + encodeURIComponent('A类'))).map(r => r.id), ['shanghai', 'xiamen']);
  assert.equal((await read('?q=' + encodeURIComponent('北京') + '&wa=' + encodeURIComponent('白金标'))).length, 0);
  assert.equal((await read('?caa=' + encodeURIComponent('未收录类别'))).length, 0);
});

test('race brand links exclude half marathons, online events and unrelated cities', () => {
  assert.equal(raceArchiveId({ name: '2026中国银行北京马拉松', meet: 'offline' }), 'beijing');
  assert.equal(raceArchiveId({ name: '2025上海马拉松' }), 'shanghai');
  assert.equal(raceArchiveId({ name: '2025上海马拉松', distances: ['full'] }), 'shanghai');
  for (const race of [
    { name: '2026北京半程马拉松' }, { name: '2026上海马拉松线上赛' },
    { name: '2026厦门马拉松', meet: 'online' }, { name: '2026厦门海沧半程马拉松' },
    { name: '2026北京马拉松', kinds: 'trail' }, { name: '2026西安马拉松' },
    { name: '2026上海马拉松10K', distances: '10k' }, { name: '2026北京马拉松接力赛' },
    { name: '2026厦门马拉松', distances: ['half'] }
  ]) assert.equal(raceArchiveId(race), '', race.name);
});

test('annual archives retain each year independently and resolve all evidence references', async () => {
  for (const id of ['beijing', 'shanghai', 'xiamen']) {
    const { body } = await request(app).get(base + '/race-catalog/' + id).expect(200);
    assert.equal(body.race.id, id);
    assert.equal(body.archive.raceId, id);
    assert.ok(body.years.length >= 3, id + ' needs at least three historical editions');
    assert.equal(body.latestYear, [...body.years].sort((a, b) => Number(b) - Number(a))[0]);
    assert.ok(body.years.includes(body.defaultYear));
    assert.equal(new Set(body.years).size, body.years.length);
    const evidence = new Set(body.archive.sources.map(source => source.id));
    for (const source of body.archive.sources) {
      assert.match(source.url, /^https:\/\//);
      assert.ok(source.title && source.publisher);
    }
    const walk = value => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (key.endsWith('SourceIds') || key === 'sourceIds') {
          for (const ref of child) assert.ok(evidence.has(ref), id + ': missing evidence ' + ref);
        } else walk(child);
      }
    };
    walk(body.archive);
    for (const edition of body.archive.editions) {
      assert.match(edition.year, /^20\d{2}$/);
      assert.ok(!edition.date || edition.date.startsWith(edition.year + '-'));
      assert.ok(edition.route && edition.registration && edition.participation);
      if (edition.route.start || edition.route.finish || edition.route.mapUrl) assert.ok(edition.route.sourceIds.length, id + ' ' + edition.year + ' route source missing');
      if (edition.registration.method || edition.registration.applicants || edition.registration.lotteryRate) assert.ok(edition.registration.sourceIds.length, id + ' ' + edition.year + ' registration source missing');
      if (edition.date && edition.date <= '2026-11-14') assert.ok(edition.gear.length, id + ' ' + edition.year + ' needs verified race materials');
      for (const value of [edition.registration.lotteryRate, edition.participation.finishRate]) assert.notEqual(value, '0%', 'missing statistics are not zero');
    }
  }
  await request(app).get(base + '/race-catalog/not-a-race').expect(404);
  await request(app).get(base + '/race-catalog/__proto__').expect(404);
});

test('public registration pages and permanent archives link only to the matching full race', async () => {
  const db = getDb();
  const insert = db.prepare('INSERT INTO races (id,name,city,province,distances,race_date,deadline,place,meet) VALUES (?,?,?,?,?,?,?,?,?)');
  const rows = [
    ['archive-full-fixture', '2025上海马拉松', '上海', '上海', 'full', '2025-11-30', '', '上海', 'offline'],
    ['archive-half-fixture', '2025上海半程马拉松', '上海', '上海', 'half', '2025-04-20', '', '上海', 'offline'],
    ['archive-online-fixture', '2025上海马拉松', '上海', '上海', 'full', '2025-11-30', '', '上海', 'online']
  ];
  rows.forEach(row => insert.run(...row));
  try {
    const full = (await request(app).get(base + '/races/archive-full-fixture').expect(200)).body;
    assert.equal(full.race.archiveId, 'shanghai');
    const half = (await request(app).get(base + '/races/archive-half-fixture').expect(200)).body;
    assert.equal(half.race.archiveId, '');
    const archive = (await request(app).get(base + '/race-catalog/shanghai').expect(200)).body;
    assert.ok(archive.relatedRaces.some(row => row.id === 'archive-full-fixture'));
    assert.ok(!archive.relatedRaces.some(row => row.id === 'archive-half-fixture' || row.id === 'archive-online-fixture'));
    assert.equal(archive.relatedRaces.find(row => row.id === 'archive-full-fixture').raceDate, '2025-11-30');
  } finally { rows.forEach(row => db.prepare('DELETE FROM races WHERE id=?').run(row[0])); }
});

test('cached images belong to an edition and point to existing deployable public assets', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const id of ['beijing', 'shanghai', 'xiamen']) {
    const { body } = await request(app).get(base + '/race-catalog/' + id).expect(200);
    for (const edition of body.archive.editions) {
      const images = [edition.route.mapUrl, ...edition.gear.map(item => item.imageUrl)].filter(Boolean);
      for (const image of images) {
        if (image.startsWith('/marathon/images/race-archives/')) {
          assert.ok(fs.existsSync(path.resolve(__dirname, '../../web/public', image.slice('/marathon/'.length))), image);
          assert.ok(image.includes(id + '-' + edition.year + '-'), 'cached image must retain its race and edition');
        } else assert.match(image, /^https:\/\//);
      }
      if (edition.date > '2026-11-14') {
        assert.equal(edition.results.length, 0, 'an upcoming edition has no race results');
        assert.equal(edition.participation.starters, '');
        assert.equal(edition.participation.finishers, '');
      }
    }
  }
});
