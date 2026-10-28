const { request } = require("../../utils/request");

Page({
  data: {
    activity: null,
    groups: [],
    signups: [],
    visibleSignups: [],
    checks: [],
    album: { photoCount: 0, videoCount: 0 },
    staff: false,
    activeTab: "overview",
    rosterExpanded: false,
    loading: false,
    actionBusy: false,
    km: "",
    editing: false,
    draft: null,
    groupName: "",
    groupKind: "pace",
    groupKindLabel: "配速组",
    groupPace: "",
    groupCap: "0",
    message: "",
    clubId: "",
    activityId: ""
  },
  onLoad(query) {
    this.clubId = query.club;
    this.activityId = query.id;
    this.setData({ clubId: query.club, activityId: query.id });
    wx.showShareMenu({ menus: ["shareAppMessage"] });
  },
  onShareAppMessage() {
    return { title: this.data.activity ? this.data.activity.title : "跑团训练", path: "/pages/activity/activity?club=" + this.clubId + "&id=" + this.activityId };
  },
  onShow() {
    this.load();
  },
  load() {
    const ticket = this.requestTicket = (this.requestTicket || 0) + 1;
    this.setData({ loading: true, message: "" });
    return request("/clubs/" + this.clubId + "/activities/" + this.activityId)
      .then((data) => {
        if (ticket !== this.requestTicket) return;
        const labels = { easy: "轻松跑", long: "长距离", interval: "间歇训练", tempo: "节奏跑", social: "社交跑", custom: "训练活动" };
        const signups = (data.signups || []).map((person) => ({
          ...person,
          avatarText: String(person.nickname || "跑").slice(0, 1)
        }));
        this.setData({
          activity: { ...data.activity, trainingTypeLabel: labels[data.activity.trainingType] || "训练活动" },
          groups: data.groups || [],
          signups,
          visibleSignups: this.data.rosterExpanded ? signups : signups.slice(0, 5),
          checks: data.checks || [],
          album: data.album || { photoCount: 0, videoCount: 0 },
          staff: !!data.staff,
          km: data.activity.mine && data.activity.mine.km != null ? String(data.activity.mine.km) : this.data.km,
          loading: false,
          message: ""
        });
      })
      .catch((err) => { if (ticket === this.requestTicket) this.setData({ activity: null, loading: false, message: err.message }); });
  },
  retry() {
    this.load();
  },
  selectTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },
  toggleRoster() {
    const rosterExpanded = !this.data.rosterExpanded;
    this.setData({
      rosterExpanded,
      visibleSignups: rosterExpanded ? this.data.signups : this.data.signups.slice(0, 5)
    });
  },
  onKm(e) {
    this.setData({ km: e.detail.value });
  },
  cancel() {
    if (this.data.actionBusy) return;
    this.setData({ actionBusy: true });
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/signup", "DELETE")
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }))
      .finally(() => this.setData({ actionBusy: false }));
  },
  pacer() {
    if (this.data.actionBusy) return;
    const on = !(this.data.activity.mine && this.data.activity.mine.pacer);
    this.setData({ actionBusy: true });
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/pacer", "POST", { on })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }))
      .finally(() => this.setData({ actionBusy: false }));
  },
  check() {
    const activity = this.data.activity;
    if (this.data.actionBusy || !activity || !activity.mine || !activity.mine.signed || !activity.checkAvailable) return;
    if (!Number.isFinite(Number(this.data.km)) || Number(this.data.km) <= 0) return this.setData({ message: "请填写有效的打卡里程" });
    this.setData({ actionBusy: true });
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/check", "POST", { km: Number(this.data.km) })
      .then((data) => {
        const result = data.awarded ? "这场已记分" : "打卡已保存，积分按活动规则计算";
        return this.load().then(() => this.setData({ message: result }));
      })
      .catch((err) => this.setData({ message: err.message }))
      .finally(() => this.setData({ actionBusy: false }));
  },
  endActivity() {
    if (this.data.actionBusy) return;
    this.setData({ actionBusy: true });
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/end", "POST", {})
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }))
      .finally(() => this.setData({ actionBusy: false }));
  },
  cancelActivity() {
    if (this.data.actionBusy) return;
    this.setData({ actionBusy: true });
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/cancel", "POST", {})
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }))
      .finally(() => this.setData({ actionBusy: false }));
  },
  toggleEdit() {
    const row = this.data.activity;
    this.setData({
      editing: !this.data.editing,
      draft: {
        title: row.title,
        issue: row.issue || "",
        startsAt: String(row.startsAt || "").replace("T", " "),
        endsAt: row.endsAt ? String(row.endsAt).replace("T", " ") : "",
        gatherAt: row.gatherAt || "",
        gatherPlace: row.gatherPlace || "",
        place: row.place || "",
        plannedKm: row.plannedKm == null ? "" : String(row.plannedKm),
        route: row.route || "",
        trainingType: row.trainingType || "custom",
        signupUntil: row.signupUntil ? String(row.signupUntil).replace("T", " ") : "",
        cancelUntil: row.cancelUntil ? String(row.cancelUntil).replace("T", " ") : "",
        workout: row.workout || "",
        notice: row.notice || "",
        note: row.note || "",
        minPeople: String(row.minPeople),
        minKm: String(row.minKm),
        points: String(row.points),
        review: !!row.review
      }
    });
  },
  toggleReview(e) { this.setData({ "draft.review": e.detail.value }); },
  avatarError(e) {
    const id = Number(e.currentTarget.dataset.id);
    const signups = this.data.signups.map((person) => person.userId === id ? { ...person, avatar: "" } : person);
    this.setData({ signups, visibleSignups: this.data.rosterExpanded ? signups : signups.slice(0, 5) });
  },
  onDraft(e) {
    this.setData({ ["draft." + e.currentTarget.dataset.key]: e.detail.value });
  },
  pickTrainingType(e) {
    this.setData({ "draft.trainingType": e.currentTarget.dataset.id });
  },
  pickKind(e) {
    this.setData({ groupKind: e.currentTarget.dataset.kind, groupKindLabel: e.currentTarget.dataset.label });
  },
  onGroup(e) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  saveActivity() {
    if (this.data.actionBusy) return;
    const draft = this.data.draft;
    this.setData({ actionBusy: true });
    request("/clubs/" + this.clubId + "/activities/" + this.activityId, "PUT", {
      ...draft,
      minPeople: Number(draft.minPeople),
      minKm: Number(draft.minKm),
      points: Number(draft.points),
      plannedKm: draft.plannedKm === "" ? "" : Number(draft.plannedKm)
    })
      .then(() => {
        this.setData({ editing: false });
        this.load();
      })
      .catch((err) => this.setData({ message: err.message }))
      .finally(() => this.setData({ actionBusy: false }));
  },
  addGroup() {
    if (this.data.actionBusy) return;
    this.setData({ actionBusy: true });
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/groups", "POST", {
      name: this.data.groupName,
      kind: this.data.groupKind,
      pace: this.data.groupPace,
      capacity: Number(this.data.groupCap) || 0
    })
      .then(() => {
        this.setData({ groupName: "", groupPace: "" });
        this.load();
      })
      .catch((err) => this.setData({ message: err.message }))
      .finally(() => this.setData({ actionBusy: false }));
  }
});
