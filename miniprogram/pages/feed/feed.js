const { request } = require("../../utils/request");

Page({
  data: {
    note: "只有本团能看。点赞和评论不加积分。",
    body: "",
    posts: [],
    drafts: {},
    message: ""
  },
  onLoad(query) {
    this.clubId = query.id;
  },
  onShow() {
    this.load();
  },
  load() {
    request("/clubs/" + this.clubId + "/posts")
      .then((data) => this.setData({ note: data.note, posts: data.posts || [], message: "" }))
      .catch((err) => this.setData({ message: err.message }));
  },
  onBody(e) {
    this.setData({ body: e.detail.value });
  },
  onDraft(e) {
    const drafts = Object.assign({}, this.data.drafts);
    drafts[e.currentTarget.dataset.id] = e.detail.value;
    this.setData({ drafts });
  },
  publish() {
    request("/clubs/" + this.clubId + "/posts", "POST", { body: this.data.body })
      .then((data) => this.setData({ body: "", posts: data.posts || [], message: "" }))
      .catch((err) => this.setData({ message: err.message }));
  },
  comment(e) {
    const id = e.currentTarget.dataset.id;
    request("/clubs/" + this.clubId + "/posts/" + id + "/comments", "POST", { body: this.data.drafts[id] || "" })
      .then((data) => {
        const drafts = Object.assign({}, this.data.drafts);
        drafts[id] = "";
        this.setData({ drafts, posts: data.posts || [], message: "" });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  like(e) {
    const liked = e.currentTarget.dataset.liked;
    const method = liked === true || liked === "true" ? "DELETE" : "POST";
    request("/clubs/" + this.clubId + "/posts/" + e.currentTarget.dataset.id + "/like", method)
      .then((data) => this.setData({ posts: data.posts || [], message: "" }))
      .catch((err) => this.setData({ message: err.message }));
  },
  removePost(e) {
    request("/clubs/" + this.clubId + "/posts/" + e.currentTarget.dataset.id, "DELETE")
      .then((data) => this.setData({ posts: data.posts || [], message: "" }))
      .catch((err) => this.setData({ message: err.message }));
  },
  removeComment(e) {
    request("/clubs/" + this.clubId + "/posts/" + e.currentTarget.dataset.pid + "/comments/" + e.currentTarget.dataset.cid, "DELETE")
      .then((data) => this.setData({ posts: data.posts || [], message: "" }))
      .catch((err) => this.setData({ message: err.message }));
  }
});
