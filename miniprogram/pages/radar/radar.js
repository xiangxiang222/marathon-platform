const { request, ready } = require("../../utils/request");
const distances = [{ key: "full", label: "全马" }, { key: "half", label: "半马" }, { key: "10k", label: "10 公里" }, { key: "5k", label: "5 公里" }];
function decorate(row) {
  const gap = row.gap, seconds = Math.abs(gap || 0);
  const duration = (seconds >= 60 ? Math.floor(seconds / 60) + "分" : "") + (seconds % 60 || seconds < 60 ? seconds % 60 + "秒" : "");
  return { ...row, timingLabel: row.timing === "gun" ? "枪声成绩" : "净计时", gapLabel: gap == null ? "待补充成绩资料" : gap === 0 ? "与历史参考线相同" : "比参考线" + (gap > 0 ? "快 " : "慢 ") + duration,
    entrants: ((row.competition && row.competition.entrants) || []).map(item => ({ ...item, evidenceLabel: item.evidence === "verified" ? "已核验资料" : "选手自报" })),
    historyLabel: row.history && row.history.sampleCount ? "近 " + row.history.sampleCount + " 届奖励线参考" : "历史奖励线待补充" };
}
Page({
  data: { loggedIn: false, loading: false, busy: false, ready: false, gender: "", birth: "", province: "", targets: {}, distance: "full", distances, target: "", rows: [], filtered: [], filter: "all", message: "", note: "", selected: null, selectedYear: 0, yearRows: [], yearSource: "", yearTiming: "", entryOpen: false, entryClock: "", entryDate: "", entryStatuses: ["中签", "已缴费", "已领物"], entryStatusIndex: 0, consent: false, entryMessage: "" },
  onLoad(options) { this._raceId = options && options.raceId; },
  onShow() { return this.load(); },
  async load() {
    const sequence = (this._loadSequence || 0) + 1; this._loadSequence = sequence;
    if (!ready()) { this.setData({ loggedIn: false, rows: [], filtered: [], selected: null, loading: false, message: "" }); return; }
    this.setData({ loggedIn: true, loading: true, message: "" });
    try {
      const data = await request("/radar"); if (!ready() || sequence !== this._loadSequence) return;
      const profile = data.profile || {}, rows = (data.opportunities || []).map(decorate);
      const selected = this.data.selected && rows.find(row => row.id === this.data.selected.id);
      this.setData({ gender: profile.gender || "", birth: profile.birth || "", province: profile.province || "", targets: profile.targets || {}, target: (profile.targets || {})[this.data.distance] || "", rows, selected: selected || null, note: data.note || "", ready: true, loading: false });
      this.filterRows(); if (selected) this.showYear(this.data.selectedYear);
      if (this._raceId) { const row = rows.find(item => item.race.id === this._raceId && item.distance === this.data.distance) || rows.find(item => item.race.id === this._raceId); this._raceId = ""; if (row) this.openRow(row); }
    } catch (err) { if (sequence !== this._loadSequence) return; if (err.status === 401) this.setData({ loggedIn: false, rows: [], filtered: [], selected: null }); this.setData({ message: err.message, loading: false }); }
  },
  setGender(e) { this.setData({ gender: e.currentTarget.dataset.gender }); this.filterRows(); },
  setDistance(e) { const distance = e.currentTarget.dataset.distance; this.setData({ distance, target: this.data.targets[distance] || "" }); this.filterRows(); },
  onTarget(e) { this.setData({ target: e.detail.value }); },
  setFilter(e) { this.setData({ filter: e.currentTarget.dataset.filter }); this.filterRows(); },
  filterRows() { const filtered = this.data.rows.filter(row => row.distance === this.data.distance && (!this.data.gender || row.gender === this.data.gender) && (this.data.filter !== "opportunity" || ["priority", "challenge"].includes(row.level))); this.setData({ filtered }); },
  async save() {
    if (this.data.busy) return; if (!this.data.gender) { this.setData({ message: "先选择男子组或女子组。" }); return; }
    this.setData({ busy: true, message: "" });
    try { const targets = { ...this.data.targets, [this.data.distance]: this.data.target.trim() }; await request("/me/radar", "PUT", { gender: this.data.gender, birth: this.data.birth, province: this.data.province, targets }); this.setData({ filter: "opportunity" }); await this.load(); }
    catch (err) { this.setData({ message: err.message }); } finally { this.setData({ busy: false }); }
  },
  openDetail(e) { const row = this.data.rows.find(item => item.id === e.currentTarget.dataset.id); if (row) this.openRow(row); },
  openRow(row) { this.setData({ selected: row, entryOpen: false, entryMessage: "", consent: false }); this.showYear(row.histories.length ? row.histories[0].year : 0); wx.pageScrollTo({ scrollTop: 0, duration: 0 }); },
  closeDetail() { this.setData({ selected: null, entryOpen: false }); },
  chooseYear(e) { this.showYear(Number(e.currentTarget.dataset.year)); },
  showYear(year) {
    const row = this.data.selected; if (!row) return;
    const history = row.histories.find(item => item.year === year) || row.histories[0], recorded = history ? history.rows : [];
    const yearRows = Array.from({ length: 8 }, (_, index) => { const place = index + 1, result = recorded.find(item => item.place === place); return { place, name: result ? result.name : "未收录", clock: result ? result.clock : "—", rewarded: place <= row.awardDepth }; });
    this.setData({ selectedYear: history ? history.year : 0, yearRows, yearSource: history ? history.source : "", yearTiming: history ? history.timing === "gun" ? "枪声成绩" : "净计时" : "" });
  },
  openEntry() { const own = this.data.selected.myEntry; this.setData({ entryOpen: true, entryClock: own ? own.clock : "", entryDate: own ? own.pbDate : "", entryStatusIndex: Math.max(0, this.data.entryStatuses.indexOf(own ? own.status : "中签")), consent: false, entryMessage: "" }); },
  onEntryClock(e) { this.setData({ entryClock: e.detail.value }); },
  onEntryDate(e) { this.setData({ entryDate: e.detail.value }); },
  onEntryStatus(e) { this.setData({ entryStatusIndex: Number(e.detail.value) }); },
  onConsent(e) { this.setData({ consent: e.detail.value.indexOf("agree") >= 0 }); },
  async saveEntry() {
    if (this.data.busy) return; if (!this.data.consent) { this.setData({ entryMessage: "请先确认匿名展示的内容。" }); return; }
    this.setData({ busy: true, entryMessage: "" });
    try { const row = this.data.selected; await request("/me/radar/entries/" + encodeURIComponent(row.race.id), "PUT", { distance: row.distance, gender: row.gender, clock: this.data.entryClock, pbDate: this.data.entryDate, status: this.data.entryStatuses[this.data.entryStatusIndex], consent: true }); await this.load(); this.setData({ entryOpen: false }); }
    catch (err) { this.setData({ entryMessage: err.message }); } finally { this.setData({ busy: false }); }
  },
  async withdrawEntry() {
    if (this.data.busy) return; this.setData({ busy: true, entryMessage: "" });
    try { await request("/me/radar/entries/" + encodeURIComponent(this.data.selected.race.id), "DELETE"); await this.load(); this.setData({ entryOpen: false }); }
    catch (err) { this.setData({ entryMessage: err.message }); } finally { this.setData({ busy: false }); }
  }
});
