const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { passwordHash } = require("../src/admin-auth");
const { avatarUrlOf } = require("../src/avatars");
const { loginWechat, unbindWechat, registerUser, loginUser } = require("../src/user-auth");

const credentials = { appId: "fixture-app", secret: "fixture-secret" };
const exchangeCode = async () => ({ openid: "fixture-openid" });

function database(t) {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      password_hash TEXT NOT NULL DEFAULT '',
      salt TEXT NOT NULL DEFAULT '',
      openid TEXT NOT NULL DEFAULT '',
      avatar TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX users_openid ON users(openid) WHERE openid != '';
    CREATE TABLE captchas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      expire_at TEXT NOT NULL
    );
  `);
  t.after(() => db.close());
  return db;
}

function seedUser(db, nickname, options = {}) {
  const salt = options.password ? "fixture-password-salt" : "";
  const info = db.prepare(`
    INSERT INTO users (nickname, token, created_at, password_hash, salt, openid, avatar)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(nickname, "fixture-token-" + (db.prepare("SELECT COUNT(*) AS n FROM users").get().n + 1),
    "2026-10-27T00:00:00.000Z", options.password ? passwordHash(options.password, salt) : "",
    salt, options.openid || "", options.avatar || "");
  return Number(info.lastInsertRowid);
}

function userRows(db) {
  return db.prepare("SELECT * FROM users ORDER BY id").all();
}

function changes(db) {
  return db.prepare("SELECT total_changes() AS n").get().n;
}

function loginBody(db, nickname, password) {
  const token = "captcha-" + (db.prepare("SELECT COUNT(*) AS n FROM captchas").get().n + 1);
  db.prepare("INSERT INTO captchas (token, code, expire_at) VALUES (?, ?, ?)")
    .run(token, "AB12", new Date(Date.now() + 60_000).toISOString());
  return { nickname, password, captchaToken: token, captcha: "AB12" };
}

test("an unlinked WeChat identity requires an explicit choice and does not write to the database", async (t) => {
  const db = database(t);
  seedUser(db, "已有账号", { password: "password-8" });
  const before = userRows(db);
  const writes = changes(db);
  const result = await loginWechat(db, "fixture-code", credentials, exchangeCode);
  assert.deepEqual(result, {
    status: 409,
    code: "WECHAT_REGISTRATION_REQUIRED",
    error: "该微信尚未关联账号，请登录已有账号后绑定，或选择创建新账号"
  });
  assert.deepEqual(userRows(db), before);
  assert.equal(changes(db), writes);
});

test("only the boolean createAccount true permits WeChat registration", async (t) => {
  const db = database(t);
  for (const options of [{}, null, { createAccount: false }, { createAccount: "true" }, { createAccount: 1 }]) {
    const result = await loginWechat(db, "fixture-code", credentials, exchangeCode, options);
    assert.equal(result.code, "WECHAT_REGISTRATION_REQUIRED");
  }
  assert.equal(changes(db), 0);
  assert.deepEqual(userRows(db), []);

  const result = await loginWechat(db, "fixture-code", credentials, exchangeCode, { createAccount: true });
  const rows = userRows(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].openid, "fixture-openid");
  assert.equal(rows[0].password_hash, "");
  assert.equal(result.user.id, rows[0].id);
  assert.match(result.user.nickname, /^跑者/);
  assert.match(result.token, /^[a-f0-9]{48}$/);
  assert.equal(rows[0].token, result.token);
  assert.equal(result.user.openid, undefined);
});

test("a linked WeChat identity logs into its original account and serializes the avatar as a short URL", async (t) => {
  const db = database(t);
  const id = seedUser(db, "原账号", { openid: "fixture-openid", password: "password-8" });
  const avatar = id + "-" + "a".repeat(64) + ".png";
  db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(avatar, id);
  const before = userRows(db)[0];
  const result = await loginWechat(db, "fixture-code", credentials, exchangeCode);
  assert.equal(result.user.id, id);
  assert.equal(result.user.nickname, "原账号");
  assert.equal(result.user.avatar, avatarUrlOf(id, avatar));
  assert.ok(result.user.avatar);
  assert.ok(result.user.avatar.length < 150);
  assert.doesNotMatch(result.user.avatar, /^data:/);
  assert.equal(result.user.openid, undefined);
  assert.notEqual(result.token, before.token);
  assert.equal(userRows(db).length, 1);
  assert.equal(userRows(db)[0].password_hash, before.password_hash);
});

test("an invalid WeChat exchange cannot register an account even with explicit consent", async (t) => {
  const db = database(t);
  const result = await loginWechat(db, "fixture-code", credentials, async () => ({ openid: "" }), { createAccount: true });
  assert.equal(result.status, 401);
  assert.equal(changes(db), 0);
  assert.deepEqual(userRows(db), []);
});

test("WeChat-only accounts must set a password before unbinding", (t) => {
  const db = database(t);
  const id = seedUser(db, "微信账号", { openid: "fixture-openid" });
  const before = userRows(db);
  const writes = changes(db);
  const result = unbindWechat(db, id, "password-8");
  assert.equal(result.status, 400);
  assert.match(result.error, /先设置.*密码/);
  assert.deepEqual(userRows(db), before);
  assert.equal(changes(db), writes);
});

test("WeChat unbinding requires the current account password and leaves the binding on failure", (t) => {
  const db = database(t);
  const id = seedUser(db, "双登录账号", { openid: "fixture-openid", password: "password-8" });
  const before = userRows(db);
  const writes = changes(db);
  assert.equal(unbindWechat(db, id, "").status, 400);
  assert.equal(unbindWechat(db, id, "wrong-password").status, 400);
  assert.deepEqual(userRows(db), before);
  assert.equal(changes(db), writes);
  assert.equal(unbindWechat(db, 999, "password-8").status, 404);
});

test("proven WeChat unbinding preserves password access and prevents silent recreation", async (t) => {
  const db = database(t);
  const id = seedUser(db, "双登录账号", { openid: "fixture-openid", password: "password-8" });
  const before = userRows(db)[0];
  assert.deepEqual(unbindWechat(db, id, "password-8"), { ok: true });
  const after = userRows(db)[0];
  assert.equal(after.openid, "");
  assert.equal(after.password_hash, before.password_hash);
  assert.equal(after.salt, before.salt);
  assert.equal(after.token, before.token);
  const unlinked = await loginWechat(db, "fixture-code", credentials, exchangeCode);
  assert.equal(unlinked.code, "WECHAT_REGISTRATION_REQUIRED");
  assert.equal(userRows(db).length, 1);
  const passwordLogin = loginUser(db, loginBody(db, "双登录账号", "password-8"));
  assert.equal(passwordLogin.user.id, id);
});

test("legacy accounts cannot be claimed by registering or logging in with their nickname", (t) => {
  const db = database(t);
  seedUser(db, "历史账号");
  const before = userRows(db);
  const writes = changes(db);
  const registration = registerUser(db, { nickname: "历史账号", password: "password-8" });
  assert.equal(registration.status, 400);
  assert.match(registration.error, /联系平台管理员.*核验.*重置密码/);
  assert.deepEqual(userRows(db), before);
  assert.equal(changes(db), writes);
  const login = loginUser(db, loginBody(db, "历史账号", "password-8"));
  assert.equal(login.status, 400);
  assert.match(login.error, /联系平台管理员.*核验.*重置密码/);
  assert.deepEqual(userRows(db), before);
});

test("duplicate legacy nicknames remain ambiguous and a password only identifies its matching account", (t) => {
  const db = database(t);
  const legacyId = seedUser(db, "重名账号");
  seedUser(db, "重名账号");
  assert.equal(registerUser(db, { nickname: "重名账号", password: "password-8" }).error, "这个昵称有冲突，换一个");
  assert.equal(loginUser(db, loginBody(db, "重名账号", "password-8")).error, "这个昵称有冲突，换一个");
  const passwordId = seedUser(db, "重名账号", { password: "password-8" });
  assert.equal(registerUser(db, { nickname: "重名账号", password: "another-pass-8" }).error, "这个昵称已经注册，请登录");
  assert.equal(loginUser(db, loginBody(db, "重名账号", "password-8")).user.id, passwordId);
  assert.equal(db.prepare("SELECT password_hash FROM users WHERE id = ?").get(legacyId).password_hash, "");
  seedUser(db, "重名账号", { password: "password-8" });
  assert.equal(loginUser(db, loginBody(db, "重名账号", "password-8")).error, "这个昵称有冲突");
});
