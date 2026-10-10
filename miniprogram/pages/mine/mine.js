const { request, setAuth, ready } = require("../../utils/request");
const { splitPlans } = require("../../utils/product");

Page({
  data: {
    ready: false,
    nickname: "",
    draft: "",
    plans: [],
    urgent: [],
    rest: [],
    results: [],
    places: [],
    career: { finished: 0, provinces: [], cities: [], pb: { full: "", half: "" }, yearKm: 0 },
    conflicts: [],
    reminders: [],
    phase: "loading",
    busy: false,
    message: "",
    ok: "",
    loadError: "",
    company: "北京华创科技有限公司",
    icp: "京ICP备2026060284号-2"
  },
  onShow() {
    request("/meta")
      .then((meta) => this.setData({ company: meta.company, icp: meta.icp }))
      .catch(() => {});
    const nickname = (getApp().globalData && getApp().globalData.nickname) || "";
    const isReady = ready();
    this.setData({ nickname, ready: isReady });
    if (isReady) this.load();
  },
  onDraft(e) {
    this.setData({ draft: e.detail.value });
  },
  enter() {
    const nickname = (this.data.draft || "").trim();
    if (!nickname || nickname.length > 20) {
      this.setData({ message: "昵称用 1 到 20 个字", ok: "" });
      return;
    }
    this.setData({ busy: true, message: "", ok: "" });
    request("/session", "POST", { nickname })
      .then((data) => {
        setAuth(data.token, data.user.nickname);
        this.setData({ nickname: data.user.nickname, ready: true, draft: "", ok: "名字已记下。", busy: false });
        this.load();
      })
      .catch((err) => this.setData({ busy: false, message: err.message }));
  },
  load() {
    this.setData({ phase: "loading", loadError: "" });
    request("/me")
      .then((data) => {
        const plans = (data.plans || []).map((item) => ({
          ...item,
          raceId: item.race.id,
          meta: item.race.raceDate + " · " + item.race.city + " · " + item.race.deadlineLabel
        }));
        const results = (data.results || []).map((item) => ({ ...item, raceId: item.race.id }));
        const reminders = (data.reminders || []).map((item) => ({ ...item, key: item.race.id + item.hit.key }));
        const split = splitPlans(plans);
        const places = [];
        results.forEach((item) => {
          if (item.race.province && places.indexOf(item.race.province) < 0) places.push(item.race.province);
          if (item.race.city && item.race.city !== item.race.province && places.indexOf(item.race.city) < 0) places.push(item.race.city);
        });
        this.setData({
          plans,
          urgent: split.urgent,
          rest: split.rest,
          results,
          places,
          career: data.career || this.data.career,
          reminders,
          conflicts: data.conflicts || [],
          nickname: data.user.nickname,
          phase: "ready"
        });
      })
      .catch((err) => this.setData({ phase: "error", loadError: err.message }));
  }
});
