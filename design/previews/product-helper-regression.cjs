const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "miniprogram/pages/races/races.js"), "utf8");
let pageDefinition;
const requests = [];
const scrolls = [];
const racesRequire = createRequire(path.join(root, "miniprogram/pages/races/races.js"));
const fakeWx = {
  getWindowInfo: () => ({ statusBarHeight: 20, windowWidth: 390, windowHeight: 844 }),
  getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 390, windowHeight: 844 }),
  pageScrollTo: (options) => scrolls.push(options),
  getMenuButtonBoundingClientRect: () => ({ width: 87, height: 32, top: 52, right: 380 })
};
vm.runInNewContext(source, {
  require(name) {
    if (name === "../../utils/request") return { request: (url) => { requests.push(url); return Promise.resolve({ races: [], reminders: [], total: 0, pages: 1, page: 1 }); } };
    return racesRequire(name);
  },
  Page: (definition) => { pageDefinition = definition; },
  wx: fakeWx,
  Date,
  clearTimeout,
  setTimeout
}, { filename: "races.js" });

const page = {
  ...pageDefinition,
  data: JSON.parse(JSON.stringify(pageDefinition.data)),
  setData(patch, complete) { Object.assign(this.data, patch); if (complete) complete(); }
};

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function run() {
  page.onLoad();
  page.paint();
  const currentYear = new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear();
  assert.deepEqual(Array.from(page.data.yearBlocks, (item) => item.year), [currentYear - 1, currentYear, currentYear + 1, currentYear + 2]);
  const event = (dataset) => ({ currentTarget: { dataset } });
  const raceRequests = () => requests.filter((url) => url.startsWith("/races?"));
  const lastParams = () => new URLSearchParams(raceRequests().at(-1).split("?")[1]);
  await page.load();
  async function apply(method, dataset, expected) {
    const before = raceRequests().length;
    page.onPageScroll({ scrollTop: 640 });
    page.openSheet(event({ sheet: method === "pickCity" ? "city" : method === "pickMonth" ? "time" : "status" }));
    await page[method](event(dataset));
    await settle();
    assert.equal(raceRequests().length, before + 1, method + " applies exactly once without confirmation");
    assert.equal(page.data.sheet, "", method + " automatically closes the sheet");
    for (const [key, value] of Object.entries(expected)) assert.equal(lastParams().get(key), value, method + " query " + key);
    assert.equal(scrolls.at(-1).scrollTop, 640, method + " restores the prior page position after loading");
  }
  await page.setKind(event({ kind: "trail" }));
  await settle();
  await apply("setMeet", { meet: "online" }, { kind: "trail", meet: "online", status: "upcoming" });
  page.openSheet(event({ sheet: "status" }));
  assert.equal(page.data.meet, "online", "reopening preserves the selected format");
  const beforeClose = raceRequests().length;
  page.closeSheet();
  assert.equal(raceRequests().length, beforeClose, "closing alone does not issue another request");
  await apply("pickStatus", { value: "all" }, { kind: "trail", meet: "online", status: "all" });
  await apply("setDistance", { value: "full" }, { kind: "trail", meet: "online", distance: "full", status: "all" });
  await apply("setDistance", { value: "half" }, { distance: "half", kind: "trail", meet: "online", status: "all" });
  assert.equal(page.data.full, false, "distance options are mutually exclusive");
  assert.equal(page.data.half, true);
  await apply("setDistance", { value: "10k" }, { distance: "10k", kind: "trail" });
  assert.equal(page.data.full || page.data.half, false);
  await apply("setDistance", { value: "" }, { distance: null, kind: "trail", meet: "online" });

  page.openSheet(event({ sheet: "city" }));
  const beforeProvince = raceRequests().length;
  page.pickProvince(event({ name: "浙江" }));
  assert.equal(page.data.sheet, "city", "province browsing keeps the sheet open");
  assert.equal(raceRequests().length, beforeProvince, "province browsing does not query races");
  assert.ok(page.data.cities.some((item) => item.name === "杭州"));
  await page.pickCity(event({ name: "杭州" }));
  await settle();
  assert.equal(lastParams().get("city"), "杭州");
  assert.equal(page.data.sheet, "");
  page.openSheet(event({ sheet: "city" }));
  assert.equal(page.data.province, "浙江", "reopening selects the province of the applied city");
  assert.ok(page.data.cities.some((item) => item.name === "杭州" && item.on));
  await page.pickCity(event({ name: "" }));
  await settle();
  assert.equal(lastParams().has("city"), false, "nationwide removes only the city filter");
  assert.equal(lastParams().get("kind"), "trail");

  page.openSheet(event({ sheet: "time" }));
  const beforeYear = raceRequests().length;
  page.pickYear(event({ year: currentYear + 1 }));
  assert.equal(page.data.sheet, "time", "year browsing keeps the sheet open");
  assert.equal(raceRequests().length, beforeYear, "year browsing does not query races");
  assert.equal(page.data.months.length, 12);
  assert.ok(page.data.months.every((item) => item.value.startsWith((currentYear + 1) + "-")));
  await page.pickMonth(event({ value: (currentYear + 1) + "-11" }));
  await settle();
  assert.equal(page.data.sheet, "");
  page.openSheet(event({ sheet: "time" }));
  assert.equal(page.data.selectedYear, currentYear + 1);
  assert.ok(page.data.months.some((item) => item.value === (currentYear + 1) + "-11" && item.on));
  await page.pickMonth(event({ value: "" }));
  await settle();
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
    await settle();
    delete expected[key];
    if (key === "status") expected.status = "upcoming";
    for (const [other, value] of Object.entries(expected)) assert.equal(lastParams().get(other), value, "clearing " + key + " keeps " + other);
    if (key !== "status") assert.equal(lastParams().has(key), false);
    assert.equal(page.data.filterTags.some((item) => item.key === key), false, "only the selected tag is removed");
  }
  assert.equal(page.data.filterTags.length, 0);
  await apply("pickCity", { name: "北京" }, { city: "北京" });
  await apply("setMeet", { meet: "offline" }, { city: "北京", meet: "offline" });
  page.data.q = "北马";
  await page.load();
  await settle();
  assert.equal(lastParams().get("q"), "北马");
  assert.equal(lastParams().get("status"), "all");
  assert.deepEqual([...lastParams().keys()].sort(), ["page", "q", "status"], "search ignores active filters");
  page.data.q = "";
  await page.load();
  assert.equal(lastParams().get("city"), "北京", "clearing search restores applied filters");
  await page.clearFilters();
  await settle();
  assert.deepEqual([...lastParams().entries()], [["status", "upcoming"], ["page", "1"]]);
  assert.equal(page.data.filterTags.length, 0);
  for (const key of ["city", "month", "kind", "meet", "distance", "sheet"]) assert.equal(page.data[key], "", key + " resets");
  assert.equal(page.data.full || page.data.half || page.data.ten, false);
  assert.equal(page.data.status, "upcoming");

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
  console.log(JSON.stringify({ passed: true, checks: ["mini independent filters apply and close immediately", "mini province and year only browse", "mini reopening preserves selection", "mini distance options stay exclusive", "mini individual tags and clear all", "mini filter update restores scroll", "mini search ignores and restores filters", "dynamic twelve-month year grid", "meetup share route", "privacy consent resolver", "long result poster dimensions and large-result limit"] }, null, 2));
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
