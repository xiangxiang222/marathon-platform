const { number } = require("./mileage-board");
const TABS = [{ id: "profile", name: "资料" }, { id: "mileage", name: "跑量" }, { id: "races", name: "赛事" }, { id: "results", name: "成绩" }, { id: "albums", name: "相册" }];
const RACE_FILTERS = [{ id: "all", name: "全部" }, { id: "wish", name: "想参加" }, { id: "upcoming", name: "待出发" }, { id: "finished", name: "已参赛" }];
function mediaUrl(id) {
  const g = getApp().globalData || {};
  return (g.baseUrl || "") + "/marathon/api/media/" + encodeURIComponent(id) + "?t=" + encodeURIComponent(g.token || "");
}
function dateLabel(value) { return String(value || "").slice(0, 10).replace(/-/g, "."); }
function decorate(data) {
  const stats = data.stats || {}, summary = data.summary || {};
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const results = (data.results || []).map((r, i) => ({ ...r, key: r.race.id + ":" + r.distance, dateLabel: dateLabel(r.race.raceDate), tone: i % 2 ? "blue" : "mint" }));
  const races = (data.races || []).map(r => {
    const status = r.status || (r.hasResult ? "完赛" : "想跑");
    const category = r.race.raceDate <= today && (r.hasResult || ["完赛", "未完赛"].includes(status)) ? "finished" : status === "想跑" ? "wish" : r.race.raceDate >= today && !["未中签", "弃赛", "未完赛", "完赛"].includes(status) ? "upcoming" : "other";
    return { ...r, key: r.race.id, status, category, monthDay: String(r.race.raceDate || "").slice(5).replace("-", "/"), year: String(r.race.raceDate || "").slice(0, 4), dateLabel: dateLabel(r.race.raceDate), location: [r.race.province, r.race.city].filter((x, i, a) => x && a.indexOf(x) === i).join(" · "), distanceText: (r.results || []).map(x => x.distanceLabel).join(" / "), statusTone: category === "finished" ? "mint" : category === "wish" ? "apricot" : "blue" };
  });
  const albums = (data.albums || []).map(a => {
    const items = (a.items || []).map(item => ({ ...item, src: mediaUrl(item.id) }));
    const cover = items.find(item => item.id === a.coverId && item.kind === "photo") || items.find(item => item.kind === "photo");
    return { ...a, items, cover: cover ? cover.src : "", dateLabel: dateLabel(a.date), preview: items.filter(item => item.kind === "photo").slice(0, 3) };
  });
  const photos = albums.reduce((out, a) => out.concat(a.items.filter(item => item.kind === "photo")), []);
  const pb = (summary.pb || []).map(r => ({ ...r, key: r.distance, dateLabel: dateLabel(r.race.raceDate) }));
  return { ...data, groupInitial: data.group ? String(data.group.name).slice(0, 1) : "↗", initial: String(data.user.nickname || "跑").slice(0, 1), joinedLabel: dateLabel(data.user.joinedAt), allKm: number(data.mileage.all && data.mileage.all.km), yearKm: number(data.mileage.year && data.mileage.year.km), yearLabel: data.date.slice(0, 4), totalTimes: Number(data.mileage.all && data.mileage.all.times || 0), stats: { ...stats, kmLabel: number(stats.km), hours: number((stats.durationSec || 0) / 3600) }, recentRuns: (data.recentRuns || []).map(r => ({ ...r, day: r.startedAt.slice(5, 10).replace("-", "/"), time: r.startedAt.slice(11, 16), kmLabel: number(r.km), distanceLabel: number(r.distanceKm) })), summary: { ...summary, pb }, races, results, albums, photos, previewPhotos: photos.slice(0, 3), nextRace: races.filter(r => r.category === "upcoming" && r.race.raceDate >= new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)).sort((a, b) => a.race.raceDate.localeCompare(b.race.raceDate))[0] || null };
}
module.exports = { TABS, RACE_FILTERS, decorate };
