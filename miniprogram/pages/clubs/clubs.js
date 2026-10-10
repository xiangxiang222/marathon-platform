const { request, setAuth, ready } = require("../../utils/request");

Page({
  data: { ready: false, draft: "", name: "", code: "", clubs: [], loaded: false, message: "" },
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
    request("/me")
      .then((data) => this.setData({ clubs: data.clubs || [], loaded: true, message: "" }))
      .catch((err) => this.setData({ loaded: true, message: err.message }));
  },
  create() {
    request("/clubs", "POST", { name: (this.data.name || "").trim() })
      .then((data) => wx.navigateTo({ url: "/pages/club/club?id=" + data.club.id }))
      .catch((err) => this.setData({ message: err.message }));
  },
  join() {
    request("/clubs/join", "POST", { code: (this.data.code || "").trim() })
      .then((data) => wx.navigateTo({ url: "/pages/club/club?id=" + data.club.id }))
      .catch((err) => this.setData({ message: err.message }));
  }
});
