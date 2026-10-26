const { request, ready } = require("../../utils/request");

Page({
  data: { club: null, clubInitial: "团", ready: false, loading: true, applying: false, error: "", applyAfterLogin: false },
  onLoad(query) {
    this.clubId = query.id || "";
    this.inviteCode = query.code || "";
    this.applyAfterLogin = query.apply === "1";
    wx.showShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
  },
  onShow() {
    this.setData({ ready: ready() });
    this.load();
  },
  load() {
    const path = this.inviteCode
      ? "/clubs/invite/" + encodeURIComponent(this.inviteCode)
      : "/clubs/" + encodeURIComponent(this.clubId) + "/public";
    request(path)
      .then((data) => {
        this.clubId = String(data.club.id);
        this.setData({ club: data.club, clubInitial: String(data.club.name || "团").slice(0, 1), loading: false, error: "" });
        if (this.applyAfterLogin && ready()) {
          this.applyAfterLogin = false;
          this.submitApplication();
        }
      })
      .catch((err) => this.setData({ loading: false, error: err.message }));
  },
  apply() {
    if (!this.data.club) return;
    if (!ready()) {
      wx.setStorageSync("marathon_pending_club_id", String(this.data.club.id));
      wx.switchTab({ url: "/pages/mine/mine" });
      return;
    }
    this.submitApplication();
  },
  submitApplication() {
    if (this.data.applying || !this.data.club) return;
    this.setData({ applying: true, error: "" });
    request("/clubs/join", "POST", { clubId: Number(this.data.club.id) })
      .then((data) => {
        if (data.joined) {
          wx.redirectTo({ url: "/pages/club/club?id=" + this.data.club.id });
          return;
        }
        this.setData({ "club.pending": true, applying: false });
      })
      .catch((err) => this.setData({ applying: false, error: err.message }));
  },
  enterClub() {
    wx.navigateTo({ url: "/pages/club/club?id=" + this.data.club.id });
  },
  onShareAppMessage() {
    const club = this.data.club || {};
    return {
      title: (club.name || "跑团") + " · 邀你加入",
      path: "/pages/club-intro/club-intro?id=" + (club.id || this.clubId)
    };
  },
  onShareTimeline() {
    const club = this.data.club || {};
    return { title: (club.name || "跑团") + " · 跑团介绍", query: "id=" + (club.id || this.clubId) };
  }
});
