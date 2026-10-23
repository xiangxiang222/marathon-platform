const { memberRole } = require("./roles");
const { slicePage } = require("./page");

const KINDS = { fee: "服务费", commission: "分佣", title: "冠名" };
const GRADES = {
  open: "未达标",
  base: "基础",
  certified: "认证",
  core: "核心"
};
const RIGHTS = {
  open: "人够 10 个就是基础。签到、赛历和榜单现在就能用。",
  base: "可以继续用签到、赛历和榜单。人够 30 且近四周有 4 天团练，可以领物资。",
  certified: "可以领品牌物资。分账只记账，不在这里付款。",
  core: "物资额度按两倍。联赛榜上标优先。分账只记账，不在这里付款。"
};
const GRADE_NOTE = "这一版不收身份证。等级按人数、近四周团练、近三个月出勤和集体参赛算。";
const LEDGER_NOTE = "会费仍由跑团自己收。分账金额只有团长和跑团管理能看，平台不付款。";

function chars(value) {
  return [...String(value || "")].length;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function beijingToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDays(day, count) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}

function shiftMonth(month, count) {
  const [year, part] = month.split("-").map(Number);
  return new Date(Date.UTC(year, part - 1 + count, 1)).toISOString().slice(0, 7);
}

function intIn(value, min, max) {
  if (typeof value === "string") {
    if (!/^-?\d+$/.test(value.trim())) return null;
    value = Number(value);
  }
  if (typeof value === "boolean" || value == null || !Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

function kmIn(value) {
  if (typeof value === "string") {
    if (!/^\d+(\.\d)?$/.test(value.trim())) return null;
    value = Number(value);
  }
  if (typeof value === "boolean" || value == null || typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 999) return null;
  if (Math.abs(value * 10 - Math.round(value * 10)) > 1e-6) return null;
  return Math.round(value * 10) / 10;
}

function monthOf(value, { allowPast }) {
  const month = String(value || "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error: "月份写成 2026-10" };
  if (!allowPast && month < beijingToday().slice(0, 7)) return { error: "不能补开已经过去的月份" };
  return { month };
}

function gradeOf(db, clubId) {
  const today = beijingToday();
  const month = today.slice(0, 7);
  const members = db.prepare("SELECT COUNT(*) AS n FROM club_members WHERE club_id = ?").get(clubId).n;
  const recentDays = db
    .prepare("SELECT COUNT(DISTINCT day) AS n FROM checkins WHERE club_id = ? AND day >= ? AND day <= ?")
    .get(clubId, addDays(today, -27), today).n;
  const months = [0, -1, -2].map((offset) => {
    const id = shiftMonth(month, offset);
    const days = db
      .prepare("SELECT COUNT(DISTINCT day) AS n FROM checkins WHERE club_id = ? AND day >= ? AND day < ?")
      .get(clubId, id + "-01", shiftMonth(id, 1) + "-01").n;
    return { id, days };
  });
  const activeMonths = months.filter((item) => item.days >= 1).length;
  const collective = db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT p.race_id FROM plans p
         JOIN club_members m ON m.user_id = p.user_id AND m.club_id = ?
         GROUP BY p.race_id
         HAVING COUNT(DISTINCT p.user_id) >= 2
         UNION
         SELECT r.race_id FROM results r
         JOIN club_members m ON m.user_id = r.user_id AND m.club_id = ?
         GROUP BY r.race_id
         HAVING COUNT(DISTINCT r.user_id) >= 2
       ) AS grouped`
    )
    .get(clubId, clubId).n;
  const baseOk = members >= 10;
  const certOk = members >= 30 && recentDays >= 4;
  const coreOk = members >= 100 && activeMonths >= 3 && collective >= 1;
  const id = coreOk ? "core" : certOk ? "certified" : baseOk ? "base" : "open";
  return {
    id,
    label: GRADES[id],
    members,
    recentDays,
    activeMonths,
    collective: collective >= 1,
    lines: [
      { label: "基础", met: baseOk, text: "成员 " + members + "/10" },
      { label: "认证", met: certOk, text: "成员 " + members + "/30，近四周团练 " + recentDays + "/4 天" },
      { label: "核心", met: coreOk, text: "成员 " + members + "/100，近三个月 " + activeMonths + "/3，集体参赛 " + (collective >= 1 ? "有" : "没有") }
    ],
    rights: RIGHTS[id],
    note: GRADE_NOTE
  };
}

function memberProgress(db, clubId, userId, month) {
  const checks = db
    .prepare("SELECT COUNT(*) AS n FROM checkins WHERE club_id = ? AND user_id = ? AND day >= ? AND day < ?")
    .get(clubId, userId, month + "-01", shiftMonth(month, 1) + "-01").n;
  const km = db
    .prepare(
      `SELECT COALESCE(SUM(c.volume_km), 0) AS km
       FROM mileage_counts c JOIN runs r ON r.id = c.run_id
       WHERE c.club_id = ? AND c.counted = 1 AND r.user_id = ? AND substr(r.started_at, 1, 7) = ?`
    )
    .get(clubId, userId, month).km;
  return { checks, km: round2(km) };
}

function claimCounts(db, supplyId, clubId) {
  const used = db.prepare("SELECT COUNT(*) AS n FROM supply_claims WHERE supply_id = ? AND status != 'cancelled'").get(supplyId).n;
  const clubUsed = clubId
    ? db.prepare("SELECT COUNT(*) AS n FROM supply_claims WHERE supply_id = ? AND club_id = ? AND status != 'cancelled'").get(supplyId, clubId).n
    : 0;
  return { used, clubUsed };
}

function supplyView(db, supply, clubId, userId, grade) {
  const progress = memberProgress(db, clubId, userId, supply.month);
  const mineRow = db.prepare("SELECT id, status FROM supply_claims WHERE supply_id = ? AND user_id = ?").get(supply.id, userId);
  const mine = mineRow && mineRow.status !== "cancelled" ? mineRow : null;
  const counts = claimCounts(db, supply.id, clubId);
  const cap = grade.id === "core" ? supply.quota * 2 : supply.quota;
  let reason = "";
  if (grade.id !== "certified" && grade.id !== "core") reason = "认证后可以领";
  else if (mine) reason = "你已经领过";
  else if (progress.checks < supply.need_checks || progress.km + 1e-9 < supply.need_km) reason = "还没达到领取条件";
  else if (counts.clubUsed >= cap) reason = "这个团的额度满了";
  else if (counts.used >= supply.total) reason = "这场物资领完了";
  return {
    id: supply.id,
    brand: supply.brand,
    name: supply.name,
    total: supply.total,
    quota: supply.quota,
    cap,
    month: supply.month,
    needChecks: supply.need_checks,
    needKm: supply.need_km,
    note: supply.note,
    claimed: counts.used,
    clubUsed: counts.clubUsed,
    progress,
    mine: mine ? { id: mine.id, status: mine.status, statusLabel: mine.status === "given" ? "已发放" : "待发放" } : null,
    ready: reason === "",
    reason
  };
}

function leagueBoard(db, league, clubId) {
  const rows = db
    .prepare(
      `SELECT j.club_id, c.name
       FROM league_joins j JOIN clubs c ON c.id = j.club_id
       WHERE j.league_id = ?
       ORDER BY j.club_id`
    )
    .all(league.id)
    .map((row) => {
      const members = db.prepare("SELECT COUNT(*) AS n FROM club_members WHERE club_id = ?").get(row.club_id).n;
      const km = db
        .prepare(
          `SELECT COALESCE(SUM(mc.volume_km), 0) AS km
           FROM mileage_counts mc JOIN runs r ON r.id = mc.run_id
           WHERE mc.club_id = ? AND mc.counted = 1 AND substr(r.started_at, 1, 7) = ?`
        )
        .get(row.club_id, league.month).km;
      const attend = db.prepare("SELECT COUNT(*) AS n FROM checkins WHERE club_id = ? AND substr(day, 1, 7) = ?").get(row.club_id, league.month).n;
      const finishers = db
        .prepare(
          `SELECT COUNT(DISTINCT r.user_id) AS n
           FROM results r
           JOIN club_members m ON m.user_id = r.user_id AND m.club_id = ?
           JOIN races rc ON rc.id = r.race_id
           WHERE substr(rc.race_date, 1, 7) = ?`
        )
        .get(row.club_id, league.month).n;
      return {
        clubId: row.club_id,
        name: row.name,
        km: round2(km),
        attend,
        finishers,
        finishRate: members ? Math.round((finishers / members) * 100) + "%" : "0%",
        core: gradeOf(db, row.club_id).id === "core",
        mine: row.club_id === clubId
      };
    })
    .sort((a, b) => b.km - a.km || b.attend - a.attend || b.finishers - a.finishers || a.clubId - b.clubId);
  let place = 0;
  let previous = null;
  return rows.map((row, index) => {
    if (!previous || row.km !== previous.km || row.attend !== previous.attend || row.finishers !== previous.finishers) place = index + 1;
    previous = row;
    return { place, ...row };
  });
}

function currentLeague(db) {
  const month = beijingToday().slice(0, 7);
  const current = db.prepare("SELECT * FROM leagues WHERE month = ?").get(month);
  if (current) return { league: current, closed: false };
  const past = db.prepare("SELECT * FROM leagues WHERE month < ? ORDER BY month DESC LIMIT 1").get(month);
  return { league: past || null, closed: Boolean(past) };
}

function presentLeague(db, league, clubId, closed, owner) {
  if (!league) return null;
  const joined = Boolean(db.prepare("SELECT 1 FROM league_joins WHERE league_id = ? AND club_id = ?").get(league.id, clubId));
  return {
    id: league.id,
    month: league.month,
    title: league.title,
    sponsor: league.sponsor,
    prize: league.prize,
    closed,
    joined,
    canJoin: owner && !closed && !joined,
    canLeave: owner && !closed && joined,
    rows: leagueBoard(db, league, clubId)
  };
}

function presentSplit(row) {
  return {
    id: row.id,
    clubId: row.club_id,
    club: row.club || "",
    month: row.month,
    kind: row.kind,
    kindLabel: KINDS[row.kind] || row.kind,
    yuan: row.yuan,
    settled: Boolean(row.settled),
    settledLabel: row.settled ? "已结" : "未结",
    note: row.note
  };
}

function supplyInput(body) {
  const brand = String((body && body.brand) || "").trim();
  if (chars(brand) < 1 || chars(brand) > 20) return { error: "品牌写成 1 到 20 个字", status: 400 };
  const name = String(body.name || "").trim();
  if (chars(name) < 1 || chars(name) > 40) return { error: "物资名写成 1 到 40 个字", status: 400 };
  const total = intIn(body.total, 1, 9999);
  if (total == null) return { error: "总量写成 1 到 9999", status: 400 };
  const quota = intIn(body.quota, 1, 999);
  if (quota == null) return { error: "额度写成 1 到 999", status: 400 };
  const month = monthOf(body.month, { allowPast: false });
  if (month.error) return { error: month.error, status: 400 };
  const needChecks = intIn(body.needChecks, 0, 31);
  if (needChecks == null) return { error: "签到天数写成 0 到 31", status: 400 };
  const needKm = kmIn(body.needKm);
  if (needKm == null) return { error: "跑量写成 0 到 999 公里", status: 400 };
  const note = String(body.note || "").trim();
  if (chars(note) > 100) return { error: "说明最多 100 个字", status: 400 };
  return { brand, name, total, quota, month: month.month, needChecks, needKm, note };
}

function quotaFits(db, supplyId, quota) {
  const rows = db
    .prepare("SELECT club_id, COUNT(*) AS n FROM supply_claims WHERE supply_id = ? AND status != 'cancelled' GROUP BY club_id")
    .all(supplyId);
  for (const row of rows) {
    const cap = gradeOf(db, row.club_id).id === "core" ? quota * 2 : quota;
    if (row.n > cap) return false;
  }
  return true;
}

function mountPartner(app, { BASE, getDb, userFrom, requireAdmin }) {
  function login(req, res) {
    const user = userFrom(req);
    if (!user) {
      res.status(401).json({ error: "请先登录" });
      return null;
    }
    return user;
  }

  function gate(req, res) {
    const user = login(req, res);
    if (!user) return null;
    const db = getDb();
    const club = db.prepare("SELECT id, name, owner_id FROM clubs WHERE id = ?").get(req.params.id);
    if (!club) {
      res.status(404).json({ error: "没有这个跑团" });
      return null;
    }
    const member = db.prepare("SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?").get(club.id, user.id);
    if (!member) {
      res.status(403).json({ error: "你不在这个跑团里" });
      return null;
    }
    const role = memberRole(db, club, user.id);
    return { user, club, db, role, staff: role === "owner" || role === "manager", owner: role === "owner" };
  }

  function sendPartner(res, ctx) {
    const grade = gradeOf(ctx.db, ctx.club.id);
    const supplies = ctx.db
      .prepare("SELECT * FROM supplies WHERE opened = 1 ORDER BY id DESC")
      .all()
      .map((row) => supplyView(ctx.db, row, ctx.club.id, ctx.user.id, grade));
    const claims = ctx.db
      .prepare(
        `SELECT c.id, c.supply_id, c.user_id, c.status, u.nickname, s.brand, s.name
         FROM supply_claims c
         JOIN users u ON u.id = c.user_id
         JOIN supplies s ON s.id = c.supply_id
         WHERE c.club_id = ? AND c.status != 'cancelled'
         ORDER BY c.id DESC`
      )
      .all(ctx.club.id)
      .map((row) => ({
        id: row.id,
        supplyId: row.supply_id,
        userId: row.user_id,
        nickname: row.nickname,
        brand: row.brand,
        name: row.name,
        status: row.status,
        statusLabel: row.status === "given" ? "已发放" : "待发放",
        mine: row.user_id === ctx.user.id
      }));
    const shown = currentLeague(ctx.db);
    const ledger = ctx.staff
      ? ctx.db
          .prepare("SELECT * FROM split_notes WHERE club_id = ? ORDER BY month DESC, id DESC")
          .all(ctx.club.id)
          .map(presentSplit)
      : null;
    res.json({
      grade,
      supplies,
      claims,
      league: presentLeague(ctx.db, shown.league, ctx.club.id, shown.closed, ctx.owner),
      ledger,
      ledgerNote: LEDGER_NOTE,
      staff: ctx.staff,
      owner: ctx.owner
    });
  }

  app.get(BASE + "/api/clubs/:id/partner", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    sendPartner(res, ctx);
  });

  app.post(BASE + "/api/clubs/:id/supplies/:sid/claim", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const supply = ctx.db.prepare("SELECT * FROM supplies WHERE id = ?").get(req.params.sid);
    if (!supply || !supply.opened) return res.status(404).json({ error: "没有这场物资" });
    const grade = gradeOf(ctx.db, ctx.club.id);
    if (grade.id !== "certified" && grade.id !== "core") return res.status(400).json({ error: "认证后可以领" });
    const progress = memberProgress(ctx.db, ctx.club.id, ctx.user.id, supply.month);
    if (progress.checks < supply.need_checks || progress.km + 1e-9 < supply.need_km) {
      return res.status(400).json({ error: "还没达到领取条件" });
    }
    const now = new Date().toISOString();
    const result = ctx.db.transaction(() => {
      const existing = ctx.db.prepare("SELECT * FROM supply_claims WHERE supply_id = ? AND user_id = ?").get(supply.id, ctx.user.id);
      if (existing && existing.status !== "cancelled") return { error: "你已经领过", status: 400 };
      const fresh = gradeOf(ctx.db, ctx.club.id);
      const cap = fresh.id === "core" ? supply.quota * 2 : supply.quota;
      const counts = claimCounts(ctx.db, supply.id, ctx.club.id);
      if (counts.clubUsed >= cap) return { error: "这个团的额度满了", status: 400 };
      if (counts.used >= supply.total) return { error: "这场物资领完了", status: 400 };
      if (existing) {
        ctx.db.prepare("UPDATE supply_claims SET club_id = ?, status = 'pending', created_at = ?, given_at = '' WHERE id = ?").run(ctx.club.id, now, existing.id);
      } else {
        ctx.db
          .prepare("INSERT INTO supply_claims (supply_id, club_id, user_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)")
          .run(supply.id, ctx.club.id, ctx.user.id, now);
      }
      return { ok: true };
    })();
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
  });

  app.delete(BASE + "/api/clubs/:id/supplies/:sid/claims/:cid", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const claim = ctx.db
      .prepare("SELECT * FROM supply_claims WHERE id = ? AND supply_id = ? AND club_id = ?")
      .get(req.params.cid, req.params.sid, ctx.club.id);
    if (!claim || claim.status === "cancelled") return res.status(404).json({ error: "没有这条领取" });
    if (claim.status === "given") return res.status(400).json({ error: "已经发放，不能撤回" });
    if (claim.user_id !== ctx.user.id && !ctx.staff) return res.status(403).json({ error: "只能撤回自己的" });
    ctx.db.prepare("UPDATE supply_claims SET status = 'cancelled', given_at = '' WHERE id = ?").run(claim.id);
    res.json({ ok: true });
  });

  app.post(BASE + "/api/clubs/:id/supplies/:sid/claims/:cid/give", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    if (!ctx.staff) return res.status(403).json({ error: "只有团长或跑团管理可以发" });
    const claim = ctx.db
      .prepare("SELECT * FROM supply_claims WHERE id = ? AND supply_id = ? AND club_id = ?")
      .get(req.params.cid, req.params.sid, ctx.club.id);
    if (!claim || claim.status === "cancelled") return res.status(404).json({ error: "没有这条领取" });
    if (claim.status !== "given") {
      ctx.db.prepare("UPDATE supply_claims SET status = 'given', given_at = ? WHERE id = ?").run(new Date().toISOString(), claim.id);
    }
    res.json({ ok: true });
  });

  app.post(BASE + "/api/clubs/:id/league/join", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    if (!ctx.owner) return res.status(403).json({ error: "只有团长可以参加联赛" });
    const month = beijingToday().slice(0, 7);
    const league = ctx.db.prepare("SELECT id FROM leagues WHERE month = ?").get(month);
    if (!league) return res.status(400).json({ error: "这个月还没有联赛" });
    ctx.db.prepare("INSERT OR IGNORE INTO league_joins (league_id, club_id, joined_at) VALUES (?, ?, ?)").run(league.id, ctx.club.id, new Date().toISOString());
    res.json({ ok: true });
  });

  app.delete(BASE + "/api/clubs/:id/league/join", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    if (!ctx.owner) return res.status(403).json({ error: "只有团长可以退出联赛" });
    const month = beijingToday().slice(0, 7);
    const current = ctx.db.prepare("SELECT id FROM leagues WHERE month = ?").get(month);
    if (current) {
      const row = ctx.db.prepare("SELECT 1 FROM league_joins WHERE league_id = ? AND club_id = ?").get(current.id, ctx.club.id);
      if (!row) return res.status(400).json({ error: "还没参加" });
      ctx.db.prepare("DELETE FROM league_joins WHERE league_id = ? AND club_id = ?").run(current.id, ctx.club.id);
      return res.json({ ok: true });
    }
    const past = ctx.db
      .prepare(
        `SELECT l.id FROM leagues l
         JOIN league_joins j ON j.league_id = l.id
         WHERE j.club_id = ? AND l.month < ?
         LIMIT 1`
      )
      .get(ctx.club.id, month);
    if (past) return res.status(400).json({ error: "这个月已经结束" });
    return res.status(400).json({ error: "还没参加" });
  });

  app.get(BASE + "/api/admin/partner", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const supplies = db
      .prepare("SELECT * FROM supplies ORDER BY id DESC")
      .all()
      .map((row) => ({
        id: row.id,
        brand: row.brand,
        name: row.name,
        total: row.total,
        quota: row.quota,
        month: row.month,
        needChecks: row.need_checks,
        needKm: row.need_km,
        note: row.note,
        open: Boolean(row.opened),
        claimed: claimCounts(db, row.id).used
      }));
    const leagues = db
      .prepare(
        `SELECT l.*, (SELECT COUNT(*) FROM league_joins j WHERE j.league_id = l.id) AS clubs
         FROM leagues l ORDER BY l.month DESC`
      )
      .all()
      .map((row) => ({ id: row.id, month: row.month, title: row.title, sponsor: row.sponsor, prize: row.prize, clubs: row.clubs }));
    const splits = db
      .prepare(
        `SELECT s.*, c.name AS club FROM split_notes s
         JOIN clubs c ON c.id = s.club_id
         ORDER BY s.id DESC`
      )
      .all()
      .map(presentSplit);
    const supplyPage = slicePage(supplies, { page: req.query.supplyPage, pageSize: req.query.pageSize });
    const leaguePage = slicePage(leagues, { page: req.query.leaguePage, pageSize: req.query.pageSize });
    const splitPage = slicePage(splits, { page: req.query.splitPage, pageSize: req.query.pageSize });
    res.json({
      supplies: supplyPage.rows,
      supplyTotal: supplyPage.total,
      supplyPage: supplyPage.page,
      supplyPages: supplyPage.pages,
      leagues: leaguePage.rows,
      leagueTotal: leaguePage.total,
      leaguePage: leaguePage.page,
      leaguePages: leaguePage.pages,
      splits: splitPage.rows,
      splitTotal: splitPage.total,
      splitPage: splitPage.page,
      splitPages: splitPage.pages
    });
  });

  app.post(BASE + "/api/admin/supplies", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const input = supplyInput(req.body || {});
    if (input.error) return res.status(input.status).json({ error: input.error });
    const info = getDb()
      .prepare(
        `INSERT INTO supplies (brand, name, total, quota, month, need_checks, need_km, note, opened, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
      )
      .run(input.brand, input.name, input.total, input.quota, input.month, input.needChecks, input.needKm, input.note, new Date().toISOString());
    res.json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  app.put(BASE + "/api/admin/supplies/:id", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const supply = db.prepare("SELECT * FROM supplies WHERE id = ?").get(req.params.id);
    if (!supply) return res.status(404).json({ error: "没有这场物资" });
    const body = req.body || {};
    const used = claimCounts(db, supply.id).used;
    let total = supply.total;
    let quota = supply.quota;
    let needChecks = supply.need_checks;
    let needKm = supply.need_km;
    let note = supply.note;
    let opened = supply.opened;
    if (Object.prototype.hasOwnProperty.call(body, "total")) {
      total = intIn(body.total, 1, 9999);
      if (total == null) return res.status(400).json({ error: "总量写成 1 到 9999" });
      if (total < used) return res.status(400).json({ error: "总量不能少于已领" });
    }
    if (Object.prototype.hasOwnProperty.call(body, "quota")) {
      quota = intIn(body.quota, 1, 999);
      if (quota == null) return res.status(400).json({ error: "额度写成 1 到 999" });
      if (!quotaFits(db, supply.id, quota)) return res.status(400).json({ error: "额度不能少于已领" });
    }
    if (Object.prototype.hasOwnProperty.call(body, "needChecks") || Object.prototype.hasOwnProperty.call(body, "needKm")) {
      if (Object.prototype.hasOwnProperty.call(body, "needChecks")) {
        needChecks = intIn(body.needChecks, 0, 31);
        if (needChecks == null) return res.status(400).json({ error: "签到天数写成 0 到 31" });
      }
      if (Object.prototype.hasOwnProperty.call(body, "needKm")) {
        needKm = kmIn(body.needKm);
        if (needKm == null) return res.status(400).json({ error: "跑量写成 0 到 999 公里" });
      }
      if (used && (needChecks !== supply.need_checks || Math.abs(needKm - supply.need_km) > 1e-9)) {
        return res.status(400).json({ error: "已经有人领取，条件不能改" });
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "note")) {
      note = String(body.note || "").trim();
      if (chars(note) > 100) return res.status(400).json({ error: "说明最多 100 个字" });
    }
    if (Object.prototype.hasOwnProperty.call(body, "open")) {
      if (body.open !== true && body.open !== false) return res.status(400).json({ error: "选择开放或结束" });
      opened = body.open ? 1 : 0;
    }
    db.prepare("UPDATE supplies SET total = ?, quota = ?, need_checks = ?, need_km = ?, note = ?, opened = ? WHERE id = ?").run(
      total,
      quota,
      needChecks,
      needKm,
      note,
      opened,
      supply.id
    );
    res.json({ ok: true });
  });

  app.delete(BASE + "/api/admin/supplies/:id", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const supply = db.prepare("SELECT id FROM supplies WHERE id = ?").get(req.params.id);
    if (!supply) return res.status(404).json({ error: "没有这场物资" });
    if (claimCounts(db, supply.id).used) return res.status(400).json({ error: "已经有人领取" });
    db.prepare("DELETE FROM supply_claims WHERE supply_id = ?").run(supply.id);
    db.prepare("DELETE FROM supplies WHERE id = ?").run(supply.id);
    res.json({ ok: true });
  });

  app.post(BASE + "/api/admin/leagues", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const body = req.body || {};
    const title = String(body.title || "").trim();
    if (chars(title) < 1 || chars(title) > 40) return res.status(400).json({ error: "联赛名称写成 1 到 40 个字" });
    const sponsor = String(body.sponsor || "").trim();
    if (chars(sponsor) > 40) return res.status(400).json({ error: "冠名最多 40 个字" });
    const prize = String(body.prize || "").trim();
    if (chars(prize) > 80) return res.status(400).json({ error: "奖品最多 80 个字" });
    const month = monthOf(body.month, { allowPast: false });
    if (month.error) return res.status(month.error === "月份写成 2026-10" ? 400 : 400).json({ error: month.error });
    const db = getDb();
    if (db.prepare("SELECT id FROM leagues WHERE month = ?").get(month.month)) return res.status(400).json({ error: "这个月已经有联赛" });
    const info = db
      .prepare("INSERT INTO leagues (month, title, sponsor, prize, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(month.month, title, sponsor, prize, new Date().toISOString());
    res.json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  app.put(BASE + "/api/admin/leagues/:id", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const league = db.prepare("SELECT * FROM leagues WHERE id = ?").get(req.params.id);
    if (!league) return res.status(404).json({ error: "没有这场联赛" });
    const body = req.body || {};
    let title = league.title;
    let sponsor = league.sponsor;
    let prize = league.prize;
    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      title = String(body.title || "").trim();
      if (chars(title) < 1 || chars(title) > 40) return res.status(400).json({ error: "联赛名称写成 1 到 40 个字" });
    }
    if (Object.prototype.hasOwnProperty.call(body, "sponsor")) {
      sponsor = String(body.sponsor || "").trim();
      if (chars(sponsor) > 40) return res.status(400).json({ error: "冠名最多 40 个字" });
    }
    if (Object.prototype.hasOwnProperty.call(body, "prize")) {
      prize = String(body.prize || "").trim();
      if (chars(prize) > 80) return res.status(400).json({ error: "奖品最多 80 个字" });
    }
    db.prepare("UPDATE leagues SET title = ?, sponsor = ?, prize = ? WHERE id = ?").run(title, sponsor, prize, league.id);
    res.json({ ok: true });
  });

  app.post(BASE + "/api/admin/splits", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const body = req.body || {};
    const clubId = intIn(body.clubId, 1, 1000000000);
    const db = getDb();
    if (clubId == null || !db.prepare("SELECT id FROM clubs WHERE id = ?").get(clubId)) return res.status(400).json({ error: "没有这个跑团" });
    const month = monthOf(body.month, { allowPast: true });
    if (month.error) return res.status(400).json({ error: month.error });
    if (!KINDS[body.kind]) return res.status(400).json({ error: "种类选服务费、分佣或冠名" });
    const yuan = intIn(body.yuan, 1, 999999);
    if (yuan == null) return res.status(400).json({ error: "金额写成 1 到 999999 的整数元" });
    const note = String(body.note || "").trim();
    if (chars(note) > 80) return res.status(400).json({ error: "备注最多 80 个字" });
    const info = db
      .prepare("INSERT INTO split_notes (club_id, month, kind, yuan, settled, note, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)")
      .run(clubId, month.month, body.kind, yuan, note, new Date().toISOString());
    res.json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  app.put(BASE + "/api/admin/splits/:id", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const row = db.prepare("SELECT * FROM split_notes WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "没有这笔账" });
    const body = req.body || {};
    let settled = row.settled;
    let note = row.note;
    if (Object.prototype.hasOwnProperty.call(body, "settled")) {
      if (body.settled !== true && body.settled !== false) return res.status(400).json({ error: "选择未结或已结" });
      settled = body.settled ? 1 : 0;
    }
    if (Object.prototype.hasOwnProperty.call(body, "note")) {
      note = String(body.note || "").trim();
      if (chars(note) > 80) return res.status(400).json({ error: "备注最多 80 个字" });
    }
    db.prepare("UPDATE split_notes SET settled = ?, note = ? WHERE id = ?").run(settled, note, row.id);
    res.json({ ok: true });
  });

  app.delete(BASE + "/api/admin/splits/:id", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const row = db.prepare("SELECT * FROM split_notes WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "没有这笔账" });
    if (row.settled) return res.status(400).json({ error: "已经结清的账不能删" });
    db.prepare("DELETE FROM split_notes WHERE id = ?").run(row.id);
    res.json({ ok: true });
  });
}

module.exports = { mountPartner };
