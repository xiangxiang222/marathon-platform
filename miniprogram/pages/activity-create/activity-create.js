const { request } = require("../../utils/request");
const { PRESETS, GROUP, fromConfig, toConfig, applyTiming } = require("../../utils/activity-templates");
const TYPES = [
  { id: "easy", name: "轻松跑", tag: "轻松有氧", titleHint: "例如：周三轻松跑" },
  { id: "long", name: "长距离", tag: "耐力积累", titleHint: "例如：周末长距离" },
  { id: "interval", name: "间歇训练", tag: "速度提升", titleHint: "例如：周三间歇训练" },
  { id: "custom", name: "自由安排", tag: "按需安排", titleHint: "填写训练标题" }
];
const KIND_NAMES = ["配速组", "完赛组", "志愿者", "其他"];
const KIND_IDS = ["pace", "finish", "volunteer", "other"];
function emptyDraft() {
  return { trainingType: "custom", title: "", issue: "", plannedKm: "", place: "", gatherPlace: "", gatherAt: "", route: "", startDate: "", startTime: "", endDate: "", endTime: "", signupDate: "", signupTime: "", cancelDate: "", cancelTime: "", workout: "", notice: "", note: "", minPeople: "3", minKm: "5", points: "1", review: false };
}
function stamp(draft, key) {
  return draft[key + "Date"] && draft[key + "Time"] ? draft[key + "Date"] + "T" + draft[key + "Time"] : "";
}
function groupDraft(group, index) {
  const kind = KIND_IDS.includes(group.kind) ? group.kind : "pace";
  return { key: "g" + index, name: String(group.name || ""), pace: String(group.pace || ""), capacity: String(group.capacity || 0), kind, kindIndex: KIND_IDS.indexOf(kind), enabled: true };
}
Page({
  data: { loading: true, club: null, step: 1, templates: TYPES, presets: PRESETS, kindNames: KIND_NAMES, draft: emptyDraft(), groups: [], savedDraft: null, savedAt: "", message: "", busy: false, copying: false, typeName: "自由安排", titlePlaceholder: TYPES[3].titleHint, previewTime: "", today: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), clubTemplates: [], templatesLoading: false, templatesError: "", templateMode: false, editingTemplateId: 0, editingTemplateVersion: 0, selectedTemplateId: "", templateName: "", templateSheetOpen: false, templateBusy: false, templateMessage: "", templateTiming: { durationMinutes: "", signupLeadMinutes: "", cancelLeadMinutes: "" }, extraOpen: false, detailsOpen: false, successMessage: "" },
  onLoad(query) {
    this.disposed = false;
    this.clubId = String(query.club || "");
    this.copyId = String(query.copy || "");
    this.load();
    wx.hideShareMenu();
  },
  onShow() {
    if (this.accountToken && getApp().globalData.token !== this.accountToken) this.invalidateAccount();
  },
  onUnload() { this.disposed = true; this.requestTicket = (this.requestTicket || 0) + 1; this.templateTicket = (this.templateTicket || 0) + 1; },
  invalidateAccount() {
    this.requestTicket = (this.requestTicket || 0) + 1;
    this.templateTicket = (this.templateTicket || 0) + 1;
    this.activitySnapshot = null;
    this.formDirty = false;
    this.setData({ club: null, groups: [], draft: emptyDraft(), clubTemplates: [], savedDraft: null, savedAt: "", step: 1, templateMode: false, editingTemplateId: 0, editingTemplateVersion: 0, selectedTemplateId: "", templateTiming: { durationMinutes: "", signupLeadMinutes: "", cancelLeadMinutes: "" }, successMessage: "", templateMessage: "", templatesLoading: false, templatesError: "", copying: false, templateName: "", templateSheetOpen: false, templateBusy: false, busy: false, message: "登录账号已变化，请重新打开发布页" });
  },
  operationScope() { return { ticket: this.requestTicket, token: this.accountToken, clubId: this.clubId }; },
  currentScope(scope) { return !this.disposed && scope.ticket === this.requestTicket && scope.token === getApp().globalData.token && scope.clubId === this.clubId; },
  async load() {
    const ticket = this.requestTicket = (this.requestTicket || 0) + 1;
    const token = getApp().globalData.token || "";
    this.accountToken = token;
    this.accountId = "";
    this.storageKey = "";
    this.templateTicket = (this.templateTicket || 0) + 1;
    this.activitySnapshot = null;
    this.formDirty = false;
    this.setData({ loading: true, club: null, draft: emptyDraft(), clubTemplates: [], groups: [], savedDraft: null, savedAt: "", step: 1, templateMode: false, editingTemplateId: 0, editingTemplateVersion: 0, selectedTemplateId: "", templateTiming: { durationMinutes: "", signupLeadMinutes: "", cancelLeadMinutes: "" }, successMessage: "", templateMessage: "", templatesLoading: false, templatesError: "", copying: false, templateName: "", templateSheetOpen: false, templateBusy: false, busy: false, extraOpen: false, detailsOpen: false, message: "" });
    this.updatePreview();
    try {
      const [me, data] = await Promise.all([request("/me"), request("/clubs/" + this.clubId)]);
      if (ticket !== this.requestTicket) return;
      if (!token || getApp().globalData.token !== token) {
        this.setData({ club: null, groups: [], savedDraft: null, message: "登录账号已变化，请重新打开发布页" });
        return;
      }
      this.accountId = me.user.id;
      this.storageKey = "activity-draft:v1:" + this.accountId + ":" + this.clubId;
      this.defaultGroups = (data.groups && data.groups.length ? data.groups : [GROUP]).map(groupDraft);
      this.setData({ club: data.club, groups: this.defaultGroups });
      if (!data.club.staff) return;
      this.loadTemplates();
      const saved = wx.getStorageSync(this.storageKey);
      if (saved && saved.version === 1 && saved.draft && Array.isArray(saved.groups)) {
        this.setData({ savedDraft: saved, savedAt: saved.savedAt || "" });
      }
      if (this.copyId) {
        const source = await request("/clubs/" + this.clubId + "/activities/" + this.copyId);
        if (ticket !== this.requestTicket) return;
        if (!this.sameAccount()) {
          this.setData({ club: null, groups: [], savedDraft: null });
          return;
        }
        const draft = emptyDraft();
        ["trainingType", "title", "plannedKm", "place", "gatherPlace", "gatherAt", "route", "workout", "notice", "note", "minPeople", "minKm", "points", "review"].forEach((key) => {
          if (source.activity[key] != null) draft[key] = source.activity[key];
        });
        this.setData({ draft, groups: (source.groups && source.groups.length ? source.groups : [GROUP]).map(groupDraft), copying: true });
        this.updatePreview();
      }
    } catch (err) {
      if (ticket === this.requestTicket) this.setData({ club: null, groups: [], message: err.message });
    } finally {
      if (ticket === this.requestTicket) this.setData({ loading: false });
    }
  },
  async loadTemplates() {
    if (!this.sameAccount()) return;
    const scope = this.operationScope();
    const ticket = this.templateTicket = (this.templateTicket || 0) + 1;
    this.setData({ templatesLoading: true, templatesError: "" });
    try {
      const result = await request("/clubs/" + scope.clubId + "/activity-templates");
      if (!this.currentScope(scope) || ticket !== this.templateTicket) return;
      this.setData({ clubTemplates: result.templates || [] });
    } catch (err) {
      if (this.currentScope(scope) && ticket === this.templateTicket) this.setData({ templatesError: err.message || "模板暂时无法载入，仍可手动发布活动" });
    } finally {
      if (this.currentScope(scope) && ticket === this.templateTicket) this.setData({ templatesLoading: false });
    }
  },
  useTemplate(e) {
    if (!this.sameAccount() || this.data.templateBusy) return;
    const id = String(e.currentTarget.dataset.id);
    const source = e.currentTarget.dataset.source;
    const row = source === "preset" ? PRESETS.find(r => r.id === id) : this.data.clubTemplates.find(r => String(r.id) === id);
    if (!row) return;
    const scope = this.operationScope();
    const apply = () => {
      if (!this.currentScope(scope)) return;
      const values = fromConfig(row.config, emptyDraft(), this.data.templateMode ? "" : this.data.draft.startDate);
      this.setData({ draft: values.draft, groups: values.groups.map(groupDraft), templateTiming: values.timing, selectedTemplateId: source + ":" + id, copying: false, message: "", successMessage: "已套用「" + row.name + "」，可继续调整", step: 1 });
      this.formDirty = false;
      this.updatePreview();
    };
    if (this.formDirty) wx.showModal({ title: "套用训练模板", content: "将替换训练内容和分组，本次已选日期会保留。", success: result => { if (result.confirm) apply(); } });
    else apply();
  },
  snapshotActivity() {
    if (!this.data.templateMode) this.activitySnapshot = JSON.parse(JSON.stringify({ draft: this.data.draft, groups: this.data.groups, step: this.data.step, copying: this.data.copying, selectedTemplateId: this.data.selectedTemplateId, templateTiming: this.data.templateTiming, formDirty: !!this.formDirty }));
  },
  newTemplate() {
    if (!this.sameAccount() || this.data.templateBusy) return;
    this.snapshotActivity();
    this.setData({ templateMode: true, editingTemplateId: 0, editingTemplateVersion: 0, templateName: "", draft: emptyDraft(), groups: JSON.parse(JSON.stringify(this.defaultGroups || [groupDraft(GROUP, 0)])), templateTiming: { durationMinutes: "", signupLeadMinutes: "", cancelLeadMinutes: "" }, step: 1, selectedTemplateId: "", message: "", successMessage: "", copying: false });
    this.formDirty = false;
    this.updatePreview();
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },
  manageTemplate(e) {
    if (!this.sameAccount() || this.data.templateBusy) return;
    const row = this.data.clubTemplates.find(r => String(r.id) === String(e.currentTarget.dataset.id));
    if (!row) return;
    const scope = this.operationScope();
    wx.showActionSheet({ itemList: ["编辑模板", "删除模板"], success: result => {
      if (!this.currentScope(scope)) return;
      if (result.tapIndex === 0) {
        this.snapshotActivity();
        const values = fromConfig(row.config, emptyDraft(), "");
        this.setData({ templateMode: true, editingTemplateId: row.id, editingTemplateVersion: row.version, templateName: row.name, draft: values.draft, groups: values.groups.map(groupDraft), templateTiming: values.timing, step: 1, selectedTemplateId: "saved:" + row.id, message: "", successMessage: "", copying: false });
        this.formDirty = false;
        this.updatePreview();
        wx.pageScrollTo({ scrollTop: 0, duration: 200 });
      } else if (result.tapIndex === 1) wx.showModal({ title: "删除「" + row.name + "」？", content: "已发布的活动和当前填写内容会保留。", confirmColor: "#e1251b", success: confirmation => { if (confirmation.confirm && this.currentScope(scope)) this.deleteTemplate(row, scope); } });
    } });
  },
  async deleteTemplate(row, scope) {
    if (!this.currentScope(scope)) return;
    this.setData({ templateBusy: true });
    try {
      await request("/clubs/" + scope.clubId + "/activity-templates/" + row.id, "DELETE");
      if (!this.currentScope(scope)) return;
      this.templateTicket = (this.templateTicket || 0) + 1;
      this.setData({ clubTemplates: this.data.clubTemplates.filter(r => r.id !== row.id), templatesLoading: false, templatesError: "", successMessage: "模板已删除" });
    } catch (err) { if (this.currentScope(scope)) this.setData({ message: err.message }); }
    finally { if (this.currentScope(scope)) this.setData({ templateBusy: false }); }
  },
  cancelTemplateEdit() {
    if (this.data.templateBusy || !this.sameAccount()) return;
    const saved = this.activitySnapshot;
    this.setData({ ...(saved || { draft: emptyDraft(), groups: this.defaultGroups || [groupDraft(GROUP, 0)], step: 1, copying: false, selectedTemplateId: "", templateTiming: { durationMinutes: "", signupLeadMinutes: "", cancelLeadMinutes: "" } }), templateMode: false, editingTemplateId: 0, editingTemplateVersion: 0, templateName: "", templateSheetOpen: false, message: "" });
    this.formDirty = saved ? saved.formDirty : false;
    this.activitySnapshot = null;
    this.updatePreview();
  },
  saveTemplate() {
    if (!this.sameAccount() || this.data.templateBusy) return;
    const error = this.validateStep(1, true) || this.validateStep(2, true);
    if (error) return this.setData({ message: error });
    this.setData({ templateSheetOpen: true, templateName: this.data.templateMode && this.data.templateName ? this.data.templateName : this.data.draft.title || this.data.typeName + "模板", templateMessage: "" });
  },
  inputTemplateName(e) { this.setData({ templateName: e.detail.value }); },
  closeTemplateSheet() { if (!this.data.templateBusy) this.setData({ templateSheetOpen: false }); },
  async confirmSaveTemplate() {
    if (!this.sameAccount() || this.data.templateBusy) return;
    const name = this.data.templateName.trim();
    if (!name || [...name].length > 30) return this.setData({ templateMessage: "模板名称请填 1 到 30 个字" });
    const config = toConfig(this.data.draft, this.data.groups, this.data.templateTiming, this.data.templateMode);
    for (const [key, label, max] of [["durationMinutes", "预计时长", 10080], ["signupLeadMinutes", "报名提前截止时间", 43200], ["cancelLeadMinutes", "取消提前截止时间", 43200]]) {
      if (config[key] != null && (!Number.isInteger(config[key]) || config[key] < 0 || config[key] > max)) return this.setData({ templateMessage: label + "请填 0 到 " + max + " 的整数分钟，或留空" });
    }
    if (!config.title) config.title = name;
    const scope = this.operationScope();
    const editingId = this.data.templateMode ? this.data.editingTemplateId : 0;
    this.setData({ templateBusy: true, templateMessage: "" });
    try {
      const result = await request("/clubs/" + scope.clubId + "/activity-templates" + (editingId ? "/" + editingId : ""), editingId ? "PUT" : "POST", { name, config, ...(editingId ? { version: this.data.editingTemplateVersion } : {}) });
      if (!this.currentScope(scope)) return;
      const row = result.template;
      this.templateTicket = (this.templateTicket || 0) + 1;
      const rows = [row].concat(this.data.clubTemplates.filter(item => item.id !== row.id));
      this.setData({ clubTemplates: rows, templatesLoading: false, templatesError: "", templateSheetOpen: false, templateBusy: false });
      if (this.data.templateMode) this.cancelTemplateEdit();
      this.setData({ successMessage: "「" + name + "」已保存到跑团模板" });
      wx.showToast({ title: "模板已保存", icon: "success" });
    } catch (err) {
      if (this.currentScope(scope)) {
        this.setData({ templateMessage: err.message });
        if (err.status === 409) this.loadTemplates();
      }
    } finally { if (this.currentScope(scope)) this.setData({ templateBusy: false }); }
  },
  timingInput(e) {
    const key = e.currentTarget.dataset.key;
    if (!["durationMinutes", "signupLeadMinutes", "cancelLeadMinutes"].includes(key)) return;
    this.setData({ ["templateTiming." + key]: e.detail.value });
    this.formDirty = true;
  },
  toggleExtra() { this.setData({ extraOpen: !this.data.extraOpen }); },
  toggleDetails() { this.setData({ detailsOpen: !this.data.detailsOpen }); },
  noop() {},
  chooseTemplate(e) {
    const item = TYPES.find((row) => row.id === e.currentTarget.dataset.id);
    if (!item) return;
    const draft = { ...this.data.draft, trainingType: item.id };
    this.setData({ draft, typeName: item.name, titlePlaceholder: item.titleHint });
    this.formDirty = true;
  },
  input(e) {
    const key = e.currentTarget.dataset.key;
    if (Object.prototype.hasOwnProperty.call(emptyDraft(), key)) this.setData({ ["draft." + key]: e.detail.value });
    this.formDirty = true;
  },
  pickDate(e) { this.changeTime(e); },
  pickTime(e) { this.changeTime(e); },
  changeTime(e) {
    const key = e.currentTarget.dataset.key;
    if (!["startDate", "startTime", "endDate", "endTime", "signupDate", "signupTime", "cancelDate", "cancelTime", "gatherAt"].includes(key)) return;
    let draft = { ...this.data.draft, [key]: e.detail.value };
    const timing = { ...this.data.templateTiming };
    if (key === "startDate" || key === "startTime") draft = applyTiming(draft, timing);
    else { const field = key.startsWith("end") ? "durationMinutes" : key.startsWith("signup") ? "signupLeadMinutes" : key.startsWith("cancel") ? "cancelLeadMinutes" : ""; if (field) timing[field] = ""; }
    this.setData({ draft, templateTiming: timing });
    this.formDirty = true;
    this.updatePreview();
  },
  clearTime(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ["draft." + key + "Date"]: "", ["draft." + key + "Time"]: "" });
    const field = { end: "durationMinutes", signup: "signupLeadMinutes", cancel: "cancelLeadMinutes" }[key];
    if (field) this.setData({ ["templateTiming." + field]: "" });
    this.formDirty = true;
  },
  toggleReview(e) { this.setData({ "draft.review": e.detail.value }); this.formDirty = true; },
  updatePreview() {
    const names = { easy: "轻松跑", long: "长距离", interval: "间歇训练", tempo: "节奏跑", social: "社交跑", custom: "自由安排" };
    const item = TYPES.find((row) => row.id === this.data.draft.trainingType) || TYPES[3];
    this.setData({ typeName: names[this.data.draft.trainingType] || "自由安排", titlePlaceholder: item.titleHint, previewTime: stamp(this.data.draft, "start").replace("T", " ") });
  },
  groupInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const key = e.currentTarget.dataset.key;
    if (!["name", "pace", "capacity"].includes(key) || !this.data.groups[index]) return;
    this.setData({ ["groups[" + index + "]." + key]: e.detail.value });
    this.formDirty = true;
  },
  groupKind(e) {
    const index = Number(e.currentTarget.dataset.index);
    const kindIndex = Number(e.detail.value);
    if (!Number.isInteger(kindIndex) || kindIndex < 0 || kindIndex >= KIND_IDS.length || !this.data.groups[index]) return;
    this.setData({ ["groups[" + index + "].kind"]: KIND_IDS[kindIndex], ["groups[" + index + "].kindIndex"]: kindIndex });
    this.formDirty = true;
  },
  toggleGroup(e) {
    const index = Number(e.currentTarget.dataset.index);
    const enabled = !!e.detail.value;
    const groups = this.data.groups;
    if (!groups[index]) return;
    if (enabled && !groups[index].enabled && groups.filter((group) => group.enabled).length >= 12) {
      this.setData({ message: "每场活动最多启用 12 个组别" });
      return;
    }
    this.setData({ ["groups[" + index + "].enabled"]: enabled, message: "" });
    this.formDirty = true;
  },
  addGroup() {
    if (this.data.groups.length >= 12) return this.setData({ message: "最多添加 12 个组别" });
    const groups = this.data.groups.concat(groupDraft({}, Date.now()));
    this.setData({ groups, message: "" });
    this.formDirty = true;
  },
  validateStep(step, forTemplate) {
    const d = this.data.draft;
    if (step === 1) {
      if (!forTemplate && !String(d.title).trim()) return "给这场活动起一个名字";
      if (!["easy", "long", "interval", "tempo", "social", "custom"].includes(d.trainingType)) return "请选择有效的训练类型";
      if (!forTemplate && !stamp(d, "start")) return "请选择开始日期与时间";
      if (!forTemplate && (!String(d.place).trim() || !String(d.gatherPlace).trim())) return "请填写活动地点与具体集合点";
      if (d.plannedKm !== "" && (!Number.isFinite(Number(d.plannedKm)) || Number(d.plannedKm) < 0.1 || Number(d.plannedKm) > 200)) return "计划里程请填 0.1 到 200 公里";
      for (const key of ["end", "signup", "cancel"]) {
        if (forTemplate) continue;
        if (!!d[key + "Date"] !== !!d[key + "Time"]) return "请补全可选时间的日期与时刻，或清空该项";
        if (stamp(d, key) && ((key === "end" && stamp(d, key) < stamp(d, "start")) || (key !== "end" && stamp(d, key) > stamp(d, "start")))) return key === "end" ? "结束时间不能早于开始时间" : "报名与取消截止时间不能晚于活动开始";
      }
    }
    if (step === 2) {
      if (this.data.groups.length > 12) return "一场活动最多设置 12 个组别";
      const groups = this.data.groups.filter((g) => g.enabled);
      if (!groups.length) return "请至少启用一个组别";
      const names = new Set();
      for (const group of groups) {
        const name = group.name.trim();
        if (!name || name.length > 20) return "每个组别请填写 1 到 20 字的名称";
        if (names.has(name)) return "组别名称不能重复";
        names.add(name);
        if (!KIND_IDS.includes(group.kind) || group.pace.trim().length > 40) return "请检查组别类型和配速内容";
        if (!Number.isInteger(Number(group.capacity)) || Number(group.capacity) < 0 || Number(group.capacity) > 500) return "组别人数请填 0 到 500 的整数，0 表示不限";
      }
      if (!Number.isInteger(Number(d.minPeople)) || Number(d.minPeople) < 1 || Number(d.minPeople) > 500) return "成团人数请填 1 到 500";
      if (!Number.isFinite(Number(d.minKm)) || Number(d.minKm) < 0.1 || Number(d.minKm) > 100) return "积分里程请填 0.1 到 100 公里";
      if (!Number.isInteger(Number(d.points)) || Number(d.points) < 0 || Number(d.points) > 100) return "活动积分请填 0 到 100 的整数";
    }
    return "";
  },
  next() {
    const error = this.validateStep(this.data.step, this.data.templateMode);
    if (error) return this.setData({ message: error });
    this.updatePreview();
    this.setData({ step: Math.min(3, this.data.step + 1), message: "" });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },
  back() {
    this.setData({ step: Math.max(1, this.data.step - 1), message: "" });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },
  sameAccount() {
    if (!this.disposed && this.data.club && this.data.club.staff && this.accountToken && getApp().globalData.token === this.accountToken) return true;
    if (this.accountToken && getApp().globalData.token !== this.accountToken) this.invalidateAccount();
    else this.setData({ message: "请重新打开有管理权限的跑团发布页" });
    return false;
  },
  saveDraft() {
    if (!this.storageKey || !this.sameAccount() || this.data.templateMode) return;
    try {
      const saved = { version: 1, draft: this.data.draft, groups: this.data.groups, timing: this.data.templateTiming, savedAt: new Date().toLocaleString() };
      wx.setStorageSync(this.storageKey, saved);
      this.setData({ savedDraft: saved, savedAt: saved.savedAt });
      wx.showToast({ title: "草稿已保存", icon: "success" });
    } catch (_) { this.setData({ message: "草稿保存失败，请检查设备存储空间" }); }
  },
  restoreDraft() {
    if (!this.sameAccount() || !this.data.savedDraft) return;
    const saved = this.data.savedDraft;
    this.setData({ draft: { ...emptyDraft(), ...saved.draft }, groups: saved.groups.map((g, i) => ({ ...groupDraft(g, i), enabled: g.enabled !== false })), templateTiming: saved.timing || { durationMinutes: "", signupLeadMinutes: "", cancelLeadMinutes: "" }, step: 1, copying: false, message: "", successMessage: "已恢复此账号在本跑团保存的草稿" });
    this.formDirty = true;
    this.updatePreview();
  },
  discardDraft() {
    if (!this.sameAccount()) return;
    wx.removeStorageSync(this.storageKey);
    this.setData({ savedDraft: null, savedAt: "" });
  },
  async publish() {
    if (this.data.templateMode) return this.saveTemplate();
    if (this.data.busy || !this.data.club || !this.data.club.staff || !this.sameAccount()) return;
    const first = this.validateStep(1);
    const second = this.validateStep(2);
    if (first || second) return this.setData({ step: first ? 1 : 2, message: first || second });
    this.setData({ busy: true, message: "" });
    const scope = this.operationScope();
    const d = this.data.draft;
    const stampOrEmpty = (key) => stamp(d, key).replace("T", " ");
    const body = {
      title: d.title.trim(), trainingType: d.trainingType, issue: d.issue.trim(),
      plannedKm: d.plannedKm === "" ? "" : Number(d.plannedKm),
      startsAt: stampOrEmpty("start"), endsAt: stampOrEmpty("end"),
      signupUntil: stampOrEmpty("signup"), cancelUntil: stampOrEmpty("cancel"),
      place: d.place.trim(), gatherPlace: d.gatherPlace.trim(), gatherAt: d.gatherAt.trim(),
      route: d.route.trim(), workout: d.workout.trim(), notice: d.notice.trim(), note: d.note.trim(),
      minPeople: Number(d.minPeople), minKm: Number(d.minKm), points: Number(d.points), review: d.review,
      groups: this.data.groups.filter((group) => group.enabled).map(({ name, pace, capacity, kind }) => ({
        name: name.trim(), pace: pace.trim(), capacity: Number(capacity), kind
      }))
    };
    try {
      const result = await request("/clubs/" + this.clubId + "/activities", "POST", body);
      if (!this.currentScope(scope)) return;
      try { wx.removeStorageSync(this.storageKey); } catch (_) { /* The activity has already been published. */ }
      wx.redirectTo({ url: "/pages/activity/activity?club=" + this.clubId + "&id=" + result.activity.id });
    } catch (err) {
      if (this.currentScope(scope)) this.setData({ message: err.message });
    } finally {
      if (this.currentScope(scope)) this.setData({ busy: false });
    }
  }
});
