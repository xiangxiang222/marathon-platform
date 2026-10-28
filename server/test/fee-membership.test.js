const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");

async function session(nickname) {
  const response = await request(app).post("/marathon/api/session").send({ nickname });
  assert.equal(response.status, 200);
  return { token: response.body.token, userId: response.body.user.id };
}

function auth(token) {
  return { Authorization: "Bearer " + token };
}

function feePeople(period) {
  return period.groups.flatMap((group) => group.people.map((person) => ({ ...person, status: group.status })));
}

async function applyAndApprove(clubId, token) {
  const applied = await request(app).post("/marathon/api/clubs/join").set(auth(token)).send({ clubId });
  assert.equal(applied.status, 200);
  assert.equal(applied.body.pending, true);
  const db = getDb();
  const pending = db.prepare("SELECT id FROM club_requests WHERE club_id = ? AND user_id = ? AND status = 'pending'").get(clubId, Number(db.prepare("SELECT id FROM users WHERE token = ?").get(token).id));
  assert.ok(pending);
  const club = db.prepare("SELECT owner_id FROM clubs WHERE id = ?").get(clubId);
  const ownerToken = db.prepare("SELECT token FROM users WHERE id = ?").get(club.owner_id).token;
  const decided = await request(app).post("/marathon/api/clubs/" + clubId + "/requests/" + pending.id).set(auth(ownerToken)).send({ decision: "approve" });
  assert.equal(decided.status, 200);
}

test("open dues roster excludes departed users while closed history preserves marked records", async () => {
  const db = getDb();
  const owner = await session("会费边界团长");
  const selfExit = await session("会费自行退出");
  const clubRemoved = await session("会费团内移出");
  const adminRemoved = await session("会费后台移出");
  const noRecord = await session("无会费记录退出");
  const manager = await session("会费边界管理");
  const clubInfo = db
    .prepare("INSERT INTO clubs (name, code, owner_id, created_at) VALUES (?, ?, ?, ?)")
    .run("会费名单边界团", "FEE" + Date.now().toString(36).toUpperCase(), owner.userId, new Date().toISOString());
  const clubId = Number(clubInfo.lastInsertRowid);
  const insertMember = db.prepare("INSERT INTO club_members (club_id, user_id, joined_at, role) VALUES (?, ?, ?, ?)");
  for (const [user, role] of [[owner, "owner"], [selfExit, "member"], [clubRemoved, "member"], [adminRemoved, "member"], [noRecord, "member"], [manager, "manager"]]) {
    insertMember.run(clubId, user.userId, new Date().toISOString(), role);
  }
  const opened = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/fees")
    .set(auth(owner.token))
    .send({ name: "开放期", amount: 100, startsOn: "2026-01-01", endsOn: "2026-12-31" });
  assert.equal(opened.status, 200);
  const periodId = opened.body.period.id;
  assert.equal(opened.body.period.mine.label, "未交");
  const saveRecord = db.prepare("INSERT INTO fee_records (period_id, user_id, status, updated_at) VALUES (?, ?, ?, ?)");
  saveRecord.run(periodId, selfExit.userId, "paid", new Date().toISOString());
  saveRecord.run(periodId, clubRemoved.userId, "unpaid", new Date().toISOString());
  saveRecord.run(periodId, adminRemoved.userId, "paid", new Date().toISOString());

  assert.equal((await request(app).post("/marathon/api/clubs/" + clubId + "/leave").set(auth(selfExit.token))).status, 200);
  assert.equal((await request(app).delete("/marathon/api/clubs/" + clubId + "/members/" + clubRemoved.userId).set(auth(owner.token))).status, 200);
  const oldAdminToken = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = "fee-membership-test-admin";
  try {
    assert.equal((await request(app).delete("/marathon/api/admin/clubs/" + clubId + "/members/" + adminRemoved.userId).set(auth(process.env.ADMIN_TOKEN))).status, 200);
  } finally {
    if (oldAdminToken == null) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = oldAdminToken;
  }
  assert.equal((await request(app).post("/marathon/api/clubs/" + clubId + "/leave").set(auth(noRecord.token))).status, 200);

  let current = await request(app).get("/marathon/api/clubs/" + clubId + "/fees").set(auth(owner.token));
  assert.equal(current.status, 200);
  const activeNames = feePeople(current.body.current).map((person) => person.nickname);
  for (const departed of [selfExit, clubRemoved, adminRemoved, noRecord]) {
    assert.equal(activeNames.includes(db.prepare("SELECT nickname FROM users WHERE id = ?").get(departed.userId).nickname), false, departed.nickname);
    assert.equal(db.prepare("SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?").get(clubId, departed.userId), undefined);
  }
  for (const departed of [selfExit, clubRemoved, adminRemoved]) {
    assert.equal(db.prepare("SELECT 1 FROM fee_records WHERE period_id = ? AND user_id = ?").get(periodId, departed.userId) != null, true);
    assert.equal(db.prepare("SELECT departed FROM fee_records WHERE period_id = ? AND user_id = ?").get(periodId, departed.userId).departed, 1);
  }
  assert.doesNotMatch(current.body.current.copyText, /会费自行退出|会费团内移出|会费后台移出|无会费记录退出/);

  await applyAndApprove(clubId, selfExit.token);
  current = await request(app).get("/marathon/api/clubs/" + clubId + "/fees").set(auth(owner.token));
  const rejoined = feePeople(current.body.current).find((person) => person.userId === selfExit.userId);
  assert.equal(rejoined.status, "paid");
  assert.equal(rejoined.departed, false);
  assert.equal(db.prepare("SELECT departed FROM fee_records WHERE period_id = ? AND user_id = ?").get(periodId, selfExit.userId).departed, 0);

  await request(app).post("/marathon/api/clubs/" + clubId + "/leave").set(auth(selfExit.token));
  const nextPeriod = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/fees")
    .set(auth(owner.token))
    .send({ name: "新一期", amount: 100, startsOn: "2027-01-01", endsOn: "2027-12-31" });
  assert.equal(nextPeriod.status, 200);

  const closed = await request(app).get("/marathon/api/clubs/" + clubId + "/fees/" + periodId).set(auth(owner.token));
  assert.equal(closed.status, 200);
  const historyPeople = feePeople(closed.body.period);
  assert.equal(closed.body.period.open, false);
  const rejectedHistoryEdit = await request(app)
    .post("/marathon/api/clubs/" + clubId + "/fees/" + periodId + "/records")
    .set(auth(owner.token))
    .send({ userId: owner.userId, status: "paid" });
  assert.equal(rejectedHistoryEdit.status, 400);
  assert.match(rejectedHistoryEdit.body.error, /已经结束/);
  assert.equal(db.prepare("SELECT status FROM fee_records WHERE period_id = ? AND user_id = ?").get(periodId, owner.userId).status, "unpaid");
  const historical = [selfExit, clubRemoved, adminRemoved].map((user) => historyPeople.find((person) => person.userId === user.userId));
  assert.deepEqual(historical.map((person) => [person.status, person.departed]), [["paid", true], ["unpaid", true], ["paid", true]]);
  assert.deepEqual(
    [db.prepare("SELECT departed FROM fee_records WHERE period_id = ? AND user_id = ?").get(periodId, selfExit.userId).departed,
      db.prepare("SELECT departed FROM fee_records WHERE period_id = ? AND user_id = ?").get(periodId, owner.userId).departed],
    [1, 0]
  );
  assert.deepEqual(
    [historyPeople.find((person) => person.userId === noRecord.userId).status, historyPeople.find((person) => person.userId === noRecord.userId).departed],
    ["unpaid", true]
  );
  for (const presentAtClose of [owner, manager]) {
    const person = historyPeople.find((row) => row.userId === presentAtClose.userId);
    assert.deepEqual([person.status, person.departed], ["unpaid", false]);
    assert.ok(db.prepare("SELECT 1 FROM fee_records WHERE period_id = ? AND user_id = ? AND status = 'unpaid'").get(periodId, presentAtClose.userId));
  }
  const lateJoiner = await session("新加入跑友");
  await applyAndApprove(clubId, lateJoiner.token);
  const lateHistory = await request(app).get("/marathon/api/clubs/" + clubId + "/fees/" + periodId).set(auth(lateJoiner.token));
  assert.equal(lateHistory.body.period.mine.label, "未列入本期");
  assert.equal(feePeople(lateHistory.body.period).some((person) => person.userId === lateJoiner.userId), false);
  for (const name of ["会费自行退出（已离团）", "会费团内移出（已离团）", "会费后台移出（已离团）"]) {
    assert.match(closed.body.period.copyText, new RegExp(name));
  }
  await applyAndApprove(clubId, selfExit.token);
  const rejoinedHistory = await request(app).get("/marathon/api/clubs/" + clubId + "/fees/" + periodId).set(auth(selfExit.token));
  const rejoinedHistoryPerson = feePeople(rejoinedHistory.body.period).find((person) => person.userId === selfExit.userId);
  assert.deepEqual([rejoinedHistoryPerson.status, rejoinedHistoryPerson.departed], ["paid", true]);
  assert.match(rejoinedHistory.body.period.copyText, /会费自行退出（已离团）/);
});
