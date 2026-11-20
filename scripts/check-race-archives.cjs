'use strict';
// Validate authored evidence, rather than requiring unknown fields to be filled.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const catalog = require('../shared/race-catalog.json');
const { OFFICIAL_RESOURCE_CATEGORIES, officialResourceUrl } = require('../server/src/race-archive-schema');
const { validateArchiveInput } = require('../server/src/race-archive-editor');
const expected = ['beijing','shanghai','xiamen','wuxi','wuhan','guangzhou','chongqing','dongying','hengshuihu','xian','taiyuan','changsha','chengdu','dalian','lanzhou','shenzhen','hangzhou'];
assert.deepEqual([...catalog.races.map(r=>r.id)].sort(), [...expected].sort());
assert.equal(new Set(catalog.races.map(r=>r.id)).size,17);
assert.deepEqual(catalog.featuredIds,['beijing','shanghai','xiamen']);
const report=[];
for(const race of catalog.races){
  const archive=JSON.parse(fs.readFileSync(path.join(root,'shared/race-archives',race.id+'.json'),'utf8'));
  assert.equal(archive.raceId,race.id);
  const seed = { race, archive };
  validateArchiveInput(seed, seed, null, race.id, '/marathon');
  assert.ok(fs.existsSync(path.join(root,'web/public/images/race-landmarks',race.id+'.svg')));
  assert.ok(fs.existsSync(path.join(root,'miniprogram/images/race-landmarks',race.id+'.png')));
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
    assert.ok(!e.status || ['completed','scheduled','cancelled','postponed'].includes(e.status), race.id+' '+e.year+' invalid edition status');
    assert.ok((e.route.analysis || []).every(item=>typeof item==='string'), race.id+' '+e.year+' route analysis must be displayable text');
    assert.ok(e.gear.every(item=>['参赛服','奖牌','参赛包','完赛包'].includes(item.category)), race.id+' '+e.year+' invalid gallery category');
    if(e.date)assert.ok(e.dateSourceIds.length,race.id+' date evidence '+e.year);
    if(e.status==='scheduled' || (e.date && e.date>(archive.updatedAt||catalog.updatedAt))){assert.equal(e.results.length,0);assert.ok(!e.participation.starters&&!e.participation.finishers)}
    const resultKeys = new Set();
    for (const row of e.results) {
      assert.ok(row.group && row.athlete && row.sourceIds?.length, race.id+' '+e.year+' result needs evidence');
      assert.match(row.time,/^\d{1,2}:[0-5]\d:[0-5]\d$/);
      const key = row.group + ':' + row.athlete;
      assert.ok(!resultKeys.has(key), race.id+' '+e.year+' duplicate result: '+key);
      resultKeys.add(key);
    }
    for(const event of (e.events||[])){
      assert.ok(event.project, race.id+' '+e.year+' event project');
      assert.ok(event.distanceKm==='' || typeof event.distanceKm==='number', race.id+' '+e.year+' event distance');
      assert.ok(event.plannedParticipants==='' || (Number.isInteger(event.plannedParticipants) && event.plannedParticipants>0), race.id+' '+e.year+' event planned participants');
      assert.ok(Array.isArray(event.sourceIds)&&event.sourceIds.length, race.id+' '+e.year+' event evidence');
    }
    for(const [key,value]of [['route',e.route.summary],['registration',e.registration.method],['participation',e.participation.planned]])if(value)assert.ok(e[key].sourceIds?.length,race.id+' '+e.year+' '+key+' evidence');
    const resourceKeys = new Set();
    for (const item of e.officialResources || []) {
      assert.ok(OFFICIAL_RESOURCE_CATEGORIES.has(item.category) && item.title && officialResourceUrl(item.url), race.id+' '+e.year+' malformed official resource');
      assert.ok(item.sourceIds?.some(id=>sources.get(id)?.applicableYears?.map(String).includes(String(e.year))), race.id+' '+e.year+' resource needs a source for this edition');
      const key = item.category + ':' + officialResourceUrl(item.url);
      assert.ok(!resourceKeys.has(key), race.id+' '+e.year+' duplicate official resource');
      resourceKeys.add(key);
    }
  }
  const editions = archive.editions;
  const editionsWith = category => editions.filter(e=>e.officialResources?.some(item=>item.category===category)).map(e=>e.year);
  const yearsWith = check => editions.filter(check).map(e=>e.year);
  const stories = [...(archive.stories||[]),...(archive.updates||[])];
  report.push({id:race.id,name:race.name,years:[...years],sources:sources.size,history:archive.history.length,stories:new Set(stories.map(item=>item.title)).size,storyYears:yearsWith(e=>stories.some(item=>String(item.editionYear)===e.year)),records:archive.records.length,recordYears:yearsWith(e=>archive.records.some(item=>item.editionId===e.editionId)),results:yearsWith(e=>e.results?.length),resultRows:editions.reduce((n,e)=>n+(e.results?.length||0),0),resultLinks:editionsWith('results'),signup:yearsWith(e=>e.registration?.opens && e.registration?.closes),draw:yearsWith(e=>e.registration?.drawDate),drawRate:yearsWith(e=>e.registration?.lotteryRate),guide:yearsWith(e=>e.officialResources?.some(item=>item.category==='guide') || Object.values(e.logistics||{}).some(item=>item?.sourceIds?.length)),routeMap:editionsWith('route-map'),shirt:editionsWith('shirt'),medal:editionsWith('medal'),gaps:archive.gaps.length});
}
console.log(JSON.stringify({passed:true,races:report.length,editions:report.reduce((n,r)=>n+r.years.length,0),sources:report.reduce((n,r)=>n+r.sources,0),coverage:report},null,2));
