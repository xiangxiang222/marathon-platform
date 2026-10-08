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
      place TEXT NOT NULL
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
  `);
  const count = handle.prepare("SELECT COUNT(*) AS n FROM races").get().n;
  if (count === 0) {
    const insert = handle.prepare(
      `INSERT INTO races (id, name, city, province, distances, race_date, deadline, place)
       VALUES (@id, @name, @city, @province, @distances, @raceDate, @deadline, @place)`
    );
    const tx = handle.transaction((rows) => {
      for (const row of rows) insert.run(row);
    });
    tx(RACES);
  }
  return handle;
}

function getDb() {
  if (!db) db = open();
  return db;
}

module.exports = { getDb };
