const { request } = require("../../utils/request");

Page({
  data: { club: null, members: [], board: [], ranks: [], activities: [], checkins: [], checkedIn: false, note: "", checkMessage: "", message: "" },
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
  }
});
