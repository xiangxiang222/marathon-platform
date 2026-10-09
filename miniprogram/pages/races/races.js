const { request } = require("../../utils/request");

const STATUSES = [
  { label: "报名中", value: "open" },
  { label: "即将开赛", value: "upcoming" },
  { label: "待开赛", value: "wait" },
  { label: "已结束", value: "closed" },
  { label: "全部", value: "all" }
];
const DISTANCES = [
  { label: "全部项目", value: "" },
  { label: "马拉松", value: "full" },
  { label: "半程", value: "half" },
  { label: "10公里", value: "10k" }
];

Page({
  data: {
    q: "",
    status: "open",
    distance: "",
    city: "",
    month: "",
    monthLabel: "",
    sheet: "",
    statuses: STATUSES,
    distances: DISTANCES,
    cities: [],
    months: [],
    races: [],
    reminders: [],
    reminderTitle: "明天的节点",
    loading: true,
    message: ""
  },
  onShow() {
    this.load();
    this.loadReminders();
  },
  onQ(e) {
    this.setData({ q: e.detail.value });
  },
  setStatus(e) {
    this.setData({ status: e.currentTarget.dataset.value });
    this.load();
  },
  setDistance(e) {
    this.setData({ distance: e.currentTarget.dataset.value });
    this.load();
  },
  toggleSheet(e) {
    const name = e.currentTarget.dataset.sheet;
    this.setData({ sheet: this.data.sheet === name ? "" : name });
  },
  pickCity(e) {
    this.setData({ city: e.currentTarget.dataset.value || "" });
    this.load();
  },
  pickMonth(e) {
    const month = e.currentTarget.dataset.value || "";
    const parts = month.split("-");
    this.setData({ month, monthLabel: month ? parts[0] + "年" + Number(parts[1]) + "月" : "" });
    this.load();
  },
  loadReminders() {
    request("/reminders")
      .then((data) => {
        const mine = data.mine || [];
        const list = (mine.length ? mine : data.reminders || []).slice(0, 3).map((item) => ({
          ...item,
          key: item.race.id + item.hit.key
        }));
        this.setData({
          reminders: list,
          reminderTitle: mine.length ? "你标过的场，明天有节点" : "明天的节点"
        });
      })
      .catch(() => this.setData({ reminders: [] }));
  },
  load() {
    const params = ["status=" + (this.data.status || "all")];
    const q = (this.data.q || "").trim();
    if (q) params.push("q=" + encodeURIComponent(q));
    if (this.data.city) params.push("city=" + encodeURIComponent(this.data.city));
    if (this.data.month) params.push("month=" + encodeURIComponent(this.data.month));
    if (this.data.distance) params.push("distance=" + encodeURIComponent(this.data.distance));
    this.setData({ loading: true, message: "", sheet: "" });
    request("/races?" + params.join("&"))
      .then((data) => {
        const races = (data.races || []).map((race) => ({
          ...race,
          soon: race.open && race.daysLeft <= 3,
          meta: race.raceDate + " · " + race.city + (race.distanceLabels && race.distanceLabels.length ? " · " + race.distanceLabels.join(" / ") : "")
        }));
        const months = (data.months || []).map((value) => {
          const parts = value.split("-");
          return { value, label: parts[0] + "年" + Number(parts[1]) + "月" };
        });
        this.setData({
          races,
          cities: data.cities || [],
          months,
          loading: false,
          message: ""
        });
      })
      .catch((err) => this.setData({ loading: false, message: err.message || "赛历没有读出来" }));
  }
});
