const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "popup.js"), "utf8");
const official = "https://www.runchina.org.cn/#/data-score/public-score/list";

function harness({ url = official, currentUrl = url, blocked = false, mode = "scores", entryCount = 1, platformError = "" } = {}) {
  const status = { textContent: "", classList: { add() {}, remove() {} } };
  const actions = {}, saved = [], calls = [];
  const buttons = ["export-scores", "export-structure"].map(id => ({
    disabled: false,
    addEventListener(_event, fn) { actions[id] = fn; }
  }));
  const entries = Array.from({ length: entryCount }, (_, i) => ({ name: "测试赛事" + i, raceDate: "2025-10-26", distance: "full", netTime: "03:12:45", status: "待确认", kind: "待确认", meet: "待确认" }));
  const report = { tableCount: 1, tables: [{ rowCount: 1, recognizedHeaders: ["name", "netTime"], unknownHeaderCount: 2 }], scriptHostnames: ["captcha.example.org"] };
  const targetContext = vm.createContext({
    URL, location: { href: currentUrl }, document: {},
    RunchinaScoreReader: { isBlocked() { return blocked; }, readVisibleScores() { return { entries, tableCount: 1 }; }, inspectStructure() { return report; } }
  });
  const mockUrl = class extends URL {};
  mockUrl.createObjectURL = blob => { saved.push(blob); return "blob:local-report"; };
  mockUrl.revokeObjectURL = () => {};
  const doc = {
    getElementById(id) { return id === "status" ? status : buttons[id === "export-scores" ? 0 : 1]; },
    querySelectorAll() { return buttons; },
    createElement() { return { click() {}, remove() {} }; },
    body: { appendChild() {} }
  };
  const context = vm.createContext({
    document: doc, URL: mockUrl, Blob, setTimeout() {},
    chrome: {
      tabs: { async query() { return [{ id: 9, url }]; } },
      scripting: { async executeScript(args) {
        calls.push(args);
        if (platformError) throw new Error(platformError);
        if (args.files) return [];
        targetContext.requestedMode = args.args[0];
        return [{ result: vm.runInContext("(" + args.func.toString() + ")(requestedMode)", targetContext) }];
      } }
    }
  });
  vm.runInContext(source, context);
  return { status, saved, calls, buttons, async run() { await actions[mode === "structure" ? "export-structure" : "export-scores"](); } };
}

test("popup only injects into the exact official HTTPS score page", async () => {
  for (const url of ["http://www.runchina.org.cn/#/data-score/public-score/list", "https://www.runchina.org.cn:8443/#/data-score/public-score/list", "https://www.runchina.org.cn.evil.example/#/data-score/public-score/list", "https://www.runchina.org.cn/other#/data-score/public-score/list", "https://www.runchina.org.cn/#/other", "chrome://extensions/"]) {
    const fixture = harness({ url }); await fixture.run();
    assert.equal(fixture.calls.length, 0);
    assert.equal(fixture.saved.length, 0);
    assert.match(fixture.status.textContent, /请先打开/);
  }
});

test("score export drops tab query parameters and keeps current-page provenance", async () => {
  const fixture = harness({ url: official + "?identity=private-value" }); await fixture.run();
  assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.saved.length, 1);
  const content = await fixture.saved[0].text(), value = JSON.parse(content);
  assert.equal(value.entries.length, 1);
  assert.equal(value.source.scope, "current-page");
  assert.equal(value.source.verified, false);
  assert.equal(content.includes("private-value"), false);
  assert.match(fixture.status.textContent, /已导出当前页 1 条/);
  assert.ok(fixture.buttons.every(button => !button.disabled));
});

test("navigation between injection steps and explicit block both stop export", async () => {
  for (const options of [{ currentUrl: "https://elsewhere.example/?identity=private" }, { blocked: true }]) {
    const fixture = harness(options); await fixture.run();
    assert.equal(fixture.saved.length, 0);
    assert.match(fixture.status.textContent, /页面已变化|安全拦截/);
    assert.equal(fixture.calls.length, 2);
  }
});

test("structure export contains metadata, and invalid score counts do not download", async () => {
  const structure = harness({ mode: "structure" }); await structure.run();
  const output = JSON.parse(await structure.saved[0].text());
  assert.equal(output.format, "runchina-page-structure");
  assert.equal(output.entries, undefined);
  for (const entryCount of [0, 101]) {
    const fixture = harness({ entryCount }); await fixture.run();
    assert.equal(fixture.saved.length, 0);
  }
});

test("browser platform errors cannot print a private full URL", async () => {
  for (const platformError of ["Cannot access https://www.runchina.org.cn/?identity=secret", "当前无法访问https://www.runchina.org.cn/?identity=secret"]) {
    const fixture = harness({ platformError }); await fixture.run();
    assert.equal(fixture.saved.length, 0);
    assert.equal(fixture.status.textContent.includes("secret"), false);
  }
});

test("manifest has no background tasks, network hosts, cookies or storage permissions", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.content_scripts, undefined);
});
