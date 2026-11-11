const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const crypto = require("node:crypto");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const API = "/marathon/api";
let sequence = 0;
async function fixture() {
  const result = await request(app).post(API + "/session").send({ nickname: "跑量边界回归" + (++sequence) });
  const auth = { Authorization: "Bearer " + result.body.token };
  const made = await request(app).post(API + "/clubs").set(auth).send({ name: "跑量边界测试团" + sequence, city: "测试市", requestId: crypto.randomUUID() });
  assert.equal(made.status, 200);
  return { auth, user: result.body.user, club: made.body.club, base: API + "/clubs/" + made.body.club.id };
}
const run = { type: "run", startedAt: "2024-01-01T06:00", distanceKm: 10, duration: "01:00:00", climb: 0 };
const rules = { effectiveOn: "2024-01-01", manualOk: true, runOn: true, runMin: 1, runMax: 999, paceFast: "1:00", paceSlow: "30:00", trailOn: true, trailMin: 1, trailClimb: 0, flagFemale: 0, flagMale: 0 };

test("manually including a previously excluded run assigns actual club volume and stays idempotent", async () => {
  const f = await fixture();
  const made = await request(app).post(API + "/runs").set(f.auth).send(run);
  assert.equal(made.status, 200);
  const id = made.body.run.id;
  assert.equal(getDb().prepare("SELECT counted FROM mileage_counts WHERE run_id=? AND club_id=?").get(id, f.club.id).counted, 0);
  for (const included of [true, true, false, true]) {
    const decision = await request(app).post(f.base + "/mileage/runs/" + id + "/decision").set(f.auth).send({ counted: included });
    assert.equal(decision.status, 200);
    const board = await request(app).get(f.base + "/mileage?range=all").set(f.auth);
    assert.equal(board.body.totalKm, included ? 10 : 0);
    assert.equal(board.body.rank.length, included ? 1 : 0);
    if (included) assert.equal(board.body.rank[0].km, 10);
  }
  assert.equal((await request(app).put(f.base + "/mileage/rules").set(f.auth).send({ ...rules, trailClimbAdd: true })).status, 200);
  const trail = await request(app).post(API + "/runs").set(f.auth).send({ ...run, type: "trail", startedAt: "2024-01-02T06:00", climb: 200 });
  assert.equal(trail.status, 200);
  const decideTrail = included => request(app).post(f.base + "/mileage/runs/" + trail.body.run.id + "/decision").set(f.auth).send({ counted: included });
  assert.equal((await decideTrail(true)).status, 200);
  assert.equal((await request(app).put(f.base + "/mileage/rules").set(f.auth).send({ ...rules, trailClimbAdd: false })).status, 200);
  for (const included of [true, false, true]) {
    assert.equal((await decideTrail(included)).status, 200);
    const mark = getDb().prepare("SELECT volume_km FROM mileage_counts WHERE run_id=? AND club_id=?").get(trail.body.run.id, f.club.id);
    assert.equal(mark.volume_km, 12, "repeated review preserves the previously judged volume after a rule change");
  }
});

test("mileage dates reject rollover dates, invalid clocks/months, and malformed report windows", async () => {
  const f = await fixture();
  for (const effectiveOn of ["2026-02-30", "2026-13-01", "2025-02-29"]) {
    assert.equal((await request(app).put(f.base + "/mileage/rules").set(f.auth).send({ ...rules, effectiveOn })).status, 400, effectiveOn);
  }
  for (const startedAt of ["2026-02-30T06:00", "2025-02-29T06:00", "2026-11-01T24:00"]) {
    assert.equal((await request(app).post(API + "/runs").set(f.auth).send({ ...run, startedAt })).status, 400, startedAt);
  }
  for (const query of ["kind=week&at=2026-02-30", "kind=week&at=9999-99-99", "kind=month&at=2026-13", "kind=custom&from=2026-02-30&to=2026-03-01"]) {
    const response = await request(app).get(f.base + "/mileage/report?" + query).set(f.auth);
    assert.equal(response.status, 400, query);
    assert.ok(response.body.error);
  }
  assert.equal((await request(app).put(f.base + "/mileage/rules").set(f.auth).send({ ...rules, effectiveOn: "2024-02-29" })).status, 200);
});

test("inherited object property names cannot become unsupported activity types", async () => {
  const f = await fixture();
  for (const type of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
    assert.equal((await request(app).post(API + "/runs").set(f.auth).send({ ...run, type })).status, 400, type);
  }
  assert.equal(getDb().prepare("SELECT COUNT(*) n FROM runs WHERE user_id=?").get(f.user.id).n, 0);
});
