const { request, setAuth, ready } = require("../../utils/request");

Page({
  data: { ready: false, draft: "", name: "", code: "", clubs: [], openClubs: [], loaded: false, message: "" },
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
    Promise.all([request("/me"), request("/clubs/directory")])
      .then(([data, directory]) => this.setData({
        clubs: data.clubs || [],
        openClubs: (directory.clubs || []).filter((item) => !item.joined),
        loaded: true
      }))
      .catch((err) => this.setData({ loaded: true, message: err.message }));
  },
  create() {
    request("/clubs", "POST", { name: (this.data.name || "").trim() })
      .then((data) => wx.navigateTo({ url: "/pages/club/club?id=" + data.club.id }))
      .catch((err) => this.setData({ message: err.message }));
  },
  join() {
    const code = (this.data.code || "").trim();
    if (!code) {
      this.setData({ message: "填口令，或在下面选一个团申请" });
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
