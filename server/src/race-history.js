const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { KM } = require("./career");
const { sniffMedia } = require("./runner-center");

const LABELS = { full: "全马", half: "半马", "10k": "10 公里", "5k": "5 公里", other: "其他项目" };
const KINDS = new Set(["certificate", "photo", "medal", "bib", "route", "shirt"]);
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const TAGS = new Set(["突破", "第一次", "陪伴", "归来", "城市", "坚持", "享受比赛"]);
const HASH = /^[a-f0-9]{64}$/;
const nowIso = () => new Date().toISOString();
const todayOf = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const clock = (seconds) => Number.isInteger(seconds) && seconds > 0 ? [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map((n) => String(n).padStart(2, "0")).join(":") : "—";
const tidy = (value) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
const storyText = (value) => String(value ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim();
const compact = (value) => tidy(value).normalize("NFKC").replace(/[\s·・.\-—]/g, "").toLowerCase();
const validDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value && value >= "1900-01-01";
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }

function installRaceHistory(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS race_history_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      legacy_key TEXT NOT NULL DEFAULT '', race_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL, race_date TEXT NOT NULL, city TEXT NOT NULL DEFAULT '', province TEXT NOT NULL DEFAULT '',
      distance TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'road', meet TEXT NOT NULL DEFAULT 'offline',
      status TEXT NOT NULL DEFAULT 'finished', timing TEXT NOT NULL DEFAULT 'unknown',
      net_seconds INTEGER, gun_seconds INTEGER, unknown_seconds INTEGER,
      bib TEXT NOT NULL DEFAULT '', story TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]',
      cover_media_id TEXT NOT NULL DEFAULT '', source_kind TEXT NOT NULL DEFAULT 'manual',
      source_key TEXT NOT NULL DEFAULT '', fingerprint TEXT NOT NULL,
      confirmed_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS race_history_owner ON race_history_entries(user_id, deleted, race_date);
    CREATE UNIQUE INDEX IF NOT EXISTS race_history_legacy ON race_history_entries(user_id, legacy_key) WHERE legacy_key != '';
    CREATE INDEX IF NOT EXISTS race_history_source ON race_history_entries(user_id, source_key);
    CREATE INDEX IF NOT EXISTS race_history_identity ON race_history_entries(user_id, fingerprint);
    CREATE TABLE IF NOT EXISTS race_history_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, entry_key TEXT NOT NULL, kind TEXT NOT NULL,
      filename TEXT NOT NULL UNIQUE, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS race_history_media_owner ON race_history_media(user_id, entry_key);
    CREATE TABLE IF NOT EXISTS race_history_tombstones (
      user_id INTEGER NOT NULL, identity_hash TEXT NOT NULL, source_key TEXT NOT NULL DEFAULT '', fingerprint TEXT NOT NULL,
      created_at TEXT NOT NULL, PRIMARY KEY(user_id,identity_hash)
    );
  `);
}

function historyRoot() { return path.join(process.env.MARATHON_MEDIA || path.join(__dirname, "../data/media"), "history"); }
function removeHistoryFile(filename) {
  if (!filename || path.basename(filename) !== filename) return;
  try { fs.unlinkSync(path.join(historyRoot(), filename)); } catch (err) { if (err.code !== "ENOENT") throw err; }
}

function distanceOf(value) {
  const raw = tidy(value).toLowerCase().replace(/\s+/g, "");
  if (["full", "全马", "全程", "全程马拉松", "马拉松", "42.195", "42.195km", "42.195公里"].includes(raw)) return "full";
  if (["half", "半马", "半程", "半程马拉松", "21.0975", "21.0975km", "21.0975公里"].includes(raw)) return "half";
  if (["10k", "10km", "10公里", "10", "十公里"].includes(raw)) return "10k";
  if (["5k", "5km", "5公里", "5", "五公里"].includes(raw)) return "5k";
  return raw === "other" || raw === "其他" || raw === "其他项目" ? "other" : "";
}
function secondsOf(value, label) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 72 * 3600) fail(label + "应为有效用时（不超过 72 小时）");
    return value;
  }
  const raw = tidy(value).replace(/[：]/g, ":");
  const parts = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(raw);
  const seconds = parts ? Number(parts[1]) * 3600 + Number(parts[2]) * 60 + Number(parts[3]) : null;
  if (!seconds || seconds > 72 * 3600) fail(label + "请填写时:分:秒，例如 03:12:45，用时不超过 72 小时");
  return seconds;
}
function normalizeEntry(input, { partial = false, previous = null } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("请填写比赛资料");
  const merged = partial ? { ...previous, ...input } : input;
  const name = tidy(merged.name);
  const raceDate = tidy(merged.raceDate).replace(/[./]/g, "-");
  const distance = distanceOf(merged.distance);
  if (!name || name.length > 160) fail("比赛名称请填写 1–160 个字");
  if (!validDay(raceDate)) fail("请填写真实比赛日期，例如 2025-10-26");
  if (raceDate > todayOf()) fail("跑史只能保存已经发生的比赛");
  if (!distance) fail("请选择全马、半马、10 公里、5 公里或其他项目");
  const city = tidy(merged.city), province = tidy(merged.province), bib = tidy(merged.bib), story = storyText(merged.story);
  if (city.length > 60 || province.length > 60 || bib.length > 40) fail("城市、省份或号码布信息过长");
  if (story.length > 1200) fail("比赛感受请控制在 1200 字以内");
  const kind = merged.kind || "road", meet = merged.meet || "offline";
  const status = merged.status || "finished";
  const timing = merged.timing || "unknown";
  if (!["road", "trail", "other"].includes(kind) || !["offline", "online"].includes(meet)) fail("请选择有效赛事类型与参赛形式");
  if (!["finished", "dnf", "dns"].includes(status)) fail("请选择完赛、未完赛或未出发");
  if (!["net", "gun", "unknown"].includes(timing)) fail("请确认成绩是净计时、枪声计时或暂不确定");
  const netSeconds = secondsOf(Object.hasOwn(input, "netTime") ? input.netTime : merged.netSeconds, "净计时");
  const gunSeconds = secondsOf(Object.hasOwn(input, "gunTime") ? input.gunTime : merged.gunSeconds, "枪声计时");
  let unknownSeconds = timing === "unknown" ? secondsOf(Object.hasOwn(input, "unknownTime") ? input.unknownTime : Object.hasOwn(input, "clock") && input.clock !== "—" ? input.clock : merged.unknownSeconds ?? (previous?.timing === "unknown" ? previous.seconds : merged.seconds), "成绩") : null;
  if (netSeconds && gunSeconds && netSeconds > gunSeconds) fail("净计时不能长于枪声计时，请核对原资料");
  if (timing === "net" && !netSeconds && status === "finished") fail("选择净计时后，请补充净计时成绩");
  if (timing === "gun" && !gunSeconds && status === "finished") fail("选择枪声计时后，请补充枪声成绩");
  if (status !== "finished" && (netSeconds || gunSeconds || unknownSeconds)) fail("未完赛或未出发请留空完赛用时");
  const tags = merged.tags == null ? [] : merged.tags;
  if (!Array.isArray(tags) || tags.length > 7 || tags.some((tag) => typeof tag !== "string" || !TAGS.has(tag))) fail("请选择有效的比赛标签");
  const raceId = tidy(merged.raceId);
  if (raceId.length > 180) fail("赛事编号过长");
  const sourceKey = merged.sourceKey && HASH.test(merged.sourceKey) ? merged.sourceKey : "";
  return { name, raceDate, city, province, distance, kind, meet, status, timing, netSeconds, gunSeconds, unknownSeconds, bib, story,
    tags: [...new Set(tags)], raceId, coverMediaId: tidy(merged.coverMediaId).slice(0, 100), sourceKey,
    fingerprint: digest([compact(name), raceDate, distance, kind, meet].join("|")) };
}

function selectedSeconds(entry) { return entry.timing === "net" ? entry.netSeconds : entry.timing === "gun" ? entry.gunSeconds : entry.unknownSeconds; }
function toEntry(row) {
  const entry = { id: row.legacy_key || "exp:" + row.id, raceId: row.race_id, name: row.name, raceDate: row.race_date, city: row.city, province: row.province,
    distance: row.distance, distanceLabel: LABELS[row.distance] || "其他项目", kind: row.kind, meet: row.meet, status: row.status, timing: row.timing,
    netSeconds: row.net_seconds, gunSeconds: row.gun_seconds, unknownSeconds: row.unknown_seconds, bib: row.bib, story: row.story, tags: JSON.parse(row.tags),
    coverMediaId: row.cover_media_id || null, sourceKey: row.source_key, fingerprint: row.fingerprint,
    source: { kind: row.source_kind, label: row.source_kind === "text" ? "导入后本人确认" : row.source_kind === "legacy" ? "原有成绩 · 计时口径待确认" : "本人记录", confirmedAt: row.confirmed_at },
    createdAt: row.created_at, updatedAt: row.updated_at, isPb: false, improvementSeconds: null, previousBest: null, media: [] };
  entry.seconds = selectedSeconds(entry);
  entry.clock = clock(entry.seconds);
  entry.paceLabel = entry.seconds && KM[entry.distance] ? Math.floor(Math.round(entry.seconds / KM[entry.distance]) / 60) + "′" + String(Math.round(entry.seconds / KM[entry.distance]) % 60).padStart(2, "0") + "″" : "—";
  return entry;
}

function legacyEntries(db, userId) {
  return db.prepare(`SELECT res.*, r.name, r.race_date, r.city, r.province, r.kinds, r.meet
    FROM results res JOIN races r ON r.id=res.race_id WHERE res.user_id=?`).all(userId).map((row) => {
    const kind = String(row.kinds || "road").split(",").includes("trail") ? "trail" : row.kinds === "other" ? "other" : "road";
    const fingerprint = digest([compact(row.name), row.race_date, row.distance, kind, row.meet === "online" ? "online" : "offline"].join("|"));
    const entry = toEntry({ legacy_key: `result:${row.race_id}:${row.distance}`, race_id: row.race_id, name: row.name, race_date: row.race_date,
      city: row.city, province: row.province, distance: row.distance, kind, meet: row.meet === "online" ? "online" : "offline", status: "finished", timing: "unknown",
      net_seconds: null, gun_seconds: null, unknown_seconds: row.seconds, bib: "", story: row.story, tags: "[]", cover_media_id: "", source_key: "", fingerprint,
      source_kind: "legacy", confirmed_at: "", created_at: row.updated_at, updated_at: row.updated_at });
    entry.legacyProof = Boolean(row.proof);
    entry.legacyProofKind = row.proof_kind;
    return entry;
  });
}

function decorateHistory(entries, today = todayOf()) {
  const eligible = (entry) => entry.status === "finished" && entry.kind === "road" && entry.meet === "offline" && entry.timing !== "unknown" && entry.seconds > 0 && KM[entry.distance] && validDay(entry.raceDate) && entry.raceDate <= today;
  const chronological = [...entries].sort((a, b) => a.raceDate.localeCompare(b.raceDate) || a.id.localeCompare(b.id));
  const bestBy = new Map();
  for (const entry of chronological) {
    const group = entry.distance + ":" + entry.timing;
    if (!eligible(entry)) continue;
    // Same-day ordering cannot establish which race happened first.
    const earlier = chronological.filter((item) => eligible(item) && item.distance === entry.distance && item.timing === entry.timing && item.raceDate < entry.raceDate);
    const previous = earlier.sort((a, b) => a.seconds - b.seconds)[0];
    entry.previousBest = previous ? { entryId: previous.id, name: previous.name, raceDate: previous.raceDate, seconds: previous.seconds, clock: previous.clock } : null;
    entry.improvementSeconds = previous && entry.seconds < previous.seconds ? previous.seconds - entry.seconds : null;
    entry.wasPb = !previous || entry.seconds < previous.seconds;
    const current = bestBy.get(group);
    if (!current || entry.seconds < current.seconds) bestBy.set(group, entry);
  }
  for (const entry of entries) entry.isPb = eligible(entry) && bestBy.get(entry.distance + ":" + entry.timing)?.seconds === entry.seconds;
  const finished = entries.filter((entry) => entry.status === "finished" && validDay(entry.raceDate) && entry.raceDate <= today);
  const events = new Set(finished.map((entry) => entry.raceId || compact(entry.name) + ":" + entry.raceDate));
  const cities = new Set(entries.filter((entry) => entry.status !== "dns" && entry.meet === "offline" && entry.city && validDay(entry.raceDate) && entry.raceDate <= today).map((entry) => entry.province + ":" + entry.city));
  return { asOf: today, summary: { experienceCount: entries.length, finished: events.size, cityCount: cities.size, totalKm: Math.round(finished.reduce((sum, entry) => sum + (KM[entry.distance] || 0), 0) * 100) / 100,
    pb: [...bestBy.values()].map((entry) => ({ distance: entry.distance, distanceLabel: entry.distanceLabel, timing: entry.timing, seconds: entry.seconds, clock: entry.clock, entryId: entry.id, name: entry.name })),
    years: [...new Set(entries.map((entry) => entry.raceDate.slice(0, 4)))].sort().reverse() },
    entries: entries.sort((a, b) => b.raceDate.localeCompare(a.raceDate) || b.id.localeCompare(a.id)) };
}

function reviewOf(entry, entries) {
  const facts = [];
  let headline = entry.status === "dnf" ? "未完赛，也是一段属于你的经历。" : entry.status === "dns" ? "这一次的选择，也可以留下。" : "每一场，都值得留下。";
  if (entry.status === "finished" && entry.seconds) facts.push(`${entry.distanceLabel} · ${entry.timing === "net" ? "净计时" : entry.timing === "gun" ? "枪声计时" : "计时口径待确认"} ${entry.clock}`);
  if (entry.improvementSeconds) {
    const m = Math.floor(entry.improvementSeconds / 60), s = entry.improvementSeconds % 60;
    headline = "这一场，你刷新了此前的自己。";
    facts.push(`比此前已记录的同项目${entry.timing === "net" ? "净计时" : "枪声计时"}最好成绩快了 ${m} 分 ${s} 秒；此前为 ${entry.previousBest.name} ${entry.previousBest.clock}。`);
  } else if (entry.isPb) { headline = "这是已记录比赛中的个人最好成绩。"; }
  const same = entries.filter((item) => item.status === "finished" && item.distance === entry.distance && validDay(item.raceDate) && item.raceDate <= todayOf());
  if (entry.status === "finished" && same.every((item) => item.raceDate >= entry.raceDate)) facts.push("这是已记录比赛中最早的一场" + entry.distanceLabel + "，并不代表你的全部参赛历史。");
  if (entry.tags.length) facts.push("你为这场留下的关键词：" + entry.tags.join("、") + "。");
  return { headline, facts, scope: `比较仅限已记录的线下路跑、同项目和相同计时口径。当前已记录 ${same.length} 条${entry.distanceLabel}完赛经历；本人确认不等于官方核验。`,
    missing: [...(!entry.seconds && entry.status === "finished" ? ["还没有完赛用时，可以先留下感受和照片。"] : []), ...(entry.timing === "unknown" && entry.seconds ? ["确认净计时或枪声计时后，才能与相同口径的成绩比较。"] : []), "还没有分段成绩，暂时无法判断前后程变化。"] };
}

function historyFor(db, userId, base) {
  const stored = db.prepare("SELECT * FROM race_history_entries WHERE user_id=?").all(userId);
  const hidden = new Set(db.prepare("SELECT identity_hash FROM race_history_tombstones WHERE user_id=?").all(userId).map((row) => row.identity_hash));
  const overlays = new Map(stored.filter((row) => row.legacy_key).map((row) => [row.legacy_key, row]));
  const legacy = legacyEntries(db, userId);
  const legacyIds = new Set(legacy.map((entry) => entry.id));
  const entries = legacy.filter((entry) => !hidden.has(digest(entry.id)) && !overlays.get(entry.id)?.deleted).map((entry) => overlays.has(entry.id) ? toEntry(overlays.get(entry.id)) : entry);
  // A private story or upload belongs to the runner's archive even if the
  // original result is later removed from its separate results screen.
  entries.push(...stored.filter((row) => !row.deleted && (!row.legacy_key || (!legacyIds.has(row.legacy_key) && !hidden.has(digest(row.legacy_key))))).map(toEntry));
  const media = db.prepare("SELECT * FROM race_history_media WHERE user_id=? ORDER BY id").all(userId);
  const collections = db.prepare("SELECT * FROM runner_media WHERE user_id=? ORDER BY id").all(userId);
  for (const entry of entries) {
    entry.media = media.filter((row) => row.entry_key === entry.id).map((row) => mediaOf(row, base));
    if (entry.id.startsWith("result:")) {
      const original = legacy.find((item) => item.id === entry.id);
      const identity = /^result:(.*):([^:]+)$/.exec(entry.id);
      const originalRaceId = identity?.[1], originalDistance = identity?.[2];
      entry.media.push(...collections.filter((row) => row.race_id === originalRaceId && row.distance === originalDistance).map((row) => ({ id: "runner:" + row.id, kind: row.kind, mime: row.mime, createdAt: row.created_at, url: base + "/api/me/runner/media/" + row.id + "/file", inherited: true })));
      if (original?.legacyProof) entry.media.push({ id: "proof", kind: original.legacyProofKind || "certificate", url: base + "/api/me/races/" + encodeURIComponent(originalRaceId) + "/result/proof?distance=" + encodeURIComponent(originalDistance), inherited: true });
    }
    if (!entry.media.some((item) => item.id === entry.coverMediaId)) entry.coverMediaId = null;
  }
  return decorateHistory(entries);
}
function mediaOf(row, base) { return { id: "history:" + row.id, kind: row.kind, mime: row.mime, size: row.size, createdAt: row.created_at, url: base + "/api/me/race-history/" + encodeURIComponent(row.entry_key) + "/media/" + row.id + "/file" }; }

function writeEntry(db, userId, entry, sourceKind = "manual", legacyKey = "", existingId = null) {
  const now = nowIso();
  const values = { userId, legacyKey, raceId: entry.raceId, name: entry.name, raceDate: entry.raceDate, city: entry.city, province: entry.province, distance: entry.distance,
    kind: entry.kind, meet: entry.meet, status: entry.status, timing: entry.timing, net: entry.netSeconds, gun: entry.gunSeconds, unknown: entry.unknownSeconds, bib: entry.bib,
    story: entry.story, tags: JSON.stringify(entry.tags), cover: entry.coverMediaId || "", sourceKind, sourceKey: entry.sourceKey || "", fingerprint: entry.fingerprint, now };
  if (existingId) {
    db.prepare(`UPDATE race_history_entries SET race_id=@raceId,name=@name,race_date=@raceDate,city=@city,province=@province,distance=@distance,kind=@kind,meet=@meet,status=@status,timing=@timing,
      net_seconds=@net,gun_seconds=@gun,unknown_seconds=@unknown,bib=@bib,story=@story,tags=@tags,cover_media_id=@cover,confirmed_at=@now,updated_at=@now,fingerprint=@fingerprint WHERE id=@id AND user_id=@userId`).run({ ...values, id: existingId });
    return existingId;
  }
  return Number(db.prepare(`INSERT INTO race_history_entries(user_id,legacy_key,race_id,name,race_date,city,province,distance,kind,meet,status,timing,net_seconds,gun_seconds,unknown_seconds,bib,story,tags,cover_media_id,source_kind,source_key,fingerprint,confirmed_at,created_at,updated_at)
    VALUES(@userId,@legacyKey,@raceId,@name,@raceDate,@city,@province,@distance,@kind,@meet,@status,@timing,@net,@gun,@unknown,@bib,@story,@tags,@cover,@sourceKind,@sourceKey,@fingerprint,@now,@now,@now)`).run(values).lastInsertRowid);
}

function duplicateOf(db, userId, entry, entries) {
  const tombstone = db.prepare("SELECT identity_hash FROM race_history_tombstones WHERE user_id=? AND (fingerprint=? OR (? != '' AND source_key=?)) LIMIT 1").get(userId, entry.fingerprint, entry.sourceKey, entry.sourceKey);
  if (tombstone) return { id: "removed:" + tombstone.identity_hash.slice(0, 12), deleted: true };
  const stored = db.prepare("SELECT * FROM race_history_entries WHERE user_id=? AND (fingerprint=? OR (? != '' AND source_key=?)) LIMIT 1").get(userId, entry.fingerprint, entry.sourceKey, entry.sourceKey);
  if (stored) return { id: stored.legacy_key || "exp:" + stored.id, deleted: Boolean(stored.deleted) };
  const legacy = entries.find((item) => item.fingerprint === entry.fingerprint || (entry.raceId && item.raceId === entry.raceId && item.distance === entry.distance));
  return legacy ? { id: legacy.id, deleted: false } : null;
}

function validateAssociation(db, entry) {
  if (!entry.raceId) return;
  const race = db.prepare("SELECT name,race_date,distances FROM races WHERE id=?").get(entry.raceId);
  if (!race || compact(race.name) !== compact(entry.name) || race.race_date !== entry.raceDate || (entry.distance !== "other" && !race.distances.split(",").includes(entry.distance))) fail("关联赛事与这条跑史不一致，请清除关联后保存");
}

// CSV parser handles quoted delimiters, embedded newlines and escaped quotes.
function parseDelimited(text, separator) {
  const rows = []; let row = [], cell = "", quoted = false, afterQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') { quoted = false; afterQuote = true; } else cell += c; }
    else if (c === '"') { if (cell.trim() || afterQuote) fail("表格引号格式不正确，请检查原文件"); quoted = true; }
    else if (c === separator) { row.push(cell); cell = ""; afterQuote = false; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); if (row.some((v) => v.trim())) rows.push(row); row = []; cell = ""; afterQuote = false; }
    else { if (afterQuote && c.trim()) fail("表格引号后有多余内容"); cell += c; }
  }
  if (quoted) fail("表格引号未闭合，请检查原文件");
  row.push(cell); if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

const DISTANCE_UNIT_SOURCE = "(?:kilomet(?:er|re)s?|met(?:er|re)s?|miles?|mi|kms?|k|m|公里|公裡|千米|公尺|英里|英哩|米)(?![a-z])";
const PROJECT_FIELDS = ["比赛项目", "参赛项目", "完赛项目", "赛事项目", "报名项目", "竞赛项目", "比赛组别", "参赛组别", "项目名称", "项目类型", "项目类别", "项目名", "项目", "组别", "比赛距离", "赛事距离", "参赛距离", "完赛距离", "距离", "里程", "赛程", "路程", "跑程", "赛项"].sort((a, b) => b.length - a.length);
const UNIT_BRACKET_OPEN = "[\\(\\[【「『〔{《〈〖〘〚]";
const UNIT_BRACKET_CLOSE = "[\\)\\]】」』〕}》〉〗〙〛]";
const PROJECT_FIELD_PATTERN = new RegExp("^(" + PROJECT_FIELDS.map((label) => [...label].join("[ \\t]*")).join("|") + ")(?:[ \\t]*" + UNIT_BRACKET_OPEN + "[ \\t]*(" + DISTANCE_UNIT_SOURCE + ")[ \\t]*" + UNIT_BRACKET_CLOSE + ")?(.*)$", "i");
function projectFieldParts(value) {
  const raw = value.normalize("NFKC").trim(), match = PROJECT_FIELD_PATTERN.exec(raw);
  if (!match) return null;
  const label = match[1].replace(/[ \t]/g, ""), tail = match[3].trim();
  return { label, unit: match[2] || "", value: tail.replace(/^:/, "").trim(), bounded: !tail || tail.startsWith(":"), group: label.endsWith("组别") };
}
const HEADER_MAP = new Map(Object.entries({ name: ["name", "赛事", "赛事名称", "比赛", "比赛名称"], raceDate: ["racedate", "date", "日期", "比赛日期", "赛事日期"], distance: ["distance", ...PROJECT_FIELDS.filter((field) => !field.endsWith("组别"))], city: ["city", "城市"], province: ["province", "省份"], netTime: ["nettime", "净计时", "净成绩", "净时间"], gunTime: ["guntime", "枪声成绩", "枪声计时", "枪声时间"], unknownTime: ["unknowntime", "time", "clock", "成绩", "用时", "完赛成绩"], timing: ["timing", "计时口径", "计时"], status: ["status", "状态", "完赛状态"], bib: ["bib", "号码布", "参赛号", "号码"], kind: ["kind", "类型", "赛事类型"], meet: ["meet", "形式", "参赛形式"], story: ["story", "感受", "故事"], tags: ["tags", "标签"], sourceKey: ["sourcekey"] }).flatMap(([field, keys]) => keys.map((key) => [key, field])));
function importHeader(value) {
  const field = projectFieldParts(tidy(value));
  return field?.unit && !field.value ? "distance" : HEADER_MAP.get(tidy(value).toLowerCase());
}
function importedObject(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = projectFieldParts(key);
    if (field?.unit && !field.value) Object.assign(out, distanceInText(key + ":" + String(value ?? "")));
    else out[importHeader(key) || key] = value;
  }
  out.raceDate = tidy(out.raceDate).replace(/年|\//g, "-").replace(/月/g, "-").replace(/日/g, "").replace(/\./g, "-").replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/, (_, y, m, d) => `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`);
  out.status = ({ "完赛": "finished", "未完赛": "dnf", "弃赛": "dnf", "未出发": "dns", "未参赛": "dns", DNF: "dnf", DNS: "dns" })[out.status] || out.status || "finished";
  out.timing = ({ "净计时": "net", "净成绩": "net", "枪声计时": "gun", "枪声成绩": "gun", "不确定": "unknown", "待确认": "unknown" })[out.timing] || out.timing || (out.netTime || out.netSeconds ? "net" : out.gunTime || out.gunSeconds ? "gun" : "unknown");
  out.kind = ({ "路跑": "road", "越野": "trail", "其他": "other" })[out.kind] || out.kind || "road";
  out.meet = ({ "线下": "offline", "线上": "online" })[out.meet] || out.meet || "offline";
  if (typeof out.tags === "string") out.tags = out.tags.split(/[、,，;；]/).map(tidy).filter(Boolean);
  return out;
}

function distanceInText(block) {
  const text = block.normalize("NFKC");
  const bracketSyntax = { "[": "(", "]": ")", "【": "(", "】": ")", "「": "(", "」": ")", "『": "(", "』": ")", "〔": "(", "〕": ")", "{": "(", "}": ")", "《": "(", "》": ")", "〈": "(", "〉": ")", "〖": "(", "〗": ")", "〘": "(", "〙": ")", "〚": "(", "〛": ")" };
  const annotationCharacter = (value) => bracketSyntax[value] || value;
  const supported = new Set(), clues = new Set(), unsupported = new Set();
  const unscoped = [], unreadable = new Set();
  let uncertainProject = false;
  const rawUnitSource = DISTANCE_UNIT_SOURCE;
  const canonicalUnitSource = "(?:公里|千米|英里|km|k)(?![a-z])";
  const numericProjectSource = "\\d+(?:\\.\\d+)?" + canonicalUnitSource + "|(?<![\\d.])(?:21\\.0975|42\\.195)(?![\\d.])";
  const namedProjectSource = "半程马拉松|全程马拉松|半马|全马|半程|全程|(?<![a-z])(?:half-?marathon|full-?marathon|marathon)(?![a-z])|马拉松";
  const projectStartSource = "(?:" + namedProjectSource + "|\\d+(?:\\.\\d+)?(?:公里|千米|km|k))";
  const groupedNumberPattern = new RegExp("(?<![\\d.,，])\\d{1,3}(?:[,，]\\d{3})+(?:\\.\\d+)?(?=" + rawUnitSource + ")", "gi");
  const groupedDistancePattern = new RegExp("(?<![\\d.,，])\\d{1,3}(?:[,，]\\d{3})+(?:\\.\\d+)?\\s*" + rawUnitSource, "gi");
  const qualifiedProjectPattern = new RegExp("(?<!以)(?:上|下|前|后)(?:" + namedProjectSource + "|\\d+(?:\\.\\d+)?" + canonicalUnitSource + ")|每\\d+(?:\\.\\d+)?" + canonicalUnitSource, "gi");
  function numericDistanceSyntax(value) {
    const financial = { 壹: "一", 贰: "二", 貳: "二", 叁: "三", 參: "三", 肆: "四", 伍: "五", 陆: "六", 陸: "六", 柒: "七", 捌: "八", 玖: "九", 拾: "十", 佰: "百", 仟: "千", 萬: "万", 億: "亿", 兩: "两" };
    const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    const units = { 十: 10, 百: 100, 千: 1000, 万: 10000, 亿: 100000000 };
    // Normalize complete distance tokens, retaining raw spelling elsewhere.
    // Grouped digits are removed only when the complete number and unit are
    // present; record delimiters must never be joined into a new distance.
    const normalized = value.replace(/[壹贰貳叁參肆伍陆陸柒捌玖拾佰仟萬億兩]/g, (character) => financial[character]).replace(/公裡/g, "公里")
      .replace(groupedNumberPattern, (number) => number.replace(/[,，]/g, ""));
    const chineseDistancePattern = new RegExp("(?<![\\d.])([零〇一二两三四五六七八九十百千万亿]+?)(?:点([零〇一二两三四五六七八九]+))?(" + rawUnitSource + ")", "gi");
    const arabic = normalized.replace(chineseDistancePattern, (_, integer, fraction, unit) => {
      let total = 0, section = 0, digit = 0;
      if (!/[十百千万亿]/.test(integer)) total = Number([...integer].map((character) => digits[character]).join(""));
      else {
        for (const character of integer) {
          if (character in digits) digit = digits[character];
          else if (units[character] < 10000) { section += (digit || 1) * units[character]; digit = 0; }
          else { total += (section + digit || 1) * units[character]; section = 0; digit = 0; }
        }
        total += section + digit;
      }
      return String(total) + (fraction ? "." + [...fraction].map((character) => digits[character]).join("") : "") + unit;
    });
    // Normalize complete unit spellings in one pass. A metre value is exact;
    // mile values stay unsupported evidence rather than implying a marathon.
    return arabic.replace(new RegExp("(\\d+(?:\\.\\d+)?)(" + rawUnitSource + ")", "gi"), (_, number, rawUnit) => {
      const unit = rawUnit.toLowerCase();
      if (/^(?:mi(?:les?)?|英里|英哩)$/.test(unit)) return number + "英里";
      if (/^(?:m|met(?:er|re)s?|公尺|米)$/.test(unit)) return String(Number(number) / 1000) + "公里";
      return number + "公里";
    });
  }
  // A distance mentioned in a split or an aid-station note is not a race
  // project. Accept complete project values only from bounded fields, or a
  // standalone full project name. Unscoped numeric distances remain clues.
  function coreProjectValue(value) {
    const compactValue = numericDistanceSyntax(value.replace(/\s+/g, ""));
    if (/^其他(?:项目)?$/.test(compactValue)) return { distances: ["other"], unknown: [] };
    const namedPattern = new RegExp(namedProjectSource, "gi");
    const named = [...compactValue.matchAll(namedPattern)];
    namedPattern.lastIndex = 0;
    let remaining = compactValue.replace(namedPattern, "");
    // Bare 5/10 may be a group number. Numeric short-distance projects need a
    // unit; only the precise marathon distances also allow a unitless value.
    const numericPattern = new RegExp(numericProjectSource, "gi");
    const numeric = [...remaining.matchAll(numericPattern)];
    remaining = remaining.replace(numericPattern, "").replace(/男子组?|女子组?|男女组?|男组|女组|公开组?|组/g, "");
    // Do not extract a substring from values such as "上半程", "每5公里补给"
    // or "5公里:00:25:10", even when they follow a project-like label.
    if ((!named.length && !numeric.length) || !/^[()/、或及和+跑赛]*$/.test(remaining)) return null;
    const distances = named.map((match) => /^(?:半|half)/i.test(match[0]) ? "half" : "full"), unknown = [];
    for (const match of numeric) {
      if (match[0].endsWith("英里")) { unknown.push(match[0]); continue; }
      const km = Number.parseFloat(match[0]);
      const distance = ({ 5: "5k", 10: "10k", 21.0975: "half", 42.195: "full" })[km];
      if (distance) distances.push(distance); else unknown.push(match[0]);
    }
    return { distances, unknown };
  }
  function neutralGroup(value) {
    const compact = value.replace(/\s+/g, "");
    if (coreProjectValue(compact) || nonProjectDetail(compact)) return false;
    // Group names are open-ended. Match their shape rather than maintaining
    // a name list, and accept ages with gender before or after the condition.
    return /^[\p{L}\p{N}()_.+~–—/-]{1,60}组$/u.test(compact)
      || /^(?:男子|女子|男女|公开|男|女)(?:[a-z]|\d+)?$/i.test(compact)
      || /^(?:男子|女子|男女|男|女)?\d{1,3}(?:(?:周)?岁)?(?:[-–—~至到]\d{1,3})?(?:周)?岁(?:及?以上|及?以下|以内)?(?:男子|女子|男女|男|女)?组?$/.test(compact);
  }
  function nonProjectDetail(value) {
    // These are split/timing/aid descriptions, not category labels. Unknown
    // categories that do not match them remain reviewable weaker evidence.
    return /\d[:：]\d|分段|补给|补水|饮水|水站|配速|用时|计时|耗时|成绩|时间|心率|速度|到达|通过|关门|\d+(?:\.\d+)?\s*(?:秒|分钟|小时|km|公里|千米)/i.test(value);
  }
  function splitOutsideAnnotations(value, separators, bareNumbers = false) {
    const values = [];
    const numericCommas = new Set();
    for (const token of value.matchAll(groupedDistancePattern)) {
      for (let offset = 0; offset < token[0].length; offset++) if (/[,，]/.test(token[0][offset])) numericCommas.add(token.index + offset);
    }
    if (bareNumbers) for (const token of value.matchAll(/(?<![\d.,，])\d{1,3}(?:[,，]\d{3})+(?:\.\d+)?(?![\d.])/g)) {
      for (let offset = 0; offset < token[0].length; offset++) if (/[,，]/.test(token[0][offset])) numericCommas.add(token.index + offset);
    }
    let depth = 0, start = 0;
    for (let index = 0; index < value.length; index++) {
      const character = annotationCharacter(value[index]);
      if (character === "(") depth++;
      else if (character === ")") depth = Math.max(0, depth - 1);
      else if (depth === 0 && separators.test(value[index]) && !numericCommas.has(index)) {
        values.push(value.slice(start, index).trim());
        start = index + 1;
      }
    }
    values.push(value.slice(start).trim());
    return values.filter(Boolean);
  }
  function mergeProjects(values) {
    return { distances: values.flatMap((value) => value.distances), unknown: values.flatMap((value) => value.unknown) };
  }
  const projectSyntax = (value) => numericDistanceSyntax(value.replace(/[\[\]【】「」『』〔〕{}《》〈〉〖〗〘〙〚〛]/g, annotationCharacter).replace(/\s+/g, ""));
  const detailProject = () => ({ distances: [], unknown: [], heading: false, detail: true });
  const clockPattern = /(?:净计时|枪声计时|净成绩|枪声成绩|用时|时间)?[:：]?(?:\d{1,2}:[0-5]\d:[0-5]\d|\d+(?:小时|时)(?:\d+分(?:钟)?)?(?:\d+秒)?|\d+分(?:钟)?(?:\d+秒)?|\d+秒)/g;
  const projectTokenPattern = new RegExp(namedProjectSource + "|" + numericProjectSource, "gi");
  function orderedProjectTokens(value) {
    // Read complete distance tokens without assuming whether the category
    // comes before or after them. Every remaining character must belong to a
    // complete neutral category; arbitrary prose cannot qualify a substring.
    qualifiedProjectPattern.lastIndex = 0;
    if (qualifiedProjectPattern.test(value)) return detailProject();
    const withoutClock = value.replace(clockPattern, "");
    const tokens = [...withoutClock.matchAll(projectTokenPattern)];
    if (!tokens.length) return null;
    // Validate each gap in order. Joining all leftover category text, or
    // accepting the first category suffix, can hide a later project token.
    let cursor = 0, heading = false;
    for (const token of [...tokens, { index: withoutClock.length, 0: "" }]) {
      const gap = withoutClock.slice(cursor, token.index)
        .replace(/^(?:[:·・‧•∙⋅\-–—~、/,，;；|+]|以及|或者|或|及|和|至|到)+|(?:[:·・‧•∙⋅\-–—~、/,，;；|+]|以及|或者|或|及|和|至|到)+$/g, "");
      if (gap) {
        if (!neutralGroup(gap)) return nonProjectDetail(gap) ? detailProject() : null;
        heading = true;
      }
      cursor = token.index + token[0].length;
    }
    return { ...mergeProjects(tokens.map((token) => coreProjectValue(token[0]))), heading, categoryEvidence: heading, parallel: tokens.length > 1, timed: withoutClock !== value };
  }
  function annotationParts(value) {
    let depth = 0, start = 0, firstClose = -1, core = "";
    const annotations = [];
    for (let index = 0; index < value.length; index++) {
      if (value[index] === "(") {
        if (depth === 0) start = index + 1;
        depth++;
      } else if (value[index] === ")") {
        if (depth === 0) return null;
        if (--depth === 0) {
          annotations.push(value.slice(start, index));
          if (firstClose === -1) firstClose = index;
        }
      } else if (depth === 0) core += value[index];
    }
    return depth ? null : { core, annotations, wrapped: value.startsWith("(") && firstClose === value.length - 1 };
  }
  function mergeAnnotations(annotations) {
    const projects = annotations.map((annotation) => annotation.parsed).filter(Boolean);
    return { parsed: projects.length ? mergeProjects(projects) : null, known: annotations.some((annotation) => annotation.known), detail: annotations.length > 0 && annotations.every((annotation) => annotation.detail) };
  }
  function projectAnnotation(value, level = 0) {
    if (level > 24) return { parsed: null, known: false, detail: false };
    const category = projectSyntax(value).replace(/^组别[:：]/, "");
    const categories = splitOutsideAnnotations(category, /[,，;；、/]/);
    if (categories.length > 1) return mergeAnnotations(categories.map((item) => projectAnnotation(item, level + 1)));
    const parts = annotationParts(category);
    if (!parts) return { parsed: null, known: false, detail: false };
    if (parts.annotations.length) return mergeAnnotations([
      ...(parts.core ? [projectAnnotation(parts.core, level + 1)] : []),
      ...parts.annotations.map((item) => projectAnnotation(item, level + 1))
    ]);
    const ordered = orderedProjectTokens(category);
    if (ordered && !ordered.detail) {
      if (!ordered.timed || ordered.heading) return { parsed: ordered, known: true, detail: false };
    }
    const withoutClock = category.replace(/[:：]?\d{1,2}:[0-5]\d:[0-5]\d/g, "");
    if (withoutClock !== category && neutralGroup(withoutClock)) return { parsed: null, known: true, detail: false };
    // A complete distance remains evidence. Otherwise exclude auxiliary
    // descriptions before considering a generic group name.
    const parsed = coreProjectValue(category);
    if (parsed) return { parsed, known: true, detail: false };
    if (nonProjectDetail(category)) return { parsed: null, known: false, detail: true };
    return { parsed: null, known: neutralGroup(category), detail: false };
  }
  function withAnnotation(base, category) {
    if (base.detail || category.detail && !base.heading) return detailProject();
    return { ...mergeProjects([base, ...(category.parsed ? [category.parsed] : [])]), heading: base.heading || category.known, categoryEvidence: base.categoryEvidence || category.known, parallel: base.parallel, timingOnly: base.timingOnly && !category.known };
  }
  function analyzeProject(value, level = 0) {
    if (level > 24) return null;
    const compact = projectSyntax(value);
    const parts = annotationParts(compact);
    if (!parts) return null;
    // A wrapper around the entire project is different from an annotation
    // after it. Unwrap recursively before interpreting the project itself.
    if (parts.wrapped) {
      const project = analyzeProject(parts.annotations[0], level + 1);
      return project && !project.detail ? { ...project, heading: true } : project;
    }
    const items = splitOutsideAnnotations(compact, /[、/,，;；|]/);
    if (items.length > 1) {
      const parsedItems = items.map((item) => analyzeProject(item, level + 1));
      const categories = [];
      for (let index = 0; index < items.length; index++) if (!parsedItems[index]) {
        const category = projectAnnotation(items[index], level + 1);
        if (!category.known && !category.detail) return null;
        categories.push(category);
      }
      const projects = parsedItems.filter((project) => project && !project.detail && (!project.colonClock || !/[;；|]/.test(compact)));
      if (!projects.length) return detailProject();
      return { ...withAnnotation({ ...mergeProjects(projects), heading: projects.some((project) => project.heading), categoryEvidence: projects.some((project) => project.categoryEvidence), timingOnly: projects.length === 1 && projects[0].timingOnly }, mergeAnnotations(categories)), parallel: projects.length > 1 };
    }
    // Keep timed project evidence separate from auxiliary prose. A lone
    // distance with a clock is still a possible split; within a project list
    // it must participate in reconciliation instead of disappearing. Parse
    // list members first so a colon-labelled split retains its own scope.
    const withoutClock = compact.replace(clockPattern, "")
      .replace(/[,，;；、/]+\)/g, ")").replace(/\([,，;；、/]+/g, "(").replace(/\(\)/g, "");
    if (withoutClock !== compact) {
      const parsed = analyzeProject(withoutClock, level + 1);
      if (!parsed || parsed.detail) return parsed;
      if (!parsed.categoryEvidence && new RegExp("^(?:" + projectStartSource + ")(?:用时|计时|耗时|成绩|时间)", "i").test(compact)) return detailProject();
      const colonClock = !parsed.categoryEvidence && new RegExp("^(?:" + projectStartSource + "):\\d", "i").test(compact);
      return { ...parsed, colonClock, timingOnly: !parsed.categoryEvidence && !parsed.parallel };
    }
    const category = mergeAnnotations(parts.annotations.map((item) => projectAnnotation(item, level + 1)));
    const ordered = orderedProjectTokens(parts.core);
    if (ordered) {
      if (ordered.detail || ordered.timed && !ordered.heading && !category.known) return detailProject();
      return withAnnotation(ordered, category);
    }
    // A category can precede a wrapped distance, e.g. "男子【全程】".
    if (category.parsed && neutralGroup(parts.core)) return { ...category.parsed, heading: true, categoryEvidence: true };
    // A connector is a project/category separator only if its entire left
    // side is a project. Hyphens inside age ranges remain on the right side;
    // timestamp colons and decimal distance points cannot become separators.
    let depth = 0;
    for (let index = 0; index < compact.length; index++) {
      if (compact[index] === "(") depth++;
      else if (compact[index] === ")") depth--;
      else if (depth === 0 && /[:·・‧•∙⋅\-–—]/.test(compact[index])) {
        if (compact[index] === ":" && /\d/.test(compact[index - 1] || "") && /\d/.test(compact[index + 1] || "")) continue;
        const base = analyzeProject(compact.slice(0, index), level + 1);
        // The first category separator must follow a complete project. If
        // that prefix is invalid, retrying every longer prefix cannot make
        // it valid and causes exponential work on repeated hyphens.
        return base && !base.detail ? withAnnotation(base, projectAnnotation(compact.slice(index + 1), level + 1)) : null;
      }
    }
    // A wrapped project followed by more annotations also keeps its explicit
    // project evidence, e.g. "【全程】（精英组）".
    if (!parts.core && parts.annotations.length > 1) {
      const base = analyzeProject(parts.annotations[0], level + 1);
      if (base && !base.detail) return withAnnotation({ ...base, heading: true }, mergeAnnotations(parts.annotations.slice(1).map((item) => projectAnnotation(item, level + 1))));
    }
    let parsed = coreProjectValue(parts.core);
    if (!parsed) {
      const withoutClock = parts.core.replace(/(?:净计时|枪声计时|净成绩|枪声成绩|用时|时间)?[:：]?\d{1,2}:[0-5]\d:[0-5]\d/g, "");
      if (withoutClock === parts.core || !(parsed = coreProjectValue(withoutClock))) return null;
      if (!category.known) return detailProject();
    }
    return withAnnotation({ ...parsed, heading: false }, category);
  }
  function projectValue(value) {
    const parsed = analyzeProject(value);
    return parsed && !parsed.detail && !parsed.timingOnly ? parsed : null;
  }
  function printedProjectEvidence(value, level = 0, inList = false, scope = {}) {
    if (level > 24) return null;
    const compact = projectSyntax(value), analyzed = analyzeProject(compact);
    const items = splitOutsideAnnotations(compact, /[、/,，;；|]/);
    if (items.length > 1) {
      const values = items.map((item) => printedProjectEvidence(item, level + 1, !/[;；|]/.test(compact), scope)).filter(Boolean);
      return values.length ? mergeProjects(values) : null;
    }
    // The old broad detail classifier also matches any numeric distance.
    // Use actual auxiliary language here, not that legacy return value, so
    // an unparsed category cannot hide the complete distances around it.
    const qualifiedDistance = new RegExp(qualifiedProjectPattern.source, "gi");
    const parts = annotationParts(compact);
    if (scope.explicit && parts?.annotations.some((item) => [...item.matchAll(projectTokenPattern)].length)) {
      const values = [
        ...(parts.core ? [printedProjectEvidence(parts.core, level + 1, inList, scope)] : []),
        ...parts.annotations.map((item) => printedProjectEvidence(item, level + 1, inList, parts.core ? {} : scope))
      ].filter(Boolean);
      return values.length ? mergeProjects(values) : null;
    }
    // An auxiliary distance modifies its own token, not the project around
    // it. In explicit project fields inspect bracket children independently.
    if (scope.explicit && qualifiedDistance.test(compact)) {
      if (parts?.annotations.length) {
        const values = [parts.core, ...parts.annotations].filter(Boolean).map((item) => printedProjectEvidence(item, level + 1, inList, scope)).filter(Boolean);
        return values.length ? mergeProjects(values) : null;
      }
      const rest = compact.replace(qualifiedDistance, "");
      const tokens = [...rest.replace(clockPattern, "").matchAll(projectTokenPattern)];
      return tokens.length ? mergeProjects(tokens.map((token) => coreProjectValue(token[0]))) : null;
    }
    qualifiedDistance.lastIndex = 0;
    if (qualifiedDistance.test(compact)) return null;
    const hardAuxiliary = /分段|补给|补水|饮水|水站|配速|心率|速度|到达|通过|关门|(?:计时|用时|耗时|成绩|时间)组/.test(compact);
    if (analyzed?.detail && hardAuxiliary) return null;
    const timingDescription = /用时|计时|耗时|成绩|时间/.test(compact);
    const tokens = [...compact.replace(clockPattern, "").matchAll(projectTokenPattern)];
    const timedField = scope.explicit && (scope.preserveTimed || new RegExp(namedProjectSource, "i").test(compact));
    if (!timedField && (analyzed?.detail || analyzed?.timingOnly) && timingDescription && !inList && tokens.length < 2) return null;
    if (!timedField && analyzed?.timingOnly && !inList && tokens.length < 2) return null;
    if (parts?.annotations.length) {
      const values = [parts.core, ...parts.annotations].filter(Boolean).map((item) => printedProjectEvidence(item, level + 1, inList, scope)).filter(Boolean);
      return values.length ? mergeProjects(values) : null;
    }
    return tokens.length ? mergeProjects(tokens.map((token) => coreProjectValue(token[0]))) : null;
  }
  function explicitProjectValue(value, scope = {}) {
    const parsed = projectValue(value), printed = printedProjectEvidence(value, 0, false, scope);
    if (!printed) return parsed;
    // The grammar may be unable to explain an unfamiliar connector/category.
    // Never accept a successful prefix that omitted another printed distance
    // from an explicit project field. Keep all evidence and require a choice.
    if (parsed && printed.distances.every((distance) => parsed.distances.includes(distance)) && printed.unknown.every((distance) => parsed.unknown.includes(distance))) return parsed;
    return { ...mergeProjects([...(parsed ? [parsed] : []), printed]), uncertain: true };
  }
  function projectLineValue(value) {
    const compact = projectSyntax(value);
    // A line beginning with a complete project can continue a printed list
    // even when its separator/category is unfamiliar. Keep it as weaker
    // evidence until the record has a real project anchor. Personal fields
    // and ordinary prose are still handled outside this path.
    const withoutQualified = compact.replace(qualifiedProjectPattern, "");
    if (withoutQualified !== compact) {
      const remaining = withoutQualified.replace(/^(?:以及|或者|和|及|或|至|到|[、/·・~+])+|(?:以及|或者|和|及|或|至|到|[、/·・~+])+$/g, "");
      const parsed = projectValue(remaining);
      if (parsed) return { ...parsed, heading: false };
    }
    if (new RegExp("^\\(*(?:" + projectStartSource + ")", "i").test(compact)
      && [...compact.replace(clockPattern, "").matchAll(projectTokenPattern)].length > 1) return explicitProjectValue(value);
    return projectValue(value);
  }
  function fieldValue(value, unit) {
    if (!unit) return value;
    // A field-level unit applies only to bare numeric values. Values already
    // carrying their own unit and timing annotations keep their own scope.
    const items = splitOutsideAnnotations(value, /[、/,，;；|]/, true);
    return items.map((item) => /^\s*(?:\d{1,3}(?:[,，]\d{3})+|\d+)(?:\.\d+)?\s*$/.test(item) ? item.trim() + unit : item).join("、");
  }
  function metadataLabel(label) {
    // Personal columns and split notes can contain a distance word without
    // declaring the finish. Project columns are not limited to a name list:
    // a whole cell that is itself a project stays visible.
    return /姓名|名字|名称|号码|城市|省份|备注|介绍|说明|感受|故事|标签|配速|补给|补水|饮水|水站|分段|用时|计时|耗时|成绩|心率|速度|到达|通过|关门/.test(label.replace(/[ \t]/g, ""));
  }
  function colonDeclaredProject(clause) {
    const index = clause.indexOf(":");
    if (index <= 0) return null;
    const label = clause.slice(0, index).trim();
    const value = clause.slice(index + 1).trim();
    if (!label || !value || metadataLabel(label)) return null;
    const parsed = projectValue(value);
    if (!parsed || parsed.detail || parsed.timingOnly || (!parsed.distances.length && !parsed.unknown.length)) return null;
    return parsed;
  }
  function collect(value, parsed = projectValue(value)) {
    if (!parsed) return false;
    clues.add(value.trim());
    if (parsed.uncertain) uncertainProject = true;
    parsed.distances.forEach((distance) => supported.add(distance));
    parsed.unknown.forEach((distance) => unsupported.add(distance));
    return true;
  }
  // Explicit fields and full project names can establish a project. A short
  // standalone value is weaker evidence: keep it across the entire record,
  // then use it for conflict checks only when explicit evidence also exists.
  // This avoids both inferring a finish from a lone split distance and losing
  // another printed project when personal details interrupt a list.
  const clauses = splitOutsideAnnotations(text, /[\r\n]/).flatMap((line) => {
    // Preserve complete inline project lists before splitting other record
    // columns. In particular, a comma must not sever a timed second item
    // from its explicit project field or remove it from the review text.
    if (projectValue(line)) return [line];
    const unitField = projectFieldParts(line);
    const pieces = splitOutsideAnnotations(line, /[;；|,，]/, Boolean(unitField?.bounded && unitField.unit)), result = [];
    let cursor = 0;
    for (let index = 0; index < pieces.length; index++) {
      const start = line.indexOf(pieces[index], cursor);
      let end = start + pieces[index].length, combined = pieces[index];
      const field = projectFieldParts(combined);
      if (field?.bounded) {
        const scope = { explicit: !field.group, preserveTimed: field.label !== "项目" };
        while (index + 1 < pieces.length) {
          const next = pieces[index + 1];
          const nextValue = fieldValue(next, field.unit);
          // A neighboring record column starts a new scope. The recovery
          // pass is for project-shaped continuations, not arbitrary prose
          // or another labelled field that happens to mention a distance.
          if (projectFieldParts(next)?.bounded || !projectValue(nextValue) && !new RegExp("^\\(*(?:" + projectStartSource + ")", "i").test(projectSyntax(nextValue))) break;
          if (!explicitProjectValue(nextValue, scope)) break;
          const nextStart = line.indexOf(next, end), nextEnd = nextStart + next.length;
          const candidate = line.slice(start, nextEnd);
          const candidateField = projectFieldParts(candidate);
          const value = fieldValue(candidateField.value, candidateField.unit);
          if (!explicitProjectValue(value, scope)) break;
          combined = candidate;
          end = nextEnd;
          index++;
        }
      }
      result.push(combined);
      cursor = end;
    }
    return result;
  });
  let context = null, awaitingValue = false;
  for (const clause of clauses) {
    const compactClause = clause.replace(/[ \t]/g, "");
    if (!clause) continue;
    if (context?.explicit && context.lastValue && context.awaitingClock) {
      const syntax = projectSyntax(clause), rest = syntax.replace(clockPattern, "");
      if (rest !== syntax && !rest) {
        clues.delete(context.lastValue);
        context.lastValue += "\n" + clause;
        clues.add(context.lastValue);
        context.awaitingClock = false;
        continue;
      }
    }
    // A field name ends at a colon or the end of its line. Also accept a
    // complete value with no colon, as OCR may omit that punctuation, but do
    // not treat "项目介绍" or "项目组" as a malformed project declaration.
    const prefix = projectFieldParts(clause);
    if (prefix && (prefix.bounded || projectValue(fieldValue(prefix.value, prefix.unit)))) {
      const value = fieldValue(prefix.value, prefix.unit), display = prefix.unit ? clause : prefix.value;
      context = { group: prefix.group, explicit: !prefix.group, preserveTimed: prefix.label !== "项目", unit: prefix.unit, fieldHeader: prefix.unit ? clause : "" };
      awaitingValue = !value;
      if (!awaitingValue && !collect(display, explicitProjectValue(value, context))) {
        if (!context.group) unreadable.add(display);
        if (!context.group || !neutralGroup(value)) context = null;
      }
      if (context?.explicit && !awaitingValue) {
        context.lastValue = display;
        context.awaitingClock = projectSyntax(value).replace(clockPattern, "") === projectSyntax(value);
      }
      continue;
    }
    const declared = colonDeclaredProject(clause);
    if (declared && collect(clause, declared)) {
      context = { group: false };
      awaitingValue = false;
      continue;
    }
    // Category annotations have identical semantics in fields, parentheses
    // and colon headings. Unknown categories stay weaker review evidence.
    const colon = compactClause.indexOf(":");
    const parsed = projectLineValue(clause);
    if (awaitingValue && context?.explicit && !prefix && new RegExp("^(?:\\(*(?:" + projectStartSource + "))", "i").test(projectSyntax(clause))) {
      if (!collect(clause, explicitProjectValue(clause, context))) {
        unreadable.add(clause);
        context = null;
      } else {
        context.lastValue = clause;
        context.awaitingClock = projectSyntax(clause).replace(clockPattern, "") === projectSyntax(clause);
      }
      awaitingValue = false;
      continue;
    }
    if (!prefix && parsed?.heading) {
      collect(clause, parsed);
      context = { group: false };
      awaitingValue = false;
      continue;
    }
    if (prefix || colon !== -1) {
      if (!prefix && parsed) unscoped.push({ value: clause, parsed });
      context = null;
      awaitingValue = false;
      continue;
    }
    if (awaitingValue) {
      const value = fieldValue(clause, context.unit), display = context.unit ? context.fieldHeader + "\n" + clause : clause;
      if (!collect(display, explicitProjectValue(value, context))) {
        if (!context.group) unreadable.add(clause);
        if (!context.group || !neutralGroup(clause)) context = null;
      }
      if (context?.explicit) {
        context.lastValue = display;
        context.awaitingClock = projectSyntax(clause).replace(clockPattern, "") === projectSyntax(clause);
      }
      awaitingValue = false;
      continue;
    }
    if (context && (collect(clause, parsed) || context.group && neutralGroup(clause))) continue;
    context = null;
    if (/^(?:全程马拉松|半程马拉松|全马|半马|(?:half-?|full-?)?marathon)(?:\(?\d+(?:\.\d+)?(?:公里|千米|km|k)?\)?)?(?:男子组|女子组|组)?$/i.test(compactClause)) {
      collect(clause);
      context = { group: false };
    } else {
      if (parsed) unscoped.push({ value: clause, parsed });
    }
  }
  const hasProject = supported.size > 0 || unsupported.size > 0;
  if (hasProject) for (const { value, parsed } of unscoped) collect(value, parsed);
  else {
    for (const value of unreadable) clues.add(value);
    for (const { value } of unscoped) clues.add(value);
  }
  const parseIssues = [];
  if (supported.size > 1 || supported.size && unsupported.size) parseIssues.push("资料中出现多个比赛项目或距离，请确认实际完赛项目：" + [...clues].join("、"));
  else if (unsupported.size) parseIssues.push("暂不能识别比赛距离，请确认比赛项目（可选择其他项目）：" + [...unsupported].join("、"));
  if (uncertainProject || !hasProject && unreadable.size) parseIssues.push("项目字段不能明确表示参赛项目，请确认比赛项目");
  if (!supported.size && !unsupported.size) parseIssues.push("未找到明确的参赛项目，分段用时和补给距离不能作为项目依据，请确认比赛项目");
  if (!clues.size) for (const clause of clauses) if (/半\s*程|全\s*程|半\s*马|全\s*马|\d\s*(?:公\s*里|千\s*米|km\b|k\b)/i.test(clause)) clues.add(clause);
  const distance = supported.size === 1 && !unsupported.size && !uncertainProject ? [...supported][0] : "";
  return { distance, distanceText: [...clues].join("、").slice(0, 240), parseIssues };
}

function parseImportText(text) {
  if (typeof text !== "string" || !text.trim()) fail("请粘贴比赛资料或上传成绩文件");
  if (text.length > 160000) fail("一次资料过多，请分批导入");
  const raw = text.trim().replace(/^\uFEFF/, "");
  // A leading bracket can wrap a printed project as well as start JSON.
  // Only that complete project-shaped first line bypasses JSON decoding.
  const initialLine = raw.split(/\r?\n/, 1)[0];
  const bracketedProject = /^[\[{]/.test(raw) ? distanceInText(initialLine) : null;
  if (/^[\[{]/.test(raw) && !bracketedProject?.distance && !bracketedProject?.parseIssues.some((issue) => issue.startsWith("资料中出现多个比赛项目或距离") || issue.startsWith("暂不能识别比赛距离"))) {
    let value; try { value = JSON.parse(raw); } catch { fail("JSON 文件格式不正确"); }
    const list = Array.isArray(value) ? value : Array.isArray(value.entries) ? value.entries : Array.isArray(value.candidates) ? value.candidates : [value];
    if (!list.length || list.length > 100) fail("一次可核对 1–100 场比赛");
    return list.map((item) => { if (!item || typeof item !== "object" || Array.isArray(item)) fail("每条比赛资料应是一个对象"); return importedObject(item); });
  }
  const firstLine = raw.split(/\r?\n/)[0];
  const separator = firstLine.includes("\t") ? "\t" : firstLine.includes(",") ? "," : firstLine.includes("，") ? "，" : null;
  if (separator) {
    const rows = parseDelimited(raw, separator);
    const headers = rows[0].map(importHeader);
    if (headers.includes("name") && headers.includes("raceDate")) {
      if (headers.filter(Boolean).length !== new Set(headers.filter(Boolean)).size) fail("表格包含重复栏目，请保留一份");
      if (rows.length > 101) fail("一次可核对最多 100 场比赛");
      return rows.slice(1).map((row) => {
        if (row.length !== headers.length) fail("表格有行的栏目数量不同，请检查逗号或引号");
        return importedObject(Object.fromEntries(headers.map((header, index) => [header === "distance" && projectFieldParts(rows[0][index])?.unit ? rows[0][index] : header || "ignored" + index, row[index]])));
      });
    }
  }
  const blocks = raw.split(/\n\s*\n/).filter((v) => v.trim());
  const lineRecords = raw.split(/\r?\n/).filter((line) => /\d{4}[-./年]\d{1,2}[-./月]\d{1,2}/.test(line));
  const records = lineRecords.length > 1 && lineRecords.length === raw.split(/\r?\n/).filter((v) => v.trim()).length ? lineRecords : blocks;
  if (records.length > 100) fail("一次可核对最多 100 场比赛");
  return records.map((block) => {
    const date = block.match(/(?<!\d)(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})日?(?!\d)/);
    const timeMatches = [...block.matchAll(/\b\d{1,2}[:：][0-5]\d[:：][0-5]\d\b/g)];
    const net = block.match(/(?:净\s*计\s*时(?:\s*成\s*绩)?|净\s*成\s*绩|净\s*时\s*间)[^\d]{0,25}(\d{1,2}[:：][0-5]\d[:：][0-5]\d)/);
    const gun = block.match(/(?:枪\s*声\s*计\s*时(?:\s*成\s*绩)?|枪\s*声\s*成\s*绩|枪\s*声\s*时\s*间)[^\d]{0,25}(\d{1,2}[:：][0-5]\d[:：][0-5]\d)/);
    const named = block.match(/(?:赛事名称|比赛名称|赛事|比赛)\s*[:：]\s*([^\n]+)/);
    let name = named ? named[1].trim() : block.split(/\r?\n/).find((line) => /马拉松|越野|半马|全马|跑/.test(line)) || block.split(/\r?\n/)[0];
    if (!named) name = name.replace(/(?<!\d)\d{4}[-./年]\d{1,2}[-./月]\d{1,2}日?(?!\d)/g, "").replace(/\b\d{1,2}[:：][0-5]\d[:：][0-5]\d\b/g, "").replace(/(?:净计时|枪声成绩|净成绩|成绩)\s*[:：]?/g, "").replace(/[|,，\t]/g, " ").trim();
    const detectedDistance = distanceInText(block);
    const out = { name, raceDate: date ? `${date[1]}-${date[2].padStart(2,"0")}-${date[3].padStart(2,"0")}` : "", ...detectedDistance, status: /\bDNF\b|未完赛/.test(block) ? "dnf" : /\bDNS\b|未出发/.test(block) ? "dns" : "finished", timing: net ? "net" : gun ? "gun" : "unknown", netTime: net?.[1], gunTime: gun?.[1], kind: /越野/.test(block) ? "trail" : "road", meet: /线上赛|虚拟跑/.test(block) ? "online" : "offline", bib: block.match(/(?:号码布|参赛号)\s*[:：]?\s*([A-Za-z0-9-]+)/)?.[1] || "" };
    if (!net && !gun && timeMatches.length === 1) out.unknownTime = timeMatches[0][0];
    if (!net && !gun && timeMatches.length > 1) out.parseIssues.push("资料中有多个用时，请分别确认净计时和枪声成绩");
    return out;
  });
}

function previewImport(db, userId, text, base) {
  const entries = historyFor(db, userId, base).entries;
  const rawRows = parseImportText(text);
  if (!rawRows.length) fail("没有读到比赛记录，请检查表格内容");
  const candidates = rawRows.map((raw, index) => {
    const sourceKey = HASH.test(raw.sourceKey || "") ? raw.sourceKey : digest(JSON.stringify(raw));
    const issues = [...(raw.parseIssues || [])];
    let normalized;
    try { normalized = normalizeEntry({ ...raw, sourceKey }); } catch (err) { issues.push(err.message); }
    if (!distanceOf(raw.distance)) issues.push(raw.distance ? `无法识别项目“${tidy(raw.distance).slice(0, 120)}”，请确认比赛项目` : "请确认比赛项目");
    const candidate = normalized ? { ...normalized, clock: clock(selectedSeconds(normalized)), seconds: selectedSeconds(normalized), distanceLabel: LABELS[normalized.distance] } : { ...raw, sourceKey };
    if (raw.distanceText) candidate.distanceText = raw.distanceText;
    else if (!distanceOf(raw.distance) && raw.distance) candidate.distanceText = tidy(raw.distance).slice(0, 240);
    delete candidate.parseIssues;
    const duplicate = normalized ? duplicateOf(db, userId, normalized, entries) : null;
    if (duplicate?.deleted) issues.push("这条记录以前已移除，本次不会重新加入");
    if (duplicate && !duplicate.deleted) issues.push("跑史中已有这场记录，本次不会覆盖");
    return { ...candidate, candidateId: "candidate:" + index, source: { kind: "text", label: "导入资料 · 待本人确认", confirmedAt: "" }, issues: [...new Set(issues)], duplicateId: duplicate?.id || null, deletedDuplicate: Boolean(duplicate?.deleted) };
  });
  const batchCounts = new Map();
  for (const candidate of candidates) if (candidate.fingerprint) batchCounts.set(candidate.fingerprint, (batchCounts.get(candidate.fingerprint) || 0) + 1);
  for (const candidate of candidates) if (batchCounts.get(candidate.fingerprint) > 1) candidate.issues.push("本次资料内存在相同赛事记录，请保留一条或核对");
  return { candidates, warnings: ["请逐条核对比赛名称、日期、项目和计时口径。导入与本人确认不代表官方核验。"] };
}

function readUpload(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let total = 0, oversized = Number(req.get("content-length")) > limit;
    req.on("data", (chunk) => { total += chunk.length; if (total > limit) oversized = true; if (!oversized) chunks.push(chunk); });
    req.on("error", reject); req.on("aborted", () => reject(new Error("上传已中断")));
    req.on("end", () => oversized ? reject(Object.assign(new Error("图片不超过 8MB"), { status: 413 })) : resolve(Buffer.concat(chunks)));
  });
}

function singleImage(buffer, contentType) {
  const match = /boundary=(?:"([^"\r\n]+)"|([^;\s]+))/i.exec(contentType || "");
  const boundary = match && (match[1] || match[2]);
  if (!boundary || boundary.length > 200) fail("请选择一张图片上传");
  const marker = Buffer.from("--" + boundary), parts = [];
  let from = buffer.indexOf(marker);
  while (from >= 0) {
    const next = buffer.indexOf(marker, from + marker.length);
    if (next < 0) break;
    const part = buffer.subarray(from + marker.length + 2, next - 2);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd >= 0 && /content-disposition:[^\r\n]*\bfilename=/i.test(part.subarray(0, headerEnd).toString())) parts.push(part.subarray(headerEnd + 4));
    from = next;
  }
  if (parts.length !== 1 || !parts[0].length) fail("一次请选择一张图片");
  return parts[0];
}

function mountRaceHistory(app, { BASE, getDb, userFrom, oneUpload }) {
  const ROOT = BASE + "/api/me/race-history";
  function login(req, res, allowQuery = false) {
    let user = userFrom(req);
    if (!user && allowQuery && typeof req.query.t === "string" && req.query.t) user = getDb().prepare("SELECT id FROM users WHERE token=?").get(req.query.t);
    if (!user) res.status(401).json({ error: "请先登录" });
    else res.set("Cache-Control", "private, no-store");
    return user;
  }
  const wrap = (handler) => (req, res) => { try { return handler(req, res); } catch (err) { return res.status(err.status || 500).json({ error: err.status ? err.message : "资料暂时未能保存，请重试" }); } };
  function owned(req, userId) {
    const data = historyFor(getDb(), userId, BASE);
    const entry = data.entries.find((item) => item.id === req.params.id);
    if (!entry) fail("没有这场个人跑史", 404);
    return { data, entry };
  }
  function resultPayload(userId, id) { const data = historyFor(getDb(), userId, BASE); const entry = data.entries.find((item) => item.id === id); return { entry, review: reviewOf(entry, data.entries) }; }
  app.get(ROOT, wrap((req, res) => { const user = login(req, res); if (user) res.json(historyFor(getDb(), user.id, BASE)); }));
  app.post(ROOT + "/import/preview", wrap((req, res) => { const user = login(req, res); if (user) res.json(previewImport(getDb(), user.id, req.body?.text, BASE)); }));
  app.post(ROOT + "/import/confirm", wrap((req, res) => {
    const user = login(req, res); if (!user) return;
    if (!Array.isArray(req.body?.candidates) || !req.body.candidates.length || req.body.candidates.length > 100) fail("请选择 1–100 场要归档的比赛");
    const normalized = req.body.candidates.map((row) => normalizeEntry(row));
    const db = getDb();
    const answer = db.transaction(() => {
      const prior = historyFor(db, user.id, BASE).entries; let skipped = 0;
      const ids = [];
      for (const entry of normalized) {
        validateAssociation(db, entry);
        const duplicate = duplicateOf(db, user.id, entry, prior);
        if (duplicate) { skipped++; continue; }
        if (db.prepare("SELECT COUNT(*) AS n FROM race_history_entries WHERE user_id=? AND deleted=0").get(user.id).n >= MAX_ENTRIES) fail("跑史数量已达上限，请先整理已有记录");
        const id = writeEntry(db, user.id, entry, "text"); ids.push("exp:" + id);
        prior.push({ ...entry, id: "exp:" + id });
      }
      return { created: ids.length, skipped, entries: historyFor(db, user.id, BASE).entries.filter((entry) => ids.includes(entry.id)) };
    }).immediate();
    res.json(answer);
  }));
  app.post(ROOT, wrap((req, res) => {
    const user = login(req, res); if (!user) return;
    const entry = normalizeEntry(req.body);
    const db = getDb();
    const id = db.transaction(() => {
      validateAssociation(db, entry);
      const duplicate = duplicateOf(db, user.id, entry, historyFor(db, user.id, BASE).entries);
      if (duplicate) fail(duplicate.deleted ? "这条记录以前已移除，请编辑其他记录或调整比赛资料" : "跑史中已有这场比赛，请打开原记录补充", 409);
      if (db.prepare("SELECT COUNT(*) AS n FROM race_history_entries WHERE user_id=? AND deleted=0").get(user.id).n >= MAX_ENTRIES) fail("跑史数量已达上限");
      return writeEntry(db, user.id, entry);
    }).immediate();
    res.status(201).json(resultPayload(user.id, "exp:" + id));
  }));
  app.get(ROOT + "/:id", wrap((req, res) => { const user = login(req, res); if (!user) return; const { data, entry } = owned(req, user.id); res.json({ entry, review: reviewOf(entry, data.entries) }); }));
  app.patch(ROOT + "/:id", wrap((req, res) => {
    const user = login(req, res); if (!user) return;
    const { entry, data } = owned(req, user.id);
    const normalized = normalizeEntry(req.body, { partial: true, previous: entry });
    if (normalized.coverMediaId && !entry.media.some((item) => item.id === normalized.coverMediaId && item.kind !== "video")) fail("请从这场自己的照片中选择封面");
    const db = getDb();
    if (normalized.raceId !== entry.raceId) validateAssociation(db, normalized);
    const conflict = data.entries.find((item) => item.id !== entry.id && item.fingerprint === normalized.fingerprint);
    if (conflict) fail("已有相同比赛与项目，请打开原记录更正", 409);
    const stored = db.prepare("SELECT id FROM race_history_entries WHERE user_id=? AND " + (entry.id.startsWith("result:") ? "legacy_key=?" : "id=?")).get(user.id, entry.id.startsWith("result:") ? entry.id : Number(entry.id.slice(4)));
    writeEntry(db, user.id, normalized, entry.source.kind === "legacy" ? "manual" : entry.source.kind, entry.id.startsWith("result:") ? entry.id : "", stored?.id || null);
    res.json(resultPayload(user.id, entry.id));
  }));
  app.delete(ROOT + "/:id", wrap((req, res) => {
    const user = login(req, res); if (!user) return;
    const { entry } = owned(req, user.id); const db = getDb();
    const files = db.prepare("SELECT filename FROM race_history_media WHERE user_id=? AND entry_key=?").all(user.id, entry.id);
    db.transaction(() => {
      // Keep only hashed identities for repeat-import suppression; names,
      // bibs, times and stories are removed with the actual private record.
      db.prepare("INSERT OR REPLACE INTO race_history_tombstones(user_id,identity_hash,source_key,fingerprint,created_at) VALUES(?,?,?,?,?)").run(user.id, digest(entry.id), entry.sourceKey || "", entry.fingerprint, nowIso());
      db.prepare("DELETE FROM race_history_entries WHERE user_id=? AND " + (entry.id.startsWith("result:") ? "legacy_key=?" : "id=?")).run(user.id, entry.id.startsWith("result:") ? entry.id : Number(entry.id.slice(4)));
      db.prepare("DELETE FROM race_history_media WHERE user_id=? AND entry_key=?").run(user.id, entry.id);
    }).immediate();
    files.forEach((row) => removeHistoryFile(row.filename));
    res.json({ ok: true });
  }));
  app.post(ROOT + "/:id/media", async (req, res) => {
    const user = login(req, res); if (!user) return;
    let filename;
    try {
      const { entry } = owned(req, user.id); const kind = String(req.query.kind || "photo");
      if (!KINDS.has(kind)) fail("请选择照片、证书、奖牌、号码布、路线或参赛服");
      if (!/^multipart\/form-data\s*;/i.test(req.get("content-type") || "")) fail("请使用文件上传");
      const buffer = singleImage(await readUpload(req, MAX_IMAGE + 64 * 1024), req.get("content-type"));
      if (!buffer?.length) fail("请选择图片");
      if (buffer.length > MAX_IMAGE) fail("图片不超过 8MB", 413);
      const type = sniffMedia(buffer, false); if (!type) fail("请选择 JPG、PNG 或 WebP 图片");
      filename = user.id + "-" + crypto.randomBytes(20).toString("hex") + "." + type.ext;
      await fs.promises.mkdir(historyRoot(), { recursive: true });
      await fs.promises.writeFile(path.join(historyRoot(), filename), buffer, { flag: "wx" });
      const db = getDb();
      const row = db.transaction(() => {
        if (userFrom(req)?.id !== user.id) fail("登录已失效，请重新登录", 401);
        owned(req, user.id);
        const totals = db.prepare("SELECT COUNT(*) AS n,COALESCE(SUM(size),0) AS bytes FROM race_history_media WHERE user_id=?").get(user.id);
        const inherited = db.prepare("SELECT COUNT(*) AS n,COALESCE(SUM(size),0) AS bytes FROM runner_media WHERE user_id=?").get(user.id);
        const existing = db.prepare("SELECT COUNT(*) AS n FROM race_history_media WHERE user_id=? AND entry_key=?").get(user.id, entry.id).n;
        if (totals.n + inherited.n >= 500 || existing >= 30 || totals.bytes + inherited.bytes + buffer.length > 512 * 1024 * 1024) fail("资料空间或数量已达上限，请整理后再上传");
        if (entry.id.startsWith("result:") && !db.prepare("SELECT id FROM race_history_entries WHERE user_id=? AND legacy_key=?").get(user.id, entry.id)) {
          const snapshotId = writeEntry(db, user.id, entry, "legacy", entry.id);
          db.prepare("UPDATE race_history_entries SET confirmed_at='' WHERE id=?").run(snapshotId);
        }
        const id = db.prepare("INSERT INTO race_history_media(user_id,entry_key,kind,filename,mime,size,created_at) VALUES(?,?,?,?,?,?,?)").run(user.id, entry.id, kind, filename, type.mime, buffer.length, nowIso()).lastInsertRowid;
        return db.prepare("SELECT * FROM race_history_media WHERE id=?").get(id);
      }).immediate();
      res.json({ media: mediaOf(row, BASE) });
    } catch (err) { if (filename) removeHistoryFile(filename); res.status(err.status || 500).json({ error: err.status ? err.message : "图片未能保存，请重试" }); }
  });
  app.get(ROOT + "/:id/media/:mediaId/file", wrap((req, res) => {
    const user = login(req, res, true); if (!user) return;
    owned(req, user.id);
    const row = getDb().prepare("SELECT * FROM race_history_media WHERE id=? AND user_id=? AND entry_key=?").get(req.params.mediaId.replace(/^history:/, ""), user.id, req.params.id);
    if (!row || path.basename(row.filename) !== row.filename || !fs.existsSync(path.join(historyRoot(), row.filename))) fail("没有这份个人资料", 404);
    res.set({ "Content-Type": row.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    res.sendFile(path.join(historyRoot(), row.filename), (err) => { if (err && !res.headersSent) res.status(err.status || 500).end(); });
  }));
  app.delete(ROOT + "/:id/media/:mediaId", wrap((req, res) => {
    const user = login(req, res); if (!user) return;
    owned(req, user.id); const db = getDb();
    const row = db.prepare("SELECT * FROM race_history_media WHERE id=? AND user_id=? AND entry_key=?").get(req.params.mediaId.replace(/^history:/, ""), user.id, req.params.id);
    if (!row) fail("没有这份个人资料", 404);
    db.transaction(() => {
      db.prepare("DELETE FROM race_history_media WHERE id=? AND user_id=?").run(row.id, user.id);
      db.prepare("UPDATE race_history_entries SET cover_media_id='' WHERE user_id=? AND cover_media_id=?").run(user.id, "history:" + row.id);
    })();
    removeHistoryFile(row.filename); res.json({ ok: true });
  }));
}

module.exports = { installRaceHistory, mountRaceHistory, historyFor, normalizeEntry, parseImportText, previewImport, decorateHistory, reviewOf, historyRoot, removeHistoryFile };
