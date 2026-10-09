const { request, setAuth, ready } = require("../../utils/request");

Page({
  data: {
    ready: false,
    draft: "",
    name: "",
    code: "",
    clubs: [],
    phase: "loading",
    busy: false,
    message: "",
    ok: "",
    createError: "",
    joinError: ""
  },
  onShow() {
    const isReady = ready();
    this.setData({ ready: isReady });
    if (isReady) this.load();
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
  load() {
    this.setData({ phase: "loading", message: "" });
    request("/me")
      .then((data) => this.setData({ clubs: data.clubs || [], phase: "ready", message: "" }))
      .catch((err) => this.setData({ phase: "error", message: err.message }));
  },
  enter() {
    const nickname = (this.data.draft || "").trim();
    if (!nickname || nickname.length > 20) {
      this.setData({ message: "昵称用 1 到 20 个字", ok: "" });
      return;
    }
    this.setData({ busy: true, message: "", ok: "" });
    request("/session", "POST", { nickname })
      .then((data) => {
        setAuth(data.token, data.user.nickname);
        this.setData({ ready: true, draft: "", ok: "名字已记下。", busy: false });
        this.load();
      })
      .catch((err) => this.setData({ busy: false, message: err.message }));
  },
  create() {
    const name = (this.data.name || "").trim();
    if (!name || name.length > 20) {
      this.setData({ createError: "跑团名用 1 到 20 个字" });
      return;
    }
    this.setData({ busy: true, createError: "" });
    request("/clubs", "POST", { name })
      .then((data) => {
        this.setData({ busy: false });
        wx.navigateTo({ url: "/pages/club/club?id=" + data.club.id });
      })
      .catch((err) => this.setData({ busy: false, createError: err.message }));
  },
  join() {
    const code = (this.data.code || "").trim().toUpperCase();
    if (!code) {
      this.setData({ joinError: "没有这个跑团口令" });
      return;
    }
    this.setData({ busy: true, joinError: "" });
    request("/clubs/join", "POST", { code })
      .then((data) => {
        this.setData({ busy: false });
        wx.navigateTo({ url: "/pages/club/club?id=" + data.club.id });
      })
      .catch((err) => this.setData({ busy: false, joinError: err.message }));
  }
});
