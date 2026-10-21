function chars(value) {
  return [...String(value || "")].length;
}

function intIn(value, min, max) {
  if (typeof value === "string") {
    if (!/^\d+$/.test(value.trim())) return null;
    value = Number(value);
  }
  if (typeof value === "boolean" || value == null || !Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

function rateText(applicants, quota) {
  const rounded = Math.round((quota / applicants) * 1000) / 10;
  return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)) + "%";
}

function ratesOf(db, raceId) {
  return db
    .prepare("SELECT id, label, applicants, quota, source FROM draw_rates WHERE race_id = ? ORDER BY label DESC, id DESC")
    .all(raceId)
    .map((row) => ({
      id: row.id,
      label: row.label,
      applicants: row.applicants,
      quota: row.quota,
      rateText: rateText(row.applicants, row.quota),
      source: row.source
    }));
}

function mountDraws(app, { BASE, getDb, requireAdmin }) {
  app.get(BASE + "/api/races/:id/draws", (req, res) => {
    const race = getDb().prepare("SELECT id FROM races WHERE id = ?").get(req.params.id);
    if (!race) return res.status(404).json({ error: "没有这场比赛" });
    res.json({ rates: ratesOf(getDb(), race.id) });
  });

  app.get(BASE + "/api/admin/races/:id/draws", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const race = getDb().prepare("SELECT id FROM races WHERE id = ?").get(req.params.id);
    if (!race) return res.status(404).json({ error: "没有这场比赛" });
    res.json({ rates: ratesOf(getDb(), race.id) });
  });

  app.post(BASE + "/api/admin/races/:id/draws", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const race = db.prepare("SELECT id FROM races WHERE id = ?").get(req.params.id);
    if (!race) return res.status(404).json({ error: "没有这场比赛" });
    const body = req.body || {};
    const label = String(body.label || "").trim();
    if (chars(label) < 1 || chars(label) > 20) return res.status(400).json({ error: "届次写成 1 到 20 个字" });
    const applicants = intIn(body.applicants, 1, 9999999);
    if (applicants == null) return res.status(400).json({ error: "报名人数写成 1 到 9999999 的整数" });
    const quota = intIn(body.quota, 1, 9999999);
    if (quota == null) return res.status(400).json({ error: "名额写成 1 到 9999999 的整数" });
    if (quota > applicants) return res.status(400).json({ error: "名额不能多于报名人数" });
    const source = String(body.source || "").trim();
    if (chars(source) < 1 || chars(source) > 80) return res.status(400).json({ error: "来源写成 1 到 80 个字" });
    const count = db.prepare("SELECT COUNT(*) AS n FROM draw_rates WHERE race_id = ?").get(race.id).n;
    if (count >= 20) return res.status(400).json({ error: "一场最多记 20 届" });
    const same = db.prepare("SELECT id FROM draw_rates WHERE race_id = ? AND label = ?").get(race.id, label);
    if (same) return res.status(400).json({ error: "这一届已经记过" });
    const created = db
      .prepare("INSERT INTO draw_rates (race_id, label, applicants, quota, source) VALUES (?, ?, ?, ?, ?)")
      .run(race.id, label, applicants, quota, source);
    res.json({ id: Number(created.lastInsertRowid), rates: ratesOf(db, race.id) });
  });

  app.delete(BASE + "/api/admin/races/:id/draws/:did", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const row = db.prepare("SELECT id FROM draw_rates WHERE id = ? AND race_id = ?").get(req.params.did, req.params.id);
    if (!row) return res.status(404).json({ error: "没有这条中签记录" });
    db.prepare("DELETE FROM draw_rates WHERE id = ?").run(row.id);
    res.json({ ok: true, rates: ratesOf(db, req.params.id) });
  });
}

module.exports = { mountDraws, ratesOf };
