const { request } = require("../../utils/request");
const { lunarLabel } = require("../../lunar");

const WEEKS = ["日", "一", "二", "三", "四", "五", "六"];

function cstParts(date = new Date()) {
  const shifted = new Date(date.getTime() + 8 * 3600 * 1000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

function iso(parts) {
  return parts.y + "-" + String(parts.m).padStart(2, "0") + "-" + String(parts.d).padStart(2, "0");
}

Page({
  data: {
    weeks: WEEKS,
    year: 2026,
    month: 10,
    cells: [],
    dayRaces: [],
    pickedLabel: "",
    ready: false,
    message: ""
  },
  onLoad() {
    const now = cstParts();
    this.year = now.y;
    this.month = now.m;
    this.picked = iso(now);
    this.setData({ year: now.y, month: now.m });
    this.load();
  },
  prev() {
    this.shift(-1);
  },
  next() {
    this.shift(1);
  },
  shift(delta) {
    const next = new Date(Date.UTC(this.year, this.month - 1 + delta, 1));
    this.year = next.getUTCFullYear();
    this.month = next.getUTCMonth() + 1;
    const now = cstParts();
    this.picked = now.y === this.year && now.m === this.month ? iso(now) : iso({ y: this.year, m: this.month, d: 1 });
    this.setData({ year: this.year, month: this.month });
    this.load();
  },
  pick(e) {
    const date = e.currentTarget.dataset.date || "";
    const key = this.year + "-" + String(this.month).padStart(2, "0");
    if (!date.startsWith(key)) return;
    this.picked = date;
    this.paint(this.races || []);
  },
  load() {
    const key = this.year + "-" + String(this.month).padStart(2, "0");
    this.setData({ ready: false, message: "" });
    request("/races?status=all&month=" + key)
      .then((data) => {
        if (key !== this.year + "-" + String(this.month).padStart(2, "0")) return;
        this.races = data.races || [];
        this.paint(this.races);
      })
      .catch((err) => this.setData({ ready: true, message: err.message }));
  },
  paint(races) {
    const first = new Date(Date.UTC(this.year, this.month - 1, 1));
    const start = new Date(first);
    start.setUTCDate(1 - first.getUTCDay());
    const counts = {};
    races.forEach((race) => {
      counts[race.raceDate] = (counts[race.raceDate] || 0) + 1;
    });
    const todayIso = iso(cstParts());
    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      const cur = new Date(start);
      cur.setUTCDate(start.getUTCDate() + i);
      const y = cur.getUTCFullYear();
      const m = cur.getUTCMonth() + 1;
      const d = cur.getUTCDate();
      const date = iso({ y, m, d });
      const inMonth = y === this.year && m === this.month;
      const count = inMonth ? counts[date] || 0 : 0;
      cells.push({
        date,
        inMonth,
        today: date === todayIso,
        picked: date === this.picked,
        mark: date === todayIso ? "今" : String(d),
        lunar: lunarLabel(y, m, d),
        countText: count ? count + "场赛事" : ""
      });
    }
    const dayRaces = races
      .filter((race) => race.raceDate === this.picked)
      .map((race) => ({
        id: race.id,
        name: race.name,
        meta: race.city + (race.distanceLabels && race.distanceLabels.length ? " · " + race.distanceLabels.join(" / ") : "") + " · " + race.regStatus
      }));
    const parts = this.picked.split("-");
    this.setData({
      cells,
      dayRaces,
      ready: true,
      pickedLabel: Number(parts[1]) + "月" + Number(parts[2]) + "日 · " + dayRaces.length + "场"
    });
  }
});
