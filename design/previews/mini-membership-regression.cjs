const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "miniprogram/pages/club/club.js"), "utf8");
const report = { kind: "Mini-program membership Page VM acceptance; in-memory request, modal and navigation mocks", checks: [] };

function makeFixture(owner = false) {
  let definition;
  const requests = [];
  const modals = [];
  const navigation = [];
  const clipboard = [];
  let requestHandler = () => Promise.resolve({ ok: true });
  vm.runInNewContext(source, {
    require(name) {
      if (name === "../../utils/request") return { request: (...args) => { requests.push(args); return requestHandler(...args); } };
      if (name === "../../utils/call-poster") return {};
      throw new Error("Unexpected module " + name);
    },
    Page: (page) => { definition = page; },
    wx: {
      showModal: (modal) => modals.push(modal),
      switchTab: (options) => navigation.push(options.url),
      setClipboardData: (options) => clipboard.push(options.data)
    }
  }, { filename: "club.js" });
  const page = {
    ...definition,
    clubId: "44",
    data: { ...JSON.parse(JSON.stringify(definition.data)), club: { id: 44, name: "奥森晨跑团", owner } },
    setData(patch) { Object.assign(this.data, patch); }
  };
  return { page, requests, modals, navigation, clipboard, setRequestHandler(handler) { requestHandler = handler; } };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function main() {
  {
    const fixture = makeFixture();
    fixture.page.leaveClub();
    assert.equal(fixture.modals.length, 1);
    assert.equal(fixture.requests.length, 0);
    assert.match(fixture.modals[0].content, /未来团练/);
    assert.match(fixture.modals[0].content, /明日及之后未打卡/);
    assert.match(fixture.modals[0].content, /成绩、积分和已打卡记录保留/);
    assert.match(fixture.modals[0].content, /再入团需要审核/);
    fixture.modals[0].success({ confirm: false });
    await settle();
    assert.equal(fixture.requests.length, 0);
    assert.deepEqual(fixture.navigation, []);
    assert.equal(fixture.page.data.leaving, false);
    report.checks.push({ name: "member sees consequences; cancelling sends no request and does not navigate", passed: true });
  }
  {
    const fixture = makeFixture();
    let resolveRequest;
    fixture.setRequestHandler(() => new Promise((resolve) => { resolveRequest = resolve; }));
    fixture.page.leaveClub();
    fixture.modals[0].success({ confirm: true });
    assert.equal(fixture.page.data.leaving, true);
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0][0], "/clubs/44/leave");
    assert.equal(fixture.requests[0][1], "POST");
    assert.equal(Object.keys(fixture.requests[0][2]).length, 0);
    fixture.page.leaveClub();
    assert.equal(fixture.modals.length, 1, "a request in flight must not open another modal");
    assert.deepEqual(fixture.navigation, []);
    resolveRequest({ ok: true });
    await settle();
    assert.deepEqual(fixture.navigation, ["/pages/clubs/clubs"]);
    assert.equal(fixture.page.data.leaving, false);
    assert.equal(fixture.requests.length, 1);
    report.checks.push({ name: "confirmed leave sends one POST for the current club, prevents duplicate submissions and returns after success", passed: true });
  }
  {
    const fixture = makeFixture();
    fixture.setRequestHandler(() => Promise.reject(new Error("退出失败，请稍后重试")));
    fixture.page.leaveClub();
    fixture.modals[0].success({ confirm: true });
    await settle();
    assert.equal(fixture.page.data.message, "退出失败，请稍后重试");
    assert.equal(fixture.page.data.leaving, false);
    assert.deepEqual(fixture.navigation, []);
    fixture.setRequestHandler(() => Promise.resolve({ ok: true }));
    fixture.page.leaveClub();
    fixture.modals[1].success({ confirm: true });
    await settle();
    assert.equal(fixture.page.data.message, "");
    assert.equal(fixture.requests.length, 2);
    assert.deepEqual(fixture.navigation, ["/pages/clubs/clubs"]);
    report.checks.push({ name: "failure is visible, releases the loading state and permits a successful retry", passed: true });
  }
  {
    const fixture = makeFixture(true);
    fixture.page.removeMember({ currentTarget: { dataset: { id: 7, name: "待移出跑友" } } });
    assert.equal(fixture.modals.length, 1);
    assert.match(fixture.modals[0].content, /未来团练/);
    assert.match(fixture.modals[0].content, /明日及之后未打卡/);
    assert.match(fixture.modals[0].content, /成绩、积分和已打卡记录保留/);
    fixture.modals[0].success({ confirm: false });
    await settle();
    assert.equal(fixture.requests.length, 0);
    fixture.page.removeMember({ currentTarget: { dataset: { id: 7, name: "待移出跑友" } } });
    fixture.modals[1].success({ confirm: true });
    await settle();
    assert.deepEqual(fixture.requests[0].slice(0, 2), ["/clubs/44/members/7", "DELETE"]);
    report.checks.push({ name: "member removal explains signup cleanup and preserves historical records before sending DELETE", passed: true });
  }
  {
    const fixture = makeFixture(true);
    fixture.page.leaveClub();
    assert.equal(fixture.modals.length, 0);
    assert.equal(fixture.requests.length, 0);
    const markup = fs.readFileSync(path.join(root, "miniprogram/pages/club/club.wxml"), "utf8");
    assert.match(markup, /wx:if="\{\{club\.owner\}\}"[^>]*>团长请先在成员列表中转让跑团，再退出/);
    assert.match(markup, /<button wx:else[^>]*bindtap="leaveClub">退出跑团<\/button>/);
    report.checks.push({ name: "owner is guarded in Page logic and the template presents transfer guidance instead of a leave button", passed: true });
  }
  {
    const fixture = makeFixture();
    const oldPeriod = { id: 9, name: "2025 年度", open: false, groups: [], mine: { label: "已交" }, copyText: "旧期名单：阿明（已离团）" };
    const currentPeriod = { id: 10, name: "2026 年度", open: true, groups: [], mine: { label: "未交" }, copyText: "本期名单：小王" };
    const newPeriod = { id: 11, name: "2027 年度", open: true, groups: [], mine: { label: "未交" }, copyText: "新期名单：小李" };
    let failOldPeriod = false;
    fixture.setRequestHandler((url, method = "GET", body) => {
      if (url === "/clubs/44/fees") {
        if (method === "POST") {
          assert.equal(body.name, "2027 年度");
          assert.equal(body.amount, 200);
          assert.equal(body.startsOn, "2027-01-01");
          assert.equal(body.endsOn, "2027-12-31");
          assert.equal(body.note, "新一期");
          assert.equal(body.blockSignup, true);
          return Promise.resolve({ period: newPeriod });
        }
        return Promise.resolve({ current: newPeriod.id === fixture.page.data.feeCurrent.id ? newPeriod : currentPeriod, history: [newPeriod, currentPeriod, oldPeriod] });
      }
      if (url === "/clubs/44/fees/9") {
        if (failOldPeriod) return Promise.reject(new Error("历史期次加载失败"));
        return Promise.resolve({ period: oldPeriod });
      }
      if (url === "/clubs/44/fees/10") return Promise.resolve({ period: currentPeriod });
      if (url === "/clubs/44/calls") return Promise.resolve({ calls: [] });
      if (url === "/clubs/44/meetups") return Promise.resolve({ meetups: [] });
      if (url === "/clubs/44/internals") return Promise.resolve({ races: [] });
      if (url === "/clubs/44/albums") return Promise.resolve({ albums: [] });
      if (url === "/clubs/44/attendance?range=month") return Promise.resolve({});
      if (url === "/clubs/44/partner") return Promise.resolve({ grade: null });
      if (url === "/clubs/44/mileage?range=month") return Promise.resolve({ rank: [] });
      throw new Error("Unexpected request " + method + " " + url);
    });

    fixture.page.loadExtra();
    await settle();
    assert.deepEqual(fixture.page.data.feeHistory.map((item) => item.id), [11, 10, 9]);
    assert.equal(fixture.page.data.feeCurrent.id, 10);
    assert.equal(fixture.page.data.feeShown.id, 10);

    fixture.page.openFee({ currentTarget: { dataset: { id: "9" } } });
    await settle();
    assert.equal(fixture.page.data.feeShown.id, 9);
    assert.equal(fixture.page.data.feeCurrent.id, 10);
    fixture.page.copyText({ currentTarget: { dataset: { text: fixture.page.data.feeShown.copyText } } });
    assert.deepEqual(fixture.clipboard, ["旧期名单：阿明（已离团）"]);

    failOldPeriod = true;
    fixture.page.openFee({ currentTarget: { dataset: { id: "9" } } });
    await settle();
    assert.equal(fixture.page.data.feeShown.id, 9, "a failed period load keeps the selected content");
    assert.equal(fixture.page.data.message, "历史期次加载失败");

    fixture.page.openFee({ currentTarget: { dataset: { id: "10" } } });
    await settle();
    assert.equal(fixture.page.data.feeShown.id, 10);
    assert.equal(fixture.page.data.message, "");

    fixture.page.openFee({ currentTarget: { dataset: { id: "9" } } });
    await settle();
    fixture.page.newPeriod();
    assert.equal(fixture.page.data.feeCreating, true);
    assert.equal(fixture.page.data.feeShown.id, 10, "new-period form returns from history to the current period context");
    fixture.page.setData({ feeName: "2027 年度", feeAmount: "200", feeStart: "2027-01-01", feeEnd: "2027-12-31", feeNote: "新一期", feeBlock: true });
    fixture.page.saveFee();
    await settle();
    assert.deepEqual(fixture.requests.find((args) => args[0] === "/clubs/44/fees" && args[1] === "POST").slice(0, 2), ["/clubs/44/fees", "POST"]);
    assert.equal(fixture.page.data.feeCurrent.id, 11);
    assert.equal(fixture.page.data.feeShown.id, 11);
    assert.equal(fixture.page.data.feeCreating, false);
    assert.deepEqual(fixture.page.data.feeHistory.map((item) => item.id), [11, 10, 9]);

    const markup = fs.readFileSync(path.join(root, "miniprogram/pages/club/club.wxml"), "utf8");
    assert.match(markup, /feeHistory\.length > 1[^]*bindtap="openFee"/);
    report.checks.push({ name: "fee history loads, switches periods, copies the selected roster, recovers from errors, and creates a new period from history", passed: true });
  }
  report.passed = true;
}

main().catch((error) => {
  report.passed = false;
  report.error = error.stack || String(error);
  process.exitCode = 1;
}).finally(() => {
  fs.writeFileSync(path.join(__dirname, "mini-membership-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
