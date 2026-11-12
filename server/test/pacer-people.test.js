const test = require('node:test');
const assert = require('node:assert/strict');
const { toPacerPeople, normalizeClock, paceFor } = require('../src/pacer-people');
const roster = extra => ({id:'race-beijing',profileKind:'official_pacer_race',officialRaceId:'beijing-2026',raceGrade:'A',name:'2026北京马拉松',edition:2026,raceDate:'2026-11-01',city:'北京',rosterStatus:'provisional',avatar:'https://example.org/race-banner.jpg',gallery:[{url:'https://example.org/group.jpg'}],sources:[{title:'北京马拉松官网官兔名单公示',url:'https://example.org/roster'}],pacerGroups:[{targetTime:'3:00',label:'3小时组',members:[{name:'王楠',gender:'men',personalBest:'2:35:06'},{name:'王楠',gender:'women',personalBest:'2:45:07'}]}],...extra});
test('pacer list represents people, preserves their assignments and never uses race photos as portraits', () => {
  const result=toPacerPeople({profiles:[roster()]});
  assert.equal(result.classification,'person');assert.equal(result.profiles.length,2);
  assert.equal(new Set(result.profiles.map(p=>p.id)).size,2);
  for(const person of result.profiles){
    assert.equal(person.name,'王楠');assert.equal(person.profileKind,'official_pacer_person');
    assert.equal(person.avatar,'');assert.deepEqual(person.gallery,[]);
    assert.equal(person.assignments[0].status,'provisional');assert.equal(person.assignments[0].sourceUrl,'https://example.org/roster');
    assert.equal(person.assignments[0].targetTime,'3:00');assert.equal(person.assignments[0].pace,'4:16');
    assert.ok(person.personalBest);assert.equal(person.raceCount,1);
    assert.ok(person.article.body.includes('3:00'));assert.doesNotMatch(person.article.body,/https?:|资料来源|查看原文/);
    assert.deepEqual(person.verifiedPacerRaceNames,[]);assert.equal(person.raceBadges[0].statusLabel,'入选公示');
  }
});
test('only verified completed assignments become previously served race badges',()=>{
  const race=roster();race.pacerGroups[0].members[0].previousAssignments=[
    {raceId:'past-2025',raceName:'2025春季马拉松',raceDate:'2025-03-01',edition:2025,raceGrade:'A',targetTime:'3:10',status:'completed',sourceUrl:'https://example.org/finish',identityVerified:true},
    {raceId:'unlinked-2024',raceName:'同名跑者赛事',raceDate:'2024-03-01',raceGrade:'A',targetTime:'3:00',status:'completed',sourceUrl:'https://example.org/name-only'}
  ];
  const person=toPacerPeople({profiles:[race]}).profiles.find(p=>p.gender==='men');
  assert.deepEqual(person.verifiedPacerRaceNames,['2025春季马拉松']);assert.equal(person.completedPacerRaceCount,1);assert.equal(person.raceCount,2);
  assert.match(person.article.body,/担任2025春季马拉松/);assert.doesNotMatch(person.article.body,/同名跑者赛事/);
});
test('matching names across races only combine with a verified identity key', () => {
  const second=roster({id:'race-other',officialRaceId:'other-2026',name:'另一场马拉松'});
  assert.equal(toPacerPeople({profiles:[roster(),second]}).profiles.length,4);
  for(const race of [second])for(const member of race.pacerGroups[0].members)member.verifiedIdentityKey='verified-'+member.gender;
  const first=roster();for(const member of first.pacerGroups[0].members)member.verifiedIdentityKey='verified-'+member.gender;
  const joined=toPacerPeople({profiles:[first,second]});
  assert.equal(joined.profiles.length,2);assert.ok(joined.profiles.every(p=>p.raceCount===2&&p.assignments.length===2));
});
test('announcements without verified names do not appear as people and non-A races are excluded', () => {
  assert.equal(toPacerPeople({profiles:[roster({pacerGroups:[]}),roster({raceGrade:'B'})]}).profiles.length,0);
  assert.equal(normalizeClock('2小时34分钟06秒'),'2:34:06');assert.equal(normalizeClock('123X'),'');
  assert.equal(paceFor('6:00'),'8:32');
});
