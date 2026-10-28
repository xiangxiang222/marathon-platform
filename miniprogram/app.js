const { baseUrl } = require("./config");
const { networkAvatar } = require("./utils/avatar");

App({
  globalData: {
    baseUrl,
    token: "",
    nickname: "",
    avatar: "",
    privacyResolvers: [],
    privacyNavigating: false,
    privacyReferrers: []
  },
  onLaunch() {
    this.globalData.token = wx.getStorageSync("marathon_token") || "";
    this.globalData.nickname = wx.getStorageSync("marathon_name") || "";
    this.globalData.avatar = networkAvatar(wx.getStorageSync("marathon_avatar"), baseUrl);
    if (typeof wx.onNeedPrivacyAuthorization === "function") {
      wx.onNeedPrivacyAuthorization((resolve, eventInfo) => {
        this.globalData.privacyResolvers.push(resolve);
        if (eventInfo && eventInfo.referrer) this.globalData.privacyReferrers.push(eventInfo.referrer);
        if (this.globalData.privacyNavigating) return;
        const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
        if (pages.some((page) => page.route === "pages/privacy/privacy")) return;
        this.globalData.privacyNavigating = true;
        wx.navigateTo({
          url: "/pages/privacy/privacy",
          fail: () => {
            this.globalData.privacyResolvers.splice(0).forEach((pending) => pending({ event: "disagree" }));
            this.globalData.privacyNavigating = false;
          }
        });
      });
    }
  }
});
