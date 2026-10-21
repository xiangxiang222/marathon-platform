const { request } = require("../../utils/request");

Page({
  data: {
    activity: null,
    groups: [],
    levels: [],
    viewerName: "",
    gender: "",
    level: "",
    groupId: 0,
    message: ""
  },
  onLoad(query) {
    this.clubId = query.club;
    this.activityId = query.id;
  },
  onShow() {
    request("/clubs/" + this.clubId + "/activities/" + this.activityId)
      .then((data) => {
        if (data.activity.mine && data.activity.mine.signed) {
          wx.redirectTo({ url: "/pages/activity/activity?club=" + this.clubId + "&id=" + this.activityId });
          return;
        }
        const open = (data.groups || []).find((group) => !group.full);
        this.setData({
          activity: data.activity,
          groups: data.groups || [],
          levels: data.levels || [],
          viewerName: data.viewerName || "",
          groupId: open ? open.id : 0,
          message: ""
        });
      })
      .catch((err) => this.setData({ message: err.message }));
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
    request("/clubs/" + this.clubId + "/activities/" + this.activityId + "/signup", "POST", {
      groupId: this.data.groupId || 0,
      gender: this.data.gender,
      level: this.data.level
    })
      .then(() => wx.redirectTo({ url: "/pages/activity/activity?club=" + this.clubId + "&id=" + this.activityId }))
      .catch((err) => this.setData({ message: err.message }));
  }
});
