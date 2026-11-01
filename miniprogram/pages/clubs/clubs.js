const { request, ready } = require("../../utils/request");

function accountKey() {
  const app = typeof getApp === "function" ? getApp() : null;
  return app && app.globalData ? String(app.globalData.token || "") : "";
}
const PRIVATE_EMPTY = { clubs: [], shownClubs: [], mineQuery: "", openClubs: [], application: null, leader: false, createOpen: false, name: "", foundingMessage: "", more: 0 };

Page({
  data: { ready: false, name: "", leader: false, application: null, createOpen: false, mode: "search", code: "", query: "", showAll: false, more: 0, clubs: [], shownClubs: [], mineQuery: "", openClubs: [], loaded: false, message: "", foundingMessage: "" },
  onShow() {
    this._disposed = false;
    this._hidden = false;
    const loggedIn = ready();
    this.setData({ ready: loggedIn });
    if (loggedIn) this.load();
    else {
      this.loadSeq = (this.loadSeq || 0) + 1;
      this.setData({ ...PRIVATE_EMPTY, loaded: false, message: "" });
    }
  },
  onMineQuery(e) {
    this.setData({ mineQuery: e.detail.value });
    this.filterMine();
  },
  filterMine() {
    const query = String(this.data.mineQuery || "").trim().toLowerCase();
    this.setData({ shownClubs: (this.data.clubs || []).filter((club) => !query || String(club.name || "").toLowerCase().includes(query)) });
  },
  onHide() { this._hidden = true; this.loadSeq = (this.loadSeq || 0) + 1; clearTimeout(this.queryTimer); },
  onUnload() { this._disposed = true; this.loadSeq = (this.loadSeq || 0) + 1; clearTimeout(this.queryTimer); },
  scopeCurrent(token, seq) { return !this._disposed && !this._hidden && ready() && token === accountKey() && (seq == null || seq === this.loadSeq); },
  toggleCreate() {
    this.setData({ createOpen: !this.data.createOpen });
  },
  openClub(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (id) wx.navigateTo({ url: "/pages/club-intro/club-intro?id=" + id });
  },
  onName(e) {
    this.setData({ name: e.detail.value });
  },
  onCode(e) {
    this.setData({ code: e.detail.value });
  },
  onQuery(e) {
    const query = e.detail.value;
    this.setData({ query, showAll: false, message: "", openClubs: [], more: 0 });
    clearTimeout(this.queryTimer);
    this.queryTimer = setTimeout(() => this.load(query, false), query.trim() ? 200 : 0);
  },
  showRest() {
    this.setData({ showAll: true });
    this.load(this.data.query, true);
  },
  pickMode(e) {
    const mode = e.currentTarget.dataset.mode;
    const message = mode === "search" && (this.data.query || "").trim() && !this.data.openClubs.length ? "没有找到这个跑团" : "";
    this.setData({ mode, message });
  },
  load(query, showAll) {
    if (!ready() || this._disposed || this._hidden) return Promise.resolve();
    const token = accountKey();
    if (this._account != null && this._account !== token) this.setData({ ...PRIVATE_EMPTY, loaded: false, message: "" });
    this._account = token;
    const q = String(query != null ? query : this.data.query || "").trim();
    const expand = showAll != null ? showAll : this.data.showAll;
    const seq = (this.loadSeq = (this.loadSeq || 0) + 1);
    return Promise.all([request("/me"), request("/clubs/directory" + (q ? "?q=" + encodeURIComponent(q) : ""))])
      .then(([data, directory]) => {
        if (!this.scopeCurrent(token, seq)) return;
        const all = (directory.clubs || []).map((item) => ({ ...item, initial: String(item.name || "团").slice(0, 1) }));
        const found = all.filter((item) => q || !item.joined);
        const openClubs = !expand ? found.slice(0, 6) : found;
        const patch = {
          clubs: (data.clubs || []).map((item) => {
            const entry = all.find((club) => club.id === item.id);
            const previous = this.data.clubs.find((club) => club.id === item.id);
            return { ...item, initial: String(item.name || "团").slice(0, 1), memberCount: entry ? entry.members : previous ? previous.memberCount : null };
          }),
          leader: !!(data.user && data.user.leader),
          application: (data.applications && data.applications[0]) || null,
          openClubs,
          more: !expand ? found.length - openClubs.length : 0,
          loaded: true
        };
        if (q && this.data.mode === "search") patch.message = found.length ? "" : "没有找到这个跑团";
        this.setData(patch);
        this.filterMine();
      })
      .catch((err) => {
        if (!this.scopeCurrent(token, seq)) return;
        if (err.status === 401 || err.status === 403) this.setData({ ...PRIVATE_EMPTY });
        this.setData({ loaded: true, message: err.message });
      });
  },
  search() {
    if (!ready()) {
      this.setData({ message: "登录后即可搜索跑团，也可以用口令查看介绍" });
      return;
    }
    this.setData({ message: "" });
    this.load();
  },
  create() {
    if (!ready() || !this.data.leader) return;
    const token = accountKey();
    request("/clubs", "POST", { name: (this.data.name || "").trim() })
      .then((data) => {
        if (!this.scopeCurrent(token)) return;
        if (data.pending) {
          this.setData({ name: "", foundingMessage: "已提交，等跑团管理员通过" });
          this.load();
          return;
        }
        wx.navigateTo({ url: "/pages/club/club?id=" + data.club.id });
      })
      .catch((err) => { if (this.scopeCurrent(token)) this.setData({ foundingMessage: err.message }); });
  },
  join() {
    const code = (this.data.code || "").trim();
    if (!code) {
      this.setData({ message: "填口令" });
      return;
    }
    wx.navigateTo({ url: "/pages/club-intro/club-intro?code=" + encodeURIComponent(code) });
  },
  apply(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (id) wx.navigateTo({ url: "/pages/club-intro/club-intro?id=" + id });
  }
});
