// Only information already shared through club race boards and club albums.
// Private runner/history records and result proof/story fields are never read.
const { DISTANCE_LABEL, presentRace } = require("./races");
const { KM, formatClock, paceOf } = require("./career");

function raceSummary(row) {
  const race = presentRace(row, new Date());
  return { id: race.id, name: race.name, raceDate: race.raceDate, city: race.city, province: race.province, kind: race.kind, meet: race.meet };
}

function pastRace(race, today) {
  const date = race.raceDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return false;
  const parsed = Date.parse(date + "T00:00:00Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date && date <= today;
}

function memberSharedProfile(db, clubId, userId, base) {
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const rawResults = db.prepare(`SELECT r.*,res.distance AS result_distance,res.seconds
    FROM results res JOIN races r ON r.id=res.race_id WHERE res.user_id=?
    ORDER BY r.race_date DESC,r.id,res.distance`).all(userId);
  const results = rawResults.filter(r => Number.isSafeInteger(r.seconds) && r.seconds > 0).map(row => {
    const race = raceSummary(row);
    return { id: race.id + ":" + row.result_distance, raceId: race.id, name: race.name, raceDate: race.raceDate,
      race, distance: row.result_distance, distanceLabel: DISTANCE_LABEL[row.result_distance] || row.result_distance,
      seconds: row.seconds, clock: formatClock(row.seconds), pace: paceOf(row.result_distance, row.seconds), status: "finished", pb: false };
  });
  const eligible = result => pastRace(result.race, today) && result.race.kind === "road" && result.race.meet === "offline" && !!KM[result.distance];
  const best = new Map();
  for (const result of results) if (eligible(result) && (!best.has(result.distance) || result.seconds < best.get(result.distance).seconds)) best.set(result.distance, result);
  for (const result of results) result.pb = eligible(result) && result.seconds === best.get(result.distance)?.seconds;
  const pbs = ["full", "half", "10k", "5k"].filter(distance => best.has(distance)).map(distance => ({ ...best.get(distance) }));

  const byRace = new Map();
  for (const row of db.prepare(`SELECT r.*,p.status AS mark_status FROM plans p JOIN races r ON r.id=p.race_id
    WHERE p.user_id=? ORDER BY r.race_date DESC,r.id`).all(userId)) {
    const race = raceSummary(row);
    byRace.set(race.id, { race, raceId: race.id, name: race.name, raceDate: race.raceDate, city: race.city,
      status: row.mark_status, statusLabel: row.mark_status, hasResult: false, results: [] });
  }
  for (const result of results) {
    if (!byRace.has(result.raceId)) byRace.set(result.raceId, { race: result.race, raceId: result.raceId, name: result.name, raceDate: result.raceDate, city: result.race.city, status: "完赛", statusLabel: "完赛", hasResult: false, results: [] });
    const event = byRace.get(result.raceId);
    event.hasResult = true;
    event.results.push({ distance: result.distance, distanceLabel: result.distanceLabel, seconds: result.seconds, clock: result.clock, pb: result.pb });
  }
  const races = [...byRace.values()].sort((a, b) => String(b.raceDate).localeCompare(String(a.raceDate)) || a.raceId.localeCompare(b.raceId));
  const albumsByActivity = new Map();
  const media = db.prepare(`SELECT m.id,m.activity_id,m.kind,m.created_at,a.title,a.starts_at
    FROM activity_media m JOIN activities a ON a.id=m.activity_id
    WHERE a.club_id=? AND m.user_id=? AND m.status='shown' AND m.filename!='' AND m.kind IN ('photo','video')
    ORDER BY a.starts_at DESC,a.id DESC,m.id DESC`).all(clubId, userId);
  for (const row of media) {
    if (!albumsByActivity.has(row.activity_id)) albumsByActivity.set(row.activity_id, { id: row.activity_id, activityId: row.activity_id, title: row.title, date: row.starts_at.slice(0, 10), photoCount: 0, videoCount: 0, coverId: 0, items: [] });
    const album = albumsByActivity.get(row.activity_id);
    const item = { id: row.id, kind: row.kind, type: row.kind, createdAt: row.created_at, url: base + "/api/media/" + row.id };
    album.items.push(item);
    if (row.kind === "photo") { album.photoCount++; if (!album.coverId) album.coverId = row.id; }
    else album.videoCount++;
  }
  const albums = [...albumsByActivity.values()];
  const summary = {
    raceCount: races.length,
    upcomingRaceCount: races.filter(r => r.raceDate > today && !["想跑", "未中签", "未完赛", "弃赛", "完赛"].includes(r.status)).length,
    finishedRaceCount: races.filter(r => pastRace(r.race, today) && (r.hasResult || r.status === "完赛")).length,
    resultCount: results.length,
    photoCount: media.filter(m => m.kind === "photo").length,
    videoCount: media.filter(m => m.kind === "video").length,
    pb: pbs
  };
  return { summary, races, results, albums, pbs, album: albums.flatMap(a => a.items.map(item => ({ ...item, activityId: a.id, title: a.title }))) };
}

module.exports = { memberSharedProfile };
