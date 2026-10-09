const LIST_URL =
  "https://api-changzheng.chinaath.com/changzheng-content-center-api/api/homePage/official/searchCompetitionMls";
const DETAIL_URL =
  "https://api-changzheng.chinaath.com/changzheng-content-center-api/api/homePage/official/searchById";
const TRACKED = [
  ["name", "名称"],
  ["race_date", "日期"],
  ["province", "省份"],
  ["city", "城市"],
  ["district", "区县"],
  ["grade", "类别"],
  ["items", "项目"],
  ["organizer", "主办"],
  ["web_url", "赛事网站"],
  ["scale", "规模"]
];

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
    detailUrl: "https://www.runchina.org.cn/#/race/v/detail/" + officialId,
    organizer: "",
    webUrl: "",
    scale: "",
    detailChecked: false
  };
}

function httpUrl(value) {
  const text = String(value || "").trim();
  if (!/^https?:\/\//i.test(text) || /\s/.test(text) || text.length > 300) return "";
  return text;
}

function seriesKey(name) {
  return compactName(String(name || "").replace(/^(19|20)\d{2}/, ""));
}

function siteNote(webUrl, prior) {
  if (!prior) return webUrl ? "" : "这场官网没有给赛事网站";
  if (!webUrl) return "今年官网没有给赛事网站。往届那条不沿用。";
  if (prior.webUrl !== webUrl) return "今年的赛事网站和往届不是同一条，各自保存。";
  return "";
}

function detailTargets(rows, today, maxDetails) {
  const upcoming = rows.filter((row) => row.raceDate >= today).sort((a, b) => a.raceDate.localeCompare(b.raceDate));
  const older = rows.filter((row) => row.raceDate < today).sort((a, b) => b.raceDate.localeCompare(a.raceDate));
  return [...upcoming, ...older].slice(0, maxDetails);
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

async function fetchOfficialDetail(officialId, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(DETAIL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://www.runchina.org.cn",
        Referer: "https://www.runchina.org.cn/"
      },
      body: JSON.stringify({ id: String(officialId), type: "SS" }),
      signal: AbortSignal.timeout(15000)
    });
  } catch (err) {
    return null;
  }
  if (!response || !response.ok) return null;
  let body;
  try {
    body = await response.json();
  } catch (err) {
    return null;
  }
  const detail = body && body.data && body.data.ssdetails;
  if (!detail || typeof detail !== "object") return null;
  return {
    organizer: String(detail.compNameOrganizer || "").trim().slice(0, 120),
    webUrl: httpUrl(detail.webUrl),
    scale: String(detail.scale || "").trim().slice(0, 40)
  };
}

async function attachDetails(rows, { now, fetchImpl, pauseMs, maxDetails }) {
  const targets = detailTargets(rows, cstDay(now), maxDetails);
  for (let index = 0; index < targets.length; index++) {
    const detail = await fetchOfficialDetail(targets[index].officialId, fetchImpl);
    if (detail) {
      targets[index].organizer = detail.organizer;
      targets[index].webUrl = detail.webUrl;
      targets[index].scale = detail.scale;
      targets[index].detailChecked = true;
    }
    if (pauseMs && index < targets.length - 1) await sleep(pauseMs);
  }
}

function saveOfficial(db, rows, seenAt) {
  const find = db.prepare("SELECT * FROM official_races WHERE official_id = ?");
  const insert = db.prepare(
    `INSERT INTO official_races (
       official_id, name, race_date, province, city, district, grade, distances, items, detail_url,
       organizer, web_url, scale, detail_checked_at, seen_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const update = db.prepare(
    `UPDATE official_races
     SET name = ?, race_date = ?, province = ?, city = ?, district = ?, grade = ?, distances = ?, items = ?, detail_url = ?,
         organizer = ?, web_url = ?, scale = ?, detail_checked_at = ?, seen_at = ?
     WHERE official_id = ?`
  );
  const insertChange = db.prepare(
    `INSERT INTO official_changes (official_id, field, label, old_value, new_value, seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  return db.transaction((list) => {
    let imported = 0;
    let updated = 0;
    let changed = 0;
    for (const row of list) {
      const existing = find.get(row.officialId);
      const organizer = row.detailChecked ? row.organizer : existing ? existing.organizer : "";
      const webUrl = row.detailChecked ? row.webUrl : existing ? existing.web_url : "";
      const scale = row.detailChecked ? row.scale : existing ? existing.scale : "";
      const checkedAt = row.detailChecked ? seenAt : existing ? existing.detail_checked_at : "";
      const next = {
        name: row.name,
        race_date: row.raceDate,
        province: row.province,
        city: row.city,
        district: row.district,
        grade: row.grade,
        items: row.items,
        organizer,
        web_url: webUrl,
        scale
      };
      if (existing) {
        let rowChanged = false;
        for (const [field, label] of TRACKED) {
          const previous = String(existing[field] || "");
          const value = String(next[field] || "");
          if (previous === value) continue;
          insertChange.run(row.officialId, field, label, previous, value, seenAt);
          rowChanged = true;
        }
        update.run(
          next.name,
          next.race_date,
          next.province,
          next.city,
          next.district,
          next.grade,
          row.distances,
          next.items,
          row.detailUrl,
          next.organizer,
          next.web_url,
          next.scale,
          checkedAt,
          seenAt,
          row.officialId
        );
        updated += 1;
        if (rowChanged) changed += 1;
      } else {
        insert.run(
          row.officialId,
          next.name,
          next.race_date,
          next.province,
          next.city,
          next.district,
          next.grade,
          row.distances,
          next.items,
          row.detailUrl,
          next.organizer,
          next.web_url,
          next.scale,
          checkedAt,
          seenAt
        );
        imported += 1;
      }
    }
    return { imported, updated, changed, count: list.length };
  })(rows);
}

async function syncOfficial(db, options = {}) {
  const now = options.now || new Date();
  const fetchImpl = options.fetchImpl || global.fetch;
  const rows = await fetchOfficialPages({ ...options, now, fetchImpl });
  await attachDetails(rows, {
    now,
    fetchImpl,
    pauseMs: options.pauseMs == null ? 250 : options.pauseMs,
    maxDetails: options.maxDetails || 80
  });
  return saveOfficial(db, rows, now.toISOString());
}

function diffOf(official, race) {
  if (!race) return "";
  const notes = [];
  if (official.race_date !== race.race_date) notes.push("日期：赛历里是 " + race.race_date + "，官网是 " + official.race_date);
  if (compactName(official.name) !== compactName(race.name)) notes.push("名称：赛历里是 " + race.name + "，官网是 " + official.name);
  if (official.organizer && official.organizer !== (race.organizer || "")) {
    notes.push(race.organizer ? "主办：赛历里是 " + race.organizer + "，官网是 " + official.organizer : "主办：官网是 " + official.organizer + "，赛历还没写");
  }
  if (official.web_url && official.web_url !== (race.event_url || "")) {
    notes.push(race.event_url ? "赛事网站：赛历里是 " + race.event_url + "，官网是 " + official.web_url : "赛事网站：官网给了 " + official.web_url + "，赛历还没写");
  }
  return notes.join("；");
}

function priorSite(row, sites) {
  const key = seriesKey(row.name);
  if (!key) return null;
  const found = sites
    .filter((item) => item.official_id !== row.official_id && item.web_url && seriesKey(item.name) === key && item.race_date < row.race_date)
    .sort((a, b) => b.race_date.localeCompare(a.race_date))[0];
  if (!found) return null;
  return { name: found.name, raceDate: found.race_date, webUrl: found.web_url };
}

function changesFor(db, ids) {
  const grouped = new Map();
  if (!ids.length) return grouped;
  const rows = db
    .prepare(`SELECT * FROM official_changes WHERE official_id IN (${ids.map(() => "?").join(",")}) ORDER BY id DESC`)
    .all(...ids);
  for (const row of rows) {
    const list = grouped.get(row.official_id) || [];
    if (list.length >= 3) continue;
    list.push({ id: row.id, label: row.label, oldValue: row.old_value, newValue: row.new_value, seenAt: row.seen_at });
    grouped.set(row.official_id, list);
  }
  return grouped;
}

function listOfficial(db, { q = "", status = "", limit = 200, upcomingFrom = "", changedOnly = false } = {}) {
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
  const races = db.prepare("SELECT id, name, race_date, deadline, source, organizer, event_url FROM races").all();
  const sites = db.prepare("SELECT official_id, name, race_date, web_url FROM official_races WHERE web_url != ''").all();
  const stored = db.prepare(sql).all(...params);
  const changes = changesFor(db, stored.map((row) => row.official_id));
  return stored
    .map((row) => {
      const linked = row.race_id ? races.find((race) => race.id === row.race_id) : null;
      const match = linked || races.find((race) => compactName(race.name) === compactName(row.name)) || null;
      const prior = priorSite(row, sites);
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
        organizer: row.organizer || "",
        webUrl: row.web_url || "",
        webNote: siteNote(row.web_url || "", prior),
        priorWeb: prior,
        scale: row.scale || "",
        seenAt: row.seen_at,
        detailCheckedAt: row.detail_checked_at || "",
        status: row.status,
        raceId: row.race_id,
        diffNote: diffOf(row, linked),
        changes: changes.get(row.official_id) || [],
        match: match ? { id: match.id, name: match.name, raceDate: match.race_date } : null
      };
    })
    .filter((row) => !changedOnly || row.changes.length);
}

function publishOfficial(db, officialId, now = new Date()) {
  const row = db.prepare("SELECT * FROM official_races WHERE official_id = ?").get(officialId);
  if (!row) return { error: "没有这场", status: 404 };
  const races = db.prepare("SELECT id, name, official_url, grade, organizer, event_url FROM races").all();
  const match = races.find((race) => compactName(race.name) === compactName(row.name));
  const today = cstDay(now);
  const fillFacts = db.prepare(
    `UPDATE races SET organizer = CASE WHEN organizer = '' THEN ? ELSE organizer END,
                      event_url = CASE WHEN event_url = '' THEN ? ELSE event_url END
     WHERE id = ?`
  );
  const result = db.transaction(() => {
    if (match) {
      if (!match.official_url) db.prepare("UPDATE races SET official_url = ? WHERE id = ?").run(row.detail_url, match.id);
      if (!match.grade && row.grade) db.prepare("UPDATE races SET grade = ? WHERE id = ?").run(row.grade, match.id);
      fillFacts.run(row.organizer || "", row.web_url || "", match.id);
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
    fillFacts.run(row.organizer || "", row.web_url || "", id);
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
  if (!row.race_id) return { error: "先收入赛历，再决定要不要采用官网这次的信息", status: 400 };
  const race = db.prepare("SELECT id, name, race_date, organizer, event_url FROM races WHERE id = ?").get(row.race_id);
  if (!race) return { error: "赛历里没有这场", status: 404 };
  const nextOrganizer = row.organizer || race.organizer || "";
  const nextEvent = row.web_url || race.event_url || "";
  const changed = row.name !== race.name || row.race_date !== race.race_date || nextOrganizer !== (race.organizer || "") || nextEvent !== (race.event_url || "");
  if (!changed) return { ok: true, changed: false };
  db.prepare("UPDATE races SET name = ?, race_date = ?, organizer = ?, event_url = ?, updated_at = ? WHERE id = ?").run(
    row.name,
    row.race_date,
    nextOrganizer,
    nextEvent,
    cstDay(now),
    race.id
  );
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
