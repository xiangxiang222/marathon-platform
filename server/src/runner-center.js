const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { KM } = require("./career");

const DAY = 86400000;
const IMAGE_MAX = 8 * 1024 * 1024;
const VIDEO_MAX = 40 * 1024 * 1024;
const KINDS = new Set(["certificate", "medal", "photo", "video"]);
const DISTANCES = [["full", "全马"], ["half", "半马"], ["10k", "10 公里"], ["5k", "5 公里"]];

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const pad = (n) => String(n).padStart(2, "0");
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (day) => Date.parse(day + "T00:00:00Z");
const addDays = (day, count) => dayOf(dayMs(day) + count * DAY);
const clock = (seconds) => {
  const value = Math.round(Number(seconds) || 0);
  return `${pad(Math.floor(value / 3600))}:${pad(Math.floor(value % 3600 / 60))}:${pad(value % 60)}`;
};
const pace = (seconds, km) => km > 0 && seconds > 0 ? `${Math.floor(Math.round(seconds / km) / 60)}'${pad(Math.round(seconds / km) % 60)}\"` : "—";

function shiftMonth(day, amount) {
  const date = new Date(dayMs(day));
  return dayOf(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
}

function periodBounds(period, offset, today, earliest) {
  const year = Number(today.slice(0, 4));
  if (period === "week") {
    const weekday = new Date(dayMs(today)).getUTCDay() || 7;
    const start = addDays(today, 1 - weekday + offset * 7);
    return { start, end: addDays(start, 7), previous: addDays(start, -7), label: `${start.slice(5).replace("-", ".")} – ${addDays(start, 6).slice(5).replace("-", ".")}`, year: start.slice(0, 4) };
  }
  if (period === "month") {
    const start = shiftMonth(today.slice(0, 7) + "-01", offset);
    return { start, end: shiftMonth(start, 1), previous: shiftMonth(start, -1), label: `${start.slice(0, 4)} 年 ${Number(start.slice(5, 7))} 月` };
  }
  if (period === "year") {
    const start = `${year + offset}-01-01`;
    return { start, end: `${year + offset + 1}-01-01`, previous: `${year + offset - 1}-01-01`, label: `${year + offset} 年` };
  }
  return { start: earliest || `${year}-01-01`, end: addDays(today, 1), previous: "", label: "全部记录" };
}

function validStartedAt(value, shiftedNow) {
  const raw = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(raw)) return false;
  const ms = Date.parse(raw + "Z");
  return Number.isFinite(ms) && dayOf(ms) === raw.slice(0, 10) && ms <= shiftedNow;
}

function statsOf(runs) {
  const km = runs.reduce((sum, row) => sum + row.distance_km, 0);
  const durationSec = runs.reduce((sum, row) => sum + row.duration_sec, 0);
  return { km: round2(km), count: runs.length, durationSec, durationLabel: clock(durationSec), paceLabel: pace(durationSec, km), activeDays: new Set(runs.map((row) => row.started_at.slice(0, 10))).size };
}

function trainingOf(runs, period, offset, now) {
  const shiftedNow = now.getTime() + 8 * 3600000;
  const today = dayOf(shiftedNow);
  const earliest = runs.length ? runs[runs.length - 1].started_at.slice(0, 4) + "-01-01" : "";
  const bounds = periodBounds(period, offset, today, earliest);
  const selected = runs.filter((row) => row.started_at.slice(0, 10) >= bounds.start && row.started_at.slice(0, 10) < bounds.end);
  const stats = statsOf(selected);
  let previousKm = 0;
  if (bounds.previous) {
    // For an unfinished current period compare the same elapsed time, not a full previous period.
    const comparisonEnd = offset === 0 ? Math.min(dayMs(bounds.start), dayMs(bounds.previous) + shiftedNow - dayMs(bounds.start)) : dayMs(bounds.start);
    previousKm = round2(runs.filter((row) => {
      const started = Date.parse(row.started_at + (row.started_at.endsWith("Z") ? "" : "Z"));
      return started >= dayMs(bounds.previous) && started < comparisonEnd;
    }).reduce((sum, row) => sum + row.distance_km, 0));
  }
  const bars = [];
  if (period === "week" || period === "month") {
    for (let day = bounds.start; day < bounds.end; day = addDays(day, 1)) {
      bars.push({ key: day, label: period === "week" ? ["日", "一", "二", "三", "四", "五", "六"][new Date(dayMs(day)).getUTCDay()] : String(Number(day.slice(8))), km: round2(selected.filter((row) => row.started_at.startsWith(day)).reduce((sum, row) => sum + row.distance_km, 0)) });
    }
  } else if (period === "year") {
    for (let part = 1; part <= 12; part++) {
      const key = bounds.start.slice(0, 4) + "-" + pad(part);
      bars.push({ key, label: `${part}月`, km: round2(selected.filter((row) => row.started_at.startsWith(key)).reduce((sum, row) => sum + row.distance_km, 0)) });
    }
  } else {
    for (let year = Number(bounds.start.slice(0, 4)); year <= Number(today.slice(0, 4)); year++) {
      const key = String(year);
      bars.push({ key, label: key, km: round2(selected.filter((row) => row.started_at.startsWith(key)).reduce((sum, row) => sum + row.distance_km, 0)) });
    }
  }
  return { period, offset, ...bounds, ...stats, previousKm, changePercent: bounds.previous && previousKm > 0 ? Math.round((stats.km - previousKm) / previousKm * 100) : null, comparisonLabel: offset === 0 ? "较上期同期" : "较上一期", bars, truncated: selected.length > 100,
    runs: selected.slice(0, 100).map((row) => ({ id: row.id, type: row.type, startedAt: row.started_at, distanceKm: round2(row.distance_km), durationSec: row.duration_sec, paceLabel: pace(row.duration_sec, row.distance_km), city: row.city, source: row.source })) };
}

function completedRace(item, today) {
  const day = String(item.race.raceDate || "");
  const parsed = dayMs(day);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(parsed) && dayOf(parsed) === day && day <= today;
}

function careerOf(results, today) {
  const eligible = results.filter((item) => completedRace(item, today));
  const events = [...new Map(eligible.map((item) => [item.race.id, item.race])).values()];
  const offline = events.filter((race) => race.meet !== "online");
  const provinces = [...new Set(offline.map((race) => race.province).filter(Boolean))];
  const cities = [...new Map(offline.filter((race) => race.city).map((race) => [race.province + ':' + race.city, race.city])).values()];
  const cityCount = new Map();
  for (const race of offline) if (race.city) {
    const key = race.province + ':' + race.city;
    const previous = cityCount.get(key);
    cityCount.set(key, { name: race.city, province: race.province, count: (previous?.count || 0) + 1 });
  }
  const years = [...new Set(events.map((race) => race.raceDate.slice(0, 4)))].sort().reverse();
  const km = eligible.reduce((sum, item) => sum + (KM[item.distance] || 0), 0);
  const seconds = eligible.reduce((sum, item) => sum + item.seconds, 0);
  const byDistance = DISTANCES.map(([key, label]) => ({ key, label, count: eligible.filter((item) => item.distance === key).length }));
  const other = eligible.filter((item) => !KM[item.distance]).length;
  if (other) byDistance.push({ key: "other", label: "其他", count: other });
  const pb = [];
  for (const [distance, distanceLabel] of DISTANCES) {
    const best = eligible.filter((item) => item.distance === distance && item.race.kind === "road" && item.race.meet !== "online").sort((a, b) => a.seconds - b.seconds)[0];
    if (best) pb.push({ distance, distanceLabel, clock: best.clock, seconds: best.seconds, race: best.race });
  }
  const trends = [];
  const first = years.length ? Number(years[years.length - 1]) : Number(today.slice(0, 4));
  for (let year = first; year <= Number(today.slice(0, 4)); year++) {
    const items = eligible.filter((item) => item.race.raceDate.startsWith(String(year)));
    const known = items.filter((item) => KM[item.distance]);
    const km = known.reduce((sum, item) => sum + KM[item.distance], 0);
    const seconds = items.reduce((sum, item) => sum + item.seconds, 0);
    trends.push({ year: String(year), count: new Set(items.map((item) => item.race.id)).size, km: round2(km), seconds, paceSec: km ? Math.round(known.reduce((sum, item) => sum + item.seconds, 0) / km) : null });
  }
  return { finished: events.length, resultCount: eligible.length, raceYears: years.length ? Number(today.slice(0, 4)) - first + 1 : 0, totalKm: round2(km), totalSeconds: seconds, totalTime: clock(seconds), provinces, cities, mostVisitedCity: [...cityCount.values()].sort((a, b) => b.count - a.count || (a.province + a.name).localeCompare(b.province + b.name, "zh"))[0]?.name || "", byDistance, pb, trends, years };
}

function runnerRoot() {
  return path.join(process.env.MARATHON_MEDIA || path.join(__dirname, "../data/media"), "runner");
}

function removeFile(filename) {
  if (!filename || path.basename(filename) !== filename) return;
  try { fs.unlinkSync(path.join(runnerRoot(), filename)); } catch (err) { if (err.code !== "ENOENT") throw err; }
}

function mediaRow(row) {
  return { id: row.id, kind: row.kind, raceId: row.race_id, distance: row.distance, distanceLabel: DISTANCES.find(([key]) => key === row.distance)?.[1] || row.distance,
    race: { id: row.race_id, name: row.race_name, raceDate: row.race_date, city: row.race_city, province: row.race_province },
    createdAt: row.created_at, mime: row.mime, size: row.size };
}

const MEDIA_SELECT = `SELECT m.*, r.name AS race_name, r.race_date, r.city AS race_city, r.province AS race_province
  FROM runner_media m JOIN races r ON r.id = m.race_id`;

function sniffMedia(buffer, video) {
  if (!video) {
    if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
    if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buffer.toString("ascii", 12, 16) === "IHDR") return { ext: "png", mime: "image/png" };
    if (buffer.length >= 16 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" && /^(VP8 |VP8L|VP8X)$/.test(buffer.toString("ascii", 12, 16))) return { ext: "webp", mime: "image/webp" };
  } else {
    if (buffer.length >= 24 && buffer.readUInt32BE(0) >= 16 && buffer.readUInt32BE(0) <= buffer.length && buffer.toString("ascii", 4, 8) === "ftyp" && /^(isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV|dash)$/.test(buffer.toString("ascii", 8, 12))) return { ext: "mp4", mime: "video/mp4" };
    if (buffer.length >= 16 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && buffer.subarray(4, Math.min(buffer.length, 4096)).includes(Buffer.from("webm"))) return { ext: "webm", mime: "video/webm" };
  }
  return null;
}

function boundedUpload(req, limit) {
  return new Promise((resolve, reject) => {
    if (req.readableEnded) return reject(new Error("没有读到上传文件"));
    const chunks = [];
    let size = 0;
    let oversized = Number(req.get("content-length")) > limit;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) oversized = true;
      if (!oversized) chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("aborted", () => reject(new Error("上传已中断")));
    req.on("end", () => oversized ? reject(Object.assign(new Error("文件太大"), { status: 413 })) : resolve(Buffer.concat(chunks)));
  });
}

const DEVICES = [
  { id: "garmin", name: "Garmin 佳明", status: "unavailable", reason: "厂商数据接入尚未开通，可先手动记录运动。" },
  { id: "coros", name: "COROS 高驰", status: "unavailable", reason: "厂商数据接入尚未开通，可先手动记录运动。" },
  { id: "huawei", name: "华为运动健康", status: "unavailable", reason: "厂商数据接入尚未开通，可先手动记录运动。" },
  { id: "suunto", name: "Suunto 颂拓", status: "unavailable", reason: "厂商数据接入尚未开通，可先手动记录运动。" },
  { id: "apple", name: "Apple 健康", status: "unavailable", reason: "网页与微信小程序无法直接读取 Apple 健康数据，目前可手动记录运动。" }
];

function mountRunnerCenter(app, { BASE, getDb, userFrom, resultsFor, oneUpload }) {
  function login(req, res, allowQuery = false) {
    let user = userFrom(req);
    if (!user && allowQuery && typeof req.query.t === "string" && req.query.t) user = getDb().prepare("SELECT id FROM users WHERE token = ?").get(req.query.t);
    if (!user) res.status(401).json({ error: "请先登录" });
    return user;
  }

  function ownedMedia(db, id, userId) {
    return db.prepare("SELECT * FROM runner_media WHERE id = ? AND user_id = ?").get(id, userId);
  }

  app.get(BASE + "/api/me/runner", (req, res) => {
    const user = login(req, res);
    if (!user) return;
    const period = String(req.query.period || "week");
    const rawOffset = String(req.query.offset || "0");
    const offset = Number(rawOffset);
    if (!["week", "month", "year", "all"].includes(period)) return res.status(400).json({ error: "请选择周、月、年或全部" });
    if (!/^-?\d+$/.test(rawOffset) || !Number.isSafeInteger(offset) || offset > 0 || offset < -1200 || (period === "all" && offset !== 0) || (period === "year" && new Date().getUTCFullYear() + offset < 1900)) return res.status(400).json({ error: "只能查看当前或过去的记录" });
    const now = new Date();
    const shiftedNow = now.getTime() + 8 * 3600000;
    const today = dayOf(shiftedNow);
    const db = getDb();
    const runs = db.prepare("SELECT id, type, started_at, distance_km, duration_sec, city, source FROM runs WHERE user_id = ? AND type IN ('run', 'trail') ORDER BY started_at DESC, id DESC").all(user.id).filter((row) => row.distance_km > 0 && row.duration_sec > 0 && validStartedAt(row.started_at, shiftedNow));
    const raceFormats = new Map(db.prepare("SELECT DISTINCT r.id, r.meet FROM races r JOIN results res ON res.race_id = r.id WHERE res.user_id = ?").all(user.id).map((row) => [row.id, row.meet]));
    let results = resultsFor(user.id, now).map((result) => {
      return { ...result, race: { ...result.race, meet: raceFormats.get(result.race.id) === "online" ? "online" : "offline" } };
    });
    const career = careerOf(results, today);
    results = results.map((result) => ({ ...result, pb: result.race.kind === "road" && result.race.meet !== "online" && completedRace(result, today) && career.pb.some((best) => best.distance === result.distance && best.seconds === result.seconds) }));
    const week = trainingOf(runs, "week", 0, now);
    const month = trainingOf(runs, "month", 0, now);
    const total = statsOf(runs);
    const media = db.prepare(MEDIA_SELECT + " WHERE m.user_id = ? ORDER BY m.created_at DESC, m.id DESC").all(user.id).map(mediaRow);
    res.set("Cache-Control", "private, no-store").json({ asOf: today, overview: { weekKm: week.km, weekCount: week.count, weekDurationSec: week.durationSec, monthKm: month.km, totalKm: total.km, totalCount: total.count }, training: period === "week" && offset === 0 ? week : period === "month" && offset === 0 ? month : trainingOf(runs, period, offset, now), career, results, media, devices: DEVICES });
  });

  app.post(BASE + "/api/me/runner/media", async (req, res) => {
    const user = login(req, res);
    if (!user) return;
    const kind = String(req.query.kind || "");
    if (!KINDS.has(kind)) return res.status(400).json({ error: "请选择证书、奖牌、照片或视频" });
    if (!/^multipart\/form-data\s*;/i.test(req.get("content-type") || "")) return res.status(400).json({ error: "请使用文件上传" });
    const raceId = String(req.query.raceId || "");
    const distance = String(req.query.distance || "");
    const db = getDb();
    if (!db.prepare("SELECT 1 FROM results WHERE user_id = ? AND race_id = ? AND distance = ?").get(user.id, raceId, distance)) return res.status(400).json({ error: "先选择自己已记录成绩的赛事与项目" });
    const limit = kind === "video" ? VIDEO_MAX : IMAGE_MAX;
    let buffer;
    try { buffer = oneUpload(await boundedUpload(req, limit + 64 * 1024), req.get("content-type")); }
    catch (err) { return res.status(err.status || 400).json({ error: err.status === 413 ? kind === "video" ? "视频不超过 40MB" : "图片不超过 8MB" : "上传已中断，请重试" }); }
    if (!buffer?.length) return res.status(400).json({ error: "请选择文件" });
    if (buffer.length > limit) return res.status(413).json({ error: kind === "video" ? "视频不超过 40MB" : "图片不超过 8MB" });
    const file = sniffMedia(buffer, kind === "video");
    if (!file) return res.status(400).json({ error: kind === "video" ? "请选择 MP4 或 WebM 视频" : "请选择 JPG、PNG 或 WebP 图片" });
    const filename = `${user.id}-${crypto.randomBytes(20).toString("hex")}.${file.ext}`;
    try {
      // Finish potentially large disk I/O before taking the SQLite write lock.
      // The short transaction below rechecks result existence and quotas after
      // every await so concurrent removal/uploads cannot bypass those rules.
      await fs.promises.mkdir(runnerRoot(), { recursive: true });
      await fs.promises.writeFile(path.join(runnerRoot(), filename), buffer, { flag: "wx" });
      const row = db.transaction(() => {
        if (!db.prepare("SELECT 1 FROM results WHERE user_id = ? AND race_id = ? AND distance = ?").get(user.id, raceId, distance)) throw Object.assign(new Error("这条成绩已删除，请重新选择"), { status: 400 });
        if (db.prepare("SELECT COUNT(*) AS n FROM runner_media WHERE user_id = ?").get(user.id).n >= 500 || db.prepare("SELECT COUNT(*) AS n FROM runner_media WHERE user_id = ? AND race_id = ? AND distance = ?").get(user.id, raceId, distance).n >= 30) throw Object.assign(new Error("收藏数量已达上限，请整理后再上传"), { status: 400 });
        const bytes = db.prepare("SELECT COALESCE(SUM(size), 0) AS total FROM runner_media WHERE user_id = ?").get(user.id).total;
        if (bytes + buffer.length > 512 * 1024 * 1024) throw Object.assign(new Error("收藏空间已满，请整理后再上传"), { status: 400 });
        const result = db.prepare("INSERT INTO runner_media (user_id, race_id, distance, kind, filename, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(user.id, raceId, distance, kind, filename, file.mime, buffer.length, new Date().toISOString());
        return db.prepare(MEDIA_SELECT + " WHERE m.id = ?").get(result.lastInsertRowid);
      }).immediate();
      return res.json({ media: mediaRow(row) });
    } catch (err) {
      removeFile(filename);
      return res.status(err.status || 500).json({ error: err.status ? err.message : "没有保存成功，请重试" });
    }
  });

  app.get(BASE + "/api/me/runner/media/:id/file", (req, res) => {
    const user = login(req, res, true);
    if (!user) return;
    const row = ownedMedia(getDb(), req.params.id, user.id);
    if (!row || path.basename(row.filename) !== row.filename) return res.status(404).json({ error: "没有这个收藏" });
    const filename = path.join(runnerRoot(), row.filename);
    if (!fs.existsSync(filename)) return res.status(404).json({ error: "文件不存在，请重新上传" });
    res.set({ "Content-Type": row.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    // Express sendFile handles Range requests for seekable private video playback.
    res.sendFile(filename, (err) => { if (err && !res.headersSent) res.status(err.status || 500).end(); });
  });

  app.delete(BASE + "/api/me/runner/media/:id", (req, res) => {
    const user = login(req, res);
    if (!user) return;
    const db = getDb();
    const row = ownedMedia(db, req.params.id, user.id);
    if (!row) return res.status(404).json({ error: "没有这个收藏" });
    db.prepare("DELETE FROM runner_media WHERE id = ? AND user_id = ?").run(row.id, user.id);
    removeFile(row.filename);
    res.json({ ok: true });
  });
}

module.exports = { mountRunnerCenter, trainingOf, careerOf, validStartedAt, sniffMedia, runnerRoot };
