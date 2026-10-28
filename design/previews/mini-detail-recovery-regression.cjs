const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const report = { kind: "Mini-program detail recovery Page VM acceptance; in-memory requests only", checks: [] };

function fixture(name, requestHandler) {
  let definition;
  const requests = [];
  const folder = path.join(root, "miniprogram/pages", name);
  const source = fs.readFileSync(path.join(folder, name + ".js"), "utf8");
  vm.runInNewContext(source, {
    require(moduleName) {
      if (moduleName === "../../utils/request") return { request: (...args) => { requests.push(args); return requestHandler(...args); } };
      throw new Error("Unexpected module " + moduleName);
    },
    getApp: () => ({ globalData: { token: "detail-token", baseUrl: "https://example.test" } }),
    Page: (page) => { definition = page; },
    wx: {}
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
  album: { activity: { id: 7, title: "周日训练相册" }, items: [{ id: 8, kind: "photo", nickname: "跑友" }], photoCount: 1, videoCount: 0, photoLeft: 399, videoLeft: 20, review: true, staff: false }
};

async function run() {
  for (const name of ["internal", "album"]) {
    let call = 0;
    const error = Object.assign(new Error("你不在这个跑团里"), { status: 403 });
    const stateKey = name === "internal" ? "race" : "activity";
    const { page, requests, markup } = fixture(name, () => ++call === 1 ? Promise.reject(error) : Promise.resolve(payloads[name]));
    const failed = page.load();
    assert.equal(typeof failed.then, "function", name + " load returns a Promise");
    assert.equal(page.data.loading, true);
    await failed;
    assert.equal(page.data.loading, false);
    assert.equal(page.data[stateKey], null);
    assert.equal(page.data.message, "你不在这个跑团里");
    assert.match(markup, /<view wx:else class="detail-state">/);
    assert.match(markup, /\{\{message \|\| '[^']+'\}\}/);
    assert.match(markup, /<button wx:if="\{\{!loading\}\}" class="btn" bindtap="load">重新加载<\/button>/);
    report.checks.push({ name: name + " initial 403 exposes an error state and a retry entry", passed: true });

    const recovered = page.load();
    assert.equal(page.data.loading, true);
    assert.equal(page.data.message, "");
    await recovered;
    assert.equal(page.data.loading, false);
    assert.equal(page.data[stateKey].id, 7);
    assert.equal(page.data.message, "");
    assert.equal(requests.length, 2);
    assert.equal(requests[0][0], name === "internal" ? "/clubs/44/internals/7" : "/clubs/44/activities/7/album");
    assert.equal(requests[0][0], requests[1][0]);
    if (name === "internal") assert.equal(page.data.groupId, 1);
    else {
      assert.equal(page.data.photos.length, 1);
      assert.equal(page.data.photos[0].src, "https://example.test/marathon/api/media/8?t=detail-token");
    }
    report.checks.push({ name: name + " retry requests the same resource and restores the full detail after authorization is restored", passed: true });

    let rejectOld;
    let resolveFresh;
    let concurrentCall = 0;
    const concurrent = fixture(name, () => ++concurrentCall === 1 ? new Promise((resolve, reject) => { rejectOld = reject; }) : new Promise((resolve) => { resolveFresh = resolve; }));
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
