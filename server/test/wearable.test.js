const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const { config, providerStatus, normalizeActivity, ingestActivity } = require("../src/wearable");

const API = "/marathon/api";
let next = 0;
async function user() {
  const answer = await request(app).post(API + "/session").send({ nickname: "设备测试" + (++next) });
  assert.equal(answer.status, 200);
  return { id: answer.body.user.id, auth: { Authorization: "Bearer " + answer.body.token } };
}
function connection(owner, provider = "file", account = "user:" + owner.id) {
  const now = new Date().toISOString(), db = getDb();
  const result = db.prepare("INSERT INTO wearable_connections (user_id, provider, external_account_id, status, created_at, updated_at) VALUES (?, ?, ?, 'connected', ?, ?)").run(owner.id, provider, account, now, now);
  return db.prepare("SELECT * FROM wearable_connections WHERE id = ?").get(Number(result.lastInsertRowid));
}
function activity(change = {}) {
  return { externalId: "activity-1", startedAt: "2025-10-28T23:40:00+08:00", distanceKm: 10, durationSec: 3600, climbM: 50, type: "run", city: "北京", ...change };
}
function club(owner, manualOk = true) {
  const db = getDb();
  const info = db.prepare("INSERT INTO clubs (name, code, owner_id, created_at) VALUES ('设备测试团', ?, ?, '2020-01-01T00:00:00Z')").run("wearable-" + owner.id, owner.id);
  const id = Number(info.lastInsertRowid);
  db.prepare("INSERT INTO club_members (club_id, user_id, joined_at) VALUES (?, ?, '2020-01-01T00:00:00Z')").run(id, owner.id);
  db.prepare("INSERT INTO mileage_rules (club_id, effective_on, manual_ok) VALUES (?, '2020-01-01', ?)").run(id, manualOk ? 1 : 0);
  return id;
}

test("canonical device summaries validate timezone, calendar dates, type, units and completed time", () => {
  const now = Date.parse("2025-10-30T00:00:00Z");
  const normalized = normalizeActivity(activity(), now);
  assert.equal(normalized.value.startedAt, "2025-10-28T23:40");
  assert.equal(normalized.value.distance, 10);
  assert.equal(normalized.value.duration, 3600);
  for (const invalid of [
    { startedAt: "2025-02-30T08:00:00Z" }, { startedAt: "2025-10-28T08:00:00" }, { startedAt: "2025-10-28" },
    { startedAt: "2025-10-28T24:00:00Z" }, { startedAt: "2025-10-28T08:00:00+15:00" },
    { startedAt: "2025-10-30T00:01:00Z" }, { startedAt: "2025-10-29T23:50:00Z", durationSec: 3600 },
    { endedAt: "2025-10-28T16:00:00Z" }, { endedAt: "2025-10-30T01:00:00Z" },
    { externalId: "" }, { type: "" }, { type: "cycling" }, { type: "running" },
    { distanceKm: undefined, distance: 10000 }, { distanceKm: 0.001 }, { distanceKm: true },
    { durationSec: Infinity }, { durationSec: 172801 }, { climbM: -1 }, { climbM: 20001 }, { climbM: "invalid" }
  ]) assert.ok(normalizeActivity(activity(invalid), now).error, JSON.stringify(invalid));
  const shifted = normalizeActivity(activity({ startedAt: "2025-10-28T16:40:00Z" }), now);
  assert.equal(shifted.value.startedAt, "2025-10-29T00:40");
});

test("provider routes fail closed even when unverified COROS credentials and URLs are configured", async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error("must not call unverified API"); };
  const keys = ["COROS_CLIENT_ID", "COROS_CLIENT_SECRET", "COROS_REDIRECT_URI", "COROS_AUTH_BASE", "COROS_ACTIVITIES_URL", "COROS_WEBHOOK_SECRET"];
  const saved = keys.map((key) => process.env[key]);
  keys.forEach((key) => { process.env[key] = "unverified-config"; });
  try {
    const owner = await user();
    assert.equal(config("coros").enabled, false);
    const list = await request(app).get(API + "/me/devices").set(owner.auth);
    assert.equal(list.status, 200);
    assert.ok(list.headers["cache-control"].includes("no-store"));
    assert.equal(list.body.devices.find((item) => item.id === "coros").status, "unavailable");
    assert.equal((await request(app).get(API + "/me/devices/coros/connect").set(owner.auth)).status, 503);
    assert.equal((await request(app).post(API + "/me/devices/coros/sync").set(owner.auth)).status, 503);
    assert.equal((await request(app).get(API + "/wearables/coros/callback?code=fake&state=fake")).status, 503);
    assert.equal((await request(app).post(API + "/wearables/coros/webhook").set("x-coros-webhook-secret", "unverified-config").send({ account: "fake", activities: [activity()] })).status, 503);
    assert.equal(calls, 0);
    assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM wearable_oauth_states WHERE user_id = ?").get(owner.id).n, 0);
  } finally {
    global.fetch = original;
    keys.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index]; });
  }
});

test("device management requires login, recognizes platforms and does not disclose credentials", async () => {
  assert.equal((await request(app).get(API + "/me/devices")).status, 401);
  assert.equal((await request(app).post(API + "/me/devices/coros/sync")).status, 401);
  assert.equal((await request(app).delete(API + "/me/devices/coros")).status, 401);
  const owner = await user(), stored = connection(owner, "coros", "coros-account");
  getDb().prepare("UPDATE wearable_connections SET access_token = 'legacy-access-secret', refresh_token = 'legacy-refresh-secret' WHERE id = ?").run(stored.id);
  const result = await request(app).get(API + "/me/devices").set(owner.auth);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.devices.map((row) => row.id), ["garmin", "coros", "huawei", "suunto"]);
  assert.ok(result.body.devices.every((row) => row.status === "unavailable" && row.action === "unavailable" && !row.lastSyncedAt));
  assert.equal(JSON.stringify(result.body).includes("legacy-"), false);
  assert.equal(providerStatus(getDb(), owner.id, "coros").status, "unavailable");
  assert.equal(result.body.devices.find((row) => row.id === "coros").canDisconnect, true);
  for (const provider of ["garmin", "coros", "huawei", "suunto"]) {
    assert.equal((await request(app).get(API + "/me/devices/" + provider + "/connect").set(owner.auth)).status, 503);
    assert.equal((await request(app).post(API + "/me/devices/" + provider + "/sync").set(owner.auth)).status, 503);
  }
  assert.equal(config("apple"), null);
  assert.equal((await request(app).get(API + "/me/devices/apple/connect").set(owner.auth)).status, 404);
  assert.equal((await request(app).get(API + "/me/devices/unknown/connect").set(owner.auth)).status, 404);
  assert.equal((await request(app).get(API + "/wearables/unknown/callback")).status, 404);
});

test("ingestion is idempotent, stores a minimal summary and preserves same-summary personal records", async () => {
  const owner = await user(), conn = connection(owner), db = getDb();
  const payload = activity({ track: [{ latitude: 39, longitude: 116 }], heartRate: [150], token: "must-not-store" });
  const first = ingestActivity(db, conn, payload);
  assert.equal(first.status, "imported");
  const again = ingestActivity(db, conn, payload);
  assert.equal(again.status, "duplicate");
  assert.equal(again.runId, first.runId);
  const anotherExport = ingestActivity(db, conn, activity({ externalId: "another-file-same-run" }));
  assert.equal(anotherExport.status, "duplicate");
  assert.equal(anotherExport.runId, first.runId);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM runs WHERE user_id = ?").get(owner.id).n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wearable_activities WHERE connection_id = ?").get(conn.id).n, 2);
  const stored = db.prepare("SELECT payload_json FROM wearable_activities WHERE id = ?").get(first.activityId).payload_json;
  assert.equal(/latitude|longitude|heartRate|must-not-store/.test(stored), false);
  const personal = await user(), personalConn = connection(personal);
  const created = await request(app).post(API + "/runs").set(personal.auth).send({ type: "run", startedAt: "2025-10-28 23:40", distanceKm: 10, duration: "1:00:00", climb: 0, city: "上海" });
  assert.equal(created.status, 200);
  const matched = ingestActivity(db, personalConn, activity());
  assert.equal(matched.status, "duplicate");
  const retained = db.prepare("SELECT * FROM runs WHERE id = ?").get(matched.runId);
  assert.equal(retained.source, "manual");
  assert.equal(retained.city, "上海");
});

test("file imports use the manual PK eligibility switch, with original personal distance", async () => {
  const owner = await user(), conn = connection(owner), db = getDb(), clubId = club(owner, false);
  const run = ingestActivity(db, conn, activity());
  assert.equal(run.status, "imported");
  assert.equal(db.prepare("SELECT counted FROM mileage_counts WHERE run_id = ? AND club_id = ?").get(run.runId, clubId).counted, 0);
  db.prepare("UPDATE mileage_rules SET manual_ok = 1, trail_on = 1, trail_climb_add = 1 WHERE club_id = ?").run(clubId);
  const trail = ingestActivity(db, conn, activity({ externalId: "trail", startedAt: "2025-10-29T02:00:00+08:00", type: "trail", climbM: 200 }));
  assert.equal(trail.status, "imported");
  assert.equal(db.prepare("SELECT volume_km FROM runs WHERE id = ?").get(trail.runId).volume_km, 10);
  const counted = db.prepare("SELECT counted, volume_km FROM mileage_counts WHERE run_id = ? AND club_id = ?").get(trail.runId, clubId);
  assert.equal(counted.counted, 1);
  assert.equal(counted.volume_km, 12);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM point_entries WHERE user_id = ?").get(owner.id).n, 0);
});

test("cross-midnight time overlap is excluded from PK while personal summaries remain available", async () => {
  const owner = await user(), conn = connection(owner), db = getDb();
  const clubId = club(owner);
  const first = ingestActivity(db, conn, activity());
  const second = ingestActivity(db, conn, activity({ externalId: "after-midnight", startedAt: "2025-10-29T00:10:00+08:00", distanceKm: 5, durationSec: 1800 }));
  assert.equal(first.status, "imported"); assert.equal(second.status, "imported");
  assert.equal(db.prepare("SELECT overlap FROM runs WHERE id = ?").get(second.runId).overlap, 1);
  assert.equal(db.prepare("SELECT counted FROM mileage_counts WHERE run_id = ? AND club_id = ?").get(first.runId, clubId).counted, 1);
  assert.equal(db.prepare("SELECT counted FROM mileage_counts WHERE run_id = ? AND club_id = ?").get(second.runId, clubId).counted, 0);
  const short = ingestActivity(db, conn, activity({ externalId: "short-overlap", startedAt: "2025-10-29T00:10:00+08:00", distanceKm: 0.1, durationSec: 30 }));
  assert.equal(db.prepare("SELECT overlap FROM runs WHERE id = ?").get(short.runId).overlap, 1);
});

test("paused imported recordings use elapsed boundaries for overlap while pace uses active timer", async () => {
  const owner = await user(), conn = connection(owner), db = getDb(), clubId = club(owner);
  const first = ingestActivity(db, conn, activity({ externalId: "paused", startedAt: "2025-10-27T06:00:00+08:00", endedAt: "2025-10-27T08:00:00+08:00", durationSec: 3600 }));
  assert.equal(first.status, "imported");
  const stored = db.prepare("SELECT * FROM runs WHERE id = ?").get(first.runId);
  assert.equal(stored.ended_at, "2025-10-27T08:00:00");
  assert.equal(stored.duration_sec, 3600); assert.equal(stored.pace_sec, 360);
  const manual = await request(app).post(API + "/runs").set(owner.auth).send({ type: "run", startedAt: "2025-10-27 07:30", distanceKm: 5, duration: "0:30:00", climb: 0 });
  assert.equal(manual.status, 200); assert.equal(manual.body.run.overlap, true);
  assert.equal(db.prepare("SELECT counted FROM mileage_counts WHERE run_id = ? AND club_id = ?").get(manual.body.run.id, clubId).counted, 0);
  const secondOwner = await user(), secondConn = connection(secondOwner), secondClub = club(secondOwner);
  const preexisting = await request(app).post(API + "/runs").set(secondOwner.auth).send({ type: "run", startedAt: "2025-10-27 07:30", distanceKm: 5, duration: "0:30:00", climb: 0 });
  assert.equal(preexisting.status, 200);
  const imported = ingestActivity(db, secondConn, activity({ externalId: "later-paused", startedAt: "2025-10-27T06:00:00+08:00", endedAt: "2025-10-27T08:00:00+08:00", durationSec: 3600 }));
  assert.equal(db.prepare("SELECT counted FROM mileage_counts WHERE run_id = ? AND club_id = ?").get(imported.runId, secondClub).counted, 0);
});

test("deleting an imported run leaves a tombstone, duplicate imports cannot resurrect it", async () => {
  const owner = await user(), conn = connection(owner), db = getDb();
  const first = ingestActivity(db, conn, activity());
  assert.equal((await request(app).delete(API + "/runs/" + first.runId).set(owner.auth)).status, 200);
  assert.equal(ingestActivity(db, conn, activity()).status, "ignored");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM runs WHERE user_id = ?").get(owner.id).n, 0);
  const row = db.prepare("SELECT status, run_id FROM wearable_activities WHERE connection_id = ?").get(conn.id);
  assert.equal(row.status, "ignored"); assert.equal(row.run_id, null);
});

test("stale, revoked and forged connections cannot import, and one account cannot expose another's run", async () => {
  const owner = await user(), other = await user(), db = getDb(), conn = connection(owner);
  assert.equal(ingestActivity(db, { ...conn, user_id: other.id }, activity()).status, "rejected");
  db.prepare("UPDATE wearable_connections SET status = 'revoked' WHERE id = ?").run(conn.id);
  assert.equal(ingestActivity(db, conn, activity()).status, "rejected");
  const bad = connection(other, "file", "user:" + owner.id);
  assert.equal(ingestActivity(db, bad, activity()).status, "rejected");
  const firstAccount = connection(owner, "coros", "same-external-account");
  const imported = ingestActivity(db, firstAccount, activity());
  assert.equal(imported.status, "imported");
  const secondAccount = connection(other, "coros", "same-external-account");
  const rejected = ingestActivity(db, secondAccount, activity());
  assert.equal(rejected.status, "rejected"); assert.equal(rejected.runId, undefined);
  db.prepare("DELETE FROM users WHERE id = ?").run(owner.id);
  assert.equal(ingestActivity(db, firstAccount, activity({ externalId: "new" })).status, "rejected");
});

test("disconnect clears legacy credentials and pending OAuth state without deleting personal runs", async () => {
  const owner = await user(), stranger = await user(), db = getDb(), conn = connection(owner, "coros", "remove-coros");
  const imported = ingestActivity(db, conn, activity());
  db.prepare("UPDATE wearable_connections SET access_token = 'access', refresh_token = 'refresh', scopes = 'workout', expires_at = '2099-01-01' WHERE id = ?").run(conn.id);
  db.prepare("INSERT INTO wearable_oauth_states (provider, user_id, state_hash, expires_at, created_at) VALUES ('coros', ?, 'pending-remove-coros', '2099-01-01', '2025-01-01')").run(owner.id);
  assert.equal((await request(app).delete(API + "/me/devices/coros").set(stranger.auth)).status, 404);
  const removed = await request(app).delete(API + "/me/devices/coros").set(owner.auth);
  assert.equal(removed.status, 200); assert.equal(removed.body.retainedRuns, true);
  const row = db.prepare("SELECT * FROM wearable_connections WHERE id = ?").get(conn.id);
  assert.equal(row.status, "revoked"); assert.equal(row.access_token, ""); assert.equal(row.refresh_token, ""); assert.equal(row.expires_at, ""); assert.equal(row.scopes, "");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wearable_oauth_states WHERE user_id = ?").get(owner.id).n, 0);
  assert.ok(db.prepare("SELECT id FROM runs WHERE id = ?").get(imported.runId));
  assert.equal(ingestActivity(db, conn, activity({ externalId: "post-disconnect" })).status, "rejected");
});
