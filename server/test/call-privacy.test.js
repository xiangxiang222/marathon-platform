const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");

test("result call sheet visibility matches owner, manager, uploader and member permissions", async () => {
  const db = getDb();
  const now = new Date().toISOString();
  const people = {};
  for (const role of ["owner", "manager", "uploader", "member"]) {
    const token = "call-privacy-" + role;
    const inserted = db.prepare("INSERT INTO users (nickname, token, created_at) VALUES (?, ?, ?)").run("截图权限-" + role, token, now);
    people[role] = { id: Number(inserted.lastInsertRowid), token };
  }
  const insertedClub = db.prepare("INSERT INTO clubs (name, code, owner_id, created_at) VALUES (?, ?, ?, ?)").run("截图权限跑团", "CALLPRIVACY", people.owner.id, now);
  const clubId = Number(insertedClub.lastInsertRowid);
  for (const [role, person] of Object.entries(people)) {
    db.prepare("INSERT INTO club_members (club_id, user_id, joined_at, role) VALUES (?, ?, ?, ?)").run(clubId, person.id, now, role === "manager" ? "manager" : "member");
  }
  const auth = (role) => ({ Authorization: "Bearer " + people[role].token });
  const created = await request(app).post(`/marathon/api/clubs/${clubId}/calls`).set(auth("owner")).send({ title: "截图权限测试", raceDate: "2026-11-18", distances: ["10k"], deadline: "2099-11-25T22:00" });
  assert.equal(created.status, 200);
  const callId = created.body.call.id;
  const saved = await request(app).post(`/marathon/api/clubs/${clubId}/calls/${callId}/rows`).set(auth("uploader")).send({ distance: "10k", time: "45:00" });
  assert.equal(saved.status, 200);
  const row = saved.body.call.groups[0].rows[0];
  const uploaded = await request(app).post(`/marathon/api/clubs/${clubId}/calls/${callId}/rows/${row.id}/sheet`).set(auth("uploader")).attach("file", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: "privacy.jpg", contentType: "image/jpeg" });
  assert.equal(uploaded.status, 200);
  assert.equal(uploaded.body.call.groups[0].rows[0].hasSheet, true);
  assert.equal(Object.hasOwn(uploaded.body.call.groups[0].rows[0], "filename"), false);

  for (const role of ["owner", "manager", "uploader", "member"]) {
    const detail = await request(app).get(`/marathon/api/clubs/${clubId}/calls/${callId}`).set(auth(role));
    assert.equal(detail.status, 200, role);
    const visible = detail.body.call.groups[0].rows[0];
    assert.equal(visible.hasSheet, role !== "member", role);
    assert.equal(Object.hasOwn(visible, "filename"), false, role);
    const sheet = await request(app).get(`/marathon/api/call-sheets/${row.id}`).set(auth(role));
    assert.equal(sheet.status, role === "member" ? 403 : 200, role);
  }
});
