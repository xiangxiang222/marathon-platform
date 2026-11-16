const { memberRole } = require('./roles');

const KINDS = { carpool: '拼车', gather: '集合', pickup: '领物' };
const TZ = 8 * 3600 * 1000;

function outingInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return NaN;
  const instant = Date.parse(value + ':00+08:00');
  if (!Number.isFinite(instant) || new Date(instant + TZ).toISOString().slice(0, 16) !== value) return NaN;
  return instant;
}

function inputOuting(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: '请填写同行安排' };
  if (!Number.isSafeInteger(body.clubId) || body.clubId < 1) return { error: '请选择已加入的跑团' };
  if (!Object.hasOwn(KINDS, body.kind)) return { error: '请选择拼车、集合或领物' };
  if (!(outingInstant(body.startsAt) > Date.now())) return { error: '时间须为有效的未来北京时间' };
  if (typeof body.place !== 'string' || !body.place.trim() || body.place.trim().length > 120) return { error: '地点填写1至120字' };
  if (!Number.isSafeInteger(body.capacity) || body.capacity < 1 || body.capacity > 100) return { error: '总人数填写1至100，包含发起人' };
  if (body.note != null && (typeof body.note !== 'string' || body.note.trim().length > 300)) return { error: '说明不超过300字' };
  return { value: { ...body, place: body.place.trim(), note: (body.note || '').trim() } };
}

function presentOuting(db, row, userId) {
  const members = db.prepare(`SELECT u.id AS userId,u.nickname FROM race_outing_members om
    JOIN users u ON u.id=om.user_id
    JOIN club_members cm ON cm.user_id=om.user_id AND cm.club_id=?
    WHERE om.outing_id=? ORDER BY om.joined_at,om.user_id`).all(row.club_id, row.id);
  const joined = members.some(member => member.userId === userId);
  const role = memberRole(db, { id: row.club_id, owner_id: row.owner_id }, userId);
  const remaining = Math.max(0, row.capacity - members.length);
  return {
    id: row.id, raceId: row.race_id, clubId: row.club_id, clubName: row.club_name,
    kind: row.kind, kindLabel: KINDS[row.kind], startsAt: row.starts_at,
    place: row.place, capacity: row.capacity, note: row.note, status: row.status,
    host: { userId: row.host_user_id, nickname: row.host_name }, members,
    memberCount: members.length, remaining, joined, isHost: row.host_user_id === userId,
    canCancel: row.status === 'open' && (row.host_user_id === userId || role === 'owner' || role === 'manager'),
    canJoin: row.status === 'open' && !joined && remaining > 0 && outingInstant(row.starts_at) > Date.now()
  };
}

function mountRaceOutings(app, { BASE, getDb, userFrom }) {
  function auth(req, res) {
    const user = userFrom(req);
    if (!user) res.status(401).json({ error: '请先登录' });
    return user;
  }
  function raceExists(db, id, res) {
    if (db.prepare('SELECT 1 FROM races WHERE id=?').get(id)) return true;
    res.status(404).json({ error: '没有这场比赛' });
    return false;
  }
  function accessible(db, raceId, outingId, userId) {
    return db.prepare(`SELECT o.*,c.name AS club_name,c.owner_id,u.nickname AS host_name
      FROM race_outings o JOIN clubs c ON c.id=o.club_id JOIN users u ON u.id=o.host_user_id
      JOIN club_members cm ON cm.club_id=o.club_id AND cm.user_id=?
      WHERE o.id=? AND o.race_id=?`).get(userId, outingId, raceId);
  }

  app.get(BASE + '/api/races/:id/outings', (req, res) => {
    const user = auth(req, res);
    if (!user) return;
    const db = getDb();
    if (!raceExists(db, req.params.id, res)) return;
    const rows = db.prepare(`SELECT o.*,c.name AS club_name,c.owner_id,u.nickname AS host_name
      FROM race_outings o JOIN clubs c ON c.id=o.club_id JOIN users u ON u.id=o.host_user_id
      JOIN club_members cm ON cm.club_id=o.club_id AND cm.user_id=?
      WHERE o.race_id=? AND o.status='open' ORDER BY o.starts_at,o.id`).all(user.id, req.params.id);
    res.set('Cache-Control', 'private, no-store');
    res.json({ outings: rows.map(row => presentOuting(db, row, user.id)) });
  });

  app.post(BASE + '/api/races/:id/outings', (req, res) => {
    const user = auth(req, res);
    if (!user) return;
    const parsed = inputOuting(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const db = getDb(), value = parsed.value;
    if (!raceExists(db, req.params.id, res)) return;
    const result = db.transaction(() => {
      if (!db.prepare('SELECT 1 FROM club_members WHERE club_id=? AND user_id=?').get(value.clubId, user.id)) return { error: '只能在已加入的跑团发起安排', status: 403 };
      if (!(outingInstant(value.startsAt) > Date.now())) return { error: '安排时间已过，请重新选择', status: 400 };
      const stamp = new Date().toISOString();
      const id = Number(db.prepare(`INSERT INTO race_outings(race_id,club_id,host_user_id,kind,starts_at,place,capacity,note,created_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).run(req.params.id, value.clubId, user.id, value.kind, value.startsAt, value.place, value.capacity, value.note, stamp).lastInsertRowid);
      db.prepare('INSERT INTO race_outing_members(outing_id,user_id,joined_at) VALUES(?,?,?)').run(id, user.id, stamp);
      return { outing: presentOuting(db, accessible(db, req.params.id, id, user.id), user.id) };
    }).immediate();
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(201).json(result);
  });

  app.put(BASE + '/api/races/:id/outings/:outingId/membership', (req, res) => {
    const user = auth(req, res);
    if (!user) return;
    const joined = req.body && req.body.joined;
    if (typeof joined !== 'boolean') return res.status(400).json({ error: '请选择加入或退出安排' });
    const db = getDb();
    const result = db.transaction(() => {
      const row = accessible(db, req.params.id, req.params.outingId, user.id);
      if (!row) return { error: '没有这项同行安排', status: 404 };
      if (row.status !== 'open') return { error: '这项安排已取消', status: 409 };
      if (!joined && row.host_user_id === user.id) return { error: '发起人请取消安排，不能单独退出', status: 400 };
      const exists = db.prepare('SELECT 1 FROM race_outing_members WHERE outing_id=? AND user_id=?').get(row.id, user.id);
      if (joined && !exists) {
        if (!(outingInstant(row.starts_at) > Date.now())) return { error: '安排时间已过，不能加入', status: 409 };
        const count = db.prepare('SELECT COUNT(*) AS n FROM race_outing_members WHERE outing_id=?').get(row.id).n;
        if (count >= row.capacity) return { error: '名额已满', status: 409 };
        db.prepare('INSERT INTO race_outing_members(outing_id,user_id,joined_at) VALUES(?,?,?)').run(row.id, user.id, new Date().toISOString());
      } else if (!joined) {
        db.prepare('DELETE FROM race_outing_members WHERE outing_id=? AND user_id=?').run(row.id, user.id);
      }
      return { outing: presentOuting(db, row, user.id) };
    }).immediate();
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });

  app.delete(BASE + '/api/races/:id/outings/:outingId', (req, res) => {
    const user = auth(req, res);
    if (!user) return;
    const db = getDb();
    const result = db.transaction(() => {
      const row = accessible(db, req.params.id, req.params.outingId, user.id);
      if (!row) return { error: '没有这项同行安排', status: 404 };
      const role = memberRole(db, { id: row.club_id, owner_id: row.owner_id }, user.id);
      if (row.host_user_id !== user.id && role !== 'owner' && role !== 'manager') return { error: '只有发起人或跑团管理可以取消', status: 403 };
      db.prepare("UPDATE race_outings SET status='cancelled',cancelled_at=? WHERE id=? AND status='open'").run(new Date().toISOString(), row.id);
      return { ok: true };
    }).immediate();
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });
}

module.exports = { mountRaceOutings, outingInstant };
