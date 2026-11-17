/* Assemble reviewed writing; this command never generates biography prose. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),DIR=path.join(ROOT,'docs/editorial/china-marathon-20261117'),AS_OF='2026-11-17';
const read=(file)=>JSON.parse(fs.readFileSync(file,'utf8'));
const rows=(file)=>{const p=path.join(DIR,file);if(!fs.existsSync(p))return [];const d=read(p);return Array.isArray(d)?d:d.athletes||[];};
const roster=read(path.join(DIR,'research-roster.json'));
const old=[...read(path.join(ROOT,'shared/elite-athletes-history.json')).athletes,...read(path.join(ROOT,'shared/elite-athletes.json')).athletes];
const oldById=new Map(old.map(p=>[String(p.worldAthleticsId||p.sources?.find(s=>s.url?.includes('/athletes/'))?.url.match(/(?:athlete=|-)(\d+)$/)?.[1]),p]));
const authors=[...rows('men-secondary.json'),...rows('women-secondary.json'),...rows('men-editorial.json'),...rows('women-research.json')];
for(const f of fs.readdirSync(DIR).filter(f=>/^woman-\d+\.json$/.test(f))){const d=read(path.join(DIR,f));authors.push(d);}
const authored=new Map(authors.map(p=>[String(p.worldAthleticsId),p]));
const cards=new Map([...rows('men-research.json'),...rows('women-secondary-cards.json'),...rows('women-research.json')].map(p=>[String(p.worldAthleticsId),p]));
const sec=s=>String(s).split(':').reduce((n,v)=>n*60+Number(v),0);
const months={JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'};
function date(raw){if(/^\d{4}-\d{2}-\d{2}$/.test(raw||''))return raw;const m=String(raw||'').match(/^(\d{1,2}) ([A-Z]{3}) (\d{4})$/);return m?`${m[3]}-${months[m[2]]}-${m[1].padStart(2,'0')}`:'';}
function sourcesFor(a,c,r){const result=[],urls=new Set();for(const s of a.sources||c.sources||[]){if(!s?.url||urls.has(s.url))continue;const u=new URL(s.url);assert.equal(u.protocol,'https:',r.name);urls.add(s.url);result.push({...s,id:'S'+String(s.id||result.length+1).replace(/^S/,''),title:s.title||'公开资料'});}for(const s of r.sources||[]){if(urls.has(s.url))continue;urls.add(s.url);result.push({...s,id:'S'+(result.reduce((n,s)=>Math.max(n,Number(s.id.slice(1))||0),0)+1)});}return result;}
const athletes=roster.athletes.map(r=>{
 const id=String(r.worldAthleticsId),a=authored.get(id),c=cards.get(id)||a;
 assert.ok(a?.article?.body||a?.body,`Missing reviewed article: ${r.name} (${id})`);
 assert.ok((r.activityEvidence||[]).some(e=>e.date>='2024-11-17'&&e.date<=AS_OF&&e.mark!=='DNS'),`Missing activity: ${r.name}`);
 const base={...(oldById.get(id)||{})};
 // The existing Zhang Deshun thumbnail is a group shot without an individual
 // identity marker; retain it in the legacy library, not as this portrait.
 if(id==='14693572'){base.avatar='';base.photoStatus='awaiting_identifiable_portrait';delete base.avatarSourceUrl;delete base.photoSourceTitle;}
 const article={...(a.article||{title:a.title,lead:a.lead,body:a.body})};
 article.body=article.body.replace(/〔(\d+)〕/g,'[S$1]').replace(/\[(\d+)\]/g,'[S$1]');article.version=3;article.updatedAt=AS_OF;
 article.characterCount=(article.body.match(/[\p{Script=Han}]/gu)||[]).length;
 const sources=sourcesFor(a,c,r),ids=new Set(sources.map(s=>s.id));for(const hit of article.body.matchAll(/\[(S\d+)\]/g))assert.ok(ids.has(hit[1]),`${r.name}: citation ${hit[1]} is unbound`);
 let progression=base.seasonProgression||[];
 const rawFile=path.join(DIR,'evidence',id+'.json');
 // Explicit evidence remains in the research bundle; existing official-cache
 // progression is retained with its original source URL and capture date.
 if(!progression.length&&Array.isArray(c.seasonProgression||c.recordEvidence?.marathonProgression))progression=(c.seasonProgression||c.recordEvidence.marathonProgression).map(v=>({...v,year:Number(v.year||v.season),date:date(v.date),sourceUrl:sources[0]?.url}));
 progression=progression.filter(v=>!v.notLegal&&v.date&&v.date<=AS_OF);
 if(!progression.length)progression=[{year:Number(r.pbDate.slice(0,4)),mark:r.personalBest,date:r.pbDate,event:r.pbVenue,venue:r.pbVenue,sourceUrl:r.pbSourceUrl}];
 const theme=a.theme||c.theme||a.editorial?.theme||c.editorialQuestions?.memorableTrait||article.title;
 const question=a.centralQuestion||c.centralQuestion||a.editorial?.centralQuestion||article.lead;
 return {...base,id:base.id||'athlete-'+id,worldAthleticsId:id,type:'athlete',name:r.name,nameEn:r.nameEn,gender:r.gender,profileKind:'editorial_athlete',rank:r.pbRank,pbRank:r.pbRank,displayOrder:r.displayOrder,rankingType:'personal_best',personalBest:r.personalBest,personalBestDisplay:r.personalBest,eventDate:r.pbDate,eventVenue:r.pbVenue,eventName:r.pbVenue,birthDate:r.birthDate||base.birthDate||'',article,sources,seasonProgression:progression,verifiedAt:AS_OF,
  personalRecords:(base.personalRecords||[]).filter(v=>v.discipline!=='全程马拉松').concat([{discipline:'全程马拉松',mark:r.personalBest,date:r.pbDate,venue:r.pbVenue,sourceUrl:r.pbSourceUrl}]),
  bio:article.lead,
  feature:{collectionId:'china-marathon-20261117',asOf:AS_OF,theme,centralQuestion:question,editorialAnswers:a.editorialAnswers||c.editorialAnswers||c.editorialQuestions||{memorableTrait:theme,definingRaceOrChoice:c.representativeRace||a.representativeRace||question,whyRead:c.readerValue||a.readerValue||article.lead},evidenceNote:'正文引注对应下方来源。成绩采用世界田联认可全马PB；近24个月正式参赛用于现役筛选。部分历年资料沿用2026-11-12官方快照，各来源列明实际核读状态。作者推算与资料不足之处在正文说明。',countryEvidence:r.countryEvidence,activityEvidence:r.activityEvidence,retirementReview:r.retirementReview||null,sourceCard:{facts:a.facts||c.facts||[],conflicts:a.conflicts||c.conflicts||a.conflictNotes||c.conflictNotes||[],boundaries:a.boundaries||c.boundaries||c.researchBoundary||article.evidenceBoundary||''},graphicUrl:'/marathon/images/athlete-feature/'+id+'.png',graphicAlt:r.name+'已收录全马年度最佳成绩图，详细数值见图中文字',graphicCaption:'世界田联已收录全马年度最佳；选取最多8个赛季。条长从零表示总用时，短条更快；空缺年份不代表没有参赛。数据出处见官方运动员资料。'}};
});
for(const gender of ['men','women']){const list=athletes.filter(p=>p.gender===gender);assert.equal(list.length,20);assert.equal(new Set(list.map(p=>p.worldAthleticsId)).size,20);for(let i=1;i<list.length;i++)assert.ok(sec(list[i-1].personalBest)<=sec(list[i].personalBest));}
assert.equal(new Set(athletes.map(p=>p.id)).size,40);
const output={version:1,collectionId:'china-marathon-20261117',title:'赛道人物：中国马拉松运动员档案',asOf:AS_OF,rankingBasis:'世界田联 CHN 归属运动员、认可全程马拉松个人最好成绩（PB），按性别分别升序；每人一项成绩。',rankingNotice:'中国马拉松人物专题 · 男女各20人，按认可全马PB排序，非综合实力榜。资料截止2026-11-17；相同PB并列，边界以更早取得该PB者优先入选。',activityRule:'现役口径：2024-11-17至2026-11-17在任一正式田径或路跑比赛有实际参赛记录，所查公开资料未见退出竞技马拉松公告；离开专业队但继续正式竞赛者计入。CHN为公开竞赛归属，不推定现国家队身份。',rankingStatus:roster.rankingStatus,coverage:{men:20,women:20,total:40,withArticles:athletes.length,withPhotos:athletes.filter(p=>p.avatar).length},sources:roster.sources||[],athletes};
const reviewDir=path.join(DIR,'profiles');fs.mkdirSync(reviewDir,{recursive:true});
const index=['# 赛道人物 · 40人档案审稿目录','','资料截止2026-11-17。篇幅随公开材料调整；每篇的引注可直达原始来源。','','完整口径与排除依据见 [名单审计](ranking-audit.md)。',''];
for(const p of athletes){
 const filename=p.worldAthleticsId+'.md',sourceMap=new Map(p.sources.map(s=>[s.id,s.url]));
 const body=p.article.body.replace(/\[(S\d+)\]/g,(all,id)=>sourceMap.has(id)?'['+id+']('+sourceMap.get(id)+')':all);
 fs.writeFileSync(path.join(reviewDir,filename),'# '+p.article.title+'\n\n'+p.article.lead+'\n\n'+body+'\n\n## 资料与出处\n\n'+p.sources.map(s=>'- ['+s.id+' · '+s.title+']('+s.url+')').join('\n')+'\n');
 index.push('- '+(p.gender==='men'?'男子':'女子')+' PB #'+p.pbRank+' · ['+p.article.title+'](profiles/'+filename+') · '+p.personalBest);
}
fs.writeFileSync(path.join(DIR,'profiles-index.md'),index.join('\n')+'\n');
fs.writeFileSync(path.join(DIR,'research-cards.json'),JSON.stringify({asOf:AS_OF,athletes:athletes.map(p=>({name:p.name,worldAthleticsId:p.worldAthleticsId,personalBest:p.personalBest,pbDate:p.eventDate,...p.feature,sources:p.sources}))},null,2)+'\n');
const target=path.join(ROOT,'shared/china-marathon-feature.json');fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({file:path.relative(ROOT,target),profiles:40,characters:athletes.reduce((n,p)=>n+p.article.characterCount,0),rankingStatus:output.rankingStatus}));
module.exports={athletes,output};
