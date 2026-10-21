const { request } = require("../../utils/request");

Page({
  data: {
    activity: null,
    groups: [],
    checks: [],
    album: { photoCount: 0, videoCount: 0 },
    staff: false,
    km: "",
    message: "",
    clubId: "",
    activityId: ""
  },
  onLoad(query) {
    this.clubId = query.club;
    this.activityId = query.id;
    this.setData({ clubId: query.club, activityId: query.id });
  },
  onShow() {
    this.load();
  },
  load() {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId)
      .then((data) => {
        this.setData({
          activity: data.activity,
          groups: data.groups || [],
          checks: data.checks || [],
          album: data.album || { photoCount: 0, videoCount: 0 },
          staff: !!data.staff,
          km: data.activity.mine && data.activity.mine.km != null ? String(data.activity.mine.km) : this.data.km,
          message: ""
        });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  onKm(e) {
    this.setData({ km: e.detail.value });
  },
  cancel() {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/signup", "DELETE")
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  pacer() {
    const on = !(this.data.activity.mine && this.data.activity.mine.pacer);
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/pacer", "POST", { on })
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
  endActivity() {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/end", "POST", {})
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  cancelActivity() {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/cancel", "POST", {})
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  }
});