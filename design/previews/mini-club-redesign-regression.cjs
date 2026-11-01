const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const report = { kind: "Mini-program club redesign Page VM acceptance; mocked transport and native UI, not simulator or device testing", checks: [] };
const event = (dataset) => ({ currentTarget: { dataset } });
const input = (value) => ({ detail: { value } });

function fixture(name) {
  let definition;
  const requests = [], sheets = [], modals = [], navigation = [];
  let handler = () => Promise.resolve({});
  const app = { globalData: { token: "account-a" } };
  let loggedIn = true;
  const source = fs.readFileSync(path.join(root, "miniprogram/pages", name, name + ".js"), "utf8");
  vm.runInNewContext(source, {
    require(moduleName) {
      if (moduleName === "../../utils/request") return { ready: () => loggedIn, request: (...args) => { requests.push(args); return handler(...args); } };
      if (moduleName === "../../utils/call-poster") return {};
      throw new Error("Unexpected import " + moduleName);
    },
    Page: (page) => { definition = page; },
    getApp: () => app,
    setTimeout, clearTimeout,
    wx: {
      showShareMenu() {},
      showActionSheet: (options) => sheets.push(options),
      showModal: (options) => modals.push(options),
      navigateTo: (options) => navigation.push(options.url),
      switchTab: (options) => navigation.push(options.url)
    }
  });
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch) { Object.assign(this.data, patch); } };
  return { page, requests, sheets, modals, navigation, setHandler(fn) { handler = fn; }, setAccount(token, valid = true) { app.globalData.token = token; loggedIn = valid; } };
}

function check(name, run) {
  run();
  report.checks.push({ name, passed: true });
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
const clubData = (id = 44, name = "奥森晨跑") => ({ club: { id, name }, members: [{ id: 1, nickname: "团长", owner: true }], activities: [], board: [] });
async function checkAsync(name, run) { await run(); report.checks.push({ name, passed: true }); }

async function main() {
  check("invalid deep links return to today and only supported activity views are accepted", () => {
    const { page } = fixture("club");
    page.onLoad({ id: "44", tab: "unknown", view: "unknown" });
    assert.equal(page.data.activeTab, "overview");
    assert.equal(page.data.activityKind, "training");
    page.onLoad({ id: "44", tab: "training", view: "internal" });
    assert.equal(page.data.activeTab, "training");
    assert.equal(page.data.activityKind, "internal");
  });
  check("fee, group, relationship, album and gift deep links open the appropriate visible area", () => {
    const { page } = fixture("club");
    for (const [section, tab, area] of [["fees", "members", "fees"], ["groups", "members", "manage"], ["relationship", "members", "all"]]) {
      page.onLoad({ id: "44", section });
      assert.equal(page.data.activeTab, tab);
      assert.equal(page.data.memberArea, area);
      if (section === "relationship") assert.equal(page.data.relationshipOpen, true);
    }
    for (const section of ["albums", "gifts"]) {
      page.onLoad({ id: "44", section });
      assert.equal(page.data.activeTab, "overview");
      assert.equal(page.data.serviceArea, section);
    }
  });
  check("all five common shortcuts select a real tab and clear subordinate views", () => {
    const { page } = fixture("club");
    for (const tab of ["overview", "training", "matches", "mileage", "members"]) {
      page.setData({ serviceArea: "albums", memberArea: "fees" });
      page.changeSection(event({ tab }));
      assert.equal(page.data.activeTab, tab);
      assert.equal(page.data.serviceArea, "");
      assert.equal(page.data.memberArea, "all");
    }
    page.changeSection(event({ tab: "training", kind: "meetup" }));
    assert.equal(page.data.activityKind, "meetup");
    page.changeSection(event({ tab: "invalid" }));
    assert.equal(page.data.activeTab, "training");
  });
  check("activity subtabs preserve drafts and ignore invalid kinds", () => {
    const { page } = fixture("club");
    page.setData({ meetPlace: "奥森南门", callTitle: "秋季赛事", raceTitle: "队内赛" });
    for (const kind of ["training", "meetup", "internal"]) {
      page.pickActivity(event({ kind }));
      assert.equal(page.data.activityKind, kind);
    }
    page.pickActivity(event({ kind: "other" }));
    assert.equal(page.data.activityKind, "internal");
    assert.equal(page.data.meetPlace, "奥森南门");
    assert.equal(page.data.callTitle, "秋季赛事");
  });
  check("today services route to albums, gifts, fees, groups and pending applications", () => {
    const { page } = fixture("club");
    for (const area of ["albums", "gifts"]) {
      page.openService(event({ area }));
      assert.equal(page.data.activeTab, "overview");
      assert.equal(page.data.serviceArea, area);
      page.closeService();
      assert.equal(page.data.serviceArea, "");
    }
    for (const [area, destination] of [["fees", "fees"], ["groups", "manage"], ["requests", "all"]]) {
      page.openService(event({ area }));
      assert.equal(page.data.activeTab, "members");
      assert.equal(page.data.memberArea, destination);
    }
  });
  check("member search and real role filters compose, reset, and show empty matches", () => {
    const { page } = fixture("club");
    page.setData({ members: [{ id: 1, nickname: "团长小林", role: "owner" }, { id: 2, nickname: "Runner A", role: "manager" }, { id: 3, nickname: "Runner B", role: "member" }] });
    page.onMemberQuery(input(" runner "));
    assert.equal(page.data.shownMembers.length, 2);
    page.pickMemberFilter(event({ filter: "staff" }));
    assert.equal(page.data.shownMembers.length, 1);
    assert.equal(page.data.shownMembers[0].id, 2);
    page.onMemberQuery(input("不存在"));
    assert.equal(page.data.shownMembers.length, 0);
    page.onMemberQuery(input(""));
    assert.equal(page.data.shownMembers.length, 2);
    page.pickMemberFilter(event({ filter: "all" }));
    assert.equal(page.data.shownMembers.length, 3);
  });
  check("member native menu excludes owners and ordinary members and preserves role confirmation", () => {
    const { page, sheets, modals, requests } = fixture("club");
    page.clubId = "44";
    page.setData({ club: { owner: false, staff: false }, members: [{ id: 1, owner: true, role: "owner", nickname: "团长" }, { id: 2, role: "member", nickname: "小陈" }] });
    page.manageMember(event({ id: 2 }));
    assert.equal(sheets.length, 0);
    page.setData({ club: { owner: true, staff: true } });
    page.manageMember(event({ id: 1 }));
    assert.equal(sheets.length, 0);
    page.manageMember(event({ id: 2 }));
    assert.deepEqual(Array.from(sheets[0].itemList), ["设为管理员", "转让团长", "移出跑团"]);
    sheets[0].success({ tapIndex: 1 });
    assert.equal(requests.length, 0);
    assert.match(modals[0].title, /小陈/);
    modals[0].success({ confirm: false });
    assert.equal(requests.length, 0);
  });
  check("manager menu offers removal only and keeps the cleanup confirmation", () => {
    const { page, sheets, modals, requests } = fixture("club");
    page.setData({ club: { owner: false, staff: true }, members: [{ id: 2, role: "member", nickname: "小陈" }] });
    page.manageMember(event({ id: 2 }));
    assert.deepEqual(Array.from(sheets[0].itemList), ["移出跑团"]);
    sheets[0].success({ tapIndex: 0 });
    assert.match(modals[0].content, /未来团练/);
    assert.equal(requests.length, 0);
  });
  check("race roster expansion, compact checkin and relationship disclosure are independently reversible", () => {
    const { page } = fixture("club");
    page.toggleRace(event({ key: 100 }));
    page.toggleRace(event({ key: 101 }));
    page.toggleRace(event({ key: 100 }));
    assert.equal(page.data.raceExpanded[100], false);
    assert.equal(page.data.raceExpanded[101], true);
    page.toggleCheckin();
    page.toggleRelationship();
    assert.equal(page.data.checkinOpen, true);
    assert.equal(page.data.relationshipOpen, true);
    page.toggleCheckin();
    page.toggleRelationship();
    assert.equal(page.data.checkinOpen, false);
    assert.equal(page.data.relationshipOpen, false);
  });
  {
    const { page, setHandler } = fixture("clubs");
    setHandler((url) => Promise.resolve(url === "/me" ? { user: {}, clubs: [{ id: 1, name: "奥森晨跑", roleLabel: "成员" }, { id: 2, name: "城市跑团", roleLabel: "团长" }] } : { clubs: [{ id: 1, name: "奥森晨跑", members: 28, joined: true }] }));
    page.load();
    await settle();
    assert.equal(page.data.clubs.length, 2);
    assert.equal(page.data.shownClubs.length, 2);
    assert.equal(page.data.shownClubs[0].initial, "奥");
    assert.equal(page.data.shownClubs[0].memberCount, 28);
    assert.equal(page.data.shownClubs[1].memberCount, null);
    page.onMineQuery(input(" 奥森 "));
    assert.equal(page.data.shownClubs.length, 1);
    page.onMineQuery(input("未加入的跑团"));
    assert.equal(page.data.shownClubs.length, 0);
    page.onMineQuery(input(""));
    assert.equal(page.data.shownClubs.length, 2);
    report.checks.push({ name: "multi-club loading and local search use real membership data and do not invent counts", passed: true });
  }
  check("club code keeps the introduction-before-application flow", () => {
    const { page, navigation, requests } = fixture("clubs");
    page.setData({ code: "  WEEKEND CLUB  " });
    page.join();
    assert.equal(navigation[0], "/pages/club-intro/club-intro?code=WEEKEND%20CLUB");
    assert.equal(requests.length, 0);
  });
  check("templates keep public sharing, direct activity/race shortcuts, history fees and relation entry", () => {
    const main = fs.readFileSync(path.join(root, "miniprogram/pages/club/club.wxml"), "utf8");
    const list = fs.readFileSync(path.join(root, "miniprogram/pages/clubs/clubs.wxml"), "utf8");
    assert.match(main, /open-type="share"/);
    assert.match(main, /url="\/pages\/clubs\/clubs"/);
    assert.match(main, /raceExpanded\[item.key\]/);
    assert.match(main, /feeHistory/);
    assert.match(main, /bindtap="toggleRelationship"/);
    assert.match(list, /&tab=training/);
    assert.match(list, /&tab=matches/);
    assert.ok(main.indexOf('class="quick-grid"') < main.indexOf('class="service-grid"'));
  });
  await checkAsync("future signed and valid ongoing training are included; stale live, ended, cancelled, invalid and unsigned are excluded from my list", async () => {
    const { page } = fixture("club");
    const at = (ms) => new Date(ms + 8 * 3600000).toISOString().slice(0, 19).replace("T", " ");
    const now = Date.now();
    const rows = [
      { id: 1, status: "open", startsAt: at(now + 3600000), mine: { signed: true } },
      { id: 2, status: "live", startsAt: at(now - 3600000), endsAt: at(now + 3600000), mine: { signed: true } },
      { id: 3, status: "live", startsAt: "2000-01-01 08:00", mine: { signed: true } },
      { id: 4, status: "ended", startsAt: at(now + 3600000), mine: { signed: true } },
      { id: 5, status: "cancelled", startsAt: at(now + 3600000), mine: { signed: true } },
      { id: 6, status: "open", startsAt: "2026-02-30 08:00", mine: { signed: true } },
      { id: 7, status: "open", startsAt: at(now + 3600000), mine: { signed: false } },
      { id: 8, status: "live", startsAt: at(now - 7200000), endsAt: at(now - 3600000), mine: { signed: true } },
      { id: 9, status: "live", startsAt: at(now - 3600000), endsAt: "not a date", mine: { signed: true } },
      { id: 10, status: "live", startsAt: at(now).slice(0, 10) + " 00:00:00", mine: { signed: true } },
      { id: 11, status: "open", startsAt: at(now + 3600000), endsAt: "not a date", mine: { signed: true } },
      { id: 12, status: "open", startsAt: at(now - 3600000), endsAt: at(now + 3600000), mine: { signed: true } },
      { id: 13, status: "live", startsAt: at(now - 7200000), endsAt: at(now - 3600000), mine: { signed: true } }
    ];
    page.onLoad({ id: "44", tab: "training", mine: "1" });
    page.setData({ activities: rows });
    page.filterActivities();
    const expected = [rows[0], rows[1], rows[9]].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map(row => row.id);
    assert.equal(page.data.myUpcomingCount, 3);
    assert.deepEqual(Array.from(page.data.visibleActivities, row => row.id), expected);
    assert.equal(page.upcomingActivities(rows)[0].id, expected[0]);
    page.toggleMine(event({ mine: "0" }));
    assert.equal(page.data.visibleActivities.length, 13);
    page.showMine();
    assert.equal(page.data.activeTab, "training");
    assert.equal(page.data.onlyMine, true);
  });
  await checkAsync("a late main response cannot overwrite the newer reload or switch clubs", async () => {
    const f = fixture("club"); const first = deferred(); let calls = 0;
    f.page.onLoad({ id: "44" });
    f.setHandler(url => url === "/clubs/44" && ++calls === 1 ? first.promise : Promise.resolve(url === "/clubs/44" ? clubData(44, "最新数据") : {}));
    const old = f.page.load(); await f.page.load();
    first.resolve(clubData(44, "过期数据")); await old;
    assert.equal(f.page.data.club.name, "最新数据");
    const late = deferred(); f.setHandler(() => late.promise);
    const load = f.page.load(); f.page.onLoad({ id: "45" });
    late.resolve(clubData(44)); await load;
    assert.equal(f.page.data.club, null, "late old club cannot repopulate the switched page");
    f.setHandler(url => Promise.resolve(url === "/clubs/45" ? clubData(45, "城市跑团") : {}));
    await f.page.load(); assert.equal(f.page.data.club.id, 45);
    assert.equal(f.page.data.members.length, 1);
  });
  await checkAsync("account changes clear private details immediately and discard delayed old account responses", async () => {
    const f = fixture("club"); f.page.onLoad({ id: "44" });
    f.setHandler(url => Promise.resolve(url === "/clubs/44" ? clubData() : {})); await f.page.load();
    f.page.setData({ feeShown: { id: 1 }, note: "私人签到", raceHits: [{ id: 10 }], posterPath: "/private.png" });
    const late = deferred(); f.setHandler(() => late.promise); const old = f.page.load();
    f.setAccount("account-b"); const next = deferred(); f.setHandler(() => next.promise); const load = f.page.load();
    assert.equal(f.page.data.club, null); assert.equal(f.page.data.members.length, 0); assert.equal(f.page.data.posterPath, ""); assert.equal(f.page.data.note, ""); assert.equal(f.page.data.feeShown.id, undefined);
    late.resolve(clubData(44, "旧账号")); await old; assert.equal(f.page.data.club, null);
    f.page.onUnload(); next.resolve(clubData(44, "新账号")); await load; assert.equal(f.page.data.club, null);
  });
  await checkAsync("hiding or unloading a club page ignores outstanding extra data and user actions", async () => {
    for (const lifecycle of ["onHide", "onUnload"]) {
      const f = fixture("club"); f.page.onLoad({ id: "44" }); f.page.setData({ club: { id: 44 } });
      const late = deferred(); f.setHandler(() => late.promise); const load = f.page.loadExtra();
      f.page[lifecycle](); late.resolve({ calls: [{ id: 1 }], current: { id: 1 }, history: [{ id: 1 }], meetups: [{ id: 1 }], albums: [{ id: 1 }] }); await load;
      assert.equal(f.page.data.calls.length, 0); assert.equal(f.page.data.feeHistory.length, 0); assert.equal(f.page.data.albums.length, 0);
    }
  });
  await checkAsync("401/403 in the main load clears every private section and offers a recoverable error", async () => {
    for (const status of [401, 403]) {
      const f = fixture("club"); f.page.onLoad({ id: "44" }); f.page.setData({ club: { id: 44 }, members: [{ id: 2 }], requests: [{ id: 3 }], feeHistory: [{ id: 1 }], raceHits: [{ id: 9 }] });
      f.setHandler(() => Promise.reject(Object.assign(new Error("权限已变化"), { status }))); await f.page.load();
      assert.equal(f.page.data.club, null); assert.equal(f.page.data.members.length, 0); assert.equal(f.page.data.requests.length, 0); assert.equal(f.page.data.feeHistory.length, 0); assert.equal(f.page.data.raceHits.length, 0); assert.equal(f.page.data.loading, false); assert.equal(f.page.data.message, "权限已变化");
    }
  });
  await checkAsync("an extra endpoint authorization failure clears the page and blocks concurrent successful old data", async () => {
    const f = fixture("club"); f.page.onLoad({ id: "44" }); f.page.setData({ club: { id: 44 }, members: [{ id: 2 }] });
    const late = deferred(); f.setHandler(url => url.endsWith("/calls") ? Promise.reject(Object.assign(new Error("已不在跑团"), { status: 403 })) : late.promise);
    const loading = f.page.loadExtra(); await settle(); late.resolve({ current: { id: 1 }, history: [{ id: 1 }], albums: [{ id: 2 }] }); await loading;
    assert.equal(f.page.data.club, null); assert.equal(f.page.data.feeHistory.length, 0); assert.equal(f.page.data.albums.length, 0); assert.equal(f.page.data.message, "已不在跑团"); assert.equal(f.page.data.loading, false);
  });
  await checkAsync("fee switching preserves the latest selection when both older periods and background refresh return late", async () => {
    const f = fixture("club"); f.page.onLoad({ id: "44" });
    const old = deferred(), latest = deferred(), background = deferred();
    f.setHandler(url => url.endsWith("/fees/1") ? old.promise : url.endsWith("/fees/2") ? latest.promise : url.endsWith("/fees") ? background.promise : Promise.resolve({}));
    const refresh = f.page.loadExtra(), first = f.page.openFee(event({ id: 1 })), second = f.page.openFee(event({ id: 2 }));
    latest.resolve({ period: { id: 2, open: false } }); await second;
    old.resolve({ period: { id: 1, open: false } }); await first;
    background.resolve({ current: { id: 3, open: true }, history: [{ id: 3 }, { id: 2 }, { id: 1 }] }); await refresh;
    assert.equal(f.page.data.feeShown.id, 2); assert.equal(f.page.data.feeCurrent.id, 3); assert.equal(f.page.data.feeHistory.length, 3);
  });
  await checkAsync("multi-club list cannot reveal old membership across account switches, logout or page hiding", async () => {
    const f = fixture("clubs"); f.setHandler(url => Promise.resolve(url === "/me" ? { user: { leader: true }, clubs: [{ id: 1, name: "甲账号跑团" }] } : { clubs: [{ id: 1, joined: true, members: 8 }] })); await f.page.load();
    const late = deferred(); f.setHandler(() => late.promise); const before = f.page.load(); f.setAccount("account-b"); const current = deferred(); f.setHandler(() => current.promise); const after = f.page.load();
    assert.equal(f.page.data.clubs.length, 0); assert.equal(f.page.data.leader, false); late.resolve({ clubs: [{ id: 1, name: "旧数据" }] }); await before; assert.equal(f.page.data.clubs.length, 0);
    f.page.onHide(); current.resolve({ clubs: [{ id: 2, name: "隐藏页不写入" }] }); await after; assert.equal(f.page.data.clubs.length, 0);
    f.setAccount("", false); f.page.onShow(); assert.equal(f.page.data.ready, false); assert.equal(f.page.data.clubs.length, 0);
  });
  await checkAsync("native member menus and confirmations never apply after the account or club scope changes", async () => {
    const f = fixture("club"); f.page.onLoad({ id: "44" }); f.page.setData({ club: { id: 44, staff: true, owner: true }, members: [{ id: 2, nickname: "小林", role: "member" }] });
    f.page.manageMember(event({ id: 2 })); f.setAccount("account-b"); f.sheets[0].success({ tapIndex: 2 });
    assert.equal(f.modals.length, 0); assert.equal(f.requests.length, 0);
    f.page.removeMember(event({ id: 2, name: "小林" })); f.page.onLoad({ id: "45" }); f.modals[0].success({ confirm: true });
    assert.equal(f.requests.length, 0);
    f.page.setData({ club: { id: 45, owner: false, name: "城市跑团" } }); f.page.leaveClub(); f.page.onHide(); f.modals[1].success({ confirm: true });
    assert.equal(f.requests.length, 0); assert.equal(f.page.data.leaving, false);
  });
  await checkAsync("successful leave invalidates concurrent roster and fee responses before returning to the club list", async () => {
    const f = fixture("club"); f.page.onLoad({ id: "44" }); f.page.setData({ club: { id: 44, name: "奥森晨跑", owner: false }, members: [{ id: 1 }], feeHistory: [{ id: 1 }] });
    const extra = deferred(); f.setHandler((url, method) => method === "POST" ? Promise.resolve({ ok: true }) : extra.promise);
    const load = f.page.loadExtra(); f.page.leaveClub(); f.modals[0].success({ confirm: true }); await settle();
    assert.equal(f.page.data.club, null); assert.equal(f.page.data.members.length, 0); assert.equal(f.navigation[0], "/pages/clubs/clubs");
    extra.resolve({ current: { id: 1 }, history: [{ id: 1 }], albums: [{ id: 1 }] }); await load;
    assert.equal(f.page.data.feeHistory.length, 0); assert.equal(f.page.data.albums.length, 0); assert.equal(f.page.data.leaving, false);
  });
  await checkAsync("public introduction rejects delayed account-specific pending status and ignores hidden-page responses", async () => {
    const f = fixture("club-intro"); f.page.onLoad({ id: "44" }); const first = deferred(); f.setHandler(() => first.promise); const load = f.page.load();
    f.setAccount("account-b"); first.resolve({ club: { id: 44, name: "奥森晨跑", pending: true } }); await load; assert.equal(f.page.data.club, null);
    const hidden = deferred(); f.setHandler(() => hidden.promise); const second = f.page.load(); f.page.onHide(); hidden.resolve({ club: { id: 44, name: "奥森晨跑" } }); await second; assert.equal(f.page.data.club, null);
    assert.equal(f.requests.length, 2);
  });
  check("member navigation stays at three areas; current relationship, my upcoming and retry remain visible", () => {
    const markup = fs.readFileSync(path.join(root, "miniprogram/pages/club/club.wxml"), "utf8");
    assert.equal((markup.match(/bindtap="pickMemberArea"/g) || []).length, 3);
    assert.match(markup, /bindtap="showMine"/); assert.match(markup, /bindtap="toggleMine"/); assert.match(markup, /wx:for="{{visibleActivities}}"/);
    assert.match(markup, /class="form-section relationship-card"/); assert.match(markup, /bindtap="load">重新加载/);
  });
  report.passed = true;
}
main().catch((error) => { report.passed = false; report.error = error.stack || String(error); process.exitCode = 1; }).finally(() => {
  report.total = report.checks.length;
  fs.writeFileSync(path.join(__dirname, "mini-club-redesign-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
