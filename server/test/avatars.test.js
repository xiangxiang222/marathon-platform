const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const { avatarRoot, avatarUrlOf, parseAvatar, migrateLegacyAvatars } = require("../src/avatars");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cX1kAAAAASUVORK5CYII=", "base64");
const dataUrl = "data:image/png;base64," + png.toString("base64");

async function user(nickname) {
  const res = await request(app).post("/marathon/api/session").send({ nickname });
  assert.equal(res.status, 200);
  return { id: res.body.user.id, auth: { Authorization: "Bearer " + res.body.token } };
}

test("avatars reject invalid images, lying MIME types and excessive input", () => {
  assert.deepEqual(parseAvatar(dataUrl).buffer, png);
  for (const bad of ["data:image/jpeg;base64,AA==", dataUrl.replace("image/png", "image/jpeg"), "data:image/svg+xml;base64,PHN2Zz4=", dataUrl + "!"]) {
    assert.throws(() => parseAvatar(bad), { status: 400 });
  }
  assert.throws(() => parseAvatar("data:image/png;base64," + "A".repeat(360000)), { status: 413 });
});

test("valid legacy avatars migrate once to files and short URLs without losing malformed legacy data", (t) => {
  const db = new Database(":memory:"); t.after(() => db.close());
  db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, avatar TEXT NOT NULL DEFAULT '')");
  db.prepare("INSERT INTO users(id,avatar) VALUES(?,?)").run(9001, dataUrl);
  const malformed = "data:image/jpeg;base64,AA==";
  db.prepare("INSERT INTO users(id,avatar) VALUES(?,?)").run(9002, malformed);
  migrateLegacyAvatars(db);
  const stored = db.prepare("SELECT avatar FROM users WHERE id=9001").get().avatar;
  assert.match(stored, /^9001-[a-f0-9]{64}\.png$/);
  assert.deepEqual(fs.readFileSync(path.join(avatarRoot(), stored)), png);
  assert.match(avatarUrlOf(9001, stored), /^\/marathon\/api\/avatars\/9001\//);
  assert.equal(avatarUrlOf(9002, stored), "");
  assert.equal(db.prepare("SELECT avatar FROM users WHERE id=9002").get().avatar, malformed);
  assert.equal(avatarUrlOf(9002, malformed), "");
  migrateLegacyAvatars(db);
  assert.equal(db.prepare("SELECT avatar FROM users WHERE id=9001").get().avatar, stored);
});

test("avatar uploads persist file references, serve images and preserve the avatar on nickname-only updates", async () => {
  const owner = await user("头像上传账号");
  const denied = await request(app).post("/marathon/api/me/avatar").send({ avatar: dataUrl });
  assert.equal(denied.status, 401);
  const uploaded = await request(app).post("/marathon/api/me/avatar").set(owner.auth).send({ avatar: dataUrl });
  assert.equal(uploaded.status, 200);
  assert.match(uploaded.body.avatar, /^\/marathon\/api\/avatars\/\d+\/[a-f0-9]{64}\.png$/);
  const stored = getDb().prepare("SELECT avatar FROM users WHERE id=?").get(owner.id).avatar;
  assert.ok(stored.length < 100); assert.doesNotMatch(stored, /^data:/);
  const downloaded = await request(app).get(uploaded.body.avatar);
  assert.equal(downloaded.status, 200);
  assert.match(downloaded.headers["content-type"], /image\/png/);
  assert.equal(downloaded.headers["x-content-type-options"], "nosniff");
  assert.deepEqual(downloaded.body, png);
  const renamed = await request(app).put("/marathon/api/me/profile").set(owner.auth).send({ nickname: "新昵称头像仍在" });
  assert.equal(renamed.status, 200); assert.equal(renamed.body.user.avatar, uploaded.body.avatar);
  const me = await request(app).get("/marathon/api/me").set(owner.auth);
  assert.equal(me.body.user.avatar, uploaded.body.avatar);
  const ownUrl = await request(app).put("/marathon/api/me/profile").set(owner.auth).send({ nickname: "新昵称头像仍在", avatar: "https://example.com" + uploaded.body.avatar });
  assert.equal(ownUrl.status, 200);
});

test("avatar URLs cannot adopt another user's image and a replaced image stops being served", async () => {
  const owner = await user("头像隔离甲"), other = await user("头像隔离乙");
  const first = await request(app).post("/marathon/api/me/avatar").set(owner.auth).send({ avatar: dataUrl });
  const stolen = await request(app).put("/marathon/api/me/profile").set(other.auth).send({ nickname: "头像隔离乙", avatar: first.body.avatar });
  assert.equal(stolen.status, 400);
  const changed = "data:image/png;base64," + Buffer.concat([png, Buffer.from([0])]).toString("base64");
  const second = await request(app).post("/marathon/api/me/avatar").set(owner.auth).send({ avatar: changed });
  assert.equal(second.status, 200); assert.notEqual(second.body.avatar, first.body.avatar);
  assert.equal((await request(app).get(first.body.avatar)).status, 404);
  assert.equal((await request(app).get(second.body.avatar)).status, 200);
  assert.equal((await request(app).get(second.body.avatar.replace("/" + owner.id + "/", "/" + other.id + "/"))).status, 404);
});
