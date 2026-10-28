const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { clearClubMemberFutureSignups, removeClubMember } = require("../src/roles");

// This instant is still October 27 in UTC, so the fixtures also check the Beijing date boundary.
const NOW = Date.parse("2026-10-28T06:30:40+08:00");

function fixture(t) {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE clubs (id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL);
    CREATE TABLE club_members (
      club_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member', PRIMARY KEY (club_id, user_id)
    );
    CREATE TABLE club_requests (
      id INTEGER PRIMARY KEY, club_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE TABLE fee_periods (
      id INTEGER PRIMARY KEY, club_id INTEGER NOT NULL, open INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE fee_records (
      period_id INTEGER NOT NULL, user_id INTEGER NOT NULL, status TEXT NOT NULL,
      updated_at TEXT NOT NULL, departed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (period_id, user_id)
    );
    CREATE TABLE activities (
      id INTEGER PRIMARY KEY, club_id INTEGER NOT NULL, starts_at TEXT NOT NULL
    );
    CREATE TABLE activity_signups (
      activity_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      PRIMARY KEY (activity_id, user_id)
    );
    CREATE TABLE activity_checks (
      activity_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      PRIMARY KEY (activity_id, user_id)
    );
    CREATE TABLE meetups (
      id INTEGER PRIMARY KEY, club_id INTEGER NOT NULL, run_on TEXT NOT NULL
    );
    CREATE TABLE meetup_joins (
      meetup_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      PRIMARY KEY (meetup_id, user_id)
    );
    CREATE TABLE meetup_checks (
      meetup_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      PRIMARY KEY (meetup_id, user_id)
    );
    CREATE TABLE internal_races (
      id INTEGER PRIMARY KEY, club_id INTEGER NOT NULL, starts_at TEXT NOT NULL
    );
    CREATE TABLE internal_signups (
      race_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      PRIMARY KEY (race_id, user_id)
    );
    CREATE TABLE internal_results (
      race_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      PRIMARY KEY (race_id, user_id)
    );
    INSERT INTO clubs VALUES (1, 1), (2, 4);
    INSERT INTO club_members (club_id, user_id) VALUES (1, 1), (1, 2), (1, 3), (2, 2), (2, 4);
    INSERT INTO fee_periods (id, club_id, open) VALUES (1, 1, 1);
  `);
  return db;
}

function activity(db, id, clubId, startsAt, userIds = [2]) {
  db.prepare("INSERT INTO activities VALUES (?, ?, ?)").run(id, clubId, startsAt);
  const insert = db.prepare("INSERT INTO activity_signups VALUES (?, ?)");
  for (const userId of userIds) insert.run(id, userId);
}

function meetup(db, id, clubId, date, userIds = [2]) {
  db.prepare("INSERT INTO meetups VALUES (?, ?, ?)").run(id, clubId, date);
  const insert = db.prepare("INSERT INTO meetup_joins VALUES (?, ?)");
  for (const userId of userIds) insert.run(id, userId);
}

function internalRace(db, id, clubId, startsAt, userIds = [2]) {
  db.prepare("INSERT INTO internal_races VALUES (?, ?, ?)").run(id, clubId, startsAt);
  const insert = db.prepare("INSERT INTO internal_signups VALUES (?, ?)");
  for (const userId of userIds) insert.run(id, userId);
}

function rows(db, table) {
  return db.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all();
}

test("cleanup retains already started activities and races in the current minute and releases the next minute", (t) => {
  const db = fixture(t);
  for (const [id, startsAt] of [[1, "2026-10-28T06:29"], [2, "2026-10-28T06:30"], [3, "2026-10-28T06:31"]]) {
    activity(db, id, 1, startsAt);
    internalRace(db, id, 1, startsAt);
  }
  internalRace(db, 4, 1, "2026-10-28T06:32");
  db.prepare("INSERT INTO internal_results VALUES (4, 2)").run();

  assert.deepEqual(clearClubMemberFutureSignups(db, 1, 2, NOW), { activities: 1, meetups: 0, internalRaces: 1 });
  assert.deepEqual(rows(db, "activity_signups"), [{ activity_id: 1, user_id: 2 }, { activity_id: 2, user_id: 2 }]);
  assert.deepEqual(rows(db, "internal_signups"), [{ race_id: 1, user_id: 2 }, { race_id: 2, user_id: 2 }, { race_id: 4, user_id: 2 }]);
  assert.deepEqual(rows(db, "internal_results"), [{ race_id: 4, user_id: 2 }]);
});

test("cleanup keeps today's date-only meetup and any checked join, but removes tomorrow's unchecked join", (t) => {
  const db = fixture(t);
  meetup(db, 1, 1, "2026-10-27");
  meetup(db, 2, 1, "2026-10-28");
  meetup(db, 3, 1, "2026-10-29");
  meetup(db, 4, 1, "2026-10-29");
  db.prepare("INSERT INTO meetup_checks VALUES (4, 2)").run();

  assert.deepEqual(clearClubMemberFutureSignups(db, 1, 2, NOW), { activities: 0, meetups: 1, internalRaces: 0 });
  assert.deepEqual(rows(db, "meetup_joins"), [{ meetup_id: 1, user_id: 2 }, { meetup_id: 2, user_id: 2 }, { meetup_id: 4, user_id: 2 }]);
  assert.deepEqual(rows(db, "meetup_checks"), [{ meetup_id: 4, user_id: 2 }]);
});

test("cleanup only releases the selected member's signups within the selected club", (t) => {
  const db = fixture(t);
  for (const [id, clubId, userIds] of [[1, 1, [2, 3]], [2, 2, [2, 4]]]) {
    activity(db, id, clubId, "2026-10-28T06:31", userIds);
    meetup(db, id, clubId, "2026-10-29", userIds);
    internalRace(db, id, clubId, "2026-10-28T06:31", userIds);
  }

  assert.deepEqual(clearClubMemberFutureSignups(db, 1, 2, NOW), { activities: 1, meetups: 1, internalRaces: 1 });
  assert.deepEqual(rows(db, "activity_signups"), [{ activity_id: 1, user_id: 3 }, { activity_id: 2, user_id: 2 }, { activity_id: 2, user_id: 4 }]);
  assert.deepEqual(rows(db, "meetup_joins"), [{ meetup_id: 1, user_id: 3 }, { meetup_id: 2, user_id: 2 }, { meetup_id: 2, user_id: 4 }]);
  assert.deepEqual(rows(db, "internal_signups"), [{ race_id: 1, user_id: 3 }, { race_id: 2, user_id: 2 }, { race_id: 2, user_id: 4 }]);
  assert.ok(db.prepare("SELECT 1 FROM club_members WHERE club_id = 1 AND user_id = 2").get(), "the cleanup helper itself does not remove membership");
});

test("a failed member deletion rolls back every signup cancellation and pending request deletion", (t) => {
  const db = fixture(t);
  t.mock.method(Date, "now", () => NOW);
  activity(db, 1, 1, "2026-10-28T06:31", [2, 3]);
  meetup(db, 1, 1, "2026-10-29", [2, 3]);
  internalRace(db, 1, 1, "2026-10-28T06:31", [2, 3]);
  db.exec(`
    INSERT INTO club_requests VALUES (1, 1, 2, 'pending'), (2, 1, 2, 'approved'), (3, 2, 2, 'pending');
    CREATE TRIGGER reject_member_delete BEFORE DELETE ON club_members
    WHEN OLD.club_id = 1 AND OLD.user_id = 2
    BEGIN
      SELECT RAISE(ABORT, 'membership deletion blocked');
    END;
  `);
  const tables = ["club_members", "club_requests", "fee_records", "activity_signups", "meetup_joins", "internal_signups"];
  const before = Object.fromEntries(tables.map((table) => [table, rows(db, table)]));

  assert.throws(() => removeClubMember(db, 1, 2), /membership deletion blocked/);
  assert.equal(db.inTransaction, false);
  for (const table of tables) assert.deepEqual(rows(db, table), before[table], table + " must roll back with membership");

  // The same fixture succeeds after removing the failure, proving all cancellations were eligible.
  db.exec("DROP TRIGGER reject_member_delete");
  assert.deepEqual(removeClubMember(db, 1, 2), { ok: true, removedSignups: { activities: 1, meetups: 1, internalRaces: 1 } });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM club_members WHERE club_id = 1 AND user_id = 2").get().n, 0);
  assert.deepEqual(rows(db, "activity_signups"), [{ activity_id: 1, user_id: 3 }]);
  assert.deepEqual(rows(db, "meetup_joins"), [{ meetup_id: 1, user_id: 3 }]);
  assert.deepEqual(rows(db, "internal_signups"), [{ race_id: 1, user_id: 3 }]);
  assert.deepEqual(rows(db, "club_requests"), [{ id: 2, club_id: 1, user_id: 2, status: "approved" }, { id: 3, club_id: 2, user_id: 2, status: "pending" }]);
  assert.deepEqual(rows(db, "fee_records"), [{ period_id: 1, user_id: 2, status: "unpaid", updated_at: new Date(NOW).toISOString(), departed: 1 }]);
  assert.ok(db.prepare("SELECT 1 FROM club_members WHERE club_id = 2 AND user_id = 2").get());
});
