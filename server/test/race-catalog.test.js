require('./setup-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/index');

test('homepage race catalog is available to visitors with three distinct race brands', async () => {
  const response = await request(app).get('/marathon/api/race-catalog');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /application\/json/);
  assert.deepEqual(response.body.races.map(race => race.id), ['beijing', 'shanghai', 'xiamen']);
  assert.deepEqual(response.body.races.map(race => race.name), ['北京马拉松', '上海马拉松', '厦门马拉松']);
  assert.match(response.body.selectionNote, /不代表排名/);
  for (const race of response.body.races) {
    assert.ok(race.shortName && race.city && race.tagline);
    assert.equal(race.editions, undefined, 'basic catalog must not imply complete annual archives');
  }
});

test('international and domestic certifications retain their own year and evidence', async () => {
  const { body } = await request(app).get('/marathon/api/race-catalog').expect(200);
  assert.deepEqual(body.races.map(race => race.worldAthletics.label), ['金标', '白金标', '白金标']);
  for (const race of body.races) {
    assert.equal(race.caa.label, 'A类');
    for (const certification of [race.worldAthletics, race.caa]) {
      assert.equal(certification.year, '2026');
      assert.ok(certification.sourceIds.length > 0);
      for (const id of certification.sourceIds) {
        const source = race.sources.find(item => item.id === id);
        assert.ok(source, race.id + ' certification has no evidence');
        assert.match(source.url, /^https:\/\//);
      }
    }
  }
});
