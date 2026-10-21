const fs = require("fs");
const path = require("path");
const { memberRole } = require("./roles");

const TYPES = {
  run: "跑步",
  trail: "越野"
};
const SHOT_MAX = 8 * 1024 * 1024;

function mediaRoot() {
  return process.env.MARATHON_MEDIA || path.join(__dirname, "../data/media");
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function beijingToday(now = Date.now()) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function beijingMonth(value) {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return text.slice(0, 7);
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed + 8 * 3600 * 1000).toISOString().slice(0, 7);
}

function addDays(day, count) {
  return new Date(Date.parse(day + "T00:00:00Z") + count * 86400000).toISOString().slice(0, 10);
}

function nextMonth(month) {
  const [year, part] = month.split("-").map(Number);
  if (part === 12) return year + 1 + "-01";
  return year + "-" + String(part + 1).padStart(2, "0");
}

function weekBounds(day) {
  const weekday = new Date(day + "T00:00:00Z").getUTCDay();
  const start = addDays(day, weekday === 0 ? -6 : 1 - weekday);
  return [start, addDays(start, 7)];
}

function boundsOf(range, today) {
  if (range === "today") return [today + "T00:00", addDays(today, 1) + "T00:00"];
  if (range === "week") {
    const [start, end] = weekBounds(today);
    return [start + "T00:00", end + "T00:00"];
  }
  if (range === "month") {
    const month = today.slice(0, 7);
    return [month + "-01T00:00", nextMonth(month) + "-01T00:00"];
  }
  if (range === "year") {
    const year = Number(today.slice(0, 4));
    return [year + "-01-01T00:00", year + 1 + "-01-01T00:00"];
  }
  if (range === "all") return ["", ""];
  return null;
}

function paceLabel(sec) {
  const value = Math.round(Number(sec) || 0);
  if (value < 1) return "";
  return Math.floor(value / 60) + ":" + String(value % 60).padStart(2, "0");
}

function durationLabel(sec) {
  const value = Math.max(0, Math.round(Number(sec) || 0));
  const hour = Math.floor(value / 3600);
  const minute = Math.floor((value % 3600) / 60);
  const second = value % 60;
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0") + ":" + String(second).padStart(2, "0");
}

function shortDuration(sec) {
  const minutes = Math.floor(Math.max(0, Number(sec) || 0) / 60);
  return Math.floor(minutes / 60) + ":" + String(minutes % 60).padStart(2, "0");
}

function parseStart(text) {
  const raw = String(text || "").trim().replace(" ", "T");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return "";
  const year = Number(raw.slice(0, 4));
  if (year < 2000 || year > 2100) return "";
  if (!Number.isFinite(Date.parse(raw + ":00+08:00"))) return "";
  return raw;
}

function parseDuration(text) {
  const parts = String(text || "").trim().split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d{1,4}$/.test(part))) return null;
  const nums = parts.map(Number);
  if (nums.length === 2) {
    if (nums[1] > 59 || nums[0] > 48 * 60) return null;
    const sec = nums[0] * 60 + nums[1];
    return sec >= 1 ? sec : null;
  }
  if (nums[0] > 48 || nums[1] > 59 || nums[2] > 59) return null;
  const sec = nums[0] * 3600 + nums[1] * 60 + nums[2];
  return sec >= 1 && sec <= 48 * 3600 ? sec : null;
}

function parsePace(text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text || "").trim());
  if (!match) return null;
  const minute = Number(match[1]);
  const second = Number(match[2]);
  if (minute < 1 || minute > 30 || second > 59) return null;
  return minute * 60 + second;
}

function textWidth(text) {
  let width = 0;
  for (const char of text) width += char.codePointAt(0) > 255 ? 2 : 1;
  return width;
}

function on(value) {
  return value === true || value === 1 || value === "1";
}

function ensureRules(db, clubId) {
  db.prepare("INSERT OR IGNORE INTO mileage_rules (club_id, effective_on) VALUES (?, ?)").run(clubId, beijingToday());
  return db.prepare("SELECT * FROM mileage_rules WHERE club_id = ?").get(clubId);
}

function presentRules(row) {
  return {
    effectiveOn: row.effective_on,
    manualOk: !!row.manual_ok,
    runOn: !!row.run_on,
    runMin: row.run_min,
    runMax: row.run_max,
    paceFast: paceLabel(row.pace_fast),
    paceSlow: paceLabel(row.pace_slow),
    trailOn: !!row.trail_on,
    trailMin: row.trail_min,
    trailClimb: row.trail_climb,
    trailClimbAdd: !!row.trail_climb_add,
    flagFemale: row.flag_female,
    flagMale: row.flag_male,
    observe: !!row.observe,
    note: "改规则只影响之后新记的场，已经计入的不重算。不建议频繁改。"
  };
}

function readRules(body) {
  const source = body || {};
  const effectiveOn = String(source.effectiveOn || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn) || effectiveOn > beijingToday()) {
    return { error: "生效日写成 2026-10-01，不能晚于今天" };
  }
  const runMin = Number(source.runMin);
  const runMax = Number(source.runMax);
  if (!Number.isFinite(runMin) || runMin < 0.1 || runMin > 999) return { error: "跑步最短在 0.1 到 999 公里" };
  if (!Number.isFinite(runMax) || runMax < runMin || runMax > 999) return { error: "跑步最长不能短于最短，也不超过 999 公里" };
  const paceFast = parsePace(source.paceFast);
  const paceSlow = parsePace(source.paceSlow);
  if (!paceFast || !paceSlow) return { error: "配速写成 3:00 这种" };
  if (paceFast >= paceSlow) return { error: "最快配速要快于最慢配速" };
  const trailMin = Number(source.trailMin);
  const trailClimb = Number(source.trailClimb);
  if (!Number.isFinite(trailMin) || trailMin < 0.1 || trailMin > 999) return { error: "越野最短在 0.1 到 999 公里" };
  if (!Number.isInteger(trailClimb) || trailClimb < 0 || trailClimb > 20000) return { error: "最低爬升写成 0 到 20000 米" };
  const flagFemale = Number(source.flagFemale);
  const flagMale = Number(source.flagMale);
  if (!Number.isFinite(flagFemale) || flagFemale < 0 || flagFemale > 999) return { error: "女生月度下限写成 0 到 999 公里" };
  if (!Number.isFinite(flagMale) || flagMale < 0 || flagMale > 999) return { error: "男生月度下限写成 0 到 999 公里" };
  return {
    rule: {
      effectiveOn,
      manualOk: on(source.manualOk) ? 1 : 0,
      runOn: on(source.runOn) ? 1 : 0,
      runMin: round2(runMin),
      runMax: round2(runMax),
      paceFast,
      paceSlow,
      trailOn: on(source.trailOn) ? 1 : 0,
      trailMin: round2(trailMin),
      trailClimb,
      trailClimbAdd: on(source.trailClimbAdd) ? 1 : 0,
      flagFemale: round2(flagFemale),
      flagMale: round2(flagMale),
      observe: on(source.observe) ? 1 : 0
    }
  };
}

function personalVolume(_type, distance) {
  return round2(distance);
}

function clubVolume(rule, run) {
  if (run.type === "trail" && rule.trail_climb_add) return round2(run.distance_km + run.climb_m / 100);
  return round2(run.distance_km);
}

function eligible(rule, member, run) {
  if (run.overlap) return false;
  const start = Date.parse(run.started_at + ":00+08:00");
  const joined = Date.parse(member.joined_at);
  if (!Number.isFinite(start) || !Number.isFinite(joined) || start < joined) return false;
  if (run.started_at.slice(0, 10) < rule.effective_on) return false;
  if (run.source === "manual" && !rule.manual_ok) return false;
  if (run.type === "run") {
    if (!rule.run_on) return false;
    if (run.distance_km < rule.run_min || run.distance_km > rule.run_max) return false;
    if (run.pace_sec < rule.pace_fast || run.pace_sec > rule.pace_slow) return false;
    return true;
  }
  if (run.type === "trail") {
    if (!rule.trail_on) return false;
    if (run.distance_km < rule.trail_min || run.climb_m < rule.trail_climb) return false;
    return true;
  }
  return false;
}

function overlaps(db, userId, startedAt, durationSec, exceptId) {
  const start = Date.parse(startedAt + ":00+08:00");
  const end = start + durationSec * 1000;
  const rows = db
    .prepare("SELECT id, started_at, duration_sec FROM runs WHERE user_id = ? AND substr(started_at, 1, 10) = ? AND id != ?")
    .all(userId, startedAt.slice(0, 10), exceptId || 0);
  return rows.some((row) => {
    const other = Date.parse(row.started_at + ":00+08:00");
    return start < other + row.duration_sec * 1000 && other < end;
  });
}

function judge(db, run) {
  const clubs = db
    .prepare(
      `SELECT c.id, m.joined_at
       FROM club_members m JOIN clubs c ON c.id = m.club_id
       WHERE m.user_id = ?`
    )
    .all(run.user_id);
  const insert = db.prepare(
    "INSERT INTO mileage_counts (run_id, club_id, counted, volume_km, manual, challenge, decision) VALUES (?, ?, ?, ?, 0, '', '')"
  );
  for (const club of clubs) {
    const rule = ensureRules(db, club.id);
    const counted = eligible(rule, club, run);
    insert.run(run.id, club.id, counted ? 1 : 0, counted ? clubVolume(rule, run) : 0);
  }
}

function rejudge(db, run) {
  const rows = db.prepare("SELECT * FROM mileage_counts WHERE run_id = ?").all(run.id);
  const update = db.prepare("UPDATE mileage_counts SET counted = ?, volume_km = ? WHERE run_id = ? AND club_id = ?");
  for (const row of rows) {
    if (row.manual) continue;
    const member = db.prepare("SELECT joined_at FROM club_members WHERE club_id = ? AND user_id = ?").get(row.club_id, run.user_id);
    if (!member) continue;
    const rule = ensureRules(db, row.club_id);
    const counted = eligible(rule, { joined_at: member.joined_at }, run);
    update.run(counted ? 1 : 0, counted ? clubVolume(rule, run) : row.volume_km, run.id, row.club_id);
  }
}

function presentRun(row) {
  return {
    id: row.id,
    type: row.type,
    typeLabel: TYPES[row.type] || row.type,
    startedAt: row.started_at.replace("T", " "),
    distanceKm: row.distance_km,
    volumeKm: row.volume_km,
    paceLabel: paceLabel(row.pace_sec),
    durationLabel: durationLabel(row.duration_sec),
    climb: row.climb_m,
    city: row.city,
    source: row.source,
    sourceLabel: row.source === "manual" ? "手填" : row.source,
    shot: !!row.shot,
    overlap: !!row.overlap,
    note: row.overlap ? "这一天已经有一场，时间叠上了，所以不进跑团" : ""
  };
}

function attachClubs(db, rows) {
  const presented = rows.map(presentRun);
  if (!rows.length) return presented;
  const ids = rows.map((row) => row.id);
  const marks = db
    .prepare(
      `SELECT c.run_id, c.counted, b.name
       FROM mileage_counts c JOIN clubs b ON b.id = c.club_id
       WHERE c.run_id IN (${ids.map(() => "?").join(",")})
       ORDER BY b.id`
    )
    .all(...ids);
  const grouped = new Map();
  for (const mark of marks) {
    if (!grouped.has(mark.run_id)) grouped.set(mark.run_id, []);
    grouped.get(mark.run_id).push({ name: mark.name, counted: !!mark.counted });
  }
  return presented.map((run) => ({ ...run, clubs: grouped.get(run.id) || [] }));
}

function readRun(body) {
  const type = String((body && body.type) || "");
  if (!TYPES[type]) return { error: "类型选跑步或越野" };
  const startedAt = parseStart(body.startedAt);
  if (!startedAt) return { error: "时间写成 2026-10-21 06:00" };
  const distance = round2(body.distanceKm);
  if (!Number.isFinite(distance) || distance <= 0 || distance > 999) return { error: "里程写成 0.1 到 999 公里" };
  const duration = parseDuration(body.duration);
  if (!duration) return { error: "用时写成 0:50:00" };
  const climb = Number(body.climb);
  if (!Number.isInteger(climb) || climb < 0 || climb > 20000) return { error: "爬升写成 0 到 20000 米" };
  const city = String(body.city || "").trim();
  if (city.length > 20) return { error: "城市最多 20 个字" };
  const pace = distance > 0 ? Math.round(duration / distance) : 0;
  return {
    value: {
      type,
      startedAt,
      distance,
      duration,
      climb,
      city,
      pace,
      volume: personalVolume(type, distance)
    }
  };
}

function floorOf(db, userId, gender) {
  const clubs = db.prepare("SELECT club_id FROM club_members WHERE user_id = ?").all(userId);
  let floor = 0;
  for (const club of clubs) {
    const rule = ensureRules(db, club.club_id);
    const one = gender === "男" ? rule.flag_male : gender === "女" ? rule.flag_female : Math.max(rule.flag_male, rule.flag_female);
    if (one > floor) floor = one;
  }
  return round2(floor);
}

function excused(db, userId, month) {
  const clubs = db.prepare("SELECT club_id, joined_at FROM club_members WHERE user_id = ?").all(userId);
  if (!clubs.length) return false;
  return clubs.every((club) => {
    const rule = ensureRules(db, club.club_id);
    return rule.observe && beijingMonth(club.joined_at) === month;
  });
}

function periodStats(db, userId, from, to) {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN type IN ('run', 'trail') THEN volume_km ELSE 0 END) AS km,
         COUNT(*) AS count,
         COUNT(DISTINCT substr(started_at, 1, 10)) AS days,
         SUM(duration_sec) AS duration_sec,
         SUM(CASE WHEN type = 'run' THEN duration_sec ELSE 0 END) AS run_sec,
         SUM(CASE WHEN type = 'run' THEN distance_km ELSE 0 END) AS run_km
       FROM runs
       WHERE user_id = ? AND started_at >= ? AND started_at < ?`
    )
    .get(userId, from, to);
  const km = round2(row.km || 0);
  return {
    km,
    days: row.days || 0,
    count: row.count || 0,
    durationLabel: durationLabel(row.duration_sec || 0),
    paceLabel: row.run_km > 0 ? paceLabel(Math.round(row.run_sec / row.run_km)) : ""
  };
}

function placeRows(rows) {
  let place = 0;
  let previous = null;
  return rows.map((row, index) => {
    if (previous == null || row.km !== previous) place = index + 1;
    previous = row.km;
    return { ...row, place };
  });
}

function aggregate(db, clubId, from, to) {
  let where = "c.club_id = ? AND c.counted = 1";
  const params = [clubId];
  if (from) {
    where += " AND r.started_at >= ? AND r.started_at < ?";
    params.push(from, to);
  }
  const people = db
    .prepare(
      `SELECT u.id AS user_id, u.nickname, m.joined_at, g.name AS group_name,
              SUM(CASE WHEN r.type IN ('run', 'trail') THEN c.volume_km ELSE 0 END) AS km,
              COUNT(*) AS times,
              COUNT(DISTINCT substr(r.started_at, 1, 10)) AS days,
              SUM(r.duration_sec) AS duration_sec,
              SUM(CASE WHEN r.type = 'run' THEN r.duration_sec ELSE 0 END) AS run_sec,
              SUM(CASE WHEN r.type = 'run' THEN r.distance_km ELSE 0 END) AS run_km
       FROM mileage_counts c
       JOIN runs r ON r.id = c.run_id
       JOIN users u ON u.id = r.user_id
       JOIN club_members m ON m.club_id = c.club_id AND m.user_id = r.user_id
       LEFT JOIN mileage_groups g ON g.id = m.mileage_group_id AND g.club_id = c.club_id
       WHERE ${where}
       GROUP BY u.id
       ORDER BY km DESC, u.id ASC`
    )
    .all(...params);
  return people.map((row) => ({
    userId: row.user_id,
    nickname: row.nickname,
    joinedAt: row.joined_at,
    group: row.group_name || "",
    km: round2(row.km || 0),
    times: row.times,
    days: row.days,
    durationSec: row.duration_sec || 0,
    runSec: row.run_sec || 0,
    runKm: row.run_km || 0
  }));
}

function reportRows(db, clubId, from, to, month) {
  const rule = ensureRules(db, clubId);
  const rows = placeRows(aggregate(db, clubId, from, to).filter((row) => row.times > 0));
  return rows.map((row) => {
    const target = month
      ? db.prepare("SELECT target_km FROM mileage_flags WHERE user_id = ? AND month = ?").get(row.userId, month)
      : null;
    let flag = "";
    if (month) {
      if (rule.observe && beijingMonth(row.joinedAt) === month) flag = "观摩";
      else if (!target) flag = "未设";
      else if (row.km + 1e-9 < target.target_km) flag = "未达标";
      else flag = "达标";
    }
    return {
      place: row.place,
      userId: row.userId,
      nickname: row.nickname,
      km: row.km,
      days: row.days,
      times: row.times,
      dayText: row.days + "/" + row.times,
      durationLabel: shortDuration(row.durationSec),
      paceLabel: row.runKm > 0 ? paceLabel(Math.round(row.runSec / row.runKm)) : "",
      flag,
      durationSec: row.durationSec,
      runSec: row.runSec,
      runKm: row.runKm
    };
  });
}

function csvCell(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
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
  const marker = Buffer.from("--" + (boundary[1] || boundary[2]).trim());
  const start = buffer.indexOf(marker);
  if (start < 0) return null;
  let part = buffer.subarray(start + marker.length);
  if (part[0] === 13 && part[1] === 10) part = part.subarray(2);
  const headerEnd = part.indexOf("\r\n\r\n");
  if (headerEnd < 0) return null;
  const head = part.subarray(0, headerEnd).toString("utf8");
  let body = part.subarray(headerEnd + 4);
  const next = body.indexOf(Buffer.from("\r\n" + marker.toString("utf8")));
  if (next >= 0) body = body.subarray(0, next);
  if (!/filename=/.test(head)) return null;
  return body;
}

function sniff(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return { ext: "png", mime: "image/png" };
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}

function mountMileage(app, { BASE, getDb, userFrom }) {
  function login(req, res) {
    const user = userFrom(req);
    if (!user) {
      res.status(401).json({ error: "请先登录" });
      return null;
    }
    return user;
  }

  function gate(req, res) {
    const user = login(req, res);
    if (!user) return null;
    const club = getDb().prepare("SELECT id, name, code, owner_id FROM clubs WHERE id = ?").get(req.params.id);
    if (!club) {
      res.status(404).json({ error: "没有这个跑团" });
      return null;
    }
    const member = getDb().prepare("SELECT joined_at, role, mileage_group_id FROM club_members WHERE club_id = ? AND user_id = ?").get(club.id, user.id);
    if (!member) {
      res.status(403).json({ error: "你不在这个跑团里" });
      return null;
    }
    const role = memberRole(getDb(), club, user.id);
    return { user, club, db: getDb(), role, staff: role === "owner" || role === "manager", owner: role === "owner" };
  }

  app.get(BASE + "/api/runs", (req, res) => {
    const user = login(req, res);
    if (!user) return;
    const db = getDb();
    const today = beijingToday();
    const month = String(req.query.month || today.slice(0, 7));
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "月份写成 2026-10" });
    const year = today.slice(0, 4);
    const genderRow = db.prepare("SELECT gender FROM user_mileage WHERE user_id = ?").get(user.id);
    const gender = genderRow ? genderRow.gender : "";
    const target = db.prepare("SELECT target_km FROM mileage_flags WHERE user_id = ? AND month = ?").get(user.id, month);
    const stats = periodStats(db, user.id, month + "-01T00:00", nextMonth(month) + "-01T00:00");
    const floor = floorOf(db, user.id, gender);
    const watching = excused(db, user.id, month);
    const runs = db
      .prepare("SELECT * FROM runs WHERE user_id = ? AND substr(started_at, 1, 7) = ? ORDER BY started_at DESC, id DESC")
      .all(user.id, month);
    const yearStats = periodStats(db, user.id, year + "-01-01T00:00", Number(year) + 1 + "-01-01T00:00");
    const total = db
      .prepare(
        `SELECT SUM(CASE WHEN type IN ('run', 'trail') THEN volume_km ELSE 0 END) AS km, COUNT(*) AS count
         FROM runs WHERE user_id = ?`
      )
      .get(user.id);
    res.json({
      year: { km: yearStats.km, days: yearStats.days, count: yearStats.count },
      total: { km: round2(total.km || 0), count: total.count || 0 },
      month: {
        id: month,
        ...stats,
        target: target ? target.target_km : 0,
        percent: target && target.target_km > 0 ? Math.round((stats.km / target.target_km) * 100) : null,
        floor,
        gender,
        observe: watching,
        short: !!(target && stats.km + 1e-9 < target.target_km && !watching),
        canFlag: month === today.slice(0, 7)
      },
      runs: attachClubs(db, runs),
      watches: "尚未接入"
    });
  });

  app.post(BASE + "/api/runs", (req, res) => {
    const user = login(req, res);
    if (!user) return;
    const parsed = readRun(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const db = getDb();
    const value = parsed.value;
    const overlap = overlaps(db, user.id, value.startedAt, value.duration, 0);
    const run = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO runs (
             user_id, type, started_at, distance_km, duration_sec, climb_m, pace_sec, volume_km, city, source, shot, overlap, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', '', ?, ?)`
        )
        .run(
          user.id,
          value.type,
          value.startedAt,
          value.distance,
          value.duration,
          value.climb,
          value.pace,
          value.volume,
          value.city,
          overlap ? 1 : 0,
          new Date().toISOString()
        );
      const stored = db.prepare("SELECT * FROM runs WHERE id = ?").get(Number(info.lastInsertRowid));
      judge(db, stored);
      return stored;
    })();
    const [presented] = attachClubs(db, [run]);
    res.json({
      run: presented,
      note: overlap ? "这一天已经有一场，时间叠上了，所以不进跑团" : ""
    });
  });

  app.put(BASE + "/api/runs/:rid", (req, res) => {
    const user = login(req, res);
    if (!user) return;
    const db = getDb();
    const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(req.params.rid);
    if (!row || row.user_id !== user.id) return res.status(404).json({ error: "没有这场记录" });
    const type = req.body && req.body.type != null ? String(req.body.type) : row.type;
    if (!TYPES[type]) return res.status(400).json({ error: "类型选跑步或越野" });
    const city = req.body && req.body.city != null ? String(req.body.city).trim() : row.city;
    if (city.length > 20) return res.status(400).json({ error: "城市最多 20 个字" });
    const volume = personalVolume(type, row.distance_km);
    const pace = row.distance_km > 0 ? Math.round(row.duration_sec / row.distance_km) : 0;
    db.prepare("UPDATE runs SET type = ?, city = ?, volume_km = ?, pace_sec = ? WHERE id = ?").run(type, city, volume, pace, row.id);
    const stored = db.prepare("SELECT * FROM runs WHERE id = ?").get(row.id);
    rejudge(db, stored);
    const [presented] = attachClubs(db, [stored]);
    res.json({ run: presented });
  });

  app.delete(BASE + "/api/runs/:rid", (req, res) => {
    const user = login(req, res);
    if (!user) return;
    const db = getDb();
    const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(req.params.rid);
    if (!row || row.user_id !== user.id) return res.status(404).json({ error: "没有这场记录" });
    db.transaction(() => {
      db.prepare("DELETE FROM mileage_counts WHERE run_id = ?").run(row.id);
      db.prepare("DELETE FROM runs WHERE id = ?").run(row.id);
    })();
    if (row.shot) {
      const file = path.join(mediaRoot(), "runs", path.basename(row.shot));
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    res.json({ ok: true });
  });

  app.post(BASE + "/api/runs/:rid/shot", async (req, res) => {
    const user = login(req, res);
    if (!user) return;
    const db = getDb();
    const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(req.params.rid);
    if (!row || row.user_id !== user.id) return res.status(404).json({ error: "没有这场记录" });
    if (row.source !== "manual") return res.status(400).json({ error: "这场不是手填的" });
    let buffer;
    try {
      buffer = oneFile(await readBody(req, SHOT_MAX + 64 * 1024), req.get("content-type"));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message || "上传失败" });
    }
    if (!buffer) return res.status(400).json({ error: "没有选到截图" });
    const kind = sniff(buffer);
    if (!kind) return res.status(400).json({ error: "截图用 jpg、png 或 webp" });
    const filename = row.id + "." + kind.ext;
    const dir = path.join(mediaRoot(), "runs");
    fs.mkdirSync(dir, { recursive: true });
    if (row.shot && row.shot !== filename) {
      const old = path.join(dir, path.basename(row.shot));
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    fs.writeFileSync(path.join(dir, filename), buffer);
    db.prepare("UPDATE runs SET shot = ? WHERE id = ?").run(filename, row.id);
    res.json({ ok: true });
  });

  app.get(BASE + "/api/runs/:rid/shot", (req, res) => {
    const header = req.get("authorization") || "";
    const token = header.replace(/^Bearer\s+/i, "") || String(req.query.t || "");
    const viewer = token ? getDb().prepare("SELECT id FROM users WHERE token = ?").get(token) : null;
    if (!viewer) return res.status(401).json({ error: "请先登录" });
    const row = getDb().prepare("SELECT * FROM runs WHERE id = ?").get(req.params.rid);
    if (!row || !row.shot) return res.status(404).json({ error: "没有这张" });
    const same = viewer.id === row.user_id
      || getDb()
        .prepare(
          `SELECT 1 FROM club_members a
           JOIN club_members b ON b.club_id = a.club_id
           WHERE a.user_id = ? AND b.user_id = ?`
        )
        .get(row.user_id, viewer.id);
    if (!same) return res.status(404).json({ error: "没有这张" });
    const file = path.join(mediaRoot(), "runs", path.basename(row.shot));
    if (!fs.existsSync(file)) return res.status(404).json({ error: "文件不在了" });
    const mime = row.shot.endsWith(".png") ? "image/png" : row.shot.endsWith(".webp") ? "image/webp" : "image/jpeg";
    res.set("Content-Type", mime);
    res.set("Cache-Control", "private, max-age=3600");
    fs.createReadStream(file).pipe(res);
  });

  app.put(BASE + "/api/runs-flag", (req, res) => {
    const user = login(req, res);
    if (!user) return;
    const month = String((req.body && req.body.month) || "");
    if (month !== beijingToday().slice(0, 7)) return res.status(400).json({ error: "只能设立本月目标" });
    const gender = req.body && req.body.gender != null ? String(req.body.gender) : null;
    if (gender != null && gender !== "" && gender !== "男" && gender !== "女") return res.status(400).json({ error: "性别选男、女，或留空" });
    const target = round2(req.body && req.body.targetKm);
    if (!Number.isFinite(target) || target > 9999) return res.status(400).json({ error: "目标写成公里数" });
    const db = getDb();
    const stored = db.prepare("SELECT gender FROM user_mileage WHERE user_id = ?").get(user.id);
    const nextGender = gender == null ? (stored ? stored.gender : "") : gender;
    const floor = floorOf(db, user.id, nextGender);
    const least = Math.max(floor, 1);
    if (target < least) return res.status(400).json({ error: "目标不能低于 " + least + " 公里" });
    db.prepare("INSERT INTO user_mileage (user_id, gender) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET gender = excluded.gender").run(user.id, nextGender);
    db.prepare(
      "INSERT INTO mileage_flags (user_id, month, target_km) VALUES (?, ?, ?) ON CONFLICT(user_id, month) DO UPDATE SET target_km = excluded.target_km"
    ).run(user.id, month, target);
    res.json({ ok: true, target, floor, gender: nextGender });
  });

  app.get(BASE + "/api/clubs/:id/mileage", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const range = String(req.query.range || "today");
    const window = boundsOf(range, beijingToday());
    if (!window) return res.status(400).json({ error: "没有这个范围" });
    const [from, to] = window;
    ensureRules(ctx.db, ctx.club.id);
    const ranked = placeRows(aggregate(ctx.db, ctx.club.id, from, to).filter((row) => row.km > 0));
    const q = String(req.query.q || "").trim();
    const rank = ranked
      .filter((row) => !q || row.nickname.includes(q))
      .map((row) => ({
        place: row.place,
        userId: row.userId,
        nickname: row.nickname,
        km: row.km,
        group: row.group || "其他",
        mine: row.userId === ctx.user.id
      }));
    let groupWhere = "c.club_id = ? AND c.counted = 1 AND r.type IN ('run', 'trail')";
    const groupParams = [ctx.club.id];
    if (from) {
      groupWhere += " AND r.started_at >= ? AND r.started_at < ?";
      groupParams.push(from, to);
    }
    const groups = ctx.db
      .prepare(
        `SELECT CASE WHEN g.id IS NULL THEN 0 ELSE g.id END AS gid,
                CASE WHEN g.id IS NULL THEN '其他' ELSE g.name END AS name,
                COALESCE(g.sort, 9999) AS sort,
                SUM(c.volume_km) AS km
         FROM mileage_counts c
         JOIN runs r ON r.id = c.run_id
         JOIN club_members m ON m.club_id = c.club_id AND m.user_id = r.user_id
         LEFT JOIN mileage_groups g ON g.id = m.mileage_group_id AND g.club_id = c.club_id
         WHERE ${groupWhere}
         GROUP BY gid
         HAVING km > 0
         ORDER BY sort, gid`
      )
      .all(...groupParams)
      .map((row) => ({ name: row.name, km: round2(row.km) }));
    let feedWhere = "c.club_id = ? AND c.counted = 1";
    const feedParams = [ctx.club.id];
    if (from) {
      feedWhere += " AND r.started_at >= ? AND r.started_at < ?";
      feedParams.push(from, to);
    }
    if (q) {
      feedWhere += " AND u.nickname LIKE ?";
      feedParams.push("%" + q.replace(/[%_]/g, "") + "%");
    }
    const feed = ctx.db
      .prepare(
        `SELECT r.*, u.nickname, c.volume_km AS club_km, c.challenge, c.decision, g.name AS group_name
         FROM mileage_counts c
         JOIN runs r ON r.id = c.run_id
         JOIN users u ON u.id = r.user_id
         JOIN club_members m ON m.club_id = c.club_id AND m.user_id = r.user_id
         LEFT JOIN mileage_groups g ON g.id = m.mileage_group_id AND g.club_id = c.club_id
         WHERE ${feedWhere}
         ORDER BY r.started_at DESC, r.id DESC
         LIMIT 80`
      )
      .all(...feedParams)
      .map((row) => ({
        ...presentRun(row),
        nickname: row.nickname,
        volumeKm: round2(row.club_km),
        group: row.group_name || "其他",
        challenge: row.challenge,
        decision: row.decision,
        mine: row.user_id === ctx.user.id
      }));
    const header = ctx.db
      .prepare(
        `SELECT
           SUM(CASE WHEN r.type IN ('run', 'trail') AND c.counted = 1 THEN c.volume_km ELSE 0 END) AS km,
           SUM(CASE WHEN c.counted = 1 THEN 1 ELSE 0 END) AS count
         FROM mileage_counts c JOIN runs r ON r.id = c.run_id
         WHERE c.club_id = ?`
      )
      .get(ctx.club.id);
    const members = ctx.db.prepare("SELECT COUNT(*) AS n FROM club_members WHERE club_id = ?").get(ctx.club.id).n;
    const payload = {
      members,
      totalKm: round2(header.km || 0),
      totalCount: header.count || 0,
      range,
      rank,
      groups,
      feed,
      staff: ctx.staff,
      owner: ctx.owner
    };
    if (ctx.staff) {
      payload.rules = presentRules(ensureRules(ctx.db, ctx.club.id));
      payload.manageGroups = ctx.db
        .prepare(
          `SELECT g.id, g.name, g.capacity, g.sort, COUNT(m.user_id) AS members
           FROM mileage_groups g
           LEFT JOIN club_members m ON m.mileage_group_id = g.id AND m.club_id = g.club_id
           WHERE g.club_id = ?
           GROUP BY g.id
           ORDER BY g.sort, g.id`
        )
        .all(ctx.club.id);
      payload.people = ctx.db
        .prepare(
          `SELECT u.id, u.nickname, m.mileage_group_id AS group_id
           FROM club_members m JOIN users u ON u.id = m.user_id
           WHERE m.club_id = ?
           ORDER BY u.id`
        )
        .all(ctx.club.id)
        .map((row) => ({ id: row.id, nickname: row.nickname, groupId: row.group_id }));
    }
    res.json(payload);
  });

  app.put(BASE + "/api/clubs/:id/mileage/rules", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    if (!ctx.owner) return res.status(403).json({ error: "只有团长可以改跑量规则" });
    const parsed = readRules(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const rule = parsed.rule;
    ctx.db
      .prepare(
        `INSERT INTO mileage_rules (
           club_id, effective_on, manual_ok, run_on, run_min, run_max, pace_fast, pace_slow,
           trail_on, trail_min, trail_climb, trail_climb_add, flag_female, flag_male, observe
         ) VALUES (
           @clubId, @effectiveOn, @manualOk, @runOn, @runMin, @runMax, @paceFast, @paceSlow,
           @trailOn, @trailMin, @trailClimb, @trailClimbAdd, @flagFemale, @flagMale, @observe
         )
         ON CONFLICT(club_id) DO UPDATE SET
           effective_on = excluded.effective_on, manual_ok = excluded.manual_ok,
           run_on = excluded.run_on, run_min = excluded.run_min, run_max = excluded.run_max,
           pace_fast = excluded.pace_fast, pace_slow = excluded.pace_slow,
           trail_on = excluded.trail_on, trail_min = excluded.trail_min, trail_climb = excluded.trail_climb,
           trail_climb_add = excluded.trail_climb_add, flag_female = excluded.flag_female,
           flag_male = excluded.flag_male, observe = excluded.observe`
      )
      .run({ clubId: ctx.club.id, ...rule });
    res.json({ rules: presentRules(ensureRules(ctx.db, ctx.club.id)) });
  });

  app.post(BASE + "/api/clubs/:id/mileage/groups", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    if (!ctx.owner) return res.status(403).json({ error: "只有团长可以改跑量分组" });
    const name = String((req.body && req.body.name) || "").trim();
    const width = textWidth(name);
    if (!name || width > 20) return res.status(400).json({ error: "分组名最多 10 个汉字" });
    const capacity = Number(req.body && req.body.capacity);
    const sort = Number(req.body && req.body.sort);
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 500) return res.status(400).json({ error: "人数写成 0 到 500，0 表示不限" });
    if (!Number.isInteger(sort) || sort < 0 || sort > 999) return res.status(400).json({ error: "编号写成 0 到 999" });
    const count = ctx.db.prepare("SELECT COUNT(*) AS n FROM mileage_groups WHERE club_id = ?").get(ctx.club.id).n;
    if (count >= 30) return res.status(400).json({ error: "分组最多 30 个" });
    const same = ctx.db.prepare("SELECT 1 FROM mileage_groups WHERE club_id = ? AND name = ?").get(ctx.club.id, name);
    if (same) return res.status(400).json({ error: "分组名不能重复" });
    const info = ctx.db.prepare("INSERT INTO mileage_groups (club_id, name, capacity, sort) VALUES (?, ?, ?, ?)").run(ctx.club.id, name, capacity, sort);
    res.json({ group: { id: Number(info.lastInsertRowid), name, capacity, sort } });
  });

  app.delete(BASE + "/api/clubs/:id/mileage/groups/:gid", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    if (!ctx.owner) return res.status(403).json({ error: "只有团长可以改跑量分组" });
    const group = ctx.db.prepare("SELECT id FROM mileage_groups WHERE id = ? AND club_id = ?").get(req.params.gid, ctx.club.id);
    if (!group) return res.status(404).json({ error: "没有这个分组" });
    ctx.db.transaction(() => {
      ctx.db.prepare("UPDATE club_members SET mileage_group_id = 0 WHERE club_id = ? AND mileage_group_id = ?").run(ctx.club.id, group.id);
      ctx.db.prepare("DELETE FROM mileage_groups WHERE id = ?").run(group.id);
    })();
    res.json({ ok: true });
  });

  app.put(BASE + "/api/clubs/:id/mileage/members/:uid", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    if (!ctx.owner) return res.status(403).json({ error: "只有团长可以改跑量分组" });
    const member = ctx.db.prepare("SELECT user_id FROM club_members WHERE club_id = ? AND user_id = ?").get(ctx.club.id, req.params.uid);
    if (!member) return res.status(404).json({ error: "团里没有这个人" });
    const groupId = Number(req.body && req.body.groupId);
    if (!Number.isInteger(groupId) || groupId < 0) return res.status(400).json({ error: "没有这个分组" });
    if (groupId) {
      const group = ctx.db.prepare("SELECT * FROM mileage_groups WHERE id = ? AND club_id = ?").get(groupId, ctx.club.id);
      if (!group) return res.status(404).json({ error: "没有这个分组" });
      const used = ctx.db
        .prepare("SELECT COUNT(*) AS n FROM club_members WHERE club_id = ? AND mileage_group_id = ? AND user_id != ?")
        .get(ctx.club.id, groupId, member.user_id).n;
      if (group.capacity > 0 && used >= group.capacity) return res.status(400).json({ error: "这个分组满了" });
    }
    ctx.db.prepare("UPDATE club_members SET mileage_group_id = ? WHERE club_id = ? AND user_id = ?").run(groupId, ctx.club.id, member.user_id);
    res.json({ ok: true });
  });

  app.post(BASE + "/api/clubs/:id/mileage/runs/:rid/challenge", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const reason = String((req.body && req.body.reason) || "").trim();
    if (!reason || reason.length > 80) return res.status(400).json({ error: "质疑写 1 到 80 个字" });
    const row = ctx.db.prepare("SELECT * FROM mileage_counts WHERE run_id = ? AND club_id = ?").get(req.params.rid, ctx.club.id);
    if (!row || !row.counted) return res.status(400).json({ error: "这条没有计入" });
    ctx.db.prepare("UPDATE mileage_counts SET challenge = ? WHERE run_id = ? AND club_id = ?").run(reason, row.run_id, ctx.club.id);
    res.json({ ok: true });
  });

  app.post(BASE + "/api/clubs/:id/mileage/runs/:rid/decision", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    if (!ctx.staff) return res.status(403).json({ error: "只有团长或跑团管理可以改" });
    const row = ctx.db.prepare("SELECT * FROM mileage_counts WHERE run_id = ? AND club_id = ?").get(req.params.rid, ctx.club.id);
    if (!row) return res.status(404).json({ error: "没有这场记录" });
    if (req.body && req.body.counted === true) {
      ctx.db.prepare("UPDATE mileage_counts SET counted = 1, manual = 1, decision = 'in' WHERE run_id = ? AND club_id = ?").run(row.run_id, ctx.club.id);
    } else if (req.body && req.body.counted === false) {
      ctx.db.prepare("UPDATE mileage_counts SET counted = 0, manual = 1, decision = 'out' WHERE run_id = ? AND club_id = ?").run(row.run_id, ctx.club.id);
    } else {
      return res.status(400).json({ error: "选择计入或不计入" });
    }
    res.json({ ok: true });
  });

  function reportOf(ctx, query) {
    const kind = String(query.kind || "month");
    const today = beijingToday();
    let from = "";
    let to = "";
    let title = "";
    let month = "";
    if (kind === "week") {
      const at = /^\d{4}-\d{2}-\d{2}$/.test(query.at || "") ? query.at : today;
      const [start, end] = weekBounds(at);
      from = start + "T00:00";
      to = end + "T00:00";
      title = start.slice(5) + "～" + addDays(end, -1).slice(5);
    } else if (kind === "month") {
      month = /^\d{4}-\d{2}$/.test(query.at || "") ? query.at : today.slice(0, 7);
      from = month + "-01T00:00";
      to = nextMonth(month) + "-01T00:00";
      title = month;
    } else if (kind === "year") {
      const year = /^\d{4}$/.test(query.at || "") ? query.at : today.slice(0, 4);
      from = year + "-01-01T00:00";
      to = Number(year) + 1 + "-01-01T00:00";
      title = year;
    } else if (kind === "all") {
      title = "入团之后";
    } else if (kind === "custom") {
      const start = String(query.from || "");
      const end = String(query.to || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) {
        return { error: "起止写成 2026-10-01 到 2026-10-31" };
      }
      const span = (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000;
      if (span > 366) return { error: "自定义不超过 366 天" };
      from = start + "T00:00";
      to = addDays(end, 1) + "T00:00";
      title = start + "～" + end;
    } else {
      return { error: "没有这个范围" };
    }
    const rows = reportRows(ctx.db, ctx.club.id, from, to, month);
    const total = rows.reduce(
      (sum, row) => {
        sum.km += row.km;
        sum.times += row.times;
        sum.durationSec += row.durationSec;
        sum.runSec += row.runSec;
        sum.runKm += row.runKm;
        return sum;
      },
      { km: 0, times: 0, durationSec: 0, runSec: 0, runKm: 0 }
    );
    return {
      title,
      kind,
      month,
      rows: rows.map(({ durationSec, runSec, runKm, ...row }) => row),
      total: {
        km: round2(total.km),
        times: total.times,
        dayText: String(total.times),
        durationLabel: shortDuration(total.durationSec),
        paceLabel: total.runKm > 0 ? paceLabel(Math.round(total.runSec / total.runKm)) : "",
        flag: "-"
      }
    };
  }

  app.get(BASE + "/api/clubs/:id/mileage/report", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const report = reportOf(ctx, req.query);
    if (report.error) return res.status(400).json({ error: report.error });
    res.json(report);
  });

  app.get(BASE + "/api/clubs/:id/mileage/export", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    if (!ctx.owner) return res.status(403).json({ error: "只有团长可以导出" });
    const report = reportOf(ctx, req.query);
    if (report.error) return res.status(400).json({ error: report.error });
    let rows = report.rows;
    if (req.query.empty === "1") {
      const have = new Set(rows.map((row) => row.userId));
      const rest = ctx.db
        .prepare("SELECT u.id, u.nickname FROM club_members m JOIN users u ON u.id = m.user_id WHERE m.club_id = ? ORDER BY u.id")
        .all(ctx.club.id)
        .filter((row) => !have.has(row.id));
      rows = rows.concat(
        rest.map((row) => ({
          place: "",
          nickname: row.nickname,
          km: 0,
          dayText: "0/0",
          durationLabel: "0:00",
          paceLabel: "",
          flag: report.month ? "未设" : "-"
        }))
      );
    }
    const header = ["排名", "姓名", "跑量", "天/次数", "时长", "配速", "Flag"];
    const lines = [header.join(",")];
    for (const row of rows) {
      lines.push([row.place, row.nickname, row.km, row.dayText, row.durationLabel, row.paceLabel, row.flag || "-"].map(csvCell).join(","));
    }
    lines.push(["", "合计", report.total.km, report.total.dayText, report.total.durationLabel, report.total.paceLabel, "-"].map(csvCell).join(","));
    const text = lines.join("\n");
    if (req.query.json === "1") return res.json({ text });
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", "attachment; filename=\"mileage.csv\"; filename*=UTF-8''" + encodeURIComponent("跑量.csv"));
    res.send("\uFEFF" + text);
  });
}

module.exports = { mountMileage };
