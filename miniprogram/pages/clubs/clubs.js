const { request, ready } = require("../../utils/request");

Page({
  data: { ready: false, name: "", leader: false, application: null, createOpen: false, mode: "search", code: "", query: "", showAll: false, more: 0, clubs: [], openClubs: [], loaded: false, message: "", foundingMessage: "" },
  onShow() {
    const loggedIn = ready();
    this.setData({ ready: loggedIn });
    if (loggedIn) this.load();
    else this.setData({ clubs: [], openClubs: [], application: null, leader: false, createOpen: false, loaded: false, message: "" });
  },
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
    if (!ready()) return;
    const q = String(query != null ? query : this.data.query || "").trim();
    const expand = showAll != null ? showAll : this.data.showAll;
    const seq = (this.loadSeq = (this.loadSeq || 0) + 1);
    Promise.all([request("/me"), request("/clubs/directory" + (q ? "?q=" + encodeURIComponent(q) : ""))])
      .then(([data, directory]) => {
        if (seq !== this.loadSeq) return;
        if (!ready()) return;
        const all = (directory.clubs || []).map((item) => ({ ...item, initial: String(item.name || "团").slice(0, 1) }));
        const found = all.filter((item) => q || !item.joined);
        const openClubs = !expand ? found.slice(0, 6) : found;
        const patch = {
          clubs: (data.clubs || []).map((item) => {
            const entry = all.find((club) => club.id === item.id);
            const previous = this.data.clubs.find((club) => club.id === item.id);
            return { ...item, memberCount: entry ? entry.members : previous ? previous.memberCount : null };
          }),
          leader: !!(data.user && data.user.leader),
          application: (data.applications && data.applications[0]) || null,
          openClubs,
          more: !expand ? found.length - openClubs.length : 0,
          loaded: true
        };
        if (q && this.data.mode === "search") patch.message = found.length ? "" : "没有找到这个跑团";
        this.setData(patch);
      })
      .catch((err) => {
        if (seq !== this.loadSeq) return;
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
    request("/clubs", "POST", { name: (this.data.name || "").trim() })
      .then((data) => {
        if (data.pending) {
          this.setData({ name: "", foundingMessage: "已提交，等跑团管理员通过" });
          this.load();
          return;
        }
        wx.navigateTo({ url: "/pages/club/club?id=" + data.club.id });
      })
      .catch((err) => this.setData({ foundingMessage: err.message }));
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
