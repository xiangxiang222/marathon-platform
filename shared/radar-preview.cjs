// Synthetic only. Group tuples: race, distance, gender, first seconds, award depth, entrants, year sizes.
const races = [
['lakeside','滨湖马拉松','03-14','滨湖'],
['coast','海风马拉松','04-11','海岸'],
['mountain','山城半程马拉松','05-09','山城']
];
const groups = [
[0,'full','男',8220,8,1],[0,'full','女',10020,8,1],
[0,'half','男',3990,8,1],[0,'half','女',4890,8,1],
[1,'full','男',7980,3,4],[1,'full','女',9780,3,4],
[1,'half','男',3840,3,4],[1,'half','女',4740,3,4],
[2,'half','男',4200,8,2,[5,8,8]],[2,'half','女',5100,8,2,[5,5,5]]
];
const clock = seconds => Math.floor(seconds/3600)+':'+[Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
const examples = groups.map(([raceIndex,distance,gender,first,awardDepth,count,lengths=[8,8,8]]) => {
const [slug,name,date,city]=races[raceIndex],raceId='radar-demo-'+slug;
const groupId=distance+'-'+(gender==='男'?'men':'women'),step=distance==='full'?60:40;
const histories=[0,45,-30].map((offset,index)=>({year:2026-index,source:'模拟榜单 · '+(2026-index)+' 年功能演示',timing:'gun',rows:Array.from({length:lengths[index]},(_,i)=>({place:i+1,name:'模拟选手'+(i+1),clock:clock(first+offset+i*step),seconds:first+offset+i*step}))}));
const thresholds=histories.filter(h=>h.rows.length>=awardDepth).map(h=>({year:h.year,seconds:h.rows[awardDepth-1].seconds,clock:h.rows[awardDepth-1].clock}));
const values=thresholds.map(t=>t.seconds).sort((a,b)=>a-b),middle=Math.floor(values.length/2);
const medianSeconds=values.length?(values.length%2?values[middle]:Math.round((values[middle-1]+values[middle])/2)):null;
const rowClock=place=>histories[0].rows[place-1]?.clock||'';
const entrants=Array.from({length:count},(_,i)=>{const id=groupId+'-athlete-'+i,seconds=first-60+i*35;return {id,name:'模拟跑者'+String.fromCharCode(65+i),clock:clock(seconds),pbDate:'2025-04-12',status:i===3?'已缴费':'中签',evidence:i===2?'self_reported':'verified',source:'模拟参赛线索 · 非真实运动员',key:'editor:'+id,seconds,timing:'unknown',demo:true,anonymous:false,sourceLabel:'模拟参赛线索'};});
return {id:raceId+':'+groupId,race:{id:raceId,name:name+' · 模拟赛事',raceDate:'2027-'+date,city:'模拟'+city,province:'模拟地区'},groupId,distance,distanceLabel:distance==='full'?'全马':'半马',gender,timing:'gun',demo:true,awardDepth,
eligibility:'模拟规则：对应项目男女总名次奖，金额为税前演示值；仅供功能体验。',ruleSource:'模拟奖励规则 · 本期只评估前八名以内',awards:[10000,6000,3000,2000,1500,1000,800,500].slice(0,awardDepth).map((amount,i)=>({place:i+1,amount})),histories,
history:{year:2026,complete:lengths[0]===8,clock:medianSeconds==null?'':clock(medianSeconds),medianSeconds,podiumClock:rowClock(3),eighthClock:rowClock(8),sampleCount:thresholds.length,years:thresholds.map(t=>t.year),rangeLabel:values.length?clock(values[0])+(values[0]===values[values.length-1]?'':'–'+clock(values[values.length-1])):'',thresholds},
historicalPlace:null,competition:{knownCount:count,comparisonBasis:'pb_clues',notice:'仅覆盖平台已知参赛线索；未标记不代表不参赛。PB 的赛事和计时口径未必一致，只作能力线索，不能据此推算今年名次或获奖概率。',entrants},myEntry:null};
});
function previewClock(value){
const match=String(value||'').trim().match(/^(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)$/);
if(!match)return null;
const seconds=Number(match[1]||0)*3600+Number(match[2])*60+Number(match[3]);
return seconds>0&&seconds<=43200?seconds:null;
}
function previewRadar(profile={}) {
const gender=profile.gender||'',targets={...(profile.targets||{})};
const opportunities=JSON.parse(JSON.stringify(examples)).filter(row=>!gender||row.gender===gender).map(row=>{
const seconds=previewClock(targets[row.distance]),canCompare=Boolean(seconds&&gender);
row.ability=seconds?{clock:targets[row.distance],seconds,label:'示例目标',source:'仅用于模拟体验',date:'',scenario:true,timing:row.timing,verified:false}:null;
row.gap=canCompare&&row.history.medianSeconds!=null?row.history.medianSeconds-seconds:null;
const faster=canCompare?row.competition.entrants.filter(p=>p.seconds<seconds):[];
const verified=faster.filter(p=>p.evidence==='verified').length,counts=[faster.length,verified,faster.length-verified];
row.competition.canCompare=canCompare;
['fasterCount','verifiedFasterCount','selfReportedFasterCount'].forEach((key,i)=>{row.competition[key]=canCompare?counts[i]:null;});
row.level=row.gap==null?'unknown':seconds<Math.min(...row.history.thresholds.map(t=>t.seconds))?'priority':row.gap>=0?'challenge':'pressure';
if(faster.length>=row.awardDepth&&row.level!=='unknown')row.level='pressure';
else if(faster.length&&row.level==='priority')row.level='challenge';
row.levelLabel={priority:'历史有优势',challenge:'可以冲一冲',pressure:'竞争较强',unknown:'待补充资料'}[row.level];
row.reason=row.gap==null?'缺少可比资料，暂不判断拿奖机会。':(row.gap>=0?'目标达到':'目标暂未达到')+'近三届第'+row.awardDepth+'名参考线。'+(faster.length?'今年模拟阵容中有'+faster.length+'人PB更快，需结合当前阵容判断。':'已知阵容可能不完整，仍需关注今年选手变化。');
row.preview=true;return row;
});
const order={priority:0,challenge:1,pressure:2,unknown:3};opportunities.sort((a,b)=>order[a.level]-order[b.level]||a.race.raceDate.localeCompare(b.race.raceDate));
return {version:2,preview:true,profile:{gender,birth:'',province:'',targets},opportunities};
}
module.exports={previewRadar};
