/* Current WXML/WXSS mirrors with synthetic local logo images; no device claim. */
'use strict';
const {fixture,club}=require('./mini-club-logo-edit-regression.cjs');
const directory=require('./club-entry-v4-mini-fixture.cjs');
const sourceLogo='/images/quick-clubs.png';
const route=name=>'pages/'+name+'/'+name;
const cases=[...['base','logo','error','preparing'].map(scenario=>({route:route('club-create'),scenario})),...['base','empty-logo','error','saving','denied','guest'].map(scenario=>({route:route('club-edit'),scenario})),...['logo','fallback'].map(scenario=>({route:route('clubs'),scenario})),...['logo','share'].map(scenario=>({route:route('club-intro'),scenario}))];
module.exports={cases,async prepare(pageRoute,initial,scenario){
  let data={...initial};
  if(pageRoute===route('clubs')){const prepared=await directory.prepare(pageRoute,initial,'base');data=prepared.data;for(const key of ['clubs','shownClubs','openClubs'])data[key]=data[key].map((item,i)=>({...item,logo:sourceLogo,logoFailed:scenario==='fallback'||i>1}));}
  if(pageRoute===route('club-intro'))Object.assign(data,{club:{...club,logo:sourceLogo,joined:false,canApply:true},clubInitial:'西',ready:true,loading:false,shareOpen:scenario==='share',restricted:false});
  if(pageRoute===route('club-create'))Object.assign(data,{ready:true,loading:false,name:'西湖跑团',city:'杭州 · 西湖',intro:club.intro,logoPreview:scenario==='base'?'':sourceLogo,logo:scenario==='base'?'':sourceLogo,logoPreparing:scenario==='preparing',logoError:scenario==='error'?'图片超过 256KB，请换一张较小的图片。':''});
  if(pageRoute===route('club-edit')){const f=fixture('club-edit');await f.page.onShow();data={...f.page.data,logoPreview:sourceLogo,logo:sourceLogo};f.page.onUnload();if(scenario==='empty-logo')Object.assign(data,{logo:'',logoPreview:''});if(scenario==='saving')data.saving=true;if(scenario==='error')data.message='网络暂时不可用，请稍后重试。';if(scenario==='denied')Object.assign(data,{owner:false,message:'只有本团团长可以编辑跑团资料。'});if(scenario==='guest')Object.assign(data,{owner:false,ready:false});}
  return {data,components:{},css:'button{width:calc(100% - 32px)}'};
},async audit({page,route:pageRoute,scenario,width}){
  const errors=[];
  const controls=await page.evaluate(()=>[...document.querySelectorAll('button')].filter(el=>el.getBoundingClientRect().width>0).map(el=>({height:el.getBoundingClientRect().height,right:el.getBoundingClientRect().right,font:parseFloat(getComputedStyle(el).fontSize)})));
  if(controls.some(el=>el.height<43.5||el.right>width+.5||el.font<12))errors.push('Controls require bounded 44px tap targets and 12px minimum type');
  if(pageRoute===route('club-edit')){const count=await page.locator('.create-form').count();if(count!==(['denied','guest'].includes(scenario)?0:1))errors.push('Editor must require owner access');}
  if(pageRoute===route('clubs')){if(await page.locator('img.club-letter').count()!==(scenario==='fallback'?0:2))errors.push('Directory logos must replace text only when available');}
  if(pageRoute===route('club-intro')&&await page.locator('img.club-mark').count()!==1)errors.push('Public card must show the club logo');
  return errors;
}};
