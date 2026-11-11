'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('../server/node_modules/better-sqlite3');
const { periods, freeStart } = require('./fixtures/member-showcase-scenarios.cjs');
const { noSecrets, protectedRows, checkProtected, cohort, assertNewRow } = require('./seed-member-showcase.cjs');
test('period distribution spans current week, month, year and previous year', () => {
  const dates = periods('2026-11-11');
  assert.equal(dates.length, new Set(dates).size);
  for (const date of ['2026-11-11', '2026-11-10', '2026-11-09', '2026-11-05', '2026-02-15', '2025-11-15']) assert.ok(dates.includes(date));
  for (const date of periods('2026-01-01')) assert.ok(date <= '2026-01-01', 'Never invent future runs at a year boundary');
});
test('new intervals must be completed, after join, and not overlap existing runs', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE runs(user_id INTEGER,started_at TEXT,duration_sec INTEGER)');
  db.prepare('INSERT INTO runs VALUES(8,?,3600)').run('2026-11-11T06:00');
  assert.equal(freeStart(db, 8, '2026-11-11', 1800, Date.parse('2026-11-11T09:00+08:00'), Date.parse('2026-11-11T06:20+08:00')), '2026-11-11T07:00');
  assert.throws(() => freeStart(db, 8, '2026-11-11', 1800, Date.parse('2026-11-11T06:15+08:00')), /No completed/);
  db.close();
});
test('row guard allows synthetic group/introduction only, preserves joins and real rows', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,introduction TEXT); CREATE TABLE club_members(club_id INTEGER,user_id INTEGER,mileage_group_id INTEGER,joined_at TEXT)');
  db.exec("INSERT INTO users VALUES(1,'Amy123',''),(8,'测试跑者001',''); INSERT INTO club_members VALUES(13,1,0,'2026-11-10'),(13,8,0,'2026-11-10')");
  const before = protectedRows(db);
  db.exec('UPDATE club_members SET mileage_group_id=2 WHERE user_id=8');
  assert.equal(checkProtected(db, before).altered.length, 0);
  db.exec("UPDATE users SET introduction='【模拟】简介' WHERE id=8");
  assert.equal(checkProtected(db, before).altered.length, 0);
  db.exec("UPDATE users SET introduction='changed' WHERE id=1");
  assert.throws(() => checkProtected(db, before), /Existing rows changed/);
  db.exec("UPDATE users SET introduction='' WHERE id=1");
  db.exec("UPDATE club_members SET joined_at='2025-01-01' WHERE user_id=8");
  assert.throws(() => checkProtected(db, before), /Existing rows changed/);
  db.exec("UPDATE club_members SET joined_at='2026-11-10' WHERE user_id=8; UPDATE users SET nickname='fake' WHERE id=1");
  assert.throws(() => checkProtected(db, before), /Existing rows changed/);
  db.close();
});
test('credential fields cannot enter journal or reports', () => {
  assert.throws(() => noSecrets({ rows: [{ token: 'redacted' }] }), /Credentials/);
  assert.throws(() => noSecrets({ authorization: 'redacted' }), /Credentials/);
  assert.deepEqual(noSecrets({ userId: 8, km: 12 }), { userId: 8, km: 12 });
});
test('mutation guard resolves textual race IDs and rejects old rows before writing', () => {
  const db = new Database(':memory:');
  db.exec("CREATE TABLE races(id TEXT PRIMARY KEY); INSERT INTO races VALUES('old-race')");
  const ids = { races: new Set([1]) };
  db.exec("INSERT INTO races VALUES('new-race')");
  assert.throws(() => assertNewRow(db, ids, 'races', 'old-race'), /Refuse/);
  assert.doesNotThrow(() => assertNewRow(db, ids, 'races', 'new-race'));
  assert.throws(() => assertNewRow(db, ids, 'races', 'missing-race'), /Refuse/);
  db.close();
});
test('cohort rejects ordinary users even when numeric ids match', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE users(id INTEGER,nickname TEXT,created_at TEXT)');
  const insert = db.prepare('INSERT INTO users VALUES(?,?,?)');
  const manifest = [];
  for (let index = 0; index < 200; index++) { const nickname = '测试跑者' + String(index + 1).padStart(3, '0'); insert.run(index + 8, nickname, '2026-11-10T14:49:00.392Z'); manifest.push({ id: index + 8, nickname }); }
  db.exec("UPDATE users SET created_at='2026-11-11T00:00:00Z' WHERE id=8");
  assert.throws(() => cohort(db, manifest)); db.close();
});
test('all four distinct illustrations are visible 960×540 PNGs, not placeholders', () => {
  const hashes = new Set();
  const crypto = require('node:crypto');
  for (const name of ['park', 'track', 'trail', 'medal']) {
    const bytes = fs.readFileSync(path.join(__dirname, 'fixtures/member-art', name + '.png'));
    assert.ok(bytes.length > 10000); assert.equal(bytes.readUInt32BE(16), 960); assert.equal(bytes.readUInt32BE(20), 540);
    hashes.add(crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.match(fs.readFileSync(path.join(__dirname, 'fixtures/member-art', name + '.svg'), 'utf8'), /模拟训练插画/);
  }
  assert.equal(hashes.size, 4);
});
