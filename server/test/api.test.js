const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { app } = require("../src/index");

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
  assert.ok(all.body.races.some((r) => r.id === "closed-sample" && r.regStatus === "已截止"));
  const future = all.body.races.find((r) => r.id === "huangyaguan");
  assert.equal(future.open, true);
  assert.match(future.deadlineLabel, /天后截止/);
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
