const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, before, after } = require("node:test");
const { chromium } = require("playwright-core");
const reader = require("./reader.js");
const source = fs.readFileSync(path.join(__dirname, "reader.js"), "utf8");

let browser, page;
before(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  page = await browser.newPage();
  // All test pages are generated locally. No live site, script or image loads.
  await page.route("**/*", (route) => route.abort());
});
after(async () => { if (browser) await browser.close(); });

function table(headers, rows, attrs = "") {
  return `<table ${attrs}><thead><tr>${headers.map((value) => `<th>${value}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${value}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

async function read(html, method = "readVisibleScores") {
  await page.setContent(html);
  await page.addScriptTag({ content: source });
  return page.evaluate((operation) => {
    try { return { value: globalThis.RunchinaScoreReader[operation](document) }; }
    catch (error) { return { error: { code: error.code, message: error.message } }; }
  }, method);
}

test("plain table mapping follows semantic headers and preserves both clocks", () => {
  const result = reader.normalizeTable({
    headers: ["枪声成绩", "参赛号", "比赛日期", "净计时", "赛事名称", "项目", "城市", "完赛状态", "赛事类型", "参赛形式"],
    rows: [["3:15:20", "A007", "2025年10月26日", "03:12:45", "示例马拉松", "半程马拉松", "测试城市", "完赛", "路跑", "线下"]]
  });
  assert.deepEqual(result.entries[0], {
    name: "示例马拉松", raceDate: "2025-10-26", distance: "half", distanceText: "半程马拉松",
    netTime: "03:12:45", gunTime: "03:15:20", unknownTime: "", timing: "net", bib: "A007", city: "测试城市", province: "", status: "finished", kind: "road", meet: "offline"
  });
  assert.deepEqual(result.issues, []);
});

test("generic finish time remains unknown and missing facts cannot acquire importer defaults", () => {
  const result = reader.normalizeTable({ headers: ["赛事名称", "比赛日期", "项目", "成绩"], rows: [["示例马拉松", "2025", "", "04:00:00"]] });
  const entry = result.entries[0];
  assert.equal(entry.raceDate, "");
  assert.equal(entry.distance, "");
  assert.equal(entry.timing, "unknown");
  assert.equal(entry.unknownTime, "04:00:00");
  for (const field of ["status", "kind", "meet"]) assert.equal(entry[field], "待确认");
  assert.ok(result.issues.length >= 5);
  const unexpected = reader.normalizeTable({ headers: ["赛事名称", "项目", "状态", "赛事类型", "参赛形式"], rows: [["测试赛", "全马", "constructor", "__proto__", "constructor"]] });
  for (const field of ["status", "kind", "meet"]) assert.equal(unexpected.entries[0][field], "待确认");
});

test("DNF and contradictory net/gun times are preserved for explicit correction", () => {
  const result = reader.normalizeTable({ headers: ["赛事名称", "项目", "净计时", "枪声成绩", "状态"], rows: [["合成测试赛", "全马", "04:10:00", "04:00:00", "DNF"]] });
  assert.equal(result.entries[0].status, "dnf");
  assert.equal(result.entries[0].netTime, "04:10:00");
  assert.equal(result.entries[0].gunTime, "04:00:00");
  assert.ok(result.issues.some((issue) => issue.includes("净计时长于")));
  assert.ok(result.issues.some((issue) => issue.includes("状态与完赛用时冲突")));
});

test("unrecognized nonempty times and generic times alongside labeled clocks cannot silently disappear", () => {
  for (const value of ["3小时12分", "03:99:00", "73:00:00", "未知用时", "2025-01-01 03:12:45"]) {
    assert.throws(() => reader.normalizeTable({ headers: ["赛事名称", "项目", "净计时"], rows: [["测试赛", "全马", value]] }), (error) => error.code === "UNRECOGNIZED_TIME" && !error.message.includes(value));
  }
  assert.throws(() => reader.normalizeTable({ headers: ["赛事名称", "项目", "净计时", "成绩"], rows: [["测试赛", "全马", "03:12:45", "03:15:00"]] }), { code: "AMBIGUOUS_TIME" });
});

test("invalid dates, nonstandard distances and ambiguous project lists remain unfilled", () => {
  for (const [day, project] of [["2025-02-29", "15公里"], ["2025-01", "半程、全程"], ["日期待公布", "上半程"]]) {
    const result = reader.normalizeTable({ headers: ["赛事名称", "日期", "项目"], rows: [["示例马拉松", day, project]] });
    assert.equal(result.entries[0].raceDate, "");
    assert.equal(result.entries[0].distance, "");
    assert.equal(result.entries[0].distanceText, project);
    assert.ok(!JSON.stringify(result).includes(day));
  }
});

test("sensitive columns are not normalized and suspected sensitive allowed cells fail without echoing", () => {
  const headers = ["姓名", "身份证号", "手机号", "赛事名称", "项目", "号码布"];
  const result = reader.normalizeTable({ headers, rows: [["合成姓名", "110101199001011234", "13800138000", "测试赛", "全马", "A0001"]] });
  const text = JSON.stringify(result);
  for (const excluded of ["合成姓名", "110101199001011234", "13800138000", "身份证", "手机号"]) assert.ok(!text.includes(excluded));
  for (const suspected of ["110101199001011234", "110101900101123", "13800138000", "１３８００１３８０００", "138 0013 8000", "110101199001011234 13800138000", "138\u200b0013\u200b8000"]) {
    assert.throws(() => reader.normalizeTable({ headers: ["赛事名称", "项目", "号码布"], rows: [["测试赛", "全马", suspected]] }), (error) => error.code === "SENSITIVE_CELL" && !error.message.includes(suspected));
  }
});

test("duplicate aliases and structural mismatch fail, repeated identical rows deduplicate", () => {
  assert.throws(() => reader.normalizeTable({ headers: ["赛事名称", "项目", "净计时", "净成绩"], rows: [] }), { code: "DUPLICATE_COLUMN" });
  assert.throws(() => reader.normalizeTable({ headers: ["赛事名称", "项目"], rows: [["测试赛"]] }), { code: "COLUMN_MISMATCH" });
  const row = ["测试赛", "全马"];
  assert.equal(reader.normalizeTable({ headers: ["赛事名称", "项目"], rows: [row, row] }).entries.length, 1);
  assert.throws(() => reader.normalizeTable({ headers: ["赛事名称", "项目"], rows: Array.from({ length: 101 }, () => row) }), { code: "TOO_MANY_ROWS" });
  assert.throws(() => reader.normalizeTable({ headers: ["赛事名称", "项目"], rows: [["赛".repeat(160001), "全马"]] }), { code: "EXPORT_TOO_LARGE" });
});

test("DOM reads only allowed rendered cells and never input values or hidden rows/text", async () => {
  const html = table(["姓名", "身份证号", "赛事名称", "项目", "净计时"], [
    ["合成姓名", "110101199001011234", '可见赛<span hidden>13800138000</span><input value="110101199001011234"><span style="display:none">秘密片段</span>', "半马", "03:00:00"],
    ["另一个合成姓名", "110101199001011234", "隐藏赛", "全马", "04:00:00"]
  ]).replace("<tr><td>另一个合成姓名", '<tr style="display:none"><td>另一个合成姓名') + table(["赛事名称", "项目"], [["整表隐藏", "全马"]], 'style="display:none"');
  const result = await read(html);
  assert.equal(result.value.entries.length, 1);
  assert.equal(result.value.entries[0].name, "可见赛");
  const serialized = JSON.stringify(result);
  for (const excluded of ["合成姓名", "110101199001011234", "13800138000", "秘密片段", "隐藏赛", "整表隐藏"]) assert.ok(!serialized.includes(excluded));
});

test("no table, unheaded layouts and merged headers fail without body-text fallback", async () => {
  assert.equal((await read('<p>赛事：测试马拉松 2025-01-01 全马 03:00:00</p><input value="test">')).error.code, "NO_VISIBLE_TABLE");
  assert.equal((await read("<table><tr><td>赛事名称</td><td>项目</td></tr><tr><td>测试赛</td><td>全马</td></tr></table>")).error.code, "NO_SCORE_TABLE");
  const merged = '<table><thead><tr><th rowspan="2">赛事名称</th><th colspan="2">成绩</th></tr><tr><th>项目</th><th>净计时</th></tr></thead><tbody><tr><td>测试赛</td><td>全马</td><td>03:00:00</td></tr></tbody></table>';
  assert.equal((await read(merged)).error.code, "COMPLEX_HEADERS");
  assert.equal((await read(table(["赛事名称", "项目", "净计时", "净成绩"], [["测试赛", "全马", "03:00:00", "03:00:00"]]))).error.code, "DUPLICATE_COLUMN");
});

test("duplicate rendered tables deduplicate and different result tables are ambiguous", async () => {
  const one = table(["赛事名称", "项目"], [["测试赛", "半马"]]);
  const duplicate = await read(one + one);
  assert.equal(duplicate.value.entries.length, 1);
  assert.equal(duplicate.value.tableCount, 2);
  assert.equal((await read(one + table(["赛事名称", "项目"], [["另一测试赛", "全马"]]))).error.code, "AMBIGUOUS_TABLE");
});

function elTable({ extraBody = false, mismatch = false } = {}) {
  const header = '<table class="el-table__header"><thead><tr><th class="el-table_1_column_1">赛事名称</th><th class="el-table_1_column_2">项目</th></tr></thead></table>';
  const body = `<table class="el-table__body"><tbody><tr><td class="${mismatch ? "el-table_2_column_1" : "el-table_1_column_1"}">组件测试赛</td><td class="el-table_1_column_2">半马</td></tr></tbody></table>`;
  return `<div class="el-table"><div class="el-table__header-wrapper">${header}</div><div class="el-table__body-wrapper">${body}${extraBody ? body : ""}</div><div class="el-table__fixed"><div class="el-table__header-wrapper">${header}</div><div class="el-table__body-wrapper">${body}</div></div></div>`;
}

test("Element UI pairs only the main header/body within one container and ignores fixed mirrors", async () => {
  const result = await read(elTable());
  assert.equal(result.value.entries[0].name, "组件测试赛");
  assert.equal(result.value.entries[0].distance, "half");
  assert.equal((await read(elTable({ extraBody: true }))).error.code, "EL_TABLE_ASSOCIATION");
  assert.equal((await read(elTable({ mismatch: true }))).error.code, "EL_TABLE_ASSOCIATION");
  const disconnected = '<div class="el-table"><div class="el-table__header-wrapper">' + table(["赛事名称", "项目"], []) + '</div></div><div class="el-table"><div class="el-table__body-wrapper"><table><tbody><tr><td>不得猜配</td><td>全马</td></tr></tbody></table></div></div>';
  assert.equal((await read(disconnected)).error.code, "EL_TABLE_ASSOCIATION");
});

test("structure inspection exports only counts, canonical allowed headings and public hosts", async () => {
  const html = '<input name="姓名" value="合成姓名"><input type="hidden" value="110101199001011234"><input type="password" value="秘密">' +
    '<script src="https://static.geetest.com/client.js?token=secret"></script><script src="https://static.geetest.com/other.js"></script><script src="https://cdn.example.com/private/secret.js?person=110101199001011234"></script>' +
    table(["姓名", "身份证号", "赛事名称", "项目", "未知身份列"], [["合成姓名", "110101199001011234", "不应在结构报告出现", "全马", "秘密"]]);
  const result = (await read(html, "inspectStructure")).value;
  assert.deepEqual(result.inputTypeCounts, { text: 1, hidden: 1, password: 1 });
  assert.deepEqual(result.tables[0].recognizedHeaders, ["name", "distance"]);
  assert.equal(result.tables[0].unknownHeaderCount, 3);
  assert.deepEqual(result.scriptHostnames, ["cdn.example.com", "static.geetest.com"]);
  assert.deepEqual(result.captchaHints, [{ provider: "极验", evidence: "public-script-host" }]);
  const serialized = JSON.stringify(result);
  for (const excluded of ["姓名", "身份证", "110101199001011234", "不应在结构报告出现", "秘密", "client.js", "token", "/private/", "未知身份列"]) assert.ok(!serialized.includes(excluded));
});

test("known security-block title or status stops reading before any scores", async () => {
  const scores = table(["赛事名称", "项目"], [["不能导出", "全马"]]);
  for (const guard of ["<title>请求已被拦截</title>", "<title>Access Restricted</title>", '<span id="statusCode">567</span>']) {
    const result = await read(guard + scores);
    assert.equal(result.error.code, "SITE_BLOCKED");
    assert.ok(!JSON.stringify(result).includes("不能导出"));
  }
  assert.equal((await read('<title>拖动滑块完成验证</title>', "isBlocked")).value, false);
});
