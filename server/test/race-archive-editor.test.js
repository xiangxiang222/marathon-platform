require('./setup-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const Database = require('better-sqlite3');
const { app } = require('../src/index');
const { getDb } = require('../src/db');
const { createAdmin, loginAdmin } = require('../src/admin-auth');
const { readArchiveEdit, imageRoot, MAX_IMAGE } = require('../src/race-archive-editor');
const API = '/marathon/api';
const editor = API + '/admin/race-archives';
const auth = { Authorization: 'Bearer archive-editor-test' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+kFioAAAAASUVORK5CYII=', 'base64');
const clone = value => JSON.parse(JSON.stringify(value));
test.before(() => { process.env.ADMIN_TOKEN = 'archive-editor-test'; });
test.afterEach(() => {
  const db = getDb();
  db.exec('DELETE FROM race_archive_edits; DELETE FROM race_archive_images;');
  fs.rmSync(imageRoot(), { recursive: true, force: true });
});

test('archive editor restricts all mutations and source records to platform administrators', async () => {
  await request(app).get(editor).expect(401);
  await request(app).get(editor + '/beijing').expect(401);
  await request(app).put(editor + '/beijing').send({}).expect(401);
  await request(app).post(editor + '/beijing/images').attach('file', png, 'one.png').expect(401);
  const db = getDb();
  createAdmin(db, 'archive_club_admin', 'archive-editor-pass123', 'club');
  const session = loginAdmin(db, 'archive_club_admin', 'archive-editor-pass123');
  await request(app).get(editor + '/beijing').set('Authorization', 'Bearer ' + session.token).expect(403);
  const result = await request(app).get(editor).set(auth).expect(200);
  assert.deepEqual(result.body.races.map(item => item.id), ['beijing', 'shanghai', 'xiamen']);
  await request(app).get(editor + '/unknown').set(auth).expect(404);
  await request(app).put(editor + '/__proto__').set(auth).send({}).expect(404);
});

test('saved facts and future editions persist in SQLite and immediately feed public catalog without changing shared research', async () => {
  const baseline = (await request(app).get(editor + '/beijing').set(auth).expect(200)).body;
  const sharedFile = path.join(__dirname, '../../shared/race-archives/beijing.json');
  const shared = fs.readFileSync(sharedFile, 'utf8');
  const value = clone(baseline);
  value.race.tagline = '管理员维护的新赛事介绍';
  value.race.name = '北京马拉松';
  value.race.worldAthletics = { label: '不允许改认证', year: '2099' };
  value.archive.intro = '后台手工维护的赛事简介，不要求外部资料链接。';
  value.archive.profile = { foundingYear: '1981' };
  value.archive.news = [{ id: 'news-1', title: '后台发布的消息', summary: '这是手工编辑的摘要', body: '这是手工编辑的完整正文', publishedAt: '2026-11-14', tag: '新闻' }];
  value.archive.updates = [{ id: 'story-1', title: '一个赛事新鲜事', body: '编辑手工填写内容', editionYear: '2025' }];
  value.archive.editions.push({ year: '2027', date: '2027-10-17', distance: '全程马拉松', route: { start: '起点', finish: '终点', summary: '起点 → 终点' }, registration: { method: '以后台发布为准' }, results: [], gear: [], participation: {}, logistics: {} });
  const saved = await request(app).put(editor + '/beijing').set(auth).send(value).expect(200);
  assert.equal(saved.body.ok, true);
  assert.equal(saved.body.archive.editions.at(-1).year, '2027');
  const restored = (await request(app).get(editor + '/beijing').set(auth).expect(200)).body;
  assert.equal(restored.archive.intro, value.archive.intro);
  const secondHandle = new Database(process.env.MARATHON_DB);
  try { assert.equal(readArchiveEdit(secondHandle, 'beijing').archive.news[0].title, '后台发布的消息'); }
  finally { secondHandle.close(); }
  const publicDetail = (await request(app).get(API + '/race-catalog/beijing').expect(200)).body;
  assert.equal(publicDetail.archive.intro, value.archive.intro);
  assert.equal(publicDetail.latestYear, '2027');
  assert.equal(publicDetail.archive.news[0].body, '这是手工编辑的完整正文');
  assert.equal(publicDetail.race.worldAthletics.label, baseline.race.worldAthletics.label);
  const publicList = (await request(app).get(API + '/race-catalog').expect(200)).body;
  assert.equal(publicList.races[0].latestYear, '2027');
  assert.equal(publicList.races[0].tagline, value.race.tagline);
  assert.equal(fs.readFileSync(sharedFile, 'utf8'), shared);
});

test('uploaded gallery images require confirmation, preserve ordered captions and remain scoped to one race', async () => {
  const uploaded = await request(app).post(editor + '/beijing/images').set(auth).attach('file', png, '../../not-a-storage-path.png').expect(200);
  assert.equal(uploaded.body.mime, 'image/png');
  assert.match(uploaded.body.url, /^\/marathon\/api\/race-archive-media\/beijing\/[a-f0-9]{64}\.png$/);
  const url = uploaded.body.url;
  const image = await request(app).get(url).expect(200).expect('Content-Type', /image\/png/);
  assert.equal(image.headers['x-content-type-options'], 'nosniff');
  assert.equal(image.body.length, png.length);
  await request(app).get(url.replace('/beijing/', '/shanghai/')).expect(404);
  await request(app).get(API + '/race-archive-media/beijing/%2e%2e%2fapp.sqlite').expect(404);
  await request(app).get(API + '/race-archive-media/beijing/not-real.png').expect(404);
  const value = (await request(app).get(editor + '/beijing').set(auth).expect(200)).body;
  const media = [{ url, caption: '正面' }, { url, caption: '背面' }];
  value.archive.hero = { imageUrl: url, alt: '管理员上传的赛事封面' };
  value.archive.editions[0].gear.find(item => item.category === '参赛服').images = media;
  value.archive.editions[0].route.mapUrl = url;
  value.archive.photoAlbums = [{ id: 'photos-2026', year: '2026', title: '北马官图', media }];
  value.archive.updates = [{ id: 'fresh-1', title: '带配图的新鲜事', images: media }];
  await request(app).put(editor + '/beijing').set(auth).send(value).expect(400);
  await request(app).put(editor + '/beijing').set(auth).send({ ...value, mediaConfirmed: true }).expect(200);
  const result = (await request(app).get(API + '/race-catalog/beijing').expect(200)).body.archive;
  assert.equal(result.hero.imageUrl, url);
  assert.equal(result.editions[0].route.mapUrl, url);
  assert.deepEqual(result.editions[0].gear.find(item => item.category === '参赛服').images.map(item => item.caption), ['正面', '背面']);
  assert.equal(result.photoAlbums[0].media.length, 2);
  assert.equal(result.updates[0].images[0].url, url);
  const other = (await request(app).get(editor + '/shanghai').set(auth).expect(200)).body;
  other.archive.hero = { imageUrl: url };
  await request(app).put(editor + '/shanghai').set(auth).send({ ...other, mediaConfirmed: true }).expect(400);
});

test('editor rejects unsupported files, malformed data and arbitrary image addresses without saving partial facts', async () => {
  await request(app).post(editor + '/beijing/images').set(auth).attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'not-image.png').expect(400);
  await request(app).post(editor + '/beijing/images').set(auth).attach('file', Buffer.from([255, 216, 255, 217]), 'bad.jpg').expect(400);
  await request(app).post(editor + '/beijing/images').set(auth).attach('file', png, 'a.png').attach('file', png, 'b.png').expect(400);
  await request(app).post(editor + '/beijing/images').set(auth).attach('file', Buffer.alloc(MAX_IMAGE + 1, 1), 'large.png').expect(413);
  await request(app).post(editor + '/missing/images').set(auth).attach('file', png, 'a.png').expect(404);
  const baseline = (await request(app).get(editor + '/beijing').set(auth).expect(200)).body;
  for (const mutate of [
    value => { value.archive.hero = { imageUrl: 'https://example.com/unverified.jpg' }; },
    value => { value.archive.editions[0].gear[0].images = [{ url: 'javascript:alert(1)' }]; },
    value => { value.archive.editions.push(clone(value.archive.editions[0])); },
    value => { value.archive.editions[0].date = '2026-02-30'; },
    value => { value.archive.editions[0].results[0].time = '02:60:00'; },
    value => { value.archive.profile = { foundingYear: 'abc' }; },
    value => { value.race.name = ''; }
  ]) {
    const value = clone(baseline); mutate(value);
    await request(app).put(editor + '/beijing').set(auth).send({ ...value, mediaConfirmed: true }).expect(400);
  }
  assert.equal(readArchiveEdit(getDb(), 'beijing'), null);
});

test('previously confirmed archive images allow text-only saves without repeating confirmation but new images still require it', async () => {
  const url = (await request(app).post(editor + '/beijing/images').set(auth).attach('file', png, 'first.png').expect(200)).body.url;
  const value = (await request(app).get(editor + '/beijing').set(auth).expect(200)).body;
  const forgedRights = { status: 'admin-confirmed', title: '伪造确认', holder: '客户端', confirmedAt: '2026-11-14T00:00:00Z' };
  const media = [{ url, caption: '封面', mediaRights: forgedRights }];
  value.archive.hero = { imageUrl: url, mediaRights: forgedRights };
  value.archive.editions[0].route = { ...value.archive.editions[0].route, mapUrl: url, images: media, mediaRights: forgedRights };
  Object.assign(value.archive.editions[0].gear[0], { imageUrl: url, images: media, mediaRights: forgedRights });
  value.archive.photoAlbums = [{ id: 'album-2026', year: '2026', title: '年度相册', media }];
  value.archive.updates = [{ id: 'update-1', title: '赛事故事', images: media }];
  value.archive.news = [{ id: 'news-1', title: '赛事消息', images: media }];
  await request(app).put(editor + '/beijing').set(auth).send(value).expect(400);
  await request(app).put(editor + '/beijing').set(auth).send({ ...value, mediaConfirmed: true }).expect(200);

  const stored = (await request(app).get(editor + '/beijing').set(auth).expect(200)).body;
  const originalConfirmation = stored.archive.hero.mediaRights.confirmedAt;
  assert.notEqual(stored.archive.hero.mediaRights.holder, forgedRights.holder);
  stored.archive.intro = '再次进入编辑器，只修改介绍。';
  stored.archive.news[0].title = '更新消息标题';
  const edited = await request(app).put(editor + '/beijing').set(auth).send({ ...stored, mediaConfirmed: false }).expect(200);
  assert.equal(edited.body.archive.intro, stored.archive.intro);
  assert.equal(edited.body.archive.hero.mediaRights.confirmedAt, originalConfirmation);
  assert.equal(edited.body.archive.news[0].title, '更新消息标题');
  assert.equal((await request(app).get(API + '/race-catalog/beijing').expect(200)).body.archive.hero.imageUrl, url);

  const secondPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  const newUrl = (await request(app).post(editor + '/beijing/images').set(auth).attach('file', secondPng, 'second.png').expect(200)).body.url;
  assert.notEqual(newUrl, url);
  const changed = clone(edited.body);
  changed.archive.hero = { imageUrl: newUrl, mediaRights: edited.body.archive.hero.mediaRights };
  await request(app).put(editor + '/beijing').set(auth).send({ ...changed, mediaConfirmed: false }).expect(400);
  assert.equal(readArchiveEdit(getDb(), 'beijing').archive.hero.imageUrl, url, 'Failed confirmation keeps the published image');
  await request(app).put(editor + '/beijing').set(auth).send({ ...changed, mediaConfirmed: true }).expect(200);
});
