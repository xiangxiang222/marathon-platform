const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const { getDb } = require("./db");
const { presentRace, summarizeMarks, cardTitle, shareText } = require("./races");

function loadEnv() {
  const file = path.join(__dirname, "../../.env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] == null) process.env[match[1]] = match[2];
  }
}

loadEnv();

const BASE = process.env.BASE_PATH || "/marathon";
const STATUSES = ["想跑", "已报名", "待抽签", "中签", "未中签", "已缴费"];
const COMPANY = "北京华创科技有限公司";
const ICP = "京ICP备2026060284号-2";

const app = express();
app.use(express.json());

function userFrom(req) {
  const header = req.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token || token === header) return null;
  return getDb().prepare("SELECT id, nickname FROM users WHERE token = ?").get(token) || null;
}

function marksOf(clubId, raceId) {
  return getDb()
    .prepare(
      `SELECT u.nickname, p.status FROM plans p
       JOIN users u ON u.id = p.user_id
       JOIN club_members m ON m.user_id = u.id AND m.club_id = ?
       WHERE p.race_id = ?
       ORDER BY p.updated_at DESC`
    )
    .all(clubId, raceId);
}

function packCard(race, club, marks) {
  const counts = {};
  for (const status of STATUSES) counts[status] = 0;
  for (const mark of marks) counts[mark.status] += 1;
  const card = {
    club: club ? { id: club.id, name: club.name, code: club.code } : null,
    title: cardTitle(race),
    summary: summarizeMarks(counts),
    counts,
    marks,
    unpaid: marks.filter((mark) => mark.status === "中签").map((mark) => ({ nickname: mark.nickname }))
  };
  card.text = shareText(card);
  return card;
}

function requireUser(req, res) {
  const user = userFrom(req);
  if (!user) {
    res.status(401).json({ error: "先起个昵称" });
    return null;
  }
  return user;
}

app.get(BASE + "/api/meta", (_req, res) => {
  res.json({ company: COMPANY, icp: ICP, product: "赛历" });
});

app.get(BASE + "/api/races", (req, res) => {
  const now = new Date();
  let rows = getDb().prepare("SELECT * FROM races ORDER BY race_date, id").all().map((row) => presentRace(row, now));
  const q = String(req.query.q || "").trim();
  const city = String(req.query.city || "").trim();
  const month = String(req.query.month || "").trim();
  const distance = String(req.query.distance || "").trim();
  const status = String(req.query.status || "open");
  const kind = String(req.query.kind || "").trim();
  if (q) rows = rows.filter((r) => r.name.includes(q) || r.city.includes(q) || r.place.includes(q));
  if (city) rows = rows.filter((r) => r.city === city || r.province === city);
  if (month) rows = rows.filter((r) => r.raceDate.slice(0, 7) === month);
  if (distance) rows = rows.filter((r) => r.distances.includes(distance));
  if (kind) rows = rows.filter((r) => r.kind === kind);
  if (status === "open") rows = rows.filter((r) => r.regStatus === "报名中");
  if (status === "wait") rows = rows.filter((r) => r.regStatus === "待开赛");
  if (status === "live") rows = rows.filter((r) => r.regStatus === "比赛中");
  if (status === "soon") rows = rows.filter((r) => r.regStatus === "未开始");
  if (status === "closed") rows = rows.filter((r) => r.regStatus === "已结束");
  const cities = [...new Set(getDb().prepare("SELECT city FROM races ORDER BY city").all().map((r) => r.city))];
  const months = [...new Set(getDb().prepare("SELECT race_date FROM races ORDER BY race_date").all().map((r) => r.race_date.slice(0, 7)))];
  res.json({ races: rows, cities, months, statuses: STATUSES });
});

app.get(BASE + "/api/races/:id", (req, res) => {
  const row = getDb().prepare("SELECT * FROM races WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "没有这场比赛" });
  const race = presentRace(row, new Date());
  const user = userFrom(req);
  const mine = user
    ? getDb().prepare("SELECT status FROM plans WHERE user_id = ? AND race_id = ?").get(user.id, race.id)
    : null;
  const clubs = user
    ? getDb()
        .prepare(
          `SELECT c.id, c.name, c.code FROM clubs c
           JOIN club_members m ON m.club_id = c.id
           WHERE m.user_id = ? ORDER BY c.id`
        )
        .all(user.id)
        .map((club) => ({
          ...club,
          mates: getDb()
            .prepare(
              `SELECT u.nickname, p.status FROM club_members m
               JOIN users u ON u.id = m.user_id
               JOIN plans p ON p.user_id = u.id AND p.race_id = ?
               WHERE m.club_id = ? AND u.id != ?
               ORDER BY p.updated_at DESC`
            )
            .all(race.id, club.id, user.id)
        }))
    : [];
  const cards = clubs.map((club) => packCard(race, club, marksOf(club.id, race.id)));
  res.json({ race, myStatus: mine ? mine.status : "", clubs, cards, statuses: STATUSES });
});

app.get(BASE + "/api/races/:id/card", (req, res) => {
  const row = getDb().prepare("SELECT * FROM races WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "没有这场比赛" });
  const code = String(req.query.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ error: "带上跑团口令" });
  const club = getDb().prepare("SELECT id, name, code FROM clubs WHERE code = ?").get(code);
  if (!club) return res.status(404).json({ error: "没有这个跑团口令" });
  const race = presentRace(row, new Date());
  res.json(packCard(race, club, marksOf(club.id, race.id)));
});

app.post(BASE + "/api/session", (req, res) => {
  const nickname = String((req.body && req.body.nickname) || "").trim();
  if (!nickname || nickname.length > 20) return res.status(400).json({ error: "昵称用 1 到 20 个字" });
  const token = crypto.randomBytes(24).toString("hex");
  const info = getDb()
    .prepare("INSERT INTO users (nickname, token, created_at) VALUES (?, ?, ?)")
    .run(nickname, token, new Date().toISOString());
  res.json({ token, user: { id: Number(info.lastInsertRowid), nickname } });
});

app.get(BASE + "/api/me", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const plans = getDb()
    .prepare(
      `SELECT p.status, p.updated_at, r.* FROM plans p
       JOIN races r ON r.id = p.race_id
       WHERE p.user_id = ? ORDER BY r.race_date`
    )
    .all(user.id)
    .map((row) => ({ status: row.status, race: presentRace(row, new Date()) }));
  const clubs = getDb()
    .prepare(
      `SELECT c.id, c.name, c.code FROM clubs c
       JOIN club_members m ON m.club_id = c.id
       WHERE m.user_id = ? ORDER BY c.id`
    )
    .all(user.id);
  res.json({ user, plans, clubs });
});

app.put(BASE + "/api/me/races/:id", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const race = getDb().prepare("SELECT id FROM races WHERE id = ?").get(req.params.id);
  if (!race) return res.status(404).json({ error: "没有这场比赛" });
  const status = String((req.body && req.body.status) || "");
  if (!STATUSES.includes(status)) return res.status(400).json({ error: "状态不对" });
  getDb()
    .prepare(
      `INSERT INTO plans (user_id, race_id, status, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, race_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`
    )
    .run(user.id, race.id, status, new Date().toISOString());
  res.json({ ok: true, status });
});

app.post(BASE + "/api/clubs", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const name = String((req.body && req.body.name) || "").trim();
  if (!name || name.length > 20) return res.status(400).json({ error: "跑团名用 1 到 20 个字" });
  const code = crypto.randomBytes(3).toString("hex").toUpperCase();
  const now = new Date().toISOString();
  const info = getDb().prepare("INSERT INTO clubs (name, code, owner_id, created_at) VALUES (?, ?, ?, ?)").run(name, code, user.id, now);
  const id = Number(info.lastInsertRowid);
  getDb().prepare("INSERT INTO club_members (club_id, user_id, joined_at) VALUES (?, ?, ?)").run(id, user.id, now);
  res.json({ club: { id, name, code } });
});

app.post(BASE + "/api/clubs/join", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const code = String((req.body && req.body.code) || "").trim().toUpperCase();
  const club = getDb().prepare("SELECT id, name, code FROM clubs WHERE code = ?").get(code);
  if (!club) return res.status(404).json({ error: "没有这个跑团口令" });
  getDb()
    .prepare("INSERT OR IGNORE INTO club_members (club_id, user_id, joined_at) VALUES (?, ?, ?)")
    .run(club.id, user.id, new Date().toISOString());
  res.json({ club });
});

app.get(BASE + "/api/clubs/:id", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const member = getDb()
    .prepare("SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?")
    .get(req.params.id, user.id);
  if (!member) return res.status(403).json({ error: "你不在这个跑团里" });
  const club = getDb().prepare("SELECT id, name, code FROM clubs WHERE id = ?").get(req.params.id);
  const members = getDb()
    .prepare(
      `SELECT u.id, u.nickname FROM club_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.club_id = ? ORDER BY m.joined_at`
    )
    .all(club.id);
  const plans = getDb()
    .prepare(
      `SELECT u.nickname, p.status, r.* FROM plans p
       JOIN users u ON u.id = p.user_id
       JOIN races r ON r.id = p.race_id
       JOIN club_members m ON m.user_id = u.id AND m.club_id = ?
       ORDER BY r.race_date, p.updated_at DESC`
    )
    .all(club.id);
  const board = [];
  for (const row of plans) {
    const race = presentRace(row, new Date());
    let item = board.find((b) => b.race.id === race.id);
    if (!item) {
      item = { race, marks: [] };
      board.push(item);
    }
    item.marks.push({ nickname: row.nickname, status: row.status });
  }
  for (const item of board) {
    const counts = {};
    for (const status of STATUSES) counts[status] = 0;
    for (const mark of item.marks) counts[mark.status] += 1;
    item.summary = summarizeMarks(counts);
    item.title = cardTitle(item.race);
    item.unpaid = item.marks.filter((mark) => mark.status === "中签").map((mark) => mark.nickname);
    item.text = shareText({ ...item, club });
  }
  res.json({ club, members, board });
});

const webDist = path.join(__dirname, "../../web/dist");
if (fs.existsSync(webDist)) {
  app.use(BASE, express.static(webDist));
  app.get(BASE, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
  app.get(BASE + "/*", (req, res, next) => {
    if (req.path.startsWith(BASE + "/api")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3790);
  app.listen(port, () => {
    console.log(`marathon listening on ${port} base ${BASE}`);
  });
}

module.exports = { app };
