const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { app } = require("../src/index");
const { RACES, presentRace, reminderHits } = require("../src/races");

async function session(nickname) {
  const res = await request(app).post("/marathon/api/session").send({ nickname });
  assert.equal(res.status, 200);
  return res.body.token;
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
  const created = await request(app).post("/marathon/api/clubs").set("Authorization", "Bearer " + leader).send({ name: "滨河跑团" });
  assert.equal(created.status, 200);
  const code = created.body.club.code;
  const joined = await request(app).post("/marathon/api/clubs/join").set("Authorization", "Bearer " + mate).send({ code });
  assert.equal(joined.status, 200);

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

test("a club card names who has not paid", async () => {
  const leader = await session("团长");
  const mate = await session("队友");
  const created = await request(app).post("/marathon/api/clubs").set("Authorization", "Bearer " + leader).send({ name: "滨河跑团" });
  const code = created.body.club.code;
  await request(app).post("/marathon/api/clubs/join").set("Authorization", "Bearer " + mate).send({ code });
  await request(app).put("/marathon/api/me/races/bishan").set("Authorization", "Bearer " + leader).send({ status: "已缴费" });
  await request(app).put("/marathon/api/me/races/bishan").set("Authorization", "Bearer " + mate).send({ status: "中签" });

  const card = await request(app).get("/marathon/api/races/bishan/card?code=" + code);
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
