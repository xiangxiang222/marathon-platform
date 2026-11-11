const { memberRole } = require("./roles");

const CONFIG_KEYS = new Set([
  "trainingType", "title", "plannedKm", "place", "gatherPlace", "gatherAt", "route", "workout", "notice", "note",
  "minPeople", "minKm", "points", "review", "groups", "startTime", "durationMinutes", "signupLeadMinutes", "cancelLeadMinutes"
]);
const GROUP_KEYS = new Set(["name", "kind", "pace", "capacity"]);
const TEXT_KEYS = ["trainingType", "title", "place", "gatherPlace", "gatherAt", "route", "workout", "notice", "note", "startTime"];
const NUMBER_KEYS = ["plannedKm", "minPeople", "minKm", "points"];
const ABSOLUTE_DATE = /\d{4}\s*(?:[-/.年]\s*\d{1,2}|年)/u;

// Installation deliberately does not import db.js or the activity routes.
function installActivityTemplates(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      club_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS activity_templates_club ON activity_templates(club_id, id);
  `);
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function numeric(value) {
  return typeof value === "number" || (typeof value === "string" && (value === "" || /^\d+(?:\.\d+)?$/.test(value)));
}

function readTemplateBody(body) {
  if (!object(body) || Object.keys(body).some(key => !["name", "config", "version"].includes(key))) return { error: "模板只接受名称、训练配置和版本" };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || [...name].length > 30 || /[\u0000-\u001f\u007f]/u.test(name)) return { error: "模板名称用 1 到 30 个字" };
  const input = body.config;
  if (!object(input)) return { error: "请填写训练模板配置" };
  for (const key of Object.keys(input)) {
    if (!CONFIG_KEYS.has(key)) return { error: "模板不能保存日期、期次、报名或其他未知配置：" + key };
  }
  for (const key of TEXT_KEYS) {
    if (input[key] !== undefined && typeof input[key] !== "string") return { error: "模板的 " + key + " 须为文字" };
  }
  for (const key of NUMBER_KEYS) {
    if (input[key] != null && !numeric(input[key])) return { error: "模板的 " + key + " 须为数字" };
  }
  if (input.review !== undefined && typeof input.review !== "boolean") return { error: "相册审核设置须为是或否" };
  const startTime = (input.startTime || "").trim();
  if (startTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)) return { error: "模板开始时间写成 HH:mm，不包含日期" };
  if (ABSOLUTE_DATE.test(input.gatherAt || "")) return { error: "模板集合时间不能包含绝对日期" };
  const relative = {};
  for (const [key, max] of [["durationMinutes", 10080], ["signupLeadMinutes", 43200], ["cancelLeadMinutes", 43200]]) {
    const raw = input[key];
    const value = raw == null || raw === "" ? null : numeric(raw) ? Number(raw) : NaN;
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > max)) return { error: key + " 须为空或 0 到 " + max + " 的整数分钟" };
    relative[key] = value;
  }
  if (input.groups !== undefined && !Array.isArray(input.groups)) return { error: "组别格式不对" };
  const groups = input.groups === undefined ? [{ name: "全员组", kind: "pace", pace: "", capacity: 0 }] : input.groups;
  if (!groups.length) return { error: "模板至少保留一个组别" };
  if (groups.length > 12) return { error: "一场活动最多 12 个组" };
  for (const group of groups) {
    if (!object(group) || Object.keys(group).some(key => !GROUP_KEYS.has(key))) return { error: "模板组别只接受名称、种类、配速和人数上限" };
    if (typeof group.name !== "string" || !group.name.trim()) return { error: "组别名用 1 到 20 个字" };
    for (const key of ["kind", "pace"]) if (group[key] !== undefined && typeof group[key] !== "string") return { error: "组别种类和配速须为文字" };
    if (group.kind !== undefined && !["pace", "finish", "volunteer", "other"].includes(group.kind)) return { error: "组别种类选配速、完赛、志愿者或非训练" };
    if (group.capacity != null && !numeric(group.capacity)) return { error: "名额写成 0 到 500，0 表示不限" };
  }
  // The existing activity validators remain the authority for shared field limits.
  // The date is a validation-only anchor and never enters the persisted config.
  const { readActivityBody, readGroupList } = require("./club-life");
  const activity = readActivityBody({ ...input, title: (input.title || "").trim() || name, startsAt: "2000-01-01T00:00" }, {});
  if (activity.error) return activity;
  const parsedGroups = readGroupList(groups);
  if (parsedGroups.error) return parsedGroups;
  const value = activity.value;
  return { name, config: {
    trainingType: value.trainingType, title: value.title, plannedKm: value.planned,
    place: value.place, gatherPlace: value.gatherPlace, gatherAt: value.gatherAt, route: value.route,
    workout: value.workout, notice: value.notice, note: value.note,
    minPeople: value.minPeople, minKm: value.minKm, points: value.points, review: Boolean(value.review),
    groups: parsedGroups.groups, startTime, ...relative
  } };
}

function presentTemplate(row) {
  return { id: row.id, name: row.name, config: JSON.parse(row.config), version: row.version, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mountActivityTemplates(app, { BASE, getDb, userFrom }) {
  function gate(req, res) {
    const user = userFrom(req);
    if (!user) { res.status(401).json({ error: "请先登录" }); return null; }
    const db = getDb(), id = Number(req.params.id);
    const club = Number.isSafeInteger(id) && id > 0 ? db.prepare("SELECT id, owner_id FROM clubs WHERE id=?").get(id) : null;
    if (!club) { res.status(404).json({ error: "没有这个跑团" }); return null; }
    const role = memberRole(db, club, user.id);
    if (role !== "owner" && role !== "manager") { res.status(403).json({ error: "只有团长或跑团管理可以管理训练模板" }); return null; }
    res.set("Cache-Control", "no-store");
    return { db, club };
  }
  const base = BASE + "/api/clubs/:id/activity-templates";
  app.get(base, (req, res) => {
    const ctx = gate(req, res); if (!ctx) return;
    const rows = ctx.db.prepare("SELECT * FROM activity_templates WHERE club_id=? ORDER BY updated_at DESC, id DESC").all(ctx.club.id);
    res.json({ templates: rows.map(presentTemplate) });
  });
  app.post(base, (req, res) => {
    const ctx = gate(req, res); if (!ctx) return;
    const parsed = readTemplateBody(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const result = ctx.db.transaction(() => {
      if (ctx.db.prepare("SELECT COUNT(*) n FROM activity_templates WHERE club_id=?").get(ctx.club.id).n >= 50) return { status: 400, error: "每个跑团最多保存 50 个训练模板" };
      const now = new Date().toISOString();
      const id = ctx.db.prepare("INSERT INTO activity_templates(club_id,name,config,created_at,updated_at) VALUES(?,?,?,?,?)").run(ctx.club.id, parsed.name, JSON.stringify(parsed.config), now, now).lastInsertRowid;
      return { template: presentTemplate(ctx.db.prepare("SELECT * FROM activity_templates WHERE id=? AND club_id=?").get(id, ctx.club.id)) };
    }).immediate();
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(201).json(result);
  });
  app.put(base + "/:tid", (req, res) => {
    const ctx = gate(req, res); if (!ctx) return;
    const id = Number(req.params.tid), version = req.body && req.body.version;
    if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ error: "没有这个训练模板" });
    if (!Number.isSafeInteger(version) || version < 1) return res.status(400).json({ error: "请带上训练模板的有效版本" });
    const parsed = readTemplateBody(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const result = ctx.db.transaction(() => {
      const existing = ctx.db.prepare("SELECT * FROM activity_templates WHERE id=? AND club_id=?").get(id, ctx.club.id);
      if (!existing) return { status: 404, error: "没有这个训练模板" };
      if (existing.version !== version) return { status: 409, error: "训练模板已被其他管理更新，请刷新后再保存" };
      const updated = ctx.db.prepare("UPDATE activity_templates SET name=?,config=?,version=version+1,updated_at=? WHERE id=? AND club_id=? AND version=?").run(parsed.name, JSON.stringify(parsed.config), new Date().toISOString(), id, ctx.club.id, version);
      if (!updated.changes) return { status: 409, error: "训练模板已更新，请刷新后再保存" };
      return { template: presentTemplate(ctx.db.prepare("SELECT * FROM activity_templates WHERE id=? AND club_id=?").get(id, ctx.club.id)) };
    }).immediate();
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  });
  app.delete(base + "/:tid", (req, res) => {
    const ctx = gate(req, res); if (!ctx) return;
    const id = Number(req.params.tid);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ error: "没有这个训练模板" });
    const removed = ctx.db.prepare("DELETE FROM activity_templates WHERE id=? AND club_id=?").run(id, ctx.club.id);
    if (!removed.changes) return res.status(404).json({ error: "没有这个训练模板" });
    res.json({ ok: true });
  });
}

module.exports = { installActivityTemplates, mountActivityTemplates };
