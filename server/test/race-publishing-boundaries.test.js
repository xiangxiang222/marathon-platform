const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const request = require("supertest");
require("./setup-env");

process.env.ADMIN_TOKEN = "publishing-boundary-admin";
process.env.GROK_BOT_TOKEN = "publishing-boundary-bot";
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const admin = { Authorization: "Bearer publishing-boundary-admin" };
const bot = { Authorization: "Bearer publishing-boundary-bot" };
const base = { name: "合成发布边界验收", raceDate: "2099-04-21", province: "浙江", city: "杭州", place: "合成起点" };

test("manual publishing and review accept distance, kind and custom groups independently", async () => {
  const projects = [{ distances: ["half"] }, { kinds: ["fun"] }, { kinds: ["family"] }, { groups: ["8公里体验组"] }];
  for (const [index, fields] of projects.entries()) {
    const meet = index % 2 ? "online" : "offline";
    const created = await request(app).post("/marathon/api/admin/races").set(admin).send({ ...base, name: base.name + index, ...fields, meet });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const detail = await request(app).get("/marathon/api/races/" + created.body.id);
    assert.deepEqual(detail.body.race.distances, fields.distances || []);
    assert.deepEqual(detail.body.race.kinds, fields.kinds || []);
    assert.deepEqual(detail.body.race.groups, fields.groups || []);
    assert.equal(detail.body.race.meet, meet);

    const uploaded = await request(app).post("/marathon/api/bot/races").set(bot).send({ ...base, name: base.name + "待审" + index, officialId: "publishing-project-" + index, ...fields, meet, source: "合成验收资料" });
    assert.equal(uploaded.status, 200);
    assert.deepEqual(uploaded.body.errors, []);
    assert.equal(uploaded.body.accepted.length, 1);
    const reviewId = uploaded.body.accepted[0].id;
    const reviewed = await request(app).get("/marathon/api/admin/bot-races/" + reviewId).set(admin);
    assert.equal(reviewed.body.status, "pending");
    assert.deepEqual(reviewed.body.distances, fields.distances || []);
    assert.deepEqual(reviewed.body.kinds, fields.kinds || []);
    assert.deepEqual(reviewed.body.groups, fields.groups || []);
    const saved = await request(app).put("/marathon/api/admin/bot-races/" + reviewId).set(admin).send({ name: base.name + "已核对" + index });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
  }
  const empty = await request(app).post("/marathon/api/admin/races").set(admin).send(base);
  assert.equal(empty.status, 400);
  const emptyReview = await request(app).post("/marathon/api/bot/races").set(bot).send({ ...base, officialId: "publishing-empty", source: "合成验收资料" });
  assert.equal(emptyReview.body.accepted.length, 0);
  assert.match(emptyReview.body.errors[0].error, /至少选择一个项目/);
});

test("impossible calendar days are rejected at manual create, edit and review APIs", async () => {
  const malformed = await request(app).post("/marathon/api/admin/races").set(admin).send({ ...base, distances: ["half"], raceDate: "2099-02-30" });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.field, "raceDate");
  const created = await request(app).post("/marathon/api/admin/races").set(admin).send({ ...base, name: base.name + "日期", distances: ["half"] });
  assert.equal(created.status, 200);
  for (const field of ["raceDate", "bibAt"]) {
    const edited = await request(app).put("/marathon/api/admin/races/" + created.body.id + "/guide").set(admin).send({ ...base, distances: ["half"], [field]: "2099-02-30" });
    assert.equal(edited.status, 400);
    assert.equal(edited.body.field, field);
  }
  const unchanged = await request(app).get("/marathon/api/races/" + created.body.id);
  assert.equal(unchanged.body.race.raceDate, base.raceDate);
  assert.equal(unchanged.body.race.bibAt, "");
  const review = await request(app).post("/marathon/api/bot/races").set(bot).send({ ...base, officialId: "publishing-impossible-day", source: "合成验收资料", distances: ["half"], deadline: "2099-02-30", nodeSource: "合成验收资料" });
  assert.equal(review.body.accepted.length, 0);
  assert.match(review.body.errors[0].error, /真实的日期/);
});

test("node and race-day edits preserve official precision, validate missing intermediate nodes and honor online dates", async () => {
  const created = await request(app).post("/marathon/api/admin/races").set(admin).send({ ...base, name: base.name + "节点精度", distances: ["half"] });
  assert.equal(created.status, 200);
  const raceId = created.body.id, db = getDb();
  const regStart = "2099-03-01T10:00:00+08:00", deadline = "2099-04-20T18:00:00+08:00";
  // Official ingestion can already have exact timestamps; the editor presents
  // calendar-day inputs and must not erase their original precision on save.
  db.prepare("UPDATE races SET reg_start=?,deadline=? WHERE id=?").run(regStart, deadline, raceId);
  const saved = await request(app).put("/marathon/api/admin/races/" + raceId).set(admin).send({ regStart: "2099-03-01", deadline: "2099-04-20", source: "合成验收核对来源" });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.race.regStart, regStart);
  assert.equal(saved.body.race.deadline, deadline);
  assert.equal(saved.body.race.source, "合成验收核对来源");

  const before = db.prepare("SELECT * FROM races WHERE id=?").get(raceId);
  const invalidDay = await request(app).put("/marathon/api/admin/races/" + raceId + "/guide").set(admin).send({ ...base, name: "不应写入的名称", raceDate: "2099-04-19", distances: ["half"] });
  assert.equal(invalidDay.status, 400);
  assert.equal(invalidDay.body.field, "raceDate");
  assert.deepEqual(db.prepare("SELECT * FROM races WHERE id=?").get(raceId), before);

  const other = await request(app).post("/marathon/api/admin/races").set(admin).send({ ...base, name: base.name + "跨空节点", distances: ["half"] });
  assert.equal(other.status, 200);
  const otherId = other.body.id;
  const backwards = await request(app).put("/marathon/api/admin/races/" + otherId).set(admin).send({ regStart: "2099-03-20", drawAt: "2099-03-19", source: "合成验收资料" });
  assert.equal(backwards.status, 400);
  assert.equal(backwards.body.field, "drawAt");
  assert.deepEqual(db.prepare("SELECT reg_start,deadline,draw_at FROM races WHERE id=?").get(otherId), { reg_start: "", deadline: "", draw_at: "" });
  const chronological = await request(app).put("/marathon/api/admin/races/" + otherId).set(admin).send({ regStart: "2099-03-10", drawAt: "2099-03-19", source: "合成验收资料" });
  assert.equal(chronological.status, 200, JSON.stringify(chronological.body));
  assert.equal(chronological.body.race.deadline, "");

  const online = await request(app).put("/marathon/api/admin/races/" + otherId + "/guide").set(admin).send({ ...base, raceDate: "2099-03-05", meet: "online", distances: ["half"] });
  assert.equal(online.status, 200, JSON.stringify(online.body));
  const onlineNodes = await request(app).put("/marathon/api/admin/races/" + otherId).set(admin).send({ regStart: "2099-03-11", drawAt: "2099-03-20", source: "合成线上赛资料" });
  assert.equal(onlineNodes.status, 200, JSON.stringify(onlineNodes.body));
  const offline = await request(app).put("/marathon/api/admin/races/" + otherId + "/guide").set(admin).send({ ...base, raceDate: "2099-03-05", meet: "offline", distances: ["half"] });
  assert.equal(offline.status, 400);
  assert.equal(offline.body.field, "raceDate");
  const retained = await request(app).get("/marathon/api/races/" + otherId);
  assert.equal(retained.body.race.meet, "online");
  assert.equal(retained.body.race.raceDate, "2099-03-05");
  assert.equal(retained.body.race.drawAt, "2099-03-20");
});

test("concurrent image bodies cannot exceed the shared remaining upload slot", { timeout: 12000 }, async () => {
  const created = await request(app).post("/marathon/api/admin/races").set(admin).send({ ...base, name: base.name + "并发图片", distances: ["half"] });
  assert.equal(created.status, 200);
  const raceId = created.body.id;
  const png = fs.readFileSync(path.join(__dirname, "fixtures/race-certificate.png"));
  for (let index = 0; index < 3; index++) {
    const uploaded = await request(app).post("/marathon/api/admin/races/" + raceId + "/sheets?kind=route").set(admin).attach("file", png, { filename: "synthetic-route.png", contentType: "image/png" });
    assert.equal(uploaded.status, 200);
  }
  const server = await new Promise(resolve => { const handle = app.listen(0, "127.0.0.1", () => resolve(handle)); });
  const db = getDb(), originalPrepare = db.prepare, clients = [];
  let preflightCount = 0, unlock;
  const checked = new Promise(resolve => { unlock = resolve; });
  db.prepare = function (sql) {
    const statement = originalPrepare.call(this, sql);
    if (sql !== "SELECT COUNT(*) AS n FROM race_sheets WHERE race_id = ? AND kind = ?") return statement;
    return { get(...params) {
      const result = statement.get(...params);
      if (params[0] === raceId && params[1] === "route" && ++preflightCount === 2) unlock();
      return result;
    } };
  };
  const boundary = "publishing-image-boundary";
  const head = Buffer.from("--" + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="synthetic-route.png"\r\nContent-Type: image/png\r\n\r\n');
  const tail = Buffer.from("\r\n--" + boundary + "--\r\n");
  const body = Buffer.concat([head, png]);
  const start = () => {
    let client;
    const finished = new Promise((resolve, reject) => {
      client = http.request({ host: "127.0.0.1", port: server.address().port, method: "POST", path: "/marathon/api/admin/races/" + raceId + "/sheets?kind=route", headers: { ...admin, "Content-Type": "multipart/form-data; boundary=" + boundary, "Content-Length": body.length + tail.length } }, response => {
        const chunks = [];
        response.on("data", chunk => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
        response.on("error", reject);
      });
      client.on("error", reject);
      client.write(body);
    });
    clients.push(client);
    return finished;
  };
  try {
    const first = start(), second = start();
    // Both authenticated requests have passed the initial count check while
    // their incomplete multipart bodies are still pending.
    await checked;
    clients.forEach(client => client.end(tail));
    const results = await Promise.all([first, second]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
    assert.match(results.find(result => result.status === 400).body.error, /最多 4 张/);
    assert.equal(originalPrepare.call(db, "SELECT COUNT(*) AS n FROM race_sheets WHERE race_id=? AND kind='route'").get(raceId).n, 4);
  } finally {
    db.prepare = originalPrepare;
    clients.forEach(client => client.destroy());
    await new Promise(resolve => server.close(resolve));
  }
});
