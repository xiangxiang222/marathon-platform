const { request } = require("../../utils/request");

Page({
  data: {
    activity: null,
    items: [],
    photos: [],
    videos: [],
    tab: "photo",
    photoCount: 0,
    videoCount: 0,
    photoLeft: 400,
    videoLeft: 20,
    staff: false,
    review: false,
    layout: "grid",
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
    const app = getApp();
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/album")
      .then((data) => {
        const token = app.globalData.token || "";
        const base = app.globalData.baseUrl;
        const items = (data.items || []).map((item) => ({
          ...item,
          src: base + "/marathon/api/media/" + item.id + "?t=" + encodeURIComponent(token)
        }));
        this.setData({
          activity: data.activity,
          items,
          photos: items.filter((item) => item.kind === "photo"),
          videos: items.filter((item) => item.kind === "video"),
          photoCount: data.photoCount || 0,
          videoCount: data.videoCount || 0,
          photoLeft: data.photoLeft,
          videoLeft: data.videoLeft,
          staff: !!data.staff,
          review: !!data.review,
          message: ""
        });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  showPhotos() {
    this.setData({ tab: "photo" });
  },
  showVideos() {
    this.setData({ tab: "video" });
  },
  toggleLayout() {
    this.setData({ layout: this.data.layout === "grid" ? "fall" : "grid" });
  },
  choose() {
    wx.chooseMedia({
      count: 9,
      mediaType: ["image", "video"],
      success: (res) => this.uploadAll(res.tempFiles || [])
    });
  },
  uploadAll(files) {
    const next = files[0];
    if (!next) {
      this.load();
      return;
    }
    const app = getApp();
    wx.uploadFile({
      url: app.globalData.baseUrl + "/marathon/api/clubs/" + this.clubId + "/activities/" + this.activityId + "/media",
      filePath: next.tempFilePath,
      name: "file",
      header: { Authorization: app.globalData.token ? "Bearer " + app.globalData.token : "" },
      success: (upload) => {
        if (upload.statusCode >= 200 && upload.statusCode < 300) this.uploadAll(files.slice(1));
        else {
          let message = "没有传上去";
          try {
            message = JSON.parse(upload.data).error || message;
          } catch (err) {}
          this.setData({ message });
          this.load();
        }
      },
      fail: () => {
        this.setData({ message: "没有传上去" });
        this.load();
      }
    });
  },
  remove(e) {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/media/" + e.currentTarget.dataset.id, "DELETE")
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  approve(e) {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/media/" + e.currentTarget.dataset.id + "/approve", "POST", {})
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  cover(e) {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/cover", "POST", { mediaId: Number(e.currentTarget.dataset.id) })
      .then(() => {
        this.setData({ message: "已设为封面" });
        this.load();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  toggleReview() {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId, "PUT", { review: !this.data.review })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  }
});
