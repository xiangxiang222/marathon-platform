const crypto = require("crypto");
const { ADMIN_ROLES, adminRoleLabel } = require("./roles");

const DUMMY_SALT = "0123456789abcdef0123456789abcdef";
let dummyHash = "";

function passwordHash(password, salt) {
  return crypto.scryptSync(String(password), String(salt), 32).toString("hex");
}

function hashesMatch(actualHex, expectedHex) {
  const actual = Buffer.from(actualHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function verifyPassword(password, salt, expectedHash) {
  return hashesMatch(passwordHash(password, salt), expectedHash);
}

function dummyPasswordHash() {
  if (!dummyHash) dummyHash = passwordHash("not-a-real-password", DUMMY_SALT);
  return dummyHash;
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function writeAdmin(db, username, password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = passwordHash(password, salt);
  const existing = db.prepare("SELECT 1 FROM admins WHERE username = ?").get(username);
  if (existing) {
    db.prepare("UPDATE admins SET password_hash = ?, salt = ? WHERE username = ?").run(hash, salt, username);
    return;
  }
  db.prepare("INSERT INTO admins (username, password_hash, salt, role, created_at) VALUES (?, ?, ?, 'admin', ?)").run(
    username,
    hash,
    salt,
    new Date().toISOString()
  );
}

function ensureAdmin(db) {
  const legacy = db.prepare("SELECT salt, password_hash FROM admins WHERE username = 'admin'").get();
  if (legacy && verifyPassword("admin", legacy.salt, legacy.password_hash)) {
    db.prepare("DELETE FROM admin_sessions WHERE username = 'admin'").run();
    db.prepare("DELETE FROM admins WHERE username = 'admin'").run();
  }
  const existing = db.prepare("SELECT COUNT(*) AS n FROM admins").get().n;
  if (existing) return false;
  const username = String(process.env.ADMIN_USER || "").trim();
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (!username || username.length > 32 || password.length < 8 || password.length > 128) return false;
  const salt = crypto.randomBytes(16).toString("hex");
  db.prepare("INSERT INTO admins (username, password_hash, salt, role, created_at) VALUES (?, ?, ?, 'admin', ?)").run(
    username,
    passwordHash(password, salt),
    salt,
    new Date().toISOString()
  );
  return true;
}

function accountName(username) {
  const name = String(username || "").trim();
  if (!/^[\w\u4e00-\u9fa5]{1,32}$/.test(name)) return "";
  return name;
}

function listAdmins(db) {
  return db
    .prepare("SELECT username, role, created_at FROM admins ORDER BY created_at, username")
    .all()
    .map((row) => ({
      username: row.username,
      role: row.role || "admin",
      roleLabel: adminRoleLabel(row.role || "admin"),
      createdAt: String(row.created_at).slice(0, 16).replace("T", " ")
    }));
}

function createAdmin(db, username, password, role) {
  const name = accountName(username);
  const pass = String(password || "");
  if (!ADMIN_ROLES.some((item) => item.id === role)) return { error: "没有这个角色", status: 400 };
  if (!name) return { error: "用户名用 1 到 32 个字", status: 400 };
  if (pass.length < 8 || pass.length > 128) return { error: "密码用 8 到 128 位", status: 400 };
  if (db.prepare("SELECT 1 FROM admins WHERE username = ?").get(name)) return { error: "已经有这个用户名", status: 400 };
  const salt = crypto.randomBytes(16).toString("hex");
  db.prepare("INSERT INTO admins (username, password_hash, salt, role, created_at) VALUES (?, ?, ?, ?, ?)").run(
    name,
    passwordHash(pass, salt),
    salt,
    role,
    new Date().toISOString()
  );
  return { account: { username: name, role, roleLabel: adminRoleLabel(role) } };
}

function setAdminRole(db, actor, username, role) {
  if (!ADMIN_ROLES.some((item) => item.id === role)) return { error: "没有这个角色", status: 400 };
  const name = accountName(username);
  if (!name) return { error: "没有这个账号", status: 404 };
  if (name === actor) return { error: "不能改自己的角色", status: 400 };
  const row = db.prepare("SELECT role FROM admins WHERE username = ?").get(name);
  if (!row) return { error: "没有这个账号", status: 404 };
  if ((row.role || "admin") === "admin" && role !== "admin") {
    const others = db.prepare("SELECT COUNT(*) AS n FROM admins WHERE role = 'admin' AND username != ?").get(name).n;
    if (!others) return { error: "至少留一个管理员", status: 400 };
  }
  db.prepare("UPDATE admins SET role = ? WHERE username = ?").run(role, name);
  return { ok: true };
}

function loginAdmin(db, username, password) {
  ensureAdmin(db);
  const name = String(username || "").trim();
  const pass = String(password || "");
  if (!name || !pass) return { error: "填写用户名和密码", status: 400 };
  const row = db.prepare("SELECT username, password_hash, salt, role FROM admins WHERE username = ?").get(name);
  const ok = verifyPassword(pass, row ? row.salt : DUMMY_SALT, row ? row.password_hash : dummyPasswordHash());
  if (!row || !ok) return { error: "用户名或密码不对", status: 401 };
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(new Date().toISOString());
  db.prepare("INSERT INTO admin_sessions (token_hash, username, expires_at) VALUES (?, ?, ?)").run(tokenHash(token), row.username, expires);
  const role = row.role || "admin";
  return { token, username: row.username, role, roleLabel: adminRoleLabel(role) };
}

function adminSession(db, token) {
  const raw = String(token || "");
  if (!raw || raw.length > 200) return "";
  const row = db
    .prepare(
      `SELECT s.username, s.expires_at, a.role
       FROM admin_sessions s
       JOIN admins a ON a.username = s.username
       WHERE s.token_hash = ?`
    )
    .get(tokenHash(raw));
  if (!row) return null;
  if (row.expires_at <= new Date().toISOString()) {
    db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash(raw));
    return null;
  }
  return { username: row.username, role: row.role || "admin" };
}

function logoutAdmin(db, token) {
  const raw = String(token || "");
  if (!raw) return;
  db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash(raw));
}

function changeAdminPassword(db, username, current, next) {
  if (!username) return { error: "请重新登录", status: 401 };
  const nextPass = String(next || "");
  if (nextPass.length < 8) return { error: "新密码至少 8 位", status: 400 };
  if (nextPass.length > 128) return { error: "新密码太长", status: 400 };
  const row = db.prepare("SELECT password_hash, salt FROM admins WHERE username = ?").get(username);
  if (!row || !verifyPassword(String(current || ""), row.salt, row.password_hash)) {
    return { error: "当前密码不对", status: 401 };
  }
  const salt = crypto.randomBytes(16).toString("hex");
  db.prepare("UPDATE admins SET password_hash = ?, salt = ? WHERE username = ?").run(passwordHash(nextPass, salt), salt, username);
  return { ok: true };
}

module.exports = {
  ensureAdmin,
  loginAdmin,
  adminSession,
  logoutAdmin,
  changeAdminPassword,
  listAdmins,
  createAdmin,
  setAdminRole,
  passwordHash,
  verifyPassword
};
