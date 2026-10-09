const { DISTANCE_LABEL } = require("./races");

const KM = { full: 42.195, half: 21.0975, "10k": 10 };
const MAX_SECONDS = 12 * 3600;

function yearOf(date) {
  return new Date(date.getTime() + 8 * 3600 * 1000).getUTCFullYear();
}

function parseClock(text) {
  const raw = String(text || "").trim();
  const hms = raw.match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/);
  const ms = raw.match(/^(\d{1,2}):([0-5]\d)$/);
  let sec = null;
  if (hms) sec = Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  else if (ms) sec = Number(ms[1]) * 60 + Number(ms[2]);
  if (sec == null || sec <= 0 || sec > MAX_SECONDS) return null;
  return sec;
}

function formatClock(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function paceOf(distance, seconds) {
  const km = KM[distance];
  if (!km) return "";
  const per = Math.round(seconds / km);
  const m = Math.floor(per / 60);
  const s = per % 60;
  return `${m}'${String(s).padStart(2, "0")}"`;
}

function decorateResults(items) {
  const best = {};
  for (const item of items) {
    const sec = Number(item.seconds);
    if (best[item.distance] == null || sec < best[item.distance]) best[item.distance] = sec;
  }
  return items.map((item) => {
    const seconds = Number(item.seconds);
    return {
      distance: item.distance,
      distanceLabel: DISTANCE_LABEL[item.distance] || item.distance,
      clock: formatClock(seconds),
      seconds,
      pace: paceOf(item.distance, seconds),
      story: item.story || "",
      pb: seconds === best[item.distance],
      race: item.race
    };
  });
}

function careerOf(results, year) {
  const provinces = [];
  const cities = [];
  let km = 0;
  for (const item of results) {
    if (item.race.province && !provinces.includes(item.race.province)) provinces.push(item.race.province);
    if (item.race.city && !cities.includes(item.race.city)) cities.push(item.race.city);
    if (String(item.race.raceDate).slice(0, 4) === String(year)) km += KM[item.distance] || 0;
  }
  const pb = { full: "", half: "" };
  for (const distance of ["full", "half"]) {
    const hit = results.find((item) => item.distance === distance && item.pb);
    if (hit) pb[distance] = hit.clock;
  }
  return {
    finished: results.length,
    provinces,
    cities,
    pb,
    yearKm: Math.round(km * 100) / 100
  };
}

function bestRanks(rows) {
  const groups = [];
  for (const distance of ["full", "half", "10k"]) {
    const best = new Map();
    for (const row of rows || []) {
      if (row.distance !== distance || !row.nickname) continue;
      const prev = best.get(row.nickname);
      if (!prev || Number(row.seconds) < prev.seconds) best.set(row.nickname, { ...row, seconds: Number(row.seconds) });
    }
    const list = [...best.values()].sort(
      (a, b) => a.seconds - b.seconds || String(a.nickname).localeCompare(String(b.nickname), "zh")
    );
    if (!list.length) continue;
    groups.push({
      distance,
      label: DISTANCE_LABEL[distance] || distance,
      rows: list.map((row, index) => ({
        place: index + 1,
        nickname: row.nickname,
        clock: formatClock(row.seconds),
        raceId: row.race.id,
        raceName: row.race.name,
        raceDate: row.race.raceDate
      }))
    });
  }
  return groups;
}

module.exports = { KM, yearOf, parseClock, formatClock, paceOf, decorateResults, careerOf, bestRanks };
