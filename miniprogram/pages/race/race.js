const { request, ready } = require("../../utils/request");
const { baseUrl } = require("../../config");
const { parseGuide } = require("../../utils/guide-md");

function raceTabs() {
  return [{ id: "signup", label: "赛事信息" }, { id: "guide", label: "参赛指南" }, { id: "news", label: "赛事资讯" }, { id: "result", label: "我的成绩" }];
}
function registrationScheduled(race, today) {
  // Timestamp phases come from the API; comparing an ISO timestamp with a
  // YYYY-MM-DD string would otherwise keep today's opening pending all day.
  if (race.regStatus === "未开始") return true;
  const start = String(race.regStart || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return start > today;
  return !race.regStatus && Number.isFinite(Date.parse(start)) && Date.parse(start) > Date.now();
}
function momentLabel(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return value;
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? new Date(instant + 8 * 3600000).toISOString().slice(0, 16).replace("T", " ") + "（北京时间）" : value || "";
}
function momentPending(race, key, value, today) {
  if (!value) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value >= today;
  // The API's exact phase remains authoritative when a device clock differs.
  // Older responses without nodes still respect the recorded timestamp.
  const node = (race.nodes || []).find(item => item.key === key);
  if (node && typeof node.past === "boolean") return !node.past;
  const instant = Date.parse(value);
  return Number.isFinite(instant) && instant > Date.now();
}
function officialActions(race, today) {
  const scheduled = registrationScheduled(race, today);
  const deadlinePending = momentPending(race, "deadline", race.deadline, today);
  const signupLabel = scheduled ? "报名安排" : race.regStatus === "待开赛" || race.deadline && !deadlinePending || race.raceDate && race.raceDate < today ? "报名信息" : "官方报名";
  const labels = { signup: signupLabel, draw: "中签查询", bib: "参赛号码", result: "官方成绩", live: "赛事直播" };
  const links = (race.links || []).filter(item => /^https:\/\/\S+$/i.test(item.url || "")).map(item => ({ ...item, label: labels[item.key] || item.label || "官方入口" }));
  const website = race.eventUrl || race.officialUrl;
  if (/^https:\/\/\S+$/i.test(website || "")) links.push({ key: "website", label: "赛事官网", url: website });
  const due = (key, value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value <= today : Number.isFinite(Date.parse(value)) && !momentPending(race, key, value, today);
  const ended = race.raceDate && race.raceDate < today;
  const preferred = ended ? "result" : due("bib", race.bibAt) ? "bib" : due("draw", race.drawAt) ? "draw" : race.regStatus === "报名中" || !race.deadline || deadlinePending ? "signup" : "website";
  const first = links.find(item => item.key === preferred) || links.find(item => item.key === "website") || links.find(item => !ended || item.key !== "signup") || links[0];
  return first ? [first, ...links.filter(item => item !== first)].filter((item, index, all) => all.findIndex(other => other.url === item.url) === index) : [];
}

function publicPhase(race, today) {
  const status = String(race.regStatus || "").replace(/未公布|待公布/g, "未录入");
  if (race.raceDate && race.raceDate < today) return { publicStatus: "已结束", phaseTitle: "比赛已结束", phaseDetail: "查看官方成绩，或记下自己的完赛故事。" };
  if (race.raceDate === today) return { publicStatus: "比赛日", phaseTitle: "今天开跑", phaseDetail: race.startAt ? "起跑时间 " + race.startAt + " · 出发前确认号码与比赛日资料。" : "出发前确认号码与比赛日资料。" };
  if (registrationScheduled(race, today)) return { publicStatus: "报名未开始", phaseTitle: momentLabel(race.regStart) + " 开始报名", phaseDetail: "先关注比赛，按官方通知安排报名。" };
  if (momentPending(race, "deadline", race.deadline, today)) return { publicStatus: status || "报名中", phaseTitle: (race.deadlineName || "报名截止") + " · " + momentLabel(race.deadline), phaseDetail: "请到官方渠道核对要求并完成报名与缴费。" };
  if (momentPending(race, "draw", race.drawAt, today)) return { publicStatus: status || "待开赛", phaseTitle: "中签结果 · " + momentLabel(race.drawAt), phaseDetail: "请按官方时间查询，个人标记不会取得参赛资格。" };
  if (momentPending(race, "pay", race.payDeadline, today)) return { publicStatus: status || "待开赛", phaseTitle: "缴费截止 · " + momentLabel(race.payDeadline), phaseDetail: "中签与缴费结果以官方渠道为准。" };
  if (momentPending(race, "bib", race.bibAt, today)) return { publicStatus: status || "待开赛", phaseTitle: "号码公布 · " + momentLabel(race.bibAt), phaseDetail: "领物、赛道与配速信息请看参赛指南。" };
  if (race.deadline) return { publicStatus: status || "待开赛", phaseTitle: "报名已截止", phaseDetail: "查询参赛结果，提前阅读领物和比赛日安排。" };
  return { publicStatus: status || "报名时间未录入", phaseTitle: "报名时间尚未录入", phaseDetail: "可前往赛事官网核对最新安排。" };
}
function mediaRows(items, previous) {
  return (items || []).map(item => {
    const saved = (previous || []).find(row => row.id === item.id);
    return { ...item, src: baseUrl + "/marathon/api/race-sheets/" + item.id, state: saved ? saved.state : "loading", displaySrc: saved ? saved.displaySrc : "" };
  });
}

function signupHint(race) {
  if (!race || !race.signupHost) return "这场还没有报名链接。这里不报名，也不收款。";
  const where = race.signupChannel ? race.signupChannel + "的报名页" : race.signupHost + " 上的报名页";
  return "长按识别二维码，打开" + where + "。这里不报名，也不收款。";
}

function withUnpaid(card) {
  if (!card) return card;
  const names = (card.unpaid || []).map((item) => item.nickname || item);
  return { ...card, unpaidText: names.join("、"), clubId: card.club && card.club.id };
}

const PLAN_STAGES = [
  { id: "wish", label: "有意向", statuses: ["想跑"] },
  { id: "signup", label: "已报名", statuses: ["已报名", "待抽签", "中签", "未中签"] },
  { id: "confirmed", label: "确认参赛", statuses: ["确认参赛", "已缴费", "已领物"] },
  { id: "finished", label: "已完赛", statuses: ["完赛", "未完赛", "弃赛"] }
];
function stageFor(status) { return PLAN_STAGES.find(item => item.statuses.includes(status)) || PLAN_STAGES[0]; }
function tokenNow() { return (getApp().globalData || {}).token || ""; }
const OUTING_KINDS = [{ id: "carpool", label: "拼车" }, { id: "gather", label: "集合" }, { id: "pickup", label: "领物" }];
function beijingDate() { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); }

Page({
  data: {
    race: null,
    loadError: "",
    personalOpen: false,
    sourceOpen: false,
    projectLabels: [],
    locationText: "",
    publicStatus: "",
    phaseTitle: "",
    phaseDetail: "",
    coverSrc: "",
    officialActions: [],
    officialResultLink: "",
    signupQrOpen: false,
    outingsOpen: false,
    heroDate: "",
    heroYear: "",
    distanceText: "",
    meetText: "线下",
    statuses: [],
    myStatus: "",
    following: false,
    followBusy: false,
    planBusy: false,
    planStages: PLAN_STAGES,
    planStage: "wish",
    stageStatuses: ["想跑"],
    sharedClubIds: [],
    sharingDraft: [],
    companionNote: "",
    companionOpen: false,
    planOpen: false,
    shareOpen: false,
    shareChoices: [],
    selectedShareKey: "",
    selectedShare: null,
    clubs: [],
    cards: [],
    card: null,
    conflicts: [],
    alternatives: [],
    alternativeNote: "",
    drawText: "",
    drawRates: [],
    drawError: "",
    code: "",
    ready: false,
    message: "",
    myResult: null,
    myResults: [],
    distanceOptions: [],
    distance: "",
    clock: "",
    story: "",
    resultMessage: "",
    proofSrc: "",
    askSignup: false,
    hasSheet: false,
    sheetSrc: "",
    drawLines: [],
    drawNote: "",
    guide: [],
    routeSheets: [],
    pacerSheets: [],
    liveSheet: null,
    kindText: "",
    groupText: "",
    tabs: [
      { id: "signup", label: "赛事信息" },
      { id: "news", label: "赛事资讯" }
    ],
    tab: "signup",
    guideBlocks: [],
    signupUrl: "",
    signupQr: "",
    signupHint: "",
    queryLinks: [],
    articles: [],
    outings: [], visibleOutings: [], outingsLoading: false, outingsError: "", outingFeedback: "", outingBusy: "",
    outingKinds: OUTING_KINDS, outingFormOpen: false, outingKind: "carpool", outingClubId: 0, outingClubIndex: 0,
    outingClubOptions: [], outingFilters: [{ id: 0, name: "全部跑团" }], outingFilterClubId: 0, outingFilterIndex: 0,
    outingDate: "", outingTime: "", outingToday: "", outingPlace: "", outingCapacity: "4", outingNote: ""
  },
  onLoad(query) {
    this._disposed = false;
    this._epoch = (this._epoch || 0) + 1;
    this._resumeFollow = query.follow === "1";
    this.raceId = query.id;
    const code = String(query.code || "").toUpperCase();
    this.pending = null;
    this.inviteRedirect = !!code;
    this._scrollToOutings = query.outings === "1";
    this.setData({ code: "", ready: ready(), personalOpen: query.plan === "1" || query.outings === "1" || !!query.clubId, tab: ["signup", "guide", "news", "result"].includes(query.tab) ? query.tab : "signup", planOpen: query.plan === "1", outingsOpen: query.outings === "1" || !!query.clubId, outings: [], visibleOutings: [], outingFilterClubId: Number(query.clubId) || 0, outingFormOpen: false, outingToday: beijingDate() });
    if (code) {
      wx.redirectTo({ url: "/pages/club-intro/club-intro?code=" + encodeURIComponent(code) });
      return;
    }
    wx.showShareMenu({ menus: ["shareAppMessage"] });
  },
  onShow() {
    this._hidden = false;
    const token = tokenNow();
    if (this._token !== token) {
      this._token = token;
      this._epoch = (this._epoch || 0) + 1;
      this.setData({ following: false, myStatus: "", sharedClubIds: [], sharingDraft: [], companionNote: "", sharingDirty: false, companionDirty: false, clubs: [], cards: [], myResults: [], myResult: null, hasSheet: false, sheetSrc: "", proofSrc: "", shareChoices: [], selectedShare: null, outings: [], visibleOutings: [], outingsError: "", outingFeedback: "", outingPlace: "", outingNote: "", outingDate: "", outingTime: "", outingCapacity: "4", outingClubId: 0, outingClubOptions: [], outingFilters: [{ id: 0, name: "全部跑团" }], outingFilterIndex: 0 });
    }
    this._outingConfirmation = null;
    this.setData({ followBusy: false, planBusy: false, outingBusy: "", ready: ready() });
    this.open();
  },
  onHide() { this._hidden = true; this._epoch = (this._epoch || 0) + 1; this._loadSeq = (this._loadSeq || 0) + 1; },
  onUnload() { this._disposed = true; this._loadSeq = (this._loadSeq || 0) + 1; },
  current(scope) { return !this._disposed && !this._hidden && scope.epoch === (this._epoch || 0) && scope.id === this.raceId && scope.token === tokenNow(); },
  pickPlanStage(e) {
    const stage = PLAN_STAGES.find(item => item.id === e.currentTarget.dataset.id);
    if (stage) this.setData({ planStage: stage.id, stageStatuses: stage.statuses.filter(status => this.data.statuses.includes(status)) });
  },
  toggleFollow() {
    if (!ready()) {
      wx.setStorageSync("marathon_return_after_login", "/pages/race/race?id=" + encodeURIComponent(this.raceId) + "&follow=1");
      wx.switchTab({ url: "/pages/mine/mine" });
      return;
    }
    if (this.data.followBusy) return;
    const scope = { id: this.raceId, token: tokenNow(), epoch: this._epoch || 0 }, following = !this.data.following;
    this.setData({ followBusy: true, message: "" });
    return request("/me/races/" + scope.id + "/follow", "PUT", { following }).then(() => {
      if (this.current(scope)) this.setData({ following, message: following ? "已关注，可在「我的赛事」查看" : "已取消关注，参赛记录仍保留" });
    }).catch(err => { if (this.current(scope)) this.setData({ message: err.message }); })
      .finally(() => { if (this.current(scope)) this.setData({ followBusy: false }); });
  },
  pickSharedClubs(e) {
    if (this.data.planBusy) return;
    const sharedClubIds = (e.detail.value || []).map(Number);
    this.setData({ sharingDraft: sharedClubIds, sharingDirty: true, clubs: this.data.clubs.map(club => ({ ...club, selected: sharedClubIds.includes(club.id) })) });
  },
  saveSharing() {
    if (!this.data.myStatus) { this.setData({ message: "先记录参赛状态，再同步到跑团" }); return; }
    return this.updatePlan("/sharing", { clubIds: this.data.sharingDraft }, "已更新同步跑团，个人记录仍保留");
  },
  onCompanionNote(e) { this.setData({ companionNote: e.detail.value, companionDirty: true }); },
  saveCompanionNote() {
    return this.updatePlan("/companionship", { note: this.data.companionNote.trim() }, "已保存同行备注，仅向选中的跑团展示");
  },
  removePlan() {
    if (this.data.planBusy || this._confirmingRemoval || !this.data.myStatus || !ready()) return Promise.resolve();
    const scope = { id: this.raceId, token: tokenNow(), epoch: this._epoch || 0 };
    this._confirmingRemoval = true;
    return new Promise(resolve => wx.showModal({
      title: "移除参赛计划？",
      content: "关注的比赛和已记录的成绩会保留，跑团不再同步这条计划。",
      confirmText: "移除计划",
      success: result => {
        this._confirmingRemoval = false;
        if (result.confirm && this.current(scope)) resolve(this.updatePlan("", {}, "已移除参赛计划，关注和成绩仍保留", "DELETE"));
        else resolve();
      },
      fail: () => { this._confirmingRemoval = false; resolve(); }
    }));
  },
  updatePlan(suffix, body, message, method = "PUT") {
    if (this.data.planBusy || !ready()) return Promise.resolve();
    const scope = { id: this.raceId, token: tokenNow(), epoch: this._epoch || 0 };
    this.setData({ planBusy: true, message: "" });
    return request("/me/races/" + scope.id + suffix, method, body)
      .then(() => {
        if (!this.current(scope)) return;
        if (suffix === "/sharing") this.setData({ sharingDirty: false });
        if (suffix === "/companionship") this.setData({ companionDirty: false });
        if (method === "DELETE") this.setData({ sharingDirty: false, companionDirty: false });
        return this.load();
      })
      .then(result => {
        if (this.current(scope) && result !== false) this.setData({ message });
        if (this.current(scope) && result === true && suffix === "/sharing") this.setData({ companionOpen: false });
      })
      .catch(err => { if (this.current(scope)) this.setData({ message: err.message }); })
      .finally(() => { if (this.current(scope)) this.setData({ planBusy: false }); });
  },
  togglePersonal() { this.setData({ personalOpen: !this.data.personalOpen }); },
  toggleSource() { this.setData({ sourceOpen: !this.data.sourceOpen }); },
  togglePlan() {
    this.setData({ personalOpen: true, planOpen: !this.data.planOpen });
  },
  loginForResult() {
    wx.setStorageSync("marathon_return_after_login", "/pages/race/race?id=" + encodeURIComponent(this.raceId) + "&tab=result");
    wx.switchTab({ url: "/pages/mine/mine" });
  },
  toggleSignupQr() { this.setData({ signupQrOpen: !this.data.signupQrOpen }); },
  coverError(e) { if (!e.currentTarget.dataset.src || e.currentTarget.dataset.src === this.data.coverSrc) this.setData({ coverSrc: "" }); },
  toggleOutings() { this.setData({ personalOpen: true, outingsOpen: !this.data.outingsOpen }); },
  toggleCompanion() { this.setData({ personalOpen: true, companionOpen: !this.data.companionOpen }); },
  syncOutingClubs(clubs) {
    const filters = [{ id: 0, name: "全部跑团" }].concat(clubs.map(club => ({ id: club.id, name: club.name })));
    const filterIndex = Math.max(0, filters.findIndex(club => club.id === this.data.outingFilterClubId));
    const options = filters.slice(1), preferred = this.data.outingClubId || filters[filterIndex].id;
    const clubIndex = Math.max(0, options.findIndex(club => club.id === preferred));
    this.setData({ outingFilters: filters, outingFilterIndex: filterIndex, outingFilterClubId: filters[filterIndex].id, outingClubOptions: options, outingClubIndex: clubIndex, outingClubId: options[clubIndex] ? options[clubIndex].id : 0 });
    this.paintOutings(this.data.outings);
  },
  paintOutings(items) {
    const outings = (items || []).filter(item => item.status === "open").map(item => {
      const past = Date.parse(item.startsAt + (item.startsAt.length === 16 ? ":00+08:00" : "+08:00")) <= Date.now();
      const full = item.memberCount >= item.capacity;
      return { ...item, past, full, timeLabel: String(item.startsAt || "").replace("T", " "), canJoin: !!item.canJoin && !past && !full, canLeave: !!item.joined && !item.isHost, stateLabel: past ? "已过时" : full ? "已满员" : "余 " + item.remaining + " 位" };
    });
    this.setData({ outings, visibleOutings: outings.filter(item => !this.data.outingFilterClubId || item.clubId === this.data.outingFilterClubId) });
  },
  loadOutings() {
    if (this._disposed || this._hidden) return Promise.resolve();
    const scope = { id: this.raceId, token: tokenNow(), epoch: this._epoch || 0 }, seq = this._outingLoadSeq = (this._outingLoadSeq || 0) + 1;
    if (!ready()) { this.setData({ outings: [], visibleOutings: [], outingsLoading: false, outingsError: "" }); return Promise.resolve(); }
    const current = () => this.current(scope) && seq === this._outingLoadSeq;
    this.setData({ outingsLoading: true, outingsError: "" });
    return request("/races/" + scope.id + "/outings").then(data => {
      if (current()) this.paintOutings(data.outings || []);
    }).catch(err => { if (current()) this.setData({ outingsError: err.message || "同行组织暂时无法加载" }); })
      .finally(() => { if (current()) this.setData({ outingsLoading: false }); });
  },
  pickOutingFilter(e) {
    const index = Number(e.detail.value), club = this.data.outingFilters[index];
    if (!club) return;
    this.setData({ outingFilterIndex: index, outingFilterClubId: club.id });
    this.paintOutings(this.data.outings);
  },
  showClubOutings(e) {
    this.setData({ personalOpen: true, outingsOpen: true });
    const index = this.data.outingFilters.findIndex(club => club.id === Number(e.currentTarget.dataset.club));
    if (index >= 0) this.pickOutingFilter({ detail: { value: index } });
    wx.pageScrollTo({ selector: "#race-outings", duration: 200 });
  },
  loginForOutings() {
    wx.setStorageSync("marathon_return_after_login", "/pages/race/race?id=" + encodeURIComponent(this.raceId) + "&outings=1" + (this.data.outingFilterClubId ? "&clubId=" + this.data.outingFilterClubId : ""));
    wx.switchTab({ url: "/pages/mine/mine" });
  },
  toggleOutingForm() {
    if (!ready()) { this.loginForOutings(); return; }
    if (this.data.outingBusy) return;
    this.setData({ personalOpen: true, outingsOpen: true, outingFormOpen: !this.data.outingFormOpen, outingFeedback: "", outingDate: this.data.outingDate || (this.data.race.raceDate >= beijingDate() ? this.data.race.raceDate : beijingDate()) });
  },
  pickOutingKind(e) { if (!this.data.outingBusy && OUTING_KINDS.some(item => item.id === e.currentTarget.dataset.kind)) this.setData({ outingKind: e.currentTarget.dataset.kind }); },
  pickOutingClub(e) {
    const index = Number(e.detail.value), club = this.data.outingClubOptions[index];
    if (!this.data.outingBusy && club) this.setData({ outingClubIndex: index, outingClubId: club.id });
  },
  onOutingField(e) {
    const key = e.currentTarget.dataset.key;
    if (!this.data.outingBusy && ["outingDate", "outingTime", "outingPlace", "outingCapacity", "outingNote"].includes(key)) this.setData({ [key]: e.detail.value });
  },
  createOuting() {
    if (!ready()) { this.loginForOutings(); return Promise.resolve(); }
    if (this.data.outingBusy) return Promise.resolve();
    const d = this.data, startsAt = d.outingDate + "T" + d.outingTime, instant = Date.parse(startsAt + ":00+08:00"), capacity = Number(d.outingCapacity), place = d.outingPlace.trim(), note = d.outingNote.trim();
    let error = "";
    if (!d.outingClubOptions.some(club => club.id === d.outingClubId)) error = "请先选择已加入的跑团";
    else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startsAt) || !Number.isFinite(instant) || new Date(instant + 8 * 3600000).toISOString().slice(0, 16) !== startsAt || instant <= Date.now()) error = "请选择未来的北京时间";
    else if (!place || place.length > 120) error = "请填写地点，最多120字";
    else if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) error = "总人数需为1至100人，含发起人";
    else if (note.length > 300) error = "备注最多300字";
    if (error) { this.setData({ outingFeedback: error }); return Promise.resolve(); }
    return this.mutateOuting("", "POST", { clubId: d.outingClubId, kind: d.outingKind, startsAt, place, capacity, note }, "create", "已发起，你已占1个名额");
  },
  changeOutingMembership(e) {
    const item = this.data.outings.find(outing => String(outing.id) === String(e.currentTarget.dataset.id));
    if (!item || item.isHost || (item.joined ? !item.canLeave : !item.canJoin)) return Promise.resolve();
    return this.mutateOuting("/" + item.id + "/membership", "PUT", { joined: !item.joined }, String(item.id), item.joined ? "已退出本次同行" : "已加入本次同行");
  },
  cancelOuting(e) {
    const item = this.data.outings.find(outing => String(outing.id) === String(e.currentTarget.dataset.id));
    if (!item || !item.canCancel || this.data.outingBusy || this._outingConfirmation) return Promise.resolve();
    const scope = { id: this.raceId, token: tokenNow(), epoch: this._epoch || 0 };
    this._outingConfirmation = scope;
    return new Promise(resolve => wx.showModal({ title: "取消这次同行？", content: "取消后将从本场同行列表移除，参赛计划和跑团活动不受影响。", confirmText: "取消同行", success: result => {
      if (this._outingConfirmation === scope) this._outingConfirmation = null;
      if (result.confirm && this.current(scope)) resolve(this.mutateOuting("/" + item.id, "DELETE", {}, String(item.id), "已取消本次同行"));
      else resolve();
    }, fail: () => { if (this._outingConfirmation === scope) this._outingConfirmation = null; resolve(); } }));
  },
  mutateOuting(suffix, method, body, busy, message) {
    if (this.data.outingBusy || !ready()) return Promise.resolve();
    const scope = { id: this.raceId, token: tokenNow(), epoch: this._epoch || 0 };
    this.setData({ outingBusy: busy, outingFeedback: "" });
    return request("/races/" + scope.id + "/outings" + suffix, method, body).then(data => {
      if (!this.current(scope)) return;
      const items = this.data.outings.filter(item => String(item.id) !== busy && (!data.outing || item.id !== data.outing.id));
      if (data.outing) items.push(data.outing);
      this.paintOutings(items);
      if (busy === "create") this.setData({ outingFormOpen: false, outingPlace: "", outingNote: "" });
      this.setData({ outingFeedback: message });
      return this.loadOutings();
    }).catch(err => { if (this.current(scope)) this.setData({ outingFeedback: err.message || "没有保存成功，请重试" }); })
      .finally(() => { if (this.current(scope)) this.setData({ outingBusy: "" }); });
  },
  toggleShare() {
    this.setData({ shareOpen: !this.data.shareOpen });
  },
  syncShareChoices(cards, legacyCard) {
    const shareChoices = (cards && cards.length ? cards : legacyCard ? [legacyCard] : []).filter(item => item && item.club).map(item => ({ ...item, selectionKey: String(item.club.id || item.club.code) }));
    const selectedShare = shareChoices.find(item => item.selectionKey === this.data.selectedShareKey) || shareChoices[0] || null;
    this.pending = null;
    this.setData({ shareChoices, selectedShare, selectedShareKey: selectedShare ? selectedShare.selectionKey : "" });
  },
  selectShare(event) {
    const key = String(event.currentTarget.dataset.key || "");
    const selectedShare = this.data.shareChoices.find(item => item.selectionKey === key);
    if (!selectedShare) return;
    this.pending = null;
    this.setData({ selectedShareKey: key, selectedShare });
  },
  loginForPlan() {
    wx.setStorageSync("marathon_return_after_login", "/pages/race/race?id=" + encodeURIComponent(this.raceId) + "&plan=1");
    wx.switchTab({ url: "/pages/mine/mine" });
  },
  armShare(e) {
    this.pending = e.currentTarget.dataset;
  },
  onShareAppMessage() {
    const pending = this.pending || {};
    const cards = this.data.cards || [];
    const cardForCode = pending.code
      ? cards.find((item) => item.club && item.club.code === pending.code) ||
        (this.data.card && this.data.card.club && this.data.card.club.code === pending.code ? this.data.card : null)
      : null;
    const card = cardForCode || cards[0] || this.data.card;
    const title = pending.title || (card && card.title) || (this.data.race && this.data.race.name) || "赛历";
    const code = pending.code || this.data.code;
    const club = (cardForCode && cardForCode.club) || null;
    if (code && club) {
      return {
        title: club.name + " · 邀你加入",
        path: "/pages/club-intro/club-intro?id=" + club.id
      };
    }
    return {
      title,
      path: "/pages/race/race?id=" + this.raceId + (code ? "&code=" + code : "")
    };
  },
  open() {
    if (this.inviteRedirect) return;
    this.setData({ loadError: "" });
    this.load();
    this.loadOutings();
  },
  load() {
    if (this._disposed || this._hidden) return Promise.resolve();
    const scope = { id: this.raceId, token: tokenNow(), epoch: this._epoch || 0 }, seq = this._loadSeq = (this._loadSeq || 0) + 1;
    const current = () => this.current(scope) && seq === this._loadSeq;
    const jobs = [
      request("/races/" + this.raceId).then((data) => {
        if (!current()) return;
        const race = data.race;
        const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(race.raceDate || "");
        const sharedClubIds = data.sharedClubIds || [];
        const memberIds = (data.clubs || []).map(club => club.id);
        const sharingDraft = this.data.sharingDirty ? this.data.sharingDraft.filter(id => memberIds.includes(id)) : sharedClubIds;
        const stage = stageFor(data.myStatus);
        const statuses = data.statuses || PLAN_STAGES.reduce((all, item) => all.concat(item.statuses), []);
        const distanceOptions = (race.distances || []).map((key, i) => ({
          key,
          label: (race.distanceLabels || [])[i] || key
        }));
        const myResults = data.myResults || [];
        const myResult = myResults.find((item) => item.distance === this.data.distance) || myResults[0] || null;
        const patch = {
          race,
          loadError: "",
          ...publicPhase(race, beijingDate()),
          projectLabels: [...new Set([...(race.distanceLabels || []), ...(race.kind === "trail" ? ["越野"] : []), ...(race.kindLabels || []), ...(race.groups || [])])],
          locationText: [race.province, race.city, race.district].filter((value, i, all) => value && all.indexOf(value) === i).join(" · ") || race.place || "地点未录入",
          coverSrc: race.coverSheet && race.coverSheet.id ? baseUrl + "/marathon/api/race-sheets/" + race.coverSheet.id : "",
          officialActions: officialActions(race, beijingDate()),
          officialResultLink: ((race.links || []).find(item => item.key === "result" && /^https:\/\/\S+$/i.test(item.url || "")) || {}).url || "",
          heroDate: date ? date[2] + "." + date[3] : race.raceDate || "日期待定",
          heroYear: date ? date[1] : "",
          distanceText: [...(race.distanceLabels || []), ...(race.kind === "trail" && !(race.kindLabels || []).includes("越野") ? ["越野"] : []), ...(race.kindLabels || []), ...(race.groups || [])].join(" / "),
          meetText: race.meet === "online" ? "线上" : "线下",
          statuses,
          myStatus: data.myStatus || "",
          following: !!data.following,
          sharedClubIds,
          sharingDraft,
          companionNote: this.data.companionDirty ? this.data.companionNote : data.companionNote || "",
          planStage: stage.id,
          stageStatuses: stage.statuses.filter(status => statuses.includes(status)),
          clubs: (data.clubs || []).map((club) => {
            const card = (data.cards || []).find((item) => item.club && item.club.id === club.id);
            return { ...club, selected: sharingDraft.includes(club.id), synced: sharedClubIds.includes(club.id), squadText: card && card.squad ? card.squad.text : "" };
          }),
          cards: (data.cards || []).map(withUnpaid),
          conflicts: data.conflicts || [],
          alternatives: data.alternatives || [],
          alternativeNote: data.alternativeNote || "",
          drawText: data.drawText || "",
          drawLines: String(data.drawText || "").split("\n").filter(Boolean),
          drawRates: data.drawRates || [],
          drawError: "",
          drawNote: "",
          proofSrc: myResult && myResult.hasProof
            ? baseUrl + "/marathon/api/me/races/" + this.raceId + "/result/proof?t=" + encodeURIComponent((getApp().globalData && getApp().globalData.token) || "") + "&distance=" + encodeURIComponent(myResult.distance)
            : "",
          hasSheet: Boolean(data.hasSheet),
          sheetSrc: data.hasSheet
            ? baseUrl + "/marathon/api/me/races/" + this.raceId + "/sheet?t=" + encodeURIComponent((getApp().globalData && getApp().globalData.token) || "")
            : "",
          myResults,
          ready: ready(),
          message: "",
          myResult,
          distanceOptions,
          resultMessage: "",
          guide: mediaRows(race.guide, this.data.guide),
          routeSheets: mediaRows(race.routeSheets, this.data.routeSheets),
          pacerSheets: mediaRows(race.pacerSheets, this.data.pacerSheets),
          liveSheet: race.liveSheet ? mediaRows([race.liveSheet], this.data.liveSheet ? [this.data.liveSheet] : [])[0] : null,
          kindText: (race.kindLabels || []).join(" / "),
          groupText: (race.groups || []).join("、"),
          guideBlocks: parseGuide(race.guideText),
          signupUrl: ((race.links || []).find((item) => item.key === "signup") || {}).url || "",
          signupQr: (race.links || []).some((item) => item.key === "signup") && race.signupHost
            ? baseUrl + "/marathon/api/races/" + this.raceId + "/signup-qr"
            : "",
          signupHint: signupHint(race),
          queryLinks: (race.links || []).filter((item) => item.key !== "signup" && String(item.url || "").startsWith("https://"))
        };
        const tabs = raceTabs(race, patch);
        patch.tabs = tabs;
        patch.tab = tabs.some((item) => item.id === this.data.tab) ? this.data.tab : "signup";
        if (myResult) {
          patch.distance = myResult.distance;
          patch.clock = myResult.clock;
          patch.story = myResult.story || "";
        } else if (!this.data.distance && distanceOptions[0]) {
          patch.distance = distanceOptions[0].key;
        }
        this.setData(patch);
        this.syncOutingClubs(patch.clubs);
        if (this._scrollToOutings) wx.nextTick(() => { if (current()) { this._scrollToOutings = false; wx.pageScrollTo({ selector: "#race-outings", duration: 200 }); } });
        this.syncShareChoices(patch.cards, this.data.card);
        if (this._resumeFollow && ready()) { this._resumeFollow = false; if (!patch.following) this.toggleFollow(); }
      }),
      request("/races/" + this.raceId + "/news").then((data) => {
        if (current()) this.setData({ articles: data.news || [] });
      })
    ];
    if (this.data.code) {
      jobs.push(
        request("/races/" + this.raceId + "/card?code=" + encodeURIComponent(this.data.code)).then((card) => {
          if (!current()) return;
          this.setData({ card: withUnpaid(card) });
          this.syncShareChoices(this.data.cards, this.data.card);
        })
      );
    }
    return Promise.all(jobs).then(() => true).catch((err) => { if (current()) this.setData({ message: err.message, loadError: this.data.race ? "" : err.message || "赛事暂时无法加载" }); return false; });
  },
  pickTab(e) {
    const tab = e.currentTarget.dataset.id;
    if (!tab || tab === this.data.tab) return;
    this.setData({ tab });
  },
  copyLink(e) {
    const key = e.currentTarget.dataset.key || "", url = e.currentTarget.dataset.url || "";
    if (!/^https:\/\/\S+$/i.test(url)) return;
    wx.setClipboardData({
      data: url,
      success: () => {
        if (key === "signup" && !(this.data.race.regStart > beijingDate()) && !(this.data.race.raceDate < beijingDate()) && !(this.data.race.deadline && this.data.race.deadline < beijingDate())) this.setData({ askSignup: true });
      },
      fail: () => wx.showToast({ title: "复制失败，请重试", icon: "none" })
    });
  },
  dismissAsk() {
    this.setData({ askSignup: false });
  },
  confirmSigned() {
    if (!this.data.ready) {
      this.setData({ message: "先到「我的」登录" });
      return;
    }
    if (this.data.myStatus && this.data.myStatus !== "想跑") {
      this.setData({ askSignup: false, message: "这场已经标成「" + this.data.myStatus + "」" });
      return;
    }
    this.setData({ askSignup: false });
    return this.updatePlan("", { status: "已报名" }, "已记录为已报名，实际报名结果以官方为准");
  },
  chooseSheet() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      success: (res) => {
        const file = (res.tempFiles || [])[0];
        if (!file) return;
        const app = getApp();
        wx.uploadFile({
          url: app.globalData.baseUrl + "/marathon/api/me/races/" + this.raceId + "/sheet",
          filePath: file.tempFilePath,
          name: "file",
          header: { Authorization: app.globalData.token ? "Bearer " + app.globalData.token : "" },
          success: (upload) => {
            if (upload.statusCode >= 200 && upload.statusCode < 300) this.load().then(() => this.setData({ message: "报名截图已上传" }));
            else {
              let message = "没有传上去";
              try {
                message = JSON.parse(upload.data).error || message;
              } catch (err) {}
              this.setData({ message });
            }
          },
          fail: () => this.setData({ message: "没有传上去" })
        });
      }
    });
  },
  removeSheet() {
    request("/me/races/" + this.raceId + "/sheet", "DELETE")
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  removeResult() {
    if (!this.data.myResult) return;
    wx.showModal({
      title: "去掉这项成绩",
      content: "同一场的其他项目还留着。",
      success: (res) => {
        if (!res.confirm) return;
        request("/me/races/" + this.raceId + "/result?distance=" + encodeURIComponent(this.data.distance), "DELETE")
          .then(() => {
            this.setData({ distance: "" });
            return this.load();
          })
          .catch((err) => this.setData({ resultMessage: err.message }));
      }
    });
  },
  updateMedia(e, state, retry) {
    const { kind, id, src } = e.currentTarget.dataset;
    if (!["guide", "routeSheets", "pacerSheets", "liveSheet"].includes(kind)) return;
    const rows = kind === "liveSheet" ? this.data.liveSheet ? [this.data.liveSheet] : [] : this.data[kind];
    const found = rows.find(row => String(row.id) === String(id));
    if (!found || src && src !== (found.displaySrc || found.src)) return;
    const updated = rows.map(row => row !== found ? row : { ...row, state, ...(retry ? { displaySrc: row.src + "?retry=" + Date.now() } : {}) });
    this.setData({ [kind]: kind === "liveSheet" ? updated[0] : updated });
  },
  mediaLoaded(e) { this.updateMedia(e, "ready"); },
  mediaError(e) { this.updateMedia(e, "failed"); },
  retryMedia(e) { this.updateMedia(e, "loading", true); },
  previewGuide(e) {
    const current = e.currentTarget.dataset.src;
    const urls = (this.data.coverSrc ? [this.data.coverSrc] : []).concat(this.data.guide.map((item) => item.src).concat(this.data.routeSheets.map((item) => item.src), this.data.pacerSheets.map((item) => item.src)));
    if (this.data.liveSheet) urls.push(this.data.liveSheet.src);
    if (current && urls.includes(current)) wx.previewImage({ current, urls });
  },
  mark(e) {
    const status = e.currentTarget.dataset.status;
    if (!this.data.statuses.includes(status)) return;
    return this.updatePlan("", { status }, "已标记为「" + status + "」");
  },
  pickDistance(e) {
    const distance = e.currentTarget.dataset.distance;
    const found = (this.data.myResults || []).find((item) => item.distance === distance) || null;
    const token = (getApp().globalData && getApp().globalData.token) || "";
    this.setData({
      distance,
      myResult: found,
      clock: found ? found.clock : "",
      story: found ? found.story || "" : "",
      proofSrc: found && found.hasProof
        ? baseUrl + "/marathon/api/me/races/" + this.raceId + "/result/proof?t=" + encodeURIComponent(token) + "&distance=" + encodeURIComponent(distance)
        : ""
    });
  },
  onClock(e) {
    this.setData({ clock: e.detail.value });
  },
  onStory(e) {
    this.setData({ story: e.detail.value });
  },
  copyDraw() {
    wx.setClipboardData({
      data: this.data.drawText || "",
      fail: () => this.setData({ drawError: "没有复制成功，可以直接选中上面的文字" })
    });
  },
  savePoster() {
    const lines = this.data.drawLines || [];
    const ctx = wx.createCanvasContext("poster", this);
    ctx.setFillStyle("#e1251b");
    ctx.fillRect(0, 0, 750, 1000);
    ctx.setFillStyle("#ffffff");
    ctx.setFontSize(48);
    lines.forEach((line, index) => ctx.fillText(line, 60, 220 + index * 80));
    ctx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: "poster",
        success: (res) => {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => this.setData({ drawNote: "图片已保存", drawError: "" }),
            fail: () => this.setData({ drawError: "没有保存成功，可以复制上面的文字" })
          });
        },
        fail: () => this.setData({ drawError: "没有保存成功，可以复制上面的文字" })
      }, this);
    });
  },
  chooseProof(e) {
    if (!this.data.myResult) {
      this.setData({ resultMessage: "先记下成绩，再上传照片" });
      return;
    }
    const kind = e.currentTarget.dataset.kind;
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      success: (res) => {
        const file = (res.tempFiles || [])[0];
        if (!file) return;
        const app = getApp();
        wx.uploadFile({
          url: app.globalData.baseUrl + "/marathon/api/me/races/" + this.raceId + "/result/proof/" + kind + "?distance=" + encodeURIComponent(this.data.distance),
          filePath: file.tempFilePath,
          name: "file",
          header: { Authorization: app.globalData.token ? "Bearer " + app.globalData.token : "" },
          success: (upload) => {
            if (upload.statusCode >= 200 && upload.statusCode < 300) this.load();
            else {
              let message = "没有传上去";
              try {
                message = JSON.parse(upload.data).error || message;
              } catch (err) {}
              this.setData({ resultMessage: message });
            }
          },
          fail: () => this.setData({ resultMessage: "没有传上去" })
        });
      }
    });
  },
  removeProof() {
    request("/me/races/" + this.raceId + "/result/proof?distance=" + encodeURIComponent(this.data.distance), "DELETE")
      .then(() => this.load())
      .catch((err) => this.setData({ resultMessage: err.message }));
  },
  saveResult() {
    request("/me/races/" + this.raceId + "/result", "PUT", {
      distance: this.data.distance,
      time: (this.data.clock || "").trim(),
      story: (this.data.story || "").trim()
    })
      .then(() => this.load())
      .catch((err) => this.setData({ resultMessage: err.message }));
  }
});
