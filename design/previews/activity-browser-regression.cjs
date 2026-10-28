const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");

const base = process.env.MARATHON_PREVIEW_URL || "http://127.0.0.1:5174/marathon";
const output = path.dirname(__filename);
const logs = { checks: [], writes: [], errors: [], screenshots: [] };

const openActivity = {
  id: 1, title: "奥森周日晨跑 · 有氧耐力", issue: "第 18 期", place: "奥林匹克森林公园",
  gatherPlace: "南园南门地铁口", gatherAt: "06:20", startsAt: "2026-11-01T06:30",
  endsAt: "", plannedKm: 16, route: "南园环线两圈", trainingType: "long", signupUntil: "",
  cancelUntil: "", workout: "热身 2 公里\n轻松完成 14 公里有氧跑", notice: "请自备饮水。",
  note: "按身体状态选择配速。", minKm: 5, minPeople: 3, points: 1, rule: "报名为跑团活动意向记录。",
  dateLabel: "11月01日 星期日", clockLabel: "06:30", timeLabel: "2026年11月1日 06:30",
  status: "open", statusLabel: "报名中", checkAvailable: false, signupCount: 4, capacity: 12, men: 2, women: 1,
  mine: { signed: false, groupId: 0, km: null, pacer: false },
  action: { label: "报名", enabled: true, kind: "signup" }, signupHint: "活动开始前可报名", cancelHint: ""
};
const groups = [
  { id: 11, name: "A 组", kind: "pace", kindLabel: "配速组", pace: "5'30–6'00 /km", capacity: 6, signed: 4, full: false,
    people: [{ userId: 7, nickname: "奥森小鹿", avatar: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cX1kAAAAASUVORK5CYII=", level: "进阶", gender: "女", mine: false }] },
  { id: 12, name: "B 组", kind: "pace", kindLabel: "配速组", pace: "6'30–7'00 /km", capacity: 4, signed: 4, full: true, people: [] }
];

async function mock(page) {
  const state = { futureStarted: false, checkKm: {} };
  page.on("pageerror", (error) => logs.errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") logs.errors.push(message.text()); });
  await page.addInitScript(() => localStorage.setItem("marathon_token", "browser-fixture"));
  await page.route("**/marathon/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname.replace("/marathon/api", "");
    const method = request.method();
    let data = {};
    let status = 200;
    const checkRoute = /^\/clubs\/999\/activities\/check-(future|live|ended|cancelled|unsigned)(\/check)?$/.exec(pathname);
    if (checkRoute) {
      const scenario = checkRoute[1];
      const available = scenario === "live" || scenario === "ended" || scenario === "unsigned" || (scenario === "future" && state.futureStarted);
      const signed = scenario !== "unsigned";
      if (method === "POST" && checkRoute[2]) {
        assert.ok(available && signed, "unavailable check-in must never be submitted");
        logs.writes.push({ method, path: pathname, body: request.postDataJSON() });
        state.checkKm[scenario] = request.postDataJSON().km;
        data = { ok: true };
      } else {
        const activityStatus = scenario === "future" && !state.futureStarted ? "open" : scenario === "cancelled" ? "cancelled" : scenario === "ended" ? "ended" : "live";
        data = {
          club: { id: 999, name: "奥森晨跑团" },
          activity: { ...openActivity, id: "check-" + scenario, checkAvailable: available, status: activityStatus,
            statusLabel: { open: "报名中", live: "进行中", ended: "已结束", cancelled: "已取消" }[activityStatus],
            mine: { ...openActivity.mine, signed, km: state.checkKm[scenario] ?? null },
            action: { enabled: false, kind: "signup", label: "查看活动" } },
          groups: [], signups: [], staff: false,
          checks: scenario === "unsigned" ? [
            { userId: 80, nickname: "历史跑友", km: 12, historical: true },
            { userId: 81, nickname: "本场跑友", km: 8, historical: false }
          ] : [],
          album: { photoCount: 0, videoCount: 0 }
        };
      }
    } else if (pathname === "/clubs/999/activities/1") {
      data = { club: { id: 999, name: "奥森晨跑团" }, activity: openActivity, groups, signups: [], checks: [], album: { photoCount: 0, videoCount: 0 }, levels: [], staff: true };
    } else if (pathname === "/clubs/999/activities/closed") {
      data = { club: { id: 999, name: "奥森晨跑团" }, activity: { ...openActivity, id: "closed", statusLabel: "报名已截止", action: { label: "报名已截止", enabled: false, kind: "signup" } }, groups, signups: [], checks: [], staff: false };
    } else if (pathname === "/clubs/999/activities/1/signup" && method === "POST") {
      logs.writes.push({ method, path: pathname, body: request.postDataJSON() });
      data = { ok: true };
    } else if (pathname === "/clubs/999/activities" && method === "POST") {
      logs.writes.push({ method, path: pathname, body: request.postDataJSON() });
      data = { activity: { id: 2 } };
    } else if (pathname === "/clubs/999") {
      data = { club: { id: 999, name: "奥森晨跑团", staff: true }, groups: [{ id: 11, name: "A 组", pace: "5'30–6'00 /km", capacity: 6 }] };
    } else if (pathname === "/me") {
      data = { user: { id: 7, nickname: "奥森小鹿" } };
    } else {
      status = 404;
      data = { error: "Unexpected fixture request: " + method + " " + pathname };
      logs.errors.push(data.error);
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  });
  return state;
}

async function snapshot(page, name) {
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    overflow: [...document.querySelectorAll("body *")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
    }).slice(0, 8).map((element) => ({ tag: element.tagName, className: String(element.className), right: Math.round(element.getBoundingClientRect().right) }))
  }));
  assert.ok(metrics.documentWidth <= metrics.width + 1, name + " has horizontal document overflow");
  assert.ok(metrics.bodyWidth <= metrics.width + 1, name + " has horizontal body overflow");
  logs.checks.push({ name, ...metrics });
  const filename = name + ".png";
  await page.screenshot({ path: path.join(output, filename), fullPage: true });
  logs.screenshots.push(filename);
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const width of [320, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const mockState = await mock(page);
    await page.goto(base + "/clubs/999/activities/1");
    await page.getByRole("heading", { name: "奥森周日晨跑 · 有氧耐力" }).waitFor();
    await snapshot(page, "web-activity-overview-" + width);
    await page.getByRole("button", { name: /配速分组/ }).click();
    await page.getByText("5'30–6'00 /km").waitFor();
    await page.locator(".pace-group img").first().evaluate((image) => image.dispatchEvent(new Event("error")));
    await page.locator(".pace-group .avatar-letter").first().waitFor();
    logs.checks.push({ name: "activity-roster-avatar-fallback-" + width, pass: true });
    await snapshot(page, "web-activity-groups-" + width);
    await page.locator(".activity-nav button").click();
    await page.goto(base + "/clubs/999/activities/1/signup");
    await page.getByRole("heading", { name: "活动报名" }).waitFor();
    const submit = page.getByRole("button", { name: "确认报名" });
    assert.equal(await submit.isDisabled(), true, "signup needs an intentional group choice");
    await page.getByRole("radio", { name: /A 组/ }).click();
    assert.equal(await submit.isDisabled(), false);
    await snapshot(page, "web-activity-signup-" + width);
    await submit.click();
    await page.getByText("报名已确认").waitFor();
    assert.equal(logs.writes.at(-1).body.groupId, 11);
    await page.goto(base + "/clubs/999/activities/closed");
    await page.getByRole("button", { name: "报名已截止" }).waitFor();

    for (const scenario of ["future", "live", "ended", "cancelled", "unsigned"]) {
      const writeCount = logs.writes.length;
      await page.goto(base + "/clubs/999/activities/check-" + scenario);
      await page.getByRole("heading", { name: openActivity.title }).waitFor();
      const input = page.getByPlaceholder("打卡里程 km");
      const submitCheck = page.getByRole("button", { name: "打卡", exact: true });
      if (scenario === "live" || scenario === "ended") {
        await input.waitFor();
        await input.fill("8.5");
        await page.getByPlaceholder("一句训练记录").fill("轻松完成");
        await submitCheck.click();
        await page.getByRole("button", { name: "更新打卡", exact: true }).waitFor();
        assert.deepEqual(logs.writes.at(-1), { method: "POST", path: "/clubs/999/activities/check-" + scenario + "/check", body: { km: 8.5, note: "轻松完成" } });
      } else {
        assert.equal(await input.count(), 0);
        assert.equal(await submitCheck.count(), 0);
        assert.equal(logs.writes.length, writeCount);
        if (scenario === "future") {
          await page.getByText("活动开始后可打卡", { exact: true }).waitFor();
          await snapshot(page, "web-activity-check-future-" + width);
          mockState.futureStarted = true;
          await page.getByRole("button", { name: "刷新状态", exact: true }).click();
          await input.waitFor();
          assert.equal(await submitCheck.isEnabled(), true);
          logs.checks.push({ name: "check-status-refresh-opens-check-in-after-start-" + width, pass: true });
        } else if (scenario === "cancelled") await page.getByText("活动已取消，不能打卡", { exact: true }).waitFor();
        else {
          const history = page.locator(".check-list .runner-row").filter({ hasText: "历史跑友" });
          await history.getByText("历史记录", { exact: true }).waitFor();
          assert.equal(await page.locator(".check-list .runner-row").filter({ hasText: "本场跑友" }).getByText("历史记录", { exact: true }).count(), 0);
          await snapshot(page, "web-activity-check-history-" + width);
        }
      }
      logs.checks.push({ name: "check-entry-" + scenario + "-" + width, pass: true });
    }

    await page.goto(base + "/clubs/999/activities/new?copy=1");
    await page.getByRole("heading", { name: "这次跑什么？" }).waitFor();
    assert.equal(await page.locator('.field:has-text("活动期次") input').inputValue(), "", "copied activity must not retain its issue");
    assert.equal(await page.locator('input[type="datetime-local"]').first().inputValue(), "", "copied activity must clear its start time");

    await page.goto(base + "/clubs/999/activities/new");
    await page.getByRole("heading", { name: "这次跑什么？" }).waitFor();
    assert.equal(await page.locator('input[type="datetime-local"]').first().inputValue(), "", "start time must not be guessed");
    await page.getByRole("button", { name: /长距离/ }).click();
    assert.equal(await page.locator('input[maxlength="40"]').first().inputValue(), "", "template must not prefill a workout title");
    assert.equal(await page.locator('input[type="number"]').first().inputValue(), "", "template must not prefill planned distance");
    await page.getByRole("button", { name: /间歇跑/ }).click();
    await page.getByPlaceholder("例：周三间歇跑").fill("奥森有氧跑");
    await page.locator('input[placeholder="公园、操场或路线起点"]').fill("奥林匹克森林公园");
    await page.getByPlaceholder("例：东门入口").fill("南园南门地铁口");
    await page.locator('input[type="datetime-local"]').first().fill("2026-11-08T06:30");
    await snapshot(page, "web-activity-create-step1-" + width);
    await page.getByRole("button", { name: "继续" }).click();
    await page.getByRole("heading", { name: "让每个人找到合适的节奏" }).waitFor();
    assert.equal(await page.locator('textarea[placeholder^="热身、主训练内容"]').inputValue(), "", "template must not generate workout content");
    await snapshot(page, "web-activity-create-step2-" + width);
    await page.getByRole("button", { name: /继续/ }).click();
    await page.getByRole("heading", { name: "训练信息预览" }).waitFor();
    await snapshot(page, "web-activity-create-step3-" + width);
    await page.getByRole("button", { name: "确认发布训练" }).click();
    await page.waitForURL("**/clubs/999/activities/2");
    const published = logs.writes.at(-1).body;
    assert.equal(published.startsAt, "2026-11-08 06:30");
    assert.equal(published.groups[0].name, "A 组");
    await context.close();
  }
  await browser.close();
  assert.deepEqual(logs.errors, [], "browser should have no runtime or API errors");
  fs.writeFileSync(path.join(output, "activity-browser-report.json"), JSON.stringify({ pass: true, source: "Web pages in Chrome with in-memory API mocks; writes were intercepted", widths: [320, 390], checks: logs.checks, writes: logs.writes, screenshots: logs.screenshots, errors: logs.errors }, null, 2));
  console.log(JSON.stringify({ pass: true, checks: logs.checks.length, writes: logs.writes.length, screenshots: logs.screenshots.length, errors: logs.errors }, null, 2));
}

main().catch((error) => {
  fs.writeFileSync(path.join(output, "activity-browser-report.json"), JSON.stringify({ pass: false, error: String(error), ...logs }, null, 2));
  console.error(error);
  process.exitCode = 1;
});
