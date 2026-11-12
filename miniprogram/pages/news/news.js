const { request } = require('../../utils/request');
const { decorate } = require('../../utils/content');
function accountToken(){const app=typeof getApp==='function'?getApp():null;return app&&app.globalData?app.globalData.token||'':'';}
const TABS = [{id:'all',label:'精选',heading:'精选资讯'},{id:'industry',label:'业界',heading:'业界动态'},{id:'athlete',label:'运动员',heading:'中国马拉松运动员'},{id:'pacer',label:'官兔',heading:'官方配速员档案'},{id:'club',label:'跑团',heading:'跑团故事'},{id:'race',label:'赛事',heading:'赛事资讯'}];
Page({
  data:{tabs:TABS,tab:'all',heading:'精选资讯',clubId:'',clubName:'',canManage:false,isProfile:false,rows:[],page:1,pages:1,total:0,ready:false,message:'',gender:'men',query:'',raceId:'',raceFilters:[],raceFilterOptions:[{id:'',name:'全部赛事'}],raceFilterIndex:0,seasonYear:new Date(Date.now()+8*3600000).getUTCFullYear()},
  onLoad(q){this._disposed=false;this._permissionTicket=0;const tab=q.club?'club':TABS.some(t=>t.id===q.tab)?q.tab:'all';this.setData({clubId:q.club||'',tab,heading:q.club?'跑团资讯':TABS.find(t=>t.id===tab).heading,isProfile:['athlete','pacer'].includes(tab)});wx.setNavigationBarTitle({title:q.club?'跑团资讯':'跑圈资讯'});},
  onShow(){if(this.data.clubId){const ticket=++this._permissionTicket,token=accountToken();this.setData({canManage:false});request('/clubs/'+encodeURIComponent(this.data.clubId)).then(d=>{if(!this._disposed&&ticket===this._permissionTicket&&token===accountToken())this.setData({clubName:d.club&&d.club.name||'',canManage:!!(d.club&&d.club.staff)});}).catch(()=>{});}this.load();},
  onPullDownRefresh(){this.load().finally(()=>wx.stopPullDownRefresh());},
  onUnload(){this._disposed=true;this._permissionTicket++;this._seq=(this._seq||0)+1;},
  load(){const seq=this._seq=(this._seq||0)+1;this.setData({ready:false,message:'',rows:[]});let path;const d=this.data;if(d.isProfile)path='/content/profiles?type='+d.tab+(d.tab==='athlete'?'&gender='+d.gender:d.raceId?'&raceId='+encodeURIComponent(d.raceId):'');else if(d.tab==='race')path='/news?';else path='/content/articles?'+(d.clubId?'clubId='+encodeURIComponent(d.clubId):d.tab==='all'?'':'category='+d.tab);
    return request(path+(path.endsWith('?')?'':'&')+'page='+d.page+'&pageSize=20&q='+encodeURIComponent(d.query.trim())).then(r=>{if(this._disposed||seq!==this._seq)return;const meta=r.meta||{},raceFilters=d.tab==='pacer'?(meta.raceFilters||d.raceFilters):[],raceFilterOptions=[{id:'',name:'全部赛事'},...raceFilters];this.setData({rows:(r.profiles||r.articles||r.news||[]).map((v,i)=>decorate(v,i,r.page)),page:r.page||1,pages:r.pages||1,total:r.total||0,seasonYear:meta.seasonYear||new Date(Date.now()+8*3600000).getUTCFullYear(),ready:true,raceFilters,raceFilterOptions,raceFilterIndex:Math.max(0,raceFilterOptions.findIndex(v=>v.id===d.raceId))});}).catch(e=>{if(seq===this._seq)this.setData({message:'请稍后再试，或切换其他栏目继续浏览。',ready:true});});
  },
  switchTab(e){const tab=e.currentTarget.dataset.tab;if(tab===this.data.tab)return;this.setData({tab,page:1,query:'',raceId:'',raceFilters:[],raceFilterOptions:[{id:'',name:'全部赛事'}],raceFilterIndex:0,heading:TABS.find(t=>t.id===tab).heading,isProfile:['athlete','pacer'].includes(tab)});this.load();},
  profileImageError(e){const i=Number(e.currentTarget.dataset.index);if(Number.isInteger(i)&&this.data.rows[i])this.setData({['rows['+i+'].imageFailed']:true});},
  onQuery(e){this.setData({query:e.detail.value});},search(){this.setData({page:1});this.load();},
  setGender(e){this.setData({gender:e.currentTarget.dataset.gender,page:1});this.load();},
  setRace(e){const index=Number(e.detail.value),race=this.data.raceFilterOptions[index];if(!race)return;this.setData({raceId:race.id,raceFilterIndex:index,page:1});this.load();},
  resetPacerFilters(){this.setData({raceId:'',raceFilterIndex:0,query:'',page:1});this.load();},
  prevPage(){if(this.data.page>1){this.setData({page:this.data.page-1});this.load();}},nextPage(){if(this.data.page<this.data.pages){this.setData({page:this.data.page+1});this.load();}},
  onShareAppMessage(){return {title:this.data.clubId?(this.data.clubName||'跑团')+' · 跑团资讯':'跑圈资讯 · 认识赛道上的人',path:'/pages/news/news?'+(this.data.clubId?'club='+this.data.clubId:'tab='+this.data.tab)};}
});
