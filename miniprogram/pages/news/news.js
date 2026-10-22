const { request } = require("../../utils/request");

Page({
  data: { rows: [], message: "", ready: false },
  onShow() {
    request("/news")
      .then((data) => this.setData({ rows: data.news || [], ready: true, message: "" }))
      .catch((err) => this.setData({ message: err.message, ready: true }));
  }
});
