const { request } = require("../../utils/request");

Page({
  data: {
    activity: null,
    groups: [],
    signups: [],
    checks: [],
    media: [],
    groupId: 0,
    km: "",
    message: ""
  },
  onLoad(query) {
    this.clubId = query.club;
    this.activityId = query.id;
  },
  onShow() {
    this.load();
  },
  load() {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId)
      .then((data) => {
        const token = getApp().globalData.token || "";
        const base = getApp().globalData.baseUrl;
        const media = (data.media || []).map((item) => ({
          ...item,
          src: base + "/marathon/api/media/" + item.id + "?t=" + encodeURIComponent(token)
        }));
        this.setData({
          activity: data.activity,
          groups: data.groups || [],
          signups: data.signups || [],
          checks: data.checks || [],
          media,
          groupId: (data.activity.mine && data.activity.mine.groupId) || (data.groups[0] && data.groups[0].id) || 0,
          km: data.activity.mine && data.activity.mine.km != null ? String(data.activity.mine.km) : this.data.km,
          message: ""
        });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  pickGroup(e) {
    this.setData({ groupId: Number(e.currentTarget.dataset.id) });
  },
  onKm(e) {
    this.setData({ km: e.detail.value });
  },
  signup() {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/signup", "POST", { groupId: this.data.groupId })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  cancel() {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/signup", "DELETE")
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  check() {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/check", "POST", { km: Number(this.data.km) })
      .then((data) => {
        this.setData({ message: data.awarded ? "这场已记分" : "已记下。人数或里程还不够，这场先不计分" });
        this.load();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  choose() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image", "video"],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        const app = getApp();
        wx.uploadFile({
          url: app.globalData.baseUrl + "/marathon/api/clubs/" + this.clubId + "/activities/" + this.activityId + "/media",
          filePath: file.tempFilePath,
          name: "file",
          header: { Authorization: app.globalData.token ? "Bearer " + app.globalData.token : "" },
          success: (upload) => {
            if (upload.statusCode >= 200 && upload.statusCode < 300) this.load();
            else this.setData({ message: "没有传上去" });
          },
          fail: () => this.setData({ message: "没有传上去" })
        });
      }
    });
  }
});
