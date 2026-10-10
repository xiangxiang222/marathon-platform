const { request } = require("../../utils/request");

function toneOf(race) {
  const status = race.regStatus || "";
  if (status === "已结束" || status === "比赛结束") return "done";
  if (status === "比赛中") return "live";
  if (race.open && Number(race.daysLeft) <= 7) return "soon";
  if (status === "报名中") return "open";
  if (status === "报名时间未公布") return "wait";
  return "next";
}

Page({
  data: { q: "", status: "upcoming", races: [], reminders: [], loaded: false, message: "" },
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
    const params = ["status=" + (this.data.status || "upcoming")];
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
        const races = (data.races || []).map((race) => {
          const parts = String(race.raceDate || "").split("-");
          return {
            ...race,
            soon: race.open && race.daysLeft <= 3,
            tone: toneOf(race),
            month: Number(parts[1]) || "",
            day: Number(parts[2]) || ""
          };
        });
        this.setData({ races, loaded: true, message: "" });
      })
      .catch((err) => this.setData({ loaded: true, message: err.message }));
  }
});
