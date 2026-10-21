const { request } = require("../../utils/request");

Page({
  data: {
    view: null,
    message: ""
  },
  onLoad(query) {
    this.clubId = query.id;
  },
  onShow() {
    this.load();
  },
  load() {
    request("/clubs/" + this.clubId + "/partner")
      .then((data) => this.setData({ view: data, message: "" }))
      .catch((err) => this.setData({ message: err.message }));
  },
  claim(e) {
    request("/clubs/" + this.clubId + "/supplies/" + e.currentTarget.dataset.id + "/claim", "POST")
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  cancel(e) {
    request("/clubs/" + this.clubId + "/supplies/" + e.currentTarget.dataset.sid + "/claims/" + e.currentTarget.dataset.cid, "DELETE")
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  give(e) {
    request("/clubs/" + this.clubId + "/supplies/" + e.currentTarget.dataset.sid + "/claims/" + e.currentTarget.dataset.cid + "/give", "POST")
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  joinLeague() {
    request("/clubs/" + this.clubId + "/league/join", "POST")
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  },
  leaveLeague() {
    request("/clubs/" + this.clubId + "/league/join", "DELETE")
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  }
});
