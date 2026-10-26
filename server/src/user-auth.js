const crypto = require("crypto");
const { createCaptcha, codesMatch } = require("./captcha");
const { passwordHash, verifyPassword } = require("./admin-auth");
const { avatarUrlOf } = require("./avatars");

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
  const row = db.prepare("SELECT id, nickname, avatar FROM users WHERE id = ?").get(id);
  return { token, user: { id: row.id, nickname: row.nickname, avatar: avatarUrlOf(row.id, row.avatar) } };
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

function createUser(db, body) {
  const nickname = nicknameOf(body && body.nickname);
  const password = passwordOf(body && body.password);
  if (!nickname) return { error: "昵称须为 1 到 20 个字", status: 400 };
  if (!password) return { error: "密码须为 8 到 128 位", status: 400 };
  const existing = db.prepare("SELECT id FROM users WHERE nickname = ? LIMIT 1").get(nickname);
  if (existing) return { error: "该昵称已存在，请在列表中编辑该账号", status: 400 };
  const token = crypto.randomBytes(24).toString("hex");
  const salt = crypto.randomBytes(16).toString("hex");
  const info = db
    .prepare("INSERT INTO users (nickname, token, created_at, password_hash, salt) VALUES (?, ?, ?, ?, ?)")
    .run(nickname, token, new Date().toISOString(), passwordHash(password, salt), salt);
  return { id: Number(info.lastInsertRowid), nickname };
}

function registerUser(db, body) {
  const nickname = nicknameOf(body && body.nickname);
  const password = passwordOf(body && body.password);
  if (!nickname) return { error: "昵称用 1 到 20 个字", status: 400 };
  if (!password) return { error: "密码用 8 到 128 位", status: 400 };
  const rows = db.prepare("SELECT id, password_hash FROM users WHERE nickname = ?").all(nickname);
  const armed = rows.filter((row) => row.password_hash);
  if (rows.length > 1 && !armed.length) return { error: "这个昵称有冲突，换一个", status: 400 };
  if (armed.length) return { error: "这个昵称已经注册，请登录", status: 400 };
  if (rows.length) return { error: "这个昵称已被使用，请联系平台管理员核验身份后重置密码", status: 400 };
  const token = crypto.randomBytes(24).toString("hex");
  const salt = crypto.randomBytes(16).toString("hex");
  const info = db
    .prepare("INSERT INTO users (nickname, token, created_at, password_hash, salt) VALUES (?, ?, ?, ?, ?)")
    .run(nickname, token, new Date().toISOString(), passwordHash(password, salt), salt);
  return { token, user: { id: Number(info.lastInsertRowid), nickname } };
}

async function verifyWechatCode(code, credentials, exchangeCode = exchangeWechatCode) {
  const loginCode = String(code || "").trim();
  if (!loginCode || loginCode.length > 256) return { error: "微信登录凭证无效，请重试", status: 400 };
  if (!credentials || !credentials.appId || !credentials.secret) return { error: "微信登录暂未配置", status: 503 };

  let identity;
  try {
    identity = await exchangeCode(loginCode, credentials);
  } catch (err) {
    return { error: "微信登录暂时不可用，请稍后重试", status: 502 };
  }
  if (!identity || !identity.openid || String(identity.openid).length > 200) return { error: "微信登录失败，请重试", status: 401 };
  return { openid: String(identity.openid) };
}

async function loginWechat(db, code, credentials, exchangeCode = exchangeWechatCode, options = {}) {
  const identity = await verifyWechatCode(code, credentials, exchangeCode);
  if (identity.error) return identity;

  let user = db.prepare("SELECT id FROM users WHERE openid = ?").get(identity.openid);
  if (!user) {
    if (!options || options.createAccount !== true) {
      return {
        status: 409,
        code: "WECHAT_REGISTRATION_REQUIRED",
        error: "该微信尚未关联账号，请登录已有账号后绑定，或选择创建新账号"
      };
    }
    const nickname = "跑者" + crypto.randomBytes(4).toString("hex");
    try {
      db.prepare("INSERT INTO users (nickname, token, created_at, openid) VALUES (?, ?, ?, ?)").run(
        nickname,
        crypto.randomBytes(24).toString("hex"),
        new Date().toISOString(),
        identity.openid
      );
    } catch (err) {
      if (!/UNIQUE/i.test(String(err.message))) throw err;
    }
    user = db.prepare("SELECT id FROM users WHERE openid = ?").get(identity.openid);
  }
  return issueToken(db, user.id);
}

async function exchangeWechatCode(code, credentials) {
  const query = new URLSearchParams({
    appid: credentials.appId,
    secret: credentials.secret,
    js_code: code,
    grant_type: "authorization_code"
  });
  const response = await fetch("https://api.weixin.qq.com/sns/jscode2session?" + query.toString(), {
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("WeChat identity service unavailable");
  const body = await response.json();
  if (body.errcode || !body.openid) throw new Error("WeChat login rejected");
  return { openid: body.openid };
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
    if (rows.length) return { error: "旧账号尚未设置密码，请联系平台管理员核验身份后重置密码", status: 400 };
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

function unbindWechat(db, userId, password) {
  const row = db.prepare("SELECT password_hash, salt FROM users WHERE id = ?").get(userId);
  if (!row) return { error: "没有这个人", status: 404 };
  if (!row.password_hash) return { error: "请先设置账号密码，再解绑微信", status: 400 };
  if (!String(password || "")) return { error: "填写当前密码", status: 400 };
  if (!verifyPassword(String(password), row.salt, row.password_hash)) return { error: "当前密码不对", status: 400 };
  db.prepare("UPDATE users SET openid = '' WHERE id = ?").run(userId);
  return { ok: true };
}

module.exports = { issueCaptcha, registerUser, loginUser, loginWechat, verifyWechatCode, unbindWechat, setUserPassword, changeOwnPassword, createUser };
