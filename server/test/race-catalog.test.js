require('./setup-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/index');
const catalog = require('../../shared/race-catalog.json');

test('visitor catalog includes every distinct archive and explicit homepage selections', async () => {
  const response = await request(app).get('/marathon/api/race-catalog');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /application\/json/);
  assert.deepEqual(response.body.races.map(race => race.id), catalog.races.map(race => race.id));
  assert.equal(response.body.races.length, 17);
  assert.deepEqual(response.body.featuredIds, ['beijing', 'shanghai', 'xiamen']);
  assert.equal(new Set(response.body.races.map(race => race.id)).size, 17);
  assert.match(response.body.selectionNote, /不代表排名/);
  for (const race of response.body.races) {
    assert.ok(race.name && race.city && race.tagline);
    assert.equal(race.editions, undefined, 'basic catalog must not imply complete annual archives');
  }
});

test('international and domestic certifications retain their own year and evidence', async () => {
  const { body } = await request(app).get('/marathon/api/race-catalog').expect(200);
  for (const race of body.races) {
    for (const certification of [race.worldAthletics, race.caa]) {
      if (!certification.label) { assert.equal(certification.year, ''); continue; }
      assert.match(certification.year, /^20\d{2}$/);
      assert.ok(certification.sourceIds.length > 0);
      for (const id of certification.sourceIds) {
        const source = race.sources.find(item => item.id === id);
        assert.ok(source, race.id + ' certification has no evidence');
        assert.match(source.url, /^https?:\/\//);
      }
    }
  }
});

test('alias lookup and filter options remain stable after filtering', async () => {
  const all = (await request(app).get('/marathon/api/race-catalog').expect(200)).body;
  const filtered = (await request(app).get('/marathon/api/race-catalog?q=' + encodeURIComponent('东营')).expect(200)).body;
  assert.deepEqual(filtered.races.map(race => race.id), ['dongying']);
  assert.deepEqual(filtered.filterOptions, all.filterOptions);
});
