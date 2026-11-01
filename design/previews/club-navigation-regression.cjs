// Navigation, stale response and sharing regression. API responses are all in memory.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const ROOT = path.resolve(__dirname, "../..");
const base = (process.env.MARATHON_PREVIEW_URL || "http://127.0.0.1:5174/marathon").replace(/\/$/, "");
const now = Date.parse("2026-10-30T00:00:00Z"); // 08:00 Beijing; browser intentionally uses New York.
const report = { kind: "Mocked club navigation browser regression; no business database writes", checks: [], errors: [], unexpected: [] };
let vite;
const activity = (id, title, startsAt, status, endsAt = "", signed = true) => ({ id, title, startsAt, endsAt, status, mine: { signed }, date: startsAt.slice(0, 10), dateLabel: startsAt.slice(0, 10), clockLabel: startsAt.slice(11), signupCount: 1, capacity: 0, place: "南门", plannedKm: 10, statusLabel: status === "live" ? "进行中" : "报名中" });
const activities = [
  activity(101, "明天已报名", "2026-10-31 07:00", "open"),
  activity(102, "今天正在进行", "2026-10-30 07:00", "live", "2026-10-30 09:00"),
  activity(103, "多年以前未结束", "2024-10-30 07:00", "live"),
  activity(104, "已取消的未来场", "2026-11-01 07:00", "cancelled"),
  activity(105, "结束场", "2026-11-01 07:00", "ended"),
  activity(106, "无效日历日期", "2026-02-30 07:00", "live"),
  activity(107, "当天未填结束时间", "2026-10-30 06:00", "live"),
  activity(108, "未来无效结束时间", "2026-11-02 07:00", "open", "bad-date"),
  activity(109, "未报名的明天", "2026-11-01 07:00", "open", "", false)
];
const period = (id, name, open = true) => ({ id, name, amount: 100, startsOn: "2026-01-01", endsOn: "2026-12-31", open, groups: [] }); // missing mine is deliberate
function fixture(id) {
  return {
    club: { id, name: id === 44 ? "晨光跑团" : "河岸跑团", code: "DO-NOT-SHARE", owner: true, staff: true, role: "owner", roleLabel: "团长" },
    members: [{ id: 1, nickname: "晨光团长", owner: true, role: "owner", roleLabel: "团长", points: 1 }],
    board: [], ranks: [], groups: [], activities: id === 44 ? activities : [], gifts: [], requests: [], checkins: [], checkedIn: false, myPoints: 1
  };
}
async function ready() { try { return (await fetch(base + "/")).ok; } catch { return false; } }
async function run() {
  if (!await ready()) {
    assert.ok(!process.env.MARATHON_PREVIEW_URL, "Configured preview must be running");
    vite = spawn(process.execPath, [path.join(ROOT, "web/node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", new URL(base).port, "--strictPort"], { cwd: path.join(ROOT, "web"), stdio: "ignore" });
    for (let i = 0; i < 50 && !await ready(); i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(await ready(), "Preview started");
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
  try {
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: "America/New_York" });
      await context.addInitScript(({ now }) => {
        Date.now = () => now;
        localStorage.setItem("marathon_token", "navigation-fixture");
        window.shared = []; window.copied = []; window.shareMode = "ok";
        Object.defineProperty(navigator, "share", { configurable: true, value: async data => {
          window.shared.push(data);
          if (window.shareMode === "abort") throw new DOMException("Cancelled", "AbortError");
          if (window.shareMode === "fail") throw new Error("Not supported");
        } });
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => { window.copied.push(text); } } });
      }, { now });
      const page = await context.newPage();
      page.on("pageerror", error => report.errors.push(error.message));
      let releaseOldFee;
      let delayOldFee = false;
      await page.route("**/marathon/api/**", async route => {
        const url = new URL(route.request().url());
        const endpoint = url.pathname.replace("/marathon/api", "");
        const match = /^\/clubs\/(44|45)(.*)$/.exec(endpoint);
        let data;
        if (endpoint === "/me/feedback/summary") data = { total: 0, unread: 0 };
        else if (endpoint === "/me") data = { user: { id: 1, nickname: "晨光团长" }, clubs: [{ id: 44, name: "晨光跑团", roleLabel: "团长" }, { id: 45, name: "河岸跑团", roleLabel: "成员" }] };
        else if (endpoint === "/clubs/directory") data = { clubs: [] };
        else if (match) {
          const id = Number(match[1]), suffix = match[2];
          if (!suffix) data = fixture(id);
          else if (suffix === "/fees") data = { current: period(2, id === 44 ? "晨光本期" : "河岸本期"), history: [period(2, "本期"), period(1, "历史会费", false)] };
          else if (suffix === "/fees/1") {
            if (delayOldFee) await new Promise(resolve => { releaseOldFee = resolve; });
            data = { period: period(1, "旧团晚到会费", false) };
          } else if (suffix === "/calls") data = { calls: [] };
          else if (suffix === "/meetups") data = { meetups: [{ id: 1, dateLabel: "10月31日", place: "约跑南门", statusLabel: "未开始", checkCount: 0 }], tiers: [] };
          else if (suffix === "/internals") data = { races: [] };
          else if (suffix === "/albums") data = { albums: [] };
          else if (suffix === "/posts") data = { posts: [] };
          else if (suffix === "/attendance") data = { rows: [], total: 0, me: { placeLabel: "未上榜", count: 0 } };
          else if (suffix === "/mileage") data = { rank: [], groups: [], feed: [], members: 1, totalKm: 0, totalCount: 0, staff: true };
        }
        if (!data) { report.unexpected.push(endpoint); data = { error: "Unexpected fixture endpoint" }; }
        await route.fulfill({ status: data.error ? 500 : 200, contentType: "application/json", body: JSON.stringify(data) });
      });
      await page.goto(base + "/clubs/44");
      await page.getByRole("heading", { name: "晨光跑团", exact: true }).waitFor();
      await page.getByText("待确认", { exact: false }).waitFor();
      assert.match(await page.locator(".my-club-status button").first().innerText(), /3\s*场团练/);
      assert.match(await page.locator(".next-activity").innerText(), /当天未填结束时间/);
      await page.locator(".my-club-status button").first().click();
      assert.equal(new URL(page.url()).searchParams.get("mine"), "1");
      assert.deepEqual(await page.locator(".block.act h2").allTextContents(), ["当天未填结束时间", "今天正在进行", "明天已报名"]);
      await page.reload();
      await page.locator(".mine-filter[aria-pressed=true]").waitFor();
      assert.equal(await page.locator(".block.act").count(), 3);
      report.checks.push({ width, name: "current and future signed activities only; invalid/past/cancelled excluded; mine URL survives refresh", passed: true });

      await page.getByRole("button", { name: "约跑 1", exact: true }).click();
      assert.equal(new URL(page.url()).searchParams.get("view"), "meetup");
      assert.equal(new URL(page.url()).searchParams.has("mine"), false);
      await page.getByRole("link", { name: /约跑南门/ }).waitFor();
      await page.locator(".primary-tabs").getByRole("button", { name: "成员", exact: true }).click();
      await page.getByRole("button", { name: "会费名单", exact: true }).click();
      await page.getByText("我的状态：未填写", { exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get("view"), "fees");
      await page.getByRole("link", { name: "返回我的跑团", exact: true }).click();
      await page.waitForURL(base + "/clubs");
      await page.goBack();
      await page.getByText("我的状态：未填写", { exact: true }).waitFor();
      report.checks.push({ width, name: "activity/member subnavigation, history return and missing fee mine field remain usable", passed: true });

      await page.locator(".top-invite").click();
      let shared = await page.evaluate(() => window.shared);
      assert.equal(shared.length, 1); assert.equal(shared[0].url, base + "/clubs/44/public"); assert.equal(await page.evaluate(() => window.copied.length), 0);
      await page.evaluate(() => { window.shareMode = "abort"; });
      await page.locator(".top-invite").click();
      assert.equal(await page.evaluate(() => window.copied.length), 0);
      assert.equal(await page.locator(".club-error").count(), 0);
      await page.evaluate(() => { window.shareMode = "fail"; });
      await page.locator(".top-invite").click();
      await page.getByRole("status").filter({ hasText: "跑团名片链接已复制" }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.copied), [base + "/clubs/44/public"]);
      report.checks.push({ width, name: "native public-card sharing, silent cancellation and real copy fallback", passed: true });

      delayOldFee = true;
      await page.getByRole("button", { name: "历史会费", exact: true }).click();
      await page.waitForFunction(() => true);
      for (let i = 0; i < 20 && !releaseOldFee; i++) await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(typeof releaseOldFee, "function");
      await page.getByRole("link", { name: "返回我的跑团", exact: true }).click();
      await page.locator(".my-club").filter({ hasText: "河岸跑团" }).click();
      await page.getByRole("heading", { name: "河岸跑团", exact: true }).waitFor();
      releaseOldFee();
      await page.locator(".primary-tabs").getByRole("button", { name: "成员", exact: true }).click();
      await page.getByRole("button", { name: "会费名单", exact: true }).click();
      await page.getByText("河岸本期", { exact: true }).waitFor();
      assert.equal(await page.getByText("旧团晚到会费", { exact: true }).count(), 0);
      const dimensions = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
      assert.ok(dimensions.document <= width + 1);
      report.checks.push({ width, name: "late previous-club fee response cannot overwrite switched club or expose old data; no horizontal overflow", passed: true });
      await context.close();
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.unexpected, []); report.passed = true;
  } finally { await browser.close(); }
}
run().catch(error => { report.passed = false; report.error = error.stack || String(error); process.exitCode = 1; }).finally(() => {
  if (vite) vite.kill("SIGTERM");
  fs.writeFileSync(path.join(__dirname, "club-navigation-regression-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
