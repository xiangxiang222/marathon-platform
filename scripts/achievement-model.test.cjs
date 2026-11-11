const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path'), { pathToFileURL } = require('node:url'), { execFileSync } = require('node:child_process');
const model = require('../miniprogram/utils/achievement-model');
const { STYLES, MODES, QUOTES, resultKey, normalizeResults, buildAchievementModel: build, paginateAchievement: paginate } = model;
const row = (id, distance = 'half', seconds = 6000, date = '2026-10-18', extra = {}) => ({ distance, seconds, clock: 'UNTRUSTED CLOCK', pace: 'UNTRUSTED PACE', story: 'PRIVATE-STORY', proof: 'PRIVATE-PROOF', token: 'PRIVATE-TOKEN', hasProof: true, race: { id, name: '河岸跑步赛事' + id, raceDate: date, city: '杭州', province: '浙江', kind: 'road', meet: 'offline', url: 'PRIVATE-URL', ...extra } });
const payload = results => ({ asOf: '2026-11-11', results, career: { pb: [{ distance: 'half', seconds: 1, clock: 'FALSE-PB' }], totalKm: 9999999 }, media: [{ url: 'PRIVATE-MEDIA' }], devices: [{ token: 'PRIVATE-DEVICE' }] });
test('three light themes, two modes and four short quotes have stable ids and labels', () => {
  assert.deepEqual(STYLES.map(x => x.id), ['cream', 'mint', 'coral']);
  assert.deepEqual(STYLES.map(x => x.name), ['纸间荣光', '逐光而跑', '热烈时刻']);
  assert.deepEqual(MODES.map(x => x.id), ['pb', 'results']);assert.equal(QUOTES.length, 4);
  for (const style of STYLES) for (const field of ['background', 'ink', 'accent', 'soft']) assert.match(style[field], /^#[a-f0-9]{6}$/i);
});
test('only real occurred calendar dates and positive integer seconds enter results', () => {
  const good = row('today', 'half', 6000, '2026-11-11');
  const invalid = [row('future', 'half', 6000, '2026-11-12'),row('bad-day','half',6000,'2026-02-30'),row('non-leap','half',6000,'2025-02-29'),row('zero-year','half',6000,'0000-01-01'),row('stamp','half',6000,'2026-11-10T07:00'),row('nan','half',NaN),row('infinite','half',Infinity),row('fraction','half',1.5),row('zero','half',0),row('negative','half',-1),row('string','half','6000')];
  assert.deepEqual(normalizeResults(payload([...invalid,good])).map(x=>x.raceId),['today']);
  assert.equal(normalizeResults(payload([row('leap','half',6000,'2024-02-29')])).length,1);
});
test('stable keys deduplicate race/project without conflating projects or equal event names', () => {
  const source=[row('same','half',6500),row('same','half',6000),row('same','full',15000),row('different','half',6200)];
  const rows=normalizeResults(payload(source));assert.equal(rows.length,3);assert.equal(rows.find(x=>x.key==='same:half').seconds,6000);
  assert.equal(resultKey(source[0]),'same:half');assert.equal(resultKey({...source[0],distance:'bad:key'}),'');
  assert.equal(resultKey({race:{id:12},distance:'5k'}),'12:5k');assert.equal(resultKey(null),'');
});
test('PB is recomputed across the whole career in full/half/10k/5k order, ignoring year and server badges', () => {
  const p=payload([row('recent','half',6500),row('old','half',6000,'2024-01-01'),row('full','full',15000),row('ten','10k',2700),row('five','5k',1300)]);
  const pb=build(p,{mode:'pb',year:'2026'});assert.deepEqual(pb.rows.map(x=>x.distance),['full','half','10k','5k']);assert.equal(pb.rows[1].key,'old:half');assert.equal(pb.year,'');assert.match(pb.title,/生涯/);assert.ok(!JSON.stringify(pb).includes('FALSE-PB'));
});
test('online, trail, unknown format and future results never become road PBs', () => {
  const p=payload([row('valid','half',6500),row('trail','half',4000,'2026-10-10',{kind:'trail'}),row('online','half',3000,'2026-10-10',{meet:'online'}),row('unknown','half',2000,'2026-10-10',{meet:undefined}),row('future','half',1000,'2099-01-01')]);
  assert.equal(normalizeResults(p).length,4);assert.deepEqual(build(p).rows.map(x=>x.key),['valid:half']);
  assert.equal(build(p,{mode:'results'}).rows.length,4,'completed non-road records remain valid result history');
});
test('equal PB times mark all tied results; the PB poster picks one deterministic latest event', () => {
  const source=[row('older','half',6000,'2025-01-01'),row('z-latest','half',6000),row('a-latest','half',6000)];
  assert.equal(normalizeResults(payload(source)).filter(x=>x.pb).length,3);
  assert.equal(build(payload(source)).rows[0].key,'a-latest:half');assert.equal(build(payload([...source].reverse())).rows[0].key,'a-latest:half');
});
test('history identifies online/trail/road formats using only safe whitelisted metadata', () => {
  const p=payload([row('road'),row('trail','half',5000,'2026-10-18',{kind:'trail'}),row('online','half',4500,'2026-10-18',{meet:'online'}),row('unknown','half',4000,'2026-10-18',{kind:'PRIVATE-RAW-KIND',meet:'PRIVATE-RAW-MEET'})]);
  const rows=build(p,{mode:'results'}).rows;
  assert.equal(rows.find(x=>x.raceId==='road').typeLabel,'路跑');assert.equal(rows.find(x=>x.raceId==='trail').typeLabel,'越野');assert.equal(rows.find(x=>x.raceId==='online').typeLabel,'线上赛');
  const other=rows.find(x=>x.raceId==='unknown');assert.equal(other.kind,'other');assert.equal(other.meet,'');assert.equal(other.typeLabel,'其他');assert.ok(!JSON.stringify(rows).includes('PRIVATE-RAW'));
});
test('results year filters history and preserves descending date order', () => {
  const p=payload([row('older','half',6100,'2024-10-01'),row('new','half',6200),row('middle','full',15000,'2026-09-01')]);
  assert.deepEqual(build(p,{mode:'results'}).rows.map(x=>x.raceId),['new','middle','older']);
  const annual=build(p,{mode:'results',year:'2026'});assert.deepEqual(annual.rows.map(x=>x.raceId),['new','middle']);assert.equal(annual.year,'2026');assert.deepEqual(annual.years,['2026']);
  assert.equal(build(p,{mode:'results',year:'2099'}).rows.length,0);
});
test('missing selectedKeys selects all; explicit empty stays empty and foreign keys do not select anything', () => {
  const p=payload([row('a'),row('b','full',15000)]);
  assert.equal(build(p,{mode:'results'}).rows.length,2);
  for(const selectedKeys of [[],['foreign:half']]){const out=build(p,{mode:'results',selectedKeys});assert.equal(out.rows.length,0);assert.deepEqual(out.summary,{events:0,results:0,cities:0,km:0});assert.deepEqual(out.eligibleRows,[]);assert.deepEqual(out.pbRows,[]);}
  assert.deepEqual(build(p,{mode:'results',selectedKeys:['a:half','a:half','foreign:half']}).rows.map(x=>x.key),['a:half']);
});
test('summary counts only selected rows, distinct events, offline cities and known project kilometres', () => {
  const p=payload([row('a','half',6000),row('a','full',15000),row('b','10k',3000,'2026-10-01',{city:'杭州',province:'另一个省'}),row('web','5k',1600,'2026-09-01',{meet:'online',city:'虚拟城市'}),row('outside','full',16000)]);
  const out=build(p,{mode:'results',selectedKeys:['a:half','a:full','b:10k','web:5k']});
  assert.deepEqual(out.summary,{events:3,results:4,cities:2,km:78.29});assert.ok(!JSON.stringify(out).includes('outside'));
});
test('privacy toggles redact every model row projection and never expose private API fields', () => {
  const p=payload([row('r')]),out=build(p,{mode:'results',nickname:'PRIVATE-NICKNAME',showName:false,showRace:false,showDate:false,showCity:false});
  assert.equal(out.nickname,'');for(const rows of [out.rows,out.eligibleRows,out.pbRows])for(const entry of rows)for(const key of ['raceName','raceDate','date','city','province'])assert.equal(entry[key],'');
  const json=JSON.stringify(out);for(const value of ['PRIVATE-','story','proof','token','hasProof','url','devices','media','UNTRUSTED'])assert.ok(!json.includes(value),value);
  assert.equal(out.rows[0].clock,'01:40:00');assert.equal(out.rows[0].pace,'4′44″');
});
test('visible nickname/race/date/city preserve Chinese and emoji without splitting surrogate pairs', () => {
  const out=build(payload([row('emoji','half',6000,'2026-10-18',{name:'🏃晨光👩🏽‍🦱跑步节',city:'杭州🌤',province:'浙江'})]),{nickname:'爱跑步🏃‍♀️的小林',quote:'一起跑过🌈',showCity:true});
  assert.equal(out.nickname,'爱跑步🏃‍♀️的小林');assert.equal(out.rows[0].raceName,'🏃晨光👩🏽‍🦱跑步节');assert.equal(out.rows[0].city,'杭州🌤');assert.equal(out.quote,'一起跑过🌈');
  const capped=build(payload([]),{nickname:'🏃'.repeat(40),quote:'🌈'.repeat(100)});assert.equal(Array.from(capped.nickname).length,30);assert.equal(Array.from(capped.quote).length,80);assert.ok(!/[\ud800-\udbff]$/.test(capped.nickname));
});
test('zero to twenty rows make one image and larger selections paginate at twenty without omission', () => {
  for(const count of [0,1,12,13,20,21,40,41,61]){
    const source=Array.from({length:count},(_,index)=>row('event-'+String(index).padStart(3,'0'))),out=build(payload(source),{mode:'results'}),pages=paginate(out);
    assert.equal(out.rows.length,count,'there is no implicit first-twelve selection');assert.equal(pages.length,Math.max(1,Math.ceil(count/20)));assert.deepEqual(pages.flatMap(page=>page.rows.map(x=>x.key)),out.rows.map(x=>x.key));
    pages.forEach((page,index)=>{assert.equal(page.page,index+1);assert.equal(page.pageCount,pages.length);assert.equal(page.totalRows,count);assert.ok(page.rows.length<=20);assert.deepEqual(page.summary,out.summary);});
  }
});
test('safe unusual distance keys neither inherit object fields nor become PB or invented kilometres', () => {
  const out=build(payload([row('odd','__proto__',1000)]),{mode:'results'});assert.equal(out.rows[0].distanceLabel,'__proto__');assert.equal(out.rows[0].km,0);assert.equal(out.rows[0].pb,false);assert.equal(out.summary.km,0);
});
test('invalid/absent payloads are empty, invalid style/mode fall back, and custom empty quote stays empty', () => {
  for(const p of [null,undefined,{}, {results:'bad'}, {results:[null,{},'bad'] }])assert.equal(build(p).rows.length,0);
  const out=build(payload([]),{mode:'invalid',style:'invalid',quote:''});assert.equal(out.mode,'pb');assert.equal(out.style.id,'cream');assert.equal(out.quote,'');assert.equal(out.nickname,'跑步的我');
});
test('normalization, building and pagination never mutate payload, options or each other', () => {
  const p=payload([row('one'),row('two','full',15000)]),options={mode:'results',selectedKeys:['one:half']};
  const before=JSON.stringify({p,options});normalizeResults(p);const out=build(p,options);paginate(out);assert.equal(JSON.stringify({p,options}),before);
  out.eligibleRows[0].raceName='changed';assert.notEqual(out.rows[0].raceName,'changed');
});
test('generated ESM source stays synchronized and behaves identically to canonical CJS', async () => {
  execFileSync(process.execPath,[path.resolve(__dirname,'sync-achievement-model.cjs'),'--check']);
  const esm=await import(pathToFileURL(path.resolve(__dirname,'../web/src/achievement-model.js')).href),p=payload([row('full','full',15000),row('half'),row('older','half',5900,'2025-01-01')]);
  assert.deepEqual(Object.keys(esm).sort(),Object.keys(model).sort());
  for(const options of [{},{mode:'results',year:'2026'},{mode:'results',showName:false,showRace:false,showDate:false,showCity:true},{selectedKeys:[]}])assert.deepEqual(esm.buildAchievementModel(p,options),build(p,options));
  assert.deepEqual(esm.normalizeResults(p),normalizeResults(p));assert.deepEqual(esm.paginateAchievement(esm.buildAchievementModel(p)),paginate(build(p)));
});
