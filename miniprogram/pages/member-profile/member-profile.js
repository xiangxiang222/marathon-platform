const { request } = require("../../utils/request");
const { RANGES, today, number } = require("../../utils/mileage-board");
const token = () => String((getApp().globalData || {}).token || "");
Page({
  data: { profile: null, ranges: RANGES, range: "month", date: today(), today: today(), loading: true, message: "", editing: false, introduction: "", saving: false, editMessage: "" },
  onLoad(query) { this.clubId = String(query.club || ""); this.userId = String(query.user || ""); this._alive = true; this.setData({ range: RANGES.some(r => r.id === query.range) ? query.range : "month", date: /^\d{4}-\d{2}-\d{2}$/.test(query.date || "") && query.date <= today() ? query.date : today() }); wx.hideShareMenu(); },
  onShow() { this._alive = true; this.load(); },
  onHide() { this._alive = false; this._ticket = (this._ticket || 0) + 1; },
  onUnload() { this.onHide(); },
  scope() { return { account: token(), ticket: this._ticket, club: this.clubId, user: this.userId }; },
  current(s) { return this._alive && s.account === token() && s.ticket === this._ticket && s.club === this.clubId && s.user === this.userId; },
  async load() {
    this._ticket = (this._ticket || 0) + 1;
    if (this._account !== token()) this.setData({ profile: null, editing: false, introduction: "", editMessage: "" });
    this._account = token(); const scope = this.scope(); this.setData({ loading: true, message: "", saving: false });
    try {
      const data = await request("/clubs/" + encodeURIComponent(this.clubId) + "/members/" + encodeURIComponent(this.userId) + "/profile?range=" + this.data.range + "&date=" + this.data.date);
      if (!this.current(scope)) return;
      const stats = data.stats || {}, runs = (data.recentRuns || []).map(r => ({ ...r, day: r.startedAt.slice(5, 10).replace("-", "/"), time: r.startedAt.slice(11, 16), kmLabel: number(r.km) }));
      this.setData({ profile: { ...data, initial: String(data.user.nickname || "跑").slice(0, 1), joinedLabel: String(data.user.joinedAt || "").slice(0, 10).replace(/-/g, "."), allKm: number(data.mileage.all && data.mileage.all.km), stats: { ...stats, kmLabel: number(stats.km), hours: number((stats.durationSec || 0) / 3600) }, recentRuns: runs }, ...(!this.data.editing ? { introduction: data.user.introduction || "" } : {}) });
    } catch (err) { if (this.current(scope)) this.setData({ message: err.message, profile: null }); }
    finally { if (this.current(scope)) this.setData({ loading: false }); }
  },
  pickRange(e) { if (this.data.saving) return; const range = e.currentTarget.dataset.range; if (RANGES.some(r => r.id === range)) { this.setData({ range }); this.load(); } },
  pickDate(e) { if (this.data.saving || e.detail.value > today()) return; this.setData({ date: e.detail.value }); this.load(); },
  editIntroduction() { if (this.data.profile && this.data.profile.mine) this.setData({ editing: true, editMessage: "" }); },
  inputIntroduction(e) { this.setData({ introduction: e.detail.value }); },
  cancelEdit() { if (!this.data.saving) this.setData({ editing: false, introduction: this.data.profile.user.introduction || "", editMessage: "" }); },
  async saveIntroduction() {
    if (!this.data.profile || !this.data.profile.mine || this.data.saving) return;
    if ([...this.data.introduction].length > 300) return this.setData({ editMessage: "个人介绍最多 300 字" });
    const scope = this.scope(); this.setData({ saving: true, editMessage: "" });
    try { const data = await request("/me/introduction", "PUT", { introduction: this.data.introduction.trim() }); if (this.current(scope)) this.setData({ "profile.user.introduction": data.introduction, introduction: data.introduction, editing: false, saving: false }); }
    catch (err) { if (this.current(scope)) this.setData({ editMessage: err.message, saving: false }); }
  }
});
