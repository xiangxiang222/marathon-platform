const crypto = require("crypto");
const { createCaptcha, codesMatch } = require("./captcha");
const { passwordHash, verifyPassword } = require("./admin-auth");

function nicknameOf(raw) {
  const nickname = String(raw || "").trim();
  if (!nickname || nickname.length > 20) return "";
  return nickname;
}

function passwordOf(raw) {
  const password = String(raw || "");
  if (password.length < 8 || password.length > 128) return "";
  return password;
}

function issueToken(db, id) {
  const token = crypto.randomBytes(24).toString("hex");
  db.prepare("UPDATE users SET token = ? WHERE id = ?").run(token, id);
  const row = db.prepare("SELECT id, nickname FROM users WHERE id = ?").get(id);
  return { token, user: { id: row.id, nickname: row.nickname } };
}

function storePassword(db, id, password) {
  const salt = crypto.randomBytes(16).toString("hex");
  db.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?").run(passwordHash(password, salt), salt, id);
}

function issueCaptcha(db) {
  const { code, image } = createCaptcha();
  const token = crypto.randomBytes(16).toString("hex");
  const expireAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  db.prepare("DELETE FROM captchas WHERE used = 1 OR expire_at < ?").run(new Date().toISOString());
  db.prepare("INSERT INTO captchas (token, code, used, expire_at) VALUES (?, ?, 0, ?)").run(token, code, expireAt);
  return { token, image };
}

function consumeCaptcha(db, token, input) {
  const row = db
    .prepare("SELECT id, code FROM captchas WHERE token = ? AND used = 0 AND expire_at >= ?")
    .get(String(token || ""), new Date().toISOString());
  if (!row) return false;
  db.prepare("UPDATE captchas SET used = 1 WHERE id = ?").run(row.id);
  return codesMatch(row.code, input);
}

function registerUser(db, body) {
  const nickname = nicknameOf(body && body.nickname);
  const password = passwordOf(body && body.password);
  if (!nickname) return { error: "昵称用 1 到 20 个字", status: 400 };
  if (!password) return { error: "密码用 8 到 128 位", status: 400 };
  const rows = db.prepare("SELECT id, password_hash FROM users WHERE nickname = ?").all(nickname);
  const armed = rows.filter((row) => row.password_hash);
  const open = rows.filter((row) => !row.password_hash);
  if (armed.length) return { error: "这个昵称已经注册，请登录", status: 400 };
  if (open.length > 1) return { error: "这个昵称有冲突，换一个", status: 400 };
  if (open.length === 1) {
    storePassword(db, open[0].id, password);
    return issueToken(db, open[0].id);
  }
  const token = crypto.randomBytes(24).toString("hex");
  const salt = crypto.randomBytes(16).toString("hex");
  const info = db
    .prepare("INSERT INTO users (nickname, token, created_at, password_hash, salt) VALUES (?, ?, ?, ?, ?)")
    .run(nickname, token, new Date().toISOString(), passwordHash(password, salt), salt);
  return { token, user: { id: Number(info.lastInsertRowid), nickname } };
}

function loginUser(db, body) {
  if (!consumeCaptcha(db, body && body.captchaToken, body && body.captcha)) {
    return { error: "验证码错误或已过期", status: 400 };
  }
  const nickname = nicknameOf(body && body.nickname);
  const password = String((body && body.password) || "");
  if (!nickname || !password) return { error: "昵称或密码错误", status: 400 };
  const rows = db.prepare("SELECT id, password_hash, salt FROM users WHERE nickname = ?").all(nickname);
  const armed = rows.filter((row) => row.password_hash);
  if (!armed.length) {
    if (rows.length > 1) return { error: "这个昵称有冲突，换一个", status: 400 };
    if (rows.length) return { error: "这个昵称还没设密码，去注册", status: 400 };
    return { error: "昵称或密码错误", status: 400 };
  }
  const hits = armed.filter((row) => verifyPassword(password, row.salt, row.password_hash));
  if (hits.length > 1) return { error: "这个昵称有冲突", status: 400 };
  if (!hits.length) return { error: "昵称或密码错误", status: 400 };
  return issueToken(db, hits[0].id);
}

function setUserPassword(db, id, password) {
  const pass = passwordOf(password);
  if (!pass) return { error: "密码用 8 到 128 位", status: 400 };
  const row = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!row) return { error: "没有这个人", status: 404 };
  storePassword(db, id, pass);
  return { ok: true };
}

function changeOwnPassword(db, userId, current, next) {
  const pass = passwordOf(next);
  if (!pass) return { error: "密码用 8 到 128 位", status: 400 };
  const row = db.prepare("SELECT password_hash, salt FROM users WHERE id = ?").get(userId);
  if (!row) return { error: "没有这个人", status: 404 };
  if (row.password_hash) {
    if (!String(current || "")) return { error: "填写当前密码", status: 400 };
    if (!verifyPassword(String(current), row.salt, row.password_hash)) return { error: "当前密码不对", status: 400 };
  }
  storePassword(db, userId, pass);
  return { ok: true };
}

module.exports = { issueCaptcha, registerUser, loginUser, setUserPassword, changeOwnPassword };
