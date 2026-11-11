const { request } = require("../../utils/request");
const { RANGES, today, canAdvance, shiftDate } = require("../../utils/mileage-board");
const { TABS, RACE_FILTERS, decorate } = require("../../utils/member-profile");
const token = () => String((getApp().globalData || {}).token || "");
Page({
  data: { profile: null, tabs: TABS, activeTab: "profile", raceFilters: RACE_FILTERS, raceFilter: "all", shownRaces: [], ranges: RANGES, range: "month", date: today(), today: today(), canNext: false, loading: true, message: "", editing: false, introduction: "", saving: false, editMessage: "" },
  onLoad(query) { this.clubId = String(query.club || ""); this.userId = String(query.user || ""); this._alive = true; this.setData({ activeTab: TABS.some(t => t.id === query.tab) ? query.tab : "profile", range: RANGES.some(r => r.id === query.range) ? query.range : "month", date: /^\d{4}-\d{2}-\d{2}$/.test(query.date || "") && query.date <= today() ? query.date : today() }); wx.hideShareMenu(); },
  onShow() { this._alive = true; this.load(); },
  onHide() { this._alive = false; this._ticket = (this._ticket || 0) + 1; },
  onUnload() { this.onHide(); },
  scope() { return { account: token(), ticket: this._ticket, club: this.clubId, user: this.userId }; },
  current(s) { return this._alive && s.account === token() && s.ticket === this._ticket && s.club === this.clubId && s.user === this.userId; },
  async load() {
    this._ticket = (this._ticket || 0) + 1;
    if (this._account !== token()) this.setData({ profile: null, shownRaces: [], editing: false, introduction: "", editMessage: "" });
    this._account = token(); const scope = this.scope(); this.setData({ loading: true, message: "", saving: false });
    try {
      const data = await request("/clubs/" + encodeURIComponent(this.clubId) + "/members/" + encodeURIComponent(this.userId) + "/profile?range=" + this.data.range + "&date=" + this.data.date);
      if (!this.current(scope)) return;
      this.setData({ profile: decorate(data), canNext: canAdvance(this.data.date, this.data.range), ...(!this.data.editing ? { introduction: data.user.introduction || "" } : {}) });
      this.filterRaces();
    } catch (err) { if (this.current(scope)) this.setData({ message: err.message, profile: null, shownRaces: [] }); }
    finally { if (this.current(scope)) this.setData({ loading: false }); }
  },
  pickRange(e) { if (this.data.saving) return; const range = e.currentTarget.dataset.range; if (RANGES.some(r => r.id === range)) { this.setData({ range }); this.load(); } },
  pickDate(e) { if (this.data.saving || e.detail.value > today()) return; this.setData({ date: e.detail.value }); this.load(); },
  changePeriod(e) {
    const direction = Number(e.currentTarget.dataset.direction);
    if (this.data.saving || this.data.range === "all" || ![-1, 1].includes(direction) || (direction === 1 && !canAdvance(this.data.date, this.data.range))) return;
    const shifted = shiftDate(this.data.date, this.data.range, direction);
    this.setData({ date: shifted > today() ? today() : shifted }); this.load();
  },
  pickTab(e) { const id = e.currentTarget.dataset.tab; if (TABS.some(t => t.id === id)) this.setData({ activeTab: id }); },
  pickRaceFilter(e) { const id = e.currentTarget.dataset.id; if (!RACE_FILTERS.some(f => f.id === id)) return; this.setData({ raceFilter: id }); this.filterRaces(); },
  filterRaces() { this.setData({ shownRaces: ((this.data.profile || {}).races || []).filter(r => this.data.raceFilter === "all" || r.category === this.data.raceFilter) }); },
  openRace(e) { wx.navigateTo({ url: "/pages/race/race?id=" + encodeURIComponent(e.currentTarget.dataset.id) }); },
  previewPhoto(e) { const photos = (this.data.profile || {}).photos || [], photo = photos.find(p => String(p.id) === String(e.currentTarget.dataset.id)); if (photo) wx.previewImage({ current: photo.src, urls: photos.map(p => p.src) }); },
  openAlbum(e) { wx.navigateTo({ url: "/pages/album/album?club=" + encodeURIComponent(this.clubId) + "&id=" + encodeURIComponent(e.currentTarget.dataset.id) }); },
  openGroups() { wx.navigateTo({ url: "/pages/training-groups/training-groups?club=" + encodeURIComponent(this.clubId) }); },
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
