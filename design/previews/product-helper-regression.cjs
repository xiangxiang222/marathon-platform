const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "miniprogram/pages/races/races.js"), "utf8");
const markup = fs.readFileSync(path.join(root, "miniprogram/pages/races/races.wxml"), "utf8");
const racesRequire = createRequire(path.join(root, "miniprogram/pages/races/races.js"));
const event = (dataset = {}, value) => ({ currentTarget: { dataset }, detail: { value } });
const fixtures = {
  upcoming: { id: "current", name: "本年度马拉松", raceDate: "2027-03-21", regStatus: "报名中" },
  closed: { id: "past", name: "2025 北京马拉松", raceDate: "2025-11-02", regStatus: "比赛结束" }
};

function racePage(reply = () => ({ races: [], total: 0, pages: 1, page: 1 })) {
  let definition;
  const requests = [], scrolls = [];
  vm.runInNewContext(source, {
    require(name) {
      if (name !== "../../utils/request") return racesRequire(name);
      return { request(url) {
        if (!url.startsWith("/races?")) return Promise.resolve({});
        requests.push(url);
        return Promise.resolve().then(() => reply(new URLSearchParams(url.split("?")[1])));
      } };
    },
    Page(value) { definition = value; },
    wx: {
      getWindowInfo: () => ({ statusBarHeight: 20, windowWidth: 390, windowHeight: 844 }),
      pageScrollTo: (options) => scrolls.push(options),
      getMenuButtonBoundingClientRect: () => ({ width: 87, height: 32, top: 52, right: 380 })
    },
    Date,
    clearTimeout,
    setTimeout
  }, { filename: "races.js" });
  const page = {
    ...definition,
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch, complete) { Object.assign(this.data, patch); if (complete) complete(); }
  };
  page.onLoad();
  page.paint();
  return { page, requests, scrolls, lastParams: () => new URLSearchParams(requests.at(-1).split("?")[1]) };
}

async function findRaceChecks() {
  const failures = [];
  async function check(name, run) {
    try {
      await run();
      console.log("PASS mini " + name);
    } catch (error) {
      failures.push(error);
      console.error("FAIL mini " + name + " — " + error.message);
    }
  }
  const selectMode = (page, mode) => page.switchMode(event({ mode }));

  await check("按条件找赛", async () => {
    const f = racePage(params => ({ races: [params.get("city") ? { ...fixtures.upcoming, id: "filtered" } : fixtures.upcoming], total: 1, page: 1, pages: 1 }));
    await f.page.load();
    assert.equal(f.page.data.races[0].id, "current", "初次请求加载默认列表");
    f.page.openSheet(event({ sheet: "city" }));
    f.page.pickProvince(event({ name: "北京" }));
    await f.page.pickCity(event({ name: "北京" }));
    await f.page.pickMonth(event({ value: "2027-03" }));
    await f.page.setDistance(event({ value: "half" }));
    assert.equal(f.requests.length, 1, "选条件只更新草稿，点击查找前仍只有首屏请求");
    assert.equal(f.page.data.sheet, "");
    assert.equal(f.page.data.races[0].id, "current");
    await f.page.submitFind();
    assert.equal(f.requests.length, 2);
    assert.deepEqual(Object.fromEntries(f.lastParams()), { status: "upcoming", city: "北京", month: "2027-03", distance: "half", page: "1" });
    assert.equal(f.page.data.races[0].id, "filtered", "回包中的当前届赛事显示在列表");
  });

  await check("关键词查往届", async () => {
    const f = racePage(params => ({ races: [params.get("q") === "北京马拉松" && params.get("status") === "all" ? fixtures.closed : fixtures.upcoming], total: 1, page: 1, pages: 1 }));
    await f.page.load();
    if (f.page.switchMode) selectMode(f.page, "keyword");
    f.page.onQ(event({}, " 北京马拉松 "));
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(f.requests.length, 1, "填关键词不自动查询，键盘确认或点击按钮才查询");
    await f.page.submitFind();
    assert.deepEqual(Object.fromEntries(f.lastParams()), { q: "北京马拉松", status: "all", page: "1" });
    assert.equal(f.page.data.races[0].id, "past");
    assert.equal(f.page.data.races[0].displayStatus, "比赛结束");
    assert.match(markup, /bindinput="onQ" bindconfirm="submitFind"/);
    f.page.onQ(event({}, "  "));
    await f.page.submitFind();
    assert.equal(f.page.data.hasKeyword, false, "空白关键词不可提交");
    assert.equal(f.requests.length, 2);
    assert.equal(f.page.data.races[0].id, "past");
  });

  await check("切换模式保留输入", async () => {
    const f = racePage();
    await f.page.load();
    assert.match(markup, /data-mode="filters"[^>]*bindtap="switchMode">按条件找赛<\/button>/, "首页给按条件找赛提供独立模式入口");
    assert.match(markup, /data-mode="keyword"[^>]*bindtap="switchMode">搜赛事<\/button>/, "首页给关键词搜索提供独立模式入口");
    await f.page.pickCity(event({ name: "北京" }));
    await f.page.setMeet(event({ meet: "offline" }));
    selectMode(f.page, "keyword");
    f.page.onQ(event({}, "厦门马拉松"));
    selectMode(f.page, "filters");
    assert.equal(f.page.data.mode, "filters");
    assert.equal(f.page.data.cityLabel, "北京");
    assert.equal(f.page.data.meet, "offline");
    selectMode(f.page, "keyword");
    assert.equal(f.page.data.mode, "keyword");
    assert.equal(f.page.data.q, "厦门马拉松");
    assert.equal(f.requests.length, 1, "切换和填写两套草稿不改变查询结果");
  });

  await check("失败后按提交条件重试", async () => {
    let failed = false;
    const f = racePage(params => {
      if (params.get("q") && !failed) {
        failed = true;
        throw Error("验收注入：请求超时");
      }
      const race = params.get("q") === "北京马拉松" ? fixtures.closed : fixtures.upcoming;
      return { races: [race], total: 1, page: 1, pages: 1 };
    });
    await f.page.load();
    if (f.page.switchMode) selectMode(f.page, "keyword");
    f.page.onQ(event({}, "北京马拉松"));
    await (f.page.submitFind || f.page.load).call(f.page);
    assert.equal(f.page.data.message, "验收注入：请求超时", "已进入可重试的请求失败状态");
    assert.equal(f.lastParams().get("q"), "北京马拉松");
    const submitted = f.requests.at(-1);
    f.page.onQ(event({}, "尚未提交的关键词"));
    await (f.page.retryFind || f.page.load).call(f.page);
    assert.equal(f.requests.at(-1), submitted, "重试发送原查询，仍在编辑的输入保持草稿");
    assert.equal(f.page.data.message, "");
    assert.equal(f.page.data.q, "尚未提交的关键词");
    assert.equal(f.page.data.races[0].id, "past");
    assert.match(markup, /bindtap="retryFind"[^>]*>重试<\/button>/, "出错后提供可点击的重试按钮");
  });
  return failures;
}

async function checkExistingRaceControls() {
  const { page, requests, scrolls, lastParams } = racePage();
  const currentYear = new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear();
  assert.deepEqual(Array.from(page.data.yearBlocks, (item) => item.year), [currentYear - 1, currentYear, currentYear + 1, currentYear + 2]);
  await page.load();
  async function apply(method, dataset, expected) {
    const before = requests.length;
    page.openSheet(event({ sheet: method === "pickCity" ? "city" : method === "pickMonth" ? "time" : "status" }));
    await page[method](event(dataset));
    assert.equal(page.data.sheet, "", method + " automatically closes the sheet");
    assert.equal(requests.length, before, method + " keeps changes in the draft");
    await page.submitFind();
    assert.equal(requests.length, before + 1, method + " queries exactly once on submission");
    for (const [key, value] of Object.entries(expected)) assert.equal(lastParams().get(key), value, method + " query " + key);
    assert.equal(scrolls.at(-1).selector, "#race-results", method + " brings the submitted results into view");
    assert.equal(scrolls.at(-1).offsetTop, -(page.data.statusBarHeight + page.data.navHeight));
  }
  await page.setKind(event({ kind: "trail" }));
  await apply("setMeet", { meet: "online" }, { kind: "trail", meet: "online", status: "upcoming" });
  page.openSheet(event({ sheet: "status" }));
  assert.equal(page.data.meet, "online", "reopening preserves the selected format");
  const beforeClose = requests.length;
  page.closeSheet();
  assert.equal(requests.length, beforeClose, "closing alone does not issue another request");
  await apply("pickStatus", { value: "all" }, { kind: "trail", meet: "online", status: "all" });
  await apply("setDistance", { value: "full" }, { kind: "trail", meet: "online", distance: "full", status: "all" });
  await apply("setDistance", { value: "half" }, { distance: "half", kind: "trail", meet: "online", status: "all" });
  assert.equal(page.data.distance, "half", "distance selection stores a single value");
  await apply("setDistance", { value: "10k" }, { distance: "10k", kind: "trail" });
  await apply("setDistance", { value: "" }, { distance: null, kind: "trail", meet: "online" });

  page.openSheet(event({ sheet: "city" }));
  const beforeProvince = requests.length;
  page.pickProvince(event({ name: "浙江" }));
  assert.equal(page.data.sheet, "city", "province browsing keeps the sheet open");
  assert.equal(requests.length, beforeProvince, "province browsing does not query races");
  assert.ok(page.data.cities.some((item) => item.name === "杭州"));
  await page.pickCity(event({ name: "杭州" }));
  await page.submitFind();
  assert.equal(lastParams().get("city"), "杭州");
  assert.equal(page.data.sheet, "");
  page.openSheet(event({ sheet: "city" }));
  assert.equal(page.data.province, "浙江", "reopening selects the province of the applied city");
  assert.ok(page.data.cities.some((item) => item.name === "杭州" && item.on));
  await page.pickCity(event({ name: "" }));
  await page.submitFind();
  assert.equal(lastParams().has("city"), false, "nationwide removes only the city filter");
  assert.equal(lastParams().get("kind"), "trail");

  page.openSheet(event({ sheet: "time" }));
  const beforeYear = requests.length;
  page.pickYear(event({ year: currentYear + 1 }));
  assert.equal(page.data.sheet, "time", "year browsing keeps the sheet open");
  assert.equal(requests.length, beforeYear, "year browsing does not query races");
  assert.equal(page.data.months.length, 12);
  assert.ok(page.data.months.every((item) => item.value.startsWith((currentYear + 1) + "-")));
  await page.pickMonth(event({ value: (currentYear + 1) + "-11" }));
  await page.submitFind();
  assert.equal(page.data.sheet, "");
  page.openSheet(event({ sheet: "time" }));
  assert.equal(page.data.selectedYear, currentYear + 1);
  assert.ok(page.data.months.some((item) => item.value === (currentYear + 1) + "-11" && item.on));
  await page.pickMonth(event({ value: "" }));
  await page.submitFind();
  assert.equal(lastParams().has("month"), false);
  assert.equal(lastParams().get("meet"), "online");

  await apply("pickCity", { name: "北京" }, { city: "北京" });
  await apply("pickMonth", { value: currentYear + "-11" }, { month: currentYear + "-11" });
  await apply("setDistance", { value: "full" }, { distance: "full" });
  await apply("setMeet", { meet: "offline" }, { meet: "offline" });
  await apply("pickStatus", { value: "closed" }, { status: "closed" });
  assert.deepEqual(Array.from(page.data.filterTags, (item) => item.key).sort(), ["city", "distance", "kind", "meet", "month", "status"]);
  const expected = { kind: "trail", city: "北京", month: currentYear + "-11", distance: "full", meet: "offline", status: "closed" };
  for (const key of ["distance", "city", "month", "kind", "meet", "status"]) {
    await page.clearFilter(event({ key }));
    await page.submitFind();
    delete expected[key];
    if (key === "status") expected.status = "upcoming";
    for (const [other, value] of Object.entries(expected)) assert.equal(lastParams().get(other), value, "clearing " + key + " keeps " + other);
    if (key !== "status") assert.equal(lastParams().has(key), false);
    assert.equal(page.data.filterTags.some((item) => item.key === key), false, "only the selected tag is removed");
  }
  assert.equal(page.data.filterTags.length, 0);
  await apply("pickCity", { name: "北京" }, { city: "北京" });
  await apply("setMeet", { meet: "offline" }, { city: "北京", meet: "offline" });
  page.switchMode(event({ mode: "keyword" }));
  page.onQ(event({}, "北马"));
  await page.submitFind();
  assert.equal(lastParams().get("q"), "北马");
  assert.equal(lastParams().get("status"), "all");
  assert.deepEqual([...lastParams().keys()].sort(), ["page", "q", "status"], "search ignores active filters");
  page.switchMode(event({ mode: "filters" }));
  await page.submitFind();
  assert.equal(lastParams().get("city"), "北京", "submitting restored filters uses their previous values");
  await page.clearFilters();
  await page.submitFind();
  assert.deepEqual([...lastParams().entries()], [["status", "upcoming"], ["page", "1"]]);
  assert.equal(page.data.filterTags.length, 0);
  for (const key of ["city", "month", "kind", "meet", "distance", "sheet"]) assert.equal(page.data[key], "", key + " resets");
  assert.equal(page.data.status, "upcoming");
}

async function run() {
  const failures = await findRaceChecks();
  if (failures.length) throw new AggregateError(failures, "Mini-program find-race regressions");
  await checkExistingRaceControls();
  let meetupPage;
  const meetupSource = fs.readFileSync(path.join(root, "miniprogram/pages/meetup/meetup.js"), "utf8");
  vm.runInNewContext(meetupSource, {
    require(name) {
      if (name === "../../utils/request") return { request() { return Promise.resolve({}); } };
      throw new Error("Unexpected module " + name);
    },
    Page: (definition) => { meetupPage = definition; },
    getApp: () => ({ globalData: {} }),
    wx: {}
  }, { filename: "meetup.js" });
  const instance = { ...meetupPage, data: { meetup: { shareText: "周日奥森半马" } }, setData() {} };
  instance.onLoad({ club: "3", id: "8" });
  const share = instance.onShareAppMessage();
  assert.equal(share.title, "周日奥森半马");
  assert.equal(share.path, "/pages/meetup/meetup?club=3&id=8");

  let appDefinition;
  let privacyListener;
  let privacyNavigation = "";
  const appSource = fs.readFileSync(path.join(root, "miniprogram/app.js"), "utf8");
  vm.runInNewContext(appSource, {
    require(name) {
      if (name === "./config") return { baseUrl: "https://example.test" };
      if (name === "./utils/avatar") return { networkAvatar: (value) => value || "" };
      throw new Error("Unexpected module " + name);
    },
    App: (definition) => { appDefinition = definition; },
    wx: {
      getStorageSync: () => "",
      onNeedPrivacyAuthorization: (listener) => { privacyListener = listener; },
      navigateTo: (options) => { privacyNavigation = options.url; }
    },
    getCurrentPages: () => []
  }, { filename: "app.js" });
  appDefinition.onLaunch.call({ globalData: appDefinition.globalData });
  let authorization = null;
  privacyListener((result) => { authorization = result; }, { referrer: "chooseMedia" });
  assert.equal(privacyNavigation, "/pages/privacy/privacy");
  let privacyPage;
  const privacySource = fs.readFileSync(path.join(root, "miniprogram/pages/privacy/privacy.js"), "utf8");
  vm.runInNewContext(privacySource, {
    Page: (definition) => { privacyPage = definition; },
    getApp: () => ({ globalData: appDefinition.globalData }),
    wx: { navigateBack() {} }
  }, { filename: "privacy.js" });
  privacyPage.agreePrivacyAuthorization.call({ setData() {} });
  assert.equal(authorization.event, "agree");
  assert.equal(authorization.buttonId, "privacy-agree-btn");
  let cancelledAuthorization = null;
  appDefinition.globalData.privacyResolvers = [(result) => { cancelledAuthorization = result; }];
  privacyPage.onUnload();
  assert.equal(cancelledAuthorization.event, "disagree", "leaving privacy page must settle a pending request");

  const { renderCallPoster, clubRaceRows } = require(path.join(root, "miniprogram/utils/call-poster.js"));
  const combinedRows = clubRaceRows({ marks: [{ userId: 1, nickname: "小鹿", clock: "1:42:00" }], results: [{ userId: 1, nickname: "小鹿", clock: "1:42:00", distanceLabel: "半马", pb: true }, { userId: 2, nickname: "队友", clock: "3:50:00", distanceLabel: "全马" }] });
  assert.equal(combinedRows.length, 2, "matching marks and results share one export row");
  assert.equal(combinedRows[0].distance, "半马");
  assert.equal(combinedRows[1].status, "完赛");
  const calls = [];
  const ctx = {
    measureText: (text) => ({ width: String(text).length * 14 }),
    fillRect() {}, fillText(text) { calls.push(text); }, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}
  };
  const canvas = { getContext: () => ctx };
  const groups = [{ label: "半马", rows: Array.from({ length: 360 }, (_, index) => ({ place: index + 1, nickname: "跑者" + index, clock: "1:50:00", tag: "PB" })) }];
  const size = renderCallPoster(canvas, { title: "城市马拉松", raceDate: "2026-11-18", summary: "本场 PB 3 人", groups });
  assert.equal(size.width, 750);
  assert.ok(size.height < 32768);
  assert.ok(calls.some((line) => String(line).includes("前 350 条")));
  console.log(JSON.stringify({ passed: true, checks: ["mini filter choices close drawers and wait for submission", "mini province and year only browse", "mini reopening preserves selection", "mini distance options stay exclusive", "mini individual tags and clear all", "mini submission scrolls beyond the sticky header", "mini keyword and filter parameters stay independent", "dynamic twelve-month year grid", "meetup share route", "privacy consent resolver", "long result poster dimensions and large-result limit"] }, null, 2));
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
