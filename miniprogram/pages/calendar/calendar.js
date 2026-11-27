const { request } = require("../../utils/request");
const { lunarLabel } = require("../../lunar");
const { renderDayPoster, posterFacts } = require("../../utils/day-poster");

const WEEKS = ["日", "一", "二", "三", "四", "五", "六"];
function accountToken() { return typeof getApp === "function" ? (getApp().globalData || {}).token || "" : ""; }

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
    weekday: "",
    ready: false,
    message: "",
    posterError: "",
    posterPath: ""
  },
  onLoad() {
    this._disposed = false;
    const now = cstParts();
    this.year = now.y;
    this.month = now.m;
    this.picked = iso(now);
    this.setData({ year: now.y, month: now.m });
    this.load();
  },
  onShow() {
    const token = accountToken();
    if (this._seenToken !== token) {
      this._seenToken = token;
      this.setData({ dayRaces: this.data.dayRaces.map(race => ({ ...race, following: false, myStatus: "" })) });
      if (this.races) this.races = this.races.map(race => ({ ...race, following: false, myStatus: "" }));
    }
    if (this.races) this.load();
  },
  onUnload() { this._disposed = true; this._loadSeq = (this._loadSeq || 0) + 1; },
  prev() {
    this.shift(-1);
  },
  next() {
    this.shift(1);
  },
  goToday() {
    const now = cstParts(), sameMonth = this.year === now.y && this.month === now.m;
    this.picked = iso(now);
    if (sameMonth && !this.data.message) return this.paint(this.data.ready ? this.races : [], this.data.ready);
    this.year = now.y;
    this.month = now.m;
    this.setData({ year: now.y, month: now.m });
    return this.load();
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
    this.paint(this.data.ready ? this.races : [], this.data.ready);
  },
  load() {
    const seq = this._loadSeq = (this._loadSeq || 0) + 1, token = accountToken();
    const key = this.year + "-" + String(this.month).padStart(2, "0");
    this.setData({ message: "" });
    this.paint([], false);
    return request("/races?status=all&month=" + key)
      .then((data) => {
        if (this._disposed || seq !== this._loadSeq || token !== accountToken() || key !== this.year + "-" + String(this.month).padStart(2, "0")) return;
        this.races = data.races || [];
        this.paint(this.races);
      })
      .catch((err) => { if (!this._disposed && seq === this._loadSeq && token === accountToken()) this.setData({ message: err.message || "赛事加载失败" }); });
  },
  paint(races = [], ready = true) {
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
        countText: count ? count + "场" : ""
      });
    }
    const dayRaces = races
      .filter((race) => race.raceDate === this.picked)
      .map((race) => ({
        id: race.id,
        name: race.name,
        following: !!race.following,
        myStatus: race.myStatus || "",
        meta: race.city + (race.distanceLabels && race.distanceLabels.length ? " · " + race.distanceLabels.join(" / ") : "") + " · " + race.regStatus
      }));
    const parts = this.picked.split("-");
    const facts = posterFacts(this.picked);
    this.setData({
      cells,
      dayRaces,
      ready, posterError: "",
      weekday: facts.weekday,
      pickedLabel: Number(parts[1]) + "月" + Number(parts[2]) + "日"
    });
  },
  makePoster() {
    if (!this.data.ready) return;
    const date = this.picked;
    const races = (this.races || []).filter((race) => race.raceDate === date);
    if (!races.length) return;
    const parts = date.split("-").map(Number);
    const lunar = lunarLabel(parts[0], parts[1], parts[2]);
    this.createSelectorQuery()
      .select("#day-poster")
      .fields({ node: true })
      .exec((res) => {
        const canvas = res && res[0] && res[0].node;
        if (!canvas) {
          this.setData({ posterError: "这张图没有生成" });
          return;
        }
        renderDayPoster(canvas, { date, lunar, races });
        wx.canvasToTempFilePath({
          canvas,
          fileType: "png",
          success: (file) => { if (date === this.picked) this.setData({ posterPath: file.tempFilePath, posterError: "" }); },
          fail: () => { if (date === this.picked) this.setData({ posterError: "这张图没有生成" }); }
        });
      });
  },
  closePoster() {
    this.setData({ posterPath: "" });
  },
  keepPoster() {}
});
