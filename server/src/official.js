const LIST_URL =
  "https://api-changzheng.chinaath.com/changzheng-content-center-api/api/homePage/official/searchCompetitionMls";

function cstDay(date = new Date()) {
  const shifted = new Date(date.getTime() + 8 * 3600 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function compactName(name) {
  return String(name || "").replace(/\s+/g, "").replace(/[·・.\-—]/g, "");
}

function stripRegion(part) {
  return String(part || "")
    .trim()
    .replace(/特别行政区$/, "")
    .replace(/维吾尔自治区$/, "")
    .replace(/壮族自治区$/, "")
    .replace(/回族自治区$/, "")
    .replace(/自治区$/, "")
    .replace(/省$/, "")
    .replace(/市$/, "");
}

function placeOf(address) {
  const parts = String(address || "").split("/").map((part) => part.trim());
  const province = stripRegion(parts[0]);
  let city = stripRegion(parts[1]);
  const district = parts[2] || "";
  if (!city || city === "县") city = stripRegion(district) || province;
  return { province, city, district, place: district || city || province };
}

function itemsOf(raw) {
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean);
  const text = String(raw || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch (err) {
    /* 官网有时给的是已经拆开的文字 */
  }
  return text.split(/[、,]/).map((item) => item.trim()).filter(Boolean);
}

function distancesOf(items) {
  const keys = [];
  if (items.some((item) => item.includes("全程"))) keys.push("full");
  if (items.some((item) => item.includes("半程"))) keys.push("half");
  if (items.some((item) => /10\s*公里|10\s*km|十公里/i.test(item))) keys.push("10k");
  return keys.join(",");
}

function gradeLabel(grade) {
  if (grade === "A" || grade === "B" || grade === "C") return grade + " 类";
  if (grade === "TEN") return "系列赛";
  return grade || "";
}

function normalizeOfficial(row) {
  const officialId = String((row && row.raceId) || "").trim();
  const name = String((row && row.raceName) || "").trim();
  const raceDate = String((row && row.raceTime) || "").slice(0, 10);
  if (!officialId || !name || !/^\d{4}-\d{2}-\d{2}$/.test(raceDate)) return null;
  const items = itemsOf(row.raceItem);
  const where = placeOf(row.raceAddress);
  return {
    officialId,
    name,
    raceDate,
    province: where.province,
    city: where.city,
    district: where.district,
    place: where.place,
    grade: String(row.raceGrade || ""),
    distances: distancesOf(items),
    items: items.join("、"),
    detailUrl: "https://www.runchina.org.cn/#/race/v/detail/" + officialId
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOfficialPages({
  raceName = "",
  upcomingOnly = true,
  now = new Date(),
  fetchImpl = global.fetch,
  pageSize = 50,
  maxPages = 20,
  pauseMs = 250
} = {}) {
  const today = cstDay(now);
  const rows = [];
  const seen = new Set();
  for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
    const response = await fetchImpl(LIST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://www.runchina.org.cn",
        Referer: "https://www.runchina.org.cn/"
      },
      body: JSON.stringify({
        provinceId: "",
        cityId: "",
        districtId: "",
        raceName,
        raceGrade: "",
        raceStartTime: "",
        pageNo,
        pageSize
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error("官网赛历暂时打不开");
    const body = await response.json();
    if (!body || body.success !== true || !body.data) throw new Error("官网赛历暂时打不开");
    const list = body.data.results || [];
    if (!list.length) break;
    let kept = 0;
    for (const item of list) {
      const row = normalizeOfficial(item);
      if (!row || seen.has(row.officialId)) continue;
      if (upcomingOnly && row.raceDate < today) continue;
      seen.add(row.officialId);
      rows.push(row);
      kept += 1;
    }
    const pageCount = Number(body.data.pageCount) || pageNo;
    if (upcomingOnly && kept === 0) break;
    if (pageNo >= pageCount) break;
    if (pauseMs) await sleep(pauseMs);
  }
  return rows;
}

function saveOfficial(db, rows, seenAt) {
  const find = db.prepare("SELECT official_id FROM official_races WHERE official_id = ?");
  const insert = db.prepare(
    `INSERT INTO official_races (
       official_id, name, race_date, province, city, district, grade, distances, items, detail_url, seen_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const update = db.prepare(
    `UPDATE official_races
     SET name = ?, race_date = ?, province = ?, city = ?, district = ?, grade = ?, distances = ?, items = ?, detail_url = ?, seen_at = ?
     WHERE official_id = ?`
  );
  return db.transaction((list) => {
    let imported = 0;
    let updated = 0;
    for (const row of list) {
      const values = [
        row.name,
        row.raceDate,
        row.province,
        row.city,
        row.district,
        row.grade,
        row.distances,
        row.items,
        row.detailUrl,
        seenAt
      ];
      if (find.get(row.officialId)) {
        update.run(...values, row.officialId);
        updated += 1;
      } else {
        insert.run(row.officialId, ...values);
        imported += 1;
      }
    }
    return { imported, updated, count: list.length };
  })(rows);
}

async function syncOfficial(db, options = {}) {
  const now = options.now || new Date();
  const rows = await fetchOfficialPages({ ...options, now });
  const saved = saveOfficial(db, rows, now.toISOString());
  return saved;
}

function diffOf(official, race) {
  if (!race) return "";
  const notes = [];
  if (official.race_date !== race.race_date) notes.push("日期：赛历里是 " + race.race_date + "，官网是 " + official.race_date);
  if (compactName(official.name) !== compactName(race.name)) notes.push("名称：赛历里是 " + race.name + "，官网是 " + official.name);
  return notes.join("；");
}

function listOfficial(db, { q = "", status = "", limit = 200, upcomingFrom = "" } = {}) {
  const params = [];
  let sql = "SELECT * FROM official_races WHERE 1 = 1";
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  if (q) {
    sql += " AND name LIKE ?";
    params.push("%" + q + "%");
  }
  if (upcomingFrom) {
    sql += " AND race_date >= ?";
    params.push(upcomingFrom);
  }
  sql += " ORDER BY race_date, name LIMIT ?";
  params.push(limit);
  const races = db.prepare("SELECT id, name, race_date, deadline, source FROM races").all();
  return db
    .prepare(sql)
    .all(...params)
    .map((row) => {
      const linked = row.race_id ? races.find((race) => race.id === row.race_id) : null;
      const match = linked || races.find((race) => compactName(race.name) === compactName(row.name)) || null;
      return {
        officialId: row.official_id,
        name: row.name,
        raceDate: row.race_date,
        province: row.province,
        city: row.city,
        district: row.district,
        grade: row.grade,
        gradeLabel: gradeLabel(row.grade),
        distances: row.distances,
        items: row.items,
        detailUrl: row.detail_url,
        seenAt: row.seen_at,
        status: row.status,
        raceId: row.race_id,
        diffNote: diffOf(row, linked),
        match: match ? { id: match.id, name: match.name, raceDate: match.race_date } : null
      };
    });
}

function publishOfficial(db, officialId, now = new Date()) {
  const row = db.prepare("SELECT * FROM official_races WHERE official_id = ?").get(officialId);
  if (!row) return { error: "没有这场", status: 404 };
  const races = db.prepare("SELECT id, name, official_url, grade FROM races").all();
  const match = races.find((race) => compactName(race.name) === compactName(row.name));
  const today = cstDay(now);
  const result = db.transaction(() => {
    if (match) {
      if (!match.official_url) db.prepare("UPDATE races SET official_url = ? WHERE id = ?").run(row.detail_url, match.id);
      if (!match.grade && row.grade) db.prepare("UPDATE races SET grade = ? WHERE id = ?").run(row.grade, match.id);
      db.prepare("UPDATE official_races SET status = 'published', race_id = ? WHERE official_id = ?").run(match.id, officialId);
      return { raceId: match.id, linked: true };
    }
    const id = "caa-" + row.official_id;
    db.prepare(
      `INSERT INTO races (
         id, name, city, province, distances, race_date, deadline, place,
         reg_start, draw_at, pay_deadline, source, updated_at, deadline_name, grade, official_url
       ) VALUES (?, ?, ?, ?, ?, ?, '', ?, '', '', '', ?, ?, '', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         grade = excluded.grade,
         official_url = excluded.official_url`
    ).run(
      id,
      row.name,
      row.city,
      row.province,
      row.distances,
      row.race_date,
      row.district || row.city,
      "中国马拉松官网赛历",
      today,
      row.grade,
      row.detail_url
    );
    db.prepare("UPDATE official_races SET status = 'published', race_id = ? WHERE official_id = ?").run(id, officialId);
    return { raceId: id, linked: false };
  })();
  return result;
}

function ignoreOfficial(db, officialId) {
  const info = db.prepare("UPDATE official_races SET status = 'ignored' WHERE official_id = ?").run(officialId);
  if (!info.changes) return { error: "没有这场", status: 404 };
  return { ok: true };
}

function applyOfficial(db, officialId, now = new Date()) {
  const row = db.prepare("SELECT * FROM official_races WHERE official_id = ?").get(officialId);
  if (!row) return { error: "没有这场", status: 404 };
  if (!row.race_id) return { error: "先收入赛历，再决定要不要改日期", status: 400 };
  const race = db.prepare("SELECT id, name, race_date FROM races WHERE id = ?").get(row.race_id);
  if (!race) return { error: "赛历里没有这场", status: 404 };
  const diff = diffOf(row, race);
  if (!diff) return { ok: true, changed: false };
  db.prepare("UPDATE races SET name = ?, race_date = ?, updated_at = ? WHERE id = ?").run(row.name, row.race_date, cstDay(now), race.id);
  return { ok: true, changed: true };
}

module.exports = {
  normalizeOfficial,
  syncOfficial,
  listOfficial,
  publishOfficial,
  ignoreOfficial,
  applyOfficial
};
