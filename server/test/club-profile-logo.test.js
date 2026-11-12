const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const { logoRoot } = require("../src/club-logos");
const BASE = "/marathon/api";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRQkAAAAASUVORK5CYII=";
const otherPng = () => {
  const bytes = Buffer.from(PNG.split(",")[1], "base64");
  bytes[25] ^= 1;
  return "data:image/png;base64," + bytes.toString("base64");
};
let sequence = 0;
async function actor() {
  const res = await request(app).post(BASE + "/session").send({ nickname: "Logo跑友" + (++sequence) });
  assert.equal(res.status, 200);
  return { id: res.body.user.id, auth: { Authorization: "Bearer " + res.body.token } };
}
async function setup(logo = PNG) {
  const owner = await actor(), body = { name: "湖畔跑团", city: "杭州", intro: "周三一起跑", requestId: crypto.randomUUID(), ...(logo === undefined ? {} : { logo }) };
  const res = await request(app).post(BASE + "/clubs").set(owner.auth).send(body);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { ...owner, club: res.body.club, body };
}
async function update(owner, extra = {}, status = 200) {
  const res = await request(app).put(BASE + "/clubs/" + owner.club.id).set(owner.auth).send({ name: owner.club.name, city: owner.club.city, intro: owner.club.intro, ...extra });
  assert.equal(res.status, status, JSON.stringify(res.body));
  return res;
}

test("club creation persists logo and every directory/detail/public/invite identity returns its fetchable URL", async () => {
  const owner = await setup();
  assert.match(owner.club.logo, /^\/marathon\/api\/club-logos\/\d+\/[a-f0-9]{64}\.png$/);
  const image = await request(app).get(owner.club.logo);
  assert.equal(image.status, 200);
  assert.match(image.headers["content-type"], /image\/png/);
  assert.equal(image.headers["x-content-type-options"], "nosniff");
  assert.ok(image.body.equals(Buffer.from(PNG.split(",")[1], "base64")));
  for (const url of ["/clubs/" + owner.club.id, "/clubs/" + owner.club.id + "/public", "/clubs/invite/" + owner.club.code]) {
    const res = await request(app).get(BASE + url).set(owner.auth);
    assert.equal(res.status, 200); assert.equal(res.body.club.logo, owner.club.logo);
  }
  const mine = await request(app).get(BASE + "/me").set(owner.auth);
  assert.equal(mine.body.clubs.find(c => c.id === owner.club.id).logo, owner.club.logo);
  const directory = await request(app).get(BASE + "/clubs/directory").query({ q: "#" + owner.club.id });
  assert.equal(directory.body.clubs[0].logo, owner.club.logo);
  const stored = getDb().prepare("SELECT logo FROM clubs WHERE id=?").get(owner.club.id).logo;
  assert.ok(fs.existsSync(path.join(logoRoot(), stored)));
});

test("same creation request is idempotent including logo, and changing its logo cannot mutate the first club", async () => {
  const owner = await setup(), db = getDb();
  const res = await request(app).post(BASE + "/clubs").set(owner.auth).send(owner.body);
  assert.equal(res.status, 200); assert.equal(res.body.club.id, owner.club.id); assert.equal(res.body.club.logo, owner.club.logo);
  const changed = await request(app).post(BASE + "/clubs").set(owner.auth).send({ ...owner.body, logo: otherPng() });
  assert.equal(changed.status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM clubs WHERE owner_id=?").get(owner.id).n, 1);
  assert.equal((await request(app).get(owner.club.logo)).status, 200);
});

test("only the current owner can edit club details or logo; member, manager, stranger and guest are denied", async () => {
  const owner = await setup(), member = await actor(), manager = await actor(), stranger = await actor(), db = getDb();
  for (const [who, role] of [[member, "member"], [manager, "manager"]]) db.prepare("INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,?)").run(owner.club.id, who.id, new Date().toISOString(), role);
  const body = { name: "不应改动", city: "北京", intro: "不应改动", logo: "" };
  for (const endpoint of ["", "/profile"]) {
    const url = BASE + "/clubs/" + owner.club.id + endpoint;
    assert.equal((await request(app).put(url).send(body)).status, 401);
    for (const who of [member, manager, stranger]) assert.equal((await request(app).put(url).set(who.auth).send(body)).status, 403);
  }
  assert.equal(db.prepare("SELECT name FROM clubs WHERE id=?").get(owner.club.id).name, owner.club.name);
  assert.equal((await request(app).get(owner.club.logo)).status, 200);
});

test("owner edits name, city and description without replacing logo; replacement and removal retire old URLs", async () => {
  const owner = await setup();
  const changed = await update(owner, { name: "湖畔夜跑团", city: "绍兴", intro: "周五夜跑" });
  assert.equal(changed.body.club.logo, owner.club.logo); assert.equal(changed.body.club.name, "湖畔夜跑团");
  assert.equal(changed.body.club.city, "绍兴"); assert.equal(changed.body.club.intro, "周五夜跑");
  const preserved = await update(owner, { logo: owner.club.logo });
  assert.equal(preserved.body.club.logo, owner.club.logo);
  const replaced = await update(owner, { logo: otherPng() });
  assert.notEqual(replaced.body.club.logo, owner.club.logo);
  assert.equal((await request(app).get(owner.club.logo)).status, 404);
  assert.equal((await request(app).get(replaced.body.club.logo)).status, 200);
  const removed = await update(owner, { logo: "" });
  assert.equal(removed.body.club.logo, "");
  assert.equal((await request(app).get(replaced.body.club.logo)).status, 404);
  assert.equal(getDb().prepare("SELECT logo FROM clubs WHERE id=?").get(owner.club.id).logo, "");
});

test("existing clubs and image-free requests work; duplicate names are allowed and validation preserves saved data", async () => {
  const owner = await setup("");
  assert.equal(owner.club.logo, "");
  const other = await setup("");
  assert.equal((await update(owner, { name: other.club.name })).body.club.name, other.club.name);
  for (const bad of [{ name: "" }, { city: "" }, { name: "长".repeat(21) }, { intro: "长".repeat(81) }, { city: "隐\u200b藏" }, { name: "官方认证跑团" }]) await update(owner, bad, 400);
  assert.equal(getDb().prepare("SELECT name FROM clubs WHERE id=?").get(owner.club.id).name, owner.club.name);
  const res = await request(app).put(BASE + "/clubs/" + owner.club.id + "/profile").set(owner.auth).send({ name: "兼容资料入口", city: "杭州", intro: "保留旧接口" });
  assert.equal(res.status, 200); assert.equal(res.body.ok, true); assert.equal(res.body.club.name, "兼容资料入口");
});

test("invalid, oversized, foreign and mismatched images cannot create a partial club or damage an existing logo", async () => {
  const owner = await setup();
  const badValues = ["https://example.org/fake.png", owner.club.logo.replace(".png", ".jpg"), "data:image/svg+xml;base64,PHN2Zy8+", PNG.replace("image/png", "image/jpeg"), "data:image/png;base64," + Buffer.alloc(256 * 1024 + 1).toString("base64"), {}, null];
  for (const logo of badValues) {
    const result = await request(app).put(BASE + "/clubs/" + owner.club.id).set(owner.auth).send({ name: owner.club.name, city: "杭州", intro: "原资料", logo });
    assert.ok([400, 413].includes(result.status), JSON.stringify(result.body));
    assert.equal((await request(app).get(owner.club.logo)).status, 200);
    const fresh = await actor();
    const created = await request(app).post(BASE + "/clubs").set(fresh.auth).send({ name: "失败不留半团", city: "杭州", logo, requestId: crypto.randomUUID() });
    assert.ok([400, 413].includes(created.status));
    assert.equal(getDb().prepare("SELECT COUNT(*) n FROM clubs WHERE owner_id=?").get(fresh.id).n, 0);
  }
  const stranger = await setup();
  await update(owner, { logo: stranger.club.logo }, 400);
});

test("material identity edits invalidate verification; logo-only edits keep it and restricted clubs hide images publicly", async () => {
  const owner = await setup(), db = getDb(), now = new Date().toISOString();
  db.prepare("INSERT INTO club_verifications(club_id,owner_id,status,organization,scope,created_at,updated_at,reviewed_at) VALUES(?,?,'verified','跑步组织','杭州',?,?,?)").run(owner.club.id, owner.id, now, now, now);
  assert.equal((await update(owner, { logo: otherPng() })).body.club.verified, true);
  assert.equal((await update(owner, { name: "改名后等待复核" })).body.club.verified, false);
  const url = (await request(app).get(BASE + "/clubs/" + owner.club.id).set(owner.auth)).body.club.logo;
  db.prepare("UPDATE clubs SET public_status='restricted' WHERE id=?").run(owner.club.id);
  const card = await request(app).get(BASE + "/clubs/" + owner.club.id + "/public");
  assert.equal(card.body.club.logo, "");
  assert.equal((await request(app).get(url)).status, 404);
  assert.equal((await request(app).get(url).set(owner.auth)).status, 200);
});

test("logo migration preserves existing clubs and owners, and guessed file paths never bypass current-image selection", async () => {
  const owner = await setup();
  const wrongClub = owner.club.logo.replace(/club-logos\/\d+\//, "club-logos/99999999/");
  assert.equal((await request(app).get(wrongClub)).status, 404);
  assert.equal((await request(app).get(owner.club.logo.replace(/[a-f0-9]{64}/, "0".repeat(64)))).status, 404);
  assert.equal((await request(app).get(BASE + "/club-logos/" + owner.club.id + "/..%2Fapp.sqlite")).status, 404);
  const { installClubIdentity } = require("../src/club-identity");
  installClubIdentity(getDb());
  const row = getDb().prepare("SELECT name,owner_id,logo FROM clubs WHERE id=?").get(owner.club.id);
  assert.equal(row.name, owner.club.name); assert.equal(row.owner_id, owner.id); assert.ok(row.logo);
});

test("storage or later database failures roll back creation and editing while preserving the previous image", async () => {
  const owner = await setup(), fresh = await actor(), db = getDb();
  const images = () => fs.readdirSync(logoRoot()).sort();
  const originalWrite = fs.writeFileSync, before = images();
  fs.writeFileSync = function (file, ...args) {
    if (String(file).startsWith(logoRoot() + path.sep)) throw new Error("controlled logo storage failure");
    return originalWrite.call(fs, file, ...args);
  };
  try {
    assert.equal((await request(app).post(BASE + "/clubs").set(fresh.auth).send({ name: "写入失败团", city: "杭州", logo: PNG })).status, 500);
    await update(owner, { logo: otherPng() }, 500);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM clubs WHERE owner_id=?").get(fresh.id).n, 0);
  } finally { fs.writeFileSync = originalWrite; }
  db.exec("CREATE TEMP TRIGGER fail_logo_create BEFORE INSERT ON club_members WHEN NEW.user_id=" + fresh.id + " BEGIN SELECT RAISE(ABORT,'controlled membership failure'); END");
  try {
    assert.equal((await request(app).post(BASE + "/clubs").set(fresh.auth).send({ name: "事务失败团", city: "杭州", logo: PNG })).status, 500);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM clubs WHERE owner_id=?").get(fresh.id).n, 0);
    assert.deepEqual(images(), before);
  } finally { db.exec("DROP TRIGGER fail_logo_create"); }
  db.exec("CREATE TEMP TRIGGER fail_logo_update BEFORE UPDATE ON clubs WHEN NEW.id=" + owner.club.id + " BEGIN SELECT RAISE(ABORT,'controlled profile failure'); END");
  try { await update(owner, { logo: otherPng() }, 500); }
  finally { db.exec("DROP TRIGGER fail_logo_update"); }
  assert.equal((await request(app).get(owner.club.logo)).status, 200);
  assert.deepEqual(images(), before);
});
