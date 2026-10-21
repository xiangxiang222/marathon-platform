const { request } = require("../../utils/request");

Page({
  data: {
    board: null,
    report: null,
    range: "month",
    kind: "month",
    query: "",
    reason: "",
    message: ""
  },
  onLoad(query) {
    this.clubId = query.id;
  },
  onShow() {
    this.load();
  },
  load() {
    const q = this.data.query ? "&q=" + encodeURIComponent(this.data.query) : "";
    request("/clubs/" + this.clubId + "/mileage?range=" + this.data.range + q)
      .then((data) => this.setData({ board: data, message: "" }))
      .catch((err) => this.setData({ message: err.message }));
    request("/clubs/" + this.clubId + "/mileage/report?kind=" + this.data.kind)
      .then((data) => this.setData({ report: data }))
      .catch(() => {});
  },
  pickRange(e) {
    this.setData({ range: e.currentTarget.dataset.range });
    this.load();
  },
  pickKind(e) {
    this.setData({ kind: e.currentTarget.dataset.kind });
    this.load();
  },
  onQuery(e) {
    this.setData({ query: e.detail.value });
    this.load();
  },
  onReason(e) {
    this.setData({ reason: e.detail.value });
  },
  challenge(e) {
    request("/clubs/" + this.clubId + "/mileage/runs/" + e.currentTarget.dataset.id + "/challenge", "POST", { reason: this.data.reason })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  decide(e) {
    request("/clubs/" + this.clubId + "/mileage/runs/" + e.currentTarget.dataset.id + "/decision", "POST", {
      counted: e.currentTarget.dataset.keep === "1"
    })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  }
});
