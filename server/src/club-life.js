const fs = require("fs");
const path = require("path");
const { DISTANCE_LABEL } = require("./races");
const { formatClock } = require("./career");

const PHOTO_MAX = 8 * 1024 * 1024;
const VIDEO_MAX = 40 * 1024 * 1024;
const MEDIA_MAX = 30;

function mediaRoot() {
  return process.env.MARATHON_MEDIA || path.join(__dirname, "../data/media");
}

function ruleText(row) {
  if (!row.points) return "这场不记积分。";
  return `满 ${row.min_people} 人打卡，且每人不少于 ${row.min_km} 公里，才各得 ${row.points} 分。人数不够，这场不计分。`;
}

function presentActivity(row, extra) {
  return {
    id: row.id,
    title: row.title,
    place: row.place,
    startsAt: row.starts_at,
    note: row.note,
    minKm: row.min_km,
    minPeople: row.min_people,
    points: row.points,
    rule: ruleText(row),
    ...extra
  };
}

function balanceOf(db, clubId, userId) {
  const row = db.prepare("SELECT COALESCE(SUM(delta), 0) AS points FROM point_entries WHERE club_id = ? AND user_id = ?").get(clubId, userId);
  return row.points;
}

function settle(db, activity) {
  const checks = db.prepare("SELECT user_id, km FROM activity_checks WHERE activity_id = ?").all(activity.id);
  const signed = new Set(db.prepare("SELECT user_id FROM activity_signups WHERE activity_id = ?").all(activity.id).map((row) => row.user_id));
  const qualified = checks.filter((row) => signed.has(row.user_id) && row.km + 1e-9 >= activity.min_km);
  const open = activity.points > 0 && qualified.length >= activity.min_people;
  const want = new Set(open ? qualified.map((row) => row.user_id) : []);
  const prefix = "act:" + activity.id + ":";
  const existing = db.prepare("SELECT id, user_id, ref_key FROM point_entries WHERE club_id = ? AND ref_key LIKE ?").all(activity.club_id, prefix + "%");
  const have = new Set();
  for (const row of existing) {
    const userId = Number(row.ref_key.slice(prefix.length));
    if (!want.has(userId)) db.prepare("DELETE FROM point_entries WHERE id = ?").run(row.id);
    else have.add(userId);
  }
  if (!open) return { qualified: qualified.length, awarded: false };
  const now = new Date().toISOString();
  const insert = db.prepare(
    "INSERT INTO point_entries (club_id, user_id, delta, reason, ref_key, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const userId of want) {
    if (have.has(userId)) continue;
    insert.run(activity.club_id, userId, activity.points, activity.title + " 打卡", prefix + userId, now);
  }
  return { qualified: qualified.length, awarded: true };
}

function activityStats(db, activity, userId) {
  const signups = db.prepare("SELECT user_id, group_id FROM activity_signups WHERE activity_id = ?").all(activity.id);
  const checks = db.prepare("SELECT user_id, km FROM activity_checks WHERE activity_id = ?").all(activity.id);
  const signed = new Set(signups.map((row) => row.user_id));
  const qualified = checks.filter((row) => signed.has(row.user_id) && row.km + 1e-9 >= activity.min_km).length;
  const mineSignup = signups.find((row) => row.user_id === userId);
  const mineCheck = checks.find((row) => row.user_id === userId);
  return {
    signupCount: signups.length,
    checkCount: checks.length,
    qualifiedCount: qualified,
    awarded: activity.points > 0 && qualified >= activity.min_people,
    mine: mineSignup
      ? { signed: true, groupId: mineSignup.group_id, km: mineCheck ? mineCheck.km : null, note: "" }
      : { signed: false, groupId: 0, km: mineCheck ? mineCheck.km : null, note: "" }
  };
}

function enrichBoard(db, clubId, board) {
  if (!board.length) return board;
  const rows = db
    .prepare(
      `SELECT res.user_id, u.nickname, res.race_id, res.distance, res.seconds
       FROM results res
       JOIN users u ON u.id = res.user_id
       JOIN club_members m ON m.user_id = res.user_id AND m.club_id = ?`
    )
    .all(clubId);
  const best = {};
  for (const row of rows) {
    const key = row.user_id + ":" + row.distance;
    if (best[key] == null || row.seconds < best[key]) best[key] = row.seconds;
  }
  for (const item of board) {
    const hits = rows.filter((row) => row.race_id === item.race.id);
    item.results = hits.map((row) => ({
      userId: row.user_id,
      nickname: row.nickname,
      distance: row.distance,
      distanceLabel: DISTANCE_LABEL[row.distance] || row.distance,
      clock: formatClock(row.seconds),
      pb: row.seconds === best[row.user_id + ":" + row.distance]
    }));
    const byUser = {};
    for (const result of item.results) byUser[result.userId] = result;
    for (const mark of item.marks) {
      const result = byUser[mark.userId];
      if (!result) continue;
      mark.clock = result.clock;
      mark.distanceLabel = result.distanceLabel;
      mark.pb = result.pb;
    }
    const tally = {};
    for (const mark of item.marks) tally[mark.status] = (tally[mark.status] || 0) + 1;
    item.tally = tally;
    item.pbCount = item.results.filter((row) => row.pb).length;
  }
  return board;
}

function clubLife(db, club, userId) {
  const groups = db
    .prepare("SELECT id, name, pace, capacity FROM club_groups WHERE club_id = ? ORDER BY sort, id")
    .all(club.id);
  const activities = db
    .prepare("SELECT * FROM activities WHERE club_id = ? ORDER BY starts_at, id")
    .all(club.id)
    .map((row) => presentActivity(row, activityStats(db, row, userId)));
  const gifts = db
    .prepare("SELECT id, name, cost, stock FROM gifts WHERE club_id = ? ORDER BY id DESC")
    .all(club.id);
  const members = db
    .prepare(
      `SELECT u.id, u.nickname, COALESCE(SUM(p.delta), 0) AS points
       FROM club_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN point_entries p ON p.club_id = m.club_id AND p.user_id = m.user_id
       WHERE m.club_id = ?
       GROUP BY u.id
       ORDER BY m.joined_at`
    )
    .all(club.id)
    .map((row) => ({ id: row.id, nickname: row.nickname, points: row.points, owner: row.id === club.owner_id }));
  return {
    club: { id: club.id, name: club.name, code: club.code, owner: club.owner_id === userId },
    members,
    groups,
    activities,
    gifts,
    myPoints: balanceOf(db, club.id, userId)
  };
}

function sniff(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: "photo", ext: "jpg", mime: "image/jpeg" };
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return { kind: "photo", ext: "png", mime: "image/png" };
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { kind: "photo", ext: "webp", mime: "image/webp" };
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (brand.startsWith("qt")) return { kind: "video", ext: "mov", mime: "video/quicktime" };
    return { kind: "video", ext: "mp4", mime: "video/mp4" };
  }
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

function mountClubLife(app, { BASE, getDb, userFrom }) {
  function gate(req, res) {
    const user = userFrom(req);
    if (!user) {
      res.status(401).json({ error: "先起个昵称" });
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

  function ownerOnly(ctx, res) {
    if (ctx.club.owner_id === ctx.user.id) return true;
    res.status(403).json({ error: "只有团长可以改" });
    return false;
  }

  app.post(BASE + "/api/clubs/:id/groups", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !ownerOnly(ctx, res)) return;
    const name = String((req.body && req.body.name) || "").trim();
    const pace = String((req.body && req.body.pace) || "").trim();
    const capacity = Number((req.body && req.body.capacity) || 0);
    if (!name || name.length > 20) return res.status(400).json({ error: "组别名用 1 到 20 个字" });
    if (pace.length > 20) return res.status(400).json({ error: "配速说明最多 20 个字" });
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 500) return res.status(400).json({ error: "名额写成 0 到 500，0 表示不限" });
    const info = ctx.db
      .prepare("INSERT INTO club_groups (club_id, name, pace, capacity, sort) VALUES (?, ?, ?, ?, ?)")
      .run(ctx.club.id, name, pace, capacity, Date.now());
    res.json({ group: { id: Number(info.lastInsertRowid), name, pace, capacity } });
  });

  app.delete(BASE + "/api/clubs/:id/groups/:gid", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !ownerOnly(ctx, res)) return;
    ctx.db.prepare("DELETE FROM club_groups WHERE id = ? AND club_id = ?").run(req.params.gid, ctx.club.id);
    ctx.db.prepare("UPDATE activity_signups SET group_id = 0 WHERE group_id = ?").run(req.params.gid);
    res.json({ ok: true });
  });

  app.delete(BASE + "/api/clubs/:id/members/:uid", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !ownerOnly(ctx, res)) return;
    const uid = Number(req.params.uid);
    if (uid === ctx.club.owner_id) return res.status(400).json({ error: "团长还在团里" });
    const gone = ctx.db.prepare("DELETE FROM club_members WHERE club_id = ? AND user_id = ?").run(ctx.club.id, uid);
    if (!gone.changes) return res.status(404).json({ error: "团里没有这个人" });
    res.json({ ok: true });
  });

  app.post(BASE + "/api/clubs/:id/activities", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !ownerOnly(ctx, res)) return;
    const body = req.body || {};
    const title = String(body.title || "").trim();
    const place = String(body.place || "").trim();
    const startsAt = String(body.startsAt || "").trim().replace(" ", "T");
    const note = String(body.note || "").trim();
    const minKm = body.minKm == null || body.minKm === "" ? 5 : Number(body.minKm);
    const minPeople = body.minPeople == null || body.minPeople === "" ? 3 : Number(body.minPeople);
    const points = body.points == null || body.points === "" ? 1 : Number(body.points);
    if (!title || title.length > 40) return res.status(400).json({ error: "活动名用 1 到 40 个字" });
    if (place.length > 40) return res.status(400).json({ error: "地点最多 40 个字" });
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startsAt)) return res.status(400).json({ error: "时间写成 2026-10-11 05:40" });
    if (note.length > 500) return res.status(400).json({ error: "说明最多 500 个字" });
    if (!Number.isFinite(minKm) || minKm < 0.1 || minKm > 100) return res.status(400).json({ error: "里程门槛在 0.1 到 100 公里" });
    if (!Number.isInteger(minPeople) || minPeople < 1 || minPeople > 500) return res.status(400).json({ error: "成团人数在 1 到 500" });
    if (!Number.isInteger(points) || points < 0 || points > 100) return res.status(400).json({ error: "积分写成 0 到 100" });
    const info = ctx.db
      .prepare(
        `INSERT INTO activities (club_id, title, place, starts_at, note, min_km, min_people, points, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(ctx.club.id, title, place, startsAt, note, minKm, minPeople, points, new Date().toISOString());
    const row = ctx.db.prepare("SELECT * FROM activities WHERE id = ?").get(info.lastInsertRowid);
    res.json({ activity: presentActivity(row, activityStats(ctx.db, row, ctx.user.id)) });
  });

  app.get(BASE + "/api/clubs/:id/activities/:aid", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    const groups = ctx.db.prepare("SELECT id, name, pace, capacity FROM club_groups WHERE club_id = ? ORDER BY sort, id").all(ctx.club.id);
    const signups = ctx.db
      .prepare(
        `SELECT u.id AS userId, u.nickname, s.group_id AS groupId, g.name AS groupName
         FROM activity_signups s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN club_groups g ON g.id = s.group_id
         WHERE s.activity_id = ?
         ORDER BY s.created_at`
      )
      .all(activity.id);
    const checks = ctx.db
      .prepare(
        `SELECT u.nickname, c.user_id AS userId, c.km, c.note
         FROM activity_checks c
         JOIN users u ON u.id = c.user_id
         WHERE c.activity_id = ?
         ORDER BY c.created_at`
      )
      .all(activity.id)
      .map((row) => ({ ...row, counts: row.km + 1e-9 >= activity.min_km }));
    const media = ctx.db
      .prepare(
        `SELECT m.id, m.kind, u.nickname, m.user_id AS userId
         FROM activity_media m
         JOIN users u ON u.id = m.user_id
         WHERE m.activity_id = ?
         ORDER BY m.id`
      )
      .all(activity.id)
      .map((row) => ({ id: row.id, kind: row.kind, nickname: row.nickname, mine: row.userId === ctx.user.id }));
    const counts = {};
    for (const group of groups) counts[group.id] = 0;
    for (const row of signups) if (counts[row.groupId] != null) counts[row.groupId] += 1;
    res.json({
      activity: presentActivity(activity, activityStats(ctx.db, activity, ctx.user.id)),
      groups: groups.map((group) => ({ ...group, signed: counts[group.id] || 0 })),
      signups,
      checks,
      media
    });
  });

  app.post(BASE + "/api/clubs/:id/activities/:aid/signup", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    const groupId = Number((req.body && req.body.groupId) || 0);
    const groups = ctx.db.prepare("SELECT id, capacity FROM club_groups WHERE club_id = ?").all(ctx.club.id);
    if (groups.length && !groups.some((group) => group.id === groupId)) return res.status(400).json({ error: "先选一个组别" });
    if (groupId) {
      const group = groups.find((item) => item.id === groupId);
      if (!group) return res.status(400).json({ error: "没有这个组别" });
      if (group.capacity > 0) {
        const used = ctx.db
          .prepare("SELECT COUNT(*) AS n FROM activity_signups WHERE activity_id = ? AND group_id = ? AND user_id != ?")
          .get(activity.id, groupId, ctx.user.id);
        if (used.n >= group.capacity) return res.status(400).json({ error: "这个组别满了" });
      }
    }
    ctx.db
      .prepare(
        `INSERT INTO activity_signups (activity_id, user_id, group_id, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(activity_id, user_id) DO UPDATE SET group_id = excluded.group_id`
      )
      .run(activity.id, ctx.user.id, groupId, new Date().toISOString());
    res.json({ ok: true, activity: presentActivity(activity, activityStats(ctx.db, activity, ctx.user.id)) });
  });

  app.delete(BASE + "/api/clubs/:id/activities/:aid/signup", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    ctx.db.prepare("DELETE FROM activity_signups WHERE activity_id = ? AND user_id = ?").run(activity.id, ctx.user.id);
    ctx.db.prepare("DELETE FROM activity_checks WHERE activity_id = ? AND user_id = ?").run(activity.id, ctx.user.id);
    settle(ctx.db, activity);
    res.json({ ok: true, activity: presentActivity(activity, activityStats(ctx.db, activity, ctx.user.id)) });
  });

  app.post(BASE + "/api/clubs/:id/activities/:aid/check", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    const signed = ctx.db.prepare("SELECT 1 FROM activity_signups WHERE activity_id = ? AND user_id = ?").get(activity.id, ctx.user.id);
    if (!signed) return res.status(400).json({ error: "先报名，再打卡" });
    const km = Number(req.body && req.body.km);
    const note = String((req.body && req.body.note) || "").trim();
    if (!Number.isFinite(km) || km <= 0 || km > 200) return res.status(400).json({ error: "公里数写成 0 到 200 之间" });
    if (note.length > 40) return res.status(400).json({ error: "一句最多 40 个字" });
    ctx.db
      .prepare(
        `INSERT INTO activity_checks (activity_id, user_id, km, note, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(activity_id, user_id) DO UPDATE SET km = excluded.km, note = excluded.note`
      )
      .run(activity.id, ctx.user.id, Math.round(km * 100) / 100, note, new Date().toISOString());
    const settled = settle(ctx.db, activity);
    res.json({
      ok: true,
      awarded: settled.awarded,
      activity: presentActivity(activity, activityStats(ctx.db, activity, ctx.user.id)),
      myPoints: balanceOf(ctx.db, ctx.club.id, ctx.user.id)
    });
  });

  app.delete(BASE + "/api/clubs/:id/activities/:aid/check", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    ctx.db.prepare("DELETE FROM activity_checks WHERE activity_id = ? AND user_id = ?").run(activity.id, ctx.user.id);
    settle(ctx.db, activity);
    res.json({
      ok: true,
      activity: presentActivity(activity, activityStats(ctx.db, activity, ctx.user.id)),
      myPoints: balanceOf(ctx.db, ctx.club.id, ctx.user.id)
    });
  });

  app.post(BASE + "/api/clubs/:id/gifts", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !ownerOnly(ctx, res)) return;
    const name = String((req.body && req.body.name) || "").trim();
    const cost = Number(req.body && req.body.cost);
    const stock = Number(req.body && req.body.stock);
    if (!name || name.length > 20) return res.status(400).json({ error: "礼品名用 1 到 20 个字" });
    if (!Number.isInteger(cost) || cost < 1 || cost > 100000) return res.status(400).json({ error: "兑换积分写成 1 以上的整数" });
    if (!Number.isInteger(stock) || stock < 1 || stock > 10000) return res.status(400).json({ error: "库存写成 1 到 10000" });
    const info = ctx.db
      .prepare("INSERT INTO gifts (club_id, name, cost, stock, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(ctx.club.id, name, cost, stock, new Date().toISOString());
    res.json({ gift: { id: Number(info.lastInsertRowid), name, cost, stock } });
  });

  app.post(BASE + "/api/clubs/:id/gifts/:gid/redeem", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const run = ctx.db.transaction(() => {
      const gift = ctx.db.prepare("SELECT * FROM gifts WHERE id = ? AND club_id = ?").get(req.params.gid, ctx.club.id);
      if (!gift) return { status: 404, error: "没有这个礼品" };
      if (gift.stock < 1) return { status: 400, error: "已经换完了" };
      const points = balanceOf(ctx.db, ctx.club.id, ctx.user.id);
      if (points < gift.cost) return { status: 400, error: "积分不够" };
      const taken = ctx.db.prepare("UPDATE gifts SET stock = stock - 1 WHERE id = ? AND stock > 0").run(gift.id);
      if (!taken.changes) return { status: 400, error: "已经换完了" };
      const now = new Date().toISOString();
      const info = ctx.db.prepare("INSERT INTO redemptions (gift_id, user_id, cost, created_at) VALUES (?, ?, ?, ?)").run(gift.id, ctx.user.id, gift.cost, now);
      ctx.db
        .prepare("INSERT INTO point_entries (club_id, user_id, delta, reason, ref_key, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(ctx.club.id, ctx.user.id, -gift.cost, "兑换 " + gift.name, "redeem:" + info.lastInsertRowid, now);
      return { ok: true, myPoints: balanceOf(ctx.db, ctx.club.id, ctx.user.id), stock: gift.stock - 1 };
    });
    const result = run();
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });

  app.post(BASE + "/api/clubs/:id/activities/:aid/media", async (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    const count = ctx.db.prepare("SELECT COUNT(*) AS n FROM activity_media WHERE activity_id = ?").get(activity.id);
    if (count.n >= MEDIA_MAX) return res.status(400).json({ error: "这场相册满了" });
    let buffer;
    try {
      buffer = oneFile(await readBody(req, VIDEO_MAX + 64 * 1024), req.get("content-type"));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.status === 413 ? "文件太大" : "没有读到文件" });
    }
    if (!buffer || !buffer.length) return res.status(400).json({ error: "没有读到文件" });
    const kind = sniff(buffer);
    if (!kind) return res.status(400).json({ error: "只收 jpg、png、webp 照片和 mp4、mov 视频" });
    if (kind.kind === "photo" && buffer.length > PHOTO_MAX) return res.status(413).json({ error: "照片不超过 8MB" });
    if (kind.kind === "video" && buffer.length > VIDEO_MAX) return res.status(413).json({ error: "视频不超过 40MB" });
    const info = ctx.db
      .prepare("INSERT INTO activity_media (activity_id, user_id, kind, filename, created_at) VALUES (?, ?, ?, '', ?)")
      .run(activity.id, ctx.user.id, kind.kind, new Date().toISOString());
    const id = Number(info.lastInsertRowid);
    const filename = id + "." + kind.ext;
    const dir = path.join(mediaRoot(), String(activity.id));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buffer);
    ctx.db.prepare("UPDATE activity_media SET filename = ? WHERE id = ?").run(filename, id);
    res.json({ media: { id, kind: kind.kind, nickname: ctx.user.nickname, mine: true } });
  });

  app.delete(BASE + "/api/clubs/:id/activities/:aid/media/:mid", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const row = ctx.db
      .prepare(
        `SELECT m.id, m.user_id, m.filename, m.activity_id FROM activity_media m
         JOIN activities a ON a.id = m.activity_id
         WHERE m.id = ? AND a.id = ? AND a.club_id = ?`
      )
      .get(req.params.mid, req.params.aid, ctx.club.id);
    if (!row) return res.status(404).json({ error: "没有这张" });
    if (row.user_id !== ctx.user.id && ctx.club.owner_id !== ctx.user.id) return res.status(403).json({ error: "只能删自己传的" });
    ctx.db.prepare("DELETE FROM activity_media WHERE id = ?").run(row.id);
    const file = path.join(mediaRoot(), String(row.activity_id), row.filename);
    if (row.filename && fs.existsSync(file)) fs.unlinkSync(file);
    res.json({ ok: true });
  });

  app.get(BASE + "/api/media/:mid", (req, res) => {
    const header = req.get("authorization") || "";
    const token = header.replace(/^Bearer\s+/i, "") || String(req.query.t || "");
    const user = token ? getDb().prepare("SELECT id FROM users WHERE token = ?").get(token) : null;
    if (!user) return res.status(401).json({ error: "先起个昵称" });
    const row = getDb()
      .prepare(
        `SELECT m.filename, m.kind, m.activity_id, a.club_id
         FROM activity_media m
         JOIN activities a ON a.id = m.activity_id
         WHERE m.id = ?`
      )
      .get(req.params.mid);
    if (!row || !row.filename) return res.status(404).json({ error: "没有这张" });
    const member = getDb().prepare("SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?").get(row.club_id, user.id);
    if (!member) return res.status(403).json({ error: "你不在这个跑团里" });
    const file = path.join(mediaRoot(), String(row.activity_id), path.basename(row.filename));
    if (!fs.existsSync(file)) return res.status(404).json({ error: "文件不在了" });
    const mime = row.kind === "video" ? (row.filename.endsWith(".mov") ? "video/quicktime" : "video/mp4") : row.filename.endsWith(".png") ? "image/png" : row.filename.endsWith(".webp") ? "image/webp" : "image/jpeg";
    const stat = fs.statSync(file);
    res.set("Accept-Ranges", "bytes");
    res.set("Content-Type", mime);
    res.set("Cache-Control", "private, max-age=3600");
    const range = req.get("range");
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (!match) return res.status(416).end();
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      if (start > end || end >= stat.size) return res.status(416).end();
      res.status(206);
      res.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      res.set("Content-Length", String(end - start + 1));
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.set("Content-Length", String(stat.size));
    fs.createReadStream(file).pipe(res);
  });
}

module.exports = { mountClubLife, enrichBoard, clubLife };
