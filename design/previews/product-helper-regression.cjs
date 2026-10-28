const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "miniprogram/pages/races/races.js"), "utf8");
let pageDefinition;
const requests = [];
const fakeWx = {
  getWindowInfo: () => ({ statusBarHeight: 20, windowWidth: 390 }),
  getSystemInfoSync: () => ({ statusBarHeight: 20, windowWidth: 390 }),
  getMenuButtonBoundingClientRect: () => ({ width: 87, height: 32, top: 52, right: 380 })
};
vm.runInNewContext(source, {
  require(name) {
    if (name === "../../utils/request") return { request: (url) => { requests.push(url); return Promise.resolve({ races: [], reminders: [], total: 0, pages: 1, page: 1 }); } };
    throw new Error("Unexpected module " + name);
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
  setData(patch) { Object.assign(this.data, patch); }
};

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function run() {
  page.onLoad();
  page.paint();
  const currentYear = new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear();
  assert.deepEqual(Array.from(page.data.yearBlocks, (item) => item.year), [currentYear - 1, currentYear, currentYear + 1, currentYear + 2]);
  page.setKind({ currentTarget: { dataset: { kind: "trail" } } });
  page.setMeet({ currentTarget: { dataset: { meet: "online" } } });
  await settle();
  const combined = requests.filter((url) => url.startsWith("/races?")).at(-1);
  assert.ok(combined.includes("kind=trail"));
  assert.ok(combined.includes("meet=online"));

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
  console.log(JSON.stringify({ passed: true, checks: ["mini race filters", "dynamic year list", "meetup share route", "privacy consent resolver", "long result poster dimensions and large-result limit"] }, null, 2));
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
