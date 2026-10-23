const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { likeParams } = require("./search-like");
const { readPage, finishPage, pageFields } = require("./page");

const DISTANCES = ["full", "half", "10k", "5k"];
const KINDS = ["trail", "ultra", "family", "fun"];
const PHOTO_MAX = 8 * 1024 * 1024;
const GUIDE_TEXT_MAX = 40000;
const GUIDE_MAX = 16;
const PACER_MAX = 8;
const ROUTE_MAX = 4;
const SHEET_LIMIT = { guide: GUIDE_MAX, pacer: PACER_MAX, route: ROUTE_MAX, live: 1 };
const SHEET_FULL = {
  guide: "规程最多 16 页",
  pacer: "配速资料最多 8 张",
  route: "路线图最多 4 张"
};

function mediaRoot() {
  return process.env.MARATHON_MEDIA || path.join(__dirname, "../data/media");
}

function clip(value, max) {
  const text = String(value == null ? "" : value).trim();
  if (text.length > max) return null;
  return text;
}

function httpsUrl(value) {
  const text = clip(value, 200);
  if (text == null) return null;
  if (!text) return "";
  if (!/^https:\/\/\S+$/i.test(text)) return null;
  return text;
}

function codes(value, allowed) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  const picked = [];
  for (const item of list) {
    const code = String(item || "").trim();
    if (!code) continue;
    if (!allowed.includes(code) || picked.includes(code)) return null;
    picked.push(code);
  }
  return picked;
}

function groupsOf(value) {
  const parts = String(value || "")
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length > 8) return null;
  if (parts.some((item) => item.length > 16)) return null;
  return parts;
}

function keep(next, current) {
  return next ? next : current || "";
}

function parseGuide(body) {
  const raceDateText = body.raceDate == null ? "" : String(body.raceDate).trim();
  if (raceDateText && !/^\d{4}-\d{2}-\d{2}$/.test(raceDateText)) return { status: 400, error: "比赛日期须为 2026-11-01 这种格式" };
  const name = clip(body.name, 100);
  const city = clip(body.city, 20);
  const province = clip(body.province, 20);
  const place = clip(body.place, 80);
  if (name == null || city == null || province == null || place == null) return { status: 400, error: "名称或地点太长" };
  let district = null;
  if (body.district != null) {
    district = clip(body.district, 40);
    if (district == null) return { status: 400, error: "区县太长" };
  }
  const distances = codes(body.distances, DISTANCES);
  const kinds = codes(body.kinds, KINDS);
  if (!distances || !kinds) return { status: 400, error: "包含不支持的项目类型" };
  const groups = groupsOf(body.groups);
  if (groups == null) return { status: 400, error: "其他组别最多 8 个，每个不超过 16 个字" };
  if (!distances.length && !kinds.length && !groups.length) return { status: 400, error: "请至少选择一个项目" };
  let meet = null;
  if (body.meet != null && String(body.meet).trim() !== "") {
    const text = String(body.meet).trim();
    if (text !== "offline" && text !== "online") return { status: 400, error: "举办方式选线下或线上" };
    meet = text;
  }
  let startAt = clip(body.startAt, 8);
  if (startAt && /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(startAt)) startAt = startAt.slice(0, 5);
  if (startAt == null || (startAt && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startAt))) return { status: 400, error: "起跑时间须为 07:00 这种格式" };
  const bibAt = clip(body.bibAt, 10);
  if (bibAt == null || (bibAt && !/^\d{4}-\d{2}-\d{2}$/.test(bibAt))) return { status: 400, error: "号码公布日期须为 2026-12-10 这种格式" };
  const fee = clip(body.fee, 80);
  const scale = clip(body.scale, 80);
  const phone = clip(body.phone, 40);
  if (fee == null || scale == null || phone == null) return { status: 400, error: "费用、规模或电话太长" };
  if (phone && !/^[\d+\-()（）/\s]{5,40}$/.test(phone)) return { status: 400, error: "咨询电话仅填写号码" };
  const route = clip(body.route, 400);
  const pickup = clip(body.pickup, 400);
  const pacers = clip(body.pacers, 400);
  if (route == null || pickup == null || pacers == null) return { status: 400, error: "路线、领物或配速说明太长" };
  const urls = ["signupUrl", "drawUrl", "bibUrl", "resultUrl", "liveUrl", "eventUrl"].map((key) => httpsUrl(body[key]));
  const official = httpsUrl(body.officialUrl);
  if (urls.some((item) => item == null) || official == null) return { status: 400, error: "链接要以 https:// 开头" };
  let organizer = "";
  let organizerSet = false;
  if (body.organizer != null) {
    const text = clip(body.organizer, 80);
    if (text == null) return { status: 400, error: "主办太长" };
    organizer = text;
    organizerSet = true;
  }
  let grade = "";
  let gradeSet = false;
  if (body.grade != null) {
    const text = String(body.grade).trim();
    if (text && !["A", "B", "C", "TEN"].includes(text)) return { status: 400, error: "认证类别仅支持 A 类、B 类、C 类或系列赛" };
    grade = text;
    gradeSet = true;
  }
  let guideText = "";
  let guideTextSet = false;
  if (body.guideText != null) {
    const text = clip(body.guideText, GUIDE_TEXT_MAX);
    if (text == null) return { status: 400, error: "规程文字最多 40000 字" };
    guideText = text;
    guideTextSet = true;
  }
  return {
    fields: {
      name: name || "",
      city: city || "",
      province: province || "",
      district,
      place: place || "",
      distances,
      kinds,
      groups,
      meet,
      startAt: startAt || "",
      bibAt: bibAt || "",
      fee: fee || "",
      scale: scale || "",
      phone: phone || "",
      route: route || "",
      pickup: pickup || "",
      pacers: pacers || "",
      urls,
      official: official || "",
      organizer,
      organizerSet,
      grade,
      gradeSet,
      guideText,
      guideTextSet,
      raceDateText
    }
  };
}

function saveGuide(db, race, body) {
  const parsed = parseGuide(body);
  if (parsed.error) return parsed;
  const fields = parsed.fields;
  const organizer = fields.organizerSet ? fields.organizer : race.organizer || "";
  const grade = fields.gradeSet ? fields.grade : race.grade || "";
  const guideText = fields.guideTextSet ? fields.guideText : race.guide_text || "";
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  db.prepare(
    `UPDATE races SET
       name = ?, race_date = ?, city = ?, province = ?, district = ?, place = ?, distances = ?, kinds = ?, groups = ?,
       start_at = ?, bib_at = ?, fee = ?, scale = ?, phone = ?,
       signup_url = ?, draw_url = ?, bib_url = ?, result_url = ?, live_url = ?, event_url = ?,
       official_url = ?, organizer = ?, grade = ?,
       route = ?, pickup = ?, pacers = ?, guide_text = ?, meet = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    keep(fields.name, race.name),
    fields.raceDateText || race.race_date,
    keep(fields.city, race.city),
    keep(fields.province, race.province),
    fields.district == null ? race.district || "" : fields.district,
    keep(fields.place, race.place),
    fields.distances.join(","),
    fields.kinds.join(","),
    fields.groups.join(","),
    fields.startAt,
    fields.bibAt,
    fields.fee,
    fields.scale,
    fields.phone,
    fields.urls[0],
    fields.urls[1],
    fields.urls[2],
    fields.urls[3],
    fields.urls[4],
    fields.urls[5] || race.event_url || "",
    fields.official || race.official_url || "",
    organizer,
    grade,
    fields.route,
    fields.pickup,
    fields.pacers,
    guideText,
    fields.meet || race.meet || "offline",
    today,
    race.id
  );
  return { ok: true };
}

function sheetsOf(db, raceId) {
  return db
    .prepare("SELECT id, kind FROM race_sheets WHERE race_id = ? AND filename != '' ORDER BY sort, id")
    .all(raceId);
}

function attachGuide(db, race) {
  const rows = sheetsOf(db, race.id);
  race.guide = rows.filter((row) => row.kind === "guide").map((row) => ({ id: row.id }));
  race.routeSheets = rows.filter((row) => row.kind === "route").map((row) => ({ id: row.id }));
  race.pacerSheets = rows.filter((row) => row.kind === "pacer").map((row) => ({ id: row.id }));
  const live = rows.find((row) => row.kind === "live");
  race.liveSheet = live ? { id: live.id } : null;
  return race;
}

function sniffPhoto(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return { ext: "png", mime: "image/png" };
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > max) {
        reject(Object.assign(new Error("文件太大"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function oneFile(buffer, header) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(header || "");
  if (!boundary) return null;
  const token = "--" + (boundary[1] || boundary[2]).trim();
  const marker = Buffer.from(token);
  const start = buffer.indexOf(marker);
  if (start < 0) return null;
  let part = buffer.subarray(start + marker.length);
  if (part[0] === 13 && part[1] === 10) part = part.subarray(2);
  const headerEnd = part.indexOf("\r\n\r\n");
  if (headerEnd < 0) return null;
  const head = part.subarray(0, headerEnd).toString("utf8");
  let body = part.subarray(headerEnd + 4);
  const next = body.indexOf(Buffer.from("\r\n" + token));
  if (next >= 0) body = body.subarray(0, next);
  if (!/filename=/.test(head)) return null;
  return body;
}

function removeSheet(db, row) {
  db.prepare("DELETE FROM race_sheets WHERE id = ?").run(row.id);
  if (!row.filename) return;
  const file = path.join(mediaRoot(), "races", path.basename(row.filename));
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function cstToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function listManaged(db, { q = "", when = "upcoming", pageQuery } = {}) {
  const match = likeParams(q, ["name", "city", "place", "province"]);
  const params = [...match.params];
  let where = `WHERE (${match.sql})`;
  if (when !== "all") {
    where += " AND race_date >= ?";
    params.push(cstToday());
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM races ${where}`).get(...params).n;
  const window = finishPage(total, readPage(pageQuery));
  const rows = db
    .prepare(`SELECT id, name, race_date, city, province, place FROM races ${where} ORDER BY race_date, id LIMIT ? OFFSET ?`)
    .all(...params, window.limit, window.offset);
  return { rows, ...pageFields(window) };
}

function createRace(db, body) {
  const parsed = parseGuide(body);
  if (parsed.error) return parsed;
  const fields = parsed.fields;
  if (!fields.name) return { status: 400, error: "请填写赛事名称" };
  if (!fields.raceDateText) return { status: 400, error: "比赛日期须为 2026-11-01 这种格式" };
  if (!fields.city && !fields.place) return { status: 400, error: "请填写城市或举办地点" };
  const id = "hand-" + crypto.randomBytes(4).toString("hex");
  db.prepare(
    `INSERT INTO races (
       id, name, city, province, distances, race_date, deadline, place,
       source, updated_at, kinds, groups, start_at,
       bib_at, fee, scale, phone,
       signup_url, draw_url, bib_url, result_url, live_url, event_url, official_url,
       organizer, grade, route, pickup, pacers, guide_text, district, meet
     ) VALUES (
       ?, ?, ?, ?, ?, ?, '', ?,
       ?, ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?, ?, ?, ?
     )`
  ).run(
    id,
    fields.name,
    fields.city || fields.place,
    fields.province,
    fields.distances.join(","),
    fields.raceDateText,
    fields.place || fields.city,
    "后台手工添加",
    cstToday(),
    fields.kinds.join(","),
    fields.groups.join(","),
    fields.startAt,
    fields.bibAt,
    fields.fee,
    fields.scale,
    fields.phone,
    fields.urls[0],
    fields.urls[1],
    fields.urls[2],
    fields.urls[3],
    fields.urls[4],
    fields.urls[5],
    fields.official,
    fields.organizer,
    fields.grade,
    fields.route,
    fields.pickup,
    fields.pacers,
    fields.guideText,
    fields.district || "",
    fields.meet || "offline"
  );
  return { id };
}

function removeRace(db, id) {
  const race = db.prepare("SELECT id, name, race_date FROM races WHERE id = ?").get(id);
  if (!race) return { status: 404, error: "没有这场比赛" };
  const { compactName } = require("./official");
  const name = compactName(race.name);
  const officials = db.prepare("SELECT official_id, name, race_id, race_date FROM official_races WHERE status != 'ignored'").all();
  const linked = officials
    .filter((row) => row.race_id === race.id || (compactName(row.name) === name && row.race_date === race.race_date))
    .map((row) => row.official_id);
  const sheets = db.prepare("SELECT * FROM race_sheets WHERE race_id = ?").all(race.id);
  const signups = db.prepare("SELECT sheet FROM plans WHERE race_id = ? AND sheet != ''").all(race.id);
  const proofs = db.prepare("SELECT proof FROM results WHERE race_id = ? AND proof != ''").all(race.id);
  db.transaction(() => {
    for (const sheet of sheets) removeSheet(db, sheet);
    db.prepare("DELETE FROM plans WHERE race_id = ?").run(race.id);
    db.prepare("DELETE FROM prize_rules WHERE race_id = ?").run(race.id);
    db.prepare("DELETE FROM draw_rates WHERE race_id = ?").run(race.id);
    db.prepare("DELETE FROM results WHERE race_id = ?").run(race.id);
    db.prepare("DELETE FROM news WHERE race_id = ?").run(race.id);
    db.prepare("DELETE FROM news_submissions WHERE race_id = ?").run(race.id);
    const ignore = db.prepare("UPDATE official_races SET status = 'ignored', race_id = '' WHERE official_id = ?");
    for (const officialId of linked) ignore.run(officialId);
    db.prepare("DELETE FROM races WHERE id = ?").run(race.id);
  })();
  for (const signup of signups) {
    const full = path.join(mediaRoot(), "signups", path.basename(signup.sheet));
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  for (const proof of proofs) {
    const full = path.join(mediaRoot(), "results", path.basename(proof.proof));
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  return { ok: true };
}

function mountRaceGuide(app, { BASE, getDb, requireAdmin }) {
  app.get(BASE + "/api/admin/races", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const q = String(req.query.q || "").trim();
    const when = req.query.when === "all" ? "all" : "upcoming";
    const listed = listManaged(getDb(), { q, when, pageQuery: req.query });
    res.json({
      races: listed.rows.map((row) => ({
        id: row.id,
        name: row.name,
        raceDate: row.race_date,
        city: row.city,
        province: row.province,
        place: row.place
      })),
      total: listed.total,
      page: listed.page,
      pageSize: listed.pageSize,
      pages: listed.pages
    });
  });

  app.get(BASE + "/api/admin/places", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const rows = getDb().prepare("SELECT DISTINCT province, city, place FROM races WHERE place != '' ORDER BY province, city, place").all();
    res.json({
      spots: rows.map((row) => ({ province: row.province, city: row.city, place: row.place }))
    });
  });

  app.post(BASE + "/api/admin/races", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const created = createRace(getDb(), req.body || {});
    if (created.error) return res.status(created.status).json({ error: created.error });
    res.json({ id: created.id });
  });

  app.delete(BASE + "/api/admin/races/:id", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const removed = removeRace(getDb(), req.params.id);
    if (removed.error) return res.status(removed.status).json({ error: removed.error });
    res.json({ ok: true });
  });

  app.put(BASE + "/api/admin/races/:id/guide", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const race = getDb().prepare("SELECT * FROM races WHERE id = ?").get(req.params.id);
    if (!race) return res.status(404).json({ error: "没有这场比赛" });
    const saved = saveGuide(getDb(), race, req.body || {});
    if (saved.error) return res.status(saved.status).json({ error: saved.error });
    const { presentRace } = require("./races");
    res.json({ ok: true, race: attachGuide(getDb(), presentRace(getDb().prepare("SELECT * FROM races WHERE id = ?").get(race.id), new Date())) });
  });

  app.post(BASE + "/api/admin/races/:id/sheets", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const race = getDb().prepare("SELECT id FROM races WHERE id = ?").get(req.params.id);
    if (!race) return res.status(404).json({ error: "没有这场比赛" });
    const kind = String(req.query.kind || "");
    if (!SHEET_LIMIT[kind]) return res.status(400).json({ error: "不支持的图片类型" });
    if (kind !== "live") {
      const count = getDb().prepare("SELECT COUNT(*) AS n FROM race_sheets WHERE race_id = ? AND kind = ?").get(race.id, kind);
      if (count.n >= SHEET_LIMIT[kind]) return res.status(400).json({ error: SHEET_FULL[kind] });
    }
    let buffer;
    try {
      buffer = oneFile(await readBody(req, PHOTO_MAX + 64 * 1024), req.get("content-type"));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.status === 413 ? "照片不超过 8MB" : "没有读到文件" });
    }
    if (!buffer || !buffer.length) return res.status(400).json({ error: "没有读到文件" });
    const photo = sniffPhoto(buffer);
    if (!photo) return res.status(400).json({ error: "仅支持 jpg、png、webp" });
    if (buffer.length > PHOTO_MAX) return res.status(413).json({ error: "照片不超过 8MB" });
    const db = getDb();
    if (kind === "live") {
      const old = db.prepare("SELECT * FROM race_sheets WHERE race_id = ? AND kind = 'live'").all(race.id);
      for (const row of old) removeSheet(db, row);
    }
    const sortRow = db.prepare("SELECT COALESCE(MAX(sort), 0) AS n FROM race_sheets WHERE race_id = ? AND kind = ?").get(race.id, kind);
    const info = db
      .prepare("INSERT INTO race_sheets (race_id, kind, filename, sort, created_at) VALUES (?, ?, '', ?, ?)")
      .run(race.id, kind, Number(sortRow.n) + 1, new Date().toISOString());
    const id = Number(info.lastInsertRowid);
    const filename = id + "." + photo.ext;
    const dir = path.join(mediaRoot(), "races");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buffer);
    db.prepare("UPDATE race_sheets SET filename = ? WHERE id = ?").run(filename, id);
    res.json({ sheet: { id, kind } });
  });

  app.delete(BASE + "/api/admin/races/:id/sheets/:sid", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const row = getDb().prepare("SELECT * FROM race_sheets WHERE id = ? AND race_id = ?").get(req.params.sid, req.params.id);
    if (!row) return res.status(404).json({ error: "没有该图片" });
    removeSheet(getDb(), row);
    res.json({ ok: true });
  });

  app.get(BASE + "/api/race-sheets/:sid", (req, res) => {
    const row = getDb().prepare("SELECT filename FROM race_sheets WHERE id = ?").get(req.params.sid);
    if (!row || !row.filename) return res.status(404).json({ error: "没有该图片" });
    const file = path.join(mediaRoot(), "races", path.basename(row.filename));
    if (!fs.existsSync(file)) return res.status(404).json({ error: "文件不存在" });
    const mime = row.filename.endsWith(".png") ? "image/png" : row.filename.endsWith(".webp") ? "image/webp" : "image/jpeg";
    res.set("Content-Type", mime);
    res.set("Cache-Control", "public, max-age=86400");
    res.sendFile(file);
  });
}

module.exports = { mountRaceGuide, attachGuide, saveGuide };
