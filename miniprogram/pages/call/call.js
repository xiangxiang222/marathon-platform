const { request } = require("../../utils/request");

const LABELS = { full: "全马", half: "半马", "10k": "10公里", "5k": "5公里" };

Page({
  data: {
    call: null,
    options: [],
    distance: "",
    distanceLabel: "",
    time: "",
    message: ""
  },
  onLoad(query) {
    this.clubId = query.club;
    this.callId = query.id;
    wx.showShareMenu({ menus: ["shareAppMessage"] });
  },
  onShow() {
    this.load();
  },
  onShareAppMessage() {
    const call = this.data.call || {};
    return {
      title: (call.title || "成绩统计") + "，点开填写",
      path: "/pages/call/call?club=" + this.clubId + "&id=" + this.callId
    };
  },
  load() {
    request("/clubs/" + this.clubId + "/calls/" + this.callId)
      .then((data) => {
        const call = data.call;
        const options = (call.distances || []).map((id) => ({
          id,
          label: id === "other" ? (call.otherKm || "") + "公里" : LABELS[id] || id
        }));
        const distance = this.data.distance || (options[0] && options[0].id) || "";
        const picked = options.find((item) => item.id === distance);
        this.setData({
          call,
          options,
          distance,
          distanceLabel: picked ? picked.label : "",
          message: ""
        });
      })
      .catch((err) => this.setData({ message: err.message, call: null }));
  },
  pickDistance(e) {
    this.setData({ distance: e.currentTarget.dataset.id, distanceLabel: e.currentTarget.dataset.label });
  },
  onTime(e) {
    this.setData({ time: e.detail.value });
  },
  submitOwn() {
    request("/clubs/" + this.clubId + "/calls/" + this.callId + "/rows", "POST", {
      distance: this.data.distance,
      time: this.data.time
    })
      .then((data) => this.setData({ call: data.call, message: "已记下" }))
      .catch((err) => this.setData({ message: err.message }));
  },
  copyText(e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.text || "" });
  }
});
