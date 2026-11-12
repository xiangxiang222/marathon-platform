const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const Database=require('../server/node_modules/better-sqlite3');
const {seed,cleanup,inspect}=require('./seed-account-experiences.cjs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'account-experience-test-'));
process.env.MARATHON_DB=path.join(directory,'template.sqlite');
const template=require('../server/src/db').getDb();template.pragma('wal_checkpoint(TRUNCATE)');template.pragma('journal_mode = DELETE');
const bytes=template.serialize();template.close();
test.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
const now=new Date('2026-11-12T08:00:00Z');
const fingerprint=row=>crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');
function snapshot(db){return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='account_experience_seed_registry'").all().flatMap(({name})=>db.prepare('SELECT rowid AS __rid,* FROM '+name).all().map(row=>({table:name,rowid:row.__rid,hash:fingerprint(row)})));}
function unchanged(db,before){for(const entry of before){const row=db.prepare('SELECT rowid AS __rid,* FROM '+entry.table+' WHERE rowid=?').get(entry.rowid);assert.ok(row,'original row retained: '+entry.table);assert.equal(fingerprint(row),entry.hash,'original row changed: '+entry.table);}}
function fixture(){
  const db=new Database(bytes),ids=[];
  for(let i=0;i<4;i++)ids.push(Number(db.prepare('INSERT INTO users(nickname,token,created_at) VALUES(?,?,?)').run('正常测试账户'+i,'experience-unit-'+i,now.toISOString()).lastInsertRowid));
  const real=ids[3];
  for(let i=0;i<2;i++){
    const club=Number(db.prepare('INSERT INTO clubs(name,code,owner_id,created_at) VALUES(?,?,?,?)').run('已有真实跑团'+i,'REAL-CLUB-'+i,real,'2025-01-01').lastInsertRowid);
    db.prepare('INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,?)').run(club,real,'2025-01-01','owner');
    const race='real-race-'+i;
    db.prepare('INSERT INTO races(id,name,city,province,distances,race_date,deadline,place) VALUES(?,?,?,?,?,?,?,?)').run(race,'已有赛事'+i,'北京','北京','10k','2026-10-'+String(10+i).padStart(2,'0'),'','已有线路');
    db.prepare('INSERT INTO results(user_id,race_id,distance,seconds,story,updated_at) VALUES(?,?,?,?,?,?)').run(real,race,'10k',3600,'用户真实感受',now.toISOString());
    db.prepare('INSERT INTO runs(user_id,type,run_mode,started_at,distance_km,duration_sec,volume_km,source,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(real,'run','road','2026-11-'+String(10+i).padStart(2,'0')+'T06:30',10,3600,10,'manual',now.toISOString());
  }
  const races=db.prepare('SELECT id FROM races ORDER BY id LIMIT 4').all();
  for(let i=0;i<4;i++)db.prepare('INSERT INTO plans(user_id,race_id,status,updated_at) VALUES(?,?,?,?)').run(real,races[i].id,['想跑','已报名','待抽签','中签'][i],now.toISOString());
  return {db,ids,real};
}
test('dry-run is strictly read-only and predicts only per-account gaps',()=>{
  const {db,ids,real}=fixture();try{
    const original=fingerprint(db.serialize()),report=seed(db,{now,accountIds:ids});
    assert.equal(fingerprint(db.serialize()),original);
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name='account_experience_seed_registry'").get(),undefined);
    assert.equal(report.accounts,4);assert.equal(report.before.clubsBelowTwo,3);assert.equal(report.inserted.clubs,3);
    assert.equal(report.inserted.results,6);assert.equal(report.inserted.runs,6);assert.equal(report.inserted.activity_signups,8);
    const existing=report.byAccount.find(a=>a.userId===real);assert.equal(existing.added.runs,undefined);assert.equal(existing.added.results,undefined);assert.equal(existing.added.club_members,undefined);
  }finally{db.close();}
});
test('apply fills each visible area, keeps original rows and never counts experience runs in PK',()=>{
  const {db,ids}=fixture();try{
    const before=snapshot(db),report=seed(db,{now,accountIds:ids,dryRun:false});unchanged(db,before);
    assert.ok(report.totalRows>0);assert.ok(Object.values(report.after).every(n=>n===0));
    const created=db.prepare("SELECT r.* FROM runs r JOIN account_experience_seed_registry s ON s.table_name='runs' AND json_extract(s.pk_json,'$.id')=r.id").all();
    assert.equal(created.length,6);assert.ok(created.every(r=>r.source==='manual'&&r.run_mode==='virtual'&&r.city.startsWith('[体验]')&&r.volume_km>0));
    assert.equal(db.prepare('SELECT COUNT(*) n FROM mileage_counts WHERE counted!=0 OR volume_km!=0 OR manual!=1 OR decision!=?').get('out').n,0);
    assert.ok(db.prepare("SELECT * FROM races WHERE id LIKE 'account-experiences-v1-%'").all().every(r=>r.name.startsWith('[体验]')&&!r.source&&r.guide_text.startsWith('[体验]')));
    assert.ok(db.prepare("SELECT * FROM activities WHERE title LIKE '[体验]%'").all().every(a=>a.points===0&&a.starts_at>'2026-11-12'&&a.notice.startsWith('[体验]')));
    assert.equal(seed(db,{now,accountIds:ids,dryRun:false}).totalRows,0);
  }finally{db.close();}
});
test('cleanup round-trips every untouched inserted row and preserves the original database rows',()=>{
  const {db,ids}=fixture();try{
    const before=snapshot(db);seed(db,{now,accountIds:ids,dryRun:false});
    const preview=cleanup(db);assert.ok(preview.totalRows>0);assert.equal(preview.protectedRows.length,0);
    const applied=cleanup(db,{dryRun:false});assert.equal(applied.totalRows,preview.totalRows);unchanged(db,before);
    assert.equal(snapshot(db).length,before.length);assert.equal(db.prepare('SELECT COUNT(*) n FROM account_experience_seed_registry').get().n,0);
    assert.equal(cleanup(db,{dryRun:false}).totalRows,0);
  }finally{db.close();}
});
test('cleanup preserves edited experience rows and their PK exclusions',()=>{
  const {db,ids}=fixture();try{
    seed(db,{now,accountIds:ids,dryRun:false});
    const run=db.prepare("SELECT * FROM runs WHERE run_mode='virtual' LIMIT 1").get();
    db.prepare('UPDATE runs SET distance_km=distance_km+1 WHERE id=?').run(run.id);
    const kept=db.prepare('SELECT * FROM runs WHERE id=?').get(run.id),counts=db.prepare('SELECT * FROM mileage_counts WHERE run_id=?').all(run.id);
    const report=cleanup(db,{dryRun:false});assert.ok(report.protectedRows.some(r=>r.reason==='modified'));
    assert.deepEqual(db.prepare('SELECT * FROM runs WHERE id=?').get(run.id),kept);
    assert.deepEqual(db.prepare('SELECT * FROM mileage_counts WHERE run_id=?').all(run.id),counts);
    assert.ok(counts.every(c=>c.counted===0&&c.decision==='out'));
  }finally{db.close();}
});
test('cleanup keeps user-created later references and all necessary parent records',()=>{
  const {db,ids}=fixture();try{
    seed(db,{now,accountIds:ids,dryRun:false});
    const activity=db.prepare("SELECT * FROM activities WHERE title LIKE '[体验]%' LIMIT 1").get();
    const user=Number(db.prepare('INSERT INTO users(nickname,token,created_at) VALUES(?,?,?)').run('后加入用户','later-user',now.toISOString()).lastInsertRowid);
    db.prepare('INSERT INTO club_members(club_id,user_id,joined_at) VALUES(?,?,?)').run(activity.club_id,user,now.toISOString());
    db.prepare('INSERT INTO activity_signups(activity_id,user_id,created_at) VALUES(?,?,?)').run(activity.id,user,now.toISOString());
    const signup=db.prepare('SELECT * FROM activity_signups WHERE activity_id=? AND user_id=?').get(activity.id,user),club=db.prepare('SELECT * FROM clubs WHERE id=?').get(activity.club_id);
    const report=cleanup(db,{dryRun:false});assert.ok(report.protectedRows.some(r=>r.reason==='retained-dependent-row'));
    assert.deepEqual(db.prepare('SELECT * FROM activity_signups WHERE activity_id=? AND user_id=?').get(activity.id,user),signup);
    assert.deepEqual(db.prepare('SELECT * FROM activities WHERE id=?').get(activity.id),activity);
    assert.deepEqual(db.prepare('SELECT * FROM clubs WHERE id=?').get(activity.club_id),club);
    assert.ok(db.prepare('SELECT 1 FROM club_members WHERE club_id=? AND user_id=?').get(activity.club_id,user));
  }finally{db.close();}
});
test('the first minutes of a Chinese calendar month still produce past, visible virtual runs',()=>{
  const {db,ids}=fixture();try{
    const early=new Date('2026-10-31T16:05:00Z');seed(db,{now:early,accountIds:[ids[0]],dryRun:false});
    const runs=db.prepare('SELECT * FROM runs WHERE user_id=?').all(ids[0]);assert.equal(runs.length,2);
    for(const run of runs){assert.ok(run.started_at.startsWith('2026-11-01'));assert.ok(Date.parse(run.ended_at+'+08:00')<early.getTime());assert.ok(run.duration_sec>0);}
    assert.equal(inspect(db,{now:early,accountIds:[ids[0]]}).deficits.monthRunsBelowTwo,0);
  }finally{db.close();}
});
test('private race history counts distinct manual entries and is not overwritten',()=>{
  const {db,ids}=fixture();try{
    for(let i=0;i<2;i++)db.prepare('INSERT INTO race_history_entries(user_id,name,race_date,distance,fingerprint,confirmed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(ids[0],'私人跑史'+i,'2026-09-0'+(i+1),'half','private-'+i,now.toISOString(),now.toISOString(),now.toISOString());
    assert.equal(seed(db,{now,accountIds:[ids[0]]}).inserted.results,0);
  }finally{db.close();}
});
