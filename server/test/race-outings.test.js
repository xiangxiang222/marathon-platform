require('./setup-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { randomUUID } = require('node:crypto');
const { app } = require('../src/index');
const { getDb } = require('../src/db');
const { outingInstant } = require('../src/race-outings');
const { squadOf, presentRace, reminderHits } = require('../src/races');
const API = '/marathon/api';
const future = () => new Date(Date.now() + 8 * 3600000 + 86400000).toISOString().slice(0, 16);
async function account() {
  const value = (await request(app).post(API + '/session').send({ nickname: '同行' + randomUUID().slice(0, 8) }).expect(200)).body;
  return { id: value.user.id, auth: { Authorization: 'Bearer ' + value.token } };
}
async function fixture() {
  const owner = await account(), host = await account(), a = await account(), b = await account(), outsider = await account(), db = getDb();
  const clubs = [0, 1].map(index => Number(db.prepare('INSERT INTO clubs(name,code,owner_id,created_at) VALUES(?,?,?,?)').run('同行团' + index, randomUUID(), owner.id, new Date().toISOString()).lastInsertRowid));
  for (const club of clubs) {
    for (const user of [owner, host, a, b]) db.prepare('INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,?)').run(club, user.id, new Date().toISOString(), user === owner ? 'owner' : 'member');
  }
  const base = API + '/races/bishan/outings';
  const value = { clubId: clubs[0], kind: 'carpool', startsAt: future(), place: '北门集合点', capacity: 2, note: '各自确认行程' };
  const create = async (patch = {}, actor = host) => (await request(app).post(base).set(actor.auth).send({ ...value, ...patch }).expect(201)).body.outing;
  return { db, owner, host, a, b, outsider, clubs, base, value, create };
}

test('outings require current club membership, validate future Beijing dates and remain independent of personal plans', async () => {
  const f = await fixture();
  await request(app).get(f.base).expect(401);
  await request(app).post(f.base).send(f.value).expect(401);
  await request(app).get(API + '/races/unknown/outings').set(f.host.auth).expect(404);
  for (const patch of [{ kind: 'constructor' }, { startsAt: '2099-02-30T08:00' }, { startsAt: '2099-02-01T24:00' }, { startsAt: '2000-01-01T08:00' }, { startsAt: '2099-02-01T08:00Z' }, { clubId: '1' }, { capacity: 0 }, { capacity: 101 }, { capacity: 1.5 }, { place: ' ' }, { note: '字'.repeat(301) }]) {
    await request(app).post(f.base).set(f.host.auth).send({ ...f.value, ...patch }).expect(400);
  }
  assert.equal(outingInstant('2099-01-01T08:00'), Date.parse('2099-01-01T00:00:00Z'));
  await request(app).post(f.base).set(f.outsider.auth).send(f.value).expect(403);
  const outing = await f.create();
  assert.equal(outing.kindLabel, '拼车'); assert.equal(outing.memberCount, 1); assert.equal(outing.remaining, 1);
  assert.equal(outing.joined, true); assert.equal(outing.canJoin, false); assert.equal(outing.canCancel, true); assert.equal(outing.isHost, true);
  assert.deepEqual(outing.host, { userId: f.host.id, nickname: outing.host.nickname });
  const own = (await request(app).get(f.base).set(f.a.auth).expect(200)).body.outings;
  assert.deepEqual(own.map(item => item.id), [outing.id]); assert.equal(own[0].canJoin, true); assert.equal(own[0].canCancel, false);
  assert.deepEqual((await request(app).get(f.base).set(f.outsider.auth).expect(200)).body.outings, []);
  for (const actor of [f.host, f.a]) {
    const me = (await request(app).get(API + '/me').set(actor.auth).expect(200)).body;
    assert.deepEqual(me.plans, []); assert.deepEqual(me.followedRaces, []);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM plan_club_shares WHERE user_id=?').get(actor.id).n, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM activity_signups WHERE user_id=?').get(actor.id).n, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM meetup_joins WHERE user_id=?').get(actor.id).n, 0);
  }
});

test('competing joins cannot oversell, membership is idempotent and only host or club staff can cancel', async () => {
  const f = await fixture(), outing = await f.create(), member = f.base + '/' + outing.id + '/membership';
  const attempts = await Promise.all([f.a, f.b].map(actor => request(app).put(member).set(actor.auth).send({ joined: true })));
  assert.deepEqual(attempts.map(item => item.status).sort(), [200, 409]);
  const winner = attempts[0].status === 200 ? f.a : f.b, loser = winner === f.a ? f.b : f.a;
  const repeated = (await request(app).put(member).set(winner.auth).send({ joined: true }).expect(200)).body.outing;
  assert.equal(repeated.memberCount, 2); assert.equal(repeated.remaining, 0);
  await request(app).put(member).set(f.host.auth).send({ joined: false }).expect(400);
  await request(app).put(member).set(f.outsider.auth).send({ joined: true }).expect(404);
  await request(app).put(API + '/races/hailing/outings/' + outing.id + '/membership').set(winner.auth).send({ joined: true }).expect(404);
  for (let i = 0; i < 2; i++) await request(app).put(member).set(winner.auth).send({ joined: false }).expect(200);
  assert.equal((await request(app).put(member).set(loser.auth).send({ joined: true }).expect(200)).body.outing.memberCount, 2);
  await request(app).delete(f.base + '/' + outing.id).set(loser.auth).expect(403);
  await request(app).delete(f.base + '/' + outing.id).set(f.outsider.auth).expect(404);
  for (let i = 0; i < 2; i++) await request(app).delete(f.base + '/' + outing.id).set(f.owner.auth).expect(200);
  assert.ok(!(await request(app).get(f.base).set(f.host.auth)).body.outings.some(item => item.id === outing.id));
  await request(app).put(member).set(winner.auth).send({ joined: true }).expect(409);
  const second = await f.create({ kind: 'pickup' });
  await request(app).delete(f.base + '/' + second.id).set(f.host.auth).expect(200);
  const third = await f.create({ kind: 'gather' });
  f.db.prepare("UPDATE club_members SET role='manager' WHERE club_id=? AND user_id=?").run(f.clubs[0], f.a.id);
  const managerJoin = (await request(app).put(f.base + '/' + third.id + '/membership').set(f.a.auth).send({ joined: true }).expect(200)).body.outing;
  assert.equal(managerJoin.canCancel, true); assert.equal(managerJoin.isHost, false);
  await request(app).put(f.base + '/' + third.id + '/membership').set(f.a.auth).send({ joined: false }).expect(200);
  await request(app).delete(f.base + '/' + third.id).set(f.a.auth).expect(200);
});

test('past arrangements reject new joins and leaving revokes outings without deleting personal plans, follows or results', async () => {
  const f = await fixture(), old = await f.create(), hosted = await f.create({ capacity: 3 }), guest = await f.create({ capacity: 3 }, f.a);
  f.db.prepare("UPDATE race_outings SET starts_at='2000-01-01T08:00' WHERE id=?").run(old.id);
  await request(app).put(f.base + '/' + old.id + '/membership').set(f.b.auth).send({ joined: true }).expect(409);
  assert.equal((await request(app).get(f.base).set(f.b.auth)).body.outings.find(item => item.id === old.id).canJoin, false);
  await request(app).put(f.base + '/' + guest.id + '/membership').set(f.host.auth).send({ joined: true }).expect(200);
  const plan = API + '/me/races/bishan';
  await request(app).put(plan).set(f.host.auth).send({ status: '已缴费', sharedClubIds: [f.clubs[0]] }).expect(200);
  await request(app).put(plan + '/follow').set(f.host.auth).send({ following: true }).expect(200);
  await request(app).put(plan + '/result').set(f.host.auth).send({ distance: 'full', time: '3:25:00' }).expect(200);
  await request(app).post(API + '/clubs/' + f.clubs[0] + '/leave').set(f.host.auth).send({}).expect(200);
  assert.equal(f.db.prepare('SELECT status FROM race_outings WHERE id=?').get(hosted.id).status, 'cancelled');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM race_outing_members WHERE user_id=?').get(f.host.id).n, 0);
  const me = (await request(app).get(API + '/me').set(f.host.auth)).body;
  assert.equal(me.plans[0].status, '完赛'); assert.equal(me.followedRaces.length, 1); assert.equal(me.results[0].clock, '3:25:00');
  await request(app).put(f.base + '/' + guest.id + '/membership').set(f.host.auth).send({ joined: true }).expect(404);
  // Rejoining never restores the cancelled host's arrangement or former membership.
  f.db.prepare('INSERT INTO club_members(club_id,user_id,joined_at) VALUES(?,?,?)').run(f.clubs[0], f.host.id, new Date().toISOString());
  const after = (await request(app).get(f.base).set(f.host.auth)).body.outings;
  assert.deepEqual(after.map(item => item.id), [guest.id]); assert.equal(after[0].joined, false); assert.equal(after[0].memberCount, 1);
  // Staff removal uses the same membership trigger.
  await request(app).delete(API + '/clubs/' + f.clubs[0] + '/members/' + f.a.id).set(f.owner.auth).expect(200);
  assert.equal(f.db.prepare('SELECT status FROM race_outings WHERE id=?').get(guest.id).status, 'cancelled');
});

test('following alone enables actual site node reminders, plan overlap deduplicates and unfollow retains existing plan reminders', async () => {
  const user = await account(), db = getDb(), id = 'follow-nodes-' + randomUUID();
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const tomorrow = future().slice(0, 10);
  db.prepare(`INSERT INTO races(id,name,city,province,distances,race_date,deadline,place,draw_at,pay_deadline,reg_start)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id, '节点提醒测试', '北京', '北京', 'half', tomorrow, tomorrow, '起点', today, tomorrow, today + 'T00:00:00+08:00');
  const plan = API + '/me/races/' + id;
  const read = async () => {
    const todayResponse = (await request(app).get(API + '/today').set(user.auth).expect(200)).body.tasks.filter(task => task.raceId === id && task.kind === 'reminder');
    const reminderResponse = (await request(app).get(API + '/reminders').set(user.auth).expect(200)).body.mine.filter(item => item.race.id === id);
    const me = (await request(app).get(API + '/me').set(user.auth).expect(200)).body;
    return { tasks: todayResponse, mine: reminderResponse, me: me.reminders.filter(item => item.race.id === id), plans: me.plans, clubs: me.clubs };
  };
  assert.equal((await read()).mine.length, 0);
  await request(app).put(plan + '/follow').set(user.auth).send({ following: true }).expect(200);
  const followed = await read();
  assert.equal(followed.plans.length, 0); assert.equal(followed.clubs.length, 0);
  const keys = followed.mine.map(item => item.hit.key).sort();
  assert.deepEqual(keys, ['deadline', 'draw', 'pay', 'race', 'regStart']);
  assert.equal(followed.tasks.length, keys.length); assert.equal(followed.me.length, keys.length);
  await request(app).put(plan).set(user.auth).send({ status: '待抽签' }).expect(200);
  assert.deepEqual((await read()).mine.map(item => item.hit.key).sort(), keys);
  await request(app).put(plan + '/follow').set(user.auth).send({ following: false }).expect(200);
  const unfollowed = await read();
  assert.equal(unfollowed.tasks.length, keys.length); assert.equal(unfollowed.me.length, keys.length);
  assert.ok(unfollowed.mine.every(item => item.myStatus === '待抽签' && item.following === false));
  await request(app).delete(plan).set(user.auth).expect(200);
  assert.equal((await read()).mine.length, 0);
});

test('registration opening reminders cover tomorrow and the opening day before and after its Beijing start, never later days', () => {
  const row = { id: 'opening', name: '开放报名边界', city: '北京', province: '北京', distances: 'half', race_date: '2099-07-20', deadline: '', place: '起点', reg_start: '2099-07-11T10:00:00+08:00' };
  const opening = stamp => reminderHits(presentRace(row, new Date(stamp))).find(hit => hit.key === 'regStart');
  assert.equal(opening('2099-07-09T12:00:00+08:00'), undefined);
  assert.match(opening('2099-07-10T12:00:00+08:00').reason, /明天/);
  for (const stamp of ['2099-07-11T00:00:00+08:00', '2099-07-11T09:59:59+08:00', '2099-07-11T10:00:00+08:00', '2099-07-11T23:59:59+08:00']) {
    assert.equal(opening(stamp).reason, '今天开始报名');
    assert.equal(opening(stamp).text, '今天开始报名');
  }
  assert.equal(opening('2099-07-12T00:00:00+08:00'), undefined);
  assert.equal(opening('2099-07-11T17:00:00Z'), undefined, 'Beijing has already crossed midnight');
});

test('registration and payment deadlines notify on their Beijing day only while the exact deadline is still open', () => {
  const row = { id: 'deadlines', name: '截止提醒边界', city: '北京', province: '北京', distances: 'half', race_date: '2099-07-20', place: '起点', deadline: '2099-07-11T10:00:00+08:00', pay_deadline: '2099-07-11T10:00:00+08:00' };
  const hits = stamp => reminderHits(presentRace(row, new Date(stamp))).filter(hit => ['deadline', 'pay'].includes(hit.key));
  assert.deepEqual(hits('2099-07-09T12:00:00+08:00'), []);
  assert.equal(hits('2099-07-10T12:00:00+08:00').length, 2);
  const today = hits('2099-07-11T09:59:59+08:00');
  assert.equal(today.length, 2);
  assert.deepEqual(today.map(hit => hit.reason), ['今日截止', '今日缴费截止']);
  assert.deepEqual(hits('2099-07-11T10:00:00+08:00'), []);
  assert.deepEqual(hits('2099-07-11T10:00:01+08:00'), []);
  assert.deepEqual(hits('2099-07-12T00:00:00+08:00'), []);
});

test('registration, draw and interest never count as confirmed companions', () => {
  const marks = ['已报名', '待抽签', '中签', '确认参赛', '已缴费', '已领物', '想跑', '未中签', '弃赛'].map(status => ({ status, nickname: status }));
  const squad = squadOf(marks);
  assert.deepEqual(squad.going.map(item => item.status), ['确认参赛', '已缴费', '已领物']);
  assert.deepEqual(squad.pending.map(item => item.status), ['已报名', '待抽签', '中签']);
  assert.equal(squad.size, 3); assert.equal(squad.pendingSize, 3); assert.equal(squad.ready, true);
  assert.equal(squadOf(marks.slice(0, 3)).ready, false);
});
