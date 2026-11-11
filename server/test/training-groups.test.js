require("./setup-env");
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const { installTrainingGroups } = require("../src/training-groups");
const API = "/marathon/api";
let sequence = 0;
async function account() {
  const r = await request(app).post(API + "/session").send({ nickname: "训练看板测试" + (++sequence) });
  assert.equal(r.status, 200);
  return { id: r.body.user.id, auth: { Authorization: "Bearer " + r.body.token } };
}
async function fixture() {
  const owner = await account(), member = await account(), manager = await account(), outsider = await account();
  const r = await request(app).post(API + "/clubs").set(owner.auth).send({ name: "常设训练测试团" + sequence, city: "北京", requestId: crypto.randomUUID() });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const club = r.body.club, base = API + "/clubs/" + club.id, db = getDb();
  for (const [actor, role] of [[member, "member"], [manager, "manager"]]) db.prepare("INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,?)").run(club.id, actor.id, "2024-01-01T00:00:00Z", role);
  return { owner, member, manager, outsider, club, base, db };
}
async function create(f, body = {}) {
  const r = await request(app).post(f.base + "/training-groups").set(f.owner.auth).send({ name: "A组", pace: "4:30–5:00 /公里", description: "进阶耐力训练", capacity: 10, sort: 1, ...body });
  assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.group;
}
function addRun(f, actor, date, km, counted = 1) {
  const id = f.db.prepare("INSERT INTO runs(user_id,type,started_at,distance_km,duration_sec,created_at,shot,city,source) VALUES(?,'run',?,?,?,?,'private-proof.png','私人住址','coros')").run(actor.id, date, km, km * 360, new Date().toISOString()).lastInsertRowid;
  f.db.prepare("INSERT INTO mileage_counts(run_id,club_id,counted,volume_km) VALUES(?,?,?,?)").run(id, f.club.id, counted, km);
  return Number(id);
}

test("legacy activity and mileage groups migrate idempotently without changing group ids or member assignment", async () => {
  const f = await fixture();
  const oldClubId = Number(f.db.prepare("INSERT INTO club_groups(club_id,name,pace,capacity,sort) VALUES(?,'旧训练组','6:00',20,1)").run(f.club.id).lastInsertRowid);
  const oldMileageId = Number(f.db.prepare("INSERT INTO mileage_groups(club_id,name,capacity,sort) VALUES(?,'旧训练组',20,1)").run(f.club.id).lastInsertRowid);
  f.db.prepare("UPDATE club_members SET mileage_group_id=? WHERE club_id=? AND user_id=?").run(oldMileageId, f.club.id, f.member.id);
  f.db.prepare("INSERT INTO mileage_groups(club_id,name,capacity,sort) VALUES(?,'仅跑量组',0,2)").run(f.club.id);
  f.db.prepare("INSERT INTO club_groups(club_id,name,pace,capacity,sort) VALUES(?,'仅训练组','7:00',0,3)").run(f.club.id);
  installTrainingGroups(f.db); installTrainingGroups(f.db);
  const list = await request(app).get(f.base + "/training-groups").set(f.owner.auth);
  assert.equal(list.body.groups.length, 3);
  const migrated = list.body.groups.find(g => g.id === oldMileageId);
  assert.equal(migrated.clubGroupId, oldClubId); assert.equal(migrated.pace, "6:00"); assert.equal(migrated.memberCount, 1);
  assert.equal(list.body.members.find(m => m.id === f.member.id).groupId, oldMileageId);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM club_groups WHERE club_id=?").get(f.club.id).n, 3);
});

test("training groups persist shared roster, editable targets, staff permissions and legacy group APIs", async () => {
  const f = await fixture(), group = await create(f);
  assert.ok(group.clubGroupId > 0);
  assert.equal(f.db.prepare("SELECT pace FROM club_groups WHERE id=?").get(group.clubGroupId).pace, group.pace);
  assert.equal((await request(app).get(f.base + "/training-groups")).status, 401);
  assert.equal((await request(app).get(f.base + "/training-groups").set(f.outsider.auth)).status, 403);
  assert.equal((await request(app).get(f.base + "/training-groups").set(f.member.auth)).status, 200);
  assert.equal((await request(app).post(f.base + "/training-groups").set(f.member.auth).send({ name: "不可写" })).status, 403);
  const updated = await request(app).put(f.base + "/training-groups/" + group.id).set(f.manager.auth).send({ pace: "5:00–5:30", description: "稳定有氧" });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.group.name, "A组");
  assert.equal(f.db.prepare("SELECT pace FROM club_groups WHERE id=?").get(group.clubGroupId).pace, "5:00–5:30");
  assert.equal((await request(app).put(f.base + "/training-groups/members/" + f.member.id).set(f.manager.auth).send({ groupId: group.id })).status, 200);
  const list = await request(app).get(f.base + "/training-groups").set(f.member.auth);
  assert.equal(list.body.groups[0].memberCount, 1);
  assert.equal(list.body.members.find(m => m.id === f.member.id).groupId, group.id);
  const old = await request(app).post(f.base + "/groups").set(f.owner.auth).send({ name: "B组", pace: "6分配", capacity: 20 });
  assert.equal(old.status, 200, JSON.stringify(old.body));
  assert.ok(old.body.group.trainingGroupId > 0);
  assert.equal(f.db.prepare("SELECT club_group_id FROM mileage_groups WHERE id=?").get(old.body.group.trainingGroupId).club_group_id, old.body.group.id);
  const legacy = await request(app).post(f.base + "/mileage/groups").set(f.owner.auth).send({ name: "C组", capacity: 0, sort: 3 });
  assert.equal(legacy.status, 200, JSON.stringify(legacy.body));
  assert.ok(legacy.body.group.clubGroupId > 0);
  installTrainingGroups(f.db); installTrainingGroups(f.db);
  assert.equal((await request(app).get(f.base + "/training-groups").set(f.member.auth)).body.groups.length, 3);
});

test("training groups reject cross-club references, duplicate names, invalid bounds and over-capacity assignment", async () => {
  const f = await fixture(), other = await fixture(), group = await create(f, { capacity: 1 }), foreign = await create(other);
  for (const body of [{ name: "" }, { name: "字".repeat(21) }, { name: "非法", pace: "a".repeat(41) }, { name: "非法", description: "a".repeat(301) }, { name: "非法", capacity: -1 }, { name: "非法", capacity: 1.5 }, { name: "A组" }]) assert.equal((await request(app).post(f.base + "/training-groups").set(f.owner.auth).send(body)).status, 400);
  assert.equal((await request(app).put(f.base + "/training-groups/" + foreign.id).set(f.owner.auth).send({ name: "越权" })).status, 404);
  assert.equal((await request(app).delete(f.base + "/training-groups/" + foreign.id).set(f.owner.auth)).status, 404);
  assert.equal((await request(app).put(f.base + "/training-groups/members/" + f.member.id).set(f.owner.auth).send({ groupId: foreign.id })).status, 404);
  assert.equal((await request(app).put(f.base + "/training-groups/members/" + f.outsider.id).set(f.owner.auth).send({ groupId: group.id })).status, 404);
  assert.equal((await request(app).put(f.base + "/training-groups/members/" + f.member.id).set(f.owner.auth).send({ groupId: group.id })).status, 200);
  assert.equal((await request(app).put(f.base + "/training-groups/members/" + f.owner.id).set(f.owner.auth).send({ groupId: group.id })).status, 400);
  assert.equal((await request(app).put(f.base + "/training-groups/members/" + f.member.id).set(f.member.auth).send({ groupId: 0 })).status, 403);
  assert.equal((await request(app).put(f.base + "/training-groups/members/" + f.member.id).set(f.owner.auth).send({ groupId: 0 })).status, 200);
});

test("all-member board uses selected day/week/month/year/cumulative windows and stable zero rows", async () => {
  const f = await fixture(), group = await create(f);
  await request(app).put(f.base + "/training-groups/members/" + f.member.id).set(f.owner.auth).send({ groupId: group.id });
  addRun(f, f.member, "2025-12-31T23:59", 1);
  addRun(f, f.member, "2026-01-01T00:00", 2);
  addRun(f, f.member, "2026-01-04T23:59", 4);
  addRun(f, f.member, "2026-01-05T00:00", 8);
  addRun(f, f.member, "2026-02-01T00:00", 16);
  addRun(f, f.member, "2026-01-05T01:00", 100, 0);
  addRun(f, f.member, "2099-01-01T00:00", 1000);
  const expected = { day: 8, week: 8, month: 14, year: 30, all: 31 };
  for (const [range, km] of Object.entries(expected)) {
    const r = await request(app).get(f.base + "/mileage/board?range=" + range + "&date=2026-01-05").set(f.member.auth);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.summary.km, km, range); assert.equal(r.body.rank.length, 3);
    assert.equal(r.body.summary.members, 3); assert.equal(r.body.summary.activeMembers, 1);
    assert.equal(r.body.groups.find(g => g.id === group.id).km, km);
    assert.equal(r.body.rank.filter(r => r.km === 0).length, 2);
    assert.equal(r.body.rank[0].userId, f.member.id);
    if (range === "week") assert.deepEqual(r.body.period, { from: "2026-01-05", to: "2026-01-12", label: "2026-01-05 ～ 2026-01-11" });
  }
  const only = await request(app).get(f.base + "/mileage/board?range=all&groupId=" + group.id).set(f.member.auth);
  assert.equal(only.body.rank.length, 1); assert.equal(only.body.summary.km, 31);
  const ungrouped = await request(app).get(f.base + "/mileage/board?range=all&groupId=0").set(f.member.auth);
  assert.equal(ungrouped.body.rank.length, 2); assert.equal(ungrouped.body.summary.km, 0);
  for (const query of ["date=2026-02-30", "date=2025-02-29", "range=other", "groupId=-1", "groupId=1.5"]) assert.equal((await request(app).get(f.base + "/mileage/board?" + query).set(f.member.auth)).status, 400);
  assert.equal((await request(app).get(f.base + "/mileage/board?groupId=999999").set(f.member.auth)).status, 404);
  assert.equal((await request(app).get(f.base + "/mileage/board").set(f.outsider.auth)).status, 403);
});

test("activity training groups are same-club independent snapshots and deleting groups unassigns members only", async () => {
  const f = await fixture(), other = await fixture(), g = await create(f), foreign = await create(other);
  await request(app).put(f.base + "/training-groups/members/" + f.member.id).set(f.owner.auth).send({ groupId: g.id });
  const payload = { title: "选常设组的训练", startsAt: "2099-01-01T07:00", trainingGroupIds: [g.id] };
  const r = await request(app).post(f.base + "/activities").set(f.owner.auth).send(payload);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.activity.groups[0].trainingGroupId, g.id);
  const activityId = r.body.activity.id, snapshotId = r.body.activity.groups[0].id;
  assert.equal((await request(app).post(f.base + "/activities/" + activityId + "/signup").set(f.member.auth).send({ groupId: snapshotId })).status, 200);
  const explicit = await request(app).post(f.base + "/activities").set(f.owner.auth).send({ ...payload, trainingGroupIds: undefined, groups: [{ name: "当天慢跑", kind: "pace", pace: "6分配", capacity: 20, trainingGroupId: g.id }] });
  assert.equal(explicit.status, 200, JSON.stringify(explicit.body));
  assert.equal(explicit.body.activity.groups[0].trainingGroupId, g.id);
  for (const body of [{ ...payload, trainingGroupIds: [foreign.id] }, { ...payload, trainingGroupIds: [g.id, g.id] }, { ...payload, groups: [{ name: "错误组", trainingGroupId: foreign.id }] }]) assert.equal((await request(app).post(f.base + "/activities").set(f.owner.auth).send(body)).status, 400);
  assert.equal((await request(app).put(f.base + "/training-groups/" + g.id).set(f.owner.auth).send({ name: "A改名", pace: "新目标" })).status, 200);
  assert.equal((await request(app).delete(f.base + "/training-groups/" + g.id).set(f.manager.auth)).status, 200);
  const after = await request(app).get(f.base + "/activities/" + activityId).set(f.member.auth);
  assert.equal(after.status, 200, JSON.stringify(after.body));
  assert.equal(after.body.activity.groups[0].name, "A组"); assert.equal(after.body.activity.groups[0].trainingGroupId, g.id);
  assert.equal(after.body.activity.mine.groupId, snapshotId);
  assert.equal(f.db.prepare("SELECT mileage_group_id FROM club_members WHERE club_id=? AND user_id=?").get(f.club.id, f.member.id).mileage_group_id, 0);
  assert.equal(f.db.prepare("SELECT 1 FROM club_groups WHERE id=?").get(g.clubGroupId), undefined);
  const board = await request(app).get(f.base + "/mileage/board?range=all&groupId=0").set(f.owner.auth);
  assert.equal(board.body.rank.length, 3);
});

test("member profile exposes same-club safe period summaries and 20 recent counted runs without private metadata", async () => {
  const f = await fixture();
  const intro = "每周三次轻松跑，欢迎一起训练。";
  assert.equal((await request(app).put(API + "/me/introduction").set(f.member.auth).send({ introduction: intro })).status, 200);
  assert.equal((await request(app).put(API + "/me/introduction").set(f.member.auth).send({ introduction: "字".repeat(301) })).status, 400);
  addRun(f, f.member, "2025-12-31T09:00", 42);
  for (let n = 1; n <= 22; n++) addRun(f, f.member, "2026-01-" + String(n).padStart(2, "0") + "T07:00", 2);
  addRun(f, f.member, "2026-01-23T09:00", 99, 0);
  const r = await request(app).get(f.base + "/members/" + f.member.id + "/profile?range=month&date=2026-01-22").set(f.owner.auth);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user.introduction, intro); assert.equal(r.body.mine, false); assert.equal(r.body.mileage.day.km, 2); assert.equal(r.body.mileage.month.km, 44); assert.equal(r.body.mileage.all.km, 86);
  assert.equal(r.body.stats.km, 44); assert.equal(r.body.recentRuns.length, 20);
  assert.equal(r.body.recentRuns[0].startedAt, "2026-01-22T07:00");
  assert.deepEqual(Object.keys(r.body.recentRuns[0]).sort(), ["id", "startedAt", "typeLabel", "distanceKm", "km", "durationSec", "durationLabel", "paceLabel"].sort());
  for (const key of ["token", "openid", "shot", "private-proof", "私人住址", "coros", "access_token", "race_history"]) assert.ok(!JSON.stringify(r.body).includes(key), key);
  assert.equal((await request(app).get(f.base + "/members/" + f.member.id + "/profile").set(f.outsider.auth)).status, 403);
  assert.equal((await request(app).get(f.base + "/members/" + f.outsider.id + "/profile").set(f.member.auth)).status, 404);
  assert.equal((await request(app).get(f.base + "/members/" + f.member.id + "/profile").set(f.member.auth)).body.mine, true);
});
