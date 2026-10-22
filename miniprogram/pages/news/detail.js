const { request } = require("../../utils/request");

Page({
  data: { item: null, message: "" },
  onLoad(query) {
    request("/news/" + query.id)
      .then((data) => this.setData({ item: data.news, message: "" }))
      .catch((err) => this.setData({ message: err.message }));
  },
  copy() {
    const url = this.data.item && this.data.item.url;
    if (!url) return;
    wx.setClipboardData({ data: url });
  }
});
