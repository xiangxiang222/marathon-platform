const fs = require("fs");
const path = require("path");
const { parseClock, formatClock } = require("./career");
const { memberRole } = require("./roles");

const PHOTO_MAX = 8 * 1024 * 1024;
const DISTANCE_ORDER = ["full", "half", "10k", "5k", "other"];
const CALL_LABEL = { full: "全马", half: "半马", "10k": "10公里", "5k": "5公里" };
const FEE_ORDER = ["paid", "waived", "pending", "unpaid"];
const FEE_LABEL = { paid: "已交", waived: "免交", pending: "待确认", unpaid: "未交" };

function mediaRoot() {
  return process.env.MARATHON_MEDIA || path.join(__dirname, "../data/media");
}

function validDay(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function addDays(day, count) {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + count));
  const pad = (n) => String(n).padStart(2, "0");
  return next.getUTCFullYear() + "-" + pad(next.getUTCMonth() + 1) + "-" + pad(next.getUTCDate());
}

function validDeadline(text) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) && validDay(text.slice(0, 10));
}

function deadlinePassed(text) {
  const ms = Date.parse(text + ":00+08:00");
  return !Number.isNaN(ms) && Date.now() > ms;
}

function deadlineLabel(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text || "");
  if (!match) return text || "";
  return Number(match[2]) + "月" + Number(match[3]) + "日 " + match[4] + ":" + match[5];
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

function viewer(req, userFrom, getDb) {
  const direct = userFrom(req);
  if (direct) return direct;
  const token = String(req.query.t || "");
  if (!token) return null;
  return getDb().prepare("SELECT id, nickname, leader FROM users WHERE token = ?").get(token) || null;
}

function gate(req, res, userFrom, getDb) {
  const user = viewer(req, userFrom, getDb);
  if (!user) {
    res.status(401).json({ error: "请先登录" });
    return null;
  }
  const club = getDb().prepare("SELECT id, name, code, owner_id FROM clubs WHERE id = ?").get(req.params.id);
  if (!club) {
    res.status(404).json({ error: "没有这个跑团" });
    return null;
  }
  const member = getDb().prepare("SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?").get(club.id, user.id);
  if (!member) {
    res.status(403).json({ error: "你不在这个跑团里" });
    return null;
  }
  return { user, club, db: getDb() };
}

function isStaff(ctx) {
  const role = memberRole(ctx.db, ctx.club, ctx.user.id);
  return role === "owner" || role === "manager";
}

function isOwner(ctx) {
  return memberRole(ctx.db, ctx.club, ctx.user.id) === "owner";
}

function feeBlocksSignup(db, clubId, userId) {
  const period = db.prepare("SELECT id, block_signup FROM fee_periods WHERE club_id = ? AND open = 1").get(clubId);
  if (!period || !period.block_signup) return "";
  const row = db.prepare("SELECT status FROM fee_records WHERE period_id = ? AND user_id = ?").get(period.id, userId);
  const status = row ? row.status : "unpaid";
  if (status === "paid" || status === "waived") return "";
  return "会费还没确认，暂时不能报名";
}

function feePeople(db, clubId, period) {
  const memberSource = period.open
    ? "SELECT user_id FROM club_members WHERE club_id = @clubId"
    : "SELECT user_id FROM fee_records WHERE period_id = @periodId";
  return db
    .prepare(
      `SELECT u.id AS userId, u.nickname, COALESCE(r.status, 'unpaid') AS status,
              CASE WHEN @open THEN 0 ELSE COALESCE(r.departed, 0) END AS departed
       FROM (${memberSource}) ids
       JOIN users u ON u.id = ids.user_id
       LEFT JOIN fee_records r ON r.period_id = @periodId AND r.user_id = u.id
       ORDER BY u.nickname`
    )
    .all({ clubId, periodId: period.id, open: period.open ? 1 : 0 });
}

function feeCopy(people) {
  const paid = [];
  const unpaid = [];
  for (const person of people) {
    const name = person.nickname + (person.departed ? "（已离团）" : "");
    if (person.status === "paid") paid.push(name);
    else if (person.status === "waived") paid.push(name + "（免交）");
    else if (person.status === "pending") unpaid.push(name + "（待确认）");
    else unpaid.push(name);
  }
  return "已交：" + (paid.join("、") || "无") + "\n未交：" + (unpaid.join("、") || "无");
}

function presentPeriod(db, clubId, period, userId) {
  const people = feePeople(db, clubId, period);
  const mineRow = people.find((person) => person.userId === userId);
  const mineStatus = mineRow ? mineRow.status : period.open ? "unpaid" : "";
  const groups = FEE_ORDER.map((status) => ({
    status,
    label: FEE_LABEL[status],
    people: people
      .filter((person) => person.status === status)
      .sort((a, b) => a.nickname.localeCompare(b.nickname, "zh"))
      .map((person) => ({ userId: person.userId, nickname: person.nickname, departed: Boolean(person.departed) }))
  }));
  return {
    id: period.id,
    name: period.name,
    amount: period.amount,
    startsOn: period.starts_on,
    endsOn: period.ends_on,
    note: period.note,
    blockSignup: Boolean(period.block_signup),
    open: Boolean(period.open),
    mine: { status: mineStatus, label: mineRow ? FEE_LABEL[mineStatus] || "未交" : period.open ? "未交" : "未列入本期" },
    groups,
    copyText: feeCopy(people)
  };
}

function readFeeInput(body) {
  const name = String((body && body.name) || "").trim();
  const amount = Number(body && body.amount);
  const startsOn = String((body && body.startsOn) || "").trim();
  const endsOn = String((body && body.endsOn) || "").trim();
  const note = String((body && body.note) || "").trim();
  const blockSignup = Boolean(body && body.blockSignup);
  if (!name || name.length > 20) return { error: "会费名称用 1 到 20 个字" };
  if (!Number.isInteger(amount) || amount < 1 || amount > 10000) return { error: "金额写成 1 到 10000 的整数" };
  if (!validDay(startsOn) || !validDay(endsOn)) return { error: "日期写成 2026-01-01" };
  if (endsOn < startsOn) return { error: "结束不能早于开始" };
  if (note.length > 200) return { error: "说明最多 200 个字" };
  return { name, amount, startsOn, endsOn, note, blockSignup };
}

function distanceLabel(distance, km) {
  if (distance === "other") {
    const n = Number(km);
    const text = Number.isInteger(n) ? String(n) : String(n);
    return text + "公里";
  }
  return CALL_LABEL[distance] || distance;
}

function parseKm(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

function callDistances(call) {
  const list = String(call.distances || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => CALL_LABEL[item]);
  if (call.other_km != null) list.push("other");
  return list;
}

function oldSeconds(db, call, row) {
  const userId = row.userId || row.user_id;
  const times = [];
  if (row.replaced_seconds != null) times.push(row.replaced_seconds);
  if (row.distance === "other") {
    const prev = db
      .prepare(
        `SELECT r.seconds FROM result_call_rows r
         JOIN result_calls c ON c.id = r.call_id
         WHERE c.club_id = ? AND c.other_km = ? AND r.user_id = ? AND r.distance = 'other' AND r.call_id != ?`
      )
      .all(call.club_id, call.other_km, userId, call.id);
    for (const item of prev) times.push(item.seconds);
    return times;
  }
  const results = db.prepare("SELECT race_id, seconds FROM results WHERE user_id = ? AND distance = ?").all(userId, row.distance);
  let mirrored = false;
  for (const item of results) {
    if (call.race_id && item.race_id === call.race_id && item.seconds === row.seconds && !mirrored) {
      mirrored = true;
      continue;
    }
    times.push(item.seconds);
  }
  const prev = db
    .prepare(
      `SELECT r.seconds FROM result_call_rows r
       JOIN result_calls c ON c.id = r.call_id
       WHERE c.club_id = ? AND r.user_id = ? AND r.distance = ? AND r.call_id != ?`
    )
    .all(call.club_id, userId, row.distance, call.id);
  for (const item of prev) times.push(item.seconds);
  return times;
}

function rowTag(db, call, row) {
  const old = oldSeconds(db, call, row);
  if (old.length && row.seconds < Math.min(...old)) return "PB";
  if (old.length) return "";
  if (Number(row.debut) === 0) return "";
  return "首次";
}

function syncCareer(db, call, userId, removed) {
  if (!call.race_id) return;
  const race = db.prepare("SELECT distances FROM races WHERE id = ?").get(call.race_id);
  if (!race) return;
  const allowed = new Set(String(race.distances || "").split(","));
  const rows = db
    .prepare(
      `SELECT distance, seconds FROM result_call_rows
       WHERE call_id = ? AND user_id = ? AND distance IN ('full', 'half', '10k', '5k')
       ORDER BY updated_at DESC, id DESC`
    )
    .all(call.id, userId)
    .filter((row) => allowed.has(row.distance));
  const latest = new Map();
  for (const row of rows) {
    if (!latest.has(row.distance)) latest.set(row.distance, row);
  }
  const now = new Date().toISOString();
  if (latest.size) {
    const upsert = db.prepare(
      `INSERT INTO results (user_id, race_id, distance, seconds, story, updated_at, source_call_id) VALUES (?, ?, ?, ?, '', ?, ?)
       ON CONFLICT(user_id, race_id, distance) DO UPDATE SET
         seconds = excluded.seconds,
         updated_at = excluded.updated_at
       WHERE results.source_call_id = excluded.source_call_id`
    );
    for (const row of latest.values()) upsert.run(userId, call.race_id, row.distance, row.seconds, now, call.id);
    db.prepare(
      `INSERT INTO plans (user_id, race_id, status, updated_at) VALUES (?, ?, '完赛', ?)
       ON CONFLICT(user_id, race_id) DO UPDATE SET status = '完赛', updated_at = excluded.updated_at`
    ).run(userId, call.race_id, now);
  }
  if (removed && !latest.has(removed.distance)) {
    const existing = db
      .prepare("SELECT source_call_id, proof, story FROM results WHERE user_id = ? AND race_id = ? AND distance = ?")
      .get(userId, call.race_id, removed.distance);
    if (existing && existing.source_call_id === call.id) {
      if (existing.proof || existing.story) {
        // A personally added proof or story turns the imported result into a
        // personal record. Club operations cannot remove those private assets.
        db.prepare("UPDATE results SET source_call_id = 0 WHERE user_id = ? AND race_id = ? AND distance = ?").run(userId, call.race_id, removed.distance);
      } else {
        const fallback = db.prepare(
          `SELECT rr.seconds, rr.call_id FROM result_call_rows rr
           JOIN result_calls c ON c.id = rr.call_id
           WHERE rr.user_id = ? AND c.race_id = ? AND rr.distance = ?
           ORDER BY rr.updated_at DESC, rr.id DESC LIMIT 1`
        ).get(userId, call.race_id, removed.distance);
        if (fallback) db.prepare("UPDATE results SET seconds = ?, source_call_id = ?, updated_at = ? WHERE user_id = ? AND race_id = ? AND distance = ?").run(fallback.seconds, fallback.call_id, now, userId, call.race_id, removed.distance);
        else db.prepare("DELETE FROM results WHERE user_id = ? AND race_id = ? AND distance = ?").run(userId, call.race_id, removed.distance);
      }
    }
  }
}

function presentCall(db, call, userId) {
  const distances = callDistances(call);
  const club = db.prepare("SELECT id, owner_id FROM clubs WHERE id = ?").get(call.club_id);
  const role = club ? memberRole(db, club, userId) : "";
  const staff = role === "owner" || role === "manager";
  const rows = db
    .prepare(
      `SELECT r.id, r.user_id AS userId, u.nickname, r.distance, r.seconds, r.filename, r.staff_filled AS staffFilled,
              r.debut, r.replaced_seconds, r.updated_at
       FROM result_call_rows r
       JOIN users u ON u.id = r.user_id
       WHERE r.call_id = ?
       ORDER BY r.seconds, u.nickname`
    )
    .all(call.id);
  const tagged = rows.map((row) => {
    const { filename, ...visibleRow } = row;
    return {
      ...visibleRow,
      clock: formatClock(row.seconds),
      distanceLabel: distanceLabel(row.distance, call.other_km),
      tag: rowTag(db, call, row),
      staffFilled: Boolean(row.staffFilled),
      hasSheet: Boolean(filename) && (staff || row.userId === userId),
      mine: row.userId === userId
    };
  });
  const pbs = tagged
    .filter((row) => row.tag === "PB")
    .sort(
      (a, b) =>
        DISTANCE_ORDER.indexOf(a.distance) - DISTANCE_ORDER.indexOf(b.distance) ||
        a.seconds - b.seconds ||
        a.nickname.localeCompare(b.nickname, "zh")
    );
  const summary = pbs.length
    ? "这次 PB：" + pbs.map((row) => row.nickname + " " + row.distanceLabel + " " + row.clock).join("，")
    : "这次没有新的 PB";
  const groups = DISTANCE_ORDER.filter((distance) => tagged.some((row) => row.distance === distance)).map((distance) => {
    const people = tagged
      .filter((row) => row.distance === distance)
      .sort((a, b) => a.seconds - b.seconds || a.nickname.localeCompare(b.nickname, "zh"));
    return {
      distance,
      label: distanceLabel(distance, call.other_km),
      rows: people.map((row, index) => ({ ...row, place: index + 1 }))
    };
  });
  const boardLines = [call.title, summary];
  for (const group of groups) {
    boardLines.push(group.label);
    for (const row of group.rows) {
      boardLines.push(row.place + " " + row.nickname + " " + row.clock + (row.tag ? " " + row.tag : "") + (row.staffFilled ? " 管理员补录" : ""));
    }
  }
  const members = db
    .prepare(
      `SELECT u.id, u.nickname FROM club_members m JOIN users u ON u.id = m.user_id
       WHERE m.club_id = ? ORDER BY u.nickname`
    )
    .all(call.club_id);
  return {
    id: call.id,
    raceId: call.race_id,
    title: call.title,
    raceDate: call.race_date,
    distances,
    otherKm: call.other_km,
    deadline: call.deadline,
    deadlineLabel: deadlineLabel(call.deadline),
    closed: deadlinePassed(call.deadline),
    note: call.note,
    summary,
    groups,
    filled: new Set(tagged.map((row) => row.userId)).size,
    shareText: call.club_name + " · " + call.title + "成绩\n打开跑团的「成绩统计」填写，格式 1:32:10。\n截止 " + deadlineLabel(call.deadline) + "。填完后全团都能看。",
    boardText: boardLines.join("\n"),
    members: members.map((member) => ({ id: member.id, nickname: member.nickname }))
  };
}

function loadCall(db, clubId, callId) {
  return db
    .prepare(
      `SELECT c.*, clubs.name AS club_name
       FROM result_calls c
       JOIN clubs ON clubs.id = c.club_id
       WHERE c.id = ? AND c.club_id = ?`
    )
    .get(callId, clubId);
}

function savePhoto(buffer, dir, filename) {
  const photo = sniffPhoto(buffer);
  if (!photo) return { error: "只收 jpg、png、webp", status: 400 };
  if (buffer.length > PHOTO_MAX) return { error: "照片不超过 8MB", status: 413 };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer);
  return photo;
}

function mountClubOps(app, { BASE, getDb, userFrom }) {
  app.get(BASE + "/api/clubs/:id/fees", (req, res) => {
    const ctx = gate(req, res, userFrom, getDb);
    if (!ctx) return;
    const rows = ctx.db.prepare("SELECT * FROM fee_periods WHERE club_id = ? ORDER BY id DESC").all(ctx.club.id);
    const current = rows.find((row) => row.open);
    res.json({
      current: current ? presentPeriod(ctx.db, ctx.club.id, current, ctx.user.id) : null,
      history: rows.map((row) => ({
        id: row.id,
        name: row.name,
        startsOn: row.starts_on,
        endsOn: row.ends_on,
        open: Boolean(row.open)
      }))
    });
  });

  app.get(BASE + "/api/clubs/:id/fees/:pid", (req, res) => {
    const ctx = gate(req, res, userFrom, getDb);
    if (!ctx) return;
    const period = ctx.db.prepare("SELECT * FROM fee_periods WHERE id = ? AND club_id = ?").get(req.params.pid, ctx.club.id);
    if (!period) return res.status(404).json({ error: "没有这一期会费" });
    res.json({ period: presentPeriod(ctx.db, ctx.club.id, period, ctx.user.id) });
  });

  app.post(BASE + "/api/clubs/:id/fees", (req, res) => {
    const ctx = gate(req, res, userFrom, getDb);
    if (!ctx) return;
    if (!isOwner(ctx)) return res.status(403).json({ error: "只有团长可以改会费" });
    const input = readFeeInput(req.body);
    if (input.error) return res.status(400).json({ error: input.error });
    const now = new Date().toISOString();
    const info = ctx.db.transaction(() => {
      const current = ctx.db.prepare("SELECT id FROM fee_periods WHERE club_id = ? AND open = 1").get(ctx.club.id);
      if (current) {
        ctx.db.prepare(
          `INSERT OR IGNORE INTO fee_records (period_id, user_id, status, updated_at)
           SELECT ?, user_id, 'unpaid', ? FROM club_members WHERE club_id = ?`
        ).run(current.id, now, ctx.club.id);
        ctx.db.prepare(
          `UPDATE fee_records
           SET departed = CASE WHEN EXISTS (
             SELECT 1 FROM club_members m WHERE m.club_id = ? AND m.user_id = fee_records.user_id
           ) THEN 0 ELSE 1 END
           WHERE period_id = ?`
        ).run(ctx.club.id, current.id);
      }
      ctx.db.prepare("UPDATE fee_periods SET open = 0 WHERE club_id = ? AND open = 1").run(ctx.club.id);
      return ctx.db
        .prepare(
          `INSERT INTO fee_periods (club_id, name, amount, starts_on, ends_on, note, qr_filename, block_signup, open, created_at)
           VALUES (?, ?, ?, ?, ?, ?, '', ?, 1, ?)`
        )
        .run(ctx.club.id, input.name, input.amount, input.startsOn, input.endsOn, input.note, input.blockSignup ? 1 : 0, now);
    })();
    const period = ctx.db.prepare("SELECT * FROM fee_periods WHERE id = ?").get(info.lastInsertRowid);
    res.json({ period: presentPeriod(ctx.db, ctx.club.id, period, ctx.user.id) });
  });

  app.put(BASE + "/api/clubs/:id/fees/:pid", (req, res) => {
    const ctx = gate(req, res, userFrom, getDb);
    if (!ctx) return;
    if (!isOwner(ctx)) return res.status(403).json({ error: "只有团长可以改会费" });
    const period = ctx.db.prepare("SELECT * FROM fee_periods WHERE id = ? AND club_id = ?").get(req.params.pid, ctx.club.id);
    if (!period) return res.status(404).json({ error: "没有这一期会费" });
    if (!period.open) return res.status(400).json({ error: "这一期已经结束" });
    const input = readFeeInput(req.body);
    if (input.error) return res.status(400).json({ error: input.error });
    ctx.db
      .prepare("UPDATE fee_periods SET name = ?, amount = ?, starts_on = ?, ends_on = ?, note = ?, block_signup = ? WHERE id = ?")
      .run(input.name, input.amount, input.startsOn, input.endsOn, input.note, input.blockSignup ? 1 : 0, period.id);
    const next = ctx.db.prepare("SELECT * FROM fee_periods WHERE id = ?").get(period.id);
    res.json({ period: presentPeriod(ctx.db, ctx.club.id, next, ctx.user.id) });
  });

  app.post(BASE + "/api/clubs/:id/fees/:pid/records", (req, res) => {
    const ctx = gate(req, res, userFrom, getDb);
    if (!ctx) return;
    if (!isStaff(ctx)) return res.status(403).json({ error: "只有团长或跑团管理可以改" });
    const period = ctx.db.prepare("SELECT * FROM fee_periods WHERE id = ? AND club_id = ?").get(req.params.pid, ctx.club.id);
    if (!period) return res.status(404).json({ error: "没有这一期会费" });
    if (!period.open) return res.status(400).json({ error: "这一期已经结束" });
    const userId = Number(req.body && req.body.userId);
    const status = String((req.body && req.body.status) || "");
    const allowed = { paid: "paid", unpaid: "unpaid", waived: "waived" };
    if (!allowed[status]) return res.status(400).json({ error: "没有这个状态" });
    const member = ctx.db.prepare("SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?").get(ctx.club.id, userId);
    if (!member) return res.status(404).json({ error: "团里没有这个人" });
    ctx.db
      .prepare(
        `INSERT INTO fee_records (period_id, user_id, status, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(period_id, user_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`
      )
      .run(period.id, userId, allowed[status], new Date().toISOString());
    const next = ctx.db.prepare("SELECT * FROM fee_periods WHERE id = ?").get(period.id);
    res.json({ period: presentPeriod(ctx.db, ctx.club.id, next, ctx.user.id) });
  });

  app.get(BASE + "/api/clubs/:id/calls", (req, res) => {
    const ctx = gate(req, res, userFrom, getDb);
    if (!ctx) return;
    const rows = ctx.db.prepare("SELECT * FROM result_calls WHERE club_id = ? ORDER BY id DESC").all(ctx.club.id);
    res.json({
      calls: rows.map((row) => {
        const filled = ctx.db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM result_call_rows WHERE call_id = ?").get(row.id);
        return {
          id: row.id,
          title: row.title,
          raceId: row.race_id,
          raceDate: row.race_date,
          deadline: row.deadline,
          deadlineLabel: deadlineLabel(row.deadline),
          closed: deadlinePassed(row.deadline),
          filled: filled.n
        };
      })
    });
  });

  app.post(BASE + "/api/clubs/:id/calls", (req, res) => {
    const ctx = gate(req, res, userFrom, getDb);
    if (!ctx) return;
    if (!isStaff(ctx)) return res.status(403).json({ error: "只有团长或跑团管理可以改" });
    const body = req.body || {};
    const raceId = String(body.raceId || "").trim();
    let title = String(body.title || "").trim();
    let raceDate = String(body.raceDate || "").trim();
    let race = null;
    if (raceId) {
      race = ctx.db.prepare("SELECT id, name, race_date, distances FROM races WHERE id = ?").get(raceId);
      if (!race) return res.status(404).json({ error: "没有这场比赛" });
      if (!title) title = race.name;
      if (!raceDate) raceDate = race.race_date;
    }
    if (!title || title.length > 80) return res.status(400).json({ error: "先选一场比赛，或写上名称" });
    if (!validDay(raceDate)) return res.status(400).json({ error: "比赛日写成 2026-11-15" });
    let picked = Array.isArray(body.distances) ? body.distances.map((item) => String(item)) : [];
    if (!picked.length && race) picked = String(race.distances || "").split(",").filter((item) => CALL_LABEL[item]);
    picked = [...new Set(picked.filter((item) => CALL_LABEL[item]))];
    const otherKm = body.otherKm == null || body.otherKm === "" ? null : parseKm(body.otherKm);
    if (body.otherKm != null && body.otherKm !== "" && otherKm == null) return res.status(400).json({ error: "其他距离写成 1 到 100 公里" });
    if (!picked.length && otherKm == null) return res.status(400).json({ error: "至少选一个距离" });
    let deadline = String(body.deadline || "").trim().replace(" ", "T");
    if (!deadline) deadline = addDays(raceDate, 7) + "T22:00";
    if (!validDeadline(deadline)) return res.status(400).json({ error: "截止写成 2026-11-22 22:00" });
    const note = String(body.note || "").trim();
    if (note.length > 100) return res.status(400).json({ error: "说明最多 100 个字" });
    const info = ctx.db
      .prepare(
        `INSERT INTO result_calls (club_id, race_id, title, race_date, distances, other_km, deadline, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(ctx.club.id, race ? race.id : "", title, raceDate, picked.join(","), otherKm, deadline, note, new Date().toISOString());
    const call = loadCall(ctx.db, ctx.club.id, info.lastInsertRowid);
    res.json({ call: presentCall(ctx.db, call, ctx.user.id) });
  });

  app.get(BASE + "/api/clubs/:id/calls/:cid", (req, res) => {
    const ctx = gate(req, res, userFrom, getDb);
    if (!ctx) return;
    const call = loadCall(ctx.db, ctx.club.id, req.params.cid);
    if (!call) return res.status(404).json({ error: "没有这次统计" });
    res.json({ call: presentCall(ctx.db, call, ctx.user.id) });
  });

  app.put(BASE + "/api/clubs/:id/calls/:cid", (req, res) => {
    const ctx = gate(req, res, userFrom, getDb);
    if (!ctx) return;
    if (!isStaff(ctx)) return res.status(403).json({ error: "只有团长或跑团管理可以改" });
    const call = loadCall(ctx.db, ctx.club.id, req.params.cid);
    if (!call) return res.status(404).json({ error: "没有这次统计" });
    const deadline = String((req.body && req.body.deadline) || "").trim().replace(" ", "T");
    const note = req.body && req.body.note != null ? String(req.body.note).trim() : call.note;
    if (!validDeadline(deadline)) return res.status(400).json({ error: "截止写成 2026-11-22 22:00" });
    if (note.length > 100) return res.status(400).json({ error: "说明最多 100 个字" });
    ctx.db.prepare("UPDATE result_calls SET deadline = ?, note = ? WHERE id = ?").run(deadline, note, call.id);
    const next = loadCall(ctx.db, ctx.club.id, call.id);
    res.json({ call: presentCall(ctx.db, next, ctx.user.id) });
  });

  app.post(BASE + "/api/clubs/:id/calls/:cid/rows", (req, res) => {
    const ctx = gate(req, res, userFrom, getDb);
    if (!ctx) return;
    const call = loadCall(ctx.db, ctx.club.id, req.params.cid);
    if (!call) return res.status(404).json({ error: "没有这次统计" });
    const staff = isStaff(ctx);
    if (deadlinePassed(call.deadline) && !staff) return res.status(400).json({ error: "已经截止" });
    const distance = String((req.body && req.body.distance) || "");
    const allowed = callDistances(call);
    if (!allowed.includes(distance)) return res.status(400).json({ error: "这次没有这个距离" });
    const seconds = parseClock(req.body && req.body.time);
    if (seconds == null) return res.status(400).json({ error: "成绩写成 45:30 或 3:29:59" });
    let userId = ctx.user.id;
    let staffFilled = 0;
    if (req.body && req.body.userId != null && Number(req.body.userId) !== ctx.user.id) {
      if (!staff) return res.status(403).json({ error: "只能填自己的成绩" });
      userId = Number(req.body.userId);
      const member = ctx.db.prepare("SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?").get(ctx.club.id, userId);
      if (!member) return res.status(404).json({ error: "团里没有这个人" });
      staffFilled = 1;
    }
    const now = new Date().toISOString();
    ctx.db.transaction(() => {
      const existingResult = call.race_id
        ? ctx.db.prepare("SELECT distance, seconds FROM results WHERE user_id = ? AND race_id = ? AND distance = ?").get(userId, call.race_id, distance)
        : null;
      const current = ctx.db
        .prepare("SELECT replaced_seconds FROM result_call_rows WHERE call_id = ? AND user_id = ? AND distance = ?")
        .get(call.id, userId, distance);
      let replaced = current ? current.replaced_seconds : null;
      let debut = 1;
      if (existingResult && existingResult.distance === distance) {
        debut = 0;
        if (replaced == null && existingResult.seconds !== seconds) replaced = existingResult.seconds;
      }
      ctx.db
        .prepare(
          `INSERT INTO result_call_rows (call_id, user_id, distance, seconds, filename, staff_filled, debut, replaced_seconds, updated_at)
           VALUES (?, ?, ?, ?, '', ?, ?, ?, ?)
           ON CONFLICT(call_id, user_id, distance) DO UPDATE SET
             seconds = excluded.seconds,
             staff_filled = CASE WHEN excluded.staff_filled = 1 THEN 1 ELSE result_call_rows.staff_filled END,
             replaced_seconds = COALESCE(result_call_rows.replaced_seconds, excluded.replaced_seconds),
             updated_at = excluded.updated_at`
        )
        .run(call.id, userId, distance, seconds, staffFilled, debut, replaced, now);
      syncCareer(ctx.db, call, userId);
    })();
    const next = loadCall(ctx.db, ctx.club.id, call.id);
    res.json({ call: presentCall(ctx.db, next, ctx.user.id) });
  });

  app.delete(BASE + "/api/clubs/:id/calls/:cid/rows/:rid", (req, res) => {
    const ctx = gate(req, res, userFrom, getDb);
    if (!ctx) return;
    const call = loadCall(ctx.db, ctx.club.id, req.params.cid);
    if (!call) return res.status(404).json({ error: "没有这次统计" });
    const row = ctx.db.prepare("SELECT * FROM result_call_rows WHERE id = ? AND call_id = ?").get(req.params.rid, call.id);
    if (!row) return res.status(404).json({ error: "没有这条成绩" });
    const staff = isStaff(ctx);
    if (row.user_id !== ctx.user.id && !staff) return res.status(403).json({ error: "只能删自己的成绩" });
    if (deadlinePassed(call.deadline) && !staff) return res.status(400).json({ error: "已经截止" });
    ctx.db.transaction(() => {
      ctx.db.prepare("DELETE FROM result_call_rows WHERE id = ?").run(row.id);
      syncCareer(ctx.db, call, row.user_id, { distance: row.distance, seconds: row.seconds });
    })();
    if (row.filename) {
      const file = path.join(mediaRoot(), "calls", row.filename);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    const next = loadCall(ctx.db, ctx.club.id, call.id);
    res.json({ call: presentCall(ctx.db, next, ctx.user.id) });
  });

  app.post(BASE + "/api/clubs/:id/calls/:cid/rows/:rid/sheet", async (req, res) => {
    const ctx = gate(req, res, userFrom, getDb);
    if (!ctx) return;
    const call = loadCall(ctx.db, ctx.club.id, req.params.cid);
    if (!call) return res.status(404).json({ error: "没有这次统计" });
    const row = ctx.db.prepare("SELECT * FROM result_call_rows WHERE id = ? AND call_id = ?").get(req.params.rid, call.id);
    if (!row) return res.status(404).json({ error: "没有这条成绩" });
    if (row.user_id !== ctx.user.id && !isStaff(ctx)) return res.status(403).json({ error: "只能给自己的成绩加截图" });
    let buffer;
    try {
      buffer = oneFile(await readBody(req, PHOTO_MAX + 64 * 1024), req.get("content-type"));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.status === 413 ? "照片不超过 8MB" : "没有读到文件" });
    }
    if (!buffer || !buffer.length) return res.status(400).json({ error: "没有读到文件" });
    const photo = sniffPhoto(buffer);
    if (!photo) return res.status(400).json({ error: "只收 jpg、png、webp" });
    if (buffer.length > PHOTO_MAX) return res.status(413).json({ error: "照片不超过 8MB" });
    const filename = row.id + "." + photo.ext;
    const dir = path.join(mediaRoot(), "calls");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buffer);
    if (row.filename && row.filename !== filename) {
      const old = path.join(dir, row.filename);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    ctx.db.prepare("UPDATE result_call_rows SET filename = ? WHERE id = ?").run(filename, row.id);
    const next = loadCall(ctx.db, ctx.club.id, call.id);
    res.json({ call: presentCall(ctx.db, next, ctx.user.id) });
  });

  app.get(BASE + "/api/call-sheets/:rid", (req, res) => {
    const user = viewer(req, userFrom, getDb);
    if (!user) return res.status(401).json({ error: "请先登录" });
    const row = getDb()
      .prepare(
        `SELECT r.filename, r.user_id, club.id AS club_id, club.owner_id
         FROM result_call_rows r
         JOIN result_calls call ON call.id = r.call_id
         JOIN clubs club ON club.id = call.club_id
         WHERE r.id = ?`
      )
      .get(req.params.rid);
    if (!row || !row.filename) return res.status(404).json({ error: "没有这张截图" });
    const role = memberRole(getDb(), { id: row.club_id, owner_id: row.owner_id }, user.id);
    if (!role) return res.status(403).json({ error: "你不在这个跑团里" });
    if (row.user_id !== user.id && role !== "owner" && role !== "manager") return res.status(403).json({ error: "成绩截图只对本人和跑团管理开放" });
    const file = path.join(mediaRoot(), "calls", path.basename(row.filename));
    if (!fs.existsSync(file)) return res.status(404).json({ error: "没有这张截图" });
    const photo = sniffPhoto(fs.readFileSync(file));
    res.set("Content-Type", photo ? photo.mime : "application/octet-stream");
    res.set("Cache-Control", "private, max-age=3600");
    fs.createReadStream(file).pipe(res);
  });
}

module.exports = { mountClubOps, feeBlocksSignup };
