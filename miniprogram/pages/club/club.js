const { request } = require("../../utils/request");

Page({
  data: {
    club: null,
    members: [],
    groups: [],
    gifts: [],
    requests: [],
    myPoints: 0,
    board: [],
    ranks: [],
    activities: [],
    checkins: [],
    checkedIn: false,
    note: "",
    checkMessage: "",
    message: "",
    actTitle: "",
    actPlace: "",
    actWhen: "",
    actNote: "",
    actPeople: "3",
    actKm: "5",
    actPoints: "1",
    groupName: "",
    groupPace: "",
    groupCap: "0",
    giftName: "",
    giftCost: "1",
    giftStock: "1"
  },
  onLoad(query) {
    this.clubId = query.id;
    this.pending = null;
    wx.showShareMenu({ menus: ["shareAppMessage"] });
  },
  onShow() {
    this.load();
  },
  armShare(e) {
    this.pending = e.currentTarget.dataset;
  },
  onShareAppMessage() {
    const pending = this.pending || {};
    const first = (this.data.board && this.data.board[0]) || {};
    const id = pending.id || (first.race && first.race.id) || "";
    const title = pending.title || first.title || (this.data.club && this.data.club.name) || "跑团赛历";
    const code = this.data.club ? this.data.club.code : "";
    return {
      title,
      path: "/pages/race/race?id=" + id + (code ? "&code=" + code : "")
    };
  },
  load() {
    request("/clubs/" + this.clubId)
      .then((data) => {
        const board = (data.board || []).map((item) => ({
          ...item,
          key: item.race.id,
          unpaidText: (item.unpaid || []).join("、"),
          squadText: item.squad ? item.squad.text : "",
          alternatives: item.alternatives || [],
          alternativeNote: item.alternativeNote || ""
        }));
        this.setData({
          club: data.club,
          members: data.members || [],
          board,
          ranks: data.ranks || [],
          activities: data.activities || [],
          groups: data.groups || [],
          gifts: data.gifts || [],
          requests: data.requests || [],
          myPoints: data.myPoints || 0,
          checkins: data.checkins || [],
          checkedIn: !!data.checkedIn,
          note: data.myNote || "",
          checkMessage: "",
          message: ""
        });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  onNote(e) {
    this.setData({ note: e.detail.value });
  },
  checkIn() {
    request("/clubs/" + this.clubId + "/checkins", "POST", { note: this.data.note })
      .then((data) => this.setData({ checkins: data.checkins || [], checkedIn: !!data.checkedIn, note: data.myNote || "", checkMessage: "" }))
      .catch((err) => this.setData({ checkMessage: err.message }));
  },
  undoCheckin() {
    request("/clubs/" + this.clubId + "/checkins", "DELETE")
      .then((data) => this.setData({ checkins: data.checkins || [], checkedIn: !!data.checkedIn, note: data.myNote || "", checkMessage: "" }))
      .catch((err) => this.setData({ checkMessage: err.message }));
  },
  onDraft(e) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  createActivity() {
    request("/clubs/" + this.clubId + "/activities", "POST", {
      title: this.data.actTitle,
      place: this.data.actPlace,
      startsAt: this.data.actWhen,
      note: this.data.actNote,
      minPeople: Number(this.data.actPeople),
      minKm: Number(this.data.actKm),
      points: Number(this.data.actPoints)
    })
      .then((data) => {
        wx.navigateTo({ url: "/pages/activity/activity?club=" + this.clubId + "&id=" + data.activity.id });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  createGroup() {
    request("/clubs/" + this.clubId + "/groups", "POST", {
      name: this.data.groupName,
      pace: this.data.groupPace,
      capacity: Number(this.data.groupCap || 0)
    })
      .then(() => {
        this.setData({ groupName: "", groupPace: "", message: "" });
        this.load();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  createGift() {
    request("/clubs/" + this.clubId + "/gifts", "POST", {
      name: this.data.giftName,
      cost: Number(this.data.giftCost),
      stock: Number(this.data.giftStock)
    })
      .then(() => {
        this.setData({ giftName: "", message: "" });
        this.load();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  redeem(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    request("/clubs/" + this.clubId + "/gifts/" + id + "/redeem", "POST", {})
      .then(() => {
        this.setData({ message: "已兑换 " + name });
        this.load();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  decide(e) {
    const id = e.currentTarget.dataset.id;
    const decision = e.currentTarget.dataset.decision;
    request("/clubs/" + this.clubId + "/requests/" + id, "POST", { decision })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  setRole(e) {
    const id = e.currentTarget.dataset.id;
    const role = e.currentTarget.dataset.role;
    const name = e.currentTarget.dataset.name;
    const send = () => {
      request("/clubs/" + this.clubId + "/members/" + id, "PUT", { role })
        .then(() => this.load())
        .catch((err) => this.setData({ message: err.message }));
    };
    if (role !== "owner") {
      send();
      return;
    }
    wx.showModal({
      title: "把团长交给 " + name,
      content: "你自己会变成跑团管理。",
      success: (res) => {
        if (res.confirm) send();
      }
    });
  },
  removeMember(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: "移出 " + name,
      content: "移出后这个人看不到团里的赛历。",
      success: (res) => {
        if (!res.confirm) return;
        request("/clubs/" + this.clubId + "/members/" + id, "DELETE")
          .then(() => this.load())
          .catch((err) => this.setData({ message: err.message }));
      }
    });
  }
});
