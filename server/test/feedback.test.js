const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const { createAdmin, loginAdmin } = require("../src/admin-auth");
const { feedbackRoot } = require("../src/feedback");

const API = "/marathon/api";
process.env.ADMIN_TOKEN = "feedback-platform-admin-testing";
const admin = { Authorization: "Bearer " + process.env.ADMIN_TOKEN };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cX1kAAAAASUVORK5CYII=", "base64");
let next = 0;
async function user() {
  const res = await request(app).post(API + "/session").send({ nickname: "共创测试" + (++next) });
  assert.equal(res.status, 200);
  return { id: res.body.user.id, token: res.body.token, auth: { Authorization: "Bearer " + res.body.token } };
}
function fields(changes = {}) { return { title: "希望增加团练提醒", body: "每周团练开始之前，希望能够看到清楚的时间和集合地点。", category: "feature", module: "clubs", ...changes }; }
async function idea(owner, changes) { const res = await request(app).post(API + "/feedback").set(owner.auth).send(fields(changes)); assert.equal(res.status, 200, JSON.stringify(res.body)); return res.body; }
async function update(id, changes) { return request(app).patch(API + "/admin/feedback/" + id).set(admin).send(changes); }
async function publish(owner, changes) { const row = await idea(owner, changes); const res = await update(row.id, { status: "published", reply: "感谢建议，已公示征集更多跑者的想法。" }); assert.equal(res.status, 200); return res.body; }
async function adopt(owner) { const row = await publish(owner); const res = await update(row.id, { status: "adopted", reply: "建议已采纳，将排入下次更新。", rewardName: "跑步空顶帽" }); assert.equal(res.status, 200); return res.body; }
function shipping(changes = {}) { return { receiver: "测试跑者", phone: "13800138000", address: "北京市海淀区测试路一号仅用于测试", consent: true, ...changes }; }
function privateAbsent(body) { const raw = JSON.stringify(body); for (const secret of ["13800138000", "测试路一号", "SF1234567"]) assert.equal(raw.includes(secret), false, secret); }

test("feedback public browsing is anonymous but submission, private lists and actions require login", async () => {
  const list = await request(app).get(API + "/feedback");
  assert.equal(list.status, 200); assert.equal(list.body.unread, 0); assert.ok(list.headers["cache-control"].includes("no-store"));
  for (const [method, endpoint] of [["post", "/feedback"], ["put", "/feedback/1/vote"], ["post", "/feedback/1/read"], ["post", "/feedback/1/withdraw"], ["put", "/feedback/1/reward/claim"], ["post", "/feedback/1/reward/received"]]) assert.equal((await request(app)[method](API + endpoint).send({})).status, 401, endpoint);
  assert.equal((await request(app).get(API + "/feedback?mine=1")).status, 401);
});

test("pending ideas are private, structured and text is preserved as plain data", async () => {
  const owner = await user(), other = await user(); const row = await idea(owner, { title: "<script>界面建议</script>", body: "<img src=x onerror=alert(1)>这里只作为建议文字。", category: "ui" });
  assert.equal(row.status, "pending"); assert.equal(row.isMine, true); assert.equal(row.canWithdraw, true); assert.equal(row.canVote, false); assert.equal(row.unread, false);
  assert.equal(row.events.length, 1); assert.deepEqual(Object.keys(row.author), ["nickname"]);
  const own = await request(app).get(API + "/feedback/" + row.id).set(owner.auth);
  assert.equal(own.body.title, "<script>界面建议</script>");
  for (const auth of [null, other.auth]) { let req = request(app).get(API + "/feedback/" + row.id); if (auth) req = req.set(auth); assert.equal((await req).status, 404); }
  const publicList = await request(app).get(API + "/feedback"); assert.ok(!publicList.body.items.some(item => item.id === row.id));
  const mine = await request(app).get(API + "/feedback?mine=1").set(owner.auth); assert.equal(mine.body.items.length, 1);
  assert.equal((await request(app).get(API + "/feedback/not-id")).status, 404);
});

test("submissions validate bounded text, categories, modules and strict field types", async () => {
  const owner = await user();
  for (const changes of [{ title: "短" }, { title: "长".repeat(81) }, { title: 123456 }, { body: "太短" }, { body: "长".repeat(3001) }, { category: "unknown" }, { module: "unknown" }, { title: "\u0000坏的标题" }]) assert.equal((await request(app).post(API + "/feedback").set(owner.auth).send(fields(changes))).status, 400);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM feedback WHERE user_id = ?").get(owner.id).n, 0);
  assert.equal((await idea(owner, { title: "🏃🏃🏃🏃", module: undefined })).module, "other");
});

test("daily and pending limits are enforced in the write transaction", async () => {
  const owner = await user(), db = getDb();
  for (let i = 0; i < 10; i++) await idea(owner);
  assert.equal((await request(app).post(API + "/feedback").set(owner.auth).send(fields())).status, 429);
  db.prepare("UPDATE feedback SET created_at = '2020-01-01T00:00:00Z' WHERE user_id = ?").run(owner.id);
  for (let i = 0; i < 10; i++) await idea(owner);
  db.prepare("UPDATE feedback SET created_at = '2020-01-01T00:00:00Z' WHERE user_id = ?").run(owner.id);
  assert.equal((await request(app).post(API + "/feedback").set(owner.auth).send(fields())).status, 429);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM feedback WHERE user_id = ?").get(owner.id).n, 20);
});

test("only platform administrators can moderate or see private details", async () => {
  const owner = await user(), row = await idea(owner), db = getDb();
  const created = createAdmin(db, "feedbackclubadmin", "feedback-password", "club"); assert.ok(created.account);
  const club = { Authorization: "Bearer " + loginAdmin(db, "feedbackclubadmin", "feedback-password").token };
  for (const auth of [null, owner.auth, club]) {
    for (const endpoint of ["/admin/feedback", "/admin/feedback/" + row.id]) { let req = request(app).get(API + endpoint); if (auth) req = req.set(auth); assert.ok([401, 403].includes((await req).status)); }
    let req = request(app).patch(API + "/admin/feedback/" + row.id).send({ status: "published" }); if (auth) req = req.set(auth); assert.ok([401, 403].includes((await req).status));
  }
  const detail = await request(app).get(API + "/admin/feedback/" + row.id).set(admin); assert.equal(detail.status, 200); assert.equal(detail.body.body, row.body);
  const clubOverview = await request(app).get(API + "/admin/overview").set(club); assert.equal(clubOverview.status, 200); assert.equal("pendingFeedback" in clubOverview.body.counts, false);
});

test("public vote is idempotent, unique, cancellable and cannot be cast for oneself", async () => {
  const owner = await user(), voter = await user(), other = await user(), row = await publish(owner);
  assert.equal((await request(app).put(API + `/feedback/${row.id}/vote`).set(owner.auth).send({ voted: true })).status, 400);
  assert.equal((await request(app).put(API + `/feedback/${row.id}/vote`).set(voter.auth).send({ voted: "true" })).status, 400);
  const votes = await Promise.all(Array.from({ length: 5 }, () => request(app).put(API + `/feedback/${row.id}/vote`).set(voter.auth).send({ voted: true })));
  assert.ok(votes.every(res => res.status === 200)); assert.ok(votes.every(res => res.body.votes === 1));
  const second = await request(app).put(API + `/feedback/${row.id}/vote`).set(other.auth).send({ voted: true }); assert.equal(second.body.votes, 2);
  const cancel = await request(app).put(API + `/feedback/${row.id}/vote`).set(voter.auth).send({ voted: false }); assert.equal(cancel.body.votes, 1); assert.equal(cancel.body.voted, false);
  const repeat = await request(app).put(API + `/feedback/${row.id}/vote`).set(voter.auth).send({ voted: false }); assert.equal(repeat.body.votes, 1);
});

test("pending, declined and withdrawn visibility and votes follow publication history", async () => {
  const owner = await user(), voter = await user(), pending = await idea(owner);
  assert.equal((await request(app).put(API + `/feedback/${pending.id}/vote`).set(voter.auth).send({ voted: true })).status, 404);
  assert.equal((await update(pending.id, { status: "declined", reply: "目前条件不满足，先保留思路。" })).status, 200);
  assert.equal((await request(app).get(API + "/feedback/" + pending.id)).status, 404);
  const publicIdea = await publish(owner);
  const declined = await update(publicIdea.id, { status: "declined", reply: "结合投票和实现成本，本次暂不安排。" }); assert.equal(declined.status, 200);
  assert.equal((await request(app).get(API + "/feedback/" + publicIdea.id)).status, 200);
  assert.equal((await request(app).put(API + `/feedback/${publicIdea.id}/vote`).set(voter.auth).send({ voted: true })).status, 409);
  const withdrawal = await publish(owner);
  assert.equal((await request(app).post(API + `/feedback/${withdrawal.id}/withdraw`).set(voter.auth)).status, 404);
  assert.equal((await request(app).post(API + `/feedback/${withdrawal.id}/withdraw`).set(owner.auth)).body.status, "withdrawn");
  assert.equal((await request(app).get(API + "/feedback/" + withdrawal.id)).status, 404);
});

test("moderation obeys state machine, adoption creates exactly one immutable reward", async () => {
  const owner = await user(), voter = await user(), row = await idea(owner);
  assert.equal((await update(row.id, { status: "released", reply: "不能跳过审核上线。" })).status, 409);
  assert.equal((await update(row.id, { status: "published" })).status, 200);
  assert.equal((await update(row.id, { status: "adopted", rewardName: "跑步帽" })).status, 400);
  assert.equal((await update(row.id, { status: "adopted", reply: "已采纳这个建议。" })).status, 400);
  assert.equal((await update(row.id, { status: "adopted", rewardName: "跑步帽", reply: "" })).status, 400);
  const adopted = await update(row.id, { status: "adopted", rewardName: "跑步帽", reply: "已采纳，接下来进入设计评估。" }); assert.equal(adopted.status, 200); assert.equal(adopted.body.reward.name, "跑步帽");
  assert.equal((await request(app).put(API + `/feedback/${row.id}/vote`).set(voter.auth).send({ voted: true })).status, 409);
  assert.equal((await request(app).post(API + `/feedback/${row.id}/withdraw`).set(owner.auth)).status, 409);
  assert.equal((await update(row.id, { status: "adopted", rewardName: "另一份奖品", reply: "更改奖品的尝试。" })).status, 409);
  assert.equal((await update(row.id, { status: "adopted", rewardName: "跑步帽", reply: "已采纳，接下来进入设计评估。" })).status, 200);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM feedback_rewards WHERE feedback_id = ?").get(row.id).n, 1);
  assert.equal((await update(row.id, { status: "building", reply: "页面已进入开发。" })).status, 200);
  assert.equal((await update(row.id, { status: "released", reply: "功能已上线，欢迎体验。" })).status, 200);
  assert.equal((await update(row.id, { status: "building", reply: "不能回退到开发。" })).status, 409);
  const detail = await request(app).get(API + "/feedback/" + row.id); assert.deepEqual(detail.body.events.map(item => item.status), ["pending", "published", "adopted", "building", "released"]);
});

test("progress updates create author-only unread indicators and reading clears them", async () => {
  const owner = await user(), other = await user(), row = await publish(owner);
  const own = await request(app).get(API + "/feedback/" + row.id).set(owner.auth); assert.equal(own.body.unread, true);
  assert.equal((await request(app).get(API + "/feedback/" + row.id).set(other.auth)).body.unread, false);
  assert.equal((await request(app).get(API + "/feedback?mine=1").set(owner.auth)).body.unread, 1);
  assert.equal((await request(app).post(API + `/feedback/${row.id}/read`).set(other.auth)).status, 404);
  assert.equal((await request(app).post(API + `/feedback/${row.id}/read`).set(owner.auth).send({ revision: own.body.revision })).status, 200);
  assert.equal((await request(app).get(API + "/feedback?mine=1").set(owner.auth)).body.unread, 0);
  assert.equal((await update(row.id, { status: "published", reply: "补充说明，正在核实实现范围。" })).status, 200);
  assert.equal((await request(app).get(API + "/feedback?mine=1").set(owner.auth)).body.unread, 1);
});

test("personal feedback summary is authenticated, isolated and exposes no suggestion content", async () => {
  const owner = await user(), other = await user();
  assert.equal((await request(app).get(API + "/me/feedback/summary")).status, 401);
  assert.deepEqual((await request(app).get(API + "/me/feedback/summary").set(owner.auth)).body, { total: 0, unread: 0 });
  const row = await publish(owner);
  const summary = await request(app).get(API + "/me/feedback/summary").set(owner.auth); assert.deepEqual(summary.body, { total: 1, unread: 1 }); assert.ok(summary.headers["cache-control"].includes("no-store"));
  assert.deepEqual((await request(app).get(API + "/me/feedback/summary").set(other.auth)).body, { total: 0, unread: 0 });
  await request(app).post(API + `/feedback/${row.id}/read`).set(owner.auth).send({ revision: row.revision });
  assert.deepEqual((await request(app).get(API + "/me/feedback/summary").set(owner.auth)).body, { total: 1, unread: 0 });
});

test("read acknowledgements preserve newer unseen updates and never move the read version backwards", async () => {
  const owner = await user(), row = await publish(owner), readUrl = API + `/feedback/${row.id}/read`;
  const seen = await request(app).get(API + "/feedback/" + row.id).set(owner.auth);
  const changed = await update(row.id, { status: "published", reply: "在页面打开以后补充的新进度，需要保留未读提醒。" }); assert.equal(changed.status, 200); assert.ok(changed.body.revision > seen.body.revision);
  assert.equal((await request(app).post(readUrl).set(owner.auth).send({ revision: seen.body.revision })).status, 200);
  assert.equal((await request(app).get(API + "/me/feedback/summary").set(owner.auth)).body.unread, 1);
  const fresh = await request(app).get(API + "/feedback/" + row.id).set(owner.auth);
  assert.equal((await request(app).post(readUrl).set(owner.auth).send({ revision: fresh.body.revision })).status, 200);
  assert.equal((await request(app).get(API + "/me/feedback/summary").set(owner.auth)).body.unread, 0);
  assert.equal((await request(app).post(readUrl).set(owner.auth).send({ revision: seen.body.revision })).status, 200);
  assert.equal(getDb().prepare("SELECT read_version FROM feedback WHERE id = ?").get(row.id).read_version, fresh.body.revision);
  for (const revision of [undefined, 0, -1, true, String(fresh.body.revision), fresh.body.revision + 1, 1.5]) assert.equal((await request(app).post(readUrl).set(owner.auth).send({ revision })).status, 400);
  assert.equal((await request(app).get(API + "/me/feedback/summary").set(owner.auth)).body.unread, 0);
});

test("reward collection, shipping and receipt enforce owner, consent, validation and ordering", async () => {
  const owner = await user(), other = await user(), row = await adopt(owner), url = API + `/feedback/${row.id}/reward/claim`;
  assert.equal((await request(app).post(API + `/admin/feedback/${row.id}/reward/ship`).set(admin).send({ carrier: "顺丰快递", tracking: "SF1234567" })).status, 409);
  assert.equal((await request(app).put(url).set(other.auth).send(shipping())).status, 404);
  for (const changes of [{ consent: false }, { receiver: "甲" }, { phone: "12345678901" }, { address: "太短" }, { phone: 13800138000 }]) assert.equal((await request(app).put(url).set(owner.auth).send(shipping(changes))).status, 400);
  const claim = await request(app).put(url).set(owner.auth).send(shipping()); assert.equal(claim.status, 200); assert.equal(claim.body.reward.status, "claimed");
  assert.equal((await request(app).put(url).set(owner.auth).send(shipping({ receiver: "另一跑者" }))).status, 200);
  assert.equal((await request(app).post(API + `/feedback/${row.id}/reward/received`).set(owner.auth)).status, 409);
  assert.equal((await request(app).post(API + `/admin/feedback/${row.id}/reward/ship`).set(admin).send({ carrier: "顺丰快递", tracking: "bad<script>" })).status, 400);
  const ship = await request(app).post(API + `/admin/feedback/${row.id}/reward/ship`).set(admin).send({ carrier: "顺丰快递", tracking: "SF1234567" }); assert.equal(ship.status, 200); assert.equal(ship.body.reward.status, "shipped");
  assert.equal((await request(app).put(url).set(owner.auth).send(shipping())).status, 409);
  assert.equal((await request(app).post(API + `/admin/feedback/${row.id}/reward/ship`).set(admin).send({ carrier: "顺丰快递", tracking: "SF1234567" })).status, 409);
  assert.equal((await request(app).post(API + `/feedback/${row.id}/reward/received`).set(other.auth)).status, 404);
  const receipt = await request(app).post(API + `/feedback/${row.id}/reward/received`).set(owner.auth); assert.equal(receipt.status, 200); assert.equal(receipt.body.reward.status, "received");
});

test("private addresses and logistics never appear in public, other users, list cards or event histories", async () => {
  const owner = await user(), other = await user(), row = await adopt(owner);
  await request(app).put(API + `/feedback/${row.id}/reward/claim`).set(owner.auth).send(shipping());
  await request(app).post(API + `/admin/feedback/${row.id}/reward/ship`).set(admin).send({ carrier: "顺丰快递", tracking: "SF1234567" });
  for (const auth of [null, other.auth]) { let req = request(app).get(API + "/feedback/" + row.id); if (auth) req = req.set(auth); const res = await req; assert.equal(res.status, 200); privateAbsent(res.body); assert.deepEqual(Object.keys(res.body.reward).sort(), ["name", "status", "statusLabel"]); }
  for (const [endpoint, auth] of [["/feedback", null], ["/feedback?mine=1", owner.auth], ["/admin/feedback", admin]]) { let req = request(app).get(API + endpoint); if (auth) req = req.set(auth); privateAbsent((await req).body); }
  for (const auth of [owner.auth, admin]) { const endpoint = auth === admin ? "/admin/feedback/" : "/feedback/"; const res = await request(app).get(API + endpoint + row.id).set(auth); assert.equal(res.body.reward.phone, "13800138000"); assert.equal(res.body.reward.tracking, "SF1234567"); privateAbsent(res.body.events); }
});

test("shipping checks the reviewed address revision and cannot acknowledge a changed address", async () => {
  const owner = await user(), row = await adopt(owner), claimUrl = API + `/feedback/${row.id}/reward/claim`, shipUrl = API + `/admin/feedback/${row.id}/reward/ship`;
  const first = await request(app).put(claimUrl).set(owner.auth).send(shipping()); assert.equal(first.status, 200);
  const desk = await request(app).get(API + "/admin/feedback/" + row.id).set(admin);
  const changed = await request(app).put(claimUrl).set(owner.auth).send(shipping({ address: "北京市海淀区第二个地址八十八号" })); assert.equal(changed.status, 200); assert.ok(changed.body.revision > desk.body.revision); assert.equal(changed.body.unread, false);
  const stale = await request(app).post(shipUrl).set(admin).send({ carrier: "顺丰快递", tracking: "SF1234567", expectedVersion: desk.body.revision }); assert.equal(stale.status, 409); assert.match(stale.body.error, /重新打开/);
  const latest = await request(app).get(API + "/admin/feedback/" + row.id).set(admin); assert.equal(latest.body.reward.status, "claimed");
  assert.equal((await request(app).post(shipUrl).set(admin).send({ carrier: "顺丰快递", tracking: "SF1234567", expectedVersion: latest.body.revision })).status, 200);
});

test("images require owner pending permission, signatures, a bounded count and private access", async () => {
  const owner = await user(), other = await user(), row = await idea(owner), url = API + `/feedback/${row.id}/images`;
  assert.equal((await request(app).post(url).set(other.auth).attach("file", png, "a.png")).status, 404);
  assert.equal((await request(app).post(url).set(owner.auth).attach("file", Buffer.from("<svg onload='alert(1)'/>"), "pretend.png")).status, 400);
  const upload = await request(app).post(url).set(owner.auth).attach("file", png, "screenshot.png"); assert.equal(upload.status, 200); assert.equal(upload.body.images.length, 1);
  const imageUrl = upload.body.images[0].url, cleanUrl = imageUrl.split("?")[0];
  assert.equal((await request(app).get(cleanUrl)).status, 404);
  assert.equal((await request(app).get(cleanUrl + "?t=" + other.token)).status, 404);
  const picture = await request(app).get(imageUrl); assert.equal(picture.status, 200); assert.equal(picture.headers["content-type"], "image/png"); assert.ok(picture.headers["cache-control"].includes("no-store"));
  const desk = await request(app).get(API + "/admin/feedback/" + row.id).set(admin); assert.equal((await request(app).get(desk.body.images[0].url)).status, 200);
  for (let i = 0; i < 2; i++) assert.equal((await request(app).post(url).set(owner.auth).attach("file", png, i + ".png")).status, 200);
  assert.equal((await request(app).post(url).set(owner.auth).attach("file", png, "fourth.png")).status, 400);
  const count = getDb().prepare("SELECT COUNT(*) AS n FROM feedback_images WHERE feedback_id = ?").get(row.id).n; assert.equal(count, 3);
  assert.equal((await update(row.id, { status: "published" })).status, 200);
  assert.equal((await request(app).get(cleanUrl)).status, 200);
  assert.equal((await request(app).post(url).set(owner.auth).attach("file", png, "after-publish.png")).status, 409);
  assert.equal((await request(app).delete(cleanUrl).set(owner.auth)).status, 409);
  assert.equal((await request(app).get(API + "/feedback/" + row.id)).body.images[0].url.includes("?t="), false);
});

test("image size limit rejects excessive payloads and pending image deletion frees the file", async () => {
  const owner = await user(), row = await idea(owner), url = API + `/feedback/${row.id}/images`;
  const huge = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]);
  assert.equal((await request(app).post(url).set(owner.auth).attach("file", huge, "big.png")).status, 413);
  const upload = await request(app).post(url).set(owner.auth).attach("file", png, "small.png");
  const image = getDb().prepare("SELECT * FROM feedback_images WHERE feedback_id = ?").get(row.id), filename = path.join(feedbackRoot(), image.filename);
  assert.ok(fs.existsSync(filename));
  assert.equal((await request(app).delete(upload.body.images[0].url.split("?")[0]).set(owner.auth)).status, 200);
  assert.equal(fs.existsSync(filename), false);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM feedback_images WHERE feedback_id = ?").get(row.id).n, 0);
});

test("an administrator cannot publish a stale screenshot revision", async () => {
  const owner = await user(), row = await idea(owner);
  const original = await request(app).get(API + "/admin/feedback/" + row.id).set(admin);
  const upload = await request(app).post(API + `/feedback/${row.id}/images`).set(owner.auth).attach("file", png, "new-detail.png");
  assert.equal(upload.status, 200); assert.ok(upload.body.revision > original.body.revision); assert.equal(upload.body.unread, false);
  const stale = await update(row.id, { status: "published", expectedVersion: original.body.revision }); assert.equal(stale.status, 409); assert.match(stale.body.error, /重新打开/);
  const refreshed = await request(app).get(API + "/admin/feedback/" + row.id).set(admin);
  assert.equal((await update(row.id, { status: "published", expectedVersion: refreshed.body.revision })).status, 200);
});

test("upload rechecks authentication and moderation after disk I/O and removes rejected files", async () => {
  const owner = await user(), row = await idea(owner), write = fs.promises.writeFile;
  const before = new Set(fs.readdirSync(feedbackRoot()));
  fs.promises.writeFile = async (...args) => { await write(...args); getDb().prepare("UPDATE users SET token = ? WHERE id = ?").run("revoked-feedback-test-token", owner.id); };
  try {
    const upload = await request(app).post(API + `/feedback/${row.id}/images`).set(owner.auth).attach("file", png, "revoked.png"); assert.equal(upload.status, 401);
    assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM feedback_images WHERE feedback_id = ?").get(row.id).n, 0);
    assert.deepEqual(new Set(fs.readdirSync(feedbackRoot())), before);
  } finally { fs.promises.writeFile = write; }
});

test("list pagination, category, hot ordering, literal search and adopted filter are consistent", async () => {
  const owner = await user(), voter = await user(), hot = await publish(owner, { title: "百分号%下划线_的界面建议", category: "ui" });
  await request(app).put(API + `/feedback/${hot.id}/vote`).set(voter.auth).send({ voted: true });
  const hotList = await request(app).get(API + "/feedback?category=ui&sort=hot"); assert.equal(hotList.status, 200); assert.equal(hotList.body.items[0].id, hot.id);
  const search = await request(app).get(API + "/admin/feedback?q=" + encodeURIComponent("%下划线_助手不存在")).set(admin); assert.equal(search.body.total, 0);
  const literal = await request(app).get(API + "/admin/feedback?q=" + encodeURIComponent("%下划线_")).set(admin); assert.equal(literal.body.total, 1); assert.equal(literal.body.items[0].id, hot.id);
  const adopted = await adopt(owner), filter = await request(app).get(API + "/feedback?sort=adopted"); assert.ok(filter.body.items.some(item => item.id === adopted.id)); assert.ok(filter.body.items.every(item => ["adopted", "building", "released"].includes(item.status)));
  const page = await request(app).get(API + "/admin/feedback?page=999999").set(admin); assert.equal(page.body.page, page.body.pages); assert.ok(page.body.items.length <= 20);
  for (const query of ["category=invalid", "sort=invalid"]) assert.equal((await request(app).get(API + "/feedback?" + query)).status, 400);
});

test("overview exposes review and shipping shortcuts only to platform administrators", async () => {
  const owner = await user(), row = await adopt(owner);
  await request(app).put(API + `/feedback/${row.id}/reward/claim`).set(owner.auth).send(shipping());
  const list = await request(app).get(API + "/admin/feedback?status=rewards").set(admin); assert.equal(list.status, 200); assert.ok(list.body.items.some(item => item.id === row.id)); assert.ok(list.body.items.every(item => item.reward.status === "claimed"));
  const overview = await request(app).get(API + "/admin/overview").set(admin); assert.equal(overview.status, 200); assert.ok(overview.body.counts.pendingFeedback > 0); assert.ok(overview.body.counts.rewardsPending > 0); assert.ok(overview.body.attention.some(item => item.section === "feedback" && item.filter === "rewards"));
});

test("account deletion atomically removes authored ideas, private reward records, images and both kinds of votes", async () => {
  const owner = await user(), other = await user(), row = await idea(owner);
  const upload = await request(app).post(API + `/feedback/${row.id}/images`).set(owner.auth).attach("file", png, "delete.png"); assert.equal(upload.status, 200);
  const filename = getDb().prepare("SELECT filename FROM feedback_images WHERE feedback_id = ?").get(row.id).filename;
  await update(row.id, { status: "published" });
  await request(app).put(API + `/feedback/${row.id}/vote`).set(other.auth).send({ voted: true });
  await update(row.id, { status: "adopted", rewardName: "测试跑步帽", reply: "采纳这个建议并送出跑步帽。" });
  await request(app).put(API + `/feedback/${row.id}/reward/claim`).set(owner.auth).send(shipping());
  const otherIdea = await publish(other); await request(app).put(API + `/feedback/${otherIdea.id}/vote`).set(owner.auth).send({ voted: true });
  const deletion = await request(app).delete(API + "/admin/users/" + owner.id).set(admin); assert.equal(deletion.status, 200, JSON.stringify(deletion.body));
  assert.equal((await request(app).get(API + "/feedback/" + row.id)).status, 404);
  for (const table of ["feedback_images", "feedback_votes", "feedback_events", "feedback_rewards"]) assert.equal(getDb().prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE feedback_id = ?`).get(row.id).n, 0, table);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM feedback_votes WHERE user_id = ?").get(owner.id).n, 0);
  assert.equal(fs.existsSync(path.join(feedbackRoot(), filename)), false);
  assert.equal((await request(app).get(API + "/feedback/" + otherIdea.id)).body.votes, 0);
});
