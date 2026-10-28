const { request } = require("../../utils/request");

Page({
  data: {
    activity: null,
    groups: [],
    levels: [],
    viewerName: "",
    gender: "",
    level: "",
    groupId: "",
    optionalOpen: false,
    loading: false,
    submitting: false,
    message: ""
  },
  onLoad(query) {
    this.clubId = query.club;
    this.activityId = query.id;
    this.submitting = false;
  },
  onShow() {
    this.load();
  },
  load() {
    this.setData({ loading: true, message: "" });
    return request("/clubs/" + this.clubId + "/activities/" + this.activityId)
      .then((data) => {
        if (data.activity.mine && data.activity.mine.signed) {
          this.returnToActivity();
          return;
        }
        const groups = data.groups || [];
        const selection = groups.some((group) => String(group.id) === String(this.data.groupId) && !group.full)
          ? this.data.groupId
          : "";
        this.setData({
          activity: data.activity,
          groups,
          levels: data.levels || [],
          viewerName: data.viewerName || "",
          groupId: selection,
          loading: false,
          message: ""
        });
      })
      .catch((err) => this.setData({ loading: false, message: err.message }));
  },
  retry() {
    this.load();
  },
  returnToActivity() {
    wx.redirectTo({ url: "/pages/activity/activity?club=" + this.clubId + "&id=" + this.activityId });
  },
  toggleOptional() {
    this.setData({ optionalOpen: !this.data.optionalOpen });
  },
  pickGender(e) {
    this.setData({ gender: e.currentTarget.dataset.id });
  },
  pickLevel(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ level: this.data.level === id ? "" : id });
  },
  pickGroup(e) {
    if (Number(e.currentTarget.dataset.full)) return;
    this.setData({ groupId: Number(e.currentTarget.dataset.id) });
  },
  submit() {
    if (this.submitting || this.data.submitting || this.data.loading) return;
    if (!this.data.activity) return;
    if (this.data.groups.length && !this.data.groupId) {
      this.setData({ message: "请选择一个组别后再提交" });
      return;
    }
    if (!this.data.activity.action.enabled || this.data.activity.action.kind !== "signup") {
      this.setData({ message: this.data.activity.action.label });
      return;
    }
    const selectedGroup = this.data.groups.find((group) => String(group.id) === String(this.data.groupId));
    if (selectedGroup && selectedGroup.full) {
      this.setData({ groupId: "", message: "所选组别名额已满，请重新选择" });
      return;
    }
    this.submitting = true;
    this.setData({ submitting: true, message: "" });
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/signup", "POST", {
      groupId: Number(this.data.groupId) || 0,
      gender: this.data.gender,
      level: this.data.level
    })
      .then(() => this.returnToActivity())
      .catch((err) => this.setData({ message: err.message }))
      .finally(() => {
        this.submitting = false;
        this.setData({ submitting: false });
      });
  }
});
