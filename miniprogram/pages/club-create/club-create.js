const { request, ready, clearAuth } = require("../../utils/request");
const { publicClub, showVerification } = require("../../utils/club-identity");
const { logoData, logoMethods } = require("../../utils/club-logo");
const RETURN_PATH = "/pages/club-create/club-create";
const EMPTY = {
  ...logoData, name: "", city: "", intro: "", application: null, applicationId: null,
  duplicates: [], duplicateMessage: "", foundingMessage: "", loadMessage: "",
  creating: false, loading: false
};
function accountKey() {
  const app = typeof getApp === "function" ? getApp() : null;
  return app && app.globalData ? String(app.globalData.token || "") : "";
}
Page({
  ...logoMethods,
  data: { ...EMPTY, ready: false },
  onLoad(query = {}) { this._continueRequested = query.continue === "1"; },
  onShow() {
    this._disposed = false;
    this._hidden = false;
    const token = accountKey();
    if (this._account !== token) {
      this.invalidate(); this._createRequestId = "";
      this.setData({ ...EMPTY });
    }
    this._account = token;
    this.setData({ ready: ready(), creating: false, loading: false, logoPreparing: false });
    if (!ready()) return Promise.resolve();
    if (this.data.name) this.checkDuplicates();
    return this.load();
  },
  invalidate() {
    this.invalidateLogo();
    this.loadSeq = (this.loadSeq || 0) + 1;
    this.duplicateSeq = (this.duplicateSeq || 0) + 1;
    this.createSeq = (this.createSeq || 0) + 1;
    clearTimeout(this.duplicateTimer);
  },
  onHide() { this._hidden = true; this.invalidate(); },
  onUnload() { this._disposed = true; this.invalidate(); },
  scopeCurrent(token) { return !this._disposed && !this._hidden && ready() && token === accountKey(); },
  editable() {
    if (this._account !== accountKey()) { this.onShow(); return false; }
    return this.scopeCurrent(this._account) && !this.data.creating;
  },
  login() {
    if (ready()) return this.onShow();
    wx.setStorageSync("marathon_return_after_login", RETURN_PATH + (this._continueRequested ? "?continue=1" : ""));
    wx.switchTab({ url: "/pages/mine/mine" });
  },
  load() {
    if (this._account !== accountKey()) return this.onShow();
    if (!this.scopeCurrent(this._account)) return Promise.resolve();
    const token = accountKey(), seq = this.loadSeq = (this.loadSeq || 0) + 1;
    this.setData({ loading: true, loadMessage: "" });
    return request("/me").then((data) => {
      if (!this.scopeCurrent(token) || seq !== this.loadSeq) return;
      const application = (data.applications || []).find((item) => !item.status || item.status === "pending") || null;
      this.setData({ application });
      if (application && this._continueRequested && !this.data.name && !this.data.creating) {
        this._continueRequested = false;
        this.continueApplication();
      }
    }).catch((err) => {
      if (!this.scopeCurrent(token) || seq !== this.loadSeq) return;
      if (err.status === 401 || err.status === 403) {
        this._createRequestId = "";
        if (err.status === 401) clearAuth();
        this.setData({ ...EMPTY, ready: ready() });
      }
      this.setData({ loadMessage: err.message || "暂时无法读取之前的申请，请重试。" });
    }).finally(() => {
      if (this.scopeCurrent(token) && seq === this.loadSeq) this.setData({ loading: false });
    });
  },
  onName(e) {
    if (!this.editable()) return;
    this._createRequestId = "";
    this.setData({ name: e.detail.value, foundingMessage: "", duplicates: [], duplicateMessage: "" });
    clearTimeout(this.duplicateTimer);
    this.duplicateSeq = (this.duplicateSeq || 0) + 1;
    this.duplicateTimer = setTimeout(() => this.checkDuplicates(), 250);
  },
  onCreateField(e) {
    if (!this.editable()) return;
    const key = e.currentTarget.dataset.key;
    if (!["city", "intro"].includes(key)) return;
    this._createRequestId = "";
    this.setData({ [key]: e.detail.value, foundingMessage: "" });
  },
  chooseCity(e) {
    if (!this.editable()) return;
    this._createRequestId = "";
    this.setData({ city: e.currentTarget.dataset.city, foundingMessage: "" });
  },
  checkDuplicates() {
    if (this._account !== accountKey()) return this.onShow();
    const name = String(this.data.name || "").trim();
    if (!name || !this.scopeCurrent(this._account)) return Promise.resolve();
    const token = accountKey(), seq = this.duplicateSeq = (this.duplicateSeq || 0) + 1;
    return request("/clubs/directory?q=" + encodeURIComponent(name) + "&page=1&pageSize=3").then((data) => {
      if (!this.scopeCurrent(token) || seq !== this.duplicateSeq || name !== this.data.name.trim()) return;
      this.setData({ duplicates: (data.clubs || []).map(publicClub), duplicateMessage: "" });
    }).catch(() => {
      if (this.scopeCurrent(token) && seq === this.duplicateSeq) this.setData({ duplicateMessage: "暂时无法检查同名，你仍可创建。" });
    });
  },
  continueApplication() {
    if (!this.editable() || !this.data.application) return;
    this._createRequestId = "";
    this.setData({ name: this.data.application.name || "", applicationId: this.data.application.id, foundingMessage: "补充活动城市后，点击创建即确认开通这份旧申请。" });
    return this.checkDuplicates();
  },
  duplicateLogoError(e) {
    if (!this.scopeCurrent(this._account)) return;
    const id = Number(e.currentTarget.dataset.id), src = e.currentTarget.dataset.src;
    this.setData({ duplicates: this.data.duplicates.map(club => club.id === id && club.logo === src ? { ...club, logoFailed: true } : club) });
  },
  openClub(e) {
    if (!this.editable()) return;
    const id = Number(e.currentTarget.dataset.id);
    if (id && this.data.duplicates.some((club) => club.id === id)) wx.navigateTo({ url: "/pages/club-intro/club-intro?id=" + id });
  },
  verifiedInfo(e) {
    if (!this.editable()) return;
    const id = Number(e.currentTarget.dataset.id);
    showVerification(this.data.duplicates.find((club) => club.id === id));
  },
  create() {
    if (!this.editable() || this.data.logoPreparing) return Promise.resolve();
    const name = String(this.data.name || "").trim(), city = String(this.data.city || "").trim(), intro = String(this.data.intro || "").trim();
    if (!name || !city) { this.setData({ foundingMessage: "填写跑团名称和活动城市，即可创建。" }); return Promise.resolve(); }
    const token = accountKey(), seq = this.createSeq = (this.createSeq || 0) + 1;
    if (!this._createRequestId) this._createRequestId = "mini-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 14);
    const payload = { name, city, intro, requestId: this._createRequestId };
    if (this.data.logoChanged && this.data.logo) payload.logo = this.data.logo;
    if (this.data.applicationId) payload.applicationId = this.data.applicationId;
    this.setData({ creating: true, foundingMessage: "" });
    return request("/clubs", "POST", payload).then((data) => {
      if (!this.scopeCurrent(token) || seq !== this.createSeq) return;
      if (!data.club || !data.club.id) throw new Error("未能确认创建结果，请重试。");
      this._createRequestId = "";
      this.setData({ ...EMPTY });
      wx.redirectTo({ url: "/pages/club/club?id=" + data.club.id + "&created=1" });
    }).catch((err) => {
      if (!this.scopeCurrent(token) || seq !== this.createSeq) return;
      if (err.status === 401) {
        clearAuth(); this._createRequestId = "";
        this.setData({ ...EMPTY, ready: false, loadMessage: err.message });
      } else this.setData({ foundingMessage: err.message });
    }).finally(() => {
      if (this.scopeCurrent(token) && seq === this.createSeq) this.setData({ creating: false });
    });
  }
});
