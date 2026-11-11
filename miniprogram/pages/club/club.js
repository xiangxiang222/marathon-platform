const { request } = require("../../utils/request");
const { renderCallPoster, clubRaceRows } = require("../../utils/call-poster");
const { shareTitle, showVerification } = require("../../utils/club-identity");

function accountKey() {
  const app = typeof getApp === "function" ? getApp() : null;
  return app && app.globalData ? String(app.globalData.token || "") : "";
}
function activityMillis(value) {
  const text = String(value || "").replace(" ", "T");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(text)) return NaN;
  const ms = Date.parse(text + "+08:00");
  return Number.isFinite(ms) && new Date(ms + 8 * 3600000).toISOString().slice(0, text.length) === text ? ms : NaN;
}
const PRIVATE_EMPTY = {
  memberQuery: "", memberFilter: "all", raceExpanded: {}, checkinOpen: false, relationshipOpen: false, createdNow: false,
  expanded: { call: false, training: false, meetup: false, internal: false, gift: false, group: false, fee: false },
  club: null, clubInitial: "团", leaderName: "", membersMore: "", members: [], shownMembers: [], groups: [], gifts: [], requests: [],
  myPoints: 0, board: [], nextRace: null, nextActivity: null, upcomingActivityCount: 0, myUpcomingCount: 0, ranks: [], activities: [], visibleActivities: [],
  albums: [], attendance: { rows: [], me: { placeLabel: "未上榜", count: 0 }, label: "本月" }, mileage: { totalKm: 0, totalCount: 0, mineKm: 0 },
  partnerGrade: "", posterPath: "", leaving: false, checkins: [], checkedIn: false, note: "", checkMessage: "", calls: [], meetups: [], internals: [],
  feeCurrent: {}, feeShown: {}, feeHistory: [], feeName: "", feeAmount: "", feeStart: "", feeEnd: "", feeNote: "", feeBlock: false, feeCreating: false,
  groupName: "", groupPace: "", groupCap: "0", giftName: "", giftCost: "1", giftStock: "1", raceQuery: "", raceHits: [], callTitle: "", callDate: "",
  callOther: "", callNote: "", callDistanceText: "", meetDate: "", meetPlace: "", meetNote: "", raceTitle: "", raceWhen: "", racePlace: "", racePoints: "0",
  raceDistance: "10k", raceDistanceLabel: "10公里", raceOther: "", raceDeadline: "", raceNote: "", raceGroups: [{ id: 1, name: "男子组", capacity: "0" }, { id: 2, name: "女子组", capacity: "0" }]
};

Page({
  data: {
    activeTab: "overview",
    activityKind: "training",
    onlyMine: false,
    myUpcomingCount: 0,
    visibleActivities: [],
    loading: true,
    serviceArea: "",
    memberArea: "all",
    memberQuery: "",
    memberFilter: "all",
    shownMembers: [],
    raceExpanded: {},
    checkinOpen: false,
    relationshipOpen: false,
    createdNow: false,
    expanded: { call: false, training: false, meetup: false, internal: false, gift: false, group: false, fee: false },
    club: null,
    clubInitial: "团",
    leaderName: "",
    membersMore: "",
    members: [],
    groups: [],
    gifts: [],
    requests: [],
    myPoints: 0,
    board: [],
    nextRace: null,
    nextActivity: null,
    upcomingActivityCount: 0,
    ranks: [],
    activities: [],
    albums: [],
    attendance: { rows: [], me: { placeLabel: "未上榜", count: 0 }, label: "本月" },
    mileage: { totalKm: 0, totalCount: 0, mineKm: 0 },
    partnerGrade: "",
    posterPath: "",
    leaving: false,
    checkins: [],
    checkedIn: false,
    note: "",
    checkMessage: "",
    message: "",
    groupName: "",
    groupPace: "",
    groupCap: "0",
    giftName: "",
    giftCost: "1",
    giftStock: "1",
    calls: [],
    raceQuery: "",
    raceHits: [],
    callTitle: "",
    callDate: "",
    callOther: "",
    callNote: "",
    callDistanceText: "",
    feeCurrent: {},
    feeShown: {},
    feeHistory: [],
    feeName: "",
    feeAmount: "",
    feeStart: "",
    feeEnd: "",
    feeNote: "",
    feeBlock: false,
    feeCreating: false,
    meetups: [],
    meetDate: "",
    meetPlace: "",
    meetNote: "",
    internals: [],
    raceTitle: "",
    raceWhen: "",
    racePlace: "",
    racePoints: "0",
    raceDistance: "10k",
    raceDistanceLabel: "10公里",
    raceOther: "",
    raceDeadline: "",
    raceNote: "",
    raceGroups: [
      { id: 1, name: "男子组", capacity: "0" },
      { id: 2, name: "女子组", capacity: "0" }
    ]
  },
  onLoad(query) {
    this._disposed = false;
    this._hidden = false;
    this._scopeVersion = (this._scopeVersion || 0) + 1;
    this.clubId = query.id;
    if (this.data.club && String(this.data.club.id) !== String(this.clubId)) this.clearPrivateData();
    this.pending = null;
    const tabs = ["overview", "training", "matches", "mileage", "members"];
    const section = ["fees", "groups", "relationship"].includes(query.section) ? query.section : "all";
    this.setData({
      activeTab: section !== "all" ? "members" : tabs.includes(query.tab) ? query.tab : "overview",
      activityKind: ["training", "meetup", "internal"].includes(query.view) ? query.view : "training",
      onlyMine: query.mine === "1",
      memberArea: section === "fees" ? "fees" : section === "groups" ? "manage" : "all",
      relationshipOpen: section === "relationship",
      createdNow: query.created === "1",
      serviceArea: ["albums", "gifts"].includes(query.section) ? query.section : ""
    });
    this.pickedRaceId = "";
    this.selectedDistances = { full: false, half: false, "10k": false, "5k": false };
    wx.showShareMenu({ menus: ["shareAppMessage"] });
  },
  onShow() {
    this._hidden = false;
    this.setData({ leaving: false });
    this.load();
  },
  onHide() { this._hidden = true; this._scopeVersion = (this._scopeVersion || 0) + 1; },
  onUnload() { this._disposed = true; this._scopeVersion = (this._scopeVersion || 0) + 1; },
  clearPrivateData() {
    this.setData(JSON.parse(JSON.stringify(PRIVATE_EMPTY)));
    this.pickedRaceId = "";
    this.pending = null;
    this.selectedDistances = { full: false, half: false, "10k": false, "5k": false };
  },
  requestScope() { return { club: String(this.clubId), token: accountKey(), version: this._scopeVersion || 0 }; },
  scopeCurrent(scope) { return !this._disposed && !this._hidden && scope.club === String(this.clubId) && scope.token === accountKey() && scope.version === (this._scopeVersion || 0); },
  scopedRequest(path, method, data) {
    const scope = this.requestScope();
    if (!this.scopeCurrent(scope)) return Promise.reject(Object.assign(new Error("页面已切换"), { stale: true }));
    return request(path, method, data).then((result) => {
      if (!this.scopeCurrent(scope)) throw Object.assign(new Error("页面已切换"), { stale: true });
      return result;
    }).catch((error) => {
      if (!this.scopeCurrent(scope)) error.stale = true;
      else if (error.status === 401 || (error.status === 403 && (!method || method === "GET"))) {
        this._scopeVersion = (this._scopeVersion || 0) + 1;
        this.clearPrivateData();
        this.setData({ message: error.message || "请重新打开跑团", loading: false });
      }
      throw error;
    });
  },
  armShare(e) {
    this.pending = e.currentTarget.dataset;
  },
  onShareAppMessage() {
    if (this.data.club && this.data.club.publicStatus === "restricted") return { title: "跑团", path: "/pages/clubs/clubs" };
    return {
      title: shareTitle(this.data.club || {}),
      path: "/pages/club-intro/club-intro?id=" + this.clubId
    };
  },
  verifiedInfo() { showVerification(this.data.club); },
  openIdentity() {
    if (this.data.club && this.data.club.owner) wx.navigateTo({ url: "/pages/club-identity/club-identity?id=" + this.clubId });
  },
  changeSection(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!["overview", "training", "matches", "mileage", "members"].includes(tab)) return;
    const kind = e.currentTarget.dataset.kind;
    this.setData({ activeTab: tab, serviceArea: "", memberArea: "all", onlyMine: false, ...(kind && ["training", "meetup", "internal"].includes(kind) ? { activityKind: kind } : {}) });
    this.filterActivities();
  },
  showMine() {
    this.setData({ activeTab: "training", activityKind: "training", onlyMine: true, serviceArea: "" });
    this.filterActivities();
  },
  toggleMine(e) {
    this.setData({ onlyMine: e.currentTarget.dataset.mine === "1" });
    this.filterActivities();
  },
  filterActivities() {
    const upcoming = this.upcomingActivities(this.data.activities || []);
    this.setData({
      myUpcomingCount: upcoming.filter((item) => item.mine && item.mine.signed).length,
      visibleActivities: this.data.onlyMine ? upcoming.filter((item) => item.mine && item.mine.signed) : (this.data.activities || [])
    });
  },
  pickActivity(e) {
    const kind = e.currentTarget.dataset.kind;
    if (["training", "meetup", "internal"].includes(kind)) this.setData({ activityKind: kind });
  },
  openService(e) {
    const area = e.currentTarget.dataset.area;
    if (["fees", "groups", "relationship", "requests"].includes(area)) {
      this.setData({ activeTab: "members", memberArea: area === "fees" ? "fees" : area === "groups" ? "manage" : "all", serviceArea: "", ...(area === "relationship" ? { relationshipOpen: true } : {}) });
      return;
    }
    if (["albums", "gifts"].includes(area)) this.setData({ activeTab: "overview", serviceArea: area });
  },
  closeService() { this.setData({ serviceArea: "" }); },
  pickMemberArea(e) {
    const area = e.currentTarget.dataset.area;
    if (["all", "fees", "manage"].includes(area)) this.setData({ memberArea: area });
  },
  onMemberQuery(e) {
    this.setData({ memberQuery: e.detail.value });
    this.filterMembers();
  },
  pickMemberFilter(e) {
    this.setData({ memberFilter: e.currentTarget.dataset.filter });
    this.filterMembers();
  },
  filterMembers() {
    const query = String(this.data.memberQuery || "").trim().toLowerCase();
    this.setData({ shownMembers: (this.data.members || []).filter((member) =>
      (!query || String(member.nickname || "").toLowerCase().includes(query)) &&
      (this.data.memberFilter !== "staff" || ["owner", "manager"].includes(member.role))) });
  },
  manageMember(e) {
    const member = this.data.members.find((row) => String(row.id) === String(e.currentTarget.dataset.id));
    const club = this.data.club;
    if (!member || !club || !club.staff || member.owner) return;
    const choices = [];
    if (club.owner) {
      choices.push({ name: member.role === "manager" ? "取消管理员" : "设为管理员", role: member.role === "manager" ? "member" : "manager" });
      choices.push({ name: "转让团长", role: "owner" });
    }
    choices.push({ name: "移出跑团", remove: true });
    const scope = this.requestScope();
    wx.showActionSheet({
      itemList: choices.map((row) => row.name),
      success: (result) => {
        if (!this.scopeCurrent(scope)) return;
        const choice = choices[result.tapIndex];
        if (!choice) return;
        const event = { currentTarget: { dataset: { id: member.id, name: member.nickname, role: choice.role } } };
        if (choice.remove) this.removeMember(event);
        else this.setRole(event);
      }
    });
  },
  toggleRace(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ raceExpanded: { ...this.data.raceExpanded, [key]: !this.data.raceExpanded[key] } });
  },
  toggleCheckin() { this.setData({ checkinOpen: !this.data.checkinOpen }); },
  toggleRelationship() { this.setData({ relationshipOpen: !this.data.relationshipOpen }); },
  exportBoard() {
    const lines = ["跑团赛事汇总", "比赛\t日期\t城市\t项目\t成员\t状态\t成绩"];
    (this.data.board || []).forEach((item) => {
      const race = item.race || {};
      const project = (race.distanceLabels || []).join("/");
      const rows = clubRaceRows(item);
      if (!rows.length) {
        lines.push([race.name, race.raceDate, race.city, project, "", "", ""].join("\t"));
        return;
      }
      const cell = (value) => {
        const text = String(value == null ? "" : value).replace(/[\t\r\n]/g, " ");
        return /^\s*[=+\-@]/.test(text) ? "'" + text : text;
      };
      rows.forEach((mark) => lines.push([
        race.name, race.raceDate, race.city, mark.distance || project, mark.nickname, mark.status,
        [mark.clock, mark.pb ? "PB" : ""].filter(Boolean).join(" ")
      ].map(cell).join("\t")));
    });
    wx.setClipboardData({ data: lines.join("\n"), success: () => this.setData({ message: "赛事表格已复制，可粘贴到表格软件" }) });
  },
  exportRacePoster(e) {
    const item = (this.data.board || [])[Number(e.currentTarget.dataset.index)];
    if (!item) return;
    const groups = clubRaceRows(item).reduce((out, mark) => {
      const label = mark.status || "团友";
      let group = out.find((entry) => entry.label === label);
      if (!group) {
        group = { label, rows: [] };
        out.push(group);
      }
      group.rows.push({ place: group.rows.length + 1, nickname: mark.nickname, clock: mark.clock, status: mark.status, tag: mark.pb ? "PB" : "" });
      return out;
    }, []);
    const scope = this.requestScope();
    this.createSelectorQuery().select("#club-poster").fields({ node: true }).exec((res) => {
      if (!this.scopeCurrent(scope)) return;
      const canvas = res && res[0] && res[0].node;
      if (!canvas) {
        this.setData({ message: "赛事画像没有生成" });
        return;
      }
      const size = renderCallPoster(canvas, { title: item.race.name, raceDate: item.race.raceDate, eyebrow: "跑团赛事画像", countLabel: " 条参赛记录", summary: item.summary, groups });
      wx.canvasToTempFilePath({
        canvas,
        destWidth: size.width,
        destHeight: size.height,
        fileType: "png",
        success: (file) => { if (this.scopeCurrent(scope)) this.setData({ posterPath: file.tempFilePath, message: "" }); },
        fail: () => { if (this.scopeCurrent(scope)) this.setData({ message: "赛事画像没有生成" }); }
      });
    });
  },
  closePoster() { this.setData({ posterPath: "" }); },
  noop() {},
  toggleForm(e) {
    const form = e.currentTarget.dataset.form;
    if (!Object.prototype.hasOwnProperty.call(this.data.expanded, form)) return;
    this.setData({ expanded: { ...this.data.expanded, [form]: !this.data.expanded[form] } });
  },
  load() {
    if (this._disposed || this._hidden) return Promise.resolve();
    const identity = String(this.clubId) + ":" + accountKey();
    if ((this._identity && this._identity !== identity) || (this.data.club && String(this.data.club.id) !== String(this.clubId))) {
      this._scopeVersion = (this._scopeVersion || 0) + 1;
      this.clearPrivateData();
    }
    this._identity = identity;
    this._scopeVersion = (this._scopeVersion || 0) + 1;
    const sequence = this._loadSequence = (this._loadSequence || 0) + 1;
    const scope = this.requestScope();
    this.setData({ loading: true, message: "" });
    return this.scopedRequest("/clubs/" + this.clubId)
      .then((data) => {
        if (sequence !== this._loadSequence) return;
        const members = (data.members || []).map((member) => ({
          ...member,
          avatarInitial: String(member.nickname || "跑").slice(0, 1)
        }));
        const board = (data.board || []).map((item) => ({
          ...item,
          key: item.race.id,
          unpaidText: (item.unpaid || []).join("、"),
          squadText: item.squad ? item.squad.text : "",
          alternatives: item.alternatives || [],
          alternativeNote: item.alternativeNote || ""
        }));
        this.setData({
          club: data.club,
          clubInitial: String(data.club.name || "团").slice(0, 1),
          members,
          membersMore: members.length > 6 ? "+" + (members.length - 6) : "",
          leaderName: (members.find((member) => member.owner) || {}).nickname || "",
          board,
          nextRace: board.filter((item) => item.race.raceDate >= new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10))
            .sort((a, b) => a.race.raceDate.localeCompare(b.race.raceDate))[0] || null,
          nextActivity: this.upcomingActivities(data.activities || [])[0] || null,
          upcomingActivityCount: this.upcomingActivities(data.activities || []).length,
          ranks: data.ranks || [],
          activities: data.activities || [],
          groups: data.groups || [],
          gifts: data.gifts || [],
          requests: data.requests || [],
          myPoints: data.myPoints || 0,
          checkins: data.checkins || [],
          checkedIn: !!data.checkedIn,
          note: data.myNote || "",
          checkMessage: "",
          message: ""
        });
        if (data.club.publicStatus === "restricted") {
          if (wx.hideShareMenu) wx.hideShareMenu({ menus: ["shareAppMessage"] });
        } else if (wx.showShareMenu) wx.showShareMenu({ menus: ["shareAppMessage"] });
        this.filterMembers();
        this.filterActivities();
        return this.loadExtra();
      })
      .catch((err) => { if (!err.stale && sequence === this._loadSequence) this.setData({ message: err.message }); })
      .finally(() => { if (sequence === this._loadSequence && this.scopeCurrent(scope)) this.setData({ loading: false }); });
  },
  upcomingActivities(activities) {
    const now = Date.now();
    const today = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
    return activities.filter((item) => {
      if (["ended", "cancelled"].includes(item.status)) return false;
      const starts = activityMillis(item.startsAt);
      if (!Number.isFinite(starts)) return false;
      const ends = item.endsAt ? activityMillis(item.endsAt) : null;
      if (ends !== null && (!Number.isFinite(ends) || ends <= starts || ends <= now)) return false;
      if (starts >= now) return true;
      if (item.status !== "live") return false;
      if (ends !== null) return true;
      // Legacy activities may have no end; only today's live ones stay in the shortcut.
      return new Date(starts + 8 * 3600000).toISOString().slice(0, 10) === today;
    }).slice().sort((a, b) => activityMillis(a.startsAt) - activityMillis(b.startsAt));
  },
  loadExtra() {
    const extraSequence = this._extraSequence = (this._extraSequence || 0) + 1;
    const feeSequence = this._feeSequence || 0;
    const pending = [];
    pending.push(this.scopedRequest("/clubs/" + this.clubId + "/calls")
      .then((data) => extraSequence === this._extraSequence && this.setData({ calls: data.calls || [] }))
      .catch(() => {}));
    pending.push(this.scopedRequest("/clubs/" + this.clubId + "/meetups")
      .then((data) => {
        if (extraSequence !== this._extraSequence) return;
        const meetups = data.meetups || [];
        const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
        this.setData({ meetups, upcomingActivityCount: this.upcomingActivities(this.data.activities).length
          + meetups.filter((item) => item.date >= today && !["ended", "cancelled"].includes(item.status)).length });
      })
      .catch(() => {}));
    pending.push(this.scopedRequest("/clubs/" + this.clubId + "/internals")
      .then((data) => extraSequence === this._extraSequence && this.setData({ internals: data.races || [] }))
      .catch(() => {}));
    pending.push(this.scopedRequest("/clubs/" + this.clubId + "/albums")
      .then((data) => extraSequence === this._extraSequence && this.setData({ albums: data.albums || [] }))
      .catch(() => {}));
    pending.push(this.scopedRequest("/clubs/" + this.clubId + "/attendance?range=month")
      .then((data) => extraSequence === this._extraSequence && this.setData({ attendance: data }))
      .catch(() => {}));
    pending.push(this.scopedRequest("/clubs/" + this.clubId + "/partner")
      .then((data) => extraSequence === this._extraSequence && this.setData({ partnerGrade: (data.grade && data.grade.label) || "" }))
      .catch(() => {}));
    pending.push(this.scopedRequest("/clubs/" + this.clubId + "/mileage?range=month")
      .then((data) => {
        if (extraSequence !== this._extraSequence) return;
        const mine = (data.rank || []).find((row) => row.mine);
        this.setData({
          mileage: { totalKm: data.totalKm || 0, totalCount: data.totalCount || 0, mineKm: mine ? mine.km : 0 }
        });
      })
      .catch(() => {}));
    pending.push(this.scopedRequest("/clubs/" + this.clubId + "/fees")
      .then((data) => {
        if (extraSequence !== this._extraSequence) return;
        const current = data.current;
        if (feeSequence !== (this._feeSequence || 0)) { this.setData({ feeCurrent: current || {}, feeHistory: data.history || [] }); return; }
        const history = data.history || [];
        const shown = this.data.feeShown || {};
        if (shown.id && !shown.open) {
          this.setData({ feeCurrent: current || {}, feeHistory: history });
          return;
        }
        if (!current) {
          this.setData({ feeCurrent: {}, feeShown: {}, feeHistory: history });
          return;
        }
        const patch = { feeCurrent: current, feeShown: current, feeHistory: history };
        if (!this.data.feeCreating && !this.data.feeName) {
          patch.feeName = current.name;
          patch.feeAmount = String(current.amount);
          patch.feeStart = current.startsOn;
          patch.feeEnd = current.endsOn;
          patch.feeNote = current.note || "";
          patch.feeBlock = !!current.blockSignup;
        }
        this.setData(patch);
      })
      .catch(() => {}));
    return Promise.all(pending);
  },
  openFee(e) {
    const periodId = Number(e.currentTarget.dataset.id);
    if (!periodId) return;
    const sequence = this._feeSequence = (this._feeSequence || 0) + 1;
    return this.scopedRequest("/clubs/" + this.clubId + "/fees/" + periodId)
      .then((data) => {
        if (sequence !== this._feeSequence) return;
        const period = data.period;
        const patch = { feeCurrent: period.open ? period : this.data.feeCurrent, feeShown: period, message: "" };
        if (period.open && !this.data.feeCreating) {
          patch.feeName = period.name;
          patch.feeAmount = String(period.amount);
          patch.feeStart = period.startsOn;
          patch.feeEnd = period.endsOn;
          patch.feeNote = period.note || "";
          patch.feeBlock = !!period.blockSignup;
        }
        this.setData(patch);
      })
      .catch((err) => { if (!err.stale && sequence === this._feeSequence) this.setData({ message: err.message }); });
  },
  distanceText(selected) {
    const labels = { full: "全马", half: "半马", "10k": "10公里", "5k": "5公里" };
    return Object.keys(selected).filter((id) => selected[id]).map((id) => labels[id]).join("、");
  },
  searchRaces() {
    const q = (this.data.raceQuery || "").trim();
    const sequence = this._raceSequence = (this._raceSequence || 0) + 1;
    if (!q) {
      this.setData({ raceHits: [] });
      return;
    }
    this.scopedRequest("/races?q=" + encodeURIComponent(q) + "&page=1&pageSize=8").then((data) => {
      if (sequence !== this._raceSequence) return;
      const hits = (data.races || []).slice(0, 6).map((race) => ({
        id: race.id,
        name: race.name,
        raceDate: race.raceDate,
        distanceText: (race.distances || []).join(",")
      }));
      this.setData({ raceHits: hits });
    }).catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  },
  pickRace(e) {
    const ds = e.currentTarget.dataset;
    const selected = { full: false, half: false, "10k": false, "5k": false };
    String(ds.distances || "").split(",").forEach((id) => {
      if (selected[id] != null) selected[id] = true;
    });
    this.pickedRaceId = ds.id;
    this.selectedDistances = selected;
    this.setData({
      callTitle: ds.name,
      callDate: ds.date,
      callDistanceText: this.distanceText(selected),
      raceHits: [],
      raceQuery: ""
    });
  },
  toggleDistance(e) {
    const id = e.currentTarget.dataset.id;
    this.pickedRaceId = "";
    const selected = this.selectedDistances || { full: false, half: false, "10k": false, "5k": false };
    selected[id] = !selected[id];
    this.selectedDistances = selected;
    this.setData({ callDistanceText: this.distanceText(selected) });
  },
  createMeetup() {
    this.scopedRequest("/clubs/" + this.clubId + "/meetups", "POST", {
      date: this.data.meetDate,
      place: this.data.meetPlace,
      note: this.data.meetNote
    })
      .then((data) => {
        wx.navigateTo({ url: "/pages/meetup/meetup?club=" + this.clubId + "&id=" + data.meetup.id });
      })
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  },
  pickRaceDistance(e) {
    this.setData({ raceDistance: e.currentTarget.dataset.id, raceDistanceLabel: e.currentTarget.dataset.label, raceOther: "" });
  },
  onRaceGroup(e) {
    const index = Number(e.currentTarget.dataset.index);
    const key = e.currentTarget.dataset.key;
    this.setData({ ["raceGroups[" + index + "]." + key]: e.detail.value });
  },
  addRaceGroup() {
    const groups = this.data.raceGroups.concat([{ id: Date.now(), name: "", capacity: "0" }]);
    this.setData({ raceGroups: groups });
  },
  createInternal() {
    const groups = this.data.raceGroups
      .filter((group) => group.name && String(group.name).trim())
      .map((group) => ({ name: String(group.name).trim(), capacity: Number(group.capacity) || 0 }));
    const distance = this.data.raceOther ? "other" : this.data.raceDistance;
    this.scopedRequest("/clubs/" + this.clubId + "/internals", "POST", {
      title: this.data.raceTitle,
      startsAt: this.data.raceWhen,
      place: this.data.racePlace,
      distance,
      otherKm: this.data.raceOther,
      deadline: this.data.raceDeadline,
      note: this.data.raceNote,
      finishPoints: Number(this.data.racePoints || 0),
      groups
    })
      .then((data) => {
        wx.navigateTo({ url: "/pages/internal/internal?club=" + this.clubId + "&id=" + data.race.id });
      })
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  },
  createCall() {
    const distances = Object.keys(this.selectedDistances || {}).filter((id) => this.selectedDistances[id]);
    this.scopedRequest("/clubs/" + this.clubId + "/calls", "POST", {
      raceId: this.pickedRaceId || "",
      title: this.data.callTitle,
      raceDate: this.data.callDate,
      distances,
      otherKm: this.data.callOther,
      note: this.data.callNote
    })
      .then((data) => {
        wx.navigateTo({ url: "/pages/call/call?club=" + this.clubId + "&id=" + data.call.id });
      })
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  },
  saveFee() {
    const body = {
      name: this.data.feeName,
      amount: Number(this.data.feeAmount),
      startsOn: this.data.feeStart,
      endsOn: this.data.feeEnd,
      note: this.data.feeNote,
      blockSignup: !!this.data.feeBlock
    };
    const current = this.data.feeCurrent && this.data.feeCurrent.id;
    const creating = this.data.feeCreating || !current;
    const path = creating ? "/clubs/" + this.clubId + "/fees" : "/clubs/" + this.clubId + "/fees/" + current;
    this.scopedRequest(path, creating ? "POST" : "PUT", body)
      .then((data) => {
        this.setData({ message: creating ? "已开这一期" : "会费已保存", feeName: "", feeCreating: false, feeShown: data.period || this.data.feeShown, feeCurrent: data.period || this.data.feeCurrent });
        this.loadExtra();
      })
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  },
  toggleFeeBlock() {
    this.setData({ feeBlock: !this.data.feeBlock });
  },
  newPeriod() {
    this.setData({
      feeCreating: true,
      feeShown: this.data.feeCurrent || {},
      feeName: "",
      feeAmount: "",
      feeStart: "",
      feeEnd: "",
      feeNote: "",
      feeBlock: false
    });
  },
  markFee(e) {
    const periodId = this.data.feeShown && this.data.feeShown.id;
    this.scopedRequest("/clubs/" + this.clubId + "/fees/" + periodId + "/records", "POST", {
      userId: Number(e.currentTarget.dataset.id),
      status: e.currentTarget.dataset.status
    })
      .then(() => {
        this.setData({ feeName: "" });
        this.loadExtra();
      })
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  },
  copyText(e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.text || "" });
  },
  onNote(e) {
    this.setData({ note: e.detail.value });
  },
  checkIn() {
    this.scopedRequest("/clubs/" + this.clubId + "/checkins", "POST", { note: this.data.note })
      .then((data) => this.setData({ checkins: data.checkins || [], checkedIn: !!data.checkedIn, note: data.myNote || "", checkMessage: "" }))
      .catch((err) => { if (!err.stale) this.setData({ checkMessage: err.message }); });
  },
  undoCheckin() {
    this.scopedRequest("/clubs/" + this.clubId + "/checkins", "DELETE")
      .then((data) => this.setData({ checkins: data.checkins || [], checkedIn: !!data.checkedIn, note: data.myNote || "", checkMessage: "" }))
      .catch((err) => { if (!err.stale) this.setData({ checkMessage: err.message }); });
  },
  onDraft(e) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  shareRecent() {
    const ids = (this.data.activities || []).slice().sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1)).slice(0, 3).map((item) => item.id);
    if (!ids.length) {
      this.setData({ message: "还没有活动" });
      return;
    }
    this.scopedRequest("/clubs/" + this.clubId + "/activities/share", "POST", { ids })
      .then((data) => {
        wx.setClipboardData({ data: data.text || "" });
        this.setData({ message: "最近 3 场已复制" });
      })
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  },
  createGroup() {
    this.scopedRequest("/clubs/" + this.clubId + "/groups", "POST", {
      name: this.data.groupName,
      pace: this.data.groupPace,
      capacity: Number(this.data.groupCap || 0)
    })
      .then(() => {
        this.setData({ groupName: "", groupPace: "", message: "" });
        this.load();
      })
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  },
  createGift() {
    this.scopedRequest("/clubs/" + this.clubId + "/gifts", "POST", {
      name: this.data.giftName,
      cost: Number(this.data.giftCost),
      stock: Number(this.data.giftStock)
    })
      .then(() => {
        this.setData({ giftName: "", message: "" });
        this.load();
      })
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  },
  redeem(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    this.scopedRequest("/clubs/" + this.clubId + "/gifts/" + id + "/redeem", "POST", {})
      .then(() => {
        this.setData({ message: "已兑换 " + name });
        this.load();
      })
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  },
  decide(e) {
    const id = e.currentTarget.dataset.id;
    const decision = e.currentTarget.dataset.decision;
    this.scopedRequest("/clubs/" + this.clubId + "/requests/" + id, "POST", { decision })
      .then(() => this.load())
      .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
  },
  setRole(e) {
    const id = e.currentTarget.dataset.id;
    const role = e.currentTarget.dataset.role;
    const name = e.currentTarget.dataset.name;
    const scope = this.requestScope();
    const send = () => {
      if (!this.scopeCurrent(scope)) return;
      this.scopedRequest("/clubs/" + this.clubId + "/members/" + id, "PUT", { role })
        .then(() => this.load())
        .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
    };
    if (role !== "owner") {
      send();
      return;
    }
    wx.showModal({
      title: "把团长交给 " + name,
      content: "你自己会变成跑团管理。",
      success: (res) => {
        if (res.confirm) send();
      }
    });
  },
  removeMember(e) {
    const scope = this.requestScope();
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: "移出 " + name,
      content: "未来团练、未出成绩的未来队内赛和明日及之后未打卡的约跑报名会取消；成绩、积分和已打卡记录保留。",
      success: (res) => {
        if (!res.confirm || !this.scopeCurrent(scope)) return;
        this.scopedRequest("/clubs/" + this.clubId + "/members/" + id, "DELETE")
          .then(() => this.load())
          .catch((err) => { if (!err.stale) this.setData({ message: err.message }); });
      }
    });
  },
  leaveClub() {
    if (this.data.leaving || !this.data.club || this.data.club.owner) return;
    const scope = this.requestScope();
    wx.showModal({
      title: "退出" + this.data.club.name,
      content: "未来团练、未出成绩的未来队内赛和明日及之后未打卡的约跑报名会取消；个人赛事、成绩、积分和已打卡记录保留，再入团需要审核。",
      confirmText: "退出跑团",
      confirmColor: "#b42318",
      success: (res) => {
        if (!res.confirm || !this.scopeCurrent(scope)) return;
        this.setData({ leaving: true, message: "" });
        this.scopedRequest("/clubs/" + this.clubId + "/leave", "POST", {})
          .then(() => { this._scopeVersion = (this._scopeVersion || 0) + 1; this.clearPrivateData(); wx.switchTab({ url: "/pages/clubs/clubs" }); })
          .catch((err) => { if (!err.stale) this.setData({ message: err.message }); })
          .finally(() => { if (this.scopeCurrent(scope)) this.setData({ leaving: false }); });
      }
    });
  }
});
