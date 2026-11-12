const { request } = require("../../utils/request");
const { baseUrl } = require("../../config");
const RUN_MODES = ["unknown", "road", "trail", "treadmill", "indoor", "track", "virtual"];

function thisMonth() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7);
}

function monthVisuals(month, summary) {
  const [year, selectedMonth] = month.split('-').map(Number);
  const daysInMonth = new Date(year, selectedMonth, 0).getDate();
  const weeks = Array.from({ length: Math.ceil(daysInMonth / 7) }, (_, index) => ({ label: `${index * 7 + 1}–${Math.min((index + 1) * 7, daysInMonth)}`, km: 0 }));
  for (const run of summary.runs || []) {
    if (run.type && !['run', 'trail'].includes(run.type)) continue;
    const day = Number(String(run.startedAt).slice(8, 10));
    const week = weeks[Math.floor((day - 1) / 7)];
    if (week) week.km += Number(run.volumeKm || 0);
  }
  const max = Math.max(...weeks.map((week) => week.km), 0);
  const peak = max > 0 ? weeks.findIndex((week) => week.km === max) : -1;
  const weeklyRuns = weeks.map((week, index) => ({ ...week, kmLabel: week.km.toFixed(1), height: week.km > 0 && max > 0 ? Math.max(8, Math.round(week.km / max * 100)) : 0, peak: index === peak }));
  return {
    monthLabel: `${year}年${selectedMonth}月`,
    weeklyRuns,
    weeklyChartLabel: '每周跑量：' + weeklyRuns.map((week) => `${week.label}日 ${week.kmLabel} 公里`).join('，'),
    targetRemaining: Math.max(0, Number(summary.month.target || 0) - Number(summary.month.km || 0)).toFixed(1)
  };
}

Page({
  data: {
    ready: false,
    recordOpen: false,
    targetOpen: false,
    expandedRunId: null,
    targetPercent: 0,
    targetProgress: 0,
    monthLabel: '',
    weeklyRuns: [],
    weeklyChartLabel: '',
    targetRemaining: '0.0',
    runTypeOptions: ["跑步·待确认", "户外跑", "越野", "跑步机", "室内跑", "操场跑", "虚拟跑"],
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
    const sequence = this._loadSequence = (this._loadSequence || 0) + 1;
    const selectedMonth = this.data.month;
    return request("/runs?month=" + encodeURIComponent(selectedMonth))
      .then((data) => {
        if (sequence !== this._loadSequence) return;
        const token = (getApp().globalData && getApp().globalData.token) || "";
        data.runs = (data.runs || []).map((item) => ({
          ...item,
          editRunMode: item.runMode || (item.type === "trail" ? "trail" : "road"),
          typeIndex: Math.max(0, RUN_MODES.indexOf(item.runMode || (item.type === "trail" ? "trail" : "road"))),
          editClimb: item.climb == null ? "" : String(item.climb),
          climbLabel: item.climb == null ? "未提供" : item.climb + " 米",
          shotSrc: item.shot ? baseUrl + "/marathon/api/runs/" + item.id + "/shot?t=" + encodeURIComponent(token) : ""
        }));
        const percent = Number(data.month.target) > 0 ? (data.month.percent != null ? Number(data.month.percent) : Math.round(Number(data.month.km) / Number(data.month.target) * 100)) : 0;
        this.setData({
          ...monthVisuals(selectedMonth, data),
          targetPercent: Number.isFinite(percent) ? percent : 0,
          targetProgress: Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0)),
          summary: data,
          gender: data.month.gender || "",
          target: data.month.target ? String(data.month.target) : "",
          message: ""
        });
      })
      .catch((err) => {
        if (sequence !== this._loadSequence) return;
        if (err.message === "请先登录") this.setData({ ready: false, summary: null });
        else this.setData({ message: err.message });
      });
  },
  login() { wx.setStorageSync("marathon_return_after_login", "/pages/sport/sport"); wx.switchTab({ url: "/pages/mine/mine" }); },
  goImport() { wx.navigateTo({ url: "/pages/runner/runner?view=devices" }); },
  toggleRecord() { this.setData({ recordOpen: !this.data.recordOpen }); },
  toggleTarget() { this.setData({ targetOpen: !this.data.targetOpen }); },
  toggleRun(e) { const id = e.currentTarget.dataset.id; this.setData({ expandedRunId: this.data.expandedRunId === id ? null : id }); },
  onRunType(e) {
    const index = Number(e.currentTarget.dataset.index), typeIndex = Number(e.detail.value);
    if (!RUN_MODES[typeIndex]) return;
    this.setData({ ["summary.runs[" + index + "].editRunMode"]: RUN_MODES[typeIndex], ["summary.runs[" + index + "].typeIndex"]: typeIndex });
  },
  onMonth(e) {
    this.setData({ month: e.detail.value });
    this.load();
  },
  shiftMonth(e) {
    const offset = Number(e.currentTarget.dataset.offset);
    const [year, selectedMonth] = this.data.month.split('-').map(Number);
    const shifted = new Date(Date.UTC(year, selectedMonth - 1 + offset, 1));
    this.setData({ month: shifted.toISOString().slice(0, 7) });
    return this.load();
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
  onClimb(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ ["summary.runs[" + index + "].editClimb"]: e.detail.value });
  },
  saveRow(e) {
    const item = this.data.summary.runs[e.currentTarget.dataset.index];
    const changes = { city: item.city };
    if (item.editRunMode && item.editRunMode !== (item.runMode || (item.type === "trail" ? "trail" : "road"))) changes.runMode = item.editRunMode;
    if (item.editClimb != null && String(item.editClimb).trim() !== "" && (item.climb == null || Number(item.editClimb) !== Number(item.climb))) changes.climb = item.editClimb;
    request("/runs/" + item.id, "PUT", changes)
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  addShot(e) {
    const item = this.data.summary && this.data.summary.runs[e.currentTarget.dataset.index];
    if (!item || item.source !== "manual") return;
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
