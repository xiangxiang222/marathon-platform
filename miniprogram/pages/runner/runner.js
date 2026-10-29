const { request, ready } = require("../../utils/request");
const { VIEWS, decorate, shortKm, barsOf } = require("../../utils/runner-center");

const METRICS = [
  { key: "count", label: "完赛场数", unit: "场" },
  { key: "km", label: "比赛里程", unit: "公里" },
  { key: "seconds", label: "完赛时间", unit: "小时" },
  { key: "paceSec", label: "平均配速", unit: "分/公里" }
];

Page({
  data: {
    views: VIEWS,
    view: "stats",
    currentView: VIEWS[0],
    ready: false,
    loading: false,
    error: "",
    payload: null,
    period: "week",
    offset: 0,
    periods: [{ key: "week", label: "周" }, { key: "month", label: "月" }, { key: "year", label: "年" }, { key: "all", label: "累计" }],
    years: ["全部年份"],
    year: "",
    yearIndex: 0,
    kind: "all",
    kinds: [{ key: "all", label: "全部" }, { key: "road", label: "路跑" }, { key: "trail", label: "越野" }, { key: "other", label: "其他" }],
    filteredResults: [],
    cities: [],
    selectedCityKey: "",
    selectedCity: null,
    provinceCount: 0,
    cityEventCount: 0,
    metric: "count",
    metrics: METRICS,
    trendBars: [],
    paceRows: [],
    metricUnit: "场",
    galleryKind: "certificate",
    gallery: [],
    galleryCounts: { certificate: 0, medal: 0, photo: 0, video: 0 },
    uploadOpen: false,
    uploadIndex: 0,
    uploading: false,
    uploadMessage: "",
    deleting: 0
  },
  onLoad(options) {
    const view = VIEWS.find((item) => item.key === options.view) || VIEWS[0];
    this.setData({ view: view.key, currentView: view, galleryKind: view.key === "media" ? "photo" : "certificate" });
    wx.setNavigationBarTitle({ title: view.title });
  },
  onShow() {
    const token = getApp().globalData.token || "";
    if (token !== this._lastToken) {
      this._lastToken = token;
      this.setData({ payload: null, filteredResults: [], gallery: [], cities: [], selectedCityKey: "", selectedCity: null, uploadOpen: false, uploadMessage: "", uploading: false, error: "" });
    }
    this.setData({ ready: ready() });
    if (ready()) return this.load();
    this.setData({ payload: null, loading: false, error: "", filteredResults: [], gallery: [], cities: [], selectedCityKey: "", selectedCity: null });
  },
  onUnload() { this._sequence = (this._sequence || 0) + 1; },
  onPullDownRefresh() {
    return this.load().finally(() => wx.stopPullDownRefresh());
  },
  login() {
    wx.setStorageSync("marathon_runner_return", this.data.view);
    wx.switchTab({ url: "/pages/mine/mine" });
  },
  pickView(event) {
    const view = VIEWS.find((item) => item.key === event.currentTarget.dataset.view);
    if (!view) return;
    this.setData({ view: view.key, currentView: view, uploadOpen: false, uploadMessage: "", galleryKind: view.key === "media" ? "photo" : "certificate" });
    wx.setNavigationBarTitle({ title: view.title });
    this.filter();
  },
  load() {
    if (!ready()) { this.setData({ ready: false }); return Promise.resolve(); }
    const sequence = this._sequence = (this._sequence || 0) + 1;
    const token = getApp().globalData.token;
    this.setData({ loading: true, error: "" });
    return request("/me/runner?period=" + this.data.period + "&offset=" + this.data.offset)
      .then((data) => {
        if (sequence !== this._sequence || token !== getApp().globalData.token) return;
        const payload = decorate(data);
        this.setData({ ready: true, payload, loading: false });
        this.filter();
      })
      .catch((error) => {
        if (sequence !== this._sequence || token !== getApp().globalData.token) return;
        if (error.status === 401) this.setData({ ready: false, payload: null, filteredResults: [], gallery: [], cities: [], selectedCityKey: "", selectedCity: null, loading: false, error: "登录已过期，请重新登录" });
        else this.setData({ loading: false, error: error.message || "暂时无法加载，请重试", ...(this.data.payload ? { period: this.data.payload.training.period, offset: this.data.payload.training.offset } : {}) });
      });
  },
  pickPeriod(event) {
    const period = event.currentTarget.dataset.period;
    if (!this.data.periods.some((item) => item.key === period) || period === this.data.period) return;
    this.setData({ period, offset: 0 });
    return this.load();
  },
  movePeriod(event) {
    if (this.data.loading || this.data.period === "all") return;
    const direction = Number(event.currentTarget.dataset.direction);
    if (direction !== -1 && direction !== 1) return;
    const offset = Math.min(0, this.data.offset + direction);
    if (offset === this.data.offset) return;
    this.setData({ offset });
    return this.load();
  },
  pickYear(event) {
    const index = Number(event.detail.value);
    this.setData({ yearIndex: index, year: index ? this.data.years[index] : "" });
    this.filter();
  },
  pickKind(event) {
    const kind = event.currentTarget.dataset.kind;
    if (!this.data.kinds.some((item) => item.key === kind)) return;
    this.setData({ kind });
    this.filter();
  },
  pickCity(event) {
    const key = event.currentTarget.dataset.key;
    if (!this.data.cities.some((item) => item.key === key)) return;
    const selectedCityKey = this.data.selectedCityKey === key ? "" : key;
    this.setData({ selectedCityKey, selectedCity: this.data.cities.find((item) => item.key === selectedCityKey) || null });
  },
  pickMetric(event) {
    const metric = event.currentTarget.dataset.metric;
    if (!METRICS.some((item) => item.key === metric)) return;
    this.setData({ metric });
    this.filter();
  },
  pickGallery(event) {
    const galleryKind = event.currentTarget.dataset.kind;
    if (!["certificate", "medal", "photo", "video"].includes(galleryKind)) return;
    this.setData({ galleryKind, uploadMessage: "" });
    this.filter();
  },
  filter() {
    const payload = this.data.payload;
    if (!payload) return;
    const galleryView = this.data.view === "honors" || this.data.view === "media";
    const years = Array.from(new Set(payload.career.years.map(String).concat(galleryView ? payload.collection.map((item) => item.year).filter((item) => /^\d{4}$/.test(item)) : []))).sort().reverse();
    const year = years.includes(this.data.year) ? this.data.year : "";
    this.setData({ year, years: ["全部年份"].concat(years), yearIndex: year ? years.indexOf(year) + 1 : 0 });
    const results = payload.results.filter((item) => {
      const day = item.race.raceDate || "";
      const parsed = Date.parse(day + "T00:00:00Z");
      return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === day && day <= payload.asOf && (!this.data.year || item.year === this.data.year);
    });
    const places = new Map();
    const provinces = new Set();
    const eventIds = new Set();
    for (const item of results) {
      if (item.race.meet === "online") continue;
      if (item.race.province) provinces.add(item.race.province);
      if (!item.race.city) continue;
      eventIds.add(item.race.id);
      const key = (item.race.province || "") + ":" + item.race.city;
      if (!places.has(key)) places.set(key, { key, name: item.race.city, province: item.race.province || "", ids: new Set(), date: item.race.raceDate, results: [] });
      places.get(key).ids.add(item.race.id);
      places.get(key).results.push(item);
      if (item.race.raceDate > places.get(key).date) places.get(key).date = item.race.raceDate;
    }
    const cities = Array.from(places.values()).map((item) => ({ key: item.key, name: item.name, province: item.province, count: item.ids.size, date: item.date, results: item.results.slice().sort((a, b) => b.race.raceDate.localeCompare(a.race.raceDate)) })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const selectedCity = cities.find((item) => item.key === this.data.selectedCityKey) || null;
    const metric = METRICS.find((item) => item.key === this.data.metric) || METRICS[0];
    const trends = payload.career.trends || [];
    const trendBars = metric.key === "paceSec" ? [] : barsOf(trends.map((item) => ({ key: String(item.year), label: String(item.year), km: metric.key === "seconds" ? (item.seconds || 0) / 3600 : item[metric.key] || 0 })));
    const paceRows = trends.map((item) => {
      const valid = Number.isFinite(item.paceSec) && item.paceSec > 0;
      const seconds = valid ? Math.round(item.paceSec) : null;
      return { key: String(item.year), year: String(item.year), value: valid ? Math.floor(seconds / 60) + "′" + String(seconds % 60).padStart(2, "0") + "″" : "—", available: valid };
    });
    const galleryCounts = { certificate: 0, medal: 0, photo: 0, video: 0 };
    for (const item of payload.collection) if (galleryCounts[item.kind] != null) galleryCounts[item.kind] += 1;
    this.setData({
      filteredResults: results.filter((item) => this.data.kind === "all" || item.category === this.data.kind),
      cities, selectedCity, selectedCityKey: selectedCity ? selectedCity.key : "", provinceCount: provinces.size, cityEventCount: eventIds.size,
      trendBars, paceRows, metricUnit: metric.unit,
      gallery: payload.collection.filter((item) => item.kind === this.data.galleryKind && (!this.data.year || item.year === this.data.year)),
      galleryCounts
    });
  },
  openUpload() {
    if (!this.data.payload || !this.data.payload.results.length) { wx.showToast({ title: "先记录一场完赛成绩", icon: "none" }); return; }
    this.setData({ uploadOpen: true, uploadIndex: 0, uploadMessage: "" });
  },
  closeUpload() { if (!this.data.uploading) this.setData({ uploadOpen: false, uploadMessage: "" }); },
  noop() {},
  pickUploadResult(event) { this.setData({ uploadIndex: Number(event.detail.value), uploadMessage: "" }); },
  chooseUpload() {
    if (this.data.uploading || !this.data.payload) return;
    const result = this.data.payload.results[this.data.uploadIndex];
    if (!result) return;
    const isVideo = this.data.galleryKind === "video";
    wx.chooseMedia({
      count: 1,
      mediaType: [isVideo ? "video" : "image"],
      sourceType: ["album", "camera"],
      maxDuration: 60,
      sizeType: ["compressed"],
      success: (data) => {
        const file = data.tempFiles && data.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        const maximum = (isVideo ? 40 : 8) * 1024 * 1024;
        if (file.size > maximum) { this.setData({ uploadMessage: isVideo ? "视频请控制在 40MB 以内" : "图片请控制在 8MB 以内" }); return; }
        this.upload(file.tempFilePath, result);
      },
      fail: (error) => { if (!/cancel/.test(String(error.errMsg || ""))) this.setData({ uploadMessage: "无法读取文件，请重新选择" }); }
    });
  },
  upload(filePath, result) {
    const globals = getApp().globalData;
    const token = globals.token;
    this.setData({ uploading: true, uploadMessage: "正在上传，请稍候…" });
    const query = "?raceId=" + encodeURIComponent(result.race.id) + "&distance=" + encodeURIComponent(result.distance) + "&kind=" + encodeURIComponent(this.data.galleryKind);
    wx.uploadFile({
      url: globals.baseUrl + "/marathon/api/me/runner/media" + query,
      filePath, name: "file", header: { Authorization: "Bearer " + token },
      success: (response) => {
        if (token !== getApp().globalData.token) return;
        let data = {};
        try { data = JSON.parse(response.data); } catch (_) { /* The server may return an unavailable page. */ }
        if (response.statusCode < 200 || response.statusCode >= 300) { this.setData({ uploadMessage: data.error || "上传失败，请稍后重试" }); return; }
        this.setData({ uploadOpen: false, uploadMessage: "" });
        wx.showToast({ title: "已放入收藏", icon: "success" });
        this.load();
      },
      fail: () => { if (token === getApp().globalData.token) this.setData({ uploadMessage: "上传中断，请检查网络后重试" }); },
      complete: () => { if (token === getApp().globalData.token) this.setData({ uploading: false }); }
    });
  },
  preview(event) {
    const item = this.data.gallery.find((row) => row.key === event.currentTarget.dataset.key);
    if (!item || item.kind === "video") return;
    wx.previewImage({ current: item.src, urls: this.data.gallery.filter((row) => row.kind !== "video").map((row) => row.src) });
  },
  deleteMedia(event) {
    const id = Number(event.currentTarget.dataset.id);
    const item = this.data.payload && this.data.payload.media.find((row) => row.id === id);
    if (!item || this.data.deleting) return;
    wx.showModal({
      title: "删除这份收藏？", content: "只删除这份收藏文件，不影响比赛成绩。删除后无法恢复。", confirmText: "删除", confirmColor: "#ff0a30",
      success: (answer) => {
        if (!answer.confirm) return;
        this.setData({ deleting: id });
        request("/me/runner/media/" + id, "DELETE")
          .then(() => this.load())
          .catch((error) => wx.showToast({ title: error.message || "删除失败，请重试", icon: "none" }))
          .finally(() => this.setData({ deleting: 0 }));
      }
    });
  },
  goSport() { wx.switchTab({ url: "/pages/sport/sport" }); },
  goRaces() { wx.switchTab({ url: "/pages/races/races" }); }
});
