const { botGate, httpsUrl } = require("./bot-races");
const { likeParams } = require("./search-like");

function cstDay(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function clip(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max + 1);
}

function limited(value, max, label) {
  const text = clip(value, max);
  if (text.length > max) return { error: label + "不超过 " + max + " 个字" };
  return { text };
}

function day(value) {
  const text = clip(value, 10);
  if (!text) return { text: "" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { error: "日期须为 2026-10-28 这种格式" };
  return { text };
}

function parseItem(body, { requireDate, now }) {
  const title = limited(body.title, 80, "标题");
  if (title.error) return title;
  if (!title.text) return { error: "标题要写" };
  const summary = limited(body.summary, 400, "摘要");
  if (summary.error) return summary;
  if (!summary.text) return { error: "摘要要写几句" };
  const source = limited(body.source, 40, "来源");
  if (source.error) return source;
  if (!source.text) return { error: "来源要写" };
  const url = httpsUrl(body.url);
  if (url.error) return url;
  if (!url.text) return { error: "链接要以 https:// 开头" };
  const published = day(body.publishedAt);
  if (published.error) return published;
  if (!published.text) {
    if (requireDate) return { error: "发布时间要写" };
    return { title: title.text, summary: summary.text, source: source.text, url: url.text, publishedAt: cstDay(now) };
  }
  return { title: title.text, summary: summary.text, source: source.text, url: url.text, publishedAt: published.text };
}

function resolveRace(db, body) {
  const raceId = String((body && body.raceId) || "").trim();
  const officialId = String((body && body.officialId) || "").trim();
  if (!raceId && !officialId) return { error: "先选一场比赛", status: 400 };
  if (raceId) {
    const race = db.prepare("SELECT id, name, race_date, city FROM races WHERE id = ?").get(raceId);
    if (!race) return { error: "赛历里没有这场", status: 404 };
    return { race };
  }
  const byCode = db.prepare("SELECT id, name, race_date, city FROM races WHERE id = ?").get("caa-" + officialId);
  if (byCode) return { race: byCode };
  const linked = db.prepare("SELECT race_id FROM official_races WHERE official_id = ? AND race_id != ''").get(officialId);
  if (!linked) return { error: "赛历里没有这场", status: 404 };
  const race = db.prepare("SELECT id, name, race_date, city FROM races WHERE id = ?").get(linked.race_id);
  if (!race) return { error: "赛历里没有这场", status: 404 };
  return { race };
}

function present(row, extra) {
  return {
    id: row.id,
    raceId: row.race_id,
    raceName: row.race_name,
    raceDate: row.race_date,
    city: row.city,
    title: row.title,
    summary: row.summary,
    source: row.source,
    url: row.url,
    publishedAt: row.published_at,
    ...extra
  };
}

function linesOf(row) {
  return ["赛事 " + row.race_name, "来源 " + row.source, "原文 " + row.url, row.summary];
}

function sameText(row, item) {
  return row.title === item.title && row.summary === item.summary && row.source === item.source && row.published_at === item.publishedAt && row.url === item.url;
}

function writePublished(db, existingId, raceId, item, stamp) {
  try {
    if (existingId) {
      db.prepare(
        "UPDATE news SET race_id = ?, title = ?, summary = ?, source = ?, url = ?, published_at = ?, updated_at = ? WHERE id = ?"
      ).run(raceId, item.title, item.summary, item.source, item.url, item.publishedAt, stamp, existingId);
      return { id: existingId };
    }
    const inserted = db
      .prepare(
        "INSERT INTO news (race_id, title, summary, source, url, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(raceId, item.title, item.summary, item.source, item.url, item.publishedAt, stamp, stamp);
    return { id: Number(inserted.lastInsertRowid) };
  } catch (err) {
    if (/UNIQUE constraint failed/.test(String(err && err.message))) return { error: "这场已经有这条链接", status: 400 };
    throw err;
  }
}

function loadPublished(db, id) {
  return db
    .prepare(
      `SELECT n.*, r.name AS race_name, r.race_date, r.city
       FROM news n JOIN races r ON r.id = n.race_id
       WHERE n.id = ?`
    )
    .get(id);
}

function createNews(db, body) {
  const item = parseItem(body || {}, { requireDate: true, now: new Date() });
  if (item.error) return { error: item.error, status: 400 };
  const found = resolveRace(db, body || {});
  if (found.error) return found;
  const stamp = new Date().toISOString();
  const written = writePublished(db, 0, found.race.id, item, stamp);
  if (written.error) return written;
  return { news: present(loadPublished(db, written.id), { status: "published", note: "" }) };
}

function updateNews(db, id, body) {
  const current = db.prepare("SELECT id FROM news WHERE id = ?").get(id);
  if (!current) return { error: "没有这条资讯", status: 404 };
  const item = parseItem(body || {}, { requireDate: true, now: new Date() });
  if (item.error) return { error: item.error, status: 400 };
  const found = resolveRace(db, body || {});
  if (found.error) return found;
  const written = writePublished(db, current.id, found.race.id, item, new Date().toISOString());
  if (written.error) return written;
  return { news: present(loadPublished(db, written.id), { status: "published", note: "" }) };
}

function removeNews(db, id) {
  const row = db.prepare("SELECT id, race_id, url FROM news WHERE id = ?").get(id);
  if (!row) return { error: "没有这条资讯", status: 404 };
  db.transaction(() => {
    db.prepare("DELETE FROM news_submissions WHERE news_id = ? OR (race_id = ? AND url = ?)").run(row.id, row.race_id, row.url);
    db.prepare("DELETE FROM news WHERE id = ?").run(row.id);
  })();
  return { ok: true };
}

function pendingCount(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM news_submissions WHERE status = 'pending'").get().n;
}

function listAdmin(db, status, q) {
  const count = pendingCount(db);
  const wanted = status === "pending" || status === "returned" ? status : "published";
  const text = String(q || "").trim();
  if (wanted === "published") {
    const filter = text ? likeParams(text, ["n.title", "r.name", "r.city"]) : null;
    const rows = db
      .prepare(
        `SELECT n.*, r.name AS race_name, r.race_date, r.city
         FROM news n JOIN races r ON r.id = n.race_id
         ${filter ? "WHERE " + filter.sql : ""}
         ORDER BY n.published_at DESC, n.id DESC
         LIMIT 200`
      )
      .all(...(filter ? filter.params : []));
    return { rows: rows.map((row) => present(row, { status: "published", note: "" })), pendingCount: count };
  }
  const filter = text ? likeParams(text, ["s.title", "r.name", "r.city"]) : null;
  const rows = db
    .prepare(
      `SELECT s.*, r.name AS race_name, r.race_date, r.city
       FROM news_submissions s JOIN races r ON r.id = s.race_id
       WHERE s.status = ? ${filter ? "AND (" + filter.sql + ")" : ""}
       ORDER BY s.published_at DESC, s.id DESC
       LIMIT 200`
    )
    .all(wanted, ...(filter ? filter.params : []));
  return {
    rows: rows.map((row) => present(row, { status: row.status, note: row.note || "", lines: linesOf(row) })),
    pendingCount: count
  };
}

function listPublic(db, raceId) {
  if (raceId) {
    const race = db.prepare("SELECT id FROM races WHERE id = ?").get(raceId);
    if (!race) return { error: "没有这场比赛", status: 404 };
  }
  const rows = db
    .prepare(
      `SELECT n.*, r.name AS race_name, r.race_date, r.city
       FROM news n JOIN races r ON r.id = n.race_id
       ${raceId ? "WHERE n.race_id = ?" : ""}
       ORDER BY n.published_at DESC, n.id DESC
       LIMIT 200`
    )
    .all(...(raceId ? [raceId] : []));
  return { news: rows.map((row) => present(row)) };
}

function getPublic(db, id) {
  const row = loadPublished(db, id);
  if (!row) return { error: "没有这条资讯", status: 404 };
  return { news: present(row) };
}

function acceptNews(db, body, now = new Date()) {
  const list = Array.isArray(body && body.news) ? body.news : body && (body.title || body.url || body.raceId || body.officialId) ? [body] : null;
  if (!list || !list.length) return { error: "请带上资讯", status: 400 };
  if (list.length > 40) return { error: "一次最多 40 条", status: 400 };
  const accepted = [];
  const errors = [];
  const seen = new Set();
  const stamp = now.toISOString();
  const prepared = [];
  for (const item of list) {
    const parsed = parseItem(item || {}, { requireDate: false, now });
    if (parsed.error) {
      errors.push({ url: String((item && item.url) || ""), error: parsed.error });
      continue;
    }
    const found = resolveRace(db, item || {});
    if (found.error) {
      errors.push({ url: parsed.url, error: found.error });
      continue;
    }
    const key = found.race.id + "\n" + parsed.url;
    if (seen.has(key)) {
      errors.push({ url: parsed.url, error: "同一批里链接重复" });
      continue;
    }
    seen.add(key);
    prepared.push({ race: found.race, item: parsed });
  }
  const save = db.transaction(() => {
    for (const entry of prepared) {
      const published = db.prepare("SELECT * FROM news WHERE race_id = ? AND url = ?").get(entry.race.id, entry.item.url);
      const open = db
        .prepare("SELECT id FROM news_submissions WHERE race_id = ? AND url = ? AND status IN ('pending', 'returned') ORDER BY id DESC LIMIT 1")
        .get(entry.race.id, entry.item.url);
      if (published && sameText(published, entry.item)) {
        if (open) {
          db.prepare(
            "UPDATE news_submissions SET title = ?, summary = ?, source = ?, published_at = ?, status = 'published', note = '', news_id = ?, updated_at = ? WHERE id = ?"
          ).run(entry.item.title, entry.item.summary, entry.item.source, entry.item.publishedAt, published.id, stamp, open.id);
        }
        accepted.push({ id: published.id, raceId: entry.race.id, title: entry.item.title, status: "published" });
        continue;
      }
      const newsId = published ? published.id : 0;
      let id = open && open.id;
      if (open) {
        db.prepare(
          "UPDATE news_submissions SET title = ?, summary = ?, source = ?, published_at = ?, status = 'pending', note = '', news_id = ?, updated_at = ? WHERE id = ?"
        ).run(entry.item.title, entry.item.summary, entry.item.source, entry.item.publishedAt, newsId, stamp, open.id);
      } else {
        const inserted = db
          .prepare(
            `INSERT INTO news_submissions (race_id, title, summary, source, url, published_at, status, note, news_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'pending', '', ?, ?, ?)`
          )
          .run(entry.race.id, entry.item.title, entry.item.summary, entry.item.source, entry.item.url, entry.item.publishedAt, newsId, stamp, stamp);
        id = Number(inserted.lastInsertRowid);
      }
      accepted.push({ id, raceId: entry.race.id, title: entry.item.title, status: "pending" });
    }
  });
  save();
  return { accepted, errors };
}

function listForBot(db) {
  const rows = db
    .prepare(
      `SELECT s.*, r.name AS race_name, r.race_date, r.city
       FROM news_submissions s JOIN races r ON r.id = s.race_id
       WHERE s.status IN ('pending', 'returned')
       ORDER BY s.id DESC`
    )
    .all();
  const presentRow = (row) => present(row, { status: row.status, note: row.note || "" });
  return {
    pending: rows.filter((row) => row.status === "pending").map(presentRow),
    returned: rows.filter((row) => row.status === "returned").map(presentRow)
  };
}

function publishSubmission(db, id) {
  const row = db.prepare("SELECT * FROM news_submissions WHERE id = ?").get(id);
  if (!row) return { error: "没有这条待审", status: 404 };
  if (row.status !== "pending") return { error: "这条不在待审里", status: 400 };
  const race = db.prepare("SELECT id FROM races WHERE id = ?").get(row.race_id);
  if (!race) return { error: "赛历里没有这场", status: 404 };
  const item = { title: row.title, summary: row.summary, source: row.source, url: row.url, publishedAt: row.published_at };
  const linked = row.news_id ? db.prepare("SELECT id FROM news WHERE id = ?").get(row.news_id) : null;
  const byUrl = db.prepare("SELECT id FROM news WHERE race_id = ? AND url = ?").get(row.race_id, row.url);
  const existingId = (linked && linked.id) || (byUrl && byUrl.id) || 0;
  const stamp = new Date().toISOString();
  let newsId = 0;
  try {
    db.transaction(() => {
      const written = writePublished(db, existingId, row.race_id, item, stamp);
      if (written.error) {
        const err = new Error(written.error);
        err.status = written.status;
        err.expose = true;
        throw err;
      }
      newsId = written.id;
      db.prepare("UPDATE news_submissions SET status = 'published', news_id = ?, note = '', updated_at = ? WHERE id = ?").run(newsId, stamp, row.id);
    })();
  } catch (err) {
    if (err.expose) return { error: err.message, status: err.status };
    throw err;
  }
  return { ok: true, id: newsId };
}

function returnSubmission(db, id, note) {
  const text = String(note || "").trim();
  if (!text) return { error: "打回要写原因", status: 400 };
  if (text.length > 200) return { error: "原因不超过 200 个字", status: 400 };
  const row = db.prepare("SELECT * FROM news_submissions WHERE id = ?").get(id);
  if (!row) return { error: "没有这条待审", status: 404 };
  if (row.status !== "pending") return { error: "这条不在待审里", status: 400 };
  db.prepare("UPDATE news_submissions SET status = 'returned', note = ?, updated_at = ? WHERE id = ?").run(text, new Date().toISOString(), row.id);
  return { ok: true };
}

function mountNews(app, { BASE, getDb, requireAdmin }) {
  app.get(BASE + "/api/news", (req, res) => {
    res.json(listPublic(getDb(), ""));
  });

  app.get(BASE + "/api/news/:id", (req, res) => {
    const result = getPublic(getDb(), req.params.id);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });

  app.get(BASE + "/api/races/:id/news", (req, res) => {
    const result = listPublic(getDb(), req.params.id);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });

  app.get(BASE + "/api/admin/news", (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(listAdmin(getDb(), String(req.query.status || "published"), req.query.q));
  });

  app.post(BASE + "/api/admin/news", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const result = createNews(getDb(), req.body || {});
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });

  app.put(BASE + "/api/admin/news/:id", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const result = updateNews(getDb(), req.params.id, req.body || {});
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });

  app.delete(BASE + "/api/admin/news/:id", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const result = removeNews(getDb(), req.params.id);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });

  app.post(BASE + "/api/admin/news-submissions/:id/publish", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const result = publishSubmission(getDb(), req.params.id);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });

  app.post(BASE + "/api/admin/news-submissions/:id/return", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const result = returnSubmission(getDb(), req.params.id, req.body && req.body.note);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });

  app.post(BASE + "/api/bot/news", (req, res) => {
    const denied = botGate(req);
    if (denied) return res.status(denied.status).json({ error: denied.error });
    const result = acceptNews(getDb(), req.body || {});
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });

  app.get(BASE + "/api/bot/news", (req, res) => {
    const denied = botGate(req);
    if (denied) return res.status(denied.status).json({ error: denied.error });
    res.json(listForBot(getDb()));
  });
}

module.exports = { mountNews };
