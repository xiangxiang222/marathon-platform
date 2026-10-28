const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "miniprogram/pages/activity/activity.js"), "utf8");
const markup = fs.readFileSync(path.join(root, "miniprogram/pages/activity/activity.wxml"), "utf8");
const report = { kind: "Mini-program check-in Page VM acceptance", checks: [] };

function fixture(scenario) {
  let definition;
  const requests = [];
  let futureStarted = false;
  vm.runInNewContext(source, {
    require(name) {
      if (name === "../../utils/request") return { request: (endpoint, method = "GET", body = {}) => {
        requests.push({ endpoint, method, body });
        if (method !== "GET") return Promise.resolve({ awarded: false });
        const available = scenario === "live" || scenario === "ended" || scenario === "unsigned" || (scenario === "future" && futureStarted);
        const status = scenario === "cancelled" ? "cancelled" : scenario === "ended" ? "ended" : available ? "live" : "open";
        return Promise.resolve({
          activity: { id: 9, title: "晨跑", startsAt: "2026-11-01T06:30", status, checkAvailable: available,
            mine: { signed: scenario !== "unsigned", km: null, groupId: 0 }, action: { enabled: false, label: "查看活动" } },
          signups: [], groups: [], album: { photoCount: 0, videoCount: 0 }, staff: false,
          checks: scenario === "unsigned" ? [{ userId: 8, nickname: "旧成员", km: 10, historical: true }] : []
        });
      } };
      throw new Error("Unexpected module " + name);
    },
    Page: (page) => { definition = page; },
    wx: { showShareMenu() {} }
  }, { filename: "activity.js" });
  const page = {
    ...definition,
    clubId: "3",
    activityId: "9",
    data: { ...JSON.parse(JSON.stringify(definition.data)), clubId: "3", activityId: "9" },
    setData(patch) { Object.assign(this.data, patch); }
  };
  return { page, requests, setFutureStarted(value) { futureStarted = value; } };
}

async function main() {
  for (const scenario of ["future", "live", "ended", "cancelled", "unsigned"]) {
    const { page, requests, setFutureStarted } = fixture(scenario);
    await page.load();
    const checkPanel = markup.slice(markup.indexOf("class=\"check-section\""), markup.indexOf("<view wx:if=\"{{staff}}\" class=\"staff-section\""));
    assert.match(checkPanel, /activity\.mine\.signed && activity\.checkAvailable/);
    assert.match(checkPanel, /活动开始后可打卡/);
    assert.match(checkPanel, /活动已取消，不能打卡/);
    assert.match(checkPanel, /item\.historical/);

    page.setData({ km: "8.5" });
    const before = requests.length;
    page.check();
    if (scenario === "live" || scenario === "ended") {
      assert.equal(requests.at(-1).method, "POST");
      assert.equal(requests.at(-1).endpoint, "/clubs/3/activities/9/check");
    } else assert.equal(requests.length, before, scenario + " must not submit a check-in");

    if (scenario === "future") {
      setFutureStarted(true);
      await page.retry();
      assert.equal(page.data.activity.checkAvailable, true);
      page.check();
      assert.equal(requests.at(-1).method, "POST", "refreshing after start enables check-in");
    }
    if (scenario === "cancelled") assert.equal(page.data.activity.checkAvailable, false);
    if (scenario === "unsigned") {
      assert.equal(page.data.activity.checkAvailable, true);
      assert.equal(page.data.activity.mine.signed, false);
      assert.equal(page.data.checks[0].historical, true);
    }
    report.checks.push({ scenario, passed: true });
  }
  report.passed = true;
}

main().catch((error) => {
  report.passed = false;
  report.error = error.stack || String(error);
  process.exitCode = 1;
}).finally(() => {
  fs.writeFileSync(path.join(__dirname, "mini-checkin-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
