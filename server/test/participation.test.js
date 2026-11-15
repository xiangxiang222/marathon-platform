require('./setup-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const Database = require('better-sqlite3');
const { randomUUID } = require('node:crypto');
const { app } = require('../src/index');
const { getDb } = require('../src/db');
const { installParticipation } = require('../src/participation');
const API = '/marathon/api';

async function account() {
  const result = await request(app).post(API + '/session').send({ nickname: '参赛流程' + randomUUID().slice(0, 8) }).expect(200);
  return { id: result.body.user.id, auth: { Authorization: 'Bearer ' + result.body.token } };
}
async function fixture() {
  const runner = await account(), owner = await account(), outsider = await account(), db = getDb();
  const insert = db.prepare("INSERT INTO clubs(name,code,owner_id,created_at) VALUES(?,?,?,?)");
  const clubs = [0, 1, 2].map(index => Number(insert.run('参赛团' + index, randomUUID().toUpperCase(), owner.id, new Date().toISOString()).lastInsertRowid));
  for (const clubId of clubs) db.prepare("INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,'owner')").run(clubId, owner.id, new Date().toISOString());
  for (const clubId of clubs.slice(0, 2)) db.prepare("INSERT INTO club_members(club_id,user_id,joined_at) VALUES(?,?,?)").run(clubId, runner.id, new Date().toISOString());
  return { runner, owner, outsider, clubs, db, plan: API + '/me/races/bishan', detail: API + '/races/bishan' };
}
async function visible(f, clubId) {
  const result = await request(app).get(API + '/clubs/' + clubId).set(f.owner.auth).expect(200);
  return result.body.board.find(item => item.race.id === 'bishan');
}

test('following and personal registration are independent, private and idempotent', async () => {
  const f = await fixture();
  await request(app).put(f.plan + '/follow').send({ following: true }).expect(401);
  await request(app).put(f.plan + '/follow').set(f.runner.auth).send({ following: 'yes' }).expect(400);
  await request(app).put(API + '/me/races/unknown/follow').set(f.runner.auth).send({ following: true }).expect(404);
  for (let i = 0; i < 2; i++) await request(app).put(f.plan + '/follow').set(f.runner.auth).send({ following: true }).expect(200);
  let me = (await request(app).get(API + '/me').set(f.runner.auth).expect(200)).body;
  assert.equal(me.plans.length, 0);
  assert.deepEqual(me.followedRaces.map(race => race.id), ['bishan']);
  assert.equal(await visible(f, f.clubs[0]), undefined);
  const list = await request(app).get(API + '/races?q=璧山').set(f.runner.auth).expect(200);
  assert.equal(list.body.races[0].following, true);
  assert.equal(list.body.races[0].myStatus, '');
  assert.equal(list.headers['cache-control'], 'private, no-store');
  const anonymous = await request(app).get(API + '/races?q=璧山').expect(200);
  assert.equal(anonymous.body.races[0].following, false);
  await request(app).put(f.plan).set(f.runner.auth).send({ status: '中签' }).expect(200);
  await request(app).put(f.plan + '/follow').set(f.runner.auth).send({ following: false }).expect(200);
  me = (await request(app).get(API + '/me').set(f.runner.auth)).body;
  assert.equal(me.followedRaces.length, 0);
  assert.equal(me.plans[0].status, '中签');
  await request(app).put(f.plan + '/follow').set(f.runner.auth).send({ following: true }).expect(200);
  await request(app).delete(f.plan).set(f.runner.auth).expect(200);
  assert.equal((await request(app).get(f.detail).set(f.runner.auth)).body.following, true);
});

test('only selected clubs receive plan, companionship, results, profile and reminder data', async () => {
  const f = await fixture();
  await request(app).put(f.plan).set(f.runner.auth).send({ status: '中签' }).expect(200);
  assert.equal(await visible(f, f.clubs[0]), undefined);
  await request(app).put(f.plan + '/sharing').set(f.runner.auth).send({ clubIds: [f.clubs[2]] }).expect(403);
  await request(app).put(f.plan).set(f.runner.auth).send({ status: '已缴费', sharedClubIds: [f.clubs[2]] }).expect(403);
  assert.equal((await request(app).get(f.detail).set(f.runner.auth)).body.myStatus, '中签', 'invalid sharing must not partially mutate status');
  for (const clubIds of [null, ['1'], [-1], [1.5]]) await request(app).put(f.plan + '/sharing').set(f.runner.auth).send({ clubIds }).expect(400);
  await request(app).put(f.plan + '/sharing').set(f.runner.auth).send({ clubIds: [f.clubs[0], f.clubs[0]] }).expect(200);
  await request(app).put(f.plan + '/companionship').set(f.runner.auth).send({ note: '周六上午领物，希望拼车。' }).expect(200);
  await request(app).put(f.plan + '/companionship').set(f.runner.auth).send({ note: '多'.repeat(201) }).expect(400);
  assert.equal((await request(app).get(f.plan + '/companionship').set(f.runner.auth)).body.companionNote, '周六上午领物，希望拼车。');
  const detail = (await request(app).get(f.detail).set(f.runner.auth)).body;
  assert.deepEqual(detail.sharedClubIds, [f.clubs[0]]);
  assert.deepEqual(detail.clubs.map(club => club.shared), [true, false]);
  assert.equal((await visible(f, f.clubs[0])).marks[0].note, '周六上午领物，希望拼车。');
  assert.equal(await visible(f, f.clubs[1]), undefined);
  assert.equal((await request(app).get(API + '/today').set(f.owner.auth)).body.tasks.filter(task => task.raceId === 'bishan' && task.kind === 'unpaid').length, 1);
  await request(app).put(f.plan).set(f.runner.auth).send({ status: '确认参赛' }).expect(200);
  assert.deepEqual((await request(app).get(f.detail).set(f.runner.auth)).body.sharedClubIds, [f.clubs[0]], 'status-only update retains sharing');
  await request(app).put(f.plan + '/result').set(f.runner.auth).send({ distance: 'full', time: '3:30:00' }).expect(200);
  assert.equal((await visible(f, f.clubs[0])).results[0].clock, '3:30:00');
  await request(app).put(f.plan + '/sharing').set(f.runner.auth).send({ clubIds: [] }).expect(200);
  for (const clubId of f.clubs.slice(0, 2)) {
    assert.equal(await visible(f, clubId), undefined, 'results cannot resurrect an unshared plan');
    const profile = (await request(app).get(API + '/clubs/' + clubId + '/members/' + f.runner.id + '/profile').set(f.owner.auth).expect(200)).body;
    assert.equal(profile.races.length, 0);
    assert.equal(profile.results.length, 0);
    assert.equal((await request(app).get(API + '/clubs/' + clubId).set(f.owner.auth)).body.ranks.length, 0);
  }
  const ownerDetail = (await request(app).get(f.detail).set(f.owner.auth)).body;
  assert.ok(ownerDetail.clubs.every(club => club.mates.length === 0));
  assert.equal((await request(app).get(API + '/today').set(f.owner.auth)).body.tasks.filter(task => task.raceId === 'bishan').length, 0);
  const card = (await request(app).get(f.detail + '/card?code=' + f.db.prepare('SELECT code FROM clubs WHERE id=?').get(f.clubs[0]).code).set(f.owner.auth).expect(200)).body;
  assert.equal(card.marks.length, 0);
  const me = (await request(app).get(API + '/me').set(f.runner.auth)).body;
  assert.equal(me.plans[0].status, '完赛');
  assert.equal(me.results[0].clock, '3:30:00');
  await request(app).get(f.plan + '/sheet').set(f.owner.auth).expect(404);
});

test('new memberships never opt in and leaving or removal revokes sharing while preserving personal data', async () => {
  const f = await fixture();
  await request(app).put(f.plan).set(f.runner.auth).send({ status: '已报名', sharedClubIds: f.clubs.slice(0, 2) }).expect(200);
  await request(app).put(f.plan + '/follow').set(f.runner.auth).send({ following: true }).expect(200);
  f.db.prepare("INSERT INTO club_members(club_id,user_id,joined_at) VALUES(?,?,?)").run(f.clubs[2], f.runner.id, new Date().toISOString());
  assert.equal(await visible(f, f.clubs[2]), undefined);
  await request(app).post(API + '/clubs/' + f.clubs[0] + '/leave').set(f.runner.auth).send({}).expect(200);
  f.db.prepare("INSERT INTO club_members(club_id,user_id,joined_at) VALUES(?,?,?)").run(f.clubs[0], f.runner.id, new Date().toISOString());
  assert.equal(await visible(f, f.clubs[0]), undefined);
  await request(app).delete(API + '/clubs/' + f.clubs[1] + '/members/' + f.runner.id).set(f.owner.auth).expect(200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM plan_club_shares WHERE user_id=?').get(f.runner.id).n, 0);
  const me = (await request(app).get(API + '/me').set(f.runner.auth)).body;
  assert.equal(me.plans[0].status, '已报名'); assert.equal(me.followedRaces.length, 1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM activity_signups WHERE user_id=?').get(f.runner.id).n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM meetup_joins WHERE user_id=?').get(f.runner.id).n, 0);
});

test('sharing and companion edits require an existing personal plan', async () => {
  const f = await fixture();
  for (const suffix of ['/sharing', '/companionship']) {
    await request(app).put(f.plan + suffix).send({ clubIds: [], note: '' }).expect(401);
    await request(app).put(f.plan + suffix).set(f.runner.auth).send({ clubIds: [], note: '' }).expect(404);
  }
  await request(app).get(f.plan + '/companionship').set(f.runner.auth).expect(404);
});

test('a self-submitted club result shares only that club; withdrawing or staff editing never re-enables sharing', async () => {
  const f = await fixture();
  const callPath = API + '/clubs/' + f.clubs[0] + '/calls';
  const created = (await request(app).post(callPath).set(f.owner.auth).send({ raceId: 'bishan', distances: ['full', 'half'], deadline: '2099-01-01T22:00' }).expect(200)).body.call;
  const rowsPath = callPath + '/' + created.id + '/rows';
  await request(app).put(f.plan + '/result').set(f.runner.auth).send({ distance: 'full', time: '3:50:00' }).expect(200);
  await request(app).post(rowsPath).set(f.runner.auth).send({ distance: 'full', time: '3:30:00' }).expect(200);
  const submitted = (await request(app).post(rowsPath).set(f.runner.auth).send({ distance: 'half', time: '1:45:00' }).expect(200)).body.call;
  const ownPlan = (await request(app).get(f.detail).set(f.runner.auth)).body;
  assert.deepEqual(ownPlan.sharedClubIds, [f.clubs[0]]);
  assert.equal(await visible(f, f.clubs[1]), undefined);
  for (const group of submitted.groups) for (const row of group.rows) assert.ok(!Object.hasOwn(row, 'replaced_seconds'), 'previous personal results stay internal');
  await request(app).put(f.plan + '/sharing').set(f.runner.auth).send({ clubIds: [] }).expect(200);
  const rowId = submitted.groups.find(group => group.distance === 'half').rows[0].id;
  await request(app).delete(rowsPath + '/' + rowId).set(f.runner.auth).expect(200);
  assert.equal(await visible(f, f.clubs[0]), undefined, 'deleting one of several call rows cannot turn sharing back on');
  await request(app).post(rowsPath).set(f.owner.auth).send({ userId: f.runner.id, distance: 'half', time: '1:50:00' }).expect(200);
  assert.equal(await visible(f, f.clubs[0]), undefined, 'staff filling a club record cannot opt a private personal plan back in');
});

test('upgrade snapshots existing shares once and never re-enables revoked or newly joined sharing', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY); CREATE TABLE clubs(id INTEGER PRIMARY KEY);
      CREATE TABLE races(id TEXT PRIMARY KEY); CREATE TABLE plans(user_id INTEGER,race_id TEXT);
      CREATE TABLE results(user_id INTEGER,race_id TEXT); CREATE TABLE club_members(user_id INTEGER,club_id INTEGER);
      INSERT INTO users VALUES(1); INSERT INTO clubs VALUES(1),(2); INSERT INTO races VALUES('legacy');
      INSERT INTO plans VALUES(1,'legacy'); INSERT INTO results VALUES(1,'result-only'); INSERT INTO club_members VALUES(1,1);`);
    installParticipation(db);
    assert.deepEqual(db.prepare('SELECT * FROM plan_club_shares').all(), [{ user_id: 1, race_id: 'legacy', club_id: 1 }]);
    db.exec("DELETE FROM plan_club_shares; INSERT INTO club_members VALUES(1,2)");
    installParticipation(db);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM plan_club_shares').get().n, 0);
    db.exec("INSERT INTO plan_club_shares VALUES(1,'legacy',1); DELETE FROM club_members WHERE club_id=1; INSERT INTO club_members VALUES(1,1)");
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM plan_club_shares').get().n, 0);
  } finally { db.close(); }
});
