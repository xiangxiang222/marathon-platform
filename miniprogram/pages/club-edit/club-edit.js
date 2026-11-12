const { request, ready, clearAuth } = require("../../utils/request");
const { networkAvatar } = require("../../utils/avatar");
const { logoData, logoMethods } = require("../../utils/club-logo");
const EMPTY = { ...logoData, club: null, owner: false, name: "", city: "", intro: "", logoInitial: "团", loading: false, saving: false, message: "" };
function accountKey() { const app = getApp(); return String(app && app.globalData && app.globalData.token || ""); }
Page({
  ...logoMethods,
  data: { ...EMPTY, ready: false },
  onLoad(query = {}) { this.clubId = /^\d+$/.test(query.id || "") ? String(query.id) : ""; },
  onShow() {
    this._hidden = false; this._disposed = false;
    const token = accountKey();
    if (this._account !== token) { this.invalidate(); this._draftLoaded = false; this.setData({ ...EMPTY }); }
    this._account = token;
    this.setData({ ready: ready(), saving: false, logoPreparing: false });
    return this.load();
  },
  invalidate() { this._version = (this._version || 0) + 1; this.invalidateLogo(); },
  onHide() { this._hidden = true; this.invalidate(); },
  onUnload() { this._disposed = true; this.invalidate(); },
  scopeCurrent(token) { return !this._hidden && !this._disposed && ready() && token === accountKey(); },
  editable() {
    if (this._account !== accountKey()) { this.onShow(); return false; }
    return this.scopeCurrent(this._account) && this.data.owner && !this.data.saving && !this.data.loading;
  },
  load() {
    if (this._account !== accountKey()) return this.onShow();
    if (!this.scopeCurrent(this._account)) return Promise.resolve();
    if (!this.clubId) { this.setData({ message: "没有找到这个跑团，请返回后重试。" }); return Promise.resolve(); }
    const token = this._account, version = this._version = (this._version || 0) + 1;
    this.setData({ loading: true, message: "" });
    return request("/clubs/" + this.clubId).then((data) => {
      if (!this.scopeCurrent(token) || version !== this._version) return;
      if (!data.club || !data.club.owner) {
        this._draftLoaded = false; this.invalidateLogo();
        this.setData({ ...EMPTY, message: "只有本团团长可以编辑跑团资料。" }); return;
      }
      this.setData({ owner: true, club: data.club });
      if (!this._draftLoaded) {
        const app = getApp(), logo = networkAvatar(data.club.logo, app.globalData.baseUrl);
        this.setData({ name: data.club.name || "", city: data.club.city || "", intro: data.club.intro || "", logo, logoPreview: logo, logoChanged: false, logoFailed: false, logoInitial: String(data.club.name || "团").slice(0, 1) });
        this._draftLoaded = true;
      }
    }).catch((error) => {
      if (!this.scopeCurrent(token) || version !== this._version) return;
      if (error.status === 401 || error.status === 403) {
        if (error.status === 401) clearAuth();
        this._draftLoaded = false; this.invalidateLogo(); this.setData({ ...EMPTY, ready: ready() });
      }
      this.setData({ message: error.message || "暂时无法读取跑团资料，请重试。" });
    }).finally(() => { if (this.scopeCurrent(token) && version === this._version) this.setData({ loading: false }); });
  },
  onField(e) {
    if (!this.editable()) return;
    const key = e.currentTarget.dataset.key;
    if (!["name", "city", "intro"].includes(key)) return;
    this.setData({ [key]: e.detail.value, message: "", ...(key === "name" ? { logoInitial: String(e.detail.value || "团").slice(0, 1) } : {}) });
  },
  save() {
    if (!this.editable() || this.data.logoPreparing) return Promise.resolve();
    const name = this.data.name.trim(), city = this.data.city.trim(), intro = this.data.intro.trim();
    if (!name || !city) { this.setData({ message: "请填写跑团名称和活动城市。" }); return Promise.resolve(); }
    const token = this._account, version = this._version = (this._version || 0) + 1;
    const payload = { name, city, intro };
    if (this.data.logoChanged) payload.logo = this.data.logo;
    this.setData({ saving: true, message: "" });
    return request("/clubs/" + this.clubId, "PUT", payload).then((data) => {
      if (!this.scopeCurrent(token) || version !== this._version) return;
      if (!data.club || String(data.club.id) !== this.clubId) throw new Error("未能确认保存结果，请重试。");
      this.returnToClub();
    }).catch((error) => {
      if (!this.scopeCurrent(token) || version !== this._version) return;
      if (error.status === 401 || error.status === 403) {
        if (error.status === 401) clearAuth();
        this._draftLoaded = false; this.invalidateLogo(); this.setData({ ...EMPTY, ready: ready() });
      }
      this.setData({ message: error.message || "保存失败，请重试。" });
    }).finally(() => { if (this.scopeCurrent(token) && version === this._version) this.setData({ saving: false }); });
  },
  cancel() { if (!this.data.saving) { this.invalidate(); this.returnToClub(); } },
  returnToClub() {
    if (typeof getCurrentPages === "function" && getCurrentPages().length > 1) wx.navigateBack();
    else wx.redirectTo({ url: "/pages/club/club?id=" + this.clubId });
  }
});
