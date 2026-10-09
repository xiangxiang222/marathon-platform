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
  const created = await request(app).post("/marathon/api/clubs").set("Authorization", "Bearer " + leader).send({ name: "凑队跑团" });
  assert.equal(created.status, 200);
  const code = created.body.club.code;
  await request(app).post("/marathon/api/clubs/join").set("Authorization", "Bearer " + mate).send({ code });

  await request(app).put("/marathon/api/me/races/jinjiang").set("Authorization", "Bearer " + leader).send({ status: "已报名" });
  const alone = await request(app).get("/marathon/api/races/jinjiang/card?code=" + code);
  assert.equal(alone.body.squad.ready, false);
  assert.equal(alone.body.squad.size, 1);
  assert.equal(alone.body.squad.text, "还差一个人就能凑一队");
  assert.equal(/可以一起去/.test(alone.body.text), false);

  await request(app).put("/marathon/api/me/races/jinjiang").set("Authorization", "Bearer " + mate).send({ status: "已缴费" });
  const card = await request(app).get("/marathon/api/races/jinjiang/card?code=" + code);
  assert.equal(card.body.squad.ready, true);
  assert.equal(card.body.squad.size, 2);
  assert.match(card.body.text, /可以一起去：凑队团长、凑队队友|可以一起去：凑队队友、凑队团长/);

  const missed = await request(app).put("/marathon/api/me/races/hailing").set("Authorization", "Bearer " + leader).send({ status: "未中签" });
  assert.equal(missed.status, 200);
  await request(app).put("/marathon/api/me/races/hailing").set("Authorization", "Bearer " + mate).send({ status: "想跑" });
  const out = await request(app).get("/marathon/api/races/hailing/card?code=" + code);
  assert.equal(out.body.squad.ready, false);
  assert.equal(out.body.squad.size, 0);
  assert.equal(out.body.squad.text, "1 人想跑，还没人报名");

  const board = await request(app).get("/marathon/api/clubs/" + created.body.club.id).set("Authorization", "Bearer " + leader);
  const jinjiang = board.body.board.find((item) => item.race.id === "jinjiang");
  assert.equal(jinjiang.squad.ready, true);
  assert.match(jinjiang.text, /可以一起去/);
});
