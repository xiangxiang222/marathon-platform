const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "marathon-score-helper-"));
process.env.MARATHON_DB = path.join(temporary, "app.sqlite");
process.env.MARATHON_MEDIA = path.join(temporary, "media");
process.env.BASE_PATH = "/marathon";
process.env.NODE_ENV = "test";
const request = require("../../server/node_modules/supertest");
const { app } = require("../../server/src/index");
const { getDb } = require("../../server/src/db");
const { normalizeTable } = require("./reader.js");
const API = "/marathon/api/me/race-history";

test.after(() => { getDb().close(); fs.rmSync(temporary, { recursive: true, force: true }); });

test("visible-table export enters real private-history preview and requires correction before saving", async () => {
  const session = await request(app).post("/marathon/api/session").send({ nickname: "成绩辅助导入合成测试" });
  assert.equal(session.status, 200);
  const auth = { Authorization: "Bearer " + session.body.token };
  const parsed = normalizeTable({
    headers: ["赛事名称", "比赛日期", "项目", "净成绩", "枪声成绩", "号码布", "姓名", "证件号"],
    rows: [["合成测试马拉松", "2025-10-26", "半马", "01:42:30", "01:44:00", "A100", "合成跑者", "110101199001011234"]]
  });
  const text = JSON.stringify({ format: "race-history", version: 1, source: { domain: "www.runchina.org.cn", verified: false }, entries: parsed.entries });
  assert.ok(!text.includes("110101199001011234"));
  assert.ok(!text.includes("合成跑者"));
  const preview = await request(app).post(API + "/import/preview").set(auth).send({ text });
  assert.equal(preview.status, 200);
  const candidate = preview.body.candidates[0];
  assert.equal(candidate.distance, "half");
  assert.equal(candidate.netTime, "01:42:30");
  assert.equal(candidate.gunTime, "01:44:00");
  for (const field of ["kind", "meet", "status"]) assert.equal(candidate[field], "待确认");
  assert.match(candidate.source.label, /待本人确认/);
  assert.equal((await request(app).get(API).set(auth)).body.entries.length, 0);
  assert.equal((await request(app).post(API + "/import/confirm").set(auth).send({ candidates: [candidate] })).status, 400);

  const corrected = { ...candidate, kind: "road", meet: "offline", status: "finished" };
  const confirmed = await request(app).post(API + "/import/confirm").set(auth).send({ candidates: [corrected] });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.created, 1);
  assert.equal(confirmed.body.entries[0].netSeconds, 6150);
  assert.equal(confirmed.body.entries[0].gunSeconds, 6240);
  assert.match(confirmed.body.entries[0].source.label, /导入后本人确认/);
  const repeat = await request(app).post(API + "/import/confirm").set(auth).send({ candidates: [corrected] });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.created, 0);
  assert.equal(repeat.body.skipped, 1);
});

test("missing full date/project and conflicting clocks cannot become valid private history", async () => {
  const session = await request(app).post("/marathon/api/session").send({ nickname: "成绩辅助缺失字段合成测试" });
  assert.equal(session.status, 200);
  const auth = { Authorization: "Bearer " + session.body.token };
  const fixtures = [
    { headers: ["赛事名称", "日期", "成绩"], rows: [["赛事名含马拉松不能定项目", "2025", "03:12:45"]] },
    { headers: ["赛事名称", "日期", "项目", "净成绩", "枪声成绩"], rows: [["净枪冲突合成测试", "2025-10-26", "全马", "03:15:00", "03:10:00"]] }
  ];
  for (const fixture of fixtures) {
    const parsed = normalizeTable(fixture);
    const entries = parsed.entries.map(entry => ({ ...entry, kind: "road", meet: "offline", status: "finished" }));
    const preview = await request(app).post(API + "/import/preview").set(auth).send({ text: JSON.stringify({ entries }) });
    assert.equal(preview.status, 200);
    assert.ok(preview.body.candidates[0].issues.length > 0);
    const response = await request(app).post(API + "/import/confirm").set(auth).send({ candidates: entries });
    assert.equal(response.status, 400);
  }
  assert.equal((await request(app).get(API).set(auth)).body.entries.length, 0);
});
