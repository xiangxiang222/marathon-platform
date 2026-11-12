const { request } = require('../../utils/request');
const { parseGuide } = require('../../utils/guide-md');
const { safeUrl, categoryName, contentDate, authorLabel } = require('../../utils/content');
Page({
  data:{item:null,blocks:[],profileArticle:{},profileBlocks:[],message:'',ready:false,isProfile:false,isRace:false,isOfficialPacer:false,isPacerPerson:false,pacerGroups:[],assignments:[],raceBadges:[],gallery:[],highlights:[],dateLabel:'',authorLabel:'',seasonYear:new Date(Date.now()+8*3600000).getUTCFullYear(),categoryLabel:'',backUrl:'/pages/news/news'},
  onLoad(q){this._id=q.id||'';this._type=q.type==='profile'?'profile':q.type==='article'?'article':'race';this._seq=0;this._disposed=false;this.setData({isProfile:this._type==='profile',isRace:this._type==='race'});this.load();},
  onUnload(){this._disposed=true;this._seq++;},
  load(){
    const seq=++this._seq;this.setData({message:'',ready:false,item:null});
    const path=this._type==='race'?'/news/':'/content/'+(this._type==='profile'?'profiles/':'articles/');
    return request(path+encodeURIComponent(this._id)).then(d=>{
      if(this._disposed||seq!==this._seq)return;
      const item=d.profile||d.article||d.news,meta=d.meta||{};item.avatarLabel=String(item.name||'跑').slice(0,1);
      item.pacerTarget=item.primaryTargetTime||(item.targetTimes||[])[0]||'官兔';
      const profileArticle=item.article&&item.article.body?item.article:{title:'认识 '+(item.name||''),lead:'',body:item.bio||''};
      const assignments=(item.assignments||[]).map(a=>({...a,statusLabel:a.status==='provisional'?'入选公示':a.statusLabel||'已确认',metaLabel:[a.raceDate,a.city,a.distanceLabel].filter(Boolean).join(' · ')}));
      const raceBadges=(item.raceBadges||[]).map(b=>({...b,statusLabel:b.status==='provisional'?'入选公示':b.statusLabel||'已确认'}));
      this.setData({item,profileArticle,profileBlocks:parseGuide(profileArticle.body),seasonYear:item.seasonYear||meta.seasonYear||new Date(Date.now()+8*3600000).getUTCFullYear(),isOfficialPacer:item.profileKind==='official_pacer_race',isPacerPerson:item.profileKind==='official_pacer_person',pacerGroups:(item.pacerGroups||[]).map(g=>({...g,namesText:(g.names||[]).join('、')})),assignments,raceBadges,gallery:(item.gallery||[]).filter(g=>safeUrl(g.url)),ready:true,blocks:parseGuide(item.body),dateLabel:contentDate(item.publishedAt),authorLabel:authorLabel(item),categoryLabel:categoryName(item.category),highlights:item.careerHighlights||item.highlights||[],backUrl:this._type==='profile'?'/pages/news/news?tab='+(item.type||'athlete'):item.clubId?'/pages/news/news?club='+item.clubId:'/pages/news/news'});
      wx.setNavigationBarTitle({title:item.name||item.title||'跑圈资讯'});
    }).catch(e=>{if(!this._disposed&&seq===this._seq)this.setData({message:'请稍后重试，或返回资讯列表浏览其他内容。',ready:true});});
  },
  imageError(){this.setData({'item.imageFailed':true});},
  previewPhoto(e){const url=e.currentTarget.dataset.url;if(safeUrl(url))wx.previewImage({current:url,urls:this.data.gallery.map(g=>g.url)});},
  onShareAppMessage(){return {title:this.data.item&&(this.data.item.name||this.data.item.title)||'跑圈资讯',path:'/pages/news/detail?type='+this._type+'&id='+encodeURIComponent(this._id)};}
});
