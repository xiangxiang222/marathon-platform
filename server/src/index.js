const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const { getDb } = require("./db");
const { presentRace, summarizeMarks, cardTitle, shareText, reminderHits, fullConflicts, squadOf, nearbyOpen, alternativeNote, drawPoster } = require("./races");
const { parseClock, decorateResults, careerOf, yearOf, bestRanks } = require("./career");
const { syncOfficial, listOfficial, publishOfficial, openUpcoming, ignoreOfficial, applyOfficial } = require("./official");
const { ensureAdmin, loginAdmin, adminSession, logoutAdmin, changeAdminPassword } = require("./admin-auth");

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
const STATUSES = ["想跑", "已报名", "待抽签", "中签", "未中签", "已缴费", "已领物", "完赛", "未完赛", "弃赛"];
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
    unpaid: marks.filter((mark) => mark.status === "中签").map((mark) => ({ nickname: mark.nickname })),
    squad: squadOf(marks)
  };
  card.text = shareText(card);
  return card;
}

function presentedRaces(now = new Date()) {
  return getDb().prepare("SELECT * FROM races").all().map((row) => presentRace(row, now));
}

function gapDays() {
  const n = Number(process.env.FULL_MARATHON_GAP_DAYS || 21);
  return Number.isFinite(n) && n > 0 ? n : 21;
}

function plansFor(userId, now = new Date()) {
  return getDb()
    .prepare(
      `SELECT p.status, p.updated_at, r.* FROM plans p
       JOIN races r ON r.id = p.race_id
       WHERE p.user_id = ? ORDER BY r.race_date`
    )
    .all(userId)
    .map((row) => ({ status: row.status, updatedAt: row.updated_at, race: presentRace(row, now) }));
}

function resultsFor(userId, now = new Date()) {
  const rows = getDb()
    .prepare(
      `SELECT res.distance AS result_distance, res.seconds, res.story, r.*
       FROM results res
       JOIN races r ON r.id = res.race_id
       WHERE res.user_id = ?
       ORDER BY r.race_date DESC, r.id`
    )
    .all(userId);
  return decorateResults(
    rows.map((row) => {
      const race = presentRace(row, now);
      return {
        distance: row.result_distance,
        seconds: row.seconds,
        story: row.story,
        race: {
          id: race.id,
          name: race.name,
          raceDate: race.raceDate,
          city: race.city,
          province: race.province,
          kind: race.kind
        }
      };
    })
  );
}

function remindable(now = new Date()) {
  const items = [];
  for (const row of getDb().prepare("SELECT * FROM races").all()) {
    const race = presentRace(row, now);
    for (const hit of reminderHits(race)) {
      items.push({
        race: { id: race.id, name: race.name, raceDate: race.raceDate, city: race.city },
        hit
      });
    }
  }
  items.sort((a, b) => a.hit.daysLeft - b.hit.daysLeft || a.race.raceDate.localeCompare(b.race.raceDate));
  return items;
}

function requireUser(req, res) {
  const user = userFrom(req);
  if (!user) {
    res.status(401).json({ error: "先起个昵称" });
    return null;
  }
  return user;
}

function cstDay(date = new Date()) {
  const shifted = new Date(date.getTime() + 8 * 3600 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftDay(day, delta) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function dayLabel(day, today) {
  if (day === today) return "今天";
  if (day === shiftDay(today, -1)) return "昨天";
  return day;
}

function checkinsOf(clubId, userId) {
  const today = cstDay();
  const rows = getDb()
    .prepare(
      `SELECT u.nickname, c.user_id, c.day, c.note
       FROM checkins c
       JOIN users u ON u.id = c.user_id
       WHERE c.club_id = ? AND c.day >= ?
       ORDER BY c.day DESC, c.created_at`
    )
    .all(clubId, shiftDay(today, -13));
  const checkins = [];
  for (const row of rows) {
    let group = checkins.find((item) => item.date === row.day);
    if (!group) {
      group = { date: row.day, label: dayLabel(row.day, today), rows: [] };
      checkins.push(group);
    }
    group.rows.push({
      userId: row.user_id,
      nickname: row.nickname,
      note: row.note,
      mine: row.user_id === userId
    });
  }
  const mine = rows.find((row) => row.user_id === userId && row.day === today);
  return { checkins, checkedIn: Boolean(mine), myNote: mine ? mine.note : "" };
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
  if (status === "upcoming") {
    const today = cstDay(now);
    rows = rows.filter((r) => r.raceDate >= today);
  }
  if (status === "open") rows = rows.filter((r) => r.regStatus === "报名中");
  if (status === "wait") rows = rows.filter((r) => r.regStatus === "待开赛");
  if (status === "live") rows = rows.filter((r) => r.regStatus === "比赛中");
  if (status === "soon") rows = rows.filter((r) => r.regStatus === "未开始");
  if (status === "closed") rows = rows.filter((r) => r.regStatus === "已结束");
  if (status === "unannounced") rows = rows.filter((r) => r.regStatus === "报名时间未公布");
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
  const conflicts = user
    ? fullConflicts(plansFor(user.id), gapDays()).filter((item) => item.races.some((r) => r.id === race.id))
    : [];
  const myResult = user ? resultsFor(user.id, new Date()).find((item) => item.race.id === race.id) || null : null;
  const myStatus = mine ? mine.status : "";
  const missed = [];
  for (const club of clubs) {
    for (const mate of club.mates) {
      if (mate.status === "未中签" && !missed.includes(mate.nickname)) missed.push(mate.nickname);
    }
  }
  const alternatives = myStatus === "未中签" || missed.length ? nearbyOpen(race, presentedRaces()) : [];
  res.json({
    race,
    myStatus,
    myResult,
    clubs,
    cards,
    conflicts,
    statuses: STATUSES,
    alternatives,
    missed,
    alternativeNote: alternativeNote(myStatus, missed, alternatives),
    drawText: user && myStatus === "中签" ? drawPoster(user.nickname, race) : ""
  });
});

function todayPayload(user, now = new Date()) {
  const plans = user ? plansFor(user.id, now) : [];
  const tasks = [];
  if (user) {
    for (const item of fullConflicts(plans, gapDays())) {
      tasks.push({
        id: "conflict:" + item.races.map((race) => race.id).join(":"),
        kind: "conflict",
        title: "全马隔得太近",
        body: item.text,
        raceId: item.races[0].id,
        clubId: null
      });
    }
  }
  for (const item of remindable(now).filter((row) => plans.some((plan) => plan.race.id === row.race.id))) {
    const plan = plans.find((row) => row.race.id === item.race.id);
    tasks.push({
      id: "reminder:" + item.race.id + ":" + item.hit.key,
      kind: "reminder",
      title: item.hit.reason,
      body: item.race.name + (plan ? " · 你标的是" + plan.status : ""),
      raceId: item.race.id,
      clubId: null
    });
  }
  if (user) {
    const clubs = getDb()
      .prepare(
        `SELECT c.id, c.name FROM clubs c
         JOIN club_members m ON m.club_id = c.id
         WHERE m.user_id = ? ORDER BY c.id`
      )
      .all(user.id);
    for (const club of clubs) {
      const marks = getDb()
        .prepare(
          `SELECT u.nickname, p.status, r.id AS race_id, r.name
           FROM plans p
           JOIN users u ON u.id = p.user_id
           JOIN races r ON r.id = p.race_id
           JOIN club_members m ON m.user_id = u.id AND m.club_id = ?
           ORDER BY r.race_date, r.id`
        )
        .all(club.id);
      const grouped = [];
      for (const row of marks) {
        let item = grouped.find((race) => race.id === row.race_id);
        if (!item) {
          item = { id: row.race_id, name: row.name, marks: [] };
          grouped.push(item);
        }
        item.marks.push({ nickname: row.nickname, status: row.status });
      }
      for (const race of grouped) {
        const names = race.marks.filter((mark) => mark.status === "中签").map((mark) => mark.nickname);
        if (!names.length) continue;
        tasks.push({
          id: "unpaid:" + club.id + ":" + race.id,
          kind: "unpaid",
          title: "还有人没缴",
          body: club.name + " · " + race.name + "：" + names.join("、"),
          raceId: race.id,
          clubId: club.id
        });
      }
    }
  }
  return { user: user ? { id: user.id, nickname: user.nickname } : null, tasks };
}

app.get(BASE + "/api/today", (req, res) => {
  res.json(todayPayload(userFrom(req)));
});

app.get(BASE + "/api/reminders", (req, res) => {
  const reminders = remindable();
  const user = userFrom(req);
  const plans = user ? plansFor(user.id) : [];
  const mineIds = new Set(plans.map((plan) => plan.race.id));
  res.json({
    gapDays: gapDays(),
    reminders,
    mine: reminders
      .filter((item) => mineIds.has(item.race.id))
      .map((item) => ({ ...item, myStatus: plans.find((plan) => plan.race.id === item.race.id).status })),
    conflicts: user ? fullConflicts(plans, gapDays()) : []
  });
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
  const plans = plansFor(user.id);
  const clubs = getDb()
    .prepare(
      `SELECT c.id, c.name, c.code FROM clubs c
       JOIN club_members m ON m.club_id = c.id
       WHERE m.user_id = ? ORDER BY c.id`
    )
    .all(user.id);
  const reminders = remindable().filter((item) => plans.some((plan) => plan.race.id === item.race.id));
  const results = resultsFor(user.id);
  res.json({
    user,
    plans,
    clubs,
    reminders,
    conflicts: fullConflicts(plans, gapDays()),
    gapDays: gapDays(),
    results,
    career: careerOf(results, yearOf(new Date()))
  });
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

app.delete(BASE + "/api/me/races/:id", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const race = getDb().prepare("SELECT id FROM races WHERE id = ?").get(req.params.id);
  if (!race) return res.status(404).json({ error: "没有这场比赛" });
  getDb().prepare("DELETE FROM plans WHERE user_id = ? AND race_id = ?").run(user.id, race.id);
  res.json({ ok: true });
});

app.put(BASE + "/api/me/races/:id/result", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const row = getDb().prepare("SELECT * FROM races WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "没有这场比赛" });
  const race = presentRace(row, new Date());
  const distance = String((req.body && req.body.distance) || "");
  if (!race.distances.includes(distance)) return res.status(400).json({ error: "这场没有这个项目" });
  const seconds = parseClock(req.body && req.body.time);
  if (seconds == null) return res.status(400).json({ error: "成绩写成 45:30 或 3:29:59" });
  const story = String((req.body && req.body.story) || "").trim();
  if (story.length > 200) return res.status(400).json({ error: "故事最多 200 字" });
  const now = new Date().toISOString();
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO results (user_id, race_id, distance, seconds, story, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, race_id) DO UPDATE SET
         distance = excluded.distance,
         seconds = excluded.seconds,
         story = excluded.story,
         updated_at = excluded.updated_at`
    ).run(user.id, race.id, distance, seconds, story, now);
    db.prepare(
      `INSERT INTO plans (user_id, race_id, status, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, race_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`
    ).run(user.id, race.id, "完赛", now);
  })();
  const results = resultsFor(user.id);
  res.json({
    ok: true,
    result: results.find((item) => item.race.id === race.id) || null,
    career: careerOf(results, yearOf(new Date()))
  });
});

app.delete(BASE + "/api/me/races/:id/result", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const race = getDb().prepare("SELECT id FROM races WHERE id = ?").get(req.params.id);
  if (!race) return res.status(404).json({ error: "没有这场比赛" });
  getDb().prepare("DELETE FROM results WHERE user_id = ? AND race_id = ?").run(user.id, race.id);
  const results = resultsFor(user.id);
  res.json({ ok: true, career: careerOf(results, yearOf(new Date())) });
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
  const catalog = presentedRaces();
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
    item.squad = squadOf(item.marks);
    item.missed = item.marks.filter((mark) => mark.status === "未中签").map((mark) => mark.nickname);
    item.alternatives = item.missed.length ? nearbyOpen(item.race, catalog) : [];
    item.alternativeNote = alternativeNote("", item.missed, item.alternatives);
    item.text = shareText({ ...item, club });
  }
  const rankRows = getDb()
    .prepare(
      `SELECT u.nickname, res.distance AS result_distance, res.seconds, r.*
       FROM results res
       JOIN users u ON u.id = res.user_id
       JOIN races r ON r.id = res.race_id
       JOIN club_members m ON m.user_id = u.id AND m.club_id = ?`
    )
    .all(club.id)
    .map((row) => {
      const race = presentRace(row, new Date());
      return {
        nickname: row.nickname,
        distance: row.result_distance,
        seconds: row.seconds,
        race: { id: race.id, name: race.name, raceDate: race.raceDate }
      };
    });
  res.json({ club, members, board, ranks: bestRanks(rankRows), ...checkinsOf(club.id, user.id) });
});

app.post(BASE + "/api/clubs/:id/checkins", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const member = getDb()
    .prepare("SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?")
    .get(req.params.id, user.id);
  if (!member) return res.status(403).json({ error: "你不在这个跑团里" });
  const note = String((req.body && req.body.note) || "").trim();
  if (note.length > 40) return res.status(400).json({ error: "一句最多 40 个字" });
  const day = cstDay();
  getDb()
    .prepare(
      `INSERT INTO checkins (club_id, user_id, day, note, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(club_id, user_id, day) DO UPDATE SET note = excluded.note`
    )
    .run(req.params.id, user.id, day, note, new Date().toISOString());
  res.json({ ok: true, ...checkinsOf(req.params.id, user.id) });
});

app.delete(BASE + "/api/clubs/:id/checkins", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const member = getDb()
    .prepare("SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?")
    .get(req.params.id, user.id);
  if (!member) return res.status(403).json({ error: "你不在这个跑团里" });
  getDb()
    .prepare("DELETE FROM checkins WHERE club_id = ? AND user_id = ? AND day = ?")
    .run(req.params.id, user.id, cstDay());
  res.json({ ok: true, ...checkinsOf(req.params.id, user.id) });
});

function bearerToken(req) {
  return (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
}

function requireAdmin(req, res) {
  const token = bearerToken(req);
  const username = token ? adminSession(getDb(), token) : "";
  if (username) {
    req.adminUser = username;
    return true;
  }
  const expected = process.env.ADMIN_TOKEN || "";
  if (expected && token) {
    const left = Buffer.from(token);
    const right = Buffer.from(expected);
    if (left.length === right.length && crypto.timingSafeEqual(left, right)) {
      req.adminUser = "";
      return true;
    }
  }
  res.status(401).json({ error: "请重新登录" });
  return false;
}

app.post(BASE + "/api/admin/login", (req, res) => {
  const body = req.body || {};
  const result = loginAdmin(getDb(), body.username, body.password);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ token: result.token });
});

app.post(BASE + "/api/admin/logout", (req, res) => {
  logoutAdmin(getDb(), bearerToken(req));
  res.json({ ok: true });
});

app.post(BASE + "/api/admin/password", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const body = req.body || {};
  const result = changeAdminPassword(getDb(), req.adminUser, body.current, body.next);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

app.get(BASE + "/api/admin/official", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const q = String(req.query.q || "").trim();
  const status = String(req.query.status || "pending").trim();
  const changedOnly = status === "changed";
  res.json({
    rows: listOfficial(getDb(), {
      q,
      status: changedOnly || status === "all" ? "" : status,
      upcomingFrom: q ? "" : cstDay(),
      changedOnly
    })
  });
});

app.post(BASE + "/api/admin/official/sync", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const name = String((req.body && req.body.name) || "").trim();
  try {
    const saved = await syncOfficial(getDb(), {
      raceName: name,
      upcomingOnly: !name,
      pauseMs: name ? 0 : 250,
      maxDetails: name ? 40 : undefined
    });
    const opened = name ? 0 : openUpcoming(getDb());
    res.json({
      ...saved,
      opened,
      rows: listOfficial(getDb(), { q: name, status: name ? "" : "pending", upcomingFrom: name ? "" : cstDay() })
    });
  } catch (err) {
    res.status(502).json({ error: err.message || "官网赛历暂时打不开" });
  }
});

app.post(BASE + "/api/admin/official/:id/publish", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const result = publishOfficial(getDb(), req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

app.post(BASE + "/api/admin/official/:id/ignore", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const result = ignoreOfficial(getDb(), req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

app.post(BASE + "/api/admin/official/:id/apply", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const result = applyOfficial(getDb(), req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

app.put(BASE + "/api/admin/races/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const race = getDb().prepare("SELECT id, reg_start, deadline, draw_at, pay_deadline, deadline_name, source FROM races WHERE id = ?").get(req.params.id);
  if (!race) return res.status(404).json({ error: "没有这场比赛" });
  const body = req.body || {};
  const source = String(body.source || "").trim();
  const deadlineName = String(body.deadlineName || "").trim();
  const dates = ["regStart", "deadline", "drawAt", "payDeadline"].map((key) => {
    const text = String(body[key] || "").trim();
    if (!text) return "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    return text;
  });
  if (dates.some((item) => item == null)) return res.status(400).json({ error: "日期写成 2026-10-28 这样" });
  if (!dates.some(Boolean)) return res.status(400).json({ error: "先填写要记的节点" });
  if (!source) return res.status(400).json({ error: "报名节点要写来源" });
  if (source.length > 80) return res.status(400).json({ error: "来源最多 80 个字" });
  if (deadlineName.length > 12) return res.status(400).json({ error: "节点名称太长" });
  const current = [race.reg_start, race.deadline, race.draw_at, race.pay_deadline];
  const next = dates.map((value, index) => value || current[index]);
  getDb()
    .prepare(
      `UPDATE races
       SET reg_start = ?, deadline = ?, draw_at = ?, pay_deadline = ?, deadline_name = ?, source = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(next[0], next[1], next[2], next[3], deadlineName || race.deadline_name || "报名截止", source, cstDay(), race.id);
  res.json({ ok: true, race: presentRace(getDb().prepare("SELECT * FROM races WHERE id = ?").get(race.id), new Date()) });
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
    ensureAdmin(getDb());
    const released = openUpcoming(getDb());
    console.log(`official released ${released}`);
    if (!process.env.ADMIN_TOKEN) return;
    const pull = () => {
      syncOfficial(getDb(), { upcomingOnly: true }).then(
        (saved) => {
          const opened = openUpcoming(getDb());
          console.log(`official calendar ${saved.count} changed ${saved.changed || 0} opened ${opened}`);
        },
        (err) => console.error("official calendar", err.message)
      );
    };
    setTimeout(pull, 15000);
    setInterval(pull, 24 * 3600 * 1000);
  });
}

module.exports = { app };
