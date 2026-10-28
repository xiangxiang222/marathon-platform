const fs = require("fs");
const path = require("path");
const { parseClock, formatClock } = require("./career");
const { memberRole } = require("./roles");
const { feeBlocksSignup } = require("./club-ops");

const PHOTO_MAX = 8 * 1024 * 1024;
const MEET_LABEL = {
  open: "进行中",
  scored: "已记分",
  short: "人数不够",
  nophoto: "缺合影",
  void: "已作废",
  held: "当天已在另一场记过"
};
const RACE_LABEL = { open: "报名中", closed: "已截止", ended: "已结束", cancelled: "已取消" };
const DISTANCE_LABEL = { full: "全马", half: "半马", "10k": "10公里", "5k": "5公里" };
const DISTANCES = ["full", "half", "10k", "5k", "other"];

function mediaRoot() {
  return process.env.MARATHON_MEDIA || path.join(__dirname, "../data/media");
}

function beijingToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function validDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dayStart(date) {
  return Date.parse(date + "T00:00:00+08:00");
}

function dayEnded(date) {
  return Date.now() >= dayStart(date) + 24 * 3600 * 1000;
}

function staffWindow(date) {
  const start = dayStart(date);
  return Date.now() >= start && Date.now() < start + 8 * 24 * 3600 * 1000;
}

function monthDay(date) {
  const [, month, day] = date.split("-");
  return Number(month) + "月" + Number(day) + "日";
}

function stampLabel(stamp) {
  const match = String(stamp || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return stamp;
  return Number(match[2]) + "月" + Number(match[3]) + "日 " + match[4] + ":" + match[5];
}

function parseWhen(text) {
  const raw = String(text || "").trim().replace(" ", "T");
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  if (!match || !validDate(match[1])) return "";
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (hour > 23 || minute > 59) return "";
  return match[1] + "T" + match[2] + ":" + match[3];
}

function instant(stamp) {
  return Date.parse(stamp + ":00+08:00");
}

function readBody(req, max) {
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

function oneFile(buffer, header) {
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

function sniffPhoto(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return { ext: "png", mime: "image/png" };
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}

function viewer(req, userFrom, getDb) {
  const direct = userFrom(req);
  if (direct) return direct;
  const token = String(req.query.t || "");
  if (!token) return null;
  return getDb().prepare("SELECT id, nickname, leader FROM users WHERE token = ?").get(token) || null;
}

function gate(req, res, userFrom, getDb) {
  const user = viewer(req, userFrom, getDb);
  if (!user) {
    res.status(401).json({ error: "请先登录" });
    return null;
  }
  const club = getDb().prepare("SELECT id, name, code, owner_id FROM clubs WHERE id = ?").get(req.params.id);
  if (!club) {
    res.status(404).json({ error: "没有这个跑团" });
    return null;
  }
  const member = getDb().prepare("SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?").get(club.id, user.id);
  if (!member) {
    res.status(403).json({ error: "你不在这个跑团里" });
    return null;
  }
  return { user, club, db: getDb() };
}

function isStaff(ctx) {
  const role = memberRole(ctx.db, ctx.club, ctx.user.id);
  return role === "owner" || role === "manager";
}

function isOwner(ctx) {
  return memberRole(ctx.db, ctx.club, ctx.user.id) === "owner";
}

function ensureTiers(db, clubId) {
  const rows = db.prepare("SELECT min_people, points, sort FROM meetup_tiers WHERE club_id = ? ORDER BY sort, min_people").all(clubId);
  if (rows.length) return rows;
  const defaults = [
    [3, 1],
    [5, 2],
    [8, 3]
  ];
  const insert = db.prepare("INSERT INTO meetup_tiers (club_id, min_people, points, sort) VALUES (?, ?, ?, ?)");
  defaults.forEach((row, index) => insert.run(clubId, row[0], row[1], index));
  return defaults.map((row, index) => ({ min_people: row[0], points: row[1], sort: index }));
}

function tierFor(tiers, count) {
  let found = null;
  for (const tier of tiers) {
    if (count >= tier.min_people) found = tier;
  }
  return found;
}

function clearAwards(db, clubId, pattern) {
  db.prepare("DELETE FROM point_entries WHERE club_id = ? AND ref_key GLOB ?").run(clubId, pattern);
}

function settleDay(db, clubId, runOn) {
  if (!dayEnded(runOn)) return;
  const tiers = ensureTiers(db, clubId);
  const meetups = db.prepare("SELECT * FROM meetups WHERE club_id = ? AND run_on = ? AND status != 'void' ORDER BY id").all(clubId, runOn);
  const minPeople = tiers[0] ? tiers[0].min_people : 3;
  const prepared = meetups.map((meetup) => {
    const checks = db.prepare("SELECT user_id FROM meetup_checks WHERE meetup_id = ?").all(meetup.id).map((row) => row.user_id);
    const photos = db.prepare("SELECT COUNT(*) AS n FROM meetup_photos WHERE meetup_id = ?").get(meetup.id).n;
    const tier = tierFor(tiers, checks.length);
    return { meetup, checks, photos, tier, qualifies: photos >= 1 && !!tier };
  });
  let winner = null;
  for (const item of prepared) {
    if (!item.qualifies) continue;
    if (!winner || item.checks.length > winner.checks.length || (item.checks.length === winner.checks.length && item.meetup.id < winner.meetup.id)) {
      winner = item;
    }
  }
  const now = new Date().toISOString();
  const insert = db.prepare(
    "INSERT INTO point_entries (club_id, user_id, delta, reason, ref_key, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const item of prepared) {
    clearAwards(db, clubId, "meet:" + item.meetup.id + ":*");
    let status = "short";
    let award = 0;
    if (item.checks.length < minPeople) status = "short";
    else if (item.photos < 1) status = "nophoto";
    else if (winner && winner.meetup.id !== item.meetup.id) status = "held";
    else {
      status = "scored";
      award = item.tier ? item.tier.points : 0;
    }
    db.prepare("UPDATE meetups SET status = ?, award = ? WHERE id = ?").run(status, award, item.meetup.id);
    if (status === "scored") {
      for (const userId of item.checks) {
        insert.run(clubId, userId, award, monthDay(item.meetup.run_on) + " " + item.meetup.place + " 约跑", "meet:" + item.meetup.id + ":" + userId, now);
      }
    } else if (status === "held") {
      for (const userId of item.checks) {
        insert.run(clubId, userId, 0, "当天已在另一场记过", "meet:" + item.meetup.id + ":" + userId, now);
      }
    }
  }
}

function refreshOpen(db, clubId) {
  const dates = db.prepare("SELECT DISTINCT run_on FROM meetups WHERE club_id = ? AND status = 'open'").all(clubId);
  for (const row of dates) {
    if (dayEnded(row.run_on)) settleDay(db, clubId, row.run_on);
  }
}

function peopleOf(db, meetupId, table) {
  return db
    .prepare(
      `SELECT u.id AS userId, u.nickname
       FROM ${table} x
       JOIN users u ON u.id = x.user_id
       WHERE x.meetup_id = ?
       ORDER BY u.nickname`
    )
    .all(meetupId);
}

function presentMeetup(db, club, meetup, userId, staff) {
  const tiers = ensureTiers(db, club.id);
  const joins = peopleOf(db, meetup.id, "meetup_joins");
  const checks = peopleOf(db, meetup.id, "meetup_checks");
  const photos = db
    .prepare(
      `SELECT p.id, u.nickname, p.user_id AS userId
       FROM meetup_photos p
       JOIN users u ON u.id = p.user_id
       WHERE p.meetup_id = ?
       ORDER BY p.id`
    )
    .all(meetup.id);
  const joined = joins.some((row) => row.userId === userId);
  const checked = checks.some((row) => row.userId === userId);
  const today = meetup.run_on === beijingToday();
  const open = meetup.status !== "void";
  let hint = monthDay(meetup.run_on) + " " + meetup.place + "。先点算我一个。当天打卡并上传合影才记分。";
  if (meetup.status === "void") hint = "已作废。";
  else if (!dayEnded(meetup.run_on)) {
    const tier = tierFor(tiers, checks.length);
    const minPeople = tiers[0] ? tiers[0].min_people : 3;
    if (checks.length < minPeople) hint = "现在 " + checks.length + " 人已打卡。满 " + minPeople + " 人才记分。";
    else if (!photos.length) hint = "现在 " + checks.length + " 人已打卡，还没有合影。今晚结算后这场不计分。";
    else hint = "现在 " + checks.length + " 人已打卡，有合影。今晚结算后每人 " + (tier ? tier.points : 0) + " 分。";
  } else if (meetup.status === "scored") hint = "已记分，每人 " + meetup.award + " 分。";
  else if (meetup.status === "held") hint = "当天已在另一场记过。";
  else hint = (MEET_LABEL[meetup.status] || "这场") + "。";
  const first = tiers[0] ? tiers[0].min_people : 3;
  return {
    id: meetup.id,
    date: meetup.run_on,
    dateLabel: monthDay(meetup.run_on),
    place: meetup.place,
    note: meetup.note,
    status: meetup.status,
    statusLabel: MEET_LABEL[meetup.status] || meetup.status,
    checkCount: checks.length,
    award: meetup.award,
    hint,
    shareText: club.name + " · " + monthDay(meetup.run_on) + " " + meetup.place + "约跑\n打开跑团的「约跑」，点「算我一个」。当天打卡并上传合影，满 " + first + " 人当晚记分。",
    joins: joins.map((row) => ({ ...row, mine: row.userId === userId })),
    checks: checks.map((row) => ({ ...row, mine: row.userId === userId })),
    photos: photos.map((row) => ({ id: row.id, nickname: row.nickname, mine: row.userId === userId })),
    joined,
    checked,
    canJoin: open && !dayEnded(meetup.run_on) && !joined,
    canLeave: open && !dayEnded(meetup.run_on) && joined,
    canCheck: open && today && !checked,
    canUncheck: open && today && checked,
    canPhoto: open && photos.length < 9 && ((today && (joined || checked)) || (staff && staffWindow(meetup.run_on))),
    canStaff: staff && open && staffWindow(meetup.run_on),
    canVoid: staff && open,
    tiers: tiers.map((row) => ({ minPeople: row.min_people, points: row.points }))
  };
}

function meetupOr404(ctx, res) {
  refreshOpen(ctx.db, ctx.club.id);
  const meetup = ctx.db.prepare("SELECT * FROM meetups WHERE id = ? AND club_id = ?").get(reqId(ctx), ctx.club.id);
  if (!meetup) {
    res.status(404).json({ error: "没有这场约跑" });
    return null;
  }
  return meetup;
}

function reqId(ctx) {
  return ctx.req.params.mid;
}

function memberId(db, clubId, userId) {
  return db.prepare("SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?").get(clubId, userId);
}

function awardInternal(db, clubId, race) {
  clearAwards(db, clubId, "inner:" + race.id + ":*");
  if (!race.ended_at || race.cancelled_at || !race.finish_points) return;
  const finishers = db.prepare("SELECT user_id FROM internal_results WHERE race_id = ? AND outcome = 'finish'").all(race.id);
  const now = new Date().toISOString();
  const insert = db.prepare(
    "INSERT INTO point_entries (club_id, user_id, delta, reason, ref_key, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const row of finishers) {
    insert.run(clubId, row.user_id, race.finish_points, race.title, "inner:" + race.id + ":" + row.user_id, now);
  }
}

function raceStatus(race) {
  if (race.cancelled_at) return "cancelled";
  if (race.ended_at) return "ended";
  if (Date.now() > instant(race.deadline)) return "closed";
  return "open";
}

function distanceLabel(race) {
  if (race.distance === "other") return String(race.other_km) + "公里";
  return DISTANCE_LABEL[race.distance] || race.distance;
}

function sameDistance(left, right) {
  if (left.distance !== right.distance) return false;
  if (left.distance !== "other") return true;
  return Number(left.other_km) === Number(right.other_km);
}

function earlier(left, right) {
  if (left.starts_at !== right.starts_at) return left.starts_at < right.starts_at;
  return left.id < right.id;
}

function presentInternal(db, club, race, userId, staff) {
  const groups = db.prepare("SELECT id, name, capacity, sort FROM internal_groups WHERE race_id = ? ORDER BY sort, id").all(race.id);
  const signups = db
    .prepare(
      `SELECT s.user_id AS userId, s.group_id AS groupId, u.nickname
       FROM internal_signups s
       JOIN users u ON u.id = s.user_id
       WHERE s.race_id = ?
       ORDER BY u.nickname`
    )
    .all(race.id);
  const results = db.prepare("SELECT user_id AS userId, outcome, seconds FROM internal_results WHERE race_id = ?").all(race.id);
  const resultOf = {};
  for (const row of results) resultOf[row.userId] = row;
  const previous = db
    .prepare(
      `SELECT race.id, race.starts_at, race.distance, race.other_km, r.user_id AS userId, r.seconds
       FROM internal_results r
       JOIN internal_races race ON race.id = r.race_id
       WHERE race.club_id = ? AND r.outcome = 'finish' AND r.seconds IS NOT NULL AND race.id != ?`
    )
    .all(club.id, race.id)
    .filter((row) => sameDistance(row, race) && earlier(row, race));
  const best = {};
  for (const row of previous) {
    if (best[row.userId] == null || row.seconds < best[row.userId]) best[row.userId] = row.seconds;
  }
  const status = raceStatus(race);
  const started = Date.now() >= instant(race.starts_at);
  const mine = signups.find((row) => row.userId === userId) || null;
  const blocks = groups.map((group) => {
    const people = signups.filter((row) => row.groupId === group.id);
    const rows = people
      .map((person) => {
        const result = resultOf[person.userId];
        const outcome = result ? result.outcome : "";
        const seconds = result && result.outcome === "finish" ? result.seconds : null;
        let tag = "";
        if (seconds != null && best[person.userId] != null && seconds < best[person.userId]) tag = "个人最好";
        return {
          userId: person.userId,
          nickname: person.nickname,
          mine: person.userId === userId,
          outcome: outcome || "pending",
          outcomeLabel: outcome === "finish" ? "" : outcome === "dnf" ? "未完赛" : outcome === "dns" ? "未出发" : "",
          seconds,
          clock: seconds != null ? formatClock(seconds) : "",
          tag
        };
      })
      .sort((a, b) => {
        const rank = (row) => (row.outcome === "finish" ? 0 : row.outcome === "dnf" ? 1 : row.outcome === "dns" ? 2 : 3);
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        if (a.seconds != null && b.seconds != null && a.seconds !== b.seconds) return a.seconds - b.seconds;
        return a.nickname.localeCompare(b.nickname, "zh");
      });
    let place = 0;
    for (const row of rows) {
      if (row.outcome === "finish") row.place = ++place;
      else row.place = "";
    }
    const taken = people.length;
    return {
      id: group.id,
      name: group.name,
      capacity: group.capacity,
      taken,
      full: group.capacity > 0 && taken >= group.capacity,
      rows
    };
  });
  const seats = blocks.map((group) => group.name + " " + (group.capacity ? "剩 " + Math.max(0, group.capacity - group.taken) : "不限")).join(" · ");
  return {
    id: race.id,
    title: race.title,
    place: race.place,
    startsAt: race.starts_at,
    startsLabel: stampLabel(race.starts_at),
    deadline: race.deadline,
    deadlineLabel: stampLabel(race.deadline),
    distance: race.distance,
    otherKm: race.other_km,
    distanceLabel: distanceLabel(race),
    note: race.note,
    finishPoints: race.finish_points,
    status,
    statusLabel: RACE_LABEL[status] || status,
    signupCount: signups.length,
    groups: blocks,
    mine: mine ? { groupId: mine.groupId, ...(resultOf[userId] ? { outcome: resultOf[userId].outcome, clock: resultOf[userId].seconds ? formatClock(resultOf[userId].seconds) : "" } : {}) } : null,
    canSignup: status === "open" && !mine,
    canCancel: status === "open" && !!mine,
    canResult: started && !race.cancelled_at && !!mine && !race.ended_at,
    canStaffResult: staff && started && !race.cancelled_at,
    canEnd: staff && started && !race.ended_at && !race.cancelled_at,
    canCancelRace: staff && !race.cancelled_at,
    shareText: club.name + " · " + race.title + "\n" + stampLabel(race.starts_at) + (race.place ? " · " + race.place : "") + "\n" + seats + "\n报名截止 " + stampLabel(race.deadline) + "。",
    staff
  };
}

function listInternal(db, clubId) {
  return db
    .prepare("SELECT * FROM internal_races WHERE club_id = ? ORDER BY starts_at DESC, id DESC")
    .all(clubId)
    .map((race) => {
      const count = db.prepare("SELECT COUNT(*) AS n FROM internal_signups WHERE race_id = ?").get(race.id).n;
      const status = raceStatus(race);
      return {
        id: race.id,
        title: race.title,
        place: race.place,
        startsLabel: stampLabel(race.starts_at),
        distanceLabel: distanceLabel(race),
        status,
        statusLabel: RACE_LABEL[status] || status,
        signupCount: count
      };
    });
}

function mountClubGather(app, { BASE, getDb, userFrom }) {
  function open(req, res) {
    const ctx = gate(req, res, userFrom, getDb);
    if (!ctx) return null;
    ctx.req = req;
    return ctx;
  }

  app.get(BASE + "/api/clubs/:id/meetups", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    refreshOpen(ctx.db, ctx.club.id);
    const tiers = ensureTiers(ctx.db, ctx.club.id);
    const meetups = ctx.db
      .prepare("SELECT * FROM meetups WHERE club_id = ? ORDER BY run_on DESC, id DESC")
      .all(ctx.club.id)
      .map((row) => {
        const checkCount = ctx.db.prepare("SELECT COUNT(*) AS n FROM meetup_checks WHERE meetup_id = ?").get(row.id).n;
        return {
          id: row.id,
          date: row.run_on,
          dateLabel: monthDay(row.run_on),
          place: row.place,
          checkCount,
          status: row.status,
          statusLabel: MEET_LABEL[row.status] || row.status
        };
      });
    res.json({
      meetups,
      tiers: tiers.map((row) => ({ minPeople: row.min_people, points: row.points }))
    });
  });

  app.put(BASE + "/api/clubs/:id/meetup-tiers", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    if (!isOwner(ctx)) return res.status(403).json({ error: "只有团长可以改约跑积分" });
    const input = Array.isArray(req.body && req.body.tiers) ? req.body.tiers : [];
    if (input.length < 1 || input.length > 6) return res.status(400).json({ error: "约跑积分留 1 到 6 档" });
    const tiers = [];
    for (const item of input) {
      const minPeople = Number(item && item.minPeople);
      const points = Number(item && item.points);
      if (!Number.isInteger(minPeople) || minPeople < 3 || minPeople > 500) return res.status(400).json({ error: "第一档不能少于 3 人" });
      if (!Number.isInteger(points) || points < 0 || points > 20) return res.status(400).json({ error: "每档积分是 0 到 20 的整数" });
      if (tiers.length && minPeople <= tiers[tiers.length - 1].minPeople) return res.status(400).json({ error: "人数要一档比一档多" });
      tiers.push({ minPeople, points });
    }
    if (tiers[0].minPeople < 3) return res.status(400).json({ error: "第一档不能少于 3 人" });
    ctx.db.transaction(() => {
      ctx.db.prepare("DELETE FROM meetup_tiers WHERE club_id = ?").run(ctx.club.id);
      const insert = ctx.db.prepare("INSERT INTO meetup_tiers (club_id, min_people, points, sort) VALUES (?, ?, ?, ?)");
      tiers.forEach((tier, index) => insert.run(ctx.club.id, tier.minPeople, tier.points, index));
    })();
    res.json({ tiers });
  });

  app.post(BASE + "/api/clubs/:id/meetups", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    const date = String((req.body && req.body.date) || "").trim();
    const place = String((req.body && req.body.place) || "").trim();
    const note = String((req.body && req.body.note) || "").trim();
    if (!validDate(date)) return res.status(400).json({ error: "日期用 2026-10-22 这种格式" });
    if (date < beijingToday()) return res.status(400).json({ error: "不能约昨天" });
    if (!place || place.length > 40) return res.status(400).json({ error: "地点用 1 到 40 个字" });
    if (note.length > 100) return res.status(400).json({ error: "说明不超过 100 个字" });
    const info = ctx.db
      .prepare("INSERT INTO meetups (club_id, run_on, place, note, status, award, created_at) VALUES (?, ?, ?, ?, 'open', 0, ?)")
      .run(ctx.club.id, date, place, note, new Date().toISOString());
    const meetup = ctx.db.prepare("SELECT * FROM meetups WHERE id = ?").get(info.lastInsertRowid);
    res.json({ meetup: presentMeetup(ctx.db, ctx.club, meetup, ctx.user.id, isStaff(ctx)) });
  });

  app.get(BASE + "/api/clubs/:id/meetups/:mid", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    const meetup = meetupOr404(ctx, res);
    if (!meetup) return;
    res.json({ meetup: presentMeetup(ctx.db, ctx.club, meetup, ctx.user.id, isStaff(ctx)) });
  });

  app.post(BASE + "/api/clubs/:id/meetups/:mid/join", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    const meetup = meetupOr404(ctx, res);
    if (!meetup) return;
    if (meetup.status === "void") return res.status(400).json({ error: "这场已经作废" });
    if (dayEnded(meetup.run_on)) return res.status(400).json({ error: "这一天已经过了" });
    try {
      ctx.db.prepare("INSERT INTO meetup_joins (meetup_id, user_id, created_at) VALUES (?, ?, ?)").run(meetup.id, ctx.user.id, new Date().toISOString());
    } catch (err) {
      if (/UNIQUE/i.test(String(err.message))) return res.status(400).json({ error: "你已经算上了" });
      throw err;
    }
    const next = ctx.db.prepare("SELECT * FROM meetups WHERE id = ?").get(meetup.id);
    res.json({ meetup: presentMeetup(ctx.db, ctx.club, next, ctx.user.id, isStaff(ctx)) });
  });

  app.delete(BASE + "/api/clubs/:id/meetups/:mid/join", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    const meetup = meetupOr404(ctx, res);
    if (!meetup) return;
    if (dayEnded(meetup.run_on) || meetup.status === "void") return res.status(400).json({ error: "这一天已经过了" });
    ctx.db.prepare("DELETE FROM meetup_joins WHERE meetup_id = ? AND user_id = ?").run(meetup.id, ctx.user.id);
    const next = ctx.db.prepare("SELECT * FROM meetups WHERE id = ?").get(meetup.id);
    res.json({ meetup: presentMeetup(ctx.db, ctx.club, next, ctx.user.id, isStaff(ctx)) });
  });

  function checkUser(ctx, meetup, res) {
    if (meetup.status === "void") {
      res.status(400).json({ error: "这场已经作废" });
      return 0;
    }
    const staff = isStaff(ctx);
    const requested = Number(ctx.req.body && ctx.req.body.userId);
    const userId = staff && requested ? requested : ctx.user.id;
    if (!memberId(ctx.db, ctx.club.id, userId)) {
      res.status(400).json({ error: "这个人不是本团的" });
      return 0;
    }
    const onDay = meetup.run_on === beijingToday();
    const backfill = staff && staffWindow(meetup.run_on);
    if (!(onDay || backfill)) {
      const late = dayEnded(meetup.run_on);
      res.status(400).json({ error: late ? "已经过了可以补记的 7 天" : "当天才能打卡" });
      return 0;
    }
    return userId;
  }

  app.post(BASE + "/api/clubs/:id/meetups/:mid/check", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    const meetup = meetupOr404(ctx, res);
    if (!meetup) return;
    const userId = checkUser(ctx, meetup, res);
    if (!userId) return;
    try {
      ctx.db.prepare("INSERT INTO meetup_checks (meetup_id, user_id, created_at) VALUES (?, ?, ?)").run(meetup.id, userId, new Date().toISOString());
    } catch (err) {
      if (/UNIQUE/i.test(String(err.message))) return res.status(400).json({ error: "已经打过卡" });
      throw err;
    }
    if (dayEnded(meetup.run_on)) settleDay(ctx.db, ctx.club.id, meetup.run_on);
    const next = ctx.db.prepare("SELECT * FROM meetups WHERE id = ?").get(meetup.id);
    res.json({ meetup: presentMeetup(ctx.db, ctx.club, next, ctx.user.id, isStaff(ctx)) });
  });

  app.delete(BASE + "/api/clubs/:id/meetups/:mid/check", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    const meetup = meetupOr404(ctx, res);
    if (!meetup) return;
    const staff = isStaff(ctx);
    const requested = Number(req.body && req.body.userId);
    const userId = staff && requested ? requested : ctx.user.id;
    const onDay = meetup.run_on === beijingToday();
    if (meetup.status === "void") return res.status(400).json({ error: "这场已经作废" });
    if (!(onDay || (staff && staffWindow(meetup.run_on)))) return res.status(400).json({ error: "已经过了可以补记的 7 天" });
    ctx.db.prepare("DELETE FROM meetup_checks WHERE meetup_id = ? AND user_id = ?").run(meetup.id, userId);
    if (dayEnded(meetup.run_on)) settleDay(ctx.db, ctx.club.id, meetup.run_on);
    const next = ctx.db.prepare("SELECT * FROM meetups WHERE id = ?").get(meetup.id);
    res.json({ meetup: presentMeetup(ctx.db, ctx.club, next, ctx.user.id, staff) });
  });

  app.post(BASE + "/api/clubs/:id/meetups/:mid/photos", async (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    const meetup = meetupOr404(ctx, res);
    if (!meetup) return;
    if (meetup.status === "void") return res.status(400).json({ error: "这场已经作废" });
    const staff = isStaff(ctx);
    const count = ctx.db.prepare("SELECT COUNT(*) AS n FROM meetup_photos WHERE meetup_id = ?").get(meetup.id).n;
    if (count >= 9) return res.status(400).json({ error: "合影最多 9 张" });
    const today = meetup.run_on === beijingToday();
    const joined = ctx.db.prepare("SELECT 1 FROM meetup_joins WHERE meetup_id = ? AND user_id = ?").get(meetup.id, ctx.user.id);
    const checked = ctx.db.prepare("SELECT 1 FROM meetup_checks WHERE meetup_id = ? AND user_id = ?").get(meetup.id, ctx.user.id);
    const backfill = staff && staffWindow(meetup.run_on);
    if (!backfill && !(today && (joined || checked))) {
      if (!today && !dayEnded(meetup.run_on)) return res.status(400).json({ error: "当天再传合影" });
      if (today) return res.status(400).json({ error: "先算我一个，或先打卡，再传合影" });
      return res.status(400).json({ error: "已经过了可以补记的 7 天" });
    }
    let buffer;
    try {
      buffer = oneFile(await readBody(req, PHOTO_MAX + 64 * 1024), req.get("content-type"));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.status === 413 ? "照片不超过 8MB" : "没有读到文件" });
    }
    if (!buffer || !buffer.length) return res.status(400).json({ error: "没有读到文件" });
    const photo = sniffPhoto(buffer);
    if (!photo) return res.status(400).json({ error: "只收 jpg、png、webp" });
    if (buffer.length > PHOTO_MAX) return res.status(413).json({ error: "照片不超过 8MB" });
    const info = ctx.db
      .prepare("INSERT INTO meetup_photos (meetup_id, user_id, filename, created_at) VALUES (?, ?, '', ?)")
      .run(meetup.id, ctx.user.id, new Date().toISOString());
    const id = Number(info.lastInsertRowid);
    const filename = id + "." + photo.ext;
    const dir = path.join(mediaRoot(), "meetups");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buffer);
    ctx.db.prepare("UPDATE meetup_photos SET filename = ? WHERE id = ?").run(filename, id);
    if (dayEnded(meetup.run_on)) settleDay(ctx.db, ctx.club.id, meetup.run_on);
    const next = ctx.db.prepare("SELECT * FROM meetups WHERE id = ?").get(meetup.id);
    res.json({ meetup: presentMeetup(ctx.db, ctx.club, next, ctx.user.id, staff) });
  });

  app.delete(BASE + "/api/clubs/:id/meetups/:mid/photos/:pid", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    const meetup = meetupOr404(ctx, res);
    if (!meetup) return;
    const photo = ctx.db.prepare("SELECT * FROM meetup_photos WHERE id = ? AND meetup_id = ?").get(req.params.pid, meetup.id);
    if (!photo) return res.status(404).json({ error: "没有这张合影" });
    const staff = isStaff(ctx);
    const today = meetup.run_on === beijingToday();
    if (photo.user_id !== ctx.user.id && !staff) return res.status(403).json({ error: "只能删自己的合影" });
    if (!(today || (staff && staffWindow(meetup.run_on)))) return res.status(400).json({ error: "已经过了可以补记的 7 天" });
    ctx.db.prepare("DELETE FROM meetup_photos WHERE id = ?").run(photo.id);
    if (photo.filename) {
      const file = path.join(mediaRoot(), "meetups", photo.filename);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    if (dayEnded(meetup.run_on)) settleDay(ctx.db, ctx.club.id, meetup.run_on);
    const next = ctx.db.prepare("SELECT * FROM meetups WHERE id = ?").get(meetup.id);
    res.json({ meetup: presentMeetup(ctx.db, ctx.club, next, ctx.user.id, staff) });
  });

  app.get(BASE + "/api/clubs/:id/meetups/:mid/photos/:pid", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    const photo = ctx.db
      .prepare(
        `SELECT p.filename FROM meetup_photos p
         JOIN meetups m ON m.id = p.meetup_id
         WHERE p.id = ? AND m.id = ? AND m.club_id = ?`
      )
      .get(req.params.pid, req.params.mid, ctx.club.id);
    if (!photo || !photo.filename) return res.status(404).json({ error: "没有这张合影" });
    const file = path.join(mediaRoot(), "meetups", path.basename(photo.filename));
    if (!fs.existsSync(file)) return res.status(404).json({ error: "没有这张合影" });
    const buf = fs.readFileSync(file);
    const kind = sniffPhoto(buf);
    if (!kind) return res.status(404).json({ error: "没有这张合影" });
    res.set("Content-Type", kind.mime);
    res.set("Cache-Control", "private, max-age=3600");
    res.send(buf);
  });

  app.post(BASE + "/api/clubs/:id/meetups/:mid/void", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    if (!isStaff(ctx)) return res.status(403).json({ error: "只有团长或跑团管理可以作废" });
    const meetup = meetupOr404(ctx, res);
    if (!meetup) return;
    if (meetup.status === "void") return res.status(400).json({ error: "这场已经作废" });
    const awards = ctx.db.prepare("SELECT user_id, delta FROM point_entries WHERE club_id = ? AND ref_key GLOB ?").all(ctx.club.id, "meet:" + meetup.id + ":*");
    const now = new Date().toISOString();
    const insert = ctx.db.prepare(
      "INSERT INTO point_entries (club_id, user_id, delta, reason, ref_key, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const row of awards) {
      if (!row.delta) continue;
      const key = "meet-void:" + meetup.id + ":" + row.user_id;
      if (ctx.db.prepare("SELECT 1 FROM point_entries WHERE ref_key = ?").get(key)) continue;
      insert.run(ctx.club.id, row.user_id, -row.delta, "约跑作废", key, now);
    }
    ctx.db.prepare("UPDATE meetups SET status = 'void' WHERE id = ?").run(meetup.id);
    if (dayEnded(meetup.run_on)) settleDay(ctx.db, ctx.club.id, meetup.run_on);
    const next = ctx.db.prepare("SELECT * FROM meetups WHERE id = ?").get(meetup.id);
    res.json({ meetup: presentMeetup(ctx.db, ctx.club, next, ctx.user.id, true) });
  });

  app.post(BASE + "/api/clubs/:id/meetups/:mid/resettle", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    if (!isStaff(ctx)) return res.status(403).json({ error: "只有团长或跑团管理可以重算" });
    const meetup = meetupOr404(ctx, res);
    if (!meetup) return;
    if (meetup.status === "void") return res.status(400).json({ error: "这场已经作废" });
    if (!dayEnded(meetup.run_on)) return res.status(400).json({ error: "还没到结算时间" });
    if (!staffWindow(meetup.run_on)) return res.status(400).json({ error: "已经过了可以补记的 7 天" });
    settleDay(ctx.db, ctx.club.id, meetup.run_on);
    const next = ctx.db.prepare("SELECT * FROM meetups WHERE id = ?").get(meetup.id);
    res.json({ meetup: presentMeetup(ctx.db, ctx.club, next, ctx.user.id, true) });
  });

  app.get(BASE + "/api/clubs/:id/internals", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    res.json({ races: listInternal(ctx.db, ctx.club.id) });
  });

  app.post(BASE + "/api/clubs/:id/internals", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    if (!isStaff(ctx)) return res.status(403).json({ error: "只有团长或跑团管理可以发队内赛" });
    const body = req.body || {};
    const title = String(body.title || "").trim();
    const place = String(body.place || "").trim();
    const note = String(body.note || "").trim();
    const startsAt = parseWhen(body.startsAt);
    const deadline = body.deadline ? parseWhen(body.deadline) : startsAt;
    const distance = String(body.distance || "").trim();
    const finishPoints = body.finishPoints == null || body.finishPoints === "" ? 0 : Number(body.finishPoints);
    const groups = Array.isArray(body.groups) ? body.groups : [];
    if (!title || title.length > 40) return res.status(400).json({ error: "名称用 1 到 40 个字" });
    if (place.length > 40) return res.status(400).json({ error: "地点不超过 40 个字" });
    if (note.length > 500) return res.status(400).json({ error: "说明不超过 500 个字" });
    if (!startsAt) return res.status(400).json({ error: "开赛时间写成 2026-11-01 08:00" });
    if (!deadline) return res.status(400).json({ error: "报名截止写成 2026-11-01 08:00" });
    if (instant(deadline) > instant(startsAt)) return res.status(400).json({ error: "报名截止不能晚于开赛" });
    if (!DISTANCES.includes(distance)) return res.status(400).json({ error: "距离选全马、半马、10公里、5公里，或其他公里数" });
    let otherKm = null;
    if (distance === "other") {
      otherKm = Math.round(Number(body.otherKm) * 100) / 100;
      if (!Number.isFinite(otherKm) || otherKm < 1 || otherKm > 100) return res.status(400).json({ error: "其他距离用 1 到 100 公里" });
    }
    if (!Number.isInteger(finishPoints) || finishPoints < 0 || finishPoints > 20) return res.status(400).json({ error: "完赛积分是 0 到 20 的整数" });
    if (groups.length < 1 || groups.length > 12) return res.status(400).json({ error: "至少有一个组别" });
    const cleaned = [];
    const names = new Set();
    for (const group of groups) {
      const name = String((group && group.name) || "").trim();
      const capacity = Number(group && group.capacity);
      if (!name || name.length > 20) return res.status(400).json({ error: "组别名称用 1 到 20 个字" });
      if (names.has(name)) return res.status(400).json({ error: "组别名称不要重复" });
      if (!Number.isInteger(capacity) || capacity < 0 || capacity > 500) return res.status(400).json({ error: "组别人数写成 0 到 500，0 表示不限" });
      names.add(name);
      cleaned.push({ name, capacity });
    }
    const now = new Date().toISOString();
    const info = ctx.db.transaction(() => {
      const created = ctx.db
        .prepare(
          `INSERT INTO internal_races (club_id, title, place, starts_at, deadline, distance, other_km, note, finish_points, ended_at, cancelled_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?)`
        )
        .run(ctx.club.id, title, place, startsAt, deadline, distance, otherKm, note, finishPoints, now);
      const insert = ctx.db.prepare("INSERT INTO internal_groups (race_id, name, capacity, sort) VALUES (?, ?, ?, ?)");
      cleaned.forEach((group, index) => insert.run(created.lastInsertRowid, group.name, group.capacity, index));
      return Number(created.lastInsertRowid);
    })();
    const race = ctx.db.prepare("SELECT * FROM internal_races WHERE id = ?").get(info);
    res.json({ race: presentInternal(ctx.db, ctx.club, race, ctx.user.id, true) });
  });

  function loadRace(ctx, res) {
    const race = ctx.db.prepare("SELECT * FROM internal_races WHERE id = ? AND club_id = ?").get(ctx.req.params.rid, ctx.club.id);
    if (!race) {
      res.status(404).json({ error: "没有这场队内赛" });
      return null;
    }
    return race;
  }

  app.get(BASE + "/api/clubs/:id/internals/:rid", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    const race = loadRace(ctx, res);
    if (!race) return;
    res.json({ race: presentInternal(ctx.db, ctx.club, race, ctx.user.id, isStaff(ctx)) });
  });

  app.post(BASE + "/api/clubs/:id/internals/:rid/signup", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    const result = ctx.db.transaction(() => {
      const race = ctx.db.prepare("SELECT * FROM internal_races WHERE id = ? AND club_id = ?").get(req.params.rid, ctx.club.id);
      if (!race) return { status: 404, error: "没有这场队内赛" };
      if (raceStatus(race) !== "open") return { status: 400, error: race.cancelled_at ? "这场已经取消" : "报名已经截止" };
      const blocked = feeBlocksSignup(ctx.db, ctx.club.id, ctx.user.id);
      if (blocked) return { status: 400, error: blocked };
      const existing = ctx.db.prepare("SELECT 1 FROM internal_signups WHERE race_id = ? AND user_id = ?").get(race.id, ctx.user.id);
      if (existing) return { status: 400, error: "你已经报过了，要换组先取消" };
      const groupId = Number(req.body && req.body.groupId);
      const group = ctx.db.prepare("SELECT * FROM internal_groups WHERE id = ? AND race_id = ?").get(groupId, race.id);
      if (!group) return { status: 400, error: "先选一个组别" };
      if (group.capacity > 0) {
        const taken = ctx.db.prepare("SELECT COUNT(*) AS n FROM internal_signups WHERE race_id = ? AND group_id = ?").get(race.id, group.id).n;
        if (taken >= group.capacity) return { status: 400, error: "这一组满了" };
      }
      ctx.db.prepare("INSERT INTO internal_signups (race_id, user_id, group_id, created_at) VALUES (?, ?, ?, ?)").run(race.id, ctx.user.id, group.id, new Date().toISOString());
      return { race };
    }).immediate();
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ race: presentInternal(ctx.db, ctx.club, result.race, ctx.user.id, isStaff(ctx)) });
  });

  app.delete(BASE + "/api/clubs/:id/internals/:rid/signup", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    const race = loadRace(ctx, res);
    if (!race) return;
    if (raceStatus(race) !== "open") return res.status(400).json({ error: "报名已经截止" });
    ctx.db.prepare("DELETE FROM internal_signups WHERE race_id = ? AND user_id = ?").run(race.id, ctx.user.id);
    ctx.db.prepare("DELETE FROM internal_results WHERE race_id = ? AND user_id = ?").run(race.id, ctx.user.id);
    res.json({ race: presentInternal(ctx.db, ctx.club, race, ctx.user.id, isStaff(ctx)) });
  });

  app.post(BASE + "/api/clubs/:id/internals/:rid/results", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    const race = loadRace(ctx, res);
    if (!race) return;
    if (race.cancelled_at) return res.status(400).json({ error: "这场已经取消" });
    if (Date.now() < instant(race.starts_at)) return res.status(400).json({ error: "还没开赛" });
    const staff = isStaff(ctx);
    if (race.ended_at && !staff) return res.status(400).json({ error: "这场已经结束" });
    const requested = Number(req.body && req.body.userId);
    const userId = staff && requested ? requested : ctx.user.id;
    if (!memberId(ctx.db, ctx.club.id, userId)) return res.status(400).json({ error: "这个人不是本团的" });
    const signed = ctx.db.prepare("SELECT 1 FROM internal_signups WHERE race_id = ? AND user_id = ?").get(race.id, userId);
    if (!signed) return res.status(400).json({ error: "只有报了名的人能填" });
    const outcome = String((req.body && req.body.outcome) || "").trim();
    let stored = "finish";
    let seconds = null;
    if (outcome === "dnf") stored = "dnf";
    else if (outcome === "dns") {
      if (!staff) return res.status(403).json({ error: "未出发只能由团长或跑团管理标" });
      stored = "dns";
    } else {
      seconds = parseClock(req.body && req.body.time);
      if (seconds == null) return res.status(400).json({ error: "成绩写成 45:30 或 3:29:59" });
    }
    ctx.db
      .prepare(
        `INSERT INTO internal_results (race_id, user_id, outcome, seconds, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(race_id, user_id) DO UPDATE SET outcome = excluded.outcome, seconds = excluded.seconds, updated_at = excluded.updated_at`
      )
      .run(race.id, userId, stored, seconds, new Date().toISOString());
    if (race.ended_at) awardInternal(ctx.db, ctx.club.id, race);
    res.json({ race: presentInternal(ctx.db, ctx.club, race, ctx.user.id, staff) });
  });

  app.post(BASE + "/api/clubs/:id/internals/:rid/end", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    if (!isStaff(ctx)) return res.status(403).json({ error: "只有团长或跑团管理可以结束" });
    const race = loadRace(ctx, res);
    if (!race) return;
    if (race.cancelled_at) return res.status(400).json({ error: "这场已经取消" });
    if (Date.now() < instant(race.starts_at)) return res.status(400).json({ error: "还没开赛" });
    if (!race.ended_at) ctx.db.prepare("UPDATE internal_races SET ended_at = ? WHERE id = ?").run(new Date().toISOString(), race.id);
    const next = ctx.db.prepare("SELECT * FROM internal_races WHERE id = ?").get(race.id);
    awardInternal(ctx.db, ctx.club.id, next);
    res.json({ race: presentInternal(ctx.db, ctx.club, next, ctx.user.id, true) });
  });

  app.post(BASE + "/api/clubs/:id/internals/:rid/cancel", (req, res) => {
    const ctx = open(req, res);
    if (!ctx) return;
    if (!isStaff(ctx)) return res.status(403).json({ error: "只有团长或跑团管理可以取消" });
    const race = loadRace(ctx, res);
    if (!race) return;
    if (race.cancelled_at) return res.status(400).json({ error: "这场已经取消" });
    const awards = ctx.db.prepare("SELECT user_id, delta FROM point_entries WHERE club_id = ? AND ref_key GLOB ?").all(ctx.club.id, "inner:" + race.id + ":*");
    const now = new Date().toISOString();
    const insert = ctx.db.prepare(
      "INSERT INTO point_entries (club_id, user_id, delta, reason, ref_key, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const row of awards) {
      if (!row.delta) continue;
      const key = "inner-void:" + race.id + ":" + row.user_id;
      if (ctx.db.prepare("SELECT 1 FROM point_entries WHERE ref_key = ?").get(key)) continue;
      insert.run(ctx.club.id, row.user_id, -row.delta, "队内赛作废", key, now);
    }
    ctx.db.prepare("UPDATE internal_races SET cancelled_at = ? WHERE id = ?").run(now, race.id);
    const next = ctx.db.prepare("SELECT * FROM internal_races WHERE id = ?").get(race.id);
    res.json({ race: presentInternal(ctx.db, ctx.club, next, ctx.user.id, true) });
  });
}

module.exports = { mountClubGather };
