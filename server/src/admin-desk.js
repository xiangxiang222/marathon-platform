const fs = require("fs");
const path = require("path");
const { DISTANCE_LABEL } = require("./races");
const { formatClock } = require("./career");
const { clubRoleLabel, setMemberRole, addClubMember, removeClubMember, decideRequest, listPending, listClubApplications, decideClubApplication } = require("./roles");
const { setUserPassword, createUser } = require("./user-auth");
const { likeParams } = require("./search-like");

function mediaRoot() {
  return process.env.MARATHON_MEDIA || path.join(__dirname, "../data/media");
}

function deleteUser(db, id) {
  const row = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!row) return { error: "没有这个人", status: 404 };
  const owned = db.prepare("SELECT name FROM clubs WHERE owner_id = ? LIMIT 1").get(id);
  if (owned) return { error: "该用户仍为「" + owned.name + "」团长，请先完成团长移交后再删除", status: 400 };
  const files = db.prepare("SELECT filename, activity_id FROM activity_media WHERE user_id = ?").all(id);
  const sheets = db.prepare("SELECT filename FROM result_call_rows WHERE user_id = ? AND filename != ''").all(id);
  const meetPhotos = db.prepare("SELECT filename FROM meetup_photos WHERE user_id = ? AND filename != ''").all(id);
  const shots = db.prepare("SELECT shot FROM runs WHERE user_id = ? AND shot != ''").all(id);
  const proofs = db.prepare("SELECT proof FROM results WHERE user_id = ? AND proof != ''").all(id);
  const signups = db.prepare("SELECT sheet FROM plans WHERE user_id = ? AND sheet != ''").all(id);
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
      "club_applications",
      "fee_records",
      "result_call_rows",
      "meetup_joins",
      "meetup_checks",
      "meetup_photos",
      "internal_signups",
      "internal_results"
    ]) {
      db.prepare("DELETE FROM " + table + " WHERE user_id = ?").run(id);
    }
    db.prepare("DELETE FROM mileage_counts WHERE run_id IN (SELECT id FROM runs WHERE user_id = ?)").run(id);
    db.prepare("DELETE FROM runs WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM mileage_flags WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM user_mileage WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM supply_claims WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM radar_profiles WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM club_likes WHERE user_id = ? OR post_id IN (SELECT id FROM club_posts WHERE user_id = ?)").run(id, id);
    db.prepare("DELETE FROM club_comments WHERE user_id = ? OR post_id IN (SELECT id FROM club_posts WHERE user_id = ?)").run(id, id);
    db.prepare("DELETE FROM club_posts WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  })();
  for (const file of files) {
    if (!file.filename) continue;
    const full = path.join(mediaRoot(), String(file.activity_id), file.filename);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  for (const sheet of sheets) {
    const full = path.join(mediaRoot(), "calls", sheet.filename);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  for (const photo of meetPhotos) {
    const full = path.join(mediaRoot(), "meetups", photo.filename);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  for (const shot of shots) {
    const full = path.join(mediaRoot(), "runs", path.basename(shot.shot));
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  for (const proof of proofs) {
    const full = path.join(mediaRoot(), "results", path.basename(proof.proof));
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  for (const signup of signups) {
    const full = path.join(mediaRoot(), "signups", path.basename(signup.sheet));
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  return { ok: true };
}

function when(value) {
  return String(value || "").slice(0, 16).replace("T", " ");
}

function listUsers(db, q) {
  const match = likeParams(q, ["u.nickname"]);
  const rows = db
    .prepare(
      `SELECT u.id, u.nickname, u.created_at, u.leader,
              CASE WHEN u.password_hash != '' THEN 1 ELSE 0 END AS has_password,
              (SELECT COUNT(*) FROM plans p WHERE p.user_id = u.id) AS plans,
              (SELECT COUNT(*) FROM results r WHERE r.user_id = u.id) AS results,
              (SELECT COUNT(*) FROM club_members m WHERE m.user_id = u.id) AS clubs
       FROM users u
       WHERE ${match.sql}
       ORDER BY u.id DESC
       LIMIT 200`
    )
    .all(...match.params);
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

function deleteClub(db, id) {
  const club = db.prepare("SELECT id FROM clubs WHERE id = ?").get(id);
  if (!club) return { error: "没有这个跑团", status: 404 };
  const activities = db.prepare("SELECT id FROM activities WHERE club_id = ?").all(id).map((row) => row.id);
  const files = activities.length
    ? db.prepare(`SELECT filename, activity_id FROM activity_media WHERE activity_id IN (${activities.map(() => "?").join(",")})`).all(...activities)
    : [];
  const gifts = db.prepare("SELECT id FROM gifts WHERE club_id = ?").all(id).map((row) => row.id);
  const periods = db.prepare("SELECT id, qr_filename FROM fee_periods WHERE club_id = ?").all(id);
  const calls = db.prepare("SELECT id FROM result_calls WHERE club_id = ?").all(id).map((row) => row.id);
  const sheets = calls.length
    ? db.prepare(`SELECT id, filename FROM result_call_rows WHERE call_id IN (${calls.map(() => "?").join(",")}) AND filename != ''`).all(...calls)
    : [];
  const meetups = db.prepare("SELECT id FROM meetups WHERE club_id = ?").all(id).map((row) => row.id);
  const meetPhotos = meetups.length
    ? db.prepare(`SELECT filename FROM meetup_photos WHERE meetup_id IN (${meetups.map(() => "?").join(",")}) AND filename != ''`).all(...meetups)
    : [];
  const races = db.prepare("SELECT id FROM internal_races WHERE club_id = ?").all(id).map((row) => row.id);
  db.transaction(() => {
    if (activities.length) {
      const marks = activities.map(() => "?").join(",");
      db.prepare(`DELETE FROM activity_media WHERE activity_id IN (${marks})`).run(...activities);
      db.prepare(`DELETE FROM activity_signups WHERE activity_id IN (${marks})`).run(...activities);
      db.prepare(`DELETE FROM activity_checks WHERE activity_id IN (${marks})`).run(...activities);
      db.prepare(`DELETE FROM activity_groups WHERE activity_id IN (${marks})`).run(...activities);
    }
    if (gifts.length) db.prepare(`DELETE FROM redemptions WHERE gift_id IN (${gifts.map(() => "?").join(",")})`).run(...gifts);
    db.prepare("DELETE FROM activities WHERE club_id = ?").run(id);
    db.prepare("DELETE FROM club_groups WHERE club_id = ?").run(id);
    db.prepare("DELETE FROM checkins WHERE club_id = ?").run(id);
    db.prepare("DELETE FROM point_entries WHERE club_id = ?").run(id);
    db.prepare("DELETE FROM mileage_counts WHERE club_id = ?").run(id);
    db.prepare("DELETE FROM mileage_groups WHERE club_id = ?").run(id);
    db.prepare("DELETE FROM mileage_rules WHERE club_id = ?").run(id);
    db.prepare("DELETE FROM supply_claims WHERE club_id = ?").run(id);
    db.prepare("DELETE FROM split_notes WHERE club_id = ?").run(id);
    db.prepare("DELETE FROM league_joins WHERE club_id = ?").run(id);
    const postIds = db.prepare("SELECT id FROM club_posts WHERE club_id = ?").all(id).map((row) => row.id);
    if (postIds.length) {
      const marks = postIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM club_likes WHERE post_id IN (${marks})`).run(...postIds);
      db.prepare(`DELETE FROM club_comments WHERE post_id IN (${marks})`).run(...postIds);
    }
    db.prepare("DELETE FROM club_posts WHERE club_id = ?").run(id);
    db.prepare("DELETE FROM gifts WHERE club_id = ?").run(id);
    db.prepare("DELETE FROM club_members WHERE club_id = ?").run(id);
    db.prepare("DELETE FROM club_requests WHERE club_id = ?").run(id);
    if (periods.length) {
      const marks = periods.map(() => "?").join(",");
      db.prepare(`DELETE FROM fee_records WHERE period_id IN (${marks})`).run(...periods.map((row) => row.id));
    }
    db.prepare("DELETE FROM fee_periods WHERE club_id = ?").run(id);
    if (calls.length) {
      const marks = calls.map(() => "?").join(",");
      db.prepare(`DELETE FROM result_call_rows WHERE call_id IN (${marks})`).run(...calls);
    }
    db.prepare("DELETE FROM result_calls WHERE club_id = ?").run(id);
    if (meetups.length) {
      const marks = meetups.map(() => "?").join(",");
      db.prepare(`DELETE FROM meetup_photos WHERE meetup_id IN (${marks})`).run(...meetups);
      db.prepare(`DELETE FROM meetup_checks WHERE meetup_id IN (${marks})`).run(...meetups);
      db.prepare(`DELETE FROM meetup_joins WHERE meetup_id IN (${marks})`).run(...meetups);
    }
    db.prepare("DELETE FROM meetups WHERE club_id = ?").run(id);
    db.prepare("DELETE FROM meetup_tiers WHERE club_id = ?").run(id);
    if (races.length) {
      const marks = races.map(() => "?").join(",");
      db.prepare(`DELETE FROM internal_results WHERE race_id IN (${marks})`).run(...races);
      db.prepare(`DELETE FROM internal_signups WHERE race_id IN (${marks})`).run(...races);
      db.prepare(`DELETE FROM internal_groups WHERE race_id IN (${marks})`).run(...races);
    }
    db.prepare("DELETE FROM internal_races WHERE club_id = ?").run(id);
    db.prepare("DELETE FROM clubs WHERE id = ?").run(id);
  })();
  for (const file of files) {
    if (!file.filename) continue;
    const full = path.join(mediaRoot(), String(file.activity_id), file.filename);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  for (const period of periods) {
    if (!period.qr_filename) continue;
    const full = path.join(mediaRoot(), "fees", period.qr_filename);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  for (const sheet of sheets) {
    const full = path.join(mediaRoot(), "calls", sheet.filename);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  for (const photo of meetPhotos) {
    const full = path.join(mediaRoot(), "meetups", photo.filename);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  return { ok: true };
}

function listClubs(db, q) {
  const match = likeParams(q, ["c.name", "u.nickname"]);
  const member = likeParams(q, ["mu.nickname"]);
  return db
    .prepare(
      `SELECT c.id, c.name, c.created_at, u.nickname AS owner,
              (SELECT COUNT(*) FROM club_members m WHERE m.club_id = c.id) AS members
       FROM clubs c
       JOIN users u ON u.id = c.owner_id
       WHERE ${match.sql}
          OR EXISTS (
            SELECT 1 FROM club_members m
            JOIN users mu ON mu.id = m.user_id
            WHERE m.club_id = c.id AND (${member.sql})
          )
       ORDER BY c.id DESC
       LIMIT 200`
    )
    .all(...match.params, ...member.params)
    .map((row) => ({
      id: row.id,
      name: row.name,
      owner: row.owner,
      members: row.members,
      createdAt: when(row.created_at)
    }));
}

function clubDesk(db, id) {
  const club = db
    .prepare(
      `SELECT c.id, c.name, c.code, c.created_at, c.owner_id, u.nickname AS owner
       FROM clubs c
       JOIN users u ON u.id = c.owner_id
       WHERE c.id = ?`
    )
    .get(id);
  if (!club) return null;
  const members = db
    .prepare(
      `SELECT u.id, u.nickname, m.role, m.joined_at
       FROM club_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.club_id = ?
       ORDER BY CASE WHEN u.id = ? THEN 0 WHEN m.role = 'manager' THEN 1 ELSE 2 END, u.id`
    )
    .all(id, club.owner_id)
    .map((row) => {
      const role = row.id === club.owner_id ? "owner" : row.role === "manager" ? "manager" : "member";
      return {
        id: row.id,
        nickname: row.nickname,
        role,
        roleLabel: clubRoleLabel(role),
        joinedAt: when(row.joined_at)
      };
    });
  return {
    club: {
      id: club.id,
      name: club.name,
      code: club.code,
      owner: club.owner,
      ownerId: club.owner_id,
      createdAt: when(club.created_at),
      members: members.length
    },
    members
  };
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

  app.get(BASE + "/api/admin/clubs", (req, res) => {
    if (!desk(req, res)) return;
    res.json({ clubs: listClubs(getDb(), req.query.q) });
  });

  app.get(BASE + "/api/admin/clubs/:id", (req, res) => {
    if (!desk(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: "没有这个跑团" });
    const detail = clubDesk(getDb(), id);
    if (!detail) return res.status(404).json({ error: "没有这个跑团" });
    res.json(detail);
  });

  app.post(BASE + "/api/admin/clubs/:id/members", (req, res) => {
    if (!desk(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: "没有这个跑团" });
    const result = addClubMember(getDb(), id, req.body && req.body.nickname);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(201).json({ ok: true, userId: result.userId });
  });

  app.put(BASE + "/api/admin/clubs/:id/members/:userId", (req, res) => {
    if (!desk(req, res)) return;
    const id = Number(req.params.id);
    const userId = Number(req.params.userId);
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(userId) || userId < 1) return res.status(404).json({ error: "团里没有这个人" });
    const result = setMemberRole(getDb(), id, userId, String((req.body && req.body.role) || ""));
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
  });

  app.delete(BASE + "/api/admin/clubs/:id", (req, res) => {
    if (!desk(req, res)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: "没有这个跑团" });
    const result = deleteClub(getDb(), id);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
  });

  app.delete(BASE + "/api/admin/clubs/:id/members/:userId", (req, res) => {
    if (!desk(req, res)) return;
    const id = Number(req.params.id);
    const userId = Number(req.params.userId);
    if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: "没有这个跑团" });
    const result = removeClubMember(getDb(), id, userId);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
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
