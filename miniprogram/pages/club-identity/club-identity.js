const { request, ready } = require("../../utils/request");
function accountKey() {
  const app = typeof getApp === "function" ? getApp() : null;
  return app && app.globalData ? String(app.globalData.token || "") : "";
}
const EMPTY = { club: null, verification: null, organization: "", scope: "", sourceUrl: "", evidence: "", contact: "", profileName: "", profileCity: "", profileIntro: "", moderationNote: "", message: "", saving: false, loaded: false };
const STATUS = { pending: "待核验", supplement: "待补充", needs_info: "待补充", verified: "已核验", rejected: "未通过", revoked: "已撤销", review: "复核中" };
Page({
  data: { ...EMPTY, ready: false, loading: true, statusLabel: "未申请" },
  onLoad(query = {}) { this.clubId = String(query.id || ""); this.disposed = false; this.hidden = false; },
  onShow() {
    this.hidden = false;
    const token = accountKey();
    if (token !== this.account) this.setData({ ...EMPTY, statusLabel: "未申请" });
    this.account = token;
    this.setData({ ready: ready(), saving: false });
    if (ready()) return this.load();
    this.setData({ loading: false });
  },
  onHide() { this.hidden = true; this.version = (this.version || 0) + 1; },
  onUnload() { this.disposed = true; this.version = (this.version || 0) + 1; this.setData({ ...EMPTY }); },
  current(token, version) { return !this.disposed && !this.hidden && ready() && token === accountKey() && version === this.version; },
  load() {
    if (!ready() || this.disposed || this.hidden) return Promise.resolve();
    const token = accountKey(); const version = this.version = (this.version || 0) + 1;
    this.setData({ loading: true, message: "" });
    return request("/clubs/" + encodeURIComponent(this.clubId) + "/identity").then((data) => {
      if (!this.current(token, version)) return;
      const item = data.verification || {};
      this.setData({ club: data.club, verification: data.verification || null, statusLabel: STATUS[item.status] || (item.status ? "处理中" : "未申请"), organization: item.organization || data.club.name || "", scope: item.scope || data.club.city || "", sourceUrl: item.sourceUrl || "", evidence: item.evidence || "", contact: item.contact || "", profileName: data.club.name || "", profileCity: data.club.city || "", profileIntro: data.club.intro || "", moderationNote: data.moderationNote || "", loaded: true });
    }).catch((err) => {
      if (!this.current(token, version)) return;
      this.setData({ ...EMPTY, message: err.message });
    }).finally(() => { if (this.current(token, version)) this.setData({ loading: false }); });
  },
  onField(e) {
    if (this.data.saving) return;
    const key = e.currentTarget.dataset.key;
    if (["organization", "scope", "sourceUrl", "evidence", "contact", "profileName", "profileCity", "profileIntro"].includes(key)) this.setData({ [key]: e.detail.value, message: "" });
  },
  saveProfile() {
    if (!ready() || !this.data.club || this.data.saving || this.hidden || this.disposed) return Promise.resolve();
    if (this.account !== accountKey()) { this.onShow(); return Promise.resolve(); }
    const name = String(this.data.profileName || "").trim();
    const city = String(this.data.profileCity || "").trim();
    const intro = String(this.data.profileIntro || "").trim();
    if (!name || !city) { this.setData({ message: "请填写跑团名称和活动城市。跨城或线上团可直接填写“跨城”或“线上”。" }); return Promise.resolve(); }
    const token = accountKey(); const version = this.version = (this.version || 0) + 1;
    this.setData({ saving: true, message: "" });
    return request("/clubs/" + encodeURIComponent(this.clubId) + "/profile", "PUT", { name, city, intro }).then(() => {
      if (!this.current(token, version)) return;
      this.setData({ saving: false });
      return this.load();
    }).catch((err) => { if (this.current(token, version)) this.setData({ saving: false, message: err.message }); });
  },
  submit() {
    if (!ready() || !this.data.club || this.data.saving || this.hidden || this.disposed) return Promise.resolve();
    if (this.account !== accountKey()) { this.onShow(); return Promise.resolve(); }
    const payload = {};
    ["organization", "scope", "sourceUrl", "evidence", "contact"].forEach((key) => { payload[key] = String(this.data[key] || "").trim(); });
    if (!payload.organization || !payload.scope || (!payload.evidence && !payload.sourceUrl) || !payload.contact) {
      this.setData({ message: "请填写组织名称、活动范围和私密联系方式，并提供公共来源链接或管理授权说明。" }); return Promise.resolve();
    }
    const token = accountKey(); const version = this.version = (this.version || 0) + 1;
    this.setData({ saving: true, message: "" });
    return request("/clubs/" + encodeURIComponent(this.clubId) + "/identity", "POST", payload).then((data) => {
      if (!this.current(token, version)) return;
      const item = data.verification || { ...payload, status: "pending" };
      this.setData({ verification: item, statusLabel: STATUS[item.status] || "待核验", message: "材料已私密提交，可在此查看进度与补充要求。" });
    }).catch((err) => {
      if (this.current(token, version)) this.setData({ message: err.message });
    }).finally(() => { if (this.current(token, version)) this.setData({ saving: false }); });
  }
});
