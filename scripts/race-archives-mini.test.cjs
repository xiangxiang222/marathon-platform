'use strict';
/* Actual mini Page methods and authored archive JSON; isolated transport only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const catalog = require('../shared/race-catalog.json');
const archives = Object.fromEntries(catalog.races.map(race => [race.id, require('../shared/race-archives/' + race.id + '.json')]));
const copy = value => JSON.parse(JSON.stringify(value));
const settle = async () => { await Promise.resolve(); await new Promise(resolve => setImmediate(resolve)); };
const event = (dataset, value) => ({ currentTarget: { dataset: dataset || {} }, detail: { value } });
function fixture(pageName = 'race-archive') {
  let definition, reply;
  const requests = [], clipboard = [], previews = [], patches = [];
  reply = async url => {
    if (url.startsWith('/race-catalog?')) return { races: copy(catalog.races) };
    const id = decodeURIComponent(url.split('/').at(-1)), race = catalog.races.find(item => item.id === id);
    if (!race) throw Error('不存在的档案');
    const archive = archives[id], years = archive.editions.map(edition => String(edition.year)).sort((a, b) => Number(b) - Number(a));
    const defaultEdition = [...archive.editions].sort((a, b) => Number(b.year) - Number(a.year)).find(edition => edition.route.sourceIds.length && edition.registration.sourceIds.length);
    const defaultYear = defaultEdition ? String(defaultEdition.year) : years[0];
    return copy({ race, archive, years, latestYear: years[0], defaultYear, relatedRaces: [{ id: 'fixture-full-' + id, name: '2026' + race.name, raceDate: '2026-11-01' }, { id: 'fixture-2025-' + id, name: '2025' + race.name, raceDate: '2025-11-01' }] });
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'miniprogram/pages', pageName, pageName + '.js'), 'utf8'), {
    Page(value) { definition = value; }, getApp: () => ({ globalData: { baseUrl: 'https://runner.example' } }),
    require(name) { assert.equal(name, '../../utils/request'); return { request(url) { requests.push(url); return Promise.resolve().then(() => reply(url)); } }; },
    wx: { setNavigationBarTitle() {}, setClipboardData(value) { clipboard.push(value.data); }, previewImage(value) { previews.push(value); } }
  }, { filename: pageName + '.js' });
  const page = { ...definition, data: copy(definition.data), setData(patch) {
    patches.push(copy(patch));
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.'); let target = this.data;
      for (const part of parts.slice(0, -1)) { if (!target[part]) target[part] = {}; target = target[part]; }
      target[parts.at(-1)] = value;
    }
  } };
  return { page, requests, clipboard, previews, patches, setReply(fn) { reply = fn; } };
}

test('all three real archives switch every annual module and cited sources together', async () => {
  for (const race of catalog.races) {
    const { page } = fixture(); page.onLoad({ id: race.id }); await settle();
    assert.equal(page.data.race.id, race.id); assert.equal(page.data.loading, false);
    const defaultEdition = [...archives[race.id].editions].sort((a, b) => Number(b.year) - Number(a.year)).find(edition => edition.route.sourceIds.length && edition.registration.sourceIds.length);
    assert.equal(page.data.year, String(defaultEdition ? defaultEdition.year : page.data.years[0]));
    for (let index = 0; index < page.data.years.length; index++) {
      page.pickYear(event({}, String(index)));
      const expected = archives[race.id].editions.find(edition => String(edition.year) === page.data.year);
      assert.equal(page.data.edition.date, expected.date);
      assert.equal(page.data.edition.route.summary, expected.route.summary);
      assert.equal(page.data.edition.registration.applicants, expected.registration.applicants);
      assert.equal(page.data.edition.participation.finishers, expected.participation.finishers);
      assert.deepEqual(copy(page.data.edition.results), expected.results);
      assert.equal(page.data.edition.gear.length, expected.gear.length);
      for (const tab of ['route', 'registration', 'participation', 'gear', 'stories']) {
        page.pickTab(event({ id: tab }));
        assert.equal(page.data.tab, tab);
        if (tab === 'registration') assert.ok(page.data.activeSources.every(source => expected.registration.sourceIds.includes(source.id)));
      }
    }
  }
});

test('invalid years fall back to the latest sourced edition and return links require a related race', async () => {
  for (const race of catalog.races) {
    const invalid = fixture(); invalid.page.onLoad({ id: race.id, year: '1900', fromRaceId: 'arbitrary-race', tab: 'unknown' }); await settle();
    const expected = [...archives[race.id].editions].sort((a, b) => Number(b.year) - Number(a.year)).find(edition => edition.route.sourceIds.length && edition.registration.sourceIds.length);
    assert.equal(invalid.page.data.year, String(expected ? expected.year : invalid.page.data.years[0]));
    assert.equal(invalid.page.data.fromRace, null); assert.equal(invalid.page.data.tab, 'overview');
  }
  const valid = fixture(); valid.page.onLoad({ id: 'beijing', fromRaceId: 'fixture-full-beijing', tab: 'registration' }); await settle();
  assert.equal(valid.page.data.fromRace.id, 'fixture-full-beijing');
  const old = fixture(); old.page.onLoad({ id: 'beijing', fromRaceId: 'fixture-2025-beijing' }); await settle();
  assert.equal(old.page.data.year, '2025', 'Entry from a known annual race selects that year');
  const share = valid.page.onShareAppMessage();
  assert.ok(share.path.includes('id=beijing')); assert.ok(share.path.includes('year=' + valid.page.data.year)); assert.ok(share.path.includes('tab=registration'));
});

test('unloading archive and directory pages suppresses late asynchronous responses', async () => {
  for (const name of ['race-archive', 'race-catalog']) {
    const f = fixture(name); let resolve;
    f.setReply(() => new Promise(done => { resolve = done; }));
    f.page.onLoad({ id: 'beijing' }); await settle(); f.page.onUnload();
    const before = f.patches.length;
    resolve(name === 'race-catalog' ? { races: copy(catalog.races) } : { race: catalog.races[0], archive: archives.beijing, years: ['2026'], latestYear: '2026' });
    await settle(); assert.equal(f.patches.length, before);
  }
});

test('image failures fall back locally and copying or previewing rejects untrusted URL schemes', async () => {
  const f = fixture(); f.page.onLoad({ id: 'beijing' }); await settle();
  f.page.routeImageError(); assert.equal(f.page.data.edition.route.imageFailed, true);
  f.page.pickTab(event({ id: 'gear' }));
  assert.ok(f.page.data.edition.gear.length); f.page.gearImageError(event({ index: 0 }));
  assert.equal(f.page.data.edition.gear[0].imageFailed, true);
  for (const url of ['javascript:alert(1)', 'data:text/html,unsafe', '//evil.example/path', 'http://example.com/untrusted']) {
    f.page.copyUrl(event({ url })); f.page.previewImage(event({ url }));
  }
  assert.equal(f.clipboard.length, 0); assert.equal(f.previews.length, 0);
  const source = archives.beijing.sources.find(item => item.url.startsWith('https://'));
  f.page.copyUrl(event({ url: source.url })); f.page.previewImage(event({ url: 'https://example.com/verified-image.jpg' }));
  assert.deepEqual(f.clipboard, [source.url]); assert.equal(f.previews.length, 1);
});

test('directory encodes independent filters and handles failure, retry and empty results', async () => {
  const f = fixture('race-catalog'); f.page.onLoad({}); await settle();
  assert.equal(f.page.data.races.length, 3);
  f.page.onQ(event({}, '北马')); f.page.pickWa(event({}, '1')); await settle(); f.page.pickCaa(event({}, '1')); await settle();
  const query = new URL(f.requests.at(-1), 'https://local.example').searchParams;
  assert.equal(query.get('q'), '北马'); assert.equal(query.get('wa'), '白金标'); assert.equal(query.get('caa'), 'A类');
  f.setReply(() => { throw Error('暂时不可用'); }); await f.page.load(); assert.equal(f.page.data.message, '暂时不可用');
  f.setReply(() => ({ races: [] })); await f.page.load(); assert.equal(f.page.data.message, ''); assert.equal(f.page.data.loading, false); assert.equal(f.page.data.races.length, 0);
});
