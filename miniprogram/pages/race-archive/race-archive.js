const { request } = require('../../utils/request');
const TABS = [{id:'overview',label:'概况'},{id:'entry',label:'参赛'},{id:'route',label:'赛道'},{id:'results',label:'成绩'},{id:'gallery',label:'图鉴'},{id:'updates',label:'动态'}];
const GALLERY = ['参赛服','奖牌','参赛包','完赛包','官方图集'];
const LANDMARKS = {beijing:'/images/race-landmarks/beijing.png',shanghai:'/images/race-landmarks/shanghai.png',xiamen:'/images/race-landmarks/xiamen.png'};
const LEGACY = {registration:'entry',logistics:'entry',participation:'results',gear:'gallery',stories:'updates'};
function safeUrl(value) { return /^https:\/\/[^\s/@?#]+(?:[/?#][^\s]*)?$/i.test(String(value || '')) || /^\/marathon\/(?:api\/race-archive-media\/(?:beijing|shanghai|xiamen)\/[a-f0-9]{64}\.(?:jpg|png|webp)|images\/race-archives\/[a-z0-9_/-]+\.(?:png|jpe?g|webp))$/i.test(String(value || '')); }
function asset(value) { if (!safeUrl(value)) return ''; return value[0] === '/' ? String(getApp().globalData.baseUrl || '').replace(/\/$/,'') + value : value; }
function photos(items, fallback) { const images = (items || []).map(item => ({url:asset(item.url),caption:item.caption || '',credit:item.mediaRights && item.mediaRights.attribution || ''})).filter(item => item.url); const url = asset(fallback); if(url && !images.some(item => item.url === url)) images.unshift({url,caption:'',credit:''}); return images; }
function fields(value, labels) { return labels.filter(([key]) => value && value[key]).map(([key,label]) => ({label,value:value[key]})); }
function cert(value) { return value && value.label ? value.label + (value.year ? ' · '+value.year : '') : ''; }
function indexFor(years, year) { return Math.max(0,years.indexOf(String(year))); }
function lottery(editions) {
  const columns = [['lotteryRate','公布中签率'],['applicants','报名人数'],['eligibleApplicants','有效报名'],['lotteryPool','抽签人数'],['drawQuota','抽签名额'],['directQuota','直通名额']].filter(([key]) => editions.some(e => e.registration && e.registration[key])).map(([key,label]) => ({key,label}));
  return {lotteryColumns:columns,lotteryWidth:70+columns.length*160,lotteryRows:editions.map(e => ({year:String(e.year),cells:columns.map(c => ({key:c.key,value:e.registration && e.registration[c.key] || '—'}))}))};
}
Page({
  data:{race:null,archive:null,tabs:TABS,tab:'overview',loading:true,message:'',landmarkSrc:'',heroUrl:'',heroFailed:false,waLabel:'',caaLabel:'',foundingYear:'',years:[],entryYear:'',entryIndex:0,entrySection:'registration',entryEdition:null,entryFacts:[],guideSections:[],routeYear:'',routeIndex:0,routeEdition:null,routeStages:[],routeImages:[],routeVersions:[],routeVersionNote:'',resultsYear:'',resultsIndex:0,resultsEdition:null,resultFacts:[],galleryTypes:GALLERY,galleryType:'参赛服',galleryGroups:[],albums:[],updateType:'stories',stories:[],news:[],activeArticle:null,latestEdition:null,relatedRaces:[],fromRace:null,lotteryColumns:[],lotteryRows:[],lotteryWidth:70},
  onLoad(query) { this._id=query.id || ''; this._fromRaceId=query.fromRaceId || ''; this._query=query; this._seq=0; this._disposed=false; const tab=LEGACY[query.tab] || query.tab; this.setData({tab:TABS.some(item => item.id===tab)?tab:'overview',entrySection:query.tab==='logistics' || query.section==='guide'?'guide':'registration',galleryType:GALLERY.includes(query.category)?query.category:'参赛服',updateType:query.type==='news'?'news':'stories'}); this.load(); },
  onUnload() { this._disposed=true; this._seq++; },
  load() { const seq=++this._seq; this.setData({loading:true,message:''}); return request('/race-catalog/'+encodeURIComponent(this._id)).then(data => {
    if(this._disposed || seq!==this._seq)return; if(!data.race || !data.archive)throw Error('这场赛事尚无档案');
    this._archive=data.archive; this._editions=(data.archive.editions || []).slice().sort((a,b)=>Number(b.year)-Number(a.year));
    const years=this._editions.map(e=>String(e.year)), latest=years[0] || '', results=this._editions.find(e=>(e.results || []).length), linked=(data.relatedRaces || []).find(r=>String(r.id)===String(this._fromRaceId));
    const preferred=String(this._query.year || linked && linked.raceDate && linked.raceDate.slice(0,4) || ''), selected=years.includes(preferred)?preferred:latest;
    const entryYear=this.data.tab==='entry'?selected:latest,routeYear=this.data.tab==='route'?selected:latest,resultsYear=this.data.tab==='results'?selected:String(results && results.year || latest);
    const stories=(data.archive.updates && data.archive.updates.length?data.archive.updates:data.archive.stories || []).map((item,i)=>({...item,id:item.id || 'story-'+i,images:photos(item.images)}));
    const news=(data.archive.news || []).map((item,i)=>({...item,id:item.id || 'news-'+i,images:photos(item.images)})).sort((a,b)=>String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
    const albums=(data.archive.photoAlbums || []).map((item,i)=>({...item,id:item.id || 'album-'+i,media:photos(item.media)})).filter(item=>item.media.length).sort((a,b)=>Number(b.year)-Number(a.year));
    let routeVersions=(data.archive.routeGroups || []).map((item,i)=>({...item,id:item.id || 'version-'+i,years:(item.years || []).map(String).filter(y=>years.includes(y))})).filter(item=>item.years.length);
    if(!routeVersions.length && data.race.id==='beijing' && years.includes('2025') && years.includes('2026'))routeVersions=[{id:'beijing-road-sequence',title:'近年道路序列',years:['2026','2025'],match:'similar',note:'2025、2026 公布的道路序列相近，细部线位仍分别记录。'}];
    const grouped=new Set(routeVersions.flatMap(item=>item.years)); routeVersions=routeVersions.concat(years.filter(y=>!grouped.has(y)).map(y=>({id:'year-'+y,title:y+' 年路线',years:[y],note:''}))).map(item=>({...item,yearsLabel:item.years.join(' / ')}));
    const founding=data.archive.profile && data.archive.profile.foundingYear || '';
    this.setData({race:data.race,archive:data.archive,landmarkSrc:LANDMARKS[data.race.id] || '',heroUrl:asset(data.archive.hero && data.archive.hero.imageUrl) || (data.race.id==='beijing'?'/images/race-covers/beijing.jpg':''),heroFailed:false,waLabel:cert(data.race.worldAthletics),caaLabel:cert(data.race.caa),foundingYear:founding,years,entryYear,entryIndex:indexFor(years,entryYear),routeYear,routeIndex:indexFor(years,routeYear),resultsYear,resultsIndex:indexFor(years,resultsYear),latestEdition:this._editions[0] || null,routeVersions,stories,news,albums,relatedRaces:data.relatedRaces || [],fromRace:linked || null,loading:false,...lottery(this._editions)});
    this.paint(); wx.setNavigationBarTitle({title:data.race.name+' · 赛事专题'});
  }).catch(error=>{if(!this._disposed && seq===this._seq)this.setData({loading:false,message:error.message || '赛事档案暂时无法加载'});}); },
  paint() {
    const entry=this._editions.find(e=>String(e.year)===this.data.entryYear),route=this._editions.find(e=>String(e.year)===this.data.routeYear),result=this._editions.find(e=>String(e.year)===this.data.resultsYear);
    const guideSections=[{id:'collection',title:'领物安排',labels:[['time','领物时间'],['place','领物地点'],['requirements','领取要求']]},{id:'transport',title:'交通与离场',labels:[['expo','领物交通'],['start','前往起点'],['finish','终点离场']]},{id:'raceDay',title:'比赛日服务',labels:[['startTime','发枪与分区'],['timeLimit','关门安排'],['bagDrop','存取包'],['aidStations','补给与饮水'],['toilets','卫生间'],['medical','医疗服务']]}].map(s=>({id:s.id,title:s.title,fields:fields(entry && entry.logistics && entry.logistics[s.id],s.labels)})).filter(s=>s.fields.length);
    const routeStages=String(route && route.route && route.route.summary || '').split('→').map(name=>name.trim()).filter(Boolean).map((name,i)=>({order:String(i+1).padStart(2,'0'),name}));
    const routeVersion=this.data.routeVersions.find(item=>item.years.includes(this.data.routeYear));
    const routeVersions=this.data.routeVersions.map(item=>({...item,selected:item.years.includes(this.data.routeYear)}));
    const galleryGroups=this._editions.map(e=>({year:String(e.year),items:(e.gear || []).filter(g=>g.category===this.data.galleryType).map((g,i)=>({...g,id:String(e.year)+'-'+i,images:photos(g.images,g.imageUrl)}))})).filter(group=>group.items.length);
    const resultsEdition=result?{...result,results:(result.results || []).map((item,i)=>({...item,key:i,timing:item.timing || '计时口径待补充'}))}:null;
    this.setData({entryEdition:entry || null,entryFacts:fields(entry && entry.registration,[['opens','报名开始'],['closes','报名截止'],['drawDate','抽签公布'],['fee','报名费用'],['qualification','报名资格'],['applicants','报名人数'],['eligibleApplicants','有效报名'],['lotteryPool','抽签人数'],['drawQuota','抽签名额'],['lotteryRate','公布中签率'],['directQuota','直通名额']]),guideSections,routeEdition:route || null,routeStages,routeImages:photos(route && route.route && route.route.images,route && route.route && route.route.mapUrl),routeVersions,routeVersionNote:routeVersion && routeVersion.note || '',resultsEdition,resultFacts:fields(result && result.participation,[['planned','计划规模'],['starters','实际起跑'],['finishers','完赛人数'],['finishRate','完赛率']]),galleryGroups});
  },
  pickTab(e) { const tab=e.currentTarget.dataset.id; if(TABS.some(item=>item.id===tab)){this.setData({tab,activeArticle:null});this.paint();} },
  pickEntrySection(e) { const value=e.currentTarget.dataset.id; if(['registration','guide'].includes(value))this.setData({entrySection:value}); },
  pickYear(e) { const scope=e.currentTarget.dataset.scope, index=Number(e.detail.value); if(!['entry','route','results'].includes(scope)||!this.data.years[index])return;this.setData({[scope+'Year']:this.data.years[index],[scope+'Index']:index});this.paint(); },
  setEntryYear(e) { const year=String(e.currentTarget.dataset.year);if(this.data.years.includes(year)){this.setData({entryYear:year,entryIndex:indexFor(this.data.years,year)});this.paint();} },
  pickVersion(e) { const version=this.data.routeVersions.find(item=>item.id===e.currentTarget.dataset.id); if(version){const year=version.years[0];this.setData({routeYear:year,routeIndex:indexFor(this.data.years,year)});this.paint();} },
  openGallery(e) { const galleryType=e.currentTarget.dataset.id; if(GALLERY.includes(galleryType)){this.setData({tab:'gallery',galleryType});this.paint();} },
  pickGallery(e) { const value=e.currentTarget.dataset.id; if(GALLERY.includes(value)){this.setData({galleryType:value});this.paint();} },
  pickUpdateType(e) { const value=e.currentTarget.dataset.id;if(['stories','news'].includes(value))this.setData({updateType:value,activeArticle:null}); },
  openArticle(e) { const list=e.currentTarget.dataset.type==='news'?this.data.news:this.data.stories,article=list.find(item=>item.id===e.currentTarget.dataset.id);if(article)this.setData({activeArticle:article}); },
  closeArticle() { this.setData({activeArticle:null}); },
  stopTap() {},
  previewImage(e) { const current=asset(e.currentTarget.dataset.url);if(!current)return;const group=e.currentTarget.dataset.images;const urls=Array.isArray(group)?group.map(item=>asset(item.url)).filter(Boolean):[current];wx.previewImage({current,urls:urls.includes(current)?urls:[current]}); },
  previewAlbum(e) { const album=this.data.albums.find(item=>item.id===e.currentTarget.dataset.id);if(album && album.media.length)wx.previewImage({current:album.media[0].url,urls:album.media.map(item=>item.url)}); },
  heroError() { this.setData({heroFailed:true}); },
  onShareAppMessage() { const tab=this.data.tab,year=tab==='entry'?this.data.entryYear:tab==='route'?this.data.routeYear:tab==='results'?this.data.resultsYear:'';return {title:(this.data.race && this.data.race.name || '赛事')+' · 赛事专题',path:'/pages/race-archive/race-archive?id='+encodeURIComponent(this._id)+'&tab='+tab+(year?'&year='+year:'')+(tab==='gallery'?'&category='+encodeURIComponent(this.data.galleryType):'')+(tab==='updates'?'&type='+this.data.updateType:'')+(tab==='entry'?'&section='+this.data.entrySection:'')}; }
});
