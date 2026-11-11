const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseArticle } = require('../server/src/content');

// Explicit import only. A stable marker preserves edits and withdrawals on rerun.
function importStarters(db, articles) {
  const prepared = articles.map(raw => {
    const parsed = parseArticle({ ...raw, status: 'published' }, null, null);
    if (parsed.error) throw new Error(parsed.error + ': ' + raw.title);
    return { item: parsed.item, marker: 'starter:' + crypto.createHash('sha256').update(raw.sourceUrl + '\n' + raw.title).digest('hex') };
  });
  return db.transaction(() => {
    const result = { inserted: 0, skipped: 0 };
    for (const { item: v, marker } of prepared) {
      if (db.prepare('SELECT id FROM content_articles WHERE created_by=?').get(marker)) { result.skipped++; continue; }
      const stamp = new Date().toISOString();
      db.prepare('INSERT INTO content_articles(title,summary,body,category,club_id,status,source,source_url,rights,published_at,featured,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(v.title,v.summary,v.body,v.category,null,v.status,v.source,v.sourceUrl,v.rights,v.publishedAt,v.featured ? 1 : 0,marker,stamp,stamp);
      result.inserted++;
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
