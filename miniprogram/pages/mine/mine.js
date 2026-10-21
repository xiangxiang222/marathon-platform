const { request, setAuth, clearAuth, ready } = require("../../utils/request");
const { saveCaptchaFile } = require("../../utils/captcha");

Page({
  data: {
    nickname: "",
    leader: false,
    clubs: [],
    hasPassword: false,
    passwordOpen: false,
    tab: "login",
    draft: "",
    password: "",
    password2: "",
    captcha: "",
    captchaImage: "",
    captchaLoading: false,
    currentPassword: "",
    nextPassword: "",
    nextPassword2: "",
    plans: [],
    results: [],
    career: { finished: 0, provinces: [], cities: [], pb: { full: "", half: "" }, yearKm: 0 },
    conflicts: [],
    reminders: [],
    loaded: false,
    message: "",
    ok: false,
    company: "北京华创科技有限公司",
    icp: "京ICP备2026060284号-2"
  },
  onShow() {
    request("/meta")
      .then((meta) => this.setData({ company: meta.company, icp: meta.icp }))
      .catch(() => {});
    const nickname = (getApp().globalData && getApp().globalData.nickname) || "";
    this.setData({ nickname, ready: ready() });
    if (ready()) this.load();
    else if (this.data.tab === "login") this.loadCaptcha();
  },
  onDraft(e) { this.setData({ draft: e.detail.value }); },
  onPassword(e) { this.setData({ password: e.detail.value }); },
  onPassword2(e) { this.setData({ password2: e.detail.value }); },
  onCaptcha(e) { this.setData({ captcha: e.detail.value }); },
  onCurrent(e) { this.setData({ currentPassword: e.detail.value }); },
  onNext(e) { this.setData({ nextPassword: e.detail.value }); },
  onNext2(e) { this.setData({ nextPassword2: e.detail.value }); },
  setTab(e) {
    const tab = e.currentTarget.dataset.tab === "register" ? "register" : "login";
    this.setData({ tab, message: "", ok: false });
    if (tab === "login") this.loadCaptcha();
  },
  loadCaptcha() {
    this.setData({ captchaLoading: true, captchaImage: "" });
    request("/auth/captcha?t=" + Date.now())
      .then((data) => saveCaptchaFile(data.image, this._captchaFile).then((filePath) => ({ data, filePath })))
      .then(({ data, filePath }) => {
        this._captchaFile = filePath;
        this._captchaToken = data.token;
        this.setData({ captchaImage: filePath, captcha: "", captchaLoading: false });
      })
      .catch((err) => this.setData({ captchaLoading: false, message: err.message, ok: false }));
  },
  submitAuth() {
    const tab = this.data.tab;
    if (tab === "register" && this.data.password !== this.data.password2) {
      this.setData({ message: "两次密码不一致", ok: false });
      return;
    }
    const body = { nickname: (this.data.draft || "").trim(), password: this.data.password };
    if (tab === "login") {
      body.captchaToken = this._captchaToken || "";
      body.captcha = this.data.captcha;
    }
    request(tab === "login" ? "/auth/login" : "/auth/register", "POST", body)
      .then((data) => {
        setAuth(data.token, data.user.nickname);
        this.setData({ nickname: data.user.nickname, password: "", password2: "", captcha: "", message: "", ok: false });
        this.load();
      })
      .catch((err) => {
        this.setData({ message: err.message, ok: false });
        if (tab === "login") this.loadCaptcha();
      });
  },
  togglePassword() {
    if (this.data.passwordOpen) this.cancelPassword();
    else this.setData({ passwordOpen: true, message: "", ok: false });
  },
  cancelPassword() {
    this.setData({
      passwordOpen: false,
      currentPassword: "",
      nextPassword: "",
      nextPassword2: "",
      message: "",
      ok: false
    });
  },
  savePassword() {
    const next = this.data.nextPassword || "";
    if (next.length < 8 || next.length > 128) {
      this.setData({ message: "密码须为 8 到 128 位", ok: false });
      return;
    }
    if (next !== this.data.nextPassword2) {
      this.setData({ message: "两次输入的密码不一致", ok: false });
      return;
    }
    request("/me/password", "PUT", { current: this.data.currentPassword, password: next })
      .then(() => {
        this.setData({
          hasPassword: true,
          passwordOpen: false,
          currentPassword: "",
          nextPassword: "",
          nextPassword2: "",
          ok: true,
          message: "密码已更新"
        });
      })
      .catch((err) => this.setData({ message: err.message, ok: false }));
  },
  logout() {
    clearAuth();
    this.setData({
      nickname: "",
      leader: false,
      clubs: [],
      hasPassword: false,
      passwordOpen: false,
      currentPassword: "",
      nextPassword: "",
      nextPassword2: "",
      plans: [],
      results: [],
      conflicts: [],
      reminders: [],
      loaded: false,
      tab: "login",
      message: "",
      ok: false
    });
    this.loadCaptcha();
  },
  load() {
    request("/me")
      .then((data) => {
        const plans = (data.plans || []).map((item) => ({ ...item, raceId: item.race.id }));
        const token = (getApp().globalData && getApp().globalData.token) || "";
        const base = (getApp().globalData && getApp().globalData.baseUrl) || "";
        const results = (data.results || []).map((item) => ({
          ...item,
          raceId: item.race.id + item.distance,
          proofSrc: item.hasProof ? base + "/marathon/api/me/races/" + item.race.id + "/result/proof?t=" + encodeURIComponent(token) + "&distance=" + encodeURIComponent(item.distance) : ""
        }));
        const reminders = (data.reminders || []).map((item) => ({ ...item, key: item.race.id + item.hit.key }));
        setAuth((getApp().globalData && getApp().globalData.token) || "", data.user.nickname);
        this.setData({
          plans,
          results,
          career: data.career || this.data.career,
          reminders,
          conflicts: data.conflicts || [],
          nickname: data.user.nickname,
          leader: !!(data.user && data.user.leader),
          hasPassword: !!(data.user && data.user.hasPassword),
          clubs: data.clubs || [],
          loaded: true
        });
      })
      .catch((err) => {
        if (err.message === "请先登录") this.logout();
        else this.setData({ loaded: true, message: err.message, ok: false });
      });
  }
});
