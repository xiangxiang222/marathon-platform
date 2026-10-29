const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");
const { trainingOf, careerOf, validStartedAt, runnerRoot } = require("../src/runner-center");

const API = "/marathon/api";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cX1kAAAAASUVORK5CYII=", "base64");
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.from([0, 0, 0, 0]), Buffer.from("isommp42"), Buffer.from([0, 0, 0, 8]), Buffer.from("mdat")]);

async function user(name) {
  const response = await request(app).post(API + "/session").send({ nickname: name });
  assert.equal(response.status, 200);
  return { id: response.body.user.id, token: response.body.token, auth: { Authorization: "Bearer " + response.body.token } };
}

function race(id, date = "2025-10-11", city = "北京", province = "北京", kind = "road", meet = "offline") {
  getDb().prepare("INSERT INTO races (id, name, city, province, distances, race_date, deadline, place, kinds, meet) VALUES (?, ?, ?, ?, 'full,half,10k,5k', ?, '', '', ?, ?)").run(id, id, city, province, date, kind, meet);
}

function result(userId, raceId, distance = "full", seconds = 14400) {
  getDb().prepare("INSERT INTO results (user_id, race_id, distance, seconds, story, updated_at) VALUES (?, ?, ?, ?, '', ?)").run(userId, raceId, distance, seconds, new Date().toISOString());
}

function run(userId, startedAt, distanceKm, duration = 3600, type = "run", volume = distanceKm) {
  return getDb().prepare("INSERT INTO runs (user_id, type, started_at, distance_km, duration_sec, volume_km, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(userId, type, startedAt, distanceKm, duration, volume, new Date().toISOString());
}

function inputRun(startedAt, km = 10, duration = 3600) { return { id: 1, type: "run", started_at: startedAt, distance_km: km, duration_sec: duration, city: "", source: "manual" }; }

test("runner training periods cross calendar years and leap months using Beijing dates", () => {
  const now = new Date("2026-12-31T16:30:00Z"); // Beijing January 1.
  const runs = [inputRun("2027-01-01T00:00", 5), inputRun("2026-12-31T08:00", 10), inputRun("2026-12-25T00:00", 3), inputRun("2026-12-24T08:00", 4)];
  const week = trainingOf(runs, "week", 0, now);
  assert.equal(week.start, "2026-12-28");
  assert.equal(week.end, "2027-01-04");
  assert.equal(week.km, 15);
  assert.equal(week.previousKm, 7);
  assert.equal(week.bars.length, 7);
  assert.equal(week.bars[4].key, "2027-01-01");
  assert.equal(week.bars[4].km, 5);
  assert.equal(week.bars[6].km, 0);
  assert.equal(week.paceLabel, "8'00\"");
  const previous = trainingOf(runs, "year", -1, now);
  assert.equal(previous.start, "2026-01-01");
  assert.equal(previous.km, 17);
  assert.equal(previous.bars.length, 12);
  assert.equal(previous.bars[11].km, 17);
  const leap = trainingOf([], "month", -1, new Date("2024-03-02T04:00:00Z"));
  assert.equal(leap.start, "2024-02-01");
  assert.equal(leap.end, "2024-03-01");
  assert.equal(leap.bars.length, 29);
  assert.equal(leap.changePercent, null);
  assert.equal(leap.paceLabel, "—");
});

test("current partial periods compare an equivalent elapsed interval; invalid and future start times are excluded", () => {
  const now = new Date("2026-10-28T04:00:00Z"); // Wednesday, 12:00 Beijing.
  const runs = [inputRun("2026-10-28T08:00", 6), inputRun("2026-10-21T10:00", 3), inputRun("2026-10-21T15:00", 99)];
  const week = trainingOf(runs, "week", 0, now);
  assert.equal(week.previousKm, 3);
  assert.equal(week.changePercent, 100);
  assert.equal(week.comparisonLabel, "较上期同期");
  const shiftedNow = now.getTime() + 8 * 3600000;
  assert.equal(validStartedAt("2026-10-28T11:59", shiftedNow), true);
  assert.equal(validStartedAt("2026-10-28T12:01", shiftedNow), false);
  assert.equal(validStartedAt("2026-02-30T08:00", shiftedNow), false);
  assert.equal(validStartedAt("2026-10-27T24:00", shiftedNow), false);
  assert.equal(validStartedAt("not-a-date", shiftedNow), false);
});

test("career deduplicates event finishes and keeps road PB, offline footprint and performance totals distinct", () => {
  const item = (id, distance, seconds, options = {}) => ({ distance, seconds, clock: String(seconds), race: { id, raceDate: "2025-10-11", city: "北京", province: "北京", kind: "road", meet: "offline", ...options } });
  const career = careerOf([
    item("a", "full", 14400), item("a", "half", 7200),
    item("trail", "half", 3600, { kind: "trail", city: "张家口", province: "河北", raceDate: "2026-01-01" }),
    item("online", "full", 7200, { meet: "online", city: "远方", province: "远方" }),
    item("future", "full", 6000, { raceDate: "2099-01-01" }),
    item("invalid", "10k", 2100, { raceDate: "2025-02-30", city: "无效日期", province: "无效省" }),
    item("same-name-1", "10k", 2100, { raceDate: "2025-04-12", city: "同名城市", province: "甲省" }),
    item("same-name-2", "10k", 2100, { raceDate: "2025-04-19", city: "同名城市", province: "乙省" })
  ], "2026-10-29");
  assert.equal(career.finished, 5);
  assert.equal(career.resultCount, 6);
  assert.equal(career.pb.find((row) => row.distance === "half").race.id, "a");
  assert.equal(career.pb.find((row) => row.distance === "full").seconds, 14400);
  assert.deepEqual(career.cities, ["北京", "张家口", "同名城市", "同名城市"]);
  assert.equal(career.totalKm, 146.59);
  assert.equal(career.trends[0].count, 4);
  assert.equal(career.trends[1].count, 1);
  assert.deepEqual(career.years, ["2026", "2025"]);
});

test("result PB flags use the eligible career PB set, excluding online, trail, future and invalid dates", async () => {
  const owner = await user("跑者PB口径");
  const eligibleId = "runner-pb-eligible";
  const onlineId = "runner-pb-online";
  const trailId = "runner-pb-trail";
  const futureId = "runner-pb-future";
  const invalidId = "runner-pb-invalid";
  race(eligibleId, "2025-06-01", "杭州", "浙江", "road", "offline");
  race(onlineId, "2025-06-02", "线上", "线上", "road", "online");
  race(trailId, "2025-06-03", "黄山", "安徽", "trail", "offline");
  race(futureId, "2099-01-01", "未来", "未来", "road", "offline");
  race(invalidId, "2025-02-30", "日期异常", "异常省", "road", "offline");
  result(owner.id, eligibleId, "half", 6000);
  result(owner.id, onlineId, "half", 3000);
  result(owner.id, trailId, "half", 2400);
  result(owner.id, futureId, "half", 1200);
  result(owner.id, invalidId, "half", 900);
  const response = await request(app).get(API + "/me/runner?period=all").set(owner.auth);
  assert.equal(response.status, 200);
  const byRace = new Map(response.body.results.map((item) => [item.race.id, item]));
  assert.equal(byRace.get(eligibleId).pb, true);
  for (const id of [onlineId, trailId, futureId, invalidId]) assert.equal(byRace.get(id).pb, false, id);
  assert.deepEqual(response.body.career.pb.map((item) => item.race.id), [eligibleId]);
  assert.deepEqual(new Set(response.body.career.cities), new Set(["杭州", "黄山"]));
});

test("footprint counts and most-visited city distinguish cities with the same name in different provinces", () => {
  const item = (id, city, province) => ({ distance: "10k", seconds: 3600, clock: "1:00:00", race: { id, raceDate: "2025-06-01", city, province, kind: "road", meet: "offline" } });
  const career = careerOf([item("a", "武汉", "湖北"), item("b", "武汉", "湖北"), item("c", "同名城市", "甲省"), item("d", "同名城市", "乙省"), item("e", "同名城市", "丙省")], "2026-10-29");
  assert.deepEqual(career.cities, ["武汉", "同名城市", "同名城市", "同名城市"]);
  assert.equal(career.mostVisitedCity, "武汉");
});

test("runner summary requires login, isolates accounts and uses measured distance instead of credited PK volume", async () => {
  assert.equal((await request(app).get(API + "/me/runner")).status, 401);
  const owner = await user("跑者中心数据甲"), other = await user("跑者中心数据乙");
  const day = new Date(Date.now() + 8 * 3600000 - 86400000).toISOString().slice(0, 10);
  run(owner.id, day + "T06:00", 10, 3600, "run", 10);
  run(owner.id, day + "T08:00", 8, 7200, "trail", 12);
  run(owner.id, day + "T12:00", 30, 7200, "cycling", 30);
  run(owner.id, "2099-01-01T08:00", 99);
  run(owner.id, "2025-02-30T08:00", 99);
  run(other.id, day + "T06:00", 999);
  const answer = await request(app).get(API + "/me/runner?period=all").set(owner.auth);
  assert.equal(answer.status, 200);
  assert.equal(answer.body.overview.totalKm, 18);
  assert.equal(answer.body.overview.totalCount, 2);
  assert.equal(answer.body.training.durationSec, 10800);
  assert.equal(answer.body.training.activeDays, 1);
  assert.equal(answer.body.training.runs.length, 2);
  assert.equal(answer.body.training.km, 18);
  assert.match(answer.headers["cache-control"], /no-store/);
  assert.ok(answer.body.devices.every((row) => row.status === "unavailable"));
  assert.equal(answer.body.career.finished, 0);
  for (const query of ["period=bad", "offset=1", "offset=-1.5", "offset=-99999", "period=all&offset=-1", "offset=no"]) {
    assert.equal((await request(app).get(API + "/me/runner?" + query).set(owner.auth)).status, 400, query);
  }
  assert.equal((await request(app).get(API + "/me/runner?period=month&offset=-1").set(owner.auth)).status, 200);
});

test("private collections support multiple image types per result without replacing old proof", async () => {
  const owner = await user("跑者收藏甲"), other = await user("跑者收藏乙");
  const raceId = "runner-gallery";
  race(raceId);
  result(owner.id, raceId);
  getDb().prepare("UPDATE results SET proof = 'legacy-proof.png', proof_kind = 'certificate' WHERE user_id = ? AND race_id = ?").run(owner.id, raceId);
  const target = API + "/me/runner/media?raceId=" + raceId + "&distance=full&kind=";
  assert.equal((await request(app).post(target + "photo").set(owner.auth).send({ file: "a" })).status, 400);
  assert.equal((await request(app).post(target + "photo").attach("file", png, "a.png")).status, 401);
  assert.equal((await request(app).post(target + "photo").set(other.auth).attach("file", png, "a.png")).status, 400);
  assert.equal((await request(app).post(target + "unknown").set(owner.auth).attach("file", png, "a.png")).status, 400);
  assert.equal((await request(app).post(target + "photo").set(owner.auth).attach("file", Buffer.from("<svg><script>bad</script></svg>"), "a.png")).status, 400);
  const uploaded = [];
  for (const kind of ["certificate", "medal", "photo"]) {
    const response = await request(app).post(target + kind).set(owner.auth).attach("file", png, "a.png");
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.media.kind, kind);
    assert.equal(response.body.media.raceId, raceId);
    assert.equal(response.body.media.size, png.length);
    assert.equal(response.body.media.filename, undefined);
    uploaded.push(response.body.media);
  }
  const listing = await request(app).get(API + "/me/runner").set(owner.auth);
  assert.equal(listing.body.media.length, 3);
  assert.equal(listing.body.results[0].hasProof, true);
  assert.equal(getDb().prepare("SELECT proof FROM results WHERE user_id = ? AND race_id = ?").get(owner.id, raceId).proof, "legacy-proof.png");
  const fileUrl = API + "/me/runner/media/" + uploaded[0].id + "/file";
  assert.equal((await request(app).get(fileUrl)).status, 401);
  assert.equal((await request(app).get(fileUrl).set(other.auth)).status, 404);
  assert.equal((await request(app).get(fileUrl + "?t=" + other.token)).status, 404);
  const own = await request(app).get(fileUrl + "?t=" + owner.token);
  assert.equal(own.status, 200);
  assert.equal(own.headers["x-content-type-options"], "nosniff");
  assert.match(own.headers["cache-control"], /private/);
  assert.deepEqual(own.body, png);
  const deleteUrl = API + "/me/runner/media/" + uploaded[0].id;
  assert.equal((await request(app).delete(deleteUrl).set(other.auth)).status, 404);
  const dbRow = getDb().prepare("SELECT filename FROM runner_media WHERE id = ?").get(uploaded[0].id);
  assert.equal((await request(app).delete(deleteUrl).set(owner.auth)).status, 200);
  assert.equal(fs.existsSync(path.join(runnerRoot(), dbRow.filename)), false);
  assert.equal((await request(app).get(fileUrl).set(owner.auth)).status, 404);
});

test("video collections remain private and manageable after their result is deleted", async () => {
  const owner = await user("跑者视频收藏");
  const other = await user("视频收藏旁观者");
  const raceId = "runner-video";
  race(raceId);
  result(owner.id, raceId);
  result(owner.id, raceId, "half", 6000);
  const target = API + "/me/runner/media?raceId=" + raceId + "&distance=full&kind=video";
  assert.equal((await request(app).post(target).set(owner.auth).attach("file", png, "a.mp4")).status, 400);
  const upload = await request(app).post(target).set(owner.auth).attach("file", mp4, "a.mp4");
  assert.equal(upload.status, 200);
  assert.equal(upload.body.media.mime, "video/mp4");
  const id = upload.body.media.id;
  const fileUrl = API + "/me/runner/media/" + id + "/file";
  const part = await request(app).get(fileUrl).set(owner.auth).set("Range", "bytes=0-7");
  assert.equal(part.status, 206);
  assert.equal(part.headers["content-range"], "bytes 0-7/" + mp4.length);
  assert.equal(part.headers["content-length"], "8");
  const filename = getDb().prepare("SELECT filename FROM runner_media WHERE id = ?").get(id).filename;
  const deletion = await request(app).delete(API + "/me/races/" + raceId + "/result?distance=full").set(owner.auth);
  assert.equal(deletion.status, 200);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM runner_media WHERE id = ?").get(id).n, 1);
  assert.equal(fs.existsSync(path.join(runnerRoot(), filename)), true);
  const listing = await request(app).get(API + "/me/runner").set(owner.auth);
  assert.equal(listing.body.media[0].race.name, raceId);
  assert.equal(listing.body.media[0].race.raceDate, "2025-10-11");
  assert.equal(listing.body.media[0].distanceLabel, "全马");
  assert.equal(listing.body.media[0].id, id);
  assert.equal((await request(app).get(fileUrl).set(owner.auth)).status, 200);
  assert.equal((await request(app).get(fileUrl).set(other.auth)).status, 404);
  assert.equal((await request(app).delete(API + "/me/runner/media/" + id).set(other.auth)).status, 404);
  assert.equal((await request(app).delete(API + "/me/runner/media/" + id).set(owner.auth)).status, 200);
  assert.equal(fs.existsSync(path.join(runnerRoot(), filename)), false);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM results WHERE user_id = ? AND race_id = ? AND distance = 'half'").get(owner.id, raceId).n, 1);
});

test("oversized collection images return an actionable 413 without files or rows", async () => {
  const owner = await user("跑者上传上限");
  race("runner-size"); result(owner.id, "runner-size");
  const target = API + "/me/runner/media?raceId=runner-size&distance=full&kind=photo";
  const oversized = Buffer.alloc(8 * 1024 * 1024 + 1);
  png.copy(oversized);
  const response = await request(app).post(target).set(owner.auth).attach("file", oversized, "a.png");
  assert.equal(response.status, 413);
  assert.match(response.body.error, /8MB/);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM runner_media WHERE user_id = ?").get(owner.id).n, 0);
});

test("admin account and race deletion remove private collection files as well as metadata", async () => {
  process.env.ADMIN_TOKEN ||= "runner-cleanup-admin";
  const admin = { Authorization: "Bearer " + process.env.ADMIN_TOKEN };
  for (const action of ["account", "race"]) {
    const owner = await user("收藏后台清理" + action);
    const raceId = "runner-admin-" + action;
    race(raceId); result(owner.id, raceId);
    const uploaded = await request(app).post(API + "/me/runner/media?raceId=" + raceId + "&distance=full&kind=photo").set(owner.auth).attach("file", png, "a.png");
    assert.equal(uploaded.status, 200);
    const row = getDb().prepare("SELECT filename FROM runner_media WHERE id = ?").get(uploaded.body.media.id);
    const endpoint = action === "account" ? "/admin/users/" + owner.id : "/admin/races/" + raceId;
    const removed = await request(app).delete(API + endpoint).set(admin);
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM runner_media WHERE id = ?").get(uploaded.body.media.id).n, 0);
    assert.equal(fs.existsSync(path.join(runnerRoot(), row.filename)), false);
  }
});

test("withdrawing a same-time result-call row preserves independently recorded results and private collections", async () => {
  const owner = await user("收藏接龙保护");
  const db = getDb();
  const raceId = "runner-call-cleanup";
  race(raceId); result(owner.id, raceId);
  const now = new Date().toISOString();
  const clubId = Number(db.prepare("INSERT INTO clubs (name, code, owner_id, created_at) VALUES ('收藏测试团', 'RUNNER-TEST', ?, ?)").run(owner.id, now).lastInsertRowid);
  db.prepare("INSERT INTO club_members (club_id, user_id, joined_at) VALUES (?, ?, ?)").run(clubId, owner.id, now);
  const callId = Number(db.prepare("INSERT INTO result_calls (club_id, race_id, title, race_date, distances, deadline, created_at) VALUES (?, ?, '成绩接龙', '2025-10-11', 'full', '2099-01-01T12:00', ?)").run(clubId, raceId, now).lastInsertRowid);
  const joined = await request(app).post(API + "/clubs/" + clubId + "/calls/" + callId + "/rows").set(owner.auth).send({ distance: "full", time: "4:00:00" });
  assert.equal(joined.status, 200);
  const rowId = db.prepare("SELECT id FROM result_call_rows WHERE call_id = ? AND user_id = ?").get(callId, owner.id).id;
  const uploaded = await request(app).post(API + "/me/runner/media?raceId=" + raceId + "&distance=full&kind=photo").set(owner.auth).attach("file", png, "a.png");
  const row = db.prepare("SELECT filename FROM runner_media WHERE id = ?").get(uploaded.body.media.id);
  const removed = await request(app).delete(API + "/clubs/" + clubId + "/calls/" + callId + "/rows/" + rowId).set(owner.auth);
  assert.equal(removed.status, 200);
  assert.equal(db.prepare("SELECT seconds FROM results WHERE user_id = ? AND race_id = ?").get(owner.id, raceId).seconds, 14400);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM runner_media WHERE id = ?").get(uploaded.body.media.id).n, 1);
  assert.equal(fs.existsSync(path.join(runnerRoot(), row.filename)), true);
});

function callSetup(owner, raceId, suffix) {
  const db = getDb(), now = new Date().toISOString();
  const clubId = Number(db.prepare("INSERT INTO clubs (name, code, owner_id, created_at) VALUES ('收藏来源测试团', ?, ?, ?)").run("RUNNER-SOURCE-" + suffix, owner.id, now).lastInsertRowid);
  db.prepare("INSERT INTO club_members (club_id, user_id, joined_at) VALUES (?, ?, ?)").run(clubId, owner.id, now);
  const callId = Number(db.prepare("INSERT INTO result_calls (club_id, race_id, title, race_date, distances, deadline, created_at) VALUES (?, ?, '成绩接龙', '2025-10-11', 'full', '2099-01-01T12:00', ?)").run(clubId, raceId, now).lastInsertRowid);
  return { clubId, callId, endpoint: API + "/clubs/" + clubId + "/calls/" + callId + "/rows" };
}

test("call provenance protects personal edits and other calls while detached collections remain accessible", async () => {
  const owner = await user("接龙来源团长"), member = await user("接龙来源成员");
  const db = getDb(), raceId = "runner-call-source";
  race(raceId);
  const first = callSetup(owner, raceId, "first");
  db.prepare("INSERT INTO club_members (club_id, user_id, joined_at) VALUES (?, ?, ?)").run(first.clubId, member.id, new Date().toISOString());
  assert.equal((await request(app).post(first.endpoint).set(member.auth).send({ distance: "full", time: "3:30:00" })).status, 200);
  const firstRow = db.prepare("SELECT id FROM result_call_rows WHERE call_id = ? AND user_id = ?").get(first.callId, member.id);
  assert.equal(db.prepare("SELECT source_call_id FROM results WHERE user_id = ? AND race_id = ?").get(member.id, raceId).source_call_id, first.callId);
  const second = callSetup(owner, raceId, "second");
  db.prepare("INSERT INTO club_members (club_id, user_id, joined_at) VALUES (?, ?, ?)").run(second.clubId, member.id, new Date().toISOString());
  assert.equal((await request(app).post(second.endpoint).set(member.auth).send({ distance: "full", time: "3:20:00" })).status, 200);
  assert.equal(db.prepare("SELECT seconds FROM results WHERE user_id = ? AND race_id = ?").get(member.id, raceId).seconds, 12600);
  const photo = await request(app).post(API + "/me/runner/media?raceId=" + raceId + "&distance=full&kind=certificate").set(member.auth).attach("file", png, "a.png");
  const video = await request(app).post(API + "/me/runner/media?raceId=" + raceId + "&distance=full&kind=video").set(member.auth).attach("file", mp4, "a.mp4");
  assert.equal(photo.status, 200); assert.equal(video.status, 200);
  assert.equal((await request(app).delete(first.endpoint + "/" + firstRow.id).set(owner.auth)).status, 200);
  const fallback = db.prepare("SELECT seconds, source_call_id FROM results WHERE user_id = ? AND race_id = ?").get(member.id, raceId);
  assert.equal(fallback.seconds, 12000); assert.equal(fallback.source_call_id, second.callId);
  const secondRow = db.prepare("SELECT id FROM result_call_rows WHERE call_id = ? AND user_id = ?").get(second.callId, member.id);
  assert.equal((await request(app).delete(second.endpoint + "/" + secondRow.id).set(owner.auth)).status, 200);
  assert.equal(db.prepare("SELECT 1 FROM results WHERE user_id = ? AND race_id = ?").get(member.id, raceId), undefined);
  const detached = await request(app).get(API + "/me/runner").set(member.auth);
  assert.equal(detached.body.results.length, 0); assert.equal(detached.body.media.length, 2);
  for (const media of detached.body.media) {
    const url = API + "/me/runner/media/" + media.id;
    assert.equal((await request(app).get(url + "/file").set(owner.auth)).status, 404);
    assert.equal((await request(app).get(url + "/file").set(member.auth)).status, 200);
    assert.equal((await request(app).delete(url).set(member.auth)).status, 200);
  }
  // Saving even the same time explicitly in the personal editor detaches it.
  assert.equal((await request(app).post(first.endpoint).set(member.auth).send({ distance: "full", time: "3:30:00" })).status, 200);
  assert.equal((await request(app).put(API + "/me/races/" + raceId + "/result").set(member.auth).send({ distance: "full", time: "3:30:00", story: "自己的完赛记录" })).status, 200);
  const latestRow = db.prepare("SELECT id FROM result_call_rows WHERE call_id = ? AND user_id = ?").get(first.callId, member.id);
  assert.equal((await request(app).post(first.endpoint).set(owner.auth).send({ userId: member.id, distance: "full", time: "3:10:00" })).status, 200);
  assert.equal(db.prepare("SELECT seconds FROM results WHERE user_id = ? AND race_id = ?").get(member.id, raceId).seconds, 12600);
  assert.equal((await request(app).delete(first.endpoint + "/" + latestRow.id).set(owner.auth)).status, 200);
  const preserved = db.prepare("SELECT seconds, source_call_id, story FROM results WHERE user_id = ? AND race_id = ?").get(member.id, raceId);
  assert.equal(preserved.seconds, 12600); assert.equal(preserved.source_call_id, 0); assert.equal(preserved.story, "自己的完赛记录");
});

test("async collection disk writes hold no SQLite transaction and recheck deleted results before commit", async () => {
  const owner = await user("异步收藏删除竞态"), db = getDb(), raceId = "runner-upload-race";
  race(raceId); result(owner.id, raceId);
  const original = fs.promises.writeFile;
  let release, entered, pending;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  let diskPath;
  fs.promises.writeFile = async function (filename, ...args) {
    assert.equal(db.inTransaction, false, "file I/O must not hold the database write lock");
    diskPath = filename; entered(); await gate;
    return original.call(this, filename, ...args);
  };
  try {
    pending = request(app).post(API + "/me/runner/media?raceId=" + raceId + "&distance=full&kind=video").set(owner.auth).attach("file", mp4, "a.mp4").then((response) => response);
    await started;
    assert.equal((await request(app).delete(API + "/me/races/" + raceId + "/result?distance=full").set(owner.auth)).status, 200);
    release();
    const response = await pending;
    assert.equal(response.status, 400); assert.match(response.body.error, /成绩已删除/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM runner_media WHERE user_id = ?").get(owner.id).n, 0);
    assert.equal(fs.existsSync(diskPath), false);
  } finally { release(); fs.promises.writeFile = original; if (pending) await pending; }
});

test("simultaneous collection uploads recheck quota in a short transaction and clean the rejected file", async () => {
  const owner = await user("收藏容量并发"), db = getDb(), raceId = "runner-quota-race";
  race(raceId); result(owner.id, raceId);
  db.prepare("INSERT INTO runner_media (user_id, race_id, distance, kind, filename, mime, size, created_at) VALUES (?, ?, 'full', 'photo', 'quota-existing.png', 'image/png', ?, ?)").run(owner.id, raceId, 512 * 1024 * 1024 - png.length, new Date().toISOString());
  const original = fs.promises.writeFile;
  let release, bothEntered, count = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { bothEntered = resolve; });
  const diskPaths = [];
  fs.promises.writeFile = async function (filename, ...args) {
    assert.equal(db.inTransaction, false); diskPaths.push(filename);
    if (++count === 2) bothEntered(); await gate;
    return original.call(this, filename, ...args);
  };
  let uploads;
  try {
    uploads = [1, 2].map(() => request(app).post(API + "/me/runner/media?raceId=" + raceId + "&distance=full&kind=photo").set(owner.auth).attach("file", png, "a.png").then((response) => response));
    await started; release();
    const responses = await Promise.all(uploads);
    assert.deepEqual(responses.map((item) => item.status).sort(), [200, 400]);
    assert.match(responses.find((item) => item.status === 400).body.error, /空间已满/);
    assert.equal(diskPaths.filter((filename) => fs.existsSync(filename)).length, 1);
    assert.equal(db.prepare("SELECT SUM(size) AS n FROM runner_media WHERE user_id = ?").get(owner.id).n, 512 * 1024 * 1024);
  } finally { release(); fs.promises.writeFile = original; if (uploads) await Promise.all(uploads); }
});

test("collection insert rollback cleans its already-written file and leaves quota unchanged", async () => {
  const owner = await user("收藏保存回滚"), db = getDb(), raceId = "runner-upload-rollback";
  race(raceId); result(owner.id, raceId);
  db.exec(`CREATE TEMP TRIGGER fail_runner_media BEFORE INSERT ON runner_media WHEN NEW.user_id = ${owner.id} BEGIN SELECT RAISE(ABORT, 'forced save failure'); END`);
  const before = fs.readdirSync(runnerRoot()).sort();
  try {
    const response = await request(app).post(API + "/me/runner/media?raceId=" + raceId + "&distance=full&kind=photo").set(owner.auth).attach("file", png, "a.png");
    assert.equal(response.status, 500);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM runner_media WHERE user_id = ?").get(owner.id).n, 0);
    assert.deepEqual(fs.readdirSync(runnerRoot()).sort(), before);
  } finally { db.exec("DROP TRIGGER fail_runner_media"); }
});
