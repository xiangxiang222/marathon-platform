const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Database = require('../server/node_modules/better-sqlite3');
const { buildPlan, applyPlan, reconcileGuide } = require('./race-detail-apply.cjs');
const { readDetails } = require('../server/src/race-details');
const { mergeGuideText, writeDetails } = require('../server/src/race-details');
const collected = { id: 'existing', name: '2026样例赛事', coverage: { pages: 1 }, guideText: '完整规程正文', details: { version: 1, groups: [{ name: '10公里亲子组1大1小', actualDistanceKm: 13.5 }], sections: [{ title: '竞赛规程', text: '完整规程正文' }], media: [], registration: { verified: true, status: 'closed', closesAt: '2026-11-10' } } };

test('full collected prose replaces generated summaries but keeps unmatched editorial text', () => {
  assert.equal(readDetails(reconcileGuide('举办时间：2026-11-21。', collected).value).text, collected.guideText);
  const edited = reconcileGuide('编辑核对：领物必须本人持身份证，家长不得代领。\n\n此条为人工确认资料，请保留。', collected);
  assert.equal(edited.editorialPreserved, true);
  assert.match(readDetails(edited.value).text, /人工确认资料/);
  assert.equal(readDetails(edited.value).details.groups.length, 1);
});

test('later collection preserves manual edits and stronger verified entrance notices', () => {
  const previous = writeDetails('old prose', { ...collected.details, registration: { status:'cancelled', verified:true } });
  const manual = mergeGuideText('人工核对的最新规程，不得被下轮采集替换。', previous);
  const incoming = { ...collected, details: { ...collected.details, registration: { status:'unknown', verified:false } } };
  const next = readDetails(reconcileGuide(manual, incoming).value);
  assert.match(next.text,/人工核对/);
  assert.equal(next.details.registration.status,'cancelled');
});

test('a later blocked package preserves complete group facts, family options and fee phases', () => {
  const previous = writeDetails('完整规程', { ...collected.details, groups: [
    { name:'10公里个人组', actualDistanceKm:13.5, ascentM:816, fees:[{label:'普通价',amount:98,unit:'人'},{label:'早鸟价',amount:88,unit:'人'}] },
    { name:'10公里亲子组1大1小', actualDistanceKm:13.5, fees:[{label:'亲子套餐',amount:196,unit:'组'}] }
  ] });
  const incoming = { ...collected, details:{...collected.details, groups:[{name:'10公里个人组',actualDistanceKm:null,fees:[{label:'报名费',amount:98}]}]} };
  const next = readDetails(reconcileGuide(previous,incoming).value).details;
  assert.equal(next.groups.length,2);
  assert.equal(next.groups[0].actualDistanceKm,13.5);
  assert.equal(next.groups[0].ascentM,816);
  assert.equal(next.groups[0].fees.length,2);
  assert.equal(next.groups[0].fees[0].unit,'人');
  assert.equal(next.groups[1].fees[0].amount,196);
  const allBlocked = readDetails(reconcileGuide(previous,{...collected,details:{...collected.details,groups:[]}}).value).details;
  assert.equal(allBlocked.groups.length,2);
});

test('the update plan stays within fixed scope, backs up, preserves prior values and rejects concurrent edits', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'race-apply-test-'));
  try {
    const dbFile = path.join(dir,'app.sqlite'), db = new Database(dbFile);
    db.exec("CREATE TABLE races(id TEXT PRIMARY KEY,name TEXT,guide_text TEXT,groups TEXT,updated_at TEXT,deadline TEXT,reg_start TEXT,signup_url TEXT,phone TEXT);CREATE TABLE race_sheets(id INTEGER PRIMARY KEY,race_id TEXT,kind TEXT,filename TEXT,sort INTEGER,created_at TEXT)");
    db.prepare('INSERT INTO races VALUES(?,?,?,?,?,?,?,?,?)').run('existing','2026样例赛事','举办时间：2026-11-21。','','2026-11-16','2026-11-09','','','12345678');
    const row = db.prepare('SELECT * FROM races').get();
    fs.writeFileSync(path.join(dir,'existing.json'),JSON.stringify({ ...collected, fields: { phone: '99999999', deadline: '2026-11-10' } }));
    const plan = buildPlan({ races:[row] },[{key:'one',raceIds:['existing'],name:row.name}],dir);
    assert.equal(plan.plans[0].updates[0].changes.phone,undefined);
    assert.equal(plan.plans[0].updates[0].changes.deadline,undefined);
    const log = await applyPlan(dbFile,plan,path.join(dir,'apply.json'),path.join(dir,'media'));
    assert.equal(log.rows[0].ok,true); assert.equal(log.schemaUnchanged,true); assert.equal(log.quickCheck,'ok');
    assert.ok(fs.existsSync(log.backup));
    const saved = db.prepare('SELECT * FROM races').get();
    assert.equal(saved.deadline,'2026-11-09'); assert.equal(saved.phone,'12345678');
    assert.equal(readDetails(saved.guide_text).details.groups[0].actualDistanceKm,13.5);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM races').get().n,1);
    const conflict = await applyPlan(dbFile,plan,path.join(dir,'conflict.json'),path.join(dir,'media'));
    assert.equal(conflict.rows[0].ok,false); assert.equal(conflict.rows[0].error,'race_changed_since_snapshot');
    db.close();
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
