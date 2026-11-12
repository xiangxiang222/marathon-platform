const crypto = require('node:crypto');
const { slicePage } = require('./page');

const FIELDS = ['name','nameEn','gender','avatar','bio','article','birthDate','placeOfBirth','team','city','personalBest','seasonBest','seasonYear','seasonEventDate','seasonEventName','eventDate','eventName','eventVenue','personalRecords','careerHighlights','assignments'];
const OWN = (v,k) => Object.prototype.hasOwnProperty.call(v,k);
const plain = v => v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype,null].includes(Object.getPrototypeOf(v));
const hash = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const json = v => v == null ? null : JSON.parse(v);
const TYPES = ['athlete','pacer'];
const DISTANCES = {42.195:'全程马拉松',21.0975:'半程马拉松',10:'10公里',5:'5公里'};
const raceKey=value=>String(value||'').replace(/^caa-(\d+)$/,'$1');
function pacing(target,distance){const parts=String(target||'').split(':');if(!target)return '';const seconds=parts.reduce((s,n)=>s*60+Number(n),0)*(parts.length===2?60:1),per=Math.round(seconds/distance);return Math.floor(per/60)+':'+String(per%60).padStart(2,'0');}
function installProfiles(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS content_profiles (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, origin TEXT NOT NULL, base_json TEXT NOT NULL DEFAULT '{}',
    public_state TEXT NOT NULL DEFAULT 'draft', published_patch TEXT, draft_patch TEXT,
    revision INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS content_profiles_type ON content_profiles(type,public_state);`);
}
function failure(code,message) { const error=new Error(message);error.status=code;throw error; }
function text(value,label,limit) {
  if(typeof value!=='string')failure(400,label+'须为文字');
  const result=value.trim();if(result.length>limit||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result))failure(400,label+'过长或含无效字符');return result;
}
function date(value,label) {
  const s=text(value,label,10);if(s&&(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s))failure(400,label+'须为有效日期');return s;
}
function clock(value,label,pace=false,target=false) {
  const s=text(value,label,20);if(s&&(!(pace?/^\d{1,2}:[0-5]\d$/:target?/^\d{1,2}:[0-5]\d(?::[0-5]\d)?$/:/^\d{1,2}:[0-5]\d:[0-5]\d(?:\.\d{1,3})?$/).test(s)||s.split(':').every(n=>Number(n)===0)))failure(400,label+(pace?'须为有效的分:秒':target?'须为有效的时:分或时:分:秒':'须为有效的时:分:秒'));return s;
}
function avatar(value) {
  const s=text(value,'头像地址',2000);if(!s)return s;
  if(s.startsWith('/')&&!s.startsWith('//')&&!/[\\\s?#]/.test(s)){
    try{if(decodeURIComponent(s).split('/').some(part=>part==='..'||part==='.')||decodeURIComponent(s).includes('\\'))failure(400,'头像地址不正确');return s;}catch{failure(400,'头像地址不正确');}
  }
  try{const u=new URL(s);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}
  failure(400,'头像请填写 HTTPS 图片或本站图片路径');
}
function recordList(value,label,limit,parser) {
  if(!Array.isArray(value)||value.length>limit)failure(400,label+'数量不正确');return value.map((row,i)=>{if(!plain(row))failure(400,label+'第'+(i+1)+'项不正确');return parser(row);});
}
function parseEditable(input,type,publishing) {
  if(!plain(input)||Buffer.byteLength(JSON.stringify(input))>150000)failure(400,'人物资料格式不正确或内容过长');
  const out={};
  for(const key of FIELDS){if(!OWN(input,key))continue;const value=input[key];
    if(['name','nameEn','placeOfBirth','team','city','seasonEventName','eventName','eventVenue'].includes(key))out[key]=text(value,key==='name'?'姓名':'资料字段',key==='name'?80:200);
    else if(key==='bio')out.bio=text(value,'简介',1600);
    else if(key==='gender'){if(!['','men','women'].includes(value))failure(400,'请选择男子或女子');out.gender=value;}
    else if(key==='avatar')out.avatar=avatar(value);
    else if(['birthDate','seasonEventDate','eventDate'].includes(key))out[key]=date(value,'日期');
    else if(['personalBest','seasonBest'].includes(key))out[key]=clock(value,'全马成绩');
    else if(key==='seasonYear'){if(value===''||value==null)out[key]='';else if(Number.isInteger(Number(value))&&Number(value)>=1900&&Number(value)<=2200)out[key]=Number(value);else failure(400,'赛季年份不正确');}
    else if(key==='article'){
      if(!plain(value))failure(400,'人物文章格式不正确');out.article={title:text(value.title??'','文章标题',160),lead:text(value.lead??'','文章导语',1600),body:text(value.body??'','文章正文',40000)};
    }else if(key==='personalRecords')out[key]=recordList(value,'个人最好成绩',30,r=>({discipline:text(r.discipline??'','项目名称',80),mark:text(r.mark??'','成绩',40),date:date(r.date??'','比赛日期'),venue:text(r.venue??'','比赛地点',200)}));
    else if(key==='careerHighlights')out[key]=recordList(value,'比赛履历',100,r=>({date:date(r.date??'','比赛日期'),title:text(r.title??'','比赛名称',200),result:text(r.result??'','比赛成绩',80),position:text(String(r.position??''),'名次',40)}));
    else if(key==='assignments'){
      if(type!=='pacer')failure(400,'运动员档案不能填写官兔任务');
      out.assignments=recordList(value,'配速赛事',100,r=>{
        const distanceKm=r.distanceKm==null||r.distanceKm===''?42.195:Number(r.distanceKm);if(!OWN(DISTANCES,distanceKm))failure(400,'请选择有效的配速距离');
        const item={raceId:raceKey(text(String(r.raceId??''),'赛事标识',160)),raceName:text(r.raceName??'','赛事名称',200),raceDate:date(r.raceDate??'','赛事日期'),city:text(r.city??'','赛事城市',80),raceGrade:r.raceGrade||'A',targetTime:clock(r.targetTime??'','目标完赛时间',false,true),distanceKm,status:r.status||'provisional'};
        if(r.pace)clock(r.pace,'配速',true);item.pace=pacing(item.targetTime,distanceKm);
        if(!item.raceId||/[\s\\/?#]/.test(item.raceId)||!item.raceName||item.raceGrade!=='A'||!['provisional','published','confirmed','completed','cancelled'].includes(item.status))failure(400,'请补全有效的 A 类赛事和配速状态');
        if(item.status==='completed'&&(!item.raceDate||item.raceDate>new Date(Date.now()+8*3600000).toISOString().slice(0,10)))failure(400,'已担任的配速赛事请填写今天或更早的日期');
        if(r.edition!==''&&r.edition!=null){if(!Number.isInteger(Number(r.edition))||Number(r.edition)<1900||Number(r.edition)>2200)failure(400,'赛事年份不正确');item.edition=Number(r.edition);}return item;
      });
    }
  }
  // No spread of input objects: evidence, ranking and computed identity fields
  // are kept from the collector and cannot be forged by an editor payload.
  for(const forbidden of ['__proto__','constructor','prototype'])if(OWN(input,forbidden))failure(400,'人物资料含不支持的字段');
  if(publishing){if(!out.name||!out.gender||!out.article?.title||!out.article?.body)failure(400,'发布前请补充姓名、性别、文章标题和正文');if(type==='pacer'&&(!out.assignments?.length||out.assignments.some(a=>!a.targetTime)))failure(400,'发布官兔前请补充配速赛事及目标完赛时间');}
  return out;
}
function editable(base){return Object.fromEntries(FIELDS.filter(k=>OWN(base,k)).map(k=>[k,k==='article'?{title:base.article?.title||'',lead:base.article?.lead||'',body:base.article?.body||''}:base[k]]));}
function baseVersion(base){return hash(editable(base||{}));}
function difference(base,value){
  const original=parseEditable(editable(base),base.type||'athlete',false),patch={};
  for(const key of FIELDS){if(!OWN(value,key))continue;const empty=v=>v==null||v===''||Array.isArray(v)&&!v.length||plain(v)&&Object.values(v).every(empty);
    if(empty(original[key])&&empty(value[key])||JSON.stringify(value[key])===JSON.stringify(original[key]))continue;
    patch[key]=value[key];
    // Preserve collector evidence on unchanged record identities. An altered
    // race/target combination is editorial data, not proof from the old roster.
    if(key==='assignments')patch[key]=value[key].map(a=>({...((base.assignments||[]).find(b=>raceKey(b.raceId)===a.raceId&&b.targetTime===a.targetTime&&Number(b.distanceKm||42.195)===a.distanceKm)||{}),...a}));
    if(key==='personalRecords')patch[key]=value[key].map(a=>({...((base.personalRecords||[]).find(b=>b.discipline===a.discipline&&b.mark===a.mark&&b.date===a.date)||{}),...a}));
    if(key==='careerHighlights')patch[key]=value[key].map(a=>({...((base.careerHighlights||[]).find(b=>b.title===a.title&&b.result===a.result&&b.date===a.date)||{}),...a}));
  }return patch;
}
function complete(profile,origin,edited=false){
  const p={...profile};if(origin==='manual')p.editorialOrigin='manual';else if(edited)p.editorialOrigin='edited';
  if(p.article?.body)p.article={...p.article,version:p.article.version||1};
  if(p.type==='pacer'&&p.profileKind==='official_pacer_person'){
    const labels={provisional:'入选公示',published:'已入选',confirmed:'已入选',completed:'已担任',cancelled:'已取消'};
    p.assignments=(p.assignments||[]).map(a=>{const distanceKm=Number(a.distanceKm||42.195);return {...a,raceId:raceKey(a.raceId),distanceKm,distanceLabel:DISTANCES[distanceKm]||'全程马拉松',pace:pacing(a.targetTime,distanceKm),statusLabel:labels[a.status]||'已入选'};}).sort((a,b)=>String(b.raceDate||'').localeCompare(String(a.raceDate||'')));
    p.targetTimes=[...new Set(p.assignments.map(a=>a.targetTime).filter(Boolean))];p.primaryTargetTime=p.targetTimes[0]||'';p.raceCount=new Set(p.assignments.map(a=>a.raceId)).size;
    p.raceBadges=p.assignments.map(a=>({raceId:a.raceId,raceName:a.raceName,label:a.raceName,status:a.status,statusLabel:a.statusLabel})).filter((a,i,all)=>all.findIndex(b=>b.raceId===a.raceId)===i);
    p.verifiedPacerRaceNames=[...new Set(p.assignments.filter(a=>a.status==='completed').map(a=>a.raceName))];p.completedPacerRaceCount=p.verifiedPacerRaceNames.length;
  }
  return p;
}
function state(row,base){return row?.public_state==='archived'?'archived':row?.draft_patch!=null?'draft':row?.public_state||'published';}
function managed(base,row){
  const origin=row?.origin||'collected',fallback=base||json(row?.base_json)||{},patch=json(row?.draft_patch)??json(row?.published_patch)??{};
  const profile=complete({...fallback,...patch,id:row?.id||fallback.id,type:row?.type||fallback.type},origin,!!row?.published_patch);
  return {...profile,status:state(row,base),revision:row?.revision||0,hasDraft:row?.draft_patch!=null,isPublic:row?row.public_state==='published':true,origin,baseVersion:baseVersion(fallback),updatedAt:row?.updated_at||fallback.verifiedAt||'',createdAt:row?.created_at||''};
}
function rowFor(db,id){return db.prepare('SELECT * FROM content_profiles WHERE id=?').get(id);}
function published(base,row){if(row&&row.public_state!=='published')return null;return complete({...base,...(json(row?.published_patch)||{})},row?.origin||'collected',row?.published_patch!=null);}
function publicDataset(db,type,data){
  const canonical=type==='historicalAthlete'?'athlete':type;
  if(!TYPES.includes(canonical))return data;
  const records=db.prepare('SELECT * FROM content_profiles WHERE type=?').all(canonical),byId=new Map(records.map(r=>[r.id,r]));
  const profiles=data.profiles.map(base=>published(base,byId.get(base.id))).filter(Boolean);
  if(type===canonical)for(const row of records)if(row.origin==='manual'&&!profiles.some(p=>p.id===row.id)){const p=published({...json(row.base_json),id:row.id,type:row.type,profileKind:row.type==='pacer'?'official_pacer_person':'athlete'},row);if(p)profiles.push(p);}
  return {...data,profiles};
}
function publicOne(db,id,readBase){
  const row=rowFor(db,id);if(!row)return undefined;if(row.public_state!=='published')return null;
  const data=readBase(row.type),base=data.profiles.find(p=>p.id===id)||json(row.base_json)||{};
  return {profile:published({...base,id:row.id,type:row.type,profileKind:row.type==='pacer'?'official_pacer_person':base.profileKind},row),meta:data.meta};
}
function mountProfiles(app,{root,getDb,requireAdmin,readBase}){
  const endpoint=root+'/admin/content/profiles';
  function bases(){return TYPES.flatMap(type=>readBase(type).profiles);}
  function find(id){const db=getDb(),row=rowFor(db,id),base=bases().find(p=>p.id===id);return {row,base};}
  function guard(handler){return (req,res)=>{if(!requireAdmin(req,res))return;try{return handler(req,res);}catch(e){if(e.status)return res.status(e.status).json({error:e.message});throw e;}};}
  app.get(endpoint,guard((req,res)=>{
    const db=getDb(),records=db.prepare('SELECT * FROM content_profiles').all(),byId=new Map(records.map(r=>[r.id,r])),list=bases().map(b=>managed(b,byId.get(b.id)));
    for(const row of records)if(!list.some(p=>p.id===row.id))list.push(managed(null,row));
    const q=String(req.query.q||'').trim().slice(0,200).toLowerCase(),rows=list.filter(p=>(!req.query.type||p.type===req.query.type)&&(!req.query.gender||p.gender===req.query.gender)&&(!req.query.status||p.status===req.query.status)&&(!q||[p.name,p.nameEn,p.bio,p.team,...(p.assignments||[]).map(a=>a.raceName)].join(' ').toLowerCase().includes(q)));
    rows.sort((a,b)=>{const left=byId.get(a.id),right=byId.get(b.id);if(!!left!==!!right)return left?-1:1;return left&&right?right.updated_at.localeCompare(left.updated_at)||right.created_at.localeCompare(left.created_at)||a.id.localeCompare(b.id):0;});
    const page=slicePage(rows,{page:1,pageSize:12,...req.query});
    res.json({profiles:page.rows.map(p=>({...p,article:p.article?{...p.article,body:undefined}:undefined})),total:page.total,page:page.page,pages:page.pages,pageSize:page.pageSize});
  }));
  app.get(endpoint+'/:id',guard((req,res)=>{const {base,row}=find(req.params.id);if(!base&&!row)return res.status(404).json({error:'没有这份人物档案'});res.json({profile:managed(base,row)});}));
  function save(req,res,creating){
    const db=getDb();return db.transaction(()=>{
      const {base,row}=creating?{}:find(req.params.id);if(!creating&&!base&&!row)failure(404,'没有这份人物档案');
      const input=req.body;if(!plain(input)||Buffer.byteLength(JSON.stringify(input))>150000)failure(400,'人物资料格式不正确或内容过长');for(const key of ['__proto__','constructor','prototype'])if(OWN(input,key))failure(400,'人物资料含不支持的字段');const type=creating?input.type:row?.type||base.type;if(!TYPES.includes(type))failure(400,'请选择运动员或官兔');
      if(!creating){if(input.type!=null&&input.type!==type||input.id!=null&&input.id!==req.params.id)failure(400,'不能修改人物编号或类别');if(!Number.isSafeInteger(input.revision)||input.revision!==(row?.revision||0))failure(409,'资料已更新，请重新打开后再保存');if(input.baseVersion!==baseVersion(base||json(row?.base_json)||{}))failure(409,'采集资料已更新，请重新打开后再保存');}
      const status=input.status||'draft';if(!['draft','published'].includes(status))failure(400,'请选择保存草稿或发布');
      const fallback=base||json(row?.base_json)||{type,profileKind:type==='pacer'?'official_pacer_person':'athlete'},current=creating?fallback:managed(base,row);
      const fields=parseEditable({...editable(current),...Object.fromEntries(FIELDS.filter(k=>OWN(input,k)).map(k=>[k,input[k]]))},type,status==='published');
      const patch=difference(fallback,fields),stamp=new Date().toISOString(),id=creating?'manual-'+type+'-'+crypto.randomUUID():req.params.id,origin=creating?'manual':row?.origin||'collected';
      const publicState=status==='published'?'published':row?.public_state||(creating?'draft':'published'),pub=status==='published'?JSON.stringify(patch):row?.published_patch??null,draft=status==='draft'?JSON.stringify(patch):null;
      if(row)db.prepare('UPDATE content_profiles SET public_state=?,published_patch=?,draft_patch=?,revision=revision+1,updated_at=? WHERE id=?').run(publicState,pub,draft,stamp,id);
      else db.prepare('INSERT INTO content_profiles(id,type,origin,base_json,public_state,published_patch,draft_patch,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,type,origin,JSON.stringify(fallback),publicState,pub,draft,'admin:'+req.adminUser,stamp,stamp);
      res.json({profile:managed(base||fallback,rowFor(db,id))});
    }).immediate();
  }
  app.post(endpoint,guard((req,res)=>save(req,res,true)));app.put(endpoint+'/:id',guard((req,res)=>save(req,res,false)));
  app.delete(endpoint+'/:id',guard((req,res)=>getDb().transaction(()=>{
    const db=getDb(),{base,row}=find(req.params.id);if(!base&&!row)failure(404,'没有这份人物档案');
    if(req.body?.revision!==(row?.revision||0)||req.body?.baseVersion!==baseVersion(base||json(row?.base_json)||{}))failure(409,'资料已更新，请重新打开后再下架');
    const stamp=new Date().toISOString();if(row)db.prepare("UPDATE content_profiles SET public_state='archived',revision=revision+1,updated_at=? WHERE id=?").run(stamp,row.id);
    else db.prepare("INSERT INTO content_profiles(id,type,origin,base_json,public_state,created_by,created_at,updated_at) VALUES(?,?,'collected',?,'archived',?,?,?)").run(base.id,base.type,JSON.stringify(base),'admin:'+req.adminUser,stamp,stamp);
    res.json({profile:managed(base,rowFor(db,req.params.id))});
  }).immediate()));
}
module.exports={installProfiles,mountProfiles,publicDataset,publicOne,parseEditable,baseVersion};
