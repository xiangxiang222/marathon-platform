const { request, ready } = require("../../utils/request");

Page({
  data: { club: null, clubInitial: "团", ready: false, loading: true, applying: false, error: "", shareOpen: false, timelineGuide: false },
  onLoad(query = {}) {
    this.disposed = false;
    this.clubId = query.id || "";
    this.inviteCode = query.code || "";
    this.applyAfterLogin = query.apply === "1";
    this.setSharing(false);
  },
  onShow() {
    this.setData({ ready: ready() });
    this.load();
  },
  onUnload() {
    this.disposed = true;
    this.loadVersion = (this.loadVersion || 0) + 1;
  },
  load() {
    const version = this.loadVersion = (this.loadVersion || 0) + 1;
    const path = this.inviteCode
      ? "/clubs/invite/" + encodeURIComponent(this.inviteCode)
      : "/clubs/" + encodeURIComponent(this.clubId) + "/public";
    request(path)
      .then((data) => {
        if (this.disposed || version !== this.loadVersion) return;
        this.clubId = String(data.club.id);
        this.setData({ club: data.club, clubInitial: String(data.club.name || "团").slice(0, 1), loading: false, error: "" });
        this.setSharing(true);
        if (this.applyAfterLogin && ready()) {
          this.applyAfterLogin = false;
          this.submitApplication();
        }
      })
      .catch((err) => {
        if (this.disposed || version !== this.loadVersion) return;
        this.setSharing(false);
        this.setData({ club: null, loading: false, error: err.message, shareOpen: false, timelineGuide: false });
      });
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
    if (this.disposed || this.data.applying || !this.data.club || this.data.club.pending) return;
    if (this.data.club.joined) {
      wx.redirectTo({ url: "/pages/club/club?id=" + this.data.club.id });
      return;
    }
    const version = this.loadVersion;
    const clubId = Number(this.data.club.id);
    this.setData({ applying: true, error: "" });
    request("/clubs/join", "POST", { clubId })
      .then((data) => {
        if (this.disposed || version !== this.loadVersion) return;
        if (data.joined) {
          wx.redirectTo({ url: "/pages/club/club?id=" + clubId });
          return;
        }
        this.setData({ "club.pending": true, applying: false });
      })
      .catch((err) => {
        if (this.disposed || version !== this.loadVersion) return;
        this.setData({ applying: false, error: err.message });
      });
  },
  enterClub() {
    if (!this.data.club) return;
    wx.navigateTo({ url: "/pages/club/club?id=" + this.data.club.id });
  },
  setSharing(enabled) {
    if (enabled && wx.showShareMenu) wx.showShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    if (!enabled && wx.hideShareMenu) wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
  },
  openShare() {
    if (!this.data.club || this.data.loading) return;
    this.setData({ shareOpen: true });
  },
  closeShare() {
    this.setData({ shareOpen: false });
  },
  showTimelineGuide() {
    if (!this.data.club) return;
    this.setData({ shareOpen: false, timelineGuide: true });
  },
  closeTimelineGuide() {
    this.setData({ timelineGuide: false });
  },
  stopTap() {},
  shareQuery() {
    const club = this.data.club || {};
    const id = club.id || this.clubId;
    if (id) return "id=" + encodeURIComponent(id);
    if (this.inviteCode) return "code=" + encodeURIComponent(this.inviteCode);
    return "";
  },
  onShareAppMessage() {
    const club = this.data.club || {};
    const query = this.shareQuery();
    this.setData({ shareOpen: false });
    return {
      title: (club.name || "跑团") + " · 一起开跑",
      path: query ? "/pages/club-intro/club-intro?" + query : "/pages/clubs/clubs"
    };
  },
  onShareTimeline() {
    const club = this.data.club || {};
    this.setData({ timelineGuide: false });
    return { title: (club.name || "跑团") + " · 一起开跑", query: this.shareQuery() };
  }
});
