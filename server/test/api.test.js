const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const { syncOfficial, listOfficial } = require("../src/official");
const { RACES, presentRace, reminderHits, nearbyOpen } = require("../src/races");

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

  const created = await request(app).post("/marathon/api/clubs").set(auth).send({ name: "改报跑团" });
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

  const created = await request(app).post("/marathon/api/clubs").set(auth).send({ name: "中签跑团" });
  await request(app).post("/marathon/api/clubs/join").set("Authorization", "Bearer " + mate).send({ code: created.body.club.code });
  await request(app).put("/marathon/api/me/races/tmsk").set("Authorization", "Bearer " + mate).send({ status: "已缴费" });
  const card = await request(app).get("/marathon/api/races/tmsk/card?code=" + created.body.club.code);
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
  const created = await request(app).post("/marathon/api/clubs").set(fastAuth).send({ name: "成绩跑团" });
  const code = created.body.club.code;
  await request(app).post("/marathon/api/clubs/join").set(slowAuth).send({ code });
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
  const created = await request(app).post("/marathon/api/clubs").set(auth).send({ name: "签到跑团" });
  const clubId = created.body.club.id;
  await request(app).post("/marathon/api/clubs/join").set("Authorization", "Bearer " + mate).send({ code: created.body.club.code });

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
