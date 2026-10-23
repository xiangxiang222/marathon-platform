const test = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { app } = require("../src/index");
const { getDb } = require("../src/db");

const admin = { Authorization: "Bearer test-admin" };
const bot = { Authorization: "Bearer test-bot-news" };

function item(extra) {
  return {
    raceId: extra.raceId,
    officialId: extra.officialId,
    title: extra.title || "组委会公布比赛日交通",
    summary: extra.summary || "比赛日早晨封路，选手从指定路口进场。",
    source: extra.source || "组委会",
    url: extra.url || "https://example.com/news/traffic",
    publishedAt: extra.publishedAt || "2026-10-22"
  };
}

async function makeRace() {
  const created = await request(app).post("/marathon/api/admin/races").set(admin).send({
    name: "资讯接口马拉松",
    raceDate: "2026-12-20",
    city: "杭州",
    province: "浙江",
    distances: ["full"]
  });
  assert.equal(created.status, 200);
  return created.body.id;
}

test("news stays on its race and off the public list until it is passed", async () => {
  process.env.ADMIN_TOKEN = "test-admin";
  process.env.GROK_BOT_TOKEN = "test-bot-news";
  const raceId = await makeRace();
  const db = getDb();
  db.prepare(
    "INSERT INTO official_races (official_id, name, race_date, seen_at, status, race_id) VALUES (?, ?, ?, ?, 'published', ?)"
  ).run("news-oid", "资讯接口马拉松", "2026-12-20", new Date().toISOString(), raceId);
  db.prepare("INSERT INTO races (id, name, city, province, distances, race_date, deadline, place) VALUES (?, ?, ?, ?, ?, ?, '', ?)").run(
    "caa-4242",
    "编号资讯马拉松",
    "杭州",
    "浙江",
    "full",
    "2026-12-21",
    "杭州"
  );
  try {
    const denied = await request(app).post("/marathon/api/bot/news").send(item({ raceId }));
    assert.equal(denied.status, 401);
    assert.equal(denied.body.error, "口令不对");

    const bad = await request(app).post("/marathon/api/admin/news").set(admin).send(item({ raceId, url: "http://example.com/a" }));
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, "链接要以 https:// 开头");
    const script = await request(app).post("/marathon/api/admin/news").set(admin).send(item({ raceId, url: "javascript:alert(1)" }));
    assert.equal(script.status, 400);

    const created = await request(app).post("/marathon/api/admin/news").set(admin).send(item({ raceId }));
    assert.equal(created.status, 200);
    assert.equal(created.body.news.raceId, raceId);
    assert.equal(created.body.news.title, "组委会公布比赛日交通");

    const again = await request(app).post("/marathon/api/admin/news").set(admin).send(item({ raceId }));
    assert.equal(again.status, 400);
    assert.equal(again.body.error, "这场已经有这条链接");

    const listed = await request(app).get("/marathon/api/news");
    assert.equal(listed.status, 200);
    assert.ok(listed.body.news.some((row) => row.id === created.body.news.id && row.raceName === "资讯接口马拉松"));
    const onRace = await request(app).get("/marathon/api/races/" + raceId + "/news");
    assert.equal(onRace.body.news.length, 1);
    const desk = await request(app).get("/marathon/api/admin/races/" + raceId + "/news").set(admin);
    assert.equal(desk.status, 200);
    assert.equal(desk.body.news.length, 1);
    assert.equal(desk.body.news[0].title, "组委会公布比赛日交通");
    assert.equal(desk.body.waiting.length, 0);
    const other = await request(app).get("/marathon/api/admin/races/caa-4242/news").set(admin);
    assert.equal(other.body.news.length, 0);
    assert.equal(other.body.waiting.length, 0);
    const missingDesk = await request(app).get("/marathon/api/admin/races/missing-news/news").set(admin);
    assert.equal(missingDesk.status, 404);
    const stranger = await request(app).get("/marathon/api/admin/races/" + raceId + "/news").set("Authorization", "Bearer nope");
    assert.equal(stranger.status, 401);
    const one = await request(app).get("/marathon/api/news/" + created.body.news.id);
    assert.equal(one.body.news.summary, "比赛日早晨封路，选手从指定路口进场。");
    const missingRace = await request(app).get("/marathon/api/races/missing-news/news");
    assert.equal(missingRace.status, 404);

    const queued = await request(app)
      .post("/marathon/api/bot/news")
      .set(bot)
      .send({ news: [item({ raceId, url: "https://example.com/news/live", title: "直播平台定了", summary: "比赛日上午在指定平台直播。" })] });
    assert.equal(queued.status, 200);
    assert.equal(queued.body.accepted[0].status, "pending");
    const hidden = await request(app).get("/marathon/api/races/" + raceId + "/news");
    assert.equal(hidden.body.news.length, 1);
    const waitingDesk = await request(app).get("/marathon/api/admin/races/" + raceId + "/news").set(admin);
    assert.equal(waitingDesk.body.news.length, 1);
    assert.equal(waitingDesk.body.waiting.length, 1);
    assert.equal(waitingDesk.body.waiting[0].title, "直播平台定了");
    assert.equal(waitingDesk.body.waiting[0].status, "pending");

    const pending = await request(app).get("/marathon/api/admin/news?status=pending").set(admin);
    assert.equal(pending.body.pendingCount, 1);
    assert.equal(pending.body.rows[0].title, "直播平台定了");
    const noNote = await request(app).post("/marathon/api/admin/news-submissions/" + pending.body.rows[0].id + "/return").set(admin).send({});
    assert.equal(noNote.status, 400);
    assert.equal(noNote.body.error, "打回要写原因");
    const returned = await request(app)
      .post("/marathon/api/admin/news-submissions/" + pending.body.rows[0].id + "/return")
      .set(admin)
      .send({ note: "补上来源里的发布时间" });
    assert.equal(returned.status, 200);

    const resend = await request(app).post("/marathon/api/bot/news").set(bot).send(item({
      raceId,
      url: "https://example.com/news/live",
      title: "直播平台改到上午",
      summary: "直播改到比赛日上午八点。"
    }));
    assert.equal(resend.status, 200);
    assert.equal(resend.body.accepted[0].id, pending.body.rows[0].id);
    assert.equal(resend.body.accepted[0].status, "pending");
    const botList = await request(app).get("/marathon/api/bot/news").set(bot);
    assert.equal(botList.body.pending.length, 1);
    assert.equal(botList.body.returned.length, 0);

    const passed = await request(app).post("/marathon/api/admin/news-submissions/" + pending.body.rows[0].id + "/publish").set(admin).send({});
    assert.equal(passed.status, 200);
    const shown = await request(app).get("/marathon/api/races/" + raceId + "/news");
    assert.equal(shown.body.news.length, 2);
    assert.equal(shown.body.news[0].title, "直播平台改到上午");

    const same = await request(app).post("/marathon/api/bot/news").set(bot).send(item({
      raceId,
      url: "https://example.com/news/live",
      title: "直播平台改到上午",
      summary: "直播改到比赛日上午八点。",
      publishedAt: "2026-10-22"
    }));
    assert.equal(same.body.accepted[0].status, "published");
    const still = await request(app).get("/marathon/api/admin/news?status=pending").set(admin);
    assert.equal(still.body.pendingCount, 0);

    const changed = await request(app).post("/marathon/api/bot/news").set(bot).send(item({
      officialId: "news-oid",
      url: "https://example.com/news/live",
      title: "直播平台再改到九点",
      summary: "直播改到比赛日上午九点。"
    }));
    assert.equal(changed.body.accepted[0].status, "pending");
    const publicStill = await request(app).get("/marathon/api/races/" + raceId + "/news");
    assert.equal(publicStill.body.news.find((row) => row.url === "https://example.com/news/live").title, "直播平台改到上午");
    await request(app).post("/marathon/api/admin/news-submissions/" + changed.body.accepted[0].id + "/publish").set(admin).send({});
    const replaced = await request(app).get("/marathon/api/races/" + raceId + "/news");
    assert.equal(replaced.body.news.filter((row) => row.url === "https://example.com/news/live").length, 1);
    assert.equal(replaced.body.news.find((row) => row.url === "https://example.com/news/live").title, "直播平台再改到九点");

    const byCode = await request(app).post("/marathon/api/bot/news").set(bot).send(item({
      officialId: "4242",
      url: "https://example.com/news/code",
      title: "编号这场的资讯",
      summary: "按官网编号对上这场。"
    }));
    assert.equal(byCode.body.accepted[0].raceId, "caa-4242");
    assert.equal(byCode.body.accepted[0].status, "pending");

    const found = await request(app).get("/marathon/api/admin/news?q=" + encodeURIComponent("交通")).set(admin);
    assert.ok(found.body.rows.some((row) => row.id === created.body.news.id));

    const removed = await request(app).delete("/marathon/api/admin/news/" + created.body.news.id).set(admin);
    assert.equal(removed.status, 200);
    const gone = await request(app).get("/marathon/api/news/" + created.body.news.id);
    assert.equal(gone.status, 404);
  } finally {
    await request(app).delete("/marathon/api/admin/races/" + raceId).set(admin);
    db.prepare("DELETE FROM news WHERE race_id = ?").run("caa-4242");
    db.prepare("DELETE FROM news_submissions WHERE race_id = ?").run("caa-4242");
    db.prepare("DELETE FROM races WHERE id = ?").run("caa-4242");
    db.prepare("DELETE FROM official_races WHERE official_id = ?").run("news-oid");
  }
});
