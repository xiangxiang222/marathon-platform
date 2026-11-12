const { request, setAuth, clearAuth, ready } = require("../../utils/request");
const { saveCaptchaFile } = require("../../utils/captcha");
const { networkAvatar, prepareAvatar } = require("../../utils/avatar");
const { VIEWS, decorate, careerSummary } = require("../../utils/runner-center");
const { normalizeResults } = require("../../utils/achievement-model");
let legalVersion = require("../../utils/legal-documents").version;

function wechatCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (result) => result.code ? resolve(result.code) : reject(new Error("没有取得微信登录凭证，请重试")),
      fail: () => reject(new Error("微信登录失败，请稍后重试"))
    });
  });
}

Page({
  data: {
    mainTab: "overview",
    posterAvailable: false,
    runnerViews: VIEWS.map(item => ({ ...item, shortCaption: ({ stats: '跑量与趋势', career: '成绩与 PB', footprints: '我的城市护照', honors: '证书与奖牌', media: '留住高光时刻', devices: '导入与设备' })[item.key] })),
    runner: null,
    runnerLoading: false,
    runnerError: "",
    feedbackUnread: 0,
    helpOpen: false,
    nextRace: null,
    authOpen: false,
    profileOpen: false,
    quickLinks: [{ url: "/pages/calendar/calendar", label: "赛事日历", icon: "/images/quick-calendar.png" }, { url: "/pages/radar/radar", label: "拿奖雷达", icon: "/images/quick-radar.png" }, { url: "/pages/clubs/clubs", label: "发现跑团", icon: "/images/quick-clubs.png", tab: true }, { url: "/pages/news/news", label: "跑圈资讯", icon: "/images/quick-news.png" }],
    nickname: "",
    nicknameDraft: "",
    avatar: "",
    avatarPreview: "",
    avatarSaving: false,
    leader: false,
    clubs: [],
    hasPassword: false,
    hasWechatLogin: false,
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
    profileMessage: "",
    wxLoading: false,
    wechatRegistrationRequired: false,
    bindAfterLogin: false,
    unbindOpen: false,
    unbindPassword: "",
    unbindLoading: false,
    unbindMessage: "",
    ok: false,
    legalAccepted: false,
    company: "北京华创科技有限公司",
    icp: "京ICP备2026060284号-2"
  },
  onShow() {
    request("/legal").then(data => { if (data.version && data.version !== legalVersion) { legalVersion = data.version; this.setData({ legalAccepted: false }); } }).catch(() => {});
    request("/meta")
      .then((meta) => this.setData({ company: meta.company, icp: meta.icp }))
      .catch(() => {});
    const nickname = (getApp().globalData && getApp().globalData.nickname) || "";
    const avatar = networkAvatar(getApp().globalData && getApp().globalData.avatar, getApp().globalData && getApp().globalData.baseUrl);
    const token = (getApp().globalData && getApp().globalData.token) || "";
    if (token !== this._lastToken) {
      this._sessionEpoch = (this._sessionEpoch || 0) + 1;
      this._lastToken = token;
      this.setData({ runner: null, posterAvailable: false, plans: [], results: [], clubs: [], nextRace: null, conflicts: [], reminders: [], feedbackUnread: 0, career: { finished: 0, provinces: [], cities: [], pb: { full: "", half: "" }, yearKm: 0 } });
    }
    this.setData({ nickname, nicknameDraft: nickname, avatar, ready: ready() });
    if (ready()) this.load();
    else if (this.data.authOpen && this.data.tab === "login") this.loadCaptcha();
    if (!ready() && (wx.getStorageSync("marathon_pending_club_id") || wx.getStorageSync("marathon_return_after_login") || wx.getStorageSync("marathon_runner_return"))) {
      this.setData({ authOpen: true });
      if (this.data.tab === "login" && !this.data.captchaImage) this.loadCaptcha();
    }
    if (ready()) this.resumePendingClub();
  },
  accountScope() { return { token: (getApp().globalData && getApp().globalData.token) || "", epoch: this._sessionEpoch || 0 }; },
  accountCurrent(scope) { return Boolean(scope.token) && scope.token === ((getApp().globalData && getApp().globalData.token) || "") && scope.epoch === (this._sessionEpoch || 0); },
  openPrivacy() {
    wx.navigateTo({ url: "/pages/privacy/privacy" });
  },
  openLegal(e) { const doc = e.currentTarget.dataset.doc || "privacy"; wx.navigateTo({ url: "/pages/legal/legal?doc=" + encodeURIComponent(doc) }); },
  onLegalConsent(e) { this.setData({ legalAccepted: Boolean(e.detail.value && e.detail.value.includes("accepted")), message: "" }); },
  toggleHelp() { this.setData({ helpOpen: !this.data.helpOpen }); },
  loadFeedbackSummary() {
    if (!ready()) { this.setData({ feedbackUnread: 0 }); return Promise.resolve(); }
    const token = getApp().globalData.token;
    const sequence = this._feedbackSequence = (this._feedbackSequence || 0) + 1;
    return request("/me/feedback/summary").then((data) => {
      if (sequence === this._feedbackSequence && token === getApp().globalData.token) this.setData({ feedbackUnread: Math.max(0, Math.floor(Number(data.unread) || 0)) });
    }).catch(() => {
      if (sequence === this._feedbackSequence && token === getApp().globalData.token) this.setData({ feedbackUnread: 0 });
    });
  },
  openSettings() {
    this._settingsReturn = this.data.mainTab === "settings" ? "overview" : this.data.mainTab;
    this.pickMainTab({ currentTarget: { dataset: { tab: "settings" } } });
  },
  closeSettings() { this.pickMainTab({ currentTarget: { dataset: { tab: this._settingsReturn || "overview" } } }); },
  settingsLogin() { this.closeSettings(); if (!this.data.authOpen) this.toggleAuth(); },
  pickMainTab(e) {
    const mainTab = e.currentTarget.dataset.tab;
    if (!["overview", "plans", "results", "profile", "settings"].includes(mainTab)) return;
    this.setData({ mainTab, profileOpen: false, passwordOpen: false, unbindOpen: false, unbindPassword: "", unbindMessage: "" });
  },
  toggleAuth() {
    const authOpen = !this.data.authOpen;
    this.setData({ authOpen });
    if (authOpen && this.data.tab === "login" && !this.data.captchaImage) this.loadCaptcha();
  },
  toggleProfile() { this.setData({ profileOpen: !this.data.profileOpen }); },
  onDraft(e) { this.setData({ draft: e.detail.value }); },
  onPassword(e) { this.setData({ password: e.detail.value }); },
  onPassword2(e) { this.setData({ password2: e.detail.value }); },
  onCaptcha(e) { this.setData({ captcha: e.detail.value }); },
  onCurrent(e) { this.setData({ currentPassword: e.detail.value }); },
  onNext(e) { this.setData({ nextPassword: e.detail.value }); },
  onNext2(e) { this.setData({ nextPassword2: e.detail.value }); },
  onNickname(e) { this.setData({ nicknameDraft: e.detail.value }); },
  onUnbindPassword(e) { this.setData({ unbindPassword: e.detail.value }); },
  resumePendingClub() {
    if (!ready()) return;
    const clubId = wx.getStorageSync("marathon_pending_club_id");
    if (clubId) {
      wx.removeStorageSync("marathon_pending_club_id");
      wx.navigateTo({ url: "/pages/club-intro/club-intro?id=" + encodeURIComponent(clubId) + "&apply=1" });
      return;
    }
    const returnPath = wx.getStorageSync("marathon_return_after_login");
    if (returnPath === "/pages/club-create/club-create" || returnPath === "/pages/club-create/club-create?continue=1" || returnPath === "/pages/legal/legal?doc=rights" || returnPath === "/pages/radar/radar" || returnPath === "/pages/history/history" || /^\/pages\/race\/race\?id=[^&#]+(?:&plan=1)?$/.test(returnPath) || /^\/pages\/feedback\/feedback(?:\?(?:id=\d+|compose=1|mine=1))?$/.test(returnPath)) {
      wx.removeStorageSync("marathon_return_after_login");
      wx.navigateTo({ url: returnPath });
    } else if (returnPath === "/pages/sport/sport") {
      wx.removeStorageSync("marathon_return_after_login");
      wx.switchTab({ url: returnPath });
    } else {
      const runnerView = wx.getStorageSync("marathon_runner_return");
      if (VIEWS.some((item) => item.key === runnerView)) {
        wx.removeStorageSync("marathon_runner_return");
        wx.navigateTo({ url: "/pages/runner/runner?view=" + runnerView });
      }
    }
  },
  openRunner(event) {
    const view = event.currentTarget.dataset.view;
    if (!VIEWS.some((item) => item.key === view)) return;
    if (!ready()) {
      wx.setStorageSync("marathon_runner_return", view);
      this.setData({ authOpen: true, message: "登录后查看你的跑者档案" });
      if (this.data.tab === "login" && !this.data.captchaImage) this.loadCaptcha();
      return;
    }
    wx.navigateTo({ url: "/pages/runner/runner?view=" + view });
  },
  openAchievementPoster(event) {
    if (!ready()) return;
    if (!normalizeResults(this.data.runner).length) {
      this.pickMainTab({ currentTarget: { dataset: { tab: "results" } } });
      wx.showToast({ title: "先在赛事详情页记录完赛成绩", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/achievement-poster/achievement-poster?mode=results" });
  },
  loadRunner() {
    if (!ready()) return Promise.resolve();
    const token = getApp().globalData.token;
    const sequence = this._runnerSequence = (this._runnerSequence || 0) + 1;
    this.setData({ runnerLoading: true, runnerError: "" });
    return request("/me/runner?period=week&offset=0")
      .then((data) => {
        if (sequence !== this._runnerSequence || token !== getApp().globalData.token) return;
        this._runnerToken = token;
        this.setData({ runner: decorate(data), runnerLoading: false });
        this.applyRunnerCareer();
      })
      .catch((error) => {
        if (sequence === this._runnerSequence && token === getApp().globalData.token) this.setData({ runnerLoading: false, runnerError: error.message || "运动摘要暂时无法加载" });
      });
  },
  applyRunnerCareer() {
    const runner = this.data.runner;
    if (!runner || this._runnerToken !== getApp().globalData.token) return;
    const flags = new Map(runner.results.map((item) => [String(item.race.id) + ":" + item.distance, item.pb]));
    this.setData({ posterAvailable: normalizeResults(runner).length > 0, career: careerSummary(runner), results: this.data.results.map((item) => ({ ...item, pb: Boolean(flags.get(String(item.race.id) + ":" + item.distance)) })) });
  },
  setTab(e) {
    const tab = e.currentTarget.dataset.tab === "register" ? "register" : "login";
    this.setData({ tab, bindAfterLogin: tab === "login" && this.data.bindAfterLogin, message: "", ok: false });
    if (tab === "login") this.loadCaptcha();
  },
  loadCaptcha() {
    const sequence = this._captchaSequence = (this._captchaSequence || 0) + 1;
    this.setData({ captchaLoading: true, captchaImage: "" });
    return request("/auth/captcha?t=" + Date.now())
      .then((data) => {
        if (sequence !== this._captchaSequence) return null;
        return saveCaptchaFile(data.image, this._captchaFile).then((filePath) => ({ data, filePath }));
      })
      .then((result) => {
        if (!result || sequence !== this._captchaSequence) return;
        this._captchaFile = result.filePath;
        this._captchaToken = result.data.token;
        this.setData({ captchaImage: result.filePath, captcha: "", captchaLoading: false });
      })
      .catch((err) => { if (sequence === this._captchaSequence) this.setData({ captchaLoading: false, message: err.message, ok: false }); });
  },
  wechatLogin() {
    return this.startWechatLogin(false);
  },
  createWechatAccount() {
    if (!this.data.wechatRegistrationRequired) return;
    return this.startWechatLogin(true);
  },
  useExistingAccount() {
    this.setData({ authOpen: true, tab: "login", bindAfterLogin: true, wechatRegistrationRequired: false, message: "请登录原账号，登录成功后将绑定当前微信。", ok: false });
    this.loadCaptcha();
  },
  acceptSession(data) {
    const bindAfterLogin = this.data.bindAfterLogin;
    this._sessionEpoch = (this._sessionEpoch || 0) + 1;
    this._lastToken = data.token;
    setAuth(data.token, data.user.nickname, data.user.avatar);
    this.setData({ authOpen: false, ready: true, nickname: data.user.nickname, nicknameDraft: data.user.nickname, avatar: data.user.avatar || "", avatarPreview: "", wxLoading: false, wechatRegistrationRequired: false, bindAfterLogin: false, message: "", password: "", password2: "", captcha: "" });
    this._avatarPath = "";
    const scope = this.accountScope();
    return this.load().then(() => {
      if (!this.accountCurrent(scope)) return;
      if (bindAfterLogin) {
        this.setData({ mainTab: "profile" });
        return this.bindWechat(true).then((bound) => { if (bound) this.resumePendingClub(); });
      }
      this.resumePendingClub();
    });
  },
  startWechatLogin(createAccount) {
    if (this.data.wxLoading) return;
    if (!this.data.legalAccepted) { this.setData({ message: "请先阅读用户协议与隐私政策，自主勾选后继续。" }); return; }
    const epoch = this._sessionEpoch || 0;
    this.setData({ wxLoading: true, bindAfterLogin: false, message: "" });
    return wechatCode()
      .then((code) => { if (epoch !== (this._sessionEpoch || 0)) return null; return request("/auth/wechat", "POST", { code, ...(createAccount ? { createAccount: true } : {}), legalConsent: { version: legalVersion, accepted: true } }); })
      .then((data) => { if (data && epoch === (this._sessionEpoch || 0)) return this.acceptSession(data); })
      .catch((err) => {
        if (epoch !== (this._sessionEpoch || 0)) return;
        if (err.status === 409 && err.code === "WECHAT_REGISTRATION_REQUIRED") {
          this.setData({ wechatRegistrationRequired: true, message: "" });
        } else this.setData({ message: err.message });
      })
      .finally(() => { if (epoch === (this._sessionEpoch || 0)) this.setData({ wxLoading: false }); });
  },
  async bindWechat(force) {
    if (!ready()) return false;
    if (this.data.hasWechatLogin && force !== true) return true;
    if (this.data.wxLoading) return false;
    const scope = this.accountScope();
    this.setData({ wxLoading: true, profileMessage: "" });
    try {
      const code = await wechatCode();
      if (!this.accountCurrent(scope)) return false;
      await request("/me/wechat", "POST", { code });
      if (!this.accountCurrent(scope)) return false;
      this.setData({ hasWechatLogin: true, profileMessage: "微信账号已绑定，可用于下次登录" });
      await this.load();
      return this.accountCurrent(scope);
    } catch (err) { if (this.accountCurrent(scope)) this.setData({ profileMessage: err.message }); return false; }
    finally { if (this.accountCurrent(scope)) this.setData({ wxLoading: false }); }
  },
  toggleUnbind() {
    if (!this.data.hasPassword) {
      this.setData({ passwordOpen: true, unbindOpen: false, unbindPassword: "", profileMessage: "请先设置登录密码，再解绑微信。" });
      return;
    }
    this.setData({ unbindOpen: !this.data.unbindOpen, unbindPassword: "", unbindMessage: "" });
  },
  unbindWechat() {
    if (!ready() || !this.data.hasPassword || this.data.unbindLoading) return;
    if (!this.data.unbindPassword) {
      this.setData({ unbindMessage: "请输入当前登录密码" });
      return;
    }
    const scope = this.accountScope();
    this.setData({ unbindLoading: true, unbindMessage: "" });
    return request("/me/wechat", "DELETE", { password: this.data.unbindPassword })
      .then(() => {
        if (!this.accountCurrent(scope)) return;
        this.setData({ hasWechatLogin: false, unbindOpen: false, unbindPassword: "", profileMessage: "微信已解绑，可继续使用昵称和密码登录。" });
        return this.load();
      })
      .catch((err) => { if (this.accountCurrent(scope)) this.setData({ unbindMessage: err.message }); })
      .finally(() => { if (this.accountCurrent(scope)) this.setData({ unbindLoading: false }); });
  },
  chooseAvatar(e) {
    const path = e.detail && e.detail.avatarUrl;
    if (!path || this.data.avatarSaving) return;
    this._avatarPath = path;
    this.setData({ avatarPreview: path, profileMessage: "头像已选择，保存后团友可见" });
  },
  async saveProfile() {
    if (!ready() || this.data.avatarSaving) return;
    const nickname = (this.data.nicknameDraft || "").trim();
    if (!nickname || nickname.length > 20) {
      this.setData({ profileMessage: "昵称须为 1 到 20 个字" });
      return;
    }
    const scope = this.accountScope(), avatarPath = this._avatarPath;
    this.setData({ avatarSaving: true, profileMessage: "正在保存个人资料" });
    try {
      if (avatarPath) {
        const avatar = await prepareAvatar(avatarPath);
        if (!this.accountCurrent(scope)) return;
        const data = await request("/me/avatar", "POST", { avatar });
        if (!this.accountCurrent(scope)) return;
        this._avatarPath = "";
        setAuth(scope.token, this.data.nickname, data.avatar);
        this.setData({ avatar: data.avatar || "", avatarPreview: "" });
      }
      if (!this.accountCurrent(scope)) return;
      const data = await request("/me/profile", "PUT", { nickname });
      if (!this.accountCurrent(scope)) return;
      setAuth(scope.token, data.user.nickname, data.user.avatar);
      this.setData({ authOpen: false, ready: true, nickname: data.user.nickname, nicknameDraft: data.user.nickname, avatar: data.user.avatar || "", avatarPreview: "", profileMessage: "个人资料已保存" });
      await this.load();
    } catch (err) { if (this.accountCurrent(scope)) this.setData({ profileMessage: err.message }); }
    finally { if (this.accountCurrent(scope)) this.setData({ avatarSaving: false }); }
  },
  submitAuth() {
    if (!this.data.legalAccepted) { this.setData({ message: "请先阅读用户协议与隐私政策，自主勾选后继续。", ok: false }); return; }
    const tab = this.data.tab;
    if (tab === "register" && this.data.password !== this.data.password2) {
      this.setData({ message: "两次密码不一致", ok: false });
      return;
    }
    const body = { nickname: (this.data.draft || "").trim(), password: this.data.password, legalConsent: { version: legalVersion, accepted: true } };
    if (tab === "login") {
      body.captchaToken = this._captchaToken || "";
      body.captcha = this.data.captcha;
    }
    const epoch = this._sessionEpoch || 0;
    return request(tab === "login" ? "/auth/login" : "/auth/register", "POST", body)
      .then((data) => { if (epoch === (this._sessionEpoch || 0)) return this.acceptSession(data); })
      .catch((err) => {
        if (epoch !== (this._sessionEpoch || 0)) return;
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
    if (!ready()) return;
    const next = this.data.nextPassword || "";
    if (next.length < 8 || next.length > 128) {
      this.setData({ message: "密码须为 8 到 128 位", ok: false });
      return;
    }
    if (next !== this.data.nextPassword2) {
      this.setData({ message: "两次输入的密码不一致", ok: false });
      return;
    }
    const scope = this.accountScope();
    return request("/me/password", "PUT", { current: this.data.currentPassword, password: next })
      .then(() => {
        if (!this.accountCurrent(scope)) return;
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
      .catch((err) => { if (this.accountCurrent(scope)) this.setData({ message: err.message, ok: false }); });
  },
  logout() {
    this._sessionEpoch = (this._sessionEpoch || 0) + 1;
    this._lastToken = "";
    this._captchaToken = "";
    this._captchaSequence = (this._captchaSequence || 0) + 1;
    this.setData({ legalAccepted: false });
    this._feedbackSequence = (this._feedbackSequence || 0) + 1;
    this._runnerSequence = (this._runnerSequence || 0) + 1;
    this._mineSequence = (this._mineSequence || 0) + 1;
    this._runnerToken = "";
    this._avatarPath = "";
    this._settingsReturn = "overview";
    clearAuth();
    this.setData({
      nickname: "",
      nicknameDraft: "",
      avatar: "",
      avatarPreview: "",
      avatarSaving: false,
      draft: "",
      password: "",
      password2: "",
      captcha: "",
      captchaImage: "",
      captchaLoading: false,
      profileMessage: "",
      wxLoading: false,
      unbindLoading: false,
      leader: false,
      clubs: [],
      hasPassword: false,
      hasWechatLogin: false,
      wechatRegistrationRequired: false,
      bindAfterLogin: false,
      unbindOpen: false,
      unbindPassword: "",
      unbindMessage: "",
      passwordOpen: false,
      currentPassword: "",
      nextPassword: "",
      nextPassword2: "",
      plans: [],
      results: [],
      conflicts: [],
      reminders: [],
      loaded: false,
      ready: false,
      authOpen: false,
      profileOpen: false,
      mainTab: "overview",
      posterAvailable: false,
      runner: null,
      runnerError: "",
      feedbackUnread: 0,
      helpOpen: false,
      runnerLoading: false,
      nextRace: null,
      career: { finished: 0, provinces: [], cities: [], pb: { full: "", half: "" }, yearKm: 0 },
      tab: "login",
      message: "",
      ok: false
    });
  },
  load() {
    const tokenBefore = (getApp().globalData && getApp().globalData.token) || "";
    const sequence = this._mineSequence = (this._mineSequence || 0) + 1;
    this.loadFeedbackSummary();
    this.loadRunner();
    return request("/me")
      .then((data) => {
        if (sequence !== this._mineSequence || tokenBefore !== getApp().globalData.token) return;
        const plans = (data.plans || []).map((item) => ({ ...item, raceId: item.race.id }));
        const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
        const upcoming = plans.filter((item) => item.race.raceDate >= today && !["完赛", "未完赛", "弃赛", "未中签"].includes(item.status)).sort((a, b) => a.race.raceDate.localeCompare(b.race.raceDate));
        const nextRace = upcoming.length ? { ...upcoming[0], days: Math.max(0, Math.round((Date.parse(upcoming[0].race.raceDate + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000)) } : null;
        const token = (getApp().globalData && getApp().globalData.token) || "";
        const base = (getApp().globalData && getApp().globalData.baseUrl) || "";
        const results = (data.results || []).map((item) => ({
          ...item,
          raceId: item.race.id + item.distance,
          proofSrc: item.hasProof ? base + "/marathon/api/me/races/" + item.race.id + "/result/proof?t=" + encodeURIComponent(token) + "&distance=" + encodeURIComponent(item.distance) : ""
        }));
        const reminders = (data.reminders || []).map((item) => ({ ...item, key: item.race.id + item.hit.key }));
        setAuth((getApp().globalData && getApp().globalData.token) || "", data.user.nickname, data.user.avatar);
        this.setData({
          plans,
          nextRace,
          results,
          career: data.career || this.data.career,
          reminders,
          conflicts: data.conflicts || [],
          nickname: data.user.nickname,
          nicknameDraft: data.user.nickname,
          avatar: data.user.avatar || "",
          leader: !!(data.user && data.user.leader),
          hasPassword: !!(data.user && data.user.hasPassword),
          hasWechatLogin: !!(data.user && data.user.hasWechatLogin),
          clubs: data.clubs || [],
          loaded: true
        });
        this.applyRunnerCareer();
      })
      .catch((err) => {
        if (sequence !== this._mineSequence || tokenBefore !== getApp().globalData.token) return;
        if (err.message === "请先登录") this.logout();
        else this.setData({ loaded: true, message: err.message, ok: false });
      });
  }
});
