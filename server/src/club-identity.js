const crypto = require("crypto");
const { slicePage, readPage, finishPage, pageFields } = require("./page");

const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;
function normalized(value) { return String(value || "").normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase("en"); }
function text(value, max) { return typeof value === "string" ? [...value.trim()].slice(0, max + 1).join("") : ""; }
function validName(value) { return Boolean(value && [...value].length <= 20 && !HIDDEN.test(value) && !/身份已核验|平台已核验|官方认证|✅|☑/u.test(value)); }
function problem(error, status = 400) { return { error, status }; }
function installClubIdentity(db) {
  db.function("club_normalize", { deterministic: true }, normalized);
  for (const [name, type] of [
    ["city", "TEXT NOT NULL DEFAULT ''"], ["intro", "TEXT NOT NULL DEFAULT ''"], ["name_key", "TEXT NOT NULL DEFAULT ''"],
    ["public_status", "TEXT NOT NULL DEFAULT 'active'"], ["moderation_note", "TEXT NOT NULL DEFAULT ''"]
  ]) {
    if (!db.prepare("PRAGMA table_info(clubs)").all().some((col) => col.name === name)) db.exec(`ALTER TABLE clubs ADD COLUMN ${name} ${type}`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS club_creations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, request_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL, club_id INTEGER NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(user_id, request_id)
    );
    CREATE INDEX IF NOT EXISTS club_creations_user_time ON club_creations(user_id, created_at);
    CREATE TABLE IF NOT EXISTS club_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, club_id INTEGER NOT NULL, owner_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', organization TEXT NOT NULL, scope TEXT NOT NULL,
      source_url TEXT NOT NULL DEFAULT '', evidence TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      reviewed_at TEXT NOT NULL DEFAULT '', reviewer TEXT NOT NULL DEFAULT '', materials_deleted_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS club_verifications_club ON club_verifications(club_id,id);
    CREATE INDEX IF NOT EXISTS clubs_name_city ON clubs(name_key,city,id);
    CREATE TABLE IF NOT EXISTS club_identity_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT, club_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', detail TEXT NOT NULL,
      source_url TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, reviewed_at TEXT NOT NULL DEFAULT '',
      reviewer TEXT NOT NULL DEFAULT '', materials_deleted_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS club_identity_reports_user ON club_identity_reports(user_id,id);
    CREATE TABLE IF NOT EXISTS club_identity_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, case_id INTEGER NOT NULL, club_id INTEGER NOT NULL,
      actor TEXT NOT NULL, decision TEXT NOT NULL, note TEXT NOT NULL, snapshot TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );
  `);
  db.prepare("UPDATE clubs SET name_key = club_normalize(name) WHERE name_key = ''").run();
  cleanupIdentityMaterials(db);
}
function cleanupIdentityMaterials(db) {
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const now = new Date().toISOString();
  db.prepare(`UPDATE club_verifications SET source_url='', evidence='', contact='', materials_deleted_at=?
    WHERE (status IN ('verified','rejected','revoked') OR (status='review' AND (owner_id != (SELECT c.owner_id FROM clubs c WHERE c.id=club_verifications.club_id) OR id < (SELECT MAX(v.id) FROM club_verifications v WHERE v.club_id=club_verifications.club_id)))) AND reviewed_at != '' AND reviewed_at < ? AND materials_deleted_at=''`).run(now, cutoff);
  db.prepare(`UPDATE club_identity_reports SET source_url='', contact='', detail='', materials_deleted_at=?
    WHERE status IN ('restricted','restored','renamed','dismissed') AND reviewed_at != '' AND reviewed_at < ? AND materials_deleted_at=''`).run(now, cutoff);
  const year = new Date(Date.now() - 365 * 86400000).toISOString();
  db.prepare("DELETE FROM club_identity_events WHERE created_at < ?").run(year);
  db.prepare("DELETE FROM club_identity_reports WHERE status IN ('restored','renamed','dismissed') AND reviewed_at != '' AND reviewed_at < ?").run(year);
  db.prepare(`DELETE FROM club_verifications WHERE reviewed_at != '' AND reviewed_at < ? AND
    (status IN ('rejected','revoked') OR (status='review' AND id < (SELECT MAX(v.id) FROM club_verifications v WHERE v.club_id=club_verifications.club_id)))`).run(year);
}
function publicIdentity(db, club) {
  const v = db.prepare("SELECT organization, scope, reviewed_at FROM club_verifications WHERE club_id=? AND owner_id=? AND status='verified' ORDER BY id DESC LIMIT 1").get(club.id, club.owner_id);
  return { city: club.city || "", intro: club.intro || "", verified: Boolean(v && club.public_status !== "restricted"), verifiedAt: v ? v.reviewed_at : "", verificationScope: v ? v.scope : "", organization: v ? v.organization : "", publicStatus: club.public_status || "active" };
}
function invalidateVerification(db, clubId, note, actor = "system") {
  const rows = db.prepare("SELECT id FROM club_verifications WHERE club_id=? AND status IN ('verified','pending','supplement')").all(clubId);
  const now = new Date().toISOString();
  for (const row of rows) {
    db.prepare("UPDATE club_verifications SET status='review', note=?, updated_at=?, reviewed_at=? WHERE id=?").run(note, now, now, row.id);
    db.prepare("INSERT INTO club_identity_events(kind,case_id,club_id,actor,decision,note,created_at) VALUES('verification',?,?,?,'review',?,?)").run(row.id, clubId, actor, note, now);
  }
}
function createClub(db, user, body) {
  const name = text(body.name, 40), city = text(body.city, 30), intro = text(body.intro, 80);
  if (!validName(name)) return problem("跑团名用 1 到 20 个字，不包含隐藏字符或核验标记");
  if (!city || [...city].length > 30 || HIDDEN.test(city)) return problem("请填写活动城市，最多 30 个字");
  if ([...intro].length > 80 || HIDDEN.test(intro)) return problem("一句话介绍最多 80 个字，不包含隐藏字符");
  const requestId = body.requestId == null ? crypto.randomUUID() : text(body.requestId, 100);
  if (!/^[\w:-]{8,100}$/.test(requestId)) return problem("创建请求标识无效，请重新提交");
  const applicationId = Number(body.applicationId || 0);
  if (!Number.isSafeInteger(applicationId) || applicationId < 0) return problem("旧申请无效");
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ name, city, intro, applicationId })).digest("hex");
  return db.transaction(() => {
    const past = db.prepare("SELECT * FROM club_creations WHERE user_id=? AND request_id=?").get(user.id, requestId);
    if (past) {
      if (past.fingerprint !== fingerprint) return problem("该请求已用于其他创建，请重新提交", 409);
      const club = db.prepare("SELECT * FROM clubs WHERE id=? AND owner_id=?").get(past.club_id, user.id);
      if (!club) return problem("此创建请求已经完成，跑团已删除或移交", 409);
      return { club: { id: club.id, name: club.name, city: club.city, intro: club.intro, code: club.code, ...publicIdentity(db, club) }, pending: false };
    }
    if (applicationId) {
      const old = db.prepare("SELECT * FROM club_applications WHERE id=? AND user_id=? AND status='pending'").get(applicationId, user.id);
      if (!old) return problem("这条待处理申请不存在或已经处理", 409);
    }
    const dayCount = db.prepare("SELECT COUNT(*) n FROM club_creations WHERE user_id=? AND created_at>?").get(user.id, new Date(Date.now() - 86400000).toISOString()).n;
    if (dayCount >= 1) return problem("每 24 小时可创建 1 个跑团，请稍后再试；需要更多额度可联系平台", 429);
    if (db.prepare("SELECT COUNT(*) n FROM clubs WHERE owner_id=?").get(user.id).n >= 3) return problem("目前最多同时创建并管理 3 个跑团，需要更多额度可联系平台", 429);
    const now = new Date().toISOString();
    const code = crypto.randomBytes(6).toString("hex").toUpperCase();
    const id = Number(db.prepare("INSERT INTO clubs(name,city,intro,name_key,code,owner_id,created_at) VALUES(?,?,?,?,?,?,?)").run(name, city, intro, normalized(name), code, user.id, now).lastInsertRowid);
    db.prepare("INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,'owner')").run(id, user.id, now);
    db.prepare("INSERT INTO club_creations(user_id,request_id,fingerprint,club_id,created_at) VALUES(?,?,?,?,?)").run(user.id, requestId, fingerprint, id, now);
    if (applicationId) db.prepare("UPDATE club_applications SET status='approved',club_id=?,reviewed_at=?,reviewer='本人确认创建' WHERE id=?").run(id, now, applicationId);
    return { pending: false, club: { id, name, city, intro, code, verified: false, verifiedAt: "", organization: "", verificationScope: "", publicStatus: "active" } };
  }).immediate();
}
function directory(db, query, userId = 0) {
  const q = normalized(text(query.q, 40)), city = normalized(text(query.city, 30));
  const numeric = /^#?([1-9]\d*)$/.exec(q);
  const clubId = numeric ? Number(numeric[1]) : 0;
  const where = `c.public_status='active' AND (?=0 OR c.id=?) AND (?='' OR club_normalize(c.city)=?) AND
      (?='' OR c.id=? OR instr(club_normalize(c.name),?)>0 OR instr(club_normalize(u.nickname),?)>0 OR EXISTS(
        SELECT 1 FROM club_members m JOIN users manager ON manager.id=m.user_id
        WHERE m.club_id=c.id AND m.role='manager' AND instr(club_normalize(manager.nickname),?)>0))`;
  const params = [clubId, clubId, city, city, q, clubId, q, q, q];
  const total = db.prepare(`SELECT COUNT(*) n FROM clubs c LEFT JOIN users u ON u.id=c.owner_id WHERE ${where}`).get(...params).n;
  const window = finishPage(total, readPage({ ...query, page: query.page || 1 }));
  const rows = db.prepare(`SELECT c.*, u.nickname leader,
      (SELECT COUNT(*) FROM club_members m WHERE m.club_id=c.id) members,
      EXISTS(SELECT 1 FROM club_members m WHERE m.club_id=c.id AND m.user_id=?) joined,
      EXISTS(SELECT 1 FROM club_requests r WHERE r.club_id=c.id AND r.user_id=? AND r.status='pending') pending
    FROM clubs c LEFT JOIN users u ON u.id=c.owner_id WHERE ${where}
    ORDER BY CASE WHEN club_normalize(c.name)=? THEN 0 WHEN instr(club_normalize(c.name),?)=1 THEN 1 WHEN instr(club_normalize(c.name),?)>0 THEN 2 ELSE 3 END,
      club_normalize(c.name), club_normalize(c.city),
      EXISTS(SELECT 1 FROM club_verifications v WHERE v.club_id=c.id AND v.owner_id=c.owner_id AND v.status='verified') DESC,c.id ASC
    LIMIT ? OFFSET ?`).all(userId, userId, ...params, q, q, q, window.limit, window.offset);
  return { clubs: rows.map((row) => ({ id: row.id, name: row.name, leader: row.leader || "", members: row.members, memberCount: row.members, joined: Boolean(row.joined), pending: Boolean(row.pending), ...publicIdentity(db, row) })), ...pageFields(window) };
}

function verificationRow(row) {
  if (!row) return null;
  return { id: row.id, clubId: row.club_id, ownerId: row.owner_id, status: row.status, organization: row.organization, scope: row.scope, sourceUrl: row.source_url, evidence: row.evidence, contact: row.contact, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at, reviewedAt: row.reviewed_at, materialsDeletedAt: row.materials_deleted_at };
}
function reportRow(row) {
  return { id: row.id, clubId: row.club_id, clubName: row.club_name || "", type: row.type, status: row.status, detail: row.detail, sourceUrl: row.source_url, contact: row.contact, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at, reviewedAt: row.reviewed_at, materialsDeletedAt: row.materials_deleted_at };
}
function sourceUrl(value) {
  if (!value) return "";
  try { const url = new URL(value); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null; return value; } catch { return null; }
}
function mountClubIdentity(app, { BASE, getDb, userFrom, requireAdmin }) {
  // Text materials live only in SQLite; no external URL is fetched or attachment copied.
  // Run expiry independently of traffic so unattended closed cases are also cleared.
  const cleanupTimer = setInterval(() => {
    try { cleanupIdentityMaterials(getDb()); } catch (err) { console.error("club identity material cleanup failed:", err.message); }
  }, 6 * 3600 * 1000);
  cleanupTimer.unref();
  function userGate(req, res) { const user = userFrom(req); if (!user) res.status(401).json({ error: "请先登录" }); else res.set("Cache-Control", "no-store"); return user; }
  function ownerGate(req, res) {
    const user = userGate(req, res); if (!user) return null;
    const club = getDb().prepare("SELECT * FROM clubs WHERE id=?").get(req.params.id);
    if (!club) { res.status(404).json({ error: "没有这个跑团" }); return null; }
    if (club.owner_id !== user.id) { res.status(403).json({ error: "只有本团团长可以管理跑团身份" }); return null; }
    return { user, club, db: getDb() };
  }
  app.get(BASE + "/api/clubs/:id/identity", (req, res) => {
    const ctx = ownerGate(req, res); if (!ctx) return;
    cleanupIdentityMaterials(ctx.db);
    const row = ctx.db.prepare("SELECT * FROM club_verifications WHERE club_id=? AND owner_id=? ORDER BY id DESC LIMIT 1").get(ctx.club.id, ctx.user.id);
    res.json({ club: { id: ctx.club.id, name: ctx.club.name, ...publicIdentity(ctx.db, ctx.club), leader: ctx.user.nickname, moderationNote: ctx.club.moderation_note || "" }, verification: verificationRow(row), moderationNote: ctx.club.moderation_note || "" });
  });
  app.put(BASE + "/api/clubs/:id/profile", (req, res) => {
    const ctx = ownerGate(req, res); if (!ctx) return;
    const body = req.body || {}, name = text(body.name, 40), city = text(body.city, 30), intro = text(body.intro, 80);
    if (!validName(name) || !city || [...city].length > 30 || [...intro].length > 80 || HIDDEN.test(city + intro)) return res.status(400).json({ error: "请检查名称、城市和介绍" });
    const result = ctx.db.transaction(() => {
      const current = ctx.db.prepare("SELECT * FROM clubs WHERE id=?").get(ctx.club.id);
      if (!current || current.owner_id !== ctx.user.id) return problem("团长已经变更，请刷新页面", 403);
      if (normalized(name) !== normalized(current.name) || normalized(city) !== normalized(current.city)) invalidateVerification(ctx.db, ctx.club.id, "跑团名称或活动城市已变更，请补充当前管理授权后复核", "owner:" + ctx.user.id);
      ctx.db.prepare("UPDATE clubs SET name=?,city=?,intro=?,name_key=? WHERE id=?").run(name, city, intro, normalized(name), ctx.club.id);
      return { ok: true };
    }).immediate();
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });
  app.post(BASE + "/api/clubs/:id/identity", (req, res) => {
    const ctx = ownerGate(req, res); if (!ctx) return;
    const b = req.body || {}, organization = text(b.organization, 80), scope = text(b.scope, 80), evidence = text(b.evidence, 4000), contact = text(b.contact, 200), url = sourceUrl(text(b.sourceUrl, 1000));
    if (!organization || organization.length > 80 || !scope || scope.length > 80 || !contact || contact.length > 200 || evidence.length > 4000 || url === null || (url && url.length > 1000) || (!url && !evidence)) return res.status(400).json({ error: "请填写组织名称、授权范围、私密联系方式，并提供公共渠道或可核对的授权说明" });
    const result = ctx.db.transaction(() => {
      const freshClub = ctx.db.prepare("SELECT owner_id FROM clubs WHERE id=?").get(ctx.club.id);
      if (!freshClub || freshClub.owner_id !== ctx.user.id) return problem("团长已经变更，请刷新页面", 403);
      const old = ctx.db.prepare("SELECT * FROM club_verifications WHERE club_id=? AND owner_id=? ORDER BY id DESC LIMIT 1").get(ctx.club.id, ctx.user.id);
      const now = new Date().toISOString();
      if (old && old.status === "pending") return problem("材料已提交，等待平台核验；需要补充时会在这里通知", 409);
      if (old && old.status === "verified" && old.organization === organization && old.scope === scope && old.source_url === url && old.evidence === evidence) {
        ctx.db.prepare("UPDATE club_verifications SET contact=?,updated_at=? WHERE id=?").run(contact, now, old.id);
        return { verification: verificationRow(ctx.db.prepare("SELECT * FROM club_verifications WHERE id=?").get(old.id)) };
      }
      if (old && old.status === "verified") invalidateVerification(ctx.db, ctx.club.id, "组织身份材料变更，正在重新核验", "owner:" + ctx.user.id);
      if (old && old.status === "supplement") {
        ctx.db.prepare("UPDATE club_verifications SET status='review',updated_at=?,reviewed_at=? WHERE id=?").run(now, now, old.id);
        ctx.db.prepare("INSERT INTO club_identity_events(kind,case_id,club_id,actor,decision,note,created_at) VALUES('verification',?,?,?,'superseded','已补交新材料，旧记录保留供追溯',?)").run(old.id, ctx.club.id, "owner:" + ctx.user.id, now);
      }
      const id = Number(ctx.db.prepare("INSERT INTO club_verifications(club_id,owner_id,organization,scope,source_url,evidence,contact,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(ctx.club.id, ctx.user.id, organization, scope, url, evidence, contact, now, now).lastInsertRowid);
      ctx.db.prepare("INSERT INTO club_identity_events(kind,case_id,club_id,actor,decision,note,created_at) VALUES('verification',?,?,?,'submit','提交组织管理授权核验',?)").run(id, ctx.club.id, "owner:" + ctx.user.id, now);
      return { verification: verificationRow(ctx.db.prepare("SELECT * FROM club_verifications WHERE id=?").get(id)) };
    }).immediate();
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });
  app.post(BASE + "/api/clubs/:id/reports", (req, res) => {
    const user = userGate(req, res); if (!user) return;
    const db = getDb(), club = db.prepare("SELECT * FROM clubs WHERE id=?").get(req.params.id);
    if (!club) return res.status(404).json({ error: "没有这个跑团" });
    const b = req.body || {}, type = text(b.type, 30), detail = text(b.detail, 4000), contact = text(b.contact, 200), url = sourceUrl(text(b.sourceUrl, 1000));
    if (!["impersonation", "confusion", "management"].includes(type) || !detail || detail.length > 4000 || !contact || contact.length > 200 || url === null || (url && url.length > 1000)) return res.status(400).json({ error: "请选择反馈类型，填写具体情况和私密联系方式" });
    const result = db.transaction(() => {
      const old = db.prepare("SELECT * FROM club_identity_reports WHERE club_id=? AND user_id=? AND type=? AND status IN ('pending','supplement') ORDER BY id DESC LIMIT 1").get(club.id, user.id, type);
      const now = new Date().toISOString();
      if (old && old.status === "pending") {
        if (old.detail === detail && old.source_url === url && old.contact === contact) return { outcome: "unchanged", report: reportRow({ ...old, club_name: club.name }) };
        db.prepare("UPDATE club_identity_reports SET detail=?,source_url=?,contact=?,updated_at=? WHERE id=?").run(detail, url, contact, now, old.id);
        db.prepare("INSERT INTO club_identity_events(kind,case_id,club_id,actor,decision,note,created_at) VALUES('report',?,?,?,'update','更新待处理反馈材料',?)").run(old.id, club.id, "user:" + user.id, now);
        return { outcome: "updated", report: reportRow({ ...db.prepare("SELECT * FROM club_identity_reports WHERE id=?").get(old.id), club_name: club.name }) };
      }
      if (old) {
        db.prepare("UPDATE club_identity_reports SET detail=?,source_url=?,contact=?,status='pending',updated_at=?,reviewed_at='',reviewer='',materials_deleted_at='' WHERE id=?").run(detail, url, contact, now, old.id);
        db.prepare("INSERT INTO club_identity_events(kind,case_id,club_id,actor,decision,note,created_at) VALUES('report',?,?,?,'resubmit','补充名称或身份反馈',?)").run(old.id, club.id, "user:" + user.id, now);
        return { outcome: "updated", report: reportRow({ ...db.prepare("SELECT * FROM club_identity_reports WHERE id=?").get(old.id), club_name: club.name }) };
      }
      const id = Number(db.prepare("INSERT INTO club_identity_reports(club_id,user_id,type,detail,source_url,contact,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(club.id, user.id, type, detail, url, contact, now, now).lastInsertRowid);
      db.prepare("INSERT INTO club_identity_events(kind,case_id,club_id,actor,decision,note,snapshot,created_at) VALUES('report',?,?,?,'submit','提交名称或身份反馈',?,?)").run(id, club.id, "user:" + user.id, JSON.stringify({ name: club.name, city: club.city, ownerId: club.owner_id }), now);
      return { outcome: "created", report: reportRow({ ...db.prepare("SELECT * FROM club_identity_reports WHERE id=?").get(id), club_name: club.name }) };
    }).immediate();
    res.json(result);
  });
  app.get(BASE + "/api/me/club-reports", (req, res) => {
    const user = userGate(req, res); if (!user) return;
    cleanupIdentityMaterials(getDb());
    const rows = getDb().prepare("SELECT r.*,c.name club_name FROM club_identity_reports r LEFT JOIN clubs c ON c.id=r.club_id WHERE r.user_id=? ORDER BY r.id DESC").all(user.id);
    res.json({ reports: rows.map(reportRow) });
  });
  app.get(BASE + "/api/admin/club-identity", (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.set("Cache-Control", "no-store");
    const db = getDb(); cleanupIdentityMaterials(db);
    const kind = req.query.kind === "report" ? "report" : "verification";
    const table = kind === "report" ? "club_identity_reports" : "club_verifications";
    const applicantColumn = kind === "report" ? "user_id" : "owner_id";
    const rows = db.prepare(`SELECT x.*,c.name club_name,c.city,c.owner_id current_owner_id,u.nickname owner,a.nickname applicant_nickname
      FROM ${table} x LEFT JOIN clubs c ON c.id=x.club_id LEFT JOIN users u ON u.id=c.owner_id
      LEFT JOIN users a ON a.id=x.${applicantColumn} ORDER BY x.id DESC`).all();
    const page = slicePage(rows, { ...req.query, page: req.query.page || 1 });
    res.json({ ...page, rows: page.rows.map((row) => ({ ...(kind === "report" ? reportRow(row) : verificationRow(row)), clubName: row.club_name || "已删除跑团", city: row.city || "", owner: row.owner || "", ...(kind === "report" ? { reporterNickname: row.applicant_nickname || "" } : { ownerNickname: row.applicant_nickname || "" }), currentOwnerId: row.current_owner_id, events: db.prepare("SELECT actor,decision,note,created_at AS createdAt FROM club_identity_events WHERE kind=? AND case_id=? ORDER BY id").all(kind, row.id) })) });
  });
  app.post(BASE + "/api/admin/club-identity/:kind/:id/decision", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb(), kind = req.params.kind, b = req.body || {}, decision = text(b.decision, 20), note = text(b.note, 1000);
    if (!["verification", "report"].includes(kind) || !note || note.length > 1000) return res.status(400).json({ error: "请选择案件类型并填写可向当事人说明的脱敏处理理由，勿包含私人材料" });
    const allowed = kind === "verification" ? ["approve", "supplement", "reject", "revoke"] : ["supplement", "restrict", "restore", "rename", "dismiss"];
    if (!allowed.includes(decision)) return res.status(400).json({ error: "处理动作无效" });
    if (kind === "report" && decision === "rename" && !validName(text(b.name, 40))) return res.status(400).json({ error: "更正后的跑团名用 1 到 20 个字" });
    const result = db.transaction(() => {
      const table = kind === "verification" ? "club_verifications" : "club_identity_reports";
      const row = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(req.params.id);
      if (!row) return problem("没有这条案件", 404);
      const club = db.prepare("SELECT * FROM clubs WHERE id=?").get(row.club_id);
      if (!club) return problem("该跑团已删除", 409);
      if (kind === "verification" && decision !== "revoke" && (row.owner_id !== club.owner_id || row.id !== db.prepare("SELECT MAX(id) id FROM club_verifications WHERE club_id=?").get(club.id).id)) return problem("负责人或核验材料已经变化，请处理当前申请", 409);
      if (kind === "report" && row.type === "confusion" && ["restrict", "rename"].includes(decision)) return problem("仅同名混淆不能作为限制或改名依据；如有具体冒用证据，请另行核对", 400);
      const now = new Date().toISOString(), actor = req.adminUser || "platform-admin";
      let status;
      if (kind === "verification") {
        status = { approve: "verified", supplement: "supplement", reject: "rejected", revoke: "revoked" }[decision];
        if (decision === "approve" && !["pending", "supplement", "review"].includes(row.status)) return problem("当前申请状态不能通过，请核对材料", 409);
        if (decision === "approve") db.prepare("UPDATE club_verifications SET status='revoked',note='已有新的核验决定',updated_at=? WHERE club_id=? AND id!=? AND status='verified'").run(now, club.id, row.id);
      } else {
        if (decision === "supplement") db.prepare("UPDATE clubs SET moderation_note=? WHERE id=?").run(note, club.id);
        status = { supplement: "supplement", restrict: "restricted", restore: "restored", rename: "renamed", dismiss: "dismissed" }[decision];
        if (["restrict", "restore", "rename"].includes(decision)) {
          db.prepare("UPDATE clubs SET public_status=?,moderation_note=? WHERE id=?").run(decision === "restrict" ? "restricted" : "active", note, club.id);
          if (decision === "rename") {
            const name = text(b.name, 40); if (!validName(name)) return problem("更正后的跑团名用 1 到 20 个字");
            db.prepare("UPDATE clubs SET name=?,name_key=? WHERE id=?").run(name, normalized(name), club.id);
          }
          if (decision !== "restore") invalidateVerification(db, club.id, "公开身份呈现需更正，补充授权材料后可申请复核", actor);
        }
      }
      db.prepare(`UPDATE ${table} SET status=?,note=?,updated_at=?,reviewed_at=?,reviewer=? WHERE id=?`).run(status, note, now, now, actor, row.id);
      db.prepare("INSERT INTO club_identity_events(kind,case_id,club_id,actor,decision,note,snapshot,created_at) VALUES(?,?,?,?,?,?,?,?)").run(kind, row.id, club.id, actor, decision, note, JSON.stringify({ name: club.name, city: club.city, ownerId: club.owner_id, publicStatus: club.public_status }), now);
      return { ok: true, status };
    }).immediate();
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });
}
module.exports = { installClubIdentity, publicIdentity, createClub, directory, mountClubIdentity, invalidateVerification, normalized, cleanupIdentityMaterials };
