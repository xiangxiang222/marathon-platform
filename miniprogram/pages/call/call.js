const { request } = require("../../utils/request");
const { baseUrl } = require("../../config");

const LABELS = { full: "全马", half: "半马", "10k": "10公里", "5k": "5公里" };

Page({
  data: {
    call: null,
    staff: false,
    options: [],
    distance: "",
    distanceLabel: "",
    time: "",
    deadline: "",
    members: [],
    forUser: "",
    forName: "",
    forDistance: "",
    forLabel: "",
    forTime: "",
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
  withSheets(call) {
    const token = getApp().globalData.token || "";
    return {
      ...call,
      groups: (call.groups || []).map((group) => ({
        ...group,
        rows: (group.rows || []).map((row) => ({
          ...row,
          sheetSrc: row.hasSheet ? baseUrl + "/marathon/api/call-sheets/" + row.id + "?t=" + encodeURIComponent(token) : ""
        }))
      }))
    };
  },
  load() {
    Promise.all([request("/clubs/" + this.clubId + "/calls/" + this.callId), request("/clubs/" + this.clubId)])
      .then(([data, club]) => {
        const call = this.withSheets(data.call);
        const options = (call.distances || []).map((id) => ({
          id,
          label: id === "other" ? (call.otherKm || "") + "公里" : LABELS[id] || id
        }));
        const distance = this.data.distance || (options[0] && options[0].id) || "";
        const picked = options.find((item) => item.id === distance);
        const forDistance = this.data.forDistance || distance;
        const forPicked = options.find((item) => item.id === forDistance);
        this.setData({
          call,
          staff: !!(club.club && club.club.staff),
          members: call.members || [],
          options,
          distance,
          distanceLabel: picked ? picked.label : "",
          forDistance,
          forLabel: forPicked ? forPicked.label : "",
          deadline: String(call.deadline || "").replace("T", " "),
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
      .then((data) => this.setData({ call: this.withSheets(data.call), message: "已记下" }))
      .catch((err) => this.setData({ message: err.message }));
  },
  ownRow() {
    const call = this.data.call;
    if (!call) return null;
    for (const group of call.groups || []) {
      const row = (group.rows || []).find((item) => item.mine && item.distance === this.data.distance);
      if (row) return row;
    }
    return null;
  },
  chooseSheet() {
    const row = this.ownRow();
    if (!row) {
      this.setData({ message: "先提交这条成绩，再上传截图" });
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      success: (res) => {
        const file = (res.tempFiles || [])[0];
        if (!file) return;
        const app = getApp();
        wx.uploadFile({
          url: app.globalData.baseUrl + "/marathon/api/clubs/" + this.clubId + "/calls/" + this.callId + "/rows/" + row.id + "/sheet",
          filePath: file.tempFilePath,
          name: "file",
          header: { Authorization: app.globalData.token ? "Bearer " + app.globalData.token : "" },
          success: (upload) => {
            if (upload.statusCode >= 200 && upload.statusCode < 300) {
              const data = JSON.parse(upload.data);
              this.setData({ call: this.withSheets(data.call), message: "截图已上传" });
            } else {
              let message = "没有传上去";
              try {
                message = JSON.parse(upload.data).error || message;
              } catch (err) {}
              this.setData({ message });
            }
          },
          fail: () => this.setData({ message: "没有传上去" })
        });
      }
    });
  },
  removeRow(e) {
    request("/clubs/" + this.clubId + "/calls/" + this.callId + "/rows/" + e.currentTarget.dataset.id, "DELETE")
      .then((data) => this.setData({ call: this.withSheets(data.call), message: "" }))
      .catch((err) => this.setData({ message: err.message }));
  },
  onDeadline(e) {
    this.setData({ deadline: e.detail.value });
  },
  saveDeadline() {
    request("/clubs/" + this.clubId + "/calls/" + this.callId, "PUT", { deadline: this.data.deadline, note: this.data.call.note })
      .then((data) => this.setData({ call: this.withSheets(data.call), deadline: String(data.call.deadline || "").replace("T", " "), message: "截止已改" }))
      .catch((err) => this.setData({ message: err.message }));
  },
  pickMember(e) {
    this.setData({ forUser: e.currentTarget.dataset.id, forName: e.currentTarget.dataset.name });
  },
  pickForDistance(e) {
    this.setData({ forDistance: e.currentTarget.dataset.id, forLabel: e.currentTarget.dataset.label });
  },
  onForTime(e) {
    this.setData({ forTime: e.detail.value });
  },
  fillFor() {
    request("/clubs/" + this.clubId + "/calls/" + this.callId + "/rows", "POST", {
      userId: Number(this.data.forUser),
      distance: this.data.forDistance,
      time: this.data.forTime
    })
      .then((data) => this.setData({ call: this.withSheets(data.call), forTime: "", message: "已补录" }))
      .catch((err) => this.setData({ message: err.message }));
  },
  copyText(e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.text || "" });
  }
});
