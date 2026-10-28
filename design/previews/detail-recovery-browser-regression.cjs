const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");

const base = process.env.MARATHON_PREVIEW_URL || "http://127.0.0.1:5174/marathon";
const report = { kind: "Album and meetup recovery with in-memory API fixtures", checks: [], screenshots: [], errors: [], requests: [] };
const album = {
  activity: { id: 8, title: "周末奥森训练相册", dateLabel: "11月1日", place: "奥森南门" },
  items: [], photoCount: 0, videoCount: 0, photoLeft: 400, videoLeft: 20,
  coverId: 0, review: false, staff: true
};
const meetup = {
  id: 9, dateLabel: "11月1日", place: "奥森南门", statusLabel: "约跑中",
  note: "半马轻松跑", hint: "集合后一起出发", shareText: "周末奥森半马",
  canJoin: true, canLeave: false, canCheck: false, canUncheck: false,
  canPhoto: false, canStaff: false, canVoid: false, checkCount: 0,
  checks: [], joins: [{ userId: 2, nickname: "奥森小鹿" }], photos: []
};

async function screenshot(page, name) {
  const metrics = await page.evaluate(() => ({ width: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth }));
  assert.ok(metrics.body <= metrics.width + 1, name + " body horizontal overflow");
  assert.ok(metrics.document <= metrics.width + 1, name + " document horizontal overflow");
  const file = name + ".png";
  await page.screenshot({ path: path.join(__dirname, file), fullPage: true });
  report.screenshots.push(file);
  report.checks.push({ name, ...metrics });
}

async function run() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    for (const width of [320, 390, 1440]) {
      for (const kind of ["album", "meetup"]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await context.newPage();
        page.on("pageerror", (error) => report.errors.push({ kind, width, error: error.message }));
        let first = true;
        let failNext = false;
        let releaseFirst;
        const endpoint = kind === "album" ? "/clubs/7/activities/8/album" : "/clubs/7/meetups/9";
        await page.route("**/marathon/api/**", async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          const apiPath = url.pathname.replace("/marathon/api", "");
          report.requests.push({ kind, width, method: request.method(), path: apiPath + url.search, source: "in-memory fixture" });
          const reply = (status, data) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
          if (apiPath === endpoint && request.method() === "GET") {
            if (first) {
              first = false;
              await new Promise((resolve) => { releaseFirst = resolve; });
              return reply(503, { error: "服务暂不可用，请稍后重试" });
            }
            if (failNext) {
              failNext = false;
              return reply(503, { error: "排序暂时无法加载" });
            }
            return reply(200, kind === "album" ? album : { meetup });
          }
          if (apiPath === "/clubs/7") return reply(200, { club: { id: 7 }, members: [] });
          if (request.method() !== "GET") return reply(503, { error: "操作暂时无法完成" });
          throw new Error("Unexpected API " + request.method() + " " + apiPath);
        });
        const routePath = kind === "album" ? "/clubs/7/activities/8/album" : "/clubs/7/meetups/9";
        await page.goto(base + routePath);
        await page.getByRole("status").filter({ hasText: kind === "album" ? "正在加载相册" : "正在加载约跑" }).waitFor();
        assert.equal(typeof releaseFirst, "function");
        releaseFirst();
        await page.getByRole("alert").getByText("服务暂不可用，请稍后重试").waitFor();
        await screenshot(page, "recovery-" + kind + "-error-" + width);
        await page.getByRole("button", { name: "重新加载", exact: true }).click();
        await page.getByRole("heading", { name: kind === "album" ? "周末奥森训练相册" : "11月1日 奥森南门", exact: true }).waitFor();
        assert.equal(await page.getByRole("alert").count(), 0);
        await screenshot(page, "recovery-" + kind + "-ready-" + width);
        report.checks.push({ name: kind + " first failure recovers on retry", width, passed: true });

        if (kind === "album") {
          failNext = true;
          await page.getByRole("button", { name: "从新到旧", exact: true }).click();
          await page.getByRole("alert").getByText("排序暂时无法加载").waitFor();
          await page.getByRole("button", { name: "从新到旧", exact: true }).waitFor();
          await page.getByRole("heading", { name: "周末奥森训练相册", exact: true }).waitFor();
          await page.getByRole("button", { name: "重新加载", exact: true }).click();
          await page.getByRole("alert").waitFor({ state: "hidden" });
          await page.getByRole("button", { name: "审核关闭", exact: true }).click();
          await page.getByText("操作暂时无法完成", { exact: true }).waitFor();
          await page.getByRole("button", { name: "审核关闭", exact: true }).waitFor();
          assert.equal(await page.getByRole("button", { name: "审核已开", exact: true }).count(), 0);
          report.checks.push({ name: "album failed ordering rolls back and failed mutation remains visible", width, passed: true });
        } else {
          await page.getByText("奥森小鹿", { exact: true }).waitFor();
          await page.getByRole("button", { name: "算我一个", exact: true }).click();
          await page.getByText("操作暂时无法完成", { exact: true }).waitFor();
          assert.equal(await page.getByText("已记下", { exact: true }).count(), 0);
          report.checks.push({ name: "meetup exposes its join list and failed join shows no success", width, passed: true });
        }
        await context.close();
      }
    }
    assert.deepEqual(report.errors, []);
    report.passed = true;
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  report.passed = false;
  report.error = error.stack || String(error);
  process.exitCode = 1;
}).finally(() => {
  fs.writeFileSync(path.join(__dirname, "detail-recovery-browser-regression.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, screenshots: report.screenshots.length, errors: report.errors, error: report.error }, null, 2));
});
