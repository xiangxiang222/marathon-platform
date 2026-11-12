/* Current club surfaces rendered from WXML/WXSS with synthetic display records.
 * Native controls are approximated with an intentionally wide default button. */
'use strict';
const f = require('../design/previews/club-mileage-test-fixture.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const route = name => `pages/${name}/${name}`;
const cases = [
  ...['base','expanded','create','invitation'].map(scenario => ({ route:route('clubs'),scenario })),
  ...['base','empty'].map(scenario => ({ route:route('feed'),scenario })),
  ...['base','active'].map(scenario => ({ route:route('partner'),scenario }))
];
const partner = {
  grade:{ label:'活跃跑团',note:'根据本月成员出勤和计入跑量评定。',rights:'达标后可按额度领取补给物资，并参加跑团联赛。',lines:[{label:'本月活跃成员',text:'26 / 20 人',met:true},{label:'本月跑量',text:'526.8 / 500 公里',met:true}] },
  staff:true,supplies:[],claims:[],league:null,ledger:[],ledgerNote:'展示已确认的合作结算记录。'
};
module.exports = {
  cases, partner,
  async prepare(pageRoute,initial,scenario) {
    let data=clone(initial);
    if(pageRoute===route('clubs')) {
      const x=f.miniFixture(pageRoute),p=x.instance;
      const clubs=Array.from({length:10},(_,i)=>({id:100+i,name:['晨光跑团','河岸跑团','西湖周末长距离训练俱乐部','追风跑团'][i%4]+(i>3?String(i):''),initial:['晨','河','西','追'][i%4],city:'杭州',cityLabel:'杭州',members:20+i,memberCount:20+i,roleLabel:i===0?'团长':'成员',role:i===0?'owner':'member'}));
      p.setData({...data,ready:true,loaded:true,clubs,openClubs:clubs.slice(0,5),mineExpanded:scenario==='expanded',mode:scenario==='invitation'?'code':'search',createOpen:scenario==='create',name:scenario==='create'?'杭州湖畔夜跑团':'',city:scenario==='create'?'杭州':''});p.filterMine();data=clone(p.data);
    }
    if(pageRoute===route('feed'))data={...data,note:'本团成员可见，分享训练记录与活动见闻。',posts:scenario==='empty'?[]:[{id:1,nickname:'晨光团长',at:'11月12日 07:30',body:'今天完成了 10 公里轻松跑。前半程保持匀速，后半程按分组配速完成训练，跑后一起拉伸。周末的长距离训练继续在公园南门集合。',likes:12,liked:true,canDelete:true,comments:[{id:1,nickname:'河畔领跑员',body:'已报名周末团练，南门见。',canDelete:true},{id:2,nickname:'长昵称也按自己的节奏奔跑的朋友',body:'这周状态不错，继续按计划训练。'}]}]};
    if(pageRoute===route('partner')){
      const view=clone(partner);
      if(scenario==='active')Object.assign(view,{supplies:[{id:1,brand:'训练补给',name:'跑团长距离补给包',month:'2026-11',needChecks:4,needKm:100,clubUsed:6,cap:12,ready:true,progress:{checks:6,km:120}}],claims:[{id:1,nickname:'河畔领跑员',name:'跑团补给包',brand:'训练补给',status:'pending',statusLabel:'待发放',supplyId:1}],league:{title:'十一月跑团里程联赛',sponsor:'城市跑步伙伴',closed:false,prize:'团练补给包',canJoin:true,canLeave:false,rows:[{clubId:44,place:1,name:'晨光跑团',core:false,km:526.8,attend:26,finishers:8,finishRate:'80%'}]},ledger:[{id:1,month:'2026-10',kindLabel:'合作项目',yuan:180,settledLabel:'已结算'}]});
      data={...data,view};
    }
    return {data,components:{},css:'button{width:calc(100% - 32px)}'};
  },
  async audit({page,route:pageRoute,scenario,metrics}) {
    const errors=[];
    if(pageRoute===route('clubs')){
      const count=await page.locator('.my-club-list .my-club').count();
      if(count!==(scenario==='expanded'?10:4))errors.push(`Membership list count ${count}`);
    }
    const controls=await page.evaluate(()=>[...document.querySelectorAll('button')].filter(el=>el.getBoundingClientRect().width&&el.getBoundingClientRect().height).map(el=>({text:el.textContent.trim(),height:el.getBoundingClientRect().height,right:el.getBoundingClientRect().right,font:parseFloat(getComputedStyle(el).fontSize)})));
    if(controls.some(c=>c.height<43.5||c.right>metrics.width+.5||c.font<12))errors.push('Visible controls must retain 44px height, minimum 12px type and page bounds');
    return errors;
  }
};
