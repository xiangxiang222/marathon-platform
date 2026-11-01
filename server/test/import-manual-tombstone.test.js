const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");

const API = "/marathon/api";
const START = "2025-10-11T06:01:00Z";
let sequence = 0;
const shifted = (start, seconds) => new Date(Date.parse(start) + seconds * 1000).toISOString();

function tcx({ start = START, distance = 10000, duration = 3600 } = {}) {
  return Buffer.from(`<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>${start}</Id><Lap StartTime="${start}"><TotalTimeSeconds>${duration}</TotalTimeSeconds><DistanceMeters>${distance}</DistanceMeters></Lap></Activity></Activities></TrainingCenterDatabase>`);
}
async function fit({ start = START, distance = 10020, duration = 3602 } = {}) {
  const { Encoder, Profile } = await import("@garmin/fitsdk");
  const encoder = new Encoder();
  encoder.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: "development", product: 1, type: "activity", timeCreated: new Date(start) });
  encoder.onMesg(Profile.MesgNum.SESSION, { sport: "running", subSport: "trail", startTime: new Date(start), timestamp: new Date(Date.parse(start) + duration * 1000), totalTimerTime: duration, totalElapsedTime: duration, totalDistance: distance, totalAscent: 350 });
  return Buffer.from(encoder.close());
}
async function user() {
  const reply = await request(app).post(API + "/session").send({ nickname: "手填墓碑边界" + (++sequence) });
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  return { id: reply.body.user.id, auth: { Authorization: "Bearer " + reply.body.token } };
}
function club(owner) {
  const db = getDb();
  const id = Number(db.prepare("INSERT INTO clubs (name, code, owner_id, created_at) VALUES ('手填导入测试团', ?, ?, '2020-01-01T00:00:00Z')").run("manual-boundary-" + owner.id, owner.id).lastInsertRowid);
  db.prepare("INSERT INTO club_members (club_id, user_id, joined_at, role) VALUES (?, ?, '2020-01-01T00:00:00Z', 'owner')").run(id, owner.id);
  db.prepare("INSERT INTO mileage_rules (club_id, effective_on, manual_ok, trail_on, trail_min, trail_climb, trail_climb_add) VALUES (?, '2020-01-01', 1, 1, 1, 100, 1)").run(id);
  return id;
}
async function manual(owner, start = "2025-10-11 14:01", extra = {}) {
  const reply = await request(app).post(API + "/runs").set(owner.auth).send({ type: "run", startedAt: start, distanceKm: 10, duration: "1:00:00", climb: 0, city: "上海", ...extra });
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  return reply.body.run.id;
}
const upload = (owner, bytes, name = "activity.tcx") => request(app).post(API + "/me/devices/import").set(owner.auth).attach("file", bytes, name);
const stored = id => getDb().prepare("SELECT * FROM runs WHERE id = ?").get(id);
const rows = owner => getDb().prepare("SELECT * FROM runs WHERE user_id = ? ORDER BY id").all(owner.id);
const aliases = owner => getDb().prepare("SELECT * FROM wearable_activities WHERE external_account_id = ? ORDER BY id").all("user:" + owner.id);
async function totalKm(owner) {
  const reply = await request(app).get(API + "/me/runner?period=all").set(owner.auth);
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  return reply.body.overview.totalKm;
}
async function remove(owner, id) {
  const reply = await request(app).delete(API + "/runs/" + id).set(owner.auth);
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
}

test("manual runs match cross-minute files at both inclusive 60-second boundaries without changing runner fields or PK", async () => {
  for (const seconds of [-60, -1, 1, 60]) {
    const owner = await user(), clubId = club(owner), id = await manual(owner);
    const before = stored(id), marks = getDb().prepare("SELECT * FROM mileage_counts WHERE club_id = ? AND run_id = ?").all(clubId, id);
    const reply = await upload(owner, await fit({ start: shifted(START, seconds) }), "trail.fit");
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.equal(reply.body.runId, id); assert.equal(reply.body.imported, 0); assert.equal(reply.body.updated, 0);
    assert.deepEqual(stored(id), before); assert.deepEqual(getDb().prepare("SELECT * FROM mileage_counts WHERE club_id = ? AND run_id = ?").all(clubId, id), marks);
    assert.equal(rows(owner).length, 1); assert.equal(await totalKm(owner), 10);
  }
});

test("manual matching uses exact file seconds and does not merge files 61 seconds away", async () => {
  for (const seconds of [-61, 61]) {
    const owner = await user(), id = await manual(owner), before = stored(id);
    const reply = await upload(owner, tcx({ start: shifted(START, seconds) }));
    assert.equal(reply.status, 200, JSON.stringify(reply.body)); assert.equal(reply.body.imported, 1);
    assert.notEqual(reply.body.runId, id); assert.deepEqual(stored(id), before);
    assert.equal(rows(owner).length, 2); assert.equal(await totalKm(owner), 20);
  }
});

test("manual matching crosses Beijing midnight in both directions", async () => {
  for (const [local, instant, seconds] of [["2025-10-12 00:00", "2025-10-11T16:00:00Z", -1], ["2025-10-11 23:59", "2025-10-11T15:59:00Z", 60]]) {
    const owner = await user(), id = await manual(owner, local), before = stored(id);
    const reply = await upload(owner, tcx({ start: shifted(instant, seconds) }));
    assert.equal(reply.status, 200, JSON.stringify(reply.body)); assert.equal(reply.body.runId, id);
    assert.equal(reply.body.imported, 0); assert.deepEqual(stored(id), before); assert.equal(rows(owner).length, 1);
  }
});

test("two compatible manual neighbours are ambiguous and leave runs, mappings and totals unchanged", async () => {
  const owner = await user();
  await manual(owner, "2025-10-11 14:00"); await manual(owner, "2025-10-11 14:02");
  const before = rows(owner);
  const reply = await upload(owner, tcx());
  assert.equal(reply.status, 409, JSON.stringify(reply.body)); assert.match(reply.body.error, /核对/);
  assert.deepEqual(rows(owner), before); assert.deepEqual(aliases(owner), []); assert.equal(await totalKm(owner), 20);
});

test("incompatible manual neighbours still reject without a second personal run or an import mapping", async () => {
  for (const metrics of [{ distance: 42000 }, { duration: 7200 }]) {
    const owner = await user(), id = await manual(owner), before = stored(id);
    const reply = await upload(owner, tcx({ start: shifted(START, -1), ...metrics }));
    assert.equal(reply.status, 409, JSON.stringify(reply.body)); assert.match(reply.body.error, /运动页/);
    assert.deepEqual(rows(owner), [before]); assert.deepEqual(aliases(owner), []); assert.equal(await totalKm(owner), 10);
  }
});

test("an incoming file between separate mapped and manual runs cannot silently choose one", async () => {
  const owner = await user();
  const first = await upload(owner, tcx({ start: "2025-10-11T05:59:00Z" }));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  await manual(owner);
  const before = rows(owner), mappings = aliases(owner);
  const reply = await upload(owner, tcx({ start: "2025-10-11T06:00:00Z" }));
  assert.equal(reply.status, 409, JSON.stringify(reply.body));
  assert.deepEqual(rows(owner), before); assert.deepEqual(aliases(owner), mappings); assert.equal(await totalKm(owner), 20);
});

test("concurrent nearby file imports share a protected manual record and keep its first precise time anchor", async () => {
  const owner = await user(), id = await manual(owner), before = stored(id);
  const initial = await upload(owner, tcx({ start: shifted(START, -1) }));
  assert.equal(initial.status, 200, JSON.stringify(initial.body)); assert.equal(initial.body.runId, id);
  const responses = await Promise.all([upload(owner, tcx()), upload(owner, await fit({ start: shifted(START, 1) }), "trail.fit")]);
  for (const reply of responses) { assert.equal(reply.status, 200, JSON.stringify(reply.body)); assert.equal(reply.body.runId, id); assert.equal(reply.body.imported, 0); }
  assert.deepEqual(rows(owner), [before]); assert.equal(await totalKm(owner), 10);
  const drift = await upload(owner, tcx({ start: shifted(START, 60) }));
  assert.equal(drift.status, 409, JSON.stringify(drift.body)); assert.deepEqual(rows(owner), [before]);
});

test("only nearby deleted summaries do not reserve a full time window when metrics identify a different activity", async () => {
  for (const seconds of [-60, -1, 1, 60]) for (const metrics of [{ distance: 42000 }, { duration: 7200 }]) {
    const owner = await user();
    const original = await upload(owner, tcx()); assert.equal(original.status, 200, JSON.stringify(original.body));
    await remove(owner, original.body.runId);
    const tombstone = aliases(owner)[0], bytes = tcx({ start: shifted(START, seconds), ...metrics });
    const next = await upload(owner, bytes);
    assert.equal(next.status, 200, JSON.stringify(next.body)); assert.equal(next.body.imported, 1); assert.ok(next.body.runId);
    assert.equal(rows(owner).length, 1); assert.deepEqual(aliases(owner).find(row => row.id === tombstone.id), tombstone);
    const again = await upload(owner, bytes);
    assert.equal(again.status, 200, JSON.stringify(again.body)); assert.equal(again.body.duplicates, 1); assert.equal(again.body.runId, next.body.runId); assert.equal(rows(owner).length, 1);
    const removedAgain = await upload(owner, tcx());
    assert.equal(removedAgain.status, 200, JSON.stringify(removedAgain.body)); assert.equal(removedAgain.body.runId, 0); assert.match(removedAgain.body.note, /删除/);
    assert.equal(rows(owner).length, 1); assert.equal(await totalKm(owner), (metrics.distance || 10000) / 1000);
  }
});

test("exact deleted identities with contradictory metrics use a deletion-specific conflict and cannot be recreated", async () => {
  const owner = await user();
  const original = await upload(owner, tcx()); assert.equal(original.status, 200, JSON.stringify(original.body));
  await remove(owner, original.body.runId);
  const before = aliases(owner);
  const reply = await upload(owner, await fit({ distance: 42000, duration: 14000 }), "different.fit");
  assert.equal(reply.status, 409, JSON.stringify(reply.body)); assert.match(reply.body.error, /已删除/); assert.doesNotMatch(reply.body.error, /运动页|核对已有记录/);
  assert.deepEqual(aliases(owner), before); assert.deepEqual(rows(owner), []); assert.equal(await totalKm(owner), 0);
});

test("the exact deleted start stays protected even when the imported external identity differs", async () => {
  const owner = await user();
  const original = await upload(owner, tcx()); assert.equal(original.status, 200, JSON.stringify(original.body));
  const mapping = aliases(owner)[0];
  getDb().prepare("UPDATE wearable_activities SET external_id = 'older-export-identity' WHERE id = ?").run(mapping.id);
  await remove(owner, original.body.runId);
  const before = aliases(owner);
  const reply = await upload(owner, await fit({ distance: 42000, duration: 14000 }), "same-start.fit");
  assert.equal(reply.status, 409, JSON.stringify(reply.body)); assert.match(reply.body.error, /已删除/); assert.doesNotMatch(reply.body.error, /运动页|核对已有记录/);
  assert.deepEqual(aliases(owner), before); assert.deepEqual(rows(owner), []); assert.equal(await totalKm(owner), 0);
});

test("a tombstone does not suppress another activity outside its inclusive 60-second match window", async () => {
  for (const seconds of [-61, 61]) {
    const owner = await user();
    const first = await upload(owner, tcx()); assert.equal(first.status, 200, JSON.stringify(first.body));
    await remove(owner, first.body.runId);
    const reply = await upload(owner, tcx({ start: shifted(START, seconds) }));
    assert.equal(reply.status, 200, JSON.stringify(reply.body)); assert.equal(reply.body.imported, 1);
    assert.equal(rows(owner).length, 1); assert.equal(await totalKm(owner), 10);
  }
});

test("legacy minute-only tombstones with different summaries do not block a new activity in the same minute", async () => {
  const owner = await user();
  const original = await upload(owner, tcx()); assert.equal(original.status, 200, JSON.stringify(original.body));
  const mapping = aliases(owner)[0];
  getDb().prepare("UPDATE wearable_activities SET external_id = 'legacy-summary-hash', start_key = '' WHERE id = ?").run(mapping.id);
  await remove(owner, original.body.runId);
  const before = aliases(owner)[0];
  const reply = await upload(owner, tcx({ start: shifted(START, 1), distance: 42000 }));
  assert.equal(reply.status, 200, JSON.stringify(reply.body)); assert.equal(reply.body.imported, 1); assert.equal(rows(owner).length, 1);
  assert.deepEqual(aliases(owner).find(row => row.id === before.id), before); assert.equal(await totalKm(owner), 42);
});

test("live minute-only legacy records conservatively reject incompatible neighbouring-minute files", async () => {
  for (const seconds of [-1, 60]) for (const metrics of [{ distance: 42000 }, { duration: 7200 }]) {
    const owner = await user();
    const original = await upload(owner, tcx()); assert.equal(original.status, 200, JSON.stringify(original.body));
    const mapping = aliases(owner)[0];
    getDb().prepare("UPDATE wearable_activities SET external_id = 'legacy-live-identity', start_key = '' WHERE id = ?").run(mapping.id);
    const before = rows(owner), mappings = aliases(owner);
    const reply = await upload(owner, tcx({ start: shifted(START, seconds), ...metrics }));
    assert.equal(reply.status, 409, JSON.stringify(reply.body)); assert.match(reply.body.error, /运动页/); assert.doesNotMatch(reply.body.error, /已删除/);
    assert.deepEqual(rows(owner), before); assert.deepEqual(aliases(owner), mappings); assert.equal(await totalKm(owner), 10);
  }
});

test("deleted and manual identities remain scoped to their account", async () => {
  const owner = await user(), another = await user();
  await manual(owner);
  const original = await upload(owner, tcx()); assert.equal(original.status, 200, JSON.stringify(original.body));
  await remove(owner, original.body.runId);
  const reply = await upload(another, tcx());
  assert.equal(reply.status, 200, JSON.stringify(reply.body)); assert.equal(reply.body.imported, 1);
  assert.equal(rows(owner).length, 0); assert.equal(rows(another).length, 1); assert.equal(await totalKm(another), 10);
});
