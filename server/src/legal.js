const { finishPage, readPage, pageFields } = require("./page");
const source = require("../../shared/legal-documents.json");

const TYPES = new Set(["access", "copy", "correct", "delete", "withdraw", "close", "other"]);
const ACTIVE = ["pending", "processing", "needs_info"];
const TERMINAL = ["completed", "rejected"];
const DAY = 86400000;

function configured(name) {
  return String(process.env[name] || "").trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 300);
}

function legalDocuments() {
  const result = JSON.parse(JSON.stringify(source));
  const fields = {
    contactEmail: configured("LEGAL_CONTACT_EMAIL"),
    address: configured("LEGAL_CONTACT_ADDRESS"),
    storageRegion: configured("LEGAL_STORAGE_REGION"),
    hostingProvider: configured("LEGAL_HOSTING_ENTITY")
  };
  const missing = Object.keys(fields).filter((key) => !fields[key]);
  if (fields.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.contactEmail)) missing.push("validContactEmail");
  if (process.env.LEGAL_OPERATOR_CONFIRMED !== "true") missing.push("operatorConfirmation");
  if (process.env.LEGAL_PUBLICATION_CONFIRMED !== "true") missing.push("publicationConfirmation");
  const effectiveDate = configured("LEGAL_EFFECTIVE_DATE");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) && Number(effectiveDate.slice(0, 4)) > 0 ? new Date(effectiveDate + "T00:00:00.000Z") : null;
  const validDate = date && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === effectiveDate;
  if (!validDate) missing.push("effectiveDate");
  if (validDate) result.effectiveDate = effectiveDate;
  result.operator = { ...result.operator, ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value)) };
  result.ready = missing.length === 0;
  result.operator.status = result.ready ? "confirmed" : "pending-confirmation";
  result.publication = { ready: result.ready, missing };
  return result;
}

function consentError(consent, required = false) {
  if (consent === undefined) return required ? { error: "请阅读并明确同意当前用户协议和隐私政策后创建账号", status: 428 } : null;
  if (!consent || typeof consent !== "object" || Array.isArray(consent) || consent.accepted !== true || typeof consent.version !== "string") return { error: "请明确勾选同意当前用户协议和隐私政策", status: 400 };
  if (consent.version !== source.version) return { error: "协议版本已更新，请重新阅读并确认", status: 409 };
  return null;
}

function recordAcceptance(db, userId, consent, origin, scope = "terms") {
  if (consent === undefined) return;
  db.prepare("INSERT OR IGNORE INTO legal_acceptances(user_id,version,scope,accepted_at,source) VALUES(?,?,?,?,?)")
    .run(userId, source.version, scope, new Date().toISOString(), origin);
}

function installLegal(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS legal_acceptances (
      user_id INTEGER NOT NULL, version TEXT NOT NULL, scope TEXT NOT NULL,
      accepted_at TEXT NOT NULL, source TEXT NOT NULL, PRIMARY KEY(user_id,version,scope)
    );
    CREATE TABLE IF NOT EXISTS privacy_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', detail TEXT NOT NULL, response TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, closed_at TEXT NOT NULL DEFAULT '',
      materials_deleted_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS privacy_requests_user ON privacy_requests(user_id,created_at);
    CREATE TABLE IF NOT EXISTS privacy_request_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER NOT NULL,
      actor TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS privacy_request_events_request ON privacy_request_events(request_id);
  `);
  cleanupPrivacyRequests(db);
}

function cleanupPrivacyRequests(db, now = Date.now()) {
  const cutoff = new Date(now - 90 * DAY).toISOString();
  const year = new Date(now - 365 * DAY).toISOString();
  db.transaction(() => {
    db.prepare("UPDATE privacy_requests SET detail='',response='',materials_deleted_at=? WHERE status IN ('completed','rejected') AND closed_at != '' AND closed_at < ? AND materials_deleted_at=''")
      .run(new Date(now).toISOString(), cutoff);
    db.prepare("DELETE FROM privacy_request_events WHERE created_at < ? OR request_id IN (SELECT id FROM privacy_requests WHERE status IN ('completed','rejected') AND closed_at != '' AND closed_at < ?)").run(year, year);
    db.prepare("DELETE FROM privacy_requests WHERE status IN ('completed','rejected') AND closed_at != '' AND closed_at < ?").run(year);
  })();
}

function deleteLegalUser(db, userId) {
  db.prepare("DELETE FROM privacy_request_events WHERE request_id IN (SELECT id FROM privacy_requests WHERE user_id=?)").run(userId);
  db.prepare("DELETE FROM privacy_requests WHERE user_id=?").run(userId);
  db.prepare("DELETE FROM legal_acceptances WHERE user_id=?").run(userId);
}

function pack(row, admin = false) {
  const result = { id: row.id, type: row.type, status: row.status, detail: row.detail, response: row.response, createdAt: row.created_at, updatedAt: row.updated_at };
  if (admin) Object.assign(result, { userId: row.user_id, userNickname: row.user_nickname || "" });
  return result;
}

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function text(raw) { return typeof raw === "string" ? raw.trim() : ""; }
function validDetail(raw) {
  const value = text(raw);
  if (value.length < 2 || value.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail("说明或回复须为 2 到 2000 个字");
  return value;
}

function mountLegal(app, { BASE, getDb, userFrom, requireAdmin }) {
  const timer = setInterval(() => {
    try { cleanupPrivacyRequests(getDb()); } catch (err) { console.error("privacy request cleanup failed:", err.message); }
  }, 6 * 3600 * 1000);
  timer.unref();
  const wrap = (fn) => (req, res) => {
    res.set("Cache-Control", "private, no-store");
    try { fn(req, res); } catch (err) { res.status(err.status || 500).json({ error: err.status ? err.message : "暂时无法处理，请稍后重试" }); }
  };
  const ownRows = (db, id) => db.prepare("SELECT * FROM privacy_requests WHERE user_id=? ORDER BY created_at DESC,id DESC").all(id).map((row) => pack(row));
  const login = (req) => { const user = userFrom(req); if (!user) fail("请先登录", 401); return user; };
  app.get(BASE + "/api/legal", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(legalDocuments());
  });
  app.get(BASE + "/api/me/privacy-requests", wrap((req, res) => {
    const user = login(req), db = getDb(); cleanupPrivacyRequests(db);
    res.json({ requests: ownRows(db, user.id) });
  }));
  app.post(BASE + "/api/me/privacy-requests", wrap((req, res) => {
    const user = login(req), db = getDb(), body = req.body || {};
    if (!TYPES.has(body.type)) fail("请选择有效的个人信息申请类型");
    const detail = validDetail(body.detail);
    cleanupPrivacyRequests(db);
    const id = db.transaction(() => {
      const same = db.prepare("SELECT * FROM privacy_requests WHERE user_id=? AND type=? AND status IN ('pending','processing','needs_info') ORDER BY id DESC").all(user.id, body.type);
      const now = new Date().toISOString();
      const supplement = same.find((row) => row.status === "needs_info");
      if (supplement) {
        db.prepare("UPDATE privacy_requests SET detail=?,response='',status='pending',updated_at=?,closed_at='',materials_deleted_at='' WHERE id=?").run(detail, now, supplement.id);
        db.prepare("INSERT INTO privacy_request_events(request_id,actor,status,created_at) VALUES(?,?,'pending',?)").run(supplement.id, "user:" + user.id, now);
        return supplement.id;
      }
      const duplicate = same.find((row) => row.detail === detail);
      if (duplicate) return duplicate.id;
      const recent = db.prepare("SELECT COUNT(*) n FROM privacy_requests WHERE user_id=? AND created_at>?").get(user.id, new Date(Date.now() - DAY).toISOString()).n;
      const active = db.prepare("SELECT COUNT(*) n FROM privacy_requests WHERE user_id=? AND status IN ('pending','processing','needs_info')").get(user.id).n;
      if (recent >= 3) fail("24 小时内最多提交 3 条新申请，请先查看已有申请或补充材料", 429);
      if (active >= 10) fail("您有较多待处理申请，请先等待回复或补充已有申请", 429);
      const inserted = db.prepare("INSERT INTO privacy_requests(user_id,type,detail,created_at,updated_at) VALUES(?,?,?,?,?)").run(user.id, body.type, detail, now, now);
      db.prepare("INSERT INTO privacy_request_events(request_id,actor,status,created_at) VALUES(?,?,'pending',?)").run(inserted.lastInsertRowid, "user:" + user.id, now);
      return Number(inserted.lastInsertRowid);
    }).immediate();
    res.json({ requests: ownRows(db, user.id), request: pack(db.prepare("SELECT * FROM privacy_requests WHERE id=?").get(id)) });
  }));
  app.get(BASE + "/api/admin/privacy-requests", wrap((req, res) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb(); cleanupPrivacyRequests(db);
    const status = text(req.query.status);
    if (status && ![...ACTIVE, ...TERMINAL].includes(status)) fail("申请状态不正确");
    const where = status ? " WHERE p.status=?" : "", params = status ? [status] : [];
    const total = db.prepare("SELECT COUNT(*) n FROM privacy_requests p" + where).get(...params).n;
    const window = finishPage(total, readPage({ ...req.query, page: req.query.page || 1 }));
    const rows = db.prepare("SELECT p.*,u.nickname user_nickname FROM privacy_requests p JOIN users u ON u.id=p.user_id" + where + " ORDER BY p.updated_at DESC,p.id DESC LIMIT ? OFFSET ?").all(...params, window.limit, window.offset).map((row) => pack(row, true));
    res.json({ rows, ...pageFields(window) });
  }));
  app.post(BASE + "/api/admin/privacy-requests/:id/decision", wrap((req, res) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb(), body = req.body || {};
    if (!["processing", "needs_info", ...TERMINAL].includes(body.status)) fail("请选择有效的办理状态");
    const response = validDetail(body.response);
    if (!/^[1-9]\d*$/.test(req.params.id)) fail("没有这条申请", 404);
    cleanupPrivacyRequests(db);
    db.transaction(() => {
      const row = db.prepare("SELECT id FROM privacy_requests WHERE id=?").get(req.params.id);
      if (!row) fail("没有这条申请", 404);
      const now = new Date().toISOString();
      db.prepare("UPDATE privacy_requests SET status=?,response=?,updated_at=?,closed_at=?,materials_deleted_at='' WHERE id=?")
        .run(body.status, response, now, TERMINAL.includes(body.status) ? now : "", row.id);
      // Keep the audit minimal; do not duplicate request text or the private reply.
      db.prepare("INSERT INTO privacy_request_events(request_id,actor,status,created_at) VALUES(?,?,?,?)").run(row.id, "admin:" + (req.adminUser || "platform"), body.status, now);
    }).immediate();
    const row = db.prepare("SELECT p.*,u.nickname user_nickname FROM privacy_requests p JOIN users u ON u.id=p.user_id WHERE p.id=?").get(req.params.id);
    res.json({ request: pack(row, true) });
  }));
}

module.exports = { installLegal, legalDocuments, consentError, recordAcceptance, cleanupPrivacyRequests, deleteLegalUser, mountLegal };
