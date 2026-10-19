const { request, setAuth, ready } = require("../../utils/request");

Page({
  data: { ready: false, draft: "", name: "", leader: false, application: null, code: "", query: "", clubs: [], openClubs: [], loaded: false, message: "" },
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
    this.setData({ query: e.detail.value });
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
  load() {
    const q = (this.data.query || "").trim();
    Promise.all([request("/me"), request("/clubs/directory" + (q ? "?q=" + encodeURIComponent(q) : ""))])
      .then(([data, directory]) => {
        const found = directory.clubs || [];
        const patch = {
          clubs: data.clubs || [],
          leader: !!(data.user && data.user.leader),
          application: (data.applications && data.applications[0]) || null,
          openClubs: found.filter((item) => q || !item.joined),
          loaded: true
        };
        if (q) patch.message = found.length ? "" : "没有找到这个跑团";
        this.setData(patch);
      })
      .catch((err) => this.setData({ loaded: true, message: err.message }));
  },
  search() {
    this.setData({ message: "" });
    this.load();
  },
  create() {
    request("/clubs", "POST", { name: (this.data.name || "").trim() })
      .then((data) => {
        if (data.pending) {
          this.setData({ name: "", message: "已提交，等跑团管理员通过" });
          this.load();
          return;
        }
        wx.navigateTo({ url: "/pages/club/club?id=" + data.club.id });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  join() {
    const code = (this.data.code || "").trim();
    if (!code) {
      this.setData({ message: "填口令，或在下面搜一个团申请" });
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
