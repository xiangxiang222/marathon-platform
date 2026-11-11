// Actual SQL aggregation/window regression in an independent in-memory SQLite database.
// No app startup, network requests, environment file, business database or file uploads.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('../../server/node_modules/better-sqlite3');
const { boardOf, windowOf, activityTrainingGroups } = require('../../server/src/training-groups');
const { now, groups, members, ROOT } = require('./club-mileage-test-fixture.cjs');
const out = path.resolve(ROOT, process.env.MILEAGE_AUDIT_OUT || 'design/previews/club-mileage-20261111');
const report = { kind: 'Actual mileage board SQL/window functions with independent in-memory SQLite fixtures; no app/network/business data', checks: [] };
const db = new Database(':memory:');
const realNow = Date.now;
Date.now = () => now;
function check(name, work) { work(); report.checks.push({ name, passed: true }); }
try {
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,avatar TEXT);
    CREATE TABLE club_members(club_id INTEGER,user_id INTEGER,joined_at TEXT,mileage_group_id INTEGER);
    CREATE TABLE mileage_groups(id INTEGER PRIMARY KEY,club_id INTEGER,name TEXT,pace TEXT,description TEXT,capacity INTEGER,sort INTEGER,club_group_id INTEGER);
    CREATE TABLE runs(id INTEGER PRIMARY KEY,user_id INTEGER,type TEXT,started_at TEXT,duration_sec INTEGER,distance_km REAL);
    CREATE TABLE mileage_counts(club_id INTEGER,run_id INTEGER,counted INTEGER,volume_km REAL);`);
  for (const member of members.slice(0, 5)) {
    db.prepare('INSERT INTO users VALUES(?,?,?)').run(member.id, member.nickname, '');
    db.prepare('INSERT INTO club_members VALUES(44,?,?,?)').run(member.id, member.joinedAt, member.id <= 2 ? 701 : member.id === 3 || member.id === 5 ? 702 : 0);
  }
  for (const group of groups) db.prepare('INSERT INTO mileage_groups VALUES(?,44,?,?,?,0,?,?)').run(group.id, group.name, group.pace, group.description, group.id, group.id + 1000);
  db.prepare('INSERT INTO mileage_groups VALUES(999,45,?,?,?,0,0,1999)').run('别团训练组', '6:00', '不得跨团引用');
  let runId = 0;
  function run(userId, startedAt, km, options = {}) {
    const id = ++runId, distance = options.distance ?? km;
    db.prepare('INSERT INTO runs VALUES(?,?,?,?,?,?)').run(id, userId, options.type || 'run', startedAt, Math.round(distance * 360), distance);
    db.prepare('INSERT INTO mileage_counts VALUES(?,?,?,?)').run(options.clubId || 44, id, options.counted === false ? 0 : 1, km);
  }
  for (const [time, km] of [['2025-12-31T23:59',1],['2026-01-01T00:00',2],['2026-12-27T23:59',3],['2026-12-28T00:00',5],['2026-12-31T23:59',7],['2027-01-01T00:00',11],['2027-01-01T00:30',13],['2027-01-01T00:31',17],['2027-01-02T00:00',19]]) run(1,time,km);
  run(2,'2027-01-01T00:00',24);
  run(3,'2026-12-30T08:00',4);
  run(3,'2027-01-01T00:10',5,{type:'trail',distance:4});
  run(4,'2024-02-29T00:00',10); run(4,'2024-03-01T00:00',20);
  run(5,'2027-01-01T00:00',99,{counted:false});
  run(99,'2027-01-01T00:00',100); // removed/non-member record is not a ranking person.
  run(1,'2027-01-01T00:00',200,{clubId:45});
  const board = query => boardOf(db, 44, 1, query);
  check('Beijing default is Jan 1 while UTC and New York remain Dec 31', () => {
    const result = board({ range:'day' }); assert.equal(result.date,'2027-01-01'); assert.deepEqual(result.period,{from:'2027-01-01',to:'2027-01-02',label:'2027-01-01'}); assert.equal(result.summary.km,53);
  });
  check('Monday week spans Dec 28 to Jan 4 and excludes Sunday before start', () => {
    const result=board({range:'week',date:'2027-01-01'}); assert.deepEqual(result.period,{from:'2026-12-28',to:'2027-01-04',label:'2026-12-28 ～ 2027-01-03'}); assert.equal(result.summary.km,69); assert.equal(result.summary.times,7);
  });
  check('Day/month/year/all are independently aggregated; future starts and uncounted/other-club rows excluded', () => {
    for(const [range,date,expected] of [['day','2026-12-31',7],['month','2026-12-31',19],['year','2026-12-31',21],['all','2026-12-31',105]]) assert.equal(board({range,date}).summary.km,expected,range);
    assert.equal(board({range:'day',date:'2027-01-01'}).summary.activeMembers,3);
    assert.equal(board({range:'day',date:'2027-01-01'}).summary.members,5);
  });
  check('Leap February end is exclusive and valid leap-day run is included', () => {
    const result=board({range:'month',date:'2024-02-29'});assert.equal(result.period.from,'2024-02-01');assert.equal(result.period.to,'2024-03-01');assert.equal(result.summary.km,10);assert.equal(board({range:'day',date:'2024-03-01'}).summary.km,20);
  });
  check('Tied rankings are deterministic and retain zero-run current members', () => {
    const result=board({range:'day',date:'2027-01-01'});assert.deepEqual(result.rank.map(r=>[r.userId,r.place,r.km]),[[1,1,24],[2,1,24],[3,3,5],[4,4,0],[5,4,0]]);assert.equal(result.rank[0].mine,true);assert.equal(result.rank[1].mine,false);
  });
  check('Group rankings recompute places, expose empty groups, and use canonical counted volume', () => {
    const result=board({range:'week',date:'2027-01-01',groupId:'702'});assert.equal(result.summary.km,9);assert.equal(result.summary.members,2);assert.deepEqual(result.rank.map(r=>[r.userId,r.place]),[[3,1],[5,2]]);assert.equal(result.rank[0].paceLabel,'6:00');
    assert.equal(result.groups.find(g=>g.id===703).km,0);assert.equal(result.groups.find(g=>g.id===703).memberCount,0);
  });
  check('Omitted group means all; zero means only ungrouped; empty real group remains explicit', () => {
    assert.equal(board({range:'all'}).summary.km,105);const ungrouped=board({range:'all',groupId:'0'});assert.equal(ungrouped.summary.km,30);assert.deepEqual(ungrouped.rank.map(r=>r.userId),[4]);
    const empty=board({range:'all',groupId:'703'});assert.deepEqual(empty.rank,[]);assert.deepEqual(empty.summary,{km:0,times:0,activeMembers:0,members:0});
  });
  check('Invalid calendar dates/ranges/group IDs and foreign groups are rejected', () => {
    for(const date of ['2026-02-30','2025-02-29','2027-13-01','2027-01-01T00:00']) assert.throws(()=>windowOf({range:'day',date}),/有效的日期/);
    assert.throws(()=>windowOf({range:'fortnight',date:'2027-01-01'}),/统计范围/);
    for(const groupId of ['-1','0.5','constructor','999'])assert.throws(()=>board({groupId}),/训练组/);
  });
  check('Activity association validates permanent IDs; custom group omits association and freezes current group values', () => {
    const linked=activityTrainingGroups(db,44,{trainingGroupIds:[701]});assert.equal(linked.input[0].trainingGroupId,701);assert.equal(linked.input[0].name,groups[0].name);assert.equal(linked.input[0].pace,groups[0].pace);
    assert.match(activityTrainingGroups(db,44,{trainingGroupIds:[999]}).error,/本跑团/);assert.match(activityTrainingGroups(db,44,{trainingGroupIds:[701,701]}).error,/不同/);
    assert.deepEqual(activityTrainingGroups(db,44,{groups:[{name:'本次志愿者',kind:'other'}]}).input,[{name:'本次志愿者',kind:'other'}]);
    assert.match(activityTrainingGroups(db,44,{groups:[{name:'误填',trainingGroupId:0}]}).error,/本跑团/);
    db.prepare('UPDATE mileage_groups SET name=? WHERE id=701').run('改名后的常设组');assert.equal(linked.input[0].name,groups[0].name);
  });
  report.passed=true;
} catch(error) { report.passed=false; report.error=error.stack||String(error);process.exitCode=1; }
finally { Date.now=realNow;db.close();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'data-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2)); }
