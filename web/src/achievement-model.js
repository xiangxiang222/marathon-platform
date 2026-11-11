// Generated from miniprogram/utils/achievement-model.js by scripts/sync-achievement-model.cjs.
const STYLES = Object.freeze([
  Object.freeze({ id: "cream", name: "纸间荣光", background: "#fff9ed", ink: "#403a31", accent: "#b46935", soft: "#f7e8cb" }),
  Object.freeze({ id: "mint", name: "逐光而跑", background: "#effaf5", ink: "#29473c", accent: "#35866a", soft: "#dcefe5" }),
  Object.freeze({ id: "coral", name: "热烈时刻", background: "#fff3ef", ink: "#493735", accent: "#e1251b", soft: "#ffe1d8" })
]);
const MODES = Object.freeze([{ id: "pb", name: "生涯 PB" }, { id: "results", name: "完赛履历" }].map(Object.freeze));
const QUOTES = Object.freeze(["每一步，都在刷新自己。", "把热爱，跑成自己的光。", "时间记住了每一次全力以赴。", "继续出发，下一程更精彩。"]);
const DISTANCES = ["full", "half", "10k", "5k"];
const KM = { full: 42.195, half: 21.0975, "10k": 10, "5k": 5 };
const LABELS = { full: "全程马拉松", half: "半程马拉松", "10k": "10 公里", "5k": "5 公里" };
const text = (value, max) => typeof value === "string" ? Array.from(value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim()).slice(0, max).join("") : "";
const round2 = value => Math.round(value * 100) / 100;
function validDay(day) {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day.slice(0, 4) === "0000") return false;
  const ms = Date.parse(day + "T00:00:00Z");
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === day;
}
function asOf(payload) {
  return validDay(payload && payload.asOf) ? payload.asOf : new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
}
function resultKey(result) {
  if (!result || !result.race) return "";
  const raw = result.race.id;
  const id = typeof raw === "number" && Number.isSafeInteger(raw) ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  const distance = typeof result.distance === "string" ? result.distance.trim() : "";
  return id && distance && !distance.includes(":") ? id + ":" + distance : "";
}
function clock(seconds) {
  const pad = value => String(value).padStart(2, "0");
  return pad(Math.floor(seconds / 3600)) + ":" + pad(Math.floor(seconds / 60) % 60) + ":" + pad(seconds % 60);
}
function pace(seconds, km) {
  if (!km) return "";
  const value = Math.round(seconds / km);
  return Math.floor(value / 60) + "′" + String(value % 60).padStart(2, "0") + "″";
}
function byDate(a, b) {
  return b.raceDate.localeCompare(a.raceDate) || a.key.localeCompare(b.key);
}
function pbRecords(rows) {
  return DISTANCES.map(distance => rows.filter(row => row.distance === distance && row.kind === "road" && row.meet === "offline")
    .sort((a, b) => a.seconds - b.seconds || byDate(a, b))[0]).filter(Boolean);
}
function normalizeResults(payload) {
  const day = asOf(payload), records = new Map();
  for (const source of Array.isArray(payload && payload.results) ? payload.results : []) {
    const key = resultKey(source), race = source && source.race;
    if (!key || !race || !validDay(race.raceDate) || race.raceDate > day || !Number.isSafeInteger(source.seconds) || source.seconds <= 0) continue;
    const distance = source.distance.trim(), km = Object.prototype.hasOwnProperty.call(KM, distance) ? KM[distance] : 0;
    const kind = ["road", "trail"].includes(race.kind) ? race.kind : "other", meet = ["offline", "online"].includes(race.meet) ? race.meet : "";
    const row = { key, id: key, raceId: typeof race.id === "string" ? race.id.trim() : String(race.id), distance,
      distanceLabel: Object.prototype.hasOwnProperty.call(LABELS, distance) ? LABELS[distance] : text(source.distanceLabel, 40) || text(distance, 40), seconds: source.seconds,
      clock: clock(source.seconds), pace: pace(source.seconds, km), km,
      raceName: text(race.name, 100), raceDate: race.raceDate, date: race.raceDate,
      city: text(race.city, 40), province: text(race.province, 40),
      kind, meet, typeLabel: meet === "online" ? "线上赛" : kind === "trail" ? "越野" : kind === "road" && meet === "offline" ? "路跑" : "其他", pb: false };
    const previous = records.get(key);
    // Repeated API rows represent one race/project. Prefer its fastest valid result.
    if (!previous || row.seconds < previous.seconds || (row.seconds === previous.seconds && byDate(row, previous) < 0)) records.set(key, row);
  }
  const rows = Array.from(records.values()).sort(byDate);
  const best = new Map(pbRecords(rows).map(row => [row.distance, row.seconds]));
  for (const row of rows) row.pb = row.kind === "road" && row.meet === "offline" && best.get(row.distance) === row.seconds;
  return rows;
}
function summarize(rows) {
  return { events: new Set(rows.map(row => row.raceId)).size, results: rows.length,
    cities: new Set(rows.filter(row => row.meet === "offline" && row.city).map(row => row.province + ":" + row.city)).size,
    km: round2(rows.reduce((sum, row) => sum + row.km, 0)) };
}
function privateRow(row, options) {
  return { key: row.key, id: row.id, raceId: row.raceId, distance: row.distance, distanceLabel: row.distanceLabel,
    seconds: row.seconds, clock: row.clock, pace: row.pace, km: row.km, pb: row.pb, kind: row.kind, meet: row.meet, typeLabel: row.typeLabel,
    raceName: options.showRace ? row.raceName : "", raceDate: options.showDate ? row.raceDate : "", date: options.showDate ? row.date : "",
    city: options.showCity ? row.city : "", province: options.showCity ? row.province : "" };
}
function buildAchievementModel(payload, options) {
  options = options || {};
  const all = normalizeResults(payload), mode = options.mode === "results" ? "results" : "pb";
  const style = STYLES.find(item => item.id === options.style) || STYLES[0];
  const year = mode === "results" && /^\d{4}$/.test(String(options.year || "")) ? String(options.year) : "";
  const flags = { showName: options.showName !== false, showRace: options.showRace !== false, showDate: options.showDate !== false, showCity: options.showCity === true };
  const available = mode === "pb" ? pbRecords(all) : all.filter(row => !year || row.raceDate.slice(0, 4) === year);
  const selection = Array.isArray(options.selectedKeys) ? new Set(options.selectedKeys.filter(key => typeof key === "string")) : null;
  const selected = available.filter(row => selection === null || selection.has(row.key));
  const rows = selected.map(row => privateRow(row, flags)), pbKeys = new Set(pbRecords(all).map(row => row.key));
  return { nickname: flags.showName ? text(options.nickname, 30) || "跑步的我" : "",
    title: mode === "pb" ? "我的生涯 PB" : "我的完赛履历",
    subtitle: mode === "pb" ? "线下公路赛事 · 生涯个人最好成绩" : (year ? year + " 年 · " : "") + "每一次完赛，都值得记住",
    quote: typeof options.quote === "string" ? text(options.quote, 80) : QUOTES[0], style, mode, year, ...flags,
    rows, summary: summarize(selected), asOf: asOf(payload),
    years: Array.from(new Set(selected.map(row => row.raceDate.slice(0, 4)))).sort().reverse(),
    eligibleRows: rows.map(row => ({ ...row })), pbRows: rows.filter(row => pbKeys.has(row.key)).map(row => ({ ...row })) };
}
function paginateAchievement(model) {
  const rows = Array.isArray(model && model.rows) ? model.rows : [], pageCount = Math.max(1, Math.ceil(rows.length / 20));
  return Array.from({ length: pageCount }, (_, index) => {
    const pageRows = rows.slice(index * 20, (index + 1) * 20), keys = new Set(pageRows.map(row => row.key));
    return { ...model, rows: pageRows, eligibleRows: pageRows.map(row => ({ ...row })), pbRows: (model.pbRows || []).filter(row => keys.has(row.key)),
      page: index + 1, pageCount, totalRows: rows.length };
  });
}
export { STYLES, MODES, QUOTES, resultKey, normalizeResults, buildAchievementModel, paginateAchievement };
