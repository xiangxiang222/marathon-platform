const { request, ready, clearAuth } = require("../../utils/request");

const CATEGORIES = [{ key: "all", label: "全部" }, { key: "feature", label: "功能建议" }, { key: "ui", label: "界面设计" }, { key: "bug", label: "问题反馈" }, { key: "other", label: "其他" }];
const MODULES = [{ key: "other", label: "其他 / 整体体验" }, { key: "races", label: "赛事" }, { key: "clubs", label: "跑团" }, { key: "sport", label: "运动与设备" }, { key: "profile", label: "我的与跑者档案" }];
const SORTS = [{ key: "hot", label: "热门" }, { key: "new", label: "最新" }, { key: "adopted", label: "已采纳" }];
function tokenOf() { return getApp().globalData.token || ""; }
function niceDate(value) { return String(value || "").slice(0, 10).replace(/-/g, "."); }
function photoUrl(value) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return getApp().globalData.baseUrl + (value[0] === "/" ? "" : "/") + value;
}
function decorate(item) {
  if (!item) return null;
  return { ...item, categoryLabel: (CATEGORIES.find((option) => option.key === item.category) || CATEGORIES[4]).label, moduleLabel: (MODULES.find((option) => option.key === item.module) || MODULES[0]).label, dateLabel: niceDate(item.createdAt), updateLabel: niceDate(item.updatedAt), images: (item.images || []).map((image) => ({ ...image, url: photoUrl(image.url) })), events: (item.events || []).map((event, index) => ({ ...event, key: index + ":" + event.createdAt, dateLabel: niceDate(event.createdAt) })), publicShare: Boolean(item.publishedAt) && !["pending", "withdrawn"].includes(item.status) };
}
function confirm(title, content) { return new Promise((resolve) => wx.showModal({ title, content, confirmColor: "#e1251b", success: (result) => resolve(result.confirm), fail: () => resolve(false) })); }

Page({
  data: {
    ready: false, id: 0, loading: false, busy: false, error: "", actionError: "", notice: "", items: [], detail: null,
    category: "all", categories: CATEGORIES, formCategories: CATEGORIES.slice(1), sort: "hot", sorts: SORTS, mine: false,
    page: 1, pages: 1, total: 0, summary: { published: 0, adopted: 0 }, unread: 0,
    composeOpen: false, draft: { title: "", body: "", category: "feature", module: "other" }, modules: MODULES, moduleIndex: 0, draftImages: [],
    claimOpen: false, claim: { receiver: "", phone: "", address: "" }, consent: false, rulesOpen: false
  },
  onLoad(options) {
    this._unloaded = false;
    const id = /^\d+$/.test(String(options.id || "")) ? Number(options.id) : 0;
    this._wantCompose = options.compose === "1";
    this.setData({ id, mine: options.mine === "1" });
    this.updateTitle();
  },
  onShow() {
    const token = tokenOf();
    if (token !== this._lastToken) {
      this._lastToken = token;
      this._sequence = (this._sequence || 0) + 1;
      this.setData({ detail: null, items: [], error: "", actionError: "", notice: "", busy: false, claimOpen: false, claim: { receiver: "", phone: "", address: "" }, consent: false, composeOpen: false, draftImages: [] });
      this.restoreDraft();
    }
    this.setData({ ready: ready() });
    if (this._wantCompose) {
      this._wantCompose = false;
      if (ready()) return this.openCompose();
      this.login("compose"); return Promise.resolve();
    }
    if (this.data.mine && !ready()) { this.login("mine"); return Promise.resolve(); }
    return this.load();
  },
  onHide() { this.saveDraft(); },
  onUnload() { this.saveDraft(); this._unloaded = true; this._sequence = (this._sequence || 0) + 1; },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()); },
  updateTitle() { wx.setNavigationBarTitle({ title: this.data.composeOpen ? "提个建议" : this.data.id ? "建议详情" : "共创建议" }); },
  live(token) { return !this._unloaded && token === tokenOf(); },
  expired() {
    const action = this.data.composeOpen ? "compose" : this.data.mine && !this.data.id ? "mine" : "";
    this.saveDraft(); clearAuth();
    this.setData({ ready: false, busy: false, loading: false, detail: null, items: [], composeOpen: false, claimOpen: false, claim: { receiver: "", phone: "", address: "" }, consent: false, error: "登录已过期，请重新登录后继续。", actionError: "" });
    this.updateTitle(); this.login(action);
  },
  setSharing() {
    if (!this.data.id || (this.data.detail && this.data.detail.publicShare)) wx.showShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    else wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
  },
  onShareAppMessage() { const item = this.data.detail; return item && item.publicShare ? { title: item.title + " · 一起完善赛历", path: "/pages/feedback/feedback?id=" + item.id } : { title: "好想法，一起跑出来 · 赛历共创建议", path: "/pages/feedback/feedback" }; },
  onShareTimeline() { const item = this.data.detail; return item && item.publicShare ? { title: item.title + " · 赛历共创建议", query: "id=" + item.id } : { title: "好想法，一起跑出来 · 赛历共创建议", query: "" }; },
  login(action) {
    const suffix = action === "compose" ? "?compose=1" : action === "mine" ? "?mine=1" : this.data.id ? "?id=" + this.data.id : "";
    wx.setStorageSync("marathon_return_after_login", "/pages/feedback/feedback" + suffix);
    wx.switchTab({ url: "/pages/mine/mine" });
  },
  load() {
    if (this.data.composeOpen) return Promise.resolve();
    if (this.data.mine && !ready()) return Promise.resolve();
    const sequence = this._sequence = (this._sequence || 0) + 1, token = tokenOf();
    this.setData({ loading: true, error: "", actionError: "" });
    const url = this.data.id ? "/feedback/" + this.data.id : "/feedback?category=" + this.data.category + "&sort=" + this.data.sort + "&page=" + this.data.page + "&mine=" + (this.data.mine ? "1" : "0");
    return request(url).then((data) => {
      if (!this.live(token) || sequence !== this._sequence) return;
      if (this.data.id) {
        this.setDetail(data);
        if (data.isMine && data.unread) request("/feedback/" + this.data.id + "/read", "POST", { revision: data.revision }).catch(() => {});
      } else {
        this.setData({ items: (data.items || []).map(decorate), pages: data.pages || 1, page: data.page || 1, total: data.total || 0, unread: data.unread || 0, summary: data.summary || { published: 0, adopted: 0 } });
        this.setSharing();
      }
      this.setData({ loading: false, ready: ready() });
    }).catch((error) => {
      if (!this.live(token) || sequence !== this._sequence) return;
      if (error.status === 401) { this.expired(); return; }
      this.setData({ loading: false, error: error.message || "暂时无法加载，请重试" });
    });
  },
  setDetail(value) { this.setData({ detail: decorate(value), claimOpen: false, claim: { receiver: "", phone: "", address: "" }, consent: false }); this.setSharing(); },
  pickScope(event) {
    const mine = event.currentTarget.dataset.scope === "mine";
    if (mine && !ready()) { this.login("mine"); return; }
    if (mine === this.data.mine) return;
    this.setData({ mine, page: 1, items: [] }); return this.load();
  },
  pickCategory(event) { const category = event.currentTarget.dataset.key; if (!CATEGORIES.some((item) => item.key === category)) return; this.setData({ category, page: 1, items: [] }); return this.load(); },
  pickSort(event) { const sort = event.currentTarget.dataset.key; if (!SORTS.some((item) => item.key === sort)) return; this.setData({ sort, page: 1, items: [] }); return this.load(); },
  movePage(event) { if (this.data.loading) return; const direction = Number(event.currentTarget.dataset.direction), page = this.data.page + direction; if (![1, -1].includes(direction) || page < 1 || page > this.data.pages) return; this.setData({ page, items: [] }); wx.pageScrollTo({ scrollTop: 0, duration: 180 }); return this.load(); },
  openDetail(event) { const id = Number(event.currentTarget.dataset.id); if (id > 0) wx.navigateTo({ url: "/pages/feedback/feedback?id=" + id }); },
  backToBoard() { wx.redirectTo({ url: "/pages/feedback/feedback" }); },
  toggleRules() { this.setData({ rulesOpen: !this.data.rulesOpen }); },
  restoreDraft() {
    const key = this.draftKey();
    const stored = ready() && key ? wx.getStorageSync(key) : null;
    const draft = { title: "", body: "", category: "feature", module: "other" };
    if (stored && typeof stored === "object") { draft.title = String(stored.title || "").slice(0, 80); draft.body = String(stored.body || "").slice(0, 3000); if (CATEGORIES.slice(1).some((item) => item.key === stored.category)) draft.category = stored.category; if (MODULES.some((item) => item.key === stored.module)) draft.module = stored.module; }
    this.setData({ draft, moduleIndex: Math.max(0, MODULES.findIndex((item) => item.key === draft.module)) });
  },
  draftKey() { return this._ownerToken === tokenOf() && Number.isSafeInteger(this._ownerId) && this._ownerId > 0 ? "marathon_feedback_draft_user_" + this._ownerId : ""; },
  saveDraft() { const key = this.draftKey(); if (this.data.composeOpen && ready() && key && tokenOf() === this._lastToken) wx.setStorageSync(key, this.data.draft); },
  async openCompose() {
    if (!ready()) { this.login("compose"); return; }
    if (this.data.busy) return;
    const token = tokenOf();
    this.setData({ busy: true, actionError: "", error: "" });
    try {
      if (!this.draftKey()) {
        const me = await request("/me");
        if (!this.live(token)) return;
        const id = Number(me.user && me.user.id);
        if (!Number.isSafeInteger(id) || id < 1) throw new Error("暂时无法确认账号，请稍后重试");
        this._ownerId = id; this._ownerToken = token;
      }
      if (!this.live(token)) return;
      this.restoreDraft(); this.setData({ composeOpen: true, actionError: "", notice: "", draftImages: [] }); this.updateTitle();
      wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] }); wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    } catch (error) { if (this.live(token)) { if (error.status === 401) this.expired(); else this.setData({ error: error.message || "暂时无法打开填写页，请重试" }); } }
    finally { if (this.live(token)) this.setData({ busy: false }); }
  },
  closeCompose() { if (this.data.busy) return; this.saveDraft(); this.setData({ composeOpen: false, actionError: "", draftImages: [] }); this.updateTitle(); this.setSharing(); if (!this.data.detail && !this.data.items.length) return this.load(); },
  inputDraft(event) { const field = event.currentTarget.dataset.field; if (!["title", "body"].includes(field)) return; this.setData({ ["draft." + field]: event.detail.value }); this.saveDraft(); },
  pickFormCategory(event) { const category = event.currentTarget.dataset.key; if (!CATEGORIES.slice(1).some((item) => item.key === category)) return; this.setData({ "draft.category": category }); this.saveDraft(); },
  pickModule(event) { const index = Number(event.detail.value); if (!MODULES[index]) return; this.setData({ moduleIndex: index, "draft.module": MODULES[index].key }); this.saveDraft(); },
  async submit() {
    if (this.data.busy) return;
    if (!ready()) { this.login("compose"); return; }
    const title = this.data.draft.title.trim(), body = this.data.draft.body.trim();
    if (title.length < 4 || title.length > 80) { this.setData({ actionError: "标题请填写 4–80 个字" }); return; }
    if (body.length < 10 || body.length > 3000) { this.setData({ actionError: "请用 10–3000 个字描述你的想法" }); return; }
    const token = tokenOf(), draftKey = this.draftKey(), images = this.data.draftImages.slice();
    this.setData({ busy: true, actionError: "" });
    try {
      let item = await request("/feedback", "POST", { ...this.data.draft, title, body });
      if (!this.live(token)) return;
      if (draftKey) wx.removeStorageSync(draftKey);
      let failed = "";
      for (const photo of images) {
        if (!this.live(token)) return;
        try { item = await this.upload(item.id, photo.path, token); }
        catch (error) { if (error.status === 401) throw error; failed = "建议已提交；部分截图未上传成功。可在待审核详情里补充。"; break; }
      }
      if (!this.live(token)) return;
      this.setData({ id: item.id, composeOpen: false, draft: { title: "", body: "", category: "feature", module: "other" }, moduleIndex: 0, draftImages: [], notice: failed || "建议已提交，审核通过后会公开展示。" });
      this.setDetail(item); this.updateTitle(); wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    } catch (error) { if (this.live(token)) { if (error.status === 401) this.expired(); else this.setData({ actionError: error.message || "提交失败，文字草稿已保留" }); } }
    finally { if (this.live(token)) this.setData({ busy: false }); }
  },
  async chooseImages() {
    if (this.data.busy) return;
    const detail = this.data.detail, composing = this.data.composeOpen;
    const count = composing ? this.data.draftImages.length : ((detail && detail.images) || []).length;
    if (count >= 3) return;
    if (!composing && (!detail || !detail.isMine || detail.status !== "pending")) return;
    const token = tokenOf();
    wx.chooseMedia({ count: 3 - count, mediaType: ["image"], sourceType: ["album", "camera"], sizeType: ["compressed"], success: async (result) => {
      if (!this.live(token)) return;
      const files = (result.tempFiles || []).slice(0, 3 - count);
      if (files.some((file) => !file.size || file.size > 5 * 1024 * 1024)) { this.setData({ actionError: "每张截图需小于 5 MB，请重新选择" }); return; }
      if (composing) { this.setData({ draftImages: this.data.draftImages.concat(files.map((file) => ({ path: file.tempFilePath }))), actionError: "" }); return; }
      this.setData({ busy: true, actionError: "" });
      try { for (const file of files) { if (!this.live(token)) return; const item = await this.upload(detail.id, file.tempFilePath, token); if (this.live(token)) this.setDetail(item); } }
      catch (error) { if (this.live(token)) { if (error.status === 401) this.expired(); else this.setData({ actionError: error.message || "截图上传失败，请重试" }); } }
      finally { if (this.live(token)) this.setData({ busy: false }); }
    }, fail: (error) => { if (this.live(token) && !/cancel/.test(error.errMsg || "")) this.setData({ actionError: "暂时无法选择图片，请重试" }); } });
  },
  upload(id, filePath, token) {
    return new Promise((resolve, reject) => wx.uploadFile({ url: getApp().globalData.baseUrl + "/marathon/api/feedback/" + id + "/images", filePath, name: "file", header: { Authorization: "Bearer " + token }, timeout: 30000, success: (response) => { let data; try { data = typeof response.data === "string" ? JSON.parse(response.data) : response.data; } catch (_) { reject(new Error("图片上传响应异常，请重新打开建议确认")); return; } if (response.statusCode >= 200 && response.statusCode < 300) resolve(data); else { const error = new Error((data && data.error) || "图片上传失败"); error.status = response.statusCode; reject(error); } }, fail: () => reject(new Error("图片上传失败，请检查网络后重试")) }));
  },
  removeDraftImage(event) { if (this.data.busy) return; const index = Number(event.currentTarget.dataset.index); this.setData({ draftImages: this.data.draftImages.filter((item, i) => i !== index) }); },
  previewImage(event) { const url = event.currentTarget.dataset.url; const urls = this.data.composeOpen ? this.data.draftImages.map((item) => item.path) : ((this.data.detail || {}).images || []).map((item) => item.url); if (url && urls.includes(url)) wx.previewImage({ current: url, urls }); },
  async removeImage(event) { if (this.data.busy || !this.data.detail) return; const token = tokenOf(), id = Number(event.currentTarget.dataset.id); if (!(await confirm("移除截图", "移除这张建议截图？")) || !this.live(token)) return; return this.mutate("/feedback/" + this.data.id + "/images/" + id, "DELETE"); },
  async toggleVote() { if (!ready()) { this.login(); return; } const item = this.data.detail; if (!item || this.data.busy || !item.canVote || item.isMine) return; return this.mutate("/feedback/" + item.id + "/vote", "PUT", { voted: !item.voted }); },
  async withdraw() { if (this.data.busy || !this.data.detail || !this.data.detail.canWithdraw) return; const token = tokenOf(); if (!(await confirm("撤回这条建议", "撤回后将停止公示与投票。如需提出新的想法，可以重新提交。")) || !this.live(token)) return; return this.mutate("/feedback/" + this.data.id + "/withdraw", "POST"); },
  mutate(url, method, body) {
    const token = tokenOf(); if (this.data.busy) return Promise.resolve();
    this.setData({ busy: true, actionError: "", notice: "" });
    return request(url, method, body).then((data) => { if (this.live(token)) this.setDetail(data); }).catch((error) => { if (this.live(token)) { if (error.status === 401) this.expired(); else this.setData({ actionError: error.message || "操作失败，请重试" }); } }).finally(() => { if (this.live(token)) this.setData({ busy: false }); });
  },
  openClaim() { const item = this.data.detail; if (!item || !item.isMine || !item.reward || !["unclaimed", "claimed"].includes(item.reward.status)) return; this.setData({ claimOpen: true, actionError: "", consent: false, claim: { receiver: item.reward.receiver || "", phone: item.reward.phone || "", address: item.reward.address || "" } }); },
  closeClaim() { if (!this.data.busy) this.setData({ claimOpen: false, claim: { receiver: "", phone: "", address: "" }, consent: false, actionError: "" }); },
  inputClaim(event) { const field = event.currentTarget.dataset.field; if (["receiver", "phone", "address"].includes(field)) this.setData({ ["claim." + field]: event.detail.value }); },
  toggleConsent() { this.setData({ consent: !this.data.consent }); },
  submitClaim() {
    if (this.data.busy) return;
    const { receiver, phone, address } = this.data.claim, clean = { receiver: receiver.trim(), phone: phone.trim(), address: address.trim(), consent: this.data.consent };
    if (clean.receiver.length < 2 || clean.receiver.length > 40) { this.setData({ actionError: "请填写 2–40 个字的收件人姓名" }); return; }
    if (!/^1[3-9]\d{9}$/.test(clean.phone)) { this.setData({ actionError: "请填写正确的中国大陆手机号码" }); return; }
    if (clean.address.length < 8 || clean.address.length > 300) { this.setData({ actionError: "请填写完整收件地址（8–300 个字）" }); return; }
    if (!clean.consent) { this.setData({ actionError: "请先同意仅为寄送奖励使用收件信息" }); return; }
    return this.mutate("/feedback/" + this.data.id + "/reward/claim", "PUT", clean);
  },
  async receiveReward() { const item = this.data.detail; if (this.data.busy || !item || !item.isMine || !item.reward || item.reward.status !== "shipped") return; const token = tokenOf(); if (!(await confirm("确认已收到奖励", "请在实物奖励送达并核对后确认收货。")) || !this.live(token)) return; return this.mutate("/feedback/" + this.data.id + "/reward/received", "POST"); },
  copyTracking() { const reward = this.data.detail && this.data.detail.reward; if (reward && reward.tracking) wx.setClipboardData({ data: reward.tracking }); },
  openPrivacy() { wx.navigateTo({ url: "/pages/privacy/privacy" }); }
});
