const { request, ready } = require("../../utils/request");
function accountKey() {
  const app = typeof getApp === "function" ? getApp() : null;
  return app && app.globalData ? String(app.globalData.token || "") : "";
}
const EMPTY = { club: null, targetId: "", targetMessage: "", type: "confusion", detail: "", sourceUrl: "", contact: "", reports: [], message: "", saving: false, editingReportId: null, editingReportStatus: "" };
const TYPES = { confusion: "同名容易混淆", impersonation: "组织身份被冒用", management: "管理权存在争议" };
const STATUS = { pending: "待处理", reviewing: "核查中", review: "核查中", supplement: "待补充", needs_info: "待补充", restricted: "已限制争议呈现", restored: "已恢复展示", renamed: "已更正呈现", resolved: "已处理", dismissed: "已结案", closed: "已结案", rejected: "已结案" };
Page({
  data: { ...EMPTY, ready: false, loading: true },
  onLoad(query = {}) { this.initialId = String(query.id || ""); this.disposed = false; this.hidden = false; },
  onShow() {
    this.hidden = false;
    const token = accountKey();
    if (token !== this.account) this.setData({ ...EMPTY, targetId: this.initialId });
    this.account = token;
    this.setData({ ready: ready(), saving: false });
    if (ready()) return this.load();
    this.setData({ loading: false });
  },
  onHide() { this.hidden = true; this.version = (this.version || 0) + 1; },
  onUnload() { this.disposed = true; this.version = (this.version || 0) + 1; this.setData({ ...EMPTY }); },
  current(token, version) { return !this.disposed && !this.hidden && ready() && token === accountKey() && version === this.version; },
  load() {
    if (!ready() || this.disposed || this.hidden) return Promise.resolve();
    const token = accountKey(); const version = this.version = (this.version || 0) + 1;
    const targetId = String(this.data.targetId || "").trim();
    const targetCurrent = () => this.current(token, version) && targetId === String(this.data.targetId || "").trim();
    this.setData({ loading: true, targetMessage: "" });
    const list = request("/me/club-reports").then((data) => {
      if (!this.current(token, version)) return;
      this.setData({ reports: (data.reports || []).map((item) => ({ ...item, typeLabel: TYPES[item.type] || "名称与身份问题", statusLabel: STATUS[item.status] || "处理中", canRespond: !["reviewing", "review"].includes(item.status) })) });
    }).catch((err) => { if (this.current(token, version)) this.setData({ reports: [], message: err.message }); });
    const target = /^\d+$/.test(targetId) ? request("/clubs/" + targetId + "/public").then((data) => {
      if (targetCurrent()) this.setData({ club: data.club, targetMessage: "" });
    }).catch((err) => { if (targetCurrent()) this.setData({ club: null, targetMessage: err.message || "没有找到这个团号，请核对后重试。" }); }) : Promise.resolve();
    return Promise.all([list, target]).finally(() => { if (this.current(token, version)) this.setData({ loading: false }); });
  },
  onField(e) {
    if (this.data.saving) return;
    const key = e.currentTarget.dataset.key;
    if (!["targetId", "detail", "sourceUrl", "contact"].includes(key) || (this.data.editingReportId && key === "targetId")) return;
    this.setData({ [key]: e.detail.value, ...(key === "targetId" ? { club: null, targetMessage: "" } : {}), message: "" });
  },
  lookupTarget() {
    if (!ready() || this.data.saving || this.hidden || this.disposed) return Promise.resolve();
    if (this.account !== accountKey()) { this.onShow(); return Promise.resolve(); }
    if (!/^\d+$/.test(String(this.data.targetId || "").trim())) { this.setData({ targetMessage: "填写团号后，可先查看公开名片确认目标。" }); return Promise.resolve(); }
    return this.load();
  },
  pickType(e) { if (!this.data.saving && !this.data.editingReportId && TYPES[e.currentTarget.dataset.type]) this.setData({ type: e.currentTarget.dataset.type }); },
  prepareReport(e) {
    if (this.data.saving || this.hidden || this.disposed) return;
    if (this.account !== accountKey()) { this.onShow(); return; }
    const report = this.data.reports.find((item) => Number(item.id) === Number(e.currentTarget.dataset.id));
    if (!report || !report.canRespond) return;
    this.setData({ targetId: String(report.clubId), type: report.type, detail: report.detail || "", sourceUrl: report.sourceUrl || "", contact: report.contact || "", club: null, targetMessage: "", editingReportId: report.id, editingReportStatus: report.status, message: report.status === "pending" ? "正在更新工单 #" + report.id + "。提交后将保存你填写的最新情况、来源链接和联系方式，不新建重复工单。" : report.status === "supplement" ? "正在补充工单 #" + report.id + "。提交后材料会补入原工单，重新进入待处理。" : "正在申请复核工单 #" + report.id + "。请说明新事实或需要复核的理由；已有同类待处理工单时将更新该工单，否则新建复核工单。" });
    if (wx.pageScrollTo) wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },
  cancelSupplement() {
    if (!this.data.saving) this.setData({ editingReportId: null, editingReportStatus: "", targetId: this.initialId || "", targetMessage: "", type: "confusion", detail: "", sourceUrl: "", contact: "", club: null, message: "" });
  },
  submit() {
    if (!ready() || this.data.saving || this.hidden || this.disposed) return Promise.resolve();
    if (this.account !== accountKey()) { this.onShow(); return Promise.resolve(); }
    const id = String(this.data.targetId || "").trim().replace(/^#/, "");
    const detail = String(this.data.detail || "").trim();
    const sourceUrl = String(this.data.sourceUrl || "").trim();
    const contact = String(this.data.contact || "").trim();
    if (!/^\d+$/.test(id) || !detail || !contact) { this.setData({ message: "请填写跑团号、具体情况和私密联系方式。" }); return Promise.resolve(); }
    const token = accountKey(); const version = this.version = (this.version || 0) + 1;
    this.setData({ saving: true, message: "" });
    return request("/clubs/" + id + "/reports", "POST", { type: this.data.type, detail, sourceUrl, contact }).then((data) => {
      if (!this.current(token, version)) return;
      const result = data.outcome === "updated" ? "原工单 #" + data.report.id + " 的材料已更新，已保存本次情况、来源链接和联系方式。" : data.outcome === "unchanged" ? "工单 #" + data.report.id + " 已收到相同内容，无需重复提交。" : "私密工单 #" + data.report.id + " 已新建。";
      this.setData({ detail: "", sourceUrl: "", contact: "", editingReportId: null, editingReportStatus: "", message: result + "提交本身不会处罚对方，可在下方查看处理进度。", saving: false });
      return this.load();
    }).catch((err) => { if (this.current(token, version)) this.setData({ message: err.message, saving: false }); });
  }
});
