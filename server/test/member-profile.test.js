require("./setup-env");
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const API = "/marathon/api";
const PHOTO = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cXioAAAAASUVORK5CYII=", "base64");
let sequence = 0;
async function account() {
  const r = await request(app).post(API + "/session").send({ nickname: "五页签测试成员" + (++sequence) });
  assert.equal(r.status, 200);
  return { ...r.body.user, auth: { Authorization: "Bearer " + r.body.token } };
}
async function makeClub(owner) {
  const r = await request(app).post(API + "/clubs").set(owner.auth).send({ name: "五页签资料团" + sequence, city: "北京", requestId: crypto.randomUUID() });
  assert.equal(r.status, 200); return r.body.club;
}
async function fixture() {
  const owner = await account(), member = await account(), outsider = await account(), club = await makeClub(owner), db = getDb();
  db.prepare("INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,'member')").run(club.id, member.id, "2024-01-01T00:00:00Z");
  return { owner, member, outsider, club, db, base: API + "/clubs/" + club.id, profile: API + "/clubs/" + club.id + "/members/" + member.id + "/profile" };
}
function race(f, name, date = "2025-01-01", kind = "road", meet = "offline") {
  const id = "profile-test-" + crypto.randomUUID();
  f.db.prepare("INSERT INTO races(id,name,city,province,distances,race_date,deadline,place,kinds,meet) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id, name, "杭州", "浙江", "full,half,10k,5k", date, "", "比赛场地", kind, meet);
  return id;
}
async function mark(f, id, status) {
  const r = await request(app).put(API + "/me/races/" + id).set(f.member.auth).send({ status }); assert.equal(r.status, 200);
}
async function result(f, id, distance, time) {
  const r = await request(app).put(API + "/me/races/" + id + "/result").set(f.member.auth).send({ distance, time, story: "个人私密跑后故事" }); assert.equal(r.status, 200, JSON.stringify(r.body));
}
async function activity(f, review = false, clubId = f.club.id) {
  const made = await request(app).post(API + "/clubs/" + clubId + "/activities").set(f.owner.auth).send({ title: "团内相册活动", startsAt: "2025-01-01T07:00", review });
  assert.equal(made.status, 200); return made.body.activity.id;
}
async function photo(f, activityId, actor = f.member, clubId = f.club.id) {
  const r = await request(app).post(API + "/clubs/" + clubId + "/activities/" + activityId + "/media").set(actor.auth).attach("file", PHOTO, { filename: "test.png", contentType: "image/png" });
  assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.media.id;
}
function run(f, actor, at, km) {
  const id = f.db.prepare("INSERT INTO runs(user_id,type,started_at,distance_km,duration_sec,created_at) VALUES(?,'run',?,?,?,?)").run(actor.id, at, km, km * 360, new Date().toISOString()).lastInsertRowid;
  f.db.prepare("INSERT INTO mileage_counts(run_id,club_id,counted,volume_km) VALUES(?,?,1,?)").run(id, f.club.id, km);
}

test("five-tab member profile aggregates marked races and public results with distance PBs without private records", async () => {
  const f = await fixture();
  const a = race(f, "第一场"), b = race(f, "第二场", "2025-02-01"), trail = race(f, "越野场", "2025-03-01", "trail"), online = race(f, "线上场", "2025-04-01", "road", "online"), future = race(f, "未来成绩", "2099-01-01"), wish = race(f, "想跑场", "2099-02-01"), won = race(f, "中签场", "2099-03-01"), missed = race(f, "未中签场", "2099-04-01"), marked = race(f, "仅标完赛", "2025-05-01");
  await result(f, a, "half", "1:50:00"); await result(f, a, "full", "4:00:00"); await result(f, b, "half", "1:40:00");
  await result(f, trail, "half", "1:00:00"); await result(f, online, "half", "50:00"); await result(f, future, "half", "40:00");
  await mark(f, wish, "想跑"); await mark(f, won, "中签"); await mark(f, missed, "未中签"); await mark(f, marked, "完赛");
  f.db.prepare("UPDATE results SET proof='private-certificate-file.png',proof_kind='certificate' WHERE user_id=?").run(f.member.id);
  f.db.prepare("UPDATE plans SET sheet='private-signup-file.pdf' WHERE user_id=?").run(f.member.id);
  f.db.prepare("INSERT INTO runner_media(user_id,race_id,distance,kind,filename,mime,size,created_at) VALUES(?,?,'half','certificate','PRIVATE-RUNNER-COLLECTION','image/png',100,?)").run(f.member.id, a, new Date().toISOString());
  const now = new Date().toISOString();
  f.db.prepare("INSERT INTO race_history_entries(user_id,name,race_date,distance,fingerprint,confirmed_at,created_at,updated_at) VALUES(?,'PRIVATE-HISTORY-ONLY','2024-01-01','half',?,?,?,?)").run(f.member.id, crypto.randomUUID(), now, now, now);
  f.db.prepare("INSERT INTO wearable_connections(user_id,provider,access_token,created_at,updated_at) VALUES(?,'coros','PRIVATE-DEVICE-TOKEN',?,?)").run(f.member.id, now, now);
  const r = await request(app).get(f.profile + "?range=month&date=2025-02-01").set(f.owner.auth);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = r.body;
  assert.equal(p.summary.raceCount, 9); assert.equal(p.summary.resultCount, 6); assert.equal(p.summary.finishedRaceCount, 5); assert.equal(p.summary.upcomingRaceCount, 1, "future wishes and unsuccessful draws are not upcoming participation");
  assert.equal(p.races.find(r => r.raceId === wish).status, "想跑"); assert.equal(p.races.find(r => r.raceId === won).status, "中签"); assert.equal(p.races.find(r => r.raceId === missed).status, "未中签");
  assert.equal(p.races.find(r => r.raceId === a).results.length, 2);
  assert.equal(p.results.find(r => r.raceId === a && r.distance === "half").pb, false);
  assert.equal(p.results.find(r => r.raceId === b).pb, true);
  for (const id of [trail, online, future]) assert.equal(p.results.find(r => r.raceId === id).pb, false);
  assert.equal(p.pbs.find(r => r.distance === "half").seconds, 6000); assert.equal(p.pbs.find(r => r.distance === "full").seconds, 14400);
  assert.deepEqual(p.pbs, p.summary.pb); assert.equal(p.overview.finished, 5); assert.equal(p.user.role, "member");
  for (const value of ["private-certificate", "proof", "个人私密跑后故事", "private-signup", "sheet", "PRIVATE-RUNNER", "PRIVATE-HISTORY-ONLY", "PRIVATE-DEVICE-TOKEN", "runner_media", "openid", "token", "access_token", "password"]) assert.ok(!JSON.stringify(p).includes(value), value);
  assert.equal((await request(app).get(f.profile).set(f.outsider.auth)).status, 403);
  assert.equal((await request(app).get(f.profile)).status, 401);
  assert.equal((await request(app).get(f.base + "/members/" + f.outsider.id + "/profile").set(f.member.auth)).status, 404);
  f.db.prepare("DELETE FROM club_members WHERE club_id=? AND user_id=?").run(f.club.id, f.member.id);
  assert.equal((await request(app).get(f.profile).set(f.owner.auth)).status, 404);
});

test("upcoming participation excludes future wishes and terminal marks while retaining valid entry states", async () => {
  const f = await fixture();
  const wish = race(f, "仅想跑未来赛事", "2099-06-01");
  await mark(f, wish, "想跑");
  let response = await request(app).get(f.profile).set(f.owner.auth);
  assert.equal(response.status, 200);
  assert.equal(response.body.summary.raceCount, 1);
  assert.equal(response.body.summary.upcomingRaceCount, 0, "a future wish is displayed but does not count as upcoming participation");
  const active = ["已报名", "待抽签", "中签", "已缴费", "已领物"];
  for (const status of [...active, "未中签", "未完赛", "弃赛", "完赛"]) {
    const id = race(f, "未来状态" + status, "2099-07-01");
    await mark(f, id, status);
  }
  const past = race(f, "过去报名赛事", "2025-01-01");
  await mark(f, past, "已报名");
  response = await request(app).get(f.profile).set(f.member.auth);
  assert.equal(response.status, 200);
  assert.equal(response.body.summary.upcomingRaceCount, active.length, "only future valid participation states count");
  assert.equal(response.body.races.find(r => r.raceId === wish).status, "想跑", "the wish remains visible for its dedicated filter");
});

test("member albums contain only that member's shown media in this club and reuse authenticated files/review flow", async () => {
  const f = await fixture(), shownActivity = await activity(f), pendingActivity = await activity(f, true);
  const shown = await photo(f, shownActivity), pending = await photo(f, pendingActivity), otherMemberPhoto = await photo(f, shownActivity, f.owner);
  const otherClub = await makeClub(await account());
  f.db.prepare("INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,'manager')").run(otherClub.id, f.owner.id, new Date().toISOString());
  f.db.prepare("INSERT INTO club_members(club_id,user_id,joined_at) VALUES(?,?,?)").run(otherClub.id, f.member.id, new Date().toISOString());
  const otherActivity = await activity(f, false, otherClub.id), otherClubPhoto = await photo(f, otherActivity, f.member, otherClub.id);
  for (const actor of [f.owner, f.member]) {
    const r = await request(app).get(f.profile).set(actor.auth);
    assert.equal(r.status, 200); assert.equal(r.body.albums.length, 1); assert.equal(r.body.summary.photoCount, 1);
    assert.deepEqual(r.body.albums[0].items.map(m => m.id), [shown]);
    assert.deepEqual(r.body.album.map(m => m.id), [shown]);
    assert.ok(!r.body.album.some(m => [pending, otherMemberPhoto, otherClubPhoto].includes(m.id)));
    assert.equal((await request(app).get(r.body.album[0].url).set(actor.auth)).status, 200);
  }
  assert.equal((await request(app).get(API + "/media/" + shown).set(f.outsider.auth)).status, 403);
  const approved = await request(app).post(f.base + "/activities/" + pendingActivity + "/media/" + pending + "/approve").set(f.owner.auth);
  assert.equal(approved.status, 200);
  assert.equal((await request(app).get(f.profile).set(f.owner.auth)).body.summary.photoCount, 2);
  assert.equal((await request(app).delete(f.base + "/activities/" + shownActivity + "/media/" + shown).set(f.member.auth)).status, 200);
  const after = (await request(app).get(f.profile).set(f.member.auth)).body;
  assert.equal(after.summary.photoCount, 1); assert.deepEqual(after.album.map(m => m.id), [pending]);
});

test("self profile editing persists nickname/avatar/introduction and leaves other members untouched", async () => {
  const f = await fixture(), nickname = "已更新资料" + sequence, introduction = "周三练速度，周末轻松跑。";
  const r = await request(app).put(API + "/me/profile").set(f.member.auth).send({ nickname, introduction, avatar: "data:image/png;base64," + PHOTO.toString("base64"), userId: f.owner.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const profile = (await request(app).get(f.profile).set(f.owner.auth)).body;
  assert.equal(profile.user.nickname, nickname); assert.equal(profile.user.introduction, introduction); assert.ok(profile.user.avatar.startsWith(API + "/avatars/" + f.member.id + "/"));
  assert.equal(f.db.prepare("SELECT nickname,introduction FROM users WHERE id=?").get(f.owner.id).nickname, f.owner.nickname);
  assert.equal((await request(app).put(API + "/me/profile").set(f.member.auth).send({ nickname, introduction: "字".repeat(301) })).status, 400);
  assert.equal((await request(app).get(f.profile).set(f.member.auth)).body.mine, true);
});

test("historical week/month/year report members and result rankings expose stable identities and avatars", async () => {
  const f = await fixture();
  f.db.prepare("UPDATE users SET avatar=? WHERE id=?").run(f.member.id + "-" + "a".repeat(64) + ".png", f.member.id);
  run(f, f.member, "2025-12-31T23:59", 3); run(f, f.member, "2026-01-01T07:00", 5); run(f, f.member, "2026-01-05T07:00", 10);
  for (const [kind, expected] of [["week", 10], ["month", 15], ["year", 15]]) {
    const r = await request(app).get(f.base + "/mileage/report?kind=" + kind + "&date=2026-01-05").set(f.member.auth);
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.total.km, expected);
    assert.equal(r.body.rows[0].userId, f.member.id); assert.ok(r.body.rows[0].avatar.startsWith(API + "/avatars/" + f.member.id + "/")); assert.equal(r.body.date, "2026-01-05");
    assert.equal((await request(app).get(f.base + "/mileage/report?kind=" + kind + "&date=2026-02-30").set(f.member.auth)).status, 400);
  }
  const historic = await request(app).get(f.base + "/mileage/report?kind=month&at=2025-12").set(f.owner.auth);
  assert.equal(historic.body.total.km, 3); assert.equal(historic.body.date, "2025-12-01");
  const id = race(f, "PB榜身份测试"); await result(f, id, "half", "1:40:00");
  f.db.prepare("UPDATE users SET nickname=? WHERE id=?").run(f.owner.nickname, f.member.id);
  const saved = await request(app).put(API + "/me/races/" + id + "/result").set(f.owner.auth).send({ distance: "half", time: "1:50:00" }); assert.equal(saved.status, 200);
  const club = await request(app).get(f.base).set(f.owner.auth);
  const rank = club.body.ranks.find(g => g.distance === "half").rows;
  assert.equal(rank.length, 2, "legacy identical nicknames remain separate members");
  assert.deepEqual(rank.map(r => r.userId), [f.member.id, f.owner.id]); assert.ok(rank[0].avatar); assert.equal(rank[0].nickname, rank[1].nickname);
});

test("empty members retain a complete safe five-tab response without invented achievements", async () => {
  const f = await fixture();
  const r = await request(app).get(f.profile).set(f.owner.auth);
  assert.equal(r.status, 200);
  for (const key of ["races", "results", "albums", "album", "pbs"]) assert.deepEqual(r.body[key], []);
  for (const key of ["raceCount", "upcomingRaceCount", "finishedRaceCount", "resultCount", "photoCount", "videoCount"]) assert.equal(r.body.summary[key], 0);
  assert.equal(r.body.overview.totalKm, 0); assert.equal(r.body.overview.totalRuns, 0); assert.equal(r.body.user.roleLabel, "成员");
});
