const DISTANCES = [{ key: "full", label: "全马" }, { key: "half", label: "半马" }, { key: "10k", label: "10 公里" }, { key: "5k", label: "5 公里" }, { key: "other", label: "其他项目" }];
const STATUSES = [{ key: "finished", label: "已完赛" }, { key: "dnf", label: "未完赛" }, { key: "dns", label: "未起跑" }];
const TIMINGS = [{ key: "net", label: "净计时" }, { key: "gun", label: "枪声时间" }, { key: "unknown", label: "口径待确认" }];
const KINDS = [{ key: "road", label: "路跑" }, { key: "trail", label: "越野" }, { key: "other", label: "其他" }];
const MEETS = [{ key: "offline", label: "线下赛" }, { key: "online", label: "线上赛" }];
const TAGS = ["突破", "第一次", "陪伴", "归来", "城市", "坚持", "享受比赛"];
const MEDIA = [{ key: "photo", label: "比赛照片" }, { key: "certificate", label: "完赛证书" }, { key: "medal", label: "奖牌" }, { key: "bib", label: "号码布" }, { key: "route", label: "赛道图" }, { key: "shirt", label: "参赛服" }];

function clock(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const s = Math.round(seconds), pad = n => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`;
}
function label(items, key) { const found = items.find(item => item.key === key); return found ? found.label : ""; }
function mediaSource(url) {
  if (typeof url !== "string" || !/^\/marathon\/api\//.test(url)) return "";
  const data = getApp().globalData;
  if (!data.token) return "";
  return data.baseUrl.replace(/\/$/, "") + url + (url.includes("?") ? "&" : "?") + "t=" + encodeURIComponent(data.token);
}
function decorateEntry(item) {
  const media = (item.media || []).map(file => ({ ...file, src: mediaSource(file.url), isVideo: file.kind === "video" || /^video\//.test(file.mime || ""), kindLabel: label(MEDIA, file.kind) || (file.kind === "video" ? "比赛视频" : "比赛资料") }));
  const cover = media.find(file => !file.isVideo && String(file.id) === String(item.coverMediaId)) || media.find(file => !file.isVideo && file.kind === "photo");
  return { ...item, media, coverSrc: cover && cover.src || "", coverDisplayId: cover && cover.id || "", tags: item.tags || [],
    distanceLabel: item.distanceLabel || label(DISTANCES, item.distance), statusLabel: label(STATUSES, item.status), timingLabel: label(TIMINGS, item.timing),
    sourceLabel: item.source && item.source.label || "本人记录", clock: item.clock || clock(item.seconds) || "—", netClock: clock(item.netSeconds), gunClock: clock(item.gunSeconds),
    dateLabel: String(item.raceDate || "").replace(/-/g, "."), year: String(item.raceDate || "").slice(0, 4),
    improvementLabel: Number.isFinite(item.improvementSeconds) && item.improvementSeconds > 0 ? `${Math.floor(item.improvementSeconds / 60)} 分 ${Math.round(item.improvementSeconds % 60)} 秒` : "",
    selectedTags: TAGS.map(text => ({ text, selected: (item.tags || []).includes(text) })) };
}
function decorateList(items) {
  const entries = items.map(decorateEntry), nodes = {}, seen = new Set();
  const ordered = entries.slice().sort((a, b) => String(a.raceDate).localeCompare(String(b.raceDate)) || String(a.id).localeCompare(String(b.id)));
  ordered.forEach((item, index) => {
    if (index === 0) nodes[item.id] = "这份跑史的起点";
    if (item.status === "finished" && item.kind === "road" && item.meet === "offline" && !seen.has(item.distance)) {
      seen.add(item.distance);
      if (!nodes[item.id] && ["full", "half"].includes(item.distance)) nodes[item.id] = "已记录首场" + item.distanceLabel;
    }
    if (item.improvementLabel) nodes[item.id] = "同口径进步 " + item.improvementLabel;
  });
  return entries.map(item => ({ ...item, growthNode: nodes[item.id] || "" }));
}
function blankEntry() {
  return { name: "", raceDate: "", city: "", province: "", distance: "full", kind: "road", meet: "offline", status: "finished", timing: "unknown", netTime: "", gunTime: "", unknownTime: "", bib: "", story: "", tags: [], source: { kind: "manual", label: "本人记录" } };
}
function formEntry(item) {
  const knownDistance = DISTANCES.some(option => option.key === item.distance);
  const value = { ...blankEntry(), ...item, distance: knownDistance ? item.distance : "", distanceText: item.distanceText || (!knownDistance ? String(item.distance || "") : ""), netTime: item.netTime || clock(item.netSeconds), gunTime: item.gunTime || clock(item.gunSeconds), unknownTime: item.unknownTime || (item.timing === "unknown" ? clock(item.seconds) : "") };
  return { ...value, distanceIndex: DISTANCES.findIndex(x => x.key === value.distance), statusIndex: STATUSES.findIndex(x => x.key === value.status), timingIndex: TIMINGS.findIndex(x => x.key === value.timing), kindIndex: KINDS.findIndex(x => x.key === value.kind), meetIndex: MEETS.findIndex(x => x.key === value.meet), selectedTags: TAGS.map(text => ({ text, selected: value.tags.includes(text) })) };
}
function payload(item) {
  const result = { name: item.name, raceDate: item.raceDate, city: item.city || "", province: item.province || "", distance: item.distance, kind: item.kind, meet: item.meet, status: item.status, timing: item.timing, netTime: item.netTime || "", gunTime: item.gunTime || "", bib: item.bib || "", story: item.story || "", tags: item.tags || [] };
  if (item.timing === "unknown") result.unknownTime = item.unknownTime || "";
  if (Object.prototype.hasOwnProperty.call(item, "raceId")) result.raceId = item.raceId || "";
  if (item.sourceKey) result.sourceKey = item.sourceKey;
  if (item.source) result.source = item.source;
  return result;
}
function exportEntry(item) {
  return { name: item.name, raceDate: item.raceDate, city: item.city || "", province: item.province || "", distance: item.distance, kind: item.kind, meet: item.meet, status: item.status, timing: item.timing,
    netTime: clock(item.netSeconds), gunTime: clock(item.gunSeconds), unknownTime: item.timing === "unknown" ? clock(item.unknownSeconds == null ? item.seconds : item.unknownSeconds) : "", bib: item.bib || "", story: item.story || "", tags: item.tags || [], sourceKey: item.sourceKey || "", source: item.source };
}
function csvCell(value) { const text = String(value == null ? "" : value); return '"' + text.replace(/"/g, '""') + '"'; }
function csvExport(entries) {
  const keys = ["name", "raceDate", "city", "province", "distance", "kind", "meet", "status", "timing", "netTime", "gunTime", "unknownTime", "bib", "story", "tags", "sourceKey"];
  return "\uFEFF" + [keys.join(","), ...entries.map(entry => keys.map(key => csvCell(Array.isArray(entry[key]) ? entry[key].join("、") : entry[key])).join(","))].join("\r\n");
}

function validation(item) {
  if (!String(item.name || "").trim() || !item.raceDate) return "请填写比赛名称与日期";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(item.raceDate) && new Date(item.raceDate + "T00:00:00Z");
  if (!day || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== item.raceDate) return "请核对真实比赛日期";
  if (!DISTANCES.some(value => value.key === item.distance)) return "请确认比赛项目";
  if (!STATUSES.some(value => value.key === item.status) || !TIMINGS.some(value => value.key === item.timing)) return "请确认参与状态与计时口径";
  if (!KINDS.some(value => value.key === item.kind) || !MEETS.some(value => value.key === item.meet)) return "请确认赛事类型与参赛形式";
  for (const field of ["netTime", "gunTime", "unknownTime"]) if (item[field]) {
    const raw = String(item[field]).replace(/：/g, ":").trim();
    if (!/^\d{1,2}:[0-5]\d:[0-5]\d$/.test(raw)) return "用时请填写时:分:秒，例如 03:12:45";
    const parts = raw.split(":").map(Number), seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (!seconds || seconds > 72 * 3600) return "用时应大于零且不超过 72 小时";
  }
  if (item.netTime && item.gunTime && item.netTime.replace(/：/g, ":").trim().padStart(8, "0") > item.gunTime.replace(/：/g, ":").trim().padStart(8, "0")) return "净计时不能长于枪声时间，请核对原资料";
  if (item.status === "finished" && item.timing === "net" && !item.netTime) return "请补充净计时，或选择口径待确认后先保存经历";
  if (item.status === "finished" && item.timing === "gun" && !item.gunTime) return "请补充枪声时间，或选择口径待确认后先保存经历";
  if (item.status !== "finished" && (item.netTime || item.gunTime || item.unknownTime)) return "未完赛或未起跑，请留空完赛用时";
  return "";
}
module.exports = { DISTANCES, STATUSES, TIMINGS, KINDS, MEETS, TAGS, MEDIA, clock, label, decorateEntry, decorateList, blankEntry, formEntry, payload, exportEntry, csvExport, validation };
