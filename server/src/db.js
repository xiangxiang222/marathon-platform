const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { RACES } = require("./races");

let db;

function dbFile() {
  return process.env.MARATHON_DB || path.join(__dirname, "../data/app.sqlite");
}

function open() {
  const file = dbFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const handle = new Database(file);
  handle.pragma("journal_mode = WAL");
  handle.exec(`
    CREATE TABLE IF NOT EXISTS races (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      province TEXT NOT NULL,
      distances TEXT NOT NULL,
      race_date TEXT NOT NULL,
      deadline TEXT NOT NULL,
      place TEXT NOT NULL,
      reg_start TEXT NOT NULL DEFAULT '',
      draw_at TEXT NOT NULL DEFAULT '',
      pay_deadline TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT '',
      deadline_name TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS plans (
      user_id INTEGER NOT NULL,
      race_id TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, race_id)
    );
    CREATE TABLE IF NOT EXISTS clubs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      owner_id INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS club_members (
      club_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (club_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS results (
      user_id INTEGER NOT NULL,
      race_id TEXT NOT NULL,
      distance TEXT NOT NULL,
      seconds INTEGER NOT NULL,
      story TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, race_id)
    );
    CREATE TABLE IF NOT EXISTS official_races (
      official_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      race_date TEXT NOT NULL,
      province TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      grade TEXT NOT NULL DEFAULT '',
      distances TEXT NOT NULL DEFAULT '',
      items TEXT NOT NULL DEFAULT '',
      detail_url TEXT NOT NULL DEFAULT '',
      seen_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      race_id TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS checkins (
      club_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      PRIMARY KEY (club_id, user_id, day)
    );
  `);
  for (const [name, type] of [
    ["reg_start", "TEXT NOT NULL DEFAULT ''"],
    ["draw_at", "TEXT NOT NULL DEFAULT ''"],
    ["pay_deadline", "TEXT NOT NULL DEFAULT ''"],
    ["source", "TEXT NOT NULL DEFAULT ''"],
    ["updated_at", "TEXT NOT NULL DEFAULT ''"],
    ["deadline_name", "TEXT NOT NULL DEFAULT ''"],
    ["grade", "TEXT NOT NULL DEFAULT ''"],
    ["official_url", "TEXT NOT NULL DEFAULT ''"]
  ]) {
    const cols = handle.prepare("PRAGMA table_info(races)").all();
    if (!cols.some((col) => col.name === name)) handle.exec(`ALTER TABLE races ADD COLUMN ${name} ${type}`);
  }
  const upsert = handle.prepare(
    `INSERT INTO races (
       id, name, city, province, distances, race_date, deadline, place,
       reg_start, draw_at, pay_deadline, source, updated_at, deadline_name
     ) VALUES (
       @id, @name, @city, @province, @distances, @raceDate, @deadline, @place,
       @regStart, @drawAt, @payDeadline, @source, @updatedAt, @deadlineName
     )
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       city = excluded.city,
       province = excluded.province,
       distances = excluded.distances,
       race_date = excluded.race_date,
       deadline = excluded.deadline,
       place = excluded.place,
       reg_start = excluded.reg_start,
       draw_at = excluded.draw_at,
       pay_deadline = excluded.pay_deadline,
       source = excluded.source,
       updated_at = excluded.updated_at,
       deadline_name = excluded.deadline_name`
  );
  const tx = handle.transaction((rows) => {
    for (const row of rows) {
      upsert.run({
        regStart: "",
        drawAt: "",
        payDeadline: "",
        source: "",
        updatedAt: "",
        deadlineName: "",
        ...row
      });
    }
  });
  tx(RACES);
  return handle;
}

function getDb() {
  if (!db) db = open();
  return db;
}

module.exports = { getDb };
