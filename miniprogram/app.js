const { baseUrl } = require("./config");
const { networkAvatar } = require("./utils/avatar");

App({
  globalData: {
    baseUrl,
    token: "",
    nickname: "",
    avatar: ""
  },
  onLaunch() {
    this.globalData.token = wx.getStorageSync("marathon_token") || "";
    this.globalData.nickname = wx.getStorageSync("marathon_name") || "";
    this.globalData.avatar = networkAvatar(wx.getStorageSync("marathon_avatar"), baseUrl);
  }
});
