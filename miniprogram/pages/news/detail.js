const { request } = require("../../utils/request");
const { parseGuide } = require("../../utils/guide-md");

Page({
  data: { item: null, blocks: [], message: "" },
  onLoad(query) {
    request("/news/" + query.id)
      .then((data) => this.setData({ item: data.news, blocks: parseGuide(data.news && data.news.body), message: "" }))
      .catch((err) => this.setData({ message: err.message }));
  }
});
