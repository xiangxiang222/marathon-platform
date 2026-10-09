const { baseUrl } = require("./config");

App({
  globalData: {
    baseUrl,
    token: "",
    nickname: ""
  },
  onLaunch() {
    this.globalData.token = wx.getStorageSync("marathon_token") || "";
    this.globalData.nickname = wx.getStorageSync("marathon_name") || "";
  }
});
