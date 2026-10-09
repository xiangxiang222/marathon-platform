const { request } = require("../../utils/request");

Page({
  data: { q: "", status: "open", races: [], reminders: [], loaded: false, message: "" },
  onShow() {
    this.load();
  },
  onQ(e) {
    this.setData({ q: e.detail.value });
  },
  setStatus(e) {
    this.setData({ status: e.currentTarget.dataset.status });
    this.load();
  },
  load() {
    const params = ["status=" + (this.data.status || "open")];
    const q = (this.data.q || "").trim();
    if (q) params.push("q=" + encodeURIComponent(q));
    request("/reminders")
      .then((data) => {
        const reminders = (data.reminders || []).slice(0, 3).map((item) => ({
          ...item,
          key: item.race.id + item.hit.key
        }));
        this.setData({ reminders });
      })
      .catch(() => {});
    request("/races?" + params.join("&"))
      .then((data) => {
        const races = (data.races || []).map((race) => ({ ...race, soon: race.open && race.daysLeft <= 3 }));
        this.setData({ races, loaded: true, message: "" });
      })
      .catch((err) => this.setData({ loaded: true, message: err.message }));
  }
});
