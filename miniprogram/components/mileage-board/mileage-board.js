const { request } = require("../../utils/request");
const { RANGES, today, shiftDate, canAdvance, decorate } = require("../../utils/mileage-board");
function token() { const app = getApp(); return app && app.globalData ? String(app.globalData.token || "") : ""; }
Component({
  properties: { clubId: { type: String, value: "" }, embedded: { type: Boolean, value: false } },
  data: { ranges: RANGES, range: "month", date: today(), today: today(), groupId: "", board: null, shownRank: [], mine: null, query: "", loading: true, message: "", selectedName: "全员", canNext: false },
  observers: { clubId() { if (this._alive) { this.setData({ groupId: "", board: null, shownRank: [], mine: null, query: "" }); this.load(); } } },
  lifetimes: {
    attached() { this._alive = true; this._token = token(); this.load(); },
    detached() { this._alive = false; this._ticket = (this._ticket || 0) + 1; }
  },
  pageLifetimes: { show() {
    if (!this._alive) return;
    if (this._token !== token()) this.setData({ board: null, shownRank: [], mine: null, groupId: "", query: "" });
    this._token = token(); this.load();
  }, hide() { this._ticket = (this._ticket || 0) + 1; } },
  methods: {
    async load() {
      if (!this.properties.clubId || !this._alive) return;
      const ticket = this._ticket = (this._ticket || 0) + 1;
      const club = String(this.properties.clubId), account = token();
      const current = () => this._alive && ticket === this._ticket && club === String(this.properties.clubId) && account === token();
      const { range, date, groupId } = this.data;
      this.setData({ loading: true, message: "" });
      try {
        const result = await request("/clubs/" + encodeURIComponent(club) + "/mileage/board?range=" + range + "&date=" + date + (groupId === "" ? "" : "&groupId=" + encodeURIComponent(groupId)));
        if (!current()) return;
        const board = decorate(result);
        const group = board.groups.find(g => String(g.id) === String(groupId));
        this.setData({ board, mine: board.rank.find(r => r.mine) || null, selectedName: groupId === "" ? "全员" : groupId === "0" ? "未分组" : group ? group.name : "训练组", canNext: canAdvance(date, range) });
        this.filterRank();
      } catch (err) {
        if (current() && err.status === 404 && groupId !== "") { this.setData({ groupId: "", query: "" }); return this.load(); }
        if (current()) this.setData({ board: null, shownRank: [], mine: null, message: err.message || "跑量暂时无法载入，请重试" });
      } finally { if (current()) this.setData({ loading: false }); }
    },
    pickRange(e) {
      const range = e.currentTarget.dataset.range;
      if (!RANGES.some(r => r.id === range)) return;
      this.setData({ range }); this.load();
    },
    pickGroup(e) { this.setData({ groupId: String(e.currentTarget.dataset.id), query: "" }); this.load(); },
    pickDate(e) { if (!/^\d{4}-\d{2}-\d{2}$/.test(e.detail.value) || e.detail.value > today()) return; this.setData({ date: e.detail.value }); this.load(); },
    changePeriod(e) {
      if (this.data.range === "all") return;
      const direction = Number(e.currentTarget.dataset.direction);
      if (![1, -1].includes(direction) || (direction === 1 && !canAdvance(this.data.date, this.data.range))) return;
      const shifted = shiftDate(this.data.date, this.data.range, direction), next = shifted > today() ? today() : shifted;
      this.setData({ date: next }); this.load();
    },
    resetDate() { this.setData({ date: today() }); this.load(); },
    onQuery(e) { this.setData({ query: e.detail.value }); this.filterRank(); },
    filterRank() { const q = this.data.query.trim().toLowerCase(); this.setData({ shownRank: ((this.data.board || {}).rank || []).filter(r => !q || String(r.nickname).toLowerCase().includes(q)) }); },
    openMember(e) { wx.navigateTo({ url: "/pages/member-profile/member-profile?club=" + encodeURIComponent(this.properties.clubId) + "&user=" + encodeURIComponent(e.currentTarget.dataset.id) + "&range=" + this.data.range + "&date=" + this.data.date }); },
    openGroups() { wx.navigateTo({ url: "/pages/training-groups/training-groups?club=" + encodeURIComponent(this.properties.clubId) }); },
    openTools() { wx.navigateTo({ url: "/pages/mileage/mileage?id=" + encodeURIComponent(this.properties.clubId) + "&tools=1" }); }
  }
});
