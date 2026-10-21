const { request } = require("../../utils/request");

function thisMonth() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7);
}

Page({
  data: {
    ready: false,
    summary: null,
    month: "",
    gender: "",
    target: "",
    type: "run",
    startedAt: "",
    distanceKm: "",
    duration: "",
    climb: "0",
    city: "",
    message: ""
  },
  onShow() {
    const app = getApp();
    const ready = !!(app && app.globalData && app.globalData.token);
    this.setData({ ready, month: this.data.month || thisMonth() });
    if (ready) this.load();
  },
  load() {
    request("/runs?month=" + encodeURIComponent(this.data.month))
      .then((data) => {
        this.setData({
          summary: data,
          gender: data.month.gender || "",
          target: data.month.target ? String(data.month.target) : "",
          message: ""
        });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  onMonth(e) {
    this.setData({ month: e.detail.value });
    this.load();
  },
  pickGender(e) {
    this.setData({ gender: e.currentTarget.dataset.gender });
  },
  pickType(e) {
    this.setData({ type: e.currentTarget.dataset.type });
  },
  onField(e) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  saveFlag() {
    request("/runs-flag", "PUT", {
      month: this.data.month,
      targetKm: Number(this.data.target),
      gender: this.data.gender
    })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  create() {
    request("/runs", "POST", {
      type: this.data.type,
      startedAt: this.data.startedAt,
      distanceKm: Number(this.data.distanceKm),
      duration: this.data.duration,
      climb: Number(this.data.climb || 0),
      city: this.data.city
    })
      .then((data) => {
        this.setData({
          startedAt: "",
          distanceKm: "",
          duration: "",
          climb: "0",
          city: "",
          month: data.run.startedAt.slice(0, 7),
          message: data.note || ""
        });
        this.load();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  changeType(e) {
    const item = this.data.summary.runs[e.currentTarget.dataset.index];
    request("/runs/" + item.id, "PUT", { type: e.currentTarget.dataset.type, city: item.city })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  remove(e) {
    const item = this.data.summary.runs[e.currentTarget.dataset.index];
    request("/runs/" + item.id, "DELETE")
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  }
});
