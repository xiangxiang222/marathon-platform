const { request, ready } = require("../../utils/request");

Page({
  data: {
    loggedIn: false,
    note: "仅供参考。没有往届名次成绩时，不估算概率。",
    gender: "",
    birth: "",
    province: "",
    full: "",
    half: "",
    ten: "",
    five: "",
    rows: [],
    message: ""
  },
  onShow() {
    if (!ready()) {
      this.setData({ loggedIn: false, rows: [], message: "" });
      return;
    }
    this.load();
  },
  load() {
    if (!ready()) {
      this.setData({ loggedIn: false, rows: [], message: "" });
      return;
    }
    this.setData({ loggedIn: true });
    request("/radar")
      .then((data) => {
        if (!ready()) return;
        const targets = (data.profile && data.profile.targets) || {};
        this.setData({
          note: data.note,
          gender: data.profile.gender || "",
          birth: data.profile.birth || "",
          province: data.profile.province || "",
          full: targets.full || "",
          half: targets.half || "",
          ten: targets["10k"] || "",
          five: targets["5k"] || "",
          rows: data.rows || [],
          message: ""
        });
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  setGender(e) {
    this.setData({ gender: e.currentTarget.dataset.gender });
  },
  onBirth(e) {
    this.setData({ birth: e.detail.value });
  },
  onProvince(e) {
    this.setData({ province: e.detail.value });
  },
  onFull(e) {
    this.setData({ full: e.detail.value });
  },
  onHalf(e) {
    this.setData({ half: e.detail.value });
  },
  onTen(e) {
    this.setData({ ten: e.detail.value });
  },
  onFive(e) {
    this.setData({ five: e.detail.value });
  },
  save() {
    if (!ready()) {
      this.setData({ loggedIn: false, rows: [], message: "" });
      return;
    }
    request("/me/radar", "PUT", {
      gender: this.data.gender,
      birth: this.data.birth,
      province: this.data.province,
      targets: { full: this.data.full, half: this.data.half, "10k": this.data.ten, "5k": this.data.five }
    })
      .then(() => this.load())
      .catch((err) => this.setData({ message: err.message }));
  }
});
