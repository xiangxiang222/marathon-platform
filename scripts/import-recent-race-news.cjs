'use strict';
/* Publish verified recent race reporting and remove explicitly labelled news
 * fixtures. Dry runs never create tables. Apply keeps a separate before-image,
 * never edits races/accounts, and protects editorial changes or withdrawals. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const STATE='recent_race_news_import_state';
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const hash=row=>digest(JSON.stringify(Object.keys(row).sort().map(k=>[k,row[k]])));
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const cstDay=now=>new Date(new Date(now).getTime()+8*3600000).toISOString().slice(0,10);
const shiftDay=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const tableExists=(db,name)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const normalize=value=>String(value||'').normalize('NFKC').replace(/[\s·•・()（）【】\[\]，,。.:：-]/g,'').toLowerCase();
const cityName=value=>normalize(value).replace(/市$/,'');
function url(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
function text(value,label,limit,required=true){if(typeof value!=='string'||value.length>limit||required&&!value.trim())throw Error(label+'格式不正确');return value.trim();}
function summaryOf(body){return body.split(/\n\s*\n/).map(p=>p.trim()).find(p=>p&&!/^#{1,6}\s/.test(p))?.replace(/\*\*/g,'').slice(0,180)||'';}
function isMock(row){
  const explicit=/^(?:【(?:模拟|测试|体验)】|\[(?:模拟|测试|体验)\])/;
  if(explicit.test(String(row.title||'').trim())||explicit.test(String(row.source||'').trim()))return true;
  return /^scenario-news-[1-8]$/.test(row.article_key||'')&&String(row.body||'').includes('仅供模拟场景演示，不是真实赛事、报名、奖励或合作承诺。');
}
function readOptions(options={}){
  const now=new Date(options.now||Date.now());if(!Number.isFinite(now.getTime()))throw Error('当前时间不正确');
  const until=options.until||cstDay(now),since=options.since||shiftDay(until,-6);
  if(!validDay(since)||!validDay(until)||since>until||until>cstDay(now))throw Error('资讯日期窗口不正确');
  return {now,since,until,dryRun:options.dryRun!==false,mapping:options.mapping||{},backupFile:options.backupFile};
}
function parseArticle(raw,opts){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('资讯条目格式不正确');
  const title=text(raw.title,'标题',80),body=text(raw.body,'正文',20000),source=text(raw.source||'跑圈编辑部','来源',40);
  if(body.length<300)throw Error('资讯正文不足300字符：'+title);
  const publishedAt=text(raw.publishedAt,'发布日期',10);
  if(!validDay(publishedAt)||publishedAt<opts.since||publishedAt>opts.until)throw Error('资讯日期不在指定窗口：'+title);
  const sourceUrl=url(raw.sourceUrl);if(!sourceUrl)throw Error('须保留有效的 HTTPS 资料链接：'+title);
  const sourceKey=digest(sourceUrl),key='race-news-'+sourceKey.slice(0,20);
  if(raw.key!=null)text(raw.key,'资料标识',160);
  const refs=raw.sourceRefs||[{title:'事实核对资料',url:sourceUrl}];
  if(!Array.isArray(refs)||!refs.length||refs.length>15)throw Error('资料来源数量不正确：'+title);
  const sourceRefs=refs.map(r=>{const link=url(r?.url);if(!link)throw Error('资料来源链接不正确：'+title);return {title:text(r.title||'事实核对资料','资料标题',200),url:link};});
  const race=raw.race;if(!race||typeof race!=='object'||Array.isArray(race))throw Error('缺少关联赛事：'+title);
  if(!validDay(race.raceDate)||!race.name||!race.city)throw Error('关联赛事须包含名称、日期和城市：'+title);
  const edition=Number(race.edition||race.raceDate.slice(0,4));if(edition!==Number(race.raceDate.slice(0,4)))throw Error('关联赛事年份与日期不符：'+title);
  return {title,body,source,summary:raw.summary?text(raw.summary,'摘要',400):summaryOf(body),publishedAt,sourceUrl,sourceKey,key,sourceRefs,inputKey:raw.key||'',race:{...race,edition}};
}
function matchRace(db,item,mapping){
  const races=db.prepare('SELECT id,name,city,race_date FROM races').all();
  const explicit=mapping[item.inputKey]||mapping[item.sourceUrl]||item.race.raceId;
  let candidates=[];
  if(explicit)candidates=races.filter(r=>r.id===explicit);
  else if(item.race.officialId){
    const id=String(item.race.officialId).replace(/^caa-/,'');
    candidates=races.filter(r=>r.id==='caa-'+id);
    if(tableExists(db,'official_races')){const linked=db.prepare("SELECT race_id FROM official_races WHERE official_id=? AND race_id!=''").get(id);if(linked&&!candidates.some(r=>r.id===linked.race_id)){const row=races.find(r=>r.id===linked.race_id);if(row)candidates.push(row);}}
  }else candidates=races.filter(r=>normalize(r.name)===normalize(item.race.name));
  candidates=candidates.filter(r=>r.race_date===item.race.raceDate&&cityName(r.city)===cityName(item.race.city)&&!isMock({title:r.name}));
  return candidates.length===1?{race:candidates[0]}:{reason:candidates.length?'赛事匹配不唯一':'没有匹配到日期、城市一致的真实赛事'};
}
function build(db,raw,opts){
  if(!Array.isArray(raw))throw Error('输入须为赛事资讯数组');
  for(const table of ['news','news_submissions','races'])if(!tableExists(db,table))throw Error('业务表尚未初始化：'+table);
  const prepared=raw.map(row=>parseArticle(row,opts));
  if(new Set(prepared.map(x=>x.sourceKey)).size!==prepared.length)throw Error('输入含重复资料链接');
  const states=tableExists(db,STATE)?db.prepare('SELECT * FROM '+STATE).all():[],byKey=new Map(states.map(s=>[s.source_key,s]));
  const mocks=db.prepare('SELECT * FROM news ORDER BY id').all().filter(isMock),mockSubmissions=db.prepare('SELECT * FROM news_submissions ORDER BY id').all().filter(isMock),mockIds=new Set(mocks.map(r=>r.id));
  const inserts=[],updates=[],skipped=[],protectedRows=[],pending=[];
  for(const item of prepared){
    const matched=matchRace(db,item,opts.mapping);if(!matched.race){pending.push({key:item.inputKey,title:item.title,race:item.race,reason:matched.reason});continue;}
    const rowValues={race_id:matched.race.id,title:item.title,summary:item.summary,body:item.body,source:item.source,url:item.sourceUrl,article_key:item.key,published_at:item.publishedAt};
    const entry={item,raceId:matched.race.id,rowValues},state=byKey.get(item.sourceKey);
    if(state){
      const current=db.prepare('SELECT * FROM news WHERE id=?').get(state.news_id);
      if(!current||mockIds.has(current.id)){protectedRows.push({key:item.inputKey,id:state.news_id,reason:'deleted-or-withdrawn'});continue;}
      if(hash(current)!==state.applied_hash){protectedRows.push({key:item.inputKey,id:current.id,reason:'edited-by-operator'});continue;}
      if(Object.entries(rowValues).every(([k,v])=>current[k]===v)&&state.source_refs===JSON.stringify(item.sourceRefs))skipped.push({key:item.inputKey,id:current.id});
      else updates.push({...entry,current});
    }else{
      const foreign=db.prepare('SELECT * FROM news WHERE url=? OR (race_id=? AND article_key=?)').get(item.sourceUrl,matched.race.id,item.key);
      if(foreign&&!mockIds.has(foreign.id)){protectedRows.push({key:item.inputKey,id:foreign.id,reason:'unmanaged-existing-news'});continue;}
      inserts.push(entry);
    }
  }
  return {inserts,updates,mocks,mockSubmissions,states,report:{dryRun:opts.dryRun,window:{since:opts.since,until:opts.until},inputArticles:prepared.length,inserted:inserts.length,updated:updates.length,skipped:skipped.length,protected:protectedRows,pending,deletedMockNews:mocks.length,deletedMockSubmissions:mockSubmissions.length,removedNews:mocks.map(r=>({id:r.id,title:r.title,key:r.article_key})),publications:[...inserts,...updates].map(e=>({title:e.item.title,raceId:e.raceId,publishedAt:e.item.publishedAt,characters:e.item.body.length,key:e.item.key}))}};
}
function importRecentRaceNews(db,raw,options={}){
  const opts=readOptions(options);
  const execute=()=>{
    const plan=build(db,raw,opts);if(opts.dryRun)return plan.report;
    if(!opts.backupFile)throw Error('正式执行须指定独立 --backup 文件');
    const before={createdAt:opts.now.toISOString(),window:plan.report.window,news:plan.mocks,newsSubmissions:plan.mockSubmissions,updatedNews:plan.updates.map(e=>e.current),importState:plan.states};
    fs.writeFileSync(path.resolve(opts.backupFile),JSON.stringify(before,null,2)+'\n',{flag:'wx',mode:0o600});
    db.exec('CREATE TABLE IF NOT EXISTS '+STATE+' (source_key TEXT PRIMARY KEY,source_url TEXT NOT NULL,news_id INTEGER NOT NULL,applied_hash TEXT NOT NULL,source_refs TEXT NOT NULL,updated_at TEXT NOT NULL)');
    for(const [table,rows] of [['news_submissions',plan.mockSubmissions],['news',plan.mocks]])for(const row of rows){const actual=db.prepare('SELECT * FROM '+table+' WHERE id=?').get(row.id);if(!actual||hash(actual)!==hash(row))throw Error('模拟资讯已发生变化，已停止');db.prepare('DELETE FROM '+table+' WHERE id=?').run(row.id);}
    const stamp=opts.now.toISOString(),ids=[];
    for(const entry of [...plan.inserts,...plan.updates]){
      const row={...entry.rowValues,updated_at:stamp};let id;
      if(entry.current){id=entry.current.id;const fields=Object.keys(row);db.prepare('UPDATE news SET '+fields.map(k=>k+'=?').join(',')+' WHERE id=?').run(...Object.values(row),id);}
      else{row.created_at=stamp;const fields=Object.keys(row);id=Number(db.prepare('INSERT INTO news ('+fields.join(',')+') VALUES ('+fields.map(()=>'?').join(',')+')').run(...Object.values(row)).lastInsertRowid);}
      const stored=db.prepare('SELECT * FROM news WHERE id=?').get(id);
      db.prepare('INSERT INTO '+STATE+'(source_key,source_url,news_id,applied_hash,source_refs,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET source_url=excluded.source_url,news_id=excluded.news_id,applied_hash=excluded.applied_hash,source_refs=excluded.source_refs,updated_at=excluded.updated_at').run(entry.item.sourceKey,entry.item.sourceUrl,id,hash(stored),JSON.stringify(entry.item.sourceRefs),stamp);ids.push(id);
    }
    return {...plan.report,backupFile:path.resolve(opts.backupFile),publishedIds:ids};
  };
  return opts.dryRun?execute():db.transaction(execute).immediate();
}
if(require.main===module){
  const args=process.argv.slice(2),value=key=>{const at=args.indexOf(key);return at<0?'':args[at+1];};
  const database=value('--database')||process.env.MARATHON_DB||path.join(__dirname,'../server/data/app.sqlite'),file=value('--input')||path.join(__dirname,'../shared/recent-race-news-20261112.json');
  const Database=require('../server/node_modules/better-sqlite3'),db=new Database(path.resolve(database),{readonly:!args.includes('--apply'),fileMustExist:true});
  try{db.pragma('busy_timeout = 10000');const raw=JSON.parse(fs.readFileSync(file,'utf8'));const options={dryRun:!args.includes('--apply'),backupFile:value('--backup'),...(value('--since')?{since:value('--since')}:{ }),...(value('--until')?{until:value('--until')}:{ }),...(value('--now')?{now:value('--now')}:{ }),...(value('--mapping')?{mapping:JSON.parse(fs.readFileSync(value('--mapping'),'utf8'))}:{})};console.log(JSON.stringify(importRecentRaceNews(db,Array.isArray(raw)?raw:raw.articles,options),null,2));}finally{db.close();}
}
module.exports={importRecentRaceNews,isMock,matchRace};
