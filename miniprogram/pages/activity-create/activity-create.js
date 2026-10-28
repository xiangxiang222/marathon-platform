const { request } = require("../../utils/request");
const TYPES = [
  { id: "easy", name: "轻松跑", tag: "EASY RUN", titleHint: "例如：周三轻松跑" },
  { id: "long", name: "长距离", tag: "LONG RUN", titleHint: "例如：周末长距离" },
  { id: "interval", name: "间歇训练", tag: "INTERVAL", titleHint: "例如：周三间歇训练" },
  { id: "custom", name: "自由安排", tag: "YOUR SESSION", titleHint: "填写训练标题" }
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
  data: { loading: true, club: null, step: 1, templates: TYPES, kindNames: KIND_NAMES, draft: emptyDraft(), groups: [], savedDraft: null, savedAt: "", message: "", busy: false, copying: false, typeName: "自由安排", titlePlaceholder: TYPES[3].titleHint, previewTime: "", today: new Date().toISOString().slice(0, 10) },
  onLoad(query) {
    this.clubId = String(query.club || "");
    this.copyId = String(query.copy || "");
    this.load();
    wx.hideShareMenu();
  },
  async load() {
    const ticket = this.requestTicket = (this.requestTicket || 0) + 1;
    const token = getApp().globalData.token || "";
    this.accountToken = token;
    this.accountId = "";
    this.storageKey = "";
    this.setData({ loading: true, message: "" });
    try {
      const [me, data] = await Promise.all([request("/me"), request("/clubs/" + this.clubId)]);
      if (ticket !== this.requestTicket) return;
      if (!token || getApp().globalData.token !== token) {
        this.setData({ club: null, groups: [], savedDraft: null, message: "登录账号已变化，请重新打开发布页" });
        return;
      }
      this.accountId = me.user.id;
      this.storageKey = "activity-draft:v1:" + this.accountId + ":" + this.clubId;
      this.setData({ club: data.club, groups: (data.groups || []).map(groupDraft) });
      if (!data.club.staff) return;
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
        this.setData({ draft, groups: (source.groups || []).map(groupDraft), copying: true });
        this.updatePreview();
      }
    } catch (err) {
      if (ticket === this.requestTicket) this.setData({ club: null, groups: [], message: err.message });
    } finally {
      if (ticket === this.requestTicket) this.setData({ loading: false });
    }
  },
  chooseTemplate(e) {
    const item = TYPES.find((row) => row.id === e.currentTarget.dataset.id);
    if (!item) return;
    const draft = { ...this.data.draft, trainingType: item.id };
    this.setData({ draft, typeName: item.name, titlePlaceholder: item.titleHint });
  },
  input(e) {
    const key = e.currentTarget.dataset.key;
    if (Object.prototype.hasOwnProperty.call(emptyDraft(), key)) this.setData({ ["draft." + key]: e.detail.value });
  },
  pickDate(e) { this.setData({ ["draft." + e.currentTarget.dataset.key]: e.detail.value }); },
  pickTime(e) { this.setData({ ["draft." + e.currentTarget.dataset.key]: e.detail.value }); },
  clearTime(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ["draft." + key + "Date"]: "", ["draft." + key + "Time"]: "" });
  },
  toggleReview(e) { this.setData({ "draft.review": e.detail.value }); },
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
  },
  groupKind(e) {
    const index = Number(e.currentTarget.dataset.index);
    const kindIndex = Number(e.detail.value);
    if (!Number.isInteger(kindIndex) || kindIndex < 0 || kindIndex >= KIND_IDS.length || !this.data.groups[index]) return;
    this.setData({ ["groups[" + index + "].kind"]: KIND_IDS[kindIndex], ["groups[" + index + "].kindIndex"]: kindIndex });
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
  },
  addGroup() {
    if (this.data.groups.length >= 12) return this.setData({ message: "最多添加 12 个组别" });
    const groups = this.data.groups.concat(groupDraft({}, Date.now()));
    this.setData({ groups, message: "" });
  },
  validateStep(step) {
    const d = this.data.draft;
    if (step === 1) {
      if (!String(d.title).trim()) return "给这场活动起一个名字";
      if (!["easy", "long", "interval", "tempo", "social", "custom"].includes(d.trainingType)) return "请选择有效的训练类型";
      if (!stamp(d, "start")) return "请选择开始日期与时间";
      if (!String(d.place).trim() || !String(d.gatherPlace).trim()) return "请填写活动地点与具体集合点";
      if (d.plannedKm !== "" && (!Number.isFinite(Number(d.plannedKm)) || Number(d.plannedKm) < 0.1 || Number(d.plannedKm) > 200)) return "计划里程请填 0.1 到 200 公里";
      for (const key of ["end", "signup", "cancel"]) {
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
    const error = this.validateStep(this.data.step);
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
    if (this.data.club && this.data.club.staff && this.accountToken && getApp().globalData.token === this.accountToken) return true;
    this.setData({ message: "登录账号已变化，请重新打开发布页" });
    return false;
  },
  saveDraft() {
    if (!this.storageKey || !this.sameAccount()) return;
    try {
      const saved = { version: 1, draft: this.data.draft, groups: this.data.groups, savedAt: new Date().toLocaleString() };
      wx.setStorageSync(this.storageKey, saved);
      this.setData({ savedDraft: saved, savedAt: saved.savedAt });
      wx.showToast({ title: "草稿已保存", icon: "success" });
    } catch (_) { this.setData({ message: "草稿保存失败，请检查设备存储空间" }); }
  },
  restoreDraft() {
    if (!this.sameAccount() || !this.data.savedDraft) return;
    const saved = this.data.savedDraft;
    this.setData({ draft: { ...emptyDraft(), ...saved.draft }, groups: saved.groups.map((g, i) => ({ ...groupDraft(g, i), enabled: g.enabled !== false })), step: 1, copying: false, message: "已恢复此账号在本跑团保存的草稿" });
    this.updatePreview();
  },
  discardDraft() {
    if (!this.sameAccount()) return;
    wx.removeStorageSync(this.storageKey);
    this.setData({ savedDraft: null, savedAt: "" });
  },
  async publish() {
    if (this.data.busy || !this.data.club || !this.data.club.staff || !this.sameAccount()) return;
    const first = this.validateStep(1);
    const second = this.validateStep(2);
    if (first || second) return this.setData({ step: first ? 1 : 2, message: first || second });
    this.setData({ busy: true, message: "" });
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
      try { wx.removeStorageSync(this.storageKey); } catch (_) { /* The activity has already been published. */ }
      wx.redirectTo({ url: "/pages/activity/activity?club=" + this.clubId + "&id=" + result.activity.id });
    } catch (err) {
      this.setData({ message: err.message });
    } finally {
      this.setData({ busy: false });
    }
  }
});
