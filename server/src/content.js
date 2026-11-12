const fs = require('fs');
const path = require('path');
const { memberRole } = require('./roles');
const { slicePage } = require('./page');
const { likeParams } = require('./search-like');
const { toPacerPeople } = require('./pacer-people');
const { installProfiles, mountProfiles, publicDataset, publicOne } = require('./content-profiles');

function installContent(db) {
  installProfiles(db);
  db.exec(`CREATE TABLE IF NOT EXISTS content_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, club_id INTEGER,
    status TEXT NOT NULL DEFAULT 'draft', source TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '',
    rights TEXT NOT NULL DEFAULT 'original', published_at TEXT NOT NULL DEFAULT '', featured INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS content_publication ON content_articles(status,published_at,id);
  CREATE INDEX IF NOT EXISTS content_club ON content_articles(club_id,status,published_at);`);
  if (!db.prepare('PRAGMA table_info(content_articles)').all().some(column => column.name === 'cover_url')) db.exec("ALTER TABLE content_articles ADD COLUMN cover_url TEXT NOT NULL DEFAULT ''");
  if (!db.prepare('PRAGMA table_info(content_articles)').all().some(column => column.name === 'source_refs')) db.exec("ALTER TABLE content_articles ADD COLUMN source_refs TEXT NOT NULL DEFAULT '[]'");
}

function sourceRefs(row) { try { const refs=JSON.parse(row.source_refs || '[]');return Array.isArray(refs)?refs:[]; } catch { return []; } }

function present(row, full = true) {
  return { id: row.id, title: row.title, summary: row.summary, ...(full ? { body: row.body } : {}),
    category: row.category, clubId: row.club_id, clubName: row.club_name || '', status: row.status,
    source: row.source, sourceUrl: row.source_url, sourceRefs:sourceRefs(row), coverUrl: row.cover_url || '', rights: row.rights, publishedAt: row.published_at,
    featured: !!row.featured, createdAt: row.created_at, updatedAt: row.updated_at };
}
function validUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}
function parseArticle(body, current, clubId) {
  const item = { title: '', summary: '', body: '', category: clubId ? 'club' : 'industry', clubId: clubId || null,
    status: 'draft', source: '', sourceUrl: '', sourceRefs:[], coverUrl: '', rights: 'original', publishedAt: '', featured: false, ...(current || {}), ...(body || {}) };
  const fields = { title: 120, summary: 400, body: 20000, source: 80, sourceUrl: 2000, coverUrl: 2000 };
  for (const [key, limit] of Object.entries(fields)) {
    item[key] = String(item[key] == null ? '' : item[key]).trim();
    if (item[key].length > limit) return { error: `${key === 'body' ? '正文' : key === 'title' ? '标题' : key === 'summary' ? '摘要' : key === 'source' ? '来源' : '来源链接'}不超过 ${limit} 个字` };
  }
  if (!item.title) return { error: '请填写标题' };
  if (!['industry', 'club', 'stories'].includes(item.category)) return { error: '请选择资讯分类' };
  if (!['draft', 'published', 'archived'].includes(item.status)) return { error: '请选择草稿、已发布或已下架' };
  if (!['original', 'authorized', 'link', 'digest'].includes(item.rights)) return { error: '请选择原创、事实整理、授权转载或原文链接' };
  if (item.clubId === '' || item.clubId === 0) item.clubId = null;
  if (item.clubId != null && (!Number.isSafeInteger(Number(item.clubId)) || Number(item.clubId) < 1)) return { error: '跑团编号不正确' };
  item.clubId = item.clubId == null ? null : Number(item.clubId);
  if (clubId && (item.clubId !== Number(clubId) || item.category !== 'club')) return { error: '只能发布本跑团的资讯' };
  if (item.category === 'club' && !item.clubId) return { error: '跑团资讯需填写所属跑团' };
  if (item.sourceUrl && !validUrl(item.sourceUrl)) return { error: '来源链接须为不含账号信息的 HTTPS 地址' };
  if (!Array.isArray(item.sourceRefs) || item.sourceRefs.length>10 || item.sourceRefs.some(s=>!s || typeof s.title!=='string' || s.title.length>160 || typeof s.url!=='string' || s.url.length>2000 || !validUrl(s.url))) return { error:'补充资料来源须提供标题与有效的 HTTPS 链接，最多10条' };
  item.sourceRefs=[...new Map(item.sourceRefs.map(s=>[s.url,{title:s.title.trim() || '公开资料',url:s.url}])).values()];
  if (item.coverUrl && !validUrl(item.coverUrl)) return { error: '封面图片须为不含账号信息的 HTTPS 地址' };
  if (item.rights !== 'original' && !item.sourceUrl) return { error: '转载或原文链接需填写来源链接' };
  if (item.rights === 'link' && item.body) return { error: '原文链接只展示摘要，请清空转载正文或改选已获授权' };
  if (item.status === 'published' && (!item.source || (item.rights === 'link' ? !item.summary : !item.body))) return { error: '发布前请补充来源与正文，原文链接请补充摘要' };
  if (item.publishedAt) {
    const text = String(item.publishedAt);
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text.slice(0,10) + 'T12:00:00Z').toISOString().slice(0,10) !== text.slice(0,10)) return { error: '发布时间格式不正确' };
    item.publishedAt = new Date(text.length === 10 ? text + 'T00:00:00+08:00' : text).toISOString();
  } else if (item.status === 'published') item.publishedAt = new Date().toISOString();
  item.featured = item.featured === true || item.featured === 1;
  // Global editorial placement is controlled by the platform administrator.
  if (clubId) item.featured = !!(current && current.featured);
  return { item };
}
const SELECT = 'SELECT a.*, c.name AS club_name FROM content_articles a LEFT JOIN clubs c ON c.id=a.club_id';
const PUBLIC = "a.status='published' AND a.published_at <= ? AND (a.club_id IS NULL OR (c.id IS NOT NULL AND c.public_status != 'restricted'))";

function readProfileData(type) {
  const filename = ['pacer','pacerRace'].includes(type) ? 'official-pacers.json' : type === 'privatePacer' ? 'pacer-profiles.json' : type === 'historicalAthlete' ? 'elite-athletes-history.json' : 'elite-athletes.json';
  try {
    const runtimeFile = path.join(process.env.CONTENT_DATA_DIR || path.join(__dirname, '../data/content'), filename);
    let raw = JSON.parse(fs.readFileSync(fs.existsSync(runtimeFile) ? runtimeFile : path.join(__dirname, '../../shared', filename), 'utf8'));
    if(type==='pacer')raw=toPacerPeople(raw);
    const list = Array.isArray(raw) ? raw : raw.profiles || raw.athletes || raw.pacers || [];
    const meta = Array.isArray(raw) ? {} : Object.fromEntries(Object.entries(raw).filter(([key]) => !['profiles', 'athletes', 'pacers'].includes(key)));
    return { meta, profiles: list.map((p) => ({ ...p, type: ['privatePacer','pacerRace'].includes(type) ? 'pacer' : type === 'historicalAthlete' ? 'athlete' : type,
      gender: ['female', 'women', '女', 'F'].includes(p.gender) ? 'women' : ['male', 'men', '男', 'M'].includes(p.gender) ? 'men' : p.gender || '',
      personalBest: p.personalBestDisplay || p.personalBest || p.pb || '', bio: p.bio || p.summary || '',
      pacingEvidence: p.pacingEvidence || p.pacingExperience || p.pacingExperiences || [],
      sources: (p.sources || []).map(s => typeof s === 'string' ? { title: '公开来源', url: s } : { ...s, title: s.title || s.name || '公开来源' })
    })) };
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return { meta: { rankingNotice: '人物资料尚未收录。' }, profiles: [] };
  }
}

function mountContent(app, { BASE, getDb, userFrom, requireAdmin }) {
  const root = BASE + '/api';
  mountProfiles(app,{root,getDb,requireAdmin,readBase:readProfileData});
  function fail(res, code, error) { return res.status(code).json({ error }); }
  function clubAccess(req, res) {
    const user = userFrom(req);
    if (!user) { fail(res, 401, '请先登录'); return null; }
    const club = getDb().prepare('SELECT id, owner_id, name, public_status FROM clubs WHERE id=?').get(req.params.clubId);
    if (!club) { fail(res, 404, '没有这个跑团'); return null; }
    if (!['owner', 'manager'].includes(memberRole(getDb(), club, user.id))) { fail(res, 403, '只有本跑团团长或管理员可以发布资讯'); return null; }
    return { club, actor: 'user:' + user.id };
  }
  function list(req, res, management, clubId) {
    const where = [], params = [];
    if (!management) { where.push(PUBLIC); params.push(new Date().toISOString()); }
    if (clubId != null) { where.push('a.club_id=?'); params.push(clubId); }
    else if (req.query.clubId) { where.push('a.club_id=?'); params.push(String(req.query.clubId)); }
    if (req.query.category) { where.push('a.category=?'); params.push(String(req.query.category)); }
    if (management && req.query.status) { where.push('a.status=?'); params.push(String(req.query.status)); }
    if (req.query.q) { const f = likeParams(String(req.query.q).slice(0,200), ['a.title', 'a.summary', 'a.source']); where.push('(' + f.sql + ')'); params.push(...f.params); }
    const rows = getDb().prepare(SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY a.featured DESC, a.published_at DESC, a.id DESC').all(...params);
    const page = slicePage(rows, { page: 1, pageSize: 20, ...req.query });
    res.json({ articles: page.rows.map(row => present(row, management)), total: page.total, page: page.page, pages: page.pages, pageSize: page.pageSize });
  }
  function one(req, res, management, clubId) {
    const row = getDb().prepare(SELECT + ' WHERE a.id=?' + (management ? '' : ' AND ' + PUBLIC)).get(req.params.id, ...(management ? [] : [new Date().toISOString()]));
    if (!row || (clubId != null && Number(row.club_id) !== Number(clubId))) return fail(res, 404, '没有这篇资讯');
    res.json({ article: present(row) });
  }
  function save(req, res, clubId, actor) {
    const db = getDb();
    const existing = req.params.id ? db.prepare(SELECT + ' WHERE a.id=?').get(req.params.id) : null;
    if (req.params.id && (!existing || (clubId && Number(existing.club_id) !== Number(clubId)))) return fail(res, 404, '没有这篇资讯');
    const parsed = parseArticle(req.body, existing ? present(existing) : null, clubId);
    if (parsed.error) return fail(res, 400, parsed.error);
    const v = parsed.item;
    if (v.clubId) {
      const club = db.prepare('SELECT public_status FROM clubs WHERE id=?').get(v.clubId);
      if (!club) return fail(res, 404, '没有这个跑团');
      if (v.status === 'published' && club.public_status === 'restricted') return fail(res, 403, '该跑团暂停公开展示，可保存草稿');
    }
    const stamp = new Date().toISOString();
    const values = [v.title,v.summary,v.body,v.category,v.clubId,v.status,v.source,v.sourceUrl,JSON.stringify(v.sourceRefs),v.coverUrl,v.rights,v.publishedAt,v.featured ? 1 : 0,stamp];
    let id = existing?.id;
    if (existing) db.prepare('UPDATE content_articles SET title=?,summary=?,body=?,category=?,club_id=?,status=?,source=?,source_url=?,source_refs=?,cover_url=?,rights=?,published_at=?,featured=?,updated_at=? WHERE id=?').run(...values,id);
    else id = Number(db.prepare('INSERT INTO content_articles(title,summary,body,category,club_id,status,source,source_url,source_refs,cover_url,rights,published_at,featured,updated_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...values,actor,stamp).lastInsertRowid);
    res.json({ article: present(db.prepare(SELECT + ' WHERE a.id=?').get(id)) });
  }
  function archive(req, res, clubId) {
    const row = getDb().prepare('SELECT id,club_id FROM content_articles WHERE id=?').get(req.params.id);
    if (!row || (clubId && Number(row.club_id) !== Number(clubId))) return fail(res, 404, '没有这篇资讯');
    getDb().prepare("UPDATE content_articles SET status='archived',updated_at=? WHERE id=?").run(new Date().toISOString(),row.id);
    res.json({ ok: true });
  }
  app.get(root + '/content/articles', (req,res) => list(req,res,false));
  app.get(root + '/content/articles/:id', (req,res) => one(req,res,false));
  app.get(root + '/content/sync-status', (req,res) => {
    const file = path.join(process.env.CONTENT_DATA_DIR || path.join(__dirname, '../data/content'), 'sync-status.json');
    try {
      const status = JSON.parse(fs.readFileSync(file, 'utf8'));
      const sections = Object.fromEntries(Object.entries(status.sections || {}).map(([name,value]) => [name,Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'message'))]));
      res.json({ asOf:status.asOf,startedAt:status.startedAt,finishedAt:status.finishedAt,ok:status.ok,sections });
    } catch(e) { if(e.code!=='ENOENT')throw e;res.json({ok:false,sections:{}}); }
  });
  const adminRoot = root + '/admin/content/articles';
  app.get(adminRoot, (req,res) => { if (requireAdmin(req,res)) list(req,res,true); });
  app.get(adminRoot + '/:id', (req,res) => { if (requireAdmin(req,res)) one(req,res,true); });
  app.post(adminRoot, (req,res) => { if (requireAdmin(req,res)) save(req,res,null,'admin:' + req.adminUser); });
  app.put(adminRoot + '/:id', (req,res) => { if (requireAdmin(req,res)) save(req,res,null,'admin:' + req.adminUser); });
  app.delete(adminRoot + '/:id', (req,res) => { if (requireAdmin(req,res)) archive(req,res); });
  const clubRoot = root + '/clubs/:clubId/content/articles';
  app.get(clubRoot, (req,res) => { const a = clubAccess(req,res); if (a) list(req,res,true,a.club.id); });
  app.get(clubRoot + '/:id', (req,res) => { const a = clubAccess(req,res); if (a) one(req,res,true,a.club.id); });
  app.post(clubRoot, (req,res) => { const a = clubAccess(req,res); if (a) save(req,res,a.club.id,a.actor); });
  app.put(clubRoot + '/:id', (req,res) => { const a = clubAccess(req,res); if (a) save(req,res,a.club.id,a.actor); });
  app.delete(clubRoot + '/:id', (req,res) => { const a = clubAccess(req,res); if (a) archive(req,res,a.club.id); });
  app.get(root + '/content/profiles', (req,res) => {
    const types = ['athlete','pacer'].includes(req.query.type) ? [req.query.type] : ['athlete','pacer'];
    const datasets = types.map(type=>publicDataset(getDb(),type,readProfileData(type))), meta = types.length === 1 ? datasets[0].meta : { athletes: datasets[0].meta, pacers: datasets[1].meta };
    const q = String(req.query.q || '').trim().toLowerCase();
    const raceId=String(req.query.raceId||'').trim();
    const allProfiles=datasets.flatMap(d=>d.profiles);
    if(types.length===1&&types[0]==='pacer'){
      const races=new Map();
      for(const p of allProfiles)for(const a of p.assignments||[]){
        const id=String(a.raceId||'');if(!id)continue;
        if(!races.has(id))races.set(id,{id,name:a.raceName,edition:a.edition,date:a.raceDate,people:new Set()});
        races.get(id).people.add(p.id);
      }
      meta.raceFilters=[...races.values()].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||a.name.localeCompare(b.name,'zh')).map(({people,date,...race})=>({...race,count:people.size}));
      meta.selectedRaceId=raceId;
    }
    const rows = allProfiles.filter(p => (!req.query.gender || p.gender === req.query.gender) && (!raceId || p.type==='pacer'&&(p.assignments||[]).some(a=>String(a.raceId)===raceId||a.raceProfileId===raceId)) && (!q || [p.name,p.nameEn,p.bio,p.article?.body,...(p.targetTimes||[]),...(p.assignments||[]).flatMap(a=>[a.raceName,a.targetTime,a.city]), ...(p.pacerGroups || []).flatMap(g => [g.label,g.targetTime,...(g.names || [])])].join(' ').toLowerCase().includes(q)));
    const page = slicePage(rows, { page:1,pageSize:20,...req.query });
    res.json({ profiles:page.rows,total:page.total,page:page.page,pages:page.pages,pageSize:page.pageSize,meta });
  });
  app.get(root + '/content/profiles/:id', (req,res) => {
    const editorial=publicOne(getDb(),req.params.id,readProfileData);
    if(editorial===null)return fail(res,404,'没有这份人物档案');
    if(editorial)return res.json(editorial);
    for (const type of ['athlete','pacer','pacerRace','privatePacer','historicalAthlete']) {
      const data = publicDataset(getDb(),type,readProfileData(type)), profile = data.profiles.find(p => p.id === req.params.id);
      if (profile) return res.json({ profile,meta:data.meta });
    }
    fail(res,404,'没有这份人物档案');
  });
}
module.exports = { installContent, mountContent, parseArticle, readProfileData };
