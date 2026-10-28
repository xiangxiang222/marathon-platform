const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const base = process.env.MARATHON_PREVIEW_URL || "http://127.0.0.1:5174/marathon";
const report = { kind: "Detail recovery and route isolation using in-memory APIs", checks: [], screenshots: [], errors: [] };

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  try {
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript(() => localStorage.setItem("marathon_token", "fixture-only"));
      const page = await context.newPage();
      page.on("pageerror", (error) => report.errors.push(error.message));
      const failures = new Set(["/clubs/7/internals/9", "/clubs/7/calls/8", "/runs"]);
      await page.route("**/marathon/api/**", async (route) => {
        const apiPath = new URL(route.request().url()).pathname.replace("/marathon/api", "");
        const reply = (status, data) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
        if (failures.delete(apiPath)) return reply(503, { error: "测试服务暂不可用" });
        if (apiPath.startsWith("/clubs/7/internals/")) {
          const id = Number(apiPath.split("/").at(-1));
          return reply(200, { race: { id, title: id === 9 ? "周末队内十公里" : "另一场队内半马", startsLabel: "11月8日", deadlineLabel: "11月7日", distanceLabel: "10公里", statusLabel: "已结束", groups: [], shareText: "队内赛记录" } });
        }
        if (apiPath === "/clubs/7/calls/8") return reply(200, { call: { id: 8, title: "城市半马成绩接龙", raceDate: "2026-11-08", deadline: "2026-11-10T22:00", deadlineLabel: "11月10日", closed: true, distances: ["half"], groups: [], members: [], summary: "这次没有新的 PB" } });
        if (apiPath === "/clubs/7") return reply(200, { club: { id: 7, staff: false } });
        if (apiPath === "/runs") return reply(200, { month: { km: 0, count: 0, days: 0, target: 0, canFlag: true }, year: { km: 0 }, total: { km: 0, count: 0 }, runs: [] });
        if (apiPath === "/races") return reply(200, { races: [], total: 0, page: 1, pages: 1 });
        if (apiPath === "/reminders") return reply(200, { reminders: [] });
        throw new Error("Unexpected fixture API " + apiPath);
      });
      for (const scenario of [
        { route: "/clubs/7/internals/9", heading: "周末队内十公里", kind: "internal" },
        { route: "/clubs/7/calls/8", heading: "城市半马成绩接龙", kind: "call" },
        { route: "/sport", heading: "运动记录", kind: "exercise" }
      ]) {
        await page.goto(base + scenario.route);
        await page.getByRole("alert").getByText("测试服务暂不可用").waitFor();
        await page.getByRole("button", { name: "重新加载", exact: true }).click();
        await page.getByRole("heading", { name: scenario.heading, exact: true }).waitFor();
        await page.getByRole("alert").waitFor({ state: "hidden" });
        const size = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
        assert.ok(size.scrollWidth <= size.width + 1);
        const screenshot = "recovery-" + scenario.kind + "-" + width + ".png";
        await page.screenshot({ path: path.join(__dirname, screenshot), fullPage: true });
        report.screenshots.push(screenshot);
        report.checks.push({ name: scenario.kind + " initial error recovers", width, ...size });
        if (scenario.kind === "internal") {
          await page.evaluate(() => document.querySelector("#app").__vue_app__.config.globalProperties.$router.push("/clubs/7/internals/10"));
          await page.getByRole("heading", { name: "另一场队内半马", exact: true }).waitFor();
          assert.equal(await page.getByRole("heading", { name: scenario.heading, exact: true }).count(), 0);
          report.checks.push({ name: "same component route changes replace old detail", width });
        }
      }
      await page.goto(base + "/this-link-does-not-exist");
      await page.getByRole("heading", { name: "这个页面暂时找不到了" }).waitFor();
      await page.getByRole("link", { name: "查看赛事", exact: true }).click();
      await page.locator(".home-page").waitFor();
      report.checks.push({ name: "unknown link offers a usable route back", width });
      await context.close();
    }
    assert.deepEqual(report.errors, []);
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
  fs.writeFileSync(path.join(__dirname, "navigation-browser-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, screenshots: report.screenshots.length, error: report.error }, null, 2));
});
