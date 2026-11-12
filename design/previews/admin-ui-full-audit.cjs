const { inspectUiPalette } = require('../../scripts/ui-palette-metrics.cjs');
const expectedAccent = (process.env.UI_EXPECTED_ACCENT || '#ff1838').toLowerCase();
// All API reads and writes are fulfilled from fixtures. This verifies UI only.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const fs = require("node:fs"), assert = require("node:assert/strict");
const auditPath = require("node:path");
const root = auditPath.resolve(__dirname, "../..");
const out = process.env.UI_AUDIT_OUT ? auditPath.resolve(root, process.env.UI_AUDIT_OUT) : __dirname;
const reportFile = process.env.UI_AUDIT_REPORT ? auditPath.resolve(root, process.env.UI_AUDIT_REPORT) : auditPath.join(out, "admin-ui-full-audit-report.json");
fs.mkdirSync(out, { recursive: true });
const base = process.env.MARATHON_PREVIEW_URL || "http://127.0.0.1:5174/marathon";
const { createState, setup } = require(root + "/design/previews/admin-api-fixture.cjs");
const report = { kind: "Admin UI review with mock API fixtures; not production or live-backend verification", startedAt: (new Date()).toISOString(), expectedAccent, checks: [], screenshots: [], errors: [], console: [] };
const feedback = { id: 58, title: "跑团训练计划增加课表视图", body: "希望把每周训练内容按日期整理，成员可以更方便地查看集合地点和配速要求。", category: "ui", module: "clubs", status: "pending", statusLabel: "待审核", votes: 28, author: { nickname: "界面体验测试跑者" }, createdAt: "2026-11-05T02:20:00Z", revision: 1, events: [] };
const verification = { id: 7, clubId: 91, clubName: "北京奥森晨跑团", city: "北京", status: "pending", ownerNickname: "测试团长", organization: "奥森跑步俱乐部", scope: "代表组织管理公开跑团主页与成员服务", evidence: "测试资料：组织授权说明，供 UI 验收使用。", sourceUrl: "https://example.org/club", contact: "站内联系（虚构）", createdAt: "2026-11-05T02:20:00Z", events: [{ actor: "平台管理员", decision: "supplement", note: "请补充组织授权范围。", createdAt: "2026-11-05T02:20:00Z" }] };
const identityReport = { ...verification, id: 8, type: "impersonation", reporterNickname: "测试跑者", detail: "测试申诉：某公开页面可能造成组织身份混淆，请核实。" };
const privacy = { id: 9, type: "copy", status: "pending", nickname: "测试跑者", userId: 1, detail: "请提供本人已提交的跑团活动与运动记录副本。此工单为界面测试数据。", createdAt: "2026-11-05T02:20:00Z" };
async function nav(page, name) {
  const toggle = page.getByRole("button", { name: "打开导航菜单", exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await page.locator(".navigation-groups").getByRole("button", { name: new RegExp(name) }).click();
  await page.waitForTimeout(80);
}
async function shot(page, label, full = true) {
  await page.waitForTimeout(80);
  const m = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, heading: document.querySelector(".operations-heading h1")?.textContent }));
  Object.assign(m, await page.evaluate(inspectUiPalette));
  assert.equal(m.palette.accent, expectedAccent, "expected primary color");
  assert.ok(m.scrollWidth <= m.width + 1, label + " horizontal overflow");
  report.checks.push({ label, ...m, pass: true });
  const file = "admin-ui-" + label + ".png";
  await page.screenshot({ path: out + "/" + file, fullPage: full, animations: "disabled" });
  report.screenshots.push(file);
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  try {
    for (const width of [320, 390, 1024, 1440]) {
      const state = createState(), mode = { feedback: "data", identity: "data", privacy: "data" };
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      await ctx.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
      await ctx.addInitScript(() => sessionStorage.setItem("marathon_admin", "mock-admin-token"));
      const page = await ctx.newPage();
      page.on("pageerror", (e) => report.errors.push({ width, message: e.message }));
      page.on("console", (m) => {
        if (m.type() === "error" && !m.text().includes("status of 503")) report.console.push({ width, message: m.text() });
      });
      await setup(page, state);
      await page.route("**/marathon/api/admin/**", async (route) => {
        const u = new URL(route.request().url()), path = u.pathname.replace("/marathon/api", "");
        let key = path.startsWith("/admin/feedback") ? "feedback" : path.startsWith("/admin/club-identity") ? "identity" : path.startsWith("/admin/privacy-requests") ? "privacy" : null;
        if (!key) return route.fallback();
        if (mode[key] === "error") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "测试服务暂不可用，请重新加载。" }) });
        let body;
        if (key === "feedback" && route.request().method() === "PATCH") {
          if (mode.saveBarrier) await mode.saveBarrier;
          Object.assign(feedback, route.request().postDataJSON());
          feedback.revision++;
          body = feedback;
        } else if (key === "feedback") body = /\/58$/.test(path) ? feedback : { items: mode.feedback === "empty" ? [] : [feedback], counts: { pending: 1, published: 2, adopted: 3, building: 1, released: 1, declined: 0, withdrawn: 0 }, rewardsPending: 1, total: mode.feedback === "empty" ? 0 : 1, pages: 1, page: 1 };
        else {
          const rows = mode[key] === "empty" ? [] : key === "privacy" ? [privacy] : [u.searchParams.get("kind") === "report" ? identityReport : verification];
          body = { rows, total: rows.length, pages: 1, page: 1 };
        }
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      });
      await page.goto(base + "/admin");
      await page.locator(".metric-card").first().waitFor();
      await shot(page, "overview-" + width);
      if (width < 800) {
        await page.getByRole("button", { name: "打开导航菜单", exact: true }).click();
        assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
        await shot(page, "navigation-" + width, false);
        await page.locator(".operations-sidebar .logout-control").focus();
        await page.keyboard.press("Tab");
        assert.ok(await page.evaluate(() => document.querySelector(".operations-sidebar").contains(document.activeElement)));
        await page.keyboard.press("Escape");
        assert.equal(await page.evaluate(() => document.body.style.overflow), "");
        assert.equal(await page.getByRole("button", { name: "打开导航菜单", exact: true }).evaluate((n) => n === document.activeElement), true);
        report.checks.push({ label: "navigation-focus-and-scroll-" + width, pass: true });
      }
      await nav(page, "赛事管理");
      await page.getByRole("tab", { name: /内容审核/ }).click();
      await page.locator(".race-row").first().getByRole("button", { name: "审核", exact: true }).click();
      await page.locator("#race-editor").waitFor();
      for (const name of ["基本信息", "项目", "报名", "官网", "比赛日", "规程", "直播", "奖项", "资讯"]) {
        await page.locator(".edit-nav").getByRole("tab", { name, exact: true }).click();
        await shot(page, "editor-" + name + "-" + width, false);
      }
      await page.locator(".edit-tools").getByRole("button", { name: "收起", exact: true }).click();
      for (const name of ["赛事资讯", "跑者管理", "跑团管理", "申请审核", "运动记录", "积分礼品", "合作与物资", "账号与权限"]) {
        await nav(page, name);
        await shot(page, name + "-" + width);
      }
      await nav(page, "共创建议");
      await page.locator(".feedback-admin-row").first().waitFor();
      await shot(page, "feedback-list-" + width);
      await page.locator(".feedback-admin-row").first().click();
      await page.locator(".feedback-review-form").waitFor();
      await shot(page, "feedback-detail-" + width, false);
      const panel = page.locator(".feedback-admin-detail");
      await panel.focus();
      await page.keyboard.press("Shift+Tab");
      assert.equal(await page.locator(".feedback-primary").evaluate((n) => n === document.activeElement), true);
      await page.keyboard.press("Tab");
      assert.equal(await page.getByRole("button", { name: "关闭建议", exact: true }).evaluate((n) => n === document.activeElement), true);
      await shot(page, "feedback-focus-" + width, false);
      let finishSave;
      mode.saveBarrier = new Promise((resolve) => {
        finishSave = resolve;
      });
      await page.getByLabel("公开回复", { exact: true }).fill("测试回复：已收到并记录界面建议。");
      await page.locator(".feedback-primary").click();
      assert.equal(await page.locator(".feedback-primary").isDisabled(), true);
      assert.equal(await page.locator(".feedback-review-form select").isDisabled(), true);
      await shot(page, "feedback-saving-" + width, false);
      finishSave();
      await page.getByText("处理结果已保存。", { exact: true }).waitFor();
      assert.equal(await page.locator(".feedback-primary").isDisabled(), false);
      report.checks.push({ label: "feedback-focus-and-saving-" + width, pass: true });
      await page.getByRole("button", { name: "关闭建议", exact: true }).click();
      assert.equal(await page.evaluate(() => document.body.style.overflow), "");
      assert.equal(await page.locator(".feedback-admin-row").first().evaluate((n) => n === document.activeElement), true);
      mode.feedback = "empty";
      await page.locator(".feedback-filters").getByRole("button", { name: "全部", exact: true }).click();
      await page.getByRole("heading", { name: "这里还没有建议", exact: true }).waitFor();
      await shot(page, "feedback-empty-" + width);
      mode.feedback = "error";
      await page.locator(".feedback-toolbar form button").click();
      await page.locator(".feedback-error").waitFor();
      await shot(page, "feedback-error-" + width);
      await nav(page, "跑团身份");
      await page.locator(".identity-case").first().waitFor();
      await shot(page, "identity-list-" + width);
      await page.locator(".identity-case").first().click();
      await shot(page, "identity-verification-" + width);
      await page.getByRole("tab", { name: "名称与身份申诉", exact: true }).click();
      await page.locator(".identity-case").first().click();
      await page.getByLabel("下一步", { exact: true }).selectOption("rename");
      await shot(page, "identity-rename-" + width);
      mode.identity = "empty";
      await page.getByRole("tab", { name: "组织身份核验", exact: true }).click();
      await page.getByText("暂时没有核验申请。", { exact: true }).waitFor();
      await shot(page, "identity-empty-" + width);
      mode.identity = "error";
      await page.getByRole("tab", { name: "名称与身份申诉", exact: true }).click();
      await page.locator(".identity-desk-error").waitFor();
      await shot(page, "identity-error-" + width);
      await nav(page, "个人信息权利");
      await page.locator(".privacy-desk .case").first().waitFor();
      await page.locator(".privacy-desk .case").first().click();
      await shot(page, "privacy-detail-" + width);
      mode.privacy = "empty";
      await nav(page, "运营总览");
      await nav(page, "个人信息权利");
      await page.getByText("暂无个人信息权利申请。", { exact: true }).waitFor();
      await shot(page, "privacy-empty-" + width);
      mode.privacy = "error";
      await nav(page, "运营总览");
      await nav(page, "个人信息权利");
      await page.locator(".desk-message[role=alert]").waitFor();
      await shot(page, "privacy-error-" + width);
      assert.equal(state.unexpected.length, 0);
      await ctx.close();
    }
    for (const width of [320, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      await ctx.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
      const page = await ctx.newPage();
      await setup(page, createState());
      await page.goto(base + "/admin");
      await page.getByRole("button", { name: "登录工作台", exact: true }).waitFor();
      await shot(page, "login-" + width);
      await ctx.close();
    }
    assert.equal(report.errors.length, 0);
    assert.equal(report.console.length, 0);
    report.passed = true;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  report.fatal = e.stack;
  process.exitCode = 1;
}).finally(() => {
  fs.mkdirSync(auditPath.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, fatal: report.fatal, checks: report.checks.length, screenshots: report.screenshots.length, errors: report.errors, console: report.console }, null, 2));
});
