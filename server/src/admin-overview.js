const { presentRace } = require("./races");

function cstDay(now) {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function count(db, sql, ...params) {
  return Number(db.prepare(sql).get(...params).n);
}

function adminOverview(db, role, now = new Date()) {
  const today = cstDay(now);
  // The club desk already authorizes platform user, club and membership management.
  // Content metrics stay entirely out of its response and are not queried for that role.
  const counts = {
    users: count(db, "SELECT COUNT(*) AS n FROM users"),
    clubs: count(db, "SELECT COUNT(*) AS n FROM clubs"),
    pendingFoundings: count(db, "SELECT COUNT(*) AS n FROM club_applications WHERE status = 'pending'"),
    pendingJoins: count(db, "SELECT COUNT(*) AS n FROM club_requests WHERE status = 'pending'")
  };
  const result = {
    generatedAt: now.toISOString(), today, role,
    counts,
    upcoming: [],
    contentQuality: null,
    attention: [
      { id: "foundings", label: "建团申请", count: counts.pendingFoundings, section: "joins", tab: "foundings", description: "核实跑团资料后处理建团资格。" },
      { id: "joins", label: "入团申请", count: counts.pendingJoins, section: "joins", tab: "joins", description: "待团长或跑团管理审核的成员申请。" }
    ]
  };
  if (role !== "admin") return result;

  Object.assign(counts, {
    publishedRaces: count(db, "SELECT COUNT(*) AS n FROM races"),
    upcomingRaces: count(db, "SELECT COUNT(*) AS n FROM races WHERE race_date >= ?", today),
    pendingRaces: count(db, "SELECT COUNT(*) AS n FROM bot_submissions WHERE status = 'pending'"),
    returnedRaces: count(db, "SELECT COUNT(*) AS n FROM bot_submissions WHERE status = 'returned'"),
    publishedNews: count(db, "SELECT COUNT(*) AS n FROM news"),
    pendingNews: count(db, "SELECT COUNT(*) AS n FROM news_submissions WHERE status = 'pending'")
  });
  const quality = db.prepare(`
    SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN TRIM(reg_start) = '' AND TRIM(deadline) = ''
        AND TRIM(draw_at) = '' AND TRIM(pay_deadline) = '' THEN 1 ELSE 0 END), 0) AS missingRegistrationNodes,
      COALESCE(SUM(CASE WHEN TRIM(guide_text) = '' AND NOT EXISTS (
        SELECT 1 FROM race_sheets s WHERE s.race_id = r.id AND s.kind = 'guide' AND TRIM(s.filename) != ''
      ) THEN 1 ELSE 0 END), 0) AS missingGuide,
      COALESCE(SUM(CASE WHEN TRIM(source) = '' THEN 1 ELSE 0 END), 0) AS missingSource
    FROM races r WHERE race_date >= ?
  `).get(today);
  result.contentQuality = { scope: "upcoming", ...quality };
  result.upcoming = db.prepare("SELECT * FROM races WHERE race_date >= ? ORDER BY race_date, id LIMIT 6").all(today).map((row) => {
    const race = presentRace(row, now);
    return { id: race.id, name: race.name, raceDate: race.raceDate, city: race.city, distanceLabels: race.distanceLabels, regStatus: race.regStatus, deadlineLabel: race.deadlineLabel };
  });
  result.attention.unshift(
    { id: "races", label: "赛事待审核", count: counts.pendingRaces, section: "races", tab: "review", description: "核对采集信息及来源，审核后发布到赛历。" },
    { id: "returnedRaces", label: "已打回赛事", count: counts.returnedRaces, section: "races", tab: "review", filter: "returned", description: "查看打回原因与待补充的赛事资料。" },
    { id: "news", label: "资讯待审核", count: counts.pendingNews, section: "news", tab: "review", description: "核对内容、来源和关联赛事后发布。" }
  );
  return result;
}

module.exports = { adminOverview };
