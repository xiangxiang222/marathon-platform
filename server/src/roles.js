const crypto = require("crypto");

const CLUB_ROLES = [
  { id: "owner", label: "团长" },
  { id: "manager", label: "跑团管理" },
  { id: "member", label: "成员" }
];

const ADMIN_ROLES = [
  { id: "admin", label: "管理员" },
  { id: "club", label: "跑团管理员" }
];

function labelOf(list, id, fallback) {
  const found = list.find((item) => item.id === id);
  return found ? found.label : fallback;
}

function clubRoleLabel(id) {
  return labelOf(CLUB_ROLES, id, "成员");
}

function adminRoleLabel(id) {
  return labelOf(ADMIN_ROLES, id, "管理员");
}

function memberRole(db, club, userId) {
  if (Number(club.owner_id) === Number(userId)) return "owner";
  const row = db.prepare("SELECT role FROM club_members WHERE club_id = ? AND user_id = ?").get(club.id, userId);
  if (!row) return "";
  return row.role === "manager" ? "manager" : "member";
}

function setMemberRole(db, clubId, userId, role) {
  const uid = Number(userId);
  if (!CLUB_ROLES.some((item) => item.id === role)) return { error: "没有这个角色", status: 400 };
  if (!Number.isInteger(uid) || uid < 1) return { error: "团里没有这个人", status: 404 };
  const club = db.prepare("SELECT id, owner_id FROM clubs WHERE id = ?").get(clubId);
  if (!club) return { error: "没有这个跑团", status: 404 };
  const member = db.prepare("SELECT role FROM club_members WHERE club_id = ? AND user_id = ?").get(club.id, uid);
  if (!member) return { error: "团里没有这个人", status: 404 };
  if (role === "owner") {
    if (club.owner_id === uid) return { ok: true };
    db.transaction(() => {
      db.prepare("UPDATE club_members SET role = 'manager' WHERE club_id = ? AND user_id = ?").run(club.id, club.owner_id);
      db.prepare("UPDATE club_members SET role = 'owner' WHERE club_id = ? AND user_id = ?").run(club.id, uid);
      db.prepare("UPDATE clubs SET owner_id = ? WHERE id = ?").run(uid, club.id);
      db.prepare("UPDATE users SET leader = 1 WHERE id = ?").run(uid);
    })();
    return { ok: true };
  }
  if (uid === club.owner_id) return { error: "请先将团长移交给其他成员，再修改角色", status: 400 };
  db.prepare("UPDATE club_members SET role = ? WHERE club_id = ? AND user_id = ?").run(role, club.id, uid);
  return { ok: true };
}

function addClubMember(db, clubId, nickname) {
  const name = String(nickname || "").trim();
  if (!name || name.length > 20) return { error: "昵称须为 1 到 20 个字", status: 400 };
  const club = db.prepare("SELECT id FROM clubs WHERE id = ?").get(clubId);
  if (!club) return { error: "没有这个跑团", status: 404 };
  const people = db.prepare("SELECT id FROM users WHERE nickname = ?").all(name);
  if (!people.length) return { error: "没有这个用户", status: 404 };
  if (people.length > 1) return { error: "该昵称存在多个账号，请先处理后再添加", status: 400 };
  const userId = people[0].id;
  const existing = db.prepare("SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?").get(club.id, userId);
  if (existing) return { error: "该用户已在此跑团中", status: 400 };
  const now = new Date().toISOString();
  db.prepare("INSERT INTO club_members (club_id, user_id, joined_at, role) VALUES (?, ?, ?, 'member')").run(club.id, userId, now);
  db.prepare(
    "UPDATE club_requests SET status = 'approved', reviewed_at = ?, reviewer = '后台' WHERE club_id = ? AND user_id = ? AND status = 'pending'"
  ).run(now, club.id, userId);
  return { ok: true, userId };
}

function removeClubMember(db, clubId, userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) return { error: "团里没有这个人", status: 404 };
  const club = db.prepare("SELECT id, owner_id FROM clubs WHERE id = ?").get(clubId);
  if (!club) return { error: "没有这个跑团", status: 404 };
  if (uid === club.owner_id) return { error: "该用户仍为团长，请先完成团长移交后再移出", status: 400 };
  const gone = db.prepare("DELETE FROM club_members WHERE club_id = ? AND user_id = ?").run(club.id, uid);
  if (!gone.changes) return { error: "团里没有这个人", status: 404 };
  return { ok: true };
}

function decideRequest(db, requestId, decision, reviewer, clubId) {
  const id = Number(requestId);
  if (!Number.isInteger(id) || id < 1) return { error: "没有这条申请", status: 404 };
  if (decision !== "approve" && decision !== "reject") return { error: "选择通过或拒绝", status: 400 };
  const row = db.prepare("SELECT * FROM club_requests WHERE id = ?").get(id);
  if (!row || (clubId != null && Number(row.club_id) !== Number(clubId))) return { error: "没有这条申请", status: 404 };
  if (row.status !== "pending") return { error: "这条已经处理过", status: 400 };
  const now = new Date().toISOString();
  const status = decision === "approve" ? "approved" : "rejected";
  const changed = db.transaction(() => {
    const updated = db
      .prepare("UPDATE club_requests SET status = ?, reviewed_at = ?, reviewer = ? WHERE id = ? AND status = 'pending'")
      .run(status, now, String(reviewer || "").slice(0, 40), id);
    if (!updated.changes) return 0;
    if (decision === "approve") {
      db.prepare("INSERT OR IGNORE INTO club_members (club_id, user_id, joined_at, role) VALUES (?, ?, ?, 'member')").run(
        row.club_id,
        row.user_id,
        now
      );
    }
    return updated.changes;
  })();
  if (!changed) return { error: "这条已经处理过", status: 400 };
  return { ok: true };
}

function listPending(db, clubId) {
  const scoped = clubId != null;
  return db
    .prepare(
      `SELECT r.id, r.club_id, r.created_at, u.id AS user_id, u.nickname, c.name AS club
       FROM club_requests r
       JOIN users u ON u.id = r.user_id
       JOIN clubs c ON c.id = r.club_id
       WHERE r.status = 'pending' ${scoped ? "AND r.club_id = ?" : ""}
       ORDER BY r.id DESC
       LIMIT 200`
    )
    .all(...(scoped ? [clubId] : []))
    .map((row) => ({
      id: row.id,
      clubId: row.club_id,
      club: row.club,
      userId: row.user_id,
      nickname: row.nickname,
      at: String(row.created_at).slice(0, 16).replace("T", " ")
    }));
}

function listClubApplications(db) {
  return db
    .prepare(
      `SELECT a.id, a.name, a.created_at, a.user_id, u.nickname
       FROM club_applications a
       JOIN users u ON u.id = a.user_id
       WHERE a.status = 'pending'
       ORDER BY a.id DESC
       LIMIT 200`
    )
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      nickname: row.nickname,
      userId: row.user_id,
      at: String(row.created_at).slice(0, 16).replace("T", " ")
    }));
}

function decideClubApplication(db, applicationId, decision, reviewer) {
  const id = Number(applicationId);
  if (!Number.isInteger(id) || id < 1) return { error: "没有这条申请", status: 404 };
  if (decision !== "approve" && decision !== "reject") return { error: "选择通过或拒绝", status: 400 };
  const row = db.prepare("SELECT * FROM club_applications WHERE id = ?").get(id);
  if (!row) return { error: "没有这条申请", status: 404 };
  if (row.status !== "pending") return { error: "这条已经处理过", status: 400 };
  const now = new Date().toISOString();
  const who = String(reviewer || "").slice(0, 40);
  if (decision === "reject") {
    const updated = db
      .prepare("UPDATE club_applications SET status = 'rejected', reviewed_at = ?, reviewer = ? WHERE id = ? AND status = 'pending'")
      .run(now, who, id);
    if (!updated.changes) return { error: "这条已经处理过", status: 400 };
    return { ok: true };
  }
  const code = crypto.randomBytes(3).toString("hex").toUpperCase();
  const club = db.transaction(() => {
    const updated = db
      .prepare("UPDATE club_applications SET status = 'approved', reviewed_at = ?, reviewer = ? WHERE id = ? AND status = 'pending'")
      .run(now, who, id);
    if (!updated.changes) return null;
    const info = db.prepare("INSERT INTO clubs (name, code, owner_id, created_at) VALUES (?, ?, ?, ?)").run(row.name, code, row.user_id, now);
    const clubId = Number(info.lastInsertRowid);
    db.prepare("INSERT INTO club_members (club_id, user_id, joined_at, role) VALUES (?, ?, ?, 'owner')").run(clubId, row.user_id, now);
    db.prepare("UPDATE club_applications SET club_id = ? WHERE id = ?").run(clubId, id);
    db.prepare("UPDATE users SET leader = 1 WHERE id = ?").run(row.user_id);
    return { id: clubId, name: row.name, code };
  })();
  if (!club) return { error: "这条已经处理过", status: 400 };
  return { ok: true, club };
}

module.exports = {
  CLUB_ROLES,
  ADMIN_ROLES,
  clubRoleLabel,
  adminRoleLabel,
  memberRole,
  setMemberRole,
  addClubMember,
  removeClubMember,
  decideRequest,
  listPending,
  listClubApplications,
  decideClubApplication
};
