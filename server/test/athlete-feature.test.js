'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Database=require('better-sqlite3');
const {installProfiles,publicDataset}=require('../src/content-profiles');
const feature=require('../../shared/china-marathon-feature.json');
const root=path.resolve(__dirname,'../..'),seconds=s=>s.split(':').reduce((n,v)=>n*60+Number(v),0);
test('dated PB collection has 40 evidence-linked identities and keeps activity separate from PB validity',()=>{
 assert.equal(feature.athletes.length,40);assert.equal(new Set(feature.athletes.map(p=>p.worldAthleticsId)).size,40);
 for(const gender of ['men','women']){const rows=feature.athletes.filter(p=>p.gender===gender);assert.equal(rows.length,20);for(let i=0;i<rows.length;i++){const p=rows[i];if(i)assert.ok(seconds(rows[i-1].personalBest)<=seconds(p.personalBest));assert.ok(p.eventDate<=feature.asOf);assert.ok(p.feature.activityEvidence.some(e=>e.date>='2024-11-17'&&e.date<=feature.asOf&&e.mark!=='DNS'));const ids=new Set(p.sources.map(s=>s.id));for(const match of p.article.body.matchAll(/\[(S\d+)\]/g))assert.ok(ids.has(match[1]),p.name+': '+match[1]);assert.ok(p.feature.sourceCard.facts.length);assert.ok(fs.existsSync(path.join(root,'web/public',p.feature.graphicUrl.replace('/marathon/',''))));}}
 const sun=feature.athletes.find(p=>p.worldAthleticsId==='14265279');assert.equal(sun.personalBest,'2:27:55');assert.equal(sun.eventDate,'2012-11-25');assert.ok(sun.feature.activityEvidence.some(e=>e.date==='2024-12-22'&&e.mark==='3:03:45'));
 const tied=feature.athletes.filter(p=>['14714456','14839796'].includes(p.worldAthleticsId));assert.deepEqual(tied.map(p=>p.pbRank),[14,14]);
});
test('prose edits and withdrawals respect the dated collection result evidence',()=>{
 const db=new Database(':memory:');try{installProfiles(db);const base=feature.athletes[0];db.prepare('INSERT INTO content_profiles(id,type,origin,public_state,published_patch,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(base.id,'athlete','collected','published',JSON.stringify({personalBest:'2:00:00',gender:'women',article:{title:'编辑修订',body:'编辑补充正文'}}),'test','2026-11-17','2026-11-17');const publicProfile=publicDataset(db,'athlete',{meta:{},profiles:[base]}).profiles[0];assert.equal(publicProfile.article.title,'编辑修订');assert.equal(publicProfile.personalBest,base.personalBest);assert.equal(publicProfile.gender,base.gender);assert.equal(publicProfile.pbRank,base.pbRank);db.prepare("UPDATE content_profiles SET public_state='archived' WHERE id=?").run(base.id);assert.equal(publicDataset(db,'athlete',{meta:{},profiles:[base]}).profiles.length,0);}finally{db.close();}
});
