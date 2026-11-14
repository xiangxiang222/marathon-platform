const crypto = require("crypto");
const { parseClock, formatClock } = require("./career");

const DISTANCES = { full: "全马", half: "半马", "10k": "10公里", "5k": "5公里" };
const ACTIVE = ["中签", "已缴费", "已领物"];
const LEVEL_LABELS = { priority: "值得优先看", challenge: "可以冲一冲", pressure: "竞争压力较大", unknown: "待补充资料" };
const initialized = new WeakSet();
const todayOf = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

function fail(message) { throw Object.assign(new Error(message), { status: 400 }); }
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(label + "格式不正确");
  return value;
}
function text(value, label, max, required = false) {
  if (value == null && !required) return "";
  if (typeof value !== "string") fail(label + "须为文字");
  const clean = value.trim();
  if ((required && !clean) || [...clean].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)) fail(label + "请填写" + (required ? "1 到 " : "不超过 ") + max + "个字");
  return clean;
}
function integer(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail(label + "须为 " + min + " 到 " + max + " 的整数");
  return value;
}
function oneOf(value, choices, label) {
  if (!choices.includes(value)) fail(label + "须为" + choices.join("、"));
  return value;
}
function array(value, label, max) {
  if (!Array.isArray(value) || value.length > max) fail(label + "须为数组，最多 " + max + " 项");
  return value;
}
function unique(set, value, label) {
  if (set.has(value)) fail(label + "不能重复");
  set.add(value);
}
function clock(value, label) {
  const raw = text(value, label, 12, true);
  const seconds = parseClock(raw);
  if (seconds == null) fail(label + "请写成 2:30:00 或 45:30");
  return formatClock(seconds);
}
function validDay(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value && value >= "1900-01-01";
}
function pastDay(value, label, { raceDate, today = todayOf() } = {}) {
  if (!validDay(value) || value > today || (raceDate && value > raceDate)) fail(label + "须为已发生的有效日期（YYYY-MM-DD）");
  return value;
}

function ensureRadarSchema(db) {
  if (initialized.has(db)) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS radar_configs (
      race_id TEXT PRIMARY KEY, config TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS radar_entries (
      user_id INTEGER NOT NULL, race_id TEXT NOT NULL, public_id TEXT NOT NULL UNIQUE,
      distance TEXT NOT NULL, gender TEXT NOT NULL, seconds INTEGER NOT NULL,
      pb_date TEXT NOT NULL, status TEXT NOT NULL, consent_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id,race_id)
    );
    CREATE INDEX IF NOT EXISTS radar_entries_race ON radar_entries(race_id,distance,gender);
    CREATE TRIGGER IF NOT EXISTS radar_delete_race AFTER DELETE ON races BEGIN
      DELETE FROM radar_configs WHERE race_id=OLD.id;
      DELETE FROM radar_entries WHERE race_id=OLD.id;
    END;
    CREATE TRIGGER IF NOT EXISTS radar_delete_user AFTER DELETE ON users BEGIN
      DELETE FROM radar_entries WHERE user_id=OLD.id;
    END;
  `);
  initialized.add(db);
}

function validateRadarConfig(input, context = {}) {
  const config = object(input, "雷达资料");
  if (typeof config.demo !== "boolean") fail("请选择资料是否为模拟数据");
  const groupIds = new Set(), scopes = new Set();
  const raceYear = Number((context.raceDate || context.today || todayOf()).slice(0, 4));
  const groups = array(config.groups, "组别", 8).map((value) => {
    const group = object(value, "组别");
    const id = text(group.id, "组别编号", 64, true);
    unique(groupIds, id, "组别编号");
    const distance = oneOf(group.distance, Object.keys(DISTANCES), "比赛项目");
    const gender = oneOf(group.gender, ["男", "女"], "比赛性别");
    unique(scopes, distance + ":" + gender, "同项目同性别组别");
    const timing = oneOf(group.timing, ["gun", "net"], "计时口径");
    const awardDepth = integer(group.awardDepth, "本期评估奖励名次", 1, 8);
    const places = new Set();
    const awards = array(group.awards || [], "奖金", 8).map((item) => {
      object(item, "奖金");
      const place = integer(item.place, "奖金名次", 1, 8);
      if (place > awardDepth) fail("奖金名次不能超出本期评估奖励名次");
      unique(places, place, "奖金名次");
      return { place, amount: integer(item.amount, "奖金金额", 0, 99999999) };
    }).sort((a, b) => a.place - b.place);
    const years = new Set();
    const histories = array(group.histories || [], "历届成绩", 30).map((item) => {
      object(item, "历届成绩");
      const year = integer(item.year, "历届年份", 1900, raceYear - 1);
      unique(years, year, "历届年份");
      const ranks = new Set();
      const rows = array(item.rows, "历届名次", 8).map((row) => {
        object(row, "名次成绩");
        const place = integer(row.place, "成绩名次", 1, 8);
        unique(ranks, place, "同届成绩名次");
        return { place, name: text(row.name, "选手姓名", 80), clock: clock(row.clock, "名次成绩") };
      }).sort((a, b) => a.place - b.place);
      for (let i = 1; i < rows.length; i += 1) {
        if (parseClock(rows[i].clock) < parseClock(rows[i - 1].clock)) fail("历届成绩须按名次由快到慢排列");
      }
      return { year, source: text(item.source, "历届成绩来源", 500, true), timing: oneOf(item.timing, ["gun", "net"], "历届计时口径"), rows };
    }).sort((a, b) => b.year - a.year);
    const entrantIds = new Set();
    const entrants = array(group.entrants || [], "本届参赛线索", 100).map((item) => {
      object(item, "参赛线索");
      const entrantId = text(item.id, "参赛线索编号", 80, true);
      unique(entrantIds, entrantId, "同组参赛线索编号");
      const evidence = oneOf(item.evidence, ["verified", "self_reported"], "线索证据");
      return { id: entrantId, name: text(item.name, "选手姓名", 80), clock: clock(item.clock, "选手 PB"),
        pbDate: pastDay(item.pbDate, "PB 日期", context),
        status: oneOf(item.status, [...ACTIVE, "弃赛"], "参赛状态"), evidence,
        source: text(item.source, "选手线索来源", 500, !config.demo && evidence === "verified") };
    });
    return { id, distance, gender, timing, awardDepth, eligibility: text(group.eligibility, "资格说明", 500),
      ruleSource: text(group.ruleSource, "奖励规则来源", 500, true), awards, histories, entrants };
  });
  return { demo: config.demo, groups };
}

function loadRadarConfig(db, raceId) {
  ensureRadarSchema(db);
  const row = db.prepare("SELECT config FROM radar_configs WHERE race_id=?").get(raceId);
  return row ? JSON.parse(row.config) : { demo: false, groups: [] };
}
function saveRadarConfig(db, raceId, config) {
  ensureRadarSchema(db);
  db.prepare(`INSERT INTO radar_configs(race_id,config,updated_at) VALUES(?,?,?)
    ON CONFLICT(race_id) DO UPDATE SET config=excluded.config,updated_at=excluded.updated_at`).run(raceId, JSON.stringify(config), new Date().toISOString());
}

// Only the current runner's records are read here. No private history is queried
// when assembling another runner's competition pool.
function readAbilities(db, userId, today = todayOf()) {
  const records = [];
  if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='race_history_entries'").get()) {
    const overlays = new Set();
    const hidden = new Set(db.prepare("SELECT identity_hash FROM race_history_tombstones WHERE user_id=?").all(userId).map((row) => row.identity_hash));
    const rows = db.prepare("SELECT * FROM race_history_entries WHERE user_id=?").all(userId);
    for (const row of rows) {
      if (row.legacy_key) overlays.add(row.legacy_key);
      if (row.deleted || row.status !== "finished" || row.kind !== "road" || row.meet !== "offline" || !validDay(row.race_date) || row.race_date > today) continue;
      const seconds = row.timing === "gun" ? row.gun_seconds : row.timing === "net" ? row.net_seconds : row.unknown_seconds;
      if (!DISTANCES[row.distance] || !Number.isInteger(seconds) || seconds <= 0 || seconds > 43200) continue;
      records.push({ distance: row.distance, timing: row.timing, seconds, clock: formatClock(seconds), label: "个人最好成绩", source: "我的跑史 · 本人记录", date: row.race_date, scenario: false, verified: false });
    }
    for (const row of db.prepare(`SELECT res.distance,res.seconds,res.race_id,r.race_date,r.kinds,r.meet FROM results res JOIN races r ON r.id=res.race_id WHERE res.user_id=?`).all(userId)) {
      const key = `result:${row.race_id}:${row.distance}`;
      if (overlays.has(key) || hidden.has(crypto.createHash("sha256").update(key).digest("hex"))) continue;
      if (!DISTANCES[row.distance] || !validDay(row.race_date) || row.race_date > today || String(row.kinds).split(",").includes("trail") || row.kinds === "other" || row.meet === "online") continue;
      if (!Number.isInteger(row.seconds) || row.seconds <= 0 || row.seconds > 43200) continue;
      records.push({ distance: row.distance, timing: "unknown", seconds: row.seconds, clock: formatClock(row.seconds), label: "个人最好成绩", source: "原有成绩 · 计时口径待确认", date: row.race_date, scenario: false, verified: false });
    }
  } else {
    for (const row of db.prepare(`SELECT res.distance,res.seconds,r.race_date,r.kinds,r.meet FROM results res JOIN races r ON r.id=res.race_id WHERE res.user_id=?`).all(userId)) {
      if (!DISTANCES[row.distance] || !validDay(row.race_date) || row.race_date > today || String(row.kinds).split(",").includes("trail") || row.kinds === "other" || row.meet === "online" || row.seconds <= 0 || row.seconds > 43200) continue;
      records.push({ distance: row.distance, timing: "unknown", seconds: row.seconds, clock: formatClock(row.seconds), label: "个人最好成绩", source: "原有成绩 · 计时口径待确认", date: row.race_date, scenario: false, verified: false });
    }
  }
  const best = new Map();
  for (const record of records) {
    const key = record.distance + ":" + record.timing;
    if (!best.has(key) || record.seconds < best.get(key).seconds || (record.seconds === best.get(key).seconds && record.date > best.get(key).date)) best.set(key, record);
  }
  return [...best.values()].sort((a, b) => a.seconds - b.seconds);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
function normalizedHistories(group) {
  return group.histories.map((history) => ({ ...history, rows: history.rows.map((row) => ({ ...row, seconds: parseClock(row.clock) })) })).sort((a, b) => b.year - a.year);
}
function historyOf(group, histories) {
  const matching = histories.filter((item) => item.timing === group.timing);
  const latest = matching[0];
  const samples = matching.filter((item) => item.rows.some((row) => row.place === group.awardDepth)).slice(0, 3);
  const thresholds = samples.map((item) => ({ year: item.year, seconds: item.rows.find((row) => row.place === group.awardDepth).seconds, clock: item.rows.find((row) => row.place === group.awardDepth).clock }));
  const seconds = thresholds.length ? median(thresholds.map((item) => item.seconds)) : null;
  const min = thresholds.length ? Math.min(...thresholds.map((item) => item.seconds)) : null;
  const max = thresholds.length ? Math.max(...thresholds.map((item) => item.seconds)) : null;
  const rowAt = (place) => latest?.rows.find((row) => row.place === place)?.clock || "";
  return { year: latest?.year || null, complete: Boolean(latest && latest.rows.length === 8 && latest.rows.every((row, index) => row.place === index + 1)),
    clock: seconds == null ? "" : formatClock(seconds), medianSeconds: seconds, podiumClock: rowAt(3), eighthClock: rowAt(8), sampleCount: samples.length,
    years: samples.map((item) => item.year), rangeLabel: min == null ? "" : formatClock(min) + (min === max ? "" : "–" + formatClock(max)), thresholds };
}

function abilityOf(group, profile, abilities, ownEntry) {
  const target = parseClock(profile.targets?.[group.distance]);
  if (target) return { clock: formatClock(target), seconds: target, label: "目标成绩情景", source: "你设置的目标成绩", date: "", scenario: true, timing: group.timing, verified: false };
  const candidates = abilities.filter((item) => item.distance === group.distance);
  const exact = candidates.find((item) => item.timing === group.timing);
  if (exact) return { ...exact };
  if (ownEntry && ownEntry.distance === group.distance && ownEntry.gender === group.gender) return { clock: formatClock(ownEntry.seconds), seconds: ownEntry.seconds, label: "自报 PB", source: "本人自愿提交 · 未核验", date: ownEntry.pb_date, scenario: false, timing: "unknown", verified: false };
  return candidates.length ? { ...candidates[0] } : null;
}

function publicEntrants(group, config, authorized, userId) {
  const configured = group.entrants.filter((item) => ACTIVE.includes(item.status)).map((item) => ({ ...item, key: "editor:" + item.id, seconds: parseClock(item.clock), timing: "unknown", demo: config.demo, anonymous: !item.name, sourceLabel: config.demo ? "模拟参赛线索" : item.evidence === "verified" ? "后台核验线索" : "自报线索 · 未核验" })).sort((a, b) => a.seconds - b.seconds);
  if (config.demo) return configured.sort((a, b) => a.seconds - b.seconds);
  // The random public id cannot be used to discover an account or private
  // archive. Own submissions are reported separately and never counted twice.
  const participants = authorized.filter((row) => row.user_id !== userId && row.distance === group.distance && row.gender === group.gender).map((row) => ({ key: "participant:" + row.public_id, name: "已中签跑者", clock: formatClock(row.seconds), seconds: row.seconds, pbDate: row.pb_date, status: row.plan_status, evidence: "self_reported", anonymous: true, demo: false, sourceLabel: "本人自愿提交 · 未核验", timing: "unknown" }));
  return configured.concat(participants).sort((a, b) => a.seconds - b.seconds);
}

function evaluate(group, history, histories, ability, genderKnown, entrants) {
  const timingMatches = Boolean(ability && ability.timing === group.timing);
  const canCompare = Boolean(ability && genderKnown && timingMatches);
  const faster = canCompare ? entrants.filter((item) => item.seconds < ability.seconds) : [];
  const verified = faster.filter((item) => item.evidence === "verified");
  const selfReported = faster.filter((item) => item.evidence === "self_reported");
  let level = "unknown", gap = null, historicalPlace = null;
  const reasons = [];
  if (!genderKnown) reasons.push("选择参赛性别后，按对应榜单评估。");
  else if (!ability) reasons.push("设置这个项目的目标成绩，或补充个人成绩后查看匹配情况。");
  else if (!timingMatches) reasons.push(ability.timing === "unknown" ? "个人成绩计时口径待确认，暂不与枪声或净计时榜单直接比较。" : "个人成绩与本届奖励的计时口径不同，暂不直接比较。");
  else if (history.medianSeconds == null) reasons.push("缺少同计时口径的历史第 " + group.awardDepth + " 名成绩，暂不推算奖励门槛。");
  else {
    gap = history.medianSeconds - ability.seconds;
    const thresholds = history.thresholds.map((item) => item.seconds);
    level = ability.seconds < Math.min(...thresholds) ? "priority" : gap >= 0 ? "challenge" : "pressure";
    const label = ability.scenario ? "按目标成绩情景" : "按已记录的个人成绩";
    reasons.push(label + "，" + (gap > 0 ? "快于" : gap < 0 ? "慢于" : "持平") + "近 " + history.sampleCount + " 届历史第 " + group.awardDepth + " 名参考" + (gap ? " " + formatClock(Math.abs(gap)) : "") + "。");
    const latest = histories.find((item) => item.timing === group.timing);
    if (latest && latest.rows.every((row, index) => row.place === index + 1)) {
      const fasterRows = latest.rows.filter((row) => row.seconds < ability.seconds);
      const place = fasterRows.length + 1;
      if (place <= latest.rows.length) historicalPlace = place;
    }
    if (verified.length >= group.awardDepth) {
      level = "pressure";
      reasons.push("本届已核验线索中，已有 " + verified.length + " 位选手的 PB 数值快于你的比较成绩，需下调历史优势参考。");
    } else if (verified.length && level === "priority") {
      level = "challenge";
      reasons.push("本届已出现 " + verified.length + " 位 PB 更快的已核验选手，需关注当前阵容。");
    }
    if (selfReported.length) {
      if (faster.length >= group.awardDepth) level = "pressure";
      else if (level === "priority") level = "challenge";
      reasons.push("另有 " + selfReported.length + " 位自报 PB 更快的参赛线索，仍待核验。");
    }
  }
  if (histories.some((item) => item.timing !== group.timing)) reasons.push("不同计时口径的往届成绩未计入参考。");
  const notice = "仅覆盖平台已知参赛线索；未标记不代表不参赛。PB 的赛事和计时口径未必一致，只作能力线索，不能据此推算今年名次或获奖概率。";
  return { level, levelLabel: LEVEL_LABELS[level], gap, historicalPlace, reason: reasons.join(""), competition: { knownCount: entrants.length, canCompare, comparisonBasis: "pb_clues", fasterCount: canCompare ? faster.length : null, verifiedFasterCount: canCompare ? verified.length : null, selfReportedFasterCount: canCompare ? selfReported.length : null, notice, entrants } };
}

function buildRadar(db, user, profile, { today = todayOf() } = {}) {
  ensureRadarSchema(db);
  const abilities = readAbilities(db, user.id, today);
  const configs = db.prepare(`SELECT c.config,r.id,r.name,r.race_date,r.city,r.province,r.distances FROM radar_configs c JOIN races r ON r.id=c.race_id WHERE r.race_date>=? ORDER BY r.race_date,r.id`).all(today);
  const authorized = db.prepare(`SELECT e.*,p.status AS plan_status FROM radar_entries e JOIN plans p ON p.user_id=e.user_id AND p.race_id=e.race_id JOIN users u ON u.id=e.user_id WHERE p.status IN ('中签','已缴费','已领物')`).all();
  const ownEntries = db.prepare(`SELECT e.*,p.status AS plan_status FROM radar_entries e LEFT JOIN plans p ON p.user_id=e.user_id AND p.race_id=e.race_id WHERE e.user_id=?`).all(user.id);
  const opportunities = [];
  for (const row of configs) {
    const config = JSON.parse(row.config);
    const available = String(row.distances).split(",");
    for (const group of config.groups) {
      if (profile.gender && group.gender !== profile.gender) continue;
      if (!available.includes(group.distance)) continue;
      const histories = normalizedHistories(group);
      const history = historyOf(group, histories);
      const ownEntry = ownEntries.find((item) => item.race_id === row.id && item.distance === group.distance && item.gender === group.gender);
      const ability = abilityOf(group, profile, abilities, ownEntry);
      const entrants = publicEntrants(group, config, authorized.filter((item) => item.race_id === row.id), user.id);
      const result = evaluate(group, history, histories, ability, Boolean(profile.gender), entrants);
      opportunities.push({ id: row.id + ":" + group.id, race: { id: row.id, name: row.name, raceDate: row.race_date, city: row.city, province: row.province }, groupId: group.id,
        distance: group.distance, distanceLabel: DISTANCES[group.distance], gender: group.gender, timing: group.timing, demo: config.demo, awardDepth: group.awardDepth,
        eligibility: group.eligibility, ruleSource: group.ruleSource, awards: group.awards, histories, history, ability,
        ...result, myEntry: ownEntry ? { distance: ownEntry.distance, gender: ownEntry.gender, clock: formatClock(ownEntry.seconds), pbDate: ownEntry.pb_date, status: ownEntry.plan_status || ownEntry.status, active: ACTIVE.includes(ownEntry.plan_status), consent: true, evidence: "self_reported" } : null });
    }
  }
  const bands = { priority: 0, challenge: 1, pressure: 2, unknown: 3 };
  opportunities.sort((a, b) => bands[a.level] - bands[b.level] || a.race.raceDate.localeCompare(b.race.raceDate) || a.id.localeCompare(b.id));
  const matching = opportunities.filter((item) => ["priority", "challenge"].includes(item.level)).length;
  const summary = !opportunities.length ? "还没有收录适合比较的赛事资料。" : !profile.gender ? "先选择参赛性别，再查看适合自己的比赛。" : "已比较 " + opportunities.length + " 个赛事组别，" + matching + " 个值得进一步了解。";
  return { version: 2, opportunities, abilities, summary };
}

function validateEntry(input, { race, config, today = todayOf() }) {
  const body = object(input, "参赛线索");
  if (body.consent !== true) fail("请明确同意将这份自报 PB 与参赛状态匿名用于拿奖雷达");
  const distance = oneOf(body.distance, Object.keys(DISTANCES), "参赛项目");
  const gender = oneOf(body.gender, ["男", "女"], "参赛性别");
  if (!String(race.distances).split(",").includes(distance)) fail("这场比赛没有这个项目");
  const group = config.groups.find((item) => item.distance === distance && item.gender === gender);
  if (!group) fail("这个组别还没有开通拿奖雷达");
  if (config.demo) fail("模拟赛事不能提交真实参赛线索");
  if (race.race_date < today) fail("比赛已经结束，不能新增参赛线索");
  return { distance, gender, seconds: parseClock(clock(body.clock, "本人 PB")), pbDate: pastDay(body.pbDate, "PB 日期", { today, raceDate: race.race_date }), status: oneOf(body.status, ACTIVE, "参赛状态") };
}

module.exports = { ensureRadarSchema, validateRadarConfig, loadRadarConfig, saveRadarConfig, buildRadar, readAbilities, validateEntry, validDay, todayOf };
