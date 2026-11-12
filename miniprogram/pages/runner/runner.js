const { normalizeResults } = require("../../utils/achievement-model");
const { request, ready } = require("../../utils/request");
const { VIEWS, decorate, shortKm, barsOf } = require("../../utils/runner-center");
const activityConsentVersion = require("../../utils/legal-documents").version;

const DEVICE_BRANDS = [
  { id: "garmin", name: "佳明", subtitle: "Garmin", icon: "/images/devices/garmin.png" },
  { id: "coros", name: "高驰", subtitle: "COROS", icon: "/images/devices/coros.png" },
  { id: "huawei", name: "华为运动健康", subtitle: "HUAWEI Health", icon: "/images/devices/huawei.png" },
  { id: "suunto", name: "颂拓", subtitle: "Suunto", icon: "/images/devices/suunto.png" }
];

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
    payload: null, posterAvailable: false,
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
    deleting: 0,
    deviceBusy: "",
    deviceMessage: "",
    deviceErrorDetail: "",
    deviceFailed: false,
    deviceGuideOpen: false,
    deviceDataOpen: false
  },
  onLoad(options) {
    this._unloaded = false;
    this._hidden = false;
    const view = VIEWS.find((item) => item.key === options.view) || VIEWS[0];
    this.setData({ view: view.key, currentView: view, galleryKind: view.key === "media" ? "photo" : "certificate" });
    wx.setNavigationBarTitle({ title: view.title });
  },
  onShow() {
    this._hidden = false;
    const token = getApp().globalData.token || "";
    if (token !== this._lastToken) {
      this._lastToken = token;
      this._fileSequence = (this._fileSequence || 0) + 1;
      this._activityConsentPending = false;
      this.setData({ payload: null, posterAvailable: false, filteredResults: [], gallery: [], cities: [], selectedCityKey: "", selectedCity: null, uploadOpen: false, uploadMessage: "", uploading: false, error: "", deviceBusy: "", deviceMessage: "", deviceErrorDetail: "", deviceFailed: false, deviceGuideOpen: false, deviceDataOpen: false });
    }
    this.setData({ ready: ready() });
    if (ready()) return this.load();
    this.setData({ payload: null, posterAvailable: false, loading: false, error: "", filteredResults: [], gallery: [], cities: [], selectedCityKey: "", selectedCity: null });
  },
  onHide() { this._hidden = true; this._fileSequence = (this._fileSequence || 0) + 1; this._activityConsentPending = false; this.setData({ deviceBusy: "" }); },
  onUnload() { this._unloaded = true; this._fileSequence = (this._fileSequence || 0) + 1; this._activityConsentPending = false; this._sequence = (this._sequence || 0) + 1; },
  onPullDownRefresh() {
    return this.load().finally(() => wx.stopPullDownRefresh());
  },
  login() {
    wx.setStorageSync("marathon_runner_return", this.data.view);
    wx.switchTab({ url: "/pages/mine/mine" });
  },
  openAchievementPoster(event) {
    if (!ready() || this._lastToken !== getApp().globalData.token) return;
    if (!normalizeResults(this.data.payload).length) {
      wx.showToast({ title: "先在赛事详情页记录完赛成绩", icon: "none" });
      wx.switchTab({ url: "/pages/races/races" });
      return;
    }
    wx.navigateTo({ url: "/pages/achievement-poster/achievement-poster?mode=results" });
  },
  pickView(event) {
    const view = VIEWS.find((item) => item.key === event.currentTarget.dataset.view);
    if (!view) return;
    this._fileSequence = (this._fileSequence || 0) + 1;
    this._activityConsentPending = false;
    if (["choose", "consent"].includes(this.data.deviceBusy)) this.setData({ deviceBusy: "" });
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
        const devices = Array.isArray(payload.devices) ? payload.devices : [];
        payload.devices = DEVICE_BRANDS.map((brand) => {
          const previous = devices.find((item) => item.id === brand.id);
          return { ...brand, status: "unavailable", statusLabel: "待开通", canDisconnect: !!(previous && previous.canDisconnect) };
        });
        this.setData({ ready: true, payload, posterAvailable: normalizeResults(payload).length > 0, loading: false });
        this.filter();
      })
      .catch((error) => {
        if (sequence !== this._sequence || token !== getApp().globalData.token) return;
        if (error.status === 401) this.setData({ ready: false, payload: null, posterAvailable: false, filteredResults: [], gallery: [], cities: [], selectedCityKey: "", selectedCity: null, loading: false, error: "登录已过期，请重新登录" });
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
      title: "删除这份收藏？", content: "只删除这份收藏文件，不影响比赛成绩。删除后无法恢复。", confirmText: "删除", confirmColor: "#e1251b",
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
  deviceSyncTime(value) {
    if (!value) return "";
    const raw = String(value);
    if (!/(Z|[+-]\d{2}:?\d{2})$/.test(raw)) return raw.replace("T", " ").slice(0, 16);
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? new Date(ms + 8 * 3600000).toISOString().slice(0, 16).replace("T", " ") + " 北京时间" : "";
  },
  toggleDeviceGuide() { this.setData({ deviceGuideOpen: !this.data.deviceGuideOpen }); },
  toggleDeviceData() { this.setData({ deviceDataOpen: !this.data.deviceDataOpen }); },
  deviceSession(token) { return !this._unloaded && !this._hidden && token === getApp().globalData.token; },
  openDeviceLegal(event) { const doc = event.currentTarget.dataset.doc; if (["privacy", "permissions"].includes(doc)) wx.navigateTo({ url: "/pages/legal/legal?doc=" + doc }); },
  activityFileSelectionFailed(token, error) {
    if (!this.deviceSession(token)) return;
    const raw = String((error && (error.errMsg || error.message)) || "");
    const errno = error && error.errno;
    this.setData({ deviceBusy: "" });
    if (/cancel/i.test(raw)) return;
    let message = "微信未能选取文件，请重试。可先将运动文件重新发送到文件传输助手，或使用网页版导入。";
    if (Number(errno) === 112 || /api scope.*not.*declared|appid privacy api banned/i.test(raw)) {
      message = "小程序尚未开通文件选择，请联系管理员更新隐私保护指引。你可以先使用网页版导入。";
    } else if ([103, 104].includes(Number(errno)) || /privacy|auth.*deny|auth.*denied|authorize|disagree/i.test(raw)) {
      message = "选择运动文件需要先同意隐私保护指引，请重新点击导入并完成授权。";
    }
    this.setData({
      deviceMessage: message,
      deviceFailed: true,
      deviceErrorDetail: "wx.chooseMessageFile\n" + (errno == null ? "" : "errno: " + errno + "\n") + (raw || "未返回具体错误")
    });
  },
  copyDeviceError() {
    if (this.data.deviceErrorDetail) wx.setClipboardData({ data: this.data.deviceErrorDetail });
  },
  copyDeviceImportUrl() {
    wx.setClipboardData({ data: getApp().globalData.baseUrl.replace(/\/$/, "") + "/marathon/runner?view=devices" });
  },
  chooseActivityFile() {
    if (this.data.deviceBusy || this._activityConsentPending) return;
    if (!ready()) { this.login(); return; }
    this.setData({ deviceMessage: "", deviceFailed: false, deviceErrorDetail: "" });
    if (typeof wx.chooseMessageFile !== "function") { this.setData({ deviceMessage: "当前微信版本无法选择文件，请更新微信或使用网页版导入。", deviceFailed: true }); return; }
    const token = getApp().globalData.token;
    const selection = this._fileSequence = (this._fileSequence || 0) + 1;
    this.setData({ deviceBusy: "choose" });
    const options = {
      count: 1, type: "file", extension: ["fit", "tcx"],
      success: (reply) => {
        if (!this.deviceSession(token) || selection !== this._fileSequence) return;
        this.setData({ deviceBusy: "" });
        const file = reply.tempFiles && reply.tempFiles[0];
        if (!file || !file.path) { this.setData({ deviceMessage: "未取得可读取的文件，请将 FIT 或 TCX 文件发送到文件传输助手后重新选择。", deviceFailed: true }); return; }
        if (!/\.(fit|tcx)$/i.test(file.name || "")) { this.setData({ deviceMessage: "请选择 FIT 或 TCX 运动文件", deviceFailed: true }); return; }
        if (file.size > 5 * 1024 * 1024) { this.setData({ deviceMessage: "运动文件不能超过 5 MB", deviceFailed: true }); return; }
        if (!file.size) { this.setData({ deviceMessage: "文件内容为空，请重新导出", deviceFailed: true }); return; }
        this.confirmActivityFile(file, token, selection);
      },
      fail: (error) => { if (selection === this._fileSequence) this.activityFileSelectionFailed(token, error); },
      complete: () => { if (selection === this._fileSequence && this.deviceSession(token) && this.data.deviceBusy === "choose") this.setData({ deviceBusy: "" }); }
    };
    try { wx.chooseMessageFile(options); }
    catch (error) { this.activityFileSelectionFailed(token, error); }
  },
  confirmActivityFile(file, token, selection) {
    if (!this.deviceSession(token) || selection !== this._fileSequence) return;
    this._activityConsentPending = true;
    const options = {
      title: "导入运动数据前确认",
      content: "完整运动文件可能包含 GPS 轨迹、心率等敏感个人信息。你同意本次临时上传并解析该文件，仅保存运动摘要与去重信息，不保留原文件、GPS 轨迹和心率。跑量及相关截图按你所在跑团的规则展示。取消不会上传，也不影响基本浏览。可在数据来源页阅读隐私政策与权限说明。",
      confirmText: "同意导入", cancelText: "取消", confirmColor: "#e1251b",
      success: (answer) => {
        if (!this.deviceSession(token) || selection !== this._fileSequence) return;
        this._activityConsentPending = false;
        if (answer.confirm) this.importActivityFile(file, token, activityConsentVersion);
      },
      fail: () => { if (this.deviceSession(token) && selection === this._fileSequence) this._activityConsentPending = false; }
    };
    try { wx.showModal(options); }
    catch (_) { if (this.deviceSession(token) && selection === this._fileSequence) { this._activityConsentPending = false; this.setData({ deviceBusy: "", deviceMessage: "未能打开运动数据确认，请重新选择文件后再试。", deviceFailed: true }); } }
  },
  importActivityFile(file, token, consentVersion) {
    if (this.data.deviceBusy || !this.deviceSession(token) || consentVersion !== activityConsentVersion) return;
    const globals = getApp().globalData;
    this.setData({ deviceBusy: "import", deviceMessage: "", deviceFailed: false });
    wx.uploadFile({
      url: globals.baseUrl + "/marathon/api/me/devices/import", filePath: file.path, name: "file", formData: { filename: file.name }, header: { Authorization: "Bearer " + token, "X-Activity-Data-Consent": consentVersion },
      success: (response) => {
        if (!this.deviceSession(token)) return;
        let result = {};
        try { result = JSON.parse(response.data); } catch (_) { /* A network error page is not a valid response. */ }
        if (response.statusCode < 200 || response.statusCode >= 300) { this.setData({ deviceMessage: result.error || "导入失败，请重新选择文件", deviceFailed: true }); return; }
        this.setData({ deviceMessage: result.note || (result.updated ? "已补全这场运动，数据已更新。" : result.imported ? "已导入 1 场运动，数据已更新。" : result.duplicates ? "这场运动已经记录过了，没有重复计入。" : "没有可导入的跑步或越野记录。"), deviceFailed: !result.imported && !result.duplicates && !result.updated });
        this.load();
      },
      fail: () => { if (this.deviceSession(token)) this.setData({ deviceMessage: "导入中断，请检查网络后重试", deviceFailed: true }); },
      complete: () => { if (this.deviceSession(token)) this.setData({ deviceBusy: "" }); }
    });
  },
  deviceAuthorizationInfo() {
    wx.showModal({ title: "首次授权请使用网页版", content: "请在本平台网页版的数据来源页面，登录同一个账号后前往厂商官方页面授权。连接完成后可回到小程序查看与同步。", showCancel: false, confirmText: "知道了" });
  },
  syncDevice(event) {
    if (this.data.deviceBusy) return;
    const provider = event.currentTarget.dataset.provider;
    const device = this.data.payload && this.data.payload.devices.find((item) => item.id === provider);
    if (!device || !["connected", "error"].includes(device.status)) return;
    const token = getApp().globalData.token;
    this.setData({ deviceBusy: provider, deviceMessage: "", deviceFailed: false });
    return request("/me/devices/" + encodeURIComponent(provider) + "/sync", "POST")
      .then((reply) => { if (!this.deviceSession(token)) return; this.setData({ deviceMessage: reply.imported ? "已同步 " + reply.imported + " 场运动，数据已更新。" : "同步完成，暂时没有新的运动记录。", deviceFailed: false }); return this.load(); })
      .catch((error) => { if (!this.deviceSession(token)) return; this.setData({ deviceMessage: error.message || "同步失败，请稍后重试", deviceFailed: true }); return this.load(); })
      .finally(() => { if (this.deviceSession(token)) this.setData({ deviceBusy: "" }); });
  },
  disconnectDevice(event) {
    if (this.data.deviceBusy) return;
    const provider = event.currentTarget.dataset.provider;
    const device = this.data.payload && this.data.payload.devices.find((item) => item.id === provider);
    if (!device || (!["connected", "error"].includes(device.status) && !device.canDisconnect)) return;
    const token = getApp().globalData.token;
    wx.showModal({
      title: device.status === "unavailable" ? "清除旧连接？" : "解除设备连接？", content: (device.status === "unavailable" ? "厂商接入尚未开通，将清除之前保留的连接凭据。" : "解除 " + device.name + " 后停止接收新的运动数据，") + "已保存的运动记录继续保留。", confirmText: device.status === "unavailable" ? "清除" : "解除连接", confirmColor: "#e1251b",
      success: (answer) => {
        if (!answer.confirm || !this.deviceSession(token) || this.data.deviceBusy) return;
        this.setData({ deviceBusy: provider, deviceMessage: "", deviceFailed: false });
        request("/me/devices/" + encodeURIComponent(provider), "DELETE")
          .then(() => { if (!this.deviceSession(token)) return; this.setData({ deviceMessage: device.status === "unavailable" ? "已清除旧连接，已保存的运动记录继续保留。" : "已解除连接，已保存的运动记录继续保留。", deviceFailed: false }); return this.load(); })
          .catch((error) => { if (this.deviceSession(token)) this.setData({ deviceMessage: error.message || "暂时无法解除连接", deviceFailed: true }); })
          .finally(() => { if (this.deviceSession(token)) this.setData({ deviceBusy: "" }); });
      }
    });
  },
  goSport() { wx.switchTab({ url: "/pages/sport/sport" }); },
  goRaces() { wx.switchTab({ url: "/pages/races/races" }); }
});
