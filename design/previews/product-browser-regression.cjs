const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");

const base = process.env.MARATHON_PREVIEW_URL || "http://127.0.0.1:5174/marathon";
const output = __dirname;
const report = { kind: "Product browsing regressions with in-memory API fixtures", checks: [], screenshots: [], errors: [] };

async function auditWidth(page, name) {
  const metrics = await page.evaluate(() => ({ width: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth }));
  assert.ok(metrics.body <= metrics.width + 1, name + " body overflows horizontally");
  assert.ok(metrics.document <= metrics.width + 1, name + " document overflows horizontally");
  report.checks.push({ name, ...metrics });
  const filename = "product-" + name + ".png";
  await page.screenshot({ path: path.join(output, filename), fullPage: true });
  report.screenshots.push(filename);
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    const queries = [];
    let firstHomeFailure = true;
    await page.route("**/marathon/api/**", async (route) => {
      const url = new URL(route.request().url());
      const pathName = url.pathname.replace("/marathon/api", "");
      if (pathName === "/races") {
        queries.push(url.searchParams.toString());
        if (!url.searchParams.has("q") && firstHomeFailure) {
          firstHomeFailure = false;
          await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "服务暂不可用" }) });
          return;
        }
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ races: [{ id: "trail-online", name: "云上越野训练赛", raceDate: "2026-11-18", city: "杭州", province: "浙江", distances: ["half"], distanceLabels: ["半程马拉松"], kind: "trail", kindLabels: ["越野"], meet: "online", regStatus: "报名中", nodes: [], groups: [], guide: [], pacerSheets: [], routeSheets: [], distances: ["half"], open: true, daysLeft: 4 }], total: 1, pages: 1, page: 1 }) });
      } else if (pathName === "/reminders") {
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ reminders: [] }) });
      } else if (pathName.startsWith("/clubs/directory")) {
        const query = url.searchParams.get("q") || "";
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ clubs: query ? [{ id: 99, name: "奥森晨跑团", leader: "小鹿", members: 28, joined: false, pending: false }] : [] }) });
      } else if (pathName === "/clubs/55/calls/8") {
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ call: { id: 8, title: "杭州马拉松", raceDate: "2026-11-18", deadline: "2026-11-20T22:00", deadlineLabel: "11月20日", closed: true, note: "净计时", summary: "这次 PB：小鹿 半马 1:42:00", shareText: "奥森跑团 · 杭马接龙", boardText: "杭州马拉松\n1 小鹿 1:42:00", distances: ["half"], otherKm: "", members: [], groups: [{ distance: "half", label: "半马", rows: [{ id: 1, place: 1, nickname: "小鹿", clock: "1:42:00", tag: "PB", mine: false, hasSheet: false }] }] } }) });
      } else if (pathName === "/clubs/55") {
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ club: { id: 55, staff: false } }) });
      } else {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "unexpected " + pathName }) });
      }
    });

    await page.goto(base + "/");
    await page.getByRole("alert").getByRole("button", { name: "重试" }).waitFor();
    await page.getByRole("alert").getByRole("button", { name: "重试" }).click();
    await page.getByText("云上越野训练赛").waitFor();
    await page.getByRole("navigation", { name: "赛事形式" }).getByRole("button", { name: "线上赛" }).click();
    await page.getByRole("navigation", { name: "赛事类型" }).getByRole("button", { name: "越野赛" }).click();
    const combined = queries.at(-1);
    assert.equal(new URLSearchParams(combined).get("kind"), "trail");
    assert.equal(new URLSearchParams(combined).get("meet"), "online");
    await page.getByText("云上越野训练赛").waitFor();
    await page.getByText("正在加载赛历…").waitFor({ state: "hidden" });
    report.checks.push({ name: "race track type and participation format combine independently", query: combined });
    await auditWidth(page, "home-" + width);

    await context.close();
  }

  for (const width of [320, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    const requests = [];
    await page.route("**/marathon/api/**", async (route) => {
      const url = new URL(route.request().url());
      requests.push(url.pathname + url.search);
      const query = url.searchParams.get("q") || "";
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ clubs: query ? [{ id: 99, name: "奥森晨跑团", leader: "小鹿", members: 28, joined: false, pending: false }] : [] }) });
    });
    await page.goto(base + "/clubs");
    await page.getByRole("textbox", { name: "搜索跑团" }).fill("奥森晨跑");
    await page.getByText("奥森晨跑团").waitFor();
    assert.ok(requests.some((entry) => entry.includes("/clubs/directory?q=" + encodeURIComponent("奥森晨跑"))));
    await page.getByRole("link", { name: /查看介绍/ }).waitFor();
    report.checks.push({ name: "guest can search public clubs and open an introduction", requests });
    await auditWidth(page, "guest-club-search-" + width);
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.route("**/marathon/api/**", async (route) => {
      const url = new URL(route.request().url());
      const pathName = url.pathname.replace("/marathon/api", "");
      if (pathName === "/clubs/55/calls/8") {
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ call: { id: 8, title: "杭州马拉松", raceDate: "2026-11-18", deadline: "2026-11-20T22:00", deadlineLabel: "11月20日", closed: true, note: "净计时", summary: "这次 PB：小鹿 半马 1:42:00", shareText: "奥森跑团 · 杭马接龙", boardText: "杭州马拉松\n1 小鹿 1:42:00", distances: ["half"], otherKm: "", members: [], groups: [{ distance: "half", label: "半马", rows: [{ id: 1, place: 1, nickname: "小鹿", clock: "1:42:00", tag: "PB", mine: false, hasSheet: false }] }] } }) });
      } else if (pathName === "/clubs/55") {
        await route.fulfill({ contentType: "application/json", body: JSON.stringify({ club: { id: 55, staff: false } }) });
      } else {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "unexpected " + pathName }) });
      }
    });
    await page.goto(base + "/clubs/55/calls/8");
    await page.getByRole("heading", { name: "杭州马拉松", exact: true }).waitFor();
    await page.getByRole("button", { name: "生成成绩长图" }).click();
    await page.getByAltText("成绩接龙长图").waitFor();
    const posterSize = await page.getByAltText("成绩接龙长图").evaluate((image) => ({ width: image.naturalWidth, height: image.naturalHeight }));
    assert.equal(posterSize.width, 750);
    assert.ok(posterSize.height > 300);
    await page.locator(".poster-overlay").click({ position: { x: 3, y: 3 } });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出完整 CSV" }).click();
    assert.equal((await download).suggestedFilename(), "跑团成绩接龙.csv");
    report.checks.push({ name: "result call exports a poster image and a full CSV", posterSize });
    await auditWidth(page, "result-call-export-390");
    await context.close();
  }

  await browser.close();
  assert.deepEqual(report.errors, []);
  report.passed = true;
  fs.writeFileSync(path.join(output, "product-browser-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, screenshots: report.screenshots.length }, null, 2));
}

main().catch((error) => {
  report.passed = false;
  report.error = error.stack || String(error);
  fs.writeFileSync(path.join(output, "product-browser-report.json"), JSON.stringify(report, null, 2));
  console.error(error);
  process.exitCode = 1;
});
