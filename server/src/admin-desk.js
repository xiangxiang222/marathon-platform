const fs = require("fs");
const path = require("path");
const { DISTANCE_LABEL } = require("./races");
const { formatClock } = require("./career");
const { clubRoleLabel, setMemberRole, decideRequest, listPending, listClubApplications, decideClubApplication } = require("./roles");
const { setUserPassword, createUser } = require("./user-auth");

function mediaRoot() {
  return process.env.MARATHON_MEDIA || path.join(__dirname, "../data/media");
}

function deleteUser(db, id) {
  const row = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!row) return { error: "没有这个人", status: 404 };
  const owned = db.prepare("SELECT name FROM clubs WHERE owner_id = ? LIMIT 1").get(id);
  if (owned) return { error: "该用户仍为「" + owned.name + "」团长，请先完成团长移交后再删除", status: 400 };
  const files = db.prepare("SELECT filename, activity_id FROM activity_media WHERE user_id = ?").all(id);
  db.transaction(() => {
    for (const table of [
      "plans",
      "results",
      "club_members",
      "checkins",
      "activity_signups",
      "activity_checks",
      "point_entries",
      "redemptions",
      "activity_media",
      "club_requests",
      "club_applications"
    ]) {
      db.prepare("DELETE FROM " + table + " WHERE user_id = ?").run(id);
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  })();
  for (const file of files) {
    if (!file.filename) continue;
    const full = path.join(mediaRoot(), String(file.activity_id), file.filename);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  return { ok: true };
}

function when(value) {
  return String(value || "").slice(0, 16).replace("T", " ");
}

function listUsers(db, q) {
  const rows = db
    .prepare(
      `SELECT u.id, u.nickname, u.created_at, u.leader,
              CASE WHEN u.password_hash != '' THEN 1 ELSE 0 END AS has_password,
              (SELECT COUNT(*) FROM plans p WHERE p.user_id = u.id) AS plans,
              (SELECT COUNT(*) FROM results r WHERE r.user_id = u.id) AS results,
              (SELECT COUNT(*) FROM club_members m WHERE m.user_id = u.id) AS clubs
       FROM users u
       WHERE u.nickname LIKE ?
       ORDER BY u.id DESC
       LIMIT 200`
    )
    .all(`%${String(q || "").trim()}%`);
  return rows.map((row) => ({
    id: row.id,
    nickname: row.nickname,
    leader: Boolean(row.leader),
    hasPassword: Boolean(row.has_password),
    createdAt: when(row.created_at),
    plans: row.plans,
    results: row.results,
    clubs: row.clubs
  }));
}

function userDesk(db, id) {
  const user = db
    .prepare(
      `SELECT id, nickname, created_at, leader,
              CASE WHEN password_hash != '' THEN 1 ELSE 0 END AS has_password
       FROM users WHERE id = ?`
    )
    .get(id);
  if (!user) return null;
  const clubs = db
    .prepare(
      `SELECT c.id, c.name, c.owner_id, m.role
       FROM club_members m
       JOIN clubs c ON c.id = m.club_id
       WHERE m.user_id = ?
       ORDER BY c.id`
    )
    .all(user.id);
  const plans = db
    .prepare(
      `SELECT r.name, r.race_date, r.city, p.status
       FROM plans p
       JOIN races r ON r.id = p.race_id
       WHERE p.user_id = ?
       ORDER BY r.race_date DESC, r.name`
    )
    .all(user.id);
  const results = db
    .prepare(
      `SELECT r.name, r.race_date, res.distance, res.seconds, res.story
       FROM results res
       JOIN races r ON r.id = res.race_id
       WHERE res.user_id = ?
       ORDER BY r.race_date DESC, r.name`
    )
    .all(user.id);
  const points = db
    .prepare(
      `SELECT c.name AS club, COALESCE(SUM(p.delta), 0) AS points
       FROM point_entries p
       JOIN clubs c ON c.id = p.club_id
       WHERE p.user_id = ?
       GROUP BY p.club_id
       ORDER BY c.name`
    )
    .all(user.id);
  return {
    user: {
      id: user.id,
      nickname: user.nickname,
      createdAt: when(user.created_at),
      leader: Boolean(user.leader),
      hasPassword: Boolean(user.has_password)
    },
    clubs: clubs.map((row) => {
      const role = row.owner_id === user.id ? "owner" : row.role === "manager" ? "manager" : "member";
      return { id: row.id, name: row.name, owner: role === "owner", role, roleLabel: clubRoleLabel(role) };
    }),
    plans: plans.map((row) => ({ name: row.name, raceDate: row.race_date, city: row.city, status: row.status })),
    results: results.map((row) => ({
      name: row.name,
      raceDate: row.race_date,
      distance: DISTANCE_LABEL[row.distance] || row.distance,
      clock: formatClock(row.seconds),
      story: row.story
    })),
    points: points.map((row) => ({ club: row.club, points: row.points }))
  };
}

function listRuns(db) {
  return db
    .prepare(
      `SELECT u.nickname, c.name AS club, a.title, k.km, k.note, k.created_at
       FROM activity_checks k
       JOIN users u ON u.id = k.user_id
       JOIN activities a ON a.id = k.activity_id
       JOIN clubs c ON c.id = a.club_id
       ORDER BY k.created_at DESC, u.id DESC
       LIMIT 200`
    )
    .all()
    .map((row) => ({
      nickname: row.nickname,
      club: row.club,
      title: row.title,
      km: row.km,
      note: row.note,
      at: when(row.created_at)
    }));
}

function shopDesk(db) {
  const gifts = db
    .prepare(
      `SELECT g.id, c.name AS club, g.name, g.cost, g.stock
       FROM gifts g
       JOIN clubs c ON c.id = g.club_id
       ORDER BY c.name, g.id DESC
       LIMIT 200`
    )
    .all()
    .map((row) => ({ id: row.id, club: row.club, name: row.name, cost: row.cost, stock: row.stock }));
  const redemptions = db
    .prepare(
      `SELECT r.created_at, u.nickname, c.name AS club, g.name, r.cost
       FROM redemptions r
       JOIN gifts g ON g.id = r.gift_id
       JOIN clubs c ON c.id = g.club_id
       JOIN users u ON u.id = r.user_id
       ORDER BY r.created_at DESC
       LIMIT 100`
    )
    .all()
    .map((row) => ({
      at: when(row.created_at),
      nickname: row.nickname,
      club: row.club,
      name: row.name,
      cost: row.cost
    }));
  return { gifts, redemptions };
}

function mountAdminDesk(app, { BASE, getDb, requireAdmin }) {
  function desk(req, res) {
    return requireAdmin(req, res, "desk");
  }

  app.get(BASE + "/api/admin/users", (req, res) => {
    if (!desk(req, res)) return;
    res.json({ users: listUsers(getDb(), req.query.q) });
  });

  app.post(BASE + "/api/admin/users", (req, res) => {
    if (!desk(req, res)) return;
    const result = createUser(getDb(), req.body || {});
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(201).json({ id: result.id, nickname: result.nickname });
  });

  app.get(BASE + "/api/admin/users/:id", (req, res) => {
    if (!desk(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: "没有这个人" });
    const detail = userDesk(getDb(), id);
    if (!detail) return res.status(404).json({ error: "没有这个人" });
    res.json(detail);
  });

  app.put(BASE + "/api/admin/users/:id/clubs/:clubId", (req, res) => {
    if (!desk(req, res)) return;
    const id = Number(req.params.id);
    const clubId = Number(req.params.clubId);
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(clubId) || clubId < 1) return res.status(404).json({ error: "没有这个人" });
    const result = setMemberRole(getDb(), clubId, id, String((req.body && req.body.role) || ""));
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
  });

  app.delete(BASE + "/api/admin/users/:id", (req, res) => {
    if (!desk(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: "没有这个人" });
    const result = deleteUser(getDb(), id);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
  });

  app.put(BASE + "/api/admin/users/:id/password", (req, res) => {
    if (!desk(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: "没有这个人" });
    const result = setUserPassword(getDb(), id, req.body && req.body.password);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
  });

  app.put(BASE + "/api/admin/users/:id/leader", (req, res) => {
    if (!desk(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: "没有这个人" });
    const leader = req.body && req.body.leader;
    if (typeof leader !== "boolean") return res.status(400).json({ error: "选择是不是团长" });
    const updated = getDb().prepare("UPDATE users SET leader = ? WHERE id = ?").run(leader ? 1 : 0, id);
    if (!updated.changes) return res.status(404).json({ error: "没有这个人" });
    res.json({ ok: true, leader });
  });

  app.get(BASE + "/api/admin/club-applications", (req, res) => {
    if (!desk(req, res)) return;
    res.json({ applications: listClubApplications(getDb()) });
  });

  app.post(BASE + "/api/admin/club-applications/:id", (req, res) => {
    if (!desk(req, res)) return;
    const reviewer = req.adminUser ? "后台·" + req.adminUser : "后台";
    const result = decideClubApplication(getDb(), req.params.id, String((req.body && req.body.decision) || ""), reviewer);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });

  app.get(BASE + "/api/admin/club-requests", (req, res) => {
    if (!desk(req, res)) return;
    res.json({ requests: listPending(getDb()) });
  });

  app.post(BASE + "/api/admin/club-requests/:id", (req, res) => {
    if (!desk(req, res)) return;
    const reviewer = req.adminUser ? "后台·" + req.adminUser : "后台";
    const result = decideRequest(getDb(), req.params.id, String((req.body && req.body.decision) || ""), reviewer);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
  });

  app.get(BASE + "/api/admin/runs", (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ runs: listRuns(getDb()) });
  });

  app.get(BASE + "/api/admin/shop", (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(shopDesk(getDb()));
  });
}

module.exports = { mountAdminDesk };
