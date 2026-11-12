const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const Database=require('../server/node_modules/better-sqlite3');
const {importRecentRaceNews,isMock}=require('./import-recent-race-news.cjs');
const now='2026-11-12T06:00:00Z';
const paragraphs='11月8日，城市马拉松按既定时间鸣枪，参赛者沿城市道路完成比赛。全程与半程项目分别设置成绩记录，赛后将按竞赛规程核对名次及成绩。赛事信息以当届比赛日期、项目和城市为基础整理，避免与同城其他赛事混淆。';
const article=extra=>({key:'verified-fixture-source',title:'城市马拉松赛况整理',body:'## 比赛进程\n\n'+paragraphs.repeat(4),source:'跑圈编辑部',sourceUrl:'https://sports.example.org/2026/11/10/marathon.shtml',publishedAt:'2026-11-10',race:{name:'2026城市马拉松',edition:2026,raceDate:'2026-11-08',city:'杭州',officialId:'100123'},sourceRefs:[{title:'赛事事实核对',url:'https://sports.example.org/2026/11/10/marathon.shtml'}],...extra});
const fingerprint=db=>crypto.createHash('sha256').update(db.serialize()).digest('hex');
function setup(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'recent-race-news-test-')),db=new Database(':memory:');
  db.exec(`CREATE TABLE races(id TEXT PRIMARY KEY,name TEXT,city TEXT,race_date TEXT);
  CREATE TABLE official_races(official_id TEXT PRIMARY KEY,race_id TEXT);
  CREATE TABLE news(id INTEGER PRIMARY KEY AUTOINCREMENT,race_id TEXT,title TEXT,summary TEXT DEFAULT '',body TEXT,source TEXT,url TEXT DEFAULT '',article_key TEXT DEFAULT '',published_at TEXT,created_at TEXT,updated_at TEXT);
  CREATE UNIQUE INDEX news_key ON news(race_id,article_key) WHERE article_key!='';
  CREATE TABLE news_submissions(id INTEGER PRIMARY KEY AUTOINCREMENT,race_id TEXT,title TEXT,summary TEXT DEFAULT '',body TEXT,source TEXT,url TEXT DEFAULT '',article_key TEXT DEFAULT '',published_at TEXT,status TEXT DEFAULT 'pending',note TEXT DEFAULT '',news_id INTEGER DEFAULT 0,created_at TEXT,updated_at TEXT);
  CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT);
  CREATE TABLE runs(id INTEGER PRIMARY KEY,user_id INTEGER,distance_km REAL);`);
  db.prepare('INSERT INTO races VALUES(?,?,?,?)').run('caa-100123','2026城市马拉松','杭州','2026-11-08');
  db.prepare('INSERT INTO races VALUES(?,?,?,?)').run('mock-race','【模拟】公园跑','杭州','2026-11-10');
  db.prepare('INSERT INTO official_races VALUES(?,?)').run('100123','caa-100123');
  db.exec("INSERT INTO users VALUES(1,'用户真实昵称');INSERT INTO runs VALUES(1,1,10.5)");
  const insert=db.prepare('INSERT INTO news(race_id,title,body,source,article_key,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
  insert.run('caa-100123','真实赛事技术测试说明','这是一条真实资讯，包含设备测试、体验和模拟演练等普通词汇，不能仅因正文出现测试就删除。','赛事组委会','authored-real','2026-11-09','before','before');
  for(let i=1;i<=8;i++)insert.run('mock-race','【模拟】场景资讯'+i,'仅供模拟场景演示，不是真实赛事、报名、奖励或合作承诺。','【模拟】场景编辑组','scenario-news-'+i,'2026-11-10','before','before');
  db.prepare('INSERT INTO news_submissions(race_id,title,body,source,article_key,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('mock-race','【模拟】待审核新闻','模拟新闻','【模拟】编辑组','scenario-news-pending','2026-11-10','before','before');
  const backup=()=>path.join(directory,'backup-'+crypto.randomUUID()+'.json');
  const options=()=>({now,dryRun:false,backupFile:backup()});
  return {db,directory,options,close(){db.close();fs.rmSync(directory,{recursive:true,force:true});}};
}
test('dry-run is entirely read-only and identifies only explicitly labelled news fixtures',()=>{
  const f=setup();try{const before=fingerprint(f.db),r=importRecentRaceNews(f.db,[article()],{now});assert.equal(fingerprint(f.db),before);assert.equal(r.deletedMockNews,8);assert.equal(r.deletedMockSubmissions,1);assert.equal(r.inserted,1);assert.equal(r.pending.length,0);assert.equal(f.db.prepare("SELECT name FROM sqlite_master WHERE name='recent_race_news_import_state'").get(),undefined);assert.equal(isMock({title:'官方技术测试安排',body:'举办体验活动并模拟紧急情况',source:'测试实验室'}),false);}finally{f.close();}
});
test('apply backs up exact fixture rows, publishes full rewritten text and preserves races, real news and accounts',()=>{
  const f=setup();try{const raceRows=f.db.prepare('SELECT * FROM races').all(),real=f.db.prepare("SELECT * FROM news WHERE article_key='authored-real'").get(),run=f.db.prepare('SELECT * FROM runs').get();const opts=f.options(),r=importRecentRaceNews(f.db,[article()],opts);assert.equal(r.inserted,1);assert.equal(r.deletedMockNews,8);assert.equal(r.deletedMockSubmissions,1);const backup=JSON.parse(fs.readFileSync(opts.backupFile));assert.equal(backup.news.length,8);assert.equal(backup.newsSubmissions.length,1);assert.ok(backup.news.every(row=>row.body&&row.created_at));assert.deepEqual(f.db.prepare('SELECT * FROM races').all(),raceRows);assert.deepEqual(f.db.prepare("SELECT * FROM news WHERE article_key='authored-real'").get(),real);assert.deepEqual(f.db.prepare('SELECT * FROM runs').get(),run);const row=f.db.prepare('SELECT * FROM news WHERE id=?').get(r.publishedIds[0]);assert.equal(row.race_id,'caa-100123');assert.equal(row.body,article().body);assert.equal(row.url,article().sourceUrl);assert.ok(row.summary.length>20);assert.match(row.article_key,/^race-news-[a-f0-9]{20}$/);assert.equal(f.db.prepare('SELECT source_refs FROM recent_race_news_import_state').get().source_refs,JSON.stringify(article().sourceRefs));}finally{f.close();}
});
test('repeat import is idempotent, eligible source updates refresh and operator edits remain untouched',()=>{
  const f=setup();try{const initial=importRecentRaceNews(f.db,[article()],f.options()),id=initial.publishedIds[0];const repeat=importRecentRaceNews(f.db,[article()],f.options());assert.equal(repeat.inserted,0);assert.equal(repeat.updated,0);assert.equal(repeat.skipped,1);assert.equal(repeat.deletedMockNews,0);const revised=article({title:'城市马拉松完整赛况整理'});assert.equal(importRecentRaceNews(f.db,[revised],f.options()).updated,1);f.db.prepare('UPDATE news SET body=?,updated_at=? WHERE id=?').run('运营人员修改的正文','operator',id);const keep=f.db.prepare('SELECT * FROM news WHERE id=?').get(id);const protectedReport=importRecentRaceNews(f.db,[article()],f.options());assert.equal(protectedReport.protected[0].reason,'edited-by-operator');assert.deepEqual(f.db.prepare('SELECT * FROM news WHERE id=?').get(id),keep);}finally{f.close();}
});
test('a deleted managed publication remains withdrawn instead of being resurrected',()=>{
  const f=setup();try{const id=importRecentRaceNews(f.db,[article()],f.options()).publishedIds[0];f.db.prepare('DELETE FROM news WHERE id=?').run(id);const r=importRecentRaceNews(f.db,[article()],f.options());assert.equal(r.inserted,0);assert.equal(r.protected[0].reason,'deleted-or-withdrawn');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM recent_race_news_import_state').get().n,1);}finally{f.close();}
});
test('race matching requires exact date and city, rejects ambiguous names and honors verified explicit mappings',()=>{
  const f=setup();try{const missing=article({race:{...article().race,city:'北京'}});assert.equal(importRecentRaceNews(f.db,[missing],{now}).pending.length,1);f.db.prepare('INSERT INTO races VALUES(?,?,?,?)').run('alternate','2026城市马拉松','杭州','2026-11-08');const byName=article({race:{name:'2026城市马拉松',raceDate:'2026-11-08',city:'杭州市',edition:2026}});assert.equal(importRecentRaceNews(f.db,[byName],{now}).pending.length,1);const mapped=importRecentRaceNews(f.db,[byName],{now,mapping:{[byName.key]:'caa-100123'}});assert.equal(mapped.pending.length,0);assert.equal(mapped.publications[0].raceId,'caa-100123');assert.equal(importRecentRaceNews(f.db,[article({race:{...article().race,raceDate:'2025-11-08',edition:2025}})],{now}).pending.length,1);}finally{f.close();}
});
test('bad dates, unverified sources, sparse bodies and duplicate source articles are rejected before changes',()=>{
  const f=setup();try{const before=fingerprint(f.db);for(const item of [article({publishedAt:'2026-11-05'}),article({publishedAt:'2026-11-13'}),article({publishedAt:'2026-02-30'}),article({sourceUrl:'javascript:alert(1)'}),article({body:'仅有一行。'}),article({race:{...article().race,edition:2025}})])assert.throws(()=>importRecentRaceNews(f.db,[item],f.options()));assert.throws(()=>importRecentRaceNews(f.db,[article(),article()],f.options()),/重复/);assert.equal(fingerprint(f.db),before);}finally{f.close();}
});
test('apply requires a fresh backup and refuses overwriting an existing backup file',()=>{
  const f=setup();try{const before=fingerprint(f.db);assert.throws(()=>importRecentRaceNews(f.db,[article()],{now,dryRun:false}),/backup/);const opts=f.options();fs.writeFileSync(opts.backupFile,'existing');assert.throws(()=>importRecentRaceNews(f.db,[article()],opts),/EEXIST/);assert.equal(fs.readFileSync(opts.backupFile,'utf8'),'existing');assert.equal(fingerprint(f.db),before);}finally{f.close();}
});
