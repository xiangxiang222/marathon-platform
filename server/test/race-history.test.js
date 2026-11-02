const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const { historyRoot, normalizeEntry, decorateHistory, parseImportText } = require("../src/race-history");

const API = "/marathon/api/me/race-history";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cX1kAAAAASUVORK5CYII=", "base64");
async function user(name) {
  const answer = await request(app).post("/marathon/api/session").send({ nickname: name });
  assert.equal(answer.status, 200);
  return { id: answer.body.user.id, token: answer.body.token, auth: { Authorization: "Bearer " + answer.body.token } };
}
function fixture(name, date = "2025-10-26", extra = {}) { return { name, raceDate: date, city: "天津", province: "天津", distance: "full", kind: "road", meet: "offline", status: "finished", timing: "net", netTime: "03:52:42", ...extra }; }
async function create(owner, data) {
  const response = await request(app).post(API).set(owner.auth).send(data);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.entry;
}
const entryUrl = (entry) => API + "/" + encodeURIComponent(entry.id);

test("private history supports unmatched historic races, unfinished memories and account isolation", async () => {
  const owner = await user("私密跑史甲"), other = await user("私密跑史乙");
  assert.equal((await request(app).get(API)).status, 401);
  const oldRaceCount = getDb().prepare("SELECT COUNT(*) AS n FROM races").get().n;
  const entry = await create(owner, fixture("不在公共库的旧比赛", "2023-05-01", { status: "dnf", timing: "unknown", netTime: "", story: "认真作出停下的选择", tags: ["归来"] }));
  assert.equal(entry.seconds, null);
  assert.equal(entry.status, "dnf");
  assert.equal(entry.raceId, "");
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM races").get().n, oldRaceCount);
  const detail = await request(app).get(entryUrl(entry)).set(owner.auth);
  assert.equal(detail.status, 200);
  assert.match(detail.body.review.headline, /未完赛/);
  assert.match(detail.headers["cache-control"], /no-store/);
  assert.equal((await request(app).get(entryUrl(entry)).set(other.auth)).status, 404);
  assert.equal((await request(app).patch(entryUrl(entry)).set(other.auth).send({ story: "其他人" })).status, 404);
  assert.equal((await request(app).delete(entryUrl(entry)).set(other.auth)).status, 404);
  const list = await request(app).get(API).set(owner.auth);
  assert.equal(list.body.summary.finished, 0);
  assert.equal(list.body.summary.cityCount, 1);
  assert.equal(list.body.entries.length, 1);
  assert.equal((await request(app).get(API).set(other.auth)).body.entries.length, 0);
});

test("growth compares only confirmed matching clocks and explains the exact improvement", async () => {
  const owner = await user("跑史成长口径");
  const a = await create(owner, fixture("2025 天津马拉松"));
  await create(owner, fixture("线上比赛", "2025-11-01", { meet: "online", netTime: "01:00:00" }));
  await create(owner, fixture("越野比赛", "2025-12-01", { kind: "trail", netTime: "02:00:00" }));
  await create(owner, fixture("枪声比赛", "2026-01-01", { timing: "gun", gunTime: "03:00:00", netTime: "" }));
  await create(owner, fixture("口径未确认", "2026-02-01", { timing: "unknown", netTime: "", seconds: 7200 }));
  const b = await create(owner, fixture("2026 北京马拉松", "2026-10-18", { netTime: "03:12:45", city: "北京", province: "北京" }));
  assert.equal(b.isPb, true);
  assert.equal(b.improvementSeconds, 39 * 60 + 57);
  assert.equal(b.previousBest.entryId, a.id);
  const detail = await request(app).get(entryUrl(b)).set(owner.auth);
  assert.ok(detail.body.review.facts.some((fact) => /39 分 57 秒/.test(fact)));
  assert.ok(detail.body.review.missing.some((fact) => /分段/.test(fact)));
  const pb = (await request(app).get(API).set(owner.auth)).body.summary.pb;
  assert.deepEqual(new Set(pb.map((row) => row.timing)), new Set(["net", "gun"]));
  assert.equal(pb.find((row) => row.timing === "net").entryId, b.id);
});

test("free text requires an explicit correction for unsupported complete distance tokens", async () => {
  const owner = await user("完整距离项目核对");
  for (const distance of ["15公里", "25公里", "35公里", "50公里", "105公里", "15km", "50k", "0.5公里", "15.5公里", "121.0975公里", "142.195公里"]) {
    const text = `比赛名称：${distance}城市挑战赛\n日期：2025-03-01\n项目：${distance}\n净计时：01:15:00`;
    const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.candidates.length, 1);
    const candidate = preview.body.candidates[0];
    assert.equal(candidate.distance, "", distance);
    assert.ok(candidate.distanceText.includes(distance), JSON.stringify(candidate));
    assert.ok(candidate.issues.some((issue) => /请确认.*项目/.test(issue)), JSON.stringify(candidate));
    const uncorrected = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] });
    assert.equal(uncorrected.status, 400, distance);
  }
  assert.equal((await request(app).get(API).set(owner.auth)).body.entries.length, 0);
  const corrected = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [fixture("15公里城市挑战赛", "2025-03-01", { distance: "other", netTime: "01:15:00" })] });
  assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
  assert.equal(corrected.body.entries[0].distance, "other");
  assert.notEqual(corrected.body.entries[0].isPb, true);
});

test("conflicting text project choices stay unresolved even when a full marathon finish is also present", async () => {
  const owner = await user("半全冲突项目核对");
  const blocks = [
    "组别：半程/全程\n完赛项目：全程马拉松",
    "完赛项目：全程马拉松\n组别：全程/半程",
    "组别：半 程 / 全 程\n完赛项目：全 程 马 拉 松 42.195 公里",
    "比赛项目：5 公里 / 10 公里"
  ];
  for (const fields of blocks) {
    const text = `比赛名称：项目冲突证书\n比赛日期：2025-10-26\n${fields}\n净计时：03:12:45\n枪声成绩：03:15:20`;
    const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const candidate = preview.body.candidates[0];
    assert.equal(candidate.distance, "");
    assert.match(candidate.issues.join("；"), /多个比赛项目或距离.*请确认实际完赛项目/);
    assert.ok(candidate.distanceText.length > 0);
    assert.equal(candidate.netTime, "03:12:45");
    assert.equal(candidate.gunTime, "03:15:20");
    assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400);
  }
  assert.equal((await request(app).get(API).set(owner.auth)).body.entries.length, 0);
  const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称：项目冲突证书\n比赛日期：2025-10-26\n${blocks[0]}\n净计时：03:12:45` });
  const corrected = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...preview.body.candidates[0], distance: "full" }] });
  assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
  assert.equal(corrected.body.entries[0].distance, "full");
  assert.equal(corrected.body.entries[0].netSeconds, 11565);
});

test("comma and semicolon project continuations participate in conflicts instead of saving the first choice", async () => {
  const owner = await user("项目列表完整核对");
  const choices = [
    "完赛项目：半程，全程", "项目：5公里，10公里", "完赛项目：半程马拉松，全程",
    "完赛项目：半程,全程", "项目：5公里,10公里", "项目：全程；半程",
    "项目：全程;半程", "项目：半程,全程；10公里", "项目：全程、半程",
    "项目：半程，\n全程", "项目\n半程；全程", "项目：全程，15公里",
    "项目：半程马拉松，全程马拉松", "组别：男子，半程；全程"
  ];
  for (const fields of choices) {
    const text = `比赛名称：项目列表测试赛\n比赛日期：2025-10-26\n${fields}\n净计时：03:12:45\n枪声成绩：03:15:20`;
    const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const candidate = preview.body.candidates[0];
    assert.equal(candidate.distance, "", fields);
    assert.match(candidate.issues.join("；"), /多个比赛项目或距离.*请确认实际完赛项目/, fields);
    assert.equal(candidate.netTime, "03:12:45", fields);
    assert.equal(candidate.gunTime, "03:15:20", fields);
    assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400, fields);
  }
  const empty = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(empty.entries.length, 0);
  assert.deepEqual(empty.summary.pb, []);
  const parsed = parseImportText("比赛名称：项目列表测试赛\n比赛日期：2025-10-26\n完赛项目：半程，全程\n净计时：03:12:45")[0];
  const corrected = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...parsed, distance: "full" }] });
  assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
  assert.equal(corrected.body.entries[0].distance, "full");
});

test("project lists continue across line breaks and every short project remains visible until corrected", async () => {
  const owner = await user("跨行项目完整核对");
  const choices = [
    ["组别\n半程\n全程", "半程", "全程"],
    ["完赛项目\n全程\n半程", "全程", "半程"],
    ["比赛项目\n5 公里\n10 公里", "5 公里", "10 公里"],
    ["项目：半程、\n全程", "半程", "全程"],
    ["项目：全程\n半程", "全程", "半程"],
    ["项目：5公里\n10公里", "5公里", "10公里"],
    ["项目：10公里\n半程", "10公里", "半程"],
    ["组别：男子\n半程\n全程", "半程", "全程"],
    ["参赛距离：42.195公里\n10公里", "42.195公里", "10公里"],
    ["项目：全程\r\n半程", "全程", "半程"],
    ["项目\n全程\n15公里", "全程", "15公里"],
    ["全马\n半程", "全马", "半程"]
  ];
  for (const [fields, first, last] of choices) {
    const text = `比赛名称：跨行项目测试赛\n比赛日期：2025-10-26\n${fields}\n净计时：03:12:45\n枪声成绩：03:15:20`;
    const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const candidate = preview.body.candidates[0];
    assert.equal(candidate.distance, "", fields);
    assert.match(candidate.issues.join("；"), /多个比赛项目或距离.*请确认实际完赛项目/, fields);
    assert.ok(candidate.distanceText.includes(first), JSON.stringify(candidate));
    assert.ok(candidate.distanceText.includes(last.normalize("NFKC")), JSON.stringify(candidate));
    assert.equal(candidate.netTime, "03:12:45", fields);
    assert.equal(candidate.gunTime, "03:15:20", fields);
    assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400, fields);
  }
  const empty = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(empty.entries.length, 0);
  assert.deepEqual(empty.summary.pb, []);
  const candidate = parseImportText("比赛名称：跨行项目测试赛\n比赛日期：2025-10-26\n项目：半程、\n全程\n净计时：03:12:45")[0];
  const corrected = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, distance: "full" }] });
  assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
  assert.equal(corrected.body.entries[0].distance, "full");
  assert.equal(corrected.body.entries[0].netSeconds, 11565);
});

test("separated short project evidence stays visible and conflicts regardless of intervening metadata or notes", async () => {
  const owner = await user("隔行项目证据核对");
  const cases = [];
  for (const [first, last] of [["半程", "全程"], ["5公里", "10公里"], ["全马", "半程"]]) {
    for (const between of ["姓名：张三", "城市：北京", "号码布：A123", "祝贺顺利完赛", "后半程状态不错", "每5公里补给"]) {
      cases.push([`完赛项目：${first}\n${between}\n${last}`, first, last]);
    }
  }
  cases.push(["10公里\n城市：北京\n项目：5公里", "5公里", "10公里"]);
  cases.push(["项目：半程，姓名：张三；全程", "半程", "全程"]);
  cases.push(["项目：全马\n净计时：03:12:45\n15公里", "全马", "15公里"]);
  for (const [fields, first, last] of cases) {
    const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称：隔行项目测试赛\n比赛日期：2025-10-26\n${fields}\n净计时：03:12:45` });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const candidate = preview.body.candidates[0];
    assert.equal(candidate.distance, "", fields);
    assert.match(candidate.issues.join("；"), /多个比赛项目或距离.*请确认实际完赛项目/, fields);
    for (const value of [first, last]) assert.ok(candidate.distanceText.includes(value), JSON.stringify(candidate));
    assert.equal(candidate.netTime, "03:12:45", fields);
    assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400, fields);
  }
  const history = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(history.entries.length, 0);
  assert.deepEqual(history.summary.pb, []);
});

test("project headings with neutral groups are evidence while times and descriptions remain excluded", async () => {
  const owner = await user("项目标题与组别核对");
  for (const [fields, last] of [
    ["项目：半程\n全程：男子", "全程：男子"],
    ["项目：5公里\n10公里：公开组", "10公里：公开组"],
    ["全程:女子组\n姓名：张三\n项目：半程", "全程:女子组"],
    ["项目：全马\n半程：45-49岁男子组", "半程：45-49岁男子组"]
  ]) {
    const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称：项目标题测试赛\n日期：2025-10-26\n${fields}\n净计时：03:12:45` })).body.candidates[0];
    assert.equal(candidate.distance, "", fields);
    assert.match(candidate.issues.join("；"), /多个比赛项目或距离/, fields);
    assert.ok(candidate.distanceText.includes(last.normalize("NFKC")), JSON.stringify(candidate));
    assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400, fields);
  }
  for (const [fields, distance] of [["全程：男子", "full"], ["10公里：公开组", "10k"], ["半程：女子组", "half"], ["项目：全马\n5公里：00:25:10\n10公里用时：00:50:00\n半程：补给点", "full"]]) {
    const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称：项目标题正例\n日期：2025-10-26\n${fields}\n净计时：03:12:45` })).body.candidates[0];
    assert.equal(candidate.distance, distance, fields);
    assert.deepEqual(candidate.issues, [], fields);
  }
  const history = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(history.entries.length, 0);
  assert.deepEqual(history.summary.pb, []);
});

test("project headings retain unfamiliar group names and open-ended ages without silently selecting the first project", async () => {
  const owner = await user("开放组别项目核对");
  const cases = [
    ...["精英组", "家庭组", "公开男子组", "40岁以上", "男子40岁以上", "18-39岁", "40-59岁", "追风跑者组", "女子40岁及以上组", "40周岁以下", "男子18至39岁组", "精英选手"].map((group) => ["半程", `全程：${group}`]),
    ["全马", "半程：大众组"], ["5公里", "10公里：青年组"],
    ["全马", "全程：半程组"], ["全马", "全程：15公里组"]
  ];
  for (const [first, heading] of cases) {
    for (const fields of [`项目：${first}\n${heading}`, `${heading}\n姓名：张三\n项目：${first}`]) {
      const text = `比赛名称：开放组别测试赛\n日期：2025-10-26\n${fields}\n净计时：03:12:45`;
      const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text })).body.candidates[0];
      assert.equal(candidate.distance, "", fields);
      assert.match(candidate.issues.join("；"), /多个比赛项目或距离/, fields);
      assert.ok(candidate.distanceText.includes(first), JSON.stringify(candidate));
      assert.ok(candidate.distanceText.includes(heading.normalize("NFKC")), JSON.stringify(candidate));
      assert.equal(candidate.netTime, "03:12:45", fields);
      assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400, fields);
    }
  }
  const empty = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(empty.entries.length, 0);
  assert.deepEqual(empty.summary.pb, []);
  for (const group of ["精英组", "家庭组", "公开男子组", "40岁以上", "男子40岁以上", "追风跑者组", "女子40岁及以上组", "40周岁以下"]) {
    const candidate = parseImportText(`比赛名称：组别标题正例\n日期：2025-10-26\n全程：${group}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "full", group);
    assert.deepEqual(candidate.parseIssues, [], group);
  }
  const unknown = parseImportText("比赛名称：未知类别标题\n日期：2025-10-26\n10公里：精英选手\n净计时：03:12:45")[0];
  assert.equal(unknown.distance, "");
  assert.ok(unknown.distanceText.includes("10公里:精英选手"));
  assert.match(unknown.parseIssues.join("；"), /请确认比赛项目/);
  for (const note of ["5公里：00:25:10", "半程：补给点", "10公里：用时00:50:00", "半程：配速稳定", "5公里：饮水站", "半程：通过时间01:40:00"]) {
    const candidate = parseImportText(`比赛名称：组别标题过滤\n日期：2025-10-26\n项目：全马\n${note}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "full", note);
    assert.deepEqual(candidate.parseIssues, [], note);
  }
});

test("parenthesized project categories use the same evidence rules as colon headings and retain every conflicting project", async () => {
  const owner = await user("括号组别项目核对");
  const cases = [
    "完赛项目：半程\n全程（精英组）",
    "项目：半程\n全程马拉松（大众组）",
    "项目：半程\n全程 （大众组）",
    "项目：全程（精英组）\n完赛项目：半程",
    "全程（精英组）\n半程（大众组）",
    "全程（精英组）、半程（大众组）",
    "项目：全程（精英组）、半程",
    "项目：半程\n全程（精英组，40岁以上）",
    "项目：半程\n全程（精英组）、5公里（水站组）",
    "项目\n全程（精英组）\n姓名：张三\n半程（青年组）",
    "项目：5公里（青年组）\n10公里（公开组）",
    "半程(40岁以上)\n全程(男子40岁以上)",
    "全程（追风跑者组）\n项目：半程",
    "项目：半程\n全程（精英选手）",
    "项目：全马\n全程（半程组）",
    "项目：全马\n全程（15公里组）"
  ];
  for (const fields of cases) {
    const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称：括号组别测试赛\n日期：2025-10-26\n${fields}\n净计时：03:12:45` })).body.candidates[0];
    assert.equal(candidate.distance, "", fields);
    assert.match(candidate.issues.join("；"), /多个比赛项目或距离/, fields);
    for (const line of fields.split("\n").filter((line) => /[（(]/.test(line))) {
      const value = line.replace(/^项目[:：]/, "").normalize("NFKC").replace(/\s+/g, "");
      assert.ok(candidate.distanceText.replace(/\s+/g, "").includes(value), JSON.stringify(candidate));
    }
    assert.equal(candidate.netTime, "03:12:45", fields);
    assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400, fields);
  }
  const empty = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(empty.entries.length, 0);
  assert.deepEqual(empty.summary.pb, []);
  for (const [field, expected] of [
    ["全程（精英组）", "full"], ["全程马拉松（大众组）", "full"],
    ["项目：全程 （大众组）", "full"], ["项目：5公里（青年组）", "5k"],
    ["10公里（公开组）", "10k"], ["半程（男子40岁以上）", "half"],
    ["全程马拉松（42.195公里）", "full"], ["全程（精英组）（40岁以上）", "full"],
    ["全程马拉松（42.195公里）（精英组）", "full"],
    ["全程（精英组，40岁以上）", "full"],
    ["全程马拉松（42.195公里，精英组）", "full"],
    ["全程（精英组）、5公里（水站组）", "full"],
    ["项目：全程（精英组）/5公里（水站组）", "full"],
    ["项目：全马\n全程（精英组）", "full"]
  ]) {
    const candidate = parseImportText(`比赛名称：括号组别正例\n日期：2025-10-26\n${field}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, expected, field);
    assert.deepEqual(candidate.parseIssues, [], field);
  }
});

test("all supported annotation brackets preserve projects and their original review text", async () => {
  const owner = await user("多形括号项目核对");
  for (const [open, close] of [["【", "】"], ["[", "]"], ["「", "」"], ["『", "』"], ["〔", "〕"], ["{", "}"]]) {
    const full = `全程${open}精英组${close}`, half = `半程${open}大众组${close}`;
    for (const fields of [`完赛项目：半程\n${full}`, `完赛项目：${full}\n项目：半程`, `${full}\n${half}`, `项目：${full}、${half}`, `项目：5公里${open}青年组${close}\n10公里${open}公开组${close}`]) {
      const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称：多形括号测试赛\n日期：2025-10-26\n${fields}\n净计时：03:12:45` })).body.candidates[0];
      assert.equal(candidate.distance, "", fields);
      assert.match(candidate.issues.join("；"), /多个比赛项目或距离/, fields);
      for (const line of fields.split(/\n|、/).filter((line) => line.includes(open))) {
        const expected = line.replace(/^(?:完赛项目|项目)[:：]/, "").normalize("NFKC");
        assert.ok(candidate.distanceText.includes(expected), JSON.stringify(candidate));
      }
      assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400, fields);
    }
    const single = parseImportText(`比赛名称：多形括号正例\n日期：2025-10-26\n${full}\n净计时：03:12:45`)[0];
    assert.equal(single.distance, "full", full);
    for (const category of ["00:25:10", "计时组", "补给组", "水站组", "配速组"]) {
      const note = `5公里${open}${category}${close}`;
      const alone = parseImportText(`比赛名称：多形辅助说明\n日期：2025-10-26\n${note}\n净计时：03:12:45`)[0];
      assert.equal(alone.distance, "", note);
      const explicit = parseImportText(`比赛名称：多形辅助过滤\n日期：2025-10-26\n项目：全马\n${note}\n净计时：03:12:45`)[0];
      assert.equal(explicit.distance, "full", note);
      assert.deepEqual(explicit.parseIssues, [], note);
    }
  }
  const empty = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(empty.entries.length, 0);
  assert.deepEqual(empty.summary.pb, []);
});

test("category evidence survives accompanying timing annotations in either order and notation", async () => {
  const owner = await user("组别时间混合核对");
  const projects = [
    "全程（精英组，03:12:45）", "全程（精英组）（03:12:45）",
    "全程（03:12:45，精英组）", "全程（03:12:45）（精英组）",
    "全程【精英组，03:12:45】", "全程[精英组][03:12:45]",
    "全程「精英组」「03:12:45」", "全程【精英组】[03:12:45]",
    "全程【精英组；净计时：03:12:45】", "全程（42.195公里，03:12:45）",
    "全程【精英组】【净计时：03:12:45】"
  ];
  for (const project of projects) {
    for (const fields of [`项目：半程\n${project}`, `完赛项目：${project}\n项目：半程`]) {
      const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称：混合注释测试赛\n日期：2025-10-26\n${fields}\n净计时：03:12:45` })).body.candidates[0];
      assert.equal(candidate.distance, "", fields);
      assert.match(candidate.issues.join("；"), /多个比赛项目或距离/, fields);
      assert.ok(candidate.distanceText.includes(project.normalize("NFKC")), JSON.stringify(candidate));
      assert.equal(candidate.netTime, "03:12:45", fields);
      assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400, fields);
    }
    const alone = parseImportText(`比赛名称：混合注释正例\n日期：2025-10-26\n${project}\n净计时：03:12:45`)[0];
    assert.equal(alone.distance, "full", project);
    assert.deepEqual(alone.parseIssues, [], project);
  }
  const empty = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(empty.entries.length, 0);
  assert.deepEqual(empty.summary.pb, []);
  const single = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text: "比赛名称：混合注释保存测试赛\n日期：2025-10-26\n全程【精英组，03:12:45】\n5公里[水站组]\n净计时：03:12:45" })).body.candidates[0];
  const saved = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [single] });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.entries[0].distance, "full");
  assert.equal(saved.body.entries[0].netSeconds, 11565);
});

test("joined categories, wrapped projects and time-before-group forms all retain conflicting evidence", async () => {
  const owner = await user("项目装饰结构核对");
  const projects = [
    ...["·", "・", "-", "－", "–", "—"].flatMap((joiner) => [`全程${joiner}精英组`, `全程${joiner}大众组`]),
    ...[["【", "】"], ["《", "》"], ["〈", "〉"], ["〖", "〗"], ["[", "]"], ["（", "）"]].flatMap(([open, close]) => [`${open}全程${close}`, `全程${open}精英组${close}`]),
    "全程：03:12:45（精英组）", "全程 03:12:45（精英组）",
    "全程：03:12:45【精英组】", "全程 03:12:45〈精英组〉",
    "全程-18-39岁", "全程－男子40岁以上", "【全程（精英组）】"
  ];
  for (const project of projects) {
    for (const fields of [`项目：半程\n${project}`, `完赛项目：${project}\n项目：半程`]) {
      const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称：项目结构测试赛\n日期：2025-10-26\n${fields}\n净计时：03:12:45` })).body.candidates[0];
      assert.equal(candidate.distance, "", fields);
      assert.match(candidate.issues.join("；"), /多个比赛项目或距离/, fields);
      assert.ok(candidate.distanceText.includes(project.normalize("NFKC")), JSON.stringify(candidate));
      assert.equal(candidate.netTime, "03:12:45", fields);
      assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400, fields);
    }
    const alone = parseImportText(`比赛名称：项目结构正例\n日期：2025-10-26\n${project}\n净计时：03:12:45`)[0];
    assert.equal(alone.distance, "full", project);
    assert.deepEqual(alone.parseIssues, [], project);
  }
  for (const fields of ["【半程】\n【全程】", "【半程，全程】", "半程·大众组\n全程·精英组", "项目：5公里-青年组\n10公里・公开组", "《全程》、【半程】", "[全程]\n[半程]"]) {
    const candidate = parseImportText(`比赛名称：两处装饰项目\n日期：2025-10-26\n${fields}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "", fields);
    assert.match(candidate.parseIssues.join("；"), /多个比赛项目或距离/, fields);
  }
  const empty = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(empty.entries.length, 0);
  assert.deepEqual(empty.summary.pb, []);
  assert.equal(parseImportText("[全程]\n日期：2025-10-26\n净计时：03:12:45")[0].distance, "full");
  assert.throws(() => parseImportText('[{"name":'), /JSON 文件格式不正确/);
});

test("decoration syntax keeps timing and aid notes excluded and never shortens a complete distance", async () => {
  const owner = await user("装饰说明过滤核对");
  const notes = ["全程 03:12:45", "全程：03:12:45", "5公里 00:25:10（水站组）", "5公里：00:25:10（配速组）",
    ...["·", "・", "-", "－"].flatMap((joiner) => [`5公里${joiner}水站组`, `10公里${joiner}配速组`, `全程${joiner}计时组`]),
    "【5公里（水站组）】", "5公里〈水站组〉", "10公里〖配速组〗", "《5公里（00:25:10）》"];
  for (const note of notes) {
    const alone = parseImportText(`比赛名称：装饰辅助说明\n日期：2025-10-26\n${note}\n净计时：03:12:45`)[0];
    assert.equal(alone.distance, "", note);
    const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称：装饰辅助过滤\n日期：2025-10-26\n项目：全马\n${note}\n净计时：03:12:45` })).body.candidates[0];
    assert.equal(candidate.distance, "full", note);
    assert.deepEqual(candidate.issues, [], note);
  }
  for (const value of ["15公里-青年组", "35公里・公开组", "【15公里】", "全程·15公里组"]) {
    const candidate = parseImportText(`比赛名称：完整距离核对\n日期：2025-10-26\n项目：${value}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "", value);
    assert.ok(candidate.distanceText.includes(value.normalize("NFKC")), JSON.stringify(candidate));
    assert.match(candidate.parseIssues.join("；"), /请确认.*项目/, value);
  }
  const lengthy = parseImportText(`比赛名称：未知栏目长文本\n日期：2025-10-26\n项目：${"未知-".repeat(500)}说明\n完赛项目：全马\n净计时：03:12:45`)[0];
  assert.equal(lengthy.distance, "full");
  assert.deepEqual(lengthy.parseIssues, []);
  const saved = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [parseImportText("比赛名称：结构化项目保存\n日期：2025-10-26\n【全程】\n5公里-水站组\n净计时：03:12:45")[0]] });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.entries[0].distance, "full");
  assert.equal(saved.body.entries[0].netSeconds, 11565);
});

test("adjacent, leading and trailing category tokens remain project evidence in every order", async () => {
  const owner = await user("组别顺序完整核对");
  const projects = [
    ["半程马拉松大众组", "half"], ["全程 精英组", "full"],
    ["全程马拉松男子精英组", "full"], ["5公里青年组", "5k"],
    ["精英组·全程马拉松", "full"], ["男子【全程】", "full"],
    ["大众组-半程", "half"], ["男子：全程", "full"], ["18-39岁全程", "full"],
    ["全程·精英组 03:12:45", "full"], ["全程·精英组：03:12:45", "full"],
    ["全程、男子组", "full"], ["全程/男子", "full"], ["青年组/5公里", "5k"],
    ["男子18-39岁全程马拉松精英组", "full"], ["男子40岁以上10公里", "10k"],
    ["40岁以上全程马拉松", "full"], ["男子40岁以下全程", "full"],
    ["精英组 全程马拉松 03:12:45", "full"], ["全程 精英组 03:12:45", "full"]
  ];
  for (const [project, expected] of projects) {
    const other = expected === "half" ? "全程" : expected === "5k" ? "10公里" : "半程";
    for (const fields of [`完赛项目：${project}\n项目：${other}`, `项目：${other}\n${project}`]) {
      const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称：组别顺序测试赛\n日期：2025-10-26\n${fields}\n净计时：03:12:45` })).body.candidates[0];
      assert.equal(candidate.distance, "", fields);
      assert.match(candidate.issues.join("；"), /多个比赛项目或距离/, fields);
      assert.ok(candidate.distanceText.includes(project.normalize("NFKC")), JSON.stringify(candidate));
      assert.ok(candidate.distanceText.includes(other), JSON.stringify(candidate));
      assert.equal(candidate.netTime, "03:12:45", fields);
      assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400, fields);
    }
    const alone = parseImportText(`比赛名称：组别顺序正例\n日期：2025-10-26\n${project}\n净计时：03:12:45`)[0];
    assert.equal(alone.distance, expected, project);
    assert.deepEqual(alone.parseIssues, [], project);
  }
  for (const fields of ["项目：半程，全程 精英组", "半程马拉松 大众组 01:45:22\n全程马拉松 精英组 03:12:45", "精英组·全程\n大众组·半程", "全程/男子、半程/女子"]) {
    const candidate = parseImportText(`比赛名称：组别列表核对\n日期：2025-10-26\n${fields}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "", fields);
    assert.match(candidate.parseIssues.join("；"), /多个比赛项目或距离/, fields);
  }
  const empty = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(empty.entries.length, 0);
  assert.deepEqual(empty.summary.pb, []);
});

test("parallel projects retain every distance when only one item has a clock, category or connector", async () => {
  const owner = await user("并列项目证据完整核对");
  const cases = [
    "完赛项目：半程、全程 03:12:45", "完赛项目：全程、半程 01:35:00",
    "完赛项目：5公里/10公里 00:48:00", "完赛项目：全程（03:12:45）、半程（大众组）",
    "项目：半程，全程 03:12:45", "项目：半程，全程 03:12:45，姓名：张三",
    "完 赛 项 目：半程，全程 03:12:45",
    "完赛项目：半程、全程3小时12分", "完赛项目：半程、全程03时12分45秒",
    "全程·精英组3小时12分45秒\n项目：半程",
    "完赛项目：半程·大众组 全程·精英组", "完赛项目：全程·精英组 半程·大众组",
    "完赛项目：半程·大众组 全程·精英组 03:12:45",
    ...["以及", "至", "到", "或者", "～"].map((connector) => `完赛项目：半程${connector}全程\n项目：5公里`),
    "精英组～全程\n项目：半程",
    ...["18岁-39岁全程", "18周岁-39周岁全程", "18周岁至39周岁半程"].map((value) => `${value}\n项目：${value.endsWith("半程") ? "全程" : "半程"}`),
    "完赛项目：半程（01:35:00）、全程（03:12:45）",
    "完赛项目：全程 03:12:45/半程 01:35:00",
    "完赛项目：半程，全程 03:12:45；5公里 00:25:10",
    "完赛项目：半程马拉松 大众组 全程马拉松 精英组",
    "完赛项目：全程以及全马 03:12:45\n项目：半程"
  ];
  for (const fields of cases) {
    const text = `比赛名称：并列项目完整核对赛\n日期：2025-10-26\n${fields}\n净计时：03:12:45`;
    const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text });
    assert.equal(preview.status, 200, fields);
    const candidate = preview.body.candidates[0];
    assert.equal(candidate.distance, "", fields);
    assert.match(candidate.issues.join("；"), /多个比赛项目或距离/, fields);
    for (const line of fields.split("\n")) {
      const project = line.replace(/^(?:完[ \t]*赛[ \t]*项[ \t]*目|项[ \t]*目)：/, "").replace(/，姓名：.*$/, "").normalize("NFKC");
      assert.ok(candidate.distanceText.includes(project), `${fields}: ${candidate.distanceText}`);
    }
    assert.equal(candidate.netTime, "03:12:45", fields);
    assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400, fields);
  }
  const empty = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(empty.entries.length, 0);
  assert.deepEqual(empty.summary.pb, []);
});

test("finish fields preserve timed distances and locally annotated projects alongside other declarations", async () => {
  const owner = await user("完赛字段语义核对");
  const values = ["全程马拉松 03:12:45", "全程：03:12:45", "全程（03:12:45）", "全程马拉松 净计时：03:12:45", "全马用时03:12:45", "全程马拉松\n03:12:45", "全程（上半程 01:05:00）", "全程（每5公里补给）", "全程（5公里补给）", "全程（分段10公里00:50:00）"];
  const cases = values.flatMap((value) => [`项目：半程\n完赛项目：${value}`, `完赛项目：${value}\n项目：半程`]);
  cases.push("完赛项目：半程马拉松 01:35:00\n项目：全程", "完赛项目：上半程和全程\n项目：5公里");
  cases.push("完赛项目\n全程：03:12:45\n项目：半程");
  for (const separator of ["；", ";", "|", "｜"]) for (const values of [["半程", "全程：03:12:45"], ["10公里", "半程：01:35:00"]]) cases.push(`完赛项目：${values.join(separator)}`);
  for (const separator of ["；", "|"]) cases.push(`完赛项目：半程${separator}全马用时03:12:45`, `完赛项目：半程${separator}全程（每5公里补给）`);
  for (const fields of cases) {
    const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称：完赛字段完整核对赛\n日期：2025-10-26\n${fields}\n净计时：03:12:45` })).body.candidates[0];
    assert.equal(candidate.distance, "", fields);
    assert.match(candidate.issues.join("；"), /多个比赛项目或距离/, fields);
    for (const project of fields.split("\n").map((line) => line.replace(/^(?:完赛项目|项目)[:：]?/, "")).filter(Boolean)) assert.ok(candidate.distanceText.includes(project.normalize("NFKC")), `${fields}: ${candidate.distanceText}`);
    assert.equal(candidate.netTime, "03:12:45", fields);
    assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400, fields);
  }
  const empty = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(empty.entries.length, 0);
  assert.deepEqual(empty.summary.pb, []);
});

test("distance field aliases and complete Chinese distance tokens cannot disappear beside another project", () => {
  const fields = ["距离：42.195公里", "距离：半程、全程", "里程：全马", "项目名称：半程", "项目名：半程", "完赛项目：十公里", "完赛项目：五公里", "完赛项目：十千米", "十公里", "五公里", "十千米"];
  for (const field of fields) {
    const other = field.includes("半程") ? "5公里" : "半程";
    for (const value of [`${field}\n项目：${other}`, `项目：${other}\n${field}`]) {
      const candidate = parseImportText(`比赛名称：距离别名核对赛\n日期：2025-10-26\n${value}\n净计时：03:12:45`)[0];
      assert.equal(candidate.distance, "", value);
      assert.match(candidate.parseIssues.join("；"), /多个比赛项目或距离/, value);
      assert.ok(candidate.distanceText.includes(field.replace(/^[^：]*：/, "").normalize("NFKC")), value);
    }
  }
});

test("metres, project aliases and numeric variants remain visible and cannot silently choose another distance", async () => {
  const owner = await user("米制与数字变体核对");
  const fields = [
    ...["5000米", "10000米", "21097米", "42195米", "一万米", "42,195米", "伍公里", "拾公里", "壹拾公里", "十公裡", "10公裡", "五km"].map((value) => `完赛项目：${value}`),
    "赛程：全程马拉松", "路程：全马", "项目类型：半程", "项目类别：10公里", "赛项：半程", "上半程和全程"
  ];
  for (const field of fields) {
    const other = /^(?:项目类型|赛项)：|21097/.test(field) ? "全程" : field === "上半程和全程" ? "5公里" : "半程";
    for (const text of [`${field}\n项目：${other}`, `项目：${other}\n${field}`]) {
      const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称：单位变体核对赛\n日期：2025-10-26\n${text}\n净计时：03:12:45` })).body.candidates[0];
      assert.equal(candidate.distance, "", text);
      assert.match(candidate.issues.join("；"), /多个比赛项目或距离/, text);
      assert.ok(candidate.distanceText.includes(field.replace(/^[^：]*：/, "").normalize("NFKC")), `${text}: ${candidate.distanceText}`);
      assert.equal(candidate.netTime, "03:12:45", text);
      assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400, text);
    }
  }
  for (const value of ["十公里", "五公里", "十千米", "伍公里", "21097米", "上半程和全程"]) {
    const candidate = parseImportText(`比赛名称：未锚定距离保留\n日期：2025-10-26\n${value}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "", value);
    assert.ok(candidate.distanceText.includes(value), value);
    assert.match(candidate.parseIssues.join("；"), /请确认比赛项目/, value);
  }
  const empty = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(empty.entries.length, 0);
  assert.deepEqual(empty.summary.pb, []);
});

test("Latin metres, gongchi, miles and registration project fields retain every conflicting distance", async () => {
  const owner = await user("拉丁米公尺项目核对");
  const projects = [
    ...["5000m", "10000m", "42195m", "21097.5m", "5,000m", "五千m", "5000公尺", "42195公尺", "五千公尺", "26.2英里"].map((value) => [`完赛项目：${value}`, value === "21097.5m" ? "全程" : "半程"]),
    ["报名项目：半程", "全程"], ["竞赛项目：10公里", "半程"], ["跑程：全马", "半程"]
  ];
  for (const [field, other] of projects) for (const text of [`${field}\n完赛项目：${other}`, `完赛项目：${other}\n${field}`]) {
    const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称：完整单位证据核对\n日期：2025-10-26\n${text}\n净计时：03:12:45` });
    assert.equal(preview.status, 200, text);
    const candidate = preview.body.candidates[0];
    assert.equal(candidate.distance, "", text);
    assert.match(candidate.issues.join("；"), /多个比赛项目或距离/, text);
    assert.ok(candidate.distanceText.includes(field.replace(/^[^：]*：/, "").normalize("NFKC")), text);
    assert.equal(candidate.netTime, "03:12:45", text);
    assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400, text);
  }
  for (const value of ["26.2英里", "5英里", "10英里"]) {
    const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称：英里保留核对\n日期：2025-10-26\n完赛项目：${value}\n净计时：03:12:45` });
    const candidate = preview.body.candidates[0];
    assert.equal(candidate.distance, "", value);
    assert.match(candidate.issues.join("；"), /暂不能识别比赛距离/, value);
    assert.ok(candidate.distanceText.includes(value), value);
    assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400, value);
  }
  const empty = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(empty.entries.length, 0);
  assert.deepEqual(empty.summary.pb, []);
});

test("English unit names and unit-bearing distance fields cannot lose a project beside another declaration", async () => {
  const owner = await user("英文单位及栏名单位核对");
  const fields = [
    ...["5 kilometers", "10 kilometres", "5000 meters", "10000 metres", "26.2mi", "26.2 mile", "26.2miles", "13.1mi", "26.2英哩", "5kms", "10kms"].map((value) => `完赛项目：${value}`),
    "距离（米）：42195", "距离（米）：5000", "距离（米）：21097.5", "距离（m）：5000", "比赛组别：半程", "参赛组别：10公里"
  ];
  for (const field of fields) {
    const other = field.includes("21097.5") || field.startsWith("比赛组别") ? "全程" : "半程";
    for (const content of [`${field}\n完赛项目：${other}`, `完赛项目：${other}\n${field}`]) {
      const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称：英文单位完整核对\n日期：2025-10-26\n${content}\n净计时：03:12:45` })).body.candidates[0];
      assert.equal(candidate.distance, "", content);
      assert.match(candidate.issues.join("；"), /多个比赛项目或距离/, content);
      const evidence = field.startsWith("距离") ? field : field.replace(/^[^：]*：/, "");
      assert.ok(candidate.distanceText.includes(evidence.normalize("NFKC")), `${content}: ${candidate.distanceText}`);
      assert.equal(candidate.netTime, "03:12:45", content);
      assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400, content);
    }
  }
  const empty = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(empty.entries.length, 0);
  assert.deepEqual(empty.summary.pb, []);
});

test("whole distance normalization preserves units, financial numerals and comma boundaries", () => {
  const supported = [
    ["5000米", "5k"], ["5,000米", "5k"], ["伍仟米", "5k"], ["10000米", "10k"], ["一万米", "10k"], ["壹萬米", "10k"],
    ["21097.5米", "half"], ["21,097.5米", "half"], ["42195米", "full"], ["42,195米", "full"], ["42，195米", "full"],
    ["伍公里", "5k"], ["拾公里", "10k"], ["壹拾公里", "10k"], ["十公裡", "10k"], ["10公裡", "10k"], ["五km", "5k"], ["伍KM", "5k"],
    ["五千米", "5k"], ["十千米", "10k"], ["拾千米", "10k"], ["壹拾千米", "10k"], ["5千米", "5k"], ["10千米", "10k"], ["42.195千米", "full"], ["21.0975千米", "half"],
    ["5000m", "5k"], ["5000M", "5k"], ["10000m", "10k"], ["42195m", "full"], ["21097.5m", "half"], ["5,000m", "5k"], ["五千m", "5k"], ["伍仟m", "5k"],
    ["5000公尺", "5k"], ["10000公尺", "10k"], ["42195公尺", "full"], ["21097.5公尺", "half"], ["五千公尺", "5k"], ["四万二千一百九十五米", "full"],
    ["5公里（5000m）", "5k"], ["5km（5000公尺）", "5k"], ["5km", "5k"], ["10km", "10k"], ["42.195km", "full"], ["21.0975km", "half"],
    ["5 kilometers", "5k"], ["10 kilometres", "10k"], ["5000 meters", "5k"], ["10000 metres", "10k"], ["5kms", "5k"], ["10kms", "10k"],
    ["42.195 KILOMETERS", "full"], ["21097.5 METRES", "half"], ["5 kilometer", "5k"], ["5000 meter", "5k"], ["5000 metre", "5k"]
  ];
  const fields = ["完赛项目", "赛程", "路程", "项目类型", "项目类别", "赛项", "报名项目", "竞赛项目", "跑程"];
  for (const [value, expected] of supported) for (const label of fields) {
    const input = `比赛名称：完整单位换算\n日期：2025-10-26\n${label}：${value}\n净计时：03:12:45`;
    const single = parseImportText(input)[0];
    assert.equal(single.distance, expected, input);
    assert.ok(single.distanceText.includes(value.normalize("NFKC")), input);
    assert.deepEqual(single.parseIssues, [], input);
    const conflict = parseImportText(input + `\n项目：${expected === "half" ? "全程" : "半程"}`)[0];
    assert.equal(conflict.distance, "", input);
    assert.match(conflict.parseIssues.join("；"), /多个比赛项目或距离/, input);
  }
  for (const value of ["21097米", "21,097米", "15000米", "50000米", "105000米", "拾伍公里", "伍拾公里", "壹佰零伍公里", "十五km", "五十公裡", "42.195米", "伍仟伍佰米", "十五千米", "拾伍千米", "15千米", "壹佰零伍千米", "21097m", "15000m", "105000公尺", "26.2英里", "5英里", "10英里", "26.2mi", "26.2 mile", "26.2miles", "13.1mi", "26.2英哩", "5 miles", "10 mi", "15 kilometers", "50000 meters"]) {
    const candidate = parseImportText(`比赛名称：完整非标准距离\n日期：2025-10-26\n完赛项目：${value}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "", value);
    assert.match(candidate.parseIssues.join("；"), /暂不能识别比赛距离/, value);
    assert.ok(candidate.distanceText.includes(value.normalize("NFKC")), value);
  }
  for (const value of ["5000米：00:25:10", "伍仟米：00:25:10", "每伍公里补给", "每5000米", "10000米水站组", "拾公里用时00:50:00", "姓名：伍公里", "项目介绍：42,195米", "5000m：00:25:10", "5000公尺：00:25:10", "每5000m补给", "每五千公尺", "每5英里补给", "26.2英里：03:12:45", "姓名：5000m", "项目介绍：5,000m", "5000 meters：00:25:10", "每5 kilometers补给", "每5mi补给", "项目介绍：5 kilometers"]) {
    const candidate = parseImportText(`比赛名称：单位辅助边界\n日期：2025-10-26\n${value}\n完赛项目：全马\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "full", value);
    assert.deepEqual(candidate.parseIssues, [], value);
  }
  for (const value of ["5000米，10000米", "5公里,10公里", "5000米，姓名：张三，10000米"]) {
    const candidate = parseImportText(`比赛名称：数字与分隔符边界\n日期：2025-10-26\n完赛项目：${value}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "", value);
    assert.match(candidate.parseIssues.join("；"), /多个比赛项目或距离/, value);
  }
  const standalone = parseImportText("比赛名称：局部分段与真实项目\n日期：2025-10-26\n上半程和全程（精英组）\n项目：5公里\n净计时：03:12:45")[0];
  assert.equal(standalone.distance, "");
  assert.match(standalone.parseIssues.join("；"), /多个比赛项目或距离/);
  assert.ok(standalone.distanceText.includes("上半程和全程(精英组)"));
});

test("field-level units apply to bare values in text, CSV and JSON without changing explicit value units", () => {
  const fields = [
    ["距离（米）：42195", "full"], ["距离（米）：5000", "5k"], ["距离（米）：21097.5", "half"],
    ["距离（m）：5000", "5k"], ["距离（meters）：10000", "10k"], ["距离（km）：42.195", "full"],
    ["距离（kilometres）：21.0975", "half"], ["距离（米）：42,195", "full"],
    ["距离（米）\n42195", "full"], ["距离（m）\n5000", "5k"],
    ["距离（m）：5km", "5k"], ["距离（km）：5000m", "5k"]
  ];
  for (const [field, expected] of fields) {
    const parsed = parseImportText(`比赛名称：栏目单位核对\n日期：2025-10-26\n${field}\n净计时：03:12:45`)[0];
    assert.equal(parsed.distance, expected, field);
    assert.deepEqual(parsed.parseIssues, [], field);
    assert.ok(parsed.distanceText.includes(field.normalize("NFKC")), field);
  }
  for (const [header, value, expected] of [["距离（米）", "42195", "full"], ["距离（m）", "5000", "5k"], ["距离（metres）", "21097.5", "half"]]) {
    for (const text of [`比赛名称,日期,${header},净计时\n栏目单位表格,2025-10-26,${value},03:12:45`, JSON.stringify([{ name: "栏目单位JSON", raceDate: "2025-10-26", [header]: value, netTime: "03:12:45" }])]) {
      const parsed = parseImportText(text)[0];
      assert.equal(parsed.distance, expected, text);
      assert.deepEqual(parsed.parseIssues, [], text);
      assert.ok(parsed.distanceText.includes(value), text);
    }
  }
  for (const groupLabel of ["比赛组别", "参赛组别"]) for (const group of ["男子", "女子组", "公开组", "精英组"]) {
    const parsed = parseImportText(`比赛名称：组别别名核对\n日期：2025-10-26\n${groupLabel}：${group}\n完赛项目：全程\n净计时：03:12:45`)[0];
    assert.equal(parsed.distance, "full", groupLabel + group);
    assert.deepEqual(parsed.parseIssues, [], groupLabel + group);
  }
  for (const [field, expected] of [["距离(m)：5,000,城市：北京", "5k"], ["距离(m)：42,195,号码布：5000 meters", "full"], ["距离(m)：5000,备注：10 kilometers", "5k"]]) {
    const parsed = parseImportText(`比赛名称：单位字段分栏边界\n日期：2025-10-26\n${field}\n净计时：03:12:45`)[0];
    assert.equal(parsed.distance, expected, field);
    assert.deepEqual(parsed.parseIssues, [], field);
    assert.ok(!/城市|号码布|备注/.test(parsed.distanceText), field);
  }
  for (const field of ["距离(m)：5000,项目：半程", "距离(m)：5000,10000", "距离（米）：5000、10000", "距离(m)：5000/10000", "距离(m)：5000;10000"]) {
    const parsed = parseImportText(`比赛名称：单位字段多项目\n日期：2025-10-26\n${field}\n净计时：03:12:45`)[0];
    assert.equal(parsed.distance, "", field);
    assert.match(parsed.parseIssues.join("；"), /多个比赛项目或距离/, field);
    assert.ok(parsed.distanceText.includes("5000"), field);
  }
});

test("a complete project stays visible under an unrecognized label, and bracketed units and English marathon names resolve", () => {
  const conflicts = [
    ["完赛组别：半程马拉松", "全程", "半程马拉松"],
    ["个人项目：全程", "半程", "全程"],
    ["所选项目：10公里", "半程", "10公里"],
    ["完赛项目：Half Marathon", "5公里", "Half Marathon"],
    ["完赛项目：Full Marathon", "半程", "Full Marathon"],
    ["完赛项目：half-marathon", "全程", "half-marathon"],
    ["距离【米】：5000", "半程", "5000"],
    ["距离[米]：42195", "半程", "42195"],
    ["距离「米」：21097.5", "全程", "21097.5"]
  ];
  for (const [field, other, evidence] of conflicts) for (const text of [`${field}\n项目：${other}`, `项目：${other}\n${field}`]) {
    const candidate = parseImportText(`比赛名称：栏名收口\n日期：2025-10-26\n${text}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "", text);
    assert.match(candidate.parseIssues.join("；"), /多个比赛项目或距离/, text);
    assert.ok(candidate.distanceText.includes(evidence), `${text} => ${candidate.distanceText}`);
  }
  const singles = [
    ["完赛组别：半程马拉松", "half"], ["个人项目：全程", "full"], ["所选项目：10公里", "10k"],
    ["完赛项目：Half Marathon", "half"], ["完赛项目：FULL MARATHON", "full"], ["完赛项目：half marathon", "half"],
    ["距离【米】：5000", "5k"], ["距离[米]：42195", "full"], ["距离【米】\n21097.5", "half"], ["距离[m]：10000", "10k"],
    ["完赛项目\nHalf Marathon", "half"]
  ];
  for (const [field, expected] of singles) {
    const candidate = parseImportText(`比赛名称：栏名单独核对\n日期：2025-10-26\n${field}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, expected, field);
    assert.deepEqual(candidate.parseIssues, [], field);
  }
  const kept = [
    ["备注：半程\n完赛项目：全程", "full"], ["项目介绍：半程\n完赛项目：全程", "full"],
    ["姓名：伍公里\n完赛项目：全马", "full"], ["号码布：5000 meters\n完赛项目：全马", "full"],
    ["比赛项目说明：5公里\n完赛项目：全马", "full"], ["完赛组别：精英组\n完赛项目：全程", "full"],
    ["完赛组别：男子\n完赛项目：全程", "full"], ["5000 meters：00:25:10\n完赛项目：全马", "full"],
    ["项目介绍：5 kilometers\n完赛项目：全马", "full"], ["比赛名称：半程马拉松\n完赛项目：全程", "full"]
  ];
  for (const [field, expected] of kept) {
    const candidate = parseImportText(`比赛名称：栏名排除\n日期：2025-10-26\n${field}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, expected, field);
    assert.deepEqual(candidate.parseIssues, [], field);
  }
  const table = parseImportText("比赛名称,日期,距离【米】,净计时\n括号单位,2025-10-26,42195,03:12:45")[0];
  assert.equal(table.distance, "full");
  assert.deepEqual(table.parseIssues, []);
  const named = parseImportText("比赛名称：英文名单独成行\n日期：2025-10-26\nHalf Marathon\n净计时：03:12:45")[0];
  assert.equal(named.distance, "half");
  assert.deepEqual(named.parseIssues, []);
});

test("explicit field scope survives clocks, annotations and line breaks without reviving auxiliary distances", () => {
  const labels = ["完赛项目", "完赛距离", "比赛项目", "参赛项目", "赛事项目", "距离", "里程", "项目名称", "项目名", "项目"];
  const forms = ["全程 03:12:45", "全程（03:12:45）", "全马用时03:12:45", "全程 净计时：03:12:45", "全程（上半程01:05:00）", "全程（每5公里补给）", "全程（5公里补给）", "全程（分段10公里00:50:00）", "上半程和全程"];
  for (const label of labels) for (const form of forms) for (const separator of ["：", "\n"]) {
    const field = `${label}${separator}${form}`;
    const candidate = parseImportText(`比赛名称：项目作用域组合核对\n日期：2025-10-26\n${field}\n项目：半程\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "", field);
    assert.match(candidate.parseIssues.join("；"), /多个比赛项目或距离/, field);
    assert.ok(candidate.distanceText.includes(form.normalize("NFKC")), field);
  }
  for (const value of ["十五公里", "二十五公里", "三十五公里", "五十公里", "一百零五公里", "十点五公里", "零点五公里"]) {
    const candidate = parseImportText(`比赛名称：中文完整距离核对\n日期：2025-10-26\n完赛项目：${value}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "", value);
    assert.match(candidate.parseIssues.join("；"), /暂不能识别比赛距离/, value);
    assert.ok(candidate.distanceText.includes(value), value);
  }
  for (const value of ["每五公里补给", "十公里：00:50:00", "十千米用时00:50:00", "五公里水站组", "上半程", "前半程状态不错"]) {
    const candidate = parseImportText(`比赛名称：中文分段核对\n日期：2025-10-26\n${value}\n完赛项目：全马\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "full", value);
    assert.deepEqual(candidate.parseIssues, [], value);
  }
  for (const label of labels) for (const role of ["计时组", "用时组", "耗时组", "成绩组", "时间组", "水站组", "补给组", "配速组"]) for (const separator of ["：", "\n"]) {
    const field = `${label}${separator}全程：${role}`;
    const candidate = parseImportText(`比赛名称：辅助工作组不能定项\n日期：2025-10-26\n${field}\n项目：半程\n净计时：01:35:00`)[0];
    assert.equal(candidate.distance, "half", field);
    assert.deepEqual(candidate.parseIssues, [], field);
  }
});

test("explicit project fields reconcile every printed distance even when decoration grammar is unfamiliar", () => {
  const cases = [
    "完赛项目：半程另外全程\n项目：5公里",
    "完赛项目\n半程另外全程\n项目：5公里",
    "完赛项目：半程\n全程·未知10公里",
    "完赛项目：半程·未知全程",
    "完赛项目：半程·精英组xyz全程foo",
    "完赛项目：半程（备注：全程）",
    "完赛项目：半程·精英组：03:12:45 18岁-39岁全程\n项目：5公里",
    "完赛项目：5公里·精英组 18岁-39岁10公里\n项目：全马",
    "完赛项目：半程、全程用时03:12:45",
    "完赛项目：半程、全程：03:12:45",
    "完赛项目：5公里/15公里 00:48:00"
  ];
  for (const fields of cases) {
    const candidate = parseImportText(`比赛名称：字段完整消费核对赛\n日期：2025-10-26\n${fields}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "", fields);
    assert.match(candidate.parseIssues.join("；"), /多个比赛项目或距离/, fields);
    const printed = fields.split("\n").map((line) => line.replace(/^(?:完赛项目|项目)[:：]?/, "")).filter(Boolean)[0];
    assert.ok(candidate.distanceText.includes(printed.normalize("NFKC")), fields);
  }
});

test("project evidence survives cross-products of clocks, categories, wrappers and list connectors", () => {
  const forms = [
    (value) => value,
    (value) => `${value} 03:12:45`,
    (value) => `${value}3小时12分45秒`,
    (value) => `${value}（03:12:45）`,
    (value) => `${value}·精英组`,
    (value) => `${value}·精英组：03:12:45`,
    (value) => `【${value}】`,
    (value) => `${value}（大众组）`,
    (value) => `18岁-39岁${value}`,
    (value) => `18周岁至39周岁${value}`
  ];
  for (const [first, last] of [["半程", "全程"], ["5公里", "10公里"], ["10公里", "15公里"]]) {
    for (const firstForm of forms) for (const lastForm of forms) {
      for (const connector of ["、", "/", " ", "以及", "至", "到", "或者", "～"]) {
        const value = `${firstForm(first)}${connector}${lastForm(last)}`;
        const candidate = parseImportText(`比赛名称：结构组合核对赛\n日期：2025-10-26\n完赛项目：${value}\n项目：半马\n净计时：03:12:45`)[0];
        assert.equal(candidate.distance, "", value);
        assert.match(candidate.parseIssues.join("；"), /多个比赛项目或距离/, value);
        assert.ok(candidate.distanceText.includes(value.normalize("NFKC")), value);
      }
    }
  }
  for (const value of ["全程、全马 03:12:45", "全程 03:12:45/全马（03:15:20）", "全程以及42.195公里3小时12分", "全程·精英组 全马·大众组"]) {
    const candidate = parseImportText(`比赛名称：同项目重复核对赛\n日期：2025-10-26\n完赛项目：${value}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "full", value);
    assert.deepEqual(candidate.parseIssues, [], value);
  }
});

test("category ordering cannot convert splits, personal fields or unsupported complete distances into a standard finish", async () => {
  const owner = await user("组别顺序辅助过滤");
  const notes = ["上半程", "半程点", "每5公里", "前半程男子组", "上半程精英组", "前半马男子组", "后全马青年组", "每5公里青年组", "5公里水站组", "配速组10公里", "水站组-5公里", "计时组全程", "全程·补给组03:12:45", "全程、计时组", "5公里/配速组", "姓名：全程精英组", "项目介绍：半程大众组"];
  for (const note of notes) {
    const alone = parseImportText(`比赛名称：组别顺序辅助说明\n日期：2025-10-26\n${note}\n净计时：03:12:45`)[0];
    assert.equal(alone.distance, "", note);
    const explicit = parseImportText(`比赛名称：组别顺序过滤\n日期：2025-10-26\n${note}\n完赛项目：全马\n净计时：03:12:45`)[0];
    assert.equal(explicit.distance, "full", note);
    assert.deepEqual(explicit.parseIssues, [], note);
  }
  for (const value of ["15公里青年组", "青年组35公里", "男子40岁以上50公里", "105公里大众组"]) {
    const candidate = parseImportText(`比赛名称：完整组别距离\n日期：2025-10-26\n项目：${value}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "", value);
    assert.ok(candidate.distanceText.includes(value), JSON.stringify(candidate));
    assert.match(candidate.parseIssues.join("；"), /请确认.*项目/, value);
  }
  const saved = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [parseImportText("比赛名称：顺序项目保存\n日期：2025-10-26\n精英组 全程马拉松 03:12:45\n5公里水站组\n净计时：03:12:45")[0]] });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.entries[0].distance, "full");
  assert.equal(saved.body.entries[0].netSeconds, 11565);
});

test("timing and aid annotations are excluded before group suffix matching in every notation", async () => {
  const owner = await user("辅助组别不定项目");
  const categories = ["计时组", "补给组", "水站组", "配速组", "分段组", "饮水组", "补水组", "00:25:10", "补给点"];
  for (const group of categories) {
    for (const heading of [`全程：${group}`, `全程（${group}）`, `项目：全程（${group}）`]) {
      const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称：辅助组别测试赛\n日期：2025-10-26\n${heading}\n净计时：03:12:45` })).body.candidates[0];
      assert.equal(candidate.distance, "", heading);
      assert.match(candidate.issues.join("；"), /请确认比赛项目/, heading);
      assert.equal(candidate.netTime, "03:12:45", heading);
      assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400, heading);
    }
    for (const note of [`5公里：${group}`, `10公里（${group}）`, `半程马拉松（${group}）`, `项目：5公里（${group}）`]) {
      for (const fields of [`项目：全马\n${note}`, `${note}\n完赛项目：全马`]) {
        const candidate = parseImportText(`比赛名称：辅助组别过滤\n日期：2025-10-26\n${fields}\n净计时：03:12:45`)[0];
        assert.equal(candidate.distance, "full", fields);
        assert.deepEqual(candidate.parseIssues, [], fields);
      }
    }
  }
  const empty = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(empty.entries.length, 0);
  assert.deepEqual(empty.summary.pb, []);
  const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text: "比赛名称：括号项目保存测试赛\n日期：2025-10-26\n全程（精英组）\n5公里：水站组\n10公里（配速组）\n净计时：03:12:45" })).body.candidates[0];
  const saved = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [candidate] });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.entries[0].distance, "full");
  assert.equal(saved.body.entries[0].netSeconds, 11565);
  const history = (await request(app).get(API).set(owner.auth)).body;
  assert.ok(history.summary.pb.every((pb) => pb.distance === "full"));
});

test("unreadable project fields do not veto an independently explicit finish project", async () => {
  const owner = await user("有效完赛项目独立采用");
  for (const unreadable of ["项目\n说明文字", "项目：上半程", "项目：每5公里补给", "项目：待识别", "项目：5公里：00:25:10"]) {
    for (const fields of [unreadable + "\n完赛项目：全马", "完赛项目：全马\n" + unreadable]) {
      const text = `比赛名称：字段恢复测试赛\n比赛日期：2025-10-26\n${fields}\n净计时：03:12:45`;
      const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text })).body.candidates[0];
      assert.equal(candidate.distance, "full", fields);
      assert.deepEqual(candidate.issues, [], fields);
      assert.equal(candidate.netSeconds, 11565, fields);
    }
    const candidate = parseImportText(`比赛名称：无明确项目测试赛\n比赛日期：2025-10-26\n${unreadable}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "", unreadable);
    assert.match(candidate.parseIssues.join("；"), /请确认比赛项目/, unreadable);
  }
  const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text: "比赛名称：字段恢复保存测试赛\n日期：2025-10-26\n项目：上半程\n完赛项目：全马\n净计时：03:12:45" })).body.candidates[0];
  const saved = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [candidate] });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.entries[0].distance, "full");
});

test("complete field names distinguish projects from other columns and exclude unrelated descriptions", async () => {
  const owner = await user("完整项目字段边界");
  const positives = [
    ["项目介绍\n完赛项目：全马", "full"],
    ["项目介绍：每5公里补给\n完赛项目：全马", "full"],
    ["项目组：男子\n完赛项目：全马", "full"],
    ["完赛项目：全马\n项目介绍：半程", "full"],
    ["项目：全程\n项目介绍：半程、10公里", "full"],
    ["完赛项目：全马\n项目组：男子", "full"],
    ["比赛项目说明：5公里\n完赛项目：全马", "full"],
    ["项目\n项目介绍：每5公里补给\n完赛项目：全马", "full"],
    ["项目\n项目组：男子\n完赛项目：全马", "full"],
    ["项目\n项目介绍\n完赛项目：全马", "full"],
    ["项目：全程\n全马\n42.195公里", "full"],
    ["项目：全程\n姓名：张三\n42.195公里", "full"],
    ["项目全马", "full"], ["比赛项目 5 公里", "5k"],
    ["组别\n男子\n5公里", "5k"],
    ["组别\n45-49岁男子组\n半程", "half"],
    ["项目：全马\n分段\n5公里：00:25:10\n10公里用时：00:50:00", "full"],
    ["项目：全马\n每5公里补给", "full"],
    ["项目：全马\n项目介绍\n欢迎参赛", "full"],
    ["项目：全马\n项目组：男子", "full"],
    ["项目：全马\n净计时：03:12:45", "full"]
  ];
  for (const [fields, distance] of positives) {
    const text = `比赛名称：项目栏目测试赛\n比赛日期：2025-10-26\n${fields}\n净计时：03:12:45`;
    const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const candidate = preview.body.candidates[0];
    assert.equal(candidate.distance, distance, fields);
    assert.deepEqual(candidate.issues, [], fields);
    assert.equal(candidate.netSeconds, 11565, fields);
  }
  for (const field of ["项目介绍：半程", "项目组：男子", "比赛项目说明：5公里"]) {
    const candidate = parseImportText(`比赛名称：项目栏目测试赛\n比赛日期：2025-10-26\n${field}\n净计时：03:12:45`)[0];
    assert.equal(candidate.distance, "", field);
    assert.ok(!candidate.parseIssues.some((issue) => issue.includes("项目字段不能明确")), field);
  }
  const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text: "比赛名称：项目栏目保存测试赛\n比赛日期：2025-10-26\n项目介绍：每5公里补给\n项目组：男子\n完赛项目：全马\n净计时：03:12:45" })).body.candidates[0];
  const saved = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [candidate] });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.entries[0].distance, "full");
});

test("non-distance group metadata does not veto an explicit project and real group distances still conflict", async () => {
  const owner = await user("组别与项目分离");
  const positives = [
    ["组别：男子\n完赛项目：全程马拉松", "full"], ["完赛项目：半程马拉松\n组别：女子组", "half"],
    ["组别：公开组\n全马", "full"], ["组别：男子，完赛项目：全马", "full"],
    ["组别：男子A组；完赛项目：全马", "full"], ["组别：45-49岁男子组\n半程马拉松", "half"],
    ["组别：女子组，项目：半马", "half"], ["项目：全程，全马；42.195公里", "full"],
    ["项目：半马；5公里：00:25:10", "half"], ["项目：5公里，净计时：03:12:45", "5k"],
    ["完赛项目：全马；每5公里补给", "full"], ["项目：半马，备注：全程补给充足", "half"],
    ["项目：全程，前半程配速稳定", "full"], ["项目：全程；10公里用时：00:50:00", "full"]
  ];
  for (const [fields, distance] of positives) {
    const text = `比赛名称：组别测试赛\n比赛日期：2025-10-26\n${fields}\n净计时：03:12:45`;
    const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.candidates[0].distance, distance, fields);
    assert.deepEqual(preview.body.candidates[0].issues, [], fields);
  }
  for (const group of ["男子", "女子组", "公开组", "男子A组", "45-49岁男子组"]) {
    const text = `比赛名称：组别测试赛\n比赛日期：2025-10-26\n组别：${group}\n净计时：03:12:45`;
    const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text })).body.candidates[0];
    assert.equal(candidate.distance, "");
    assert.match(candidate.issues.join("；"), /请确认比赛项目/);
  }
  for (const group of ["半程", "半程/全程", "15公里", "男子半程组"]) {
    const text = `比赛名称：组别测试赛\n比赛日期：2025-10-26\n组别：${group}\n完赛项目：全马\n净计时：03:12:45`;
    const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text })).body.candidates[0];
    assert.equal(candidate.distance, "", group);
    assert.match(candidate.issues.join("；"), /多个比赛项目或距离.*请确认实际完赛项目/, group);
  }
  const candidate = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text: "比赛名称：组别保存测试赛\n比赛日期：2025-10-26\n组别：男子\n完赛项目：全程马拉松\n净计时：03:12:45" })).body.candidates[0];
  const saved = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [candidate] });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.entries[0].distance, "full");
  assert.equal(saved.body.entries[0].netSeconds, 11565);
});

test("standard distances still parse while unrecognized CSV projects remain visible and cannot save unchecked", async () => {
  const owner = await user("标准距离和表格核对");
  for (const [label, expected] of [["5公里", "5k"], ["10 公里", "10k"], ["5 km", "5k"], ["10K", "10k"], ["半程马拉松21.0975公里", "half"], ["全程马拉松", "full"], ["全 程 马 拉 松 42.195 公 里", "full"]]) {
    const text = `比赛名称：标准项目证书\n比赛日期：2025-10-26\n比赛项目：${label}\n净 计 时 成 绩 03:12:45\n枪 声 成 绩 03:15:20`;
    const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const candidate = preview.body.candidates[0];
    assert.equal(candidate.distance, expected, label);
    assert.deepEqual(candidate.issues, [], JSON.stringify(candidate));
    assert.equal(candidate.netSeconds, 11565);
    assert.equal(candidate.gunSeconds, 11720);
  }
  for (const distance of ["15公里", "50公里", "100公里", "马拉松体验组"]) {
    const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称,日期,项目,净计时\n表格里的未知项目,2025-10-26,${distance},01:15:00` });
    assert.equal(preview.status, 200);
    const candidate = preview.body.candidates[0];
    assert.equal(candidate.distance, distance);
    assert.equal(candidate.distanceText, distance);
    assert.match(candidate.issues.join("；"), /无法识别项目.*请确认比赛项目/);
    assert.equal((await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] })).status, 400);
  }
  assert.equal((await request(app).get(API).set(owner.auth)).body.entries.length, 0);
});

test("splits, half-course descriptions and aid stations cannot supply a race project or create a PB", async () => {
  const owner = await user("分段补给不定项目");
  const notes = [
    "上半程", "前半程状态不错", "后半程状态不错", "下半程", "半程点：01:40:00",
    "5公里", "5公里：00:25:10", "每5公里补给", "10公里用时：00:50:00",
    "分段距离：5公里", "补给距离：10公里", "分段项目：5公里", "补给项目：10公里",
    "项目：上半程", "项目：每5公里补给", "项目：5公里：00:25:10",
    "备注：比赛项目：5公里", "赛事名称：前半程回顾跑", "全程用时：03:12:45",
    "全程补给：每5公里一次", "分段\n10公里用时 00:50:00",
    "组别：5", "组别：10", "项目5", "项目：5", "项目：10",
    "组别\n分段\n5公里", "组别\n每5公里\n10公里", "组别\n上半程\n10公里",
    "组别：分段\n5公里", "组别：每5公里\n10公里", "组别：上半程\n10公里",
    "项目\n分段\n5公里", "项目：每5公里\n10公里"
  ];
  for (const note of notes) {
    const text = `比赛名称：北京马拉松\n比赛日期：2025-10-26\n${note}\n净计时：03:12:45\n枪声成绩：03:15:20`;
    const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const candidate = preview.body.candidates[0];
    assert.equal(candidate.distance, "", note);
    assert.match(candidate.issues.join("；"), /请确认比赛项目/, note);
    assert.equal(candidate.netTime, "03:12:45", note);
    assert.equal(candidate.gunTime, "03:15:20", note);
    const confirm = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...candidate, confirmed: true }] });
    assert.equal(confirm.status, 400, note);
    // An actual project declaration is independent of split/aid notes.
    if (!/^(?:项目|组别)/.test(note)) {
      const explicit = await request(app).post(API + "/import/preview").set(owner.auth).send({ text: text + "\n完赛项目：全程马拉松" });
      if (note === "5公里") {
        assert.equal(explicit.body.candidates[0].distance, "", note);
        assert.match(explicit.body.candidates[0].issues.join("；"), /多个比赛项目或距离/, note);
      } else {
        assert.equal(explicit.body.candidates[0].distance, "full", note);
        assert.deepEqual(explicit.body.candidates[0].issues, [], note);
      }
    }
  }
  const after = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(after.entries.length, 0);
  assert.deepEqual(after.summary.pb, []);
  const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text: "比赛名称：北京马拉松\n比赛日期：2025-10-26\n5公里：00:25:10\n净计时：03:12:45" });
  const corrected = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [{ ...preview.body.candidates[0], distance: "full", confirmed: true }] });
  assert.equal(corrected.status, 200);
  assert.equal(corrected.body.entries[0].distance, "full");
  assert.equal(corrected.body.entries[0].netSeconds, 11565);
  const saved = (await request(app).get(API).set(owner.auth)).body;
  assert.ok(saved.summary.pb.every((pb) => pb.distance === "full"));
});

test("complete project fields and standalone project names remain valid alongside split times", async () => {
  const owner = await user("明确项目分段并存");
  const projects = [
    ["项目：5公里", "5k"], ["比赛项目：10公里", "10k"],
    ["参赛项目：半程马拉松", "half"], ["完赛距离：42.195公里", "full"],
    ["比赛项目\n5公里", "5k"], ["比 赛 项 目：全 程 马 拉 松 42.195 公 里", "full"],
    ["全程马拉松", "full"], ["半程马拉松", "half"], ["全马", "full"],
    ["项目：5公里；净计时：03:12:45", "5k"]
  ];
  for (const [project, distance] of projects) {
    const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text: `比赛名称：明确项目测试赛\n比赛日期：2025-10-26\n${project}\n上半程状态不错\n每5公里补给\n10公里用时：00:50:00\n净计时：03:12:45` });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const candidate = preview.body.candidates[0];
    assert.equal(candidate.distance, distance, project);
    assert.deepEqual(candidate.issues, [], project);
    assert.equal(candidate.netSeconds, 11565);
  }
});

test("import quoted CSV and export JSON preserve canonical values and reject malformed or conflicting clocks", async () => {
  const owner = await user("跑史导入表格");
  const text = '赛事名称,日期,项目,净计时,枪声成绩,城市\r\n"2024 天津,秋季马拉松",2024-10-26,全马,03:52:42,03:54:00,天津';
  const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text });
  assert.equal(preview.status, 200);
  const candidate = preview.body.candidates[0];
  assert.equal(candidate.name, "2024 天津,秋季马拉松");
  assert.equal(candidate.netSeconds, 13962);
  assert.equal(candidate.gunSeconds, 14040);
  assert.equal(candidate.issues.length, 0);
  const confirmed = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [candidate] });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal(confirmed.body.created, 1);
  assert.equal(confirmed.body.entries[0].sourceKey, candidate.sourceKey);
  const roundtrip = await request(app).post(API + "/import/preview").set(owner.auth).send({ text: JSON.stringify({ format: "race-history", version: 1, entries: confirmed.body.entries }) });
  assert.equal(roundtrip.status, 200);
  assert.equal(roundtrip.body.candidates[0].duplicateId, confirmed.body.entries[0].id);
  const malformed = await request(app).post(API + "/import/preview").set(owner.auth).send({ text: '赛事,日期,项目\n"没闭合,2024-01-01,全马' });
  assert.equal(malformed.status, 400);
  const bad = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [fixture("反转的净枪", "2025-01-01", { netTime: "04:00:00", gunTime: "03:59:00" })] });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /净计时/);
  const batch = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [fixture("应回滚的新比赛", "2022-01-01"), fixture("无效日期", "2025-02-30")] });
  assert.equal(batch.status, 400);
  assert.equal((await request(app).get(API).set(owner.auth)).body.entries.length, 1);
});

test("client CSV exports roundtrip unknown clocks, tags, event kind and format without data loss", async () => {
  const owner = await user("CSV导出原账号"), restored = await user("CSV导出新账号");
  const originals = [
    await create(owner, fixture('未确认口径,"旧比赛"', "2024-03-01", { kind: "trail", meet: "online", timing: "unknown", netTime: "", unknownTime: "08:09:10", bib: "A0007", story: "记得山里的风，和朋友一起跑", tags: ["陪伴", "坚持"] })),
    await create(owner, fixture("枪声比赛", "2024-04-01", { kind: "other", meet: "offline", timing: "gun", netTime: "", gunTime: "03:59:07", tags: ["第一次"] })),
    await create(owner, fixture("净计时比赛", "2024-05-01", { tags: ["突破", "城市"] }))
  ];
  const keys = ["name", "raceDate", "city", "province", "distance", "kind", "meet", "status", "timing", "netTime", "gunTime", "unknownTime", "bib", "story", "tags"];
  const time = (value) => value ? [Math.floor(value / 3600), Math.floor(value % 3600 / 60), value % 60].map((n) => String(n).padStart(2, "0")).join(":") : "";
  const cell = (value) => '"' + String(value ?? "").replace(/"/g, '""') + '"';
  const exported = originals.map((entry) => ({ ...entry, netTime: time(entry.netSeconds), gunTime: time(entry.gunSeconds), unknownTime: entry.timing === "unknown" ? time(entry.seconds) : "", tags: entry.tags.join("、") }));
  const csv = "\uFEFF" + [keys.join(","), ...exported.map((row) => keys.map((key) => cell(row[key])).join(","))].join("\r\n");
  const preview = await request(app).post(API + "/import/preview").set(restored.auth).send({ text: csv });
  assert.equal(preview.status, 200);
  assert.ok(preview.body.candidates.every((entry) => entry.issues.length === 0));
  const imported = await request(app).post(API + "/import/confirm").set(restored.auth).send({ candidates: preview.body.candidates });
  assert.equal(imported.status, 200, JSON.stringify(imported.body));
  assert.equal(imported.body.created, 3);
  for (const original of originals) {
    const saved = imported.body.entries.find((entry) => entry.name === original.name);
    for (const key of ["name", "raceDate", "city", "province", "distance", "kind", "meet", "status", "timing", "netSeconds", "gunSeconds", "unknownSeconds", "bib", "story", "tags"]) assert.deepEqual(saved[key], original[key], key);
  }
  const exportedImportedEntry = imported.body.entries[0];
  const extraKeys = [...keys, "sourceKey"];
  const withSource = { ...exportedImportedEntry, netTime: time(exportedImportedEntry.netSeconds), gunTime: time(exportedImportedEntry.gunSeconds), unknownTime: time(exportedImportedEntry.unknownSeconds), tags: exportedImportedEntry.tags.join("、") };
  const sourceCsv = [extraKeys.join(","), extraKeys.map((key) => cell(withSource[key])).join(",")].join("\r\n");
  const changed = await request(app).patch(entryUrl(exportedImportedEntry)).set(restored.auth).send({ name: "本人修改过的名称", story: "不要被旧导出覆盖" });
  assert.equal(changed.status, 200);
  const sourcePreview = await request(app).post(API + "/import/preview").set(restored.auth).send({ text: sourceCsv });
  assert.equal(sourcePreview.body.candidates[0].sourceKey, exportedImportedEntry.sourceKey);
  assert.equal(sourcePreview.body.candidates[0].duplicateId, exportedImportedEntry.id);
  await request(app).delete(entryUrl(exportedImportedEntry)).set(restored.auth);
  const afterDeletion = await request(app).post(API + "/import/confirm").set(restored.auth).send({ candidates: sourcePreview.body.candidates });
  assert.equal(afterDeletion.body.created, 0);
  assert.equal(afterDeletion.body.skipped, 1);
  const batch = await request(app).post(API + "/import/preview").set(restored.auth).send({ text: JSON.stringify([fixture("同批重复"), fixture("同批重复")]) });
  assert.equal(batch.body.candidates.length, 2);
  assert.ok(batch.body.candidates.every((entry) => entry.issues.some((issue) => /本次资料内/.test(issue))));
});

test("personal story paragraphs survive create, editing and CSV or JSON restoration", async () => {
  const owner = await user("段落保存原账号");
  const entry = await create(owner, fixture("有段落的比赛", "2024-05-01", { story: "  第一段，记得风。\r\n\r\n第二段\u0000，记得朋友。  " }));
  assert.equal(entry.story, "第一段，记得风。\n\n第二段，记得朋友。");
  const paragraphs = '起点有点紧张。\n\n途中，朋友说："慢慢来"。\n终点很开心。';
  const edited = await request(app).patch(entryUrl(entry)).set(owner.auth).send({ story: "\r\n" + paragraphs.replace(/\n/g, "\r\n") + "\r\n" });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.entry.story, paragraphs);
  const detail = await request(app).get(entryUrl(entry)).set(owner.auth);
  assert.equal(detail.body.entry.story, paragraphs);
  const tooLong = await request(app).patch(entryUrl(entry)).set(owner.auth).send({ story: "字".repeat(1201) });
  assert.equal(tooLong.status, 400);
  const saved = detail.body.entry;
  const cell = (value) => '"' + String(value ?? "").replace(/"/g, '""') + '"';
  const keys = ["name", "raceDate", "distance", "timing", "netTime", "story"];
  const exported = { ...saved, netTime: saved.clock };
  const csv = [keys.join(","), keys.map((key) => cell(exported[key])).join(",")].join("\r\n");
  for (const text of [JSON.stringify({ format: "race-history", version: 1, entries: [saved] }), csv]) {
    const restored = await user("段落回导" + (text.startsWith("{") ? "JSON" : "CSV"));
    const preview = await request(app).post(API + "/import/preview").set(restored.auth).send({ text });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.candidates[0].story, paragraphs);
    const confirmed = await request(app).post(API + "/import/confirm").set(restored.auth).send({ candidates: preview.body.candidates });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.entries[0].story, paragraphs);
  }
});

test("reimport never overwrites a runner correction and removed records keep only identity tombstones", async () => {
  const owner = await user("跑史重复保护");
  const text = "赛事名称,日期,项目,净计时\n2024 老比赛,2024-01-01,半马,01:45:00";
  const candidates = (await request(app).post(API + "/import/preview").set(owner.auth).send({ text })).body.candidates;
  const first = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates });
  const entry = first.body.entries[0];
  const update = await request(app).patch(entryUrl(entry)).set(owner.auth).send({ netTime: "01:44:00", story: "我自己的更正", bib: "A123", name: "我更正后的比赛名" });
  assert.equal(update.status, 200, JSON.stringify(update.body));
  const repeat = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates });
  assert.equal(repeat.body.created, 0);
  assert.equal(repeat.body.skipped, 1);
  const detail = await request(app).get(entryUrl(entry)).set(owner.auth);
  assert.equal(detail.body.entry.netSeconds, 6240);
  assert.equal(detail.body.entry.story, "我自己的更正");
  const removed = await request(app).delete(entryUrl(entry)).set(owner.auth);
  assert.equal(removed.status, 200);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM race_history_entries WHERE user_id=?").get(owner.id).n, 0);
  const tombstone = getDb().prepare("SELECT * FROM race_history_tombstones WHERE user_id=?").get(owner.id);
  assert.equal(tombstone.fingerprint.length, 64);
  assert.equal(tombstone.source_key.length, 64);
  assert.equal(JSON.stringify(tombstone).includes("我自己的更正"), false);
  const repeatAfterDelete = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates });
  assert.equal(repeatAfterDelete.body.created, 0);
  assert.equal(repeatAfterDelete.body.skipped, 1);
  assert.equal((await request(app).get(API).set(owner.auth)).body.entries.length, 0);
});

test("legacy results remain intact while their private overlay confirms timing and can be hidden", async () => {
  const owner = await user("原成绩跑史兼容");
  const db = getDb();
  db.prepare("INSERT INTO races(id,name,city,province,distances,race_date,deadline,place,kinds,meet) VALUES('history-legacy','历史全马','北京','北京','full','2024-10-01','','','road','offline')").run();
  db.prepare("INSERT INTO results(user_id,race_id,distance,seconds,story,updated_at) VALUES(?,'history-legacy','full',14400,'原有故事',?)").run(owner.id, new Date().toISOString());
  const list = await request(app).get(API).set(owner.auth);
  const entry = list.body.entries[0];
  assert.equal(entry.id, "result:history-legacy:full");
  assert.equal(entry.timing, "unknown");
  assert.equal(entry.isPb, false);
  const edit = await request(app).patch(entryUrl(entry)).set(owner.auth).send({ timing: "net", netTime: "03:59:59", story: "只在私人回顾修改" });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  assert.equal(edit.body.entry.isPb, true);
  const original = db.prepare("SELECT * FROM results WHERE user_id=?").get(owner.id);
  assert.equal(original.seconds, 14400);
  assert.equal(original.story, "原有故事");
  const proof = await request(app).post("/marathon/api/me/races/history-legacy/result/proof/certificate?distance=full").set(owner.auth).attach("file", png, "proof.png");
  assert.equal(proof.status, 200);
  const collection = await request(app).post("/marathon/api/me/runner/media?raceId=history-legacy&distance=full&kind=photo").set(owner.auth).attach("file", png, "collection.png");
  assert.equal(collection.status, 200);
  const withMedia = (await request(app).get(entryUrl(entry)).set(owner.auth)).body.entry;
  assert.equal(withMedia.media.length, 2);
  for (const media of withMedia.media) {
    const url = media.url + (media.url.includes("?") ? "&" : "?") + "t=" + owner.token;
    assert.equal((await request(app).get(url)).status, 200, url);
    assert.equal(media.inherited, true);
  }
  assert.equal((await request(app).delete(entryUrl(entry)).set(owner.auth)).status, 200);
  assert.equal((await request(app).get(API).set(owner.auth)).body.entries.length, 0);
  assert.equal(db.prepare("SELECT seconds FROM results WHERE user_id=?").get(owner.id).seconds, 14400);
  db.prepare("INSERT INTO races(id,name,city,province,distances,race_date,deadline,place,kinds,meet) VALUES('history-future','未来旧成绩','','','full','2099-01-01','','','road','offline'),('history-invalid','错误日期旧成绩','','','full','2025-02-30','','','road','offline')").run();
  for (const raceId of ["history-future", "history-invalid"]) db.prepare("INSERT INTO results(user_id,race_id,distance,seconds,updated_at) VALUES(?,?,'full',14400,?)").run(owner.id, raceId, new Date().toISOString());
  const badDates = (await request(app).get(API).set(owner.auth)).body;
  assert.equal(badDates.summary.pb.length, 0);
  assert.equal(badDates.summary.finished, 0);
  for (const item of badDates.entries) {
    assert.equal((await request(app).get(entryUrl(item)).set(owner.auth)).status, 200);
    assert.equal((await request(app).delete(entryUrl(item)).set(owner.auth)).status, 200);
  }
});

test("private pictures can attach without a finish time and are protected through deletion", async () => {
  const owner = await user("未完赛相片甲"), other = await user("未完赛相片乙");
  const entry = await create(owner, fixture("照片先留下", "2022-06-01", { netTime: "", timing: "unknown", status: "dnf" }));
  const uploaded = await request(app).post(entryUrl(entry) + "/media?kind=photo").set(owner.auth).attach("file", png, "moment.png");
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));
  const media = uploaded.body.media;
  assert.equal((await request(app).get(media.url)).status, 401);
  assert.equal((await request(app).get(media.url).set(other.auth)).status, 404);
  assert.equal((await request(app).get(media.url + "?t=" + owner.token)).status, 200);
  const cover = await request(app).patch(entryUrl(entry)).set(owner.auth).send({ coverMediaId: media.id });
  assert.equal(cover.status, 200);
  assert.equal(cover.body.entry.coverMediaId, media.id);
  assert.equal((await request(app).post(entryUrl(entry) + "/media?kind=photo").set(owner.auth).attach("file", Buffer.from("not image"), "bad.jpg")).status, 400);
  assert.equal((await request(app).post(entryUrl(entry) + "/media?kind=photo").set(owner.auth).attach("file", png, "one.png").attach("file", png, "two.png")).status, 400);
  const filename = getDb().prepare("SELECT filename FROM race_history_media WHERE user_id=?").get(owner.id).filename;
  assert.equal(fs.existsSync(path.join(historyRoot(), filename)), true);
  assert.equal((await request(app).delete(entryUrl(entry)).set(owner.auth)).status, 200);
  assert.equal(fs.existsSync(path.join(historyRoot(), filename)), false);
  assert.equal((await request(app).get(media.url).set(owner.auth)).status, 404);
});

test("private stories and picture snapshots survive removal of the separate original result", async () => {
  const owner = await user("旧成绩独立回忆");
  const db = getDb();
  db.prepare("INSERT INTO races(id,name,city,province,distances,race_date,deadline,place,kinds,meet) VALUES('history-snapshot','老比赛回忆','北京','北京','full,half','2023-10-01','','','road','offline')").run();
  for (const distance of ["full", "half"]) db.prepare("INSERT INTO results(user_id,race_id,distance,seconds,story,updated_at) VALUES(?,'history-snapshot',?,14400,'当时的故事',?)").run(owner.id, distance, new Date().toISOString());
  const list = (await request(app).get(API).set(owner.auth)).body.entries;
  const full = list.find((item) => item.distance === "full"), half = list.find((item) => item.distance === "half");
  const story = await request(app).patch(entryUrl(full)).set(owner.auth).send({ story: "私人保存的故事" });
  assert.equal(story.status, 200);
  const uploaded = await request(app).post(entryUrl(half) + "/media?kind=photo").set(owner.auth).attach("file", png, "memory.png");
  assert.equal(uploaded.status, 200);
  const removed = await request(app).delete("/marathon/api/me/races/history-snapshot/result").set(owner.auth);
  assert.equal(removed.status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM results WHERE user_id=?").get(owner.id).n, 0);
  const after = (await request(app).get(API).set(owner.auth)).body.entries;
  assert.equal(after.length, 2);
  assert.equal(after.find((item) => item.id === full.id).story, "私人保存的故事");
  assert.equal(after.find((item) => item.id === half.id).media.length, 1);
  assert.equal((await request(app).get(uploaded.body.media.url).set(owner.auth)).status, 200);
  assert.equal((await request(app).delete(entryUrl(half)).set(owner.auth)).status, 200);
  assert.equal((await request(app).get(uploaded.body.media.url).set(owner.auth)).status, 404);
});

test("race association cannot forge another event identity and long trail results remain separate", async () => {
  const owner = await user("关联校验跑史");
  const db = getDb();
  const race = db.prepare("SELECT id,name,race_date FROM races LIMIT 1").get();
  const forged = await request(app).post(API).set(owner.auth).send(fixture("我的另一个比赛", "2024-10-01", { raceId: race.id }));
  assert.equal(forged.status, 400);
  assert.match(forged.body.error, /关联赛事/);
  const ultra = await create(owner, fixture("越野长距离", "2025-05-01", { distance: "other", kind: "trail", netTime: "28:31:20" }));
  assert.equal(ultra.netSeconds, 102680);
  assert.equal(ultra.isPb, false);
  assert.throws(() => normalizeEntry(fixture("超过上限", "2024-01-01", { netTime: "73:00:00" })), /72 小时/);
  assert.throws(() => parseImportText('赛事,日期\n"坏引号,2024-01-01'), /未闭合/);
  const text = parseImportText("比赛名称：2025 天津马拉松\n日期：2025年10月26日\n项目：全马\n净计时：03:52:42\n枪声成绩：03:54:00");
  assert.equal(text[0].raceDate, "2025-10-26");
  assert.equal(text[0].netTime, "03:52:42");
  const spaced = parseImportText("2025 北京马拉松\n日期 2025年10月26日\n全 程 马 拉 松\n净 计 时 成 绩 03:52:42\n枪 声 成 绩 03:54:00");
  assert.equal(spaced[0].netTime, "03:52:42");
  assert.equal(spaced[0].gunTime, "03:54:00");
  assert.equal(spaced[0].distance, "full");
  const splitLabels = parseImportText("2025 北京马拉松\n2025年10月26日\n全马\n净计时成绩\n03:52:42\n枪声成绩\n03:54:00");
  assert.equal(splitLabels[0].netTime, "03:52:42");
  assert.equal(splitLabels[0].gunTime, "03:54:00");
});

test("deleting an account clears private history, image files and repeat-import hashes", async () => {
  const owner = await user("跑史注销清理");
  const entry = await create(owner, fixture("注销清理比赛", "2023-01-01"));
  const deleted = await create(owner, fixture("之前移除的比赛", "2022-01-01"));
  await request(app).delete(entryUrl(deleted)).set(owner.auth);
  const image = await request(app).post(entryUrl(entry) + "/media?kind=photo").set(owner.auth).attach("file", png, "private.png");
  assert.equal(image.status, 200);
  const db = getDb(), filename = db.prepare("SELECT filename FROM race_history_media WHERE user_id=?").get(owner.id).filename;
  const previousToken = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = "history-admin-cleanup";
  try {
    const removed = await request(app).delete("/marathon/api/admin/users/" + owner.id).set("Authorization", "Bearer history-admin-cleanup");
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
  } finally { if (previousToken === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = previousToken; }
  for (const table of ["race_history_entries", "race_history_media", "race_history_tombstones"]) assert.equal(db.prepare("SELECT COUNT(*) AS n FROM " + table + " WHERE user_id=?").get(owner.id).n, 0);
  assert.equal(fs.existsSync(path.join(historyRoot(), filename)), false);
  assert.equal((await request(app).get(image.body.media.url + "?t=" + owner.token)).status, 401);
});
