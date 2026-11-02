const { request, ready, clearAuth } = require("../../utils/request");
const history = require("../../utils/race-history");
const consentVersion = require("../../utils/legal-documents").version;

const endpoint = "/me/race-history";
const entryPath = id => endpoint + "/" + encodeURIComponent(id);
const messageOf = error => error && error.message || "没有完成，请稍后重试";

Page({
  data: {
    ready: false, loading: false, busy: "", error: "", message: "", mode: "growth", section: "history",
    entries: [], visibleEntries: [], summary: null, hero: null, asOf: "", years: ["全部年份"], yearIndex: 0, keyword: "",
    selected: null, review: null, materialsOpen: false, editor: null, editorId: "", editorError: "",
    importText: "", candidates: [], warnings: [], importError: "", importSuccess: "", selectedCount: 0, canConfirm: false,
    distances: history.DISTANCES, statuses: history.STATUSES, timings: history.TIMINGS, kinds: history.KINDS, meets: history.MEETS,
    mediaKinds: history.MEDIA, mediaKindIndex: 0
  },
  onLoad(options) {
    this._unloaded = false;
    this._epoch = 0;
    this._initialId = options.id ? String(options.id) : "";
    if (options.import === "1") this.setData({ section: "import" });
  },
  onShow() {
    const token = getApp().globalData.token || "";
    if (token !== this._lastToken) {
      const section = this._lastToken === undefined ? this.data.section : "history";
      this._lastToken = token;
      this._epoch = (this._epoch || 0) + 1;
      this._loadSequence = (this._loadSequence || 0) + 1;
      this._detailSequence = (this._detailSequence || 0) + 1;
      this.setData({ section, entries: [], visibleEntries: [], summary: null, hero: null, selected: null, review: null, editor: null, editorId: "", candidates: [], importText: "", warnings: [], importError: "", importSuccess: "", error: "", message: "", busy: "", loading: false, years: ["全部年份"], yearIndex: 0, keyword: "", selectedCount: 0, canConfirm: false });
      this.setData({ ready: ready() });
      if (ready()) return this.load().then(() => { if (this._initialId) { const id = this._initialId; this._initialId = ""; return this.openEntryId(id); } });
      return Promise.resolve();
    }
    this.setData({ ready: ready() });
    if (ready() && !this.data.summary && !this.data.loading) return this.load();
    return Promise.resolve();
  },
  onUnload() { this._unloaded = true; this._epoch = (this._epoch || 0) + 1; this._loadSequence = (this._loadSequence || 0) + 1; this._detailSequence = (this._detailSequence || 0) + 1; },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  session() { return { token: getApp().globalData.token || "", epoch: this._epoch }; },
  current(session) { return !this._unloaded && session.epoch === this._epoch && session.token && session.token === getApp().globalData.token; },
  login() { wx.setStorageSync("marathon_return_after_login", "/pages/history/history"); wx.switchTab({ url: "/pages/mine/mine" }); },
  expire(error) {
    if (error.status !== 401) return;
    clearAuth();
    this._epoch = (this._epoch || 0) + 1;
    this.setData({ ready: false, section: "history", entries: [], visibleEntries: [], summary: null, hero: null, selected: null, review: null, editor: null, editorId: "", candidates: [], importText: "", warnings: [], keyword: "", selectedCount: 0, canConfirm: false, busy: "", loading: false });
  },
  load() {
    if (!ready()) return Promise.resolve();
    const session = this.session(), sequence = this._loadSequence = (this._loadSequence || 0) + 1;
    this.setData({ loading: true, error: "" });
    return request(endpoint).then(data => {
      if (!this.current(session) || sequence !== this._loadSequence) return;
      const entries = history.decorateList(data.entries || []);
      const years = ["全部年份"].concat(Array.from(new Set(entries.map(item => item.year).filter(Boolean))).sort().reverse());
      const previousYear = this.data.years[this.data.yearIndex];
      const yearIndex = previousYear && years.includes(previousYear) ? years.indexOf(previousYear) : 0;
      this.setData({ entries, summary: data.summary, asOf: data.asOf, years, yearIndex, loading: false, hero: entries.find(item => item.isPb && item.improvementSeconds > 0) || entries.find(item => item.isPb) || entries[entries.length - 1] || null });
      this.filter();
    }).catch(error => {
      if (!this.current(session) || sequence !== this._loadSequence) return;
      this.expire(error);
      this.setData({ loading: false, error: messageOf(error) });
    });
  },
  filter() { const year = this.data.yearIndex ? this.data.years[this.data.yearIndex] : "", keyword = this.data.keyword.trim().toLowerCase(); this.setData({ visibleEntries: this.data.entries.filter(item => (!year || item.year === year) && (!keyword || (item.name + " " + (item.city || "")).toLowerCase().includes(keyword))) }); },
  searchInput(event) { this.setData({ keyword: event.detail.value || "" }); this.filter(); },
  pickMode(event) { const mode = event.currentTarget.dataset.mode; if (["growth", "memory"].includes(mode)) this.setData({ mode }); },
  pickYear(event) { this.setData({ yearIndex: Number(event.detail.value) || 0 }); this.filter(); },
  openImport() { if (!ready()) return this.login(); if (!this.data.busy) { this._detailSequence = (this._detailSequence || 0) + 1; this.setData({ section: "import", selected: null, review: null, editor: null, message: "", error: "", loading: false }); } },
  backHistory() { if (this.data.busy) return; this._detailSequence = (this._detailSequence || 0) + 1; this.setData({ section: "history", selected: null, review: null, editor: null, message: "", error: "" }); },
  openEntry(event) { return this.openEntryId(event.currentTarget.dataset.id); },
  openEntryId(id) {
    if (!id || this.data.busy) return Promise.resolve();
    this._detailId = id;
    const session = this.session(), sequence = this._detailSequence = (this._detailSequence || 0) + 1;
    this.setData({ section: "review", selected: null, review: null, error: "", message: "", loading: true, materialsOpen: false, editor: null });
    return request(entryPath(id)).then(data => {
      if (!this.current(session) || sequence !== this._detailSequence) return;
      this.setData({ selected: history.decorateEntry(data.entry), review: data.review, loading: false });
    }).catch(error => { if (this.current(session) && sequence === this._detailSequence) { this.expire(error); this.setData({ error: messageOf(error), loading: false }); } });
  },
  retryEntry() { if (this._detailId) return this.openEntryId(this._detailId); return this.backHistory(); },
  toggleMaterials() { this.setData({ materialsOpen: !this.data.materialsOpen }); },
  openAdd() { if (!ready()) return this.login(); if (!this.data.busy) this.setData({ editor: history.formEntry(history.blankEntry()), editorId: "", editorError: "", section: "edit" }); },
  editEntry() { if (this.data.selected && !this.data.busy) this.setData({ editor: history.formEntry(this.data.selected), editorId: this.data.selected.id, editorError: "", section: "edit" }); },
  closeEditor() { if (!this.data.busy) this.setData({ section: this.data.selected ? "review" : "history", editor: null, editorError: "" }); },
  clearRaceAssociation() { if (this.data.editor && !this.data.busy) this.setData({ "editor.raceId": "", editorError: "" }); },
  onEditor(event) { const field = event.currentTarget.dataset.field; if (!this.data.busy && this.data.editor && ["name", "raceDate", "city", "province", "netTime", "gunTime", "unknownTime", "bib", "story"].includes(field)) this.setData({ ["editor." + field]: event.detail.value, editorError: "" }); },
  editorPick(event) {
    if (this.data.busy || !this.data.editor) return;
    const field = event.currentTarget.dataset.field, tables = { distance: history.DISTANCES, status: history.STATUSES, timing: history.TIMINGS, kind: history.KINDS, meet: history.MEETS };
    const options = tables[field], index = Number(event.detail.value);
    if (options && options[index]) this.setData({ ["editor." + field]: options[index].key, ["editor." + field + "Index"]: index, editorError: "", ...(field === "status" && options[index].key !== "finished" ? { "editor.netTime": "", "editor.gunTime": "", "editor.unknownTime": "", "editor.timing": "unknown", "editor.timingIndex": 2 } : {}) });
  },
  toggleEditorTag(event) {
    if (!this.data.editor || this.data.busy) return;
    const text = event.currentTarget.dataset.tag, tags = this.data.editor.tags.slice();
    if (!history.TAGS.includes(text)) return;
    const index = tags.indexOf(text); if (index >= 0) tags.splice(index, 1); else tags.push(text);
    this.setData({ "editor.tags": tags, "editor.selectedTags": history.TAGS.map(tag => ({ text: tag, selected: tags.includes(tag) })) });
  },
  saveEntry() {
    if (this.data.busy || !this.data.editor) return Promise.resolve();
    const item = this.data.editor;
    const invalid = history.validation(item);
    if (invalid) { this.setData({ editorError: invalid }); return Promise.resolve(); }
    const session = this.session(), id = this.data.editorId;
    this.setData({ busy: "save", editorError: "" });
    return request(id ? entryPath(id) : endpoint, id ? "PATCH" : "POST", history.payload(item)).then(async data => {
      if (!this.current(session)) return;
      const entry = data.entry || data;
      this.setData({ editor: null, selected: entry.id ? history.decorateEntry(entry) : null, review: data.review || null, section: entry.id ? "review" : "history", message: "已保存到你的跑史", busy: "" });
      await this.load();
      if (entry.id && this.current(session)) return this.openEntryId(entry.id);
    }).catch(error => { if (this.current(session)) { this.expire(error); this.setData({ editorError: messageOf(error) }); } }).finally(() => { if (this.current(session)) this.setData({ busy: "" }); });
  },
  deleteEntry() {
    if (!this.data.selected || this.data.busy) return;
    const entry = this.data.selected, session = this.session();
    wx.showModal({ title: "移除这场跑史？", content: entry.id.startsWith("result:") ? "这场将从新跑史隐藏，原有赛事成绩和收藏仍保留。" : "移除这场经历及其资料，无法撤销。", confirmText: "移除", confirmColor: "#ff0a30", success: answer => {
      if (!answer.confirm || !this.current(session) || this.data.busy) return;
      this.setData({ busy: "delete", message: "" });
      request(entryPath(entry.id), "DELETE").then(() => {
        if (!this.current(session)) return;
        this.setData({ section: "history", selected: null, review: null, busy: "", message: "已移除" }); return this.load();
      }).catch(error => { if (this.current(session)) { this.expire(error); this.setData({ message: messageOf(error) }); } }).finally(() => { if (this.current(session)) this.setData({ busy: "" }); });
    } });
  },
  onImportText(event) { if (!this.data.busy) this.setData({ importText: event.detail.value, importError: "", importSuccess: "", candidates: [], selectedCount: 0, canConfirm: false }); },
  previewImport() {
    if (this.data.busy) return Promise.resolve();
    if (!this.data.importText.trim()) { this.setData({ importError: "先粘贴比赛资料，或选择成绩截图" }); return Promise.resolve(); }
    const session = this.session(); this.setData({ busy: "parse", importError: "", importSuccess: "" });
    return request(endpoint + "/import/preview", "POST", { text: this.data.importText }).then(data => {
      if (!this.current(session)) return;
      const candidates = (data.candidates || []).map((item, index) => ({ ...history.formEntry(item), candidateId: item.candidateId || String(index), selected: false, acknowledged: false, issues: (item.issues || []).map(issue => typeof issue === "string" ? issue : issue.message || "请核对这一项") }));
      this.setData({ candidates, warnings: data.warnings || [], importError: candidates.length ? "" : "没有识别出比赛。可调整文字后重试，或手动补一场。" }); this.updateConfirm();
    }).catch(error => { if (this.current(session)) { this.expire(error); this.setData({ importError: messageOf(error) }); } }).finally(() => { if (this.current(session)) this.setData({ busy: "" }); });
  },
  updateConfirm() { const candidates = this.data.candidates.map(item => ({ ...item, validationMessage: history.validation(item) })), selected = candidates.filter(item => item.selected); this.setData({ candidates, selectedCount: selected.length, canConfirm: selected.length > 0 && selected.every(item => item.acknowledged && !item.validationMessage && !item.duplicateId) }); },
  selectCandidate(event) { if (this.data.busy) return; const index = Number(event.currentTarget.dataset.index), item = this.data.candidates[index]; if (item && !item.duplicateId) { this.setData({ ["candidates[" + index + "].selected"]: !item.selected }); this.updateConfirm(); } },
  acknowledgeCandidate(event) { const index = Number(event.currentTarget.dataset.index), item = this.data.candidates[index]; if (item && !this.data.busy) { this.setData({ ["candidates[" + index + "].acknowledged"]: !item.acknowledged }); this.updateConfirm(); } },
  onCandidate(event) { const index = Number(event.currentTarget.dataset.index), field = event.currentTarget.dataset.field; if (!this.data.candidates[index] || !["name", "raceDate", "city", "netTime", "gunTime", "unknownTime"].includes(field) || this.data.busy) return; this.setData({ ["candidates[" + index + "]." + field]: event.detail.value, ["candidates[" + index + "].acknowledged"]: false }); this.updateConfirm(); },
  candidatePick(event) { const index = Number(event.currentTarget.dataset.index), field = event.currentTarget.dataset.field, tables = { distance: history.DISTANCES, status: history.STATUSES, timing: history.TIMINGS, kind: history.KINDS, meet: history.MEETS }, value = Number(event.detail.value), options = tables[field]; if (!this.data.candidates[index] || !options || !options[value] || this.data.busy) return; const prefix = "candidates[" + index + "]."; this.setData({ [prefix + field]: options[value].key, [prefix + field + "Index"]: value, [prefix + "acknowledged"]: false, ...(field === "status" && options[value].key !== "finished" ? { [prefix + "netTime"]: "", [prefix + "gunTime"]: "", [prefix + "unknownTime"]: "", [prefix + "timing"]: "unknown", [prefix + "timingIndex"]: 2 } : {}) }); this.updateConfirm(); },
  confirmImport() {
    if (this.data.busy || !this.data.canConfirm) return Promise.resolve();
    const session = this.session(), candidates = this.data.candidates.filter(item => item.selected).map(history.payload);
    this.setData({ busy: "confirm", importError: "", importSuccess: "" });
    return request(endpoint + "/import/confirm", "POST", { candidates }).then(data => {
      if (!this.current(session)) return;
      this.setData({ candidates: [], selectedCount: 0, canConfirm: false, importSuccess: "已加入 " + (data.created || 0) + " 场，跳过 " + (data.skipped || 0) + " 条重复记录。现在可以回到跑史查看回顾。", importText: "" }); return this.load();
    }).catch(error => { if (this.current(session)) { this.expire(error); this.setData({ importError: messageOf(error) }); } }).finally(() => { if (this.current(session)) this.setData({ busy: "" }); });
  },
  fileFailure(error) {
    const raw = String(error && error.errMsg || ""); if (/cancel/i.test(raw)) return "";
    if (Number(error && error.errno) === 112 || /privacy|auth.*deny|scope.*declared/i.test(raw)) return "微信暂时无法选择资料，请核对隐私授权，或使用文字粘贴与网页版导入。";
    return "没有读到资料，请重新选择；也可以粘贴成绩文字。";
  },
  chooseTextFile() {
    if (this.data.busy || !ready()) return;
    if (typeof wx.chooseMessageFile !== "function") { this.setData({ importError: "当前微信无法选择文件，请粘贴文字或使用网页版。" }); return; }
    const session = this.session();
    this.setData({ busy: "choose", importError: "" });
    wx.chooseMessageFile({ count: 1, type: "file", extension: ["csv", "tsv", "txt", "json"], success: data => {
      if (!this.current(session)) return;
      const file = data.tempFiles && data.tempFiles[0];
      if (!file || !file.path) { this.setData({ busy: "" }); return; }
      if (file.size > 512 * 1024) { this.setData({ busy: "", importError: "文字文件请控制在 512KB 以内" }); return; }
      wx.getFileSystemManager().readFile({ filePath: file.path, encoding: "utf8", success: result => { if (this.current(session)) this.setData({ busy: "", importText: String(result.data || ""), importError: "", importSuccess: "", candidates: [], selectedCount: 0, canConfirm: false }); }, fail: () => { if (this.current(session)) this.setData({ busy: "", importError: "文件读取失败，请用 UTF-8 编码保存后重试。" }); } });
    }, fail: error => { if (this.current(session)) this.setData({ busy: "", importError: this.fileFailure(error) }); } });
  },
  chooseScreenshots() {
    if (this.data.busy || !ready()) return;
    const session = this.session(); this.setData({ busy: "consent", importError: "" });
    wx.showModal({ title: "识别我的成绩资料", content: "选中的图片会上传到本平台服务器，临时识别赛事与成绩，不发送第三方，不保留原图。图片可能含姓名、证件或运动信息，请仅选择本人资料；可以先遮盖无关信息。识别后由你核对，原图需另选上传才会保存。是否同意本次解析？", confirmText: "同意并选择", success: answer => {
      if (!this.current(session)) return;
      if (!answer.confirm) { this.setData({ busy: "" }); return; }
      wx.chooseMedia({ count: 5, mediaType: ["image"], sourceType: ["album", "camera"], sizeType: ["original", "compressed"], success: data => {
        if (!this.current(session)) return;
        return this.recognizeFiles(data.tempFiles || [], session);
      }, fail: error => { if (this.current(session)) this.setData({ busy: "", importError: this.fileFailure(error) }); } });
    }, fail: () => { if (this.current(session)) this.setData({ busy: "" }); } });
  },
  uploadFile(path, filePath, session, extra) {
    return new Promise((resolve, reject) => {
      const headers = { Authorization: "Bearer " + session.token };
      if (extra && extra.recognize) headers["X-Race-History-Consent"] = consentVersion;
      wx.uploadFile({ url: getApp().globalData.baseUrl.replace(/\/$/, "") + "/marathon/api" + path, filePath, name: "file", timeout: 60000, header: headers,
        success: response => { let data; try { data = JSON.parse(response.data); } catch (_) { reject(new Error("服务器未返回有效内容，请重试")); return; } if (response.statusCode >= 200 && response.statusCode < 300) resolve(data); else { const error = new Error(data.error || "上传失败，请重试"); error.status = response.statusCode; reject(error); } },
        fail: () => reject(new Error("上传中断，请检查网络后重试")) });
    });
  },
  async recognizeFiles(files, session) {
    const texts = [], warnings = [], failed = [];
    for (let index = 0; index < files.length; index++) {
      if (!this.current(session)) return;
      const file = files[index];
      if (!file.tempFilePath || file.size > 8 * 1024 * 1024) { failed.push("第 " + (index + 1) + " 张超过 8MB 或无法读取"); continue; }
      this.setData({ busy: "识别 " + (index + 1) + "/" + files.length + " 张" });
      try { const data = await this.uploadFile(endpoint + "/recognize", file.tempFilePath, session, { recognize: true }); if (!this.current(session)) return; if (data.text && data.text.trim()) texts.push(data.text.trim()); else failed.push("第 " + (index + 1) + " 张没有读到文字"); warnings.push(...(data.warnings || [])); }
      catch (error) { if (!this.current(session)) return; if (error.status === 401) { this.expire(error); this.setData({ error: "登录已过期，请重新登录" }); return; } failed.push("第 " + (index + 1) + " 张：" + messageOf(error)); }
    }
    if (!this.current(session)) return;
    const text = [this.data.importText.trim()].concat(texts).filter(Boolean).join("\n\n");
    this.setData({ busy: "", importText: text, warnings: Array.from(new Set(warnings)), importError: failed.join("；"), importSuccess: texts.length ? "已识别 " + texts.length + " 张，请检查文字后点击「整理比赛」。" : "", ...(texts.length ? { candidates: [], selectedCount: 0, canConfirm: false } : {}) });
  },
  pickMediaKind(event) { this.setData({ mediaKindIndex: Number(event.detail.value) || 0 }); },
  chooseMedia() {
    if (!this.data.selected || this.data.busy) return;
    const session = this.session(), id = this.data.selected.id, kind = history.MEDIA[this.data.mediaKindIndex].key;
    this.setData({ busy: "choose-media", message: "" });
    wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"], sizeType: ["compressed"], success: async data => {
      if (!this.current(session)) return;
      const file = data.tempFiles && data.tempFiles[0];
      if (!file || !file.tempFilePath) { this.setData({ busy: "" }); return; }
      if (file.size > 8 * 1024 * 1024) { this.setData({ busy: "", message: "图片不超过 8MB" }); return; }
      this.setData({ busy: "upload-media" });
      try { await this.uploadFile(entryPath(id) + "/media?kind=" + kind, file.tempFilePath, session); if (!this.current(session)) return; this.setData({ busy: "" }); await this.openEntryId(id); await this.load(); }
      catch (error) { if (this.current(session)) { this.expire(error); this.setData({ busy: "", message: messageOf(error) }); } }
    }, fail: error => { if (this.current(session)) this.setData({ busy: "", message: this.fileFailure(error) }); } });
  },
  previewMedia(event) { const selected = this.data.selected; if (!selected) return; const item = selected.media.find(file => String(file.id) === String(event.currentTarget.dataset.id)); if (item && item.src && !item.isVideo) wx.previewImage({ current: item.src, urls: selected.media.filter(file => file.src && !file.isVideo).map(file => file.src) }); },
  setCover(event) { return this.changeDetail({ coverMediaId: event.currentTarget.dataset.id }); },
  changeDetail(body) {
    if (!this.data.selected || this.data.busy) return Promise.resolve();
    const session = this.session(), id = this.data.selected.id; this.setData({ busy: "update", message: "" });
    return request(entryPath(id), "PATCH", body).then(data => { if (!this.current(session)) return; this.setData({ selected: history.decorateEntry(data.entry), review: data.review, busy: "" }); return this.load(); }).catch(error => { if (this.current(session)) { this.expire(error); this.setData({ message: messageOf(error) }); } }).finally(() => { if (this.current(session)) this.setData({ busy: "" }); });
  },
  deleteMedia(event) {
    if (!this.data.selected || this.data.busy) return;
    const id = this.data.selected.id, mediaId = event.currentTarget.dataset.id, session = this.session();
    if (this.data.selected.media.some(item => String(item.id) === String(mediaId) && item.inherited)) return;
    wx.showModal({ title: "删除这份资料？", content: "只删除这份资料，不改变比赛成绩。", confirmText: "删除", confirmColor: "#ff0a30", success: answer => {
      if (!answer.confirm || !this.current(session) || this.data.busy) return;
      this.setData({ busy: "delete-media", message: "" });
      request(entryPath(id) + "/media/" + encodeURIComponent(mediaId), "DELETE").then(async () => { if (!this.current(session)) return; this.setData({ busy: "" }); await this.openEntryId(id); await this.load(); }).catch(error => { if (this.current(session)) { this.expire(error); this.setData({ message: messageOf(error) }); } }).finally(() => { if (this.current(session)) this.setData({ busy: "" }); });
    } });
  },
  chooseExport() {
    if (!this.data.entries.length || this.data.busy) return;
    const session = this.session();
    wx.showActionSheet({ itemList: ["JSON · 保存与回导", "CSV · 在表格中查看"], success: answer => { if (this.current(session)) return this.exportHistory(answer.tapIndex === 1 ? "csv" : "json"); } });
  },
  exportHistory(format) {
    if (!this.data.entries.length || this.data.busy) return Promise.resolve();
    const session = this.session(); this.setData({ busy: "export", message: "" });
    return request(endpoint).then(data => {
      if (!this.current(session)) return;
      const entries = (data.entries || []).map(history.exportEntry), csv = format === "csv", extension = csv ? "csv" : "json";
      const text = csv ? history.csvExport(entries) : JSON.stringify({ format: "race-history", version: 1, exportedAt: new Date().toISOString(), entries }, null, 2);
      const filePath = wx.env && wx.env.USER_DATA_PATH + "/my-race-history-" + Date.now() + "." + extension;
      if (filePath && typeof wx.shareFileMessage === "function") {
        const remove = () => wx.getFileSystemManager().unlink({ filePath, fail: () => {} });
        wx.getFileSystemManager().writeFile({ filePath, data: text, encoding: "utf8", success: () => { if (!this.current(session)) { remove(); return; } wx.shareFileMessage({ filePath, fileName: "我的跑史." + extension, fail: error => { if (this.current(session) && !/cancel/i.test(String(error.errMsg || ""))) this.setData({ message: "暂时无法发送文件，可使用网页版导出。" }); }, complete: remove }); }, fail: () => { if (this.current(session)) this.setData({ message: "暂时无法写入文件，请使用网页版导出。" }); } });
      } else wx.setClipboardData({ data: text, success: () => { if (this.current(session)) this.setData({ message: "跑史 " + extension.toUpperCase() + " 已复制，不包含登录凭证和私密图片链接。" }); } });
    }).catch(error => { if (this.current(session)) { this.expire(error); this.setData({ message: messageOf(error) }); } }).finally(() => { if (this.current(session)) this.setData({ busy: "" }); });
  },
  copyWebUrl() { wx.setClipboardData({ data: getApp().globalData.baseUrl.replace(/\/$/, "") + "/marathon/history" }); }
});
