const { request } = require("../../utils/request");

Page({
  data: { meetup: null, members: [], forUser: "", forName: "", message: "", loading: true },
  onLoad(query) {
    this.clubId = query.club;
    this.meetupId = query.id;
  },
  onShareAppMessage() {
    const meetup = this.data.meetup || {};
    return {
      title: meetup.shareText || "约跑邀请",
      path: "/pages/meetup/meetup?club=" + encodeURIComponent(this.clubId) + "&id=" + encodeURIComponent(this.meetupId)
    };
  },
  onShareTimeline() {
    const meetup = this.data.meetup || {};
    return {
      title: meetup.shareText || "约跑邀请",
      query: "club=" + encodeURIComponent(this.clubId) + "&id=" + encodeURIComponent(this.meetupId)
    };
  },
  onShow() {
    this.load();
  },
  load() {
    const app = getApp();
    const sequence = this._loadSequence = (this._loadSequence || 0) + 1;
    this.setData({ loading: true, message: "" });
    return Promise.all([
      request("/clubs/" + this.clubId + "/meetups/" + this.meetupId),
      request("/clubs/" + this.clubId)
    ])
      .then(([data, club]) => {
        if (sequence !== this._loadSequence) return;
        const meetup = data.meetup;
        meetup.joins = meetup.joins || [];
        const token = app.globalData.token || "";
        meetup.photos = (meetup.photos || []).map((photo) => ({
          ...photo,
          src: app.globalData.baseUrl + "/marathon/api/clubs/" + this.clubId + "/meetups/" + this.meetupId + "/photos/" + photo.id + "?t=" + encodeURIComponent(token)
        }));
        this.setData({ meetup, members: club.members || [], message: "" });
      })
      .catch((err) => { if (sequence === this._loadSequence) this.setData({ message: err.message || "约跑暂时无法加载，请重试" }); })
      .finally(() => { if (sequence === this._loadSequence) this.setData({ loading: false }); });
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
