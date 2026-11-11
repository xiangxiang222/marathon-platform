// Navigation, stale response and sharing regression. API responses are all in memory.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright-core");
const ROOT = path.resolve(__dirname, "../..");
const overviewFixture = require('./club-overview-fixture.cjs');
const output = path.resolve(ROOT, process.env.CLUB_AUDIT_OUT || 'design/previews/club-overview-20261111');
fs.mkdirSync(output, { recursive: true });
const base = (process.env.MARATHON_PREVIEW_URL || "http://127.0.0.1:5174/marathon").replace(/\/$/, "");
const now = overviewFixture.now; // 08:00 Beijing; browser intentionally uses New York.
const report = { kind: "Mocked club navigation browser regression; no business database writes", checks: [], errors: [], unexpected: [] };
let vite;
let activities = overviewFixture.activities;
let longName = false;
const period = (id, name, open = true) => ({ id, name, amount: 100, startsOn: "2026-01-01", endsOn: "2026-12-31", open, groups: [] }); // missing mine is deliberate
function fixture(id) {
  return {
    club: { id, name: id === 44 ? (longName ? overviewFixture.longName : "晨光跑团") : "河岸跑团", city: '杭州', code: "DO-NOT-SHARE", owner: true, staff: true, role: "owner", roleLabel: "团长" },
    members: overviewFixture.members,
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
      activities = overviewFixture.activities; longName = false;
      page.on("pageerror", error => report.errors.push(error.message));
      let releaseOldFee;
      let delayOldFee = false;
      await page.route("**/marathon/api/**", async route => {
        const url = new URL(route.request().url());
        const endpoint = url.pathname.replace("/marathon/api", "");
    if (endpoint === '/legal') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(require('../../shared/legal-documents.json')) });
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
      assert.equal(await page.locator('.primary-tabs').getByRole('button', { name: '概览', exact: true }).count(), 1);
      assert.equal(await page.locator('.primary-tabs').getByRole('button', { name: '今日', exact: true }).count(), 0);
      assert.match(await page.locator(".my-club-status button").first().innerText(), /3\s*场团练/);
      assert.match(await page.locator(".next-activity").innerText(), /周三轻松跑 · 一起稳稳向前/);
      assert.equal(await page.locator('.activity-kind').innerText(), '正在进行');
      assert.equal(await page.locator('.activity-kind.live').count(), 1);
      await page.screenshot({ path: path.join(output, `web-overview-${width}.png`), fullPage: true });
      await page.locator(".my-club-status button").first().click();
      assert.equal(new URL(page.url()).searchParams.get("mine"), "1");
      assert.deepEqual(await page.locator(".block.act h2").allTextContents(), ["周三轻松跑 · 一起稳稳向前", "晨间节奏跑 · 找到自己的节奏", "周末长距离 · 沿河一起跑"]);
      await page.reload();
      await page.locator(".mine-filter[aria-pressed=true]").waitFor();
      assert.equal(await page.locator(".block.act").count(), 3);
      report.checks.push({ width, name: "current and future signed activities only; invalid/past/cancelled excluded; mine URL survives refresh", passed: true });

      // Keep the component alive while dirty member state survives navigation away.
      for (const destination of ['overview', 'fees', 'manage']) {
        await page.locator('.club-avatars').click();
        await page.getByRole('textbox', { name: '搜索跑团成员' }).fill('不存在的旧搜索');
        await page.locator('.member-filters').getByRole('button', { name: '团长与管理', exact: true }).click();
        assert.equal(await page.locator('.member-directory .member').count(), 0);
        if (destination === 'overview') await page.locator('.primary-tabs').getByRole('button', { name: '概览', exact: true }).click();
        else await page.locator('.secondary-tabs').getByRole('button', { name: destination === 'fees' ? '会费名单' : '管理与服务', exact: true }).click();
        await page.locator('.club-avatars').click();
        await page.waitForFunction(() => new URL(location.href).searchParams.get('view') === 'members');
        assert.equal(await page.getByRole('textbox', { name: '搜索跑团成员' }).inputValue(), '');
        assert.equal(await page.locator('.member-filters button.on').innerText(), '全部');
        assert.equal(await page.locator('.member-directory .member').count(), overviewFixture.members.length);
        assert.equal(new URL(page.url()).searchParams.has('section'), false);
        assert.equal(new URL(page.url()).searchParams.has('mine'), false);
      }
      // Explicit legacy section/mine query is stripped by the same entry.
      await page.goto(base + '/clubs/44?tab=people&view=manage&section=gifts&mine=1');
      await page.locator('.club-avatars').click();
      await page.waitForFunction(() => new URL(location.href).searchParams.get('view') === 'members');
      assert.equal(new URL(page.url()).searchParams.has('section'), false);
      assert.equal(new URL(page.url()).searchParams.has('mine'), false);
      assert.equal(await page.locator('.member-directory .member').count(), overviewFixture.members.length);
      await page.screenshot({ path: path.join(output, `web-members-${width}.png`), fullPage: true });
      report.checks.push({ width, name: 'header avatars/count always opens all members and clears dirty search, staff filter, fees/manage, legacy section/mine', passed: true });

      for (const [scenario, expectedTitle, expectedLabel] of [
        ['live', '晨间节奏跑 · 找到自己的节奏', '正在进行'], ['future', '周末长距离 · 沿河一起跑', '下一场团练'], ['expired', null, null], ['empty', null, null]
      ]) {
        activities = overviewFixture.scenarios[scenario];
        await page.goto(base + '/clubs/44');
        await page.getByRole('heading', { name: '晨光跑团', exact: true }).waitFor();
        if (expectedTitle) {
          assert.equal(await page.locator('.next-activity h3').innerText(), expectedTitle);
          assert.equal(await page.locator('.activity-kind').innerText(), expectedLabel);
          assert.equal(await page.locator('.activity-kind.live').count(), scenario === 'live' ? 1 : 0);
        } else {
          assert.equal(await page.locator('.next-activity').count(), 0);
          await page.getByRole('heading', { name: '暂无团练安排', exact: true }).waitFor();
          assert.equal(await page.locator('.overview').getByText('下一场团练', { exact: true }).count(), 0);
        }
        await page.screenshot({ path: path.join(output, `web-${scenario}-${width}.png`), fullPage: true });
        report.checks.push({ width, name: 'overview activity semantics: ' + scenario, passed: true });
      }
      longName = true; activities = overviewFixture.scenarios.future;
      await page.goto(base + '/clubs/44');
      await page.getByRole('heading', { name: overviewFixture.longName, exact: true }).waitFor();
      const headerLayout = await page.evaluate(() => {
        const hero = document.querySelector('.club-hero').getBoundingClientRect();
        const members = document.querySelector('.club-avatars').getBoundingClientRect();
        return { document: document.documentElement.scrollWidth, hero: { left: hero.left, right: hero.right }, members: { left: members.left, right: members.right }, avatars: document.querySelectorAll('.avatar-stack .club-avatar').length, loaded: [...document.querySelectorAll('.avatar-stack img')].every(image => image.complete && image.naturalWidth > 0) };
      });
      assert.ok(headerLayout.document <= width + 1, JSON.stringify(headerLayout));
      assert.ok(headerLayout.members.left >= headerLayout.hero.left && headerLayout.members.right <= headerLayout.hero.right + 1);
      assert.equal(headerLayout.avatars, 4); assert.ok(headerLayout.loaded);
      await page.screenshot({ path: path.join(output, `web-long-name-${width}.png`), fullPage: true });
      report.checks.push({ width, name: 'long club name, real/fallback avatars and full member entry fit viewport', passed: true, layout: headerLayout });
      longName = false; activities = overviewFixture.activities;
      await page.goto(base + '/clubs/44?tab=act&view=training&mine=1');
      await page.locator('.mine-filter[aria-pressed=true]').waitFor();

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
  fs.writeFileSync(path.join(output, "web-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
