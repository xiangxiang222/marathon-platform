const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const crypto = require("crypto");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const { cleanupPrivacyRequests } = require("../src/legal");
const { version } = require("../../shared/legal-documents.json");

const API = "/marathon/api";
const consent = { version, accepted: true };
const admin = { Authorization: "Bearer legal-admin-test" };
process.env.ADMIN_TOKEN = "legal-admin-test";
let sequence = 0;
async function account() {
  const response = await request(app).post(API + "/session").send({ nickname: "隐私测试" + ++sequence });
  assert.equal(response.status, 200);
  return { ...response.body.user, token: response.body.token, auth: { Authorization: "Bearer " + response.body.token } };
}
function submit(owner, detail = "请说明本人的信息处理情况", type = "access") {
  return request(app).post(API + "/me/privacy-requests").set(owner.auth).send({ type, detail });
}
function decide(id, status, response = "本次为人工办理回复，请查看说明的实际执行范围") {
  return request(app).post(API + `/admin/privacy-requests/${id}/decision`).set(admin).send({ status, response });
}
function captcha(nickname, password, extra = {}) {
  const token = crypto.randomUUID();
  getDb().prepare("INSERT INTO captchas(token,code,expire_at) VALUES(?,'A1B2',?)").run(token, new Date(Date.now() + 60000).toISOString());
  return { nickname, password, captchaToken: token, captcha: "A1B2", ...extra };
}

test("public legal documents expose only approved operator fields and distinguish unconfirmed publication", async (t) => {
  const keys = ["LEGAL_CONTACT_EMAIL", "LEGAL_CONTACT_ADDRESS", "LEGAL_STORAGE_REGION", "LEGAL_HOSTING_ENTITY", "LEGAL_OPERATOR_CONFIRMED", "LEGAL_PUBLICATION_CONFIRMED", "LEGAL_EFFECTIVE_DATE", "WECHAT_MINIPROGRAM_APP_SECRET"];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => { for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; } });
  for (const key of keys) delete process.env[key];
  process.env.WECHAT_MINIPROGRAM_APP_SECRET = "never-public-wechat-secret";
  const draft = await request(app).get(API + "/legal");
  assert.equal(draft.status, 200);
  assert.equal(draft.body.version, version);
  assert.equal(draft.body.ready, false);
  assert.equal(draft.body.operator.status, "pending-confirmation");
  assert.ok(draft.body.documents.some((doc) => doc.id === "privacy"));
  assert.match(draft.headers["cache-control"], /no-store/);
  assert.doesNotMatch(JSON.stringify(draft.body), /never-public-wechat-secret|legal-admin-test/);
  process.env.LEGAL_OPERATOR_CONFIRMED = "true";
  assert.equal((await request(app).get(API + "/legal")).body.ready, false);
  Object.assign(process.env, { LEGAL_CONTACT_EMAIL: "privacy@example.test", LEGAL_CONTACT_ADDRESS: "测试运营者公开地址", LEGAL_STORAGE_REGION: "中国境内测试地域", LEGAL_HOSTING_ENTITY: "经核验的测试云主体" });
  const unconfirmed = await request(app).get(API + "/legal");
  assert.equal(unconfirmed.body.ready, false);
  assert.deepEqual(unconfirmed.body.publication.missing, ["publicationConfirmation", "effectiveDate"]);
  process.env.LEGAL_PUBLICATION_CONFIRMED = "true";
  for (const value of ["", "2026-02-30", "2025-02-29", "2026-13-01", "26-11-01", "0000-01-01"]) {
    process.env.LEGAL_EFFECTIVE_DATE = value;
    const invalid = await request(app).get(API + "/legal");
    assert.equal(invalid.body.ready, false, value);
    assert.deepEqual(invalid.body.publication.missing, ["effectiveDate"]);
  }
  process.env.LEGAL_EFFECTIVE_DATE = "2026-11-01";
  const published = await request(app).get(API + "/legal");
  assert.equal(published.body.ready, true);
  assert.equal(published.body.operator.status, "confirmed");
  assert.equal(published.body.operator.hostingProvider, "经核验的测试云主体");
  assert.equal(published.body.effectiveDate, "2026-11-01");
  assert.deepEqual(published.body.publication.missing, []);
  process.env.LEGAL_CONTACT_EMAIL = "not-an-email";
  assert.equal((await request(app).get(API + "/legal")).body.ready, false);
});

test("new password accounts need current explicit consent and store a minimal, separate receipt", async () => {
  const body = { nickname: "协议注册" + ++sequence, password: "legal-password-8" };
  const before = getDb().prepare("SELECT COUNT(*) n FROM users").get().n;
  assert.equal((await request(app).post(API + "/auth/register").send(body)).status, 428);
  assert.equal((await request(app).post(API + "/auth/register").send({ ...body, legalConsent: { version, accepted: false } })).status, 400);
  assert.equal((await request(app).post(API + "/auth/register").send({ ...body, legalConsent: { version: "old", accepted: true } })).status, 409);
  assert.equal(getDb().prepare("SELECT COUNT(*) n FROM users").get().n, before);
  const registered = await request(app).post(API + "/auth/register").send({ ...body, legalConsent: consent });
  assert.equal(registered.status, 200);
  const receipts = getDb().prepare("SELECT * FROM legal_acceptances WHERE user_id=?").all(registered.body.user.id);
  assert.equal(receipts.length, 1);
  assert.deepEqual(Object.keys(receipts[0]).sort(), ["accepted_at", "scope", "source", "user_id", "version"]);
  assert.equal(receipts[0].version, version);
  assert.equal(receipts[0].scope, "terms");
  assert.equal(receipts[0].source, "register");
  assert.doesNotMatch(JSON.stringify(receipts), /password|User-Agent|127\.0\.0\.1/);
});

test("legacy password login remains available and invalid optional consent does not rotate its session", async () => {
  const created = await request(app).post(API + "/admin/users").set(admin).send({ nickname: "旧协议账号" + ++sequence, password: "legacy-password-8" });
  assert.equal(created.status, 201);
  const nickname = created.body.nickname, id = created.body.id, db = getDb();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM legal_acceptances WHERE user_id=?").get(id).n, 0);
  const login = await request(app).post(API + "/auth/login").send(captcha(nickname, "legacy-password-8"));
  assert.equal(login.status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM legal_acceptances WHERE user_id=?").get(id).n, 0);
  const oldToken = login.body.token;
  const rejected = await request(app).post(API + "/auth/login").send(captcha(nickname, "legacy-password-8", { legalConsent: { version: "old", accepted: true } }));
  assert.equal(rejected.status, 409);
  assert.equal(db.prepare("SELECT token FROM users WHERE id=?").get(id).token, oldToken);
  assert.equal((await request(app).post(API + "/auth/login").send(captcha(nickname, "legacy-password-8", { legalConsent: consent }))).status, 200);
  assert.equal(db.prepare("SELECT source FROM legal_acceptances WHERE user_id=?").get(id).source, "login");
});

test("WeChat account creation requires consent while existing linked accounts are not forced to accept", async (t) => {
  const oldId = process.env.WECHAT_MINIPROGRAM_APP_ID, oldSecret = process.env.WECHAT_MINIPROGRAM_APP_SECRET, oldExchange = app.locals.wechatCodeExchange;
  Object.assign(process.env, { WECHAT_MINIPROGRAM_APP_ID: "legal-fixture-app", WECHAT_MINIPROGRAM_APP_SECRET: "legal-fixture-secret" });
  const openid = "legal-openid-" + crypto.randomUUID();
  app.locals.wechatCodeExchange = async () => ({ openid });
  t.after(() => { app.locals.wechatCodeExchange = oldExchange; if (oldId === undefined) delete process.env.WECHAT_MINIPROGRAM_APP_ID; else process.env.WECHAT_MINIPROGRAM_APP_ID = oldId; if (oldSecret === undefined) delete process.env.WECHAT_MINIPROGRAM_APP_SECRET; else process.env.WECHAT_MINIPROGRAM_APP_SECRET = oldSecret; });
  const body = { code: "legal-wechat-code", createAccount: true };
  assert.equal((await request(app).post(API + "/auth/wechat").send(body)).status, 428);
  assert.equal((await request(app).post(API + "/auth/wechat").send({ ...body, legalConsent: { accepted: true, version: "old" } })).status, 409);
  assert.equal(getDb().prepare("SELECT id FROM users WHERE openid=?").get(openid), undefined);
  const created = await request(app).post(API + "/auth/wechat").send({ ...body, legalConsent: consent });
  assert.equal(created.status, 200);
  const again = await request(app).post(API + "/auth/wechat").send({ code: "legal-wechat-code" });
  assert.equal(again.status, 200);
  assert.equal(again.body.user.id, created.body.user.id);
  assert.equal(getDb().prepare("SELECT COUNT(*) n FROM legal_acceptances WHERE user_id=?").get(created.body.user.id).n, 1);
  const token = again.body.token;
  const bad = await request(app).post(API + "/auth/wechat").send({ code: "legal-wechat-code", legalConsent: { version, accepted: "true" } });
  assert.equal(bad.status, 400);
  assert.equal(getDb().prepare("SELECT token FROM users WHERE id=?").get(created.body.user.id).token, token);
});

test("privacy requests stay private, validate input and treat closure as a manual request", async () => {
  const owner = await account(), other = await account();
  assert.equal((await request(app).get(API + "/me/privacy-requests")).status, 401);
  assert.equal((await request(app).post(API + "/me/privacy-requests").send({ type: "access", detail: "查询资料" })).status, 401);
  assert.equal((await submit(owner, "查询资料", "wrong")).status, 400);
  assert.equal((await submit(owner, "a")).status, 400);
  const created = await submit(owner, "请人工办理我的账号注销，并说明历史记录处理结果", "close");
  assert.equal(created.status, 200);
  assert.equal(created.body.request.status, "pending");
  assert.match(created.headers["cache-control"], /no-store/);
  assert.equal(created.body.request.userId, undefined);
  assert.ok(getDb().prepare("SELECT id FROM users WHERE id=?").get(owner.id));
  assert.deepEqual((await request(app).get(API + "/me/privacy-requests").set(other.auth)).body.requests, []);
  assert.equal((await request(app).get(API + "/me/privacy-requests").set(owner.auth).query({ userId: other.id })).body.requests[0].id, created.body.request.id);
  assert.equal((await request(app).get(API + "/admin/privacy-requests").set(owner.auth)).status, 401);
});

test("only platform admins decide private requests, with mandatory replies and a minimal audit", async () => {
  const owner = await account(), created = await submit(owner);
  const id = created.body.request.id;
  const name = "legalclub" + ++sequence;
  assert.equal((await request(app).post(API + "/admin/accounts").set(admin).send({ username: name, password: "legal-club-pass-8", role: "club" })).status, 200);
  const login = await request(app).post(API + "/admin/login").send({ username: name, password: "legal-club-pass-8" });
  const club = { Authorization: "Bearer " + login.body.token };
  assert.equal((await request(app).get(API + "/admin/privacy-requests").set(club)).status, 403);
  assert.equal((await request(app).post(API + `/admin/privacy-requests/${id}/decision`).set(club).send({ status: "completed", response: "无权处理" })).status, 403);
  assert.equal((await decide(id, "completed", "")).status, 400);
  assert.equal((await decide(id, "unknown")).status, 400);
  assert.equal((await decide(99999999, "completed")).status, 404);
  const handled = await decide(id, "processing", "已受理查阅请求，当前仅核验身份，尚未进行任何账号删除");
  assert.equal(handled.status, 200);
  const panel = await request(app).get(API + "/admin/privacy-requests").set(admin).query({ page: 1, pageSize: 2, status: "processing" });
  assert.equal(panel.status, 200);
  assert.equal(panel.body.pageSize, 2);
  assert.ok(panel.body.rows.some((row) => row.id === id && row.userNickname === owner.nickname));
  assert.match(panel.headers["cache-control"], /no-store/);
  const events = getDb().prepare("SELECT * FROM privacy_request_events WHERE request_id=?").all(id);
  assert.equal(events.length, 2);
  assert.equal(events[1].actor, "admin:platform");
  assert.equal(events[1].status, "processing");
  assert.equal(events[1].response, undefined);
});

test("same active request deduplicates and a needs-info reply accepts replacement material on its original case", async () => {
  const owner = await account(), created = await submit(owner, "我要复制个人运动记录", "copy"), id = created.body.request.id;
  const duplicate = await submit(owner, "我要复制个人运动记录", "copy");
  assert.equal(duplicate.body.request.id, id);
  assert.equal(getDb().prepare("SELECT COUNT(*) n FROM privacy_request_events WHERE request_id=?").get(id).n, 1);
  assert.equal((await decide(id, "needs_info", "请补充需复制的记录月份，不需要身份证件")).status, 200);
  getDb().prepare("UPDATE privacy_requests SET materials_deleted_at='old-marker' WHERE id=?").run(id);
  const supplemented = await submit(owner, "需要复制本人 2026 年 10 月份运动摘要", "copy");
  assert.equal(supplemented.body.request.id, id);
  assert.equal(supplemented.body.request.status, "pending");
  assert.equal(supplemented.body.request.response, "");
  const row = getDb().prepare("SELECT * FROM privacy_requests WHERE id=?").get(id);
  assert.equal(row.materials_deleted_at, "");
  assert.equal(row.closed_at, "");
  assert.match(row.detail, /10 月份/);
});

test("club administrators cannot reset or delete an account to bypass private-request isolation", async () => {
  const nickname = "保护私密账号" + ++sequence, password = "original-private-pass-8";
  const registered = await request(app).post(API + "/auth/register").send({ nickname, password, legalConsent: consent });
  assert.equal(registered.status, 200);
  const owner = { ...registered.body.user, auth: { Authorization: "Bearer " + registered.body.token } }, db = getDb();
  const privacy = await submit(owner, "私密说明只允许本人和平台管理员处理");
  const before = db.prepare("SELECT password_hash,salt,token,leader,openid FROM users WHERE id=?").get(owner.id);
  const name = "privateguard" + ++sequence;
  assert.equal((await request(app).post(API + "/admin/accounts").set(admin).send({ username: name, password: "private-guard-pass-8", role: "club" })).status, 200);
  const login = await request(app).post(API + "/admin/login").send({ username: name, password: "private-guard-pass-8" });
  const club = { Authorization: "Bearer " + login.body.token };
  assert.equal((await request(app).get(API + "/admin/privacy-requests").set(club)).status, 403);
  const attemptedPassword = "unauthorized-reset-pass-8";
  assert.equal((await request(app).put(API + `/admin/users/${owner.id}/password`).set(club).send({ password: attemptedPassword })).status, 403);
  assert.equal((await request(app).delete(API + `/admin/users/${owner.id}`).set(club)).status, 403);
  assert.equal((await request(app).put(API + `/admin/users/${owner.id}/leader`).set(club).send({ leader: true })).status, 403);
  assert.equal((await request(app).post(API + "/admin/users").set(club).send({ nickname: "禁止后台建号" + sequence, password: attemptedPassword })).status, 403);
  assert.equal((await request(app).put(API + `/admin/accounts/${name}`).set(club).send({ role: "admin" })).status, 403);
  assert.equal((await request(app).post(API + "/me/wechat").set(club).send({ code: "not-a-user-session", userId: owner.id })).status, 401);
  assert.deepEqual(db.prepare("SELECT password_hash,salt,token,leader,openid FROM users WHERE id=?").get(owner.id), before);
  const takeover = await request(app).post(API + "/auth/login").send(captcha(nickname, attemptedPassword));
  assert.equal(takeover.status, 400);
  assert.equal(takeover.body.token, undefined);
  const stillPrivate = await request(app).get(API + "/me/privacy-requests").set(club);
  assert.equal(stillPrivate.status, 401);
  const original = await request(app).post(API + "/auth/login").send(captcha(nickname, password));
  assert.equal(original.status, 200);
  const own = await request(app).get(API + "/me/privacy-requests").set("Authorization", "Bearer " + original.body.token);
  assert.equal(own.body.requests[0].id, privacy.body.request.id);
  assert.equal(own.body.requests[0].detail, "私密说明只允许本人和平台管理员处理");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM legal_acceptances WHERE user_id=?").get(owner.id).n, 1);
});

test("privacy request quotas are per account, checked after deduplication, and cap all active cases", async () => {
  const owner = await account();
  for (let i = 0; i < 3; i++) assert.equal((await submit(owner, "不同申请说明" + i)).status, 200);
  assert.equal((await submit(owner, "第四条不同申请")).status, 429);
  assert.equal((await submit(owner, "不同申请说明0")).status, 200);
  const capped = await account(), db = getDb(), old = new Date(Date.now() - 2 * 86400000).toISOString();
  const insert = db.prepare("INSERT INTO privacy_requests(user_id,type,detail,created_at,updated_at) VALUES(?,'access',?,?,?)");
  for (let i = 0; i < 10; i++) insert.run(capped.id, "仍在处理的申请" + i, old, old);
  assert.equal((await submit(capped, "第十一条活动申请")).status, 429);
  const other = await account();
  assert.equal((await submit(other)).status, 200);
});

test("terminal private text expires after 90 days, records and events after a year, while open cases survive", async () => {
  const owner = await account(), db = getDb(), now = Date.now();
  const seed = (status, age) => {
    const at = new Date(now - age * 86400000).toISOString();
    const id = Number(db.prepare("INSERT INTO privacy_requests(user_id,type,status,detail,response,created_at,updated_at,closed_at) VALUES(?,'access',?,'保密原始材料','保密办理回复',?,?,?)").run(owner.id, status, at, at, status === "pending" ? "" : at).lastInsertRowid);
    db.prepare("INSERT INTO privacy_request_events(request_id,actor,status,created_at) VALUES(?,'admin:test',?,?)").run(id, status, at);
    return id;
  };
  const recent = seed("completed", 89), expired = seed("rejected", 91), pastYear = seed("completed", 366), open = seed("pending", 400);
  cleanupPrivacyRequests(db, now);
  assert.equal(db.prepare("SELECT detail FROM privacy_requests WHERE id=?").get(recent).detail, "保密原始材料");
  const cleared = db.prepare("SELECT * FROM privacy_requests WHERE id=?").get(expired);
  assert.equal(cleared.detail, ""); assert.equal(cleared.response, ""); assert.ok(cleared.materials_deleted_at);
  assert.equal(db.prepare("SELECT id FROM privacy_requests WHERE id=?").get(pastYear), undefined);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM privacy_request_events WHERE request_id=?").get(pastYear).n, 0);
  assert.equal(db.prepare("SELECT detail FROM privacy_requests WHERE id=?").get(open).detail, "保密原始材料");
});

test("deleting an account removes its legal receipts and privacy requests with all associated events", async () => {
  const created = await request(app).post(API + "/auth/register").send({ nickname: "注销凭据" + ++sequence, password: "legal-delete-pass-8", legalConsent: consent });
  const owner = { ...created.body.user, auth: { Authorization: "Bearer " + created.body.token } };
  const privacy = await submit(owner), db = getDb();
  assert.equal((await request(app).delete(API + "/admin/users/" + owner.id).set(admin)).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM legal_acceptances WHERE user_id=?").get(owner.id).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM privacy_requests WHERE user_id=?").get(owner.id).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM privacy_request_events WHERE request_id=?").get(privacy.body.request.id).n, 0);
});
