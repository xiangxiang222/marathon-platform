const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const { getDb } = require("./db");
const { presentRace, inChannel, summarizeMarks, cardTitle, shareText, reminderHits, fullConflicts, squadOf, nearbyOpen, alternativeNote, drawPoster } = require("./races");
const { slicePage } = require("./page");
const { parseClock, decorateResults, careerOf, yearOf, bestRanks } = require("./career");
const { syncOfficial, listOfficial, publishOfficial, openUpcoming, ignoreOfficial, applyOfficial } = require("./official");
const { ensureAdmin, ensureDeskLogin, loginAdmin, adminSession, logoutAdmin, changeAdminPassword, listAdmins, createAdmin, setAdminRole } = require("./admin-auth");
const { adminRoleLabel, clubRoleLabel } = require("./roles");
const { mountClubLife, enrichBoard, clubLife } = require("./club-life");
const { mountMileage } = require("./mileage");
const { mountPartner } = require("./partner");
const { mountRadar } = require("./radar");
const { mountFeed } = require("./feed");
const { mountDraws, ratesOf } = require("./draws");
const { mountClubOps } = require("./club-ops");
const { mountClubGather } = require("./club-gather");
const { mountRaceGuide, attachGuide } = require("./race-guide");
const { mountBotRaces } = require("./bot-races");
const { mountNews } = require("./news");
const { mountAdminDesk } = require("./admin-desk");
const { issueCaptcha, registerUser, loginUser, changeOwnPassword } = require("./user-auth");
const { signupTarget } = require("./signup-channel");
const QRCode = require("qrcode");

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
app.use(express.json({ limit: "8mb" }));

function userFrom(req) {
  const header = req.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token || token === header) return null;
  const row = getDb().prepare("SELECT id, nickname, leader FROM users WHERE token = ?").get(token);
  if (!row) return null;
  return { id: row.id, nickname: row.nickname, leader: Boolean(row.leader) };
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
      `SELECT p.status, p.sheet, p.updated_at, r.* FROM plans p
       JOIN races r ON r.id = p.race_id
       WHERE p.user_id = ? ORDER BY r.race_date`
    )
    .all(userId)
    .map((row) => ({ status: row.status, hasSheet: Boolean(row.sheet), updatedAt: row.updated_at, race: presentRace(row, now) }));
}

function resultsFor(userId, now = new Date()) {
  const rows = getDb()
    .prepare(
      `SELECT res.distance AS result_distance, res.seconds, res.story, res.proof, res.proof_kind, r.*
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
        proof: row.proof || "",
        proofKind: row.proof_kind || "",
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
    res.status(401).json({ error: "请先登录" });
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
  const fold = (value) => String(value || "").replace(/\s+/g, "").toLowerCase();
  if (q) {
    const needle = fold(q);
    rows = rows.filter((r) => [r.name, r.city, r.place, r.province].some((part) => fold(part).includes(needle)));
  }
  if (!q && city) rows = rows.filter((r) => r.city === city || r.province === city);
  if (!q && month) rows = rows.filter((r) => r.raceDate.slice(0, 7) === month);
  if (!q && distance) rows = rows.filter((r) => r.distances.includes(distance));
  if (!q && kind) rows = rows.filter((r) => inChannel(r, kind));
  if (!q && status === "upcoming") {
    const today = cstDay(now);
    rows = rows.filter((r) => r.raceDate >= today);
  }
  if (!q && status === "open") rows = rows.filter((r) => r.regStatus === "报名中");
  if (!q && status === "wait") rows = rows.filter((r) => r.regStatus === "待开赛");
  if (!q && status === "live") rows = rows.filter((r) => r.regStatus === "比赛中");
  if (!q && status === "soon") rows = rows.filter((r) => r.regStatus === "未开始");
  if (!q && status === "closed") rows = rows.filter((r) => r.regStatus === "已结束");
  if (!q && status === "unannounced") rows = rows.filter((r) => r.regStatus === "报名时间未公布");
  const cities = [...new Set(getDb().prepare("SELECT city FROM races ORDER BY city").all().map((r) => r.city))];
  const months = [...new Set(getDb().prepare("SELECT race_date FROM races ORDER BY race_date").all().map((r) => r.race_date.slice(0, 7)))];
  const paged = slicePage(rows, req.query);
  res.json({ races: paged.rows, total: paged.total, page: paged.page, pageSize: paged.pageSize, pages: paged.pages, cities, months, statuses: STATUSES });
});

app.get(BASE + "/api/races/:id/signup-qr", async (req, res) => {
  const row = getDb().prepare("SELECT signup_url FROM races WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "没有这场比赛" });
  const target = signupTarget(row.signup_url);
  if (!target) return res.status(404).json({ error: "这场还没有报名页" });
  try {
    const png = await QRCode.toBuffer(target.url, { width: 360, margin: 1, errorCorrectionLevel: "M" });
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "private, max-age=300");
    res.send(png);
  } catch (err) {
    res.status(500).json({ error: "报名二维码没有生成" });
  }
});

app.get(BASE + "/api/races/:id", (req, res) => {
  const row = getDb().prepare("SELECT * FROM races WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "没有这场比赛" });
  const race = attachGuide(getDb(), presentRace(row, new Date()));
  const user = userFrom(req);
  const mine = user
    ? getDb().prepare("SELECT status, sheet FROM plans WHERE user_id = ? AND race_id = ?").get(user.id, race.id)
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
  const myResults = user ? resultsFor(user.id, new Date()).filter((item) => item.race.id === race.id) : [];
  const myResult = myResults[0] || null;
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
    hasSheet: Boolean(mine && mine.sheet),
    myResult,
    myResults,
    clubs,
    cards,
    conflicts,
    statuses: STATUSES,
    alternatives,
    missed,
    alternativeNote: alternativeNote(myStatus, missed, alternatives),
    drawText: user && myStatus === "中签" ? drawPoster(user.nickname, race) : "",
    drawRates: ratesOf(getDb(), race.id)
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

app.get(BASE + "/api/auth/captcha", (_req, res) => {
  const issued = issueCaptcha(getDb());
  res.set("Cache-Control", "no-store");
  res.json({ token: issued.token, image: issued.image });
});

app.post(BASE + "/api/auth/register", (req, res) => {
  const result = registerUser(getDb(), req.body || {});
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

app.post(BASE + "/api/auth/login", (req, res) => {
  const result = loginUser(getDb(), req.body || {});
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

app.get(BASE + "/api/me", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const plans = plansFor(user.id);
  const clubs = getDb()
    .prepare(
      `SELECT c.id, c.name, c.code, c.owner_id, m.role AS member_role FROM clubs c
       JOIN club_members m ON m.club_id = c.id
       WHERE m.user_id = ? ORDER BY c.id`
    )
    .all(user.id)
    .map((row) => {
      const role = Number(row.owner_id) === Number(user.id) ? "owner" : row.member_role === "manager" ? "manager" : "member";
      return { id: row.id, name: row.name, code: row.code, role, roleLabel: clubRoleLabel(role) };
    });
  const reminders = remindable().filter((item) => plans.some((plan) => plan.race.id === item.race.id));
  const results = resultsFor(user.id);
  const applications = getDb()
    .prepare("SELECT id, name, status FROM club_applications WHERE user_id = ? AND status = 'pending' ORDER BY id DESC")
    .all(user.id)
    .map((row) => ({ id: row.id, name: row.name, status: row.status }));
  const account = getDb().prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id);
  res.json({
    user: { id: user.id, nickname: user.nickname, leader: Boolean(user.leader), hasPassword: Boolean(account && account.password_hash) },
    applications,
    plans,
    clubs,
    reminders,
    conflicts: fullConflicts(plans, gapDays()),
    gapDays: gapDays(),
    results,
    career: careerOf(results, yearOf(new Date()))
  });
});

app.put(BASE + "/api/me/password", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const result = changeOwnPassword(getDb(), user.id, req.body && req.body.current, req.body && req.body.password);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
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
  const plan = getDb().prepare("SELECT sheet FROM plans WHERE user_id = ? AND race_id = ?").get(user.id, race.id);
  getDb().prepare("DELETE FROM plans WHERE user_id = ? AND race_id = ?").run(user.id, race.id);
  if (plan) removeSignupFile(plan.sheet);
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
       ON CONFLICT(user_id, race_id, distance) DO UPDATE SET
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
    result: results.find((item) => item.race.id === race.id && item.distance === distance) || null,
    results: results.filter((item) => item.race.id === race.id),
    career: careerOf(results, yearOf(new Date()))
  });
});

app.delete(BASE + "/api/me/races/:id/result", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const race = getDb().prepare("SELECT id FROM races WHERE id = ?").get(req.params.id);
  if (!race) return res.status(404).json({ error: "没有这场比赛" });
  const distance = String(req.query.distance || "");
  const existing = distance
    ? getDb().prepare("SELECT proof FROM results WHERE user_id = ? AND race_id = ? AND distance = ?").all(user.id, race.id, distance)
    : getDb().prepare("SELECT proof FROM results WHERE user_id = ? AND race_id = ?").all(user.id, race.id);
  if (distance && !existing.length) return res.status(400).json({ error: "没有这项成绩" });
  if (distance) getDb().prepare("DELETE FROM results WHERE user_id = ? AND race_id = ? AND distance = ?").run(user.id, race.id, distance);
  else getDb().prepare("DELETE FROM results WHERE user_id = ? AND race_id = ?").run(user.id, race.id);
  for (const row of existing) removeProofFile(row.proof);
  const results = resultsFor(user.id);
  res.json({ ok: true, career: careerOf(results, yearOf(new Date())) });
});

const PROOF_KINDS = { certificate: "证书", medal: "奖牌" };
const PROOF_MAX = 8 * 1024 * 1024;

function proofRoot() {
  return path.join(process.env.MARATHON_MEDIA || path.join(__dirname, "../data/media"), "results");
}

function signupRoot() {
  return path.join(process.env.MARATHON_MEDIA || path.join(__dirname, "../data/media"), "signups");
}

function sniffProof(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return { ext: "png", mime: "image/png" };
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}

function readUpload(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > max) {
        reject(Object.assign(new Error("文件太大"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function oneUpload(buffer, header) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(header || "");
  if (!boundary) return null;
  const token = "--" + (boundary[1] || boundary[2]).trim();
  const marker = Buffer.from(token);
  const start = buffer.indexOf(marker);
  if (start < 0) return null;
  let part = buffer.subarray(start + marker.length);
  if (part[0] === 13 && part[1] === 10) part = part.subarray(2);
  const headerEnd = part.indexOf("\r\n\r\n");
  if (headerEnd < 0) return null;
  const head = part.subarray(0, headerEnd).toString("utf8");
  let body = part.subarray(headerEnd + 4);
  const next = body.indexOf(Buffer.from("\r\n" + token));
  if (next >= 0) body = body.subarray(0, next);
  if (!/filename=/.test(head)) return null;
  return body;
}

function removeProofFile(filename) {
  if (!filename) return;
  const file = path.join(proofRoot(), path.basename(filename));
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function removeSignupFile(filename) {
  if (!filename) return;
  const file = path.join(signupRoot(), path.basename(filename));
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function userByToken(req) {
  const direct = userFrom(req);
  if (direct) return direct;
  const token = String(req.query.t || "");
  if (!token) return null;
  const row = getDb().prepare("SELECT id, nickname, leader FROM users WHERE token = ?").get(token);
  if (!row) return null;
  return { id: row.id, nickname: row.nickname, leader: Boolean(row.leader) };
}

function proofTarget(userId, raceId, distance) {
  const rows = getDb()
    .prepare("SELECT distance, proof FROM results WHERE user_id = ? AND race_id = ? ORDER BY distance")
    .all(userId, raceId);
  if (distance) {
    const row = rows.find((item) => item.distance === distance);
    return row ? { row } : { error: "先记下成绩，再上传照片", status: 400 };
  }
  if (!rows.length) return { error: "先记下成绩，再上传照片", status: 400 };
  if (rows.length > 1) return { error: "先选项目", status: 400 };
  return { row: rows[0] };
}

function proofAnswer(userId, raceId, distance) {
  const results = resultsFor(userId);
  return results.find((item) => item.race.id === raceId && item.distance === distance) || null;
}

app.post(BASE + "/api/me/races/:id/result/proof/:kind", async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  if (!PROOF_KINDS[req.params.kind]) return res.status(400).json({ error: "照片选证书或奖牌" });
  const race = getDb().prepare("SELECT id FROM races WHERE id = ?").get(req.params.id);
  if (!race) return res.status(404).json({ error: "没有这场比赛" });
  const picked = proofTarget(user.id, race.id, String(req.query.distance || ""));
  if (picked.error) return res.status(picked.status).json({ error: picked.error });
  let buffer;
  try {
    buffer = oneUpload(await readUpload(req, PROOF_MAX + 64 * 1024), req.get("content-type"));
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.status === 413 ? "照片不超过 8MB" : "没有读到文件" });
  }
  if (!buffer || !buffer.length) return res.status(400).json({ error: "没有读到文件" });
  const photo = sniffProof(buffer);
  if (!photo) return res.status(400).json({ error: "只收 jpg、png、webp" });
  if (buffer.length > PROOF_MAX) return res.status(413).json({ error: "照片不超过 8MB" });
  const filename = user.id + "-" + String(race.id).replace(/[^A-Za-z0-9_-]/g, "") + "-" + picked.row.distance + "." + photo.ext;
  fs.mkdirSync(proofRoot(), { recursive: true });
  fs.writeFileSync(path.join(proofRoot(), filename), buffer);
  if (picked.row.proof && picked.row.proof !== filename) removeProofFile(picked.row.proof);
  getDb()
    .prepare("UPDATE results SET proof = ?, proof_kind = ? WHERE user_id = ? AND race_id = ? AND distance = ?")
    .run(filename, req.params.kind, user.id, race.id, picked.row.distance);
  res.json({ ok: true, result: proofAnswer(user.id, race.id, picked.row.distance) });
});

app.delete(BASE + "/api/me/races/:id/result/proof", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const race = getDb().prepare("SELECT id FROM races WHERE id = ?").get(req.params.id);
  if (!race) return res.status(404).json({ error: "没有这场比赛" });
  const picked = proofTarget(user.id, race.id, String(req.query.distance || ""));
  if (picked.error) return res.status(picked.status).json({ error: picked.error === "先记下成绩，再上传照片" ? "还没有照片" : picked.error });
  if (!picked.row.proof) return res.status(400).json({ error: "还没有照片" });
  getDb()
    .prepare("UPDATE results SET proof = '', proof_kind = '' WHERE user_id = ? AND race_id = ? AND distance = ?")
    .run(user.id, race.id, picked.row.distance);
  removeProofFile(picked.row.proof);
  res.json({ ok: true, result: proofAnswer(user.id, race.id, picked.row.distance) });
});

app.get(BASE + "/api/me/races/:id/result/proof", (req, res) => {
  const user = userByToken(req);
  if (!user) return res.status(401).json({ error: "请先登录" });
  const picked = proofTarget(user.id, req.params.id, String(req.query.distance || ""));
  if (picked.error || !picked.row.proof) return res.status(404).json({ error: "没有这张照片" });
  const file = path.join(proofRoot(), path.basename(picked.row.proof));
  if (!fs.existsSync(file)) return res.status(404).json({ error: "没有这张照片" });
  const photo = sniffProof(fs.readFileSync(file));
  res.set("Content-Type", photo ? photo.mime : "application/octet-stream");
  res.set("Cache-Control", "private, no-cache");
  fs.createReadStream(file).pipe(res);
});

app.post(BASE + "/api/me/races/:id/sheet", async (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const race = getDb().prepare("SELECT id FROM races WHERE id = ?").get(req.params.id);
  if (!race) return res.status(404).json({ error: "没有这场比赛" });
  const plan = getDb().prepare("SELECT sheet FROM plans WHERE user_id = ? AND race_id = ?").get(user.id, race.id);
  if (!plan) return res.status(400).json({ error: "先标状态，再上传截图" });
  let buffer;
  try {
    buffer = oneUpload(await readUpload(req, PROOF_MAX + 64 * 1024), req.get("content-type"));
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.status === 413 ? "照片不超过 8MB" : "没有读到文件" });
  }
  if (!buffer || !buffer.length) return res.status(400).json({ error: "没有读到文件" });
  const photo = sniffProof(buffer);
  if (!photo) return res.status(400).json({ error: "只收 jpg、png、webp" });
  if (buffer.length > PROOF_MAX) return res.status(413).json({ error: "照片不超过 8MB" });
  const filename = user.id + "-" + String(race.id).replace(/[^A-Za-z0-9_-]/g, "") + "." + photo.ext;
  fs.mkdirSync(signupRoot(), { recursive: true });
  fs.writeFileSync(path.join(signupRoot(), filename), buffer);
  if (plan.sheet && plan.sheet !== filename) removeSignupFile(plan.sheet);
  getDb().prepare("UPDATE plans SET sheet = ? WHERE user_id = ? AND race_id = ?").run(filename, user.id, race.id);
  res.json({ ok: true, hasSheet: true });
});

app.delete(BASE + "/api/me/races/:id/sheet", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const race = getDb().prepare("SELECT id FROM races WHERE id = ?").get(req.params.id);
  if (!race) return res.status(404).json({ error: "没有这场比赛" });
  const plan = getDb().prepare("SELECT sheet FROM plans WHERE user_id = ? AND race_id = ?").get(user.id, race.id);
  if (!plan || !plan.sheet) return res.status(400).json({ error: "还没有截图" });
  getDb().prepare("UPDATE plans SET sheet = '' WHERE user_id = ? AND race_id = ?").run(user.id, race.id);
  removeSignupFile(plan.sheet);
  res.json({ ok: true, hasSheet: false });
});

app.get(BASE + "/api/me/races/:id/sheet", (req, res) => {
  const user = userByToken(req);
  if (!user) return res.status(401).json({ error: "请先登录" });
  const plan = getDb().prepare("SELECT sheet FROM plans WHERE user_id = ? AND race_id = ?").get(user.id, req.params.id);
  if (!plan || !plan.sheet) return res.status(404).json({ error: "没有这张截图" });
  const file = path.join(signupRoot(), path.basename(plan.sheet));
  if (!fs.existsSync(file)) return res.status(404).json({ error: "没有这张截图" });
  const photo = sniffProof(fs.readFileSync(file));
  res.set("Content-Type", photo ? photo.mime : "application/octet-stream");
  res.set("Cache-Control", "private, no-cache");
  fs.createReadStream(file).pipe(res);
});

app.post(BASE + "/api/clubs", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  if (!user.leader) return res.status(403).json({ error: "当前没有建团资格，无法申请创建跑团" });
  const name = String((req.body && req.body.name) || "").trim();
  if (!name || name.length > 20) return res.status(400).json({ error: "跑团名用 1 到 20 个字" });
  const db = getDb();
  const pending = db.prepare("SELECT id, name, status FROM club_applications WHERE user_id = ? AND status = 'pending'").get(user.id);
  if (pending) {
    if (pending.name === name) return res.json({ pending: true, application: { id: pending.id, name: pending.name, status: pending.status } });
    return res.status(400).json({ error: "先等上一个团审完" });
  }
  let id = 0;
  try {
    const info = db
      .prepare("INSERT INTO club_applications (user_id, name, status, created_at) VALUES (?, ?, 'pending', ?)")
      .run(user.id, name, new Date().toISOString());
    id = Number(info.lastInsertRowid);
  } catch (err) {
    if (!/UNIQUE/i.test(String(err.message))) throw err;
    const again = db.prepare("SELECT id, name, status FROM club_applications WHERE user_id = ? AND status = 'pending'").get(user.id);
    if (!again) throw err;
    return res.json({ pending: true, application: { id: again.id, name: again.name, status: again.status } });
  }
  res.json({ pending: true, application: { id, name, status: "pending" } });
});

function joinByCode(db, club, userId) {
  const now = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO club_members (club_id, user_id, joined_at, role) VALUES (?, ?, ?, 'member')").run(club.id, userId, now);
  db.prepare(
    "UPDATE club_requests SET status = 'approved', reviewed_at = ?, reviewer = '口令' WHERE club_id = ? AND user_id = ? AND status = 'pending'"
  ).run(now, club.id, userId);
}

app.get(BASE + "/api/clubs/directory", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const q = String(req.query.q || "").trim().slice(0, 40);
  const escaped = q.replace(/[\\%_]/g, (ch) => "\\" + ch);
  const like = "%" + escaped + "%";
  const folded = "%" + escaped.replace(/\s+/g, "") + "%";
  const prefix = escaped + "%";
  const clubs = getDb()
    .prepare(
      `SELECT c.id, c.name,
              (SELECT u.nickname FROM users u WHERE u.id = c.owner_id) AS leader,
              (SELECT COUNT(*) FROM club_members m WHERE m.club_id = c.id) AS members,
              EXISTS(SELECT 1 FROM club_members m WHERE m.club_id = c.id AND m.user_id = ?) AS joined,
              EXISTS(SELECT 1 FROM club_requests r WHERE r.club_id = c.id AND r.user_id = ? AND r.status = 'pending') AS pending
       FROM clubs c
       WHERE ? = ''
          OR c.name LIKE ? ESCAPE '\\'
          OR EXISTS (
            SELECT 1 FROM users u WHERE u.id = c.owner_id AND u.nickname LIKE ? ESCAPE '\\'
          )
          OR EXISTS (
            SELECT 1 FROM club_members m
            JOIN users u ON u.id = m.user_id
            WHERE m.club_id = c.id AND m.role = 'manager' AND m.user_id != c.owner_id AND u.nickname LIKE ? ESCAPE '\\'
          )
          OR REPLACE(c.name, ' ', '') LIKE ? ESCAPE '\\'
          OR EXISTS (
            SELECT 1 FROM users u WHERE u.id = c.owner_id AND REPLACE(u.nickname, ' ', '') LIKE ? ESCAPE '\\'
          )
          OR EXISTS (
            SELECT 1 FROM club_members m
            JOIN users u ON u.id = m.user_id
            WHERE m.club_id = c.id AND m.role = 'manager' AND m.user_id != c.owner_id AND REPLACE(u.nickname, ' ', '') LIKE ? ESCAPE '\\'
          )
       ORDER BY
         CASE
           WHEN ? = '' THEN 0
           WHEN c.name LIKE ? ESCAPE '\\' THEN 0
           WHEN c.name LIKE ? ESCAPE '\\' THEN 1
           ELSE 2
         END,
         c.id DESC
       LIMIT 200`
    )
    .all(user.id, user.id, q, like, like, like, folded, folded, folded, q, prefix, like)
    .map((row) => ({
      id: row.id,
      name: row.name,
      leader: row.leader || "",
      members: row.members,
      joined: Boolean(row.joined),
      pending: Boolean(row.pending)
    }));
  res.json({ clubs });
});

app.post(BASE + "/api/clubs/join", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const body = req.body || {};
  const code = String(body.code || "").trim().toUpperCase();
  const db = getDb();
  if (code) {
    const club = db.prepare("SELECT id, name, code FROM clubs WHERE code = ?").get(code);
    if (!club) return res.status(404).json({ error: "没有这个跑团口令" });
    joinByCode(db, club, user.id);
    return res.json({ club });
  }
  const clubId = Number(body.clubId);
  if (!Number.isInteger(clubId) || clubId < 1) return res.status(400).json({ error: "填口令，或选一个跑团申请" });
  const club = db.prepare("SELECT id, name, code FROM clubs WHERE id = ?").get(clubId);
  if (!club) return res.status(404).json({ error: "没有这个跑团" });
  const member = db.prepare("SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?").get(club.id, user.id);
  if (member) return res.json({ club });
  const pending = db.prepare("SELECT id FROM club_requests WHERE club_id = ? AND user_id = ? AND status = 'pending'").get(club.id, user.id);
  if (!pending) {
    try {
      db.prepare("INSERT INTO club_requests (club_id, user_id, status, created_at) VALUES (?, ?, 'pending', ?)").run(
        club.id,
        user.id,
        new Date().toISOString()
      );
    } catch (err) {
      if (!/UNIQUE/i.test(String(err.message))) throw err;
    }
  }
  res.json({ pending: true, club: { id: club.id, name: club.name } });
});

app.get(BASE + "/api/clubs/:id", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const member = getDb()
    .prepare("SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?")
    .get(req.params.id, user.id);
  if (!member) return res.status(403).json({ error: "你不在这个跑团里" });
  const clubRow = getDb().prepare("SELECT id, name, code, owner_id FROM clubs WHERE id = ?").get(req.params.id);
  const club = { id: clubRow.id, name: clubRow.name, code: clubRow.code };
  const plans = getDb()
    .prepare(
      `SELECT u.id AS user_id, u.nickname, p.status, r.* FROM plans p
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
    item.marks.push({ userId: row.user_id, nickname: row.nickname, status: row.status });
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
  enrichBoard(getDb(), clubRow.id, board);
  res.json({ ...clubLife(getDb(), clubRow, user.id), board, ranks: bestRanks(rankRows), ...checkinsOf(clubRow.id, user.id) });
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

function requireAdmin(req, res, scope) {
  const token = bearerToken(req);
  const session = token ? adminSession(getDb(), token) : null;
  if (session) {
    req.adminUser = session.username;
    req.adminRole = session.role || "admin";
  } else {
    const expected = process.env.ADMIN_TOKEN || "";
    if (expected && token) {
      const left = Buffer.from(token);
      const right = Buffer.from(expected);
      if (left.length === right.length && crypto.timingSafeEqual(left, right)) {
        req.adminUser = "";
        req.adminRole = "admin";
      }
    }
  }
  if (!req.adminRole) {
    res.status(401).json({ error: "请重新登录" });
    return false;
  }
  const allowed = scope === "desk" ? ["admin", "club"] : ["admin"];
  if (!allowed.includes(req.adminRole)) {
    res.status(403).json({ error: "只有管理员可以改" });
    return false;
  }
  return true;
}

app.post(BASE + "/api/admin/login", (req, res) => {
  const body = req.body || {};
  const result = loginAdmin(getDb(), body.username, body.password);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json({ token: result.token, username: result.username, role: result.role, roleLabel: result.roleLabel });
});

app.post(BASE + "/api/admin/logout", (req, res) => {
  logoutAdmin(getDb(), bearerToken(req));
  res.json({ ok: true });
});

app.get(BASE + "/api/admin/session", (req, res) => {
  if (!requireAdmin(req, res, "desk")) return;
  res.json({ username: req.adminUser, role: req.adminRole, roleLabel: adminRoleLabel(req.adminRole) });
});

app.get(BASE + "/api/admin/accounts", (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ accounts: listAdmins(getDb()) });
});

app.post(BASE + "/api/admin/accounts", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const body = req.body || {};
  const result = createAdmin(getDb(), body.username, body.password, String(body.role || ""));
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

app.put(BASE + "/api/admin/accounts/:username", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const result = setAdminRole(getDb(), req.adminUser, req.params.username, String((req.body && req.body.role) || ""));
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

app.post(BASE + "/api/admin/password", (req, res) => {
  if (!requireAdmin(req, res, "desk")) return;
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
  const paged = slicePage(
    listOfficial(getDb(), {
      q,
      status: changedOnly || status === "all" ? "" : status,
      limit: 0,
      upcomingFrom: q ? "" : cstDay(),
      changedOnly
    }),
    req.query
  );
  res.json({ rows: paged.rows, total: paged.total, page: paged.page, pageSize: paged.pageSize, pages: paged.pages });
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

mountBotRaces(app, { BASE, getDb, requireAdmin });
mountNews(app, { BASE, getDb, requireAdmin });

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
  if (dates.some((item) => item == null)) return res.status(400).json({ error: "日期须为 2026-10-28 这种格式" });
  if (!dates.some(Boolean)) return res.status(400).json({ error: "请填写需要记录的报名时间" });
  if (!source) return res.status(400).json({ error: "修改报名时间须填写本次来源" });
  if (source.length > 80) return res.status(400).json({ error: "来源不超过 80 个字" });
  if (deadlineName.length > 12) return res.status(400).json({ error: "截止说明不超过 12 个字" });
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

mountClubLife(app, { BASE, getDb, userFrom });
mountMileage(app, { BASE, getDb, userFrom });
mountPartner(app, { BASE, getDb, userFrom, requireAdmin });
mountRadar(app, { BASE, getDb, userFrom, requireAdmin });
mountFeed(app, { BASE, getDb, userFrom });
mountDraws(app, { BASE, getDb, requireAdmin });
mountClubOps(app, { BASE, getDb, userFrom });
mountClubGather(app, { BASE, getDb, userFrom });
mountRaceGuide(app, { BASE, getDb, requireAdmin });
mountAdminDesk(app, { BASE, getDb, requireAdmin });

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
    ensureDeskLogin(getDb());
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
