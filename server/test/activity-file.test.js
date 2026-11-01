const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const { parseActivityFile, mountActivityFiles } = require("../src/activity-file");

const LEGAL_VERSION = require("../../shared/legal-documents.json").version;
const API = "/marathon/api";
const START = "2025-10-11T06:00:00Z";
function tcx({ start = START, sport = "Running", distance = 10000, duration = 3600, laps, extra = "" } = {}) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="${sport}"><Id>${start}</Id>${laps || `<Lap StartTime="${start}"><TotalTimeSeconds>${duration}</TotalTimeSeconds><DistanceMeters>${distance}</DistanceMeters><Track><Trackpoint><Time>${start}</Time><Position><LatitudeDegrees>39</LatitudeDegrees><LongitudeDegrees>116</LongitudeDegrees></Position><HeartRateBpm><Value>144</Value></HeartRateBpm></Trackpoint></Track></Lap>`}${extra}</Activity></Activities></TrainingCenterDatabase>`);
}
async function fit({ start = START, sport = "running", subSport = "generic", distance = 10000, duration = 3600, sessions = 1, kind = "activity" } = {}) {
  const { Encoder, Profile } = await import("@garmin/fitsdk");
  const encoder = new Encoder();
  encoder.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: "development", product: 1, type: kind, timeCreated: new Date(start) });
  for (let i = 0; i < sessions; i++) encoder.onMesg(Profile.MesgNum.SESSION, { sport, subSport, startTime: new Date(start), timestamp: new Date(Date.parse(start) + duration * 1000), totalTimerTime: duration, totalElapsedTime: duration, totalDistance: distance, totalAscent: 350 });
  return Buffer.from(encoder.close());
}
async function user(name) {
  const response = await request(app).post(API + "/session").send({ nickname: name });
  assert.equal(response.status, 200);
  return { ...response.body.user, auth: { Authorization: "Bearer " + response.body.token } };
}
function upload(owner, buffer, filename = "from-coros.tcx") { return request(app).post(API + "/me/devices/import").set(owner.auth).set("X-Activity-Data-Consent", LEGAL_VERSION).attach("file", buffer, filename); }

test("file consent is versioned and checked before any upload body is read", async () => {
  const owner = await user("未授权文件解析"), db = getDb();
  const isolated = require("express")();
  let uploadReads = 0;
  isolated.use((req, _res, next) => {
    const on = req.on;
    req.on = function (event, ...args) { if (event === "data") uploadReads++; return on.call(this, event, ...args); };
    next();
  });
  mountActivityFiles(isolated, { BASE: "", getDb: () => { throw new Error("consent must be checked before reading database or body"); }, userFrom: () => owner });
  const missing = await request(isolated).post("/api/me/devices/import").attach("file", tcx(), "private-file.tcx");
  assert.equal(missing.status, 428);
  const stale = await request(isolated).post("/api/me/devices/import").set("X-Activity-Data-Consent", "outdated").attach("file", tcx(), "private-file.tcx");
  assert.equal(stale.status, 409);
  assert.equal(uploadReads, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM runs WHERE user_id=?").get(owner.id).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM legal_acceptances WHERE user_id=?").get(owner.id).n, 0);
});

test("official FIT decoder validates CRC and reads a running summary in documented metres/seconds", async () => {
  const buffer = await fit({ subSport: "trail" });
  const parsed = await parseActivityFile(buffer);
  assert.equal(parsed.format, "FIT"); assert.equal(parsed.activity.type, "trail");
  assert.equal(parsed.activity.distanceKm, 10); assert.equal(parsed.activity.durationSec, 3600); assert.equal(parsed.activity.climbM, 350);
  assert.equal(parsed.activity.startedAt, "2025-10-11T06:00:00.000Z");
  const broken = Buffer.from(buffer); broken[broken.length - 1] ^= 255;
  await assert.rejects(parseActivityFile(broken), /校验失败/);
});

test("FIT rejects cycling, routes and multisport files instead of fabricating a running activity", async () => {
  await assert.rejects(parseActivityFile(await fit({ sport: "cycling" })), /只支持跑步/);
  await assert.rejects(parseActivityFile(await fit({ kind: "course" })), /不是运动活动文件/);
  await assert.rejects(parseActivityFile(await fit({ sessions: 2 })), /一次请导入一场/);
});

test("TCX sums complete laps and deduplicates the same summary exported to FIT", async () => {
  const laps = `<Lap StartTime="${START}"><TotalTimeSeconds>1800</TotalTimeSeconds><DistanceMeters>5000</DistanceMeters></Lap><Lap StartTime="2025-10-11T06:30:00Z"><TotalTimeSeconds>1800</TotalTimeSeconds><DistanceMeters>5000</DistanceMeters></Lap>`;
  const parsed = await parseActivityFile(tcx({ laps }));
  const other = await parseActivityFile(await fit());
  assert.equal(parsed.format, "TCX"); assert.equal(parsed.activity.climbM, null); assert.equal(parsed.activity.runMode, "unknown");
  assert.equal(parsed.activity.distanceKm, 10); assert.equal(parsed.activity.durationSec, 3600);
  assert.equal(parsed.activity.externalId, other.activity.externalId);
});

test("TCX paused laps retain the final lap end even when no trackpoint is present", async () => {
  const laps = `<Lap StartTime="${START}"><TotalTimeSeconds>1800</TotalTimeSeconds><DistanceMeters>5000</DistanceMeters></Lap><Lap StartTime="2025-10-11T07:00:00Z"><TotalTimeSeconds>1800</TotalTimeSeconds><DistanceMeters>5000</DistanceMeters></Lap>`;
  const parsed = await parseActivityFile(tcx({ laps }));
  assert.equal(parsed.activity.durationSec, 3600);
  assert.equal(parsed.activity.endedAt, "2025-10-11T07:30:00.000Z");
  const futureLap = new Date(Date.now() - 5 * 60000).toISOString();
  await assert.rejects(parseActivityFile(tcx({ laps: `<Lap StartTime="${START}"><TotalTimeSeconds>1800</TotalTimeSeconds><DistanceMeters>5000</DistanceMeters></Lap><Lap StartTime="${futureLap}"><TotalTimeSeconds>1800</TotalTimeSeconds><DistanceMeters>5000</DistanceMeters></Lap>` })), /未结束|无效/);
  await assert.rejects(parseActivityFile(tcx({ laps: `<Lap StartTime="2025-10-11T05:00:00Z"><TotalTimeSeconds>1800</TotalTimeSeconds><DistanceMeters>5000</DistanceMeters></Lap>` })), /顺序无效/);
});

test("untrusted XML, routes, missing fields, unknown dates and future activities are refused", async () => {
  const invalid = [
    Buffer.from(`<!DOCTYPE x [<!ENTITY password SYSTEM "file:///etc/passwd">]>` + tcx().toString()),
    Buffer.from("<TrainingCenterDatabase><Courses/></TrainingCenterDatabase>"),
    Buffer.from("<notxml>"), Buffer.from("not a FIT file"),
    tcx({ sport: "Biking" }), tcx({ start: "2025-02-30T06:00:00Z" }), tcx({ start: "2099-10-11T06:00:00Z" }),
    tcx({ start: "2025-10-11T06:00:00" }), tcx({ laps: "<Lap><DistanceMeters>1000</DistanceMeters></Lap>" }), tcx({ distance: -1 }), tcx({ duration: 0 })
  ];
  for (const buffer of invalid) await assert.rejects(parseActivityFile(buffer), undefined, buffer.toString().slice(0, 80));
});

test("file import requires login and authentic multipart; checks actual file content and upload limits", async () => {
  const owner = await user("设备文件边界");
  assert.equal((await request(app).post(API + "/me/devices/import").attach("file", tcx(), "a.tcx")).status, 401);
  assert.equal((await request(app).post(API + "/me/devices/import").set(owner.auth).set("X-Activity-Data-Consent", LEGAL_VERSION).send({ activity: {} })).status, 400);
  assert.equal((await upload(owner, Buffer.from("fake content"), "running.fit")).status, 400);
  assert.equal((await upload(owner, Buffer.alloc(5 * 1024 * 1024 + 1), "too-big.fit")).status, 413);
  assert.equal((await request(app).post(API + "/me/devices/import").set(owner.auth).set("X-Activity-Data-Consent", LEGAL_VERSION).attach("file", tcx(), "one.tcx").attach("file", tcx(), "two.tcx")).status, 400);
});

test("imports enter original-distance statistics, use Beijing time, omit raw GPS/heart-rate and isolate accounts", async () => {
  const owner = await user("高驰导入甲"), other = await user("高驰导入乙");
  require("../src/legal").recordAcceptance(getDb(), owner.id, { version: LEGAL_VERSION, accepted: true }, "register");
  const answer = await upload(owner, tcx());
  assert.equal(answer.status, 200, JSON.stringify(answer.body)); assert.equal(answer.body.imported, 1); assert.equal(answer.body.source, "file");
  const stored = getDb().prepare("SELECT * FROM runs WHERE id = ?").get(answer.body.runId);
  assert.equal(stored.source, "file"); assert.equal(stored.started_at, "2025-10-11T14:00"); assert.equal(stored.distance_km, 10); assert.equal(stored.volume_km, 10);
  const mapping = getDb().prepare("SELECT * FROM wearable_activities WHERE run_id = ?").get(stored.id);
  assert.doesNotMatch(mapping.payload_json, /Latitude|Longitude|HeartRate|144/);
  const receipts = getDb().prepare("SELECT * FROM legal_acceptances WHERE user_id=? ORDER BY scope").all(owner.id);
  assert.deepEqual(receipts.map((row) => row.scope), ["activity-file", "terms"]);
  assert.equal(receipts.find((row) => row.scope === "terms").source, "register");
  assert.equal(receipts.find((row) => row.scope === "activity-file").source, "activity-file");
  assert.doesNotMatch(JSON.stringify(receipts), /from-coros|Latitude|Longitude|HeartRate|GPS/);
  const center = await request(app).get(API + "/me/runner?period=all").set(owner.auth);
  assert.equal(center.body.overview.totalKm, 10); assert.equal(center.body.overview.totalCount, 1); assert.equal(center.body.training.runs[0].source, "file");
  assert.equal((await request(app).get(API + "/me/runner?period=all").set(other.auth)).body.overview.totalKm, 0);
  assert.equal((await request(app).delete(API + "/runs/" + stored.id).set(other.auth)).status, 404);
});

test("file parsing rechecks a revoked session before creating any workout or import connection", async () => {
  const owner = await user("导入中登录失效"), db = getDb();
  const isolated = require("express")();
  let authorizationReads = 0;
  mountActivityFiles(isolated, { BASE: "", getDb: () => db, userFrom: () => ++authorizationReads === 1 ? owner : null });
  const answer = await request(isolated).post("/api/me/devices/import").set("X-Activity-Data-Consent", LEGAL_VERSION).attach("file", tcx(), "from-coros.tcx");
  assert.equal(answer.status, 401); assert.match(answer.body.error, /登录/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM runs WHERE user_id = ?").get(owner.id).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wearable_connections WHERE user_id = ?").get(owner.id).n, 0);
});

test("duplicate FIT/TCX import creates one run; deleting it prevents re-import resurrection", async () => {
  const owner = await user("设备去重与删除");
  const first = await upload(owner, tcx());
  const second = await upload(owner, await fit(), "from-coros.fit");
  assert.equal(second.body.imported, 0); assert.equal(second.body.updated, 1); assert.equal(second.body.runId, first.body.runId);
  const repeated = await upload(owner, await fit(), "repeat.fit");
  assert.equal(repeated.body.duplicates, 1); assert.equal(repeated.body.updated, 0);
  assert.equal((await request(app).delete(API + "/runs/" + first.body.runId).set(owner.auth)).status, 200);
  const retry = await upload(owner, tcx());
  assert.equal(retry.body.imported, 0); assert.equal(retry.body.duplicates, 1); assert.equal(retry.body.runId, 0); assert.match(retry.body.note, /删除/);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM runs WHERE user_id = ?").get(owner.id).n, 0);
});

test("concurrent imports and existing manually recorded activities keep a single personal record", async () => {
  const owner = await user("设备并发导入");
  const replies = await Promise.all([upload(owner, tcx()), upload(owner, tcx())]);
  assert.deepEqual(replies.map((r) => r.status), [200, 200]); assert.equal(replies.reduce((sum, r) => sum + r.body.imported, 0), 1);
  const other = await user("手填同场导入");
  const manual = await request(app).post(API + "/runs").set(other.auth).send({ type: "run", startedAt: "2025-10-11 14:00", distanceKm: 10, duration: "1:00:00", climb: 0 });
  assert.equal(manual.status, 200);
  const imported = await upload(other, tcx()); assert.equal(imported.body.imported, 0); assert.equal(imported.body.duplicates, 1); assert.equal(imported.body.runId, manual.body.run.id);
  assert.equal(getDb().prepare("SELECT source FROM runs WHERE id = ?").get(manual.body.run.id).source, "manual");
});

test("imported files follow each club manual-entry setting rather than impersonating trusted device sync", async () => {
  const owner = await user("文件PK规则"); const db = getDb();
  const clubId = Number(db.prepare("INSERT INTO clubs (name, code, owner_id, created_at) VALUES ('文件测试团', 'FILETEST', ?, ?)").run(owner.id, new Date().toISOString()).lastInsertRowid);
  db.prepare("INSERT INTO club_members (club_id, user_id, joined_at, role) VALUES (?, ?, '2020-01-01T00:00:00Z', 'owner')").run(clubId, owner.id);
  db.prepare("INSERT INTO mileage_rules (club_id, effective_on, manual_ok) VALUES (?, '2020-01-01', 0)").run(clubId);
  const first = await upload(owner, tcx()); assert.equal(first.status, 200);
  assert.equal(db.prepare("SELECT counted FROM mileage_counts WHERE club_id = ? AND run_id = ?").get(clubId, first.body.runId).counted, 0);
  db.prepare("UPDATE mileage_rules SET manual_ok = 1 WHERE club_id = ?").run(clubId);
  const second = await upload(owner, tcx({ start: "2025-10-12T06:00:00Z" }));
  assert.equal(db.prepare("SELECT counted FROM mileage_counts WHERE club_id = ? AND run_id = ?").get(clubId, second.body.runId).counted, 0);
  const confirmed = await request(app).put(API + "/runs/" + second.body.runId).set(owner.auth).send({ runMode: "road" });
  assert.equal(confirmed.status, 200);
  assert.equal(db.prepare("SELECT counted FROM mileage_counts WHERE club_id = ? AND run_id = ?").get(clubId, second.body.runId).counted, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM point_entries WHERE user_id = ?").get(owner.id).n, 0);
});
