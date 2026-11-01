const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { adminSession } = require("./admin-auth");

const STATUS = { pending: "待审核", published: "征集中", adopted: "已采纳", building: "开发中", released: "已上线", declined: "暂不采纳", withdrawn: "已撤回" };
const REWARD_STATUS = { unclaimed: "待领取", claimed: "待寄出", shipped: "已寄出", received: "已签收" };
const CATEGORIES = new Set(["feature", "ui", "bug", "other"]);
const MODULES = new Set(["races", "clubs", "sport", "profile", "other"]);
const NEXT = { pending: ["published", "declined"], published: ["adopted", "declined"], adopted: ["building", "released"], building: ["released"], released: [], declined: [], withdrawn: [] };
const IMAGE_MAX = 5 * 1024 * 1024;

function feedbackRoot() { return path.join(process.env.MARATHON_MEDIA || path.join(__dirname, "../data/media"), "feedback"); }
function removeFeedbackFile(filename) {
  if (!filename || path.basename(filename) !== filename) return;
  try { fs.unlinkSync(path.join(feedbackRoot(), filename)); } catch (err) { if (err.code !== "ENOENT") console.error("feedback image cleanup:", err.code); }
}
// Called inside the existing account deletion transaction; disk cleanup is after commit.
function deleteFeedbackUser(db, userId) {
  db.prepare("DELETE FROM feedback_votes WHERE user_id = ? OR feedback_id IN (SELECT id FROM feedback WHERE user_id = ?)").run(userId, userId);
  for (const table of ["feedback_events", "feedback_images", "feedback_rewards"]) db.prepare(`DELETE FROM ${table} WHERE feedback_id IN (SELECT id FROM feedback WHERE user_id = ?)`).run(userId);
  db.prepare("DELETE FROM feedback WHERE user_id = ?").run(userId);
}
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function text(value, min, max, label) {
  if (typeof value !== "string") fail(`请填写${label}`);
  const clean = value.trim();
  const length = Array.from(clean).length;
  if (length < min || length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(clean)) fail(`${label}请填写 ${min}–${max} 个字`);
  return clean;
}
function pageOf(value, total, size) {
  const raw = Number(value);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Number.isSafeInteger(raw) && raw > 0 ? Math.min(raw, pages) : 1;
  return { page, pages, offset: (page - 1) * size };
}
function publicRow(row) { return !!row.published_at && !["pending", "withdrawn"].includes(row.status); }
function imageKind(buffer) {
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buffer.toString("ascii", 12, 16) === "IHDR") return { ext: "png", mime: "image/png" };
  if (buffer.length >= 16 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" && /^(VP8 |VP8L|VP8X)$/.test(buffer.toString("ascii", 12, 16))) return { ext: "webp", mime: "image/webp" };
  return null;
}
function readUpload(req) {
  return new Promise((resolve, reject) => {
    if (req.readableEnded) return reject(new Error("请选择图片文件"));
    const chunks = []; let size = 0; let oversized = Number(req.get("content-length")) > IMAGE_MAX + 65536;
    req.on("data", chunk => { size += chunk.length; if (size > IMAGE_MAX + 65536) oversized = true; if (!oversized) chunks.push(chunk); });
    req.on("error", reject);
    req.on("aborted", () => reject(new Error("上传中断，请重试")));
    req.on("end", () => oversized ? reject(Object.assign(new Error("单张图片不超过 5MB"), { status: 413 })) : resolve(Buffer.concat(chunks)));
  });
}

function mountFeedback(app, { BASE, getDb, userFrom, requireAdmin, oneUpload }) {
  const prefix = BASE + "/api";
  function tokenOf(req, query = false) {
    const header = req.get("authorization") || "";
    return header.replace(/^Bearer\s+/i, "") !== header ? header.replace(/^Bearer\s+/i, "") : query && typeof req.query.t === "string" ? req.query.t : "";
  }
  function isAdmin(db, token) {
    if (!token) return false;
    const session = adminSession(db, token);
    if (session && session.role === "admin") return true;
    const expected = process.env.ADMIN_TOKEN || "";
    const a = Buffer.from(token), b = Buffer.from(expected);
    return !!expected && a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  function viewer(req, query = false) {
    const db = getDb(); const token = tokenOf(req, query);
    const user = userFrom(req) || (query && token ? db.prepare("SELECT id FROM users WHERE token = ?").get(token) : null);
    return { userId: user?.id || 0, admin: isAdmin(db, token), token };
  }
  function logged(req) { const user = userFrom(req); if (!user) fail("请先登录", 401); return user; }
  function find(db, id) {
    if (!/^\d+$/.test(String(id))) fail("没有这条建议", 404);
    const row = db.prepare("SELECT f.*, u.nickname FROM feedback f JOIN users u ON u.id = f.user_id WHERE f.id = ?").get(id);
    if (!row) fail("没有这条建议", 404);
    return row;
  }
  function readable(row, who) { if (!publicRow(row) && row.user_id !== who.userId && !who.admin) fail("没有这条建议", 404); }
  function owned(db, id, userId) { const row = find(db, id); if (row.user_id !== userId) fail("没有这条建议", 404); return row; }
  function pack(db, row, who, detail = true) {
    const mine = who.userId === row.user_id;
    const result = { id: row.id, title: row.title, category: row.category, module: row.module, status: row.status, statusLabel: STATUS[row.status],
      author: { nickname: row.nickname }, revision: row.version, votes: db.prepare("SELECT COUNT(*) AS n FROM feedback_votes WHERE feedback_id = ?").get(row.id).n,
      voted: !!(who.userId && db.prepare("SELECT 1 FROM feedback_votes WHERE feedback_id = ? AND user_id = ?").get(row.id, who.userId)),
      isMine: mine, canVote: row.status === "published" && !!who.userId && !mine,
      canWithdraw: mine && ["pending", "published"].includes(row.status), createdAt: row.created_at, updatedAt: row.updated_at,
      publishedAt: row.published_at, reply: row.reply, unread: mine && row.version > row.read_version, reward: null };
    if (detail) {
      result.body = row.body;
      result.images = db.prepare("SELECT id FROM feedback_images WHERE feedback_id = ? ORDER BY id").all(row.id).map(image => ({ id: image.id,
        url: prefix + `/feedback/${row.id}/images/${image.id}` + (!publicRow(row) && who.token ? "?t=" + encodeURIComponent(who.token) : "") }));
      result.events = db.prepare("SELECT status, reply, created_at FROM feedback_events WHERE feedback_id = ? ORDER BY id").all(row.id).map(event => ({ status: event.status, statusLabel: STATUS[event.status], reply: event.reply, createdAt: event.created_at }));
    }
    const reward = db.prepare("SELECT * FROM feedback_rewards WHERE feedback_id = ?").get(row.id);
    if (reward) {
      result.reward = { name: reward.name, status: reward.status, statusLabel: REWARD_STATUS[reward.status] };
      if (detail && (mine || who.admin)) for (const key of ["receiver", "phone", "address", "carrier", "tracking"]) result.reward[key] = reward[key];
    }
    return result;
  }
  const wrap = fn => (req, res) => {
    res.set("Cache-Control", "private, no-store");
    try { const work = fn(req, res); if (work && typeof work.catch === "function") work.catch(err => answerError(res, err)); }
    catch (err) { answerError(res, err); }
  };
  function answerError(res, err) { if (!res.headersSent) { if (!err.status) console.error("feedback request:", err); res.status(err.status || 500).json({ error: err.status ? err.message : "操作没有完成，请重试" }); } }
  function answer(req, res, id, admin = false) { const db = getDb(); const who = viewer(req); if (admin) who.admin = true; res.json(pack(db, find(db, id), who)); }
  function event(db, id, status, reply, now) { db.prepare("INSERT INTO feedback_events (feedback_id, status, reply, created_at) VALUES (?, ?, ?, ?)").run(id, status, reply, now); }
  function assertPending(db, id, userId) { const row = owned(db, id, userId); if (row.status !== "pending") fail("只有待审核建议可以调整截图", 409); return row; }

  app.get(prefix + "/me/feedback/summary", wrap((req, res) => {
    const user = logged(req);
    res.json(getDb().prepare("SELECT COUNT(*) AS total, COALESCE(SUM(version > read_version), 0) AS unread FROM feedback WHERE user_id = ?").get(user.id));
  }));
  app.get(prefix + "/feedback", wrap((req, res) => {
    const db = getDb(), who = viewer(req), mine = req.query.mine === "1";
    if (mine && !who.userId) fail("请先登录", 401);
    const category = String(req.query.category || "all"), sort = String(req.query.sort || "hot");
    if (category !== "all" && !CATEGORIES.has(category)) fail("请选择建议分类");
    if (!["hot", "new", "adopted"].includes(sort)) fail("请选择排序方式");
    const clauses = [mine ? "f.user_id = ?" : "f.published_at != '' AND f.status NOT IN ('pending', 'withdrawn')"], params = mine ? [who.userId] : [];
    if (category !== "all") { clauses.push("f.category = ?"); params.push(category); }
    if (sort === "adopted") clauses.push("f.status IN ('adopted', 'building', 'released')");
    const where = " WHERE " + clauses.join(" AND ");
    const total = db.prepare("SELECT COUNT(*) AS n FROM feedback f" + where).get(...params).n;
    const window = pageOf(req.query.page, total, 12);
    const order = sort === "hot" ? "(SELECT COUNT(*) FROM feedback_votes v WHERE v.feedback_id = f.id) DESC, f.id DESC" : "f.id DESC";
    const rows = db.prepare("SELECT f.*, u.nickname FROM feedback f JOIN users u ON u.id = f.user_id" + where + " ORDER BY " + order + " LIMIT 12 OFFSET ?").all(...params, window.offset);
    const summary = db.prepare("SELECT COUNT(*) AS published, COALESCE(SUM(status IN ('adopted', 'building', 'released')), 0) AS adopted FROM feedback WHERE published_at != '' AND status NOT IN ('pending', 'withdrawn')").get();
    const unread = who.userId ? db.prepare("SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND version > read_version").get(who.userId).n : 0;
    res.json({ items: rows.map(row => pack(db, row, who, false)), total, page: window.page, pages: window.pages, summary, unread });
  }));
  app.get(prefix + "/feedback/:id", wrap((req, res) => { const db = getDb(), who = viewer(req), row = find(db, req.params.id); readable(row, who); res.json(pack(db, row, who)); }));
  app.post(prefix + "/feedback", wrap((req, res) => {
    const user = logged(req), input = req.body || {}, title = text(input.title, 4, 80, "标题"), body = text(input.body, 10, 3000, "建议详情");
    if (!CATEGORIES.has(input.category) || !MODULES.has(input.module || "other")) fail("请选择建议分类和相关模块");
    const db = getDb(), now = new Date().toISOString(), today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), start = new Date(today + "T00:00:00+08:00").toISOString();
    const id = db.transaction(() => {
      if (db.prepare("SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND created_at >= ?").get(user.id, start).n >= 10) fail("今天已提交 10 条建议，明天再来", 429);
      if (db.prepare("SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND status = 'pending'").get(user.id).n >= 20) fail("你还有 20 条建议待审核，请稍后再提交", 429);
      const added = db.prepare("INSERT INTO feedback (user_id, title, body, category, module, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(user.id, title, body, input.category, input.module || "other", now, now);
      event(db, added.lastInsertRowid, "pending", "", now); return Number(added.lastInsertRowid);
    }).immediate();
    answer(req, res, id);
  }));
  app.put(prefix + "/feedback/:id/vote", wrap((req, res) => {
    const user = logged(req); if (typeof req.body?.voted !== "boolean") fail("请明确选择投票或取消");
    const db = getDb(); db.transaction(() => {
      const row = find(db, req.params.id); readable(row, { userId: user.id });
      if (row.user_id === user.id) fail("不能为自己的建议投票");
      if (row.status !== "published") fail("这条建议已结束投票", 409);
      if (req.body.voted) db.prepare("INSERT OR IGNORE INTO feedback_votes (feedback_id, user_id, created_at) VALUES (?, ?, ?)").run(row.id, user.id, new Date().toISOString());
      else db.prepare("DELETE FROM feedback_votes WHERE feedback_id = ? AND user_id = ?").run(row.id, user.id);
    }).immediate(); answer(req, res, req.params.id);
  }));
  app.post(prefix + "/feedback/:id/read", wrap((req, res) => {
    const user = logged(req), db = getDb(), row = owned(db, req.params.id, user.id);
    const revision = req.body?.revision;
    if (!Number.isSafeInteger(revision) || revision <= 0 || revision > row.version) fail("请提供已阅读的有效建议版本");
    // An update can arrive between rendering detail and acknowledging it. Only
    // acknowledge the rendered revision, and never undo a newer acknowledgement.
    db.prepare("UPDATE feedback SET read_version = MAX(read_version, MIN(?, version)) WHERE id = ? AND user_id = ?").run(revision, row.id, user.id);
    res.json({ ok: true });
  }));
  app.post(prefix + "/feedback/:id/withdraw", wrap((req, res) => {
    const user = logged(req), db = getDb(); db.transaction(() => {
      const row = owned(db, req.params.id, user.id); if (!["pending", "published"].includes(row.status)) fail("当前进度不能撤回建议", 409);
      const now = new Date().toISOString(); db.prepare("UPDATE feedback SET status = 'withdrawn', updated_at = ?, version = version + 1, read_version = version + 1 WHERE id = ?").run(now, row.id);
      event(db, row.id, "withdrawn", "作者已撤回建议", now);
    }).immediate(); answer(req, res, req.params.id);
  }));
  app.post(prefix + "/feedback/:id/images", wrap(async (req, res) => {
    const user = logged(req), db = getDb(); assertPending(db, req.params.id, user.id);
    if (db.prepare("SELECT COUNT(*) AS n FROM feedback_images WHERE feedback_id = ?").get(req.params.id).n >= 3) fail("每条建议最多 3 张截图");
    if (!/^multipart\/form-data\s*;/i.test(req.get("content-type") || "")) fail("请使用图片文件上传");
    const buffer = oneUpload(await readUpload(req), req.get("content-type"));
    if (!buffer?.length) fail("请选择图片文件"); if (buffer.length > IMAGE_MAX) fail("单张图片不超过 5MB", 413);
    const kind = imageKind(buffer); if (!kind) fail("请选择 JPG、PNG 或 WebP 图片");
    const filename = `${user.id}-${crypto.randomBytes(20).toString("hex")}.${kind.ext}`;
    try {
      await fs.promises.mkdir(feedbackRoot(), { recursive: true });
      await fs.promises.writeFile(path.join(feedbackRoot(), filename), buffer, { flag: "wx" });
      db.transaction(() => {
        const active = logged(req); if (active.id !== user.id) fail("登录已失效，请重新登录", 401);
        assertPending(db, req.params.id, user.id);
        if (db.prepare("SELECT COUNT(*) AS n FROM feedback_images WHERE feedback_id = ?").get(req.params.id).n >= 3) fail("每条建议最多 3 张截图");
        db.prepare("INSERT INTO feedback_images (feedback_id, filename, mime, size, created_at) VALUES (?, ?, ?, ?, ?)").run(req.params.id, filename, kind.mime, buffer.length, new Date().toISOString());
        db.prepare("UPDATE feedback SET version = version + 1, read_version = version + 1 WHERE id = ?").run(req.params.id);
      }).immediate();
    } catch (err) { removeFeedbackFile(filename); throw err; }
    answer(req, res, req.params.id);
  }));
  app.delete(prefix + "/feedback/:id/images/:imageId", wrap((req, res) => {
    const user = logged(req), db = getDb(); let image;
    db.transaction(() => { assertPending(db, req.params.id, user.id); image = db.prepare("SELECT * FROM feedback_images WHERE id = ? AND feedback_id = ?").get(req.params.imageId, req.params.id); if (!image) fail("没有这张截图", 404); db.prepare("DELETE FROM feedback_images WHERE id = ?").run(image.id); db.prepare("UPDATE feedback SET version = version + 1, read_version = version + 1 WHERE id = ?").run(req.params.id); }).immediate();
    removeFeedbackFile(image.filename); answer(req, res, req.params.id);
  }));
  app.get(prefix + "/feedback/:id/images/:imageId", wrap((req, res) => {
    const db = getDb(), who = viewer(req, true), row = find(db, req.params.id); readable(row, who);
    const image = db.prepare("SELECT * FROM feedback_images WHERE feedback_id = ? AND id = ?").get(row.id, req.params.imageId);
    if (!image || path.basename(image.filename) !== image.filename) fail("没有这张截图", 404);
    res.set({ "Content-Type": image.mime, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    res.sendFile(path.join(feedbackRoot(), image.filename), err => { if (err && !res.headersSent) res.status(err.status || 500).end(); });
  }));
  app.put(prefix + "/feedback/:id/reward/claim", wrap((req, res) => {
    const user = logged(req), db = getDb(), input = req.body || {};
    if (input.consent !== true) fail("请同意仅用于奖励寄送的收件信息使用说明");
    const receiver = text(input.receiver, 2, 40, "收件人"), phone = text(input.phone, 11, 11, "手机号"), address = text(input.address, 8, 300, "收件地址");
    if (!/^1[3-9]\d{9}$/.test(phone)) fail("请填写中国大陆 11 位手机号");
    db.transaction(() => { const row = owned(db, req.params.id, user.id); const reward = db.prepare("SELECT status FROM feedback_rewards WHERE feedback_id = ?").get(row.id);
      if (!reward || !["unclaimed", "claimed"].includes(reward.status)) fail("当前奖励不能登记或修改地址", 409);
      const now = new Date().toISOString(); db.prepare("UPDATE feedback_rewards SET status = 'claimed', receiver = ?, phone = ?, address = ?, consent_at = ?, updated_at = ? WHERE feedback_id = ?").run(receiver, phone, address, now, now, row.id);
      db.prepare("UPDATE feedback SET version = version + 1, read_version = version + 1 WHERE id = ?").run(row.id);
    }).immediate(); answer(req, res, req.params.id);
  }));
  app.post(prefix + "/feedback/:id/reward/received", wrap((req, res) => {
    const user = logged(req), db = getDb(); db.transaction(() => { const row = owned(db, req.params.id, user.id);
      const reward = db.prepare("SELECT status FROM feedback_rewards WHERE feedback_id = ?").get(row.id); if (reward?.status !== "shipped") fail("当前奖励还不能确认收货", 409);
      db.prepare("UPDATE feedback_rewards SET status = 'received', updated_at = ? WHERE feedback_id = ?").run(new Date().toISOString(), row.id);
    }).immediate(); answer(req, res, req.params.id);
  }));

  app.get(prefix + "/admin/feedback", wrap((req, res) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb(), status = String(req.query.status || "all"), q = String(req.query.q || "").trim();
    if (!["all", "rewards"].includes(status) && !Object.hasOwn(STATUS, status)) fail("请选择建议状态"); if (q.length > 100) fail("搜索内容过长");
    const clauses = [], params = [];
    if (status === "rewards") clauses.push("EXISTS (SELECT 1 FROM feedback_rewards fr WHERE fr.feedback_id = f.id AND fr.status = 'claimed')");
    else if (status !== "all") { clauses.push("f.status = ?"); params.push(status); }
    if (q) { clauses.push("(f.title LIKE ? ESCAPE '\\' OR f.body LIKE ? ESCAPE '\\' OR u.nickname LIKE ? ESCAPE '\\')"); const like = "%" + q.replace(/[\\%_]/g, "\\$&") + "%"; params.push(like, like, like); }
    const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "", from = " FROM feedback f JOIN users u ON u.id = f.user_id";
    const total = db.prepare("SELECT COUNT(*) AS n" + from + where).get(...params).n, window = pageOf(req.query.page, total, 20);
    const rows = db.prepare("SELECT f.*, u.nickname" + from + where + " ORDER BY f.id DESC LIMIT 20 OFFSET ?").all(...params, window.offset);
    const counts = Object.fromEntries(Object.keys(STATUS).map(status => [status, 0]));
    for (const row of db.prepare("SELECT status, COUNT(*) AS n FROM feedback GROUP BY status").all()) counts[row.status] = row.n;
    res.json({ items: rows.map(row => pack(db, row, viewer(req), false)), total, page: window.page, pages: window.pages, counts, rewardsPending: db.prepare("SELECT COUNT(*) AS n FROM feedback_rewards WHERE status = 'claimed'").get().n });
  }));
  app.get(prefix + "/admin/feedback/:id", wrap((req, res) => { if (!requireAdmin(req, res)) return; answer(req, res, req.params.id, true); }));
  app.patch(prefix + "/admin/feedback/:id", wrap((req, res) => {
    if (!requireAdmin(req, res)) return;
    const db = getDb(), input = req.body || {};
    db.transaction(() => {
      const row = find(db, req.params.id), status = input.status || row.status;
      if (input.expectedVersion !== undefined && (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== row.version)) fail("建议已更新，请重新打开后审核", 409);
      if (!Object.hasOwn(STATUS, status) || (status !== row.status && !NEXT[row.status].includes(status))) fail("当前状态不能跳转到这个进度", 409);
      const reply = typeof input.reply === "string" && !input.reply.trim() ? "" : input.reply === undefined ? row.reply : text(input.reply, 2, 2000, "公开答复");
      if (status !== row.status && status !== "published" && (typeof input.reply !== "string" || !input.reply.trim())) fail("请填写公开答复，说明处理结果");
      if (status !== row.status && status !== "published" && !reply) fail("请填写公开答复，说明处理结果");
      if (status === row.status && !reply) fail("请填写公开答复");
      const reward = db.prepare("SELECT name FROM feedback_rewards WHERE feedback_id = ?").get(row.id);
      if (reward && input.rewardName !== undefined && input.rewardName !== reward.name) fail("已承诺的奖品不能更改", 409);
      const now = new Date().toISOString();
      if (status === "adopted" && row.status === "published") { const name = text(input.rewardName, 2, 80, "采纳奖励"); db.prepare("INSERT INTO feedback_rewards (feedback_id, name, updated_at) VALUES (?, ?, ?)").run(row.id, name, now); }
      if (status === row.status && reply === row.reply) return;
      db.prepare("UPDATE feedback SET status = ?, reply = ?, published_at = ?, updated_at = ?, version = version + 1 WHERE id = ?").run(status, reply, row.published_at || (status === "published" ? now : ""), now, row.id);
      event(db, row.id, status, reply, now);
    }).immediate(); answer(req, res, req.params.id, true);
  }));
  app.post(prefix + "/admin/feedback/:id/reward/ship", wrap((req, res) => {
    if (!requireAdmin(req, res)) return;
    const input = req.body || {}, carrier = text(input.carrier, 2, 40, "承运商"), tracking = text(input.tracking, 4, 80, "物流单号");
    if (!/^[A-Za-z0-9-]+$/.test(tracking)) fail("物流单号仅支持字母、数字或连字符");
    const db = getDb(); db.transaction(() => {
      const row = find(db, req.params.id), reward = db.prepare("SELECT status FROM feedback_rewards WHERE feedback_id = ?").get(row.id);
      if (input.expectedVersion !== undefined && (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== row.version)) fail("收件信息或建议已更新，请重新打开后确认发货", 409);
      if (reward?.status !== "claimed") fail("请等待本人登记地址，已寄出的奖励不能重复发货", 409);
      const now = new Date().toISOString(); db.prepare("UPDATE feedback_rewards SET status = 'shipped', carrier = ?, tracking = ?, updated_at = ? WHERE feedback_id = ?").run(carrier, tracking, now, row.id);
      db.prepare("UPDATE feedback SET version = version + 1, updated_at = ? WHERE id = ?").run(now, row.id);
    }).immediate(); answer(req, res, req.params.id, true);
  }));
}

module.exports = { mountFeedback, feedbackRoot, removeFeedbackFile, deleteFeedbackUser };
