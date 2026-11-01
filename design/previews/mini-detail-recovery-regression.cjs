const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const report = { kind: "Mini-program detail recovery Page VM acceptance; in-memory requests only", checks: [] };

function fixture(name, requestHandler, native = {}) {
  let definition;
  const requests = [];
  const folder = path.join(root, "miniprogram/pages", name);
  const source = fs.readFileSync(path.join(folder, name + ".js"), "utf8");
  vm.runInNewContext(source, {
    require(moduleName) {
      if (moduleName === "../../utils/request") return { request: (...args) => { requests.push(args); return requestHandler(...args); } };
      if (moduleName === "../../config") return { baseUrl: "https://example.test" };
      if (moduleName === "../../utils/call-poster") return {};
      throw new Error("Unexpected module " + moduleName);
    },
    getApp: () => ({ globalData: { token: "detail-token", baseUrl: "https://example.test" } }),
    Page: (page) => { definition = page; },
    wx: { showShareMenu() {}, ...native }
  }, { filename: name + ".js" });
  const page = {
    ...definition,
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) { Object.assign(this.data, patch); }
  };
  page.onLoad({ club: "44", id: "7" });
  return { page, requests, markup: fs.readFileSync(path.join(folder, name + ".wxml"), "utf8") };
}

const payloads = {
  internal: { race: { id: 7, title: "春季队内赛", groups: [{ id: 1, name: "轻松组", full: false, rows: [] }], mine: null } },
  call: { call: { id: 7, title: "秋季成绩", deadline: "2026-11-20T20:00", distances: ["full"], groups: [], members: [] } },
  meetup: { meetup: { id: 7, place: "奥森", joins: [], checks: [], photos: [] } },
  album: { activity: { id: 7, title: "周日训练相册" }, items: [{ id: 8, kind: "photo", nickname: "跑友" }], photoCount: 1, videoCount: 0, photoLeft: 399, videoLeft: 20, review: true, staff: false }
};

async function run() {
  for (const name of ["internal", "album", "call", "meetup"]) {
    let call = 0;
    const error = Object.assign(new Error("你不在这个跑团里"), { status: 403 });
    const stateKey = { internal: "race", album: "activity", call: "call", meetup: "meetup" }[name];
    const { page, requests, markup } = fixture(name, (url) => url === "/clubs/44" ? Promise.resolve({ club: { staff: true }, members: [] }) : ++call === 1 ? Promise.reject(error) : Promise.resolve(payloads[name]));
    const failed = page.load();
    assert.equal(typeof failed.then, "function", name + " load returns a Promise");
    assert.equal(page.data.loading, true);
    await failed;
    assert.equal(page.data.loading, false);
    assert.equal(page.data[stateKey], null);
    assert.equal(page.data.message, "你不在这个跑团里");
    assert.match(markup, /<view wx:else class="(?:detail-state|meetup-state)">/);
    assert.match(markup, /\{\{message \|\| ['"][^'"]+['"]\}\}/);
    assert.match(markup, /<button wx:if="\{\{!loading\}\}" class="btn" bindtap="load">重新加载<\/button>/);
    report.checks.push({ name: name + " initial 403 exposes an error state and a retry entry", passed: true });

    const recovered = page.load();
    assert.equal(page.data.loading, true);
    assert.equal(page.data.message, "");
    await recovered;
    assert.equal(page.data.loading, false);
    assert.equal(page.data[stateKey].id, 7);
    assert.equal(page.data.message, "");
    const details = requests.filter(([url]) => url !== "/clubs/44");
    assert.equal(details.length, 2);
    assert.equal(details[0][0], { internal: "/clubs/44/internals/7", album: "/clubs/44/activities/7/album", call: "/clubs/44/calls/7", meetup: "/clubs/44/meetups/7" }[name]);
    assert.equal(details[0][0], details[1][0]);
    if (name === "internal") assert.equal(page.data.groupId, 1);
    else if (name === "album") {
      assert.equal(page.data.photos.length, 1);
      assert.equal(page.data.photos[0].src, "https://example.test/marathon/api/media/8?t=detail-token");
    }
    report.checks.push({ name: name + " retry requests the same resource and restores the full detail after authorization is restored", passed: true });

    let rejectOld;
    let resolveFresh;
    let concurrentCall = 0;
    const concurrent = fixture(name, (url) => url === "/clubs/44" ? Promise.resolve({ club: { staff: true }, members: [] }) : ++concurrentCall === 1 ? new Promise((resolve, reject) => { rejectOld = reject; }) : new Promise((resolve) => { resolveFresh = resolve; }));
    const old = concurrent.page.load();
    const fresh = concurrent.page.load();
    resolveFresh(payloads[name]);
    await fresh;
    rejectOld(new Error("旧请求失败"));
    await old;
    assert.equal(concurrent.page.data[stateKey].id, 7);
    assert.equal(concurrent.page.data.message, "");
    assert.equal(concurrent.page.data.loading, false);
    report.checks.push({ name: name + " a late failed request cannot replace a newer successful detail", passed: true });
  }
  for (const name of ["call", "meetup"]) {
    let allowed = true;
    const stateKey = name;
    const { page } = fixture(name, (url) => url === "/clubs/44" ? Promise.resolve({ club: { staff: true }, members: [] }) : allowed ? Promise.resolve(payloads[name]) : Promise.reject(Object.assign(new Error("你不在这个跑团里"), { status: 403 })));
    await page.load();
    assert.ok(page.data[stateKey]);
    allowed = false;
    await page.load();
    assert.equal(page.data[stateKey], null);
    assert.equal(page.data.loading, false);
    report.checks.push({ name: name + " authorization loss clears previously visible private detail", passed: true });

    let finish;
    const late = fixture(name, (url) => url === "/clubs/44" ? Promise.resolve({ club: { staff: true } }) : new Promise(resolve => { finish = resolve; }));
    const pending = late.page.load();
    late.page.onUnload();
    finish(payloads[name]);
    await pending;
    assert.equal(late.page.data[stateKey], null);
    report.checks.push({ name: name + " a response after leaving the page cannot restore detail", passed: true });
  }
  {
    const { page } = fixture("album", () => Promise.resolve(payloads.album), { uploadFile: ({ success }) => success({ statusCode: 400, data: JSON.stringify({ error: "视频不超过 40MB" }) }) });
    await page.load();
    page.uploadAll([{ tempFilePath: "local-video.mp4" }]);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.data.message, "视频不超过 40MB");
    assert.equal(page.data.loading, false);
    report.checks.push({ name: "album failed upload remains explained after refreshing the list", passed: true });
  }
  {
    let preview;
    const { page } = fixture("album", () => Promise.resolve(payloads.album), { previewImage: (options) => { preview = options; } });
    await page.load();
    page.previewPhoto({ currentTarget: { dataset: { id: 8 } } });
    assert.equal(preview.current, page.data.photos[0].src);
    assert.equal(preview.urls.length, 1);
    report.checks.push({ name: "album native preview opens the tapped authorized photo", passed: true });
  }
  {
    const race = { race: { ...payloads.internal.race, canStaffResult: true, groups: [{ id: 1, rows: [{ userId: 3, nickname: "跑友甲" }] }] } };
    const { page, requests } = fixture("internal", () => Promise.resolve(race));
    await page.load();
    page.saveStaffResult({ currentTarget: { dataset: {} } });
    assert.equal(requests.length, 1, "no request before selecting an actual signed runner");
    page.selectResultMember({ detail: { value: 0 } });
    page.onStaffTime({ detail: { value: "45:30" } });
    await page.saveStaffResult({ currentTarget: { dataset: {} } });
    assert.equal(requests[1][0], "/clubs/44/internals/7/results");
    assert.equal(requests[1][2].userId, 3);
    assert.equal(requests[1][2].time, "45:30");
    await page.saveStaffResult({ currentTarget: { dataset: { outcome: "dns" } } });
    assert.equal(requests[3][2].outcome, "dns");
    report.checks.push({ name: "internal organizer records a selected participant's result or DNS without changing self", passed: true });
  }
  report.passed = true;
}

run().catch((error) => {
  report.passed = false;
  report.error = error.stack || String(error);
  process.exitCode = 1;
}).finally(() => {
  fs.writeFileSync(path.join(__dirname, "mini-detail-recovery-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
