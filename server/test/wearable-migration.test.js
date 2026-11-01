const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

test("legacy file summaries migrate conservatively once without changing manual records or administrator PK decisions", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wearable-migration-"));
  const file = path.join(dir, "old-app.sqlite");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, MARATHON_DB: file, MARATHON_MEDIA: path.join(dir, "media"), NODE_ENV: "test" };
  const initialize = `require(${JSON.stringify(path.resolve(__dirname, "../src/db"))}).getDb().close()`;
  function openInChild() {
    const reply = spawnSync(process.execPath, ["-e", initialize], { env, encoding: "utf8", timeout: 15000 });
    assert.equal(reply.status, 0, reply.stderr || reply.error?.message);
  }
  openInChild();

  // Recreate the actual previous schema, before any of the new metadata exists.
  let db = new Database(file);
  for (const name of ["run_mode", "climb_known", "import_quality", "import_edits"]) db.exec("ALTER TABLE runs DROP COLUMN " + name);
  db.exec("DROP INDEX IF EXISTS wearable_activity_start; ALTER TABLE wearable_activities DROP COLUMN start_key");
  db.prepare("INSERT INTO users (id, nickname, token, created_at) VALUES (901, '迁移跑者', 'wearable-migration-901', '2020-01-01')").run();
  db.prepare("INSERT INTO clubs (id, name, code, owner_id, created_at) VALUES (901, '迁移测试团', 'WEARABLE-MIGRATION', 901, '2020-01-01')").run();
  db.prepare("INSERT INTO club_members (club_id, user_id, joined_at, role) VALUES (901, 901, '2020-01-01', 'owner')").run();
  const insertRun = db.prepare("INSERT INTO runs (id, user_id, type, started_at, ended_at, distance_km, duration_sec, climb_m, pace_sec, volume_km, city, source, created_at) VALUES (?, 901, ?, '2025-10-11T14:00', '2025-10-11T15:00:17', 10, 3600, ?, 360, 10, '北京', ?, '2025-10-11')");
  const insertCount = db.prepare("INSERT INTO mileage_counts (run_id, club_id, counted, volume_km, manual, challenge, decision) VALUES (?, 901, 1, ?, ?, '保留审核记录', ?)");
  for (const [id, type, climb, source, volume, manual] of [
    [901, "run", 0, "file", 10, 0],
    [902, "trail", 200, "file", 12, 0],
    [903, "run", 0, "manual", 10, 0],
    [904, "run", 0, "file", 8.5, 1],
    [905, "trail", 0, "file", 10, 0],
    [906, "trail", 0, "manual", 10, 0]
  ]) {
    insertRun.run(id, type, climb, source);
    insertCount.run(id, volume, manual, manual ? "in" : "");
  }
  db.prepare("INSERT INTO wearable_connections (id, user_id, provider, external_account_id, status, created_at, updated_at) VALUES (901, 901, 'file', 'user:901', 'connected', '2025-10-11', '2025-10-11')").run();
  const oldSummary = JSON.stringify({ externalId: "old-file-hash", startedAt: "2025-10-11T14:00", distance: 10, duration: 3600, type: "run", climb: 0 });
  db.prepare("INSERT INTO wearable_activities (connection_id, provider, external_account_id, external_id, run_id, status, payload_json, created_at, updated_at) VALUES (901, 'file', 'user:901', 'old-file-hash', 901, 'imported', ?, '2025-10-11', '2025-10-11')").run(oldSummary);
  db.close();

  openInChild();
  db = new Database(file);
  const run = (id) => db.prepare("SELECT * FROM runs WHERE id = ?").get(id);
  const count = (id) => db.prepare("SELECT * FROM mileage_counts WHERE run_id = ? AND club_id = 901").get(id);
  assert.equal(run(901).run_mode, "unknown"); assert.equal(run(901).climb_known, 0); assert.equal(run(901).import_quality, 0);
  assert.equal(count(901).counted, 0); assert.equal(count(901).volume_km, 0);
  assert.equal(run(902).run_mode, "trail"); assert.equal(run(902).climb_m, 200); assert.equal(run(902).climb_known, 1);
  assert.deepEqual(JSON.parse(run(902).import_edits), ["mode"]);
  assert.equal(count(902).counted, 1); assert.equal(count(902).volume_km, 12);
  for (const id of [903, 906]) {
    assert.equal(run(id).run_mode, ""); assert.equal(run(id).climb_known, 1); assert.equal(run(id).source, "manual");
    assert.equal(count(id).counted, 1); assert.equal(count(id).volume_km, 10);
  }
  assert.equal(run(904).run_mode, "unknown"); assert.equal(run(904).climb_known, 0);
  assert.equal(count(904).manual, 1); assert.equal(count(904).counted, 1); assert.equal(count(904).volume_km, 8.5);
  assert.equal(count(904).decision, "in"); assert.equal(count(904).challenge, "保留审核记录");
  assert.equal(run(905).run_mode, "trail"); assert.equal(run(905).climb_known, 0);
  assert.equal(count(905).counted, 0); assert.equal(count(905).volume_km, 0);
  const mapping = db.prepare("SELECT * FROM wearable_activities WHERE external_id = 'old-file-hash'").get();
  assert.equal(mapping.start_key, ""); assert.equal(mapping.payload_json, oldSummary); assert.equal(mapping.run_id, 901);

  // A later explicit runner confirmation must survive the next process startup.
  db.prepare("UPDATE runs SET run_mode = 'road', climb_known = 1, import_edits = '[\"mode\",\"climb\"]' WHERE id = 901").run();
  db.prepare("UPDATE mileage_counts SET counted = 1, volume_km = 10 WHERE run_id = 901 AND club_id = 901").run();
  const confirmed = run(901), confirmedCount = count(901), administratorCount = count(904);
  db.close();
  openInChild();
  db = new Database(file);
  assert.deepEqual(run(901), confirmed); assert.deepEqual(count(901), confirmedCount); assert.deepEqual(count(904), administratorCount);
  db.close();
});
