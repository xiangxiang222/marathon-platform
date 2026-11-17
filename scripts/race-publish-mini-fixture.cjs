'use strict';
// Display-only synthetic scenes, derived through the current Page load method.
// Run with MINI_AUDIT_FIXTURE=scripts/race-publish-mini-fixture.cjs node design/previews/mini-ui-source-audit.cjs
const { detailFixture, day, today } = require('./race-detail-mini-regression.cjs');
const { race: baseRace } = require('./participation-mini-regression.cjs');
const scenarios = ['base','not-recorded','before-registration','registration','deadline-today','await-draw','payment','bib','race-day','ended','follow-only','plan-wish','plan-signed','plan-confirmed','plan-finished','guide','image-failure','news','result','guest','long-name','cover','source','outings','short-screen'];
const route = 'pages/race/race';
const cases = scenarios.map(scenario => ({ route, scenario }));
const art = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="400" viewBox="0 0 720 400"><rect width="720" height="400" fill="#fff0f3"/><g fill="none" stroke="#ed4565" stroke-width="5" opacity=".45"><ellipse cx="510" cy="180" rx="240" ry="145"/><ellipse cx="510" cy="180" rx="210" ry="115"/><ellipse cx="510" cy="180" rx="180" ry="85"/></g><path d="M0 300 200 200 360 250 540 100 720 170V400H0Z" fill="#ffc9d5" opacity=".5"/><text x="44" y="95" font-family="sans-serif" font-size="27" fill="#bd4160">RACE DAY / ORIGINAL GEOMETRY</text></svg>').toString('base64');
async function prepare(unusedRoute, unusedData, scenario) {
  const race = { ...baseRace, name: '城市马拉松 · 界面验收', raceDate: day(30), regStart: day(-8), deadline: day(4), deadlineName: '报名截止', drawAt: day(9), payDeadline: day(12), bibAt: day(26), province: '界面省份', city: '验收城市', place: '城市体育中心', distances: ['full','half'], distanceLabels: ['全程马拉松','半程马拉松'], kindLabels: ['路跑'], groups: [], meet: 'offline', source: '合成展示数据，仅用于本地界面验收', organizer: '合成赛事组委会', fee: '示例费用', scale: '示例规模', startAt: '07:30', route: '示例路线文字，真实赛事资料仅由后台上传。', pickup: '领物资料显示在参赛指南中。', pacers: '配速与官兔资料在此集中阅读。', guideText: '## 参赛须知\n界面展示数据，不代表真实赛事事实。', nodes: [{ key: 'regStart', label: '报名开始', at: day(-8) }, { key: 'deadline', label: '报名截止', at: day(4) }, { key: 'draw', label: '中签公布', at: day(9) }, { key: 'pay', label: '缴费截止', at: day(12) }], links: ['signup','draw','bib','result'].map(key => ({ key, url: 'https://official.example/' + key })), regStatus: '报名中' };
  if (scenario === 'not-recorded') Object.assign(race,{regStart:'',deadline:'',drawAt:'',payDeadline:'',bibAt:'',regStatus:'报名时间未录入',links:[],source:'',organizer:'',fee:'',scale:''});
  if (scenario === 'before-registration') Object.assign(race,{regStart:day(2),deadline:day(8),regStatus:'报名未开始'});
  if (scenario === 'deadline-today') race.deadline=today;
  if (scenario === 'await-draw') Object.assign(race,{deadline:day(-3),drawAt:day(2),regStatus:'待开赛'});
  if (scenario === 'payment') Object.assign(race,{deadline:day(-8),drawAt:day(-2),payDeadline:day(1),regStatus:'待开赛'});
  if (scenario === 'bib') Object.assign(race,{deadline:day(-20),drawAt:day(-10),payDeadline:day(-7),bibAt:today,raceDate:day(2),regStatus:'待开赛'});
  if (scenario === 'race-day') Object.assign(race,{deadline:day(-20),drawAt:day(-10),payDeadline:day(-7),bibAt:day(-1),raceDate:today,regStatus:'比赛中'});
  if (scenario === 'ended' || scenario === 'result' || scenario === 'plan-finished') Object.assign(race,{deadline:day(-30),drawAt:day(-20),payDeadline:day(-17),bibAt:day(-5),raceDate:day(-2),regStatus:'已结束'});
  if (scenario === 'long-name') Object.assign(race,{name:'2027城市环湖山海超级马拉松暨全国跑者嘉年华长名称展示与国际邀请赛（合成验收数据）',groups:['亲子欢乐跑体验组','城市接力特别组'],city:'非常长的城市与举办地区名称',meet:'online'});
  const f=detailFixture(race,scenario!=='guest');
  f.data.following=scenario==='follow-only';
  const status={'plan-wish':'想跑','plan-signed':'待抽签','plan-confirmed':'确认参赛','plan-finished':'完赛'}[scenario];
  if(status)f.data.myStatus=status;
  if(scenario==='plan-confirmed') { f.data.sharedClubIds=[7];f.data.clubs=[{id:7,name:'城市跑团 · 示例',mates:[{userId:3,nickname:'示例跑者',status:'中签',note:'赛后合影'}]}]; }
  f.page.onLoad({id:race.id,...(status?{plan:'1'}:{}),...(scenario==='outings'?{outings:'1',clubId:'7'}:{})});
  await f.page.load();
  const patch={guide:[],routeSheets:[],pacerSheets:[],coverSrc:'',liveSheet:null};
  const media=(id,state='ready')=>({id,src:art,state});
  if(scenario==='guide'||scenario==='image-failure') Object.assign(patch,{tab:'guide',guide:[media(1)],routeSheets:[media(2,scenario==='image-failure'?'failed':'ready')],pacerSheets:[media(3)]});
  if(scenario==='news') Object.assign(patch,{tab:'news',articles:[{id:1,title:'比赛日资料更新 · 示例资讯',publishedAt:today,source:'合成展示数据'}],liveSheet:media(5)});
  if(scenario==='result') Object.assign(patch,{tab:'result',myResults:[{distance:'full',distanceLabel:'全程马拉松',clock:'03:35:20',pace:'5′06″',verifyLabel:'未核验'}]});
  if(scenario==='cover')patch.coverSrc=art;
  if(scenario==='source')patch.sourceOpen=true;
  if(scenario==='outings')Object.assign(patch,{personalOpen:true,outingsOpen:true,clubs:[{id:7,name:'城市跑团 · 示例',mates:[]}],visibleOutings:[],outingClubOptions:[{id:7,name:'城市跑团 · 示例'}]});
  f.page.setData(patch);
  return {data:f.page.data,components:{},css:''};
}
async function audit({page,scenario,width,data,metrics}) {
  const errors=[];
  if(scenario==='short-screen')await page.setViewportSize({width,height:568});
  const controls=await page.evaluate(()=>[...document.querySelectorAll('button,[role=button]')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height<43.9;}).map(el=>({class:el.className,text:el.textContent.trim().slice(0,30),height:el.getBoundingClientRect().height})));
  if(controls.length)errors.push('Controls below 44px: '+JSON.stringify(controls));
  const visibleOverflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>{if(el.closest('[aria-hidden=true],.track-art'))return false;const r=el.getBoundingClientRect();return r.width && r.right>innerWidth+2;}).map(el=>({class:el.className,right:el.getBoundingClientRect().right})));
  if(visibleOverflow.length)errors.push('Horizontal element overflow: '+JSON.stringify(visibleOverflow));
  if(!data.personalOpen && await page.locator('.personal-panel').count())errors.push('Personal controls must be collapsed by default');
  if(scenario==='not-recorded'&&metrics.visibleText.includes('官方未公布'))errors.push('Unknown content cannot imply an official announcement');
  if(scenario==='image-failure'&&!metrics.visibleText.includes('路线图加载失败'))errors.push('Image error must expose retry');
  if(scenario==='before-registration'&&data.publicStatus!=='报名未开始')errors.push('Before registration must not show open');
  return errors;
}
module.exports={cases,prepare,audit};
