const { avatarUrlOf } = require("./avatars");
const fs = require("fs");
const path = require("path");
const { DISTANCE_LABEL } = require("./races");
const { clubRoleLabel, memberRole, setMemberRole, decideRequest, listPending } = require("./roles");
const { formatClock } = require("./career");
const { feeBlocksSignup } = require("./club-ops");

const PHOTO_MAX = 8 * 1024 * 1024;
const VIDEO_MAX = 40 * 1024 * 1024;
const PHOTO_LIMIT = 400;
const VIDEO_LIMIT = 20;
const LEVELS = [
  { id: "萌新", text: "没参加过，或参加少于 3 次，不了解规则，想体验" },
  { id: "入门", text: "参加过，了解规则，能跟着完成，以娱乐或拍照为主" },
  { id: "进阶", text: "参加过 10 场以上，熟悉规则和基本动作，想提高" },
  { id: "专业", text: "有多年经历，曾是省市、职业俱乐部或高校队成员，参加过市级以上专业赛事" }
];
const KINDS = { pace: "配速组", finish: "完赛组", volunteer: "志愿者", other: "非训练" };
const STATUS_LABEL = { open: "报名中", live: "进行中", ended: "已结束", cancelled: "已取消" };
const RANGE_LABEL = {
  today: "今日",
  week: "本周",
  month: "本月",
  lastMonth: "上月",
  season: "本季",
  year: "今年",
  all: "入团之后"
};

function mediaRoot() {
  return process.env.MARATHON_MEDIA || path.join(__dirname, "../data/media");
}

function ruleText(row) {
  if (!row.points) return "这场不记积分。";
  return `满 ${row.min_people} 人打卡，且每人不少于 ${row.min_km} 公里，才各得 ${row.points} 分。人数不够，这场不计分。`;
}

function beijingInstant(text) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(String(text || ""));
  if (!match) return null;
  const ms = Date.parse(match[1] + "T" + match[2] + ":00+08:00");
  return Number.isNaN(ms) ? null : ms;
}

function beijingStamp(now = Date.now()) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 16);
}

function beijingToday(now = Date.now()) {
  return beijingStamp(now).slice(0, 10);
}

function dateLabel(text) {
  const parts = String(text || "").slice(0, 10).split("-");
  if (parts.length < 3 || !parts[2]) return "";
  return Number(parts[1]) + "月" + Number(parts[2]) + "日";
}

function clockSpan(row) {
  const start = String(row.starts_at || "").slice(11, 16);
  const end = String(row.ends_at || "").slice(11, 16);
  if (start && end) return start + "–" + end;
  return start;
}

function timeLabel(row) {
  const date = dateLabel(row.starts_at);
  const clock = clockSpan(row);
  return [date, clock].filter(Boolean).join(" ");
}

function stampLabel(iso) {
  const ms = Date.parse(iso || "");
  if (Number.isNaN(ms)) return "";
  const shifted = new Date(ms + 8 * 3600 * 1000);
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hour = String(shifted.getUTCHours()).padStart(2, "0");
  const minute = String(shifted.getUTCMinutes()).padStart(2, "0");
  return month + "月" + day + "日 " + hour + ":" + minute;
}

function statusOf(row, now = Date.now()) {
  if (row.cancelled_at) return "cancelled";
  const end = beijingInstant(row.ends_at);
  const start = beijingInstant(row.starts_at);
  if (end != null && now >= end) return "ended";
  if (start != null && now >= start) return "live";
  return "open";
}

function cancelClosed(row, now = Date.now()) {
  const at = beijingInstant(row.cancel_until) || beijingInstant(row.starts_at);
  return at != null && now > at;
}

function signupGroups(db, activity) {
  const own = db
    .prepare("SELECT id, name, kind, pace, capacity FROM activity_groups WHERE activity_id = ? ORDER BY sort, id")
    .all(activity.id);
  if (own.length) return own;
  return db
    .prepare("SELECT id, name, pace, capacity FROM club_groups WHERE club_id = ? ORDER BY sort, id")
    .all(activity.club_id)
    .map((group) => ({ ...group, kind: "pace" }));
}

function capOf(groups) {
  if (!groups.length || groups.some((group) => !group.capacity)) return null;
  return groups.reduce((sum, group) => sum + group.capacity, 0);
}

function signupAction(activity, mine, groups, now = Date.now()) {
  if (mine.signed) {
    if (cancelClosed(activity, now)) return { label: "已经过了取消时间", enabled: false, kind: "cancel" };
    return { label: "取消报名", enabled: true, kind: "cancel" };
  }
  const status = statusOf(activity, now);
  if (status === "cancelled") return { label: "这场已经取消", enabled: false, kind: "signup" };
  if (status === "ended") return { label: "这场已经结束", enabled: false, kind: "signup" };
  if (status === "live") return { label: "已经开始了", enabled: false, kind: "signup" };
  if (groups.length && groups.every((group) => group.capacity > 0 && group.signed >= group.capacity)) {
    return { label: "名额满了", enabled: false, kind: "signup" };
  }
  return { label: "报名", enabled: true, kind: "signup" };
}

function presentActivity(row, extra) {
  const status = statusOf(row);
  return {
    id: row.id,
    title: row.title,
    place: row.place,
    startsAt: row.starts_at,
    endsAt: row.ends_at || "",
    issue: row.issue || "",
    plannedKm: row.planned_km == null ? null : row.planned_km,
    gatherPlace: row.gather_place || "",
    gatherAt: row.gather_at || "",
    route: row.route || "",
    note: row.note,
    minKm: row.min_km,
    minPeople: row.min_people,
    points: row.points,
    rule: ruleText(row),
    cancelUntil: row.cancel_until || "",
    review: !!row.review,
    status,
    statusLabel: STATUS_LABEL[status],
    date: String(row.starts_at || "").slice(0, 10),
    dateLabel: dateLabel(row.starts_at),
    clockLabel: clockSpan(row),
    timeLabel: timeLabel(row),
    ...extra
  };
}

function balanceOf(db, clubId, userId) {
  const row = db.prepare("SELECT COALESCE(SUM(delta), 0) AS points FROM point_entries WHERE club_id = ? AND user_id = ?").get(clubId, userId);
  return row.points;
}

function settle(db, activity) {
  const checks = db.prepare("SELECT user_id, km FROM activity_checks WHERE activity_id = ?").all(activity.id);
  const signed = new Set(db.prepare("SELECT user_id FROM activity_signups WHERE activity_id = ?").all(activity.id).map((row) => row.user_id));
  const qualified = checks.filter((row) => signed.has(row.user_id) && row.km + 1e-9 >= activity.min_km);
  const open = activity.points > 0 && qualified.length >= activity.min_people;
  const want = new Set(open ? qualified.map((row) => row.user_id) : []);
  const prefix = "act:" + activity.id + ":";
  const existing = db.prepare("SELECT id, user_id, ref_key FROM point_entries WHERE club_id = ? AND ref_key LIKE ?").all(activity.club_id, prefix + "%");
  const have = new Set();
  for (const row of existing) {
    const userId = Number(row.ref_key.slice(prefix.length));
    if (!want.has(userId)) db.prepare("DELETE FROM point_entries WHERE id = ?").run(row.id);
    else have.add(userId);
  }
  if (!open) return { qualified: qualified.length, awarded: false };
  const now = new Date().toISOString();
  const insert = db.prepare(
    "INSERT INTO point_entries (club_id, user_id, delta, reason, ref_key, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const userId of want) {
    if (have.has(userId)) continue;
    insert.run(activity.club_id, userId, activity.points, activity.title + " 打卡", prefix + userId, now);
  }
  return { qualified: qualified.length, awarded: true };
}

function activityStats(db, activity, userId) {
  const signups = db.prepare("SELECT user_id, group_id, gender, level, pacer FROM activity_signups WHERE activity_id = ?").all(activity.id);
  const checks = db.prepare("SELECT user_id, km, note FROM activity_checks WHERE activity_id = ?").all(activity.id);
  const signed = new Set(signups.map((row) => row.user_id));
  const qualified = checks.filter((row) => signed.has(row.user_id) && row.km + 1e-9 >= activity.min_km).length;
  const mineSignup = signups.find((row) => row.user_id === userId);
  const mineCheck = checks.find((row) => row.user_id === userId);
  const groups = signupGroups(db, activity).map((group) => {
    const used = signups.filter((row) => row.group_id === group.id).length;
    return {
      id: group.id,
      name: group.name,
      kind: group.kind || "pace",
      kindLabel: KINDS[group.kind] || KINDS.pace,
      pace: group.pace || "",
      capacity: group.capacity,
      signed: used,
      left: group.capacity > 0 ? Math.max(0, group.capacity - used) : null
    };
  });
  const mine = mineSignup
    ? {
        signed: true,
        groupId: mineSignup.group_id,
        km: mineCheck ? mineCheck.km : null,
        note: mineCheck ? mineCheck.note : "",
        gender: mineSignup.gender || "",
        level: mineSignup.level || "",
        pacer: !!mineSignup.pacer
      }
    : { signed: false, groupId: 0, km: mineCheck ? mineCheck.km : null, note: "", gender: "", level: "", pacer: false };
  const men = signups.filter((row) => row.gender === "男").length;
  const women = signups.filter((row) => row.gender === "女").length;
  return {
    signupCount: signups.length,
    checkCount: checks.length,
    qualifiedCount: qualified,
    awarded: activity.points > 0 && qualified >= activity.min_people,
    mine,
    groups,
    capacity: capOf(groups),
    men,
    women,
    gendered: men + women > 0,
    action: signupAction(activity, mine, groups),
    cancelHint: activity.cancel_until ? dateLabel(activity.cancel_until) + " " + String(activity.cancel_until).slice(11, 16) + " 前可取消" : ""
  };
}

function cleanWhen(value, required, emptyLabel, badLabel) {
  const text = String(value || "").trim().replace(" ", "T");
  if (!text) return required ? { error: emptyLabel } : { text: "" };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return { error: badLabel };
  return { text };
}

function readActivityBody(body, base) {
  const source = body || {};
  const title = String(source.title != null ? source.title : base.title || "").trim();
  const place = String(source.place != null ? source.place : base.place || "").trim();
  const note = String(source.note != null ? source.note : base.note || "").trim();
  const issue = String(source.issue != null ? source.issue : base.issue || "").trim();
  const gatherPlace = String(source.gatherPlace != null ? source.gatherPlace : base.gather_place || "").trim();
  const gatherAt = String(source.gatherAt != null ? source.gatherAt : base.gather_at || "").trim();
  const route = String(source.route != null ? source.route : base.route || "").trim();
  const starts = cleanWhen(source.startsAt != null ? source.startsAt : base.starts_at, true, "时间写成 2026-10-11 05:40", "时间写成 2026-10-11 05:40");
  if (starts.error) return starts;
  const ends = cleanWhen(source.endsAt != null ? source.endsAt : base.ends_at, false, "", "结束时间写成 2026-10-11 06:30");
  if (ends.error) return ends;
  const cancel = cleanWhen(source.cancelUntil != null ? source.cancelUntil : base.cancel_until, false, "", "取消报名的时间写成 2026-10-11 05:00");
  if (cancel.error) return cancel;
  const minKm = source.minKm == null || source.minKm === "" ? (base.min_km != null ? base.min_km : 5) : Number(source.minKm);
  const minPeople = source.minPeople == null || source.minPeople === "" ? (base.min_people != null ? base.min_people : 3) : Number(source.minPeople);
  const points = source.points == null || source.points === "" ? (base.points != null ? base.points : 1) : Number(source.points);
  let planned = base ? base.planned_km : null;
  if (source.plannedKm != null) planned = source.plannedKm === "" ? null : Number(source.plannedKm);
  const review = source.review == null ? !!(base && base.review) : !!source.review;
  if (!title || title.length > 40) return { error: "活动名用 1 到 40 个字" };
  if (place.length > 40) return { error: "地点最多 40 个字" };
  if (note.length > 2000) return { error: "说明最多 2000 个字" };
  if (issue.length > 40) return { error: "期次最多 40 个字" };
  if (gatherPlace.length > 40) return { error: "集合点最多 40 个字" };
  if (gatherAt.length > 40) return { error: "集合时间最多 40 个字" };
  if (route.length > 200) return { error: "路线最多 200 个字" };
  if (!Number.isFinite(minKm) || minKm < 0.1 || minKm > 100) return { error: "里程门槛在 0.1 到 100 公里" };
  if (!Number.isInteger(minPeople) || minPeople < 1 || minPeople > 500) return { error: "成团人数在 1 到 500" };
  if (!Number.isInteger(points) || points < 0 || points > 100) return { error: "积分写成 0 到 100" };
  if (planned != null && (!Number.isFinite(planned) || planned < 0.1 || planned > 200)) return { error: "计划里程在 0.1 到 200 公里" };
  if (ends.text && beijingInstant(ends.text) < beijingInstant(starts.text)) return { error: "结束时间不能早于开始" };
  if (cancel.text && beijingInstant(cancel.text) > beijingInstant(starts.text)) return { error: "取消报名的时间不能晚于开始" };
  return {
    value: {
      title,
      place,
      startsAt: starts.text,
      endsAt: ends.text,
      note,
      issue,
      gatherPlace,
      gatherAt,
      route,
      cancelUntil: cancel.text,
      minKm,
      minPeople,
      points,
      planned: planned == null ? null : Math.round(planned * 100) / 100,
      review: review ? 1 : 0
    }
  };
}

function readGroupList(input) {
  if (input == null) return { groups: [] };
  if (!Array.isArray(input)) return { error: "组别格式不对" };
  const filled = input.filter((item) => String((item && item.name) || "").trim());
  if (filled.length > 12) return { error: "一场活动最多 12 个组" };
  const groups = [];
  const names = new Set();
  for (const item of filled) {
    const one = readOneGroup(item);
    if (one.error) return one;
    if (names.has(one.group.name)) return { error: "组别名不能重复" };
    names.add(one.group.name);
    groups.push(one.group);
  }
  return { groups };
}

function readOneGroup(item) {
  const name = String((item && item.name) || "").trim();
  const kind = String((item && item.kind) || "pace");
  const pace = String((item && item.pace) || "").trim();
  const capacity = item && item.capacity != null && item.capacity !== "" ? Number(item.capacity) : 0;
  if (!name || name.length > 20) return { error: "组别名用 1 到 20 个字" };
  if (!KINDS[kind]) return { error: "组别种类选配速、完赛、志愿者或非训练" };
  if (pace.length > 40) return { error: "配速或目标最多 40 个字" };
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 500) return { error: "名额写成 0 到 500，0 表示不限" };
  return { group: { name, kind, pace, capacity } };
}

function insertGroups(db, activityId, groups) {
  const insert = db.prepare("INSERT INTO activity_groups (activity_id, name, kind, pace, capacity, sort) VALUES (?, ?, ?, ?, ?, ?)");
  groups.forEach((group, index) => insert.run(activityId, group.name, group.kind, group.pace, group.capacity, index));
}

function togetherMap(db, clubId, userId) {
  const rows = db
    .prepare(
      `SELECT b.user_id AS userId, COUNT(DISTINCT a.activity_id) AS n
       FROM activity_checks a
       JOIN activity_checks b ON b.activity_id = a.activity_id AND b.user_id != a.user_id
       JOIN activities act ON act.id = a.activity_id
       WHERE act.club_id = ? AND a.user_id = ?
       GROUP BY b.user_id`
    )
    .all(clubId, userId);
  const map = {};
  for (const row of rows) map[row.userId] = row.n;
  return map;
}

function shareText(clubName, activities, briefs) {
  const blocks = activities.map((activity, index) => {
    const lines = [activity.title, timeLabel(activity)];
    if (activity.place) lines.push("地点 " + activity.place);
    if (activity.gather_place) lines.push("集合 " + activity.gather_place);
    for (const group of briefs[index] || []) {
      lines.push(group.capacity > 0 ? group.name + " 剩 " + Math.max(0, group.capacity - group.signed) : group.name + " 不限");
    }
    return lines.join("\n");
  });
  return [clubName].concat(blocks).join("\n\n");
}

function rangeOf(key, now = Date.now()) {
  const stamp = beijingStamp(now);
  const y = Number(stamp.slice(0, 4));
  const m = Number(stamp.slice(5, 7)) - 1;
  const d = Number(stamp.slice(8, 10));
  const today = stamp.slice(0, 10);
  const day = new Date(Date.UTC(y, m, d));
  if (key === "today") return { from: today, to: today };
  if (key === "week") {
    const weekday = day.getUTCDay();
    const offset = weekday === 0 ? 6 : weekday - 1;
    const start = new Date(Date.UTC(y, m, d - offset));
    const end = new Date(Date.UTC(y, m, d - offset + 6));
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  if (key === "month") {
    const end = new Date(Date.UTC(y, m + 1, 0));
    return { from: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  if (key === "lastMonth") {
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  if (key === "season") {
    const startMonth = Math.floor(m / 3) * 3;
    const end = new Date(Date.UTC(y, startMonth + 3, 0));
    return { from: new Date(Date.UTC(y, startMonth, 1)).toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  if (key === "year") return { from: y + "-01-01", to: y + "-12-31" };
  if (key === "all") return { from: "0000-01-01", to: "9999-12-31", sinceJoin: true };
  return null;
}

function attendanceOf(db, clubId, userId, key) {
  const range = rangeOf(key);
  if (!range) return null;
  const since = range.sinceJoin ? 1 : 0;
  const rows = db
    .prepare(
      `SELECT u.id AS userId, u.nickname,
         (SELECT COUNT(*) FROM activity_checks c
          JOIN activities a ON a.id = c.activity_id
          JOIN club_members me ON me.club_id = a.club_id AND me.user_id = c.user_id
          WHERE c.user_id = u.id AND a.club_id = ?
            AND substr(a.starts_at, 1, 10) >= ?
            AND substr(a.starts_at, 1, 10) <= ?
            AND (? = 0 OR substr(a.starts_at, 1, 10) >= substr(me.joined_at, 1, 10))
         ) AS count
       FROM club_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.club_id = ?
       ORDER BY count DESC, u.id`
    )
    .all(clubId, range.from, range.to, since, clubId);
  let place = 0;
  let last = null;
  rows.forEach((row, index) => {
    if (row.count !== last) {
      place = index + 1;
      last = row.count;
    }
    row.place = row.count > 0 ? place : 0;
    row.placeLabel = row.count > 0 ? String(row.place) : "未上榜";
    row.mine = row.userId === userId;
  });
  return { range: key, label: RANGE_LABEL[key], rows, me: rows.find((row) => row.mine) || null };
}

function albumCards(db, clubId, userId, staff) {
  const activities = db.prepare("SELECT * FROM activities WHERE club_id = ? ORDER BY starts_at DESC, id DESC").all(clubId);
  const cards = [];
  for (const activity of activities) {
    const rows = db.prepare("SELECT id, kind, status, user_id FROM activity_media WHERE activity_id = ? ORDER BY id").all(activity.id);
    const visible = rows.filter((row) => row.status !== "pending" || row.user_id === userId || staff);
    if (!visible.length) continue;
    const shownPhotos = rows.filter((row) => row.kind === "photo" && row.status === "shown");
    const shownVideos = rows.filter((row) => row.kind === "video" && row.status === "shown");
    const coverId = shownPhotos.some((row) => row.id === activity.cover_id) ? activity.cover_id : shownPhotos.length ? shownPhotos[0].id : 0;
    cards.push({
      id: activity.id,
      title: activity.title,
      date: String(activity.starts_at || "").slice(0, 10),
      dateLabel: dateLabel(activity.starts_at),
      place: activity.place,
      photoCount: shownPhotos.length,
      videoCount: shownVideos.length,
      coverId
    });
  }
  return cards;
}

function removeMedia(db, row) {
  db.prepare("DELETE FROM activity_media WHERE id = ?").run(row.id);
  db.prepare("UPDATE activities SET cover_id = 0 WHERE id = ? AND cover_id = ?").run(row.activity_id, row.id);
  if (!row.filename) return;
  const file = path.join(mediaRoot(), String(row.activity_id), path.basename(row.filename));
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function enrichBoard(db, clubId, board) {
  if (!board.length) return board;
  const rows = db
    .prepare(
      `SELECT res.user_id, u.nickname, res.race_id, res.distance, res.seconds
       FROM results res
       JOIN users u ON u.id = res.user_id
       JOIN club_members m ON m.user_id = res.user_id AND m.club_id = ?`
    )
    .all(clubId);
  const best = {};
  for (const row of rows) {
    const key = row.user_id + ":" + row.distance;
    if (best[key] == null || row.seconds < best[key]) best[key] = row.seconds;
  }
  for (const item of board) {
    const hits = rows.filter((row) => row.race_id === item.race.id);
    item.results = hits.map((row) => ({
      userId: row.user_id,
      nickname: row.nickname,
      distance: row.distance,
      distanceLabel: DISTANCE_LABEL[row.distance] || row.distance,
      clock: formatClock(row.seconds),
      pb: row.seconds === best[row.user_id + ":" + row.distance]
    }));
    const byUser = {};
    for (const result of item.results) byUser[result.userId] = result;
    for (const mark of item.marks) {
      const result = byUser[mark.userId];
      if (!result) continue;
      mark.clock = result.clock;
      mark.distanceLabel = result.distanceLabel;
      mark.pb = result.pb;
    }
    const tally = {};
    for (const mark of item.marks) tally[mark.status] = (tally[mark.status] || 0) + 1;
    item.tally = tally;
    item.pbCount = item.results.filter((row) => row.pb).length;
  }
  return board;
}

function clubLife(db, club, userId) {
  const groups = db
    .prepare("SELECT id, name, pace, capacity FROM club_groups WHERE club_id = ? ORDER BY sort, id")
    .all(club.id);
  const activities = db
    .prepare("SELECT * FROM activities WHERE club_id = ? ORDER BY starts_at, id")
    .all(club.id)
    .map((row) => presentActivity(row, activityStats(db, row, userId)));
  const gifts = db
    .prepare("SELECT id, name, cost, stock FROM gifts WHERE club_id = ? ORDER BY id DESC")
    .all(club.id);
  const mine = memberRole(db, club, userId);
  const members = db
    .prepare(
      `SELECT u.id, u.nickname, u.avatar, m.role, COALESCE(SUM(p.delta), 0) AS points
       FROM club_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN point_entries p ON p.club_id = m.club_id AND p.user_id = m.user_id
       WHERE m.club_id = ?
       GROUP BY u.id, m.role
       ORDER BY m.joined_at`
    )
    .all(club.id)
    .map((row) => {
      const role = row.id === club.owner_id ? "owner" : row.role === "manager" ? "manager" : "member";
      return { id: row.id, nickname: row.nickname, avatar: avatarUrlOf(row.id, row.avatar), points: row.points, owner: role === "owner", role, roleLabel: clubRoleLabel(role) };
    });
  const staff = mine === "owner" || mine === "manager";
  return {
    club: {
      id: club.id,
      name: club.name,
      code: club.code,
      owner: mine === "owner",
      staff,
      role: mine,
      roleLabel: clubRoleLabel(mine)
    },
    members,
    requests: staff ? listPending(db, club.id).map((row) => ({ id: row.id, nickname: row.nickname, at: row.at })) : [],
    groups,
    activities,
    gifts,
    myPoints: balanceOf(db, club.id, userId)
  };
}

function sniff(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: "photo", ext: "jpg", mime: "image/jpeg" };
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return { kind: "photo", ext: "png", mime: "image/png" };
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { kind: "photo", ext: "webp", mime: "image/webp" };
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (brand.startsWith("qt")) return { kind: "video", ext: "mov", mime: "video/quicktime" };
    return { kind: "video", ext: "mp4", mime: "video/mp4" };
  }
  return null;
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

function mountClubLife(app, { BASE, getDb, userFrom }) {
  function gate(req, res) {
    const user = userFrom(req);
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

  function staffOnly(ctx, res) {
    const role = memberRole(ctx.db, ctx.club, ctx.user.id);
    if (role === "owner" || role === "manager") return true;
    res.status(403).json({ error: "只有团长或跑团管理可以改" });
    return false;
  }

  function leaderOnly(ctx, res) {
    if (memberRole(ctx.db, ctx.club, ctx.user.id) === "owner") return true;
    res.status(403).json({ error: "只有团长可以改角色" });
    return false;
  }

  app.post(BASE + "/api/clubs/:id/groups", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !staffOnly(ctx, res)) return;
    const name = String((req.body && req.body.name) || "").trim();
    const pace = String((req.body && req.body.pace) || "").trim();
    const capacity = Number((req.body && req.body.capacity) || 0);
    if (!name || name.length > 20) return res.status(400).json({ error: "组别名用 1 到 20 个字" });
    if (pace.length > 20) return res.status(400).json({ error: "配速说明最多 20 个字" });
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 500) return res.status(400).json({ error: "名额写成 0 到 500，0 表示不限" });
    const info = ctx.db
      .prepare("INSERT INTO club_groups (club_id, name, pace, capacity, sort) VALUES (?, ?, ?, ?, ?)")
      .run(ctx.club.id, name, pace, capacity, Date.now());
    res.json({ group: { id: Number(info.lastInsertRowid), name, pace, capacity } });
  });

  app.delete(BASE + "/api/clubs/:id/groups/:gid", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !staffOnly(ctx, res)) return;
    ctx.db.prepare("DELETE FROM club_groups WHERE id = ? AND club_id = ?").run(req.params.gid, ctx.club.id);
    ctx.db.prepare("UPDATE activity_signups SET group_id = 0 WHERE group_id = ?").run(req.params.gid);
    res.json({ ok: true });
  });

  app.delete(BASE + "/api/clubs/:id/members/:uid", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !staffOnly(ctx, res)) return;
    const uid = Number(req.params.uid);
    if (uid === ctx.user.id) return res.status(400).json({ error: "不能移出自己" });
    if (uid === ctx.club.owner_id) return res.status(400).json({ error: "团长还在团里" });
    const gone = ctx.db.prepare("DELETE FROM club_members WHERE club_id = ? AND user_id = ?").run(ctx.club.id, uid);
    if (!gone.changes) return res.status(404).json({ error: "团里没有这个人" });
    res.json({ ok: true });
  });

  app.put(BASE + "/api/clubs/:id/members/:uid", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !leaderOnly(ctx, res)) return;
    const result = setMemberRole(ctx.db, ctx.club.id, req.params.uid, String((req.body && req.body.role) || ""));
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
  });

  app.post(BASE + "/api/clubs/:id/requests/:rid", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !staffOnly(ctx, res)) return;
    const result = decideRequest(
      ctx.db,
      req.params.rid,
      String((req.body && req.body.decision) || ""),
      ctx.user.nickname,
      ctx.club.id
    );
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
  });

  function loadActivity(ctx, res) {
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(reqActivityId(ctx), ctx.club.id);
    if (!activity) {
      res.status(404).json({ error: "没有这场活动" });
      return null;
    }
    return activity;
  }

  function reqActivityId(ctx) {
    return ctx.req.params.aid;
  }

  app.post(BASE + "/api/clubs/:id/activities", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !staffOnly(ctx, res)) return;
    const parsed = readActivityBody(req.body || {}, {});
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const groups = readGroupList(req.body && req.body.groups);
    if (groups.error) return res.status(400).json({ error: groups.error });
    const value = parsed.value;
    const info = ctx.db
      .prepare(
        `INSERT INTO activities (
           club_id, title, place, starts_at, note, min_km, min_people, points, created_at,
           ends_at, issue, planned_km, gather_place, route, gather_at, cancel_until
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        ctx.club.id,
        value.title,
        value.place,
        value.startsAt,
        value.note,
        value.minKm,
        value.minPeople,
        value.points,
        new Date().toISOString(),
        value.endsAt,
        value.issue,
        value.planned,
        value.gatherPlace,
        value.route,
        value.gatherAt,
        value.cancelUntil
      );
    const id = Number(info.lastInsertRowid);
    if (groups.groups.length) insertGroups(ctx.db, id, groups.groups);
    const row = ctx.db.prepare("SELECT * FROM activities WHERE id = ?").get(id);
    res.json({ activity: presentActivity(row, activityStats(ctx.db, row, ctx.user.id)) });
  });

  app.put(BASE + "/api/clubs/:id/activities/:aid", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !staffOnly(ctx, res)) return;
    ctx.req = req;
    const activity = loadActivity(ctx, res);
    if (!activity) return;
    const parsed = readActivityBody(req.body || {}, activity);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const value = parsed.value;
    ctx.db
      .prepare(
        `UPDATE activities SET title = ?, place = ?, starts_at = ?, note = ?, min_km = ?, min_people = ?, points = ?,
         ends_at = ?, issue = ?, planned_km = ?, gather_place = ?, route = ?, gather_at = ?, cancel_until = ?, review = ?
         WHERE id = ?`
      )
      .run(
        value.title,
        value.place,
        value.startsAt,
        value.note,
        value.minKm,
        value.minPeople,
        value.points,
        value.endsAt,
        value.issue,
        value.planned,
        value.gatherPlace,
        value.route,
        value.gatherAt,
        value.cancelUntil,
        value.review,
        activity.id
      );
    const row = ctx.db.prepare("SELECT * FROM activities WHERE id = ?").get(activity.id);
    res.json({ activity: presentActivity(row, activityStats(ctx.db, row, ctx.user.id)) });
  });

  app.post(BASE + "/api/clubs/:id/activities/share", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(Number) : [];
    if (!ids.length) return res.status(400).json({ error: "先勾选活动" });
    const activities = [];
    const briefs = [];
    for (const id of ids) {
      const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(id, ctx.club.id);
      if (!activity) return res.status(400).json({ error: "没有这场活动" });
      activities.push(activity);
      const signups = ctx.db.prepare("SELECT group_id FROM activity_signups WHERE activity_id = ?").all(activity.id);
      briefs.push(
        signupGroups(ctx.db, activity).map((group) => ({
          name: group.name,
          capacity: group.capacity,
          signed: signups.filter((row) => row.group_id === group.id).length
        }))
      );
    }
    res.json({ text: shareText(ctx.club.name, activities, briefs) });
  });

  app.get(BASE + "/api/clubs/:id/attendance", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const key = String(req.query.range || "month");
    const board = attendanceOf(ctx.db, ctx.club.id, ctx.user.id, key);
    if (!board) return res.status(400).json({ error: "没有这个范围" });
    res.json(board);
  });

  app.get(BASE + "/api/clubs/:id/albums", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const staff = memberRole(ctx.db, ctx.club, ctx.user.id);
    res.json({ albums: albumCards(ctx.db, ctx.club.id, ctx.user.id, staff === "owner" || staff === "manager") });
  });

  app.get(BASE + "/api/clubs/:id/activities/:aid", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    const staff = memberRole(ctx.db, ctx.club, ctx.user.id) === "owner" || memberRole(ctx.db, ctx.club, ctx.user.id) === "manager";
    const groups = signupGroups(ctx.db, activity);
    const signups = ctx.db
      .prepare(
        `SELECT u.id AS userId, u.nickname, s.group_id AS groupId, s.gender, s.level, s.pacer, s.created_at AS createdAt
         FROM activity_signups s
         JOIN users u ON u.id = s.user_id
         WHERE s.activity_id = ?
         ORDER BY s.pacer DESC, s.created_at`
      )
      .all(activity.id);
    const names = {};
    for (const group of groups) names[group.id] = group.name;
    const together = togetherMap(ctx.db, ctx.club.id, ctx.user.id);
    const roster = signups.map((row) => ({
      userId: row.userId,
      nickname: row.nickname,
      groupId: row.groupId,
      groupName: names[row.groupId] || "",
      gender: row.gender || "",
      level: row.level || "",
      pacer: !!row.pacer,
      together: together[row.userId] || 0,
      mine: row.userId === ctx.user.id
    }));
    const checks = ctx.db
      .prepare(
        `SELECT u.nickname, c.user_id AS userId, c.km, c.note
         FROM activity_checks c
         JOIN users u ON u.id = c.user_id
         WHERE c.activity_id = ?
         ORDER BY c.created_at`
      )
      .all(activity.id)
      .map((row) => ({ ...row, counts: row.km + 1e-9 >= activity.min_km }));
    const media = ctx.db
      .prepare(
        `SELECT m.id, m.kind, m.status, m.created_at AS createdAt, u.nickname, m.user_id AS userId
         FROM activity_media m
         JOIN users u ON u.id = m.user_id
         WHERE m.activity_id = ?
         ORDER BY m.id`
      )
      .all(activity.id)
      .filter((row) => row.status !== "pending" || row.userId === ctx.user.id || staff)
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        nickname: row.nickname,
        mine: row.userId === ctx.user.id,
        status: row.status,
        pending: row.status === "pending",
        at: stampLabel(row.createdAt)
      }));
    const shownPhotos = media.filter((row) => row.kind === "photo" && !row.pending);
    const coverId = shownPhotos.some((row) => row.id === activity.cover_id) ? activity.cover_id : shownPhotos.length ? shownPhotos[0].id : 0;
    const rich = groups.map((group) => {
      const people = roster.filter((row) => row.groupId === group.id);
      return {
        id: group.id,
        name: group.name,
        kind: group.kind || "pace",
        kindLabel: KINDS[group.kind] || KINDS.pace,
        pace: group.pace || "",
        capacity: group.capacity,
        signed: people.length,
        men: people.filter((row) => row.gender === "男").length,
        women: people.filter((row) => row.gender === "女").length,
        full: group.capacity > 0 && people.length >= group.capacity,
        people
      };
    });
    res.json({
      activity: presentActivity(activity, activityStats(ctx.db, activity, ctx.user.id)),
      groups: rich,
      signups: roster,
      checks,
      media,
      album: {
        photoCount: media.filter((row) => row.kind === "photo" && !row.pending).length,
        videoCount: media.filter((row) => row.kind === "video" && !row.pending).length,
        coverId,
        review: !!activity.review
      },
      levels: LEVELS,
      viewerName: ctx.user.nickname,
      staff
    });
  });

  app.get(BASE + "/api/clubs/:id/activities/:aid/album", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    const staff = memberRole(ctx.db, ctx.club, ctx.user.id) === "owner" || memberRole(ctx.db, ctx.club, ctx.user.id) === "manager";
    const order = req.query.order === "old" ? "ASC" : "DESC";
    const rows = ctx.db
      .prepare(
        `SELECT m.id, m.kind, m.status, m.created_at AS createdAt, u.nickname, m.user_id AS userId
         FROM activity_media m
         JOIN users u ON u.id = m.user_id
         WHERE m.activity_id = ?
         ORDER BY m.id ${order}`
      )
      .all(activity.id)
      .filter((row) => row.status !== "pending" || row.userId === ctx.user.id || staff)
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        nickname: row.nickname,
        userId: row.userId,
        mine: row.userId === ctx.user.id,
        status: row.status,
        pending: row.status === "pending",
        at: stampLabel(row.createdAt)
      }));
    const photos = ctx.db.prepare("SELECT COUNT(*) AS n FROM activity_media WHERE activity_id = ? AND kind = 'photo'").get(activity.id).n;
    const videos = ctx.db.prepare("SELECT COUNT(*) AS n FROM activity_media WHERE activity_id = ? AND kind = 'video'").get(activity.id).n;
    const shownPhotos = rows.filter((row) => row.kind === "photo" && !row.pending);
    const coverId = shownPhotos.some((row) => row.id === activity.cover_id)
      ? activity.cover_id
      : shownPhotos.length
        ? shownPhotos.slice().sort((a, b) => a.id - b.id)[0].id
        : 0;
    res.json({
      activity: presentActivity(activity, activityStats(ctx.db, activity, ctx.user.id)),
      items: rows,
      photoCount: rows.filter((row) => row.kind === "photo" && !row.pending).length,
      videoCount: rows.filter((row) => row.kind === "video" && !row.pending).length,
      coverId,
      review: !!activity.review,
      staff,
      photoLeft: Math.max(0, PHOTO_LIMIT - photos),
      videoLeft: Math.max(0, VIDEO_LIMIT - videos)
    });
  });

  app.post(BASE + "/api/clubs/:id/activities/:aid/signup", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    const blocked = feeBlocksSignup(ctx.db, ctx.club.id, ctx.user.id);
    if (blocked) return res.status(400).json({ error: blocked });
    const existing = ctx.db.prepare("SELECT 1 FROM activity_signups WHERE activity_id = ? AND user_id = ?").get(activity.id, ctx.user.id);
    if (existing) return res.status(400).json({ error: "你已经报过了，要换组先取消" });
    const status = statusOf(activity);
    if (status === "cancelled") return res.status(400).json({ error: "这场已经取消" });
    if (status === "ended") return res.status(400).json({ error: "这场已经结束" });
    if (status === "live") return res.status(400).json({ error: "已经开始了" });
    const gender = String((req.body && req.body.gender) || "");
    const level = String((req.body && req.body.level) || "");
    if (gender && gender !== "男" && gender !== "女") return res.status(400).json({ error: "性别选男、女，或留空" });
    if (level && !LEVELS.some((item) => item.id === level)) return res.status(400).json({ error: "级别选萌新、入门、进阶或专业" });
    const groupId = Number((req.body && req.body.groupId) || 0);
    const groups = signupGroups(ctx.db, activity);
    if (groups.length && !groups.some((group) => group.id === groupId)) return res.status(400).json({ error: "先选一个组别" });
    if (groupId) {
      const group = groups.find((item) => item.id === groupId);
      if (!group) return res.status(400).json({ error: "没有这个组别" });
      if (group.capacity > 0) {
        const used = ctx.db.prepare("SELECT COUNT(*) AS n FROM activity_signups WHERE activity_id = ? AND group_id = ?").get(activity.id, groupId);
        if (used.n >= group.capacity) return res.status(400).json({ error: "这个组别满了" });
      }
    }
    ctx.db
      .prepare("INSERT INTO activity_signups (activity_id, user_id, group_id, gender, level, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(activity.id, ctx.user.id, groupId, gender, level, new Date().toISOString());
    res.json({ ok: true, activity: presentActivity(activity, activityStats(ctx.db, activity, ctx.user.id)) });
  });

  app.delete(BASE + "/api/clubs/:id/activities/:aid/signup", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    if (cancelClosed(activity)) return res.status(400).json({ error: "已经过了取消时间" });
    ctx.db.prepare("DELETE FROM activity_signups WHERE activity_id = ? AND user_id = ?").run(activity.id, ctx.user.id);
    ctx.db.prepare("DELETE FROM activity_checks WHERE activity_id = ? AND user_id = ?").run(activity.id, ctx.user.id);
    settle(ctx.db, activity);
    res.json({ ok: true, activity: presentActivity(activity, activityStats(ctx.db, activity, ctx.user.id)) });
  });

  app.post(BASE + "/api/clubs/:id/activities/:aid/pacer", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    const target = req.body && req.body.userId ? Number(req.body.userId) : ctx.user.id;
    if (target !== ctx.user.id && !staffOnly(ctx, res)) return;
    const signup = ctx.db.prepare("SELECT group_id, pacer FROM activity_signups WHERE activity_id = ? AND user_id = ?").get(activity.id, target);
    if (!signup) return res.status(400).json({ error: target === ctx.user.id ? "先报名，再领跑" : "这个人还没报名" });
    if (!signup.group_id) return res.status(400).json({ error: "先选一个组别，再领跑" });
    const on = !req.body || req.body.on !== false;
    if (on && !signup.pacer) {
      const used = ctx.db
        .prepare("SELECT COUNT(*) AS n FROM activity_signups WHERE activity_id = ? AND group_id = ? AND pacer = 1")
        .get(activity.id, signup.group_id);
      if (used.n >= 2) return res.status(400).json({ error: "这一组已经有 2 名领跑" });
    }
    ctx.db.prepare("UPDATE activity_signups SET pacer = ? WHERE activity_id = ? AND user_id = ?").run(on ? 1 : 0, activity.id, target);
    res.json({ ok: true });
  });

  app.post(BASE + "/api/clubs/:id/activities/:aid/groups", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !staffOnly(ctx, res)) return;
    const activity = ctx.db.prepare("SELECT id FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    const count = ctx.db.prepare("SELECT COUNT(*) AS n FROM activity_groups WHERE activity_id = ?").get(activity.id);
    if (count.n >= 12) return res.status(400).json({ error: "一场活动最多 12 个组" });
    const one = readOneGroup(req.body || {});
    if (one.error) return res.status(400).json({ error: one.error });
    const taken = ctx.db.prepare("SELECT 1 FROM activity_groups WHERE activity_id = ? AND name = ?").get(activity.id, one.group.name);
    if (taken) return res.status(400).json({ error: "组别名不能重复" });
    const info = ctx.db
      .prepare("INSERT INTO activity_groups (activity_id, name, kind, pace, capacity, sort) VALUES (?, ?, ?, ?, ?, ?)")
      .run(activity.id, one.group.name, one.group.kind, one.group.pace, one.group.capacity, count.n);
    res.json({ group: { id: Number(info.lastInsertRowid), ...one.group } });
  });

  app.post(BASE + "/api/clubs/:id/activities/:aid/end", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !staffOnly(ctx, res)) return;
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    if (activity.cancelled_at) return res.status(400).json({ error: "这场已经取消" });
    ctx.db.prepare("UPDATE activities SET ends_at = ? WHERE id = ?").run(beijingStamp(), activity.id);
    const row = ctx.db.prepare("SELECT * FROM activities WHERE id = ?").get(activity.id);
    res.json({ activity: presentActivity(row, activityStats(ctx.db, row, ctx.user.id)) });
  });

  app.post(BASE + "/api/clubs/:id/activities/:aid/cancel", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !staffOnly(ctx, res)) return;
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    if (activity.cancelled_at) return res.status(400).json({ error: "这场已经取消" });
    ctx.db.prepare("UPDATE activities SET cancelled_at = ? WHERE id = ?").run(new Date().toISOString(), activity.id);
    const row = ctx.db.prepare("SELECT * FROM activities WHERE id = ?").get(activity.id);
    res.json({ activity: presentActivity(row, activityStats(ctx.db, row, ctx.user.id)) });
  });

  app.post(BASE + "/api/clubs/:id/activities/:aid/cover", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !staffOnly(ctx, res)) return;
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    const media = ctx.db
      .prepare("SELECT id FROM activity_media WHERE id = ? AND activity_id = ? AND kind = 'photo' AND status = 'shown'")
      .get(Number(req.body && req.body.mediaId), activity.id);
    if (!media) return res.status(400).json({ error: "封面用已经显示的照片" });
    ctx.db.prepare("UPDATE activities SET cover_id = ? WHERE id = ?").run(media.id, activity.id);
    res.json({ coverId: media.id });
  });

  app.post(BASE + "/api/clubs/:id/activities/:aid/check", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    const signed = ctx.db.prepare("SELECT 1 FROM activity_signups WHERE activity_id = ? AND user_id = ?").get(activity.id, ctx.user.id);
    if (!signed) return res.status(400).json({ error: "先报名，再打卡" });
    const km = Number(req.body && req.body.km);
    const note = String((req.body && req.body.note) || "").trim();
    if (!Number.isFinite(km) || km <= 0 || km > 200) return res.status(400).json({ error: "公里数写成 0 到 200 之间" });
    if (note.length > 40) return res.status(400).json({ error: "一句最多 40 个字" });
    ctx.db
      .prepare(
        `INSERT INTO activity_checks (activity_id, user_id, km, note, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(activity_id, user_id) DO UPDATE SET km = excluded.km, note = excluded.note`
      )
      .run(activity.id, ctx.user.id, Math.round(km * 100) / 100, note, new Date().toISOString());
    const settled = settle(ctx.db, activity);
    res.json({
      ok: true,
      awarded: settled.awarded,
      activity: presentActivity(activity, activityStats(ctx.db, activity, ctx.user.id)),
      myPoints: balanceOf(ctx.db, ctx.club.id, ctx.user.id)
    });
  });

  app.delete(BASE + "/api/clubs/:id/activities/:aid/check", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    ctx.db.prepare("DELETE FROM activity_checks WHERE activity_id = ? AND user_id = ?").run(activity.id, ctx.user.id);
    settle(ctx.db, activity);
    res.json({
      ok: true,
      activity: presentActivity(activity, activityStats(ctx.db, activity, ctx.user.id)),
      myPoints: balanceOf(ctx.db, ctx.club.id, ctx.user.id)
    });
  });

  app.post(BASE + "/api/clubs/:id/gifts", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !staffOnly(ctx, res)) return;
    const name = String((req.body && req.body.name) || "").trim();
    const cost = Number(req.body && req.body.cost);
    const stock = Number(req.body && req.body.stock);
    if (!name || name.length > 20) return res.status(400).json({ error: "礼品名用 1 到 20 个字" });
    if (!Number.isInteger(cost) || cost < 1 || cost > 100000) return res.status(400).json({ error: "兑换积分写成 1 以上的整数" });
    if (!Number.isInteger(stock) || stock < 1 || stock > 10000) return res.status(400).json({ error: "库存写成 1 到 10000" });
    const info = ctx.db
      .prepare("INSERT INTO gifts (club_id, name, cost, stock, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(ctx.club.id, name, cost, stock, new Date().toISOString());
    res.json({ gift: { id: Number(info.lastInsertRowid), name, cost, stock } });
  });

  app.post(BASE + "/api/clubs/:id/gifts/:gid/redeem", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const run = ctx.db.transaction(() => {
      const gift = ctx.db.prepare("SELECT * FROM gifts WHERE id = ? AND club_id = ?").get(req.params.gid, ctx.club.id);
      if (!gift) return { status: 404, error: "没有这个礼品" };
      if (gift.stock < 1) return { status: 400, error: "已经换完了" };
      const points = balanceOf(ctx.db, ctx.club.id, ctx.user.id);
      if (points < gift.cost) return { status: 400, error: "积分不够" };
      const taken = ctx.db.prepare("UPDATE gifts SET stock = stock - 1 WHERE id = ? AND stock > 0").run(gift.id);
      if (!taken.changes) return { status: 400, error: "已经换完了" };
      const now = new Date().toISOString();
      const info = ctx.db.prepare("INSERT INTO redemptions (gift_id, user_id, cost, created_at) VALUES (?, ?, ?, ?)").run(gift.id, ctx.user.id, gift.cost, now);
      ctx.db
        .prepare("INSERT INTO point_entries (club_id, user_id, delta, reason, ref_key, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(ctx.club.id, ctx.user.id, -gift.cost, "兑换 " + gift.name, "redeem:" + info.lastInsertRowid, now);
      return { ok: true, myPoints: balanceOf(ctx.db, ctx.club.id, ctx.user.id), stock: gift.stock - 1 };
    });
    const result = run();
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });

  app.post(BASE + "/api/clubs/:id/activities/:aid/media", async (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const activity = ctx.db.prepare("SELECT * FROM activities WHERE id = ? AND club_id = ?").get(req.params.aid, ctx.club.id);
    if (!activity) return res.status(404).json({ error: "没有这场活动" });
    const photos = ctx.db.prepare("SELECT COUNT(*) AS n FROM activity_media WHERE activity_id = ? AND kind = 'photo'").get(activity.id).n;
    const videos = ctx.db.prepare("SELECT COUNT(*) AS n FROM activity_media WHERE activity_id = ? AND kind = 'video'").get(activity.id).n;
    let buffer;
    try {
      buffer = oneFile(await readBody(req, VIDEO_MAX + 64 * 1024), req.get("content-type"));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.status === 413 ? "文件太大" : "没有读到文件" });
    }
    if (!buffer || !buffer.length) return res.status(400).json({ error: "没有读到文件" });
    const kind = sniff(buffer);
    if (!kind) return res.status(400).json({ error: "只收 jpg、png、webp 照片和 mp4、mov 视频" });
    if (kind.kind === "photo" && buffer.length > PHOTO_MAX) return res.status(413).json({ error: "照片不超过 8MB" });
    if (kind.kind === "video" && buffer.length > VIDEO_MAX) return res.status(413).json({ error: "视频不超过 40MB" });
    if (kind.kind === "photo" && photos >= PHOTO_LIMIT) {
      return res.status(400).json({ error: "照片最多 400 张，还剩 " + Math.max(0, PHOTO_LIMIT - photos) + " 张" });
    }
    if (kind.kind === "video" && videos >= VIDEO_LIMIT) {
      return res.status(400).json({ error: "视频最多 20 个，还剩 " + Math.max(0, VIDEO_LIMIT - videos) + " 个" });
    }
    const status = activity.review ? "pending" : "shown";
    const info = ctx.db
      .prepare("INSERT INTO activity_media (activity_id, user_id, kind, filename, status, created_at) VALUES (?, ?, ?, '', ?, ?)")
      .run(activity.id, ctx.user.id, kind.kind, status, new Date().toISOString());
    const id = Number(info.lastInsertRowid);
    const filename = id + "." + kind.ext;
    const dir = path.join(mediaRoot(), String(activity.id));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buffer);
    ctx.db.prepare("UPDATE activity_media SET filename = ? WHERE id = ?").run(filename, id);
    res.json({
      media: { id, kind: kind.kind, nickname: ctx.user.nickname, mine: true, status, pending: status === "pending" },
      photoLeft: Math.max(0, PHOTO_LIMIT - photos - (kind.kind === "photo" ? 1 : 0)),
      videoLeft: Math.max(0, VIDEO_LIMIT - videos - (kind.kind === "video" ? 1 : 0))
    });
  });

  app.post(BASE + "/api/clubs/:id/activities/:aid/media/:mid/approve", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !staffOnly(ctx, res)) return;
    const row = ctx.db
      .prepare(
        `SELECT m.id FROM activity_media m
         JOIN activities a ON a.id = m.activity_id
         WHERE m.id = ? AND a.id = ? AND a.club_id = ?`
      )
      .get(req.params.mid, req.params.aid, ctx.club.id);
    if (!row) return res.status(404).json({ error: "没有这张" });
    ctx.db.prepare("UPDATE activity_media SET status = 'shown' WHERE id = ?").run(row.id);
    res.json({ ok: true });
  });

  app.post(BASE + "/api/clubs/:id/activities/:aid/media/:mid/reject", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx || !staffOnly(ctx, res)) return;
    const row = ctx.db
      .prepare(
        `SELECT m.id, m.filename, m.activity_id FROM activity_media m
         JOIN activities a ON a.id = m.activity_id
         WHERE m.id = ? AND a.id = ? AND a.club_id = ?`
      )
      .get(req.params.mid, req.params.aid, ctx.club.id);
    if (!row) return res.status(404).json({ error: "没有这张" });
    removeMedia(ctx.db, row);
    res.json({ ok: true });
  });

  app.delete(BASE + "/api/clubs/:id/activities/:aid/media/:mid", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const row = ctx.db
      .prepare(
        `SELECT m.id, m.user_id, m.filename, m.activity_id FROM activity_media m
         JOIN activities a ON a.id = m.activity_id
         WHERE m.id = ? AND a.id = ? AND a.club_id = ?`
      )
      .get(req.params.mid, req.params.aid, ctx.club.id);
    if (!row) return res.status(404).json({ error: "没有这张" });
    const staff = memberRole(ctx.db, ctx.club, ctx.user.id) === "owner" || memberRole(ctx.db, ctx.club, ctx.user.id) === "manager";
    if (row.user_id !== ctx.user.id && !staff) return res.status(403).json({ error: "只能删自己传的" });
    removeMedia(ctx.db, row);
    res.json({ ok: true });
  });

  app.get(BASE + "/api/media/:mid", (req, res) => {
    const header = req.get("authorization") || "";
    const token = header.replace(/^Bearer\s+/i, "") || String(req.query.t || "");
    const user = token ? getDb().prepare("SELECT id FROM users WHERE token = ?").get(token) : null;
    if (!user) return res.status(401).json({ error: "请先登录" });
    const row = getDb()
      .prepare(
        `SELECT m.filename, m.kind, m.activity_id, m.status, m.user_id, a.club_id, c.owner_id
         FROM activity_media m
         JOIN activities a ON a.id = m.activity_id
         JOIN clubs c ON c.id = a.club_id
         WHERE m.id = ?`
      )
      .get(req.params.mid);
    if (!row || !row.filename) return res.status(404).json({ error: "没有这张" });
    const member = getDb().prepare("SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?").get(row.club_id, user.id);
    if (!member) return res.status(403).json({ error: "你不在这个跑团里" });
    if (row.status === "pending") {
      const role = memberRole(getDb(), { id: row.club_id, owner_id: row.owner_id }, user.id);
      if (row.user_id !== user.id && role !== "owner" && role !== "manager") return res.status(404).json({ error: "没有这张" });
    }
    const file = path.join(mediaRoot(), String(row.activity_id), path.basename(row.filename));
    if (!fs.existsSync(file)) return res.status(404).json({ error: "文件不在了" });
    const mime = row.kind === "video" ? (row.filename.endsWith(".mov") ? "video/quicktime" : "video/mp4") : row.filename.endsWith(".png") ? "image/png" : row.filename.endsWith(".webp") ? "image/webp" : "image/jpeg";
    const stat = fs.statSync(file);
    res.set("Accept-Ranges", "bytes");
    res.set("Content-Type", mime);
    res.set("Cache-Control", "private, max-age=3600");
    const range = req.get("range");
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (!match) return res.status(416).end();
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      if (start > end || end >= stat.size) return res.status(416).end();
      res.status(206);
      res.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      res.set("Content-Length", String(end - start + 1));
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.set("Content-Length", String(stat.size));
    fs.createReadStream(file).pipe(res);
  });
}

module.exports = { mountClubLife, enrichBoard, clubLife };
