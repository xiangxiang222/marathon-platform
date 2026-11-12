// Actual Page and Component VM logic. All request/native UI effects stay in memory.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const f=require('./club-mileage-test-fixture.cjs');
const out=path.resolve(f.ROOT,process.env.MILEAGE_AUDIT_OUT||'design/previews/club-mileage-20261111');
const report={kind:'Mini mileage Component, member/group/activity Page VM acceptance; mocked transport/native UI, not WeChat device',checks:[]};
async function check(name,work){await work();report.checks.push({name,passed:true});}
function queryOf(url){return Object.fromEntries(new URL(url,'https://fixture.invalid').searchParams);}
function boardComponent(){const fixture=f.miniFixture('components/mileage-board/mileage-board',{clubId:'44',embedded:true});fixture.setReply(async url=>f.boardFixture(queryOf(url)));return fixture;}
async function profilePage(user='2'){const fixture=f.miniFixture('pages/member-profile/member-profile');fixture.instance.onLoad({club:'44',user,range:'week',date:'2026-12-31'});fixture.setReply(async(url,method,body)=>url==='/me/introduction'?{introduction:body.introduction}:f.profileFixture(fixture.instance.userId,queryOf(url)));await fixture.instance.load();return fixture;}
async function groupsPage(staff=true){const fixture=f.miniFixture('pages/training-groups/training-groups');const state={groups:f.copy(f.groups),members:f.copy(f.members),staff};fixture.instance.onLoad({club:'44'});fixture.setReply(async(url,method='GET',body)=>{
  if(url==='/clubs/44/training-groups'&&method==='GET')return f.copy(state);
  if(url==='/clubs/44/training-groups'&&method==='POST'){state.groups.push({...body,id:704,memberCount:0});return{group:state.groups.at(-1)};}
  if(url==='/clubs/44/training-groups/701'&&method==='PUT'){Object.assign(state.groups[0],body);return{group:state.groups[0]};}
  if(url==='/clubs/44/training-groups/701'&&method==='DELETE'){state.groups=state.groups.filter(g=>g.id!==701);return{ok:true};}
  if(url==='/clubs/44/training-groups/members/2'&&method==='PUT'){state.members[1].groupId=body.groupId;return{ok:true};}
  throw Error('Unexpected request '+method+' '+url);
});await fixture.instance.load();return{...fixture,state};}
async function activityPage(){const fixture=f.miniFixture('pages/activity-create/activity-create');fixture.instance.clubId='44';fixture.setReply(async(url,method='GET',body)=>{
  if(url==='/me')return{user:{id:1}};
  if(url==='/clubs/44')return f.clubFixture();
  if(url==='/clubs/44/training-groups')return{groups:f.groups,members:f.members,staff:true};
  if(url==='/clubs/44/activity-templates'&&method==='GET')return{templates:[]};
  if(url==='/clubs/44/activity-templates'&&method==='POST')return{template:{id:801,name:body.name,config:body.config,version:1}};
  if(url==='/clubs/44/activities'&&method==='POST')return{activity:{id:900}};
  throw Error('Unexpected request '+method+' '+url);
});await fixture.instance.load();await f.tick();return fixture;}
async function main(){
  await check('component defaults to Beijing month and five ranges send exact current period requests',async()=>{
    const x=boardComponent();await x.lifecycle('attached');await f.tick();assert.equal(x.instance.data.date,'2027-01-01');assert.equal(x.instance.data.board.kmLabel,'720');
    for(const [range,km]of [['day','60'],['week','240'],['month','720'],['year','4800'],['all','12000']]){x.instance.pickRange(f.event({range}));await f.tick();assert.equal(x.instance.data.board.kmLabel,km);assert.equal(queryOf(x.requests.at(-1)[0]).range,range);}
    assert.equal(x.instance.data.board.groups.length,3,'Unassigned is a filter, not a fourth permanent group');
  });
  await check('component supports all/zero/real/empty groups and case-insensitive composed local search',async()=>{
    const x=boardComponent();await x.lifecycle('attached');await f.tick();
    x.instance.pickGroup(f.event({id:701}));await f.tick();assert.equal(queryOf(x.requests.at(-1)[0]).groupId,'701');assert.equal(x.instance.data.shownRank.length,3);
    x.instance.onQuery(f.input(' 河畔 '));assert.equal(x.instance.data.shownRank.length,1);
    x.instance.pickGroup(f.event({id:0}));await f.tick();assert.equal(x.instance.data.query,'');assert.equal(x.instance.data.shownRank.length,1);assert.equal(x.instance.data.shownRank[0].userId,6);
    x.instance.pickGroup(f.event({id:703}));await f.tick();assert.equal(x.instance.data.shownRank.length,0);assert.equal(x.instance.data.board.summary.km,0);
    x.instance.pickGroup(f.event({id:''}));await f.tick();assert.equal(queryOf(x.requests.at(-1)[0]).groupId,undefined);assert.equal(x.instance.data.shownRank.length,6);
  });
  await check('compact group overview expands without requests; picker maps stable group IDs and account switches reset it',async()=>{
    const x=boardComponent();
    const groups=[...f.groups,...[704,705,706].map(id=>({id,name:'同频进阶与周末长距离训练伙伴第'+id+'组',pace:'6:00 /km',memberCount:0}))];
    x.setReply(async url=>f.boardFixture(queryOf(url),{groups}));await x.lifecycle('attached');await f.tick();
    assert.equal(x.instance.data.shownGroups.length,4);const before=x.requests.length;
    x.instance.toggleGroups();assert.equal(x.instance.data.shownGroups.length,6);assert.equal(x.requests.length,before);
    x.instance.selectGroup(f.input('6'));await f.tick();assert.equal(queryOf(x.requests.at(-1)[0]).groupId,'706');const selected=x.requests.length;x.instance.toggleGroups();assert.equal(x.instance.data.groupId,'706');assert.equal(x.instance.data.shownGroups.length,4);assert.equal(x.requests.length,selected);
    x.instance.selectGroup(f.input('7'));await f.tick();assert.equal(queryOf(x.requests.at(-1)[0]).groupId,'0');
    x.instance.selectGroup(f.input('0'));await f.tick();assert.equal(queryOf(x.requests.at(-1)[0]).groupId,undefined);
    const count=x.requests.length;x.instance.selectGroup(f.input('999'));assert.equal(x.requests.length,count);
    x.instance.toggleGroups();x.setAccount('new-account');await x.pageLifecycle('show');await f.tick();assert.equal(x.instance.data.groupsExpanded,false);assert.equal(x.instance.data.shownGroups.length,4);assert.equal(x.instance.data.groupId,'');
  });
  await check('natural week/year navigation can return to current period across year and Saturday anchor',async()=>{
    const x=boardComponent();await x.lifecycle('attached');await f.tick();
    x.instance.setData({range:'year',date:'2026-12-31'});await x.instance.load();assert.equal(x.instance.data.canNext,true);x.instance.changePeriod(f.event({direction:1}));await f.tick();assert.equal(x.instance.data.date,'2027-01-01');assert.equal(x.instance.data.canNext,false);
    x.instance.setData({range:'week',date:'2026-12-26'});await x.instance.load();assert.equal(x.instance.data.canNext,true);x.instance.changePeriod(f.event({direction:1}));await f.tick();assert.equal(x.instance.data.board.period.from,'2026-12-28');assert.equal(x.instance.data.canNext,false);
    const before=x.requests.length;x.instance.setData({range:'all'});x.instance.changePeriod(f.event({direction:1}));assert.equal(x.requests.length,before);
  });
  await check('late period success and failure cannot overwrite latest board; detached and account/club changes invalidate responses',async()=>{
    const x=boardComponent();await x.lifecycle('attached');await f.tick();const pending=f.deferred();x.setReply(url=>queryOf(url).range==='day'?pending.promise:Promise.resolve(f.boardFixture(queryOf(url))));x.instance.pickRange(f.event({range:'day'}));x.instance.pickRange(f.event({range:'week'}));await f.tick();pending.reject(Error('旧日统计失败'));await f.tick();assert.equal(x.instance.data.board.range,'week');assert.equal(x.instance.data.message,'');
    for(const change of ['account','club','detach']){const y=boardComponent(),p=f.deferred();y.setReply(()=>p.promise);const task=y.lifecycle('attached');if(change==='account')y.setAccount('new-account');if(change==='club')y.instance.properties.clubId='45';if(change==='detach')await y.lifecycle('detached');p.resolve(f.boardFixture());await task;assert.equal(y.instance.data.board,null,change);}
  });
  await check('deleted selected group falls back to all once, while ordinary errors remain retryable',async()=>{
    const x=boardComponent();await x.lifecycle('attached');await f.tick();x.instance.setData({groupId:'701'});x.setReply(url=>queryOf(url).groupId?Promise.reject(Object.assign(Error('没有这个训练组'),{status:404})):Promise.resolve(f.boardFixture(queryOf(url))));await x.instance.load();await f.tick();assert.equal(x.instance.data.groupId,'');assert.equal(x.instance.data.shownRank.length,6);
    x.setReply(()=>Promise.reject(Object.assign(Error('服务暂不可用'),{status:503})));await x.instance.load();assert.equal(x.instance.data.board,null);assert.match(x.instance.data.message,/服务暂不可用/);
  });
  await check('ranking member and permanent-group entries keep club/date/range context',async()=>{
    const x=boardComponent();await x.lifecycle('attached');await f.tick();x.instance.setData({range:'week',date:'2026-12-31'});x.instance.openMember(f.event({id:2}));assert.equal(x.navigation.at(-1),'/pages/member-profile/member-profile?club=44&user=2&tab=mileage&range=week&date=2026-12-31');x.instance.openGroups();assert.equal(x.navigation.at(-1),'/pages/training-groups/training-groups?club=44');
  });
  await check('other member profile reads only scoped aggregate/summary and cannot edit introduction',async()=>{
    const x=await profilePage();assert.equal(x.instance.data.profile.user.id,2);assert.equal(x.instance.data.profile.recentRuns.length,2);assert.equal(x.instance.data.profile.stats.kmLabel,'64.8');x.instance.editIntroduction();await x.instance.saveIntroduction();assert.equal(x.instance.data.editing,false);assert.ok(x.requests.every(row=>row[0].startsWith('/clubs/44/members/2/profile')));
  });
  await check('own introduction trim/save is scoped; changing period while editing preserves unsaved story',async()=>{
    const x=await profilePage('1');x.instance.editIntroduction();x.instance.inputIntroduction(f.input('  跑步是和自己的约定。  '));x.instance.pickRange(f.event({range:'year'}));await f.tick();assert.equal(x.instance.data.introduction,'  跑步是和自己的约定。  ');await x.instance.saveIntroduction();assert.equal(x.instance.data.profile.user.introduction,'跑步是和自己的约定。');assert.equal(x.requests.at(-1)[0],'/me/introduction');assert.equal(x.requests.at(-1)[1],'PUT');
  });
  await check('profile ignores late response after account/member/route lifetime changes',async()=>{
    for(const change of ['account','member','hide']){const x=await profilePage(),pending=f.deferred();x.setReply(()=>pending.promise);const task=x.instance.load();const old=x.instance.data.profile;if(change==='account')x.setAccount('account-b');if(change==='member')x.instance.userId='3';if(change==='hide')x.instance.onHide();pending.resolve({...f.profileFixture(2),user:{...f.members[1],nickname:'旧响应不应出现'}});await task;assert.equal(x.instance.data.profile,old,change);}
  });
  await check('permanent group management creates/edits/removes with confirmation and maps picker option to stable ID',async()=>{
    const x=await groupsPage();x.instance.newGroup();for(const[key,value]of Object.entries({name:'周四间歇组',pace:'5:30',description:'每周四操场见',capacity:'20',sort:'4'}))x.instance.input({...f.event({key}),...f.input(value)});await x.instance.saveGroup();await f.tick();assert.equal(x.state.groups.at(-1).name,'周四间歇组');assert.equal(x.requests.find(row=>row[1]==='POST')[2].capacity,20);
    x.instance.editGroup(f.event({id:701}));x.instance.input({...f.event({key:'name'}),...f.input('晨光轻松进阶组')});await x.instance.saveGroup();await f.tick();assert.equal(x.state.groups[0].name,'晨光轻松进阶组');
    await x.instance.assignMember({...f.event({id:2}),...f.input('2')});assert.equal(x.requests.find(row=>row[0].endsWith('/members/2'))[2].groupId,702);
    await f.tick();x.instance.removeGroup(f.event({id:701}));assert.equal(x.requests.filter(row=>row[1]==='DELETE').length,0);await x.modals.at(-1).success({confirm:false});assert.equal(x.requests.filter(row=>row[1]==='DELETE').length,0);x.instance.removeGroup(f.event({id:701}));await x.modals.at(-1).success({confirm:true});await f.tick();assert.equal(x.state.groups.some(row=>row.id===701),false);
  });
  await check('ordinary member can browse groups/profile but cannot mutate roster or group definitions',async()=>{
    const x=await groupsPage(false);x.instance.newGroup();x.instance.editGroup(f.event({id:701}));await x.instance.saveGroup();await x.instance.assignMember({...f.event({id:2}),...f.input('2')});x.instance.removeGroup(f.event({id:701}));assert.equal(x.instance.data.sheetOpen,false);assert.equal(x.modals.length,0);assert.ok(x.requests.every(row=>!row[1]||row[1]==='GET'));
  });
  await check('group late load/mutation is discarded after account change; failure supports manual activity creation',async()=>{
    const x=await groupsPage(),p=f.deferred();x.setReply(()=>p.promise);const task=x.instance.load();x.setAccount('account-b');p.resolve({groups:[{id:999,name:'旧账号私有组'}],members:[],staff:true});await task;assert.equal(x.instance.data.groups.some(g=>g.id===999),false);
    const a=await activityPage();a.setReply(()=>Promise.reject(Error('暂不可用')));await a.instance.loadTrainingGroups();assert.equal(a.instance.data.club.staff,true);assert.match(a.instance.data.trainingGroupError,/手动安排/);
  });
  await check('activity explicit permanent choices replace untouched default; per-activity edits and custom group remain snapshots',async()=>{
    const x=await activityPage();assert.equal(x.instance.data.groups.length,1);assert.equal(x.instance.data.groups[0].trainingGroupId,undefined);x.instance.chooseTrainingGroup(f.event({id:701}));x.instance.chooseTrainingGroup(f.event({id:702}));assert.deepEqual(Array.from(x.instance.data.groups,row=>row.trainingGroupId),[701,702]);x.instance.groupInput({...f.event({index:0,key:'pace'}),...f.input('6:15')});assert.equal(f.groups[0].pace,'6′00″–6′30″ /km');x.instance.chooseTrainingGroup(f.event({id:702}));assert.equal(x.instance.data.groups[1].enabled,false);
    x.instance.setData({draft:{...x.instance.data.draft,title:'周末长距离',startDate:'2027-01-03',startTime:'07:00',place:'西湖绿道',gatherPlace:'公园南门'}});await x.instance.publish();const posted=x.requests.find(row=>row[0]==='/clubs/44/activities'&&row[1]==='POST')[2];assert.equal(posted.groups.length,1);assert.equal(posted.groups[0].trainingGroupId,701);assert.equal(posted.groups[0].pace,'6:15');
  });
  await check('saving template strips stable group associations; deleted source does not erase copied training arrangement',async()=>{
    const x=await activityPage();x.instance.chooseTrainingGroup(f.event({id:701}));x.instance.saveTemplate();x.instance.inputTemplateName(f.input('每周轻松跑'));await x.instance.confirmSaveTemplate();const saved=x.requests.find(row=>row[0].endsWith('/activity-templates')&&row[1]==='POST')[2];assert.equal(saved.config.groups[0].trainingGroupId,undefined);assert.equal(saved.config.groups[0].name,'晨光轻松组');
    x.setReply(async()=>({groups:[],members:[],staff:true}));await x.instance.loadTrainingGroups();assert.equal(x.instance.data.groups[0].name,'晨光轻松组');assert.equal(x.instance.data.groups[0].trainingGroupId,undefined);
  });
  report.passed=true;
}
main().catch(error=>{report.passed=false;report.error=error.stack||String(error);process.exitCode=1;}).finally(()=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'mini-vm-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));});
