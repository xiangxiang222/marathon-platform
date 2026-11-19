'use strict';
// Validate authored evidence, rather than requiring unknown fields to be filled.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const catalog = require('../shared/race-catalog.json');
const expected = ['beijing','shanghai','xiamen','wuxi','wuhan','guangzhou','chongqing','dongying','hengshuihu','xian','taiyuan','changsha','chengdu','dalian','lanzhou','shenzhen','hangzhou'];
assert.deepEqual([...catalog.races.map(r=>r.id)].sort(), [...expected].sort());
assert.equal(new Set(catalog.races.map(r=>r.id)).size,17);
assert.deepEqual(catalog.featuredIds,['beijing','shanghai','xiamen']);
const report=[];
for(const race of catalog.races){
  const archive=JSON.parse(fs.readFileSync(path.join(root,'shared/race-archives',race.id+'.json'),'utf8'));
  assert.equal(archive.raceId,race.id);
  assert.ok(race.name&&race.city&&race.summary&&race.tagline);
  assert.ok(archive.intro&&archive.profile&&Array.isArray(archive.history)&&Array.isArray(archive.records)&&Array.isArray(archive.gaps));
  const sources=new Map([...(race.sources||[]),...(archive.sources||[])].map(s=>[s.id,s]));
  for(const s of sources.values()){
    assert.ok(s.id&&s.title&&s.publisher, race.id+' incomplete source');
    assert.match(s.url,/^https?:\/\//);
    assert.match(s.verifiedAt||s.accessedAt,/^20\d{2}-\d{2}-\d{2}$/);
    assert.ok(Array.isArray(s.applicableYears),race.id+' missing applicable years '+s.id);
  }
  const walk=v=>{if(Array.isArray(v))return v.forEach(walk);if(!v||typeof v!=='object')return;for(const [key,value]of Object.entries(v)){if(key==='sourceIds'||key.endsWith('SourceIds')){assert.ok(Array.isArray(value));for(const id of value)assert.ok(sources.has(id),race.id+': unresolved '+id);}else walk(value)}};
  walk({race,archive});
  assert.ok(archive.introSourceIds.length,race.id+' intro evidence');
  if(archive.profile.foundingYear)assert.ok(archive.profile.foundingYearSourceIds.length,race.id+' founding evidence');
  for(const item of [...archive.highlights,...archive.history,...archive.records])assert.ok(item.sourceIds?.length,race.id+' missing fact evidence');
  for(const r of archive.records){assert.match(r.time,/^\d{1,2}:[0-5]\d:[0-5]\d$/);assert.ok(r.editionId&&r.verifiedAt&&r.group&&r.athlete)}
  const years=new Set();
  for(const e of archive.editions){
    assert.ok(!years.has(e.year),race.id+' duplicate edition');years.add(e.year);
    assert.ok(e.route&&e.registration&&e.participation&&Array.isArray(e.results)&&Array.isArray(e.gear));
    if(e.date)assert.ok(e.dateSourceIds.length,race.id+' date evidence '+e.year);
    if(e.date>'2026-11-18'){assert.equal(e.results.length,0);assert.ok(!e.participation.starters&&!e.participation.finishers)}
    for(const event of (e.events||[])){
      assert.ok(event.project, race.id+' '+e.year+' event project');
      assert.ok(event.distanceKm==='' || typeof event.distanceKm==='number', race.id+' '+e.year+' event distance');
      assert.ok(event.plannedParticipants!==undefined, race.id+' '+e.year+' event planned participants');
      assert.ok(Array.isArray(event.sourceIds)&&event.sourceIds.length, race.id+' '+e.year+' event evidence');
    }
    for(const [key,value]of [['route',e.route.summary],['registration',e.registration.method],['participation',e.participation.planned]])if(value)assert.ok(e[key].sourceIds?.length,race.id+' '+e.year+' '+key+' evidence');
  }
  report.push({id:race.id,name:race.name,years:[...years],sources:sources.size,history:archive.history.length,records:archive.records.length,gaps:archive.gaps.length});
}
console.log(JSON.stringify({passed:true,races:report.length,editions:report.reduce((n,r)=>n+r.years.length,0),sources:report.reduce((n,r)=>n+r.sources,0),coverage:report},null,2));
