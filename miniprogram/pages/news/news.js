const { request } = require("../../utils/request");

function pageNumbers(page, pages) {
  const total = Math.max(1, Number(pages) || 1);
  const current = Math.min(Math.max(1, Number(page) || 1), total);
  const width = 10;
  let start = 1;
  let end = total;
  if (total > width) {
    start = Math.max(1, current - 4);
    end = Math.min(total, start + width - 1);
    start = Math.max(1, end - width + 1);
  }
  const list = [];
  for (let n = start; n <= end; n += 1) list.push(n);
  return list;
}

Page({
  data: { rows: [], message: "", ready: false, page: 1, pages: 1, pageNumbers: [], total: 0 },
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
        pageNumbers: pageNumbers(data.page || 1, data.pages || 1),
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
  },
  goPage(e) {
    const next = Number(e.currentTarget.dataset.page);
    if (!next || next === this.data.page) return;
    this.data.page = next;
    this.setData({ page: next });
    this.load();
  }
});
