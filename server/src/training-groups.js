const { memberRole, clubRoleLabel } = require("./roles");
const { avatarUrlOf } = require("./avatars");
const { memberSharedProfile } = require("./member-profile");
const DAY = 86400000;
const round = n => Math.round(Number(n || 0) * 100) / 100;
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const shift = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
const fail = (error, status = 400) => { throw Object.assign(new Error(error), { status }); };

function installTrainingGroups(db) {
  for (const [table, name, type] of [["mileage_groups", "pace", "TEXT NOT NULL DEFAULT ''"], ["mileage_groups", "description", "TEXT NOT NULL DEFAULT ''"], ["mileage_groups", "club_group_id", "INTEGER NOT NULL DEFAULT 0"], ["users", "introduction", "TEXT NOT NULL DEFAULT ''"], ["activity_groups", "training_group_id", "INTEGER NOT NULL DEFAULT 0"]]) {
    if (!db.prepare("PRAGMA table_info(" + table + ")").all().some(c => c.name === name)) db.exec("ALTER TABLE " + table + " ADD COLUMN " + name + " " + type);
  }
  // Keep both historical API id spaces. A permanent training group connects
  // roster/mileage grouping to the existing activity-default group.
  db.transaction(() => {
    for (const g of db.prepare("SELECT * FROM mileage_groups WHERE club_group_id=0 ORDER BY id").all()) {
      let linked = db.prepare("SELECT * FROM club_groups WHERE club_id=? AND name=? AND id NOT IN (SELECT club_group_id FROM mileage_groups WHERE club_group_id>0) ORDER BY id LIMIT 1").get(g.club_id, g.name);
      if (!linked) {
        const id = db.prepare("INSERT INTO club_groups(club_id,name,pace,capacity,sort) VALUES(?,?,?,?,?)").run(g.club_id, g.name, g.pace, g.capacity, g.sort).lastInsertRowid;
        linked = { id, pace: g.pace };
      }
      db.prepare("UPDATE mileage_groups SET club_group_id=?,pace=? WHERE id=?").run(linked.id, g.pace || linked.pace || "", g.id);
    }
    for (const g of db.prepare("SELECT * FROM club_groups WHERE id NOT IN (SELECT club_group_id FROM mileage_groups WHERE club_group_id>0) ORDER BY id").all()) {
      db.prepare("INSERT INTO mileage_groups(club_id,name,pace,capacity,sort,club_group_id) VALUES(?,?,?,?,?,?)").run(g.club_id, g.name, g.pace, g.capacity, g.sort, g.id);
    }
  })();
}

function groupsOf(db, clubId) {
  return db.prepare(`SELECT g.*, COUNT(m.user_id) AS member_count FROM mileage_groups g
    LEFT JOIN club_members m ON m.club_id=g.club_id AND m.mileage_group_id=g.id
    WHERE g.club_id=? GROUP BY g.id ORDER BY g.sort,g.id`).all(clubId).map(g => ({ id: g.id, name: g.name, pace: g.pace, description: g.description, capacity: g.capacity, sort: g.sort, clubGroupId: g.club_group_id, memberCount: g.member_count }));
}

function saveGroup(db, clubId, body, groupId) {
  const old = groupId == null ? null : db.prepare("SELECT * FROM mileage_groups WHERE id=? AND club_id=?").get(groupId, clubId);
  if (groupId != null && !old) fail("没有这个训练组", 404);
  const value = key => body[key] === undefined ? old && old[key] : body[key];
  const name = String(value("name") || "").trim(), pace = String(value("pace") || "").trim(), description = String(value("description") || "").trim();
  const capacity = value("capacity") == null ? 0 : Number(value("capacity")), sort = value("sort") == null ? 0 : Number(value("sort"));
  if (!name || name.length > 20 || /[\u0000-\u001f\u007f]/.test(name)) fail("训练组名用 1 到 20 个字");
  if (pace.length > 40 || [...description].length > 300) fail("目标配速最多40字，组别介绍最多300字");
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 500 || !Number.isSafeInteger(sort) || sort < 0) fail("名额为0到500，排序为非负整数");
  if (db.prepare("SELECT 1 FROM mileage_groups WHERE club_id=? AND name=? AND id!=?").get(clubId, name, old ? old.id : 0)) fail("训练组名不能重复");
  if (!old && db.prepare("SELECT COUNT(*) n FROM mileage_groups WHERE club_id=?").get(clubId).n >= 30) fail("训练组最多30个");
  const members = old ? db.prepare("SELECT COUNT(*) n FROM club_members WHERE club_id=? AND mileage_group_id=?").get(clubId, old.id).n : 0;
  if (capacity && capacity < members) fail("名额不能少于现有组员人数");
  return db.transaction(() => {
    let id = old && old.id, linked = old && old.club_group_id;
    if (old) {
      db.prepare("UPDATE mileage_groups SET name=?,pace=?,description=?,capacity=?,sort=? WHERE id=?").run(name, pace, description, capacity, sort, id);
      db.prepare("UPDATE club_groups SET name=?,pace=?,capacity=?,sort=? WHERE id=? AND club_id=?").run(name, pace, capacity, sort, linked, clubId);
    } else {
      linked = Number(db.prepare("INSERT INTO club_groups(club_id,name,pace,capacity,sort) VALUES(?,?,?,?,?)").run(clubId, name, pace, capacity, sort).lastInsertRowid);
      id = Number(db.prepare("INSERT INTO mileage_groups(club_id,name,pace,description,capacity,sort,club_group_id) VALUES(?,?,?,?,?,?,?)").run(clubId, name, pace, description, capacity, sort, linked).lastInsertRowid);
    }
    return { id, name, pace, description, capacity, sort, clubGroupId: linked, memberCount: members };
  }).immediate();
}

function removeGroup(db, clubId, id) {
  const g = db.prepare("SELECT * FROM mileage_groups WHERE id=? AND club_id=?").get(id, clubId);
  if (!g) fail("没有这个训练组", 404);
  db.transaction(() => {
    db.prepare("UPDATE club_members SET mileage_group_id=0 WHERE club_id=? AND mileage_group_id=?").run(clubId, id);
    // Only old activities using club-default ids lose their deleted default;
    // activity-specific snapshots (possibly the same numeric id) stay intact.
    db.prepare(`UPDATE activity_signups SET group_id=0 WHERE group_id=? AND activity_id IN
      (SELECT a.id FROM activities a WHERE a.club_id=? AND NOT EXISTS(SELECT 1 FROM activity_groups ag WHERE ag.activity_id=a.id))`).run(g.club_group_id, clubId);
    db.prepare("DELETE FROM club_groups WHERE id=? AND club_id=?").run(g.club_group_id, clubId);
    db.prepare("DELETE FROM mileage_groups WHERE id=? AND club_id=?").run(id, clubId);
  }).immediate();
}

function assignMember(db, clubId, userId, groupId) {
  if (!Number.isSafeInteger(groupId) || groupId < 0) fail("请选择有效的训练组");
  return db.transaction(() => {
    if (!db.prepare("SELECT 1 FROM club_members WHERE club_id=? AND user_id=?").get(clubId, userId)) fail("团里没有这个人", 404);
    if (groupId) {
      const g = db.prepare("SELECT * FROM mileage_groups WHERE id=? AND club_id=?").get(groupId, clubId);
      if (!g) fail("没有这个训练组", 404);
      const count = db.prepare("SELECT COUNT(*) n FROM club_members WHERE club_id=? AND mileage_group_id=? AND user_id!=?").get(clubId, groupId, userId).n;
      if (g.capacity && count >= g.capacity) fail("这个训练组满了");
    }
    db.prepare("UPDATE club_members SET mileage_group_id=? WHERE club_id=? AND user_id=?").run(groupId, clubId, userId);
    return { ok: true };
  }).immediate();
}

function windowOf(query = {}) {
  const range = query.range === "today" ? "day" : String(query.range || "month"), date = query.date == null ? today() : String(query.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "1900-01-01" || date > "9998-12-31" || !Number.isFinite(Date.parse(date + "T00:00:00Z")) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) fail("请选择有效的日期");
  let from = date, to = shift(date, 1), label = date;
  if (range === "week") { from = shift(date, 1 - (new Date(date + "T00:00:00Z").getUTCDay() || 7)); to = shift(from, 7); label = from + " ～ " + shift(to, -1); }
  else if (range === "month") { from = date.slice(0, 7) + "-01"; const d = new Date(from + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + 1); to = d.toISOString().slice(0, 10); label = date.slice(0, 7); }
  else if (range === "year") { from = date.slice(0, 4) + "-01-01"; to = String(Number(date.slice(0, 4)) + 1) + "-01-01"; label = date.slice(0, 4); }
  else if (range === "all") { from = ""; to = ""; label = "累计"; }
  else if (range !== "day") fail("没有这个统计范围");
  return { range, date, period: { from, to, label } };
}

function boardOf(db, clubId, viewerId, query = {}) {
  const window = windowOf(query), { from, to } = window.period;
  const roster = db.prepare(`SELECT u.id,u.nickname,u.avatar,m.joined_at,m.mileage_group_id,g.name AS group_name,g.pace AS group_pace
    FROM club_members m JOIN users u ON u.id=m.user_id LEFT JOIN mileage_groups g ON g.id=m.mileage_group_id AND g.club_id=m.club_id
    WHERE m.club_id=? ORDER BY u.id`).all(clubId);
  const params = [clubId, new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16)];
  let where = "c.club_id=? AND c.counted=1 AND r.started_at<=?";
  if (from) { where += " AND r.started_at>=? AND r.started_at<?"; params.push(from + "T00:00", to + "T00:00"); }
  const volumes = db.prepare(`SELECT r.user_id,SUM(c.volume_km) km,COUNT(*) times,COUNT(DISTINCT substr(r.started_at,1,10)) days,SUM(r.duration_sec) duration_sec,SUM(r.distance_km) distance_km
    FROM mileage_counts c JOIN runs r ON r.id=c.run_id WHERE ${where} GROUP BY r.user_id`).all(...params);
  const map = new Map(volumes.map(r => [r.user_id, r]));
  const rank = roster.map(u => {
    const v = map.get(u.id) || {}, sec = Math.round((v.duration_sec || 0) / (v.distance_km || 1));
    return { userId: u.id, nickname: u.nickname, avatar: avatarUrlOf(u.id, u.avatar), joinedAt: u.joined_at, groupId: u.group_name ? u.mileage_group_id : 0, group: u.group_name || "未分组", pace: u.group_pace || "", km: round(v.km), times: v.times || 0, days: v.days || 0, durationSec: v.duration_sec || 0, paceLabel: v.distance_km > 0 ? Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0") : "", mine: u.id === viewerId };
  }).sort((a, b) => b.km - a.km || a.userId - b.userId);
  let previous, place = 0;
  rank.forEach((r, i) => { if (r.km !== previous) place = i + 1; previous = r.km; r.place = place; });
  const sum = rows => ({ km: round(rows.reduce((n, r) => n + r.km, 0)), times: rows.reduce((n, r) => n + r.times, 0), activeMembers: rows.filter(r => r.times > 0).length, members: rows.length });
  const groups = groupsOf(db, clubId).map(g => ({ ...g, ...sum(rank.filter(r => r.groupId === g.id)) }));
  groups.push({ id: 0, name: "未分组", pace: "", description: "", memberCount: rank.filter(r => !r.groupId).length, ...sum(rank.filter(r => !r.groupId)) });
  let selected = rank;
  if (query.groupId != null && query.groupId !== "") {
    const id = Number(query.groupId);
    if (!Number.isSafeInteger(id) || id < 0) fail("请选择有效的训练组");
    if (id && !groups.some(g => g.id === id)) fail("没有这个训练组", 404);
    selected = rank.filter(r => r.groupId === id);
    previous = undefined; selected = selected.map((r, i) => { if (r.km !== previous) place = i + 1; previous = r.km; return { ...r, place }; });
  }
  return { ...window, summary: sum(selected), rank: selected, groups, totalKm: sum(selected).km, totalCount: sum(selected).times };
}

function activityTrainingGroups(db, clubId, body) {
  if (body.groups != null && !Array.isArray(body.groups)) return { error: "组别格式不对" };
  if (body.groups && body.groups.length) {
    for (const group of body.groups) {
      if (group && group.trainingGroupId != null && group.trainingGroupId !== 0) {
        const id = Number(group.trainingGroupId);
        if (!Number.isSafeInteger(id) || id < 1 || !db.prepare("SELECT 1 FROM mileage_groups WHERE id=? AND club_id=?").get(id, clubId)) return { error: "活动只能选择本跑团的训练组" };
      }
    }
    return { input: body.groups };
  }
  if (body.trainingGroupIds == null) return { input: body.groups };
  if (!Array.isArray(body.trainingGroupIds) || !body.trainingGroupIds.length || body.trainingGroupIds.length > 12 || new Set(body.trainingGroupIds.map(Number)).size !== body.trainingGroupIds.length) return { error: "请选择1到12个不同训练组" };
  const groups = [];
  for (const raw of body.trainingGroupIds) {
    const id = Number(raw), g = Number.isSafeInteger(id) && id > 0 && db.prepare("SELECT * FROM mileage_groups WHERE id=? AND club_id=?").get(id, clubId);
    if (!g) return { error: "活动只能选择本跑团的训练组" };
    groups.push({ name: g.name, pace: g.pace, capacity: g.capacity, kind: "pace", trainingGroupId: g.id });
  }
  return { input: groups };
}

function mountTrainingGroups(app, { BASE, getDb, userFrom }) {
  const login = (req, res) => { const user = userFrom(req); if (!user) res.status(401).json({ error: "请先登录" }); return user; };
  function gate(req, res) {
    const user = login(req, res); if (!user) return null;
    const db = getDb(), club = db.prepare("SELECT id,owner_id FROM clubs WHERE id=?").get(req.params.id);
    if (!club) { res.status(404).json({ error: "没有这个跑团" }); return null; }
    if (!db.prepare("SELECT 1 FROM club_members WHERE club_id=? AND user_id=?").get(club.id, user.id)) { res.status(403).json({ error: "你不在这个跑团里" }); return null; }
    return { db, club, user, staff: ["owner", "manager"].includes(memberRole(db, club, user.id)) };
  }
  const wrap = fn => (req, res) => { try { fn(req, res); } catch (e) { if (!e.status) throw e; res.status(e.status).json({ error: e.message }); } };
  app.get(BASE + "/api/clubs/:id/training-groups", wrap((req, res) => {
    const ctx = gate(req, res); if (!ctx) return;
    const members = ctx.db.prepare(`SELECT u.id,u.nickname,u.avatar,m.mileage_group_id AS groupId,g.name AS groupName FROM club_members m JOIN users u ON u.id=m.user_id LEFT JOIN mileage_groups g ON g.id=m.mileage_group_id AND g.club_id=m.club_id WHERE m.club_id=? ORDER BY u.id`).all(ctx.club.id).map(u => ({ ...u, avatar: avatarUrlOf(u.id, u.avatar), groupId: u.groupName ? u.groupId : 0, groupName: u.groupName || "未分组" }));
    res.json({ groups: groupsOf(ctx.db, ctx.club.id), members, staff: ctx.staff });
  }));
  for (const method of ["post", "put", "delete"]) app[method](BASE + "/api/clubs/:id/training-groups" + (method === "post" ? "" : "/:gid"), wrap((req, res) => {
    const ctx = gate(req, res); if (!ctx) return;
    if (!ctx.staff) return res.status(403).json({ error: "只有团长或跑团管理可以改训练组" });
    if (method === "delete") { removeGroup(ctx.db, ctx.club.id, req.params.gid); return res.json({ ok: true }); }
    res.json({ group: saveGroup(ctx.db, ctx.club.id, req.body || {}, method === "post" ? undefined : req.params.gid) });
  }));
  app.put(BASE + "/api/clubs/:id/training-groups/members/:uid", wrap((req, res) => {
    const ctx = gate(req, res); if (!ctx) return;
    if (!ctx.staff) return res.status(403).json({ error: "只有团长或跑团管理可以分组" });
    res.json(assignMember(ctx.db, ctx.club.id, req.params.uid, Number(req.body && req.body.groupId)));
  }));
  app.get(BASE + "/api/clubs/:id/mileage/board", wrap((req, res) => {
    const ctx = gate(req, res); if (!ctx) return;
    res.json({ ...boardOf(ctx.db, ctx.club.id, ctx.user.id, req.query), staff: ctx.staff, owner: ctx.user.id === ctx.club.owner_id });
  }));
  app.get(BASE + "/api/clubs/:id/members/:uid/profile", wrap((req, res) => {
    const ctx = gate(req, res); if (!ctx) return;
    const user = ctx.db.prepare(`SELECT u.id,u.nickname,u.avatar,u.introduction,m.joined_at,m.mileage_group_id,g.name AS group_name,g.pace,g.description FROM club_members m JOIN users u ON u.id=m.user_id LEFT JOIN mileage_groups g ON g.id=m.mileage_group_id AND g.club_id=m.club_id WHERE m.club_id=? AND m.user_id=?`).get(ctx.club.id, req.params.uid);
    if (!user) return res.status(404).json({ error: "团里没有这个人" });
    const mileage = {}, selected = boardOf(ctx.db, ctx.club.id, ctx.user.id, { range: req.query.range, date: req.query.date });
    for (const range of ["day", "week", "month", "year", "all"]) mileage[range] = boardOf(ctx.db, ctx.club.id, ctx.user.id, { range, date: selected.date }).rank.find(r => r.userId === user.id);
    const args = [ctx.club.id, user.id, new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16)];
    let runWindow = "";
    if (selected.period.from) { runWindow = " AND r.started_at>=? AND r.started_at<?"; args.push(selected.period.from + "T00:00", selected.period.to + "T00:00"); }
    const recentRuns = ctx.db.prepare(`SELECT r.id,r.started_at,r.type,r.run_mode,r.distance_km,r.duration_sec,c.volume_km FROM mileage_counts c JOIN runs r ON r.id=c.run_id WHERE c.club_id=? AND r.user_id=? AND c.counted=1 AND r.started_at<=?${runWindow} ORDER BY r.started_at DESC,r.id DESC LIMIT 20`).all(...args).map(r => {
      const sec = Math.round(r.duration_sec / (r.distance_km || 1)), pad = n => String(n).padStart(2, "0");
      return { id: r.id, startedAt: r.started_at, typeLabel: r.type === "trail" ? "越野" : "跑步", distanceKm: round(r.distance_km), km: round(r.volume_km), durationSec: r.duration_sec, durationLabel: pad(Math.floor(r.duration_sec / 3600)) + ":" + pad(Math.floor(r.duration_sec % 3600 / 60)) + ":" + pad(r.duration_sec % 60), paceLabel: r.distance_km > 0 ? Math.floor(sec / 60) + ":" + pad(sec % 60) : "" };
    });
    const role = memberRole(ctx.db, ctx.club, user.id), shared = memberSharedProfile(ctx.db, ctx.club.id, user.id, BASE);
    res.json({ user: { id: user.id, nickname: user.nickname, avatar: avatarUrlOf(user.id, user.avatar), introduction: user.introduction, joinedAt: user.joined_at, groupId: user.group_name ? user.mileage_group_id : 0, groupName: user.group_name || "未分组", role, roleLabel: clubRoleLabel(role) }, group: user.group_name ? { id: user.mileage_group_id, name: user.group_name, pace: user.pace, description: user.description } : null, mileage, range: selected.range, date: selected.date, period: selected.period, stats: selected.rank.find(r => r.userId === user.id), recentRuns, mine: user.id === ctx.user.id, ...shared, overview: { totalKm: mileage.all.km, totalRuns: mileage.all.times, finished: shared.summary.finishedRaceCount } });
  }));
  app.put(BASE + "/api/me/introduction", wrap((req, res) => {
    const user = login(req, res); if (!user) return;
    const intro = req.body && req.body.introduction;
    if (typeof intro !== "string" || [...intro].length > 300 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(intro)) return res.status(400).json({ error: "个人介绍最多300字" });
    getDb().prepare("UPDATE users SET introduction=? WHERE id=?").run(intro.trim(), user.id);
    res.json({ introduction: intro.trim() });
  }));
}

module.exports = { installTrainingGroups, mountTrainingGroups, groupsOf, saveGroup, removeGroup, assignMember, boardOf, windowOf, activityTrainingGroups };
