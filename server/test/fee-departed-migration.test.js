const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

test("legacy closed fee periods backfill departed once and keep the snapshot stable", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fee-migration-"));
  const file = path.join(dir, "app.sqlite");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, MARATHON_DB: file, MARATHON_MEDIA: path.join(dir, "media"), NODE_ENV: "test" };
  const initialize = `require(${JSON.stringify(path.resolve(__dirname, "../src/db"))}).getDb().close()`;
  const initialized = spawnSync(process.execPath, ["-e", initialize], { env, encoding: "utf8" });
  assert.equal(initialized.status, 0, initialized.stderr);

  const db = new Database(file);
  db.exec("ALTER TABLE fee_records DROP COLUMN departed");
  db.prepare("INSERT INTO users (id, nickname, token, created_at) VALUES (?, ?, ?, ?)").run(701, "已离团", "fee-migration-701", "2026-01-01");
  db.prepare("INSERT INTO users (id, nickname, token, created_at) VALUES (?, ?, ?, ?)").run(702, "仍在团", "fee-migration-702", "2026-01-01");
  db.prepare("INSERT INTO clubs (id, name, code, owner_id, created_at) VALUES (71, '迁移测试团', 'FEE-MIGRATION', 702, '2026-01-01')").run();
  db.prepare("INSERT INTO club_members (club_id, user_id, joined_at, role) VALUES (71, 702, '2026-01-01', 'owner')").run();
  db.prepare("INSERT INTO fee_periods (id, club_id, name, amount, starts_on, ends_on, open, created_at) VALUES (81, 71, '旧期', 100, '2026-01-01', '2026-12-31', 0, '2026-01-01')").run();
  const insert = db.prepare("INSERT INTO fee_records (period_id, user_id, status, updated_at) VALUES (81, ?, 'paid', '2026-02-01')");
  insert.run(701);
  insert.run(702);
  db.close();

  const migrate = spawnSync(process.execPath, ["-e", initialize], { env, encoding: "utf8" });
  assert.equal(migrate.status, 0, migrate.stderr);
  const migrated = new Database(file);
  assert.equal(migrated.prepare("SELECT departed FROM fee_records WHERE period_id = 81 AND user_id = 701").get().departed, 1);
  assert.equal(migrated.prepare("SELECT departed FROM fee_records WHERE period_id = 81 AND user_id = 702").get().departed, 0);
  migrated.prepare("DELETE FROM club_members WHERE club_id = 71 AND user_id = 701").run();
  migrated.close();

  const restarted = spawnSync(process.execPath, ["-e", initialize], { env, encoding: "utf8" });
  assert.equal(restarted.status, 0, restarted.stderr);
  const afterRestart = new Database(file);
  assert.equal(afterRestart.prepare("SELECT departed FROM fee_records WHERE period_id = 81 AND user_id = 701").get().departed, 1);
  afterRestart.close();
});
