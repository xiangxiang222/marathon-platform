const { request, setAuth, ready } = require("../../utils/request");

Page({
  data: { ready: false, draft: "", name: "", leader: false, application: null, mode: "search", code: "", query: "", showAll: false, more: 0, clubs: [], openClubs: [], loaded: false, message: "", foundingMessage: "" },
  onShow() {
    this.setData({ ready: ready() });
    if (ready()) this.load();
  },
  onDraft(e) {
    this.setData({ draft: e.detail.value });
  },
  onName(e) {
    this.setData({ name: e.detail.value });
  },
  onCode(e) {
    this.setData({ code: e.detail.value });
  },
  onQuery(e) {
    const query = e.detail.value;
    this.setData({ query, showAll: false, message: "" });
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
  enter() {
    request("/session", "POST", { nickname: (this.data.draft || "").trim() })
      .then((data) => {
        setAuth(data.token, data.user.nickname);
        this.setData({ ready: true, draft: "", message: "" });
        this.load();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  load(query, showAll) {
    const q = String(query != null ? query : this.data.query || "").trim();
    const expand = showAll != null ? showAll : this.data.showAll;
    const seq = (this.loadSeq = (this.loadSeq || 0) + 1);
    Promise.all([request("/me"), request("/clubs/directory" + (q ? "?q=" + encodeURIComponent(q) : ""))])
      .then(([data, directory]) => {
        if (seq !== this.loadSeq) return;
        const found = (directory.clubs || []).filter((item) => q || !item.joined);
        const openClubs = q && !expand ? found.slice(0, 6) : found;
        const patch = {
          clubs: data.clubs || [],
          leader: !!(data.user && data.user.leader),
          application: (data.applications && data.applications[0]) || null,
          openClubs,
          more: q && !expand ? found.length - openClubs.length : 0,
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
    this.setData({ message: "" });
    this.load();
  },
  create() {
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
    request("/clubs/join", "POST", { code })
      .then((data) => wx.navigateTo({ url: "/pages/club/club?id=" + data.club.id }))
      .catch((err) => this.setData({ message: err.message }));
  },
  apply(e) {
    const id = Number(e.currentTarget.dataset.id);
    request("/clubs/join", "POST", { clubId: id })
      .then((data) => {
        if (data.pending) {
          this.setData({ message: "已提交，等团长或跑团管理通过" });
          this.load();
          return;
        }
        wx.navigateTo({ url: "/pages/club/club?id=" + data.club.id });
      })
      .catch((err) => this.setData({ message: err.message }));
  }
});
