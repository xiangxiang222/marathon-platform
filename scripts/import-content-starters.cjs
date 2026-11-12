const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseArticle } = require('../server/src/content');

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const markerFor = (url,title) => 'starter:' + digest(url + '\n' + title);
const fingerprint = row => digest(JSON.stringify(['title','summary','body','category','club_id','status','source','source_url','cover_url','source_refs','rights','published_at','featured'].map(key=>key==='source_refs'?(row[key] || '[]'):(row[key] ?? null))));
function installImportState(db) {
  db.exec('CREATE TABLE IF NOT EXISTS content_import_state (article_id INTEGER PRIMARY KEY, applied_hash TEXT NOT NULL, updated_at TEXT NOT NULL)');
}
function canUpgradeGenerated(db, row) {
  if (!row || row.status !== 'published' || !String(row.created_by || '').startsWith('starter:') || row.club_id != null) return false;
  const state = db.prepare('SELECT applied_hash FROM content_import_state WHERE article_id=?').get(row.id);
  if (state) return state.applied_hash === fingerprint(row);
  // Legacy imports did not record a fingerprint. Only their unchanged link-only
  // rows are eligible for the first upgrade; existing authored bodies are kept.
  return row.rights === 'link' && !row.body && row.created_at === row.updated_at && row.created_by === markerFor(row.source_url,row.title);
}
function rememberImport(db, id, stamp) {
  const row=db.prepare('SELECT * FROM content_articles WHERE id=?').get(id);
  db.prepare('INSERT INTO content_import_state(article_id,applied_hash,updated_at) VALUES(?,?,?) ON CONFLICT(article_id) DO UPDATE SET applied_hash=excluded.applied_hash,updated_at=excluded.updated_at').run(id,fingerprint(row),stamp);
}
// Explicit import only. Automatic upgrades require their own option and a
// matching fingerprint, preserving operator edits and withdrawals on rerun.
function importStarters(db, articles, options = {}) {
  installImportState(db);
  const prepared = articles.map(raw => {
    const parsed = parseArticle({ ...raw, status: 'published' }, null, null);
    if (parsed.error) throw new Error(parsed.error + ': ' + raw.title);
    return { item: parsed.item, marker: markerFor(raw.sourceUrl,raw.title) };
  });
  return db.transaction(() => {
    const result = { inserted: 0, skipped: 0, ...(options.upgradeGenerated ? {upgraded:0,archived:0,protected:0} : {}) };
    for (const { item: v, marker } of prepared) {
      const old=db.prepare('SELECT * FROM content_articles WHERE created_by=? OR source_url=?').get(marker, v.sourceUrl);
      if (old) {
        if (options.upgradeGenerated && canUpgradeGenerated(db,old)) {
          const changed = ['title','summary','body','category','status','source','rights'].some(key=>old[key] !== v[key]) || old.cover_url !== v.coverUrl || (old.source_refs || '[]') !== JSON.stringify(v.sourceRefs || []) || old.published_at !== v.publishedAt || old.featured !== (v.featured?1:0);
          if (changed) {
            const stamp=new Date().toISOString();
            db.prepare('UPDATE content_articles SET title=?,summary=?,body=?,category=?,status=?,source=?,source_url=?,cover_url=?,source_refs=?,rights=?,published_at=?,featured=?,updated_at=? WHERE id=?').run(v.title,v.summary,v.body,v.category,v.status,v.source,v.sourceUrl,v.coverUrl,JSON.stringify(v.sourceRefs || []),v.rights,v.publishedAt,v.featured?1:0,stamp,old.id);
            rememberImport(db,old.id,stamp);result.upgraded++;continue;
          }
          rememberImport(db,old.id,new Date().toISOString());
        } else if(options.upgradeGenerated) result.protected++;
        result.skipped++;continue;
      }
      const stamp = new Date().toISOString();
      const insert=db.prepare('INSERT INTO content_articles(title,summary,body,category,club_id,status,source,source_url,cover_url,source_refs,rights,published_at,featured,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(v.title,v.summary,v.body,v.category,null,v.status,v.source,v.sourceUrl,v.coverUrl,JSON.stringify(v.sourceRefs || []),v.rights,v.publishedAt,v.featured ? 1 : 0,marker,stamp,stamp);
      rememberImport(db,Number(insert.lastInsertRowid),stamp);
      result.inserted++;
    }
    if(options.upgradeGenerated)for(const item of options.exclude || []) {
      const rows=db.prepare('SELECT * FROM content_articles WHERE source_url=?').all(item.sourceUrl);
      for(const row of rows) {
        if(row.status!=='published')continue;
        if(!canUpgradeGenerated(db,row)){result.protected++;continue;}
        const stamp=new Date().toISOString();db.prepare("UPDATE content_articles SET status='archived',updated_at=? WHERE id=?").run(stamp,row.id);rememberImport(db,row.id,stamp);result.archived++;
      }
    }
    return result;
  }).immediate();
}
if (require.main === module) {
  const file = path.join(__dirname, '../shared/content-starter-articles.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const filePath = process.env.MARATHON_DB || path.join(__dirname, '../server/data/app.sqlite');
  if (!fs.existsSync(filePath)) throw new Error('数据库尚未初始化，请先启动服务，再导入资讯。');
  const Database = require(require.resolve('better-sqlite3', { paths: [path.join(__dirname, '../server')] }));
  const db = new Database(filePath);
  try {
    require('../server/src/content').installContent(db);
    console.log(JSON.stringify(importStarters(db, Array.isArray(raw) ? raw : raw.articles), null, 2));
  } finally { db.close(); }
}
module.exports = { importStarters };
