const { request } = require("../../utils/request");

Page({
  data: { rows: [], message: "", ready: false, page: 1, pages: 1, total: 0 },
  onShow() {
    this.load();
  },
  load() {
    request("/news?page=" + (this.data.page || 1))
      .then((data) => this.setData({
        rows: data.news || [],
        ready: true,
        message: "",
        page: data.page || 1,
        pages: data.pages || 1,
        total: data.total || 0
      }))
      .catch((err) => this.setData({ message: err.message, ready: true }));
  },
  prevPage() {
    if (this.data.page <= 1) return;
    this.data.page -= 1;
    this.setData({ page: this.data.page });
    this.load();
  },
  nextPage() {
    if (this.data.page >= this.data.pages) return;
    this.data.page += 1;
    this.setData({ page: this.data.page });
    this.load();
  }
});
