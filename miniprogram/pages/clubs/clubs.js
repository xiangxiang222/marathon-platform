const { request, ready } = require("../../utils/request");
const { publicClub, showVerification } = require("../../utils/club-identity");
function accountKey() {
  const app = typeof getApp === "function" ? getApp() : null;
  return app && app.globalData ? String(app.globalData.token || "") : "";
}
const PRIVATE_EMPTY = {
  leader: false, clubs: [], shownClubs: [], mineQuery: "", mineExpanded: false, mineLoaded: false, mineSearching: false, mineMatchCount: 0, openClubs: [], application: null, directoryPage: 0, directoryPages: 0, directoryTotal: 0,
  directoryBusy: false, more: 0, query: "", searchCity: "", code: ""
};
Page({
  data: { ...PRIVATE_EMPTY, ready: false, mode: "search", loaded: false, message: "" },
  onShow() {
    this._disposed = false;
    this._hidden = false;
    const token = accountKey();
    if (this._account !== token) {
      this.invalidate();
      this.setData({ ...PRIVATE_EMPTY, loaded: false, message: "" });
    }
    this._account = token;
    this.setData({ ready: ready(), directoryBusy: false });
    if (ready()) this.load();
  },
  invalidate() {
    this.loadSeq = (this.loadSeq || 0) + 1;
    this.directorySeq = (this.directorySeq || 0) + 1;
    clearTimeout(this.queryTimer);
  },
  onHide() { this._hidden = true; this.invalidate(); },
  onUnload() { this._disposed = true; this.invalidate(); },
  scopeCurrent(token) { return !this._disposed && !this._hidden && ready() && token === accountKey(); },
  onMineQuery(e) { this.setData({ mineQuery: e.detail.value }); this.filterMine(); },
  filterMine() {
    const query = String(this.data.mineQuery || "").trim().toLowerCase();
    const words = query.split(/\s+/).filter(Boolean);
    const matches = this.data.clubs.filter((club) => {
      const terms = [club.name, club.city, club.cityLabel, club.leader, club.roleLabel, club.id ? "#" + club.id : ""].filter(Boolean).join(" ").toLowerCase();
      return words.every((word) => terms.includes(word));
    });
    this.setData({ shownClubs: query || this.data.mineExpanded ? matches : matches.slice(0, 4), mineSearching: !!query, mineMatchCount: matches.length });
  },
  toggleMineExpanded() {
    if (this._account !== accountKey()) { this.onShow(); return; }
    this.setData({ mineExpanded: !this.data.mineExpanded }); this.filterMine();
  },
  clubLogoError(e) {
    if (this._account !== accountKey() || this._hidden || this._disposed) return;
    const id = Number(e.currentTarget.dataset.id), src = e.currentTarget.dataset.src;
    const mark = club => club.id === id && club.logo === src ? { ...club, logoFailed: true } : club;
    this.setData({ clubs: this.data.clubs.map(mark), openClubs: this.data.openClubs.map(mark) }); this.filterMine();
  },
  openCreate() {
    const continuing = this._account === accountKey() && this.data.application;
    wx.navigateTo({ url: "/pages/club-create/club-create" + (continuing ? "?continue=1" : "") });
  },
  openClub(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (id) wx.navigateTo({ url: "/pages/club-intro/club-intro?id=" + id });
  },
  verifiedInfo(e) {
    const id = Number(e.currentTarget.dataset.id);
    showVerification(this.data.openClubs.concat(this.data.clubs).find((club) => club.id === id));
  },
  onCode(e) { this.setData({ code: e.detail.value }); },
  onQuery(e) {
    this.setData({ query: e.detail.value, openClubs: [], more: 0, message: "", directoryBusy: false });
    this.directorySeq = (this.directorySeq || 0) + 1;
    clearTimeout(this.queryTimer);
    this.queryTimer = setTimeout(() => this.loadDirectory(false), 200);
  },
  onSearchCity(e) { this.setData({ searchCity: e.detail.value }); },
  clearSearchCity() { this.setData({ searchCity: "" }); return this.search(); },
  showRest() { return this.loadDirectory(true); },
  pickMode(e) { this.setData({ mode: e.currentTarget.dataset.mode, message: "" }); },
  load() {
    if (!ready() || this._disposed || this._hidden) return Promise.resolve();
    const token = accountKey();
    if (this._account !== token) {
      this.invalidate(); this._account = token;
      this.setData({ ...PRIVATE_EMPTY, ready: true, loaded: false, message: "" });
    }
    const seq = this.loadSeq = (this.loadSeq || 0) + 1;
    const mine = request("/me").then((data) => {
      if (!this.scopeCurrent(token) || seq !== this.loadSeq) return;
      this.setData({ clubs: (data.clubs || []).map(publicClub), mineLoaded: true, application: (data.applications || []).find((item) => !item.status || item.status === "pending") || null, loaded: true });
      this.filterMine();
    }).catch((err) => {
      if (!this.scopeCurrent(token) || seq !== this.loadSeq) return;
      if (err.status === 401 || err.status === 403) { this.setData({ ...PRIVATE_EMPTY }); }
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
  join() {
    const code = String(this.data.code || "").trim();
    if (!code) { this.setData({ message: "填口令" }); return; }
    wx.navigateTo({ url: "/pages/club-intro/club-intro?code=" + encodeURIComponent(code) });
  },
  apply(e) { this.openClub(e); }
});
