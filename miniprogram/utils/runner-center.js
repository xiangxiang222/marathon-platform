const VIEWS = [
  { key: "stats", title: "运动数据", caption: "每一公里，都有迹可循", icon: "/images/runner/stats.png", tone: "red" },
  { key: "career", title: "赛事生涯", caption: "成绩、PB 与成长趋势", icon: "/images/runner/career.png", tone: "red" },
  { key: "footprints", title: "城市足迹", caption: "把跑过的城市收进护照", icon: "/images/runner/footprints.png", tone: "red" },
  { key: "honors", title: "荣誉收藏", caption: "证书和奖牌，妥善珍藏", icon: "/images/runner/honors.png", tone: "gold" },
  { key: "media", title: "赛事影像", caption: "留住冲线的那一刻", icon: "/images/runner/media.png", tone: "violet" },
  { key: "devices", title: "数据来源", caption: "管理记录与了解设备接入", icon: "/images/runner/devices.png", tone: "gray" }
];

function shortKm(value) {
  return Number(Number(value || 0).toFixed(2)).toString();
}

function clock(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  return Math.floor(seconds / 3600) + ":" + String(Math.floor(seconds / 60) % 60).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

function barsOf(rows) {
  const maximum = Math.max(1, ...(rows || []).map((row) => Number(row.km) || 0));
  return (rows || []).map((row) => ({ ...row, value: shortKm(row.km), height: row.km > 0 ? Math.max(4, Math.round(row.km / maximum * 100)) : 0 }));
}

function privateUrl(path) {
  const app = getApp();
  const globals = app.globalData || {};
  return (globals.baseUrl || "") + "/marathon/api" + path + (path.indexOf("?") === -1 ? "?" : "&") + "t=" + encodeURIComponent(globals.token || "");
}

function resultKey(item) {
  return String(item.race.id) + ":" + item.distance;
}

function completedRace(item, today) {
  const day = String(item.race.raceDate || "");
  const parsed = Date.parse(day + "T00:00:00Z");
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === day && day <= today;
}

function trainingComparison(training) {
  if (!training || training.period === "all") return "";
  const comparison = training.comparisonLabel || (Number(training.offset || 0) === 0 ? "较上期同期" : "较上一期");
  const difference = Math.round((Number(training.km || 0) - Number(training.previousKm || 0)) * 100) / 100;
  if (!(training.previousKm > 0)) return comparison + "暂无记录，按自己的节奏继续积累。";
  if (!difference) return comparison + "，跑量持平，稳稳向前。";
  const percent = Number.isFinite(training.changePercent) ? "（" + (training.changePercent > 0 ? "+" : "") + training.changePercent + "%）" : "";
  return comparison + (difference > 0 ? "多跑了 " : "少跑了 ") + shortKm(Math.abs(difference)) + " 公里" + percent + "，按自己的节奏就好。";
}

function careerSummary(data) {
  const career = data.career || {};
  const pb = career.pb || [];
  const year = String(data.asOf || "").slice(0, 4);
  const annual = (career.trends || []).find((item) => String(item.year) === year);
  return { finished: Number(career.finished || 0), provinces: career.provinces || [], cities: career.cities || [], pb: { full: (pb.find((item) => item.distance === "full") || {}).clock || "", half: (pb.find((item) => item.distance === "half") || {}).clock || "" }, yearKm: Number(annual && annual.km || 0) };
}

function decorate(data) {
  const training = data.training || {};
  const overview = data.overview || {};
  const career = data.career || {};
  const best = new Map((career.pb || []).map((item) => [item.distance, item.seconds]));
  const results = (data.results || []).map((item) => ({
    ...item,
    key: resultKey(item),
    pb: item.race.meet !== "online" && item.race.kind === "road" && completedRace(item, data.asOf) && best.has(item.distance) && best.get(item.distance) === item.seconds,
    year: (item.race.raceDate || "").slice(0, 4),
    day: (item.race.raceDate || "").slice(5).replace("-", "."),
    category: item.race.kind === "trail" ? "trail" : item.race.kind === "road" || item.race.kind === "路跑" ? "road" : "other"
  }));
  const resultMap = new Map(results.map((item) => [item.key, item]));
  const media = (data.media || []).map((item) => {
    const result = resultMap.get(String(item.raceId) + ":" + item.distance);
    const race = result ? result.race : item.race || {};
    return { ...item, key: "media-" + item.id, src: privateUrl("/me/runner/media/" + item.id + "/file"), result: result || null, race, year: String(race.raceDate || "").slice(0, 4), name: race.name || "赛事记录", distanceLabel: result ? result.distanceLabel : item.distanceLabel || "", legacy: false };
  });
  const legacy = results.filter((item) => item.hasProof).map((item) => ({
    id: "proof-" + item.key,
    key: "proof-" + item.key,
    kind: item.proofLabel === "奖牌" ? "medal" : "certificate",
    src: privateUrl("/me/races/" + encodeURIComponent(item.race.id) + "/result/proof?distance=" + encodeURIComponent(item.distance)),
    raceId: item.race.id,
    distance: item.distance,
    result: item,
    race: item.race,
    year: item.year,
    name: item.race.name,
    distanceLabel: item.distanceLabel,
    legacy: true
  }));
  return {
    ...data,
    overview: { ...overview, weekKmLabel: shortKm(overview.weekKm), monthKmLabel: shortKm(overview.monthKm), totalKmLabel: shortKm(overview.totalKm), weekMinutes: Math.round((overview.weekDurationSec || 0) / 60) },
    training: { ...training, comparisonText: trainingComparison(training), isCurrentWeek: training.period === "week" && Number(training.offset || 0) === 0, kmLabel: shortKm(training.km), durationLabel: training.durationLabel || clock(training.durationSec), bars: barsOf(training.bars), runs: (training.runs || []).map((item) => ({ ...item, kmLabel: shortKm(item.distanceKm), dateLabel: String(item.startedAt || "").replace("T", " ").slice(0, 16), durationLabel: clock(item.durationSec), typeLabel: item.type === "trail" ? "越野跑" : "跑步" })) },
    career: { ...career, kmLabel: shortKm(career.totalKm), totalTime: career.totalTime || clock(career.totalSeconds), pb: career.pb || [], years: career.years || [] },
    results,
    media,
    collection: legacy.concat(media),
    resultOptions: results.map((item) => item.race.name + " · " + (item.distanceLabel || item.distance))
  };
}

module.exports = { VIEWS, shortKm, clock, barsOf, privateUrl, decorate, completedRace, careerSummary };
