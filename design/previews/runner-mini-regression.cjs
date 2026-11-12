const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
const mini = path.join(root, "miniprogram");
const legal = require(path.join(mini, "utils/legal-documents.js"));
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
  let modal;
  const wx = {
    setNavigationBarTitle(data) { calls.push({ type: "title", ...data }); },
    setStorageSync(key, value) { storage[key] = value; }, getStorageSync(key) { return storage[key]; }, removeStorageSync(key) { delete storage[key]; },
    navigateTo(data) { calls.push({ type: "navigate", ...data }); }, switchTab(data) { calls.push({ type: "switch", ...data }); },
    showToast(data) { calls.push({ type: "toast", ...data }); }, stopPullDownRefresh() {},
    chooseMedia(options) { choose = options; }, chooseMessageFile(options) { calls.push({ type: "choose-file" }); choose = options; }, uploadFile(options) { upload = options; },
    setClipboardData(options) { calls.push({ type: "clipboard", data: options.data }); if (options.success) options.success({}); },
    showModal(options) { calls.push({ type: "modal", title: options.title, content: options.content }); modal = options; }, previewImage(options) { calls.push({ type: "preview", ...options }); }
  };
  const legalModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(mini, "utils/legal-documents.js"), "utf8"), { module: legalModule }, { filename: "utils/legal-documents.js" });
  const helpers = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(mini, "utils/runner-center.js"), "utf8"), { module: helpers, getApp: () => app }, { filename: "runner-center.js" });
  const realAuth = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(mini, "utils/request.js"), "utf8"), {
    module: realAuth, wx, getApp: () => app,
    require(name) { if (name === "./avatar") return { networkAvatar: value => value || "", normalizeAvatars: value => value }; throw Error("Unexpected auth module " + name); }
  }, { filename: "utils/request.js" });
  const request = { ready: () => !!globalData.token, request(endpoint, method = "GET", body = {}) { calls.push({ type: "request", endpoint, method, body }); return endpoint === "/legal" ? Promise.resolve(copy(legal)) : reply(endpoint, method, body); }, setAuth: realAuth.exports.setAuth, clearAuth: realAuth.exports.clearAuth };
  vm.runInNewContext(fs.readFileSync(path.join(mini, "pages/" + file + "/" + file + ".js"), "utf8"), {
    Page(page) { definition = page; }, wx, getApp: () => app,
    require(name) { if (name === "../../utils/request") return request; if (name.endsWith(".json")) throw Error("Mini program require cannot load JSON as a script module: " + name); if (name === "../../utils/legal-documents" || name === "../../utils/legal-documents.js") return legalModule.exports; if (name === "../../config") return { baseUrl: globalData.baseUrl }; if (name === "../../utils/runner-center") return helpers.exports; if (name === "../../utils/achievement-model") return require(path.join(mini, "utils/achievement-model.js")); if (name === "../../utils/captcha") return { saveCaptchaFile: () => Promise.resolve("local-captcha") }; if (name === "../../utils/avatar") return { networkAvatar: (url) => url || "", prepareAvatar: () => Promise.resolve("avatar") }; throw Error("Unexpected module " + name); }
  }, { filename: file + ".js" });
  const page = { ...definition, data: copy(definition.data), setData(patch) { for (const [key, value] of Object.entries(patch)) { const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.'); let target = this.data; for (const part of parts.slice(0, -1)) target = target[part]; target[parts.at(-1)] = value; } } };
  return { page, app, wx, calls, storage, helper: helpers.exports, setReply(fn) { reply = fn; }, chosen() { return choose; }, uploaded() { return upload; }, modal() { return modal; }, answerModal(confirm) { assert.ok(modal, "A user confirmation must be shown first"); modal.success({ confirm, cancel: !confirm }); if (modal.complete) modal.complete(); } };
}
async function check(name, fn) { await fn(); report.checks.push({ name, passed: true }); }
async function main() {
  await check("Private data decoration uses authenticated URLs and recalculates PB from eligible records", async () => {
    const f = fixture(); const data = f.helper.decorate(copy(base));
    assert.equal(data.training.bars[0].height, 0); assert.equal(data.training.bars[1].height, 100);
    const imported = copy(base); imported.training.runs = [{ type: "run", runMode: "unknown" }, { type: "run", runMode: "treadmill" }];
    assert.deepEqual(Array.from(f.helper.decorate(imported).training.runs, (item) => item.typeLabel), ["跑步·待确认", "跑步机"]);
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
    f.page.deleteMedia({ currentTarget: { dataset: { id: 9 } } }); f.answerModal(true); await tick();
    assert.ok(f.calls.some((item) => item.endpoint === "/me/runner/media/9" && item.method === "DELETE"));
    f.page.pickView({ currentTarget: { dataset: { view: "career" } } }); assert.equal(f.page.data.year, ""); assert.equal(f.page.data.years.includes("2024"), false);
    data.results = []; data.career.years = [];
    f.setReply(() => Promise.resolve(copy(data))); await f.page.load();
    f.page.pickView({ currentTarget: { dataset: { view: "media" } } });
    assert.equal(f.page.data.gallery.find((item) => item.id === 9).name, "已撤回成绩的赛事"); assert.ok(f.page.data.years.includes("2024"));
    f.page.deleteMedia({ currentTarget: { dataset: { id: 9 } } }); f.answerModal(true); await tick();
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
    f.page.deleteMedia({ currentTarget: { dataset: { id: 4 } } }); f.answerModal(true); await tick();
    assert.ok(f.calls.some((item) => item.type === "request" && item.endpoint === "/me/runner/media/4" && item.method === "DELETE"));
  });
  await check("Device file import validates format and size before upload, preserves original filename and handles duplicates", async () => {
    const f = fixture(); await f.page.onShow();
    const choose = (file, agree = false) => { f.page.chooseActivityFile(); f.chosen().success({ tempFiles: [file] }); f.chosen().complete(); if (agree) f.answerModal(true); };
    choose({ name: "photo.jpg", path: "wxfile://temp", size: 200 });
    assert.match(f.page.data.deviceMessage, /FIT 或 TCX/); assert.equal(f.uploaded(), undefined);
    choose({ name: "oversized.fit", path: "wxfile://temp", size: 5 * 1024 * 1024 + 1 });
    assert.match(f.page.data.deviceMessage, /5 MB/); assert.equal(f.uploaded(), undefined);
    choose({ name: "empty.fit", path: "wxfile://temp", size: 0 });
    assert.match(f.page.data.deviceMessage, /内容为空/); assert.equal(f.uploaded(), undefined);
    choose({ name: "COROS Morning Run.FIT", path: "wxfile://temporary-without-extension", size: 2048 }, true);
    const upload = f.uploaded();
    assert.match(upload.url, /\/me\/devices\/import$/); assert.equal(upload.name, "file");
    assert.equal(upload.header.Authorization, "Bearer owner-token");
    assert.equal(upload.header["X-Activity-Data-Consent"], legal.version);
    assert.equal(upload.formData.filename, "COROS Morning Run.FIT");
    assert.equal(f.page.data.deviceBusy, "import");
    upload.success({ statusCode: 200, data: JSON.stringify({ imported: 1, duplicates: 0, rejected: 0, source: "file", runId: 17 }) }); upload.complete(); await tick();
    assert.match(f.page.data.deviceMessage, /已导入 1 场/); assert.equal(f.page.data.deviceBusy, ""); assert.equal(f.page.data.deviceFailed, false);
    choose({ name: "same.fit", path: "wxfile://again", size: 2048 }, true);
    f.uploaded().success({ statusCode: 200, data: JSON.stringify({ imported: 0, duplicates: 1, rejected: 0, source: "file", runId: 17 }) }); f.uploaded().complete(); await tick();
    assert.match(f.page.data.deviceMessage, /没有重复计入/); assert.equal(f.page.data.deviceFailed, false);
    choose({ name: "deleted.fit", path: "wxfile://deleted", size: 2048 }, true);
    f.uploaded().success({ statusCode: 200, data: JSON.stringify({ imported: 0, duplicates: 1, note: "这条运动曾被你删除，重复导入不会恢复", source: "file" }) }); f.uploaded().complete(); await tick();
    assert.equal(f.page.data.deviceMessage, "这条运动曾被你删除，重复导入不会恢复");
  });
  await check("File selection clears previous failures, opens once, and cannot complete an active upload", async () => {
    const f = fixture(); await f.page.onShow();
    f.page.setData({ deviceMessage: "上次失败", deviceFailed: true, deviceErrorDetail: "previous diagnostic" });
    f.page.chooseActivityFile();
    assert.equal(f.page.data.deviceBusy, "choose"); assert.equal(f.page.data.deviceMessage, "");
    assert.equal(f.page.data.deviceFailed, false); assert.equal(f.page.data.deviceErrorDetail, "");
    const picker = f.chosen();
    assert.equal(picker.count, 1); assert.equal(picker.type, "file");
    assert.deepEqual(Array.from(picker.extension), ["fit", "tcx"]);
    f.page.chooseActivityFile();
    assert.equal(f.calls.filter((item) => item.type === "choose-file").length, 1);
    picker.success({ tempFiles: [{ name: "run.fit", path: "wxfile://run", size: 200 }] });
    assert.equal(f.uploaded(), undefined); f.answerModal(true);
    assert.equal(f.page.data.deviceBusy, "import");
    picker.complete();
    assert.equal(f.page.data.deviceBusy, "import");
    f.page.chooseActivityFile();
    assert.equal(f.calls.filter((item) => item.type === "choose-file").length, 1);
    f.uploaded().complete(); assert.equal(f.page.data.deviceBusy, "");
  });
  await check("File data processing requires a separate decision and declining leaves the picker usable", async () => {
    const f = fixture(); await f.page.onShow();
    f.page.chooseActivityFile();
    f.chosen().success({ tempFiles: [{ name: "private.fit", path: "wxfile://private", size: 200 }] }); f.chosen().complete();
    assert.equal(f.uploaded(), undefined);
    assert.equal(f.modal().title, "导入运动数据前确认");
    assert.match(f.modal().content, /GPS/); assert.match(f.modal().content, /心率/);
    assert.match(f.modal().content, /服务器|上传/); assert.match(f.modal().content, /临时|本次/);
    f.answerModal(false);
    assert.equal(f.uploaded(), undefined); assert.equal(f.page.data.deviceBusy, "");
    assert.equal(f.page.data.deviceFailed, false);
    f.page.chooseActivityFile();
    f.chosen().success({ tempFiles: [{ name: "retry.fit", path: "wxfile://retry-after-decline", size: 200 }] }); f.chosen().complete();
    assert.equal(f.uploaded(), undefined);
    f.answerModal(true);
    assert.equal(f.uploaded().filePath, "wxfile://retry-after-decline");
    assert.equal(f.uploaded().header["X-Activity-Data-Consent"], legal.version);
  });
  await check("Late import agreement from a previous account cannot upload or erase a new selection", async () => {
    const f = fixture(); await f.page.onShow();
    f.page.chooseActivityFile();
    f.chosen().success({ tempFiles: [{ name: "old.fit", path: "wxfile://old-consent", size: 200 }] }); f.chosen().complete();
    const stale = f.modal();
    f.app.globalData.token = "new-token"; await f.page.onShow();
    f.page.chooseActivityFile();
    stale.success({ confirm: true, cancel: false }); if (stale.complete) stale.complete();
    assert.equal(f.uploaded(), undefined);
    assert.equal(f.page.data.deviceBusy, "choose");
    assert.equal(f.page.data.deviceMessage, "");
    f.chosen().success({ tempFiles: [{ name: "new.fit", path: "wxfile://new-consent", size: 200 }] }); f.chosen().complete();
    f.answerModal(true);
    assert.equal(f.uploaded().header.Authorization, "Bearer new-token");
    assert.equal(f.uploaded().filePath, "wxfile://new-consent");
  });
  await check("Late import agreement after hiding or unloading cannot upload or update the page", async () => {
    for (const lifecycle of ["onHide", "onUnload"]) {
      const f = fixture(); await f.page.onShow();
      f.page.chooseActivityFile();
      f.chosen().success({ tempFiles: [{ name: "late.fit", path: "wxfile://left-page", size: 200 }] }); f.chosen().complete();
      const stale = f.modal(); f.page[lifecycle](); const before = copy(f.page.data);
      stale.success({ confirm: true, cancel: false }); if (stale.complete) stale.complete();
      assert.equal(f.uploaded(), undefined);
      assert.deepEqual(copy(f.page.data), before);
    }
  });
  await check("File picker reports undeclared permissions separately from declined privacy authorization", async () => {
    const cases = [
      { error: { errMsg: "chooseMessageFile:fail api scope is not declared in the privacy agreement", errno: 112 }, message: /尚未开通/ },
      { error: { errMsg: "chooseMessageFile:fail", errno: 112 }, message: /尚未开通/ },
      { error: { errMsg: "chooseMessageFile:fail appid privacy api banned" }, message: /尚未开通/ },
      { error: { errMsg: "chooseMessageFile:fail privacy authorization denied" }, message: /同意/ },
      { error: { errMsg: "chooseMessageFile:fail privacy authorization disagree" }, message: /同意/ },
      { error: { errMsg: "chooseMessageFile:fail", errno: 103 }, message: /同意/ },
      { error: { errMsg: "", errno: 104 }, message: /同意/ },
      { error: { errMsg: "chooseMessageFile:fail native picker unavailable", errno: 42 }, message: /微信.*选[取择]|选[取择].*微信/ }
    ];
    for (const { error, message } of cases) {
      const f = fixture(); await f.page.onShow(); f.page.chooseActivityFile();
      f.chosen().fail(error); f.chosen().complete();
      assert.match(f.page.data.deviceMessage, message, error.errMsg);
      assert.equal(f.page.data.deviceFailed, true); assert.equal(f.page.data.deviceBusy, "");
      assert.ok(f.page.data.deviceErrorDetail.includes(error.errMsg));
      if (error.errno) assert.ok(f.page.data.deviceErrorDetail.includes(String(error.errno)));
      assert.equal(f.uploaded(), undefined);
    }
  });
  await check("Cancelling or returning unusable picker results releases selection and permits retry", async () => {
    const f = fixture(); await f.page.onShow();
    for (const error of [{ errMsg: "chooseMessageFile:fail cancel" }, { errMsg: "chooseMessageFile:fail CANCEL", errno: 103 }]) {
      f.page.setData({ deviceMessage: "old failure", deviceFailed: true, deviceErrorDetail: "old detail" });
      f.page.chooseActivityFile(); f.chosen().fail(error); f.chosen().complete();
      assert.equal(f.page.data.deviceMessage, ""); assert.equal(f.page.data.deviceFailed, false);
      assert.equal(f.page.data.deviceErrorDetail, ""); assert.equal(f.page.data.deviceBusy, "");
    }
    for (const result of [{}, { tempFiles: [] }, { tempFiles: [{ name: "run.fit", size: 200 }] }]) {
      f.page.chooseActivityFile(); f.chosen().success(result); f.chosen().complete();
      assert.equal(f.page.data.deviceFailed, true); assert.ok(f.page.data.deviceMessage);
      assert.equal(f.page.data.deviceBusy, ""); assert.equal(f.uploaded(), undefined);
    }
    f.page.chooseActivityFile();
    f.chosen().success({ tempFiles: [{ name: "retry.tcx", path: "wxfile://retry", size: 200 }] }); f.chosen().complete(); f.answerModal(true);
    assert.equal(f.uploaded().filePath, "wxfile://retry"); assert.equal(f.page.data.deviceBusy, "import");
    assert.equal(f.page.data.deviceErrorDetail, "");
  });
  await check("Picker errors can be copied for diagnosis and the browser import link excludes credentials", async () => {
    const f = fixture(); await f.page.onShow(); f.page.chooseActivityFile();
    const error = { errMsg: "chooseMessageFile:fail native picker unavailable", errno: 42 };
    f.chosen().fail(error); f.chosen().complete();
    f.page.copyDeviceError();
    assert.equal(f.calls.filter((item) => item.type === "clipboard").at(-1).data, f.page.data.deviceErrorDetail);
    f.page.copyDeviceImportUrl();
    const url = f.calls.filter((item) => item.type === "clipboard").at(-1).data;
    assert.equal(url, "https://runner.example/marathon/runner?view=devices");
    assert.doesNotMatch(url, /owner-token|token|Authorization/);
    delete f.wx.chooseMessageFile;
    f.page.chooseActivityFile();
    assert.match(f.page.data.deviceMessage, /微信版本|更新微信/); assert.equal(f.page.data.deviceBusy, "");
    assert.equal(f.page.data.deviceFailed, true);
  });
  await check("Stale picker callbacks cannot upload across accounts, erase a new selection, or update an unloaded page", async () => {
    const f = fixture(); await f.page.onShow(); f.page.chooseActivityFile();
    const stale = f.chosen();
    f.page.setData({ deviceErrorDetail: "old diagnostic" });
    f.app.globalData.token = "new-token"; await f.page.onShow();
    assert.equal(f.page.data.deviceBusy, ""); assert.equal(f.page.data.deviceErrorDetail, "");
    f.page.chooseActivityFile(); const current = f.chosen();
    stale.success({ tempFiles: [{ name: "old.fit", path: "wxfile://old-account", size: 200 }] });
    stale.fail({ errMsg: "chooseMessageFile:fail api scope is not declared in the privacy agreement", errno: 112 });
    stale.complete();
    assert.equal(f.uploaded(), undefined); assert.equal(f.page.data.deviceBusy, "choose");
    assert.equal(f.page.data.deviceMessage, ""); assert.equal(f.page.data.deviceErrorDetail, "");
    current.fail({ errMsg: "chooseMessageFile:fail cancel" }); current.complete();
    assert.equal(f.page.data.deviceBusy, "");
    f.page.chooseActivityFile(); const unloaded = f.chosen(); f.page.onUnload();
    const before = copy(f.page.data);
    unloaded.success({ tempFiles: [{ name: "late.fit", path: "wxfile://late", size: 200 }] });
    unloaded.fail({ errMsg: "chooseMessageFile:fail privacy authorization denied", errno: 103 }); unloaded.complete();
    assert.equal(f.uploaded(), undefined); assert.deepEqual(copy(f.page.data), before);
  });
  await check("FIT enrichment is successful and retains the server confirmation guidance", async () => {
    const f = fixture(); await f.page.onShow();
    f.page.chooseActivityFile(); f.chosen().success({ tempFiles: [{ name: "trail.fit", path: "wxfile://trail", size: 2048 }] });
    f.chosen().complete(); f.answerModal(true);
    f.uploaded().success({ statusCode: 200, data: JSON.stringify({ imported: 0, duplicates: 0, updated: 1, needsConfirmation: false, note: "已补全这场运动的越野类型与爬升", runId: 17 }) }); f.uploaded().complete(); await tick();
    assert.equal(f.page.data.deviceFailed, false); assert.equal(f.page.data.deviceMessage, "已补全这场运动的越野类型与爬升");
    f.page.chooseActivityFile(); f.chosen().success({ tempFiles: [{ name: "unknown.tcx", path: "wxfile://unknown", size: 2048 }] });
    f.chosen().complete(); f.answerModal(true);
    f.uploaded().success({ statusCode: 200, data: JSON.stringify({ imported: 1, needsConfirmation: true, note: "已导入，请在运动记录中确认类型" }) }); f.uploaded().complete(); await tick();
    assert.equal(f.page.data.deviceFailed, false); assert.match(f.page.data.deviceMessage, /确认类型/);
  });
  await check("Workout edit preserves unknowns, sends only explicit mode/ascent changes, and links directly to import", async () => {
    const f = fixture("sport");
    const payload = { month: { target: 0 }, year: {}, total: {}, runs: [
      { id: 21, type: "run", runMode: "unknown", typeLabel: "跑步·待确认", climb: null, city: "北京" },
      { id: 22, type: "run", runMode: "treadmill", typeLabel: "跑步机", climb: 0, city: "" }
    ] };
    f.setReply(() => Promise.resolve(copy(payload))); await f.page.load();
    assert.equal(f.page.data.summary.runs[0].typeIndex, 0); assert.equal(f.page.data.summary.runs[0].editClimb, ""); assert.equal(f.page.data.summary.runs[0].climbLabel, "未提供");
    assert.equal(f.page.data.summary.runs[1].editRunMode, "treadmill"); assert.equal(f.page.data.summary.runs[1].climbLabel, "0 米");
    f.page.onCity({ currentTarget: { dataset: { index: 0 } }, detail: { value: "杭州" } });
    f.page.saveRow({ currentTarget: { dataset: { index: 0 } } }); await tick();
    let saved = f.calls.filter((item) => item.method === "PUT").at(-1);
    assert.equal(saved.body.city, "杭州"); assert.equal(Object.hasOwn(saved.body, "runMode"), false); assert.equal(Object.hasOwn(saved.body, "climb"), false);
    f.page.onRunType({ currentTarget: { dataset: { index: 0 } }, detail: { value: "2" } });
    f.page.onClimb({ currentTarget: { dataset: { index: 0 } }, detail: { value: "0" } });
    f.page.saveRow({ currentTarget: { dataset: { index: 0 } } }); await tick();
    saved = f.calls.filter((item) => item.method === "PUT").at(-1);
    assert.equal(saved.body.runMode, "trail"); assert.equal(saved.body.climb, "0");
    f.page.goImport(); assert.equal(f.calls.at(-1).url, "/pages/runner/runner?view=devices");
  });
  await check("Device upload errors remain recoverable and stale callbacks cannot leak another account's import", async () => {
    const f = fixture(); await f.page.onShow();
    f.page.chooseActivityFile(); f.chosen().success({ tempFiles: [{ name: "run.tcx", path: "wxfile://one", size: 200 }] });
    f.chosen().complete(); f.answerModal(true);
    f.uploaded().success({ statusCode: 400, data: JSON.stringify({ error: "每个文件只能包含一场活动" }) }); f.uploaded().complete();
    assert.equal(f.page.data.deviceMessage, "每个文件只能包含一场活动"); assert.equal(f.page.data.deviceFailed, true); assert.equal(f.page.data.deviceBusy, "");
    f.page.chooseActivityFile(); f.chosen().success({ tempFiles: [{ name: "run.tcx", path: "wxfile://two", size: 200 }] });
    f.chosen().complete(); f.answerModal(true);
    const stale = f.uploaded(); f.app.globalData.token = "new-token"; await f.page.onShow();
    const reads = f.calls.filter((item) => item.type === "request").length;
    stale.success({ statusCode: 200, data: JSON.stringify({ imported: 1, source: "file" }) }); stale.complete(); await tick();
    assert.equal(f.page.data.deviceMessage, ""); assert.equal(f.page.data.deviceBusy, "");
    assert.equal(f.calls.filter((item) => item.type === "request").length, reads);
  });
  await check("Only connected devices can sync or disconnect; disconnect retains saved workouts", async () => {
    const f = fixture(); const payload = copy(base);
    payload.devices = [{ id: "coros", name: "COROS 高驰", status: "unavailable", reason: "厂商待开通" }];
    f.setReply(() => Promise.resolve(copy(payload))); await f.page.onShow();
    const tap = { currentTarget: { dataset: { provider: "coros" } } }; const before = f.calls.length;
    await f.page.syncDevice(tap); f.page.disconnectDevice(tap); assert.equal(f.calls.length, before);
    payload.devices[0].status = "connected";
    f.setReply((endpoint, method) => {
      if (endpoint.endsWith("/sync")) return Promise.resolve({ imported: 2, duplicates: 1, rejected: 0 });
      if (method === "DELETE") { payload.devices[0].status = "revoked"; return Promise.resolve({ ok: true }); }
      return Promise.resolve(copy(payload));
    });
    await f.page.load(); assert.equal(f.page.data.payload.devices[0].statusLabel, "已连接");
    await f.page.syncDevice(tap); assert.match(f.page.data.deviceMessage, /已同步 2 场/);
    assert.ok(f.calls.some((item) => item.endpoint === "/me/devices/coros/sync" && item.method === "POST"));
    f.page.disconnectDevice(tap); f.answerModal(true); await tick(); await tick();
    assert.ok(f.calls.some((item) => item.endpoint === "/me/devices/coros" && item.method === "DELETE"));
    assert.match(f.calls.filter((item) => item.type === "modal").at(-1).content, /已保存的运动记录继续保留/);
    assert.equal(f.page.data.payload.devices[0].statusLabel, "已解除");
    payload.devices[0].status = "unavailable"; payload.devices[0].canDisconnect = true;
    await f.page.load(); const syncCount = f.calls.filter((item) => item.endpoint && item.endpoint.endsWith("/sync")).length;
    await f.page.syncDevice(tap); assert.equal(f.calls.filter((item) => item.endpoint && item.endpoint.endsWith("/sync")).length, syncCount);
    f.page.disconnectDevice(tap); f.answerModal(true); await tick(); await tick();
    assert.match(f.calls.filter((item) => item.type === "modal").at(-1).content, /清除之前保留的连接凭据/);
    assert.match(f.page.data.deviceMessage, /已清除旧连接/);
    assert.equal(f.page.deviceSyncTime("2026-10-29T06:00:00Z"), "2026-10-29 14:00 北京时间");
    const markup = fs.readFileSync(path.join(mini, "pages/runner/runner.wxml"), "utf8");
    assert.match(markup, /文件导入按跑团的手填规则计入 PK/);
    assert.match(markup, /item.status === 'available' \|\| item.status === 'revoked'/);
    assert.doesNotMatch(markup, /bindtap="[^"]*"[^>]*>绑定设备</);
  });
  await check("Existing imported workouts cannot open screenshot upload while manual records retain it", async () => {
    const f = fixture("sport");
    const runs = [{ id: 11, source: "file" }, { id: 12, source: "coros" }, { id: 13 }, { id: 14, source: "manual" }];
    f.page.data.summary = { month: { target: 0 }, runs };
    f.setReply(() => Promise.resolve({ month: { target: 0 }, runs: copy(runs) }));
    for (const index of [0, 1, 2, 99]) f.page.addShot({ currentTarget: { dataset: { index } } });
    assert.equal(f.chosen(), undefined); assert.equal(f.uploaded(), undefined);
    f.page.addShot({ currentTarget: { dataset: { index: 3 } } });
    assert.ok(f.chosen()); f.chosen().success({ tempFiles: [{ tempFilePath: "wxfile://manual-shot" }] });
    assert.match(f.uploaded().url, /\/runs\/14\/shot$/);
    f.uploaded().success({ statusCode: 200 }); await tick();
    const markup = fs.readFileSync(path.join(mini, "pages/sport/sport.wxml"), "utf8");
    assert.match(markup, /<button wx:if="\{\{item.source === 'manual'\}\}"[^>]+bindtap="addShot"/);
    const web = fs.readFileSync(path.join(root, "web/src/views/Exercise.vue"), "utf8");
    const existingRecord = web.slice(web.indexOf('<article v-for="item in data.runs"'), web.indexOf('</article>') + 10);
    assert.ok(existingRecord.includes('record-editor')); assert.doesNotMatch(existingRecord, /type="file"|pickShot|uploadShot/);
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
  await check("Mine top-right settings preserve the previous tab and contain the only signed-in logout; real storage and private drafts clear", async () => {
    const markup = fs.readFileSync(path.join(mini, "pages/mine/mine.wxml"), "utf8");
    const signedInCard = markup.slice(markup.indexOf('<view wx:if="{{nickname}}" class="surface account-hero">'), markup.indexOf('<view wx:else class="surface guest-hero">'));
    assert.ok(!signedInCard.includes('bindtap="logout"'), "Account card stays focused on the runner");
    assert.match(markup.split('<view class="mine-page')[0], /class="header-settings" bindtap="openSettings" aria-label="设置"/);
    const settings = markup.slice(markup.indexOf(`<view wx:if="{{mainTab === 'settings'}}"`), markup.indexOf('  <block wx:else>'));
    assert.match(settings, /<button wx:if="{{nickname}}" class="logout" bindtap="logout">退出登录<\/button>/);
    assert.equal((markup.match(/bindtap="logout"/g) || []).length, 1, "One signed-in-only logout entrance in settings");
    const f = fixture("mine");
    f.page.pickMainTab({ currentTarget: { dataset: { tab: "results" } } }); f.page.openSettings(); assert.equal(f.page.data.mainTab, "settings"); f.page.closeSettings(); assert.equal(f.page.data.mainTab, "results");
    Object.assign(f.storage, { marathon_token: "owner-token", marathon_name: "旧昵称", marathon_avatar: "old-avatar" });
    Object.assign(f.page.data, { nickname: "旧昵称", avatar: "old-avatar", nicknameDraft: "草稿昵称", avatarPreview: "selected-avatar", avatarSaving: true, profileMessage: "保存中", mainTab: "profile", draft: "旧登录名", password: "old-password", password2: "old-password", currentPassword: "old-password", nextPassword: "new-password", captcha: "abcd", captchaImage: "old-captcha", runner: copy(base), plans: [{ id: 1 }], results: [{ id: 1 }], clubs: [{ id: 1 }], ready: true });
    f.page.logout();
    for (const key of ["marathon_token", "marathon_name", "marathon_avatar"]) assert.equal(f.storage[key], undefined, key + " must be removed by the real clearAuth helper");
    assert.equal(f.app.globalData.token, ""); assert.equal(f.app.globalData.nickname, ""); assert.equal(f.app.globalData.avatar, "");
    for (const key of ["nickname", "nicknameDraft", "avatar", "avatarPreview", "profileMessage", "draft", "password", "password2", "currentPassword", "nextPassword", "captcha", "captchaImage"]) assert.equal(f.page.data[key], "", key + " must be cleared");
    assert.equal(f.page.data.mainTab, "overview"); assert.equal(f.page.data.ready, false); assert.equal(f.page.data.runner, null); assert.equal(f.page.data.avatarSaving, false);
    for (const key of ["plans", "results", "clubs"]) assert.equal(f.page.data[key].length, 0);
  });
  await check("Mine poster tools live inside career and results context and require eligible completed results", async () => {
    const markup = fs.readFileSync(path.join(mini, "pages/mine/mine.wxml"), "utf8");
    assert.ok(!markup.includes('achievement-poster-entry'));
    assert.match(markup, /class="surface career-overview"[\s\S]*?class="compact-poster"/);
    const f = fixture("mine");
    f.page.setData({ runner: { asOf: base.asOf, results: base.results.filter(row => ["future", "invalid"].includes(row.race.id)) } });
    f.page.openAchievementPoster({ currentTarget: { dataset: { mode: "results" } } });
    assert.equal(f.calls.filter(call => call.type === "navigate").length, 0); assert.equal(f.page.data.mainTab, "results"); assert.match(f.calls.at(-1).title, /记录完赛成绩/);
    f.page.setData({ runner: copy(base) }); f.page._runnerToken = f.app.globalData.token; f.page.applyRunnerCareer(); assert.equal(f.page.data.posterAvailable, true);
    f.page.openAchievementPoster({ currentTarget: { dataset: { mode: "results" } } }); assert.match(f.calls.at(-1).url, /achievement-poster.*mode=results/);
    f.page.logout(); assert.equal(f.page.data.posterAvailable, false); f.page.openAchievementPoster({ currentTarget: { dataset: {} } }); assert.equal(f.calls.filter(call => call.type === "navigate").length, 1);
  });
  await check("Late profile responses after logout cannot restore auth or write into a new account", async () => {
    for (const switchAccount of [false, true]) {
      const f = fixture("mine"); let finish;
      f.page.data.nicknameDraft = "旧昵称";
      f.setReply(endpoint => { assert.equal(endpoint, "/me/profile"); return new Promise(resolve => { finish = resolve; }); });
      const saving = f.page.saveProfile();
      assert.equal(typeof finish, "function"); f.page.logout();
      if (switchAccount) { Object.assign(f.app.globalData, { token: "new-account-token", nickname: "新账号", avatar: "new-avatar" }); Object.assign(f.page.data, { nickname: "新账号", avatar: "new-avatar" }); }
      finish({ user: { nickname: "迟到的旧昵称", avatar: "old-avatar" } }); await saving;
      assert.equal(f.page.data.nickname, switchAccount ? "新账号" : ""); assert.equal(f.page.data.avatar, switchAccount ? "new-avatar" : "");
      assert.equal(f.app.globalData.token, switchAccount ? "new-account-token" : ""); assert.equal(f.page.data.profileMessage, "");
      assert.equal(f.calls.filter(call => call.type === "request").length, 1);
    }
  });
  await check("Logout interrupts avatar preparation and prevents the next profile write after an in-flight upload", async () => {
    for (const uploaded of [false, true]) {
      const f = fixture("mine"); let finish;
      f.page.data.nicknameDraft = "旧昵称"; f.page._avatarPath = "selected-avatar";
      f.setReply(endpoint => { assert.equal(endpoint, "/me/avatar"); return new Promise(resolve => { finish = resolve; }); });
      const saving = f.page.saveProfile();
      if (uploaded) await tick();
      f.page.logout();
      if (uploaded) finish({ avatar: "old-avatar" });
      await saving;
      assert.equal(f.calls.filter(call => call.endpoint === "/me/avatar").length, uploaded ? 1 : 0);
      assert.equal(f.calls.filter(call => call.endpoint === "/me/profile").length, 0);
      assert.equal(f.app.globalData.token, ""); assert.equal(f.page.data.nickname, ""); assert.equal(f.page.data.avatar, "");
    }
  });
  await check("Logout cancels older login, captcha and WeChat binding completions", async () => {
    const login = fixture("mine"); let finishLogin;
    login.page.data.legalAccepted = true; login.page.data.draft = "旧账号"; login.page.data.password = "old-password";
    login.setReply(endpoint => { assert.equal(endpoint, "/auth/login"); return new Promise(resolve => { finishLogin = resolve; }); });
    const pendingLogin = login.page.submitAuth(); login.page.logout();
    finishLogin({ token: "old-token", user: { nickname: "旧账号", avatar: "old-avatar" } }); await pendingLogin;
    assert.equal(login.app.globalData.token, ""); assert.equal(login.page.data.nickname, "");
    const captcha = fixture("mine"); let finishCaptcha;
    captcha.setReply(() => new Promise(resolve => { finishCaptcha = resolve; }));
    const pendingCaptcha = captcha.page.loadCaptcha(); captcha.page.logout(); finishCaptcha({ image: "old-image", token: "old-captcha-token" }); await pendingCaptcha;
    assert.equal(captcha.page.data.captchaImage, ""); assert.equal(captcha.page._captchaToken, "");
    const binding = fixture("mine"); let nativeLogin;
    binding.wx.login = options => { nativeLogin = options; };
    const pendingBinding = binding.page.bindWechat(); binding.page.logout(); nativeLogin.success({ code: "old-code" });
    assert.equal(await pendingBinding, false); assert.equal(binding.calls.filter(call => call.endpoint === "/me/wechat").length, 0);
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
      const color = entry.key === "help" ? "#767676" : (process.env.UI_EXPECTED_ICON_STROKE || "#45515D");
      assert.ok(svg.includes('stroke="' + color + '"'));
    }
    for (const file of ["pages/mine/mine.wxml", "pages/runner/runner.wxml"]) {
      const markup = fs.readFileSync(path.join(mini, file), "utf8");
      for (const match of markup.matchAll(/src="(\/images\/runner\/[^"{}]+)"/g)) assert.ok(fs.existsSync(path.join(mini, match[1])), "asset exists: " + match[1]);
    }
    const mineMarkup = fs.readFileSync(path.join(mini, "pages/mine/mine.wxml"), "utf8");
    assert.match(mineMarkup, /data-tab="overview" bindtap="pickMainTab">总览/);
    assert.match(mineMarkup, /class="runner-entry \{\{item\.tone\}\}"/);
    assert.match(mineMarkup, /class="career-totals"/); assert.match(mineMarkup, /runner\.career\.kmLabel/); assert.match(mineMarkup, /比赛里程 · 公里/); assert.doesNotMatch(mineMarkup, /累计跑步 · 公里/);
    assert.doesNotMatch(mineMarkup, /\{\{item\.mark\}\}/);
  });
  const markup = fs.readFileSync(path.join(mini, "pages/runner/runner.wxml"), "utf8");
  assert.match(markup, /仅自己可见/); assert.match(markup, /厂商自动同步需正式开通/); assert.match(markup, /小程序暂不支持直接读取/);
  assert.match(markup, /payload\.training\.truncated/);
  report.passed = true;
}
main().catch((error) => { report.passed = false; report.error = error.stack || String(error); process.exitCode = 1; }).finally(() => { fs.writeFileSync(path.join(__dirname, "runner-mini-report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); });
