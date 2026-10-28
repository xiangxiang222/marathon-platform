const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const { syncOfficial, listOfficial, openUpcoming } = require("../src/official");
const { RACES, presentRace, reminderHits, nearbyOpen } = require("../src/races");

async function session(nickname) {
  const res = await request(app).post("/marathon/api/session").send({ nickname });
  assert.equal(res.status, 200);
  return res.body.token;
}

async function createClub(auth, name) {
  process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin";
  const headers = typeof auth === "string" ? { Authorization: "Bearer " + auth } : auth;
  const admin = { Authorization: "Bearer " + process.env.ADMIN_TOKEN };
  const me = await request(app).get("/marathon/api/me").set(headers);
  assert.equal(me.status, 200);
  if (!me.body.user.leader) {
    const set = await request(app).put("/marathon/api/admin/users/" + me.body.user.id + "/leader").set(admin).send({ leader: true });
    assert.equal(set.status, 200);
  }
  const applied = await request(app).post("/marathon/api/clubs").set(headers).send({ name });
  assert.equal(applied.status, 200);
  assert.equal(applied.body.pending, true);
  const approved = await request(app)
    .post("/marathon/api/admin/club-applications/" + applied.body.application.id)
    .set(admin)
    .send({ decision: "approve" });
  assert.equal(approved.status, 200);
  return { status: 200, body: { club: approved.body.club } };
}

async function joinWithCode(token, code) {
  const applied = await request(app).post("/marathon/api/clubs/join").set("Authorization", "Bearer " + token).send({ code });
  if (applied.status !== 200 || !applied.body.pending) return applied;
  const club = getDb().prepare("SELECT id, owner_id FROM clubs WHERE id = ?").get(applied.body.club.id);
  const user = getDb().prepare("SELECT nickname FROM users WHERE token = ?").get(token);
  const owner = getDb().prepare("SELECT token FROM users WHERE id = ?").get(club.owner_id);
  const ownerAuth = { Authorization: "Bearer " + owner.token };
  const detail = await request(app).get("/marathon/api/clubs/" + club.id).set(ownerAuth);
  const queued = (detail.body.requests || []).find((item) => item.nickname === user.nickname);
  assert.ok(queued, "invited member should enter the approval queue");
  const approved = await request(app).post("/marathon/api/clubs/" + club.id + "/requests/" + queued.id).set(ownerAuth).send({ decision: "approve" });
  assert.equal(approved.status, 200);
  return request(app).get("/marathon/api/clubs/" + club.id).set("Authorization", "Bearer " + token);
}

test("meta uses the same company", async () => {
  const res = await request(app).get("/marathon/api/meta");
  assert.equal(res.status, 200);
  assert.equal(res.body.company, "北京华创科技有限公司");
  assert.equal(res.body.icp, "京ICP备2026060284号-2");
});

test("open races hide the finished sample and can filter city and distance", async () => {
  const res = await request(app).get("/marathon/api/races?city=重庆&distance=full&status=all");
  assert.equal(res.status, 200);
  assert.ok(res.body.races.some((r) => r.id === "bishan"));
  assert.equal(res.body.races.some((r) => r.id === "closed-sample"), false);
  const all = await request(app).get("/marathon/api/races?status=all");
  assert.ok(all.body.races.some((r) => r.id === "closed-sample" && r.regStatus === "已结束"));
  const fuzzy = await request(app).get("/marathon/api/races?status=upcoming&kind=road&q=" + encodeURIComponent("收 官"));
  assert.ok(fuzzy.body.races.some((r) => r.id === "closed-sample"));
  assert.equal(fuzzy.body.races.some((r) => r.id === "bishan"), false);
  const byProvince = await request(app).get("/marathon/api/races?kind=trail&q=" + encodeURIComponent("浙江"));
  assert.ok(byProvince.body.races.some((r) => r.id === "closed-sample"));
  const future = all.body.races.find((r) => r.id === "huangyaguan");
  assert.equal(future.open, true);
  assert.match(future.deadlineLabel, /天后截止/);
  assert.equal(future.source, "最酷，2026-09-07");
  assert.equal(future.regStart, "2026-09-07");
  assert.equal(future.nextNode.label, "早鸟截止");
  assert.match(future.nextNode.text, /天后截止/);
});

test("a club sees a teammate mark the same race", async () => {
  const leader = await session("团长");
  const mate = await session("队友");
  const created = await createClub(leader, "滨河跑团");
  assert.equal(created.status, 200);
  const code = created.body.club.code;
  const joined = await joinWithCode(mate, code);
  assert.equal(joined.status, 200);
  const mine = await request(app).get("/marathon/api/me").set("Authorization", "Bearer " + leader);
  assert.equal(mine.body.user.leader, true);
  assert.equal(mine.body.clubs[0].role, "owner");
  assert.equal(mine.body.clubs[0].roleLabel, "团长");
  const mateMe = await request(app).get("/marathon/api/me").set("Authorization", "Bearer " + mate);
  assert.equal(mateMe.body.user.leader, false);
  assert.equal(mateMe.body.clubs[0].roleLabel, "成员");

  const marked = await request(app)
    .put("/marathon/api/me/races/bishan")
    .set("Authorization", "Bearer " + mate)
    .send({ status: "已报名" });
  assert.equal(marked.status, 200);

  const detail = await request(app).get("/marathon/api/races/bishan").set("Authorization", "Bearer " + leader);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.clubs[0].mates[0].nickname, "队友");
  assert.equal(detail.body.clubs[0].mates[0].status, "已报名");

  const board = await request(app)
    .get("/marathon/api/clubs/" + created.body.club.id)
    .set("Authorization", "Bearer " + leader);
  assert.equal(board.status, 200);
  assert.equal(board.body.members.length, 2);
  assert.equal(board.body.board[0].marks[0].status, "已报名");
  assert.equal(board.body.board[0].summary, "1 人已报名");
  assert.match(board.body.board[0].title, /璧山马拉松/);

  const outsider = await session("路人");
  const denied = await request(app)
    .get("/marathon/api/clubs/" + created.body.club.id)
    .set("Authorization", "Bearer " + outsider);
  assert.equal(denied.status, 403);
});

test("marking a race requires a nickname and a known status", async () => {
  const anon = await request(app).put("/marathon/api/me/races/bishan").send({ status: "想跑" });
  assert.equal(anon.status, 401);
  const token = await session("小李");
  const bad = await request(app).put("/marathon/api/me/races/bishan").set("Authorization", "Bearer " + token).send({ status: "拿奖" });
  assert.equal(bad.status, 400);
  const ok = await request(app).put("/marathon/api/me/races/bishan").set("Authorization", "Bearer " + token).send({ status: "想跑" });
  assert.equal(ok.status, 200);
  const me = await request(app).get("/marathon/api/me").set("Authorization", "Bearer " + token);
  assert.equal(me.body.plans[0].status, "想跑");
  assert.equal(me.body.plans[0].race.id, "bishan");
});

test("a member can leave only their own club, cancel upcoming signups, and apply again", async () => {
  const owner = await session("自主退团团长");
  const member = await session("自主退团队友");
  const outsider = await session("自主退团旁人");
  const ownerAuth = { Authorization: "Bearer " + owner };
  const memberAuth = { Authorization: "Bearer " + member };
  const created = await createClub(ownerAuth, "自主退团测试团");
  const club = created.body.club;
  await joinWithCode(member, club.code);
  const db = getDb();
  const memberId = db.prepare("SELECT id FROM users WHERE token = ?").get(member).id;
  const ownerId = db.prepare("SELECT id FROM users WHERE token = ?").get(owner).id;
  const now = new Date().toISOString();
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 8 * 3600 * 1000 + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const activity = db.prepare("INSERT INTO activities (club_id, title, starts_at, created_at) VALUES (?, ?, ?, ?)");
  const pastActivity = Number(activity.run(club.id, "历史团练", "2001-01-01T06:00", now).lastInsertRowid);
  const nextActivity = Number(activity.run(club.id, "未来团练", "2099-01-01T06:00", now).lastInsertRowid);
  const signup = db.prepare("INSERT INTO activity_signups (activity_id, user_id, created_at) VALUES (?, ?, ?)");
  signup.run(pastActivity, memberId, now);
  signup.run(nextActivity, memberId, now);
  signup.run(nextActivity, ownerId, now);
  db.prepare("INSERT INTO activity_checks (activity_id, user_id, km, created_at) VALUES (?, ?, 10, ?)").run(pastActivity, memberId, now);
  const earlyCheck = await request(app).post("/marathon/api/clubs/" + club.id + "/activities/" + nextActivity + "/check").set(memberAuth).send({ km: 10 });
  assert.equal(earlyCheck.status, 400);
  assert.match(earlyCheck.body.error, /还未开始/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM activity_checks WHERE activity_id = ? AND user_id = ?").get(nextActivity, memberId).n, 0);
  const meetup = db.prepare("INSERT INTO meetups (club_id, run_on, place, created_at) VALUES (?, ?, '奥森', ?)");
  const pastMeetup = Number(meetup.run(club.id, "2001-01-01", now).lastInsertRowid);
  const nextMeetup = Number(meetup.run(club.id, tomorrow, now).lastInsertRowid);
  const todayMeetup = Number(meetup.run(club.id, today, now).lastInsertRowid);
  const checkedMeetup = Number(meetup.run(club.id, today, now).lastInsertRowid);
  const join = db.prepare("INSERT INTO meetup_joins (meetup_id, user_id, created_at) VALUES (?, ?, ?)");
  for (const mid of [pastMeetup, nextMeetup, todayMeetup, checkedMeetup]) join.run(mid, memberId, now);
  db.prepare("INSERT INTO meetup_checks (meetup_id, user_id, created_at) VALUES (?, ?, ?)").run(checkedMeetup, memberId, now);
  const internal = db.prepare("INSERT INTO internal_races (club_id, title, starts_at, deadline, distance, created_at) VALUES (?, '队内赛', ?, ?, '10k', ?)");
  const pastRace = Number(internal.run(club.id, "2001-01-01T06:00", "2001-01-01T05:00", now).lastInsertRowid);
  const nextRace = Number(internal.run(club.id, "2099-01-01T06:00", "2099-01-01T05:00", now).lastInsertRowid);
  const internalSignup = db.prepare("INSERT INTO internal_signups (race_id, user_id, group_id, created_at) VALUES (?, ?, 0, ?)");
  internalSignup.run(pastRace, memberId, now);
  internalSignup.run(nextRace, memberId, now);
  db.prepare("INSERT INTO internal_results (race_id, user_id, outcome, seconds, updated_at) VALUES (?, ?, 'finished', 3000, ?)").run(pastRace, memberId, now);
  db.prepare("INSERT INTO point_entries (club_id, user_id, delta, reason, created_at) VALUES (?, ?, 2, '历史出勤', ?)").run(club.id, memberId, now);
  await request(app).put("/marathon/api/me/races/bishan/result").set(memberAuth).send({ distance: "full", time: "3:30:00" });
  const approvedRequest = db.prepare("SELECT id FROM club_requests WHERE club_id = ? AND user_id = ? AND status = 'approved'").get(club.id, memberId);
  // Even a stale pending request must not resurrect membership after leaving.
  db.prepare("INSERT INTO club_requests (club_id, user_id, status, created_at) VALUES (?, ?, 'pending', ?)").run(club.id, memberId, now);

  assert.equal((await request(app).post("/marathon/api/clubs/" + club.id + "/leave")).status, 401);
  assert.equal((await request(app).post("/marathon/api/clubs/" + club.id + "/leave").set("Authorization", "Bearer " + outsider)).status, 403);
  const another = await request(app).post("/marathon/api/clubs/" + club.id + "/leave").set(memberAuth).send({ userId: ownerId });
  assert.equal(another.status, 400);
  assert.ok(db.prepare("SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?").get(club.id, memberId));
  const noOwner = await request(app).post("/marathon/api/clubs/" + club.id + "/leave").set(ownerAuth);
  assert.equal(noOwner.status, 400);
  assert.match(noOwner.body.error, /移交/);

  const left = await request(app).post("/marathon/api/clubs/" + club.id + "/leave").set(memberAuth);
  assert.equal(left.status, 200);
  assert.deepEqual(left.body.removedSignups, { activities: 1, meetups: 1, internalRaces: 1 });
  assert.equal((await request(app).get("/marathon/api/clubs/" + club.id).set(memberAuth)).status, 403);
  assert.equal((await request(app).post("/marathon/api/clubs/" + club.id + "/leave").set(memberAuth)).status, 403);
  assert.ok(db.prepare("SELECT 1 FROM activity_signups WHERE activity_id = ? AND user_id = ?").get(pastActivity, memberId));
  assert.ok(db.prepare("SELECT 1 FROM activity_checks WHERE activity_id = ? AND user_id = ?").get(pastActivity, memberId));
  assert.ok(db.prepare("SELECT 1 FROM activity_signups WHERE activity_id = ? AND user_id = ?").get(nextActivity, ownerId));
  assert.ok(db.prepare("SELECT 1 FROM meetup_joins WHERE meetup_id = ? AND user_id = ?").get(pastMeetup, memberId));
  assert.ok(db.prepare("SELECT 1 FROM meetup_joins WHERE meetup_id = ? AND user_id = ?").get(todayMeetup, memberId));
  assert.ok(db.prepare("SELECT 1 FROM meetup_joins WHERE meetup_id = ? AND user_id = ?").get(checkedMeetup, memberId));
  assert.ok(db.prepare("SELECT 1 FROM internal_signups WHERE race_id = ? AND user_id = ?").get(pastRace, memberId));
  assert.ok(db.prepare("SELECT 1 FROM internal_results WHERE race_id = ? AND user_id = ?").get(pastRace, memberId));
  assert.equal(db.prepare("SELECT SUM(delta) AS n FROM point_entries WHERE club_id = ? AND user_id = ?").get(club.id, memberId).n, 2);
  assert.ok(db.prepare("SELECT 1 FROM results WHERE user_id = ? AND race_id = 'bishan'").get(memberId));
  assert.ok(db.prepare("SELECT 1 FROM plans WHERE user_id = ? AND race_id = 'bishan'").get(memberId));
  assert.equal(db.prepare("SELECT status FROM club_requests WHERE id = ?").get(approvedRequest.id).status, "approved");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM club_requests WHERE club_id = ? AND user_id = ? AND status = 'pending'").get(club.id, memberId).n, 0);

  const applied = await request(app).post("/marathon/api/clubs/join").set(memberAuth).send({ clubId: club.id });
  assert.equal(applied.status, 200);
  assert.equal(applied.body.pending, true);
  const pending = db.prepare("SELECT id FROM club_requests WHERE club_id = ? AND user_id = ? AND status = 'pending'").get(club.id, memberId);
  assert.notEqual(pending.id, approvedRequest.id);
  assert.equal((await request(app).get("/marathon/api/clubs/" + club.id).set(memberAuth)).status, 403);
  assert.equal((await request(app).post("/marathon/api/clubs/" + club.id + "/requests/" + pending.id).set(ownerAuth).send({ decision: "approve" })).status, 200);
  assert.equal((await request(app).get("/marathon/api/clubs/" + club.id).set(memberAuth)).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM activity_signups WHERE activity_id = ? AND user_id = ?").get(nextActivity, memberId).n, 0);
});

test("club and platform admins remove members and their future signups in one transaction", async () => {
  const owner = await session("移出清理团长");
  const manager = await session("移出清理管理员");
  const clubMember = await session("团内接口移出对象");
  const deskMember = await session("后台接口移出对象");
  const ownerAuth = { Authorization: "Bearer " + owner };
  const managerAuth = { Authorization: "Bearer " + manager };
  const created = await createClub(ownerAuth, "移出报名清理团");
  const clubId = created.body.club.id;
  await joinWithCode(manager, created.body.club.code);
  await joinWithCode(clubMember, created.body.club.code);
  await joinWithCode(deskMember, created.body.club.code);
  const db = getDb();
  const uid = (token) => db.prepare("SELECT id FROM users WHERE token = ?").get(token).id;
  const managerId = uid(manager);
  const clubMemberId = uid(clubMember);
  const deskMemberId = uid(deskMember);
  const ownerId = uid(owner);
  assert.equal((await request(app).put("/marathon/api/clubs/" + clubId + "/members/" + managerId).set(ownerAuth).send({ role: "manager" })).status, 200);

  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() + 8 * 3600 * 1000 - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 8 * 3600 * 1000 + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const activityInsert = db.prepare("INSERT INTO activities (club_id, title, starts_at, created_at) VALUES (?, ?, ?, ?)");
  const meetupInsert = db.prepare("INSERT INTO meetups (club_id, run_on, place, created_at) VALUES (?, ?, '奥森', ?)");
  const raceInsert = db.prepare("INSERT INTO internal_races (club_id, title, starts_at, deadline, distance, created_at) VALUES (?, ?, ?, ?, '10k', ?)");
  const signup = db.prepare("INSERT INTO activity_signups (activity_id, user_id, created_at) VALUES (?, ?, ?)");
  const meetupJoin = db.prepare("INSERT INTO meetup_joins (meetup_id, user_id, created_at) VALUES (?, ?, ?)");
  const raceSignup = db.prepare("INSERT INTO internal_signups (race_id, user_id, group_id, created_at) VALUES (?, ?, 0, ?)");
  const records = new Map();
  for (const [label, targetId] of [["club", clubMemberId], ["desk", deskMemberId]]) {
    const pastActivity = Number(activityInsert.run(clubId, label + " 历史训练", "2001-01-01T06:00", now).lastInsertRowid);
    const futureActivity = Number(activityInsert.run(clubId, label + " 未来训练", "2099-01-01T06:00", now).lastInsertRowid);
    signup.run(pastActivity, targetId, now);
    signup.run(futureActivity, targetId, now);
    signup.run(futureActivity, ownerId, now);
    const groupId = Number(db.prepare("INSERT INTO activity_groups (activity_id, name, capacity) VALUES (?, '限额组', 2)").run(futureActivity).lastInsertRowid);
    db.prepare("UPDATE activity_signups SET group_id = ? WHERE activity_id = ?").run(groupId, futureActivity);
    db.prepare("INSERT INTO activity_checks (activity_id, user_id, km, created_at) VALUES (?, ?, 10, ?)").run(futureActivity, targetId, now);
    db.prepare("INSERT INTO point_entries (club_id, user_id, delta, reason, ref_key, created_at) VALUES (?, ?, 2, '已记积分', ?, ?)").run(clubId, targetId, "act:" + futureActivity + ":" + targetId, now);
    const fullBeforeRemoval = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + futureActivity + "/signup").set(managerAuth).send({ groupId });
    assert.equal(fullBeforeRemoval.status, 400);
    assert.match(fullBeforeRemoval.body.error, /满了/);

    const pastMeetup = Number(meetupInsert.run(clubId, yesterday, now).lastInsertRowid);
    const todayMeetup = Number(meetupInsert.run(clubId, today, now).lastInsertRowid);
    const futureMeetup = Number(meetupInsert.run(clubId, tomorrow, now).lastInsertRowid);
    const checkedFutureMeetup = Number(meetupInsert.run(clubId, "2099-01-01", now).lastInsertRowid);
    for (const meetupId of [pastMeetup, todayMeetup, futureMeetup, checkedFutureMeetup]) meetupJoin.run(meetupId, targetId, now);
    db.prepare("INSERT INTO meetup_checks (meetup_id, user_id, created_at) VALUES (?, ?, ?)").run(checkedFutureMeetup, targetId, now);

    const pastRace = Number(raceInsert.run(clubId, label + " 历史队内赛", "2001-01-01T06:00", "2001-01-01T05:00", now).lastInsertRowid);
    const futureRace = Number(raceInsert.run(clubId, label + " 未来队内赛", "2099-01-01T06:00", "2099-01-01T05:00", now).lastInsertRowid);
    const resultRace = Number(raceInsert.run(clubId, label + " 有成绩队内赛", "2099-01-02T06:00", "2099-01-02T05:00", now).lastInsertRowid);
    raceSignup.run(pastRace, targetId, now);
    raceSignup.run(futureRace, targetId, now);
    raceSignup.run(resultRace, targetId, now);
    db.prepare("INSERT INTO internal_results (race_id, user_id, outcome, seconds, updated_at) VALUES (?, ?, 'finished', 3000, ?)").run(resultRace, targetId, now);
    db.prepare("INSERT INTO club_requests (club_id, user_id, status, created_at) VALUES (?, ?, 'pending', ?)").run(clubId, targetId, now);
    records.set(label, { targetId, groupId, pastActivity, futureActivity, pastMeetup, todayMeetup, futureMeetup, checkedFutureMeetup, pastRace, futureRace, resultRace });
  }

  const adminAuth = { Authorization: "Bearer " + process.env.ADMIN_TOKEN };
  const removedInClub = await request(app).delete("/marathon/api/clubs/" + clubId + "/members/" + clubMemberId).set(managerAuth);
  const removedInDesk = await request(app).delete("/marathon/api/admin/clubs/" + clubId + "/members/" + deskMemberId).set(adminAuth);
  for (const [response, label, token] of [[removedInClub, "club", clubMember], [removedInDesk, "desk", deskMember]]) {
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.removedSignups, { activities: 1, meetups: 1, internalRaces: 1 });
    const row = records.get(label);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM club_members WHERE club_id = ? AND user_id = ?").get(clubId, row.targetId).n, 0);
    assert.ok(db.prepare("SELECT 1 FROM activity_signups WHERE activity_id = ? AND user_id = ?").get(row.pastActivity, row.targetId));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM activity_signups WHERE activity_id = ? AND user_id = ?").get(row.futureActivity, row.targetId).n, 0);
    assert.ok(db.prepare("SELECT 1 FROM activity_signups WHERE activity_id = ? AND user_id = ?").get(row.futureActivity, ownerId));
    assert.ok(db.prepare("SELECT 1 FROM activity_checks WHERE activity_id = ? AND user_id = ?").get(row.futureActivity, row.targetId));
    assert.ok(db.prepare("SELECT 1 FROM meetup_joins WHERE meetup_id = ? AND user_id = ?").get(row.pastMeetup, row.targetId));
    assert.ok(db.prepare("SELECT 1 FROM meetup_joins WHERE meetup_id = ? AND user_id = ?").get(row.todayMeetup, row.targetId));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM meetup_joins WHERE meetup_id = ? AND user_id = ?").get(row.futureMeetup, row.targetId).n, 0);
    assert.ok(db.prepare("SELECT 1 FROM meetup_joins WHERE meetup_id = ? AND user_id = ?").get(row.checkedFutureMeetup, row.targetId));
    assert.ok(db.prepare("SELECT 1 FROM internal_signups WHERE race_id = ? AND user_id = ?").get(row.pastRace, row.targetId));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM internal_signups WHERE race_id = ? AND user_id = ?").get(row.futureRace, row.targetId).n, 0);
    assert.ok(db.prepare("SELECT 1 FROM internal_signups WHERE race_id = ? AND user_id = ?").get(row.resultRace, row.targetId));
    assert.ok(db.prepare("SELECT 1 FROM internal_results WHERE race_id = ? AND user_id = ?").get(row.resultRace, row.targetId));
    assert.equal(db.prepare("SELECT SUM(delta) AS n FROM point_entries WHERE club_id = ? AND user_id = ?").get(clubId, row.targetId).n, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM club_requests WHERE club_id = ? AND user_id = ? AND status = 'pending'").get(clubId, row.targetId).n, 0);
    assert.equal((await request(app).get("/marathon/api/clubs/" + clubId).set("Authorization", "Bearer " + token)).status, 403);
    const roster = await request(app).get("/marathon/api/clubs/" + clubId + "/activities/" + row.futureActivity).set(ownerAuth);
    assert.equal(roster.body.signups.some((person) => person.userId === row.targetId), false);
    assert.equal(roster.body.checks.find((person) => person.userId === row.targetId).historical, true);
    assert.equal(roster.body.groups[0].signed, 1);
    const refill = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + row.futureActivity + "/signup").set(managerAuth).send({ groupId: row.groupId });
    assert.equal(refill.status, 200);
    assert.equal(refill.body.activity.groups[0].left, 0);
    // A later settlement must not revoke points attached to a preserved legacy check.
    assert.equal((await request(app).delete("/marathon/api/clubs/" + clubId + "/activities/" + row.futureActivity + "/signup").set(managerAuth)).status, 200);
    assert.equal(db.prepare("SELECT SUM(delta) AS n FROM point_entries WHERE club_id = ? AND user_id = ?").get(clubId, row.targetId).n, 2);
  }
  assert.equal((await request(app).delete("/marathon/api/clubs/" + clubId + "/members/" + clubMemberId).set(managerAuth)).status, 404);
  assert.equal((await request(app).delete("/marathon/api/admin/clubs/" + clubId + "/members/" + deskMemberId).set(adminAuth)).status, 404);
});

test("club race boards retain results even after the personal plan is removed", async () => {
  const owner = await session("纯成绩团长");
  const member = await session("纯成绩队友");
  const auth = { Authorization: "Bearer " + owner };
  const memberAuth = { Authorization: "Bearer " + member };
  const created = await createClub(auth, "纯成绩测试团");
  await joinWithCode(member, created.body.club.code);
  assert.equal((await request(app).put("/marathon/api/me/races/bishan/result").set(memberAuth).send({ distance: "full", time: "3:26:00" })).status, 200);
  assert.equal((await request(app).delete("/marathon/api/me/races/bishan").set(memberAuth)).status, 200);
  const initial = await request(app).get("/marathon/api/clubs/" + created.body.club.id).set(auth);
  const race = initial.body.board.find((item) => item.race.id === "bishan");
  assert.ok(race);
  assert.equal(race.marks.length, 1);
  assert.equal(race.marks[0].nickname, "纯成绩队友");
  assert.equal(race.marks[0].status, "完赛");
  assert.equal(race.marks[0].clock, "3:26:00");
  assert.equal(race.results.length, 1);
  assert.equal(race.summary, "1 人完赛");
  await request(app).put("/marathon/api/me/races/bishan").set(auth).send({ status: "想跑" });
  const shared = await request(app).get("/marathon/api/clubs/" + created.body.club.id).set(auth);
  assert.equal(shared.body.board.find((item) => item.race.id === "bishan").marks.length, 2);
});

test("a club card names who has not paid", async () => {
  const leader = await session("团长");
  const mate = await session("队友");
  const created = await createClub(leader, "滨河跑团");
  const code = created.body.club.code;
  await joinWithCode(mate, code);
  await request(app).put("/marathon/api/me/races/bishan").set("Authorization", "Bearer " + leader).send({ status: "已缴费" });
  await request(app).put("/marathon/api/me/races/bishan").set("Authorization", "Bearer " + mate).send({ status: "中签" });

  const card = await request(app).get("/marathon/api/races/bishan/card?code=" + code).set("Authorization", "Bearer " + leader);
  assert.equal(card.status, 200);
  assert.equal(card.body.summary, "2 人已报名，1 人还没缴");
  assert.deepEqual(card.body.unpaid, [{ nickname: "队友" }]);
  assert.match(card.body.title, /截止 · 2026重庆璧山马拉松/);
  assert.match(card.body.text, /还没缴：队友/);
  assert.match(card.body.text, new RegExp("跑团口令 " + code));

  const detail = await request(app).get("/marathon/api/races/bishan").set("Authorization", "Bearer " + leader);
  assert.equal(detail.body.cards[0].summary, "2 人已报名，1 人还没缴");

  const missing = await request(app).get("/marathon/api/races/bishan/card?code=NO-SUCH");
  assert.equal(missing.status, 404);
});

test("the day before a deadline is a reminder", () => {
  const row = RACES.find((race) => race.id === "caa-10k");
  const race = presentRace(row, new Date("2026-10-09T10:00:00+08:00"));
  const hits = reminderHits(race);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].key, "deadline");
  assert.equal(hits[0].reason, "明天截止");
});

test("two full marathons a week apart are flagged, and finish status is allowed", async () => {
  const token = await session("双马");
  const auth = { Authorization: "Bearer " + token };
  const first = await request(app).put("/marathon/api/me/races/bishan").set(auth).send({ status: "已报名" });
  const second = await request(app).put("/marathon/api/me/races/songshanhu").set(auth).send({ status: "想跑" });
  const done = await request(app).put("/marathon/api/me/races/closed-sample").set(auth).send({ status: "完赛" });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(done.status, 200);

  const me = await request(app).get("/marathon/api/me").set(auth);
  assert.equal(me.body.gapDays, 21);
  assert.equal(me.body.conflicts.length, 1);
  assert.equal(me.body.conflicts[0].days, 7);
  assert.match(me.body.conflicts[0].text, /璧山/);
  assert.match(me.body.conflicts[0].text, /松山湖/);

  const detail = await request(app).get("/marathon/api/races/bishan").set(auth);
  assert.equal(detail.body.conflicts.length, 1);
  assert.ok(detail.body.statuses.includes("完赛"));
  assert.ok(detail.body.statuses.includes("弃赛"));

  const open = await request(app).get("/marathon/api/reminders");
  assert.equal(open.status, 200);
  assert.ok(Array.isArray(open.body.reminders));
  assert.equal(open.body.conflicts.length, 0);
});

test("a finish time becomes the career PB, footprint, and this year's race distance", async () => {
  const anon = await request(app).put("/marathon/api/me/races/bishan/result").send({ distance: "full", time: "3:30:00" });
  assert.equal(anon.status, 401);

  const token = await session("记成绩");
  const auth = { Authorization: "Bearer " + token };
  const badTime = await request(app).put("/marathon/api/me/races/bishan/result").set(auth).send({ distance: "full", time: "很快" });
  assert.equal(badTime.status, 400);
  const badDistance = await request(app).put("/marathon/api/me/races/yuxi/result").set(auth).send({ distance: "10k", time: "45:30" });
  assert.equal(badDistance.status, 400);
  const longStory = await request(app)
    .put("/marathon/api/me/races/bishan/result")
    .set(auth)
    .send({ distance: "full", time: "3:30:00", story: "事".repeat(201) });
  assert.equal(longStory.status, 400);

  const full = await request(app)
    .put("/marathon/api/me/races/bishan/result")
    .set(auth)
    .send({ distance: "full", time: "3:30:00", story: "后程稳住了" });
  assert.equal(full.status, 200);
  assert.equal(full.body.result.clock, "3:30:00");
  assert.equal(full.body.result.pb, true);
  assert.equal(full.body.result.pace, "4'59\"");
  assert.equal(full.body.result.story, "后程稳住了");

  const half = await request(app).put("/marathon/api/me/races/yuxi/result").set(auth).send({ distance: "half", time: "1:45:00" });
  assert.equal(half.status, 200);
  const older = await request(app).put("/marathon/api/me/races/closed-sample/result").set(auth).send({ distance: "full", time: "4:10:00" });
  assert.equal(older.status, 200);

  const me = await request(app).get("/marathon/api/me").set(auth);
  assert.equal(me.body.career.finished, 3);
  assert.equal(me.body.career.pb.full, "3:30:00");
  assert.equal(me.body.career.pb.half, "1:45:00");
  assert.equal(me.body.career.yearKm, 63.29);
  assert.deepEqual(me.body.career.provinces.sort(), ["云南", "浙江", "重庆"].sort());
  assert.equal(me.body.plans.find((item) => item.race.id === "bishan").status, "完赛");
  const saved = me.body.results.find((item) => item.race.id === "closed-sample");
  assert.equal(saved.pb, false);
  assert.equal(saved.race.kind, "road");

  const faster = await request(app).put("/marathon/api/me/races/songshanhu/result").set(auth).send({ distance: "full", time: "3:10:00" });
  assert.equal(faster.status, 200);
  assert.equal(faster.body.result.pb, true);
  assert.equal(faster.body.career.pb.full, "3:10:00");
  const detail = await request(app).get("/marathon/api/races/bishan").set(auth);
  assert.equal(detail.body.myResult.pb, false);
  assert.equal(detail.body.myStatus, "完赛");

  const removed = await request(app).delete("/marathon/api/me/races/closed-sample/result").set(auth);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.career.finished, 3);
});

test("two teammates who are still in the race can go together", async () => {
  const leader = await session("凑队团长");
  const mate = await session("凑队队友");
  const created = await createClub(leader, "凑队跑团");
  assert.equal(created.status, 200);
  const code = created.body.club.code;
  await joinWithCode(mate, code);

  await request(app).put("/marathon/api/me/races/jinjiang").set("Authorization", "Bearer " + leader).send({ status: "已报名" });
  const alone = await request(app).get("/marathon/api/races/jinjiang/card?code=" + code).set("Authorization", "Bearer " + leader);
  assert.equal(alone.body.squad.ready, false);
  assert.equal(alone.body.squad.size, 1);
  assert.equal(alone.body.squad.text, "还差一个人就能凑一队");
  assert.equal(/可以一起去/.test(alone.body.text), false);

  await request(app).put("/marathon/api/me/races/jinjiang").set("Authorization", "Bearer " + mate).send({ status: "已缴费" });
  const card = await request(app).get("/marathon/api/races/jinjiang/card?code=" + code).set("Authorization", "Bearer " + leader);
  assert.equal(card.body.squad.ready, true);
  assert.equal(card.body.squad.size, 2);
  assert.match(card.body.text, /可以一起去：凑队团长、凑队队友|可以一起去：凑队队友、凑队团长/);

  const missed = await request(app).put("/marathon/api/me/races/hailing").set("Authorization", "Bearer " + leader).send({ status: "未中签" });
  assert.equal(missed.status, 200);
  await request(app).put("/marathon/api/me/races/hailing").set("Authorization", "Bearer " + mate).send({ status: "想跑" });
  const out = await request(app).get("/marathon/api/races/hailing/card?code=" + code).set("Authorization", "Bearer " + leader);
  assert.equal(out.body.squad.ready, false);
  assert.equal(out.body.squad.size, 0);
  assert.equal(out.body.squad.text, "1 人想跑，还没人报名");

  const board = await request(app).get("/marathon/api/clubs/" + created.body.club.id).set("Authorization", "Bearer " + leader);
  const jinjiang = board.body.board.find((item) => item.race.id === "jinjiang");
  assert.equal(jinjiang.squad.ready, true);
  assert.match(jinjiang.text, /可以一起去/);
});

test("missing a draw points at nearby races that are still open", () => {
  const now = new Date("2026-10-09T10:00:00+08:00");
  const races = RACES.map((row) => presentRace(row, now));
  const bishan = races.find((race) => race.id === "bishan");
  assert.deepEqual(
    nearbyOpen(bishan, races).map((race) => race.id),
    ["songshanhu", "yuxi", "tmsk"]
  );
  const far = races.find((race) => race.id === "huangyaguan");
  assert.deepEqual(nearbyOpen(far, races), []);
});

test("a missed draw is the only time nearby races are listed", async () => {
  const token = await session("没中签");
  const auth = { Authorization: "Bearer " + token };
  const quiet = await request(app).get("/marathon/api/races/bishan").set(auth);
  assert.deepEqual(quiet.body.alternatives, []);
  assert.equal(quiet.body.alternativeNote, "");

  await request(app).put("/marathon/api/me/races/bishan").set(auth).send({ status: "未中签" });
  const detail = await request(app).get("/marathon/api/races/bishan").set(auth);
  const now = new Date();
  const races = RACES.map((row) => presentRace(row, now));
  const expected = nearbyOpen(races.find((race) => race.id === "bishan"), races);
  assert.deepEqual(detail.body.alternatives.map((race) => race.id), expected.map((race) => race.id));
  assert.equal(detail.body.alternatives.some((race) => race.id === "bishan"), false);
  if (expected.length) assert.match(detail.body.alternativeNote, /这场没中/);

  const created = await createClub(auth, "改报跑团");
  const board = await request(app).get("/marathon/api/clubs/" + created.body.club.id).set(auth);
  const item = board.body.board.find((row) => row.race.id === "bishan");
  assert.deepEqual(item.alternatives.map((race) => race.id), expected.map((race) => race.id));
  if (expected.length) assert.match(item.alternativeNote, /没中签没中/);
});

test("marking a draw makes a personal card and names who got in", async () => {
  const token = await session("中签卡");
  const mate = await session("已缴队友");
  const auth = { Authorization: "Bearer " + token };
  const before = await request(app).get("/marathon/api/races/tmsk").set(auth);
  assert.equal(before.body.drawText, "");

  await request(app).put("/marathon/api/me/races/tmsk").set(auth).send({ status: "中签" });
  const detail = await request(app).get("/marathon/api/races/tmsk").set(auth);
  assert.equal(
    detail.body.drawText,
    "中签卡中签了\n2026图木舒克马拉松\n2026-11-01 · 新疆 图木舒克\n打开赛历，看这场谁一起去。"
  );
  assert.equal(/官方|中签率|保证/.test(detail.body.drawText), false);

  const created = await createClub(auth, "中签跑团");
  const applied = await request(app).post("/marathon/api/clubs/join").set("Authorization", "Bearer " + mate).send({ code: created.body.club.code });
  assert.equal(applied.body.pending, true);
  const ownerView = await request(app).get("/marathon/api/clubs/" + created.body.club.id).set(auth);
  const pending = ownerView.body.requests.find((item) => item.nickname === "已缴队友");
  assert.ok(pending);
  assert.equal((await request(app).post("/marathon/api/clubs/" + created.body.club.id + "/requests/" + pending.id).set(auth).send({ decision: "approve" })).status, 200);
  await request(app).put("/marathon/api/me/races/tmsk").set("Authorization", "Bearer " + mate).send({ status: "已缴费" });
  const anonymousCard = await request(app).get("/marathon/api/races/tmsk/card?code=" + created.body.club.code);
  assert.equal(anonymousCard.status, 401);
  const outsider = await session("旁观赛事卡");
  const outsiderCard = await request(app).get("/marathon/api/races/tmsk/card?code=" + created.body.club.code).set("Authorization", "Bearer " + outsider);
  assert.equal(outsiderCard.status, 403);
  const card = await request(app).get("/marathon/api/races/tmsk/card?code=" + created.body.club.code).set(auth);
  assert.equal(card.status, 200);
  assert.match(card.body.text, /中了：(已缴队友、中签卡|中签卡、已缴队友)/);

  await request(app).put("/marathon/api/me/races/tmsk").set(auth).send({ status: "已缴费" });
  const paid = await request(app).get("/marathon/api/races/tmsk").set(auth);
  assert.equal(paid.body.drawText, "");
});

test("a club ranks each member's best full and half", async () => {
  const fast = await session("快的");
  const slow = await session("慢的");
  const fastAuth = { Authorization: "Bearer " + fast };
  const slowAuth = { Authorization: "Bearer " + slow };
  const created = await createClub(fastAuth, "成绩跑团");
  const code = created.body.club.code;
  await joinWithCode(slow, code);
  await request(app).put("/marathon/api/me/races/bishan/result").set(fastAuth).send({ distance: "full", time: "3:10:00" });
  await request(app).put("/marathon/api/me/races/songshanhu/result").set(fastAuth).send({ distance: "full", time: "3:40:00" });
  await request(app).put("/marathon/api/me/races/yuxi/result").set(fastAuth).send({ distance: "half", time: "1:45:00" });
  await request(app).put("/marathon/api/me/races/jinjiang/result").set(slowAuth).send({ distance: "full", time: "4:00:00" });
  await request(app).put("/marathon/api/me/races/hailing/result").set(slowAuth).send({ distance: "half", time: "1:30:00" });

  const board = await request(app).get("/marathon/api/clubs/" + created.body.club.id).set(fastAuth);
  const full = board.body.ranks.find((group) => group.distance === "full");
  assert.deepEqual(full.rows.map((row) => row.nickname), ["快的", "慢的"]);
  assert.equal(full.rows[0].clock, "3:10:00");
  assert.equal(full.rows[0].raceId, "bishan");
  assert.equal(full.rows[0].place, 1);
  const half = board.body.ranks.find((group) => group.distance === "half");
  assert.equal(half.rows[0].nickname, "慢的");
  assert.equal(half.rows[0].clock, "1:30:00");
  assert.equal(half.rows[1].nickname, "快的");

  const outsider = await session("榜外");
  const denied = await request(app).get("/marathon/api/clubs/" + created.body.club.id).set("Authorization", "Bearer " + outsider);
  assert.equal(denied.status, 403);
});

test("a club check-in records who showed up today and keeps yesterday", async () => {
  const leader = await session("团长签");
  const mate = await session("队友签");
  const auth = { Authorization: "Bearer " + leader };
  const created = await createClub(auth, "签到跑团");
  const clubId = created.body.club.id;
  await joinWithCode(mate, created.body.club.code);

  const first = await request(app).post("/marathon/api/clubs/" + clubId + "/checkins").set(auth).send({ note: "夜跑" });
  assert.equal(first.status, 200);
  assert.equal(first.body.checkedIn, true);
  assert.equal(first.body.checkins[0].label, "今天");
  assert.deepEqual(first.body.checkins[0].rows[0], {
    userId: first.body.checkins[0].rows[0].userId,
    nickname: "团长签",
    note: "夜跑",
    mine: true
  });
  assert.equal(JSON.stringify(first.body.checkins).includes("公里"), false);

  const again = await request(app).post("/marathon/api/clubs/" + clubId + "/checkins").set(auth).send({ note: "轻松跑" });
  assert.equal(again.body.checkins[0].rows.length, 1);
  assert.equal(again.body.checkins[0].rows[0].note, "轻松跑");

  const mateIn = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/checkins")
    .set("Authorization", "Bearer " + mate)
    .send({ note: "" });
  assert.equal(mateIn.body.checkins[0].rows.length, 2);

  const long = await request(app).post("/marathon/api/clubs/" + clubId + "/checkins").set(auth).send({ note: "一".repeat(41) });
  assert.equal(long.status, 400);

  const leaderRow = getDb().prepare("SELECT id FROM users WHERE token = ?").get(leader);
  const today = again.body.checkins[0].date;
  const [y, m, d] = today.split("-").map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  getDb()
    .prepare("INSERT INTO checkins (club_id, user_id, day, note, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(clubId, leaderRow.id, yesterday, "昨天到了", "2026-10-08T02:00:00.000Z");

  const board = await request(app).get("/marathon/api/clubs/" + clubId).set(auth);
  assert.equal(board.body.checkins[0].label, "今天");
  assert.equal(board.body.checkins[1].label, "昨天");
  assert.equal(board.body.checkins[1].rows[0].note, "昨天到了");

  const undone = await request(app).delete("/marathon/api/clubs/" + clubId + "/checkins").set(auth);
  assert.equal(undone.body.checkedIn, false);
  assert.equal(undone.body.checkins.some((day) => day.label === "今天" && day.rows.some((row) => row.nickname === "团长签")), false);
  assert.equal(undone.body.checkins.some((day) => day.label === "昨天"), true);

  const outsider = await session("签外");
  const denied = await request(app).post("/marathon/api/clubs/" + clubId + "/checkins").set("Authorization", "Bearer " + outsider).send({ note: "路过" });
  assert.equal(denied.status, 403);
});

test("a race without a signup deadline is not shown as closed", () => {
  const race = presentRace(
    { id: "caa-1", name: "未公布报名", city: "重庆", province: "重庆", distances: "half", race_date: "2026-12-27", deadline: "", place: "巴南" },
    new Date("2026-10-09T10:00:00+08:00")
  );
  assert.equal(race.regStatus, "报名时间未公布");
  assert.equal(race.deadlineLabel, "报名时间未公布");
  assert.equal(race.open, false);
});

test("official races stay in review until published, and do not overwrite a known deadline", async () => {
  process.env.ADMIN_TOKEN = "test-admin";
  const admin = { Authorization: "Bearer test-admin" };
  const before = await request(app).get("/marathon/api/races/bishan");
  const deadline = before.body.race.deadline;
  const pages = [
    [
      { raceId: 1000481014, raceName: "2026重庆璧山马拉松", raceGrade: "A", raceTime: "2026-11-15", raceAddress: "重庆市/重庆市/", raceItem: '["全程","半程"]' },
      { raceId: 4242, raceName: "2026后台测试马拉松", raceGrade: "B", raceTime: "2026-12-01", raceAddress: "浙江省/杭州市/西湖区", raceItem: '["全程"]' },
      { raceId: 7, raceName: "2020旧比赛", raceGrade: "C", raceTime: "2020-01-01", raceAddress: "北京市/北京市/", raceItem: '["半程"]' }
    ]
  ];
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ success: true, data: { results: pages[0], pageCount: 1, totalCount: pages[0].length } })
  });
  const saved = await syncOfficial(getDb(), { fetchImpl, pauseMs: 0, now: new Date("2026-10-09T10:00:00+08:00") });
  assert.equal(saved.count, 2);
  const pending = listOfficial(getDb(), { status: "pending" });
  assert.equal(pending.some((row) => row.name === "2020旧比赛"), false);
  getDb()
    .prepare(
      `INSERT INTO official_races (
         official_id, name, race_date, province, city, district, grade, distances, items, detail_url, seen_at
       ) VALUES ('old', '2020旧比赛', '2020-01-01', '', '', '', '', '', '', '', '2026-10-09T00:00:00.000Z')`
    )
    .run();
  assert.equal(listOfficial(getDb(), { status: "pending", upcomingFrom: "2026-10-09" }).some((row) => row.officialId === "old"), false);
  assert.equal(listOfficial(getDb(), { q: "旧比赛" }).some((row) => row.officialId === "old"), true);
  const bishan = pending.find((row) => row.officialId === "1000481014");
  assert.equal(bishan.match.id, "bishan");

  const linked = await request(app).post("/marathon/api/admin/official/1000481014/publish").set(admin).send({});
  assert.equal(linked.status, 200);
  assert.equal(linked.body.linked, true);
  const kept = await request(app).get("/marathon/api/races/bishan");
  assert.equal(kept.body.race.deadline, deadline);
  assert.equal(kept.body.race.officialUrl, "https://www.runchina.org.cn/#/race/v/detail/1000481014");
  assert.equal(kept.body.race.gradeLabel, "A 类");

  const created = await request(app).post("/marathon/api/admin/official/4242/publish").set(admin).send({});
  assert.equal(created.body.raceId, "caa-4242");
  const fresh = await request(app).get("/marathon/api/races/caa-4242");
  assert.equal(fresh.body.race.regStatus, "报名时间未公布");
  assert.equal(fresh.body.race.source, "中国马拉松官网赛历");
  assert.equal(fresh.body.race.city, "杭州");

  const blank = await request(app).put("/marathon/api/admin/races/bishan").set(admin).send({});
  assert.equal(blank.status, 400);
  const still = await request(app).get("/marathon/api/races/bishan");
  assert.equal(still.body.race.deadline, deadline);

  const sourced = await request(app).put("/marathon/api/admin/races/caa-4242").set(admin).send({ deadline: "2026-12-20", source: "规程，2026-10-09" });
  assert.equal(sourced.status, 200);
  assert.equal(sourced.body.race.regStatus, "报名中");
  assert.equal(sourced.body.race.source, "规程，2026-10-09");

  pages[0] = [{ raceId: 1000481014, raceName: "2026重庆璧山马拉松", raceGrade: "A", raceTime: "2026-11-20", raceAddress: "重庆市/重庆市/", raceItem: '["全程","半程"]' }];
  await syncOfficial(getDb(), { fetchImpl, pauseMs: 0, now: new Date("2026-10-09T10:00:00+08:00") });
  const diff = listOfficial(getDb(), { status: "published" }).find((row) => row.officialId === "1000481014");
  assert.match(diff.diffNote, /2026-11-20/);
  const unchanged = await request(app).get("/marathon/api/races/bishan");
  assert.equal(unchanged.body.race.raceDate, "2026-11-15");
  const applied = await request(app).post("/marathon/api/admin/official/1000481014/apply").set(admin).send({});
  assert.equal(applied.body.changed, true);
  const moved = await request(app).get("/marathon/api/races/bishan");
  assert.equal(moved.body.race.raceDate, "2026-11-20");
  assert.equal(moved.body.race.deadline, deadline);

  getDb().prepare("UPDATE races SET race_date = ? WHERE id = ?").run("2026-11-15", "bishan");

  const user = await session("后台外");
  const denied = await request(app).post("/marathon/api/admin/official/sync").set("Authorization", "Bearer " + user).send({});
  assert.equal(denied.status, 401);
});

test("each edition keeps its own race website, and a later change stays out of the calendar until adopted", async () => {
  process.env.ADMIN_TOKEN = "test-admin";
  const admin = { Authorization: "Bearer test-admin" };
  const details = {
    "9001": { compNameOrganizer: "测试组委会", webUrl: "", scale: "5000" },
    "9000": { compNameOrganizer: "去年组委会", webUrl: "https://example.com/2025", scale: "" },
    "9002": { compNameOrganizer: "", webUrl: "javascript:alert(1)", scale: "" }
  };
  const pages = [[
    { raceId: 9001, raceName: "2026网站测试马拉松", raceGrade: "A", raceTime: "2026-12-01", raceAddress: "浙江省/杭州市/西湖区", raceItem: '["全程"]' },
    { raceId: 9000, raceName: "2025网站测试马拉松", raceGrade: "A", raceTime: "2025-12-01", raceAddress: "浙江省/杭州市/西湖区", raceItem: '["全程"]' },
    { raceId: 9002, raceName: "2026没有网站马拉松", raceGrade: "B", raceTime: "2026-12-02", raceAddress: "江苏省/南京市/", raceItem: '["半程"]' }
  ]];
  const fetchImpl = async (url, init) => {
    if (String(url).includes("searchById")) {
      const id = String(JSON.parse(init.body).id);
      const ssdetails = details[id];
      return { ok: true, json: async () => ({ success: true, data: ssdetails ? { ssdetails } : {} }) };
    }
    return { ok: true, json: async () => ({ success: true, data: { results: pages[0], pageCount: 1, totalCount: pages[0].length } }) };
  };
  const now = new Date("2026-10-09T10:00:00+08:00");
  const saved = await syncOfficial(getDb(), { fetchImpl, pauseMs: 0, upcomingOnly: false, now });
  assert.equal(saved.changed, 0);
  const current = listOfficial(getDb(), { q: "2026网站测试" }).find((row) => row.officialId === "9001");
  assert.equal(current.webUrl, "");
  assert.equal(current.organizer, "测试组委会");
  assert.equal(current.priorWeb.webUrl, "https://example.com/2025");
  assert.match(current.webNote, /不沿用/);
  const byCity = listOfficial(getDb(), { q: "杭州" });
  assert.ok(byCity.some((row) => row.officialId === "9001"));
  assert.equal(byCity.some((row) => row.officialId === "9002"), false);
  const none = listOfficial(getDb(), { q: "没有网站" }).find((row) => row.officialId === "9002");
  assert.equal(none.webUrl, "");
  assert.equal(none.priorWeb, null);
  assert.match(none.webNote, /没有给赛事网站/);

  const published = await request(app).post("/marathon/api/admin/official/9001/publish").set(admin).send({});
  assert.equal(published.status, 200);
  const race = await request(app).get("/marathon/api/races/" + published.body.raceId);
  assert.equal(race.body.race.eventUrl, "");
  assert.equal(race.body.race.organizer, "测试组委会");
  assert.equal(race.body.race.deadline, "");

  details["9001"] = { compNameOrganizer: "测试组委会", webUrl: "https://example.com/2026", scale: "5000" };
  const again = await syncOfficial(getDb(), { fetchImpl, pauseMs: 0, upcomingOnly: false, now });
  assert.equal(again.changed, 1);
  const updated = listOfficial(getDb(), { q: "2026网站测试" }).find((row) => row.officialId === "9001");
  assert.equal(updated.webUrl, "https://example.com/2026");
  assert.equal(updated.changes.some((change) => change.label === "赛事网站" && change.newValue === "https://example.com/2026"), true);
  assert.match(updated.diffNote, /example.com\/2026/);
  const still = await request(app).get("/marathon/api/races/" + published.body.raceId);
  assert.equal(still.body.race.eventUrl, "");

  const applied = await request(app).post("/marathon/api/admin/official/9001/apply").set(admin).send({});
  assert.equal(applied.body.changed, true);
  const adopted = await request(app).get("/marathon/api/races/" + published.body.raceId);
  assert.equal(adopted.body.race.eventUrl, "https://example.com/2026");
  assert.equal(adopted.body.race.organizer, "测试组委会");
  assert.equal(adopted.body.race.deadline, "");

  const quiet = await syncOfficial(getDb(), { fetchImpl, pauseMs: 0, upcomingOnly: false, now });
  assert.equal(quiet.changed, 0);
  delete details["9001"];
  const missed = await syncOfficial(getDb(), { fetchImpl, pauseMs: 0, upcomingOnly: false, now });
  assert.equal(missed.changed, 0);
  const kept = listOfficial(getDb(), { q: "2026网站测试" }).find((row) => row.officialId === "9001");
  assert.equal(kept.webUrl, "https://example.com/2026");
});

test("upcoming official races show on the calendar without inventing a deadline", async () => {
  const now = new Date("2026-10-09T10:00:00+08:00");
  getDb()
    .prepare(
      `INSERT INTO official_races (
         official_id, name, race_date, province, city, district, grade, distances, items, detail_url, seen_at, status
       ) VALUES ('9100', '2026公开赛历测试', '2026-12-20', '浙江', '杭州', '西湖', 'A', 'full', '全程', 'https://www.runchina.org.cn/#/race/v/detail/9100', '2026-10-09T00:00:00.000Z', 'pending')`
    )
    .run();
  const before = await request(app).get("/marathon/api/races/bishan");
  const opened = openUpcoming(getDb(), now);
  assert.ok(opened >= 1);
  const listed = await request(app).get("/marathon/api/races?status=upcoming");
  const created = listed.body.races.find((race) => race.id === "caa-9100");
  assert.equal(created.regStatus, "报名时间未公布");
  assert.equal(created.deadline, "");
  assert.equal(created.city, "杭州");
  const kept = await request(app).get("/marathon/api/races/bishan");
  assert.equal(kept.body.race.deadline, before.body.race.deadline);
  const hidden = await request(app).get("/marathon/api/races?status=open");
  assert.equal(hidden.body.races.some((race) => race.id === "caa-9100"), false);
});

test("october 2026 lunar labels match the race calendar", async () => {
  const { lunarLabel } = await import("../../web/src/lunar.js");
  assert.equal(lunarLabel(2026, 10, 1), "廿一");
  assert.equal(lunarLabel(2026, 10, 9), "廿九");
  assert.equal(lunarLabel(2026, 10, 10), "九月");
  assert.equal(lunarLabel(2026, 10, 11), "初二");
  assert.equal(lunarLabel(2026, 2, 17), "正月");
});

test("a calendar month lists races on their race day", async () => {
  const res = await request(app).get("/marathon/api/races?status=all&month=2026-11");
  assert.equal(res.status, 200);
  const bishan = res.body.races.find((race) => race.id === "bishan");
  assert.equal(bishan.raceDate, "2026-11-15");
  const other = await request(app).get("/marathon/api/races?status=all&month=2026-10");
  assert.equal(other.body.races.some((race) => race.id === "bishan"), false);
});

test("admin signs in with a username and password", async () => {
  process.env.ADMIN_USER = "admin";
  process.env.ADMIN_PASSWORD = "test-pass-8";
  const blank = await request(app).post("/marathon/api/admin/login").send({ username: "", password: "" });
  assert.equal(blank.status, 400);
  const bad = await request(app).post("/marathon/api/admin/login").send({ username: "admin", password: "wrong-pass" });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error, "用户名或密码不对");
  const ok = await request(app).post("/marathon/api/admin/login").send({ username: "admin", password: "test-pass-8" });
  assert.equal(ok.status, 200);
  assert.equal(typeof ok.body.token, "string");
  assert.notEqual(ok.body.token, "test-pass-8");
  const list = await request(app).get("/marathon/api/admin/official").set("Authorization", "Bearer " + ok.body.token);
  assert.equal(list.status, 200);
  const changed = await request(app)
    .post("/marathon/api/admin/password")
    .set("Authorization", "Bearer " + ok.body.token)
    .send({ current: "test-pass-8", next: "new-pass-9" });
  assert.equal(changed.status, 200);
  const old = await request(app).post("/marathon/api/admin/login").send({ username: "admin", password: "test-pass-8" });
  assert.equal(old.status, 401);
  const again = await request(app).post("/marathon/api/admin/login").send({ username: "admin", password: "new-pass-9" });
  assert.equal(again.status, 200);
  const out = await request(app).post("/marathon/api/admin/logout").set("Authorization", "Bearer " + again.body.token).send({});
  assert.equal(out.status, 200);
  const closed = await request(app).get("/marathon/api/admin/official").set("Authorization", "Bearer " + again.body.token);
  assert.equal(closed.status, 401);
});

test("a legacy admin/admin record is disabled when an existing database is upgraded", async () => {
  process.env.ADMIN_USER = "";
  process.env.ADMIN_PASSWORD = "";
  const salt = "0123456789abcdef0123456789abcdef";
  const hash = require("crypto").scryptSync("admin", salt, 32).toString("hex");
  getDb().prepare("INSERT OR REPLACE INTO admins (username, password_hash, salt, role, created_at) VALUES ('admin', ?, ?, 'admin', ?)").run(hash, salt, new Date().toISOString());
  const first = await request(app).post("/marathon/api/admin/login").send({ username: "admin", password: "admin" });
  assert.equal(first.status, 401);
  assert.equal(getDb().prepare("SELECT 1 FROM admins WHERE username = 'admin'").get(), undefined);
});

test("today names who has not paid, and a plan can be removed", async () => {
  const guest = await request(app).get("/marathon/api/today");
  assert.equal(guest.status, 200);
  assert.equal(guest.body.user, null);
  assert.equal(guest.body.tasks.length, 0);

  const leader = await session("值班团长");
  const auth = { Authorization: "Bearer " + leader };
  const created = await createClub(auth, "值班跑团");
  const mate = await session("还没缴");
  await joinWithCode(mate, created.body.club.code);
  await request(app).put("/marathon/api/me/races/bishan").set(auth).send({ status: "已缴费" });
  await request(app).put("/marathon/api/me/races/bishan").set("Authorization", "Bearer " + mate).send({ status: "中签" });
  await request(app).put("/marathon/api/me/races/songshanhu").set(auth).send({ status: "想跑" });

  const today = await request(app).get("/marathon/api/today").set(auth);
  assert.equal(today.body.user.nickname, "值班团长");
  const unpaid = today.body.tasks.find((task) => task.kind === "unpaid");
  assert.ok(unpaid);
  assert.match(unpaid.body, /还没缴/);
  assert.equal(unpaid.clubId, created.body.club.id);
  assert.ok(today.body.tasks.some((task) => task.kind === "conflict"));

  const anon = await request(app).delete("/marathon/api/me/races/songshanhu");
  assert.equal(anon.status, 401);
  const removed = await request(app).delete("/marathon/api/me/races/songshanhu").set(auth);
  assert.equal(removed.status, 200);
  const me = await request(app).get("/marathon/api/me").set(auth);
  assert.equal(me.body.plans.some((plan) => plan.race.id === "songshanhu"), false);
  assert.equal(me.body.plans.some((plan) => plan.race.id === "bishan"), true);
});

test("club activity points need enough people and kilometres, then gifts spend them", async () => {
  const leader = await session("活动团长");
  const mate = await session("活动队友");
  const third = await session("活动第三");
  const auth = { Authorization: "Bearer " + leader };
  const created = await createClub(auth, "活动跑团");
  const clubId = created.body.club.id;
  await joinWithCode(mate, created.body.club.code);
  await joinWithCode(third, created.body.club.code);

  const denied = await request(app).post("/marathon/api/clubs/" + clubId + "/groups").set("Authorization", "Bearer " + mate).send({ name: "A组" });
  assert.equal(denied.status, 403);
  const group = await request(app).post("/marathon/api/clubs/" + clubId + "/groups").set(auth).send({ name: "A组", pace: "530", capacity: 1 });
  assert.equal(group.status, 200);
  const openGroup = await request(app).post("/marathon/api/clubs/" + clubId + "/groups").set(auth).send({ name: "B组", pace: "600", capacity: 0 });
  assert.equal(openGroup.status, 200);

  const activity = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities")
    .set(auth)
    .send({ title: "周日 LSD", place: "玉渊潭", startsAt: "2099-10-11 05:40", minKm: 5, minPeople: 3, points: 1 });
  assert.equal(activity.status, 200);
  assert.match(activity.body.activity.rule, /满 3 人/);
  const aid = activity.body.activity.id;

  const noGroup = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/signup").set(auth).send({});
  assert.equal(noGroup.status, 400);
  assert.equal((await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/signup").set(auth).send({ groupId: group.body.group.id })).status, 200);
  const full = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/signup")
    .set("Authorization", "Bearer " + mate)
    .send({ groupId: group.body.group.id });
  assert.equal(full.status, 400);
  assert.equal(
    (await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/signup").set("Authorization", "Bearer " + mate).send({ groupId: openGroup.body.group.id })).status,
    200
  );
  assert.equal(
    (await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/signup").set("Authorization", "Bearer " + third).send({ groupId: openGroup.body.group.id })).status,
    200
  );

  const startedAt = new Date(Date.now() + 8 * 3600 * 1000 - 60 * 1000).toISOString().slice(0, 16);
  const endsAt = new Date(Date.now() + 8 * 3600 * 1000 + 60 * 60 * 1000).toISOString().slice(0, 16);
  getDb().prepare("UPDATE activities SET starts_at = ?, ends_at = ? WHERE id = ?").run(startedAt, endsAt, aid);
  assert.equal((await request(app).get("/marathon/api/clubs/" + clubId + "/activities/" + aid).set(auth)).body.activity.checkAvailable, true);
  const early = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/check").set(auth).send({ km: 6 });
  assert.equal(early.body.awarded, false);
  assert.equal(early.body.myPoints, 0);
  await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/check").set("Authorization", "Bearer " + mate).send({ km: 4 });
  const still = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/check").set("Authorization", "Bearer " + third).send({ km: 8 });
  assert.equal(still.body.awarded, false);

  const enough = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/check").set("Authorization", "Bearer " + mate).send({ km: 5.2 });
  assert.equal(enough.body.awarded, true);
  assert.equal(enough.body.myPoints, 1);
  const leaderPoints = await request(app).get("/marathon/api/clubs/" + clubId).set(auth);
  assert.equal(leaderPoints.body.myPoints, 1);
  assert.equal(leaderPoints.body.members.find((item) => item.nickname === "活动第三").points, 1);
  assert.equal(leaderPoints.body.activities[0].awarded, true);

  const short = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/check").set("Authorization", "Bearer " + mate).send({ km: 3 });
  assert.equal(short.body.awarded, false);
  assert.equal(short.body.myPoints, 0);
  const back = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/check").set("Authorization", "Bearer " + mate).send({ km: 5 });
  assert.equal(back.body.myPoints, 1);

  await request(app).put("/marathon/api/me/races/bishan").set(auth).send({ status: "完赛" });
  await request(app).put("/marathon/api/me/races/bishan/result").set(auth).send({ distance: "full", time: "3:28:15", story: "" });
  const raced = await request(app).get("/marathon/api/clubs/" + clubId).set(auth);
  const bishan = raced.body.board.find((item) => item.race.id === "bishan");
  assert.equal(bishan.tally["完赛"], 1);
  assert.equal(bishan.pbCount, 1);
  assert.equal(bishan.marks[0].pb, true);
  assert.equal(bishan.marks[0].clock, "3:28:15");

  const gift = await request(app).post("/marathon/api/clubs/" + clubId + "/gifts").set(auth).send({ name: "团袜", cost: 1, stock: 1 });
  const redeemed = await request(app).post("/marathon/api/clubs/" + clubId + "/gifts/" + gift.body.gift.id + "/redeem").set(auth);
  assert.equal(redeemed.status, 200);
  assert.equal(redeemed.body.myPoints, 0);
  const again = await request(app).post("/marathon/api/clubs/" + clubId + "/gifts/" + gift.body.gift.id + "/redeem").set("Authorization", "Bearer " + mate);
  assert.equal(again.status, 400);

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const photo = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/media")
    .set(auth)
    .attach("file", jpeg, { filename: "run.jpg", contentType: "image/jpeg" });
  assert.equal(photo.status, 200);
  assert.equal(photo.body.media.kind, "photo");
  const seen = await request(app).get("/marathon/api/media/" + photo.body.media.id).set(auth);
  assert.equal(seen.status, 200);
  assert.equal(seen.headers["content-type"], "image/jpeg");
  const outsider = await session("活动外人");
  const hidden = await request(app).get("/marathon/api/media/" + photo.body.media.id).set("Authorization", "Bearer " + outsider);
  assert.equal(hidden.status, 403);
  const fake = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/media")
    .set(auth)
    .attach("file", Buffer.from("not a photo"), { filename: "x.jpg", contentType: "image/jpeg" });
  assert.equal(fake.status, 400);

  const video = Buffer.alloc(16);
  video.write("ftyp", 4, "ascii");
  video.write("isom", 8, "ascii");
  const clip = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/media")
    .set("Authorization", "Bearer " + mate)
    .attach("file", video, { filename: "run.mp4", contentType: "video/mp4" });
  assert.equal(clip.status, 200);
  assert.equal(clip.body.media.kind, "video");
  const part = await request(app).get("/marathon/api/media/" + clip.body.media.id).set(auth).set("Range", "bytes=0-3");
  assert.equal(part.status, 206);
  assert.match(part.headers["content-range"], /^bytes 0-3\//);

  const detail = await request(app).get("/marathon/api/clubs/" + clubId + "/activities/" + aid).set(auth);
  assert.equal(detail.body.signups.length, 3);
  assert.equal(detail.body.media.length, 2);
  assert.equal(detail.body.groups.find((item) => item.name === "A组").signed, 1);
});

test("handbook adds links and regulation pages without replacing a pulled deadline", async () => {
  process.env.ADMIN_TOKEN = "test-admin";
  const admin = { Authorization: "Bearer test-admin" };
  const before = await request(app).get("/marathon/api/races/tmsk");
  assert.equal(before.status, 200);
  const saved = await request(app).put("/marathon/api/admin/races/tmsk/guide").set(admin).send({
    name: "",
    distances: ["full", "half"],
    kinds: ["trail"],
    groups: "25公里、50公里",
    startAt: "10:00",
    bibAt: "2026-10-28",
    fee: "全程 120 元，半程 100 元",
    scale: "全程 1000，半程 2000",
    phone: "0592-5372205 / 0592-5372206",
    signupUrl: "https://example.com/signup",
    drawUrl: "https://example.com/draw",
    bibUrl: "",
    resultUrl: "https://example.com/result",
    liveUrl: "",
    eventUrl: "",
    route: "永安湖环湖",
    pickup: "起点按号段领取",
    pacers: "配速组见规程"
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.race.name, "2026图木舒克马拉松");
  assert.equal(saved.body.race.deadline, before.body.race.deadline);
  assert.equal(saved.body.race.fee, "全程 120 元，半程 100 元");
  assert.equal(saved.body.race.startAt, "10:00");
  assert.deepEqual(saved.body.race.kindLabels, ["越野"]);
  assert.deepEqual(saved.body.race.groups, ["25公里", "50公里"]);
  assert.equal(saved.body.race.links[0].label, "去报名");
  assert.ok(saved.body.race.nodes.some((node) => node.label === "号码公布"));

  const bad = await request(app).put("/marathon/api/admin/races/tmsk/guide").set(admin).send({ signupUrl: "javascript:alert(1)", distances: ["full"], kinds: [] });
  assert.equal(bad.status, 400);
  const kept = await request(app).get("/marathon/api/races/tmsk");
  assert.equal(kept.body.race.links[0].url, "https://example.com/signup");

  getDb()
    .prepare(
      `INSERT INTO official_races (
         official_id, name, race_date, province, city, district, grade, distances, items, detail_url, seen_at
       ) VALUES ('tmsk-test', '2026图木舒克马拉松', '2026-11-01', '新疆', '图木舒克', '', 'A', 'full', '全程', 'https://www.runchina.org.cn/#/race/v/detail/tmsk-test', '2026-10-12T00:00:00.000Z')`
    )
    .run();
  const published = await request(app).post("/marathon/api/admin/official/tmsk-test/publish").set(admin).send({});
  assert.equal(published.status, 200);
  assert.equal(published.body.linked, true);
  const after = await request(app).get("/marathon/api/races/tmsk");
  assert.equal(after.body.race.deadline, before.body.race.deadline);
  assert.equal(after.body.race.fee, "全程 120 元，半程 100 元");
  assert.equal(after.body.race.signupUrl || after.body.race.links[0].url, "https://example.com/signup");

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const photo = await request(app)
    .post("/marathon/api/admin/races/tmsk/sheets?kind=guide")
    .set(admin)
    .attach("file", jpeg, { filename: "guide.jpg", contentType: "image/jpeg" });
  assert.equal(photo.status, 200);
  const seen = await request(app).get("/marathon/api/race-sheets/" + photo.body.sheet.id);
  assert.equal(seen.status, 200);
  assert.equal(seen.headers["content-type"], "image/jpeg");
  const detail = await request(app).get("/marathon/api/races/tmsk");
  assert.equal(detail.body.race.guide.length, 1);
  assert.equal(detail.body.race.deadline, before.body.race.deadline);

  const fake = await request(app)
    .post("/marathon/api/admin/races/tmsk/sheets?kind=guide")
    .set(admin)
    .attach("file", Buffer.from("not a photo"), { filename: "x.jpg", contentType: "image/jpeg" });
  assert.equal(fake.status, 400);
  const user = await session("手册外");
  const denied = await request(app).put("/marathon/api/admin/races/tmsk/guide").set("Authorization", "Bearer " + user).send({ distances: ["full"], kinds: [] });
  assert.equal(denied.status, 401);
});

test("admin lists pulled races and a delete stays deleted after the next pull", async () => {
  process.env.ADMIN_TOKEN = "test-admin";
  const admin = { Authorization: "Bearer test-admin" };
  getDb()
    .prepare(
      `INSERT INTO races (id, name, city, province, distances, race_date, deadline, place)
       VALUES ('drop-me', '删除测试马拉松', '北京', '北京', 'full', '2026-12-01', '2026-11-01T18:00:00+08:00', '北京')`
    )
    .run();
  getDb()
    .prepare(
      `INSERT INTO official_races (
         official_id, name, race_date, province, city, district, grade, distances, items, detail_url, seen_at, status, race_id
       ) VALUES ('drop-me-src', '删除测试马拉松', '2026-12-01', '北京', '北京', '', '', 'full', '', 'https://www.runchina.org.cn/#/race/v/detail/drop-me', '2026-10-12T00:00:00.000Z', 'published', 'drop-me')`
    )
    .run();
  const user = await session("删场的人");
  const marked = await request(app).put("/marathon/api/me/races/drop-me").set("Authorization", "Bearer " + user).send({ status: "已报名" });
  assert.equal(marked.status, 200);

  const listed = await request(app).get("/marathon/api/admin/races?when=upcoming").set(admin);
  assert.equal(listed.status, 200);
  assert.ok(listed.body.races.some((race) => race.id === "drop-me"));
  assert.equal(listed.body.races.some((race) => race.id === "closed-sample"), false);
  const past = await request(app).get("/marathon/api/admin/races?when=all&q=" + encodeURIComponent("收官")).set(admin);
  assert.equal(past.status, 200);
  assert.ok(past.body.races.some((race) => race.id === "closed-sample"));
  const middle = await request(app).get("/marathon/api/admin/races?when=all&q=" + encodeURIComponent("试马")).set(admin);
  assert.ok(middle.body.races.some((race) => race.id === "drop-me"));
  assert.equal(middle.body.races.some((race) => race.id === "closed-sample"), false);
  const spaced = await request(app).get("/marathon/api/admin/races?when=all&q=" + encodeURIComponent("删除 测试")).set(admin);
  assert.ok(spaced.body.races.some((race) => race.id === "drop-me"));

  const moved = await request(app).put("/marathon/api/admin/races/drop-me/guide").set(admin).send({
    raceDate: "2026-12-02",
    distances: ["full"],
    kinds: []
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.race.raceDate, "2026-12-02");
  assert.equal(moved.body.race.deadline, "2026-11-01T18:00:00+08:00");
  const keptDate = await request(app).put("/marathon/api/admin/races/drop-me/guide").set(admin).send({
    raceDate: "",
    distances: ["full"],
    kinds: []
  });
  assert.equal(keptDate.body.race.raceDate, "2026-12-02");

  const outsider = await request(app).delete("/marathon/api/admin/races/drop-me").set("Authorization", "Bearer " + user);
  assert.equal(outsider.status, 401);
  const removed = await request(app).delete("/marathon/api/admin/races/drop-me").set(admin);
  assert.equal(removed.status, 200);
  assert.equal((await request(app).get("/marathon/api/races/drop-me")).status, 404);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM plans WHERE race_id = 'drop-me'").get().n, 0);
  assert.equal(getDb().prepare("SELECT status FROM official_races WHERE official_id = 'drop-me-src'").get().status, "ignored");
  openUpcoming(getDb(), new Date("2026-10-12T04:00:00.000Z"));
  assert.equal(getDb().prepare("SELECT id FROM races WHERE id = 'drop-me'").get(), undefined);
  assert.equal(getDb().prepare("SELECT id FROM races WHERE name = '删除测试马拉松'").get(), undefined);
});

test("a race missing from the official calendar can be added by hand", async () => {
  process.env.ADMIN_TOKEN = "test-admin";
  const admin = { Authorization: "Bearer test-admin" };
  const user = await session("手工添加");
  const denied = await request(app).post("/marathon/api/admin/races").set("Authorization", "Bearer " + user).send({ name: "不该写入", raceDate: "2026-12-20", city: "北京", distances: ["full"] });
  assert.equal(denied.status, 401);
  const missing = await request(app).post("/marathon/api/admin/races").set(admin).send({ name: "只有名字", raceDate: "2026-12-20" });
  assert.equal(missing.status, 400);
  const badLink = await request(app).post("/marathon/api/admin/races").set(admin).send({
    name: "坏链接不该写入",
    raceDate: "2026-12-20",
    city: "临沂",
    distances: ["10k"],
    kinds: [],
    officialUrl: "javascript:alert(1)"
  });
  assert.equal(badLink.status, 400);
  const created = await request(app).post("/marathon/api/admin/races").set(admin).send({
    name: "2026手工添加测试赛",
    raceDate: "2026-12-20",
    city: "临沂",
    province: "山东",
    place: "沂水",
    startAt: "08:00:00",
    distances: ["10k"],
    kinds: ["family", "trail"],
    groups: "15公里、30公里",
    organizer: "沂水组委会",
    grade: "C",
    fee: "10公里 80 元",
    scale: "3000 人",
    signupUrl: "https://example.com/hand-signup",
    resultUrl: "https://example.com/hand-result",
    route: "滨河公园",
    pickup: "赛前一天领物",
    pacers: "5 分配速",
    guideText: "参赛须知：沿滨河公园环湖。"
  });
  assert.equal(created.status, 200);
  const race = await request(app).get("/marathon/api/races/" + created.body.id);
  assert.equal(race.status, 200);
  assert.equal(race.body.race.name, "2026手工添加测试赛");
  assert.equal(race.body.race.deadline, "");
  assert.equal(race.body.race.deadlineLabel, "报名时间未公布");
  assert.equal(race.body.race.source, "后台手工添加");
  assert.equal(race.body.race.startAt, "08:00");
  assert.deepEqual(race.body.race.kindLabels, ["亲子跑", "越野"]);
  assert.deepEqual(race.body.race.groups, ["15公里", "30公里"]);
  assert.equal(race.body.race.organizer, "沂水组委会");
  assert.equal(race.body.race.fee, "10公里 80 元");
  assert.equal(race.body.race.route, "滨河公园");
  assert.equal(race.body.race.pickup, "赛前一天领物");
  assert.equal(race.body.race.startAt, "08:00");
  assert.equal(race.body.race.guideText, "参赛须知：沿滨河公园环湖。");
  assert.equal(race.body.race.links.find((item) => item.key === "signup").url, "https://example.com/hand-signup");
  const places = await request(app).get("/marathon/api/admin/places").set(admin);
  assert.equal(places.status, 200);
  assert.ok(places.body.spots.some((item) => item.city === "临沂" && item.place === "沂水"));
  const deniedPlaces = await request(app).get("/marathon/api/admin/places").set("Authorization", "Bearer " + user);
  assert.equal(deniedPlaces.status, 401);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const pacer = await request(app)
    .post("/marathon/api/admin/races/" + created.body.id + "/sheets?kind=pacer")
    .set(admin)
    .attach("file", jpeg, { filename: "pacer.jpg", contentType: "image/jpeg" });
  assert.equal(pacer.status, 200);
  assert.equal(pacer.body.sheet.kind, "pacer");
  const unknown = await request(app)
    .post("/marathon/api/admin/races/" + created.body.id + "/sheets?kind=poster")
    .set(admin)
    .attach("file", jpeg, { filename: "x.jpg", contentType: "image/jpeg" });
  assert.equal(unknown.status, 400);
  const routeMap = await request(app)
    .post("/marathon/api/admin/races/" + created.body.id + "/sheets?kind=route")
    .set(admin)
    .attach("file", jpeg, { filename: "route.jpg", contentType: "image/jpeg" });
  assert.equal(routeMap.status, 200);
  assert.equal(routeMap.body.sheet.kind, "route");
  for (let i = 0; i < 3; i += 1) {
    const extra = await request(app)
      .post("/marathon/api/admin/races/" + created.body.id + "/sheets?kind=route")
      .set(admin)
      .attach("file", jpeg, { filename: "route.jpg", contentType: "image/jpeg" });
    assert.equal(extra.status, 200);
  }
  const tooMany = await request(app)
    .post("/marathon/api/admin/races/" + created.body.id + "/sheets?kind=route")
    .set(admin)
    .attach("file", jpeg, { filename: "route.jpg", contentType: "image/jpeg" });
  assert.equal(tooMany.status, 400);
  const withPhoto = await request(app).get("/marathon/api/races/" + created.body.id);
  assert.equal(withPhoto.body.race.pacerSheets.length, 1);
  assert.equal(withPhoto.body.race.routeSheets.length, 4);
  assert.equal(withPhoto.body.race.guide.length, 0);
  const noted = await request(app).put("/marathon/api/admin/races/" + created.body.id + "/guide").set(admin).send({
    organizer: "沂水组委会",
    grade: "C",
    distances: ["10k"],
    kinds: ["family"],
    officialUrl: "javascript:alert(1)"
  });
  assert.equal(noted.status, 400);
  const saved = await request(app).put("/marathon/api/admin/races/" + created.body.id + "/guide").set(admin).send({
    organizer: "沂水组委会",
    grade: "C",
    distances: ["10k"],
    kinds: ["family"]
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.race.organizer, "沂水组委会");
  assert.equal(saved.body.race.grade, "C");
  assert.equal(saved.body.race.deadline, "");
  assert.equal(saved.body.race.guideText, "参赛须知：沿滨河公园环湖。");
  const tooLong = await request(app).put("/marathon/api/admin/races/" + created.body.id + "/guide").set(admin).send({
    distances: ["10k"],
    kinds: ["family"],
    guideText: "规".repeat(40001)
  });
  assert.equal(tooLong.status, 400);
  assert.equal((await request(app).get("/marathon/api/races/" + created.body.id)).body.race.guideText, "参赛须知：沿滨河公园环湖。");
  openUpcoming(getDb(), new Date("2026-10-12T04:00:00.000Z"));
  const still = await request(app).get("/marathon/api/races/" + created.body.id);
  assert.equal(still.body.race.name, "2026手工添加测试赛");
  assert.equal(still.body.race.source, "后台手工添加");
});

test("admin sees nicknames, self-reported runs, and club gifts", async () => {
  process.env.ADMIN_TOKEN = "test-admin";
  const admin = { Authorization: "Bearer test-admin" };
  const user = await session("后台核对甲");
  const denied = await request(app).get("/marathon/api/admin/users").set("Authorization", "Bearer " + user);
  assert.equal(denied.status, 401);
  await request(app).put("/marathon/api/me/races/bishan").set("Authorization", "Bearer " + user).send({ status: "想跑" });
  await request(app).put("/marathon/api/me/races/bishan/result").set("Authorization", "Bearer " + user).send({ distance: "full", time: "3:29:59" });
  const club = await createClub(user, "后台核对团");
  assert.equal(club.status, 200);
  const activity = await request(app)
    .post("/marathon/api/clubs/" + club.body.club.id + "/activities")
    .set("Authorization", "Bearer " + user)
    .send({ title: "周日滨河", place: "滨河", startsAt: "2099-10-18T06:30", minKm: 5, minPeople: 1, points: 0 });
  assert.equal(activity.status, 200);
  const aid = activity.body.activity.id;
  await request(app).post("/marathon/api/clubs/" + club.body.club.id + "/activities/" + aid + "/signup").set("Authorization", "Bearer " + user).send({});
  const startedAt = new Date(Date.now() + 8 * 3600 * 1000 - 60 * 1000).toISOString().slice(0, 16);
  const endsAt = new Date(Date.now() + 8 * 3600 * 1000 + 60 * 60 * 1000).toISOString().slice(0, 16);
  getDb().prepare("UPDATE activities SET starts_at = ?, ends_at = ? WHERE id = ?").run(startedAt, endsAt, aid);
  const checked = await request(app)
    .post("/marathon/api/clubs/" + club.body.club.id + "/activities/" + aid + "/check")
    .set("Authorization", "Bearer " + user)
    .send({ km: 6.2, note: "沿河" });
  assert.equal(checked.status, 200);
  const gift = await request(app)
    .post("/marathon/api/clubs/" + club.body.club.id + "/gifts")
    .set("Authorization", "Bearer " + user)
    .send({ name: "核对袜", cost: 1, stock: 3 });
  assert.equal(gift.status, 200);

  const listed = await request(app).get("/marathon/api/admin/users?q=" + encodeURIComponent("后台核对甲")).set(admin);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.users.length, 1);
  const fragment = await request(app).get("/marathon/api/admin/users?q=" + encodeURIComponent("核对")).set(admin);
  assert.ok(fragment.body.users.some((user) => user.nickname === "后台核对甲"));
  assert.ok(fragment.body.users.every((user) => user.nickname.includes("核对")));
  assert.equal(listed.body.users[0].plans, 1);
  assert.equal(listed.body.users[0].clubs, 1);
  assert.equal(listed.body.users[0].leader, true);
  assert.equal(JSON.stringify(listed.body).includes(user), false);
  const detail = await request(app).get("/marathon/api/admin/users/" + listed.body.users[0].id).set(admin);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.user.nickname, "后台核对甲");
  assert.equal(detail.body.user.token, undefined);
  assert.equal(detail.body.clubs[0].owner, true);
  assert.equal(detail.body.plans[0].status, "完赛");
  assert.equal(detail.body.results[0].clock, "3:29:59");
  assert.equal((await request(app).get("/marathon/api/admin/users/999999").set(admin)).status, 404);

  const runs = await request(app).get("/marathon/api/admin/runs").set(admin);
  assert.equal(runs.status, 200);
  const mine = runs.body.runs.find((row) => row.nickname === "后台核对甲");
  assert.equal(mine.km, 6.2);
  assert.equal(mine.club, "后台核对团");
  assert.equal(mine.title, "周日滨河");
  assert.equal(mine.note, "沿河");

  const shop = await request(app).get("/marathon/api/admin/shop").set(admin);
  assert.equal(shop.status, 200);
  const sock = shop.body.gifts.find((row) => row.name === "核对袜");
  assert.equal(sock.club, "后台核对团");
  assert.equal(sock.cost, 1);
  assert.equal(sock.stock, 3);
  assert.equal(shop.body.redemptions.some((row) => row.name === "核对袜"), false);
});

test("a club can be joined without a code, after a manager approves", async () => {
  process.env.ADMIN_TOKEN = "test-admin";
  const admin = { Authorization: "Bearer test-admin" };
  const leader = await session("审核团长");
  const mate = await session("没口令");
  const helper = await session("跑团管理甲");
  const auth = { Authorization: "Bearer " + leader };
  const created = await createClub(auth, "审核跑团");
  const clubId = created.body.club.id;
  assert.equal(created.status, 200);

  const missing = await request(app).post("/marathon/api/clubs/join").set("Authorization", "Bearer " + mate).send({});
  assert.equal(missing.status, 400);
  const anon = await request(app).get("/marathon/api/clubs/directory");
  assert.equal(anon.status, 200);
  assert.ok(anon.body.clubs.some((item) => item.id === clubId));

  const applied = await request(app).post("/marathon/api/clubs/join").set("Authorization", "Bearer " + mate).send({ clubId });
  assert.equal(applied.status, 200);
  assert.equal(applied.body.pending, true);
  assert.equal(applied.body.club.code, undefined);
  const again = await request(app).post("/marathon/api/clubs/join").set("Authorization", "Bearer " + mate).send({ clubId });
  assert.equal(again.body.pending, true);
  assert.equal((await request(app).get("/marathon/api/clubs/" + clubId).set("Authorization", "Bearer " + mate)).status, 403);

  const directory = await request(app).get("/marathon/api/clubs/directory").set("Authorization", "Bearer " + mate);
  const listed = directory.body.clubs.find((item) => item.id === clubId);
  assert.equal(listed.pending, true);
  assert.equal(listed.code, undefined);

  await joinWithCode(helper, created.body.club.code);
  const before = await request(app).get("/marathon/api/clubs/" + clubId).set(auth);
  assert.equal(before.body.club.role, "owner");
  assert.equal(before.body.club.staff, true);
  assert.equal(before.body.requests.length, 1);
  const requestId = before.body.requests[0].id;
  const helperId = before.body.members.find((item) => item.nickname === "跑团管理甲").id;
  assert.equal(
    (await request(app).post("/marathon/api/clubs/" + clubId + "/requests/" + requestId).set("Authorization", "Bearer " + helper).send({ decision: "approve" })).status,
    403
  );
  assert.equal(
    (await request(app).put("/marathon/api/clubs/" + clubId + "/members/" + helperId).set("Authorization", "Bearer " + helper).send({ role: "manager" })).status,
    403
  );
  const promoted = await request(app).put("/marathon/api/clubs/" + clubId + "/members/" + helperId).set(auth).send({ role: "manager" });
  assert.equal(promoted.status, 200);
  const managed = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/groups")
    .set("Authorization", "Bearer " + helper)
    .send({ name: "管理组" });
  assert.equal(managed.status, 200);
  const approved = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/requests/" + requestId)
    .set("Authorization", "Bearer " + helper)
    .send({ decision: "approve" });
  assert.equal(approved.status, 200);
  const inside = await request(app).get("/marathon/api/clubs/" + clubId).set("Authorization", "Bearer " + mate);
  assert.equal(inside.status, 200);
  assert.equal(inside.body.club.staff, false);
  assert.equal(inside.body.requests.length, 0);
  assert.equal(
    (await request(app).post("/marathon/api/clubs/" + clubId + "/requests/" + requestId).set("Authorization", "Bearer " + helper).send({ decision: "approve" })).status,
    400
  );

  const outsider = await session("被拒绝");
  const asked = await request(app).post("/marathon/api/clubs/join").set("Authorization", "Bearer " + outsider).send({ clubId });
  assert.equal(asked.body.pending, true);
  const queue = await request(app).get("/marathon/api/clubs/" + clubId).set(auth);
  const askedId = queue.body.requests.find((item) => item.nickname === "被拒绝").id;
  assert.equal(
    (await request(app).post("/marathon/api/clubs/" + clubId + "/requests/" + askedId).set(auth).send({ decision: "reject" })).status,
    200
  );
  assert.equal((await request(app).get("/marathon/api/clubs/" + clubId).set("Authorization", "Bearer " + outsider)).status, 403);
  const retried = await request(app).post("/marathon/api/clubs/join").set("Authorization", "Bearer " + outsider).send({ clubId });
  assert.equal(retried.body.pending, true);

  const handed = await request(app).put("/marathon/api/clubs/" + clubId + "/members/" + helperId).set(auth).send({ role: "owner" });
  assert.equal(handed.status, 200);
  const stepped = await request(app).get("/marathon/api/clubs/" + clubId).set(auth);
  assert.equal(stepped.body.club.role, "manager");
  assert.equal(stepped.body.members.find((item) => item.nickname === "跑团管理甲").role, "owner");
  assert.equal(
    (await request(app).put("/marathon/api/clubs/" + clubId + "/members/" + helperId).set("Authorization", "Bearer " + helper).send({ role: "member" })).status,
    400
  );

  const third = await session("再申请");
  await request(app).post("/marathon/api/clubs/join").set("Authorization", "Bearer " + third).send({ clubId });
  const shortPass = await request(app).post("/marathon/api/admin/accounts").set(admin).send({ username: "clubdesk", password: "short", role: "club" });
  assert.equal(shortPass.status, 400);
  const made = await request(app).post("/marathon/api/admin/accounts").set(admin).send({ username: "clubdesk", password: "club-pass-8", role: "club" });
  assert.equal(made.status, 200);
  assert.equal(made.body.account.roleLabel, "跑团管理员");
  const duplicate = await request(app).post("/marathon/api/admin/accounts").set(admin).send({ username: "clubdesk", password: "club-pass-8", role: "club" });
  assert.equal(duplicate.status, 400);
  const login = await request(app).post("/marathon/api/admin/login").send({ username: "clubdesk", password: "club-pass-8" });
  assert.equal(login.status, 200);
  assert.equal(login.body.role, "club");
  const desk = { Authorization: "Bearer " + login.body.token };
  assert.equal((await request(app).get("/marathon/api/admin/official").set(desk)).status, 403);
  assert.equal((await request(app).get("/marathon/api/admin/accounts").set(desk)).status, 403);
  const waiting = await request(app).get("/marathon/api/admin/club-requests").set(desk);
  const hit = waiting.body.requests.find((item) => item.nickname === "再申请" && item.clubId === clubId);
  assert.ok(hit);
  assert.equal((await request(app).post("/marathon/api/admin/club-requests/" + hit.id).set(desk).send({ decision: "approve" })).status, 200);
  assert.equal((await request(app).get("/marathon/api/clubs/" + clubId).set("Authorization", "Bearer " + third)).status, 200);

  const codeApplicant = await session("口令进");
  const coded = await request(app).post("/marathon/api/clubs/join").set("Authorization", "Bearer " + codeApplicant).send({ code: created.body.club.code });
  assert.equal(coded.status, 200);
  assert.equal(coded.body.pending, true);
  assert.equal(coded.body.club.code, undefined);
  assert.equal((await request(app).get("/marathon/api/clubs/" + clubId).set("Authorization", "Bearer " + codeApplicant)).status, 403);
  const found = await request(app).get("/marathon/api/admin/users?q=" + encodeURIComponent("口令进")).set(desk);
  const personId = found.body.users[0].id;
  const codeQueue = await request(app).get("/marathon/api/clubs/" + clubId).set(auth);
  const codeRequest = codeQueue.body.requests.find((item) => item.nickname === "口令进");
  assert.ok(codeRequest);
  assert.equal((await request(app).post("/marathon/api/clubs/" + clubId + "/requests/" + codeRequest.id).set(auth).send({ decision: "approve" })).status, 200);
  assert.equal((await request(app).put("/marathon/api/admin/users/" + personId + "/clubs/" + clubId).set(desk).send({ role: "manager" })).status, 200);
  const seen = await request(app).get("/marathon/api/admin/users/" + personId).set(desk);
  assert.equal(seen.body.clubs[0].role, "manager");
  assert.equal(seen.body.clubs[0].roleLabel, "跑团管理");

  const other = await request(app).post("/marathon/api/admin/accounts").set(admin).send({ username: "otherdesk", password: "other-pass-8", role: "admin" });
  assert.equal(other.status, 200);
  const otherLogin = await request(app).post("/marathon/api/admin/login").send({ username: "otherdesk", password: "other-pass-8" });
  const own = await request(app)
    .put("/marathon/api/admin/accounts/otherdesk")
    .set({ Authorization: "Bearer " + otherLogin.body.token })
    .send({ role: "club" });
  assert.equal(own.status, 400);
  assert.equal(own.body.error, "不能改自己的角色");
});

test("only a leader can apply to found a club, and the desk approves it", async () => {
  process.env.ADMIN_TOKEN = "test-admin";
  const admin = { Authorization: "Bearer test-admin" };
  const founder = await session("建团人");
  const auth = { Authorization: "Bearer " + founder };
  const blocked = await request(app).post("/marathon/api/clubs").set(auth).send({ name: "还没资格" });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, "当前没有建团资格，无法申请创建跑团");

  const me = await request(app).get("/marathon/api/me").set(auth);
  assert.equal(me.body.user.leader, false);
  const granted = await request(app).put("/marathon/api/admin/users/" + me.body.user.id + "/leader").set(admin).send({ leader: true });
  assert.equal(granted.status, 200);
  const empty = await request(app).post("/marathon/api/clubs").set(auth).send({ name: "" });
  assert.equal(empty.status, 400);

  const applied = await request(app).post("/marathon/api/clubs").set(auth).send({ name: "待审跑团" });
  assert.equal(applied.status, 200);
  assert.equal(applied.body.pending, true);
  assert.equal(applied.body.club, undefined);
  const again = await request(app).post("/marathon/api/clubs").set(auth).send({ name: "待审跑团" });
  assert.equal(again.body.application.id, applied.body.application.id);
  const otherName = await request(app).post("/marathon/api/clubs").set(auth).send({ name: "另一个团" });
  assert.equal(otherName.status, 400);

  const directory = await request(app).get("/marathon/api/clubs/directory").set(auth);
  assert.equal(directory.body.clubs.some((item) => item.name === "待审跑团"), false);
  const mine = await request(app).get("/marathon/api/me").set(auth);
  assert.equal(mine.body.applications[0].name, "待审跑团");

  const deskUser = await request(app).post("/marathon/api/admin/accounts").set(admin).send({ username: "founddesk", password: "found-pass-8", role: "club" });
  assert.equal(deskUser.status, 200);
  const login = await request(app).post("/marathon/api/admin/login").send({ username: "founddesk", password: "found-pass-8" });
  const desk = { Authorization: "Bearer " + login.body.token };
  const queue = await request(app).get("/marathon/api/admin/club-applications").set(desk);
  const hit = queue.body.applications.find((item) => item.name === "待审跑团");
  assert.ok(hit);
  const rejected = await request(app).post("/marathon/api/admin/club-applications/" + hit.id).set(desk).send({ decision: "reject" });
  assert.equal(rejected.status, 200);
  const retried = await request(app).post("/marathon/api/clubs").set(auth).send({ name: "待审跑团" });
  assert.equal(retried.status, 200);
  const approved = await request(app).post("/marathon/api/admin/club-applications/" + retried.body.application.id).set(desk).send({ decision: "approve" });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.club.name, "待审跑团");
  const opened = await request(app).get("/marathon/api/clubs/" + approved.body.club.id).set(auth);
  assert.equal(opened.status, 200);
  assert.equal(opened.body.club.role, "owner");
  assert.equal(opened.body.club.staff, true);
  const group = await request(app).post("/marathon/api/clubs/" + approved.body.club.id + "/groups").set(auth).send({ name: "手机组" });
  assert.equal(group.status, 200);
  const removed = await request(app).put("/marathon/api/admin/users/" + me.body.user.id + "/leader").set(admin).send({ leader: false });
  assert.equal(removed.status, 200);
  const later = await request(app).post("/marathon/api/clubs").set(auth).send({ name: "再建一个" });
  assert.equal(later.status, 403);
});

test("a club can be found by its name, its leader, or a manager", async () => {
  const leader = await session("搜索团长");
  const manager = await session("搜索管理");
  const member = await session("搜索成员");
  const looker = await session("搜索的人");
  const created = await createClub(leader, "搜索跑团");
  const clubId = created.body.club.id;
  const leaderAuth = { Authorization: "Bearer " + leader };
  await joinWithCode(manager, created.body.club.code);
  await joinWithCode(member, created.body.club.code);
  const detail = await request(app).get("/marathon/api/clubs/" + clubId).set(leaderAuth);
  const managerId = detail.body.members.find((item) => item.nickname === "搜索管理").id;
  assert.equal((await request(app).put("/marathon/api/clubs/" + clubId + "/members/" + managerId).set(leaderAuth).send({ role: "manager" })).status, 200);

  const eyes = { Authorization: "Bearer " + looker };
  const byName = await request(app).get("/marathon/api/clubs/directory?q=" + encodeURIComponent("搜索跑")).set(eyes);
  const named = byName.body.clubs.find((item) => item.id === clubId);
  assert.equal(named.name, "搜索跑团");
  assert.equal(named.leader, "搜索团长");
  assert.equal(named.code, undefined);
  const byLeader = await request(app).get("/marathon/api/clubs/directory?q=" + encodeURIComponent("搜索团长")).set(eyes);
  assert.ok(byLeader.body.clubs.some((item) => item.id === clubId));
  const byManager = await request(app).get("/marathon/api/clubs/directory?q=" + encodeURIComponent("搜索管理")).set(eyes);
  assert.ok(byManager.body.clubs.some((item) => item.id === clubId));
  const byMember = await request(app).get("/marathon/api/clubs/directory?q=" + encodeURIComponent("搜索成员")).set(eyes);
  assert.equal(byMember.body.clubs.some((item) => item.id === clubId), false);
  const wild = await request(app).get("/marathon/api/clubs/directory?q=" + encodeURIComponent("%")).set(eyes);
  assert.equal(wild.body.clubs.some((item) => item.id === clubId), false);
  const missing = await request(app).get("/marathon/api/clubs/directory?q=" + encodeURIComponent("没有这个团")).set(eyes);
  assert.equal(missing.body.clubs.length, 0);

  const head = await createClub(leader, "中青跑团");
  await createClub(leader, "北京中青");
  const typed = await request(app).get("/marathon/api/clubs/directory?q=" + encodeURIComponent("中")).set(eyes);
  const names = typed.body.clubs.map((item) => item.name).filter((name) => name === "中青跑团" || name === "北京中青");
  assert.deepEqual(names, ["中青跑团", "北京中青"]);
  assert.equal(typed.body.clubs.find((item) => item.id === head.body.club.id).code, undefined);
});

async function captchaCode() {
  const cap = await request(app).get("/marathon/api/auth/captcha");
  assert.equal(cap.status, 200);
  assert.match(cap.body.image, /^data:image\/png;base64,/);
  const row = getDb().prepare("SELECT code FROM captchas WHERE token = ?").get(cap.body.token);
  return { token: cap.body.token, code: row.code };
}

test("wechat login binds OpenID and only exposes the owner's chosen avatar to club members", async () => {
  const priorAppId = process.env.WECHAT_MINIPROGRAM_APP_ID;
  const priorSecret = process.env.WECHAT_MINIPROGRAM_APP_SECRET;
  const priorExchange = app.locals.wechatCodeExchange;
  process.env.WECHAT_MINIPROGRAM_APP_ID = "test-app-id";
  process.env.WECHAT_MINIPROGRAM_APP_SECRET = "test-app-secret";
  app.locals.wechatCodeExchange = async (code, credentials) => {
    assert.equal(credentials.appId, "test-app-id");
    assert.equal(credentials.secret, "test-app-secret");
    if (code === "fail") throw new Error("exchange failed");
    return { openid: code === "legacy-identity" ? "legacy-openid" : "test-openid" };
  };
  try {
    const before = getDb().prepare("SELECT COUNT(*) AS n FROM users").get().n;
    const unknown = await request(app).post("/marathon/api/auth/wechat").send({ code: "valid-code" });
    assert.equal(unknown.status, 409);
    assert.equal(unknown.body.code, "WECHAT_REGISTRATION_REQUIRED");
    assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM users").get().n, before);
    const first = await request(app).post("/marathon/api/auth/wechat").send({ code: "fresh-valid-code", createAccount: true });
    assert.equal(first.status, 200);
    assert.match(first.body.user.nickname, /^跑者/);
    assert.equal(first.body.user.openid, undefined);
    const auth = { Authorization: "Bearer " + first.body.token };

    await session("已占用昵称");
    const duplicateName = await request(app).put("/marathon/api/me/profile").set(auth).send({ nickname: "已占用昵称" });
    assert.equal(duplicateName.status, 409);

    const avatarData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cX1kAAAAASUVORK5CYII=";
    const profile = await request(app).put("/marathon/api/me/profile").set(auth).send({
      nickname: "微信头像跑者", avatar: avatarData
    });
    assert.equal(profile.status, 200);
    const avatarUrl = profile.body.user.avatar;
    assert.match(avatarUrl, /^\/marathon\/api\/avatars\/\d+\/[a-f0-9]{64}\.png$/);
    assert.ok(getDb().prepare("SELECT avatar FROM users WHERE id = ?").get(first.body.user.id).avatar.length < 100);
    const downloaded = await request(app).get(avatarUrl);
    assert.equal(downloaded.status, 200);
    assert.match(downloaded.headers["content-type"], /image\/png/);
    assert.deepEqual(downloaded.body, Buffer.from(avatarData.split(",")[1], "base64"));
    const oversized = await request(app).put("/marathon/api/me/profile").set(auth).send({
      nickname: "微信头像跑者",
      avatar: "data:image/svg+xml;base64," + "A".repeat(100)
    });
    assert.equal(oversized.status, 400);
    const refreshedProfile = await request(app).get("/marathon/api/me").set(auth);
    assert.equal(refreshedProfile.body.user.avatar, avatarUrl);

    const club = await createClub(first.body.token, "头像跑团");
    const detail = await request(app).get("/marathon/api/clubs/" + club.body.club.id).set(auth);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.members.find((item) => item.nickname === "微信头像跑者").avatar, avatarUrl);
    const publicClub = await request(app).get("/marathon/api/clubs/" + club.body.club.id + "/public");
    assert.equal(publicClub.status, 200);
    assert.equal(publicClub.body.club.name, "头像跑团");
    assert.equal(publicClub.body.club.leader, "微信头像跑者");
    assert.equal(publicClub.body.club.memberCount, 1);
    assert.equal(publicClub.body.club.members, undefined);
    assert.equal(publicClub.body.club.avatar, undefined);
    assert.equal(publicClub.body.club.code, undefined);
    const invite = await request(app).get("/marathon/api/clubs/invite/" + club.body.club.code);
    assert.equal(invite.status, 200);
    assert.equal(invite.body.club.avatar, undefined);
    assert.equal(invite.body.club.code, undefined);

    const nextSession = await request(app).post("/marathon/api/auth/wechat").send({ code: "another-code" });
    assert.equal(nextSession.status, 200);
    assert.equal(nextSession.body.user.id, first.body.user.id);
    assert.equal(nextSession.body.user.avatar, avatarUrl);
    assert.notEqual(nextSession.body.token, first.body.token);
    const rejected = await request(app).post("/marathon/api/auth/wechat").send({ code: "fail" });
    assert.equal(rejected.status, 502);
    assert.equal(rejected.body.error.includes("openid"), false);

    const legacyAccount = await request(app).post("/marathon/api/auth/register").send({ nickname: "迁移账号", password: "password-8" });
    assert.equal(legacyAccount.status, 200);
    const linked = await request(app).post("/marathon/api/me/wechat").set("Authorization", "Bearer " + legacyAccount.body.token).send({ code: "legacy-identity" });
    assert.equal(linked.status, 200);
    const migrated = await request(app).post("/marathon/api/auth/wechat").send({ code: "legacy-identity" });
    assert.equal(migrated.status, 200);
    assert.equal(migrated.body.user.id, legacyAccount.body.user.id);
    const duplicateAccount = await request(app).post("/marathon/api/auth/register").send({ nickname: "重复绑定", password: "password-8" });
    assert.equal(duplicateAccount.status, 200);
    const duplicateLink = await request(app).post("/marathon/api/me/wechat").set("Authorization", "Bearer " + duplicateAccount.body.token).send({ code: "legacy-identity" });
    assert.equal(duplicateLink.status, 409);
    const migratedAuth = { Authorization: "Bearer " + migrated.body.token };
    const overwrite = await request(app).post("/marathon/api/me/wechat").set(migratedAuth).send({ code: "another-code" });
    assert.equal(overwrite.status, 409);
    assert.equal(getDb().prepare("SELECT openid FROM users WHERE id = ?").get(migrated.body.user.id).openid, "legacy-openid");
    const wrongUnbind = await request(app).delete("/marathon/api/me/wechat").set(migratedAuth).send({ password: "wrong-password" });
    assert.equal(wrongUnbind.status, 400);
    const unbound = await request(app).delete("/marathon/api/me/wechat").set(migratedAuth).send({ password: "password-8" });
    assert.equal(unbound.status, 200);
    const afterUnbind = await request(app).post("/marathon/api/auth/wechat").send({ code: "legacy-identity" });
    assert.equal(afterUnbind.status, 409);
    const relinked = await request(app).post("/marathon/api/me/wechat").set(migratedAuth).send({ code: "legacy-identity" });
    assert.equal(relinked.status, 200);
    const passwordRequired = await request(app).delete("/marathon/api/me/wechat").set("Authorization", "Bearer " + nextSession.body.token).send({ password: "password-8" });
    assert.equal(passwordRequired.status, 400);
    assert.match(passwordRequired.body.error, /设置.*密码/);
  } finally {
    app.locals.wechatCodeExchange = priorExchange;
    if (priorAppId == null) delete process.env.WECHAT_MINIPROGRAM_APP_ID;
    else process.env.WECHAT_MINIPROGRAM_APP_ID = priorAppId;
    if (priorSecret == null) delete process.env.WECHAT_MINIPROGRAM_APP_SECRET;
    else process.env.WECHAT_MINIPROGRAM_APP_SECRET = priorSecret;
  }
});

test("a nickname cannot claim a legacy account and password login stays available", async () => {
  process.env.ADMIN_TOKEN = "test-admin";
  const admin = { Authorization: "Bearer test-admin" };
  const legacy = await request(app).post("/marathon/api/session").send({ nickname: "找回甲" });
  assert.equal(legacy.status, 200);
  const oldAuth = { Authorization: "Bearer " + legacy.body.token };
  await request(app).put("/marathon/api/me/races/bishan").set(oldAuth).send({ status: "想跑" });

  const claimed = await request(app).post("/marathon/api/auth/register").send({ nickname: "找回甲", password: "password-8" });
  assert.equal(claimed.status, 400);
  assert.match(claimed.body.error, /昵称已被使用/);
  const oldAccount = await request(app).get("/marathon/api/me").set(oldAuth);
  assert.equal(oldAccount.status, 200);
  assert.equal(oldAccount.body.user.hasPassword, false);
  assert.equal(oldAccount.body.plans.length, 1);

  const again = await request(app).post("/marathon/api/auth/register").send({ nickname: "找回甲", password: "other-pass-8" });
  assert.equal(again.status, 400);
  assert.match(again.body.error, /昵称已被使用/);

  const short = await request(app).post("/marathon/api/auth/register").send({ nickname: "短密码", password: "short" });
  assert.equal(short.status, 400);

  const created = await request(app).post("/marathon/api/auth/register").send({ nickname: "新注册", password: "password-8" });
  assert.equal(created.status, 200);
  assert.notEqual(created.body.user.id, legacy.body.user.id);
  await request(app).put("/marathon/api/me/races/bishan").set("Authorization", "Bearer " + created.body.token).send({ status: "想跑" });

  const stale = await captchaCode();
  const wrong = await request(app).post("/marathon/api/auth/login").send({
    nickname: "新注册",
    password: "password-8",
    captchaToken: stale.token,
    captcha: "ZZZZ"
  });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error, "验证码错误或已过期");

  const badPass = await captchaCode();
  const missed = await request(app).post("/marathon/api/auth/login").send({
    nickname: "新注册",
    password: "nope-nope",
    captchaToken: badPass.token,
    captcha: badPass.code.toLowerCase()
  });
  assert.equal(missed.status, 400);
  assert.equal(missed.body.error, "昵称或密码错误");

  const good = await captchaCode();
  const back = await request(app).post("/marathon/api/auth/login").send({
    nickname: "新注册",
    password: "password-8",
    captchaToken: good.token,
    captcha: good.code
  });
  assert.equal(back.status, 200);
  assert.equal(back.body.user.id, created.body.user.id);
  const still = await request(app).get("/marathon/api/me").set("Authorization", "Bearer " + back.body.token);
  assert.equal(still.body.plans[0].status, "想跑");

  const bare = await request(app).post("/marathon/api/auth/login").send({ nickname: "新注册", password: "password-8" });
  assert.equal(bare.status, 400);

  await session("重名乙");
  await session("重名乙");
  const clash = await request(app).post("/marathon/api/auth/register").send({ nickname: "重名乙", password: "password-8" });
  assert.equal(clash.status, 400);
  assert.equal(clash.body.error, "这个昵称有冲突，换一个");
  const open = await captchaCode();
  const unset = await request(app).post("/marathon/api/auth/login").send({
    nickname: "重名乙",
    password: "password-8",
    captchaToken: open.token,
    captcha: open.code
  });
  assert.equal(unset.status, 400);
  assert.equal(unset.body.error, "这个昵称有冲突，换一个");

  const listed = await request(app).get("/marathon/api/admin/users?q=" + encodeURIComponent("重名乙")).set(admin);
  assert.equal(listed.body.users.length, 2);
  assert.equal(listed.body.users.every((item) => item.hasPassword === false), true);
  const target = listed.body.users[0].id;
  const set = await request(app).put("/marathon/api/admin/users/" + target + "/password").set(admin).send({ password: "password-8" });
  assert.equal(set.status, 200);
  const detail = await request(app).get("/marathon/api/admin/users/" + target).set(admin);
  assert.equal(detail.body.user.hasPassword, true);
  assert.equal(detail.body.user.password_hash, undefined);
  const picked = await captchaCode();
  const chosen = await request(app).post("/marathon/api/auth/login").send({
    nickname: "重名乙",
    password: "password-8",
    captchaToken: picked.token,
    captcha: picked.code
  });
  assert.equal(chosen.status, 200);
  assert.equal(chosen.body.user.id, target);

  const same = await request(app).put("/marathon/api/admin/users/" + listed.body.users[1].id + "/password").set(admin).send({ password: "password-8" });
  assert.equal(same.status, 200);
  const both = await captchaCode();
  const ambiguous = await request(app).post("/marathon/api/auth/login").send({
    nickname: "重名乙",
    password: "password-8",
    captchaToken: both.token,
    captcha: both.code
  });
  assert.equal(ambiguous.status, 400);
  assert.equal(ambiguous.body.error, "这个昵称有冲突");

  const changed = await request(app)
    .put("/marathon/api/me/password")
    .set("Authorization", "Bearer " + chosen.body.token)
    .send({ current: "password-8", password: "changed-pass-8" });
  assert.equal(changed.status, 200);
  const old = await captchaCode();
  const rejected = await request(app).post("/marathon/api/auth/login").send({
    nickname: "重名乙",
    password: "password-8",
    captchaToken: old.token,
    captcha: old.code
  });
  assert.equal(rejected.body.user ? rejected.body.user.id : 0, listed.body.users[1].id);
  const next = await captchaCode();
  const updated = await request(app).post("/marathon/api/auth/login").send({
    nickname: "重名乙",
    password: "changed-pass-8",
    captchaToken: next.token,
    captcha: next.code
  });
  assert.equal(updated.body.user.id, target);
});

test("an admin can add a user who then logs in with that nickname", async () => {
  process.env.ADMIN_TOKEN = "test-admin";
  const admin = { Authorization: "Bearer test-admin" };
  const denied = await request(app).post("/marathon/api/admin/users").send({ nickname: "后台新建", password: "password-8" });
  assert.equal(denied.status, 401);
  const blank = await request(app).post("/marathon/api/admin/users").set(admin).send({ nickname: "  ", password: "password-8" });
  assert.equal(blank.status, 400);
  assert.equal(blank.body.error, "昵称须为 1 到 20 个字");
  const short = await request(app).post("/marathon/api/admin/users").set(admin).send({ nickname: "后台新建", password: "short" });
  assert.equal(short.status, 400);
  assert.equal(short.body.error, "密码须为 8 到 128 位");
  await session("旧昵称未设密");
  const taken = await request(app).post("/marathon/api/admin/users").set(admin).send({ nickname: "旧昵称未设密", password: "password-8" });
  assert.equal(taken.status, 400);
  assert.equal(taken.body.error, "该昵称已存在，请在列表中编辑该账号");
  const created = await request(app).post("/marathon/api/admin/users").set(admin).send({ nickname: "后台新建", password: "password-8" });
  assert.equal(created.status, 201);
  assert.equal(created.body.nickname, "后台新建");
  const dup = await request(app).post("/marathon/api/admin/users").set(admin).send({ nickname: "后台新建", password: "other-pass" });
  assert.equal(dup.status, 400);
  assert.equal(dup.body.error, "该昵称已存在，请在列表中编辑该账号");
  const cap = await captchaCode();
  const logged = await request(app).post("/marathon/api/auth/login").send({
    nickname: "后台新建",
    password: "password-8",
    captchaToken: cap.token,
    captcha: cap.code
  });
  assert.equal(logged.status, 200);
  assert.equal(logged.body.user.id, created.body.id);
  const detail = await request(app).get("/marathon/api/admin/users/" + created.body.id).set(admin);
  assert.equal(detail.body.user.hasPassword, true);
  assert.equal(detail.body.user.leader, false);
});

test("an admin can delete a duplicate nickname but not a club owner", async () => {
  process.env.ADMIN_TOKEN = "test-admin";
  const admin = { Authorization: "Bearer test-admin" };
  const first = await session("删重名");
  const second = await session("删重名");
  const blocked = await request(app).post("/marathon/api/auth/register").send({ nickname: "删重名", password: "password-8" });
  assert.equal(blocked.status, 400);
  assert.equal(blocked.body.error, "这个昵称有冲突，换一个");

  const listed = await request(app).get("/marathon/api/admin/users?q=" + encodeURIComponent("删重名")).set(admin);
  const ids = listed.body.users.map((item) => item.id);
  assert.equal(ids.length, 2);
  const me = await request(app).get("/marathon/api/me").set("Authorization", "Bearer " + second);
  const drop = await request(app).delete("/marathon/api/admin/users/" + me.body.user.id).set(admin);
  assert.equal(drop.status, 200);
  assert.equal((await request(app).get("/marathon/api/me").set("Authorization", "Bearer " + second)).status, 401);

  const kept = await request(app).get("/marathon/api/me").set("Authorization", "Bearer " + first);
  assert.equal(kept.status, 200);
  const claimed = await request(app).post("/marathon/api/auth/register").send({ nickname: "删重名", password: "password-8" });
  assert.equal(claimed.status, 400);
  assert.match(claimed.body.error, /昵称已被使用/);
  assert.equal((await request(app).get("/marathon/api/me").set("Authorization", "Bearer " + first)).status, 200);

  const owner = await session("删不掉的团长");
  const club = await createClub(owner, "不能删的团");
  const ownerMe = await request(app).get("/marathon/api/me").set("Authorization", "Bearer " + owner);
  const refused = await request(app).delete("/marathon/api/admin/users/" + ownerMe.body.user.id).set(admin);
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /团长/);
  const still = await request(app).get("/marathon/api/admin/users/" + ownerMe.body.user.id).set(admin);
  assert.equal(still.status, 200);
  assert.equal(still.body.clubs[0].name, club.body.club.name);
});

test("an admin can list clubs, assign the leader, and manage members", async () => {
  process.env.ADMIN_TOKEN = "test-admin";
  const admin = { Authorization: "Bearer test-admin" };
  const owner = await session("后台团长甲");
  const created = await createClub(owner, "后台管理团");
  const clubId = created.body.club.id;
  const denied = await request(app).get("/marathon/api/admin/clubs");
  assert.equal(denied.status, 401);
  const listed = await request(app).get("/marathon/api/admin/clubs?q=" + encodeURIComponent("后台管理团")).set(admin);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.clubs.length, 1);
  const byFragment = await request(app).get("/marathon/api/admin/clubs?q=" + encodeURIComponent("管理")).set(admin);
  assert.ok(byFragment.body.clubs.some((item) => item.name === "后台管理团"));
  const byOwner = await request(app).get("/marathon/api/admin/clubs?q=" + encodeURIComponent("团长甲")).set(admin);
  assert.ok(byOwner.body.clubs.some((item) => item.name === "后台管理团"));
  assert.equal(listed.body.clubs[0].owner, "后台团长甲");
  assert.equal(listed.body.clubs[0].members, 1);
  const detail = await request(app).get("/marathon/api/admin/clubs/" + clubId).set(admin);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.members[0].role, "owner");
  assert.equal(typeof detail.body.club.code, "string");
  assert.equal((await request(app).get("/marathon/api/admin/clubs/999999").set(admin)).status, 404);

  const missing = await request(app).post("/marathon/api/admin/clubs/" + clubId + "/members").set(admin).send({ nickname: "没有的人" });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, "没有这个用户");
  await session("后台重名丙");
  await session("后台重名丙");
  const clash = await request(app).post("/marathon/api/admin/clubs/" + clubId + "/members").set(admin).send({ nickname: "后台重名丙" });
  assert.equal(clash.status, 400);
  assert.equal(clash.body.error, "该昵称存在多个账号，请先处理后再添加");

  const mate = await session("后台团员甲");
  const mateMe = await request(app).get("/marathon/api/me").set("Authorization", "Bearer " + mate);
  const added = await request(app).post("/marathon/api/admin/clubs/" + clubId + "/members").set(admin).send({ nickname: "后台团员甲" });
  assert.equal(added.status, 201);
  assert.equal(added.body.userId, mateMe.body.user.id);
  const again = await request(app).post("/marathon/api/admin/clubs/" + clubId + "/members").set(admin).send({ nickname: "后台团员甲" });
  assert.equal(again.status, 400);
  assert.equal(again.body.error, "该用户已在此跑团中");

  const byMember = await request(app).get("/marathon/api/admin/clubs?q=" + encodeURIComponent("后台团员甲")).set(admin);
  assert.equal(byMember.body.clubs.some((item) => item.id === clubId), true);
  const promoted = await request(app)
    .put("/marathon/api/admin/clubs/" + clubId + "/members/" + mateMe.body.user.id)
    .set(admin)
    .send({ role: "manager" });
  assert.equal(promoted.status, 200);
  const keepOwner = await request(app)
    .put("/marathon/api/admin/clubs/" + clubId + "/members/" + detail.body.members[0].id)
    .set(admin)
    .send({ role: "member" });
  assert.equal(keepOwner.status, 400);
  assert.equal(keepOwner.body.error, "请先将团长移交给其他成员，再修改角色");
  const blocked = await request(app).delete("/marathon/api/admin/clubs/" + clubId + "/members/" + detail.body.members[0].id).set(admin);
  assert.equal(blocked.status, 400);
  assert.equal(blocked.body.error, "该用户仍为团长，请先完成团长移交后再移出");

  const handed = await request(app)
    .put("/marathon/api/admin/clubs/" + clubId + "/members/" + mateMe.body.user.id)
    .set(admin)
    .send({ role: "owner" });
  assert.equal(handed.status, 200);
  const after = await request(app).get("/marathon/api/admin/clubs/" + clubId).set(admin);
  assert.equal(after.body.club.owner, "后台团员甲");
  assert.equal(after.body.members.find((item) => item.nickname === "后台团员甲").role, "owner");
  assert.equal(after.body.members.find((item) => item.nickname === "后台团长甲").role, "manager");
  const qualified = await request(app).get("/marathon/api/admin/users/" + mateMe.body.user.id).set(admin);
  assert.equal(qualified.body.user.leader, true);

  const returned = await request(app)
    .put("/marathon/api/admin/clubs/" + clubId + "/members/" + detail.body.members[0].id)
    .set(admin)
    .send({ role: "owner" });
  assert.equal(returned.status, 200);
  const removed = await request(app).delete("/marathon/api/admin/clubs/" + clubId + "/members/" + mateMe.body.user.id).set(admin);
  assert.equal(removed.status, 200);
  const left = await request(app).get("/marathon/api/admin/clubs/" + clubId).set(admin);
  assert.equal(left.body.members.length, 1);
  assert.equal(left.body.club.owner, "后台团长甲");

  const activity = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities")
    .set("Authorization", "Bearer " + owner)
    .send({ title: "待删活动", place: "河边", startsAt: "2026-10-20T06:30", minKm: 1, minPeople: 1, points: 1 });
  assert.equal(activity.status, 200);
  const gift = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/gifts")
    .set("Authorization", "Bearer " + owner)
    .send({ name: "待删礼", cost: 1, stock: 1 });
  assert.equal(gift.status, 200);
  const deniedDelete = await request(app).delete("/marathon/api/admin/clubs/" + clubId);
  assert.equal(deniedDelete.status, 401);
  const deleted = await request(app).delete("/marathon/api/admin/clubs/" + clubId).set(admin);
  assert.equal(deleted.status, 200);
  assert.equal((await request(app).get("/marathon/api/admin/clubs/" + clubId).set(admin)).status, 404);
  assert.equal((await request(app).delete("/marathon/api/admin/clubs/" + clubId).set(admin)).status, 404);
  const ownerStill = await request(app).get("/marathon/api/admin/users/" + detail.body.members[0].id).set(admin);
  assert.equal(ownerStill.body.user.nickname, "后台团长甲");
  assert.equal(ownerStill.body.user.leader, true);
  assert.equal(ownerStill.body.clubs.length, 0);
  const mateStill = await request(app).get("/marathon/api/me").set("Authorization", "Bearer " + mate);
  assert.equal(mateStill.body.user.nickname, "后台团员甲");
});

function callRow(call, nickname, distance) {
  const group = (call.groups || []).find((item) => item.distance === distance);
  return group && group.rows.find((row) => row.nickname === nickname);
}

test("dues are recorded by the club and can block an activity signup", async () => {
  const leader = await session("会费团长");
  const mate = await session("会费成员");
  const manager = await session("会费管理");
  const created = await createClub(leader, "会费跑团");
  const clubId = created.body.club.id;
  const auth = { Authorization: "Bearer " + leader };
  const mateAuth = { Authorization: "Bearer " + mate };
  const managerAuth = { Authorization: "Bearer " + manager };
  await joinWithCode(mate, created.body.club.code);
  await joinWithCode(manager, created.body.club.code);
  const managerId = (await request(app).get("/marathon/api/me").set(managerAuth)).body.user.id;
  assert.equal((await request(app).put("/marathon/api/clubs/" + clubId + "/members/" + managerId).set(auth).send({ role: "manager" })).status, 200);

  const body = { name: "2026 年度会费", amount: 200, startsOn: "2026-01-01", endsOn: "2026-12-31", note: "收据找团长", blockSignup: true };
  assert.equal((await request(app).post("/marathon/api/clubs/" + clubId + "/fees").set(managerAuth).send(body)).status, 403);
  const opened = await request(app).post("/marathon/api/clubs/" + clubId + "/fees").set(auth).send(body);
  assert.equal(opened.status, 200);
  const periodId = opened.body.period.id;
  assert.equal(opened.body.period.hasQr, undefined);
  assert.equal(opened.body.period.canClaim, undefined);
  assert.match(opened.body.period.copyText, /未交：/);
  assert.equal((await request(app).post("/marathon/api/clubs/" + clubId + "/fees/" + periodId + "/claim").set(mateAuth)).status, 404);
  assert.equal((await request(app).get("/marathon/api/clubs/" + clubId + "/fees/" + periodId + "/qr").set(mateAuth)).status, 404);

  const activity = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities")
    .set(auth)
    .send({ title: "周日训练", place: "奥森", startsAt: "2026-11-01 07:00" });
  const aid = activity.body.activity.id;
  const blocked = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/signup").set(mateAuth).send({ groupId: 0 });
  assert.equal(blocked.status, 400);
  assert.match(blocked.body.error, /会费/);

  const mateId = (await request(app).get("/marathon/api/me").set(mateAuth)).body.user.id;
  assert.equal((await request(app).post("/marathon/api/clubs/" + clubId + "/fees/" + periodId + "/records").set(mateAuth).send({ userId: mateId, status: "paid" })).status, 403);
  const paid = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/fees/" + periodId + "/records")
    .set(managerAuth)
    .send({ userId: mateId, status: "paid" });
  assert.equal(paid.status, 200);
  assert.match(paid.body.period.copyText, /已交：会费成员/);
  assert.equal((await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/signup").set(mateAuth).send({ groupId: 0 })).status, 200);

  const outsider = await session("会费外人");
  assert.equal((await request(app).get("/marathon/api/clubs/" + clubId + "/fees").set("Authorization", "Bearer " + outsider)).status, 403);

  const next = await request(app).post("/marathon/api/clubs/" + clubId + "/fees").set(auth).send({ ...body, name: "2027 年度会费", blockSignup: false });
  assert.equal(next.status, 200);
  assert.equal(next.body.period.name, "2027 年度会费");
  const list = await request(app).get("/marathon/api/clubs/" + clubId + "/fees").set(auth);
  assert.equal(list.body.history.filter((item) => item.open).length, 1);
  assert.equal((await request(app).post("/marathon/api/clubs/" + clubId + "/fees/" + periodId + "/claim").set(mateAuth)).status, 404);
});

test("a result call shows PB and writes a catalog result", async () => {
  const leader = await session("成绩团长");
  const mate = await session("成绩成员");
  const created = await createClub(leader, "成绩跑团");
  const clubId = created.body.club.id;
  const auth = { Authorization: "Bearer " + leader };
  const mateAuth = { Authorization: "Bearer " + mate };
  await joinWithCode(mate, created.body.club.code);

  const custom = await request(app).post("/marathon/api/clubs/" + clubId + "/calls").set(auth).send({
    title: "公园10公里",
    raceDate: "2026-11-18",
    distances: ["10k"],
    note: "填净计时"
  });
  assert.equal(custom.status, 200);
  assert.equal(custom.body.call.deadline, "2026-11-25T22:00");
  assert.match(custom.body.call.shareText, /成绩跑团 · 公园10公里成绩/);
  assert.equal(custom.body.call.summary, "这次没有新的 PB");
  const customId = custom.body.call.id;
  const first = await request(app).post("/marathon/api/clubs/" + clubId + "/calls/" + customId + "/rows").set(mateAuth).send({ distance: "10k", time: "50:00" });
  assert.equal(first.status, 200);
  assert.equal(callRow(first.body.call, "成绩成员", "10k").tag, "首次");
  const career = await request(app).get("/marathon/api/me").set(mateAuth);
  assert.equal(career.body.results.some((item) => item.race.name === "公园10公里"), false);

  const again = await request(app).post("/marathon/api/clubs/" + clubId + "/calls").set(auth).send({
    title: "公园10公里第二场",
    raceDate: "2026-11-20",
    distances: ["10k"]
  });
  const faster = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/calls/" + again.body.call.id + "/rows")
    .set(mateAuth)
    .send({ distance: "10k", time: "45:00" });
  assert.equal(callRow(faster.body.call, "成绩成员", "10k").tag, "PB");
  assert.match(faster.body.call.summary, /这次 PB：成绩成员 10公里 45:00/);

  const linked = await request(app).post("/marathon/api/clubs/" + clubId + "/calls").set(auth).send({ raceId: "bishan", distances: ["half"] });
  assert.equal(linked.status, 200);
  assert.equal(linked.body.call.deadline, "2026-11-22T22:00");
  assert.equal(linked.body.call.title, "2026重庆璧山马拉松");
  const linkedId = linked.body.call.id;
  const half = await request(app).post("/marathon/api/clubs/" + clubId + "/calls/" + linkedId + "/rows").set(mateAuth).send({ distance: "half", time: "1:45:00" });
  assert.equal(callRow(half.body.call, "成绩成员", "half").tag, "首次");
  const mateIdForSheet = getDb().prepare("SELECT id FROM users WHERE token = ?").get(mate).id;
  const sheetRow = getDb().prepare("SELECT id FROM result_call_rows WHERE call_id = ? AND user_id = ? AND distance = 'half'").get(linkedId, mateIdForSheet);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const sheetUpload = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/calls/" + linkedId + "/rows/" + sheetRow.id + "/sheet")
    .set(mateAuth)
    .attach("file", jpeg, { filename: "result.jpg", contentType: "image/jpeg" });
  assert.equal(sheetUpload.status, 200);
  assert.equal((await request(app).get("/marathon/api/call-sheets/" + sheetRow.id).set(mateAuth)).status, 200);
  assert.equal((await request(app).get("/marathon/api/call-sheets/" + sheetRow.id).set(auth)).status, 200);
  const another = await session("截图同团成员");
  await joinWithCode(another, created.body.club.code);
  assert.equal((await request(app).get("/marathon/api/call-sheets/" + sheetRow.id).set("Authorization", "Bearer " + another)).status, 403);
  const outside = await session("截图团外成员");
  assert.equal((await request(app).get("/marathon/api/call-sheets/" + sheetRow.id).set("Authorization", "Bearer " + outside)).status, 403);
  const saved = await request(app).get("/marathon/api/me").set(mateAuth);
  const bishan = saved.body.results.find((item) => item.race.id === "bishan");
  assert.equal(bishan.distance, "half");
  assert.equal(bishan.clock, "1:45:00");

  const mateId = saved.body.user.id;
  const closed = await request(app).post("/marathon/api/clubs/" + clubId + "/calls").set(auth).send({
    title: "已截止的比赛",
    raceDate: "2020-01-01",
    distances: ["5k"],
    deadline: "2020-01-08 22:00"
  });
  const late = await request(app).post("/marathon/api/clubs/" + clubId + "/calls/" + closed.body.call.id + "/rows").set(mateAuth).send({ distance: "5k", time: "25:00" });
  assert.equal(late.status, 400);
  const filled = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/calls/" + closed.body.call.id + "/rows")
    .set(auth)
    .send({ userId: mateId, distance: "5k", time: "25:00" });
  assert.equal(filled.status, 200);
  assert.equal(callRow(filled.body.call, "成绩成员", "5k").staffFilled, true);

  const other = await request(app).post("/marathon/api/clubs/" + clubId + "/calls").set(auth).send({
    title: "绕湖",
    raceDate: "2026-11-19",
    otherKm: 12
  });
  assert.equal(other.status, 200);
  const lake = await request(app).post("/marathon/api/clubs/" + clubId + "/calls/" + other.body.call.id + "/rows").set(mateAuth).send({ distance: "other", time: "1:05:00" });
  assert.equal(callRow(lake.body.call, "成绩成员", "other").distanceLabel, "12公里");
  const still = await request(app).get("/marathon/api/me").set(mateAuth);
  assert.equal(still.body.results.filter((item) => item.race.id === "bishan").length, 1);

  const row = callRow(half.body.call, "成绩成员", "half");
  const removed = await request(app).delete("/marathon/api/clubs/" + clubId + "/calls/" + linkedId + "/rows/" + row.id).set(mateAuth);
  assert.equal(removed.status, 200);
  const after = await request(app).get("/marathon/api/me").set(mateAuth);
  assert.equal(after.body.results.some((item) => item.race.id === "bishan"), false);

  const outsider = await session("成绩外人");
  assert.equal((await request(app).get("/marathon/api/clubs/" + clubId + "/calls/" + customId).set("Authorization", "Bearer " + outsider)).status, 403);
});

function beijingDate(days) {
  return new Date(Date.now() + 8 * 3600 * 1000 + days * 86400000).toISOString().slice(0, 10);
}

test("a meetup scores the photo check-in and a same-day tie goes to the larger one", async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const owner = await session("约跑团长");
  const ownerAuth = { Authorization: "Bearer " + owner };
  const mates = [];
  for (const name of ["约跑甲", "约跑乙", "约跑丙"]) mates.push(await session(name));
  const created = await createClub(owner, "约跑跑团");
  const club = created.body.club;
  for (const token of mates) {
    const joined = await joinWithCode(token, club.code);
    assert.equal(joined.status, 200);
  }
  const yesterday = await request(app).post("/marathon/api/clubs/" + club.id + "/meetups").set(ownerAuth).send({ date: beijingDate(-1), place: "河边" });
  assert.equal(yesterday.status, 400);
  const made = await request(app).post("/marathon/api/clubs/" + club.id + "/meetups").set(ownerAuth).send({ date: beijingDate(0), place: "河边", note: "轻松" });
  assert.equal(made.status, 200);
  assert.match(made.body.meetup.shareText, /约跑跑团 · /);
  const joinedOnly = await request(app).post("/marathon/api/clubs/" + club.id + "/meetups/" + made.body.meetup.id + "/join").set(ownerAuth).send({});
  assert.equal(joinedOnly.status, 200);
  const still = await request(app).get("/marathon/api/clubs/" + club.id).set(ownerAuth);
  assert.equal(still.body.myPoints, 0);

  const firstId = made.body.meetup.id;
  for (const token of [owner, mates[0], mates[1]]) {
    const checked = await request(app).post("/marathon/api/clubs/" + club.id + "/meetups/" + firstId + "/check").set("Authorization", "Bearer " + token).send({});
    assert.equal(checked.status, 200);
  }
  getDb().prepare("UPDATE meetups SET run_on = ? WHERE id = ?").run(beijingDate(-1), firstId);
  const latePhoto = await request(app)
    .post("/marathon/api/clubs/" + club.id + "/meetups/" + firstId + "/photos")
    .set("Authorization", "Bearer " + mates[0])
    .attach("file", jpeg, { filename: "run.jpg", contentType: "image/jpeg" });
  assert.equal(latePhoto.status, 400);
  const missing = await request(app).get("/marathon/api/clubs/" + club.id + "/meetups/" + firstId).set(ownerAuth);
  assert.equal(missing.body.meetup.statusLabel, "缺合影");
  const photo = await request(app)
    .post("/marathon/api/clubs/" + club.id + "/meetups/" + firstId + "/photos")
    .set(ownerAuth)
    .attach("file", jpeg, { filename: "run.jpg", contentType: "image/jpeg" });
  assert.equal(photo.status, 200);
  assert.equal(photo.body.meetup.statusLabel, "已记分");
  assert.equal(photo.body.meetup.award, 1);
  const seen = await request(app).get("/marathon/api/clubs/" + club.id + "/meetups/" + firstId + "/photos/" + photo.body.meetup.photos[0].id).set("Authorization", "Bearer " + mates[0]);
  assert.equal(seen.status, 200);
  assert.equal(seen.headers["content-type"], "image/jpeg");

  const second = await request(app).post("/marathon/api/clubs/" + club.id + "/meetups").set(ownerAuth).send({ date: beijingDate(0), place: "公园" });
  assert.equal(second.status, 200);
  const secondId = second.body.meetup.id;
  for (const token of [owner, ...mates]) {
    const checked = await request(app).post("/marathon/api/clubs/" + club.id + "/meetups/" + secondId + "/check").set("Authorization", "Bearer " + token).send({});
    assert.equal(checked.status, 200);
  }
  getDb().prepare("UPDATE meetups SET run_on = ? WHERE id = ?").run(beijingDate(-1), secondId);
  const cover = await request(app)
    .post("/marathon/api/clubs/" + club.id + "/meetups/" + secondId + "/photos")
    .set(ownerAuth)
    .attach("file", jpeg, { filename: "park.jpg", contentType: "image/jpeg" });
  assert.equal(cover.status, 200);
  assert.equal(cover.body.meetup.statusLabel, "已记分");
  const held = await request(app).get("/marathon/api/clubs/" + club.id + "/meetups/" + firstId).set(ownerAuth);
  assert.equal(held.body.meetup.statusLabel, "当天已在另一场记过");
  const ownerId = (await request(app).get("/marathon/api/me").set(ownerAuth)).body.user.id;
  const zeroed = getDb().prepare("SELECT delta, reason FROM point_entries WHERE user_id = ? AND ref_key LIKE ?").get(ownerId, "meet:" + firstId + ":%");
  assert.equal(zeroed.reason, "当天已在另一场记过");
  assert.equal(zeroed.delta, 0);

  const voided = await request(app).post("/marathon/api/clubs/" + club.id + "/meetups/" + secondId + "/void").set(ownerAuth).send({});
  assert.equal(voided.status, 200);
  assert.equal(voided.body.meetup.statusLabel, "已作废");
  const restored = await request(app).get("/marathon/api/clubs/" + club.id + "/meetups/" + firstId).set(ownerAuth);
  assert.equal(restored.body.meetup.statusLabel, "已记分");
  const gift = await request(app).post("/marathon/api/clubs/" + club.id + "/gifts").set(ownerAuth).send({ name: "约跑袜", cost: 1, stock: 2 });
  const spent = await request(app).post("/marathon/api/clubs/" + club.id + "/gifts/" + gift.body.gift.id + "/redeem").set(ownerAuth);
  assert.equal(spent.status, 200);
  assert.equal(spent.body.myPoints, 0);
  const undone = await request(app).post("/marathon/api/clubs/" + club.id + "/meetups/" + firstId + "/void").set(ownerAuth).send({});
  assert.equal(undone.status, 200);
  const claw = getDb().prepare("SELECT SUM(delta) AS points FROM point_entries WHERE club_id = ? AND user_id = ? AND reason = '约跑作废'").get(club.id, ownerId);
  assert.ok(claw.points < 0);
  const broke = await request(app).post("/marathon/api/clubs/" + club.id + "/gifts/" + gift.body.gift.id + "/redeem").set(ownerAuth);
  assert.equal(broke.status, 400);
  const outsider = await session("约跑外人");
  assert.equal((await request(app).get("/marathon/api/clubs/" + club.id + "/meetups").set("Authorization", "Bearer " + outsider)).status, 403);
});

test("an internal race ranks inside the club and does not write the career", async () => {
  const owner = await session("队内团长");
  const ownerAuth = { Authorization: "Bearer " + owner };
  const first = await session("队内甲");
  const second = await session("队内乙");
  const firstAuth = { Authorization: "Bearer " + first };
  const secondAuth = { Authorization: "Bearer " + second };
  const created = await createClub(owner, "队内跑团");
  const club = created.body.club;
  for (const token of [first, second]) {
    assert.equal((await joinWithCode(token, club.code)).status, 200);
  }
  const denied = await request(app).post("/marathon/api/clubs/" + club.id + "/internals").set(firstAuth).send({ title: "队内10公里", startsAt: "2026-12-01 08:00", distance: "10k", groups: [{ name: "欢乐组", capacity: 0 }] });
  assert.equal(denied.status, 403);
  const late = await request(app).post("/marathon/api/clubs/" + club.id + "/internals").set(ownerAuth).send({
    title: "队内10公里",
    startsAt: "2099-12-01 08:00",
    deadline: "2099-12-01 09:00",
    distance: "10k",
    groups: [{ name: "男子组", capacity: 1 }, { name: "女子组", capacity: 0 }]
  });
  assert.equal(late.status, 400);
  const made = await request(app).post("/marathon/api/clubs/" + club.id + "/internals").set(ownerAuth).send({
    title: "队内10公里",
    startsAt: "2099-12-01 08:00",
    place: "河边",
    distance: "10k",
    finishPoints: 2,
    groups: [{ name: "男子组", capacity: 1 }, { name: "女子组", capacity: 0 }]
  });
  assert.equal(made.status, 200);
  assert.match(made.body.race.shareText, /队内跑团 · 队内10公里/);
  assert.match(made.body.race.shareText, /男子组 剩 1/);
  const raceId = made.body.race.id;
  const men = made.body.race.groups.find((group) => group.name === "男子组").id;
  const women = made.body.race.groups.find((group) => group.name === "女子组").id;
  await request(app).post("/marathon/api/clubs/" + club.id + "/fees").set(ownerAuth).send({
    name: "2026 年度会费",
    amount: 100,
    startsOn: "2026-01-01",
    endsOn: "2026-12-31",
    blockSignup: true
  });
  const blocked = await request(app).post("/marathon/api/clubs/" + club.id + "/internals/" + raceId + "/signup").set(firstAuth).send({ groupId: men });
  assert.equal(blocked.status, 400);
  assert.match(blocked.body.error, /会费/);
  const roster = await request(app).get("/marathon/api/clubs/" + club.id + "/fees").set(ownerAuth);
  const periodId = roster.body.current.id;
  for (const token of [first, second]) {
    const me = await request(app).get("/marathon/api/me").set("Authorization", "Bearer " + token);
    const marked = await request(app).post("/marathon/api/clubs/" + club.id + "/fees/" + periodId + "/records").set(ownerAuth).send({ userId: me.body.user.id, status: "paid" });
    assert.equal(marked.status, 200);
  }
  const signed = await request(app).post("/marathon/api/clubs/" + club.id + "/internals/" + raceId + "/signup").set(firstAuth).send({ groupId: men });
  assert.equal(signed.status, 200);
  const full = await request(app).post("/marathon/api/clubs/" + club.id + "/internals/" + raceId + "/signup").set(secondAuth).send({ groupId: men });
  assert.equal(full.status, 400);
  const raceForContention = await request(app).post("/marathon/api/clubs/" + club.id + "/internals").set(ownerAuth).send({
    title: "队内最后名额", startsAt: "2099-12-02 08:00", distance: "10k", groups: [{ name: "唯一组", capacity: 1 }]
  });
  const contentionGroup = raceForContention.body.race.groups[0].id;
  const contention = await Promise.all([firstAuth, secondAuth].map((headers) => request(app)
    .post("/marathon/api/clubs/" + club.id + "/internals/" + raceForContention.body.race.id + "/signup")
    .set(headers).send({ groupId: contentionGroup })));
  assert.equal(contention.filter((response) => response.status === 200).length, 1);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM internal_signups WHERE race_id = ? AND group_id = ?").get(raceForContention.body.race.id, contentionGroup).n, 1);
  const other = await request(app).post("/marathon/api/clubs/" + club.id + "/internals/" + raceId + "/signup").set(secondAuth).send({ groupId: women });
  assert.equal(other.status, 200);
  const early = await request(app).post("/marathon/api/clubs/" + club.id + "/internals/" + raceId + "/results").set(firstAuth).send({ time: "50:00" });
  assert.equal(early.status, 400);
  const before = await request(app).get("/marathon/api/me").set(firstAuth);
  getDb().prepare("UPDATE internal_races SET starts_at = ?, deadline = ? WHERE id = ?").run("2020-01-01T08:00", "2020-01-01T07:00", raceId);
  const finish = await request(app).post("/marathon/api/clubs/" + club.id + "/internals/" + raceId + "/results").set(firstAuth).send({ time: "50:00" });
  assert.equal(finish.status, 200);
  assert.equal(finish.body.race.groups.find((group) => group.name === "男子组").rows[0].clock, "50:00");
  assert.equal(finish.body.race.groups.find((group) => group.name === "男子组").rows[0].tag, "");
  const dnf = await request(app).post("/marathon/api/clubs/" + club.id + "/internals/" + raceId + "/results").set(secondAuth).send({ outcome: "dnf" });
  assert.equal(dnf.status, 200);
  const ended = await request(app).post("/marathon/api/clubs/" + club.id + "/internals/" + raceId + "/end").set(ownerAuth).send({});
  assert.equal(ended.status, 200);
  assert.equal(ended.body.race.statusLabel, "已结束");
  const mine = await request(app).get("/marathon/api/clubs/" + club.id).set(firstAuth);
  assert.equal(mine.body.myPoints, 2);
  const after = await request(app).get("/marathon/api/me").set(firstAuth);
  assert.equal(after.body.results.length, before.body.results.length);
  const again = await request(app).post("/marathon/api/clubs/" + club.id + "/internals").set(ownerAuth).send({
    title: "队内10公里第二场",
    startsAt: "2099-12-08 08:00",
    distance: "10k",
    groups: [{ name: "男子组", capacity: 0 }]
  });
  const nextId = again.body.race.id;
  const nextGroup = again.body.race.groups[0].id;
  assert.equal((await request(app).post("/marathon/api/clubs/" + club.id + "/internals/" + nextId + "/signup").set(firstAuth).send({ groupId: nextGroup })).status, 200);
  getDb().prepare("UPDATE internal_races SET starts_at = ?, deadline = ? WHERE id = ?").run("2020-06-01T08:00", "2020-06-01T07:00", nextId);
  const faster = await request(app).post("/marathon/api/clubs/" + club.id + "/internals/" + nextId + "/results").set(firstAuth).send({ time: "45:00" });
  assert.equal(faster.body.race.groups[0].rows[0].tag, "个人最好");
  const cancelled = await request(app).post("/marathon/api/clubs/" + club.id + "/internals/" + raceId + "/cancel").set(ownerAuth).send({});
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.race.statusLabel, "已取消");
  const back = await request(app).get("/marathon/api/clubs/" + club.id).set(firstAuth);
  assert.equal(back.body.myPoints, 0);
  const outsider = await session("队内外人");
  assert.equal((await request(app).get("/marathon/api/clubs/" + club.id + "/internals/" + raceId).set("Authorization", "Bearer " + outsider)).status, 403);
});

test("an activity keeps its own groups, and the album can hide a photo until it is approved", async () => {
  const leader = await session("报名团长");
  const mate = await session("报名甲");
  const second = await session("报名乙");
  const third = await session("报名丙");
  const auth = { Authorization: "Bearer " + leader };
  const mateAuth = { Authorization: "Bearer " + mate };
  const secondAuth = { Authorization: "Bearer " + second };
  const thirdAuth = { Authorization: "Bearer " + third };
  const created = await createClub(auth, "报名跑团");
  const clubId = created.body.club.id;
  await joinWithCode(mate, created.body.club.code);
  await joinWithCode(second, created.body.club.code);
  await joinWithCode(third, created.body.club.code);
  const mateId = (await request(app).get("/marathon/api/me").set(mateAuth)).body.user.id;
  assert.equal((await request(app).put("/marathon/api/clubs/" + clubId + "/members/" + mateId).set(auth).send({ role: "manager" })).status, 200);

  assert.equal(
    (await request(app).post("/marathon/api/clubs/" + clubId + "/activities").set(secondAuth).send({ title: "不行", startsAt: "2099-04-01 06:00" })).status,
    403
  );
  const earlyEnd = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities")
    .set(auth)
    .send({ title: "早结束", startsAt: "2099-04-02 07:00", endsAt: "2099-04-02 06:00" });
  assert.equal(earlyEnd.status, 400);
  const lateCancel = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities")
    .set(auth)
    .send({ title: "晚取消", startsAt: "2099-04-02 07:00", cancelUntil: "2099-04-02 08:00" });
  assert.equal(lateCancel.status, 400);
  const invalidDate = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities")
    .set(auth)
    .send({ title: "无效日期", startsAt: "2099-02-30T07:00" });
  assert.equal(invalidDate.status, 400);
  const beforeInvalidGroups = getDb().prepare("SELECT COUNT(*) AS n FROM activities WHERE club_id = ?").get(clubId).n;
  const duplicated = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities")
    .set(auth)
    .send({
      title: "间歇跑",
      startsAt: "2099-04-14 05:00",
      groups: [
        { name: "A1", kind: "pace", capacity: 1 },
        { name: "A1", kind: "pace", capacity: 2 }
      ]
    });
  assert.equal(duplicated.status, 400);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM activities WHERE club_id = ?").get(clubId).n, beforeInvalidGroups);

  const made = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities")
    .set(auth)
    .send({
      title: "间歇跑",
      place: "水科院大厦",
      gatherPlace: "木樨地地铁E口",
      gatherAt: "04:50",
      route: "1.5公里小环",
      issue: "第 41 期",
      plannedKm: 8,
      startsAt: "2099-04-14 05:00",
      endsAt: "2099-04-14 06:30",
      cancelUntil: "2099-04-14 04:40",
      signupUntil: "2099-04-14 04:35",
      trainingType: "interval",
      workout: "2 km 热身\n6 × 800 m @ 4:20/km\n慢跑放松",
      notice: "请自备饮水，按身体状态调整强度。",
      note: "间歇。请按自己的情况来。",
      minPeople: 2,
      points: 1,
      groups: [
        { name: "A1", kind: "pace", pace: "马拉松 3 小时内", capacity: 1 },
        { name: "志愿者", kind: "volunteer", capacity: 0 }
      ]
    });
  assert.equal(made.status, 200);
  assert.equal(made.body.activity.statusLabel, "报名中");
  assert.equal(made.body.activity.issue, "第 41 期");
  assert.equal(made.body.activity.plannedKm, 8);
  assert.equal(made.body.activity.action.label, "报名");
  assert.equal(made.body.activity.trainingType, "interval");
  assert.equal(made.body.activity.signupUntil, "2099-04-14T04:35");
  assert.match(made.body.activity.workout, /800 m/);
  assert.match(made.body.activity.notice, /饮水/);
  assert.equal(made.body.activity.men, 0);
  const aid = made.body.activity.id;
  const pace = made.body.activity.groups.find((group) => group.name === "A1").id;
  const volunteers = made.body.activity.groups.find((group) => group.name === "志愿者").id;

  const missed = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/signup").set(auth).send({});
  assert.equal(missed.status, 400);
  const signed = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/signup")
    .set(auth)
    .send({ groupId: pace, gender: "男", level: "进阶" });
  assert.equal(signed.status, 200);
  assert.equal(signed.body.activity.action.label, "取消报名");
  const repeat = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/signup")
    .set(auth)
    .send({ groupId: volunteers, gender: "男", level: "进阶" });
  assert.match(repeat.body.error, /要换组先取消/);
  const full = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/signup")
    .set(secondAuth)
    .send({ groupId: pace, gender: "女", level: "萌新" });
  assert.equal(full.status, 400);
  assert.equal(
    (await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/signup").set(secondAuth).send({ groupId: volunteers, gender: "女" })).status,
    200
  );
  assert.equal(
    (await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/signup").set(thirdAuth).send({ groupId: volunteers })).status,
    200
  );
  assert.equal(
    (await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/signup").set(mateAuth).send({ groupId: volunteers })).status,
    200
  );

  const startedAt = new Date(Date.now() + 8 * 3600 * 1000 - 60 * 1000).toISOString().slice(0, 16);
  const endsAt = new Date(Date.now() + 8 * 3600 * 1000 + 60 * 60 * 1000).toISOString().slice(0, 16);
  getDb().prepare("UPDATE activities SET starts_at = ?, ends_at = ? WHERE id = ?").run(startedAt, endsAt, aid);
  assert.equal((await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/pacer").set(secondAuth).send({})).status, 200);
  assert.equal((await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/pacer").set(thirdAuth).send({})).status, 200);
  const tooMany = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/pacer").set(mateAuth).send({});
  assert.equal(tooMany.status, 400);
  assert.match(tooMany.body.error, /2 名领跑/);
  const marked = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/pacer")
    .set(auth)
    .send({ userId: mateId, on: true });
  assert.equal(marked.status, 400);

  await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/check").set(auth).send({ km: 6 });
  await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/check").set(secondAuth).send({ km: 6 });
  const detail = await request(app).get("/marathon/api/clubs/" + clubId + "/activities/" + aid).set(auth);
  assert.equal(detail.body.activity.gatherPlace, "木樨地地铁E口");
  assert.equal(detail.body.club.name, "报名跑团");
  assert.equal(detail.body.activity.men, 1);
  assert.equal(detail.body.activity.women, 1);
  assert.equal(detail.body.groups.find((group) => group.name === "A1").signed, 1);
  assert.equal(detail.body.groups.find((group) => group.name === "志愿者").people.filter((person) => person.pacer).length, 2);
  assert.equal(detail.body.signups.find((row) => row.nickname === "报名乙").together, 1);
  assert.equal(detail.body.signups.find((row) => row.nickname === "报名丙").together, 0);
  assert.equal(detail.body.levels[1].id, "入门");
  assert.match(detail.body.activity.cancelHint, /前可取消/);
  assert.ok(detail.body.signups.every((row) => typeof row.avatar === "string" && !row.avatar.startsWith("data:")));

  const memberDetail = await request(app).get("/marathon/api/clubs/" + clubId + "/activities/" + aid).set(secondAuth);
  assert.ok(memberDetail.body.signups.find((row) => row.nickname === "报名甲").gender === undefined);
  assert.ok(memberDetail.body.signups.find((row) => row.nickname === "报名甲").level === undefined);
  assert.equal(memberDetail.body.signups.find((row) => row.nickname === "报名乙").gender, "女");
  assert.equal(memberDetail.body.activity.gendered, undefined);
  assert.equal(memberDetail.body.groups[0].men, undefined);
  const memberClub = await request(app).get("/marathon/api/clubs/" + clubId).set(secondAuth);
  assert.equal(memberClub.body.activities.find((item) => item.id === aid).men, undefined);
  assert.equal(memberClub.body.activities.find((item) => item.id === aid).gendered, undefined);
  const memberAlbum = await request(app).get("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/album").set(secondAuth);
  assert.equal(memberAlbum.body.activity.men, undefined);
  assert.equal(memberAlbum.body.activity.women, undefined);
  assert.equal(memberAlbum.body.activity.checkAvailable, true);

  const privacyActivity = await request(app).post("/marathon/api/clubs/" + clubId + "/activities").set(auth).send({
    title: "名单隐私检查", startsAt: "2099-04-16T07:00", groups: []
  });
  const privacyId = privacyActivity.body.activity.id;
  const privacySignupOne = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + privacyId + "/signup").set(thirdAuth).send({ gender: "男", level: "进阶" });
  assert.equal(privacySignupOne.status, 200);
  assert.equal(privacySignupOne.body.activity.men, undefined);
  const privacySignupTwo = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + privacyId + "/signup").set(secondAuth).send({ gender: "女", level: "萌新" });
  assert.equal(privacySignupTwo.status, 200);
  assert.equal(privacySignupTwo.body.activity.checkAvailable, false);
  assert.equal(privacySignupTwo.body.activity.women, undefined);
  assert.equal(privacySignupTwo.body.activity.mine.gender, "女");
  const privacyStartedAt = new Date(Date.now() + 8 * 3600 * 1000 - 60 * 1000).toISOString().slice(0, 16);
  const privacyEndsAt = new Date(Date.now() + 8 * 3600 * 1000 + 60 * 60 * 1000).toISOString().slice(0, 16);
  getDb().prepare("UPDATE activities SET starts_at = ?, ends_at = ? WHERE id = ?").run(privacyStartedAt, privacyEndsAt, privacyId);
  const privacyCheck = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + privacyId + "/check").set(thirdAuth).send({ km: 6 });
  assert.equal(privacyCheck.status, 200);
  assert.equal(privacyCheck.body.activity.gendered, undefined);
  const privacyCheckDelete = await request(app).delete("/marathon/api/clubs/" + clubId + "/activities/" + privacyId + "/check").set(secondAuth);
  assert.equal(privacyCheckDelete.status, 200);
  assert.equal(privacyCheckDelete.body.activity.men, undefined);
  getDb().prepare("UPDATE activities SET starts_at = '2099-04-16T07:00', ends_at = '' WHERE id = ?").run(privacyId);
  const privacySignupDelete = await request(app).delete("/marathon/api/clubs/" + clubId + "/activities/" + privacyId + "/signup").set(secondAuth);
  assert.equal(privacySignupDelete.status, 200);
  assert.equal(privacySignupDelete.body.activity.women, undefined);
  const staffClub = await request(app).get("/marathon/api/clubs/" + clubId).set(auth);
  assert.equal(staffClub.body.activities.find((item) => item.id === privacyId).men, 1);
  assert.equal(staffClub.body.activities.find((item) => item.id === privacyId).women, 0);

  const lastSlotActivity = await request(app).post("/marathon/api/clubs/" + clubId + "/activities").set(auth).send({
    title: "最后一个名额", startsAt: "2099-04-17T07:00", groups: [{ name: "唯一名额", capacity: 1 }]
  });
  const lastSlotGroup = lastSlotActivity.body.activity.groups[0].id;
  const slotResults = await Promise.all([auth, mateAuth, secondAuth, thirdAuth].map((headers) => request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities/" + lastSlotActivity.body.activity.id + "/signup")
    .set(headers)
    .send({ groupId: lastSlotGroup })));
  assert.equal(slotResults.filter((result) => result.status === 200).length, 1);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM activity_signups WHERE activity_id = ? AND group_id = ?").get(lastSlotActivity.body.activity.id, lastSlotGroup).n, 1);

  const moveCheckedIntoFuture = await request(app).put("/marathon/api/clubs/" + clubId + "/activities/" + aid).set(auth).send({
    startsAt: "2099-04-14 07:00", endsAt: "2099-04-14 08:00", signupUntil: "", cancelUntil: ""
  });
  assert.equal(moveCheckedIntoFuture.status, 400);
  assert.match(moveCheckedIntoFuture.body.error, /已有打卡记录/);

  // Return to the upcoming phase before testing edits that retain its original deadlines.
  getDb().prepare("UPDATE activities SET starts_at = '2099-04-14T05:00', ends_at = '2099-04-14T06:30' WHERE id = ?").run(aid);
  const editNewFields = await request(app).put("/marathon/api/clubs/" + clubId + "/activities/" + aid).set(auth).send({ note: "管理员补充说明" });
  assert.equal(editNewFields.status, 200);
  assert.equal(editNewFields.body.activity.trainingType, "interval");
  assert.equal(editNewFields.body.activity.signupUntil, "2099-04-14T04:35");
  assert.match(editNewFields.body.activity.workout, /800 m/);
  assert.match(editNewFields.body.activity.notice, /饮水/);
  assert.equal(editNewFields.body.activity.note, "管理员补充说明");
  const nowCutoff = new Date(Date.now() + 8 * 3600 * 1000 - 5 * 60 * 1000).toISOString().slice(0, 16);
  const closedSignup = await request(app).post("/marathon/api/clubs/" + clubId + "/activities").set(auth).send({
    title: "已截止的晨跑", startsAt: "2099-04-15T07:00", signupUntil: nowCutoff, groups: []
  });
  assert.equal(closedSignup.status, 200);
  assert.equal(closedSignup.body.activity.action.label, "报名已截止");
  assert.equal(closedSignup.body.activity.statusLabel, "报名已截止");
  const cutoffPost = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + closedSignup.body.activity.id + "/signup").set(secondAuth).send({});
  assert.equal(cutoffPost.status, 400);
  assert.match(cutoffPost.body.error, /报名已截止/);

  const shared = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/share").set(secondAuth).send({ ids: [aid] });
  assert.equal(shared.status, 200);
  assert.match(shared.body.text, /报名跑团/);
  assert.match(shared.body.text, /集合 木樨地地铁E口/);
  assert.match(shared.body.text, /A1 剩 0/);
  assert.match(shared.body.text, /志愿者 不限/);

  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  getDb().prepare("UPDATE activities SET starts_at = ?, cancel_until = '', signup_until = '' WHERE id = ?").run(today + "T05:00", aid);
  const board = await request(app).get("/marathon/api/clubs/" + clubId + "/attendance?range=today").set(auth);
  assert.equal(board.body.me.count, 1);
  assert.equal(board.body.rows.find((row) => row.nickname === "报名甲").count, 0);
  assert.equal(board.body.rows.find((row) => row.nickname === "报名丙").placeLabel, "未上榜");

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const photo = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/media")
    .set(thirdAuth)
    .attach("file", jpeg, { filename: "run.jpg", contentType: "image/jpeg" });
  assert.equal(photo.status, 200);
  const albums = await request(app).get("/marathon/api/clubs/" + clubId + "/albums").set(secondAuth);
  assert.equal(albums.body.albums[0].title, "间歇跑");
  assert.equal(albums.body.albums[0].coverId, photo.body.media.id);
  assert.equal(albums.body.albums[0].photoCount, 1);

  assert.equal((await request(app).put("/marathon/api/clubs/" + clubId + "/activities/" + aid).set(auth).send({ review: true })).status, 200);
  const waiting = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/media")
    .set(secondAuth)
    .attach("file", jpeg, { filename: "wait.jpg", contentType: "image/jpeg" });
  assert.equal(waiting.body.media.pending, true);
  const hidden = await request(app).get("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/album").set(thirdAuth);
  assert.equal(hidden.body.items.some((item) => item.id === waiting.body.media.id), false);
  const own = await request(app).get("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/album").set(secondAuth);
  assert.equal(own.body.items.some((item) => item.pending), true);
  const blockedCover = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/cover")
    .set(auth)
    .send({ mediaId: waiting.body.media.id });
  assert.equal(blockedCover.status, 400);
  assert.equal(
    (await request(app).get("/marathon/api/media/" + waiting.body.media.id).set(thirdAuth)).status,
    404
  );
  assert.equal(
    (await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/media/" + waiting.body.media.id + "/approve").set(mateAuth).send({})).status,
    200
  );
  const shown = await request(app).get("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/album").set(thirdAuth);
  assert.equal(shown.body.items.some((item) => item.id === waiting.body.media.id), true);
  const cover = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/cover")
    .set(mateAuth)
    .send({ mediaId: waiting.body.media.id });
  assert.equal(cover.body.coverId, waiting.body.media.id);
  assert.equal(
    (await request(app).delete("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/media/" + waiting.body.media.id).set(mateAuth)).status,
    200
  );

  const stopped = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/cancel").set(auth).send({});
  assert.equal(stopped.body.activity.statusLabel, "已取消");
  assert.equal(stopped.body.activity.checkAvailable, false);
  const checkCancelled = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/check").set(thirdAuth).send({ km: 6 });
  assert.equal(checkCancelled.status, 400);
  assert.match(checkCancelled.body.error, /已取消/);
  const latecomer = await session("报名后来");
  await joinWithCode(latecomer, created.body.club.code);
  const afterCancel = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/signup")
    .set("Authorization", "Bearer " + latecomer)
    .send({ groupId: volunteers });
  assert.match(afterCancel.body.error, /已经取消/);
  const still = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/media")
    .set(secondAuth)
    .attach("file", jpeg, { filename: "after.jpg", contentType: "image/jpeg" });
  assert.equal(still.status, 200);

  getDb().prepare("UPDATE activities SET cancel_until = ? WHERE id = ?").run("2020-01-01T00:00", aid);
  const late = await request(app).delete("/marathon/api/clubs/" + clubId + "/activities/" + aid + "/signup").set(thirdAuth);
  assert.equal(late.status, 400);
  assert.match(late.body.error, /取消时间/);

  const fresh = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities")
    .set(auth)
    .send({ title: "再来一场", startsAt: "2099-05-01 06:00", endsAt: "2099-05-01 07:00" });
  const ended = await request(app).post("/marathon/api/clubs/" + clubId + "/activities/" + fresh.body.activity.id + "/end").set(auth).send({});
  assert.equal(ended.body.activity.statusLabel, "已结束");
  const closed = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities/" + fresh.body.activity.id + "/signup")
    .set(secondAuth)
    .send({});
  assert.match(closed.body.error, /已经结束/);
  const insert = getDb().prepare("INSERT INTO activity_media (activity_id, user_id, kind, filename, status, created_at) VALUES (?, ?, 'photo', '', 'shown', ?)");
  for (let i = 0; i < 400; i += 1) insert.run(fresh.body.activity.id, mateId, new Date().toISOString());
  const overflow = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/activities/" + fresh.body.activity.id + "/media")
    .set(auth)
    .attach("file", jpeg, { filename: "full.jpg", contentType: "image/jpeg" });
  assert.equal(overflow.status, 400);
  assert.match(overflow.body.error, /还剩 0 张/);

  const outsider = await session("报名外人");
  assert.equal((await request(app).get("/marathon/api/clubs/" + clubId + "/albums").set("Authorization", "Bearer " + outsider)).status, 403);
});

test("handwritten mileage stays off the points ledger and follows each club's rules", async () => {
  const leader = await session("跑量团长");
  const mate = await session("跑量甲");
  const manager = await session("跑量管理");
  const stranger = await session("跑量外");
  const auth = { Authorization: "Bearer " + leader };
  const mateAuth = { Authorization: "Bearer " + mate };
  const managerAuth = { Authorization: "Bearer " + manager };
  const created = await createClub(leader, "跑量跑团");
  const clubId = created.body.club.id;
  const code = created.body.club.code;
  assert.equal((await joinWithCode(mate, code)).status, 200);
  assert.equal((await joinWithCode(manager, code)).status, 200);
  const mateId = (await request(app).get("/marathon/api/me").set(mateAuth)).body.user.id;
  const managerId = (await request(app).get("/marathon/api/me").set(managerAuth)).body.user.id;
  assert.equal(
    (await request(app).put("/marathon/api/clubs/" + clubId + "/members/" + managerId).set(auth).send({ role: "manager" })).status,
    200
  );
  const pointsBefore = getDb().prepare("SELECT COUNT(*) AS n FROM point_entries").get().n;
  const stamp = (minutes) => new Date(Date.now() + 8 * 3600 * 1000 + minutes * 60000).toISOString().slice(0, 16).replace("T", " ");
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.parse(today + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.parse(today + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);

  async function log(token, body) {
    return request(app)
      .post("/marathon/api/runs")
      .set("Authorization", "Bearer " + token)
      .send(body);
  }

  const counted = await log(leader, { type: "run", startedAt: stamp(2), distanceKm: 10, duration: "0:50:00", climb: 0, city: "北京" });
  assert.equal(counted.status, 200);
  assert.equal(counted.body.run.paceLabel, "5:00");
  assert.equal(counted.body.run.clubs[0].counted, true);
  assert.equal(counted.body.note, "");
  const short = await log(leader, { type: "run", startedAt: stamp(70), distanceKm: 0.5, duration: "0:05:00", climb: 0 });
  assert.equal(short.status, 200);
  assert.equal(short.body.run.clubs[0].counted, false);
  const fast = await log(leader, { type: "run", startedAt: stamp(90), distanceKm: 10, duration: "0:20:00", climb: 0 });
  assert.equal(fast.body.run.clubs[0].counted, false);
  const overlap = await log(leader, { type: "run", startedAt: stamp(10), distanceKm: 5, duration: "0:20:00", climb: 0 });
  assert.equal(overlap.status, 200);
  assert.match(overlap.body.note, /时间叠上了/);
  assert.equal(overlap.body.run.clubs[0].counted, false);
  const early = await log(leader, { type: "run", startedAt: yesterday + " 08:00", distanceKm: 8, duration: "0:40:00", climb: 0 });
  assert.equal(early.body.run.clubs[0].counted, false);
  const oldTrail = await log(leader, { type: "trail", startedAt: stamp(120), distanceKm: 8, duration: "1:00:00", climb: 200 });
  assert.equal(oldTrail.body.run.clubs[0].counted, false);

  const board = await request(app).get("/marathon/api/clubs/" + clubId + "/mileage?range=all").set(auth);
  assert.equal(board.status, 200);
  assert.equal(board.body.totalKm, 10);
  assert.equal(board.body.owner, true);
  const rules = { ...board.body.rules, trailOn: true, trailClimbAdd: true };
  const opened = await request(app).put("/marathon/api/clubs/" + clubId + "/mileage/rules").set(auth).send(rules);
  assert.equal(opened.status, 200);
  assert.match(opened.body.rules.note, /不重算/);
  const still = await request(app).get("/marathon/api/runs?month=" + today.slice(0, 7)).set(auth);
  const kept = still.body.runs.find((item) => item.id === oldTrail.body.run.id);
  assert.equal(kept.clubs[0].counted, false);
  const trail = await log(leader, { type: "trail", startedAt: stamp(200), distanceKm: 10, duration: "1:20:00", climb: 150 });
  assert.equal(trail.body.run.clubs[0].counted, true);
  assert.equal(trail.body.run.volumeKm, 10);
  const afterTrail = await request(app).get("/marathon/api/clubs/" + clubId + "/mileage?range=all").set(auth);
  const trailRow = afterTrail.body.feed.find((item) => item.id === trail.body.run.id);
  assert.equal(trailRow.volumeKm, 11.5);
  assert.equal(afterTrail.body.totalKm, 21.5);
  assert.equal(afterTrail.body.totalCount, 2);
  const otherSport = await log(leader, { type: "swim", startedAt: stamp(300), distanceKm: 1, duration: "0:30:00", climb: 0 });
  assert.equal(otherSport.status, 400);
  assert.match(otherSport.body.error, /跑步或越野/);

  const manualOff = { ...opened.body.rules, manualOk: false };
  assert.equal((await request(app).put("/marathon/api/clubs/" + clubId + "/mileage/rules").set(auth).send(manualOff)).status, 200);
  const blocked = await log(leader, { type: "run", startedAt: stamp(360), distanceKm: 6, duration: "0:36:00", climb: 0 });
  assert.equal(blocked.body.run.clubs[0].counted, false);
  const stillCounted = await request(app).get("/marathon/api/clubs/" + clubId + "/mileage?range=all").set(auth);
  assert.equal(stillCounted.body.totalKm, 21.5);
  assert.equal((await request(app).put("/marathon/api/clubs/" + clubId + "/mileage/rules").set(managerAuth).send(opened.body.rules)).status, 403);
  assert.equal((await request(app).put("/marathon/api/clubs/" + clubId + "/mileage/rules").set(auth).send(opened.body.rules)).status, 200);

  const challenged = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/mileage/runs/" + counted.body.run.id + "/challenge")
    .set(mateAuth)
    .send({ reason: "配速看着不像" });
  assert.equal(challenged.status, 200);
  const dropped = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/mileage/runs/" + counted.body.run.id + "/decision")
    .set(managerAuth)
    .send({ counted: false });
  assert.equal(dropped.status, 200);
  const afterDrop = await request(app).get("/marathon/api/clubs/" + clubId + "/mileage?range=all").set(auth);
  assert.equal(afterDrop.body.totalKm, 11.5);
  assert.equal(afterDrop.body.feed.some((item) => item.id === counted.body.run.id), false);
  const personal = await request(app).get("/marathon/api/runs?month=" + today.slice(0, 7)).set(auth);
  assert.ok(personal.body.runs.some((item) => item.id === counted.body.run.id));

  const low = await request(app).put("/marathon/api/runs-flag").set(auth).send({ month: today.slice(0, 7), targetKm: 5, gender: "" });
  assert.equal(low.status, 400);
  assert.match(low.body.error, /不能低于 10/);
  assert.equal((await request(app).put("/marathon/api/runs-flag").set(auth).send({ month: today.slice(0, 7), targetKm: 12, gender: "" })).status, 200);
  const gendered = { ...opened.body.rules, flagFemale: 20, flagMale: 8 };
  assert.equal((await request(app).put("/marathon/api/clubs/" + clubId + "/mileage/rules").set(auth).send(gendered)).status, 200);
  const blank = await request(app).put("/marathon/api/runs-flag").set(auth).send({ month: today.slice(0, 7), targetKm: 12, gender: "" });
  assert.equal(blank.status, 400);
  assert.match(blank.body.error, /不能低于 20/);
  assert.equal((await request(app).put("/marathon/api/runs-flag").set(auth).send({ month: today.slice(0, 7), targetKm: 12, gender: "男" })).status, 200);

  const mateRun = await log(mate, { type: "run", startedAt: stamp(420), distanceKm: 5, duration: "0:30:00", climb: 0 });
  assert.equal(mateRun.body.run.clubs[0].counted, true);
  const report = await request(app).get("/marathon/api/clubs/" + clubId + "/mileage/report?kind=month&at=" + today.slice(0, 7)).set(auth);
  const mateRow = report.body.rows.find((row) => row.nickname === "跑量甲");
  assert.equal(mateRow.flag, "观摩");
  assert.equal(mateRow.km, 5);
  assert.equal(mateRow.paceLabel, "6:00");
  assert.equal(report.body.total.flag, "-");

  const other = await createClub(mate, "高标跑团");
  const highRules = (await request(app).get("/marathon/api/clubs/" + other.body.club.id + "/mileage?range=all").set(mateAuth)).body.rules;
  highRules.flagMale = 30;
  assert.equal((await request(app).put("/marathon/api/clubs/" + other.body.club.id + "/mileage/rules").set(mateAuth).send(highRules)).status, 200);
  assert.equal((await joinWithCode(leader, other.body.club.code)).status, 200);
  const raised = await request(app).put("/marathon/api/runs-flag").set(auth).send({ month: today.slice(0, 7), targetKm: 12, gender: "男" });
  assert.equal(raised.status, 400);
  assert.match(raised.body.error, /不能低于 30/);

  const group = await request(app).post("/marathon/api/clubs/" + clubId + "/mileage/groups").set(auth).send({ name: "A组", capacity: 1, sort: 1 });
  assert.equal(group.status, 200);
  assert.equal(
    (await request(app).put("/marathon/api/clubs/" + clubId + "/mileage/members/" + mateId).set(auth).send({ groupId: group.body.group.id })).status,
    200
  );
  assert.equal(
    (await request(app).put("/marathon/api/clubs/" + clubId + "/mileage/members/" + managerId).set(auth).send({ groupId: group.body.group.id })).status,
    400
  );
  const grouped = await request(app).get("/marathon/api/clubs/" + clubId + "/mileage?range=all&q=" + encodeURIComponent("跑量甲")).set(auth);
  assert.equal(grouped.body.rank.length, 1);
  assert.equal(grouped.body.rank[0].group, "A组");
  assert.equal(grouped.body.groups.find((item) => item.name === "A组").km, 5);

  const exported = await request(app).get("/marathon/api/clubs/" + clubId + "/mileage/export?kind=month&at=" + today.slice(0, 7)).set(auth);
  assert.equal(exported.status, 200);
  assert.match(exported.text, /跑量甲/);
  assert.match(exported.text, /观摩/);
  assert.equal((await request(app).get("/marathon/api/clubs/" + clubId + "/mileage/export?kind=month").set(managerAuth)).status, 403);
  assert.equal((await request(app).get("/marathon/api/clubs/" + clubId + "/mileage").set("Authorization", "Bearer " + stranger)).status, 403);

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const shot = await request(app)
    .post("/marathon/api/runs/" + trail.body.run.id + "/shot")
    .set(auth)
    .attach("file", jpeg, { filename: "shot.jpg", contentType: "image/jpeg" });
  assert.equal(shot.status, 200);
  const seen = await request(app).get("/marathon/api/runs/" + trail.body.run.id + "/shot").set(mateAuth);
  assert.equal(seen.status, 200);
  assert.equal((await request(app).get("/marathon/api/runs/" + trail.body.run.id + "/shot").set("Authorization", "Bearer " + stranger)).status, 404);

  const removed = await request(app).delete("/marathon/api/runs/" + trail.body.run.id).set(auth);
  assert.equal(removed.status, 200);
  const left = await request(app).get("/marathon/api/clubs/" + clubId + "/mileage?range=all").set(auth);
  assert.equal(left.body.totalKm, 5);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM point_entries").get().n, pointsBefore);
  assert.equal(personal.body.watches, "尚未接入");
});

test("club grade, supplies, offline splits and the monthly league stay off the points ledger", async () => {
  const pointsBefore = getDb().prepare("SELECT COUNT(*) AS n FROM point_entries").get().n;
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  function dayShift(count) {
    const [year, part, date] = today.split("-").map(Number);
    return new Date(Date.UTC(year, part - 1, date + count)).toISOString().slice(0, 10);
  }
  function monthShift(count) {
    const [year, part] = month.split("-").map(Number);
    return new Date(Date.UTC(year, part - 1 + count, 1)).toISOString().slice(0, 7);
  }
  function auth(token) {
    return { Authorization: "Bearer " + token };
  }
  function fillMembers(clubId, count, mark) {
    const db = getDb();
    const now = new Date().toISOString();
    const addUser = db.prepare("INSERT INTO users (nickname, token, created_at) VALUES (?, ?, ?)");
    const addMember = db.prepare("INSERT INTO club_members (club_id, user_id, joined_at, role) VALUES (?, ?, ?, 'member')");
    db.transaction(() => {
      for (let i = 0; i < count; i += 1) {
        const info = addUser.run(mark + i, mark + "-" + i + "-" + now, now);
        addMember.run(clubId, Number(info.lastInsertRowid), now);
      }
    })();
  }
  function check(clubId, userId, day) {
    getDb().prepare("INSERT INTO checkins (club_id, user_id, day, note, created_at) VALUES (?, ?, ?, '', ?)").run(clubId, userId, day, new Date().toISOString());
  }
  async function userIdOf(token) {
    const me = await request(app).get("/marathon/api/me").set(auth(token));
    assert.equal(me.status, 200);
    return me.body.user.id;
  }

  const leader = await session("合作团长");
  const mate = await session("合作甲");
  const manager = await session("合作管理");
  const outsider = await session("合作外");
  const created = await createClub(leader, "合作跑团");
  const clubId = created.body.club.id;
  const code = created.body.club.code;
  const admin = { Authorization: "Bearer " + process.env.ADMIN_TOKEN };
  for (const token of [mate, manager]) {
    const joined = await joinWithCode(token, code);
    assert.equal(joined.status, 200);
  }
  const managerId = await userIdOf(manager);
  const leaderId = await userIdOf(leader);
  const setRole = await request(app).put("/marathon/api/clubs/" + clubId + "/members/" + managerId).set(auth(leader)).send({ role: "manager" });
  assert.equal(setRole.status, 200);

  const madeDesk = await request(app).post("/marathon/api/admin/accounts").set(admin).send({ username: "partnerdesk", password: "partner-pass-8", role: "club" });
  assert.equal(madeDesk.status, 200);
  const deskLogin = await request(app).post("/marathon/api/admin/login").send({ username: "partnerdesk", password: "partner-pass-8" });
  assert.equal(deskLogin.status, 200);
  const deskDenied = await request(app)
    .post("/marathon/api/admin/supplies")
    .set(auth(deskLogin.body.token))
    .send({ brand: "补给牌", name: "能量胶", total: 5, quota: 1, month, needChecks: 0, needKm: 0, note: "" });
  assert.equal(deskDenied.status, 403);

  const past = await request(app)
    .post("/marathon/api/admin/supplies")
    .set(admin)
    .send({ brand: "补给牌", name: "能量胶", total: 5, quota: 1, month: "2020-01", needChecks: 0, needKm: 0, note: "" });
  assert.equal(past.status, 400);
  assert.match(past.body.error, /不能补开已经过去的月份/);

  const supply = await request(app)
    .post("/marathon/api/admin/supplies")
    .set(admin)
    .send({ brand: "补给牌", name: "能量胶", total: 5, quota: 1, month, needChecks: 0, needKm: 0, note: "到团可领" });
  assert.equal(supply.status, 200);
  const supplyId = supply.body.id;

  const opened = await request(app).get("/marathon/api/clubs/" + clubId + "/partner").set(auth(leader));
  assert.equal(opened.status, 200);
  assert.equal(opened.body.grade.id, "open");
  assert.equal(opened.body.grade.members, 3);
  assert.match(opened.body.grade.note, /不收身份证/);
  assert.equal(opened.body.supplies[0].reason, "认证后可以领");
  const early = await request(app).post("/marathon/api/clubs/" + clubId + "/supplies/" + supplyId + "/claim").set(auth(leader));
  assert.equal(early.status, 400);
  assert.match(early.body.error, /认证后可以领/);

  fillMembers(clubId, 7, "pa" + clubId + "a");
  const base = await request(app).get("/marathon/api/clubs/" + clubId + "/partner").set(auth(leader));
  assert.equal(base.body.grade.id, "base");
  assert.equal(base.body.grade.members, 10);

  fillMembers(clubId, 20, "pa" + clubId + "b");
  const almost = await request(app).get("/marathon/api/clubs/" + clubId + "/partner").set(auth(leader));
  assert.equal(almost.body.grade.id, "base");
  assert.equal(almost.body.grade.members, 30);
  assert.equal(almost.body.grade.lines[1].met, false);

  for (let i = 0; i < 4; i += 1) check(clubId, leaderId, dayShift(-i));
  const certified = await request(app).get("/marathon/api/clubs/" + clubId + "/partner").set(auth(leader));
  assert.equal(certified.body.grade.id, "certified");
  assert.ok(certified.body.grade.recentDays >= 4);

  const claimed = await request(app).post("/marathon/api/clubs/" + clubId + "/supplies/" + supplyId + "/claim").set(auth(leader));
  assert.equal(claimed.status, 200);
  const again = await request(app).post("/marathon/api/clubs/" + clubId + "/supplies/" + supplyId + "/claim").set(auth(leader));
  assert.equal(again.status, 400);
  assert.match(again.body.error, /你已经领过/);
  const mateFull = await request(app).post("/marathon/api/clubs/" + clubId + "/supplies/" + supplyId + "/claim").set(auth(mate));
  assert.equal(mateFull.status, 400);
  assert.match(mateFull.body.error, /这个团的额度满了/);

  const coreLeader = await session("核心团长");
  const coreMate = await session("核心乙");
  const coreThird = await session("核心丙");
  const coreClub = await createClub(coreLeader, "核心跑团");
  const coreId = coreClub.body.club.id;
  for (const token of [coreMate, coreThird]) {
    const joined = await joinWithCode(token, coreClub.body.club.code);
    assert.equal(joined.status, 200);
  }
  fillMembers(coreId, 97, "pb" + coreId + "c");
  const coreLeaderId = await userIdOf(coreLeader);
  const coreMateId = await userIdOf(coreMate);
  const now = new Date().toISOString();
  check(coreId, coreLeaderId, today);
  check(coreId, coreLeaderId, monthShift(-1) + "-15");
  check(coreId, coreLeaderId, monthShift(-2) + "-15");
  getDb().prepare("INSERT INTO plans (user_id, race_id, status, updated_at) VALUES (?, 'bishan', '想跑', ?)").run(coreLeaderId, now);
  getDb().prepare("INSERT INTO plans (user_id, race_id, status, updated_at) VALUES (?, 'bishan', '想跑', ?)").run(coreMateId, now);
  const coreView = await request(app).get("/marathon/api/clubs/" + coreId + "/partner").set(auth(coreLeader));
  assert.equal(coreView.body.grade.id, "core");
  assert.equal(coreView.body.grade.members, 100);
  assert.equal(coreView.body.grade.collective, true);

  assert.equal((await request(app).post("/marathon/api/clubs/" + coreId + "/supplies/" + supplyId + "/claim").set(auth(coreLeader))).status, 200);
  assert.equal((await request(app).post("/marathon/api/clubs/" + coreId + "/supplies/" + supplyId + "/claim").set(auth(coreMate))).status, 200);
  const coreFull = await request(app).post("/marathon/api/clubs/" + coreId + "/supplies/" + supplyId + "/claim").set(auth(coreThird));
  assert.equal(coreFull.status, 400);
  assert.match(coreFull.body.error, /这个团的额度满了/);

  const tooSmall = await request(app).put("/marathon/api/admin/supplies/" + supplyId).set(admin).send({ total: 2 });
  assert.equal(tooSmall.status, 400);
  assert.match(tooSmall.body.error, /总量不能少于已领/);
  const locked = await request(app).put("/marathon/api/admin/supplies/" + supplyId).set(admin).send({ needChecks: 4 });
  assert.equal(locked.status, 400);
  assert.match(locked.body.error, /条件不能改/);

  const wider = await request(app)
    .post("/marathon/api/admin/supplies")
    .set(admin)
    .send({ brand: "补给牌", name: "盐丸", total: 5, quota: 2, month, needChecks: 0, needKm: 0, note: "" });
  assert.equal(wider.status, 200);
  assert.equal((await request(app).post("/marathon/api/clubs/" + clubId + "/supplies/" + wider.body.id + "/claim").set(auth(leader))).status, 200);
  assert.equal((await request(app).post("/marathon/api/clubs/" + clubId + "/supplies/" + wider.body.id + "/claim").set(auth(mate))).status, 200);
  const shrink = await request(app).put("/marathon/api/admin/supplies/" + wider.body.id).set(admin).send({ quota: 1 });
  assert.equal(shrink.status, 400);
  assert.match(shrink.body.error, /额度不能少于已领/);

  const badKind = await request(app).post("/marathon/api/admin/splits").set(admin).send({ clubId, month, kind: "swim", yuan: 1, note: "" });
  assert.equal(badKind.status, 400);
  assert.match(badKind.body.error, /服务费、分佣或冠名/);
  const split = await request(app).post("/marathon/api/admin/splits").set(admin).send({ clubId, month, kind: "commission", yuan: 864213, note: "线下" });
  assert.equal(split.status, 200);
  const mateView = await request(app).get("/marathon/api/clubs/" + clubId + "/partner").set(auth(mate));
  assert.equal(mateView.body.ledger, null);
  assert.match(mateView.body.ledgerNote, /会费仍由跑团自己收/);
  assert.equal(JSON.stringify(mateView.body).includes("864213"), false);
  const ownerView = await request(app).get("/marathon/api/clubs/" + clubId + "/partner").set(auth(leader));
  assert.equal(ownerView.body.ledger[0].yuan, 864213);
  assert.equal(ownerView.body.ledger[0].kindLabel, "分佣");
  assert.equal(ownerView.body.ledger[0].settled, false);
  const settled = await request(app).put("/marathon/api/admin/splits/" + split.body.id).set(admin).send({ settled: true });
  assert.equal(settled.status, 200);
  const kept = await request(app).delete("/marathon/api/admin/splits/" + split.body.id).set(admin);
  assert.equal(kept.status, 400);
  assert.match(kept.body.error, /已经结清的账不能删/);

  const league = await request(app).post("/marathon/api/admin/leagues").set(admin).send({ month, title: "十月联赛", sponsor: "补给牌", prize: "能量胶" });
  assert.equal(league.status, 200);
  const duplicate = await request(app).post("/marathon/api/admin/leagues").set(admin).send({ month, title: "又一场", sponsor: "", prize: "" });
  assert.equal(duplicate.status, 400);
  assert.match(duplicate.body.error, /这个月已经有联赛/);
  const managerJoin = await request(app).post("/marathon/api/clubs/" + clubId + "/league/join").set(auth(manager));
  assert.equal(managerJoin.status, 403);
  assert.match(managerJoin.body.error, /只有团长可以参加联赛/);
  assert.equal((await request(app).post("/marathon/api/clubs/" + clubId + "/league/join").set(auth(leader))).status, 200);
  assert.equal((await request(app).post("/marathon/api/clubs/" + coreId + "/league/join").set(auth(coreLeader))).status, 200);
  assert.equal((await request(app).get("/marathon/api/clubs/" + clubId + "/partner").set(auth(outsider))).status, 403);

  const race = getDb().prepare("SELECT id FROM races WHERE substr(race_date, 1, 7) = ? LIMIT 1").get(month);
  if (race) {
    getDb().prepare("INSERT OR REPLACE INTO results (user_id, race_id, distance, seconds, story, updated_at) VALUES (?, ?, '10k', 2400, '', ?)").run(leaderId, race.id, now);
  }
  const board = await request(app).get("/marathon/api/clubs/" + clubId + "/partner").set(auth(leader));
  assert.equal(board.body.league.title, "十月联赛");
  assert.equal(board.body.league.rows.length, 2);
  assert.equal(board.body.league.rows[0].place, 1);
  const mine = board.body.league.rows.find((row) => row.mine);
  const coreRow = board.body.league.rows.find((row) => row.core);
  assert.equal(mine.km, 0);
  assert.ok(coreRow);
  assert.equal(coreRow.km, 0);
  if (race) {
    assert.equal(mine.finishers, 1);
    assert.equal(mine.finishRate, "3%");
  }

  getDb().prepare("UPDATE leagues SET month = '2020-01' WHERE id = ?").run(league.body.id);
  const closed = await request(app).delete("/marathon/api/clubs/" + clubId + "/league/join").set(auth(leader));
  assert.equal(closed.status, 400);
  assert.match(closed.body.error, /这个月已经结束/);
  const closedView = await request(app).get("/marathon/api/clubs/" + clubId + "/partner").set(auth(leader));
  assert.equal(closedView.body.league.closed, true);
  assert.equal(closedView.body.league.canLeave, false);

  const conditional = await request(app)
    .post("/marathon/api/admin/supplies")
    .set(admin)
    .send({ brand: "补给牌", name: "补给", total: 5, quota: 5, month, needChecks: 2, needKm: 0, note: "" });
  assert.equal(conditional.status, 200);
  const hopeful = await session("条件甲");
  const hopefulJoin = await joinWithCode(hopeful, code);
  assert.equal(hopefulJoin.status, 200);
  const short = await request(app).post("/marathon/api/clubs/" + clubId + "/supplies/" + conditional.body.id + "/claim").set(auth(hopeful));
  assert.equal(short.status, 400);
  assert.match(short.body.error, /还没达到领取条件/);
  const hopefulId = await userIdOf(hopeful);
  check(clubId, hopefulId, today);
  check(clubId, hopefulId, dayShift(-1));
  const met = await request(app).post("/marathon/api/clubs/" + clubId + "/supplies/" + conditional.body.id + "/claim").set(auth(hopeful));
  assert.equal(met.status, 200);
  const hopefulView = await request(app).get("/marathon/api/clubs/" + clubId + "/partner").set(auth(hopeful));
  const mineClaim = hopefulView.body.supplies.find((item) => item.id === conditional.body.id).mine;
  assert.equal(mineClaim.status, "pending");
  const strangerGive = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/supplies/" + conditional.body.id + "/claims/" + mineClaim.id + "/give")
    .set(auth(mate));
  assert.equal(strangerGive.status, 403);
  const withdrawn = await request(app)
    .delete("/marathon/api/clubs/" + clubId + "/supplies/" + conditional.body.id + "/claims/" + mineClaim.id)
    .set(auth(hopeful));
  assert.equal(withdrawn.status, 200);
  assert.equal((await request(app).post("/marathon/api/clubs/" + clubId + "/supplies/" + conditional.body.id + "/claim").set(auth(hopeful))).status, 200);
  const renewed = await request(app).get("/marathon/api/clubs/" + clubId + "/partner").set(auth(hopeful));
  const renewedId = renewed.body.supplies.find((item) => item.id === conditional.body.id).mine.id;
  const given = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/supplies/" + conditional.body.id + "/claims/" + renewedId + "/give")
    .set(auth(manager));
  assert.equal(given.status, 200);
  const stuck = await request(app)
    .delete("/marathon/api/clubs/" + clubId + "/supplies/" + conditional.body.id + "/claims/" + renewedId)
    .set(auth(hopeful));
  assert.equal(stuck.status, 400);
  assert.match(stuck.body.error, /已经发放，不能撤回/);

  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM point_entries").get().n, pointsBefore);
});

test("the prize radar compares a sourced cutoff and does not invent a probability", async () => {
  process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin";
  const admin = { Authorization: "Bearer " + process.env.ADMIN_TOKEN };
  const token = await session("雷达甲");
  const auth = { Authorization: "Bearer " + token };
  const empty = await request(app).get("/marathon/api/radar").set(auth);
  assert.equal(empty.status, 200);
  assert.match(empty.body.note, /仅供参考/);
  assert.match(empty.body.note, /不估算概率/);
  assert.equal(empty.body.rows.length, 0);

  const missing = await request(app).post("/marathon/api/admin/races/bishan/prizes").set(admin).send({
    distance: "full",
    kind: "age",
    gender: "男",
    ageMin: 40,
    ageMax: 49,
    placeN: 8,
    amount: 500,
    tax: 20,
    stack: false,
    source: ""
  });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /来源写成/);

  const age = await request(app).post("/marathon/api/admin/races/bishan/prizes").set(admin).send({
    distance: "full",
    kind: "age",
    gender: "男",
    ageMin: 40,
    ageMax: 49,
    placeN: 8,
    amount: 500,
    tax: 20,
    stack: false,
    source: "规程第 3 页",
    cutoffClock: "3:40:00",
    cutoffSource: "往届秩序册"
  });
  assert.equal(age.status, 200);
  const open = await request(app).post("/marathon/api/admin/races/bishan/prizes").set(admin).send({
    distance: "half",
    kind: "place",
    gender: "男",
    placeN: 3,
    amount: 0,
    tax: 0,
    stack: false,
    source: "半马规程"
  });
  assert.equal(open.status, 200);
  const local = await request(app).post("/marathon/api/admin/races/bishan/prizes").set(admin).send({
    distance: "full",
    kind: "local",
    gender: "",
    province: "重庆",
    placeN: 5,
    amount: 200,
    tax: 0,
    stack: true,
    source: "本地籍规程"
  });
  assert.equal(local.status, 200);
  const club = await request(app).post("/marathon/api/admin/races/bishan/prizes").set(admin).send({
    distance: "full",
    kind: "club",
    placeN: 3,
    amount: 1000,
    tax: 0,
    stack: false,
    source: "跑团规程"
  });
  assert.equal(club.status, 200);
  const past = await request(app).post("/marathon/api/admin/races/closed-sample/prizes").set(admin).send({
    distance: "full",
    kind: "place",
    placeN: 1,
    amount: 100,
    tax: 0,
    stack: false,
    source: "已结束的规程"
  });
  assert.equal(past.status, 200);

  const recorded = await request(app).put("/marathon/api/me/races/closed-sample/result").set(auth).send({ distance: "full", time: "3:36:00" });
  assert.equal(recorded.status, 200);
  const saved = await request(app).put("/marathon/api/me/radar").set(auth).send({
    gender: "男",
    birth: "1986-10",
    province: "重庆",
    targets: {}
  });
  assert.equal(saved.status, 200);
  const hit = await request(app).get("/marathon/api/radar").set(auth);
  assert.equal(hit.status, 200);
  assert.equal(hit.body.rows.some((row) => row.race.id === "closed-sample"), false);
  const ageRow = hit.body.rows.find((row) => row.ruleId === age.body.id);
  assert.equal(ageRow.ahead, true);
  assert.equal(ageRow.amountText, "税后 400 元");
  assert.match(ageRow.reason, /40–49 岁男子组，前 8 名/);
  assert.match(ageRow.reason, /快约 4 分钟/);
  assert.equal(ageRow.clockLabel, "PB 3:36:00");
  assert.equal(JSON.stringify(ageRow).includes("保证"), false);
  assert.equal(ageRow.probability, undefined);
  const halfRow = hit.body.rows.find((row) => row.ruleId === open.body.id);
  assert.match(halfRow.reason, /不估算概率|还没有这场距离的成绩/);
  assert.match(halfRow.reason, /还没有这场距离的成绩/);
  const localRow = hit.body.rows.find((row) => row.ruleId === local.body.id);
  assert.ok(localRow);
  const clubRow = hit.body.rows.find((row) => row.ruleId === club.body.id);
  assert.match(clubRow.reason, /跑团奖/);
  assert.ok(hit.body.rows.findIndex((row) => row.ruleId === age.body.id) < hit.body.rows.findIndex((row) => row.ruleId === club.body.id));

  const young = await request(app).put("/marathon/api/me/radar").set(auth).send({ gender: "男", birth: "1986-11", province: "重庆", targets: {} });
  assert.equal(young.status, 200);
  const younger = await request(app).get("/marathon/api/radar").set(auth);
  assert.equal(younger.body.rows.some((row) => row.ruleId === age.body.id), false);

  const other = await request(app).put("/marathon/api/me/radar").set(auth).send({ gender: "女", birth: "1986-10", province: "北京", targets: {} });
  assert.equal(other.status, 200);
  const hers = await request(app).get("/marathon/api/radar").set(auth);
  assert.equal(hers.body.rows.some((row) => row.ruleId === age.body.id), false);
  assert.equal(hers.body.rows.some((row) => row.ruleId === local.body.id), false);

  const future = await request(app).put("/marathon/api/me/radar").set(auth).send({ gender: "男", birth: "2027-01", province: "", targets: {} });
  assert.equal(future.status, 400);
  assert.match(future.body.error, /不能晚于本月/);
  const alien = await request(app).put("/marathon/api/me/radar").set(auth).send({ gender: "男", birth: "", province: "火星", targets: {} });
  assert.equal(alien.status, 400);
  assert.match(alien.body.error, /省份不在名单里/);

  for (const id of [age.body.id, open.body.id, local.body.id, club.body.id]) {
    assert.equal((await request(app).delete("/marathon/api/admin/races/bishan/prizes/" + id).set(admin)).status, 200);
  }
  assert.equal((await request(app).delete("/marathon/api/admin/races/closed-sample/prizes/" + past.body.id).set(admin)).status, 200);
});

test("club posts stay inside the club and do not write points", async () => {
  const pointsBefore = getDb().prepare("SELECT COUNT(*) AS n FROM point_entries").get().n;
  const leader = await session("动态甲");
  const mate = await session("动态乙");
  const outsider = await session("动态丙");
  const owner = { Authorization: "Bearer " + leader };
  const member = { Authorization: "Bearer " + mate };
  const other = { Authorization: "Bearer " + outsider };
  const created = await createClub(leader, "动态团");
  const clubId = created.body.club.id;
  const joined = await joinWithCode(member.Authorization.replace(/^Bearer /, ""), created.body.club.code);
  assert.equal(joined.status, 200);

  const locked = await request(app).get("/marathon/api/clubs/" + clubId + "/posts").set(other);
  assert.equal(locked.status, 403);
  assert.match(locked.body.error, /不在这个跑团里/);
  const empty = await request(app).post("/marathon/api/clubs/" + clubId + "/posts").set(member).send({ body: "  " });
  assert.equal(empty.status, 400);
  assert.match(empty.body.error, /写 1 到 200 个字/);

  const posted = await request(app).post("/marathon/api/clubs/" + clubId + "/posts").set(member).send({ body: "周日晨跑见" });
  assert.equal(posted.status, 200);
  const postId = posted.body.id;
  assert.equal(posted.body.posts[0].body, "周日晨跑见");
  assert.equal(posted.body.posts[0].canDelete, true);
  const commented = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/posts/" + postId + "/comments")
    .set(owner)
    .send({ body: "几点集合" });
  assert.equal(commented.status, 200);
  assert.equal(commented.body.posts[0].comments[0].body, "几点集合");
  const liked = await request(app).post("/marathon/api/clubs/" + clubId + "/posts/" + postId + "/like").set(owner);
  assert.equal(liked.status, 200);
  assert.equal(liked.body.posts[0].likes, 1);
  assert.equal(liked.body.posts[0].liked, true);
  const again = await request(app).post("/marathon/api/clubs/" + clubId + "/posts/" + postId + "/like").set(owner);
  assert.equal(again.status, 400);
  assert.match(again.body.error, /已经赞过/);
  const ownerPost = await request(app).post("/marathon/api/clubs/" + clubId + "/posts").set(owner).send({ body: "团长一句" });
  const ownOnly = await request(app).delete("/marathon/api/clubs/" + clubId + "/posts/" + ownerPost.body.id).set(member);
  assert.equal(ownOnly.status, 403);
  assert.match(ownOnly.body.error, /只能删自己的/);
  const blocked = await request(app).delete("/marathon/api/clubs/" + clubId + "/posts/" + postId).set(owner);
  assert.equal(blocked.status, 200);
  const matePost = await request(app).post("/marathon/api/clubs/" + clubId + "/posts").set(member).send({ body: "再约一次" });
  const denied = await request(app).delete("/marathon/api/clubs/" + clubId + "/posts/" + matePost.body.id).set(other);
  assert.equal(denied.status, 403);
  const removed = await request(app).delete("/marathon/api/clubs/" + clubId + "/posts/" + matePost.body.id).set(member);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.posts.length, 1);
  assert.equal(removed.body.posts[0].body, "团长一句");
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM point_entries").get().n, pointsBefore);
});

test("a sourced draw rate is shown as a calculated percent and stays off the poster", async () => {
  process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin";
  const admin = { Authorization: "Bearer " + process.env.ADMIN_TOKEN };
  const missing = await request(app).post("/marathon/api/admin/races/bishan/draws").set(admin).send({
    label: "2025",
    applicants: 1000,
    quota: 72,
    source: ""
  });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /来源写成/);
  const over = await request(app).post("/marathon/api/admin/races/bishan/draws").set(admin).send({
    label: "2025",
    applicants: 1000,
    quota: 1001,
    source: "验收公告"
  });
  assert.equal(over.status, 400);
  assert.match(over.body.error, /名额不能多于报名人数/);
  const created = await request(app).post("/marathon/api/admin/races/bishan/draws").set(admin).send({
    label: "2025",
    applicants: 1000,
    quota: 72,
    source: "验收公告"
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.rates[0].rateText, "7.2%");
  const duplicate = await request(app).post("/marathon/api/admin/races/bishan/draws").set(admin).send({
    label: "2025",
    applicants: 800,
    quota: 40,
    source: "另一份公告"
  });
  assert.equal(duplicate.status, 400);
  assert.match(duplicate.body.error, /这一届已经记过/);

  const token = await session("中签甲");
  const auth = { Authorization: "Bearer " + token };
  const marked = await request(app).put("/marathon/api/me/races/bishan").set(auth).send({ status: "中签" });
  assert.equal(marked.status, 200);
  const detail = await request(app).get("/marathon/api/races/bishan").set(auth);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.drawRates[0].rateText, "7.2%");
  assert.equal(detail.body.drawRates[0].source, "验收公告");
  assert.match(detail.body.drawText, /中签了/);
  assert.equal(/中签率|官方|保证/.test(detail.body.drawText), false);
  const plain = await request(app).get("/marathon/api/races/yuxi");
  assert.equal(plain.body.drawRates.length, 0);
  assert.equal((await request(app).delete("/marathon/api/admin/races/bishan/draws/" + created.body.id).set(admin)).status, 200);
  const gone = await request(app).get("/marathon/api/races/bishan");
  assert.equal(gone.body.drawRates.length, 0);
});

test("a handwritten result can carry an unverified certificate or medal photo", async () => {
  const fs = require("fs");
  const path = require("path");
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const token = await session("成绩照");
  const auth = { Authorization: "Bearer " + token };
  const pointsBefore = getDb().prepare("SELECT COUNT(*) AS n FROM point_entries").get().n;
  const early = await request(app)
    .post("/marathon/api/me/races/jinjiang/result/proof/certificate")
    .set(auth)
    .attach("file", jpeg, { filename: "cert.jpg", contentType: "image/jpeg" });
  assert.equal(early.status, 400);
  assert.match(early.body.error, /先记下成绩/);
  const badKind = await request(app)
    .post("/marathon/api/me/races/bishan/result/proof/ocr")
    .set(auth)
    .attach("file", jpeg, { filename: "cert.jpg", contentType: "image/jpeg" });
  assert.equal(badKind.status, 400);
  assert.match(badKind.body.error, /证书或奖牌/);

  const saved = await request(app).put("/marathon/api/me/races/bishan/result").set(auth).send({ distance: "full", time: "3:30:00" });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.result.verifyLabel, "未核验");
  assert.equal(saved.body.result.hasProof, false);

  const certificate = await request(app)
    .post("/marathon/api/me/races/bishan/result/proof/certificate")
    .set(auth)
    .attach("file", jpeg, { filename: "cert.jpg", contentType: "image/jpeg" });
  assert.equal(certificate.status, 200);
  assert.equal(certificate.body.result.hasProof, true);
  assert.equal(certificate.body.result.proofLabel, "证书");
  assert.equal(certificate.body.result.verifyLabel, "未核验");
  assert.equal(certificate.body.result.proof, undefined);
  const image = await request(app).get("/marathon/api/me/races/bishan/result/proof").set(auth);
  assert.equal(image.status, 200);
  assert.equal(image.headers["content-type"], "image/jpeg");
  const byQuery = await request(app).get("/marathon/api/me/races/bishan/result/proof?t=" + encodeURIComponent(token));
  assert.equal(byQuery.status, 200);
  const stranger = await request(app).get("/marathon/api/me/races/bishan/result/proof").set("Authorization", "Bearer " + (await session("成绩旁人")));
  assert.equal(stranger.status, 404);

  const kept = await request(app).put("/marathon/api/me/races/bishan/result").set(auth).send({ distance: "full", time: "3:29:00" });
  assert.equal(kept.status, 200);
  assert.equal(kept.body.result.hasProof, true);
  assert.equal(kept.body.result.proofLabel, "证书");

  const medal = await request(app)
    .post("/marathon/api/me/races/bishan/result/proof/medal")
    .set(auth)
    .attach("file", jpeg, { filename: "medal.jpg", contentType: "image/jpeg" });
  assert.equal(medal.status, 200);
  assert.equal(medal.body.result.proofLabel, "奖牌");
  const row = getDb().prepare("SELECT proof FROM results WHERE race_id = 'bishan' AND proof != ''").get();
  assert.ok(row && row.proof);
  const file = path.join(process.env.MARATHON_MEDIA, "results", row.proof);
  assert.equal(fs.existsSync(file), true);

  const cleared = await request(app).delete("/marathon/api/me/races/bishan/result/proof").set(auth);
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.result.hasProof, false);
  assert.equal(fs.existsSync(file), false);

  const again = await request(app)
    .post("/marathon/api/me/races/bishan/result/proof/certificate")
    .set(auth)
    .attach("file", jpeg, { filename: "cert.jpg", contentType: "image/jpeg" });
  assert.equal(again.status, 200);
  const stored = getDb().prepare("SELECT proof FROM results WHERE race_id = 'bishan' AND proof != ''").get();
  const storedFile = path.join(process.env.MARATHON_MEDIA, "results", stored.proof);
  const half = await request(app).put("/marathon/api/me/races/bishan/result").set(auth).send({ distance: "half", time: "1:40:00" });
  assert.equal(half.status, 200);
  assert.equal(half.body.result.distance, "half");
  const both = await request(app).get("/marathon/api/me").set(auth);
  const keptRows = both.body.results.filter((item) => item.race.id === "bishan");
  assert.equal(keptRows.length, 2);
  assert.equal(keptRows.find((item) => item.distance === "full").hasProof, true);
  assert.equal(keptRows.find((item) => item.distance === "half").clock, "1:40:00");
  const dropHalf = await request(app).delete("/marathon/api/me/races/bishan/result?distance=half").set(auth);
  assert.equal(dropHalf.status, 200);
  const left = await request(app).get("/marathon/api/me").set(auth);
  const leftRows = left.body.results.filter((item) => item.race.id === "bishan");
  assert.equal(leftRows.length, 1);
  assert.equal(leftRows[0].distance, "full");
  assert.equal(leftRows[0].hasProof, true);
  assert.equal(fs.existsSync(storedFile), true);
  const missing = await request(app).delete("/marathon/api/me/races/bishan/result?distance=10k").set(auth);
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /没有这项成绩/);
  const removed = await request(app).delete("/marathon/api/me/races/bishan/result").set(auth);
  assert.equal(removed.status, 200);
  assert.equal(fs.existsSync(storedFile), false);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM point_entries").get().n, pointsBefore);
});

test("a marked race can keep a private signup screenshot", async () => {
  const fs = require("fs");
  const path = require("path");
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const token = await session("报名截图");
  const auth = { Authorization: "Bearer " + token };
  const pointsBefore = getDb().prepare("SELECT COUNT(*) AS n FROM point_entries").get().n;
  const early = await request(app)
    .post("/marathon/api/me/races/bishan/sheet")
    .set(auth)
    .attach("file", jpeg, { filename: "signup.jpg", contentType: "image/jpeg" });
  assert.equal(early.status, 400);
  assert.match(early.body.error, /先标状态/);
  const marked = await request(app).put("/marathon/api/me/races/bishan").set(auth).send({ status: "想跑" });
  assert.equal(marked.status, 200);
  const bad = await request(app)
    .post("/marathon/api/me/races/bishan/sheet")
    .set(auth)
    .attach("file", Buffer.from("nope"), { filename: "a.txt", contentType: "text/plain" });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /jpg/);
  const dir = path.join(process.env.MARATHON_MEDIA, "signups");
  const before = new Set(fs.existsSync(dir) ? fs.readdirSync(dir) : []);
  const uploaded = await request(app)
    .post("/marathon/api/me/races/bishan/sheet")
    .set(auth)
    .attach("file", jpeg, { filename: "signup.jpg", contentType: "image/jpeg" });
  assert.equal(uploaded.status, 200);
  assert.equal(uploaded.body.hasSheet, true);
  const detail = await request(app).get("/marathon/api/races/bishan").set(auth);
  assert.equal(detail.body.myStatus, "想跑");
  assert.equal(detail.body.hasSheet, true);
  const image = await request(app).get("/marathon/api/me/races/bishan/sheet").set(auth);
  assert.equal(image.status, 200);
  assert.equal(image.headers["content-type"], "image/jpeg");
  const stranger = await request(app).get("/marathon/api/me/races/bishan/sheet").set("Authorization", "Bearer " + (await session("截图旁人")));
  assert.equal(stranger.status, 404);
  const moved = await request(app).put("/marathon/api/me/races/bishan").set(auth).send({ status: "已报名" });
  assert.equal(moved.status, 200);
  const still = await request(app).get("/marathon/api/races/bishan").set(auth);
  assert.equal(still.body.myStatus, "已报名");
  assert.equal(still.body.hasSheet, true);
  const added = fs.readdirSync(dir).filter((name) => !before.has(name));
  assert.equal(added.length, 1);
  const file = path.join(dir, added[0]);
  assert.equal(fs.existsSync(file), true);
  const cleared = await request(app).delete("/marathon/api/me/races/bishan/sheet").set(auth);
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.hasSheet, false);
  assert.equal(fs.existsSync(file), false);
  const again = await request(app)
    .post("/marathon/api/me/races/bishan/sheet")
    .set(auth)
    .attach("file", jpeg, { filename: "signup.jpg", contentType: "image/jpeg" });
  assert.equal(again.status, 200);
  const dropped = await request(app).delete("/marathon/api/me/races/bishan").set(auth);
  assert.equal(dropped.status, 200);
  assert.equal(fs.existsSync(file), false);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM point_entries").get().n, pointsBefore);
});

test("a bot upload waits for review and a return can be sent again", async () => {
  process.env.ADMIN_TOKEN = "test-admin";
  process.env.GROK_BOT_TOKEN = "bot-test";
  const admin = { Authorization: "Bearer test-admin" };
  const bot = { Authorization: "Bearer bot-test" };
  const closed = await request(app).post("/marathon/api/bot/races").send({ races: [] });
  assert.equal(closed.status, 401);
  const missing = await request(app).post("/marathon/api/bot/races").set(bot).send({});
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /请带上比赛/);
  const past = await request(app).post("/marathon/api/bot/races").set(bot).send({
    races: [{ officialId: "botpast", name: "过去的比赛", raceDate: "2020-01-01", province: "浙江", city: "杭州", distances: ["full"], source: "中国马拉松官网" }]
  });
  assert.equal(past.status, 200);
  assert.match(past.body.errors[0].error, /只收还没开赛的比赛/);
  const badLink = await request(app).post("/marathon/api/bot/races").set(bot).send({
    races: [{
      officialId: "botlink",
      name: "链接不对马拉松",
      raceDate: "2026-12-20",
      province: "浙江",
      city: "杭州",
      distances: ["full"],
      source: "中国马拉松官网",
      signupUrl: "javascript:alert(1)"
    }]
  });
  assert.match(badLink.body.errors[0].error, /https/);
  const bareDate = await request(app).post("/marathon/api/bot/races").set(bot).send({
    races: [{
      officialId: "botdate",
      name: "没写来源马拉松",
      raceDate: "2026-12-20",
      province: "浙江",
      city: "杭州",
      distances: ["half"],
      source: "中国马拉松官网",
      deadline: "2026-11-01"
    }]
  });
  assert.match(bareDate.body.errors[0].error, /报名时间要写来源/);

  const uploaded = await request(app).post("/marathon/api/bot/races").set(bot).send({
    races: [{
      officialId: "bot4242",
      name: "2026上传测试马拉松",
      raceDate: "2026-12-20",
      province: "浙江",
      city: "杭州",
      place: "西湖",
      distances: ["full", "half"],
      source: "中国马拉松官网，2026-10-21",
      organizer: "测试组委会",
      eventUrl: "https://example.com/race"
    }]
  });
  assert.equal(uploaded.status, 200);
  assert.equal(uploaded.body.accepted.length, 1);
  assert.equal(uploaded.body.accepted[0].onCalendar, false);
  assert.equal(uploaded.body.errors.length, 0);
  const hidden = await request(app).get("/marathon/api/races/caa-bot4242");
  assert.equal(hidden.status, 404);
  const queue = await request(app).get("/marathon/api/admin/bot-races?status=pending").set(admin);
  assert.equal(queue.status, 200);
  const waiting = queue.body.rows.find((row) => row.officialId === "bot4242");
  assert.equal(waiting.name, "2026上传测试马拉松");
  assert.match(waiting.lines.join("\n"), /测试组委会/);
  const stranger = await request(app).post("/marathon/api/admin/bot-races/" + waiting.id + "/publish").set("Authorization", "Bearer " + (await session("上传旁人"))).send({});
  assert.equal(stranger.status, 401);
  const published = await request(app).post("/marathon/api/admin/bot-races/" + waiting.id + "/publish").set(admin).send({});
  assert.equal(published.status, 200);
  assert.equal(published.body.created, true);
  const opened = await request(app).get("/marathon/api/races/" + published.body.raceId);
  assert.equal(opened.body.race.regStatus, "报名时间未公布");
  assert.equal(opened.body.race.id, "bot4242");
  assert.equal(opened.body.race.officialUrl, "");
  assert.equal(opened.body.race.meet, "offline");
  assert.equal(opened.body.race.source, "中国马拉松官网，2026-10-21");
  assert.equal(opened.body.race.organizer, "测试组委会");
  assert.equal(opened.body.race.eventUrl, "https://example.com/race");

  const dated = await request(app).put("/marathon/api/admin/races/" + published.body.raceId).set(admin).send({ deadline: "2026-12-01", source: "规程，2026-10-21" });
  assert.equal(dated.status, 200);
  const again = await request(app).post("/marathon/api/bot/races").set(bot).send({
    races: [{
      officialId: "bot4242",
      name: "2026上传测试马拉松",
      raceDate: "2026-12-20",
      province: "浙江",
      city: "杭州",
      distances: ["full", "half"],
      source: "赛事网站，2026-10-21",
      fee: "150元",
      signupUrl: "https://example.com/signup",
      prizes: [{ distance: "full", kind: "place", gender: "男", placeN: 1, amount: 500, tax: 20, stack: false, source: "规程，2026-10-21" }],
      draws: [{ label: "2025", applicants: 1000, quota: 72, source: "规程，2026-10-21" }]
    }]
  });
  assert.equal(again.body.accepted[0].onCalendar, true);
  const before = await request(app).get("/marathon/api/races/" + published.body.raceId);
  assert.equal(before.body.race.deadline, "2026-12-01");
  assert.equal(before.body.race.fee, "");
  const review = await request(app).get("/marathon/api/admin/bot-races?status=pending").set(admin);
  const second = review.body.rows.find((row) => row.officialId === "bot4242");
  assert.ok(second.changes.some((line) => line.includes("费用")));
  const kept = await request(app).post("/marathon/api/admin/bot-races/" + second.id + "/publish").set(admin).send({});
  assert.equal(kept.status, 200);
  assert.equal(kept.body.created, false);
  const after = await request(app).get("/marathon/api/races/" + published.body.raceId);
  assert.equal(after.body.race.deadline, "2026-12-01");
  assert.equal(after.body.race.source, "规程，2026-10-21");
  assert.equal(after.body.race.fee, "150元");
  assert.equal(after.body.race.links.find((item) => item.key === "signup").url, "https://example.com/signup");
  assert.equal(after.body.race.eventUrl, "https://example.com/race");
  const prizeRows = await request(app).get("/marathon/api/admin/races/" + published.body.raceId + "/prizes").set(admin);
  assert.equal(prizeRows.body.prizes.length, 1);
  assert.equal(prizeRows.body.prizes[0].amount, 500);
  const drawRows = await request(app).get("/marathon/api/admin/races/" + published.body.raceId + "/draws").set(admin);
  assert.equal(drawRows.body.rates[0].label, "2025");
  assert.equal(drawRows.body.rates[0].quota, 72);

  const overwritten = await request(app).post("/marathon/api/bot/races").set(bot).send({
    races: [{
      officialId: "bot4242",
      name: "2026上传测试马拉松",
      raceDate: "2026-12-20",
      province: "浙江",
      city: "杭州",
      distances: ["full", "half"],
      source: "规程修订，2026-10-22",
      fee: "160元",
      prizes: [{ distance: "half", kind: "place", gender: "女", placeN: 3, amount: 0, stack: false, source: "规程修订，2026-10-22" }],
      draws: []
    }]
  });
  assert.equal(overwritten.body.accepted[0].onCalendar, true);
  const reviewAgain = await request(app).get("/marathon/api/admin/bot-races?status=pending").set(admin);
  const thirdWait = reviewAgain.body.rows.find((row) => row.officialId === "bot4242");
  assert.match(thirdWait.lines.join("\n"), /整份替换/);
  const applied = await request(app).post("/marathon/api/admin/bot-races/" + thirdWait.id + "/publish").set(admin).send({});
  assert.equal(applied.status, 200);
  const covered = await request(app).get("/marathon/api/races/" + published.body.raceId);
  assert.equal(covered.body.race.fee, "160元");
  assert.equal(covered.body.race.deadline, "2026-12-01");
  const nextPrizes = await request(app).get("/marathon/api/admin/races/" + published.body.raceId + "/prizes").set(admin);
  assert.equal(nextPrizes.body.prizes.length, 1);
  assert.equal(nextPrizes.body.prizes[0].distance, "half");
  assert.equal(nextPrizes.body.prizes[0].amount, 0);
  const nextDraws = await request(app).get("/marathon/api/admin/races/" + published.body.raceId + "/draws").set(admin);
  assert.equal(nextDraws.body.rates.length, 0);

  const third = await request(app).post("/marathon/api/bot/races").set(bot).send({
    races: [{
      officialId: "bot4242",
      name: "2026上传测试马拉松",
      raceDate: "2026-12-20",
      province: "浙江",
      city: "杭州",
      distances: ["full", "half"],
      source: "中国马拉松官网，2026-10-22"
    }]
  });
  const blank = await request(app).post("/marathon/api/admin/bot-races/" + third.body.accepted[0].id + "/return").set(admin).send({});
  assert.equal(blank.status, 400);
  assert.match(blank.body.error, /打回要写原因/);
  const sent = await request(app).post("/marathon/api/admin/bot-races/" + third.body.accepted[0].id + "/return").set(admin).send({ note: "报名入口打不开" });
  assert.equal(sent.status, 200);
  const stuck = await request(app).post("/marathon/api/admin/bot-races/" + third.body.accepted[0].id + "/publish").set(admin).send({});
  assert.equal(stuck.status, 400);
  const returned = await request(app).get("/marathon/api/bot/races").set(bot);
  const reason = returned.body.returned.find((row) => row.officialId === "bot4242");
  assert.equal(reason.note, "报名入口打不开");
  const fixed = await request(app).post("/marathon/api/bot/races").set(bot).send({
    races: [{
      officialId: "bot4242",
      name: "2026上传测试马拉松",
      raceDate: "2026-12-20",
      province: "浙江",
      city: "杭州",
      distances: ["full", "half"],
      source: "赛事网站，2026-10-22",
      signupUrl: "https://example.com/signup-fixed"
    }]
  });
  assert.equal(fixed.body.accepted[0].id, third.body.accepted[0].id);
  assert.equal(fixed.body.accepted[0].status, "pending");
  const quiet = await request(app).get("/marathon/api/bot/races").set(bot);
  assert.equal(quiet.body.returned.some((row) => row.officialId === "bot4242"), false);
});

test("a trail upload stays offline and does not invent an official marathon page", async () => {
  process.env.ADMIN_TOKEN = "test-admin";
  process.env.GROK_BOT_TOKEN = "bot-test";
  const admin = { Authorization: "Bearer test-admin" };
  const bot = { Authorization: "Bearer bot-test" };
  const road = await request(app).get("/marathon/api/races?kind=road&status=upcoming");
  const offline = await request(app).get("/marathon/api/races?kind=offline&status=upcoming");
  const online = await request(app).get("/marathon/api/races?kind=online&status=upcoming");
  assert.ok(road.body.races.length);
  assert.ok(offline.body.races.length >= road.body.races.length);
  assert.ok(road.body.races.every((race) => offline.body.races.some((item) => item.id === race.id)));
  assert.equal(online.body.races.length, 0);
  assert.ok(offline.body.races.every((race) => race.meet === "offline"));

  const bare = await request(app).post("/marathon/api/bot/races").set(bot).send({
    races: [{
      officialId: "zuiku-bare",
      name: "2026没有距离越野",
      raceDate: "2026-12-21",
      province: "浙江",
      city: "杭州",
      source: "最酷，2026-10-22"
    }]
  });
  assert.match(bare.body.errors[0].error, /越野和超马可以不选/);

  const uploaded = await request(app).post("/marathon/api/bot/races").set(bot).send({
    races: [{
      officialId: "zuiku-trail1",
      name: "2026南岳衡山越野",
      raceDate: "2026-12-21",
      province: "湖南",
      city: "衡阳",
      kinds: ["trail"],
      groups: ["30公里", "50公里"],
      meet: "offline",
      source: "最酷，2026-10-22",
      guideText: "规程正文"
    }]
  });
  assert.equal(uploaded.status, 200);
  assert.equal(uploaded.body.errors.length, 0);
  const waiting = (await request(app).get("/marathon/api/admin/bot-races?status=pending").set(admin)).body.rows.find((row) => row.officialId === "zuiku-trail1");
  assert.match(waiting.lines.join("\n"), /线下/);
  assert.match(waiting.lines.join("\n"), /越野/);
  const published = await request(app).post("/marathon/api/admin/bot-races/" + waiting.id + "/publish").set(admin).send({});
  assert.equal(published.body.raceId, "zuiku-trail1");
  const opened = await request(app).get("/marathon/api/races/zuiku-trail1");
  assert.equal(opened.body.race.kind, "trail");
  assert.equal(opened.body.race.meet, "offline");
  assert.deepEqual(opened.body.race.distances, []);
  assert.deepEqual(opened.body.race.groups, ["30公里", "50公里"]);
  assert.equal(opened.body.race.officialUrl, "");
  assert.equal(opened.body.race.source, "最酷，2026-10-22");
  const trailList = await request(app).get("/marathon/api/races?kind=trail&status=upcoming");
  assert.ok(trailList.body.races.some((race) => race.id === "zuiku-trail1"));
  const roadAfter = await request(app).get("/marathon/api/races?kind=road&status=upcoming");
  assert.equal(roadAfter.body.races.some((race) => race.id === "zuiku-trail1"), false);
  const offlineAfter = await request(app).get("/marathon/api/races?kind=offline&status=upcoming");
  assert.ok(offlineAfter.body.races.some((race) => race.id === "zuiku-trail1"));
  assert.equal(getDb().prepare("SELECT official_id FROM official_races WHERE official_id = ?").get("zuiku-trail1"), undefined);

  const caa = await request(app).post("/marathon/api/bot/races").set(bot).send({
    races: [{
      officialId: "424242",
      name: "2026田协编号马拉松",
      raceDate: "2026-12-22",
      province: "浙江",
      city: "杭州",
      distances: ["full"],
      source: "中国马拉松官网，2026-10-22"
    }]
  });
  assert.equal(caa.body.errors.length, 0);
  const caaRow = (await request(app).get("/marathon/api/admin/bot-races?status=pending").set(admin)).body.rows.find((row) => row.officialId === "424242");
  const caaPub = await request(app).post("/marathon/api/admin/bot-races/" + caaRow.id + "/publish").set(admin).send({});
  assert.equal(caaPub.body.raceId, "caa-424242");
  const caaRace = await request(app).get("/marathon/api/races/caa-424242");
  assert.equal(caaRace.body.race.officialUrl, "https://www.runchina.org.cn/#/race/v/detail/424242");
  assert.equal(caaRace.body.race.kind, "road");
  assert.equal(caaRace.body.race.meet, "offline");
  const roadHasCaa = await request(app).get("/marathon/api/races?kind=road&status=upcoming");
  assert.ok(roadHasCaa.body.races.some((race) => race.id === "caa-424242"));
});

test("a race list pages when asked and stays complete when page is omitted", async () => {
  const all = await request(app).get("/marathon/api/races?status=all");
  assert.equal(all.status, 200);
  assert.equal(all.body.races.length, all.body.total);
  const first = await request(app).get("/marathon/api/races?status=all&page=1&pageSize=2");
  assert.equal(first.status, 200);
  assert.equal(first.body.races.length, 2);
  assert.ok(first.body.total > 2);
  assert.ok(first.body.pages > 1);
  const second = await request(app).get("/marathon/api/races?status=all&page=2&pageSize=2");
  assert.equal(second.body.races.length, 2);
  assert.notEqual(second.body.races[0].id, first.body.races[0].id);
  assert.notEqual(second.body.races[1].id, first.body.races[1].id);
});

test("pending bot races page and the count is the whole queue", async () => {
  process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin";
  const admin = { Authorization: "Bearer " + process.env.ADMIN_TOKEN };
  const db = getDb();
  const stamp = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO bot_submissions (official_id, status, payload, note, race_id, created_at, updated_at)
     VALUES (?, 'pending', ?, '', '', ?, ?)`
  );
  for (let i = 0; i < 41; i += 1) {
    const day = String((i % 27) + 1).padStart(2, "0");
    insert.run(
      "pagebot-" + i,
      JSON.stringify({
        officialId: "pagebot-" + i,
        name: "分页待审" + i,
        raceDate: "2028-06-" + day,
        province: "浙江",
        city: "杭州",
        distances: [],
        kinds: [],
        groups: [],
        meet: "offline",
        source: "分页"
      }),
      stamp,
      stamp
    );
  }
  const page1 = await request(app).get("/marathon/api/admin/bot-races?status=pending&page=1").set(admin);
  assert.equal(page1.status, 200);
  assert.equal(page1.body.rows.length, 40);
  assert.ok(page1.body.total >= 41);
  assert.equal(page1.body.pendingCount, page1.body.total);
  const page2 = await request(app).get("/marathon/api/admin/bot-races?status=pending&page=2").set(admin);
  assert.equal(page2.body.rows.length, Math.min(40, page1.body.total - 40));
  assert.notEqual(page2.body.rows[0].id, page1.body.rows[0].id);
  const full = await request(app).get("/marathon/api/admin/bot-races?status=pending").set(admin);
  assert.equal(full.body.rows.length, full.body.total);
  assert.equal(full.body.pendingCount, full.body.total);
});

test("a pending upload can be corrected before it is published", async () => {
  process.env.ADMIN_TOKEN = "test-admin";
  process.env.GROK_BOT_TOKEN = "bot-test";
  const admin = { Authorization: "Bearer test-admin" };
  const bot = { Authorization: "Bearer bot-test" };
  const uploaded = await request(app).post("/marathon/api/bot/races").set(bot).send({
    races: [{
      officialId: "edit-bot-1",
      name: "上报名字不对",
      raceDate: "2026-12-20",
      province: "浙江",
      city: "杭州",
      place: "西湖",
      distances: ["half"],
      kinds: ["trail"],
      groups: ["30公里"],
      source: "最酷，2026-10-22",
      deadline: "2026-11-01",
      nodeSource: "最酷，2026-10-22",
      prizes: [{ distance: "half", kind: "place", gender: "男", placeN: 1, amount: 100, tax: 0, stack: false, source: "规程" }],
      draws: [{ label: "2025", applicants: 800, quota: 40, source: "规程" }]
    }]
  });
  assert.equal(uploaded.body.errors.length, 0);
  const id = uploaded.body.accepted[0].id;
  const stranger = await request(app).put("/marathon/api/admin/bot-races/" + id).set("Authorization", "Bearer " + (await session("改待审旁人"))).send({ city: "宁波" });
  assert.equal(stranger.status, 401);
  const opened = await request(app).get("/marathon/api/admin/bot-races/" + id).set(admin);
  assert.equal(opened.status, 200);
  assert.equal(opened.body.city, "杭州");
  assert.equal(opened.body.prizes[0].amount, 100);
  assert.equal(opened.body.prizes[0].placeN, 1);
  assert.equal(opened.body.draws[0].label, "2025");
  const blankCity = await request(app).put("/marathon/api/admin/bot-races/" + id).set(admin).send({ city: "" });
  assert.equal(blankCity.status, 400);
  assert.match(blankCity.body.error, /城市/);
  assert.equal((await request(app).get("/marathon/api/admin/bot-races/" + id).set(admin)).body.city, "杭州");
  const past = await request(app).put("/marathon/api/admin/bot-races/" + id).set(admin).send({ raceDate: "2020-01-01" });
  assert.equal(past.status, 200);
  assert.equal(past.body.status, "pending");
  const saved = await request(app).put("/marathon/api/admin/bot-races/" + id).set(admin).send({
    name: "上报名字已改",
    raceDate: "2026-12-20",
    city: "宁波",
    distances: ["full"],
    kinds: [],
    groups: "50公里"
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.status, "pending");
  assert.equal(saved.body.name, "上报名字已改");
  assert.equal(saved.body.city, "宁波");
  const detail = await request(app).get("/marathon/api/admin/bot-races/" + id).set(admin);
  assert.deepEqual(detail.body.distances, ["full"]);
  assert.deepEqual(detail.body.kinds, []);
  assert.deepEqual(detail.body.groups, ["50公里"]);
  assert.equal(detail.body.prizes.length, 1);
  assert.equal(detail.body.prizes[0].amount, 100);
  assert.equal(detail.body.deadline, "2026-11-01");
  assert.equal(detail.body.draws[0].quota, 40);
  const priced = await request(app).put("/marathon/api/admin/bot-races/" + id).set(admin).send({
    prizesSet: true,
    prizes: [{ distance: "full", kind: "place", gender: "女", placeN: 1, amount: 800, tax: 0, stack: false, source: "规程修订" }]
  });
  assert.equal(priced.status, 200);
  const replaced = await request(app).get("/marathon/api/admin/bot-races/" + id).set(admin);
  assert.equal(replaced.body.prizes[0].amount, 800);
  assert.equal(replaced.body.prizes[0].gender, "女");
  assert.equal(replaced.body.draws.length, 1);
  assert.equal(replaced.body.name, "上报名字已改");
  const missing = await request(app).put("/marathon/api/admin/bot-races/999999").set(admin).send({ name: "没有" });
  assert.equal(missing.status, 404);
  const published = await request(app).post("/marathon/api/admin/bot-races/" + id + "/publish").set(admin).send({});
  assert.equal(published.status, 200);
  const race = await request(app).get("/marathon/api/races/" + published.body.raceId);
  assert.equal(race.body.race.name, "上报名字已改");
  assert.equal(race.body.race.city, "宁波");
  assert.equal(race.body.race.kind, "road");
  assert.deepEqual(race.body.race.distances, ["full"]);
  assert.deepEqual(race.body.race.groups, ["50公里"]);
  const prizeRows = await request(app).get("/marathon/api/admin/races/" + published.body.raceId + "/prizes").set(admin);
  assert.equal(prizeRows.body.prizes[0].amount, 800);
  const drawRows = await request(app).get("/marathon/api/admin/races/" + published.body.raceId + "/draws").set(admin);
  assert.equal(drawRows.body.rates[0].label, "2025");
  const locked = await request(app).put("/marathon/api/admin/bot-races/" + id).set(admin).send({ city: "温州" });
  assert.equal(locked.status, 400);
  assert.match(locked.body.error, /已经发布/);

  const returnedUpload = await request(app).post("/marathon/api/bot/races").set(bot).send({
    races: [{
      officialId: "edit-bot-2",
      name: "打回后还要改",
      raceDate: "2026-12-21",
      province: "浙江",
      city: "杭州",
      distances: ["half"],
      source: "最酷，2026-10-22"
    }]
  });
  const returnedId = returnedUpload.body.accepted[0].id;
  const sentBack = await request(app).post("/marathon/api/admin/bot-races/" + returnedId + "/return").set(admin).send({ note: "城市不对" });
  assert.equal(sentBack.status, 200);
  const fixed = await request(app).put("/marathon/api/admin/bot-races/" + returnedId).set(admin).send({ city: "温州" });
  assert.equal(fixed.status, 200);
  assert.equal(fixed.body.status, "returned");
  const returned = await request(app).get("/marathon/api/admin/bot-races/" + returnedId).set(admin);
  assert.equal(returned.body.city, "温州");
  assert.equal(returned.body.note, "城市不对");
  assert.equal(returned.body.status, "returned");
});
