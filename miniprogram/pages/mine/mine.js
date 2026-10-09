const { request, setAuth, ready } = require("../../utils/request");

Page({
  data: {
    nickname: "",
    draft: "",
    plans: [],
    results: [],
    career: { finished: 0, provinces: [], cities: [], pb: { full: "", half: "" }, yearKm: 0 },
    conflicts: [],
    reminders: [],
    loaded: false,
    message: "",
    company: "北京华创科技有限公司",
    icp: "京ICP备2026060284号-2"
  },
  onShow() {
    request("/meta")
      .then((meta) => this.setData({ company: meta.company, icp: meta.icp }))
      .catch(() => {});
    const nickname = (getApp().globalData && getApp().globalData.nickname) || "";
    this.setData({ nickname, ready: ready() });
    if (ready()) this.load();
  },
  onDraft(e) {
    this.setData({ draft: e.detail.value });
  },
  enter() {
    request("/session", "POST", { nickname: (this.data.draft || "").trim() })
      .then((data) => {
        setAuth(data.token, data.user.nickname);
        this.setData({ nickname: data.user.nickname, draft: "", message: "" });
        this.load();
      })
      .catch((err) => this.setData({ message: err.message }));
  },
  load() {
    request("/me")
      .then((data) => {
        const plans = (data.plans || []).map((item) => ({ ...item, raceId: item.race.id }));
        const results = (data.results || []).map((item) => ({ ...item, raceId: item.race.id }));
        const reminders = (data.reminders || []).map((item) => ({ ...item, key: item.race.id + item.hit.key }));
        this.setData({
          plans,
          results,
          career: data.career || this.data.career,
          reminders,
          conflicts: data.conflicts || [],
          nickname: data.user.nickname,
          loaded: true
        });
      })
      .catch((err) => this.setData({ loaded: true, message: err.message }));
  }
});
