const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const { seedRadarDemo } = require("../../scripts/seed-radar-demo.cjs");

function auth(token) { return { Authorization: "Bearer " + token }; }

test("radar compares a target with simulated historical top eight and keeps current entrants separate", async () => {
  const db = getDb();
  seedRadarDemo(db, { today: "2026-11-14" });
  const session = await request(app).post("/marathon/api/session").send({ nickname: "雷达目标测试" });
  assert.equal(session.status, 200);
  const token = session.body.token;
  const saved = await request(app).put("/marathon/api/me/radar").set(auth(token)).send({ gender: "男", targets: { full: "2:20:00" } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const result = await request(app).get("/marathon/api/radar").set(auth(token));
  assert.equal(result.status, 200);
  assert.equal(result.body.version, 2);
  const row = result.body.opportunities.find(item => item.id === "radar-demo-lakeside:full-men");
  assert.ok(row);
  assert.equal(row.demo, true);
  assert.equal(row.ability.scenario, true);
  assert.equal(row.history.complete, true);
  assert.equal(row.history.sampleCount, 3);
  assert.equal(row.competition.knownCount, 1);
  assert.equal(row.competition.fasterCount, 1);
  assert.match(row.reason, /自报 PB 更快|历史/);
  assert.equal(result.body.opportunities.some(item => item.gender === "女"), false);
});

test("radar admin rejects invalid history and updates an independently editable live config", async () => {
  process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin";
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO races(id,name,city,province,distances,race_date,deadline,place,kinds,meet) VALUES(?,?,?,?,?,?,'','','road','offline')")
    .run("radar-live-test", "雷达真实资料测试赛", "测试市", "测试省", "full", "2027-06-01");
  const admin = auth(process.env.ADMIN_TOKEN);
  const bad = await request(app).put("/marathon/api/admin/races/radar-live-test/radar").set(admin).send({ config: {
    demo: false, groups: [{ id: "men", distance: "full", gender: "男", timing: "gun", awardDepth: 3, eligibility: "男女总排名", ruleSource: "规程", awards: [], histories: [{ year: 2026, source: "公告", timing: "gun", rows: [{ place: 1, name: "甲", clock: "2:20:00" }, { place: 2, name: "乙", clock: "2:19:00" }] }], entrants: [] }]
  }});
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /由快到慢/);
  const config = { demo: false, groups: [{ id: "men", distance: "full", gender: "男", timing: "gun", awardDepth: 3, eligibility: "男女总排名，前 3 名", ruleSource: "2026 竞赛规程", awards: [{ place: 1, amount: 3000 }, { place: 2, amount: 2000 }, { place: 3, amount: 1000 }], histories: [{ year: 2026, source: "2026 官方成绩公告", timing: "gun", rows: [1, 2, 3, 4, 5, 6, 7, 8].map((place) => ({ place, name: "选手" + place, clock: "2:" + String(10 + place).padStart(2, "0") + ":00" })) }], entrants: [{ id: "strong-a", name: "选手 A", clock: "2:08:00", pbDate: "2026-04-01", status: "中签", evidence: "verified", source: "官方名单" }] }] };
  const saved = await request(app).put("/marathon/api/admin/races/radar-live-test/radar").set(admin).send({ config });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const read = await request(app).get("/marathon/api/admin/races/radar-live-test/radar").set(admin);
  assert.equal(read.status, 200);
  assert.equal(read.body.config.groups[0].awardDepth, 3);
  const user = await request(app).post("/marathon/api/session").send({ nickname: "雷达参赛线索测试" });
  const token = user.body.token;
  const entry = await request(app).put("/marathon/api/me/radar/entries/radar-live-test").set(auth(token)).send({ distance: "full", gender: "男", clock: "2:09:00", pbDate: "2026-05-01", status: "中签", consent: true });
  assert.equal(entry.status, 200, JSON.stringify(entry.body));
  const radar = await request(app).put("/marathon/api/me/radar").set(auth(token)).send({ gender: "男", targets: { full: "2:09:00" } });
  assert.equal(radar.status, 200);
  const current = await request(app).get("/marathon/api/radar").set(auth(token));
  const opportunity = current.body.opportunities.find(item => item.id === "radar-live-test:men");
  assert.equal(opportunity.competition.knownCount, 1);
  assert.equal(opportunity.competition.verifiedFasterCount, 1);
  assert.equal(opportunity.myEntry.status, "中签");
  assert.equal(opportunity.competition.entrants.some(item => item.user_id !== undefined), false);
  const viewer = await request(app).post("/marathon/api/session").send({ nickname: "雷达另一位测试跑者" });
  await request(app).put("/marathon/api/me/radar").set(auth(viewer.body.token)).send({ gender: "男", targets: { full: "2:15:00" } });
  const viewed = await request(app).get("/marathon/api/radar").set(auth(viewer.body.token));
  const visibleRow = viewed.body.opportunities.find(item => item.id === "radar-live-test:men");
  assert.equal(visibleRow.competition.knownCount, 2);
  assert.equal(visibleRow.competition.entrants.find(item => item.anonymous).name, "已中签跑者");
  assert.equal(JSON.stringify(visibleRow.competition).includes("雷达参赛线索测试"), false);
  assert.equal(visibleRow.history.clock, "2:13:00");
  assert.equal(visibleRow.history.eighthClock, "2:18:00");
  assert.equal(visibleRow.awardDepth, 3);
  await request(app).put("/marathon/api/me/races/radar-live-test").set(auth(token)).send({ status: "弃赛" });
  const withdrawnPlan = await request(app).get("/marathon/api/radar").set(auth(viewer.body.token));
  assert.equal(withdrawnPlan.body.opportunities.find(item => item.id === "radar-live-test:men").competition.knownCount, 1);
  assert.equal((await request(app).delete("/marathon/api/me/radar/entries/radar-live-test").set(auth(token))).status, 200);
  const after = await request(app).get("/marathon/api/radar").set(auth(token));
  assert.equal(after.body.opportunities.find(item => item.id === "radar-live-test:men").competition.knownCount, 1);
});

test("incomplete awards, unknown timing and consent never produce a fabricated recommendation", async () => {
  const { validateRadarConfig, saveRadarConfig, buildRadar } = require("../src/radar-engine");
  const db = getDb();
  const row = db.prepare("INSERT INTO users(nickname,token,created_at) VALUES('无口径测试','timing-test',?)").run(new Date().toISOString());
  const user = { id: Number(row.lastInsertRowid) };
  const config = { demo: false, groups: [{ id: "half-women", distance: "half", gender: "女", timing: "gun", awardDepth: 8, ruleSource: "测试规程", eligibility: "", awards: [], histories: [{ year: 2025, source: "测试榜单", timing: "net", rows: [{ place: 1, name: "测试选手", clock: "1:10:00" }] }], entrants: [] }] };
  db.prepare("INSERT OR REPLACE INTO races(id,name,city,province,distances,race_date,deadline,place,kinds,meet) VALUES('radar-empty-test','缺项测试','测试','测试','half','2027-06-01','','','road','offline')").run();
  saveRadarConfig(db, "radar-empty-test", validateRadarConfig(config, { raceDate: "2027-06-01" }));
  const result = buildRadar(db, user, { gender: "女", targets: { half: "1:05:00" } }, { today: "2026-11-14" });
  const opportunity = result.opportunities.find(item => item.race.id === "radar-empty-test");
  assert.equal(opportunity.level, "unknown");
  assert.equal(opportunity.gap, null);
  assert.equal(opportunity.history.clock, "");
  assert.match(opportunity.reason, /不同计时|缺少/);
  const noGender = buildRadar(db, user, { gender: "", targets: {} }, { today: "2026-11-14" });
  assert.equal(noGender.opportunities.find(item => item.race.id === "radar-empty-test").competition.fasterCount, null);
  const refused = await request(app).put("/marathon/api/me/radar/entries/radar-empty-test").set(auth("timing-test")).send({ distance: "half", gender: "女", clock: "1:05:00", pbDate: "2026-04-01", status: "中签", consent: false });
  assert.equal(refused.status, 400);
  db.prepare("DELETE FROM races WHERE id='radar-empty-test'").run();
  assert.equal(db.prepare("SELECT count(*) n FROM radar_configs WHERE race_id='radar-empty-test'").get().n, 0);
});
