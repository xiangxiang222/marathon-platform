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
      proof TEXT NOT NULL DEFAULT '',
      proof_kind TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, race_id, distance)
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
      race_id TEXT NOT NULL DEFAULT '',
      organizer TEXT NOT NULL DEFAULT '',
      web_url TEXT NOT NULL DEFAULT '',
      scale TEXT NOT NULL DEFAULT '',
      detail_checked_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS official_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      official_id TEXT NOT NULL,
      field TEXT NOT NULL,
      label TEXT NOT NULL,
      old_value TEXT NOT NULL,
      new_value TEXT NOT NULL,
      seen_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS checkins (
      club_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      PRIMARY KEY (club_id, user_id, day)
    );
    CREATE TABLE IF NOT EXISTS club_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      pace TEXT NOT NULL DEFAULT '',
      capacity INTEGER NOT NULL DEFAULT 0,
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      place TEXT NOT NULL DEFAULT '',
      starts_at TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      min_km REAL NOT NULL DEFAULT 5,
      min_people INTEGER NOT NULL DEFAULT 3,
      points INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity_signups (
      activity_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      PRIMARY KEY (activity_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS activity_checks (
      activity_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      km REAL NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      PRIMARY KEY (activity_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS point_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      ref_key TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      cost INTEGER NOT NULL,
      stock INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gift_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      cost INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      filename TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS race_sheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      race_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      filename TEXT NOT NULL DEFAULT '',
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admins (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS club_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      pace TEXT NOT NULL DEFAULT '',
      capacity INTEGER NOT NULL DEFAULT 0,
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      place TEXT NOT NULL DEFAULT '',
      starts_at TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      min_km REAL NOT NULL DEFAULT 5,
      min_people INTEGER NOT NULL DEFAULT 3,
      points INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity_signups (
      activity_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      PRIMARY KEY (activity_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS activity_checks (
      activity_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      km REAL NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      PRIMARY KEY (activity_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS point_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      ref_key TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      cost INTEGER NOT NULL,
      stock INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gift_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      cost INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS point_ref_key ON point_entries(ref_key) WHERE ref_key != '';
    CREATE TABLE IF NOT EXISTS fee_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      starts_on TEXT NOT NULL,
      ends_on TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      qr_filename TEXT NOT NULL DEFAULT '',
      block_signup INTEGER NOT NULL DEFAULT 0,
      open INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS fee_period_open ON fee_periods(club_id) WHERE open = 1;
    CREATE TABLE IF NOT EXISTS fee_records (
      period_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (period_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS result_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      race_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      race_date TEXT NOT NULL,
      distances TEXT NOT NULL,
      other_km REAL,
      deadline TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS result_call_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      distance TEXT NOT NULL,
      seconds INTEGER NOT NULL,
      filename TEXT NOT NULL DEFAULT '',
      staff_filled INTEGER NOT NULL DEFAULT 0,
      debut INTEGER NOT NULL DEFAULT 1,
      replaced_seconds INTEGER,
      updated_at TEXT NOT NULL,
      UNIQUE (call_id, user_id, distance)
    );
    CREATE TABLE IF NOT EXISTS meetup_tiers (
      club_id INTEGER NOT NULL,
      min_people INTEGER NOT NULL,
      points INTEGER NOT NULL,
      sort INTEGER NOT NULL,
      PRIMARY KEY (club_id, sort)
    );
    CREATE TABLE IF NOT EXISTS meetups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      run_on TEXT NOT NULL,
      place TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      award INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meetup_joins (
      meetup_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (meetup_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS meetup_checks (
      meetup_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (meetup_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS meetup_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meetup_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      filename TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS internal_races (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      place TEXT NOT NULL DEFAULT '',
      starts_at TEXT NOT NULL,
      deadline TEXT NOT NULL,
      distance TEXT NOT NULL,
      other_km REAL,
      note TEXT NOT NULL DEFAULT '',
      finish_points INTEGER NOT NULL DEFAULT 0,
      ended_at TEXT NOT NULL DEFAULT '',
      cancelled_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS internal_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      race_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 0,
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS internal_signups (
      race_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (race_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS internal_results (
      race_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      seconds INTEGER,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (race_id, user_id)
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
    ["official_url", "TEXT NOT NULL DEFAULT ''"],
    ["organizer", "TEXT NOT NULL DEFAULT ''"],
    ["event_url", "TEXT NOT NULL DEFAULT ''"],
    ["kinds", "TEXT NOT NULL DEFAULT ''"],
    ["groups", "TEXT NOT NULL DEFAULT ''"],
    ["start_at", "TEXT NOT NULL DEFAULT ''"],
    ["bib_at", "TEXT NOT NULL DEFAULT ''"],
    ["fee", "TEXT NOT NULL DEFAULT ''"],
    ["scale", "TEXT NOT NULL DEFAULT ''"],
    ["phone", "TEXT NOT NULL DEFAULT ''"],
    ["signup_url", "TEXT NOT NULL DEFAULT ''"],
    ["draw_url", "TEXT NOT NULL DEFAULT ''"],
    ["bib_url", "TEXT NOT NULL DEFAULT ''"],
    ["result_url", "TEXT NOT NULL DEFAULT ''"],
    ["live_url", "TEXT NOT NULL DEFAULT ''"],
    ["route", "TEXT NOT NULL DEFAULT ''"],
    ["pickup", "TEXT NOT NULL DEFAULT ''"],
    ["pacers", "TEXT NOT NULL DEFAULT ''"],
    ["guide_text", "TEXT NOT NULL DEFAULT ''"]
  ]) {
    const cols = handle.prepare("PRAGMA table_info(races)").all();
    if (!cols.some((col) => col.name === name)) handle.exec(`ALTER TABLE races ADD COLUMN ${name} ${type}`);
  }
  for (const [name, type] of [
    ["organizer", "TEXT NOT NULL DEFAULT ''"],
    ["web_url", "TEXT NOT NULL DEFAULT ''"],
    ["scale", "TEXT NOT NULL DEFAULT ''"],
    ["detail_checked_at", "TEXT NOT NULL DEFAULT ''"]
  ]) {
    const cols = handle.prepare("PRAGMA table_info(official_races)").all();
    if (!cols.some((col) => col.name === name)) handle.exec(`ALTER TABLE official_races ADD COLUMN ${name} ${type}`);
  }
  for (const [table, name, type] of [
    ["club_members", "role", "TEXT NOT NULL DEFAULT 'member'"],
    ["admins", "role", "TEXT NOT NULL DEFAULT 'admin'"]
  ]) {
    const cols = handle.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((col) => col.name === name)) handle.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
  handle.exec(`
    CREATE TABLE IF NOT EXISTS club_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      reviewed_at TEXT NOT NULL DEFAULT '',
      reviewer TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX IF NOT EXISTS club_request_pending ON club_requests(club_id, user_id) WHERE status = 'pending';
  `);
  handle.prepare(
    `UPDATE club_members SET role = 'owner'
     WHERE EXISTS (
       SELECT 1 FROM clubs
       WHERE clubs.id = club_members.club_id AND clubs.owner_id = club_members.user_id
     )`
  ).run();
  const userCols = handle.prepare("PRAGMA table_info(users)").all();
  if (!userCols.some((col) => col.name === "leader")) handle.exec("ALTER TABLE users ADD COLUMN leader INTEGER NOT NULL DEFAULT 0");
  for (const [name, type] of [
    ["password_hash", "TEXT NOT NULL DEFAULT ''"],
    ["salt", "TEXT NOT NULL DEFAULT ''"]
  ]) {
    const cols = handle.prepare("PRAGMA table_info(users)").all();
    if (!cols.some((col) => col.name === name)) handle.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
  }
  handle.exec(`
    CREATE TABLE IF NOT EXISTS captchas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      expire_at TEXT NOT NULL
    );
  `);
  handle.exec(`
    CREATE TABLE IF NOT EXISTS club_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      club_id INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      reviewed_at TEXT NOT NULL DEFAULT '',
      reviewer TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX IF NOT EXISTS club_application_pending ON club_applications(user_id) WHERE status = 'pending';
  `);
  handle.prepare(
    `UPDATE users SET leader = 1
     WHERE EXISTS (SELECT 1 FROM clubs WHERE clubs.owner_id = users.id)`
  ).run();
  const callCols = handle.prepare("PRAGMA table_info(result_call_rows)").all();
  if (callCols.length && !callCols.some((col) => col.name === "debut")) {
    handle.exec("ALTER TABLE result_call_rows ADD COLUMN debut INTEGER NOT NULL DEFAULT 1");
  }
  for (const [table, name, type] of [
    ["activities", "ends_at", "TEXT NOT NULL DEFAULT ''"],
    ["activities", "issue", "TEXT NOT NULL DEFAULT ''"],
    ["activities", "planned_km", "REAL"],
    ["activities", "gather_place", "TEXT NOT NULL DEFAULT ''"],
    ["activities", "route", "TEXT NOT NULL DEFAULT ''"],
    ["activities", "gather_at", "TEXT NOT NULL DEFAULT ''"],
    ["activities", "cancel_until", "TEXT NOT NULL DEFAULT ''"],
    ["activities", "cancelled_at", "TEXT NOT NULL DEFAULT ''"],
    ["activities", "review", "INTEGER NOT NULL DEFAULT 0"],
    ["activities", "cover_id", "INTEGER NOT NULL DEFAULT 0"],
    ["activity_signups", "gender", "TEXT NOT NULL DEFAULT ''"],
    ["activity_signups", "level", "TEXT NOT NULL DEFAULT ''"],
    ["activity_signups", "pacer", "INTEGER NOT NULL DEFAULT 0"],
    ["activity_media", "status", "TEXT NOT NULL DEFAULT 'shown'"],
    ["results", "proof", "TEXT NOT NULL DEFAULT ''"],
    ["results", "proof_kind", "TEXT NOT NULL DEFAULT ''"],
    ["plans", "sheet", "TEXT NOT NULL DEFAULT ''"]
  ]) {
    const cols = handle.prepare(`PRAGMA table_info(${table})`).all();
    if (cols.length && !cols.some((col) => col.name === name)) handle.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
  const resultCols = handle.prepare("PRAGMA table_info(results)").all();
  const resultPk = resultCols
    .filter((col) => col.pk)
    .sort((a, b) => a.pk - b.pk)
    .map((col) => col.name)
    .join(",");
  if (resultCols.length && resultPk !== "user_id,race_id,distance") {
    handle.exec(`
      CREATE TABLE results_next (
        user_id INTEGER NOT NULL,
        race_id TEXT NOT NULL,
        distance TEXT NOT NULL,
        seconds INTEGER NOT NULL,
        story TEXT NOT NULL DEFAULT '',
        proof TEXT NOT NULL DEFAULT '',
        proof_kind TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, race_id, distance)
      );
      INSERT INTO results_next (user_id, race_id, distance, seconds, story, proof, proof_kind, updated_at)
      SELECT user_id, race_id, distance, seconds, story, COALESCE(proof, ''), COALESCE(proof_kind, ''), updated_at FROM results;
      DROP TABLE results;
      ALTER TABLE results_next RENAME TO results;
    `);
  }
  const memberCols = handle.prepare("PRAGMA table_info(club_members)").all();
  if (memberCols.length && !memberCols.some((col) => col.name === "mileage_group_id")) {
    handle.exec("ALTER TABLE club_members ADD COLUMN mileage_group_id INTEGER NOT NULL DEFAULT 0");
  }
  handle.exec(`
    CREATE TABLE IF NOT EXISTS activity_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'pace',
      pace TEXT NOT NULL DEFAULT '',
      capacity INTEGER NOT NULL DEFAULT 0,
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      started_at TEXT NOT NULL,
      distance_km REAL NOT NULL DEFAULT 0,
      duration_sec INTEGER NOT NULL,
      climb_m INTEGER NOT NULL DEFAULT 0,
      pace_sec INTEGER NOT NULL DEFAULT 0,
      volume_km REAL NOT NULL DEFAULT 0,
      city TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual',
      shot TEXT NOT NULL DEFAULT '',
      overlap INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS runs_user_started ON runs(user_id, started_at);
    CREATE TABLE IF NOT EXISTS mileage_rules (
      club_id INTEGER PRIMARY KEY,
      effective_on TEXT NOT NULL,
      manual_ok INTEGER NOT NULL DEFAULT 1,
      run_on INTEGER NOT NULL DEFAULT 1,
      run_min REAL NOT NULL DEFAULT 1,
      run_max REAL NOT NULL DEFAULT 128,
      pace_fast INTEGER NOT NULL DEFAULT 180,
      pace_slow INTEGER NOT NULL DEFAULT 900,
      trail_on INTEGER NOT NULL DEFAULT 0,
      trail_min REAL NOT NULL DEFAULT 5,
      trail_climb INTEGER NOT NULL DEFAULT 100,
      trail_climb_add INTEGER NOT NULL DEFAULT 0,
      flag_female REAL NOT NULL DEFAULT 10,
      flag_male REAL NOT NULL DEFAULT 10,
      observe INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS mileage_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 0,
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS mileage_counts (
      run_id INTEGER NOT NULL,
      club_id INTEGER NOT NULL,
      counted INTEGER NOT NULL DEFAULT 0,
      volume_km REAL NOT NULL DEFAULT 0,
      manual INTEGER NOT NULL DEFAULT 0,
      challenge TEXT NOT NULL DEFAULT '',
      decision TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (run_id, club_id)
    );
    CREATE TABLE IF NOT EXISTS mileage_flags (
      user_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      target_km REAL NOT NULL,
      PRIMARY KEY (user_id, month)
    );
    CREATE TABLE IF NOT EXISTS user_mileage (
      user_id INTEGER PRIMARY KEY,
      gender TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS supplies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL,
      name TEXT NOT NULL,
      total INTEGER NOT NULL,
      quota INTEGER NOT NULL,
      month TEXT NOT NULL,
      need_checks INTEGER NOT NULL DEFAULT 0,
      need_km REAL NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      opened INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS supply_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supply_id INTEGER NOT NULL,
      club_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      given_at TEXT NOT NULL DEFAULT '',
      UNIQUE (supply_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS leagues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      sponsor TEXT NOT NULL DEFAULT '',
      prize TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS league_joins (
      league_id INTEGER NOT NULL,
      club_id INTEGER NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (league_id, club_id)
    );
    CREATE TABLE IF NOT EXISTS radar_profiles (
      user_id INTEGER PRIMARY KEY,
      gender TEXT NOT NULL DEFAULT '',
      birth TEXT NOT NULL DEFAULT '',
      province TEXT NOT NULL DEFAULT '',
      target_full INTEGER NOT NULL DEFAULT 0,
      target_half INTEGER NOT NULL DEFAULT 0,
      target_10k INTEGER NOT NULL DEFAULT 0,
      target_5k INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS prize_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      race_id TEXT NOT NULL,
      distance TEXT NOT NULL,
      kind TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT '',
      age_min INTEGER NOT NULL DEFAULT 0,
      age_max INTEGER NOT NULL DEFAULT 0,
      province TEXT NOT NULL DEFAULT '',
      place_n INTEGER NOT NULL DEFAULT 0,
      break_sec INTEGER NOT NULL DEFAULT 0,
      amount INTEGER NOT NULL DEFAULT 0,
      tax INTEGER NOT NULL DEFAULT 0,
      stack INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      cutoff_sec INTEGER NOT NULL DEFAULT 0,
      cutoff_source TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS club_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS club_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS club_likes (
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (post_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS draw_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      race_id TEXT NOT NULL,
      label TEXT NOT NULL,
      applicants INTEGER NOT NULL,
      quota INTEGER NOT NULL,
      source TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS draw_rates_race_label ON draw_rates(race_id, label);
    CREATE TABLE IF NOT EXISTS split_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      kind TEXT NOT NULL,
      yuan INTEGER NOT NULL,
      settled INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);
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
