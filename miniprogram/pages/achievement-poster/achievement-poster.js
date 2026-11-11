const { request, ready } = require("../../utils/request");
const { STYLES, MODES, QUOTES, normalizeResults, buildAchievementModel, paginateAchievement } = require("../../utils/achievement-model");
const { renderAchievementPoster } = require("../../utils/achievement-poster");
const account = () => String((getApp().globalData || {}).token || "");

Page({
  data: {
    ready: false, loading: true, error: "", modes: MODES, mode: "pb", styles: STYLES, style: "cream", quotes: QUOTES, quoteIndex: 0,
    years: ["全部年份"], yearIndex: 0, year: "", showName: true, showRace: true, showDate: true, showCity: false,
    selectionOpen: false, privacyOpen: false, choices: [], selectedCount: 0, availableCount: 0, emptyText: "",
    posterPath: "", generating: false, generateError: "", previewRatio: 1.25, pageIndex: 0, pageCount: 1, pageNumber: 1,
    saving: false, needsSetting: false, saveMessage: "", saved: false
  },
  onLoad(options) {
    this._alive = true; this._hidden = false; this._ticket = 0; this._generation = 0; this._selected = {};
    this.setData({ mode: options && options.mode === "results" ? "results" : "pb" });
    wx.hideShareMenu();
  },
  onReady() { this._canvasReady = true; if (this._model) this.generate(); },
  onShow() {
    this._alive = true; this._hidden = false;
    if (this._account !== account() || !this._payload) return this.load();
    if (!this.data.posterPath && this._model) this.generate();
  },
  onHide() { this._hidden = true; this.invalidate(); },
  onUnload() { this._alive = false; this._hidden = true; this.invalidate(); this._payload = null; this._model = null; this._selected = {}; },
  invalidate() {
    this._ticket = (this._ticket || 0) + 1; this._generation = (this._generation || 0) + 1;
    clearTimeout(this._renderTimer); this.clearPoster();
    if (this._alive) this.setData({ generating: false, saving: false, loading: false });
  },
  scope() { return { ticket: this._ticket, account: account() }; },
  current(scope) { return this._alive && !this._hidden && scope.ticket === this._ticket && scope.account === account(); },
  ensureAccount() {
    if (!this._alive || this._hidden) return false;
    if (this._account !== account()) { this.load(); return false; }
    return true;
  },
  removeFile(filePath) {
    if (!filePath) return;
    try { wx.getFileSystemManager().unlink({ filePath, fail() {} }); } catch (_) {}
  },
  clearPoster() { this.removeFile(this.data.posterPath); this.setData({ posterPath: "", saved: false }); },
  async load() {
    this.invalidate();
    this._account = account(); this._payload = null; this._records = []; this._nickname = ""; this._model = null; this._selected = {};
    this.setData({ ready: ready(), loading: ready(), error: "", choices: [], selectedCount: 0, availableCount: 0, saveMessage: "", needsSetting: false, generateError: "", pageIndex: 0, pageNumber: 1, pageCount: 1 });
    if (!ready()) { this.setData({ loading: false }); return; }
    const scope = this.scope();
    try {
      const [payload, identity] = await Promise.all([request("/me/runner?period=all&offset=0"), request("/me")]);
      if (!this.current(scope)) return;
      if (!identity.user || !identity.user.id) throw new Error("登录已失效，请重新登录");
      this._payload = payload; this._nickname = identity.user.nickname || "";
      this._records = normalizeResults(payload);
      const years = Array.from(new Set(this._records.map(row => row.raceDate.slice(0, 4)))).sort().reverse();
      const pb = buildAchievementModel(payload, { mode: "pb" });
      this._selected = { pb: new Set(pb.rows.map(row => row.key)), results: new Set(this._records.map(row => row.key)) };
      this.setData({ loading: false, years: ["全部年份"].concat(years), yearIndex: 0, year: "" });
      this.updateModel();
    } catch (error) {
      if (!this.current(scope)) return;
      this.setData({ loading: false, error: error.message || "暂时无法读取成绩，请重试", ready: error.status !== 401 });
    }
  },
  login() { wx.switchTab({ url: "/pages/mine/mine" }); },
  goRecord() { wx.switchTab({ url: "/pages/races/races" }); },
  updateModel() {
    if (!this.ensureAccount() || !this._payload) return;
    const available = buildAchievementModel(this._payload, { mode: this.data.mode, year: this.data.year }).rows;
    const selected = this._selected[this.data.mode] || new Set();
    const choices = available.map(row => ({ ...row, selected: selected.has(row.key) }));
    this._model = buildAchievementModel(this._payload, {
      mode: this.data.mode, style: this.data.style, year: this.data.year, selectedKeys: Array.from(selected), nickname: this._nickname,
      quote: QUOTES[this.data.quoteIndex], showName: this.data.showName, showRace: this.data.showRace, showDate: this.data.showDate, showCity: this.data.showCity
    });
    const count = paginateAchievement(this._model).length;
    this.setData({ choices, selectedCount: this._model.rows.length, availableCount: available.length, pageCount: count, pageIndex: 0, pageNumber: 1,
      emptyText: !available.length ? (this.data.mode === "pb" ? "还没有可展示的生涯 PB" : "这个年份还没有完赛成绩") : !this._model.rows.length ? "选几场成绩，写下你的高光" : "",
      saveMessage: "", generateError: "" });
    this.scheduleGenerate();
  },
  pickMode(e) { const mode = e.currentTarget.dataset.id; if (this.ensureAccount() && MODES.some(item => item.id === mode) && mode !== this.data.mode && !this.data.saving) { this.setData({ mode }); this.updateModel(); } },
  pickStyle(e) { const style = e.currentTarget.dataset.id; if (this.ensureAccount() && STYLES.some(item => item.id === style) && style !== this.data.style && !this.data.saving) { this.setData({ style }); this.updateModel(); } },
  pickYear(e) { const index = Number(e.detail.value); if (this.data.mode === "pb" || this.data.saving || !Number.isInteger(index) || !this.data.years[index]) return; this.setData({ yearIndex: index, year: index ? this.data.years[index] : "" }); this.updateModel(); },
  pickQuote(e) { const index = Number(e.detail.value); if (!this.data.saving && Number.isInteger(index) && QUOTES[index]) { this.setData({ quoteIndex: index }); this.updateModel(); } },
  toggleSelection() { if (!this.data.saving) this.setData({ selectionOpen: !this.data.selectionOpen }); },
  togglePrivacy() { if (!this.data.saving) this.setData({ privacyOpen: !this.data.privacyOpen }); },
  toggleResult(e) {
    if (!this.ensureAccount() || this.data.saving) return;
    const key = e.currentTarget.dataset.key;
    if (!this.data.choices.some(row => row.key === key)) return;
    const selected = this._selected[this.data.mode]; selected.has(key) ? selected.delete(key) : selected.add(key); this.updateModel();
  },
  selectAll() { if (this.ensureAccount() && !this.data.saving) { this.data.choices.forEach(row => this._selected[this.data.mode].add(row.key)); this.updateModel(); } },
  clearSelection() { if (this.ensureAccount() && !this.data.saving) { this.data.choices.forEach(row => this._selected[this.data.mode].delete(row.key)); this.updateModel(); } },
  changePrivacy(e) { const key = e.currentTarget.dataset.key; if (!this.data.saving && ["showName", "showRace", "showDate", "showCity"].includes(key)) { this.setData({ [key]: !!e.detail.value }); this.updateModel(); } },
  changePage(e) {
    const next = this.data.pageIndex + Number(e.currentTarget.dataset.direction);
    if (!this.ensureAccount() || this.data.saving || !Number.isInteger(next) || next < 0 || next >= this.data.pageCount) return;
    this.setData({ pageIndex: next, pageNumber: next + 1, saveMessage: "" }); this.scheduleGenerate();
  },
  scheduleGenerate() {
    clearTimeout(this._renderTimer); this._generation = (this._generation || 0) + 1; this.clearPoster();
    this.setData({ generating: !!(this._model && this._model.rows.length), generateError: "" });
    if (this._model && this._model.rows.length) this._renderTimer = setTimeout(() => this.generate(), 120);
  },
  canvasNode() {
    if (this._canvas) return Promise.resolve(this._canvas);
    return new Promise((resolve, reject) => {
      this.createSelectorQuery().select("#achievement-canvas").fields({ node: true, size: true }).exec(result => {
        const canvas = result && result[0] && result[0].node;
        if (!canvas) reject(new Error("绘图画布尚未就绪，请点击重试"));
        else { this._canvas = canvas; resolve(canvas); }
      });
    });
  },
  generate() {
    clearTimeout(this._renderTimer);
    if (!this.ensureAccount() || !this._canvasReady || !this._model || !this._model.rows.length) return Promise.resolve();
    const generation = this._generation = (this._generation || 0) + 1, scope = this.scope(), model = this._model, pageIndex = this.data.pageIndex;
    this.clearPoster(); this.setData({ generating: true, generateError: "", saveMessage: "" });
    const valid = () => this.current(scope) && generation === this._generation;
    const work = async () => {
      if (!valid()) return;
      try {
        const canvas = await this.canvasNode(); if (!valid()) return;
        const result = await renderAchievementPoster(canvas, model, { pageIndex }); if (!valid()) return;
        const file = await new Promise((resolve, reject) => wx.canvasToTempFilePath({ canvas, x: 0, y: 0, width: result.width, height: result.height,
          destWidth: result.width, destHeight: result.height, fileType: "png", quality: 1, success: resolve, fail: reject }, this));
        if (!valid()) { this.removeFile(file.tempFilePath); return; }
        this.setData({ posterPath: file.tempFilePath, generating: false, previewRatio: result.height / result.width });
      } catch (_) { if (valid()) this.setData({ generating: false, posterPath: "", generateError: "这张海报没有生成成功，再试一次吧。" }); }
    };
    this._renderQueue = (this._renderQueue || Promise.resolve()).catch(() => {}).then(work); return this._renderQueue;
  },
  previewPoster() {
    if (!this.ensureAccount() || !this.data.posterPath) return;
    wx.previewImage({ current: this.data.posterPath, urls: [this.data.posterPath] });
  },
  async savePoster() {
    if (!this.ensureAccount() || !this.data.posterPath || this.data.generating || this.data.saving) return;
    const scope = this.scope(), filePath = this.data.posterPath;
    this.setData({ saving: true, saveMessage: "" });
    try {
      const setting = await new Promise((resolve, reject) => wx.getSetting({ success: resolve, fail: reject }));
      if (!this.current(scope)) return;
      if (setting.authSetting && setting.authSetting["scope.writePhotosAlbum"] === false) {
        this.setData({ saving: false, needsSetting: true, saveMessage: "相册权限尚未开启。点「去设置」允许后，再保存这张海报。" }); return;
      }
      await new Promise((resolve, reject) => wx.saveImageToPhotosAlbum({ filePath, success: resolve, fail: reject }));
      if (this.current(scope)) this.setData({ saving: false, saved: true, needsSetting: false, saveMessage: this.data.pageCount > 1 ? "第 " + this.data.pageNumber + " 张已保存。切换下一张，可继续逐张保存。" : "已保存到相册，打开朋友圈就可以分享了。" });
    } catch (error) {
      if (!this.current(scope)) return;
      const denied = /auth|deny|denied|permission/i.test(String(error.errMsg || error.message || ""));
      this.setData({ saving: false, needsSetting: denied, saveMessage: denied ? "没有获得相册权限。你可以去设置开启，再点击保存。" : "暂时没有保存成功，请检查相册和存储空间后重试。" });
    }
  },
  openAlbumSettings() {
    if (!this.ensureAccount()) return;
    const scope = this.scope();
    wx.openSetting({ success: setting => { if (this.current(scope)) this.setData({ needsSetting: !(setting.authSetting && setting.authSetting["scope.writePhotosAlbum"]), saveMessage: setting.authSetting && setting.authSetting["scope.writePhotosAlbum"] ? "相册权限已开启，请再次点击保存。" : "相册权限仍未开启，你可以稍后重试。" }); } });
  }
});
