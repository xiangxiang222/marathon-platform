const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const { recognizeImage, imageSize, redactIdentifiers } = require("../src/history-ocr");
const { version } = require("../../shared/legal-documents.json");

const API = "/marathon/api/me/race-history";
// Synthetic certificate contains no runner name, identity number or real photo.
const certificate = fs.readFileSync(path.join(__dirname, "fixtures/race-certificate.png"));
async function account(name) {
  const result = await request(app).post("/marathon/api/session").send({ nickname: name });
  assert.equal(result.status, 200);
  return { id: result.body.user.id, auth: { Authorization: "Bearer " + result.body.token } };
}

test("image recognition requires an authenticated, current explicit consent before accepting material", async () => {
  const owner = await account("图片本次同意");
  assert.equal((await request(app).post(API + "/recognize").attach("file", certificate, "certificate.png")).status, 401);
  assert.equal((await request(app).post(API + "/recognize").set(owner.auth).attach("file", certificate, "certificate.png")).status, 428);
  assert.equal((await request(app).post(API + "/recognize").set(owner.auth).set("X-Race-History-Consent", "old").attach("file", certificate, "certificate.png")).status, 409);
  assert.equal((await request(app).post(API + "/recognize").set(owner.auth).set("X-Race-History-Consent", version).send({ url: "https://example.test/certificate.png" })).status, 400);
  assert.equal((await request(app).post(API + "/recognize").set(owner.auth).set("X-Race-History-Consent", version).attach("file", certificate, "one.png").attach("file", certificate, "two.png")).status, 400);
  assert.equal((await request(app).post(API + "/recognize").set(owner.auth).set("X-Race-History-Consent", version).attach("file", Buffer.from("This is not an image, regardless of its filename"), "certificate.png")).status, 400);
  assert.equal(getDb().prepare("SELECT COUNT(*) n FROM legal_acceptances WHERE user_id=?").get(owner.id).n, 0);
  assert.equal((await request(app).get(API).set(owner.auth)).body.entries.length, 0);
});

test("oversized image dimensions are rejected before decode and common identity numbers are redacted", () => {
  assert.deepEqual(imageSize(certificate), { width: 1100, height: 750 });
  const bomb = Buffer.from(certificate);
  bomb.writeUInt32BE(20000, 16);
  assert.throws(() => imageSize(bomb), /尺寸过大/);
  assert.throws(() => imageSize(Buffer.alloc(8 * 1024 * 1024 + 1)), /8MB/);
  assert.equal(redactIdentifiers("证件号110101199001011234，手机13800138000，成绩03:12:45"), "证件号[证件号已隐藏]，手机[手机号已隐藏]，成绩03:12:45");
});

test("local Chinese and English OCR yields one reviewable race, and only confirmed fields are stored privately", { timeout: 60000 }, async () => {
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(recognizeImage(certificate, { signal: cancelled.signal }), /取消/);
  // The request below exercises the actual bundled OCR engine, not a mock.
  const owner = await account("本地证书识别");
  const other = await account("证书隔离账户");
  const recognized = await request(app).post(API + "/recognize").set(owner.auth).set("X-Race-History-Consent", version).attach("file", certificate, "certificate.png");
  assert.equal(recognized.status, 200, JSON.stringify(recognized.body));
  assert.equal(recognized.body.engine, "tesseract-local");
  assert.match(recognized.body.text, /2025.*北京马拉松/);
  assert.doesNotMatch(recognized.body.text, /\n\s*\n/);
  const preview = await request(app).post(API + "/import/preview").set(owner.auth).send({ text: recognized.body.text });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.candidates.length, 1);
  const candidate = preview.body.candidates[0];
  assert.equal(candidate.raceDate, "2025-10-26");
  assert.equal(candidate.distance, "full");
  assert.equal(candidate.timing, "net");
  assert.equal(candidate.netSeconds, 11565);
  assert.equal(candidate.gunSeconds, 11720);
  assert.equal(candidate.bib, "A13059");
  assert.deepEqual(candidate.issues, []);
  assert.equal((await request(app).get(API).set(owner.auth)).body.entries.length, 0);
  const confirmed = await request(app).post(API + "/import/confirm").set(owner.auth).send({ candidates: [candidate] });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal(confirmed.body.created, 1);
  assert.equal(confirmed.body.entries[0].media.length, 0);
  assert.equal((await request(app).get(API).set(other.auth)).body.entries.length, 0);
  const receipts = getDb().prepare("SELECT * FROM legal_acceptances WHERE user_id=? AND scope='race-history-ocr'").all(owner.id);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].version, version);
  assert.deepEqual(Object.keys(receipts[0]).sort(), ["accepted_at", "scope", "source", "user_id", "version"]);
});
