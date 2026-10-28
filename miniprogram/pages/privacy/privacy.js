Page({
  data: {
    contractName: "小程序用户隐私保护指引",
    pending: false,
    message: ""
  },
  onShow() {
    const app = getApp();
    this.setData({ pending: (app.globalData.privacyResolvers || []).length > 0 });
    if (typeof wx.getPrivacySetting !== "function") return;
    wx.getPrivacySetting({
      success: (result) => {
        this.setData({ contractName: result.privacyContractName || "小程序用户隐私保护指引" });
      },
      fail: () => {}
    });
  },
  openContract() {
    if (typeof wx.openPrivacyContract !== "function") {
      this.setData({ message: "当前微信版本暂不支持打开隐私指引" });
      return;
    }
    wx.openPrivacyContract({
      fail: () => this.setData({ message: "隐私指引暂时无法打开，请稍后重试" })
    });
  },
  agreePrivacyAuthorization() {
    const app = getApp();
    const pending = app.globalData.privacyResolvers || [];
    app.globalData.privacyResolvers = [];
    app.globalData.privacyReferrers = [];
    pending.forEach((resolve) => resolve({ buttonId: "privacy-agree-btn", event: "agree" }));
    this.setData({ pending: false, message: "" });
    if (pending.length) wx.navigateBack({ delta: 1 });
  },
  decline() {
    const app = getApp();
    const pending = app.globalData.privacyResolvers || [];
    app.globalData.privacyResolvers = [];
    app.globalData.privacyReferrers = [];
    this.setData({ pending: false });
    pending.forEach((resolve) => resolve({ event: "disagree" }));
    if (pending.length) wx.navigateBack({ delta: 1 });
  },
  onUnload() {
    const app = getApp();
    app.globalData.privacyNavigating = false;
    const pending = app.globalData.privacyResolvers || [];
    app.globalData.privacyResolvers = [];
    app.globalData.privacyReferrers = [];
    pending.forEach((resolve) => resolve({ event: "disagree" }));
  }
});
