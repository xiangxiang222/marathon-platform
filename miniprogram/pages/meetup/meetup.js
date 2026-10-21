const { request } = require("../../utils/request");

Page({
  data: { meetup: null, message: "" },
  onLoad(query) {
    this.clubId = query.club;
    this.meetupId = query.id;
  },
  onShow() {
    this.load();
  },
  load() {
    const app = getApp();
    request("/clubs/" + this.clubId + "/meetups/" + this.meetupId)
      .then((data) => {
        const meetup = data.meetup;
        const token = app.globalData.token || "";
        meetup.photos = (meetup.photos || []).map((photo) => ({
          ...photo,
          src: app.globalData.baseUrl + "/marathon/api/clubs/" + this.clubId + "/meetups/" + this.meetupId + "/photos/" + photo.id + "?t=" + encodeURIComponent(token)
        }));
        this.setData({ meetup, message: "" });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  post(path, method) {
    request("/clubs/" + this.clubId + "/meetups/" + this.meetupId + path, method || "POST", {})
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  join() { this.post("/join"); },
  leave() { this.post("/join", "DELETE"); },
  check() { this.post("/check"); },
  uncheck() { this.post("/check", "DELETE"); },
  voidRun() { this.post("/void"); },
  copyText(e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.text || "" });
  },
  choose() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        const app = getApp();
        wx.uploadFile({
          url: app.globalData.baseUrl + "/marathon/api/clubs/" + this.clubId + "/meetups/" + this.meetupId + "/photos",
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
