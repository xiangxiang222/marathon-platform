const { parseClock, formatClock } = require("./career");

const KINDS = { place: "名次", age: "年龄组", local: "本地籍", break: "破时", club: "跑团" };
const DISTANCES = { full: "全马", half: "半马", "10k": "10公里", "5k": "5公里" };
const PROVINCES = ["北京", "天津", "河北", "山西", "内蒙古", "辽宁", "吉林", "黑龙江", "上海", "江苏", "浙江", "安徽", "福建", "江西", "山东", "河南", "湖北", "湖南", "广东", "广西", "海南", "重庆", "四川", "贵州", "云南", "西藏", "陕西", "甘肃", "青海", "宁夏", "新疆", "香港", "澳门"];
const NOTE = "仅供参考。奖项和往届成绩都要有来源。没有往届名次成绩时，不估算概率。";

function chars(value) {
  return [...String(value || "")].length;
}

function beijingMonth() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7);
}

function beijingToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function intIn(value, min, max) {
  if (typeof value === "string") {
    if (!/^-?\d+$/.test(value.trim())) return null;
    value = Number(value);
  }
  if (typeof value === "boolean" || value == null || !Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

function ageOn(birth, raceDate) {
  const [by, bm] = birth.split("-").map(Number);
  const [ry, rm] = raceDate.split("-").map(Number);
  let age = ry - by;
  if (rm <= bm) age -= 1;
  return age;
}

function gapLabel(seconds) {
  const abs = Math.abs(seconds);
  const word = seconds >= 0 ? "快约" : "慢约";
  if (abs < 60) return word + " " + abs + " 秒";
  return word + " " + Math.round(abs / 60) + " 分钟";
}

function amountText(amount, tax) {
  if (!amount) return "非现金";
  if (tax) return "税后 " + Math.round((amount * (100 - tax)) / 100) + " 元";
  return "税前 " + amount + " 元";
}

function genderWord(gender) {
  if (gender === "男") return "男子";
  if (gender === "女") return "女子";
  return "";
}

function titleOf(rule) {
  const gender = genderWord(rule.gender);
  if (rule.kind === "break") return (gender || "") + "破 " + formatClock(rule.break_sec);
  if (rule.kind === "local") return rule.province + "籍" + gender + "前 " + rule.place_n + " 名";
  if (rule.kind === "club") return "跑团前 " + rule.place_n + " 名";
  if (rule.kind === "age") return rule.age_min + "–" + rule.age_max + " 岁" + gender + "组，前 " + rule.place_n + " 名";
  return (gender || "不限") + "前 " + rule.place_n + " 名";
}

function emptyProfile() {
  return { gender: "", birth: "", province: "", targets: { full: "", half: "", "10k": "", "5k": "" } };
}

function presentProfile(row) {
  const profile = emptyProfile();
  if (!row) return profile;
  profile.gender = row.gender;
  profile.birth = row.birth;
  profile.province = row.province;
  for (const key of Object.keys(DISTANCES)) {
    if (row["target_" + key]) profile.targets[key] = formatClock(row["target_" + key]);
  }
  return profile;
}

function readProfile(body) {
  const gender = String((body && body.gender) || "").trim();
  if (gender && gender !== "男" && gender !== "女") return { error: "性别选男、女，或留空", status: 400 };
  const birth = String((body && body.birth) || "").trim();
  if (birth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(birth)) return { error: "出生年月写成 1986-06", status: 400 };
  if (birth && birth > beijingMonth()) return { error: "出生年月不能晚于本月", status: 400 };
  const province = String((body && body.province) || "").trim();
  if (province && !PROVINCES.includes(province)) return { error: "省份不在名单里", status: 400 };
  const targets = {};
  const incoming = (body && body.targets) || {};
  for (const key of Object.keys(DISTANCES)) {
    const text = String(incoming[key] || "").trim();
    if (!text) {
      targets[key] = 0;
      continue;
    }
    const sec = parseClock(text);
    if (sec == null) return { error: "成绩写成 3:30:00", status: 400 };
    targets[key] = sec;
  }
  return { gender, birth, province, targets };
}

function readRule(body) {
  const distance = String((body && body.distance) || "").trim();
  if (!DISTANCES[distance]) return { error: "项目选全马、半马、10 公里或 5 公里", status: 400 };
  const kind = String((body && body.kind) || "").trim();
  if (!KINDS[kind]) return { error: "类型选名次、年龄组、本地籍、破时或跑团", status: 400 };
  const gender = String(body.gender || "").trim();
  if (gender && gender !== "男" && gender !== "女") return { error: "性别选男、女，或留空", status: 400 };
  const ageMin = intIn(body.ageMin == null || body.ageMin === "" ? 0 : body.ageMin, 0, 120);
  const ageMax = intIn(body.ageMax == null || body.ageMax === "" ? 0 : body.ageMax, 0, 120);
  if (ageMin == null || ageMax == null || (ageMin === 0) !== (ageMax === 0) || (ageMin && ageMin > ageMax)) {
    return { error: "年龄写成 18 到 65 这种", status: 400 };
  }
  const province = String(body.province || "").trim();
  if (kind === "local") {
    if (!PROVINCES.includes(province)) return { error: "省份不在名单里", status: 400 };
  } else if (province) {
    return { error: "只有本地籍填写省份", status: 400 };
  }
  const placeN = intIn(body.placeN == null || body.placeN === "" ? 0 : body.placeN, 0, 100);
  if (placeN == null) return { error: "名次写成 1 到 100", status: 400 };
  const breakText = String(body.breakClock || "").trim();
  const breakSec = breakText ? parseClock(breakText) : 0;
  if (breakText && breakSec == null) return { error: "成绩写成 3:30:00", status: 400 };
  if (kind === "break") {
    if (!breakSec) return { error: "成绩写成 3:30:00", status: 400 };
    if (placeN) return { error: "破时不填名次", status: 400 };
  } else if (!placeN) {
    return { error: "名次写成 1 到 100", status: 400 };
  } else if (breakSec) {
    return { error: "只有破时填写成绩线", status: 400 };
  }
  const amount = intIn(body.amount == null || body.amount === "" ? 0 : body.amount, 0, 999999);
  if (amount == null) return { error: "金额写成 0 到 999999 的整数元，0 表示非现金", status: 400 };
  const tax = intIn(body.tax == null || body.tax === "" ? 0 : body.tax, 0, 50);
  if (tax == null) return { error: "税率写成 0 到 50", status: 400 };
  if (body.stack !== true && body.stack !== false) return { error: "选择能否叠加", status: 400 };
  const source = String(body.source || "").trim();
  if (chars(source) < 1 || chars(source) > 80) return { error: "来源写成 1 到 80 个字", status: 400 };
  const cutoffText = String(body.cutoffClock || "").trim();
  const cutoffSec = cutoffText ? parseClock(cutoffText) : 0;
  if (cutoffText && cutoffSec == null) return { error: "成绩写成 3:30:00", status: 400 };
  const cutoffSource = String(body.cutoffSource || "").trim();
  if (cutoffSec && (chars(cutoffSource) < 1 || chars(cutoffSource) > 80)) return { error: "往届成绩要写来源", status: 400 };
  if (!cutoffSec && cutoffSource) return { error: "没有往届成绩就不用写来源", status: 400 };
  const note = String(body.note || "").trim();
  if (chars(note) > 40) return { error: "说明最多 40 个字", status: 400 };
  return {
    distance,
    kind,
    gender,
    ageMin,
    ageMax,
    province,
    placeN,
    breakSec: breakSec || 0,
    amount,
    tax,
    stack: body.stack ? 1 : 0,
    source,
    cutoffSec: cutoffSec || 0,
    cutoffSource,
    note
  };
}

function presentRule(row) {
  return {
    id: row.id,
    distance: row.distance,
    distanceLabel: DISTANCES[row.distance],
    kind: row.kind,
    kindLabel: KINDS[row.kind],
    gender: row.gender,
    ageMin: row.age_min,
    ageMax: row.age_max,
    province: row.province,
    placeN: row.place_n,
    breakClock: row.break_sec ? formatClock(row.break_sec) : "",
    amount: row.amount,
    tax: row.tax,
    stack: Boolean(row.stack),
    source: row.source,
    cutoffClock: row.cutoff_sec ? formatClock(row.cutoff_sec) : "",
    cutoffSource: row.cutoff_source,
    note: row.note,
    title: titleOf(row),
    amountText: amountText(row.amount, row.tax)
  };
}

function lineOf(rule) {
  return rule.kind === "break" ? rule.break_sec : rule.cutoff_sec;
}

function bandOf(row) {
  if (row.kind === "club") return 3;
  if (row.ahead === true) return 0;
  if (row.ahead === false) return 2;
  return 1;
}

function mountRadar(app, { BASE, getDb, userFrom, requireAdmin }) {
  function login(req, res) {
    const user = userFrom(req);
    if (!user) {
      res.status(401).json({ error: "请先登录" });
      return null;
    }
    return user;
  }

  app.get(BASE + "/api/radar", (req, res) => {
    const user = login(req, res);
    if (!user) return;
    const db = getDb();
    const stored = db.prepare("SELECT * FROM radar_profiles WHERE user_id = ?").get(user.id);
    const profile = presentProfile(stored);
    const pb = {};
    for (const row of db.prepare("SELECT distance, MIN(seconds) AS seconds FROM results WHERE user_id = ? GROUP BY distance").all(user.id)) {
      pb[row.distance] = row.seconds;
    }
    const today = beijingToday();
    const rows = db
      .prepare(
        `SELECT p.*, r.name, r.race_date, r.city, r.province AS race_province
         FROM prize_rules p JOIN races r ON r.id = p.race_id
         WHERE r.race_date >= ?
         ORDER BY r.race_date, p.id`
      )
      .all(today)
      .filter((rule) => {
        if (rule.gender && rule.gender !== profile.gender) return false;
        if (rule.kind === "local" && rule.province !== profile.province) return false;
        if (rule.age_min || rule.age_max) {
          if (!profile.birth) return false;
          const age = ageOn(profile.birth, rule.race_date);
          if (age < rule.age_min || age > rule.age_max) return false;
        }
        return true;
      })
      .map((rule) => {
        const target = stored ? stored["target_" + rule.distance] : 0;
        const seconds = target || pb[rule.distance] || 0;
        const which = target ? "目标" : "PB";
        const line = lineOf(rule);
        let ahead = null;
        let gap = null;
        let reason = titleOf(rule);
        if (rule.kind === "club") {
          reason += "。这是跑团奖，不按个人成绩排。";
        } else if (!seconds) {
          reason += "。还没有这场距离的成绩。";
        } else if (!line) {
          reason += "。往届名次成绩还没录入，不估算概率。";
        } else {
          gap = line - seconds;
          ahead = gap >= 0;
          const place = rule.kind === "break" ? "" : "往届第 " + rule.place_n + " 名 ";
          reason += "。" + place + formatClock(line) + "，你的 " + which + " " + formatClock(seconds) + "，" + (gap === 0 ? "一样。" : gapLabel(gap) + "。");
        }
        return {
          ruleId: rule.id,
          race: { id: rule.race_id, name: rule.name, raceDate: rule.race_date, city: rule.city, province: rule.race_province },
          kind: rule.kind,
          kindLabel: KINDS[rule.kind],
          title: titleOf(rule),
          amountText: amountText(rule.amount, rule.tax),
          stack: Boolean(rule.stack),
          clockLabel: seconds ? which + " " + formatClock(seconds) : "",
          reason,
          ahead,
          gap,
          source: rule.source,
          cutoffSource: rule.cutoff_source
        };
      })
      .sort((a, b) => bandOf(a) - bandOf(b) || (b.gap || 0) - (a.gap || 0) || a.race.raceDate.localeCompare(b.race.raceDate) || a.ruleId - b.ruleId);
    res.json({ note: NOTE, profile, rows });
  });

  app.put(BASE + "/api/me/radar", (req, res) => {
    const user = login(req, res);
    if (!user) return;
    const input = readProfile(req.body || {});
    if (input.error) return res.status(input.status).json({ error: input.error });
    getDb()
      .prepare(
        `INSERT INTO radar_profiles (user_id, gender, birth, province, target_full, target_half, target_10k, target_5k)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           gender = excluded.gender,
           birth = excluded.birth,
           province = excluded.province,
           target_full = excluded.target_full,
           target_half = excluded.target_half,
           target_10k = excluded.target_10k,
           target_5k = excluded.target_5k`
      )
      .run(user.id, input.gender, input.birth, input.province, input.targets.full, input.targets.half, input.targets["10k"], input.targets["5k"]);
    res.json({ ok: true });
  });

  app.get(BASE + "/api/admin/races/:id/prizes", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    if (!db.prepare("SELECT id FROM races WHERE id = ?").get(req.params.id)) return res.status(404).json({ error: "没有这场比赛" });
    const rows = db.prepare("SELECT * FROM prize_rules WHERE race_id = ? ORDER BY id").all(req.params.id).map(presentRule);
    res.json({ prizes: rows });
  });

  app.post(BASE + "/api/admin/races/:id/prizes", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    if (!db.prepare("SELECT id FROM races WHERE id = ?").get(req.params.id)) return res.status(404).json({ error: "没有这场比赛" });
    const input = readRule(req.body || {});
    if (input.error) return res.status(input.status).json({ error: input.error });
    const info = db
      .prepare(
        `INSERT INTO prize_rules (
           race_id, distance, kind, gender, age_min, age_max, province, place_n, break_sec,
           amount, tax, stack, source, cutoff_sec, cutoff_source, note
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.params.id,
        input.distance,
        input.kind,
        input.gender,
        input.ageMin,
        input.ageMax,
        input.province,
        input.placeN,
        input.breakSec,
        input.amount,
        input.tax,
        input.stack,
        input.source,
        input.cutoffSec,
        input.cutoffSource,
        input.note
      );
    res.json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  app.delete(BASE + "/api/admin/races/:id/prizes/:pid", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const gone = getDb().prepare("DELETE FROM prize_rules WHERE id = ? AND race_id = ?").run(req.params.pid, req.params.id);
    if (!gone.changes) return res.status(404).json({ error: "没有这条奖项" });
    res.json({ ok: true });
  });
}

module.exports = { mountRadar, ageOn };
