const crypto = require('node:crypto');

const unique = values => [...new Set(values.filter(Boolean))];
const clockSeconds = value => /^\d:[0-5]\d(?::[0-5]\d)?$/.test(value || '') ? value.split(':').reduce((a,n)=>a*60+Number(n),0)*(value.split(':').length===2?60:1) : 0;
function normalizeGender(value) { return ['女','women','female','F'].includes(value) ? 'women' : ['男','men','male','M'].includes(value) ? 'men' : ''; }
function normalizeClock(value) {
  const text=String(value||'').trim().replace(/：/g,':');
  if(/^\d:[0-5]\d:[0-5]\d$/.test(text))return text;
  const m=text.match(/^([1-9])\s*小时\s*(\d{1,2})\s*分(?:钟)?\s*(\d{1,2})\s*秒$/);
  if(m&&Number(m[2])<60&&Number(m[3])<60)return `${m[1]}:${m[2].padStart(2,'0')}:${m[3].padStart(2,'0')}`;
  return '';
}
function paceFor(target) { const seconds=clockSeconds(target); if(!seconds)return ''; const pace=Math.round(seconds/42.195);return Math.floor(pace/60)+':'+String(pace%60).padStart(2,'0'); }
function assignmentStatus(value){return ({provisional:'入选公示',published:'已入选',confirmed:'已入选',completed:'已担任',cancelled:'已取消'})[value]||'已入选';}
function buildPacerArticle(person,{asOf}={}){
  const first=person.assignments[0],gender=person.gender==='women'?'女子':person.gender==='men'?'男子':'';
  if(!first)return {title:person.name+'：跑者与配速履历',lead:person.bio||'',body:person.bio||'',version:1,updatedAt:asOf||person.verifiedAt};
  const lead=`${person.name}是一名${gender}马拉松跑者`+(person.personalBest?`，全程马拉松个人最佳为${person.personalBest}`:'')+`。${first.raceName}的配速任务，将${first.targetTime}作为目标完赛时间。`;
  const paragraphs=[`${person.name}的跑步履历包含个人比赛表现与官方配速任务两个部分。`+(person.personalBest?`全马个人最佳${person.personalBest}，是这份履历中已经明确的个人成绩。`:'')];
  const reviewed=(person.biographyFacts||[]).filter(s=>s.verified===true&&s.sourceUrl&&s.body);for(const fact of reviewed)paragraphs.push(fact.body);
  paragraphs.push(...person.assignments.map(a=>{
    const date=a.raceDate?`${a.raceDate.replace(/-/g,'年').replace(/年(\d+)$/,'月$1日')}，`:'';
    const task=a.status==='completed'?`担任${a.raceName}官方配速员`:a.status==='provisional'?`进入${a.raceName}官方配速员公示名单`:`入选${a.raceName}官方配速员阵容`;
    return `${date}${person.name}${task}，分在${a.targetTime}完赛组。`+(a.pace?`按照42.195公里全程距离换算，对应平均配速约${a.pace}/公里。`:'')+(a.status==='provisional'?'这一条配速经历标记为入选公示。':'');
  }));
  if(person.personalBest){const margin=clockSeconds(first.targetTime)-clockSeconds(person.personalBest);if(margin>0)paragraphs.push(`个人最好成绩与本次配速目标之间相差${Math.floor(margin/60)}分${margin%60?margin%60+'秒':''}。个人参赛以完赛成绩衡量表现，担任配速员则围绕约定时间组织行进节奏，两种身份在同一份跑者履历中并存。`);}
  const completed=person.assignments.filter(a=>a.status==='completed');if(completed.length)paragraphs.push(`在已完成的官方配速经历中，${person.name}曾担任${unique(completed.map(a=>a.raceName)).join('、')}的官兔。`);
  return {title:person.name+'：个人成绩与官方配速履历',lead,body:paragraphs.join('\n\n'),version:1,updatedAt:asOf||person.verifiedAt};
}
function sourceFor(race) { return (race.sources||[]).find(s=>/官网官兔|公示|名单/.test(s.title||'')&&!/认证/.test(s.title||''))?.url || race.sources?.[0]?.url || ''; }
function personId(race,member) {
  // A name alone cannot establish that two rosters refer to the same person.
  // A publisher-supplied person key may explicitly join their assignments.
  const key=member.verifiedIdentityKey || `${race.officialRaceId||race.id}\n${normalizeGender(member.gender)}\n${member.name}`;
  return 'official-pacer-person-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,20);
}
function toPacerPeople(dataset) {
  const races=Array.isArray(dataset)?dataset:dataset.profiles||[];
  const people=new Map();
  for(const race of races) {
    if(race.profileKind!=='official_pacer_race'||race.raceGrade!=='A')continue;
    for(const group of race.pacerGroups||[]) {
      const members=group.members?.length?group.members:(group.names||[]).map(name=>({name}));
      for(const member of members) {
        if(!member.name||!/^[\p{L}· .'-]{2,80}$/u.test(member.name))continue;
        const id=personId(race,member),sourceUrl=member.sourceUrl||sourceFor(race),gender=normalizeGender(member.gender);
        const status=member.assignmentStatus&&['completed','confirmed','published','provisional','cancelled'].includes(member.assignmentStatus)?member.assignmentStatus:race.rosterStatus==='provisional'||race.bio?.includes('初步公示')?'provisional':'published';
        const assignment={raceId:race.officialRaceId||race.id,raceProfileId:race.id,raceName:race.name,raceDate:race.raceDate,edition:race.edition,city:race.city,raceGrade:'A',targetTime:group.targetTime,label:group.label,pace:group.pace||paceFor(group.targetTime),status,statusLabel:assignmentStatus(status),sourceUrl,announcementDate:race.announcementDate||'',personalBest:normalizeClock(member.personalBest),timingBasis:group.timingBasis||''};
        let person=people.get(id);
        if(!person){person={id,type:'pacer',profileKind:'official_pacer_person',name:member.name,gender,seasonYear:race.seasonYear||race.edition,role:'A类赛事官方配速员',avatar:member.avatar||'',avatarSourceUrl:member.avatarSourceUrl||'',photoStatus:member.avatar?'verified_person_photo':'awaiting_verified_person_photo',personalBest:normalizeClock(member.personalBest),personalBestSource:member.personalBest?'赛事组委会公示':'',assignments:[],biographyFacts:(member.biographyFacts||[]).filter(s=>s.verified===true&&s.sourceUrl),gallery:(member.gallery||[]).filter(photo=>photo.personName===member.name),sources:[],verificationStatus:'verified_official_roster',verifiedAt:race.verifiedAt||dataset.asOf||'',identityStatus:member.verifiedIdentityKey?'source_linked_person':'identified_within_official_roster'};people.set(id,person);}
        if(!person.assignments.some(a=>a.raceId===assignment.raceId&&a.targetTime===assignment.targetTime))person.assignments.push(assignment);
        for(const history of member.previousAssignments||[]){
          if(history.identityVerified!==true||!history.sourceUrl||!history.raceId||!history.raceName||history.raceGrade!=='A'||!['completed','confirmed','published','provisional'].includes(history.status))continue;
          if(!person.assignments.some(a=>a.raceId===history.raceId&&a.targetTime===history.targetTime))person.assignments.push({...history,statusLabel:assignmentStatus(history.status),pace:history.pace||paceFor(history.targetTime)});
        }
        for(const s of race.sources||[])if(s.url&&!person.sources.some(p=>p.url===s.url))person.sources.push(s);
      }
    }
  }
  const profiles=[...people.values()];
  for(const p of profiles) {
    p.assignments.sort((a,b)=>String(b.raceDate||'').localeCompare(String(a.raceDate||'')));
    p.targetTimes=unique(p.assignments.map(a=>a.targetTime));p.primaryTargetTime=p.targetTimes[0]||'';
    p.raceCount=unique(p.assignments.map(a=>a.raceId)).length;
    p.city=p.assignments[0]?.city||'';p.raceName=p.assignments[0]?.raceName||'';
    const first=p.assignments[0],gender=p.gender==='women'?'女子':p.gender==='men'?'男子':'';
    p.bio=`${p.name}是一名${gender}马拉松跑者，`+(p.personalBest?`全马个人最佳${p.personalBest}。`:'')+`${first.raceName}${first.status==='provisional'?'官兔入选公示':'官方配速'}任务为${first.targetTime}完赛组，对应平均配速约${first.pace}/公里。`;
    p.biographySections=[{title:'配速员介绍',body:p.bio,sourceUrl:first.sourceUrl},{title:'官方配速履历',body:p.assignments.map(a=>`${a.raceDate}，${a.raceName}（中国田协A类赛事）：${a.targetTime}完赛组，平均约${a.pace}/公里，${a.statusLabel}。`).join('\n\n'),sourceUrl:first.sourceUrl}];
    if(p.personalBest)p.biographySections.push({title:'公开成绩记录',body:`赛事组委会在配速员名单中将${p.name}的全马PB列为${p.personalBest}。这项成绩来自官兔资格公示，原公告没有给出对应比赛的日期和地点；个人成绩详情以成绩证书或比赛官方记录为准。`,sourceUrl:first.sourceUrl});
    p.verificationNote=p.identityStatus==='identified_within_official_roster'?'已核实该姓名与当届官方配速任务；跨赛事的同名人物须进一步核实身份。':'';
    p.raceBadges=p.assignments.map(a=>({raceId:a.raceId,raceName:a.raceName,label:a.raceName,status:a.status,statusLabel:assignmentStatus(a.status)})).filter((a,i,all)=>all.findIndex(b=>b.raceId===a.raceId)===i);
    p.verifiedPacerRaceNames=unique(p.assignments.filter(a=>a.status==='completed').map(a=>a.raceName));
    p.completedPacerRaceCount=p.verifiedPacerRaceNames.length;
    p.article=buildPacerArticle(p,{asOf:dataset.asOf||p.verifiedAt});
  }
  profiles.sort((a,b)=>{const x=clockSeconds(a.primaryTargetTime),y=clockSeconds(b.primaryTargetTime);return x-y||a.assignments[0].raceDate.localeCompare(b.assignments[0].raceDate)||a.name.localeCompare(b.name,'zh');});
  const {profiles:ignored,...meta}=Array.isArray(dataset)?{}:dataset;
  return {...meta,version:3,classification:'person',rankingBasis:'按官方公示的配速员姓名建立个人档案，赛事为配速履历。',rankingNotice:`已从${unique(profiles.flatMap(p=>p.assignments.map(a=>a.raceId))).length}场A类赛事公示识别${profiles.length}位官兔，按人展示姓名、PB与配速履历。初步公示人员保留状态标注；照片仅使用可对应到本人的公开图片。`,coverage:{...(meta.coverage||{}),people:profiles.length,withPersonalBest:profiles.filter(p=>p.personalBest).length,withAnnouncementPhotos:meta.coverage?.withPhotos||0,withPhotos:profiles.filter(p=>p.avatar).length,withPersonPhotos:profiles.filter(p=>p.avatar).length,sourceRaces:unique(profiles.flatMap(p=>p.assignments.map(a=>a.raceId))).length},profiles};
}
module.exports={toPacerPeople,normalizeClock,paceFor,personId,buildPacerArticle};
