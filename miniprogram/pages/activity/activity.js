const { request } = require("../../utils/request");

Page({
  data: {
    activity: null,
    groups: [],
    checks: [],
    album: { photoCount: 0, videoCount: 0 },
    staff: false,
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
  },
  onShow() {
    this.load();
  },
  load() {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId)
      .then((data) => {
        this.setData({
          activity: data.activity,
          groups: data.groups || [],
          checks: data.checks || [],
          album: data.album || { photoCount: 0, videoCount: 0 },
          staff: !!data.staff,
          km: data.activity.mine && data.activity.mine.km != null ? String(data.activity.mine.km) : this.data.km,
          message: ""
        });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  onKm(e) {
    this.setData({ km: e.detail.value });
  },
  cancel() {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/signup", "DELETE")
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  pacer() {
    const on = !(this.data.activity.mine && this.data.activity.mine.pacer);
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/pacer", "POST", { on })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  check() {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/check", "POST", { km: Number(this.data.km) })
      .then((data) => {
        this.setData({ message: data.awarded ? "这场已记分" : "已记下。人数或里程还不够，这场先不计分" });
        this.load();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  endActivity() {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/end", "POST", {})
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  cancelActivity() {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/cancel", "POST", {})
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
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
        cancelUntil: row.cancelUntil ? String(row.cancelUntil).replace("T", " ") : "",
        note: row.note || "",
        minPeople: String(row.minPeople),
        minKm: String(row.minKm),
        points: String(row.points)
      }
    });
  },
  onDraft(e) {
    this.setData({ ["draft." + e.currentTarget.dataset.key]: e.detail.value });
  },
  pickKind(e) {
    this.setData({ groupKind: e.currentTarget.dataset.kind, groupKindLabel: e.currentTarget.dataset.label });
  },
  onGroup(e) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  saveActivity() {
    const draft = this.data.draft;
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
      .catch((err) => this.setData({ message: err.message }));
  },
  addGroup() {
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
      .catch((err) => this.setData({ message: err.message }));
  }
});