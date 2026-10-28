const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const request = require("supertest");
const { adminOverview } = require("../src/admin-overview");
const { app } = require("../src/index");
const { getDb } = require("../src/db");

function clubTables(db) {
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE clubs (id INTEGER PRIMARY KEY);
    CREATE TABLE club_applications (id INTEGER PRIMARY KEY, status TEXT);
    CREATE TABLE club_requests (id INTEGER PRIMARY KEY, status TEXT);
  `);
}
function fixture(t) {
  const db = new Database(":memory:"); t.after(() => db.close()); clubTables(db);
  db.exec(`
    CREATE TABLE races (
      id TEXT PRIMARY KEY, name TEXT DEFAULT '测试马拉松', city TEXT DEFAULT '北京', province TEXT DEFAULT '北京',
      place TEXT DEFAULT '奥森', distances TEXT DEFAULT 'full', race_date TEXT, deadline TEXT DEFAULT '', reg_start TEXT DEFAULT '',
      draw_at TEXT DEFAULT '', pay_deadline TEXT DEFAULT '', bib_at TEXT DEFAULT '', guide_text TEXT DEFAULT '', source TEXT DEFAULT ''
    );
    CREATE TABLE race_sheets (id INTEGER PRIMARY KEY, race_id TEXT, kind TEXT, filename TEXT);
    CREATE TABLE bot_submissions (id INTEGER PRIMARY KEY, status TEXT);
    CREATE TABLE news (id INTEGER PRIMARY KEY);
    CREATE TABLE news_submissions (id INTEGER PRIMARY KEY, status TEXT);
  `);
  return db;
}
function insertMany(db, table, n, status) {
  for (let i = 0; i < n; i++) {
    if (status) db.prepare("INSERT INTO " + table + " (status) VALUES (?)").run(status);
    else db.prepare("INSERT INTO " + table + " DEFAULT VALUES").run();
  }
}

test("overview counts the complete published and review collections while limiting only the upcoming preview", (t) => {
  const db = fixture(t);
  insertMany(db, "users", 43); insertMany(db, "clubs", 27);
  insertMany(db, "club_applications", 15, "pending"); insertMany(db, "club_applications", 2, "approved");
  insertMany(db, "club_requests", 18, "pending"); insertMany(db, "club_requests", 3, "rejected");
  insertMany(db, "bot_submissions", 37, "pending"); insertMany(db, "bot_submissions", 3, "returned"); insertMany(db, "bot_submissions", 1, "published");
  insertMany(db, "news", 29); insertMany(db, "news_submissions", 31, "pending"); insertMany(db, "news_submissions", 4, "returned");
  for (const [id, date] of [["past", "2026-10-26"], ["g", "2026-11-03"], ["f", "2026-11-02"], ["e", "2026-11-01"], ["d", "2026-10-30"], ["c", "2026-10-29"], ["b", "2026-10-28"], ["a", "2026-10-27"]]) {
    db.prepare("INSERT INTO races(id,race_date) VALUES(?,?)").run(id, date);
  }
  db.prepare("UPDATE races SET reg_start='2026-10-01', guide_text='竞赛规程正文', source='组委会公告' WHERE id='a'").run();
  db.prepare("INSERT INTO race_sheets(race_id,kind,filename) VALUES('b','guide','b-guide.png')").run();
  db.prepare("INSERT INTO race_sheets(race_id,kind,filename) VALUES('c','route','c-route.png')").run();
  db.prepare("INSERT INTO race_sheets(race_id,kind,filename) VALUES('d','guide','')").run();
  db.prepare("UPDATE races SET bib_at='2026-10-31' WHERE id='e'").run();
  const result = adminOverview(db, "admin", new Date("2026-10-26T16:30:00Z"));
  assert.equal(result.today, "2026-10-27");
  assert.deepEqual(result.counts, { users: 43, clubs: 27, pendingFoundings: 15, pendingJoins: 18, publishedRaces: 8, upcomingRaces: 7, pendingRaces: 37, returnedRaces: 3, publishedNews: 29, pendingNews: 31 });
  assert.deepEqual(result.upcoming.map((race) => race.id), ["a", "b", "c", "d", "e", "f"]);
  assert.equal(result.upcoming[0].raceDate, result.today);
  assert.deepEqual(result.upcoming[0].distanceLabels, ["马拉松"]);
  assert.deepEqual(result.contentQuality, { scope: "upcoming", total: 7, missingRegistrationNodes: 6, missingGuide: 5, missingSource: 6 });
  assert.equal(result.attention.find((item) => item.id === "races").count, 37);
  assert.equal(result.attention.find((item) => item.id === "returnedRaces").filter, "returned");
  assert.equal(result.attention.find((item) => item.id === "news").section, "news");
});

test("empty upcoming content has zero quality gaps rather than null sums", (t) => {
  const db = fixture(t);
  db.prepare("INSERT INTO races(id,race_date) VALUES('past','2026-10-26')").run();
  const result = adminOverview(db, "admin", new Date("2026-10-27T02:00:00Z"));
  assert.equal(result.counts.publishedRaces, 1);
  assert.equal(result.counts.upcomingRaces, 0);
  assert.deepEqual(result.upcoming, []);
  assert.deepEqual(result.contentQuality, { scope: "upcoming", total: 0, missingRegistrationNodes: 0, missingGuide: 0, missingSource: 0 });
});

test("club overview needs no content tables and returns only its authorized metrics", (t) => {
  const db = new Database(":memory:"); t.after(() => db.close()); clubTables(db);
  insertMany(db, "users", 2); insertMany(db, "clubs", 1);
  insertMany(db, "club_applications", 1, "pending"); insertMany(db, "club_requests", 1, "pending");
  const result = adminOverview(db, "club", new Date("2026-10-27T02:00:00Z"));
  assert.deepEqual(result.counts, { users: 2, clubs: 1, pendingFoundings: 1, pendingJoins: 1 });
  assert.deepEqual(result.upcoming, []); assert.equal(result.contentQuality, null);
  assert.deepEqual(result.attention.map((item) => item.section), ["joins", "joins"]);
  assert.equal(result.counts.publishedRaces, undefined);
  assert.doesNotMatch(JSON.stringify(result), /password|token|nickname|openid|accounts/);
});

test("overview API requires a valid admin session and applies the club role on the server", async () => {
  assert.equal((await request(app).get("/marathon/api/admin/overview")).status, 401);
  const oldToken = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = "overview-test-admin";
  try {
    const admin = { Authorization: "Bearer overview-test-admin" };
    const result = await request(app).get("/marathon/api/admin/overview").set(admin);
    assert.equal(result.status, 200); assert.equal(result.body.role, "admin");
    assert.equal(result.headers["cache-control"], "no-store");
    assert.equal(result.body.counts.publishedRaces, getDb().prepare("SELECT COUNT(*) AS n FROM races").get().n);
    const created = await request(app).post("/marathon/api/admin/accounts").set(admin).send({ username: "overview_club", password: "overview-pass-8", role: "club" });
    assert.equal(created.status, 200);
    const login = await request(app).post("/marathon/api/admin/login").send({ username: "overview_club", password: "overview-pass-8" });
    assert.equal(login.status, 200);
    const scoped = await request(app).get("/marathon/api/admin/overview").set("Authorization", "Bearer " + login.body.token);
    assert.equal(scoped.status, 200); assert.equal(scoped.body.role, "club");
    assert.deepEqual(Object.keys(scoped.body.counts).sort(), ["clubs", "pendingFoundings", "pendingJoins", "users"]);
    assert.deepEqual(scoped.body.upcoming, []); assert.equal(scoped.body.contentQuality, null);
    assert.ok(scoped.body.attention.every((item) => item.section === "joins"));
  } finally {
    if (oldToken == null) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = oldToken;
  }
});
