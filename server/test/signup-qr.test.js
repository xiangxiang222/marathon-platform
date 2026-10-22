const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const { signupTarget } = require("../src/signup-channel");

test("a signup link is named only when the host is the official site", () => {
  assert.equal(signupTarget("https://m.mararun.com/race/1").name, "马拉马拉");
  assert.equal(signupTarget("https://example.com/signup").name, "");
  assert.equal(signupTarget("https://example.com/signup").host, "example.com");
  assert.equal(signupTarget("javascript:alert(1)"), null);
  assert.equal(signupTarget("http://mararun.com/race"), null);
});

test("the signup qr is the stored https page and nothing else", async () => {
  const db = getDb();
  const before = db.prepare("SELECT signup_url FROM races WHERE id = ?").get("chaoyang").signup_url;
  try {
    const missing = await request(app).get("/marathon/api/races/chaoyang/signup-qr");
    assert.equal(missing.status, 404);

    db.prepare("UPDATE races SET signup_url = ? WHERE id = ?").run("https://m.mararun.com/race/chaoyang", "chaoyang");
    const png = await request(app).get("/marathon/api/races/chaoyang/signup-qr");
    assert.equal(png.status, 200);
    assert.match(png.headers["content-type"], /^image\/png/);
    assert.equal(png.body[0], 0x89);
    assert.equal(png.body.toString("ascii", 1, 4), "PNG");
    const race = await request(app).get("/marathon/api/races/chaoyang");
    assert.equal(race.body.race.signupChannel, "马拉马拉");
    assert.equal(race.body.race.signupHost, "m.mararun.com");

    db.prepare("UPDATE races SET signup_url = ? WHERE id = ?").run("javascript:alert(1)", "chaoyang");
    const blocked = await request(app).get("/marathon/api/races/chaoyang/signup-qr");
    assert.equal(blocked.status, 404);
    const gone = await request(app).get("/marathon/api/races/no-such-race/signup-qr");
    assert.equal(gone.status, 404);
  } finally {
    db.prepare("UPDATE races SET signup_url = ? WHERE id = ?").run(before, "chaoyang");
  }
});
