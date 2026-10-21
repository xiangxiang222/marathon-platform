const { request } = require("../../utils/request");

Page({
  data: { meetup: null, members: [], forUser: "", forName: "", message: "" },
  onLoad(query) {
    this.clubId = query.club;
    this.meetupId = query.id;
  },
  onShow() {
    this.load();
  },
  load() {
    const app = getApp();
    Promise.all([
      request("/clubs/" + this.clubId + "/meetups/" + this.meetupId),
      request("/clubs/" + this.clubId)
    ])
      .then(([data, club]) => {
        const meetup = data.meetup;
        const token = app.globalData.token || "";
        meetup.photos = (meetup.photos || []).map((photo) => ({
          ...photo,
          src: app.globalData.baseUrl + "/marathon/api/clubs/" + this.clubId + "/meetups/" + this.meetupId + "/photos/" + photo.id + "?t=" + encodeURIComponent(token)
        }));
        this.setData({ meetup, members: club.members || [], message: "" });
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
  pickMember(e) {
    this.setData({ forUser: e.currentTarget.dataset.id, forName: e.currentTarget.dataset.name });
  },
  staffCheck() {
    request("/clubs/" + this.clubId + "/meetups/" + this.meetupId + "/check", "POST", { userId: Number(this.data.forUser) })
      .then(() => {
        this.setData({ message: "已补打卡" });
        this.load();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  resettle() {
    this.post("/resettle");
  },
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
