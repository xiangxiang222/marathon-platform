const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
const mini = path.join(root, "miniprogram");
const report = { kind: "Mini runner center Page VM behavior checks; no business data writes", checks: [] };
const base = {
  asOf: "2026-10-29", overview: { weekKm: 16.2, weekCount: 2, weekDurationSec: 4860, monthKm: 60, totalKm: 200, totalCount: 23 },
  training: { period: "week", offset: 0, label: "10.26 – 11.01", km: 16.2, count: 2, durationSec: 4860, paceLabel: "5'00\"", activeDays: 2, bars: [{ key: "mon", label: "一", km: 0 }, { key: "tue", label: "二", km: 16.2 }], runs: [{ id: 1, type: "run", startedAt: "2026-10-27T06:30", distanceKm: 16.2, durationSec: 4860, paceLabel: "5'00\"", city: "北京" }] },
  career: { finished: 3, raceYears: 2, totalKm: 84.39, totalSeconds: 30000, provinces: ["北京"], cities: ["北京"], byDistance: [{ key: "full", label: "全马", count: 3 }], years: ["2026", "2025"], pb: [{ distance: "full", distanceLabel: "全马", clock: "3:00:00", seconds: 10800, race: { id: "road", name: "北京马拉松", raceDate: "2026-03-01" } }], trends: [{ year: "2025", count: 1, km: 42.195, seconds: 12000, paceSec: 284 }, { year: "2026", count: 2, km: 84.39, seconds: 24000, paceSec: 284 }] },
  results: [
    { distance: "full", distanceLabel: "全马", clock: "3:00:00", seconds: 10800, pb: false, hasProof: true, proofLabel: "证书", race: { id: "road", name: "北京马拉松", raceDate: "2026-03-01", province: "北京", city: "北京", kind: "road", meet: "offline" } },
    { distance: "half", distanceLabel: "半马", clock: "1:30:00", seconds: 5400, pb: true, race: { id: "online", name: "线上赛", raceDate: "2026-04-01", province: "广东", city: "广州", kind: "road", meet: "online" } },
    { distance: "full", distanceLabel: "全马", clock: "3:10:00", seconds: 11400, race: { id: "old", name: "旧赛事", raceDate: "2025-04-01", province: "北京", city: "北京", kind: "road", meet: "offline" } },
    { distance: "full", clock: "3:00:00", seconds: 10800, race: { id: "future", name: "未来赛", raceDate: "2027-04-01", city: "深圳", kind: "road" } },
    { distance: "full", clock: "3:00:00", seconds: 10800, race: { id: "invalid", name: "错误日期", raceDate: "2026-02-31", city: "上海", kind: "road" } }
  ],
  media: [{ id: 4, kind: "photo", raceId: "road", distance: "full", createdAt: "2026-04-01", mime: "image/jpeg", size: 300 }],
  devices: [{ id: "garmin", name: "Garmin 佳明", status: "unavailable", reason: "暂未开放授权" }]
};
const copy = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(file = "runner") {
  const globalData = { token: "owner-token", baseUrl: "https://runner.example", nickname: "跑者" };
  const storage = {};
  const calls = [];
  const app = { globalData };
  let definition;
  let reply = () => Promise.resolve(copy(base));
  let choose;
  let upload;
  const wx = {
    setNavigationBarTitle(data) { calls.push({ type: "title", ...data }); },
    setStorageSync(key, value) { storage[key] = value; }, getStorageSync(key) { return storage[key]; }, removeStorageSync(key) { delete storage[key]; },
    navigateTo(data) { calls.push({ type: "navigate", ...data }); }, switchTab(data) { calls.push({ type: "switch", ...data }); },
    showToast(data) { calls.push({ type: "toast", ...data }); }, stopPullDownRefresh() {},
    chooseMedia(options) { choose = options; }, uploadFile(options) { upload = options; },
    showModal(options) { calls.push({ type: "modal", title: options.title, content: options.content }); options.success({ confirm: true }); }, previewImage(options) { calls.push({ type: "preview", ...options }); }
  };
  const helpers = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(mini, "utils/runner-center.js"), "utf8"), { module: helpers, getApp: () => app }, { filename: "runner-center.js" });
  const request = { ready: () => !!globalData.token, request(endpoint, method = "GET", body = {}) { calls.push({ type: "request", endpoint, method, body }); return reply(endpoint, method, body); }, setAuth(token, nickname, avatar) { Object.assign(globalData, { token, nickname, avatar }); }, clearAuth() { Object.assign(globalData, { token: "", nickname: "", avatar: "" }); } };
  vm.runInNewContext(fs.readFileSync(path.join(mini, "pages/" + file + "/" + file + ".js"), "utf8"), {
    Page(page) { definition = page; }, wx, getApp: () => app,
    require(name) { if (name === "../../utils/request") return request; if (name === "../../utils/runner-center") return helpers.exports; if (name === "../../utils/captcha") return { saveCaptchaFile: () => Promise.resolve("local-captcha") }; if (name === "../../utils/avatar") return { networkAvatar: (url) => url || "", prepareAvatar: () => Promise.resolve("avatar") }; throw Error("Unexpected module " + name); }
  }, { filename: file + ".js" });
  const page = { ...definition, data: copy(definition.data), setData(patch) { Object.assign(this.data, patch); } };
  return { page, app, calls, storage, helper: helpers.exports, setReply(fn) { reply = fn; }, chosen() { return choose; }, uploaded() { return upload; } };
}
async function check(name, fn) { await fn(); report.checks.push({ name, passed: true }); }
async function main() {
  await check("Private data decoration uses authenticated URLs and recalculates PB from eligible records", async () => {
    const f = fixture(); const data = f.helper.decorate(copy(base));
    assert.equal(data.training.bars[0].height, 0); assert.equal(data.training.bars[1].height, 100);
    assert.equal(data.overview.weekKmLabel, "16.2"); assert.equal(data.overview.weekMinutes, 81);
    assert.match(data.media[0].src, /\/me\/runner\/media\/4\/file\?t=owner-token$/);
    assert.match(data.collection[0].src, /result\/proof\?distance=full&t=owner-token$/);
    assert.equal(data.results.find((item) => item.race.id === "road").pb, true);
    assert.equal(data.results.find((item) => item.race.id === "online").pb, false);
  });
  await check("Timeline includes eligible online races; city passport excludes online, future and invalid dates", async () => {
    const { page } = fixture(); await page.onShow();
    assert.equal(page.data.filteredResults.length, 3); assert.equal(page.data.cities.length, 1); assert.equal(page.data.cities[0].count, 2);
    assert.equal(page.data.cityEventCount, 2); assert.equal(page.data.provinceCount, 1);
    page.pickYear({ detail: { value: "2" } }); assert.equal(page.data.filteredResults.length, 1); assert.equal(page.data.cities[0].count, 1);
    page.pickKind({ currentTarget: { dataset: { kind: "trail" } } }); assert.equal(page.data.filteredResults.length, 0);
    page.pickMetric({ currentTarget: { dataset: { metric: "paceSec" } } }); assert.equal(page.data.metricUnit, "分/公里"); assert.equal(page.data.paceRows[0].value, "4′44″"); assert.equal(page.data.trendBars.length, 0);
  });
  await check("Annual pace has no fabricated zero or inverted height ranking", async () => {
    const f = fixture();
    const data = copy(base);
    data.career.trends = [
      { year: "2023", count: 1, km: 0, seconds: 12000, paceSec: null },
      { year: "2024", count: 1, km: 0, seconds: 0, paceSec: 0 },
      { year: "2025", count: 1, km: 42.195, seconds: 12659, paceSec: 300 },
      { year: "2026", count: 1, km: 42.195, seconds: 15190, paceSec: 360 }
    ];
    f.setReply(() => Promise.resolve(copy(data))); await f.page.onShow();
    f.page.pickMetric({ currentTarget: { dataset: { metric: "paceSec" } } });
    assert.deepEqual(Array.from(f.page.data.paceRows, (item) => item.value), ["—", "—", "5′00″", "6′00″"]);
    assert.equal(f.page.data.paceRows[0].available, false); assert.equal(f.page.data.trendBars.length, 0);
    const markup = fs.readFileSync(path.join(mini, "pages/runner/runner.wxml"), "utf8");
    assert.match(markup, /metric === 'paceSec'/); assert.match(markup, /数值越小，配速越快/); assert.match(markup, /暂无可计算距离/);
    f.page.pickMetric({ currentTarget: { dataset: { metric: "km" } } });
    assert.equal(f.page.data.trendBars[0].height, 0); assert.equal(f.page.data.trendBars[2].height, 100);
  });
  await check("City passport expands every matching result and isolates years, provinces and accounts", async () => {
    const f = fixture(); const data = copy(base);
    data.results.push(
      { distance: "half", distanceLabel: "半马", clock: "1:45:00", seconds: 6300, race: { id: "road", name: "北京马拉松", raceDate: "2026-03-01", province: "北京", city: "北京", kind: "road", meet: "offline" } },
      { distance: "full", distanceLabel: "全马", clock: "3:20:00", seconds: 12000, race: { id: "another-province", name: "同名城市赛", raceDate: "2026-05-01", province: "河北", city: "北京", kind: "road", meet: "offline" } }
    );
    f.setReply(() => Promise.resolve(copy(data))); await f.page.onShow();
    f.page.pickCity({ currentTarget: { dataset: { key: "北京:北京" } } });
    assert.equal(f.page.data.selectedCity.count, 2); assert.equal(f.page.data.selectedCity.results.length, 3);
    assert.equal(f.page.data.selectedCity.results[2].race.id, "old");
    assert.equal(f.calls.filter((item) => item.type === "navigate").length, 0);
    f.page.pickCity({ currentTarget: { dataset: { key: "北京:北京" } } }); assert.equal(f.page.data.selectedCity, null);
    f.page.pickCity({ currentTarget: { dataset: { key: "河北:北京" } } }); assert.equal(f.page.data.selectedCity.results.length, 1);
    f.page.pickYear({ detail: { value: "2" } }); assert.equal(f.page.data.selectedCity, null); assert.equal(f.page.data.selectedCityKey, "");
    f.page.pickCity({ currentTarget: { dataset: { key: "北京:北京" } } }); assert.equal(f.page.data.selectedCity.results.length, 1);
    f.app.globalData.token = ""; await f.page.onShow(); assert.equal(f.page.data.selectedCity, null); assert.equal(f.page.data.selectedCityKey, "");
  });
  await check("Retained private collections keep event titles, years and owner deletion without a result", async () => {
    const f = fixture(); const data = copy(base);
    data.media.push({ id: 9, kind: "photo", raceId: "detached", distance: "full", distanceLabel: "全马", race: { id: "detached", name: "已撤回成绩的赛事", raceDate: "2024-04-01", city: "北京", province: "北京" } });
    f.setReply(() => Promise.resolve(copy(data))); await f.page.onShow();
    f.page.pickView({ currentTarget: { dataset: { view: "media" } } });
    const retained = f.page.data.gallery.find((item) => item.id === 9);
    assert.equal(retained.name, "已撤回成绩的赛事"); assert.equal(retained.distanceLabel, "全马"); assert.equal(retained.year, "2024"); assert.equal(retained.result, null);
    const index = f.page.data.years.indexOf("2024"); assert.ok(index > 0);
    f.page.pickYear({ detail: { value: String(index) } }); assert.equal(f.page.data.gallery.length, 1); assert.equal(f.page.data.gallery[0].id, 9);
    f.page.preview({ currentTarget: { dataset: { key: "media-9" } } }); assert.match(f.calls.at(-1).current, /media\/9\/file\?t=owner-token$/);
    f.page.deleteMedia({ currentTarget: { dataset: { id: 9 } } }); await tick();
    assert.ok(f.calls.some((item) => item.endpoint === "/me/runner/media/9" && item.method === "DELETE"));
    f.page.pickView({ currentTarget: { dataset: { view: "career" } } }); assert.equal(f.page.data.year, ""); assert.equal(f.page.data.years.includes("2024"), false);
    data.results = []; data.career.years = [];
    f.setReply(() => Promise.resolve(copy(data))); await f.page.load();
    f.page.pickView({ currentTarget: { dataset: { view: "media" } } });
    assert.equal(f.page.data.gallery.find((item) => item.id === 9).name, "已撤回成绩的赛事"); assert.ok(f.page.data.years.includes("2024"));
    f.page.deleteMedia({ currentTarget: { dataset: { id: 9 } } }); await tick();
    const confirmation = f.calls.filter((item) => item.type === "modal").at(-1);
    assert.match(confirmation.content, /不影响比赛成绩/); assert.doesNotMatch(confirmation.content, /成绩会保留/);
  });
  await check("Period switching refuses future periods and rolls back failed selection", async () => {
    const f = fixture(); await f.page.onShow(); const before = f.calls.length;
    f.page.movePeriod({ currentTarget: { dataset: { direction: 1 } } }); assert.equal(f.calls.length, before);
    f.setReply(() => Promise.reject(Error("网络中断"))); await f.page.pickPeriod({ currentTarget: { dataset: { period: "month" } } });
    assert.equal(f.page.data.period, "week"); assert.equal(f.page.data.offset, 0); assert.equal(f.page.data.error, "网络中断");
  });
  await check("Account switches and stale requests cannot expose old private records", async () => {
    const f = fixture(); let resolve; f.setReply(() => new Promise((done) => { resolve = done; }));
    const pending = f.page.onShow(); f.app.globalData.token = "new-token"; resolve(copy(base)); await pending;
    assert.equal(f.page.data.payload, null);
    f.app.globalData.token = ""; await f.page.onShow(); assert.equal(f.page.data.ready, false); assert.equal(f.page.data.gallery.length, 0);
    f.page.onLoad({ view: "not-real" }); assert.equal(f.page.data.view, "stats"); f.page.login();
    assert.equal(f.storage.marathon_runner_return, "stats"); assert.equal(f.calls.at(-1).url, "/pages/mine/mine");
  });
  await check("Gallery supports legacy proofs and new private photos with upload size checks", async () => {
    const f = fixture(); await f.page.onShow(); f.page.pickView({ currentTarget: { dataset: { view: "honors" } } });
    assert.equal(f.page.data.gallery.length, 1); assert.equal(f.page.data.gallery[0].legacy, true);
    f.page.pickView({ currentTarget: { dataset: { view: "media" } } }); assert.equal(f.page.data.gallery.length, 1);
    f.page.preview({ currentTarget: { dataset: { key: "media-4" } } }); assert.equal(f.calls.at(-1).type, "preview");
    f.page.openUpload(); f.page.chooseUpload(); f.chosen().success({ tempFiles: [{ size: 9 * 1024 * 1024, tempFilePath: "big.jpg" }] });
    assert.match(f.page.data.uploadMessage, /8MB/); assert.equal(f.uploaded(), undefined);
    f.page.chooseUpload(); f.chosen().success({ tempFiles: [{ size: 200, tempFilePath: "small.jpg" }] });
    assert.equal(f.uploaded().header.Authorization, "Bearer owner-token"); assert.match(f.uploaded().url, /raceId=road&distance=full&kind=photo/);
    f.uploaded().success({ statusCode: 413, data: JSON.stringify({ error: "文件过大" }) }); f.uploaded().complete();
    assert.equal(f.page.data.uploading, false); assert.equal(f.page.data.uploadOpen, true); assert.equal(f.page.data.uploadMessage, "文件过大");
    f.page.deleteMedia({ currentTarget: { dataset: { id: 4 } } }); await tick();
    assert.ok(f.calls.some((item) => item.type === "request" && item.endpoint === "/me/runner/media/4" && item.method === "DELETE"));
  });
  await check("Mine dashboard preserves safe return paths, profile tabs and logout cleanup", async () => {
    const f = fixture("mine");
    f.setReply((endpoint) => endpoint.startsWith("/me/runner") ? Promise.resolve(copy(base)) : Promise.resolve({ user: { nickname: "跑者", avatar: "", hasPassword: true }, plans: [], results: [], clubs: [], career: { finished: 0, provinces: [], cities: [], pb: {} } }));
    assert.equal(f.page.data.mainTab, "overview"); await f.page.load(); await tick(); assert.equal(f.page.data.runner.overview.weekKmLabel, "16.2"); assert.equal(f.page.data.runner.career.kmLabel, "84.39"); assert.notEqual(f.page.data.runner.career.kmLabel, f.page.data.runner.overview.totalKmLabel);
    f.page.pickMainTab({ currentTarget: { dataset: { tab: "profile" } } }); assert.equal(f.page.data.mainTab, "profile");
    f.storage.marathon_runner_return = "media"; f.page.resumePendingClub(); assert.equal(f.calls.at(-1).url, "/pages/runner/runner?view=media");
    f.storage.marathon_runner_return = "../../admin"; const before = f.calls.length; f.page.resumePendingClub(); assert.equal(f.calls.length, before);
    f.page.logout(); assert.equal(f.page.data.runner, null); assert.equal(f.page.data.nextRace, null); assert.equal(f.page.data.mainTab, "overview");
  });
  await check("Mine old summaries and result PBs match runner career in either response order", async () => {
    for (const order of ["runner-first", "account-first"]) {
      const f = fixture("mine");
      const account = { user: { nickname: "跑者", avatar: "", hasPassword: true }, plans: [], results: copy(base.results), clubs: [], career: { finished: 99, provinces: ["错误省份"], cities: ["错误城市"], pb: { full: "1:00:00", half: "0:30:00" }, yearKm: 999 } };
      let runnerDone; let accountDone;
      f.setReply((endpoint) => new Promise((resolve) => { if (endpoint.startsWith("/me/runner")) runnerDone = resolve; else accountDone = resolve; }));
      const pending = f.page.load();
      if (order === "runner-first") { runnerDone(copy(base)); await tick(); accountDone(account); }
      else { accountDone(account); await pending; runnerDone(copy(base)); }
      await pending; await tick();
      assert.equal(f.page.data.career.finished, 3, order + " deduplicated count");
      assert.equal(f.page.data.career.pb.full, "3:00:00"); assert.equal(f.page.data.career.pb.half, "");
      assert.equal(f.page.data.career.provinces[0], "北京"); assert.equal(f.page.data.career.cities[0], "北京");
      assert.equal(f.page.data.career.yearKm, 84.39);
      assert.equal(f.page.data.results.find((item) => item.race.id === "road").pb, true);
      assert.equal(f.page.data.results.find((item) => item.race.id === "online").pb, false);
      assert.equal(f.page.data.results.find((item) => item.race.id === "invalid").pb, false);
      assert.equal(f.page.data.results.find((item) => item.race.id === "future").pb, false);
      assert.ok(f.page.data.results[0].proofSrc, "original certificate preview remains available");
    }
  });
  await check("Training summaries use matching-period comparisons and only call current week 本周", async () => {
    const f = fixture();
    const current = copy(base); Object.assign(current.training, { previousKm: 8.1, changePercent: 100, comparisonLabel: "较上期同期" });
    f.setReply(() => Promise.resolve(copy(current))); await f.page.onShow();
    assert.equal(f.page.data.payload.training.isCurrentWeek, true);
    assert.match(f.page.data.payload.training.comparisonText, /较上期同期多跑了 8.1 公里（\+100%）/);
    const historical = copy(current); Object.assign(historical.training, { offset: -1, comparisonLabel: "较上一期", previousKm: 20, changePercent: -19 });
    f.setReply(() => Promise.resolve(copy(historical))); await f.page.movePeriod({ currentTarget: { dataset: { direction: -1 } } });
    assert.equal(f.page.data.payload.training.isCurrentWeek, false);
    assert.match(f.page.data.payload.training.comparisonText, /较上一期少跑了 3.8 公里（-19%）/);
    assert.doesNotMatch(f.page.data.payload.training.comparisonText, /本周|上周同期/);
    const noPrevious = copy(historical); Object.assign(noPrevious.training, { previousKm: 0, changePercent: null });
    assert.doesNotMatch(f.helper.decorate(noPrevious).training.comparisonText, /本周|这周|上周同期/);
    assert.match(f.helper.decorate(noPrevious).training.comparisonText, /较上一期暂无记录/);
    const total = copy(base); Object.assign(total.training, { period: "all", offset: 0 });
    assert.equal(f.helper.decorate(total).training.comparisonText, "");
    const mine = fixture("mine"); mine.page.toggleHelp(); assert.equal(mine.page.data.helpOpen, true); mine.page.toggleHelp(); assert.equal(mine.page.data.helpOpen, false);
  });
  await check("Native icons match the shared web SVG paths and every referenced asset exists", async () => {
    const webIcons = fs.readFileSync(path.join(root, "web/src/components/RunnerIcon.vue"), "utf8");
    const shapes = new Map(Array.from(webIcons.matchAll(/<template v-(?:if|else-if)="name === '([^']+)'">([\s\S]*?)<\/template>/g), (match) => [match[1], match[2]]));
    const f = fixture();
    for (const entry of f.helper.VIEWS) {
      assert.equal(entry.icon, "/images/runner/" + entry.key + ".png");
      const png = fs.readFileSync(path.join(mini, entry.icon));
      assert.equal(png.readUInt32BE(16), 96); assert.equal(png.readUInt32BE(20), 96);
      const svg = fs.readFileSync(path.join(mini, "images/runner/" + entry.key + ".svg"), "utf8");
      assert.ok(svg.includes(shapes.get(entry.key)), "shared path for " + entry.key);
      const color = entry.key === "honors" ? "#bf893b" : entry.key === "media" ? "#8a77b3" : entry.key === "devices" ? "#778699" : "#ff0a30";
      assert.ok(svg.includes('stroke="' + color + '"'));
    }
    for (const file of ["pages/mine/mine.wxml", "pages/runner/runner.wxml"]) {
      const markup = fs.readFileSync(path.join(mini, file), "utf8");
      for (const match of markup.matchAll(/src="(\/images\/runner\/[^"{}]+)"/g)) assert.ok(fs.existsSync(path.join(mini, match[1])), "asset exists: " + match[1]);
    }
    const mineMarkup = fs.readFileSync(path.join(mini, "pages/mine/mine.wxml"), "utf8");
    assert.match(mineMarkup, /data-tab="overview" bindtap="pickMainTab">总览/);
    assert.match(mineMarkup, /class="entry-icon" src="\{\{item\.icon\}\}"/);
    assert.match(mineMarkup, /class="career-totals"/); assert.match(mineMarkup, /runner\.career\.kmLabel/); assert.match(mineMarkup, /比赛里程 · 公里/); assert.doesNotMatch(mineMarkup, /累计跑步 · 公里/);
    assert.doesNotMatch(mineMarkup, /\{\{item\.mark\}\}/);
  });
  const markup = fs.readFileSync(path.join(mini, "pages/runner/runner.wxml"), "utf8");
  assert.match(markup, /仅自己可见/); assert.match(markup, /厂商接入/); assert.match(markup, /小程序暂不支持直接读取/);
  assert.match(markup, /payload\.training\.truncated/);
  report.passed = true;
}
main().catch((error) => { report.passed = false; report.error = error.stack || String(error); process.exitCode = 1; }).finally(() => { fs.writeFileSync(path.join(__dirname, "runner-mini-report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); });
