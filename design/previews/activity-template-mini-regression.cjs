const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, createFixture, sampleConfig, clone, event, deferred, settle } = require('./activity-template-fixture.cjs');
const portable = require(path.join(ROOT, 'miniprogram/utils/activity-templates.js'));
const out = path.join(__dirname, 'activity-templates-20261110');
const report = { kind: 'Mini training template Page VM acceptance with mocked transport and native UI; no business database access, not a WeChat device test.', checks: [] };
const clean = value => JSON.parse(JSON.stringify(value));
async function check(name, fn) { await fn(); report.checks.push({ name, passed: true }); }
function blank() {
  return { trainingType: 'custom', title: '', issue: '', plannedKm: '', place: '', gatherPlace: '', gatherAt: '', route: '', startDate: '', startTime: '', endDate: '', endTime: '', signupDate: '', signupTime: '', cancelDate: '', cancelTime: '', workout: '', notice: '', note: '', minPeople: '3', minKm: '5', points: '1', review: false };
}
function assertPortable(config) {
  for (const key of ['startsAt','endsAt','signupUntil','cancelUntil','startDate','endDate','issue','mine','signups','checks']) assert.equal(Object.prototype.hasOwnProperty.call(config,key),false,'template must omit '+key);
}
async function main() {
  await check('relative Beijing timing crosses midnight and year boundaries without using host timezone', () => {
    const config = sampleConfig(); config.startTime = '23:30'; config.durationMinutes = 120; config.signupLeadMinutes = 1440;
    const result = portable.fromConfig(config, blank(), '2026-12-31');
    assert.equal(result.draft.startDate,'2026-12-31');
    assert.equal(result.draft.endDate,'2027-01-01'); assert.equal(result.draft.endTime,'01:30');
    assert.equal(result.draft.signupDate,'2026-12-30'); assert.equal(result.draft.signupTime,'23:30');
    assert.equal(result.draft.cancelDate,'2026-12-31'); assert.equal(result.draft.cancelTime,'22:30');
  });
  await check('reusable config strips occurrence, issue and participant state, preserves zero lead times and deep copies groups', () => {
    const config = { ...sampleConfig(), issue:'OLD',startsAt:'2026-01-01T06:30',mine:{signed:true},signups:[{userId:9}],checks:[] };
    const result = portable.fromConfig(config,blank(),'');
    assert.equal(result.draft.startDate,''); assert.equal(result.draft.issue,'');
    result.groups[0].name='本次改名'; assert.equal(config.groups[0].name,'A 组');
    const draft={...result.draft,startDate:'2026-11-14',startTime:'06:30',endDate:'2026-11-14',endTime:'08:00',signupDate:'2026-11-14',signupTime:'06:30',cancelDate:'2026-11-14',cancelTime:'06:30'};
    const saved=portable.toConfig(draft,result.groups,{durationMinutes:'',signupLeadMinutes:'',cancelLeadMinutes:''},false);
    assertPortable(saved); assert.equal(saved.durationMinutes,90); assert.equal(clean(saved).signupLeadMinutes,0); assert.equal(clean(saved).cancelLeadMinutes,0);
  });
  await check('shared template loads, applies without old occurrence data, then recalculates from a newly selected date', async () => {
    const f=createFixture(); await f.load();
    assert.equal(f.page.data.clubTemplates.length,1);
    f.page.input(event({key:'issue'},'旧期次')); f.page.input(event({key:'workout'},'旧内容'));
    f.page.useTemplate(event({source:'saved',id:91}));
    assert.equal(f.page.data.draft.issue,''); assert.equal(f.page.data.draft.startDate,'');
    assert.equal(f.page.data.draft.title,'周三间歇跑'); assert.equal(f.page.data.groups[0].name,'A 组');
    f.page.pickDate(event({key:'startDate'},'2026-12-31'));
    assert.equal(f.page.data.draft.endTime,'08:00'); assert.equal(f.page.data.draft.signupDate,'2026-12-30');
    assert.equal(f.page.data.draft.signupTime,'18:30'); assert.equal(f.page.data.draft.cancelTime,'05:30');
    f.page.groupInput(event({index:0,key:'name'},'本次专用组'));
    assert.equal(f.db.templates[0].config.groups[0].name,'A 组');
  });
  await check('saving current training persists stable fields, reloads shared template, and never alters current occurrence or draft', async () => {
    const f=createFixture(); await f.load(); f.page.useTemplate(event({source:'saved',id:91}));
    f.page.pickDate(event({key:'startDate'},'2026-11-14')); f.page.input(event({key:'issue'},'第 12 期'));
    f.page.saveDraft(); const draftBefore=clone(f.storage.get(f.page.storageKey)), formBefore=clone(f.page.data.draft);
    f.page.saveTemplate(); assert.equal(f.page.data.templateSheetOpen,true);
    f.page.inputTemplateName(event({},'周末固定训练')); await f.page.confirmSaveTemplate();
    assert.equal(f.page.data.templateSheetOpen,false); assert.equal(f.db.templates.length,2);
    const saved=f.db.templates.find(t=>t.name==='周末固定训练'); assertPortable(saved.config);
    assert.equal(saved.config.durationMinutes,90); assert.equal(saved.config.signupLeadMinutes,720);
    assert.deepEqual(clean(f.page.data.draft),formBefore); assert.deepEqual(f.storage.get(f.page.storageKey),draftBefore);
    f.page.setData({clubTemplates:[]}); await f.page.loadTemplates(); assert.equal(f.page.data.clubTemplates.length,2);
    assert.equal(f.requests.filter(args=>args[0].endsWith('/activity-templates')&&args[1]==='POST').length,1);
  });
  await check('template edit and delete preserve unsaved activity, saved draft and published activity snapshots', async () => {
    const f=createFixture(); await f.load(); f.page.useTemplate(event({source:'saved',id:91}));
    f.page.pickDate(event({key:'startDate'},'2026-11-14')); f.page.input(event({key:'issue'},'当次期次')); f.page.saveDraft();
    await f.page.publish(); assert.equal(f.db.published.length,1);
    const activity=clone(f.page.data.draft), groups=clone(f.page.data.groups), stored=clone(f.storage.get(f.page.storageKey)||null), published=clone(f.db.published);
    f.action(0); f.page.manageTemplate(event({id:91})); assert.equal(f.page.data.templateMode,true);
    assert.equal(f.page.data.draft.startDate,''); assert.equal(f.page.data.draft.issue,'');
    f.page.input(event({key:'workout'},'更新后的模板安排')); f.page.timingInput(event({key:'durationMinutes'},'120'));
    f.page.saveTemplate(); await f.page.confirmSaveTemplate();
    assert.equal(f.db.templates[0].version,2); assert.equal(f.db.templates[0].config.workout,'更新后的模板安排');
    assert.equal(f.page.data.templateMode,false); assert.deepEqual(clean(f.page.data.draft),activity); assert.deepEqual(clean(f.page.data.groups),groups);
    assert.deepEqual(f.db.published,published); assert.deepEqual(f.storage.get(f.page.storageKey)||null,stored);
    f.action(1); f.page.manageTemplate(event({id:91})); await settle(); await settle();
    assert.equal(f.db.templates.length,0); assert.deepEqual(clean(f.page.data.draft),activity); assert.deepEqual(f.db.published,published);
  });
  await check('new generic template can be saved with no absolute date or location then returns to the activity', async () => {
    const f=createFixture(); await f.load(); f.page.input(event({key:'title'},'未完成的活动'));
    const before=clone(f.page.data.draft); f.page.newTemplate();
    f.page.input(event({key:'title'},'新间歇训练')); f.page.input(event({key:'gatherAt'},'提前 10 分钟')); f.page.saveTemplate(); assert.equal(f.page.data.templateSheetOpen,true);
    f.page.inputTemplateName(event({},'自定义间歇')); await f.page.confirmSaveTemplate();
    const saved=f.db.templates.find(t=>t.name==='自定义间歇'); assert.ok(saved); assertPortable(saved.config); assert.equal(saved.config.place,''); assert.equal(saved.config.gatherAt,'提前 10 分钟');
    assert.equal(f.page.data.templateMode,false); assert.deepEqual(clean(f.page.data.draft),before);
  });
  await check('invalid template name does not write and closing the sheet retains current form', async () => {
    const f=createFixture(); await f.load(); f.page.saveTemplate(); const before=clone(f.page.data.draft);
    f.page.inputTemplateName(event({},' '.repeat(4))); await f.page.confirmSaveTemplate(); assert.match(f.page.data.templateMessage,/1 到 30/);
    f.page.inputTemplateName(event({},'跑'.repeat(31))); await f.page.confirmSaveTemplate();
    assert.equal(f.requests.filter(args=>args[1]==='POST').length,0); f.page.closeTemplateSheet(); assert.deepEqual(clean(f.page.data.draft),before);
  });
  await check('template load failure allows manual activity publication and can retry successfully', async () => {
    const f=createFixture(); const original=f.setHandler(async(...args)=>{if(args[0].endsWith('/activity-templates')&&!args[1])throw Error('模板载入失败');return original(...args);});
    await f.load(); assert.match(f.page.data.templatesError,/载入失败/);
    f.page.setData({draft:{...blank(),title:'手动训练',place:'操场',gatherPlace:'南门',startDate:'2026-11-14',startTime:'07:00'}});
    await f.page.publish(); assert.equal(f.db.published.length,1); f.setHandler(original); await f.page.loadTemplates(); assert.equal(f.page.data.clubTemplates.length,1);
  });
  await check('version conflict keeps template editor open, preserves unsaved content and refreshes shared rows', async () => {
    const f=createFixture(); await f.load(); f.page.manageTemplate(event({id:91})); f.page.input(event({key:'workout'},'待保存修改'));
    f.db.templates[0].version=2; f.db.templates[0].config.workout='另一位管理员已修改';
    f.page.saveTemplate(); await f.page.confirmSaveTemplate(); await settle();
    assert.match(f.page.data.templateMessage,/更新/); assert.equal(f.page.data.templateMode,true); assert.equal(f.page.data.draft.workout,'待保存修改');
    assert.equal(f.page.data.clubTemplates[0].version,2); assert.equal(f.db.templates[0].config.workout,'另一位管理员已修改');
  });
  await check('ordinary club member cannot load templates or mutate drafts, templates or activities', async () => {
    const f=createFixture({staff:false}); await f.load(); f.page.newTemplate();f.page.useTemplate(event({source:'preset',id:'interval'}));f.page.saveTemplate();await f.page.confirmSaveTemplate();f.page.saveDraft();await f.page.publish();
    assert.equal(f.requests.some(args=>args[0].includes('activity-templates')),false); assert.equal(f.requests.some(args=>args[1]==='POST'||args[1]==='PUT'||args[1]==='DELETE'),false);assert.equal(f.storage.size,0);
  });
  await check('account invalidation clears template editor identity, relative timing and old success text', async () => {
    const f=createFixture();await f.load();f.page.manageTemplate(event({id:91}));f.page.setData({successMessage:'旧账号保存成功'});
    f.switchAccount();f.page.onShow();assert.equal(f.page.data.templateMode,false);assert.equal(f.page.data.editingTemplateId,0);assert.equal(f.page.data.editingTemplateVersion,0);
    assert.equal(f.page.data.successMessage,'');assert.deepEqual(clean(f.page.data.templateTiming),{durationMinutes:'',signupLeadMinutes:'',cancelLeadMinutes:''});
  });
  await check('invalid relative minutes are rejected before JSON can coerce NaN into an empty setting', async () => {
    const f=createFixture();await f.load();f.page.newTemplate();f.page.timingInput(event({key:'durationMinutes'},'abc'));f.page.saveTemplate();await f.page.confirmSaveTemplate();
    assert.ok(f.page.data.templateMessage.length>0);assert.equal(f.requests.some(args=>args[1]==='POST'),false);
  });
  await check('stale template read cannot restore rows after account change', async () => {
    const f=createFixture(), pending=deferred(); const original=f.setHandler((...args)=>args[0].endsWith('/activity-templates')?pending.promise:original(...args));
    await f.load(); f.switchAccount(); f.page.onShow(); pending.resolve({templates:[{id:8,name:'旧账号模板'}]}); await settle();
    assert.equal(f.page.data.club,null); assert.equal(f.page.data.clubTemplates.length,0); assert.match(f.page.data.message,/账号已变化/);
  });
  await check('stale template read cannot cross club navigation', async () => {
    const f=createFixture(), pending=deferred(); const original=f.setHandler((...args)=>args[0]==='/clubs/999/activity-templates'?pending.promise:original(...args));
    await f.load(); f.page.clubId='1000'; await f.load(); pending.resolve({templates:[{id:8,name:'旧跑团模板'}]}); await settle();
    assert.equal(f.page.data.club.id,1000); assert.equal(f.page.data.clubTemplates[0].name,'周三间歇模板');
  });
  await check('late template save after account change does not reveal its row or close a new account context', async () => {
    const f=createFixture(); await f.load(); f.page.saveTemplate();f.page.inputTemplateName(event({},'旧账号保存'));
    const pending=deferred(),original=f.setHandler((...args)=>args[1]==='POST'&&args[0].includes('activity-templates')?pending.promise:original(...args));
    const saving=f.page.confirmSaveTemplate();f.switchAccount();f.page.onShow();pending.resolve({template:{id:200,name:'旧账号保存',config:sampleConfig(),version:1}});await saving;
    assert.equal(f.page.data.club,null);assert.equal(f.page.data.clubTemplates.length,0);assert.equal(f.toasts.length,0);
  });
  await check('older same-club template read cannot overwrite a newly saved template', async () => {
    const f=createFixture(),pending=deferred(),oldRows=clone(f.db.templates);
    const original=f.setHandler((...args)=>args[0].endsWith('/activity-templates')&&!args[1]?pending.promise:original(...args));
    await f.load();f.page.saveTemplate();f.page.inputTemplateName(event({},'读取期间保存的新模板'));await f.page.confirmSaveTemplate();
    pending.resolve({templates:oldRows});await settle();
    assert.ok(f.page.data.clubTemplates.some(row=>row.name==='读取期间保存的新模板'));assert.equal(f.page.data.templatesLoading,false);
  });
  await check('older same-club template read cannot resurrect a deleted template', async () => {
    const f=createFixture();await f.load();const pending=deferred(),oldRows=clone(f.db.templates);
    const original=f.setHandler((...args)=>args[0].endsWith('/activity-templates')&&!args[1]?pending.promise:original(...args));
    const reading=f.page.loadTemplates();f.action(1);f.page.manageTemplate(event({id:91}));await settle();
    assert.equal(f.page.data.clubTemplates.length,0);pending.resolve({templates:oldRows});await reading;
    assert.equal(f.page.data.clubTemplates.length,0);assert.equal(f.page.data.templatesLoading,false);
  });
  await check('unloaded page ignores late shared template response', async () => {
    const f=createFixture(),pending=deferred();const original=f.setHandler((...args)=>args[0].endsWith('/activity-templates')?pending.promise:original(...args));
    await f.load();f.page.onUnload();pending.resolve({templates:[{id:200,name:'迟到模板'}]});await settle();assert.equal(f.page.data.clubTemplates.length,0);
  });
}
main().catch(error=>{report.passed=false;report.error=error.stack;console.error(error);process.exitCode=1;}).finally(()=>{fs.mkdirSync(out,{recursive:true});if(report.passed!==false)report.passed=true;fs.writeFileSync(path.join(out,'mini-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));});
