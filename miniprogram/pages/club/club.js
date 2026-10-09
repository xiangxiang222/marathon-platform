const { request } = require("../../utils/request");

function unpaidText(item) {
  return (item.unpaid || [])
    .map((mark) => (typeof mark === "string" ? mark : mark.nickname))
    .filter(Boolean)
    .join("、");
}

Page({
  data: {
    phase: "loading",
    club: null,
    members: [],
    board: [],
    ranks: [],
    checkins: [],
    checkedIn: false,
    note: "",
    checkBusy: false,
    checkMessage: "",
    checkOk: "",
    message: "",
    codeOk: "",
    codeError: "",
    copyOk: "",
    copyError: "",
    copiedId: ""
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
    this.setData({ phase: "loading", message: "" });
    request("/clubs/" + this.clubId)
      .then((data) => {
        const board = (data.board || []).map((item) => ({
          ...item,
          key: item.race.id,
          unpaidText: unpaidText(item),
          squadText: item.squad ? item.squad.text : "",
          soon: item.race.open && item.race.daysLeft <= 3,
          alternatives: item.alternatives || [],
          alternativeNote: item.alternativeNote || ""
        }));
        this.setData({
          phase: "ready",
          club: data.club,
          members: data.members || [],
          board,
          ranks: data.ranks || [],
          checkins: data.checkins || [],
          checkedIn: !!data.checkedIn,
          note: data.myNote || "",
          checkMessage: "",
          message: ""
        });
      })
      .catch((err) => this.setData({ phase: "error", message: err.message || "跑团没有打开" }));
  },
  onNote(e) {
    this.setData({ note: e.detail.value });
  },
  copyCode() {
    const code = this.data.club ? this.data.club.code : "";
    wx.setClipboardData({
      data: code,
      success: () => this.setData({ codeOk: "口令已复制。发到微信群即可。", codeError: "" }),
      fail: () => this.setData({ codeError: "没有复制成功。选中上面的口令即可。", codeOk: "" })
    });
  },
  copyCard(e) {
    const id = e.currentTarget.dataset.id || "";
    const item = (this.data.board || []).find((row) => row.race && row.race.id === id);
    const text = (item && item.text) || "";
    this.setData({ copiedId: id });
    wx.setClipboardData({
      data: text,
      success: () => this.setData({ copyOk: "已复制。贴到微信群即可。", copyError: "" }),
      fail: () => this.setData({ copyError: "没有复制成功。选中下面的文字即可。", copyOk: "" })
    });
  },
  checkIn() {
    this.setData({ checkBusy: true, checkMessage: "", checkOk: "" });
    request("/clubs/" + this.clubId + "/checkins", "POST", { note: (this.data.note || "").trim() })
      .then((data) =>
        this.setData({
          checkins: data.checkins || [],
          checkedIn: !!data.checkedIn,
          note: data.myNote || "",
          checkBusy: false,
          checkOk: "已记下今天的签到。"
        })
      )
      .catch((err) => this.setData({ checkBusy: false, checkMessage: err.message }));
  },
  undoCheckin() {
    this.setData({ checkBusy: true, checkMessage: "", checkOk: "" });
    request("/clubs/" + this.clubId + "/checkins", "DELETE")
      .then((data) =>
        this.setData({
          checkins: data.checkins || [],
          checkedIn: !!data.checkedIn,
          note: data.myNote || "",
          checkBusy: false,
          checkOk: "已撤销今天的签到。"
        })
      )
      .catch((err) => this.setData({ checkBusy: false, checkMessage: err.message }));
  }
});
