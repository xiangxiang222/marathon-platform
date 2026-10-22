const crypto = require("crypto");
const { compactName } = require("./official");
const { readRule } = require("./radar");

const DISTANCES = ["full", "half", "10k", "5k"];
const DISTANCE_LABEL = { full: "全马", half: "半马", "10k": "10公里", "5k": "5公里" };
const KINDS = ["trail", "ultra", "family", "fun"];
const KIND_LABEL = { trail: "越野", ultra: "超马", family: "亲子", fun: "欢乐跑" };
const PRIZE_KIND = { place: "名次", age: "年龄组", local: "本地籍", break: "破时", club: "跑团" };
const URL_FIELDS = [
  ["signupUrl", "报名"],
  ["drawUrl", "抽签"],
  ["bibUrl", "领物查询"],
  ["resultUrl", "成绩"],
  ["liveUrl", "直播"],
  ["eventUrl", "赛事网站"],
  ["detailUrl", "官网"]
];

function cstDay(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function botGate(req) {
  const expected = process.env.GROK_BOT_TOKEN || "";
  if (!expected) return { error: "还没有配置上传口令", status: 503 };
  const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const left = Buffer.from(token);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return { error: "口令不对", status: 401 };
  }
  return null;
}

function clip(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max + 1);
}

function limited(value, max, label) {
  const text = clip(value, max);
  if (text.length > max) return { error: label + "不超过 " + max + " 个字" };
  return { text };
}

function httpsUrl(value) {
  const text = clip(value, 300);
  if (text.length > 300) return { error: "链接不超过 300 个字" };
  if (!text) return { text: "" };
  if (!/^https:\/\/\S+$/i.test(text)) return { error: "链接要以 https:// 开头" };
  return { text };
}

function day(value) {
  const text = clip(value, 10);
  if (!text) return { text: "" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { error: "日期须为 2026-10-28 这种格式" };
  return { text };
}

function gradeOf(value) {
  const text = clip(value, 12).replace(/\s+/g, "");
  if (!text) return "";
  if (text === "A" || text === "A类") return "A";
  if (text === "B" || text === "B类") return "B";
  if (text === "C" || text === "C类") return "C";
  if (text === "TEN" || text === "系列赛") return "TEN";
  return "";
}

function distancesFrom(body) {
  const given = Array.isArray(body.distances) ? body.distances : String(body.distances || "").split(/[,、]/);
  const picked = [];
  for (const item of given) {
    const key = String(item || "").trim();
    if (!key) continue;
    if (!DISTANCES.includes(key)) return { error: "项目选全马、半马、10公里或5公里" };
    if (!picked.includes(key)) picked.push(key);
  }
  if (picked.length) return { distances: picked, distancesSet: true };
  const raw = String(body.items || "");
  const found = [];
  if (itemsOf(raw).some((item) => item.includes("全程") || item.includes("全马"))) found.push("full");
  if (itemsOf(raw).some((item) => item.includes("半程") || item.includes("半马"))) found.push("half");
  if (itemsOf(raw).some((item) => /10\s*公里|10\s*km|十公里/i.test(item))) found.push("10k");
  if (itemsOf(raw).some((item) => /(^|[^0-9])5\s*公里|5\s*km|五公里/i.test(item))) found.push("5k");
  return { distances: found, distancesSet: found.length > 0 };
}

function itemsOf(raw) {
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean);
  return String(raw || "")
    .split(/[、,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function kindsOf(body) {
  const given = Array.isArray(body.kinds) ? body.kinds : String(body.kinds || "").split(/[,、]/);
  const picked = [];
  for (const item of given) {
    const key = String(item || "").trim();
    if (!key) continue;
    if (!KINDS.includes(key)) return { error: "类型选越野、超马、亲子或欢乐跑" };
    if (!picked.includes(key)) picked.push(key);
  }
  return { kinds: picked, kindsSet: picked.length > 0 };
}

function groupsOf(body) {
  const given = Array.isArray(body.groups) ? body.groups : String(body.groups || "").split(/[,、]/);
  const picked = [];
  for (const item of given) {
    const text = String(item || "").trim();
    if (!text) continue;
    if (text.length > 8) return { error: "组别不超过 8 个字" };
    if (picked.length >= 8) return { error: "组别最多 8 个" };
    picked.push(text);
  }
  return { groups: picked, groupsSet: picked.length > 0 };
}

function parseRace(body, now) {
  const source = body && typeof body === "object" ? body : {};
  const officialId = clip(source.officialId, 40);
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(officialId)) return { error: "官网编号用 1 到 40 个字母或数字" };
  const name = limited(source.name, 100, "名称");
  if (name.error) return name;
  if (!name.text) return { error: "请填写名称" };
  const raceDate = day(source.raceDate);
  if (raceDate.error) return raceDate;
  if (!raceDate.text) return { error: "请填写比赛日期" };
  if (raceDate.text < cstDay(now)) return { error: "只收还没开赛的比赛" };
  const province = limited(source.province, 20, "省份");
  if (province.error) return province;
  if (!province.text) return { error: "请填写省份" };
  const city = limited(source.city, 20, "城市");
  if (city.error) return city;
  if (!city.text) return { error: "请填写城市" };
  const place = limited(source.place, 80, "地点");
  if (place.error) return place;
  const district = limited(source.district, 20, "区县");
  if (district.error) return district;
  const readFrom = limited(source.source, 80, "来源");
  if (readFrom.error) return readFrom;
  if (!readFrom.text) return { error: "请填写这次读取的来源" };
  const distances = distancesFrom(source);
  if (distances.error) return distances;
  if (!distances.distances.length) return { error: "项目选全马、半马、10公里或5公里" };
  const kinds = kindsOf(source);
  if (kinds.error) return kinds;
  const groups = groupsOf(source);
  if (groups.error) return groups;
  const dates = {};
  for (const key of ["regStart", "deadline", "drawAt", "payDeadline", "bibAt"]) {
    const parsed = day(source[key]);
    if (parsed.error) return parsed;
    dates[key] = parsed.text;
  }
  const nodeSource = limited(source.nodeSource, 80, "报名时间来源");
  if (nodeSource.error) return nodeSource;
  const dated = ["regStart", "deadline", "drawAt", "payDeadline", "bibAt"].some((key) => dates[key]);
  if (dated && !nodeSource.text) return { error: "报名时间要写来源" };
  const deadlineName = limited(source.deadlineName, 12, "截止说明");
  if (deadlineName.error) return deadlineName;
  const urls = {};
  for (const [key] of URL_FIELDS) {
    const raw = key === "detailUrl" ? source.officialUrl || source.detailUrl : source[key];
    const parsed = httpsUrl(raw);
    if (parsed.error) return parsed;
    urls[key] = parsed.text;
  }
  const prizes = readPrizes(source.prizes);
  if (prizes.error) return prizes;
  const draws = readDraws(source.draws);
  if (draws.error) return draws;
  const organizer = limited(source.organizer, 80, "主办");
  if (organizer.error) return organizer;
  const scale = limited(source.scale, 80, "规模");
  if (scale.error) return scale;
  const fee = limited(source.fee, 80, "费用");
  if (fee.error) return fee;
  const phone = limited(source.phone, 40, "电话");
  if (phone.error) return phone;
  if (phone.text && !/^[0-9+\- ]{1,40}$/.test(phone.text)) return { error: "电话只留数字、- 或空格" };
  const startAt = clip(source.startAt, 5);
  if (startAt && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startAt)) return { error: "起跑写成 07:30" };
  const route = limited(source.route, 400, "路线");
  if (route.error) return route;
  const pickup = limited(source.pickup, 400, "领物");
  if (pickup.error) return pickup;
  const pacers = limited(source.pacers, 400, "配速");
  if (pacers.error) return pacers;
  const guideText = limited(source.guideText, 8000, "规程");
  if (guideText.error) return guideText;
  const items = limited(Array.isArray(source.items) ? source.items.join("、") : source.items, 80, "项目说明");
  if (items.error) return items;
  return {
    payload: {
      officialId,
      name: name.text,
      raceDate: raceDate.text,
      province: province.text,
      city: city.text,
      district: district.text,
      place: place.text,
      source: readFrom.text,
      distances: distances.distances,
      distancesSet: true,
      items: items.text,
      kinds: kinds.kinds,
      kindsSet: kinds.kindsSet,
      groups: groups.groups,
      groupsSet: groups.groupsSet,
      grade: gradeOf(source.grade),
      ...dates,
      nodeSource: dated ? nodeSource.text : "",
      deadlineName: deadlineName.text,
      ...urls,
      organizer: organizer.text,
      scale: scale.text,
      fee: fee.text,
      phone: phone.text,
      startAt,
      route: route.text,
      pickup: pickup.text,
      pacers: pacers.text,
      guideText: guideText.text,
      prizes: prizes.rows,
      prizesSet: prizes.set,
      draws: draws.rows,
      drawsSet: draws.set
    }
  };
}

function readPrizes(value) {
  if (value == null) return { set: false, rows: [] };
  if (!Array.isArray(value)) return { error: "奖项要写成一组" };
  if (value.length > 40) return { error: "一场奖项最多 40 条" };
  const rows = [];
  for (const item of value) {
    const rule = readRule({ ...(item || {}), stack: Boolean(item && item.stack) });
    if (rule.error) return { error: rule.error };
    rows.push(rule);
  }
  return { set: true, rows };
}

function readDraws(value) {
  if (value == null) return { set: false, rows: [] };
  if (!Array.isArray(value)) return { error: "历年中签要写成一组" };
  if (value.length > 20) return { error: "一场最多记 20 届" };
  const rows = [];
  const seen = new Set();
  for (const item of value) {
    const label = String((item && item.label) || "").trim();
    if ([...label].length < 1 || [...label].length > 20) return { error: "届次写成 1 到 20 个字" };
    if (seen.has(label)) return { error: "这一届已经记过" };
    seen.add(label);
    const applicants = whole(item && item.applicants, 1, 9999999);
    if (applicants == null) return { error: "报名人数写成 1 到 9999999 的整数" };
    const quota = whole(item && item.quota, 1, 9999999);
    if (quota == null) return { error: "名额写成 1 到 9999999 的整数" };
    if (quota > applicants) return { error: "名额不能多于报名人数" };
    const source = String((item && item.source) || "").trim();
    if ([...source].length < 1 || [...source].length > 80) return { error: "来源写成 1 到 80 个字" };
    rows.push({ label, applicants, quota, source });
  }
  return { set: true, rows };
}

function whole(value, min, max) {
  if (typeof value === "string") {
    if (!/^\d+$/.test(value.trim())) return null;
    value = Number(value);
  }
  if (typeof value === "boolean" || value == null || !Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

function keep(next, current) {
  return next ? next : current || "";
}

function findRace(db, payload) {
  const linked = db.prepare("SELECT race_id FROM official_races WHERE official_id = ?").get(payload.officialId);
  if (linked && linked.race_id) {
    const race = db.prepare("SELECT * FROM races WHERE id = ?").get(linked.race_id);
    if (race) return race;
  }
  const direct = db.prepare("SELECT * FROM races WHERE id = ?").get("caa-" + payload.officialId);
  if (direct) return direct;
  const year = payload.raceDate.slice(0, 4);
  return (
    db
      .prepare("SELECT * FROM races")
      .all()
      .find((race) => compactName(race.name) === compactName(payload.name) && String(race.race_date || "").slice(0, 4) === year) || null
  );
}

function linesOf(payload) {
  const lines = [];
  const where = [payload.province, payload.city, payload.place].filter(Boolean).join(" ");
  if (where) lines.push(where);
  if (payload.distances.length) lines.push("项目 " + payload.distances.map((key) => DISTANCE_LABEL[key] || key).join("、"));
  if (payload.kinds.length) lines.push("类型 " + payload.kinds.map((key) => KIND_LABEL[key] || key).join("、"));
  if (payload.grade) lines.push("等级 " + (payload.grade === "TEN" ? "系列赛" : payload.grade + " 类"));
  if (payload.organizer) lines.push("主办 " + payload.organizer);
  if (payload.scale) lines.push("规模 " + payload.scale);
  if (payload.fee) lines.push("费用 " + payload.fee);
  if (payload.phone) lines.push("电话 " + payload.phone);
  if (payload.startAt) lines.push("起跑 " + payload.startAt);
  const dates = [
    ["报名开启", payload.regStart],
    [payload.deadlineName || "报名截止", payload.deadline],
    ["出签", payload.drawAt],
    ["缴费截止", payload.payDeadline],
    ["领物", payload.bibAt]
  ].filter((pair) => pair[1]);
  if (dates.length) lines.push(dates.map((pair) => pair[0] + " " + pair[1]).join("，") + " · 来源 " + payload.nodeSource);
  for (const [key, label] of URL_FIELDS) {
    if (payload[key]) lines.push(label + " " + payload[key]);
  }
  if (payload.route) lines.push("路线 " + payload.route);
  if (payload.pickup) lines.push("领物 " + payload.pickup);
  if (payload.pacers) lines.push("配速 " + payload.pacers);
  if (payload.guideText) lines.push("规程 " + payload.guideText.slice(0, 120));
  if (payload.prizesSet) {
    lines.push("奖项 " + payload.prizes.length + " 条" + (payload.prizes.length ? "，发布后整份替换" : "，发布后清掉原来的奖项"));
    payload.prizes.slice(0, 8).forEach((rule) => lines.push(prizeLine(rule)));
  }
  if (payload.drawsSet) {
    lines.push("历年中签 " + payload.draws.length + " 届" + (payload.draws.length ? "，发布后整份替换" : "，发布后清掉原来的中签"));
    payload.draws.slice(0, 8).forEach((row) => lines.push(row.label + " 报名 " + row.applicants + " 名额 " + row.quota + " · " + row.source));
  }
  lines.push("读取 " + payload.source);
  return lines;
}

function prizeLine(rule) {
  const money = rule.amount ? (rule.tax ? "税前 " + rule.amount + " 元，税率 " + rule.tax : "税前 " + rule.amount + " 元") : "非现金";
  return (DISTANCE_LABEL[rule.distance] || rule.distance) + " " + (PRIZE_KIND[rule.kind] || rule.kind) + " " + (rule.gender || "不限") + " " + money + " · " + rule.source;
}

function changesOf(race, payload) {
  if (!race) return [];
  const notes = [];
  const pair = (label, current, next) => {
    if (!next || next === (current || "")) return;
    notes.push(label + "：赛历是 " + (current || "空") + "，上传是 " + next);
  };
  pair("名称", race.name, payload.name);
  pair("日期", race.race_date, payload.raceDate);
  pair("城市", race.city, payload.city);
  pair("地点", race.place, payload.place);
  if (payload.distances.join(",") !== (race.distances || "")) {
    notes.push("项目：赛历是 " + (race.distances || "空") + "，上传是 " + payload.distances.join(","));
  }
  pair("主办", race.organizer, payload.organizer);
  pair("费用", race.fee, payload.fee);
  pair("规模", race.scale, payload.scale);
  pair("报名开启", race.reg_start, payload.regStart);
  pair("报名截止", race.deadline, payload.deadline);
  pair("出签", race.draw_at, payload.drawAt);
  pair("缴费截止", race.pay_deadline, payload.payDeadline);
  pair("报名入口", race.signup_url, payload.signupUrl);
  pair("赛事网站", race.event_url, payload.eventUrl);
  pair("官网", race.official_url, payload.detailUrl);
  if (payload.prizesSet) notes.push("奖项：这次上传 " + payload.prizes.length + " 条，发布后整份替换");
  if (payload.drawsSet) notes.push("历年中签：这次上传 " + payload.draws.length + " 届，发布后整份替换");
  return notes.slice(0, 12);
}

function presentRow(db, row) {
  const payload = JSON.parse(row.payload);
  const race = findRace(db, payload);
  return {
    id: row.id,
    officialId: row.official_id,
    name: payload.name,
    raceDate: payload.raceDate,
    city: payload.city,
    status: row.status,
    note: row.note || "",
    onCalendar: Boolean(race),
    raceId: race ? race.id : "",
    lines: linesOf(payload),
    changes: changesOf(race, payload)
  };
}

function acceptRaces(db, body, now = new Date()) {
  const list = Array.isArray(body && body.races) ? body.races : body && body.officialId ? [body] : null;
  if (!list) return { error: "请带上比赛", status: 400 };
  if (!list.length) return { error: "请带上比赛", status: 400 };
  if (list.length > 40) return { error: "一次最多 40 场", status: 400 };
  const seen = new Set();
  const accepted = [];
  const errors = [];
  const stamp = now.toISOString();
  const save = db.transaction(() => {
    for (const item of list) {
      const parsed = parseRace(item, now);
      const officialId = item && item.officialId ? String(item.officialId) : "";
      if (parsed.error) {
        errors.push({ officialId, error: parsed.error });
        continue;
      }
      if (seen.has(parsed.payload.officialId)) {
        errors.push({ officialId: parsed.payload.officialId, error: "同一批里官网编号重复" });
        continue;
      }
      seen.add(parsed.payload.officialId);
      const open = db
        .prepare("SELECT id FROM bot_submissions WHERE official_id = ? AND status IN ('pending', 'returned') ORDER BY id DESC LIMIT 1")
        .get(parsed.payload.officialId);
      const payload = JSON.stringify(parsed.payload);
      let id = open && open.id;
      if (open) {
        db.prepare("UPDATE bot_submissions SET status = 'pending', payload = ?, note = '', updated_at = ? WHERE id = ?").run(payload, stamp, open.id);
      } else {
        const inserted = db
          .prepare(
            `INSERT INTO bot_submissions (official_id, status, payload, note, race_id, created_at, updated_at)
             VALUES (?, 'pending', ?, '', '', ?, ?)`
          )
          .run(parsed.payload.officialId, payload, stamp, stamp);
        id = Number(inserted.lastInsertRowid);
      }
      const race = findRace(db, parsed.payload);
      accepted.push({
        id,
        officialId: parsed.payload.officialId,
        name: parsed.payload.name,
        status: "pending",
        onCalendar: Boolean(race)
      });
    }
  });
  save();
  return { accepted, errors };
}

function listForBot(db) {
  const rows = db.prepare("SELECT * FROM bot_submissions WHERE status IN ('pending', 'returned') ORDER BY id DESC").all();
  return {
    pending: rows.filter((row) => row.status === "pending").map((row) => presentRow(db, row)),
    returned: rows.filter((row) => row.status === "returned").map((row) => presentRow(db, row))
  };
}

function listForAdmin(db, status) {
  const wanted = ["pending", "returned", "published"].includes(status) ? status : "pending";
  return db
    .prepare("SELECT * FROM bot_submissions WHERE status = ? ORDER BY id DESC LIMIT 100")
    .all(wanted)
    .map((row) => presentRow(db, row))
    .sort((a, b) => a.raceDate.localeCompare(b.raceDate) || a.id - b.id);
}

function writeRace(db, race, payload, raceId) {
  const dated = ["regStart", "deadline", "drawAt", "payDeadline", "bibAt"].some((key) => payload[key]);
  const current = race || {};
  const values = {
    name: payload.name,
    raceDate: payload.raceDate,
    city: keep(payload.city, current.city),
    province: keep(payload.province, current.province),
    place: keep(payload.place, current.place || payload.city),
    district: keep(payload.district, current.district),
    distances: payload.distances.join(","),
    kinds: payload.kindsSet ? payload.kinds.join(",") : current.kinds || "",
    groups: payload.groupsSet ? payload.groups.join(",") : current.groups || "",
    startAt: keep(payload.startAt, current.start_at),
    bibAt: keep(payload.bibAt, current.bib_at),
    fee: keep(payload.fee, current.fee),
    scale: keep(payload.scale, current.scale),
    phone: keep(payload.phone, current.phone),
    signupUrl: keep(payload.signupUrl, current.signup_url),
    drawUrl: keep(payload.drawUrl, current.draw_url),
    bibUrl: keep(payload.bibUrl, current.bib_url),
    resultUrl: keep(payload.resultUrl, current.result_url),
    liveUrl: keep(payload.liveUrl, current.live_url),
    eventUrl: keep(payload.eventUrl, current.event_url),
    officialUrl: keep(payload.detailUrl, current.official_url) || "https://www.runchina.org.cn/#/race/v/detail/" + payload.officialId,
    organizer: keep(payload.organizer, current.organizer),
    grade: keep(payload.grade, current.grade),
    route: keep(payload.route, current.route),
    pickup: keep(payload.pickup, current.pickup),
    pacers: keep(payload.pacers, current.pacers),
    guideText: keep(payload.guideText, current.guide_text),
    regStart: keep(payload.regStart, current.reg_start),
    deadline: keep(payload.deadline, current.deadline),
    drawAt: keep(payload.drawAt, current.draw_at),
    payDeadline: keep(payload.payDeadline, current.pay_deadline),
    deadlineName: keep(payload.deadlineName, current.deadline_name),
    source: dated ? payload.nodeSource : current.source || "中国马拉松官网赛历",
    updatedAt: cstDay()
  };
  if (race) {
    db.prepare(
      `UPDATE races SET
         name = ?, race_date = ?, city = ?, province = ?, district = ?, place = ?, distances = ?, kinds = ?, groups = ?,
         start_at = ?, bib_at = ?, fee = ?, scale = ?, phone = ?,
         signup_url = ?, draw_url = ?, bib_url = ?, result_url = ?, live_url = ?, event_url = ?,
         official_url = ?, organizer = ?, grade = ?,
         route = ?, pickup = ?, pacers = ?, guide_text = ?,
         reg_start = ?, deadline = ?, draw_at = ?, pay_deadline = ?, deadline_name = ?, source = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      values.name,
      values.raceDate,
      values.city,
      values.province,
      values.district,
      values.place,
      values.distances,
      values.kinds,
      values.groups,
      values.startAt,
      values.bibAt,
      values.fee,
      values.scale,
      values.phone,
      values.signupUrl,
      values.drawUrl,
      values.bibUrl,
      values.resultUrl,
      values.liveUrl,
      values.eventUrl,
      values.officialUrl,
      values.organizer,
      values.grade,
      values.route,
      values.pickup,
      values.pacers,
      values.guideText,
      values.regStart,
      values.deadline,
      values.drawAt,
      values.payDeadline,
      values.deadlineName,
      values.source,
      values.updatedAt,
      race.id
    );
    return race.id;
  }
  db.prepare(
    `INSERT INTO races (
       id, name, city, province, distances, race_date, deadline, place,
       reg_start, draw_at, pay_deadline, source, updated_at, deadline_name, grade, official_url,
       organizer, event_url, kinds, groups, start_at, bib_at, fee, scale, phone,
       signup_url, draw_url, bib_url, result_url, live_url, route, pickup, pacers, guide_text, district
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    raceId,
    values.name,
    values.city,
    values.province,
    values.distances,
    values.raceDate,
    values.deadline,
    values.place,
    values.regStart,
    values.drawAt,
    values.payDeadline,
    values.source,
    values.updatedAt,
    values.deadlineName,
    values.grade,
    values.officialUrl,
    values.organizer,
    values.eventUrl,
    values.kinds,
    values.groups,
    values.startAt,
    values.bibAt,
    values.fee,
    values.scale,
    values.phone,
    values.signupUrl,
    values.drawUrl,
    values.bibUrl,
    values.resultUrl,
    values.liveUrl,
    values.route,
    values.pickup,
    values.pacers,
    values.guideText,
    values.district
  );
  return raceId;
}

function upsertOfficial(db, payload, raceId) {
  const existing = db.prepare("SELECT * FROM official_races WHERE official_id = ?").get(payload.officialId);
  const detailUrl = payload.detailUrl || "https://www.runchina.org.cn/#/race/v/detail/" + payload.officialId;
  const seenAt = new Date().toISOString();
  if (!existing) {
    db.prepare(
      `INSERT INTO official_races (
         official_id, name, race_date, province, city, district, grade, distances, items, detail_url,
         seen_at, status, race_id, organizer, web_url, scale, detail_checked_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?)`
    ).run(
      payload.officialId,
      payload.name,
      payload.raceDate,
      payload.province,
      payload.city,
      payload.district,
      payload.grade,
      payload.distances.join(","),
      payload.items,
      detailUrl,
      seenAt,
      raceId,
      payload.organizer,
      payload.eventUrl,
      payload.scale,
      payload.organizer || payload.eventUrl ? seenAt : ""
    );
    return;
  }
  db.prepare(
    `UPDATE official_races SET
       name = ?, race_date = ?, province = ?, city = ?, district = ?, grade = ?, distances = ?, items = ?,
       detail_url = ?, seen_at = ?, status = 'published', race_id = ?, organizer = ?, web_url = ?, scale = ?,
       detail_checked_at = ?
     WHERE official_id = ?`
  ).run(
    payload.name,
    payload.raceDate,
    keep(payload.province, existing.province),
    keep(payload.city, existing.city),
    keep(payload.district, existing.district),
    keep(payload.grade, existing.grade),
    payload.distances.join(","),
    keep(payload.items, existing.items),
    keep(payload.detailUrl, existing.detail_url) || detailUrl,
    seenAt,
    raceId,
    keep(payload.organizer, existing.organizer),
    keep(payload.eventUrl, existing.web_url),
    keep(payload.scale, existing.scale),
    payload.organizer || payload.eventUrl ? seenAt : existing.detail_checked_at,
    payload.officialId
  );
}

function replaceExtras(db, raceId, payload) {
  if (payload.prizesSet) {
    db.prepare("DELETE FROM prize_rules WHERE race_id = ?").run(raceId);
    const insert = db.prepare(
      `INSERT INTO prize_rules (
         race_id, distance, kind, gender, age_min, age_max, province, place_n, break_sec,
         amount, tax, stack, source, cutoff_sec, cutoff_source, note
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const rule of payload.prizes) {
      insert.run(
        raceId,
        rule.distance,
        rule.kind,
        rule.gender,
        rule.ageMin,
        rule.ageMax,
        rule.province,
        rule.placeN,
        rule.breakSec,
        rule.amount,
        rule.tax,
        rule.stack,
        rule.source,
        rule.cutoffSec,
        rule.cutoffSource,
        rule.note
      );
    }
  }
  if (payload.drawsSet) {
    db.prepare("DELETE FROM draw_rates WHERE race_id = ?").run(raceId);
    const insert = db.prepare("INSERT INTO draw_rates (race_id, label, applicants, quota, source) VALUES (?, ?, ?, ?, ?)");
    for (const row of payload.draws) insert.run(raceId, row.label, row.applicants, row.quota, row.source);
  }
}

function publishSubmission(db, id) {
  const row = db.prepare("SELECT * FROM bot_submissions WHERE id = ?").get(id);
  if (!row) return { error: "没有这场待审", status: 404 };
  if (row.status !== "pending") return { error: "这场不在待审里", status: 400 };
  const payload = JSON.parse(row.payload);
  const existing = findRace(db, payload);
  const raceId = existing ? existing.id : "caa-" + payload.officialId;
  db.transaction(() => {
    writeRace(db, existing, payload, raceId);
    replaceExtras(db, raceId, payload);
    upsertOfficial(db, payload, raceId);
    db.prepare("UPDATE bot_submissions SET status = 'published', race_id = ?, note = '', updated_at = ? WHERE id = ?").run(
      raceId,
      new Date().toISOString(),
      row.id
    );
  })();
  return { ok: true, raceId, created: !existing };
}

function returnSubmission(db, id, note) {
  const text = String(note || "").trim();
  if (!text) return { error: "打回要写原因", status: 400 };
  if (text.length > 200) return { error: "原因不超过 200 个字", status: 400 };
  const row = db.prepare("SELECT * FROM bot_submissions WHERE id = ?").get(id);
  if (!row) return { error: "没有这场待审", status: 404 };
  if (row.status !== "pending") return { error: "这场不在待审里", status: 400 };
  db.prepare("UPDATE bot_submissions SET status = 'returned', note = ?, updated_at = ? WHERE id = ?").run(text, new Date().toISOString(), row.id);
  return { ok: true };
}

function mountBotRaces(app, { BASE, getDb, requireAdmin }) {
  app.post(BASE + "/api/bot/races", (req, res) => {
    const denied = botGate(req);
    if (denied) return res.status(denied.status).json({ error: denied.error });
    const result = acceptRaces(getDb(), req.body || {});
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });

  app.get(BASE + "/api/bot/races", (req, res) => {
    const denied = botGate(req);
    if (denied) return res.status(denied.status).json({ error: denied.error });
    res.json(listForBot(getDb()));
  });

  app.get(BASE + "/api/admin/bot-races", (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ rows: listForAdmin(getDb(), String(req.query.status || "pending")) });
  });

  app.post(BASE + "/api/admin/bot-races/:id/publish", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const result = publishSubmission(getDb(), req.params.id);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });

  app.post(BASE + "/api/admin/bot-races/:id/return", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const result = returnSubmission(getDb(), req.params.id, req.body && req.body.note);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });
}

module.exports = { mountBotRaces };
