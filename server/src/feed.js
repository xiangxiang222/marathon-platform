const { memberRole } = require("./roles");

const NOTE = "只有本团能看。点赞和评论不加积分。";

function chars(value) {
  return [...String(value || "")].length;
}

function when(iso) {
  const shifted = new Date(Date.parse(iso) + 8 * 3600 * 1000);
  if (Number.isNaN(shifted.getTime())) return "";
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hour = String(shifted.getUTCHours()).padStart(2, "0");
  const minute = String(shifted.getUTCMinutes()).padStart(2, "0");
  return month + "-" + day + " " + hour + ":" + minute;
}

function postsOf(db, clubId, userId, staff) {
  const posts = db
    .prepare(
      `SELECT p.id, p.user_id, p.body, p.created_at, u.nickname
       FROM club_posts p
       JOIN users u ON u.id = p.user_id
       WHERE p.club_id = ?
       ORDER BY p.id DESC
       LIMIT 30`
    )
    .all(clubId);
  if (!posts.length) return [];
  const ids = posts.map((row) => row.id);
  const marks = ids.map(() => "?").join(",");
  const comments = db
    .prepare(
      `SELECT c.id, c.post_id, c.user_id, c.body, c.created_at, u.nickname
       FROM club_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.post_id IN (${marks})
       ORDER BY c.id`
    )
    .all(...ids);
  const likes = db.prepare(`SELECT post_id, user_id FROM club_likes WHERE post_id IN (${marks})`).all(...ids);
  return posts.map((row) => {
    const mine = row.user_id === userId;
    const liked = likes.some((like) => like.post_id === row.id && like.user_id === userId);
    return {
      id: row.id,
      nickname: row.nickname,
      body: row.body,
      at: when(row.created_at),
      likes: likes.filter((like) => like.post_id === row.id).length,
      liked,
      canDelete: mine || staff,
      comments: comments
        .filter((comment) => comment.post_id === row.id)
        .map((comment) => ({
          id: comment.id,
          nickname: comment.nickname,
          body: comment.body,
          at: when(comment.created_at),
          canDelete: comment.user_id === userId || staff
        }))
    };
  });
}

function mountFeed(app, { BASE, getDb, userFrom }) {
  function gate(req, res) {
    const user = userFrom(req);
    if (!user) {
      res.status(401).json({ error: "请先登录" });
      return null;
    }
    const db = getDb();
    const clubId = Number(req.params.id);
    const club = Number.isInteger(clubId) ? db.prepare("SELECT id, owner_id FROM clubs WHERE id = ?").get(clubId) : null;
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
    return { user, club, db, staff: role === "owner" || role === "manager" };
  }

  app.get(BASE + "/api/clubs/:id/posts", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    res.json({ note: NOTE, posts: postsOf(ctx.db, ctx.club.id, ctx.user.id, ctx.staff) });
  });

  app.post(BASE + "/api/clubs/:id/posts", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const body = String((req.body && req.body.body) || "").trim();
    const length = chars(body);
    if (length < 1 || length > 200) return res.status(400).json({ error: "写 1 到 200 个字" });
    const now = new Date().toISOString();
    const created = ctx.db.prepare("INSERT INTO club_posts (club_id, user_id, body, created_at) VALUES (?, ?, ?, ?)").run(ctx.club.id, ctx.user.id, body, now);
    res.json({ id: Number(created.lastInsertRowid), posts: postsOf(ctx.db, ctx.club.id, ctx.user.id, ctx.staff) });
  });

  app.delete(BASE + "/api/clubs/:id/posts/:pid", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const post = ctx.db.prepare("SELECT id, user_id FROM club_posts WHERE id = ? AND club_id = ?").get(req.params.pid, ctx.club.id);
    if (!post) return res.status(404).json({ error: "没有这条动态" });
    if (post.user_id !== ctx.user.id && !ctx.staff) return res.status(403).json({ error: "只能删自己的" });
    ctx.db.transaction(() => {
      ctx.db.prepare("DELETE FROM club_likes WHERE post_id = ?").run(post.id);
      ctx.db.prepare("DELETE FROM club_comments WHERE post_id = ?").run(post.id);
      ctx.db.prepare("DELETE FROM club_posts WHERE id = ?").run(post.id);
    })();
    res.json({ ok: true, posts: postsOf(ctx.db, ctx.club.id, ctx.user.id, ctx.staff) });
  });

  app.post(BASE + "/api/clubs/:id/posts/:pid/comments", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const post = ctx.db.prepare("SELECT id FROM club_posts WHERE id = ? AND club_id = ?").get(req.params.pid, ctx.club.id);
    if (!post) return res.status(404).json({ error: "没有这条动态" });
    const body = String((req.body && req.body.body) || "").trim();
    const length = chars(body);
    if (length < 1 || length > 80) return res.status(400).json({ error: "评论写 1 到 80 个字" });
    const now = new Date().toISOString();
    ctx.db.prepare("INSERT INTO club_comments (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?)").run(post.id, ctx.user.id, body, now);
    res.json({ posts: postsOf(ctx.db, ctx.club.id, ctx.user.id, ctx.staff) });
  });

  app.delete(BASE + "/api/clubs/:id/posts/:pid/comments/:cid", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const comment = ctx.db
      .prepare(
        `SELECT c.id, c.user_id FROM club_comments c
         JOIN club_posts p ON p.id = c.post_id
         WHERE c.id = ? AND p.id = ? AND p.club_id = ?`
      )
      .get(req.params.cid, req.params.pid, ctx.club.id);
    if (!comment) return res.status(404).json({ error: "没有这条评论" });
    if (comment.user_id !== ctx.user.id && !ctx.staff) return res.status(403).json({ error: "只能删自己的" });
    ctx.db.prepare("DELETE FROM club_comments WHERE id = ?").run(comment.id);
    res.json({ ok: true, posts: postsOf(ctx.db, ctx.club.id, ctx.user.id, ctx.staff) });
  });

  app.post(BASE + "/api/clubs/:id/posts/:pid/like", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const post = ctx.db.prepare("SELECT id FROM club_posts WHERE id = ? AND club_id = ?").get(req.params.pid, ctx.club.id);
    if (!post) return res.status(404).json({ error: "没有这条动态" });
    const existing = ctx.db.prepare("SELECT 1 FROM club_likes WHERE post_id = ? AND user_id = ?").get(post.id, ctx.user.id);
    if (existing) return res.status(400).json({ error: "已经赞过" });
    ctx.db.prepare("INSERT INTO club_likes (post_id, user_id, created_at) VALUES (?, ?, ?)").run(post.id, ctx.user.id, new Date().toISOString());
    res.json({ posts: postsOf(ctx.db, ctx.club.id, ctx.user.id, ctx.staff) });
  });

  app.delete(BASE + "/api/clubs/:id/posts/:pid/like", (req, res) => {
    const ctx = gate(req, res);
    if (!ctx) return;
    const post = ctx.db.prepare("SELECT id FROM club_posts WHERE id = ? AND club_id = ?").get(req.params.pid, ctx.club.id);
    if (!post) return res.status(404).json({ error: "没有这条动态" });
    const existing = ctx.db.prepare("SELECT 1 FROM club_likes WHERE post_id = ? AND user_id = ?").get(post.id, ctx.user.id);
    if (!existing) return res.status(400).json({ error: "还没有赞" });
    ctx.db.prepare("DELETE FROM club_likes WHERE post_id = ? AND user_id = ?").run(post.id, ctx.user.id);
    res.json({ posts: postsOf(ctx.db, ctx.club.id, ctx.user.id, ctx.staff) });
  });
}

module.exports = { mountFeed };
