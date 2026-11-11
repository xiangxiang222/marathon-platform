const { request } = require("../../utils/request");
const { COLORS } = require("../../utils/mileage-board");
const token = () => String((getApp().globalData || {}).token || "");
const blank = () => ({ name: "", pace: "", description: "", capacity: "0", sort: "0" });
Page({
  data: { groups: [], members: [], shownMembers: [], options: [], optionNames: [], staff: false, loading: true, busy: false, query: "", message: "", sheetOpen: false, editingId: 0, draft: blank(), sheetMessage: "" },
  onLoad(query) { this.clubId = String(query.club || ""); this._alive = true; wx.hideShareMenu(); },
  onShow() { this._alive = true; this.load(); },
  onHide() { this._alive = false; this._ticket = (this._ticket || 0) + 1; },
  onUnload() { this.onHide(); },
  scope() { return { club: this.clubId, account: token(), ticket: this._ticket }; },
  current(s) { return this._alive && s.club === this.clubId && s.account === token() && s.ticket === this._ticket; },
  async load() {
    this._ticket = (this._ticket || 0) + 1;
    if (this._account !== token()) this.setData({ groups: [], members: [], shownMembers: [], staff: false, sheetOpen: false, query: "", draft: blank() });
    this._account = token();
    const scope = this.scope(); this.setData({ loading: true, message: "", busy: false });
    try {
      const data = await request("/clubs/" + encodeURIComponent(this.clubId) + "/training-groups");
      if (!this.current(scope)) return;
      const groups = (data.groups || []).map((g, i) => ({ ...g, mark: String(g.name).slice(0, 1), color: COLORS[i % COLORS.length] }));
      const options = [{ id: 0, name: "未分组" }].concat(groups);
      const members = (data.members || []).map(m => ({ ...m, initial: String(m.nickname || "跑").slice(0, 1), optionIndex: Math.max(0, options.findIndex(g => g.id === m.groupId)) }));
      this.setData({ groups, options, optionNames: options.map(g => g.name), members, staff: !!data.staff }); this.filterMembers();
    } catch (err) { if (this.current(scope)) this.setData({ message: err.message, groups: [], members: [], shownMembers: [], staff: false }); }
    finally { if (this.current(scope)) this.setData({ loading: false }); }
  },
  newGroup() { if (!this.data.staff || this.data.busy) return; this.setData({ sheetOpen: true, editingId: 0, draft: { ...blank(), sort: String(this.data.groups.length) }, sheetMessage: "" }); },
  editGroup(e) { const g = this.data.groups.find(r => String(r.id) === String(e.currentTarget.dataset.id)); if (!g || !this.data.staff || this.data.busy) return; this.setData({ sheetOpen: true, editingId: g.id, draft: { name: g.name, pace: g.pace, description: g.description, capacity: String(g.capacity), sort: String(g.sort) }, sheetMessage: "" }); },
  input(e) { const key = e.currentTarget.dataset.key; if (Object.prototype.hasOwnProperty.call(blank(), key)) this.setData({ ["draft." + key]: e.detail.value }); },
  closeSheet() { if (!this.data.busy) this.setData({ sheetOpen: false }); },
  noop() {},
  async saveGroup() {
    if (this.data.busy || !this.data.staff) return;
    const d = this.data.draft, name = d.name.trim();
    if (!name || [...name].length > 20) return this.setData({ sheetMessage: "组名请填 1 到 20 个字" });
    if (!Number.isInteger(Number(d.capacity)) || Number(d.capacity) < 0 || Number(d.capacity) > 500 || !Number.isSafeInteger(Number(d.sort)) || Number(d.sort) < 0) return this.setData({ sheetMessage: "人数上限请填 0 到 500，排序请填非负整数" });
    const scope = this.scope(); this.setData({ busy: true, sheetMessage: "" });
    try {
      await request("/clubs/" + encodeURIComponent(this.clubId) + "/training-groups" + (this.data.editingId ? "/" + this.data.editingId : ""), this.data.editingId ? "PUT" : "POST", { name, pace: d.pace.trim(), description: d.description.trim(), capacity: Number(d.capacity), sort: Number(d.sort) });
      if (!this.current(scope)) return;
      this.setData({ sheetOpen: false, busy: false }); wx.showToast({ title: "训练组已保存", icon: "success" }); this.load();
    } catch (err) { if (this.current(scope)) this.setData({ sheetMessage: err.message, busy: false }); }
  },
  removeGroup(e) {
    const g = this.data.groups.find(r => String(r.id) === String(e.currentTarget.dataset.id));
    if (!g || !this.data.staff || this.data.busy) return;
    const scope = this.scope();
    wx.showModal({ title: "删除「" + g.name + "」？", content: "组员会变为未分组，跑量记录和已发布的活动安排会保留。", confirmColor: "#e1251b", success: async result => {
      if (!result.confirm || !this.current(scope)) return;
      this.setData({ busy: true, message: "" });
      try { await request("/clubs/" + encodeURIComponent(this.clubId) + "/training-groups/" + g.id, "DELETE"); if (this.current(scope)) { this.setData({ busy: false }); this.load(); } }
      catch (err) { if (this.current(scope)) this.setData({ busy: false, message: err.message }); }
    } });
  },
  onQuery(e) { this.setData({ query: e.detail.value }); this.filterMembers(); },
  filterMembers() { const q = this.data.query.trim().toLowerCase(); this.setData({ shownMembers: this.data.members.filter(m => !q || m.nickname.toLowerCase().includes(q)) }); },
  async assignMember(e) {
    if (!this.data.staff || this.data.busy) return;
    const option = this.data.options[Number(e.detail.value)]; if (!option) return;
    const scope = this.scope(); this.setData({ busy: true, message: "" });
    try { await request("/clubs/" + encodeURIComponent(this.clubId) + "/training-groups/members/" + encodeURIComponent(e.currentTarget.dataset.id), "PUT", { groupId: option.id }); if (this.current(scope)) { this.setData({ busy: false }); this.load(); } }
    catch (err) { if (this.current(scope)) this.setData({ busy: false, message: err.message }); }
  },
  openMember(e) { wx.navigateTo({ url: "/pages/member-profile/member-profile?club=" + encodeURIComponent(this.clubId) + "&user=" + encodeURIComponent(e.currentTarget.dataset.id) }); }
});
