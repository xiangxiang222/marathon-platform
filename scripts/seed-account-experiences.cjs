'use strict';
/* Gap-only account experiences. Planning is read-only; --apply is explicit.
 * Every inserted business row belongs to a registry entry. Cleanup requires an
 * unchanged full-row hash and no retained dependent rows. No users are edited. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const BATCH='account-experiences-v1';
const REGISTRY='account_experience_seed_registry';
const TAG='[体验]';
const KEYS={clubs:['id'],club_members:['club_id','user_id'],races:['id'],plans:['user_id','race_id'],results:['user_id','race_id','distance'],activities:['id'],activity_signups:['activity_id','user_id'],runs:['id'],mileage_counts:['run_id','club_id'],mileage_rules:['club_id']};
const ORDER=['mileage_counts','activity_signups','results','plans','runs','activities','club_members','mileage_rules','races','clubs'];
const hash=row=>crypto.createHash('sha256').update(JSON.stringify(Object.keys(row).sort().map(k=>[k,row[k]]))).digest('hex');
const keyOf=(table,pk)=>table+'|'+JSON.stringify(Object.keys(pk).sort().map(k=>[k,pk[k]]));
const shift=(ms)=>new Date(ms+8*3600000).toISOString();
const dayAt=(ms)=>shift(ms).slice(0,10);
const addDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function optionsOf(options={}) {
  const now=new Date(options.now || Date.now());if(!Number.isFinite(now.getTime()))throw Error('now 必须为有效日期');
  const accountIds=options.accountIds==null?null:[...new Set(options.accountIds.map(Number))];
  if(accountIds&&(!accountIds.length||accountIds.some(id=>!Number.isSafeInteger(id)||id<1)))throw Error('accountIds 必须为正整数账户列表');
  return {now,accountIds,dryRun:options.dryRun!==false};
}
function exists(db,table) { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table); }
function columns(db,table) { return db.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name); }
function readRow(db,table,pk) {
  if(!Object.hasOwn(KEYS,table)||Object.keys(pk).some(k=>!KEYS[table].includes(k)))throw Error('不支持的体验记录主键');
  return db.prepare('SELECT * FROM '+table+' WHERE '+Object.keys(pk).map(k=>k+'=?').join(' AND ')).get(...Object.values(pk));
}
function registry(db) { return exists(db,REGISTRY)?db.prepare('SELECT * FROM '+REGISTRY+' WHERE batch=?').all(BATCH):[]; }
function usersOf(db,ids) {
  const users=db.prepare('SELECT id FROM users ORDER BY id').all().filter(u=>!ids||ids.includes(u.id));
  if(ids&&users.length!==ids.length)throw Error('部分指定账户不存在');return users;
}
function inventory(db,opts) {
  for(const table of Object.keys(KEYS))if(!exists(db,table))throw Error('数据库尚未初始化业务表：'+table);
  for(const field of ['run_mode','volume_km','source'])if(!columns(db,'runs').includes(field))throw Error('运动表需先完成现有应用迁移：'+field);
  const users=usersOf(db,opts.accountIds),day=dayAt(opts.now.getTime()),month=day.slice(0,7),weekStart=addDays(day,-6),clubs=db.prepare("SELECT * FROM clubs WHERE public_status!='restricted'").all();
  const clubIds=new Set(clubs.map(c=>c.id)),members=db.prepare('SELECT * FROM club_members').all().filter(m=>clubIds.has(m.club_id));
  const plans=db.prepare('SELECT p.* FROM plans p JOIN races r ON r.id=p.race_id').all();
  const results=db.prepare('SELECT s.* FROM results s JOIN races r ON r.id=s.race_id WHERE r.race_date<=?').all(day);
  const runs=db.prepare("SELECT * FROM runs WHERE type IN ('run','trail') AND distance_km>0 AND duration_sec>0 AND substr(started_at,1,10)<=?").all(day);
  const signups=db.prepare('SELECT s.*,a.club_id FROM activity_signups s JOIN activities a ON a.id=s.activity_id JOIN club_members m ON m.club_id=a.club_id AND m.user_id=s.user_id').all();
  const histories=exists(db,'race_history_entries')?db.prepare('SELECT id,user_id,race_id,distance,legacy_key FROM race_history_entries WHERE deleted=0 AND race_date<=?').all(day):[];
  const accounts=users.map(u=>{
    const personalResults=results.filter(r=>r.user_id===u.id),identities=new Set(personalResults.map(r=>r.race_id+'|'+r.distance));
    for(const h of histories.filter(h=>h.user_id===u.id))identities.add(h.race_id?h.race_id+'|'+h.distance:'private|'+h.id);
    return {userId:u.id,members:members.filter(m=>m.user_id===u.id),statuses:new Set(plans.filter(p=>p.user_id===u.id).map(p=>p.status)),plans:plans.filter(p=>p.user_id===u.id),historyCount:identities.size,results:personalResults,monthRuns:runs.filter(r=>r.user_id===u.id&&r.started_at.startsWith(month)),weekRuns:runs.filter(r=>r.user_id===u.id&&r.started_at.slice(0,10)>=weekStart),signupCount:signups.filter(s=>s.user_id===u.id).length};
  });
  return {users,day,month,clubs,accounts};
}
function deficits(accounts) {
  return {clubsEmpty:accounts.filter(a=>!a.members.length).length,clubsBelowTwo:accounts.filter(a=>a.members.length<2).length,plansEmpty:accounts.filter(a=>!a.statuses.size).length,planStatesBelowFour:accounts.filter(a=>a.statuses.size<4).length,historyBelowTwo:accounts.filter(a=>a.historyCount<2).length,monthRunsBelowTwo:accounts.filter(a=>a.monthRuns.length<2).length,weekRunsEmpty:accounts.filter(a=>!a.weekRuns.length).length,signupsBelowTwo:accounts.filter(a=>a.signupCount<2).length};
}
function inspect(db,options={}) {
  const opts=optionsOf(options),data=inventory(db,opts);return {accounts:data.users.length,day:data.day,month:data.month,deficits:deficits(data.accounts)};
}
function build(db,opts) {
  const data=inventory(db,opts),stamp=opts.now.toISOString(),old=new Map(registry(db).map(r=>[r.seed_key,r])),operations=[],refs=new Map(),protectedKeys=[];
  const byAccount=new Map(data.accounts.map(a=>[a.userId,{userId:a.userId,added:{}}]));
  const columnSets=new Map(Object.keys(KEYS).map(t=>[t,new Set(columns(db,t))]));
  const add=(seedKey,table,input,userId=null)=>{
    if(refs.has(seedKey))return refs.get(seedKey);
    const before=old.get(seedKey);
    if(before){const row=readRow(db,table,JSON.parse(before.pk_json));if(row){const value=KEYS[table].length===1?row[KEYS[table][0]]:JSON.parse(before.pk_json);refs.set(seedKey,value);return value;}protectedKeys.push(seedKey);return null;}
    const row=Object.fromEntries(Object.entries(input).filter(([k])=>columnSets.get(table).has(k)));
    const auto=KEYS[table].length===1&&KEYS[table][0]==='id'&&row.id==null;
    const value=auto?'@seed:'+seedKey:KEYS[table].length===1?row[KEYS[table][0]]:Object.fromEntries(KEYS[table].map(k=>[k,row[k]]));
    if(!auto&&!Object.values(row).some(v=>typeof v==='string'&&v.startsWith('@seed:'))&&readRow(db,table,Object.fromEntries(KEYS[table].map(k=>[k,row[k]]))))throw Error('体验标识与未登记的现有记录冲突：'+seedKey);
    operations.push({seedKey,table,row,auto,userId,ref:value});refs.set(seedKey,value);
    if(userId!=null){const account=byAccount.get(userId);if(account)account.added[table]=(account.added[table]||0)+1;}
    return value;
  };
  let sharedClubs;
  const ensureClubs=()=>{
    if(sharedClubs)return sharedClubs;
    if(!data.users.length)return [];
    const owner=data.users[0].id;
    sharedClubs=['晨光慢跑团','周末长跑团','城市夜跑团'].map((name,i)=>{
      const id=add('club:'+i,'clubs',{name:TAG+name,code:'EXPERIENCE-V1-'+i,owner_id:owner,created_at:stamp,city:'体验城市',intro:TAG+'用于功能体验的共享跑团，不代表真实组织或线下活动。',name_key:(TAG+name).normalize('NFKC').toLowerCase(),public_status:'active',moderation_note:TAG+'功能体验'});
      if(id==null)return null;
      const existing=typeof id==='number'?db.prepare('SELECT name FROM clubs WHERE id=?').get(id):null;
      if(existing&&!existing.name.startsWith(TAG))throw Error('共享体验跑团名称已被修改，请保留用户修改后人工处理');
      const account=data.accounts.find(a=>a.userId===owner);
      if(!account.members.some(m=>m.club_id===id)){const member=add('member:'+i+':'+owner,'club_members',{club_id:id,user_id:owner,joined_at:stamp,role:'owner',mileage_group_id:0},owner);if(member)account.members.push({club_id:id,user_id:owner});}
      if(!old.has('rules:'+i))add('rules:'+i,'mileage_rules',{club_id:id,effective_on:data.day,manual_ok:0,run_on:0,trail_on:0,observe:0});
      return id;
    }).filter(id=>id!=null);
    return sharedClubs;
  };
  if(data.accounts.some(a=>a.members.length<2))ensureClubs();
  for(const account of data.accounts){
    const clubs=account.members.length<2?ensureClubs():[];
    for(let n=0;account.members.length<2&&n<clubs.length;n++){
      const club=clubs[(account.userId+n)%clubs.length];if(account.members.some(m=>m.club_id===club))continue;
      const index=clubs.indexOf(club),member=add('member:'+index+':'+account.userId,'club_members',{club_id:club,user_id:account.userId,joined_at:stamp,role:'member',mileage_group_id:0},account.userId);
      if(member)account.members.push({club_id:club,user_id:account.userId});
    }
  }
  const race=(kind,index)=>{
    const past=kind==='history',id=BATCH+'-'+kind+'-'+index,date=addDays(data.day,past?-(21+index*21):21+index*7),distance=past?(index?'half':'10k'):'full,half';
    return add('race:'+kind+':'+index,'races',{id,name:TAG+(past?(index?'城市半程跑史':'公园10公里跑史'):['想跑赛事预览','报名流程预览','抽签进度预览','中签状态预览'][index]),city:'体验城市',province:'体验地区',distances:distance,race_date:date,deadline:past?'':addDays(date,-7),place:TAG+'虚拟路线，无实际集合',source:'',updated_at:stamp,deadline_name:'体验报名',organizer:TAG+'功能体验',kinds:'road',meet:'online',guide_text:TAG+'仅用于个人页面和状态操作体验，不代表真实报名、中签或完赛。'});
  };
  for(const account of data.accounts){
    const uid=account.userId;
    for(const [index,status] of ['想跑','已报名','待抽签','中签'].entries()){
      if(account.statuses.size>=4)break;if(account.statuses.has(status))continue;
      const raceId=race('plan',index);if(raceId==null||account.plans.some(p=>p.race_id===raceId))continue;
      if(add('plan:'+uid+':'+index,'plans',{user_id:uid,race_id:raceId,status,updated_at:stamp,sheet:''},uid))account.statuses.add(status);
    }
    for(let index=0;account.historyCount<2&&index<2;index++){
      const raceId=race('history',index),distance=index?'half':'10k';if(raceId==null||account.results.some(r=>r.race_id===raceId&&r.distance===distance))continue;
      if(add('result:'+uid+':'+index,'results',{user_id:uid,race_id:raceId,distance,seconds:index?7800+(uid%7)*60:3600+(uid%7)*30,story:TAG+'个人跑史功能体验，模拟成绩，不是真实完赛记录。',proof:'',proof_kind:'',source_call_id:0,updated_at:stamp},uid))account.historyCount++;
      if(!account.plans.some(p=>p.race_id===raceId))add('history-plan:'+uid+':'+index,'plans',{user_id:uid,race_id:raceId,status:'完赛',updated_at:stamp,sheet:''},uid);
    }
    const activityClub=account.members.map(m=>m.club_id).find(id=>typeof id==='string'||data.clubs.find(c=>c.id===id)?.name.startsWith(TAG))||account.members[0]?.club_id;
    for(let index=0;account.signupCount<2&&index<2;index++){
      if(activityClub==null)break;
      const clubKey=String(activityClub).replace('@seed:',''),key='activity:'+clubKey+':'+index,start=addDays(data.day,2+index*4)+'T07:00';
      const activityId=add(key,'activities',{club_id:activityClub,title:TAG+(index?'周末轻松长跑':'晨间轻松跑'),place:TAG+'虚拟集合点',starts_at:start,ends_at:start.slice(0,10)+'T08:30',note:TAG+'活动报名与详情功能体验，不代表实际线下集合；不产生积分。',min_km:0,min_people:1,points:0,created_at:stamp,planned_km:index?8:5,gather_place:TAG+'虚拟集合点',gather_at:start.slice(0,10)+'T06:50',route:TAG+'模拟城市绿道',training_type:'easy',signup_until:addDays(start.slice(0,10),-1)+'T20:00',cancel_until:addDays(start.slice(0,10),-1)+'T20:00',workout:TAG+'轻松跑流程体验',notice:TAG+'请勿按此条目到现场集合。',review:0});
      if(activityId==null)continue;
      const already=typeof activityId==='number'&&db.prepare('SELECT 1 FROM activity_signups WHERE activity_id=? AND user_id=?').get(activityId,uid);if(already)continue;
      if(add('signup:'+uid+':'+clubKey+':'+index,'activity_signups',{activity_id:activityId,user_id:uid,group_id:0,gender:'',level:'',pacer:0,created_at:stamp},uid))account.signupCount++;
    }
    let needed=Math.max(0,2-account.monthRuns.length);if(!account.weekRuns.length&&!needed)needed=1;
    const midnight=Date.parse(data.day+'T00:00:00+08:00'),available=Math.max(0,Math.floor((opts.now.getTime()-midnight)/60000)-1),durationMinutes=Math.min(40,Math.floor(available/(needed+1)));
    if(needed&&durationMinutes<1){protectedKeys.push('run:too-early:'+uid);continue;}
    const offset=Math.max(0,Math.min(360,available-needed*(durationMinutes+2)));
    let created=0;
    for(let slot=0;created<needed&&slot<8;slot++){
      const key='run:'+uid+':'+data.month+':'+slot;if(old.has(key))continue;
      const start=midnight+(offset+created*(durationMinutes+2))*60000,duration=durationMinutes*60,pace=390+(uid%3)*15,km=Math.round(duration/pace*100)/100;
      const runId=add(key,'runs',{user_id:uid,type:'run',run_mode:'virtual',started_at:shift(start).slice(0,16),ended_at:shift(start+duration*1000).slice(0,19),distance_km:km,duration_sec:duration,climb_m:0,climb_known:1,import_quality:0,import_edits:'[]',pace_sec:pace,volume_km:km,city:TAG+'虚拟路线',source:'manual',shot:'',overlap:0,created_at:stamp},uid);
      if(runId==null)continue;created++;
      for(const member of account.members)add('count:'+key+':'+member.club_id,'mileage_counts',{run_id:runId,club_id:member.club_id,counted:0,volume_km:0,manual:1,challenge:TAG+'模拟运动，不计真实跑团统计',decision:'out'},uid);
    }
  }
  const inserted=Object.fromEntries(Object.keys(KEYS).map(t=>[t,operations.filter(o=>o.table===t).length]));
  return {operations,report:{batch:BATCH,dryRun:opts.dryRun,accounts:data.users.length,affectedAccounts:[...byAccount.values()].filter(a=>Object.keys(a.added).length).length,day:data.day,before:inspect(db,opts).deficits,inserted,totalRows:operations.length,protectedItems:protectedKeys,byAccount:[...byAccount.values()].filter(a=>Object.keys(a.added).length)}};
}
function seed(db,options={}) {
  const opts=optionsOf(options);
  const execute=()=>{
    const {operations,report}=build(db,opts);if(opts.dryRun)return report;
    db.exec('CREATE TABLE IF NOT EXISTS '+REGISTRY+' (seed_key TEXT PRIMARY KEY,batch TEXT NOT NULL,table_name TEXT NOT NULL,pk_json TEXT NOT NULL,row_hash TEXT NOT NULL,created_at TEXT NOT NULL)');
    const resolved=new Map(),resolve=value=>typeof value==='string'&&value.startsWith('@seed:')?resolved.get(value):value;
    for(const op of operations){
      const row=Object.fromEntries(Object.entries(op.row).map(([k,v])=>[k,resolve(v)]));if(Object.values(row).some(v=>v===undefined))throw Error('体验记录依赖未能解析：'+op.seedKey);
      const fields=Object.keys(row),info=db.prepare('INSERT INTO '+op.table+' ('+fields.join(',')+') VALUES ('+fields.map(()=>'?').join(',')+')').run(...Object.values(row));
      if(op.auto)resolved.set(op.ref,Number(info.lastInsertRowid));
      const pk=Object.fromEntries(KEYS[op.table].map(k=>[k,k==='id'&&op.auto?Number(info.lastInsertRowid):row[k]])),stored=readRow(db,op.table,pk);
      db.prepare('INSERT INTO '+REGISTRY+' (seed_key,batch,table_name,pk_json,row_hash,created_at) VALUES(?,?,?,?,?,?)').run(op.seedKey,BATCH,op.table,JSON.stringify(pk),hash(stored),opts.now.toISOString());
    }
    return {...report,after:inspect(db,opts).deficits};
  };
  return opts.dryRun?execute():db.transaction(execute).immediate();
}
function cleanup(db,options={}) {
  const opts=optionsOf(options);
  if(!opts.dryRun&&!db.inTransaction)return db.transaction(()=>cleanup(db,{...options,now:opts.now,dryRun:false})).immediate();
  const entries=registry(db),candidates=new Map(),missing=[],protectedRows=[];
  const managedKeys=new Set(entries.filter(e=>Object.hasOwn(KEYS,e.table_name)).map(e=>keyOf(e.table_name,JSON.parse(e.pk_json))));
  for(const entry of entries){
    if(!Object.hasOwn(KEYS,entry.table_name)){protectedRows.push({key:entry.seed_key,reason:'unknown-table'});continue;}
    const pk=JSON.parse(entry.pk_json),row=readRow(db,entry.table_name,pk);
    if(!row){missing.push(entry);continue;}
    if(hash(row)!==entry.row_hash){protectedRows.push({key:entry.seed_key,reason:'modified'});continue;}
    candidates.set(keyOf(entry.table_name,pk),{...entry,pk,row});
  }
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t=>t.name).filter(t=>/^\w+$/.test(t)&&t!==REGISTRY),tableColumns=new Map(tables.map(t=>[t,columns(db,t)]));
  const isRemoved=(table,row)=>Object.hasOwn(KEYS,table)&&candidates.has(keyOf(table,Object.fromEntries(KEYS[table].map(k=>[k,row[k]]))));
  const external=(table,rows)=>rows.some(row=>!isRemoved(table,row));
  const retainedChild=entry=>{
    const parent=entry.table_name==='mileage_counts'?['runs',{id:entry.row.run_id}]:entry.table_name==='club_members'?['clubs',{id:entry.row.club_id}]:null;
    if(parent){const key=keyOf(...parent);if(managedKeys.has(key)&&!candidates.has(key))return true;}
    const column={clubs:'club_id',races:'race_id',activities:'activity_id',runs:'run_id'}[entry.table_name];
    if(column)for(const table of tables)if(tableColumns.get(table).includes(column)&&external(table,db.prepare('SELECT * FROM '+table+' WHERE '+column+'=?').all(entry.row.id)))return true;
    if(entry.table_name==='club_members'){
      const r=entry.row,signups=db.prepare('SELECT s.* FROM activity_signups s JOIN activities a ON a.id=s.activity_id WHERE s.user_id=? AND a.club_id=?').all(r.user_id,r.club_id);
      if(external('activity_signups',signups))return true;
    }
    if(['club_members','activity_signups'].includes(entry.table_name)){
      const field=entry.table_name==='club_members'?'club_id':'activity_id';
      for(const table of tables)if(tableColumns.get(table).includes(field)&&tableColumns.get(table).includes('user_id')&&external(table,db.prepare('SELECT * FROM '+table+' WHERE '+field+'=? AND user_id=?').all(entry.row[field],entry.row.user_id)))return true;
    }
    if(entry.table_name==='results')for(const table of ['runner_media','race_history_entries'])if(exists(db,table)&&db.prepare('SELECT 1 FROM '+table+' WHERE user_id=? AND race_id=? AND distance=? LIMIT 1').get(entry.row.user_id,entry.row.race_id,entry.row.distance))return true;
    return false;
  };
  // Propagate a retained child's protection through every ancestor before any
  // delete. This also retains edited records' parent races, clubs and activities.
  for(;;){let changed=false;for(const [key,entry] of candidates)if(retainedChild(entry)){candidates.delete(key);protectedRows.push({key:entry.seed_key,reason:'retained-dependent-row'});changed=true;}if(!changed)break;}
  const deletions=[...candidates.values()].sort((a,b)=>ORDER.indexOf(a.table_name)-ORDER.indexOf(b.table_name)),deleted=Object.fromEntries(Object.keys(KEYS).map(t=>[t,deletions.filter(e=>e.table_name===t).length]));
  const report={batch:BATCH,dryRun:opts.dryRun,deleted,totalRows:deletions.length,missingRows:missing.length,protectedRows};
  if(opts.dryRun)return report;
  return db.transaction(()=>{
    for(const entry of deletions){const row=readRow(db,entry.table_name,entry.pk);if(!row||hash(row)!==entry.row_hash)throw Error('清理期间记录已改变，已停止：'+entry.seed_key);db.prepare('DELETE FROM '+entry.table_name+' WHERE '+Object.keys(entry.pk).map(k=>k+'=?').join(' AND ')).run(...Object.values(entry.pk));db.prepare('DELETE FROM '+REGISTRY+' WHERE seed_key=? AND row_hash=?').run(entry.seed_key,entry.row_hash);}
    for(const entry of missing)db.prepare('DELETE FROM '+REGISTRY+' WHERE seed_key=? AND row_hash=?').run(entry.seed_key,entry.row_hash);
    return report;
  }).immediate();
}
if(require.main===module){
  const args=process.argv.slice(2),value=name=>{const at=args.indexOf(name);return at<0?'':args[at+1];};
  const file=path.resolve(value('--database')||process.env.MARATHON_DB||path.join(__dirname,'../server/data/app.sqlite'));
  if(!fs.existsSync(file))throw Error('请使用 --database 指定已初始化数据库');
  const Database=require('../server/node_modules/better-sqlite3'),db=new Database(file,{readonly:!args.includes('--apply'),fileMustExist:true});
  try{db.pragma('busy_timeout = 10000');const opts={dryRun:!args.includes('--apply'),...(value('--now')?{now:value('--now')}:{ }),...(value('--accounts')?{accountIds:value('--accounts').split(',').map(Number)}:{})};console.log(JSON.stringify(args.includes('--cleanup')?cleanup(db,opts):seed(db,opts),null,2));}finally{db.close();}
}
module.exports={seed,cleanup,inspect};
