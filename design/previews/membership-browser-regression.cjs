const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");

const base = process.env.MARATHON_PREVIEW_URL || process.env.MARATHON_WEB_URL || "http://127.0.0.1:5174/marathon";
const report = { kind: "Club membership browser acceptance; every API call uses an in-memory fixture", startedAt: new Date().toISOString(), checks: [], screenshots: [], errors: [], unexpected: [] };

function clubData(owner) {
  return {
    club: { id: 44, name: "奥森晨跑团", code: "MEMBERSHIP", owner, staff: owner, role: owner ? "owner" : "member", roleLabel: owner ? "团长" : "成员" },
    members: [
      { id: 1, nickname: "团长小林", avatar: "", owner: true, role: "owner", roleLabel: "团长", points: 10 },
      { id: 2, nickname: "测试跑友", avatar: "", owner: false, role: "member", roleLabel: "成员", points: 5 }
    ],
    board: [], ranks: [], groups: [], activities: [], gifts: [], requests: [], checkins: [], checkedIn: false, myPoints: 5
  };
}

async function setup(context, owner) {
  await context.addInitScript(() => {
    localStorage.setItem("marathon_token", "membership-fixture-token");
    localStorage.setItem("marathon_name", "测试跑友");
  });
  const state = { writes: [], failLeave: false, left: false };
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.route("**/marathon/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.replace("/marathon/api", "");
    const method = request.method();
    let data;
    let status = 200;
    if (method !== "GET") {
      state.writes.push({ method, endpoint, body: request.postDataJSON() });
      if (method === "POST" && endpoint === "/clubs/44/leave") {
        if (state.failLeave) {
          status = 503;
          data = { error: "服务暂不可用，请稍后重试退出" };
        } else {
          state.left = true;
          data = { ok: true, removedSignups: { activities: 1, meetups: 0, internalRaces: 0 } };
        }
      }
    } else if (endpoint === "/clubs/44") data = clubData(owner);
    else if (endpoint === "/clubs/44/fees") data = { current: null, history: [] };
    else if (endpoint === "/clubs/44/calls") data = { calls: [] };
    else if (endpoint === "/clubs/44/meetups") data = { meetups: [], tiers: [] };
    else if (endpoint === "/clubs/44/internals") data = { races: [] };
    else if (endpoint === "/clubs/44/albums") data = { albums: [] };
    else if (endpoint === "/clubs/44/posts") data = { posts: [] };
    else if (endpoint === "/clubs/44/attendance") data = { rows: [], total: 0, label: "本月", me: { placeLabel: "未上榜", count: 0 } };
    else if (endpoint === "/clubs/directory") data = { clubs: [] };
    else if (endpoint === "/me") data = { user: { id: 2, nickname: "测试跑友", leader: false }, clubs: state.left ? [] : [{ id: 44, name: "奥森晨跑团", roleLabel: "成员" }], applications: [] };
    if (!data) {
      report.unexpected.push({ method, endpoint });
      status = 500;
      data = { error: "Unexpected mock endpoint" };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto(base + "/clubs/44");
  await page.getByRole("heading", { name: "奥森晨跑团", exact: true }).waitFor();
  await page.locator(".seg").first().getByRole("button", { name: "成员", exact: true }).click();
  await page.getByRole("heading", { name: "跑团关系", exact: true }).waitFor();
  return { page, state };
}

async function snapshot(page, filename) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const dimensions = await page.evaluate(() => ({ width: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth }));
  assert.ok(dimensions.body <= dimensions.width + 1, filename + " body overflow");
  assert.ok(dimensions.document <= dimensions.width + 1, filename + " document overflow");
  await page.screenshot({ path: path.join(__dirname, filename), fullPage: true });
  report.screenshots.push(filename);
  return dimensions;
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const { page, state } = await setup(context, false);
      const leave = page.getByRole("button", { name: "退出跑团", exact: true });
      await leave.waitFor();
      await page.getByText("退出后将无法查看团内详情", { exact: false }).waitFor();
      page.once("dialog", (dialog) => {
        assert.match(dialog.message(), /明日及之后未打卡的约跑报名会取消/);
        assert.match(dialog.message(), /成绩、积分和已打卡记录保留/);
        dialog.dismiss();
      });
      await leave.click();
      assert.equal(state.writes.length, 0);
      assert.equal(new URL(page.url()).pathname, "/marathon/clubs/44");
      report.checks.push({ name: "member sees consequences and can cancel without sending a request", width });

      state.failLeave = true;
      page.once("dialog", (dialog) => dialog.accept());
      await leave.click();
      await page.getByText("服务暂不可用，请稍后重试退出", { exact: true }).waitFor();
      await leave.waitFor({ state: "visible" });
      assert.equal(await leave.isEnabled(), true);
      assert.equal(new URL(page.url()).pathname, "/marathon/clubs/44");
      assert.deepEqual(state.writes, [{ method: "POST", endpoint: "/clubs/44/leave", body: {} }]);
      report.checks.push({ name: "a failed leave stays on the club page, explains the failure, and permits retry", width, dimensions: await snapshot(page, "membership-failed-" + width + ".png") });

      state.failLeave = false;
      page.once("dialog", (dialog) => dialog.accept());
      await leave.click();
      await page.waitForURL(base + "/clubs");
      await page.getByText("还没有加入跑团", { exact: true }).waitFor();
      assert.equal(state.writes.length, 2);
      assert.ok(state.writes.every((write) => write.method === "POST" && write.endpoint === "/clubs/44/leave"));
      report.checks.push({ name: "confirmed leave sends only the current club endpoint and returns to the refreshed club list", width, writes: state.writes });
      await context.close();

      const ownerContext = await browser.newContext({ viewport: { width, height: 900 } });
      const { page: ownerPage, state: ownerState } = await setup(ownerContext, true);
      await ownerPage.getByText("团长请先在成员列表中转让跑团，再退出。", { exact: true }).waitFor();
      assert.equal(await ownerPage.getByRole("button", { name: "退出跑团", exact: true }).count(), 0);
      assert.deepEqual(ownerState.writes, []);
      report.checks.push({ name: "owner sees transfer instructions and no direct leave action", width, dimensions: await snapshot(ownerPage, "membership-owner-" + width + ".png") });
      await ownerContext.close();
    }
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.unexpected, []);
    report.passed = true;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  report.passed = false;
  report.error = error.stack || String(error);
  process.exitCode = 1;
}).finally(() => {
  fs.writeFileSync(path.join(__dirname, "membership-browser-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, screenshots: report.screenshots.length, errors: report.errors, unexpected: report.unexpected, error: report.error }, null, 2));
});
