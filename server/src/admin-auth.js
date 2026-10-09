const crypto = require("crypto");

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

function ensureAdmin(db) {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM admins").get().n;
  if (existing) return false;
  const username = String(process.env.ADMIN_USER || "").trim();
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (!username || username.length > 32 || password.length < 8 || password.length > 128) return false;
  const salt = crypto.randomBytes(16).toString("hex");
  db.prepare("INSERT INTO admins (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)").run(
    username,
    passwordHash(password, salt),
    salt,
    new Date().toISOString()
  );
  return true;
}

function loginAdmin(db, username, password) {
  ensureAdmin(db);
  const name = String(username || "").trim();
  const pass = String(password || "");
  if (!name || !pass) return { error: "填写用户名和密码", status: 400 };
  const row = db.prepare("SELECT username, password_hash, salt FROM admins WHERE username = ?").get(name);
  const ok = verifyPassword(pass, row ? row.salt : DUMMY_SALT, row ? row.password_hash : dummyPasswordHash());
  if (!row || !ok) return { error: "用户名或密码不对", status: 401 };
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(new Date().toISOString());
  db.prepare("INSERT INTO admin_sessions (token_hash, username, expires_at) VALUES (?, ?, ?)").run(tokenHash(token), row.username, expires);
  return { token };
}

function adminSession(db, token) {
  const raw = String(token || "");
  if (!raw || raw.length > 200) return "";
  const row = db.prepare("SELECT username, expires_at FROM admin_sessions WHERE token_hash = ?").get(tokenHash(raw));
  if (!row) return "";
  if (row.expires_at <= new Date().toISOString()) {
    db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash(raw));
    return "";
  }
  return row.username;
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

module.exports = { ensureAdmin, loginAdmin, adminSession, logoutAdmin, changeAdminPassword };
