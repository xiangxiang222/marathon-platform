const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const crypto = require("crypto");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const { cleanupIdentityMaterials } = require("../src/club-identity");
process.env.ADMIN_TOKEN = "identity-admin";
const admin = { Authorization: "Bearer identity-admin" };
const base = "/marathon/api";
let sequence = 0;
async function account() {
  const res = await request(app).post(base + "/session").send({ nickname: "身份测试" + (++sequence) });
  assert.equal(res.status, 200);
  const auth = { Authorization: "Bearer " + res.body.token };
  const me = await request(app).get(base + "/me").set(auth);
  return { auth, id: me.body.user.id, token: res.body.token };
}
async function setup(name = "西湖晨跑团", city = "杭州") {
  const user = await account();
  const res = await request(app).post(base + "/clubs").set(user.auth).send({ name, city, intro: "周三一起慢跑", requestId: crypto.randomUUID() });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { ...user, club: res.body.club };
}
async function apply(owner, values = {}) {
  const res = await request(app).post(base + `/clubs/${owner.club.id}/identity`).set(owner.auth).send({ organization: "西湖晨跑团组织", scope: "杭州西湖", sourceUrl: "https://example.org/our-club", evidence: "既有公开组织渠道已确认本团号，由联系负责人交叉核对。", contact: "私密手机 13800138000", ...values });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.verification;
}
async function decide(kind, id, decision, extra = {}) {
  return request(app).post(base + `/admin/club-identity/${kind}/${id}/decision`).set(admin).send({ decision, note: "已核对授权，仅本团号与杭州组织管理关系；可从身份页补充说明。", ...extra });
}
async function report(owner, user, type = "impersonation") {
  const res = await request(app).post(base + `/clubs/${owner.club.id}/reports`).set(user.auth).send({ type, detail: "对方公开页使用了我们的组织授权说法，请核对具体招募呈现。", sourceUrl: "https://example.org/claim", contact: "举报人私密 13900139000" });
  assert.equal(res.status, 200);
  return res.body.report;
}

test("open creation is atomic, idempotent, private, and does not grant a global leader flag", async () => {
  const owner = await account();
  const body = { name: "同名跑团", city: "杭州", intro: "一起跑", requestId: crypto.randomUUID() };
  const results = await Promise.all(Array.from({ length: 6 }, () => request(app).post(base + "/clubs").set(owner.auth).send(body)));
  assert.ok(results.every((r) => r.status === 200 && r.body.pending === false));
  assert.equal(new Set(results.map((r) => r.body.club.id)).size, 1);
  const id = results[0].body.club.id;
  assert.equal(getDb().prepare("SELECT COUNT(*) n FROM club_members WHERE club_id=? AND user_id=? AND role='owner'").get(id, owner.id).n, 1);
  assert.equal(getDb().prepare("SELECT COUNT(*) n FROM club_creations WHERE user_id=?").get(owner.id).n, 1);
  const me = await request(app).get(base + "/me").set(owner.auth);
  assert.equal(me.body.user.leader, false);
  assert.equal(me.body.clubs[0].city, "杭州");
  assert.equal(me.body.clubs[0].members, 1);
  assert.equal(me.body.clubs[0].memberCount, 1);
  assert.equal(me.body.clubs[0].role, "owner");
  const changed = await request(app).post(base + "/clubs").set(owner.auth).send({ ...body, name: "改名重试" });
  assert.equal(changed.status, 409);
  const publicCard = await request(app).get(base + `/clubs/${id}/public`);
  assert.equal(publicCard.body.club.code, undefined);
  assert.equal(publicCard.body.club.city, "杭州");
  assert.equal((await request(app).post(base + "/clubs").send(body)).status, 401);
  for (const values of [{ city: "" }, { name: "晨跑\u200b团" }, { name: "官方认证✅跑团" }, { intro: "长".repeat(81) }]) {
    const user = await account();
    assert.equal((await request(app).post(base + "/clubs").set(user.auth).send({ ...body, ...values, requestId: crypto.randomUUID() })).status, 400);
  }
});

test("rolling creation limits survive transfer and deletion, concurrent distinct requests cannot bypass them", async () => {
  const owner = await account();
  const attempts = await Promise.all([1, 2].map((i) => request(app).post(base + "/clubs").set(owner.auth).send({ name: "限额" + i, city: "北京", requestId: crypto.randomUUID() })));
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 429]);
  const club = attempts.find((r) => r.status === 200).body.club;
  assert.equal((await request(app).delete(base + `/admin/clubs/${club.id}`).set(admin)).status, 200);
  assert.equal((await request(app).post(base + "/clubs").set(owner.auth).send({ name: "删后重建", city: "北京", requestId: crypto.randomUUID() })).status, 429);
  getDb().prepare("UPDATE club_creations SET created_at=? WHERE user_id=?").run(new Date(Date.now() - 86400001).toISOString(), owner.id);
  assert.equal((await request(app).post(base + "/clubs").set(owner.auth).send({ name: "冷却后重建", city: "北京", requestId: crypto.randomUUID() })).status, 200);
  const another = await account();
  for (let i = 0; i < 3; i++) getDb().prepare("INSERT INTO clubs(name,code,owner_id,created_at) VALUES(?,?,?,?)").run("历史接任团" + i, crypto.randomUUID(), another.id, new Date().toISOString());
  assert.equal((await request(app).post(base + "/clubs").set(another.auth).send({ name: "第四团", city: "北京", requestId: crypto.randomUUID() })).status, 429);
  assert.equal(getDb().prepare("SELECT COUNT(*) n FROM clubs WHERE owner_id=?").get(another.id).n, 3);
});

test("accepting an owner transfer keeps existing clubs intact and cannot reset the creator's daily quota", async () => {
  const owner = await setup("移交限额团"), recipient = await account(), db = getDb();
  for (let i = 0; i < 3; i++) db.prepare("INSERT INTO clubs(name,code,owner_id,created_at) VALUES(?,?,?,?)").run("存量团" + i, crypto.randomUUID(), recipient.id, new Date().toISOString());
  db.prepare("INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,'member')").run(owner.club.id, recipient.id, new Date().toISOString());
  const transfer = await request(app).put(base + `/clubs/${owner.club.id}/members/${recipient.id}`).set(owner.auth).send({ role: "owner" });
  assert.equal(transfer.status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM clubs WHERE owner_id=?").get(recipient.id).n, 4);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM club_creations WHERE user_id=?").get(recipient.id).n, 0);
  for (const user of [owner, recipient]) {
    assert.equal((await request(app).post(base + "/clubs").set(user.auth).send({ name: "不能借移交绕过", city: "杭州", requestId: crypto.randomUUID() })).status, 429);
  }
});

test("legacy applications require applicant confirmation and the old desk write cannot bypass creation limits", async () => {
  const owner = await account(), stranger = await account(), db = getDb(), now = new Date().toISOString();
  const applicationId = Number(db.prepare("INSERT INTO club_applications(user_id,name,status,created_at) VALUES(?,?,'pending',?)").run(owner.id, "旧申请身份团", now).lastInsertRowid);
  const wrong = await request(app).post(base + "/clubs").set(stranger.auth).send({ name: "旧申请身份团", city: "北京", applicationId, requestId: crypto.randomUUID() });
  assert.equal(wrong.status, 409);
  assert.equal(db.prepare("SELECT status FROM club_applications WHERE id=?").get(applicationId).status, "pending");
  assert.equal((await request(app).get(base + "/clubs/directory").query({ q: "旧申请身份团" })).body.clubs.length, 0);
  const confirmed = await request(app).post(base + "/clubs").set(owner.auth).send({ name: "旧申请身份团", city: "北京", applicationId, requestId: crypto.randomUUID() });
  assert.equal(confirmed.status, 200);
  assert.equal(db.prepare("SELECT club_id FROM club_applications WHERE id=?").get(applicationId).club_id, confirmed.body.club.id);
  const legacy = await setup("当日已创建团");
  const otherId = Number(db.prepare("INSERT INTO club_applications(user_id,name,status,created_at) VALUES(?,?,'pending',?)").run(legacy.id, "历史审批团", now).lastInsertRowid);
  const approved = await request(app).post(base + `/admin/club-applications/${otherId}`).set(admin).send({ decision: "approve" });
  assert.equal(approved.status, 410);
  assert.match(approved.body.error, /本人确认/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM clubs WHERE owner_id=?").get(legacy.id).n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM club_creations WHERE user_id=?").get(legacy.id).n, 1);
  assert.equal(db.prepare("SELECT status FROM club_applications WHERE id=?").get(otherId).status, "pending");
  assert.equal((await request(app).post(base + `/admin/club-applications/${otherId}`).set(admin).send({ decision: "reject" })).status, 410);
  assert.equal((await request(app).post(base + "/clubs").set(legacy.auth).send({ name: "历史审批团", city: "北京", applicationId: otherId, requestId: crypto.randomUUID() })).status, 429);
  const queue = await request(app).get(base + "/admin/club-applications").set(admin);
  assert.ok(queue.body.applications.some((item) => item.id === otherId));
});

test("same names coexist; normalized exact names precede fuzzy verified names, city and stable pagination work", async () => {
  const plain = await setup("ＷＥＳＴ　晨跑", "杭州"), verified = await setup("west 晨跑", "杭州"), fuzzy = await setup("west 晨跑分团", "杭州"), elsewhere = await setup("west 晨跑", "绍兴");
  assert.equal((await decide("verification", (await apply(verified)).id, "approve")).status, 200);
  assert.equal((await decide("verification", (await apply(fuzzy)).id, "approve")).status, 200);
  const result = await request(app).get(base + "/clubs/directory").query({ q: "west晨跑", city: "杭州", page: 1, pageSize: 2 });
  assert.equal(result.body.total, 3);
  assert.deepEqual(result.body.clubs.map((c) => c.id), [verified.club.id, plain.club.id]);
  const next = await request(app).get(base + "/clubs/directory").query({ q: "west晨跑", city: "杭州", page: 2, pageSize: 2 });
  assert.deepEqual(next.body.clubs.map((c) => c.id), [fuzzy.club.id]);
  assert.equal(JSON.stringify(result.body).includes("13800138000"), false);
  assert.equal(result.body.clubs[0].code, undefined);
  const direct = await request(app).get(base + "/clubs/directory").query({ q: "#" + elsewhere.club.id });
  assert.deepEqual(direct.body.clubs.map((c) => c.id), [elsewhere.club.id]);
  await setup("100%_晨跑", "杭州");
  const literal = await request(app).get(base + "/clubs/directory").query({ q: "%_" });
  assert.deepEqual(literal.body.clubs.map((c) => c.name), ["100%_晨跑"]);
  const db = getDb();
  db.transaction(() => { for (let i = 0; i < 225; i++) db.prepare("INSERT INTO clubs(name,code,owner_id,created_at) VALUES(?,?,?,?)").run("分页晨跑" + i, crypto.randomUUID(), plain.id, new Date().toISOString()); })();
  const ids = [];
  for (let p = 1; p <= 3; p++) {
    const page = await request(app).get(base + "/clubs/directory").query({ q: "分页晨跑", page: p, pageSize: 100 });
    assert.equal(page.body.total, 225);
    ids.push(...page.body.clubs.map((c) => c.id));
  }
  assert.equal(new Set(ids).size, 225);
});

test("verification remains private, supports supplement and public scope, and only platform admins decide", async () => {
  const owner = await setup(), outsider = await account();
  const v = await apply(owner);
  assert.equal(v.status, "pending");
  const pub = await request(app).get(base + `/clubs/${owner.club.id}/public`);
  assert.equal(pub.body.club.verified, false);
  assert.equal(pub.body.club.contact, undefined);
  assert.equal((await request(app).get(base + `/clubs/${owner.club.id}/identity`).set(outsider.auth)).status, 403);
  getDb().prepare("INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,'manager')").run(owner.club.id, outsider.id, new Date().toISOString());
  assert.equal((await request(app).get(base + `/clubs/${owner.club.id}/identity`).set(outsider.auth)).status, 403);
  assert.equal((await request(app).post(base + `/clubs/${owner.club.id}/identity`).set(outsider.auth).send({ organization: "越权" })).status, 403);
  assert.equal((await request(app).get(base + `/clubs/${owner.club.id}/identity`)).status, 401);
  const created = await request(app).post(base + "/admin/accounts").set(admin).send({ username: "identitydesk", password: "identity-desk-8", role: "club" });
  assert.equal(created.status, 200);
  const login = await request(app).post(base + "/admin/login").send({ username: "identitydesk", password: "identity-desk-8" });
  const desk = { Authorization: "Bearer " + login.body.token };
  assert.equal((await request(app).get(base + "/admin/club-identity").set(desk)).status, 403);
  assert.equal((await request(app).post(base + `/admin/club-identity/verification/${v.id}/decision`).set(desk).send({ decision: "approve", note: "无权" })).status, 403);
  assert.equal((await decide("verification", v.id, "approve", { note: "" })).status, 400);
  assert.equal((await decide("verification", v.id, "supplement")).status, 200);
  const updated = await apply(owner, { evidence: "补充：多年公开活动渠道及两位组织联系人分别核对团号。" });
  assert.equal((await decide("verification", v.id, "approve")).status, 409);
  assert.equal((await decide("verification", updated.id, "approve")).status, 200);
  const card = await request(app).get(base + `/clubs/invite/${owner.club.code}`);
  assert.equal(card.body.club.verified, true);
  assert.equal(card.body.club.verificationScope, "杭州西湖");
  assert.equal(card.body.club.organization, "西湖晨跑团组织");
  assert.equal(card.body.club.evidence, undefined);
  const panel = await request(app).get(base + "/admin/club-identity").set(admin).query({ kind: "verification", page: 1 });
  assert.equal(panel.body.rows.find((r) => r.id === updated.id).events.at(-1).decision, "approve");
  const contact = await apply(owner, { evidence: "补充：多年公开活动渠道及两位组织联系人分别核对团号。", contact: "修正的联系人" });
  assert.equal(contact.status, "verified");
  const newScope = await apply(owner, { scope: "绍兴独立分团" });
  assert.equal(newScope.status, "pending");
  assert.equal((await request(app).get(base + `/clubs/${owner.club.id}/public`)).body.club.verified, false);
  assert.equal((await decide("verification", newScope.id, "approve")).status, 200);
  assert.equal((await decide("verification", newScope.id, "revoke")).status, 200);
  assert.equal((await request(app).get(base + `/clubs/${owner.club.id}/public`)).body.club.verified, false);
});

test("owner transfer and material identity changes stop the badge without moving private club history", async () => {
  const owner = await setup(), nextOwner = await account();
  assert.equal((await decide("verification", (await apply(owner)).id, "approve")).status, 200);
  getDb().prepare("INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,'member')").run(owner.club.id, nextOwner.id, new Date().toISOString());
  assert.equal((await request(app).put(base + `/clubs/${owner.club.id}/members/${nextOwner.id}`).set(owner.auth).send({ role: "owner" })).status, 200);
  const card = await request(app).get(base + `/clubs/${owner.club.id}/public`);
  assert.equal(card.body.club.verified, false);
  assert.equal(getDb().prepare("SELECT COUNT(*) n FROM club_members WHERE club_id=?").get(owner.club.id).n, 2);
  assert.equal((await request(app).get(base + `/clubs/${owner.club.id}/identity`).set(owner.auth)).status, 403);
  const current = await request(app).get(base + `/clubs/${owner.club.id}/identity`).set(nextOwner.auth);
  assert.equal(current.body.verification, null);
  assert.equal(JSON.stringify(current.body).includes("13800138000"), false);
  const desk = await request(app).get(base + "/admin/club-identity").set(admin).query({ kind: "verification", pageSize: 100 });
  const historical = desk.body.rows.find((row) => row.clubId === owner.club.id);
  assert.equal(historical.ownerNickname, getDb().prepare("SELECT nickname FROM users WHERE id=?").get(owner.id).nickname);
  assert.equal(historical.currentOwnerId, nextOwner.id);
  const next = { ...nextOwner, club: owner.club };
  assert.equal((await decide("verification", (await apply(next)).id, "approve")).status, 200);
  assert.equal((await request(app).put(base + `/clubs/${owner.club.id}/profile`).set(nextOwner.auth).send({ name: "湖畔晨跑团", city: "杭州", intro: "一起跑" })).status, 200);
  assert.equal((await request(app).get(base + `/clubs/${owner.club.id}/public`)).body.club.verified, false);
  assert.equal(getDb().prepare("SELECT COUNT(*) n FROM club_verifications WHERE club_id=?").get(owner.club.id).n, 2);
});

test("reports never punish ordinary homonyms; evidence-based restrictions block recruitment, and restore/rename retain members", async () => {
  const owner = await setup("争议晨跑团"), claimant = await account(), outsider = await account();
  const confused = await report(owner, claimant, "confusion");
  assert.equal((await decide("report", confused.id, "restrict")).status, 400);
  assert.equal((await decide("report", confused.id, "rename", { name: "不允许强改" })).status, 400);
  assert.equal((await request(app).get(base + `/clubs/${owner.club.id}/public`)).body.club.publicStatus, "active");
  assert.equal((await decide("report", confused.id, "dismiss")).status, 200);
  const r = await report(owner, claimant);
  const desk = await request(app).get(base + "/admin/club-identity").set(admin).query({ kind: "report", pageSize: 100 });
  assert.equal(desk.body.rows.find((row) => row.id === r.id).reporterNickname, getDb().prepare("SELECT nickname FROM users WHERE id=?").get(claimant.id).nickname);
  const duplicate = await report(owner, claimant);
  assert.equal(duplicate.id, r.id);
  assert.equal((await decide("report", r.id, "supplement")).status, 200);
  const ownPanel = await request(app).get(base + `/clubs/${owner.club.id}/identity`).set(owner.auth);
  assert.ok(ownPanel.body.moderationNote);
  assert.equal(JSON.stringify(ownPanel.body).includes("13900139000"), false);
  const ownCases = await request(app).get(base + "/me/club-reports").set(claimant.auth);
  assert.equal(ownCases.body.reports.find((item) => item.id === r.id).status, "supplement");
  assert.deepEqual((await request(app).get(base + "/me/club-reports").set(outsider.auth)).body.reports, []);
  await report(owner, claimant);
  const before = getDb().prepare("SELECT owner_id FROM clubs WHERE id=?").get(owner.club.id).owner_id;
  assert.equal((await decide("report", r.id, "restrict")).status, 200);
  const directory = await request(app).get(base + "/clubs/directory").query({ q: "争议晨跑团" });
  assert.equal(directory.body.clubs.length, 0);
  for (const url of [`/clubs/${owner.club.id}/public`, `/clubs/invite/${owner.club.code}`]) {
    const status = await request(app).get(base + url);
    assert.equal(status.body.club.restricted, true);
    assert.equal(JSON.stringify(status.body).includes("13900139000"), false);
  }
  assert.equal((await request(app).post(base + "/clubs/join").set(outsider.auth).send({ code: owner.club.code })).status, 403);
  assert.equal((await request(app).post(base + "/clubs/join").set(outsider.auth).send({ clubId: owner.club.id })).status, 403);
  assert.equal((await request(app).get(base + `/clubs/${owner.club.id}`).set(owner.auth)).status, 200);
  assert.equal((await decide("report", r.id, "restore")).status, 200);
  assert.equal((await request(app).get(base + "/clubs/directory").query({ q: "争议晨跑团" })).body.clubs.length, 1);
  const badRename = await decide("report", r.id, "rename", { name: "" });
  assert.equal(badRename.status, 400);
  assert.equal((await decide("report", r.id, "rename", { name: "清楚呈现晨跑团" })).status, 200);
  assert.equal(getDb().prepare("SELECT owner_id FROM clubs WHERE id=?").get(owner.club.id).owner_id, before);
  assert.equal(getDb().prepare("SELECT COUNT(*) n FROM club_members WHERE club_id=?").get(owner.club.id).n, 1);
  assert.equal((await request(app).get(base + `/clubs/${owner.club.id}/public`)).body.club.name, "清楚呈现晨跑团");
  const events = getDb().prepare("SELECT decision FROM club_identity_events WHERE kind='report' AND case_id=?").all(r.id).map((r) => r.decision);
  assert.ok(events.includes("restrict") && events.includes("restore") && events.includes("rename"));
});

test("closed and superseded former-owner private materials clear after 90 days while decisions remain", async () => {
  const owner = await setup(), claimant = await account(), v = await apply(owner), r = await report(owner, claimant);
  assert.equal((await decide("verification", v.id, "approve")).status, 200);
  assert.equal((await decide("report", r.id, "dismiss")).status, 200);
  const past = new Date(Date.now() - 91 * 86400000).toISOString();
  getDb().prepare("UPDATE club_verifications SET reviewed_at=? WHERE id=?").run(past, v.id);
  getDb().prepare("UPDATE club_identity_reports SET reviewed_at=? WHERE id=?").run(past, r.id);
  cleanupIdentityMaterials(getDb());
  const cleanV = getDb().prepare("SELECT * FROM club_verifications WHERE id=?").get(v.id);
  assert.equal(cleanV.contact, ""); assert.equal(cleanV.evidence, ""); assert.ok(cleanV.materials_deleted_at);
  assert.equal(cleanV.status, "verified");
  assert.equal(getDb().prepare("SELECT detail FROM club_identity_reports WHERE id=?").get(r.id).detail, "");
  assert.equal((await request(app).get(base + `/clubs/${owner.club.id}/public`)).body.club.verified, true);
  getDb().prepare("UPDATE club_verifications SET status='review',owner_id=?,contact='old owner material',evidence='private',reviewed_at=?,materials_deleted_at='' WHERE id=?").run(claimant.id, past, v.id);
  cleanupIdentityMaterials(getDb());
  assert.equal(getDb().prepare("SELECT evidence FROM club_verifications WHERE id=?").get(v.id).evidence, "");
});


test("restrictions also stop approving queued joins and adding members through the admin desk", async () => {
  const owner = await setup("暂停招募回归团"), applicant = await account(), adminAdded = await account(), existing = await account(), claimant = await account(), db = getDb();
  // A current member keeps their management relationship while new external joins stop.
  db.prepare("INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,'member')").run(owner.club.id, existing.id, new Date().toISOString());
  const joined = await request(app).post(base + "/clubs/join").set(applicant.auth).send({ clubId: owner.club.id });
  assert.equal(joined.status, 200);
  assert.equal(joined.body.pending, true);
  const queued = db.prepare("SELECT id FROM club_requests WHERE club_id=? AND user_id=? AND status='pending'").get(owner.club.id, applicant.id);
  const dispute = await report(owner, claimant);
  assert.equal((await decide("report", dispute.id, "restrict")).status, 200);
  const ownerDecision = await request(app).post(base + `/clubs/${owner.club.id}/requests/${queued.id}`).set(owner.auth).send({ decision: "approve" });
  assert.equal(ownerDecision.status, 403);
  const deskDecision = await request(app).post(base + `/admin/club-requests/${queued.id}`).set(admin).send({ decision: "approve" });
  assert.equal(deskDecision.status, 403);
  const nickname = db.prepare("SELECT nickname FROM users WHERE id=?").get(adminAdded.id).nickname;
  assert.equal((await request(app).post(base + `/admin/clubs/${owner.club.id}/members`).set(admin).send({ nickname })).status, 403);
  assert.equal(db.prepare("SELECT status FROM club_requests WHERE id=?").get(queued.id).status, "pending");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM club_members WHERE club_id=?").get(owner.club.id).n, 2);
  assert.equal((await request(app).put(base + `/clubs/${owner.club.id}/members/${existing.id}`).set(owner.auth).send({ role: "manager" })).status, 200);
  assert.equal((await request(app).get(base + `/clubs/${owner.club.id}`).set(existing.auth)).status, 200);
  const mine = await request(app).get(base + "/me").set(existing.auth);
  assert.equal(mine.body.clubs.find((club) => club.id === owner.club.id).members, 2);
  assert.equal(mine.body.clubs.find((club) => club.id === owner.club.id).memberCount, 2);
  assert.equal((await decide("report", dispute.id, "restore")).status, 200);
  assert.equal((await request(app).post(base + `/clubs/${owner.club.id}/requests/${queued.id}`).set(owner.auth).send({ decision: "approve" })).status, 200);
  assert.equal((await request(app).post(base + `/admin/clubs/${owner.club.id}/members`).set(admin).send({ nickname })).status, 201);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM club_members WHERE club_id=?").get(owner.club.id).n, 4);
});

test("reopened reports clear newly supplied private materials after a second closing period", async () => {
  const owner = await setup("材料重开回归团"), claimant = await account(), db = getDb(), r = await report(owner, claimant);
  const past = new Date(Date.now() - 91 * 86400000).toISOString();
  assert.equal((await decide("report", r.id, "dismiss")).status, 200);
  db.prepare("UPDATE club_identity_reports SET reviewed_at=? WHERE id=?").run(past, r.id);
  cleanupIdentityMaterials(db);
  const first = db.prepare("SELECT * FROM club_identity_reports WHERE id=?").get(r.id);
  assert.equal(first.detail, ""); assert.equal(first.contact, ""); assert.ok(first.materials_deleted_at);
  assert.equal((await decide("report", r.id, "supplement")).status, 200);
  const resubmitted = await request(app).post(base + `/clubs/${owner.club.id}/reports`).set(claimant.auth).send({ type: "impersonation", detail: "新补充的私密授权核对材料", contact: "新联系方式 13700137000", sourceUrl: "https://example.org/new-evidence" });
  assert.equal(resubmitted.status, 200);
  assert.equal(resubmitted.body.report.id, r.id);
  const pending = db.prepare("SELECT * FROM club_identity_reports WHERE id=?").get(r.id);
  assert.equal(pending.status, "pending"); assert.equal(pending.materials_deleted_at, ""); assert.equal(pending.reviewed_at, ""); assert.equal(pending.reviewer, "");
  assert.ok(pending.updated_at >= first.updated_at);
  cleanupIdentityMaterials(db);
  assert.equal(db.prepare("SELECT detail FROM club_identity_reports WHERE id=?").get(r.id).detail, "新补充的私密授权核对材料");
  assert.equal((await decide("report", r.id, "dismiss")).status, 200);
  db.prepare("UPDATE club_identity_reports SET reviewed_at=? WHERE id=?").run(past, r.id);
  cleanupIdentityMaterials(db);
  const cleaned = db.prepare("SELECT * FROM club_identity_reports WHERE id=?").get(r.id);
  assert.equal(cleaned.detail, ""); assert.equal(cleaned.contact, ""); assert.equal(cleaned.source_url, ""); assert.ok(cleaned.materials_deleted_at);
  const timeline = db.prepare("SELECT decision FROM club_identity_events WHERE kind='report' AND case_id=?").all(r.id).map((event) => event.decision);
  assert.deepEqual(timeline, ["submit", "dismiss", "supplement", "resubmit", "dismiss"]);
});

test("restricted public and invite summaries retain only the caller's actual membership", async () => {
  const owner = await setup("受限成员入口团"), member = await account(), manager = await account(), outsider = await account(), claimant = await account(), db = getDb();
  db.prepare("INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,'member')").run(owner.club.id, member.id, new Date().toISOString());
  db.prepare("INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,'manager')").run(owner.club.id, manager.id, new Date().toISOString());
  db.prepare("UPDATE users SET leader=1 WHERE id IN (?,?)").run(manager.id, outsider.id);
  assert.equal((await request(app).post(base + "/clubs/join").set(outsider.auth).send({ clubId: owner.club.id })).status, 200);
  const dispute = await report(owner, claimant);
  assert.equal((await decide("report", dispute.id, "restrict")).status, 200);
  const before = db.prepare("SELECT user_id,role FROM club_members WHERE club_id=? ORDER BY user_id").all(owner.club.id);
  for (const url of [`/clubs/${owner.club.id}/public`, `/clubs/invite/${owner.club.code}`]) {
    for (const [user, expectedJoined] of [[owner, true], [member, true], [manager, true], [outsider, false], [null, false]]) {
      const response = await request(app).get(base + url).set(user ? user.auth : {}).query({ userId: owner.id, ownerId: owner.id, canManageIdentity: true });
      assert.equal(response.status, 200);
      assert.equal(response.headers["cache-control"], "private, no-store");
      const card = response.body.club;
      assert.equal(card.restricted, true);
      assert.equal(card.joined, expectedJoined, `${url}: ${user ? user.id : 'guest'}`);
      assert.equal(card.canManageIdentity, user === owner, `${url}: only the current owner has the identity entry`);
      assert.equal(card.pending, false);
      assert.equal(card.id, owner.club.id);
      assert.equal(card.name, owner.club.name);
      assert.equal(card.city, "杭州");
      assert.equal(card.memberCount, 0);
      for (const key of ["intro", "leader", "verificationScope", "organization", "verifiedAt"]) assert.equal(card[key], "");
      for (const key of ["ownerId", "code", "members", "contact", "detail", "evidence", "moderationNote"]) assert.equal(card[key], undefined);
      assert.equal(card.verified, false);
      assert.ok(!JSON.stringify(card).includes("13900139000"));
    }
  }
  for (const user of [owner, member]) assert.equal((await request(app).get(base + `/clubs/${owner.club.id}`).set(user.auth)).status, 200);
  assert.equal((await request(app).get(base + `/clubs/${owner.club.id}`).set(outsider.auth)).status, 403);
  assert.equal((await request(app).post(base + "/clubs/join").set(outsider.auth).send({ clubId: owner.club.id })).status, 403);
  assert.deepEqual((await request(app).get(base + "/clubs/directory").query({ q: "#" + owner.club.id })).body.clubs, []);
  assert.deepEqual(db.prepare("SELECT user_id,role FROM club_members WHERE club_id=? ORDER BY user_id").all(owner.club.id), before);
});

test("identity entry permission follows the actual owner after transferring a restricted club", async () => {
  const owner = await setup("受限团长入口移交团"), nextOwner = await account(), claimant = await account(), db = getDb();
  db.prepare("INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,'member')").run(owner.club.id, nextOwner.id, new Date().toISOString());
  const verification = await apply(owner);
  const dispute = await report(owner, claimant);
  assert.equal((await decide("report", dispute.id, "restrict")).status, 200);
  const urls = [`/clubs/${owner.club.id}/public`, `/clubs/invite/${owner.club.code}`];
  for (const url of urls) {
    assert.equal((await request(app).get(base + url).set(owner.auth)).body.club.canManageIdentity, true);
    assert.equal((await request(app).get(base + url).set(nextOwner.auth)).body.club.canManageIdentity, false);
  }
  const transfer = await request(app).put(base + `/clubs/${owner.club.id}/members/${nextOwner.id}`).set(owner.auth).send({ role: "owner" });
  assert.equal(transfer.status, 200);
  for (const url of urls) {
    for (const [user, allowed] of [[owner, false], [nextOwner, true]]) {
      const response = await request(app).get(base + url).set(user.auth);
      assert.equal(response.status, 200);
      assert.equal(response.body.club.canManageIdentity, allowed);
      assert.equal(response.body.club.joined, true);
      assert.equal(response.body.club.leader, "");
      assert.equal(response.body.club.memberCount, 0);
      assert.equal(response.body.club.ownerId, undefined);
      assert.equal(response.body.club.evidence, undefined);
      assert.match(response.headers["cache-control"], /no-store/);
    }
  }
  assert.equal((await request(app).get(base + `/clubs/${owner.club.id}/identity`).set(owner.auth)).status, 403);
  const current = await request(app).get(base + `/clubs/${owner.club.id}/identity`).set(nextOwner.auth);
  assert.equal(current.status, 200);
  assert.equal(current.body.verification, null);
  assert.ok(!JSON.stringify(current.body).includes(verification.evidence));
});

test("pending report updates save the latest material in the same private case and identical retries are inert", async () => {
  const owner = await setup("待处理材料更新团"), elsewhere = await setup("材料隔离另一团"), claimant = await account(), otherUser = await account(), db = getDb();
  const submit = (user, clubId, body) => request(app).post(base + `/clubs/${clubId}/reports`).set(user.auth).send(body);
  const original = { type: "impersonation", detail: "首次私密事实", contact: "private-first@example.test", sourceUrl: "https://example.org/first" };
  const initial = await submit(claimant, owner.club.id, original);
  assert.equal(initial.status, 200);
  assert.equal(initial.body.outcome, "created");
  const id = initial.body.report.id, createdAt = initial.body.report.createdAt;
  const oldTime = new Date(Date.now() - 86400000).toISOString();
  db.prepare("UPDATE club_identity_reports SET updated_at=?,reviewer='existing-reviewer',reviewed_at=?,note='原有处理提示' WHERE id=?").run(oldTime, oldTime, id);
  let body = original;
  for (const changes of [
    { detail: "补充私密事实：已核对新的组织授权渠道" },
    { contact: "private-updated@example.test" },
    { sourceUrl: "https://example.org/new-authority" },
    { sourceUrl: "" }
  ]) {
    body = { ...body, ...changes };
    const updated = await submit(claimant, owner.club.id, body);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.outcome, "updated");
    assert.equal(updated.body.report.id, id);
    assert.equal(updated.body.report.createdAt, createdAt);
    assert.equal(updated.body.report.status, "pending");
    for (const [key, value] of Object.entries({ detail: body.detail, sourceUrl: body.sourceUrl, contact: body.contact })) assert.equal(updated.body.report[key], value);
    const saved = db.prepare("SELECT * FROM club_identity_reports WHERE id=?").get(id);
    assert.equal(saved.detail, body.detail); assert.equal(saved.contact, body.contact); assert.equal(saved.source_url, body.sourceUrl);
    assert.equal(saved.reviewer, "existing-reviewer"); assert.equal(saved.reviewed_at, oldTime); assert.equal(saved.note, "原有处理提示");
    assert.equal(saved.created_at, createdAt);
    assert.notEqual(saved.updated_at, oldTime);
    const eventsBefore = db.prepare("SELECT * FROM club_identity_events WHERE kind='report' AND case_id=? ORDER BY id").all(id);
    const identical = await submit(claimant, owner.club.id, body);
    assert.equal(identical.status, 200);
    assert.equal(identical.body.outcome, "unchanged");
    assert.equal(identical.body.report.id, id);
    assert.equal(identical.body.report.updatedAt, saved.updated_at);
    assert.deepEqual(db.prepare("SELECT * FROM club_identity_reports WHERE id=?").get(id), saved);
    assert.deepEqual(db.prepare("SELECT * FROM club_identity_events WHERE kind='report' AND case_id=? ORDER BY id").all(id), eventsBefore);
  }
  const events = db.prepare("SELECT * FROM club_identity_events WHERE kind='report' AND case_id=? ORDER BY id").all(id);
  assert.deepEqual(events.map(event => event.decision), ["submit", "update", "update", "update", "update"]);
  assert.ok(!JSON.stringify(events).includes(body.contact));
  assert.ok(!JSON.stringify(events).includes(body.detail));
  const byUser = await submit(otherUser, owner.club.id, body);
  const byClub = await submit(claimant, elsewhere.club.id, body);
  const byType = await submit(claimant, owner.club.id, { ...body, type: "management" });
  for (const separate of [byUser, byClub, byType]) {
    assert.equal(separate.status, 200);
    assert.equal(separate.body.outcome, "created");
    assert.notEqual(separate.body.report.id, id);
  }
  assert.equal(db.prepare("SELECT COUNT(*) n FROM club_identity_reports WHERE club_id=? AND user_id=? AND type='impersonation'").get(owner.club.id, claimant.id).n, 1);
  const mine = await request(app).get(base + "/me/club-reports").set(claimant.auth);
  assert.equal(mine.body.reports.find(item => item.id === id).contact, body.contact);
  const other = await request(app).get(base + "/me/club-reports").set(otherUser.auth);
  assert.ok(!other.body.reports.some(item => item.id === id));
  assert.equal((await request(app).get(base + `/clubs/${owner.club.id}/public`)).body.club.publicStatus, "active");
});
