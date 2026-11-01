const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const crypto = require("node:crypto");
const { app } = require("../src/index");
const { getDb } = require("../src/db");

const LEGAL_VERSION = require("../../shared/legal-documents.json").version;
const API = "/marathon/api";
const START = "2025-10-11T06:00:17Z";
let sequence = 0;

function tcx({ start = START, distance = 10000, duration = 3600 } = {}) {
  return Buffer.from(`<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>${start}</Id><Lap StartTime="${start}"><TotalTimeSeconds>${duration}</TotalTimeSeconds><DistanceMeters>${distance}</DistanceMeters></Lap></Activity></Activities></TrainingCenterDatabase>`);
}

async function fit({ start = START, subSport = "trail", distance = 10000, duration = 3600, climb = 350, elapsed = duration } = {}) {
  const { Encoder, Profile } = await import("@garmin/fitsdk");
  const encoder = new Encoder();
  encoder.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: "development", product: 1, type: "activity", timeCreated: new Date(start) });
  const session = { sport: "running", subSport, startTime: new Date(start), timestamp: new Date(Date.parse(start) + elapsed * 1000), totalTimerTime: duration, totalElapsedTime: elapsed, totalDistance: distance };
  if (climb != null) session.totalAscent = climb;
  encoder.onMesg(Profile.MesgNum.SESSION, session);
  return Buffer.from(encoder.close());
}

async function user() {
  const reply = await request(app).post(API + "/session").send({ nickname: "文件补全回归" + (++sequence) });
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  return { id: reply.body.user.id, auth: { Authorization: "Bearer " + reply.body.token } };
}

function club(owner, { climb = 100, add = true } = {}) {
  const db = getDb();
  const id = Number(db.prepare("INSERT INTO clubs (name, code, owner_id, created_at) VALUES ('文件补全测试团', ?, ?, '2020-01-01T00:00:00Z')").run("enrichment-" + owner.id, owner.id).lastInsertRowid);
  db.prepare("INSERT INTO club_members (club_id, user_id, joined_at, role) VALUES (?, ?, '2020-01-01T00:00:00Z', 'owner')").run(id, owner.id);
  db.prepare("INSERT INTO mileage_rules (club_id, effective_on, manual_ok, trail_on, trail_min, trail_climb, trail_climb_add) VALUES (?, '2020-01-01', 1, 1, 1, ?, ?)").run(id, climb, add ? 1 : 0);
  return id;
}

function upload(owner, bytes, name = "export.tcx") {
  return request(app).post(API + "/me/devices/import").set(owner.auth).set("X-Activity-Data-Consent", LEGAL_VERSION).attach("file", bytes, name);
}
function stored(id) { return getDb().prepare("SELECT * FROM runs WHERE id = ?").get(id); }
function runCount(owner) { return getDb().prepare("SELECT COUNT(*) AS n FROM runs WHERE user_id = ?").get(owner.id).n; }
function mark(clubId, runId) { return getDb().prepare("SELECT * FROM mileage_counts WHERE club_id = ? AND run_id = ?").get(clubId, runId); }
async function shown(owner, id) {
  const reply = await request(app).get(API + "/runs?month=2025-10").set(owner.auth);
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  return reply.body.runs.find((run) => run.id === id);
}
async function personal(owner) {
  const reply = await request(app).get(API + "/me/runner?period=all").set(owner.auth);
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  return reply.body.overview;
}

// Reproduce the earlier schema's irreversible minute-only summary and hash.
// setup-env.js gives this test process its own temporary database.
function makeLegacy(runId) {
  const db = getDb();
  const mappings = db.prepare("SELECT * FROM wearable_activities WHERE run_id = ?").all(runId);
  assert.ok(mappings.length);
  for (const row of mappings) {
    const legacyId = crypto.createHash("sha256").update([START.slice(0, 19), 10, 3600].join("|")).digest("hex");
    const old = { externalId: legacyId, startedAt: "2025-10-11T14:00", endedAt: "2025-10-11T15:00:17", distance: 10, duration: 3600, type: "run", climb: 0, city: "" };
    db.prepare("UPDATE wearable_activities SET external_id = ?, payload_json = ? WHERE id = ?").run(legacyId, JSON.stringify(old), row.id);
  }
  for (const table of ["runs", "wearable_activities"]) {
    if (db.prepare("PRAGMA table_info(" + table + ")").all().some((col) => col.name === "start_key")) {
      db.prepare("UPDATE " + table + " SET start_key = '' WHERE " + (table === "runs" ? "id = ?" : "run_id = ?")).run(runId);
    }
  }
  db.prepare("UPDATE runs SET run_mode = 'unknown', climb_known = 0, climb_m = 0, import_quality = 0, import_edits = '[]' WHERE id = ?").run(runId);
}

test("TCX stays unclassified with unknown ascent; a later trail FIT enriches one run and rejudges PK", async () => {
  const owner = await user(), clubId = club(owner);
  const first = await upload(owner, tcx());
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.imported, 1); assert.equal(first.body.needsConfirmation, true);
  const before = await shown(owner, first.body.runId);
  assert.equal(before.runMode, "unknown"); assert.equal(before.needsTypeConfirmation, true);
  assert.equal(before.climb, null); assert.equal(before.climbKnown, false);
  assert.equal(mark(clubId, first.body.runId).counted, 0);
  const next = await upload(owner, await fit(), "coros.fit");
  assert.equal(next.status, 200, JSON.stringify(next.body));
  assert.equal(next.body.updated, 1); assert.equal(next.body.imported, 0);
  assert.equal(next.body.runId, first.body.runId); assert.equal(next.body.needsConfirmation, false);
  const after = await shown(owner, first.body.runId);
  assert.equal(after.runMode, "trail"); assert.equal(after.climb, 350); assert.equal(after.climbKnown, true);
  assert.equal(runCount(owner), 1); assert.equal((await personal(owner)).totalKm, 10);
  assert.equal(mark(clubId, first.body.runId).counted, 1); assert.equal(mark(clubId, first.body.runId).volume_km, 13.5);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM point_entries WHERE user_id = ?").get(owner.id).n, 0);
});

test("cross-format distance rounding changes enrich a single personal record and its pace", async () => {
  for (const distance of [10010, 10020]) {
    const owner = await user();
    const first = await upload(owner, tcx());
    const next = await upload(owner, await fit({ distance, duration: 3602 }), "garmin.fit");
    assert.equal(next.status, 200, JSON.stringify(next.body)); assert.equal(next.body.updated, 1);
    assert.equal(next.body.runId, first.body.runId); assert.equal(runCount(owner), 1);
    const row = stored(first.body.runId);
    assert.equal(row.distance_km, distance / 1000); assert.equal(row.duration_sec, 3602);
    assert.equal(row.volume_km, distance / 1000); assert.equal(row.pace_sec, Math.round(3602 / (distance / 1000)));
    assert.equal((await personal(owner)).totalKm, distance / 1000);
  }
});

test("a lower-information TCX never downgrades an existing trail FIT", async () => {
  const owner = await user(), clubId = club(owner);
  const first = await upload(owner, await fit({ distance: 10020, duration: 3602 }), "suunto.fit");
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const before = stored(first.body.runId), beforeMark = mark(clubId, before.id);
  const lower = await upload(owner, tcx());
  assert.equal(lower.status, 200, JSON.stringify(lower.body)); assert.equal(lower.body.imported, 0);
  assert.equal(lower.body.runId, before.id); assert.equal(runCount(owner), 1);
  const after = stored(before.id);
  for (const field of ["run_mode", "type", "climb_m", "climb_known", "distance_km", "duration_sec", "ended_at", "volume_km", "pace_sec"]) assert.equal(after[field], before[field], field);
  assert.equal(mark(clubId, before.id).volume_km, beforeMark.volume_km);
});

test("a generic FIT can be complemented by an explicitly classified FIT of the same quality", async () => {
  const owner = await user();
  const first = await upload(owner, await fit({ subSport: "generic" }), "generic.fit");
  assert.equal(first.status, 200, JSON.stringify(first.body)); assert.equal(first.body.needsConfirmation, true);
  assert.equal((await shown(owner, first.body.runId)).runMode, "unknown");
  const next = await upload(owner, await fit({ subSport: "trail" }), "trail.fit");
  assert.equal(next.status, 200, JSON.stringify(next.body)); assert.equal(next.body.updated, 1);
  assert.equal(next.body.runId, first.body.runId); assert.equal(runCount(owner), 1);
  assert.equal((await shown(owner, first.body.runId)).runMode, "trail");
});

test("non-road FIT subtypes retain personal distance without silently entering road PK", async () => {
  for (const [subSport, mode] of [["treadmill", "treadmill"], ["track", "track"], ["indoorRunning", "indoor"], ["virtualActivity", "virtual"], ["ultra", "unknown"], ["generic", "unknown"]]) {
    const owner = await user(), clubId = club(owner);
    const reply = await upload(owner, await fit({ subSport }), subSport + ".fit");
    assert.equal(reply.status, 200, JSON.stringify(reply.body)); assert.equal(reply.body.imported, 1);
    const run = await shown(owner, reply.body.runId);
    assert.equal(run.runMode, mode, subSport); assert.equal(run.needsTypeConfirmation, mode === "unknown", subSport);
    assert.equal(mark(clubId, run.id).counted, 0, subSport);
    assert.equal((await personal(owner)).totalKm, 10, subSport);
  }
});

test("city-only edits do not lock unknown type or ascent against a later FIT", async () => {
  const owner = await user();
  const first = await upload(owner, tcx());
  const edit = await request(app).put(API + "/runs/" + first.body.runId).set(owner.auth).send({ city: "北京" });
  assert.equal(edit.status, 200, JSON.stringify(edit.body)); assert.equal(edit.body.run.runMode, "unknown");
  const next = await upload(owner, await fit(), "trail.fit");
  assert.equal(next.status, 200, JSON.stringify(next.body)); assert.equal(next.body.updated, 1);
  const row = stored(first.body.runId);
  assert.equal(row.city, "北京"); assert.equal(row.run_mode, "trail"); assert.equal(row.climb_m, 350); assert.equal(row.climb_known, 1);
});

test("runner-confirmed trail type and a real zero ascent survive higher-quality file import", async () => {
  const owner = await user(), clubId = club(owner);
  const first = await upload(owner, tcx());
  const edit = await request(app).put(API + "/runs/" + first.body.runId).set(owner.auth).send({ runMode: "trail", climb: 0 });
  assert.equal(edit.status, 200, JSON.stringify(edit.body)); assert.equal(edit.body.run.climb, 0); assert.equal(edit.body.run.climbKnown, true);
  const next = await upload(owner, await fit({ subSport: "street", distance: 10020 }), "road.fit");
  assert.equal(next.status, 200, JSON.stringify(next.body)); assert.equal(next.body.runId, first.body.runId);
  const after = await shown(owner, first.body.runId);
  assert.equal(after.runMode, "trail"); assert.equal(after.climb, 0); assert.equal(after.climbKnown, true);
  assert.equal(stored(after.id).distance_km, 10.02); assert.equal(mark(clubId, after.id).counted, 0);
});

test("trail ascent remains unknown after an empty edit and cannot pass even a zero climb threshold", async () => {
  const owner = await user(), clubId = club(owner, { climb: 0 });
  const first = await upload(owner, await fit({ climb: null }), "missing-ascent.fit");
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const edit = await request(app).put(API + "/runs/" + first.body.runId).set(owner.auth).send({ city: "上海", climb: "" });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  assert.equal(edit.body.run.climb, null); assert.equal(edit.body.run.climbKnown, false);
  assert.equal(mark(clubId, first.body.runId).counted, 0);
  const confirm = await request(app).put(API + "/runs/" + first.body.runId).set(owner.auth).send({ climb: 0 });
  assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
  assert.equal(confirm.body.run.climb, 0); assert.equal(mark(clubId, first.body.runId).counted, 1);
});

test("file enrichment preserves a club administrator's explicit PK decision and volume", async () => {
  const owner = await user(), clubId = club(owner);
  const first = await upload(owner, tcx());
  const decision = await request(app).post(API + "/clubs/" + clubId + "/mileage/runs/" + first.body.runId + "/decision").set(owner.auth).send({ counted: false });
  assert.equal(decision.status, 200, JSON.stringify(decision.body));
  const before = mark(clubId, first.body.runId);
  const next = await upload(owner, await fit(), "trail.fit");
  assert.equal(next.status, 200, JSON.stringify(next.body)); assert.equal(next.body.updated, 1);
  const after = mark(clubId, first.body.runId);
  for (const field of ["counted", "manual", "decision", "volume_km"]) assert.equal(after[field], before[field], field);
});

test("deleting a TCX-derived run prevents a later FIT with changed metrics from resurrecting it", async () => {
  const owner = await user();
  const first = await upload(owner, tcx());
  assert.equal((await request(app).delete(API + "/runs/" + first.body.runId).set(owner.auth)).status, 200);
  const next = await upload(owner, await fit({ distance: 10020, duration: 3602 }), "trail.fit");
  assert.equal(next.status, 200, JSON.stringify(next.body)); assert.equal(next.body.imported, 0);
  assert.equal(next.body.runId, 0); assert.match(next.body.note, /删除/); assert.equal(runCount(owner), 0);
});

test("minute-only legacy summaries conservatively match or conflict without adding personal distance", async () => {
  for (const deleted of [false, true]) {
    const owner = await user();
    const first = await upload(owner, tcx());
    makeLegacy(first.body.runId);
    if (deleted) assert.equal((await request(app).delete(API + "/runs/" + first.body.runId).set(owner.auth)).status, 200);
    const next = await upload(owner, await fit({ distance: 10020, duration: 3602 }), "legacy-repair.fit");
    assert.ok([200, 409].includes(next.status), JSON.stringify(next.body));
    if (next.status === 200) {
      assert.equal(next.body.imported, 0); assert.equal(next.body.runId, deleted ? 0 : first.body.runId);
    }
    assert.equal(runCount(owner), deleted ? 0 : 1);
    assert.ok((await personal(owner)).totalKm <= 10.02);
  }
});

test("a shifted FIT cannot bypass an adjacent-minute legacy record or its deletion tombstone", async () => {
  for (const deleted of [false, true]) {
    const owner = await user();
    const first = await upload(owner, tcx());
    makeLegacy(first.body.runId);
    if (deleted) assert.equal((await request(app).delete(API + "/runs/" + first.body.runId).set(owner.auth)).status, 200);
    const next = await upload(owner, await fit({ start: "2025-10-11T06:01:02Z", distance: 10020, duration: 3602 }), "shifted-legacy.fit");
    assert.equal(next.status, 409, JSON.stringify(next.body));
    assert.equal(runCount(owner), deleted ? 0 : 1);
    assert.equal((await personal(owner)).totalKm, deleted ? 0 : 10);
  }
});

test("compatible exports shifted by 1 to 60 seconds in either direction enrich one run across minute boundaries", async () => {
  for (const seconds of [-60, -1, 1, 10, 60]) {
    const owner = await user(), clubId = club(owner);
    const first = await upload(owner, tcx());
    const start = new Date(Date.parse(START) + seconds * 1000).toISOString();
    const next = await upload(owner, await fit({ start, distance: 10020, duration: 3602 }), "nearby.fit");
    assert.equal(next.status, 200, JSON.stringify(next.body)); assert.equal(next.body.updated, 1);
    assert.equal(next.body.runId, first.body.runId); assert.equal(next.body.imported, 0); assert.equal(runCount(owner), 1);
    const run = stored(first.body.runId);
    assert.equal(run.distance_km, 10.02); assert.equal(run.run_mode, "trail"); assert.equal(run.climb_m, 350);
    assert.equal(run.started_at, new Date(Date.parse(start) + 8 * 3600000).toISOString().slice(0, 16));
    assert.equal(run.ended_at, new Date(Date.parse(start) + 3602000 + 8 * 3600000).toISOString().slice(0, 19));
    assert.equal(mark(clubId, run.id).counted, 1); assert.equal((await personal(owner)).totalKm, 10.02);
    const repeated = await upload(owner, tcx());
    assert.equal(repeated.status, 200, JSON.stringify(repeated.body)); assert.equal(repeated.body.duplicates, 1);
    assert.deepEqual(stored(run.id), run);
  }
});

test("nearby starts with conflicting distance or timer reject without writing a run, alias or PK change", async () => {
  for (const seconds of [-60, 1, 60]) for (const metrics of [{ distance: 15000 }, { duration: 4800 }]) {
    const owner = await user(), clubId = club(owner);
    const first = await upload(owner, tcx());
    const before = stored(first.body.runId), beforeMark = mark(clubId, first.body.runId);
    const mappings = getDb().prepare("SELECT * FROM wearable_activities WHERE run_id = ?").all(first.body.runId);
    const next = await upload(owner, await fit({ start: new Date(Date.parse(START) + seconds * 1000).toISOString(), ...metrics }), "conflict.fit");
    assert.equal(next.status, 409, JSON.stringify(next.body)); assert.match(next.body.error, /未新增或覆盖/);
    assert.equal(runCount(owner), 1); assert.deepEqual(stored(first.body.runId), before); assert.deepEqual(mark(clubId, first.body.runId), beforeMark);
    assert.deepEqual(getDb().prepare("SELECT * FROM wearable_activities WHERE run_id = ?").all(first.body.runId), mappings);
  }
});

test("deletion tombstones recognize compatible shifted exports without resurrecting the removed run", async () => {
  for (const seconds of [-60, -1, 1, 60]) {
    const owner = await user();
    const first = await upload(owner, tcx());
    assert.equal((await request(app).delete(API + "/runs/" + first.body.runId).set(owner.auth)).status, 200);
    const next = await upload(owner, await fit({ start: new Date(Date.parse(START) + seconds * 1000).toISOString(), distance: 10020, duration: 3602 }), "deleted.fit");
    assert.equal(next.status, 200, JSON.stringify(next.body)); assert.equal(next.body.imported, 0); assert.equal(next.body.updated, 0);
    assert.equal(next.body.runId, 0); assert.match(next.body.note, /删除/); assert.equal(runCount(owner), 0);
  }
});

test("every import alias stores the final enriched summary and future matching uses the updated metrics", async () => {
  const owner = await user();
  const first = await upload(owner, tcx());
  const second = await upload(owner, await fit({ start: "2025-10-11T06:00:27Z", distance: 10190, duration: 3660 }), "more-complete.fit");
  assert.equal(second.status, 200, JSON.stringify(second.body)); assert.equal(second.body.updated, 1);
  const aliases = () => getDb().prepare("SELECT * FROM wearable_activities WHERE run_id = ? ORDER BY id").all(first.body.runId);
  const accepted = aliases(); assert.equal(accepted.length, 2);
  for (const alias of accepted) {
    const summary = JSON.parse(alias.payload_json);
    assert.equal(summary.distance, 10.19); assert.equal(summary.duration, 3660); assert.equal(summary.type, "trail");
    assert.equal(summary.runMode, "trail"); assert.equal(summary.climb, 350); assert.equal(summary.climbKnown, true);
  }
  const third = await upload(owner, await fit({ start: "2025-10-11T06:00:32Z", distance: 10350, duration: 3720 }), "updated-neighbour.fit");
  assert.equal(third.status, 200, JSON.stringify(third.body)); assert.equal(third.body.runId, first.body.runId);
  assert.equal(third.body.imported, 0); assert.equal(runCount(owner), 1);
  // Equal-quality/less complete exports cannot replace the accepted FIT metrics.
  const lower = await upload(owner, tcx()); assert.equal(lower.status, 200, JSON.stringify(lower.body));
  assert.equal(stored(first.body.runId).distance_km, 10.19); assert.equal(stored(first.body.runId).duration_sec, 3660);
  for (const [index, alias] of aliases().entries()) {
    const summary = JSON.parse(alias.payload_json);
    assert.equal(summary.distance, 10.19); assert.equal(summary.duration, 3660); assert.equal(summary.runMode, "trail"); assert.equal(summary.climb, 350);
    if (index < accepted.length) { assert.equal(alias.external_id, accepted[index].external_id); assert.equal(alias.start_key, accepted[index].start_key); }
  }
});

test("pre-fix aliases with stale TCX metrics compare against the accepted live record", async () => {
  const owner = await user();
  const first = await upload(owner, tcx());
  assert.equal((await upload(owner, await fit({ distance: 10190 }), "accepted.fit")).status, 200);
  const alias = getDb().prepare("SELECT * FROM wearable_activities WHERE run_id = ? ORDER BY id LIMIT 1").get(first.body.runId);
  const stale = { ...JSON.parse(alias.payload_json), distance: 10, duration: 3600, type: "run", runMode: "unknown", climb: 0 };
  getDb().prepare("UPDATE wearable_activities SET payload_json = ? WHERE id = ?").run(JSON.stringify(stale), alias.id);
  const next = await upload(owner, await fit({ distance: 10350 }), "compatible.fit");
  assert.equal(next.status, 200, JSON.stringify(next.body)); assert.equal(next.body.runId, first.body.runId);
  assert.equal(runCount(owner), 1); assert.equal(JSON.parse(getDb().prepare("SELECT payload_json FROM wearable_activities WHERE id = ?").get(alias.id).payload_json).distance, 10.19);
});

test("nearby FIT correction updates both date boundaries when crossing Beijing midnight", async () => {
  for (const [original, seconds] of [["2025-10-11T16:00:17Z", -60], ["2025-10-11T15:59:17Z", 60]]) {
    const owner = await user();
    const first = await upload(owner, tcx({ start: original }));
    const start = new Date(Date.parse(original) + seconds * 1000).toISOString();
    const corrected = await upload(owner, await fit({ start }), "midnight.fit");
    assert.equal(corrected.status, 200, JSON.stringify(corrected.body)); assert.equal(corrected.body.runId, first.body.runId);
    const row = stored(first.body.runId);
    assert.equal(row.started_at, new Date(Date.parse(start) + 8 * 3600000).toISOString().slice(0, 16));
    assert.equal(row.ended_at, new Date(Date.parse(start) + 9 * 3600000).toISOString().slice(0, 19));
    assert.equal(runCount(owner), 1);
  }
});

test("successive aliases cannot drift beyond the first exact start and two distinct nearby runs stay ambiguous", async () => {
  const owner = await user();
  const first = await upload(owner, tcx());
  const shifted = await upload(owner, await fit({ start: "2025-10-11T06:01:17Z" }), "shifted.fit");
  assert.equal(shifted.status, 200, JSON.stringify(shifted.body));
  const before = stored(first.body.runId);
  const drift = await upload(owner, await fit({ start: "2025-10-11T06:01:18Z" }), "drift.fit");
  assert.equal(drift.status, 409, JSON.stringify(drift.body)); assert.deepEqual(stored(first.body.runId), before); assert.equal(runCount(owner), 1);

  const other = await user();
  assert.equal((await upload(other, tcx())).status, 200);
  assert.equal((await upload(other, tcx({ start: "2025-10-11T06:02:17Z" }))).status, 200);
  assert.equal(runCount(other), 2);
  const rows = getDb().prepare("SELECT * FROM runs WHERE user_id = ? ORDER BY id").all(other.id);
  const ambiguous = await upload(other, await fit({ start: "2025-10-11T06:01:17Z" }), "ambiguous.fit");
  assert.equal(ambiguous.status, 409, JSON.stringify(ambiguous.body)); assert.equal(runCount(other), 2);
  assert.deepEqual(getDb().prepare("SELECT * FROM runs WHERE user_id = ? ORDER BY id").all(other.id), rows);
});

test("exact 100-metre and 60-second tolerances remain inclusive despite floating point rounding", async () => {
  const owner = await user();
  const first = await upload(owner, tcx({ distance: 700, duration: 300 }));
  const corrected = await upload(owner, await fit({ distance: 800, duration: 360, start: "2025-10-11T06:01:17Z" }), "boundary.fit");
  assert.equal(corrected.status, 200, JSON.stringify(corrected.body)); assert.equal(corrected.body.updated, 1);
  assert.equal(corrected.body.runId, first.body.runId); assert.equal(runCount(owner), 1);
  assert.equal(stored(first.body.runId).distance_km, 0.8); assert.equal(stored(first.body.runId).duration_sec, 360);
});

test("same-second imports with grossly inconsistent summaries are rejected without overwriting", async () => {
  const owner = await user();
  const first = await upload(owner, tcx());
  const next = await upload(owner, await fit({ distance: 42195, duration: 15000 }), "different.fit");
  assert.equal(next.status, 409, JSON.stringify(next.body)); assert.equal(runCount(owner), 1);
  assert.equal(stored(first.body.runId).distance_km, 10); assert.equal((await personal(owner)).totalKm, 10);
});

test("concurrent cross-format imports keep one complete run regardless of request order", async () => {
  const bytes = await fit({ distance: 10020 });
  for (const reverse of [false, true]) {
    const owner = await user();
    const files = reverse ? [[bytes, "first.fit"], [tcx(), "second.tcx"]] : [[tcx(), "first.tcx"], [bytes, "second.fit"]];
    const replies = await Promise.all(files.map(([buffer, name]) => upload(owner, buffer, name)));
    for (const reply of replies) assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.equal(replies.reduce((n, reply) => n + reply.body.imported, 0), 1);
    assert.equal(replies[0].body.runId, replies[1].body.runId); assert.equal(runCount(owner), 1);
    const row = stored(replies[0].body.runId);
    assert.equal(row.run_mode, "trail"); assert.equal(row.climb_m, 350); assert.equal(row.distance_km, 10.02);
    assert.equal((await personal(owner)).totalKm, 10.02);
  }
});

test("missing FIT fields never erase a runner-confirmed type or previously known ascent", async () => {
  const owner = await user();
  const first = await upload(owner, tcx());
  const edit = await request(app).put(API + "/runs/" + first.body.runId).set(owner.auth).send({ runMode: "trail", climb: 120 });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  const unknownFit = await upload(owner, await fit({ subSport: "generic", climb: null }), "incomplete.fit");
  assert.equal(unknownFit.status, 200, JSON.stringify(unknownFit.body));
  const after = await shown(owner, first.body.runId);
  assert.equal(after.runMode, "trail"); assert.equal(after.climb, 120); assert.equal(after.climbKnown, true);
  assert.equal(after.needsTypeConfirmation, false); assert.equal(runCount(owner), 1);
});

test("a nearby file preserves every field of a pre-existing handwritten personal record", async () => {
  const owner = await user(), clubId = club(owner);
  const first = await request(app).post(API + "/runs").set(owner.auth).send({ type: "run", startedAt: "2025-10-11 14:00", distanceKm: 10, duration: "1:00:00", climb: 0, city: "上海" });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const before = stored(first.body.run.id), beforeMark = mark(clubId, before.id);
  const imported = await upload(owner, await fit({ distance: 10020, duration: 3602 }), "nearby.fit");
  assert.equal(imported.status, 200, JSON.stringify(imported.body));
  assert.equal(imported.body.imported, 0); assert.equal(imported.body.updated, 0); assert.equal(imported.body.runId, before.id);
  assert.deepEqual(stored(before.id), before); assert.deepEqual(mark(clubId, before.id), beforeMark);
  assert.equal(runCount(owner), 1); assert.equal((await personal(owner)).totalKm, 10);
});

test("FIT enrichment rechecks time overlap using its updated elapsed boundary", async () => {
  const owner = await user(), clubId = club(owner);
  const first = await upload(owner, tcx());
  const edit = await request(app).put(API + "/runs/" + first.body.runId).set(owner.auth).send({ runMode: "road" });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  assert.equal(mark(clubId, first.body.runId).counted, 1);
  const other = await request(app).post(API + "/runs").set(owner.auth).send({ type: "run", startedAt: "2025-10-11 15:30", distanceKm: 5, duration: "0:30:00", climb: 0 });
  assert.equal(other.status, 200, JSON.stringify(other.body)); assert.equal(other.body.run.overlap, false);
  const next = await upload(owner, await fit({ subSport: "street", elapsed: 7200 }), "paused.fit");
  assert.equal(next.status, 200, JSON.stringify(next.body)); assert.equal(next.body.updated, 1);
  const row = stored(first.body.runId);
  assert.equal(row.ended_at, "2025-10-11T16:00:17"); assert.equal(row.duration_sec, 3600); assert.equal(row.pace_sec, 360);
  assert.equal(row.overlap, 1); assert.equal(mark(clubId, row.id).counted, 0); assert.equal(mark(clubId, row.id).volume_km, 0);
  assert.equal((await personal(owner)).totalKm, 15);
});
