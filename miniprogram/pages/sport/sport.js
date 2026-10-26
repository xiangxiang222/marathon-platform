const { request } = require("../../utils/request");
const { baseUrl } = require("../../config");

function thisMonth() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7);
}

Page({
  data: {
    ready: false,
    recordOpen: false,
    targetOpen: false,
    expandedRunId: null,
    targetPercent: 0,
    targetProgress: 0,
    runTypeOptions: ["跑步", "越野"],
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
    shotName: "",
    message: ""
  },
  onShow() {
    const app = getApp();
    const ready = !!(app && app.globalData && app.globalData.token);
    this.setData({ ready, month: this.data.month || thisMonth() });
    if (ready) this.load();
  },
  load() {
    return request("/runs?month=" + encodeURIComponent(this.data.month))
      .then((data) => {
        const token = (getApp().globalData && getApp().globalData.token) || "";
        data.runs = (data.runs || []).map((item) => ({
          ...item,
          typeIndex: item.type === "trail" ? 1 : 0,
          shotSrc: item.shot ? baseUrl + "/marathon/api/runs/" + item.id + "/shot?t=" + encodeURIComponent(token) : ""
        }));
        const percent = Number(data.month.target) > 0 ? (data.month.percent != null ? Number(data.month.percent) : Math.round(Number(data.month.km) / Number(data.month.target) * 100)) : 0;
        this.setData({
          targetPercent: Number.isFinite(percent) ? percent : 0,
          targetProgress: Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0)),
          summary: data,
          gender: data.month.gender || "",
          target: data.month.target ? String(data.month.target) : "",
          message: ""
        });
      })
      .catch((err) => {
        if (err.message === "请先登录") this.setData({ ready: false, summary: null });
        else this.setData({ message: err.message });
      });
  },
  login() { wx.setStorageSync("marathon_return_after_login", "/pages/sport/sport"); wx.switchTab({ url: "/pages/mine/mine" }); },
  toggleRecord() { this.setData({ recordOpen: !this.data.recordOpen }); },
  toggleTarget() { this.setData({ targetOpen: !this.data.targetOpen }); },
  toggleRun(e) { const id = e.currentTarget.dataset.id; this.setData({ expandedRunId: this.data.expandedRunId === id ? null : id }); },
  onRunType(e) {
    const index = Number(e.currentTarget.dataset.index), typeIndex = Number(e.detail.value);
    this.setData({ ["summary.runs[" + index + "].type"]: typeIndex === 1 ? "trail" : "run", ["summary.runs[" + index + "].typeIndex"]: typeIndex });
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
      .then(() => { this.setData({ targetOpen: false }); return this.load(); })
      .catch((err) => this.setData({ message: err.message }));
  },
  chooseShot() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      success: (res) => {
        const file = (res.tempFiles || [])[0];
        if (!file) return;
        this.shotPath = file.tempFilePath;
        this.setData({ shotName: "已选截图" });
      }
    });
  },
  uploadShot(id) {
    if (!this.shotPath) return Promise.resolve();
    const app = getApp();
    const filePath = this.shotPath;
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: app.globalData.baseUrl + "/marathon/api/runs/" + id + "/shot",
        filePath,
        name: "file",
        header: { Authorization: app.globalData.token ? "Bearer " + app.globalData.token : "" },
        success: (upload) => {
          if (upload.statusCode >= 200 && upload.statusCode < 300) resolve();
          else {
            let message = "截图没有传上去";
            try {
              message = JSON.parse(upload.data).error || message;
            } catch (err) {}
            reject(new Error(message));
          }
        },
        fail: () => reject(new Error("截图没有传上去"))
      });
    });
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
      .then((data) => this.uploadShot(data.run.id).then(() => data))
      .then((data) => {
        this.shotPath = "";
        this.setData({
          startedAt: "",
          distanceKm: "",
          duration: "",
          climb: "0",
          city: "",
          shotName: "",
          recordOpen: false,
          month: data.run.startedAt.slice(0, 7),
          message: data.note || ""
        });
        this.load();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  onCity(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ ["summary.runs[" + index + "].city"]: e.detail.value });
  },
  saveRow(e) {
    const item = this.data.summary.runs[e.currentTarget.dataset.index];
    request("/runs/" + item.id, "PUT", { type: item.type, city: item.city })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  addShot(e) {
    const item = this.data.summary.runs[e.currentTarget.dataset.index];
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      success: (res) => {
        const file = (res.tempFiles || [])[0];
        if (!file) return;
        this.shotPath = file.tempFilePath;
        this.uploadShot(item.id)
          .then(() => {
            this.shotPath = "";
            this.load();
          })
          .catch((err) => this.setData({ message: err.message }));
      }
    });
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
