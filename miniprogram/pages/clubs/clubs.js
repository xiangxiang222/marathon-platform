const { request, ready } = require("../../utils/request");
const { publicClub, showVerification } = require("../../utils/club-identity");
function accountKey() {
  const app = typeof getApp === "function" ? getApp() : null;
  return app && app.globalData ? String(app.globalData.token || "") : "";
}
const PRIVATE_EMPTY = {
  leader: false, clubs: [], shownClubs: [], mineQuery: "", openClubs: [], application: null, createOpen: false,
  name: "", city: "", intro: "", applicationId: null, foundingMessage: "", creating: false,
  duplicates: [], duplicateMessage: "", directoryPage: 0, directoryPages: 0, directoryTotal: 0,
  directoryBusy: false, more: 0, query: "", searchCity: "", code: ""
};
Page({
  data: { ...PRIVATE_EMPTY, ready: false, mode: "search", loaded: false, message: "" },
  onShow() {
    this._disposed = false;
    this._hidden = false;
    const token = accountKey();
    if (this._account !== token) {
      this.invalidate(); this._createRequestId = "";
      this.setData({ ...PRIVATE_EMPTY, loaded: false, message: "" });
    }
    this._account = token;
    this.setData({ ready: ready(), creating: false, directoryBusy: false });
    if (ready()) this.load();
  },
  invalidate() {
    this.loadSeq = (this.loadSeq || 0) + 1;
    this.directorySeq = (this.directorySeq || 0) + 1;
    this.duplicateSeq = (this.duplicateSeq || 0) + 1;
    this.createSeq = (this.createSeq || 0) + 1;
    clearTimeout(this.queryTimer); clearTimeout(this.duplicateTimer);
  },
  onHide() { this._hidden = true; this.invalidate(); },
  onUnload() { this._disposed = true; this.invalidate(); },
  scopeCurrent(token) { return !this._disposed && !this._hidden && ready() && token === accountKey(); },
  onMineQuery(e) { this.setData({ mineQuery: e.detail.value }); this.filterMine(); },
  filterMine() {
    const query = String(this.data.mineQuery || "").trim().toLowerCase();
    this.setData({ shownClubs: this.data.clubs.filter((club) => !query || String(club.name || "").toLowerCase().includes(query)) });
  },
  toggleCreate() { this.setData({ createOpen: !this.data.createOpen }); },
  openClub(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (id) wx.navigateTo({ url: "/pages/club-intro/club-intro?id=" + id });
  },
  verifiedInfo(e) {
    const id = Number(e.currentTarget.dataset.id);
    showVerification(this.data.openClubs.concat(this.data.clubs, this.data.duplicates).find((club) => club.id === id));
  },
  onName(e) {
    if (this.data.creating) return;
    this._createRequestId = "";
    this.setData({ name: e.detail.value, foundingMessage: "", duplicates: [], duplicateMessage: "" });
    clearTimeout(this.duplicateTimer);
    this.duplicateSeq = (this.duplicateSeq || 0) + 1;
    this.duplicateTimer = setTimeout(() => this.checkDuplicates(), 250);
  },
  onCreateField(e) {
    if (this.data.creating) return;
    const key = e.currentTarget.dataset.key;
    if (!["city", "intro"].includes(key)) return;
    this._createRequestId = ""; this.setData({ [key]: e.detail.value, foundingMessage: "" });
  },
  chooseCity(e) {
    if (this.data.creating) return;
    this._createRequestId = ""; this.setData({ city: e.currentTarget.dataset.city, foundingMessage: "" });
  },
  checkDuplicates() {
    if (this._account !== accountKey()) { this.onShow(); return Promise.resolve(); }
    const name = String(this.data.name || "").trim();
    if (!name || !ready() || this._hidden || this._disposed) return Promise.resolve();
    const token = accountKey();
    const seq = this.duplicateSeq = (this.duplicateSeq || 0) + 1;
    return request("/clubs/directory?q=" + encodeURIComponent(name) + "&page=1&pageSize=3").then((data) => {
      if (!this.scopeCurrent(token) || seq !== this.duplicateSeq || name !== this.data.name.trim()) return;
      this.setData({ duplicates: (data.clubs || []).map(publicClub), duplicateMessage: "" });
    }).catch(() => {
      if (this.scopeCurrent(token) && seq === this.duplicateSeq) this.setData({ duplicateMessage: "暂时无法检查同名，你仍可创建。" });
    });
  },
  continueApplication() {
    if (this._account !== accountKey()) { this.onShow(); return; }
    const application = this.data.application;
    if (!application || this.data.creating) return;
    this._createRequestId = "";
    this.setData({ createOpen: true, name: application.name || "", applicationId: application.id, foundingMessage: "补充活动城市后，点击创建即确认开通这份旧申请。" });
    this.checkDuplicates();
  },
  onCode(e) { this.setData({ code: e.detail.value }); },
  onQuery(e) {
    this.setData({ query: e.detail.value, openClubs: [], more: 0, message: "", directoryBusy: false });
    this.directorySeq = (this.directorySeq || 0) + 1;
    clearTimeout(this.queryTimer);
    this.queryTimer = setTimeout(() => this.loadDirectory(false), 200);
  },
  onSearchCity(e) { this.setData({ searchCity: e.detail.value }); },
  showRest() { return this.loadDirectory(true); },
  pickMode(e) { this.setData({ mode: e.currentTarget.dataset.mode, message: "" }); },
  load() {
    if (!ready() || this._disposed || this._hidden) return Promise.resolve();
    const token = accountKey();
    if (this._account !== token) {
      this.invalidate(); this._createRequestId = ""; this._account = token;
      this.setData({ ...PRIVATE_EMPTY, ready: true, loaded: false, message: "" });
    }
    const seq = this.loadSeq = (this.loadSeq || 0) + 1;
    const mine = request("/me").then((data) => {
      if (!this.scopeCurrent(token) || seq !== this.loadSeq) return;
      this.setData({ clubs: (data.clubs || []).map(publicClub), application: (data.applications || []).find((item) => !item.status || item.status === "pending") || null, loaded: true });
      this.filterMine();
    }).catch((err) => {
      if (!this.scopeCurrent(token) || seq !== this.loadSeq) return;
      if (err.status === 401 || err.status === 403) { this._createRequestId = ""; this.setData({ ...PRIVATE_EMPTY }); }
      this.setData({ loaded: true, message: err.message });
    });
    return Promise.all([mine, this.loadDirectory(false)]);
  },
  loadDirectory(append) {
    if (!ready() || this._disposed || this._hidden || this.data.directoryBusy) return Promise.resolve();
    if (append && this.data.directoryPage >= this.data.directoryPages) return Promise.resolve();
    const token = accountKey();
    const seq = this.directorySeq = (this.directorySeq || 0) + 1;
    const page = append ? this.data.directoryPage + 1 : 1;
    const query = String(this.data.query || "").trim();
    const city = String(this.data.searchCity || "").trim();
    this.setData({ directoryBusy: true, message: "" });
    return request("/clubs/directory?q=" + encodeURIComponent(query) + "&city=" + encodeURIComponent(city) + "&page=" + page + "&pageSize=20").then((data) => {
      if (!this.scopeCurrent(token) || seq !== this.directorySeq) return;
      const entries = (data.clubs || []).map(publicClub);
      const previous = append ? this.data.openClubs : [];
      const clubs = previous.concat(entries.filter((club) => !previous.some((old) => old.id === club.id)));
      const pages = Number(data.pages) || 1;
      const total = Number(data.total) || clubs.length;
      this.setData({ openClubs: clubs, directoryPage: page, directoryPages: pages, directoryTotal: total, more: page < pages ? Math.max(1, total - clubs.length) : 0, loaded: true, message: query && !clubs.length ? "没有找到这个跑团，试试其他名称或团号" : "" });
    }).catch((err) => {
      if (this.scopeCurrent(token) && seq === this.directorySeq) this.setData({ loaded: true, message: err.message });
    }).finally(() => {
      if (this.scopeCurrent(token) && seq === this.directorySeq) this.setData({ directoryBusy: false });
    });
  },
  search() {
    if (!ready()) { this.setData({ message: "登录后即可搜索跑团，也可以用口令查看介绍" }); return; }
    clearTimeout(this.queryTimer); this.directorySeq = (this.directorySeq || 0) + 1;
    this.setData({ directoryBusy: false }); return this.loadDirectory(false);
  },
  create() {
    if (!ready() || this.data.creating || this._hidden || this._disposed) return Promise.resolve();
    if (this._account !== accountKey()) { this.onShow(); return Promise.resolve(); }
    const name = String(this.data.name || "").trim();
    const city = String(this.data.city || "").trim();
    const intro = String(this.data.intro || "").trim();
    if (!name || !city) { this.setData({ foundingMessage: "填写跑团名称和活动城市，即可创建。" }); return Promise.resolve(); }
    const token = accountKey();
    const seq = this.createSeq = (this.createSeq || 0) + 1;
    if (!this._createRequestId) this._createRequestId = "mini-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 14);
    const payload = { name, city, intro, requestId: this._createRequestId };
    if (this.data.applicationId) payload.applicationId = this.data.applicationId;
    this.setData({ creating: true, foundingMessage: "" });
    return request("/clubs", "POST", payload).then((data) => {
      if (!this.scopeCurrent(token) || seq !== this.createSeq) return;
      if (!data.club || !data.club.id) throw new Error("未能确认创建结果，请重试。");
      this._createRequestId = "";
      this.setData({ name: "", city: "", intro: "", applicationId: null, duplicates: [], application: null, createOpen: false });
      wx.navigateTo({ url: "/pages/club/club?id=" + data.club.id + "&created=1" });
    }).catch((err) => {
      if (this.scopeCurrent(token) && seq === this.createSeq) this.setData({ foundingMessage: err.message });
    }).finally(() => {
      if (this.scopeCurrent(token) && seq === this.createSeq) this.setData({ creating: false });
    });
  },
  join() {
    const code = String(this.data.code || "").trim();
    if (!code) { this.setData({ message: "填口令" }); return; }
    wx.navigateTo({ url: "/pages/club-intro/club-intro?code=" + encodeURIComponent(code) });
  },
  apply(e) { this.openClub(e); }
});
