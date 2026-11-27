const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");

const base = process.env.MARATHON_PREVIEW_URL || "http://127.0.0.1:5174/marathon";
const output = __dirname;
const report = { kind: "Product browsing regressions with in-memory API fixtures", checks: [], screenshots: [], errors: [] };
const longRaceName = "杭州钱塘江两岸城市绿道暨西湖群山国际马拉松越野耐力挑战赛";

async function checkHome(page, queries, width) {
  const card = page.getByRole("region", { name: "找比赛", exact: true });
  const conditions = page.getByRole("button", { name: "按条件找赛", exact: true });
  const keywordMode = page.getByRole("button", { name: "搜赛事", exact: true });
  const field = page.getByRole("textbox", { name: "搜索赛事名称或城市", exact: true });
  const submitConditions = page.getByRole("button", { name: "查找比赛", exact: true });
  const submitKeyword = page.getByRole("button", { name: "搜索", exact: true });
  const results = page.locator(".home-results");
  const pending = page.getByRole("alert").getByRole("button", { name: "重试", exact: true });
  const failures = [];
  async function openHome() {
    await page.goto(base + "/");
    if (await pending.isVisible()) await pending.click();
    await results.getByText("云上越野训练赛", { exact: true }).waitFor();
  }
  async function check(name, run) {
    try {
      await openHome();
      await run();
      report.checks.push({ name, width });
    } catch (error) {
      failures.push(new Error(name + " — " + error.message));
    }
  }
  async function requestOnClick(control) {
    const next = page.waitForResponse((response) => new URL(response.url()).pathname === "/marathon/api/races");
    await control.click();
    return Object.fromEntries(new URL((await next).url()).searchParams);
  }

  await check("条件选好后统一查赛，赛事类型与参赛形式独立", async () => {
    const prior = queries.length;
    await page.getByRole("button", { name: "更多筛选", exact: true }).click();
    await page.getByRole("navigation", { name: "赛事形式" }).getByRole("button", { name: "线上赛" }).click();
    await page.locator(".home-filter-sheet").waitFor({ state: "hidden" });
    await page.getByRole("navigation", { name: "赛事类型" }).getByRole("button", { name: "越野赛" }).click();
    await page.clock.runFor(300);
    assert.equal(queries.length, prior, "编辑赛事类型和参赛形式时应等待点击「查找比赛」");
    assert.deepEqual(await requestOnClick(submitConditions), { kind: "trail", meet: "online", status: "upcoming", page: "1" });
    await results.getByText(longRaceName, { exact: true }).waitFor();
    if (width === 320 || width === 390) await auditHomeCard(page, card, submitConditions, "home-conditions-" + width);
  });
  await check("关键词经提交可查往届赛事，并忽略条件输入", async () => {
    await page.getByRole("navigation", { name: "赛事类型" }).getByRole("button", { name: "路跑" }).click();
    await keywordMode.click();
    const prior = queries.length;
    await field.fill("  往届北马  ");
    await page.clock.runFor(300);
    assert.equal(queries.length, prior, "编辑关键词时应等待点击「搜索」");
    assert.deepEqual(await requestOnClick(submitKeyword), { q: "往届北马", status: "all", page: "1" });
    await results.getByText("2022 北京马拉松（往届）", { exact: true }).waitFor();
    if (width === 320 || width === 390) await auditHomeCard(page, card, submitKeyword, "home-keyword-" + width);
  });
  await check("切换模式保留两种输入并且不发请求", async () => {
    assert.equal(await conditions.count(), 1, "应有「按条件找赛」与「搜赛事」两个模式控件");
    assert.equal(await keywordMode.count(), 1);
    const prior = queries.length;
    await card.getByRole("button", { name: "比赛地点" }).click();
    await page.getByRole("navigation", { name: "省份导航" }).getByRole("button", { name: "浙江", exact: true }).click();
    await page.locator(".cities").getByRole("button", { name: "杭州", exact: true }).click();
    await keywordMode.click();
    await field.fill("未提交的关键词");
    await conditions.click();
    assert.equal(await card.getByRole("button", { name: "比赛地点" }).innerText(), "杭州");
    await keywordMode.click();
    assert.equal(await field.inputValue(), "未提交的关键词");
    assert.equal(await keywordMode.getAttribute("aria-pressed"), "true");
    await page.clock.runFor(300);
    assert.equal(queries.length, prior);
  });
  await check("请求失败后用原参数重试，保留新输入", async () => {
    await keywordMode.click();
    await field.fill("待重试的赛事");
    const submitted = await requestOnClick(submitKeyword);
    await pending.waitFor();
    await field.fill("下一次要搜的赛事");
    await page.clock.runFor(300);
    assert.ok(await pending.isVisible(), "未提交的关键词不能消除原请求的失败状态");
    assert.deepEqual(await requestOnClick(pending), submitted, "重试须发送已失败的参数");
    assert.equal(await field.inputValue(), "下一次要搜的赛事");
    await results.getByText("待重试的赛事", { exact: true }).waitFor();
  });
  if (width === 390) await check("链接中的关键词和筛选条件可恢复并分别使用", async () => {
    const search = new URLSearchParams({ q: "往届北马", city: "杭州", month: "2027-11", kind: "trail" });
    await page.goto(base + "/?" + search);
    await results.getByText("2022 北京马拉松（往届）", { exact: true }).waitFor();
    assert.equal(await field.inputValue(), "往届北马");
    assert.deepEqual(Object.fromEntries(new URLSearchParams(queries.at(-1))), { q: "往届北马", status: "all", page: "1" });
    await conditions.click();
    assert.equal(await card.getByRole("button", { name: "比赛地点" }).innerText(), "杭州");
    assert.equal(await card.getByRole("button", { name: "比赛时间" }).innerText(), "2027年11月");
    assert.deepEqual(await requestOnClick(submitConditions), { city: "杭州", month: "2027-11", kind: "trail", status: "upcoming", page: "1" });
  });

  if (failures.length) throw new Error(failures.map((error) => error.message).join("\n"));
}

async function auditHomeCard(page, card, primary, name) {
  await card.scrollIntoViewIfNeeded();
  const { width, documentWidth, hit, bounds, longNameFits } = await primary.evaluate((button, longRaceName) => {
    const buttonBox = button.getBoundingClientRect();
    const cardBox = button.closest(".race-finder").getBoundingClientRect();
    const raceName = [...document.querySelectorAll(".home-results .race-card .body > strong")].find((label) => label.textContent === longRaceName);
    const range = document.createRange();
    if (raceName) range.selectNodeContents(raceName);
    return {
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      hit: button.contains(document.elementFromPoint((buttonBox.left + buttonBox.right) / 2, (buttonBox.top + buttonBox.bottom) / 2)),
      bounds: [cardBox.left, buttonBox.left, buttonBox.right, cardBox.right, buttonBox.height],
      longNameFits: !raceName || [...range.getClientRects()].every((line) => line.left >= raceName.getBoundingClientRect().left - 1 && line.right <= raceName.getBoundingClientRect().right + 1)
    };
  }, longRaceName);
  assert.ok(documentWidth <= width && bounds[0] >= 0 && bounds[0] <= bounds[1] && bounds[2] <= bounds[3] && bounds[3] <= width, name + " horizontal overflow");
  assert.ok(hit && bounds[4] >= 44, name + " primary action is covered or too small");
  assert.ok(longNameFits, name + " long race name is clipped horizontally");
  await auditWidth(page, name);
}

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
  try {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.clock.install();
    const queries = [];
    let firstHomeFailure = true;
    let firstSearchFailure = true;
    await page.route("**/marathon/api/**", async (route) => {
      const url = new URL(route.request().url());
      const pathName = url.pathname.replace("/marathon/api", "");
      if (pathName === "/legal") return route.fulfill({ json: require("../../shared/legal-documents.json") });
      if (pathName === "/races") {
        const params = url.searchParams;
        const keyword = params.get("q");
        queries.push(params.toString());
        if (!keyword && firstHomeFailure) {
          firstHomeFailure = false;
          return route.fulfill({ status: 503, json: { error: "服务暂不可用" } });
        }
        if (keyword === "待重试的赛事" && firstSearchFailure) {
          firstSearchFailure = false;
          return route.fulfill({ status: 503, json: { error: "服务暂不可用" } });
        }
        const archived = keyword === "往届北马";
        const selectedConditions = params.get("kind") === "trail" && params.get("meet") === "online";
        const name = archived ? "2022 北京马拉松（往届）" : keyword || (selectedConditions ? longRaceName : "云上越野训练赛");
        const race = { id: archived ? "archived" : "trail-online", name, raceDate: archived ? "2022-11-06" : "2026-11-18", city: archived ? "北京" : "杭州", province: archived ? "北京" : "浙江", distances: ["half"], distanceLabels: ["半程马拉松"], kind: "trail", kindLabels: ["越野"], meet: "online", regStatus: archived ? "比赛结束" : "报名中", open: !archived, daysLeft: 4 };
        const races = archived && params.get("status") !== "all" ? [] : [race];
        return route.fulfill({ json: { races, total: races.length, pages: 1, page: 1 } });
      } else if (pathName === "/race-catalog") {
        await route.fulfill({ json: { races: [] } });
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
    await page.locator(".home-results").getByText("云上越野训练赛", { exact: true }).waitFor();
    await auditWidth(page, "home-" + width);
    await checkHome(page, queries, width);

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
    if (pathName === '/legal') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(require('../../shared/legal-documents.json')) });
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
    await page.locator(".share-fold summary").click();
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

  } finally {
    await browser.close();
  }
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
