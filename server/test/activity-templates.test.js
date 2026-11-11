// Always isolate this suite, including when invoked directly without npm test.
require("./setup-env");
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const { installActivityTemplates } = require("../src/activity-templates");
const API = "/marathon/api";
process.env.ADMIN_TOKEN = "templates-isolated-admin";
const admin = { Authorization: "Bearer templates-isolated-admin" };
let sequence = 0;

async function account() {
  const response = await request(app).post(API + "/session").send({ nickname: "模板测试" + (++sequence) });
  assert.equal(response.status, 200);
  return { id: response.body.user.id, auth: { Authorization: "Bearer " + response.body.token } };
}
async function fixture() {
  const owner = await account();
  const made = await request(app).post(API + "/clubs").set(owner.auth).send({ name: "模板跑团" + sequence, city: "北京", requestId: crypto.randomUUID() });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  return { ...owner, club: made.body.club, base: API + "/clubs/" + made.body.club.id, url: API + "/clubs/" + made.body.club.id + "/activity-templates" };
}
const config = {
  trainingType: "easy", title: "周末轻松跑", plannedKm: 8.125, place: "公园南门", gatherPlace: "南门广场", gatherAt: "提前十分钟集合",
  route: "公园环线两圈", workout: "热身后轻松跑", notice: "带水", note: "跑后拉伸", minPeople: 3, minKm: 5, points: 1, review: true,
  groups: [{ name: "轻松组", kind: "pace", pace: "6分配", capacity: 20 }], startTime: "07:30", durationMinutes: 90, signupLeadMinutes: 60, cancelLeadMinutes: 30
};
const body = (extra = {}) => ({ name: "周末例行团练", config: { ...config, ...extra } });
async function create(f, payload = body()) {
  const result = await request(app).post(f.url).set(f.auth).send(payload);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.template;
}

test("template installation is idempotent and CRUD shares normalized reusable configuration with managers", async () => {
  const f = await fixture(), db = getDb(), manager = await account();
  installActivityTemplates(db);
  installActivityTemplates(db);
  db.prepare("INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,'manager')").run(f.club.id, manager.id, new Date().toISOString());
  assert.deepEqual((await request(app).get(f.url).set(f.auth)).body, { templates: [] });
  const template = await create(f);
  assert.deepEqual(Object.keys(template).sort(), ["id", "name", "config", "version", "createdAt", "updatedAt"].sort());
  assert.equal(template.version, 1);
  assert.equal(template.config.plannedKm, 8.13);
  assert.equal(template.config.review, true);
  assert.equal(template.config.startTime, "07:30");
  assert.ok(Date.parse(template.createdAt));
  const listed = await request(app).get(f.url).set(manager.auth);
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.templates, [template]);
  assert.equal(listed.headers["cache-control"], "no-store");
  const updated = await request(app).put(f.url + "/" + template.id).set(manager.auth).send({ ...body({ title: "改为节奏跑", trainingType: "tempo" }), name: "节奏团练", version: 1 });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.template.version, 2);
  assert.equal(updated.body.template.name, "节奏团练");
  assert.equal(updated.body.template.config.title, "改为节奏跑");
  assert.equal(updated.body.template.createdAt, template.createdAt);
  assert.equal((await request(app).delete(f.url + "/" + template.id).set(manager.auth)).status, 200);
  assert.deepEqual((await request(app).get(f.url).set(f.auth)).body, { templates: [] });
  assert.equal((await request(app).delete(f.url + "/" + template.id).set(f.auth)).status, 404);
});

test("only the target club owner or managers can read, create, update, or delete templates", async () => {
  const f = await fixture(), ordinary = await account(), outsider = await fixture(), template = await create(f);
  getDb().prepare("INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,'member')").run(f.club.id, ordinary.id, new Date().toISOString());
  for (const auth of [null, ordinary.auth, outsider.auth]) {
    for (const method of ["get", "post", "put", "delete"]) {
      let call = request(app)[method](f.url + (["put", "delete"].includes(method) ? "/" + template.id : ""));
      if (auth) call = call.set(auth);
      const result = await call.send({ ...body(), version: 1 });
      assert.equal(result.status, auth ? 403 : 401, method);
    }
  }
  // Being a manager somewhere else confers no rights in this club.
  getDb().prepare("UPDATE club_members SET role='manager' WHERE club_id=? AND user_id=?").run(outsider.club.id, outsider.id);
  assert.equal((await request(app).get(f.url).set(outsider.auth)).status, 403);
  for (const method of ["put", "delete"]) {
    const result = await request(app)[method](outsider.url + "/" + template.id).set(outsider.auth).send({ ...body(), version: 1 });
    assert.equal(result.status, 404, method + " cannot reference another club's template");
  }
  assert.equal((await request(app).get(API + "/clubs/9999999/activity-templates").set(f.auth)).status, 404);
  assert.equal((await request(app).get(f.url).set(f.auth)).body.templates.length, 1);
});

test("templates default blank titles to the template name and preserve optional blank locations and relative timings", async () => {
  const f = await fixture();
  const template = await create(f, { name: "通用训练", config: { title: "   " } });
  assert.deepEqual(template.config, {
    trainingType: "custom", title: "通用训练", plannedKm: null, place: "", gatherPlace: "", gatherAt: "", route: "", workout: "", notice: "", note: "",
    minPeople: 3, minKm: 5, points: 1, review: false, groups: [{ name: "全员组", kind: "pace", pace: "", capacity: 0 }],
    startTime: "", durationMinutes: null, signupLeadMinutes: null, cancelLeadMinutes: null
  });
  for (const value of [0, null]) {
    const saved = await create(f, body({ durationMinutes: value, signupLeadMinutes: value, cancelLeadMinutes: value }));
    assert.equal(saved.config.durationMinutes, value);
    assert.equal(saved.config.signupLeadMinutes, value);
    assert.equal(saved.config.cancelLeadMinutes, value);
  }
  const max = await create(f, body({ durationMinutes: 10080, signupLeadMinutes: 43200, cancelLeadMinutes: 43200 }));
  assert.equal(max.config.durationMinutes, 10080);
  const numeric = await create(f, body({ plannedKm: "12.5", minKm: "0.1", minPeople: "500", points: "100", durationMinutes: "90", groups: [{ name: "全员", capacity: "500" }] }));
  assert.equal(numeric.config.minPeople, 500);
  assert.equal(numeric.config.groups[0].capacity, 500);
});

test("create and update reject invalid names, shared activity field limits and malformed relative schedules", async () => {
  const f = await fixture(), template = await create(f);
  const invalid = [
    { name: "", config }, { name: "名".repeat(31), config }, { name: 7, config }, { name: "非法\n名称", config },
    { name: "缺配置" }, { name: "坏配置", config: [] }, { name: "坏配置", config: null },
    ...[
      { title: "长".repeat(41) }, { title: {} }, { trainingType: "toString" }, { place: "地".repeat(41) }, { gatherPlace: "点".repeat(41) },
      { gatherAt: "时".repeat(41) }, { route: "线".repeat(201) }, { workout: "练".repeat(2001) }, { note: "注".repeat(2001) }, { notice: "知".repeat(1001) },
      { plannedKm: 0 }, { plannedKm: 201 }, { plannedKm: true }, { minKm: 0.09 }, { minKm: 101 }, { minKm: {} },
      { minPeople: 0 }, { minPeople: 501 }, { minPeople: 2.5 }, { points: -1 }, { points: 101 }, { points: 1.2 }, { review: "false" },
      { startTime: "7:30" }, { startTime: "24:00" }, { startTime: "07:60" }, { durationMinutes: -1 }, { durationMinutes: 10081 }, { durationMinutes: 0.5 },
      { signupLeadMinutes: 43201 }, { cancelLeadMinutes: -1 }, { cancelLeadMinutes: false }, { groups: [] }, { groups: {} },
      { groups: Array.from({ length: 13 }, (_, i) => ({ name: String(i) })) }, { groups: [{ name: "" }] }, { groups: [{ name: "组".repeat(21) }] },
      { groups: [{ name: "重复" }, { name: "重复" }] }, { groups: [{ name: "组", kind: "toString" }] }, { groups: [{ name: "组", pace: "配".repeat(41) }] },
      { groups: [{ name: "组", capacity: 501 }] }, { groups: [{ name: "组", capacity: 1.1 }] }, { groups: [{ name: "组", capacity: {} }] }
    ].map(change => body(change))
  ];
  for (const payload of invalid) {
    const made = await request(app).post(f.url).set(f.auth).send(payload);
    assert.equal(made.status, 400, JSON.stringify(payload));
    const changed = await request(app).put(f.url + "/" + template.id).set(f.auth).send({ ...payload, version: 1 });
    assert.equal(changed.status, 400, JSON.stringify(payload));
  }
  assert.equal((await request(app).get(f.url).set(f.auth)).body.templates.length, 1);
  assert.equal((await request(app).get(f.url).set(f.auth)).body.templates[0].version, 1);
});

test("unknown fields and absolute activity dates, issues and signups cannot pollute persisted configuration", async () => {
  const f = await fixture();
  for (const key of ["startsAt", "endsAt", "signupUntil", "cancelUntil", "issue", "createdAt", "signups", "members", "id", "clubId", "__proto__", "constructor"]) {
    const polluted = { ...config };
    Object.defineProperty(polluted, key, { value: key === "signups" ? [{ userId: 2 }] : "2026-11-14T07:30", enumerable: true });
    assert.equal((await request(app).post(f.url).set(f.auth).send({ name: "污染模板", config: polluted })).status, 400, key);
  }
  for (const extra of [{ startTime: "2026-11-14T07:30" }, { gatherAt: "2026-11-14 07:20" }, { gatherAt: "2026年11月14日集合" }, { groups: [{ name: "组", id: 17 }] }, { groups: [{ name: "组", signups: [1] }] }]) {
    assert.equal((await request(app).post(f.url).set(f.auth).send(body(extra))).status, 400, JSON.stringify(extra));
  }
  assert.equal((await request(app).post(f.url).set(f.auth).send({ ...body(), startsAt: "2026-11-14T07:30" })).status, 400);
  const template = await create(f);
  const stored = JSON.parse(getDb().prepare("SELECT config FROM activity_templates WHERE id=?").get(template.id).config);
  assert.equal(Object.hasOwn(stored, "startsAt"), false);
  assert.equal(JSON.stringify(stored).includes("2000-01-01"), false);
  assert.deepEqual(Object.keys(stored).sort(), Object.keys(template.config).sort());
});

test("updates require an optimistic version and concurrent editors cannot overwrite a newer template", async () => {
  const f = await fixture(), template = await create(f), url = f.url + "/" + template.id;
  for (const version of [undefined, 0, -1, "1", 1.5, null]) {
    assert.equal((await request(app).put(url).set(f.auth).send({ ...body(), version })).status, 400);
  }
  const edits = await Promise.all(["甲修改", "乙修改"].map(name => request(app).put(url).set(f.auth).send({ ...body(), name, version: 1 })));
  assert.deepEqual(edits.map(result => result.status).sort(), [200, 409]);
  const current = (await request(app).get(f.url).set(f.auth)).body.templates[0];
  assert.equal(current.version, 2);
  assert.equal(current.name, edits.find(result => result.status === 200).body.template.name);
  assert.equal((await request(app).put(url).set(f.auth).send({ ...body(), version: 1 })).status, 409);
  assert.equal((await request(app).put(f.url + "/9999999").set(f.auth).send({ ...body(), version: 1 })).status, 404);
});

test("each club has a transactional 50-template limit and deletion frees one place", async () => {
  const f = await fixture(), db = getDb(), now = new Date().toISOString();
  const insert = db.prepare("INSERT INTO activity_templates(club_id,name,config,created_at,updated_at) VALUES(?,?,?,?,?)");
  db.transaction(() => { for (let i = 0; i < 49; i++) insert.run(f.club.id, "存量模板" + i, JSON.stringify(config), now, now); })();
  const attempts = await Promise.all([1, 2].map(i => request(app).post(f.url).set(f.auth).send({ ...body(), name: "边界" + i })));
  assert.deepEqual(attempts.map(result => result.status).sort(), [201, 400]);
  assert.equal((await request(app).get(f.url).set(f.auth)).body.templates.length, 50);
  const id = attempts.find(result => result.status === 201).body.template.id;
  assert.equal((await request(app).put(f.url + "/" + id).set(f.auth).send({ ...body(), version: 1 })).status, 200);
  assert.equal((await request(app).delete(f.url + "/" + id).set(f.auth)).status, 200);
  await create(f);
  const other = await fixture();
  await create(other);
});

test("removing templates leaves published activities intact and deleting a club clears only its templates", async () => {
  const f = await fixture(), other = await fixture(), template = await create(f), otherTemplate = await create(other), db = getDb();
  const published = await request(app).post(f.base + "/activities").set(f.auth).send({ ...template.config, startsAt: "2026-12-01T07:30", endsAt: "2026-12-01T09:00" });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  const activityId = published.body.activity.id;
  const activity = db.prepare("SELECT * FROM activities WHERE id=?").get(activityId);
  const groups = db.prepare("SELECT * FROM activity_groups WHERE activity_id=?").all(activityId);
  assert.equal((await request(app).delete(f.url + "/" + template.id).set(f.auth)).status, 200);
  assert.deepEqual(db.prepare("SELECT * FROM activities WHERE id=?").get(activityId), activity);
  assert.deepEqual(db.prepare("SELECT * FROM activity_groups WHERE activity_id=?").all(activityId), groups);
  const again = await create(f);
  assert.equal((await request(app).delete(API + "/admin/clubs/" + f.club.id).set(admin)).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM activity_templates WHERE id=?").get(again.id).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM activity_templates WHERE id=?").get(otherTemplate.id).n, 1);
  assert.equal((await request(app).get(other.url).set(other.auth)).body.templates.length, 1);
});
