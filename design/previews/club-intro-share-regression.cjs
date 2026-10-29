const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");

const root = path.resolve(__dirname, "../..");
const base = process.env.MARATHON_PREVIEW_URL || "http://127.0.0.1:5174/marathon";
const clubName = "奥森晨跑团";
const report = { kind: "Public club invitation sharing; mocked browser APIs and Mini Page VM, no business database writes", checks: [], screenshots: [], errors: [], unexpected: [] };
const settle = () => new Promise((resolve) => setImmediate(resolve));

function miniFixture({ authenticated = false, query = { code: "友好邀请/口令", apply: "1" } } = {}) {
  let definition;
  const requests = [];
  const menus = [];
  const navigation = [];
  const storage = {};
  let handler = () => Promise.resolve({ club: { id: 44, name: clubName, leader: "小林", memberCount: 28 } });
  vm.runInNewContext(fs.readFileSync(path.join(root, "miniprogram/pages/club-intro/club-intro.js"), "utf8"), {
    require(name) {
      if (name === "../../utils/request") return { request: (...args) => { requests.push(args); return handler(...args); }, ready: () => authenticated };
      throw new Error("Unexpected Mini dependency " + name);
    },
    Page(page) { definition = page; },
    wx: {
      hideShareMenu(options) { menus.push({ enabled: false, menus: Array.from(options.menus) }); },
      showShareMenu(options) { menus.push({ enabled: true, menus: Array.from(options.menus) }); },
      setStorageSync(key, value) { storage[key] = value; },
      switchTab(options) { navigation.push(options.url); },
      navigateTo(options) { navigation.push(options.url); },
      redirectTo(options) { navigation.push(options.url); }
    }
  }, { filename: "club-intro.js" });
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch) {
    for (const [key, value] of Object.entries(patch)) {
      const keys = key.split(".");
      let target = this.data;
      for (const part of keys.slice(0, -1)) target = target[part];
      target[keys.at(-1)] = value;
    }
  } };
  page.onLoad(query);
  return { page, requests, menus, navigation, storage, setHandler(next) { handler = next; } };
}

async function miniChecks() {
  {
    const fixture = miniFixture();
    const { page } = fixture;
    assert.equal(fixture.menus.at(-1).enabled, false);
    page.openShare();
    assert.equal(page.data.shareOpen, false, "loading must not open an empty invitation");
    const fallback = page.onShareAppMessage();
    assert.equal(fallback.path, "/pages/club-intro/club-intro?code=" + encodeURIComponent("友好邀请/口令"));
    page.onShow();
    await settle();
    assert.equal(page.data.club.id, 44);
    assert.equal(fixture.requests[0][0], "/clubs/invite/" + encodeURIComponent("友好邀请/口令"));
    assert.deepEqual(fixture.menus.at(-1), { enabled: true, menus: ["shareAppMessage", "shareTimeline"] });
    page.openShare();
    assert.equal(page.data.shareOpen, true);
    const friend = page.onShareAppMessage();
    assert.equal(friend.path, "/pages/club-intro/club-intro?id=44");
    assert.ok(friend.title.includes(clubName));
    assert.equal(page.data.shareOpen, false);
    page.openShare();
    page.showTimelineGuide();
    assert.equal(page.data.shareOpen, false);
    assert.equal(page.data.timelineGuide, true);
    const timeline = page.onShareTimeline();
    assert.equal(timeline.query, "id=44");
    assert.equal(page.data.timelineGuide, false);
    assert.equal(fixture.requests.filter((request) => request[1] === "POST").length, 0);
    assert.deepEqual(fixture.navigation, []);
    page.apply();
    assert.equal(fixture.storage.marathon_pending_club_id, "44");
    assert.deepEqual(fixture.navigation, ["/pages/mine/mine"]);
    report.checks.push({ name: "Mini guest can share publicly to friend/group or access timeline guidance, with no login or join request; applying preserves club on login return" });
  }
  {
    const fixture = miniFixture({ authenticated: true, query: { id: "44", apply: "1" } });
    fixture.setHandler((url, method) => method === "POST" ? Promise.resolve({ joined: false }) : Promise.resolve({ club: { id: 44, name: clubName, leader: "小林", memberCount: 28 } }));
    fixture.page.onShow();
    await settle();
    await settle();
    assert.equal(fixture.page.data.club.pending, true);
    assert.equal(fixture.page.data.applying, false);
    fixture.page.apply();
    fixture.page.submitApplication();
    assert.equal(fixture.requests.filter((request) => request[1] === "POST").length, 1, "pending applications must not submit twice");
    fixture.page.openShare();
    assert.equal(fixture.page.data.shareOpen, true, "pending applicants can still share public introduction");
    assert.deepEqual(fixture.navigation, []);
    report.checks.push({ name: "Mini login return submits once, remains pending review, and permits public sharing" });
  }
  {
    const fixture = miniFixture();
    fixture.setHandler(() => Promise.reject(new Error("跑团暂不可用")));
    fixture.page.onShow();
    await settle();
    assert.equal(fixture.page.data.club, null);
    assert.equal(fixture.page.data.error, "跑团暂不可用");
    fixture.page.openShare();
    assert.equal(fixture.page.data.shareOpen, false);
    assert.equal(fixture.menus.at(-1).enabled, false);
    fixture.setHandler(() => Promise.resolve({ club: { id: 44, name: clubName, memberCount: 28 } }));
    fixture.page.load();
    await settle();
    assert.equal(fixture.page.data.error, "");
    assert.equal(fixture.menus.at(-1).enabled, true);
    report.checks.push({ name: "Mini failed introduction hides empty sharing; retry restores the public invitation" });
  }
  {
    const fixture = miniFixture();
    let release;
    fixture.setHandler(() => new Promise((resolve) => { release = resolve; }));
    fixture.page.onShow();
    fixture.page.onUnload();
    const previousData = JSON.stringify(fixture.page.data);
    const previousMenus = JSON.stringify(fixture.menus);
    release({ club: { id: 44, name: clubName, memberCount: 28 } });
    await settle();
    assert.equal(JSON.stringify(fixture.page.data), previousData, "late public load must not mutate an unloaded Mini page");
    assert.equal(JSON.stringify(fixture.menus), previousMenus, "late public load must not reenable sharing on a different page");
    report.checks.push({ name: "Mini public load completing after unload cannot update data or reactivate native share menus" });
  }
  {
    const fixture = miniFixture({ authenticated: true, query: { id: "44" } });
    let release;
    fixture.setHandler((url, method) => method === "POST" ? new Promise((resolve) => { release = resolve; }) : Promise.resolve({ club: { id: 44, name: clubName, memberCount: 28 } }));
    fixture.page.onShow();
    await settle();
    fixture.page.apply();
    assert.equal(fixture.requests.filter((request) => request[1] === "POST").length, 1);
    fixture.page.onUnload();
    const previousData = JSON.stringify(fixture.page.data);
    release({ joined: true });
    await settle();
    assert.deepEqual(fixture.navigation, [], "late join response must not redirect away from the user's new page");
    assert.equal(JSON.stringify(fixture.page.data), previousData);
    report.checks.push({ name: "Mini application completing after unload cannot redirect or mutate the abandoned page" });
  }
}

async function browserFixture(browser, { width = 390, height = 844, native = false, wechat = false, authenticated = false, pending = false, fail = false, name = clubName } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, ...(wechat ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile MicroMessenger/8.0.50" } : {}) });
  await context.addInitScript(({ native, authenticated }) => {
    localStorage.clear();
    if (authenticated) localStorage.setItem("marathon_token", "private-token-never-share");
    window.__shareCalls = [];
    window.__copiedInvites = [];
    window.__shareOutcome = "success";
    Object.defineProperty(navigator, "share", { configurable: true, value: native ? async (data) => {
      window.__shareCalls.push(data);
      if (window.__shareOutcome !== "success") throw new DOMException("Native share unavailable", window.__shareOutcome);
    } : undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { async writeText(text) { window.__copiedInvites.push(text); } } });
  }, { native, authenticated });
  const state = { requests: [], pending };
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.route("**/marathon/api/**", async (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.replace("/marathon/api", "");
    const method = request.method();
    state.requests.push({ method, endpoint, ...(request.postData() ? { body: request.postDataJSON() } : {}) });
    let data;
    let status = 200;
    if (method === "GET" && (endpoint === "/clubs/invite/SHARE-ONLY" || endpoint === "/clubs/44/public")) {
      if (fail) { status = 503; data = { error: "跑团暂不可用" }; }
      else data = { club: { id: 44, name, leader: "团长小林", memberCount: 28, joined: false, pending: state.pending, code: "private-code-never-share" } };
    } else if (method === "POST" && endpoint === "/clubs/join") {
      state.pending = true;
      data = { joined: false };
    } else if (method === "GET" && endpoint === "/meta") data = { company: "赛历", icp: "测试备案", groups: [] };
    else if (method === "GET" && endpoint === "/auth/captcha") data = { token: "captcha-fixture", image: "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="30"><text y="20">1234</text></svg>') };
    else {
      report.unexpected.push({ method, endpoint });
      status = 500;
      data = { error: "Unexpected fixture endpoint " + endpoint };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  });
  return { context, page, state };
}

async function screenshot(page, filename) {
  const size = await page.evaluate(() => ({ width: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth }));
  assert.ok(size.body <= size.width + 1, filename + ": body must fit viewport");
  assert.ok(size.document <= size.width + 1, filename + ": document must fit viewport");
  await page.screenshot({ path: path.join(__dirname, filename), fullPage: true });
  report.screenshots.push(filename);
}

async function browserChecks(browser) {
  const canonicalUrl = new URL(base + "/clubs/44/public").href;
  for (const width of [320, 390, 1440]) {
    const { context, page, state } = await browserFixture(browser, { width, name: width === 320 ? "北京奥森周末马拉松训练与城市越野跑团" : clubName });
    await page.goto(base + "/clubs/invite/SHARE-ONLY?apply=1&token=do-not-share");
    await page.waitForURL(canonicalUrl);
    const share = page.getByRole("button", { name: "分享跑团", exact: true });
    await share.waitFor();
    assert.equal(state.requests.filter((request) => request.endpoint === "/clubs/invite/SHARE-ONLY" || request.endpoint === "/clubs/44/public").length, 1, "canonical route must reuse the resolved invitation without a second loading request");
    assert.equal(await page.locator(".intro-state").count(), 0, "canonical route must keep the loaded card visible");
    assert.equal(await page.getByRole("button", { name: /复制.*链接/ }).count(), 0, "copy is a fallback, not an initial guest CTA");
    assert.equal(state.requests.filter((request) => request.method !== "GET").length, 0);
    await screenshot(page, "club-intro-share-guest-" + width + ".png");
    const previousOverflow = await page.evaluate(() => document.body.style.overflow);
    await share.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await screenshot(page, "club-intro-share-options-" + width + ".png");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => document.body.style.overflow), previousOverflow, "dismissing must restore scrolling");
    assert.equal(await share.evaluate((button) => button === document.activeElement), true, "dismissing must return focus to share CTA");
    await share.click();
    await page.getByRole("button", { name: "复制链接", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__copiedInvites), [canonicalUrl]);
    assert.equal(state.requests.filter((request) => request.method !== "GET").length, 0);
    report.checks.push({ name: "guest invitation fits viewport; unsupported native share uses dismissible copy fallback without login or joining", width });
    await context.close();
  }
  {
    const { context, page, state } = await browserFixture(browser, { native: true });
    await page.goto(base + "/clubs/invite/SHARE-ONLY?apply=1&token=do-not-share");
    await page.waitForURL(canonicalUrl);
    const share = page.getByRole("button", { name: "分享跑团", exact: true });
    await share.click();
    await page.waitForFunction(() => window.__shareCalls.length === 1);
    const payload = (await page.evaluate(() => window.__shareCalls))[0];
    assert.deepEqual(Object.keys(payload).sort(), ["text", "title", "url"]);
    assert.ok(payload.title.includes(clubName));
    assert.equal(payload.url, canonicalUrl);
    assert.doesNotMatch(JSON.stringify(payload), /SHARE-ONLY|private-|do-not-share|apply=1|团长小林|memberCount/);
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.evaluate(() => { window.__shareOutcome = "AbortError"; });
    await share.click();
    await page.waitForFunction(() => window.__shareCalls.length === 2);
    assert.equal(await page.getByRole("dialog").count(), 0, "user cancellation must stay quiet");
    assert.equal(await page.getByRole("alert").count(), 0);
    await page.evaluate(() => { window.__shareOutcome = "NotAllowedError"; });
    await share.click();
    await page.getByRole("dialog").waitFor();
    assert.equal(await page.getByRole("button", { name: "复制链接", exact: true }).isVisible(), true);
    assert.equal(state.requests.filter((request) => request.method !== "GET").length, 0);
    report.checks.push({ name: "native Web Share receives only public invitation; cancellation is silent; native failure offers real fallback" });
    await context.close();
  }
  {
    const { context, page } = await browserFixture(browser, { native: true, wechat: true });
    await page.goto(base + "/clubs/44/public");
    await page.getByRole("button", { name: "分享跑团", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByText("点右上角，分享跑团", { exact: true }).waitFor();
    await dialog.getByText("发送给朋友", { exact: false }).waitFor();
    await dialog.getByText("分享到朋友圈", { exact: false }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.__shareCalls), [], "WeChat H5 must use its real menu, not a fake direct send");
    await screenshot(page, "club-intro-share-wechat-390.png");
    await page.getByRole("button", { name: "我知道了", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    report.checks.push({ name: "WeChat browser shows honest friend/timeline native-menu guidance and can dismiss it" });
    await context.close();
  }
  {
    const { context, page } = await browserFixture(browser, { width: 568, height: 320, wechat: true });
    await page.goto(base + "/clubs/44/public");
    const previousOverflow = await page.evaluate(() => document.body.style.overflow);
    await page.getByRole("button", { name: "分享跑团", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 320, "landscape guide must stay inside the viewport");
    const done = page.getByRole("button", { name: "我知道了", exact: true });
    await done.scrollIntoViewIfNeeded();
    const buttonBounds = await done.boundingBox();
    assert.ok(buttonBounds.y >= bounds.y - 1 && buttonBounds.y + buttonBounds.height <= bounds.y + bounds.height + 1, "dismiss button must scroll into the visible dialog");
    await screenshot(page, "club-intro-share-wechat-landscape-568x320.png");
    await done.click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => document.body.style.overflow), previousOverflow);
    report.checks.push({ name: "short landscape WeChat guide scrolls to a reachable dismiss button and restores page scrolling", width: 568, height: 320 });
    await context.close();
  }
  {
    const { context, page, state } = await browserFixture(browser);
    await page.goto(base + "/clubs/invite/SHARE-ONLY");
    await page.waitForURL(canonicalUrl);
    await page.getByRole("button", { name: "登录并申请加入", exact: true }).click();
    await page.waitForURL(base + "/mine");
    assert.equal(await page.evaluate(() => localStorage.getItem("marathon_return_after_login")), "/clubs/44/public?apply=1");
    assert.equal(state.requests.filter((request) => request.method !== "GET").length, 0);
    report.checks.push({ name: "guest application keeps resolved public invitation as login return without creating an account or silently joining" });
    await context.close();
  }
  {
    const { context, page, state } = await browserFixture(browser, { authenticated: true });
    await page.goto(base + "/clubs/invite/SHARE-ONLY?apply=1");
    await page.waitForURL(canonicalUrl);
    await page.getByRole("button", { name: "等待审核", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "等待审核", exact: true }).isDisabled(), true);
    assert.deepEqual(state.requests.filter((request) => request.method === "POST"), [{ method: "POST", endpoint: "/clubs/join", body: { clubId: 44 } }]);
    await page.reload();
    await page.getByRole("button", { name: "等待审核", exact: true }).waitFor();
    assert.equal(state.requests.filter((request) => request.method === "POST").length, 1, "pending login return must not resubmit on refresh");
    await page.getByRole("button", { name: "分享跑团", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await screenshot(page, "club-intro-share-pending-390.png");
    report.checks.push({ name: "login return submits once and stays pending review, including refresh; public sharing remains available" });
    await context.close();
  }
  {
    const { context, page } = await browserFixture(browser);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route("**/marathon/api/clubs/44/public", async (route) => {
      await gate;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ club: { id: 44, name: clubName, leader: "团长小林", memberCount: 28 } }) });
    });
    await page.goto(base + "/clubs/44/public");
    await page.getByRole("status").getByText("正在打开跑团…", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "分享跑团", exact: true }).count(), 0);
    release();
    await page.getByRole("button", { name: "分享跑团", exact: true }).waitFor();
    report.checks.push({ name: "loading introduction never exposes an empty invitation or share action" });
    await context.close();
  }
  {
    const { context, page } = await browserFixture(browser);
    await page.goto(base + "/clubs/44/public");
    await page.getByRole("button", { name: "分享跑团", exact: true }).click();
    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => { throw new Error("Clipboard permission denied"); };
      document.execCommand = () => false;
    });
    const copy = page.getByRole("button", { name: "复制链接", exact: true });
    await copy.click();
    await page.getByText("复制未成功，请从浏览器地址栏复制链接。", { exact: true }).waitFor();
    assert.equal(await copy.isEnabled(), true);
    await page.evaluate(() => { navigator.clipboard.writeText = async (text) => { window.__copiedInvites.push(text); }; });
    await copy.click();
    assert.deepEqual(await page.evaluate(() => window.__copiedInvites), [canonicalUrl]);
    report.checks.push({ name: "fallback copy reports permission failure truthfully, keeps the dialog and permits retry" });
    await context.close();
  }
  {
    const { context, page } = await browserFixture(browser, { authenticated: true });
    let release;
    let issued;
    const issuedRequest = new Promise((resolve) => { issued = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route("**/marathon/api/clubs/join", async (route) => {
      issued();
      await gate;
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "登录已过期" }) });
    });
    await page.goto(base + "/clubs/44/public");
    await page.getByRole("button", { name: "申请加入", exact: true }).click();
    await issuedRequest;
    await page.evaluate(() => document.querySelector("#app").__vue_app__.config.globalProperties.$router.push("/sharing-test-left"));
    await page.getByRole("heading", { name: "这个页面暂时找不到了", exact: true }).waitFor();
    const response = page.waitForResponse((res) => new URL(res.url()).pathname.endsWith("/api/clubs/join"));
    release();
    await (await response).finished();
    await page.waitForLoadState("networkidle");
    assert.equal(new URL(page.url()).pathname, "/marathon/sharing-test-left", "late 401 must not hijack the new route");
    assert.equal(await page.evaluate(() => localStorage.getItem("marathon_token")), "private-token-never-share");
    assert.equal(await page.evaluate(() => localStorage.getItem("marathon_return_after_login")), null);
    report.checks.push({ name: "Web application returning 401 after navigation cannot hijack the route, clear current login, or overwrite the login-return destination" });
    await context.close();
  }
  {
    const { context, page, state } = await browserFixture(browser);
    await page.goto(base + "/clubs/44/public");
    await page.getByRole("button", { name: "分享跑团", exact: true }).waitFor();
    let alternateLoads = 0;
    await page.route("**/marathon/api/clubs/invite/SECOND-CLUB", async (route) => {
      alternateLoads++;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ club: { id: 45, name: "第二个城市跑团", leader: "小周", memberCount: 9, joined: false, pending: false } }) });
    });
    await page.evaluate(() => document.querySelector("#app").__vue_app__.config.globalProperties.$router.push("/clubs/invite/SECOND-CLUB"));
    await page.waitForURL(base + "/clubs/45/public");
    await page.getByRole("heading", { name: "第二个城市跑团", exact: true }).waitFor();
    assert.equal(alternateLoads, 1, "different invitation must load once and reuse that resolved club during canonicalization");
    assert.equal(await page.locator(".intro-facts").getByText("小周", { exact: true }).count(), 1);
    await page.getByRole("button", { name: "分享跑团", exact: true }).click();
    await page.getByRole("button", { name: "复制链接", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__copiedInvites), [base + "/clubs/45/public"]);
    assert.equal(state.requests.filter((request) => request.method !== "GET").length, 0);
    report.checks.push({ name: "reused introduction loads a different club and shares its canonical public link without old club data or duplicate requests" });
    await context.close();
  }
  {
    const { context, page } = await browserFixture(browser, { fail: true });
    await page.goto(base + "/clubs/44/public");
    await page.getByText("跑团暂不可用", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "分享跑团", exact: true }).count(), 0);
    report.checks.push({ name: "unavailable club introduction does not offer an empty share action" });
    await context.close();
  }
}

async function main() {
  await miniChecks();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try { await browserChecks(browser); } finally { await browser.close(); }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.unexpected, []);
  report.passed = true;
}

main().catch((error) => { report.passed = false; report.error = error.stack || String(error); process.exitCode = 1; }).finally(() => {
  fs.writeFileSync(path.join(__dirname, "club-intro-share-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, screenshots: report.screenshots.length, errors: report.errors, unexpected: report.unexpected, error: report.error }, null, 2));
});
