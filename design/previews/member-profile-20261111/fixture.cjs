// In-memory display and VM fixture only. No API, user token or database access.
const path = require('node:path');
const base = require('../club-mileage-test-fixture.cjs');
const route = 'pages/member-profile/member-profile';
const tabs = ['profile', 'mileage', 'races', 'results', 'albums'];
const art = color => 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="'+color+'"/><path d="M0 470Q210 250 480 420T960 300V540H0Z" fill="#fff" opacity=".55"/><circle cx="740" cy="130" r="65" fill="#fff4d7"/><path d="M330 310l70-95 60 60 65-5m-120-45-40-55m35 45-20 135-65 70m65-70 80 60" fill="none" stroke="#537c69" stroke-width="22" stroke-linecap="round"/><circle cx="425" cy="150" r="30" fill="#537c69"/></svg>').toString('base64');
function profile(options={}) {
  const data=base.profileFixture(options.mine?'1':'2',{range:options.range||'month',date:options.date||'2027-01-01'});
  data.user.avatar='';data.user.introduction='喜欢清晨沿河慢跑，也在为下一场半马稳稳积累。每一次出发，都想和伙伴一起跑得更远。';data.user.roleLabel='跑团成员';
  if(options.long) data.user.nickname='晨光河岸一起向前跑的超长昵称测试跑友';
  const race=(id,name,date)=>({id,name,raceDate:date,province:'浙江',city:'杭州',kind:'road',meet:'offline'});
  const old=race('fixture-finished','晨光城市半程马拉松','2026-11-15');
  const next=race('fixture-upcoming','春日河岸马拉松','2027-03-21');
  const wish=race('fixture-wish','西湖环湖十公里公开赛','2027-04-18');
  const missed=race('fixture-missed','冬日城市跑步节','2027-02-07');
  const result={id:'fixture-finished:half',raceId:old.id,race:old,name:old.name,raceDate:old.raceDate,distance:'half',distanceLabel:'半程马拉松',seconds:6425,clock:'01:47:05',pace:'5:04',pb:true,status:'finished'};
  data.results=[result,{...result,id:'fixture-full:full',raceId:'fixture-full',race:race('fixture-full','秋日城市马拉松','2026-10-18'),distance:'full',distanceLabel:'全程马拉松',seconds:14920,clock:'04:08:40',pace:'5:54'}];
  data.races=[{raceId:old.id,race:old,status:'完赛',hasResult:true,results:[result]},{raceId:next.id,race:next,status:'中签',hasResult:false,results:[]},{raceId:wish.id,race:wish,status:'想跑',hasResult:false,results:[]},{raceId:missed.id,race:missed,status:'未中签',hasResult:false,results:[]}];
  const full=data.results[1];data.races.push({raceId:full.race.id,race:full.race,status:'完赛',hasResult:true,results:[full]});
  data.albums=[{id:801,activityId:801,title:'河岸轻松跑 · 把相聚留在相册',date:'2026-12-28',photoCount:3,videoCount:0,coverId:901,items:[901,902,903].map(id=>({id,kind:'photo',type:'photo',createdAt:'2026-12-28T01:30:00Z',url:'/fixture-only/media/'+id}))},{id:802,activityId:802,title:'周末一起练长距离',date:'2026-12-20',photoCount:1,videoCount:0,coverId:904,items:[{id:904,kind:'photo',type:'photo',createdAt:'2026-12-20T02:00:00Z',url:'/fixture-only/media/904'}]}];
  data.summary={raceCount:5,upcomingRaceCount:1,finishedRaceCount:2,resultCount:2,photoCount:4,videoCount:0,pb:data.results};
  data.pbs=data.results;data.overview={totalKm:data.mileage.all.km,totalRuns:data.mileage.all.times,finished:2};
  if(options.empty){data.user.introduction='';data.group=null;data.user.groupName='未分组';data.results=[];data.races=[];data.albums=[];data.summary={raceCount:0,upcomingRaceCount:0,finishedRaceCount:0,resultCount:0,photoCount:0,videoCount:0,pb:[]};data.pbs=[];data.overview={totalKm:0,totalRuns:0,finished:0};data.recentRuns=[];data.stats={km:0,times:0,days:0,durationSec:0,paceLabel:''};for(const key of Object.keys(data.mileage))data.mileage[key]={km:0,times:0,days:0,durationSec:0,paceLabel:''};}
  return data;
}
async function page(options={}) {
  const x=base.miniFixture(route);x.instance.onLoad({club:'44',user:options.mine?'1':'2',tab:options.tab||'profile',range:options.range||'month',date:options.date||'2027-01-01'});
  x.setReply(async url=>{if(options.error)throw Error('成员暂时无法查看，请重新加载');return profile({...options,...Object.fromEntries(new URL(url,'https://fixture.invalid').searchParams)});});
  await x.instance.load();return x;
}
const cases=[{route,scenario:'base'},...tabs.filter(tab=>tab!=='profile').map(tab=>({route,scenario:tab})),...tabs.map(tab=>({route,scenario:'empty-'+tab})),{route,scenario:'error'},{route,scenario:'editing'},{route,scenario:'long-name'},{route,scenario:'races-wish'},{route,scenario:'races-upcoming'},{route,scenario:'races-finished'},{route,scenario:'past-mileage'},...['week','month','year','empty','error'].map(kind=>({route:'pages/mileage/mileage',scenario:'report-'+kind}))];
async function prepare(_route,_data,scenario){
  if(_route==='pages/mileage/mileage'){
    const kind=['report-week','report-year'].includes(scenario)?scenario.slice(7):'month',empty=scenario==='report-empty',error=scenario==='report-error';
    const rows=empty?[]:base.members.map((member,index)=>({userId:member.id,nickname:member.nickname,avatar:'',place:index+1,km:Math.round((62.4-index*7.3)*10)/10,dayText:12-index,durationLabel:'06:24:00',paceLabel:'5:42',flag:index===0?'150 km':'-'}));
    const report={kind,date:'2026-12-15',title:kind==='week'?'2026.12.14 — 12.20 周报':kind==='year'?'2026 年跑量年报':'2026 年 12 月跑量月报',period:{label:'历史跑量报表'},total:{km:rows.reduce((n,row)=>Math.round((n+row.km)*10)/10,0)},rows};
    const x=base.miniFixture(_route);x.instance.onLoad({id:'44',tools:'1'});x.instance.setData({kind,reportDate:'2026-12-15'});x.setReply(async url=>{if(url.includes('/report?')){if(error)throw Error('历史报表暂时无法读取，请重试');return report;}return{feed:[],people:[],manageGroups:[],staff:false,owner:false,rules:null};});x.instance.load();await base.tick();
    const board=base.miniFixture('components/mileage-board/mileage-board',{clubId:'44'});board.instance._alive=true;board.instance.setData({date:'2026-12-15',range:kind});board.setReply(async url=>base.boardFixture(Object.fromEntries(new URL(url,'https://fixture.invalid').searchParams),{staff:false}));await board.instance.load();
    const fs=require('node:fs'),source=fs.readFileSync(path.join(base.MINI,'components/mileage-board/mileage-board.wxml'),'utf8');
    return{data:x.instance.data,components:{'mileage-board':{source,data:board.instance.data,missingHandlers:[]}},css:fs.readFileSync(path.join(base.MINI,'components/mileage-board/mileage-board.wxss'),'utf8')};
  }
  const tab=scenario.startsWith('empty-')?scenario.slice(6):scenario.startsWith('races-')?'races':scenario==='past-mileage'?'mileage':tabs.includes(scenario)?scenario:'profile';
  const x=await page({tab,mine:scenario==='editing',empty:scenario.startsWith('empty-'),error:scenario==='error',long:scenario==='long-name',date:scenario==='past-mileage'?'2026-12-15':'2027-01-01'});
  if(scenario==='editing'){x.instance.editIntroduction();x.instance.inputIntroduction(base.input('热爱清晨的河岸，也期待下一次出发。'));}
  if(scenario.startsWith('races-'))x.instance.pickRaceFilter(base.event({id:scenario.slice(6)}));
  const data=x.instance.data;
  if(data.profile){const photos=data.profile.photos;for(let i=0;i<photos.length;i++)photos[i].src=art(i%2?'#d9eafb':'#dcefe5');for(const album of data.profile.albums)for(const item of album.items)item.src=photos.find(photo=>photo.id===item.id)?.src||art('#eee7fb');}
  return {data,components:{},css:''};
}
module.exports={...base,route,tabs,profile,page,cases,prepare,art};
