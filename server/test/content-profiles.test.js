const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const Database=require('better-sqlite3');
const {installProfiles,mountProfiles,publicDataset,publicOne,parseEditable}=require('../src/content-profiles');
const {toPacerPeople}=require('../src/pacer-people');
const athlete={...require('../../shared/elite-athletes.json').athletes[0],type:'athlete'};
const pacer=toPacerPeople(require('../../shared/official-pacers.json')).profiles[0];
const clone=v=>JSON.parse(JSON.stringify(v));
async function fixture(){
  const db=new Database(':memory:');installProfiles(db);
  const datasets={athlete:{meta:{seasonYear:2026},profiles:[clone(athlete)]},pacer:{meta:{seasonYear:2026},profiles:[clone(pacer)]}};
  const readBase=type=>clone(datasets[type]||{meta:{},profiles:[]});
  const app=express();app.use(express.json());
  mountProfiles(app,{root:'/api',getDb:()=>db,readBase,requireAdmin:(req,res)=>{if(req.headers.authorization!=='Bearer profile-unit-admin'){res.status(401).json({error:'请登录管理员'});return false;}req.adminUser='unit';return true;}});
  app.get('/api/public/:type',(req,res)=>res.json(publicDataset(db,req.params.type,readBase(req.params.type))));
  app.get('/api/public/profile/:id',(req,res)=>{const managed=publicOne(db,req.params.id,readBase);if(managed===null)return res.status(404).json({});if(managed)return res.json(managed);const profile=Object.values(datasets).flatMap(d=>d.profiles).find(p=>p.id===req.params.id);return profile?res.json({profile}):res.status(404).json({});});
  const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
  const base='http://127.0.0.1:'+server.address().port+'/api';
  async function api(method,url,body,status=200,admin=true){const response=await fetch(base+url,{method,headers:{...(admin?{Authorization:'Bearer profile-unit-admin'}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});const result=await response.json();assert.equal(response.status,status,method+' '+url+': '+JSON.stringify(result));return result;}
  return {db,datasets,api,close:async()=>{await new Promise(resolve=>server.close(resolve));db.close();}};
}
const article={title:'个人长跑履历',lead:'持续训练，逐场前进。',body:'## 长跑之路\n\n这是一篇管理员独立整理的人物介绍。'};
const actor={type:'athlete',name:'人工测试运动员',gender:'women',article,status:'draft'};
const editableKeys=['name','nameEn','gender','avatar','bio','article','birthDate','placeOfBirth','team','city','personalBest','seasonBest','seasonYear','seasonEventDate','seasonEventName','eventDate','eventName','eventVenue','personalRecords','careerHighlights','assignments'];
const form=profile=>Object.fromEntries([...editableKeys,'revision','baseVersion'].filter(key=>Object.hasOwn(profile,key)).map(key=>[key,key==='article'?{title:profile.article.title,lead:profile.article.lead,body:profile.article.body}:profile[key]]));

test('profile management requires admin and filters collected profiles without exposing draft text publicly',async()=>{
  const f=await fixture();try{
    await f.api('GET','/admin/content/profiles',undefined,401,false);
    await f.api('POST','/admin/content/profiles',actor,401,false);
    const all=await f.api('GET','/admin/content/profiles');assert.equal(all.total,2);assert.equal(all.profiles[0].article.body,undefined);
    const filtered=await f.api('GET','/admin/content/profiles?type=athlete&gender=women');assert.equal(filtered.total,athlete.gender==='women'?1:0);
    const current=(await f.api('GET','/admin/content/profiles/'+athlete.id)).profile;assert.equal(current.status,'published');assert.equal(current.revision,0);assert.ok(current.baseVersion);
  }finally{await f.close();}
});
test('manual drafts publish, preserve published versions during editing, survive reload and archive without deleting records',async()=>{
  const f=await fixture();try{
    let p=(await f.api('POST','/admin/content/profiles',actor)).profile;assert.equal(p.origin,'manual');assert.equal(p.status,'draft');assert.equal(p.isPublic,false);
    assert.equal((await f.api('GET','/admin/content/profiles?type=athlete')).profiles[0].id,p.id,'Recently maintained profiles appear before untouched collection rows');
    await f.api('GET','/public/profile/'+p.id,undefined,404);assert.equal((await f.api('GET','/public/athlete')).profiles.length,1);
    p=(await f.api('PUT','/admin/content/profiles/'+p.id,{...form(p),status:'published'})).profile;
    const live=(await f.api('GET','/public/profile/'+p.id)).profile;assert.equal(live.editorialOrigin,'manual');assert.equal(live.name,actor.name);assert.equal(live.seasonRank,undefined);assert.equal(live.revision,undefined);assert.equal(live.hasDraft,undefined);
    p=(await f.api('PUT','/admin/content/profiles/'+p.id,{revision:p.revision,baseVersion:p.baseVersion,status:'draft',article:{...article,body:'未发布的新草稿'}})).profile;
    assert.equal(p.hasDraft,true);assert.equal(p.isPublic,true);assert.equal((await f.api('GET','/public/profile/'+p.id)).profile.article.body,article.body);
    p=(await f.api('DELETE','/admin/content/profiles/'+p.id,{revision:p.revision,baseVersion:p.baseVersion})).profile;assert.equal(p.status,'archived');await f.api('GET','/public/profile/'+p.id,undefined,404);
    p=(await f.api('GET','/admin/content/profiles/'+p.id)).profile;assert.equal(p.article.body,'未发布的新草稿');
    p=(await f.api('PUT','/admin/content/profiles/'+p.id,{...form(p),status:'published'})).profile;assert.equal((await f.api('GET','/public/profile/'+p.id)).profile.article.body,'未发布的新草稿');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM content_profiles').get().n,1);
  }finally{await f.close();}
});
test('full source-rich athlete forms only pin changed fields and all untouched collector records continue refreshing',async()=>{
  const f=await fixture();try{
    const p=(await f.api('GET','/admin/content/profiles/'+athlete.id)).profile;assert.ok(p.personalRecords.some(r=>r.sourceUrl));
    const sent={...form(p),placeOfBirth:p.placeOfBirth||'',team:p.team||'',city:p.city||''};sent.personalRecords=sent.personalRecords.map(({discipline,mark,date,venue})=>({discipline,mark,date,venue}));sent.careerHighlights=sent.careerHighlights.map(({date,title,result,position})=>({date,title,result,position}));
    await f.api('PUT','/admin/content/profiles/'+p.id,{...sent,article,status:'published'});
    const patch=JSON.parse(f.db.prepare('SELECT published_patch FROM content_profiles WHERE id=?').get(p.id).published_patch);assert.deepEqual(Object.keys(patch),['article']);
    const base=f.datasets.athlete.profiles[0];base.seasonBest='2:04:01';base.name='采集更新后的姓名';base.placeOfBirth='采集新补充籍贯';base.team='采集新补充队伍';base.personalRecords.push({discipline:'新增比赛',mark:'10:01',date:'2026-10-10',venue:'新地点',sourceUrl:'https://example.org/new-evidence'});base.careerHighlights.push({date:'2026-10-10',title:'新赛况',position:'1',result:'2:04:01',sourceUrl:'https://example.org/new-evidence'});
    const live=(await f.api('GET','/public/profile/'+p.id)).profile;assert.equal(live.name,base.name);assert.equal(live.seasonBest,base.seasonBest);assert.equal(live.placeOfBirth,base.placeOfBirth);assert.equal(live.team,base.team);assert.equal(live.personalRecords.length,base.personalRecords.length);assert.equal(live.careerHighlights.at(-1).title,'新赛况');assert.equal(live.article.body,article.body);assert.ok(live.sources.length);
  }finally{await f.close();}
});
test('full source-rich pacer forms do not freeze roster updates and only completed assignments become served badges',async()=>{
  const f=await fixture();try{
    const p=(await f.api('GET','/admin/content/profiles/'+pacer.id)).profile;assert.ok(p.assignments[0].sourceUrl);
    const sent=form(p);sent.assignments=sent.assignments.map(({raceId,raceName,raceDate,city,raceGrade,targetTime,pace,status,edition})=>({raceId,raceName,raceDate,city,raceGrade,targetTime,pace,status,edition}));
    await f.api('PUT','/admin/content/profiles/'+p.id,{...sent,article,status:'published'});
    assert.deepEqual(Object.keys(JSON.parse(f.db.prepare('SELECT published_patch FROM content_profiles WHERE id=?').get(p.id).published_patch)),['article']);
    const base=f.datasets.pacer.profiles[0];base.assignments[0].city='新采集城市';base.assignments.push({raceId:'finished-fixture',raceName:'已担任的赛事',raceDate:'2000-01-01',city:'杭州',raceGrade:'A',targetTime:'3:30',pace:'4:59',status:'completed',sourceUrl:'https://example.org/past'});
    const live=(await f.api('GET','/public/profile/'+p.id)).profile;assert.equal(live.assignments.find(a=>a.raceId===p.assignments[0].raceId).city,'新采集城市');assert.deepEqual(live.verifiedPacerRaceNames,['已担任的赛事']);assert.equal(live.raceCount,2);assert.equal(live.article.body,article.body);
  }finally{await f.close();}
});
test('revision and changed collector baseline reject stale saves without losing current drafts',async()=>{
  const f=await fixture();try{
    const p=(await f.api('GET','/admin/content/profiles/'+athlete.id)).profile;
    await f.api('PUT','/admin/content/profiles/'+p.id,{...form(p),status:'draft',bio:'第一份草稿'});
    await f.api('PUT','/admin/content/profiles/'+p.id,{...form(p),status:'published'},409);
    const current=(await f.api('GET','/admin/content/profiles/'+p.id)).profile;
    f.datasets.athlete.profiles[0].seasonBest='2:03:10';
    await f.api('PUT','/admin/content/profiles/'+p.id,{...form(current),status:'published'},409);
    await f.api('DELETE','/admin/content/profiles/'+p.id,{revision:current.revision,baseVersion:current.baseVersion},409);
    const after=(await f.api('GET','/admin/content/profiles/'+p.id)).profile;assert.equal(after.bio,'第一份草稿');assert.equal(after.revision,current.revision);
  }finally{await f.close();}
});
test('archived collected profiles stay hidden after collection and can be explicitly republished',async()=>{
  const f=await fixture();try{
    let p=(await f.api('GET','/admin/content/profiles/'+athlete.id)).profile;p=(await f.api('DELETE','/admin/content/profiles/'+p.id,{revision:p.revision,baseVersion:p.baseVersion})).profile;
    f.datasets.athlete.profiles[0].seasonBest='2:01:00';assert.equal((await f.api('GET','/public/athlete')).profiles.length,0);await f.api('GET','/public/profile/'+p.id,undefined,404);
    p=(await f.api('GET','/admin/content/profiles/'+p.id)).profile;
    p=(await f.api('PUT','/admin/content/profiles/'+p.id,{...form(p),status:'published'})).profile;assert.equal((await f.api('GET','/public/profile/'+p.id)).profile.seasonBest,'2:01:00');
  }finally{await f.close();}
});
test('validation rejects unsafe photos, invalid dates and times, incomplete publications and altered identity',async()=>{
  const f=await fixture();try{
    for(const extra of [{avatar:'javascript:alert(1)'},{avatar:'//evil.example/x'},{avatar:'/marathon/../private'},{birthDate:'2026-02-30'},{personalBest:'00:00:00'},{seasonBest:'2:99:00'},{article:{title:'',body:'正文'}}])await f.api('POST','/admin/content/profiles',{...actor,status:'published',...extra},400);
    await f.api('POST','/admin/content/profiles',{type:'pacer',name:'官兔',gender:'men',article,status:'published',assignments:[]},400);
    const p=(await f.api('GET','/admin/content/profiles/'+athlete.id)).profile;
    await f.api('PUT','/admin/content/profiles/'+p.id,{...form(p),type:'pacer',status:'published'},400);
    await f.api('PUT','/admin/content/profiles/'+p.id,{...form(p),id:'other-id',status:'published'},400);
    const saved=(await f.api('PUT','/admin/content/profiles/'+p.id,{...form(p),status:'published',sources:[{url:'https://evil.example/forged'}],seasonRank:1})).profile;
    assert.deepEqual(saved.sources,p.sources);assert.equal(saved.seasonRank,p.seasonRank);
    await f.api('POST','/admin/content/profiles',JSON.parse('{"type":"athlete","name":"x","__proto__":{"polluted":true}}'),400);assert.equal({}.polluted,undefined);
  }finally{await f.close();}
});
test('manual pacers use people identities, distinct same names and verified status semantics',async()=>{
  const f=await fixture();try{
    const assignment={raceId:'editorial-race-2026-fixture',raceName:'手工整理A类赛事',raceDate:'2000-01-01',city:'杭州',raceGrade:'A',targetTime:'3:30',pace:'4:59',status:'completed'};
    const first=(await f.api('POST','/admin/content/profiles',{type:'pacer',name:'同名配速员',gender:'men',article,status:'published',assignments:[assignment]})).profile;
    const second=(await f.api('POST','/admin/content/profiles',{type:'pacer',name:'同名配速员',gender:'men',article,status:'published',assignments:[{...assignment,status:'provisional',raceDate:'2099-01-01'}]})).profile;
    assert.notEqual(first.id,second.id);const live=(await f.api('GET','/public/pacer')).profiles;assert.equal(live.length,3);assert.equal(live.find(p=>p.id===first.id).completedPacerRaceCount,1);assert.equal(live.find(p=>p.id===second.id).completedPacerRaceCount,0);
    await f.api('POST','/admin/content/profiles',{type:'pacer',name:'未来已任',gender:'men',article,status:'published',assignments:[{...assignment,raceDate:'2099-01-01'}]},400);
    const half=(await f.api('POST','/admin/content/profiles',{type:'pacer',name:'半马配速员',gender:'women',article,status:'published',assignments:[{...assignment,raceId:'half-marathon',distanceKm:21.0975,targetTime:'1:30',pace:'9:59'}]})).profile;assert.equal(half.assignments[0].pace,'4:16');assert.equal(half.assignments[0].distanceLabel,'半程马拉松');
    const collectedRace=pacer.assignments[0];const linked=(await f.api('POST','/admin/content/profiles',{type:'pacer',name:'同场配速员',gender:'men',article,status:'published',assignments:[{...assignment,raceId:'caa-'+collectedRace.raceId,raceName:collectedRace.raceName}]})).profile;assert.equal(linked.assignments[0].raceId,collectedRace.raceId);assert.equal((await f.api('GET','/public/pacer')).profiles.filter(p=>p.assignments.some(a=>a.raceId===collectedRace.raceId)).length,2);
    const testable=parseEditable({...actor,avatar:'/marathon/images/athletes/runner.png'},'athlete',false);assert.equal(testable.avatar,'/marathon/images/athletes/runner.png');
  }finally{await f.close();}
});
