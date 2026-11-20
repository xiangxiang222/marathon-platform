const { request } = require('../../utils/request');
const TABS = [{id:'overview',label:'概况'},{id:'entry',label:'参赛'},{id:'route',label:'赛道'},{id:'results',label:'成绩'},{id:'gallery',label:'图鉴'},{id:'updates',label:'动态'}];
const GALLERY = ['参赛服','奖牌','参赛包','完赛包','官方图集'];
const { landmarkSrc } = require('../../utils/race-landmarks');
const LEGACY = {registration:'entry',logistics:'entry',participation:'results',gear:'gallery',stories:'updates'};
function safeUrl(value) { return /^https:\/\//i.test(String(value||'')) && safeSourceUrl(value) || /^\/marathon\/(?:api\/race-archive-media\/(?:beijing|shanghai|xiamen|wuxi|wuhan|guangzhou|chongqing|dongying|hengshuihu|xian|taiyuan|changsha|chengdu|dalian|lanzhou|shenzhen|hangzhou)\/[a-f0-9]{64}\.(?:jpg|png|webp)|images\/race-archives\/[a-z0-9_/-]+\.(?:png|jpe?g|webp))$/i.test(String(value || '')); }
function safeSourceUrl(value) { return /^https?:\/\/[^\s/@?#]+(?:[/?#][^\s]*)?$/i.test(String(value || '')); }
function statusLabel(value) { return {completed:'已举办',scheduled:'已公告',cancelled:'已取消',postponed:'延期',upcoming:'待举办'}[value] || value || ''; }
function asset(value) { if (!safeUrl(value)) return ''; return value[0] === '/' ? String(getApp().globalData.baseUrl || '').replace(/\/$/,'') + value : value; }
function photos(items, fallback) { const images = (items || []).map(item => ({url:asset(item.url),caption:item.caption || '',credit:item.mediaRights && item.mediaRights.attribution || ''})).filter(item => item.url); const url = asset(fallback); if(url && !images.some(item => item.url === url)) images.unshift({url,caption:'',credit:''}); return images; }
function officialResources(edition, category) { return ((edition && edition.officialResources) || []).filter(item => category && item.category === category && safeSourceUrl(item.url)); }
function evidenceLinks(edition, category, facts, sources) {
  const urls = new Map(officialResources(edition, category).map(link => [link.url, link]));
  const ids = new Set(facts.filter(Boolean).flatMap(fact => fact.sourceIds || []));
  for (const source of sources) if (source.url && ids.has(source.id) && (source.applicableYears || []).map(String).includes(String(edition && edition.year)) && !urls.has(source.url)) urls.set(source.url,{url:source.url,title:source.title});
  return Array.from(urls.values());
}
function fields(value, labels) { return labels.filter(([key]) => value && value[key]).map(([key,label]) => ({label,value:value[key]})); }
function cert(value) { return value && value.label ? value.label + (value.year ? ' · '+value.year : '') : ''; }
function indexFor(years, year) { return Math.max(0,years.indexOf(String(year))); }
function lottery(editions) {
  const columns = [['lotteryRate','公布中签率'],['applicants','报名人数'],['eligibleApplicants','有效报名'],['lotteryPool','抽签人数'],['drawQuota','抽签名额'],['directQuota','直通名额']].filter(([key]) => editions.some(e => e.registration && e.registration[key])).map(([key,label]) => ({key,label}));
  return {lotteryColumns:columns,lotteryWidth:70+columns.length*160,lotteryRows:editions.map(e => ({year:String(e.year),cells:columns.map(c => ({key:c.key,value:e.registration && e.registration[c.key] || '—'}))}))};
}
Page({
  data:{race:null,archive:null,tabs:TABS,tab:'overview',loading:true,message:'',landmarkSrc:'',heroUrl:'',heroFailed:false,waLabel:'',caaLabel:'',foundingYear:'',years:[],entryYear:'',entryIndex:0,entrySection:'registration',entryEdition:null,entryFacts:[],guideSections:[],routeYear:'',routeIndex:0,routeEdition:null,routeStages:[],routeImages:[],routeResources:[],routeVersions:[],routeVersionNote:'',resultsYear:'',resultsIndex:0,resultsEdition:null,resultFacts:[],galleryTypes:GALLERY,galleryType:'参赛服',galleryGroups:[],albums:[],galleryYear:'',storyYear:'',galleryYearIndex:0,storyYearIndex:0,yearFilters:[],annualCoverage:[],annualExpanded:false,registrationLinks:[],guideLinks:[],resultLinks:[],updateType:'stories',stories:[],news:[],activeArticle:null,latestEdition:null,relatedRaces:[],fromRace:null,lotteryColumns:[],lotteryRows:[],lotteryWidth:70,history:[],visibleHistory:[],historyExpanded:false,records:[],entryNotes:[],entryTips:[],entryEvents:[],entryStatus:'',sources:[],sourcesExpanded:false,gaps:[],conflicts:[],coverageExpanded:false,overviewHighlights:[],directoryUrl:'/pages/race-catalog/race-catalog'},
  onLoad(query) { this._id=query.id || ''; this._fromRaceId=query.fromRaceId || ''; this._query=query; this._seq=0; this._disposed=false; const tab=LEGACY[query.tab] || query.tab; this.setData({tab:TABS.some(item => item.id===tab)?tab:'overview',entrySection:query.tab==='logistics' || query.section==='guide'?'guide':'registration',galleryType:GALLERY.includes(query.category)?query.category:'参赛服',updateType:query.type==='news'?'news':'stories'}); this.load(); },
  onUnload() { this._disposed=true; this._seq++; },
  load() { const seq=++this._seq; this.setData({loading:true,message:''}); return request('/race-catalog/'+encodeURIComponent(this._id)).then(data => {
    if(this._disposed || seq!==this._seq)return; if(!data.race || !data.archive)throw Error('这场赛事尚无档案');
    this._archive=data.archive; this._editions=(data.archive.editions || []).slice().sort((a,b)=>Number(b.year)-Number(a.year));
    const years=this._editions.map(e=>String(e.year)), latest=years[0] || '', results=this._editions.find(e=>(e.results || []).length), linked=(data.relatedRaces || []).find(r=>String(r.id)===String(this._fromRaceId));
    const preferred=String(this._query.year || linked && linked.raceDate && linked.raceDate.slice(0,4) || ''), initial=years.includes(String(data.defaultYear))?String(data.defaultYear):latest,selected=years.includes(preferred)?preferred:initial;
    const entryYear=this.data.tab==='entry'?selected:initial,routeYear=this.data.tab==='route'?selected:initial,resultsYear=this.data.tab==='results' && years.includes(preferred)?selected:String(results && results.year || initial);
    this._stories=[...(data.archive.updates || []),...(data.archive.stories || [])].filter((item,i,items)=>items.findIndex(row=>row.title===item.title)===i).map((item,i)=>({...item,id:item.id || 'story-'+i,images:photos(item.images)}));
    const news=(data.archive.news || []).map((item,i)=>({...item,id:item.id || 'news-'+i,images:photos(item.images)})).sort((a,b)=>String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
    this._albums=(data.archive.photoAlbums || []).map((item,i)=>({...item,id:item.id || 'album-'+i,media:photos(item.media)})).filter(item=>item.media.length).sort((a,b)=>Number(b.year)-Number(a.year));
    let routeVersions=(data.archive.routeGroups || []).map((item,i)=>({...item,id:item.id || 'version-'+i,years:(item.years || []).map(String).filter(y=>years.includes(y))})).filter(item=>item.years.length);
    if(!routeVersions.length && data.race.id==='beijing' && years.includes('2025') && years.includes('2026'))routeVersions=[{id:'beijing-road-sequence',title:'近年道路序列',years:['2026','2025'],match:'similar',note:'2025、2026 公布的道路序列相近，细部线位仍分别记录。'}];
    const grouped=new Set(routeVersions.flatMap(item=>item.years)); routeVersions=routeVersions.concat(years.filter(y=>!grouped.has(y)).map(y=>({id:'year-'+y,title:y+' 年路线',years:[y],note:''}))).map(item=>({...item,yearsLabel:item.years.join(' / ')}));
    const founding=data.archive.profile && data.archive.profile.foundingYear || '';
    const history=data.archive.history||[],profile=data.archive.profile||{},entryNotes=Array.isArray(profile.entryNotes)?profile.entryNotes:profile.entryNotes?[profile.entryNotes]:[];
    const sources=(data.archive.sources||[]).map(source=>({...source,url:safeSourceUrl(source.url)?source.url:'',yearsLabel:(source.applicableYears||[]).join('、')||'见对应事实',checkedAt:source.verifiedAt||source.accessedAt||'待补充'}));
    const directoryQuery=['q','wa','caa'].filter(key=>this._query[key]).map(key=>key+'='+encodeURIComponent(this._query[key])).join('&');
    const records=(data.archive.records||[]).map(item=>({...item,sources:sources.filter(source=>source.url&&(item.sourceIds||[]).includes(source.id))}));
    const filteredYear=years.includes(String(this._query.year||''))?String(this._query.year):'';
    const galleryYear=this.data.tab==='gallery'?filteredYear:'',storyYear=this.data.tab==='updates'?filteredYear:'',yearFilters=['全部年份',...years];
    this.setData({annualCoverage:this._editions.map(e=>({year:String(e.year),status:statusLabel(e.status),available:e.coverage&&e.coverage.available||[],missing:(e.coverage&&e.coverage.missing||[]).join('、')})),annualExpanded:false,yearFilters,galleryYear,storyYear,galleryYearIndex:indexFor(yearFilters,galleryYear),storyYearIndex:indexFor(yearFilters,storyYear)});
    this.setData({history,visibleHistory:history.slice(0,5),historyExpanded:false,records,entryNotes,sources,sourcesExpanded:false,gaps:data.archive.gaps||[],conflicts:(data.archive.conflicts||[]).map(item=>typeof item==='string'?item:item.reason||item.resolution||item.note||'资料口径待核实'),coverageExpanded:false,overviewHighlights:(data.archive.highlights||[]).slice(0,3),directoryUrl:'/pages/race-catalog/race-catalog'+(directoryQuery?'?'+directoryQuery:'')});
    this.setData({race:data.race,archive:data.archive,landmarkSrc:landmarkSrc(data.race.id),heroUrl:asset(data.archive.hero && data.archive.hero.imageUrl),heroFailed:false,waLabel:cert(data.race.worldAthletics),caaLabel:cert(data.race.caa),foundingYear:founding,years,entryYear,entryIndex:indexFor(years,entryYear),routeYear,routeIndex:indexFor(years,routeYear),resultsYear,resultsIndex:indexFor(years,resultsYear),latestEdition:this._editions[0] || null,routeVersions,news,relatedRaces:data.relatedRaces || [],fromRace:linked || null,loading:false,...lottery(this._editions)});
    this.paint(); wx.setNavigationBarTitle({title:data.race.name+' · 赛事专题'});
  }).catch(error=>{if(!this._disposed && seq===this._seq)this.setData({loading:false,message:error.message || '赛事档案暂时无法加载'});}); },
  paint() {
    const entry=this._editions.find(e=>String(e.year)===this.data.entryYear),route=this._editions.find(e=>String(e.year)===this.data.routeYear),result=this._editions.find(e=>String(e.year)===this.data.resultsYear);
    const guideSections=[{id:'collection',title:'领物安排',labels:[['time','领物时间'],['place','领物地点'],['requirements','领取要求']]},{id:'transport',title:'交通与离场',labels:[['expo','领物交通'],['start','前往起点'],['finish','终点离场']]},{id:'raceDay',title:'比赛日服务',labels:[['startTime','发枪与分区'],['timeLimit','关门安排'],['bagDrop','存取包'],['aidStations','补给与饮水'],['toilets','卫生间'],['medical','医疗服务']]}].map(s=>({id:s.id,title:s.title,fields:fields(entry && entry.logistics && entry.logistics[s.id],s.labels)})).filter(s=>s.fields.length);
    const routeStages=String(route && route.route && route.route.summary || '').split('→').map(name=>name.trim()).filter(Boolean).map((name,i)=>({order:String(i+1).padStart(2,'0'),name}));
    const routeVersion=this.data.routeVersions.find(item=>item.years.includes(this.data.routeYear));
    const routeVersions=this.data.routeVersions.map(item=>({...item,selected:item.years.includes(this.data.routeYear)}));
    const galleryGroups=this._editions.filter(e=>!this.data.galleryYear||String(e.year)===this.data.galleryYear).map(e=>({year:String(e.year),resources:officialResources(e,{'参赛服':'shirt','奖牌':'medal'}[this.data.galleryType]),items:(e.gear || []).filter(g=>g.category===this.data.galleryType).map((g,i)=>({...g,id:String(e.year)+'-'+i,images:photos(g.images,g.imageUrl)}))})).filter(group=>group.items.length || group.resources.length);
    const resultsEdition=result?{...result,results:(result.results || []).map((item,i)=>({...item,key:i,timing:item.timing || '计时口径待补充'}))}:null;
    // Keep older authored editions readable while the archive migration is in progress.
    // New records use project/distanceKm/plannedParticipants; legacy records used
    // name/distance/planned.  The display layer always receives the structured keys.
    const entryEvents=(entry&&entry.events||[]).map(item=>({...item,project:item.project||item.name||'',distanceKm:item.distanceKm!=null&&item.distanceKm!==''?item.distanceKm:(item.distance||''),plannedParticipants:item.plannedParticipants!=null&&item.plannedParticipants!==''?item.plannedParticipants:(item.planned||'')}));
    const registrationLinks=evidenceLinks(entry,'registration',[entry&&entry.registration],this.data.sources);
    const guideLinks=evidenceLinks(entry,'guide',Object.values(entry&&entry.logistics||{}),this.data.sources);
    const resultLinks=evidenceLinks(result,'results',result&&result.results||[],this.data.sources);
    const stories=this._stories.filter(item=>!this.data.storyYear||String(item.editionYear)===this.data.storyYear);
    const albums=this._albums.filter(item=>!this.data.galleryYear||String(item.year)===this.data.galleryYear);
    this.setData({registrationLinks,guideLinks,resultLinks,stories,albums});
    this.setData({entryTips:entry&&entry.logistics&&entry.logistics.tips||[],entryEvents,entryStatus:statusLabel(entry&&entry.status)});
    this.setData({entryEdition:entry || null,entryFacts:fields(entry && entry.registration,[['opens','报名开始'],['closes','报名截止'],['drawDate','抽签公布'],['fee','报名费用'],['qualification','报名资格'],['plannedQuota','计划名额'],['direct','直通规则'],['waitlist','候补规则'],['payment','缴费时间与方式'],['applicants','报名人数'],['eligibleApplicants','有效报名'],['lotteryPool','抽签人数'],['drawQuota','抽签名额'],['lotteryRate','公布中签率'],['directQuota','直通名额']]),guideSections,routeEdition:route || null,routeStages,routeImages:photos(route && route.route && route.route.images,route && route.route && route.route.mapUrl),routeResources:officialResources(route,'route-map'),routeVersions,routeVersionNote:routeVersion && routeVersion.note || '',resultsEdition,resultFacts:fields(result && result.participation,[['planned','计划规模'],['starters','实际起跑'],['finishers','完赛人数'],['finishRate','完赛率']]),galleryGroups});
  },
  pickTab(e) { const tab=e.currentTarget.dataset.id; if(TABS.some(item=>item.id===tab)){this.setData({tab,activeArticle:null});this.paint();} },
  toggleAnnual() { this.setData({annualExpanded:!this.data.annualExpanded}); },
  openEdition(e) {
    const {id,year}=e.currentTarget.dataset, index=this.data.years.indexOf(String(year));
    if(index<0)return;
    if(id==='shirt'||id==='medal')this.setData({tab:'gallery',galleryType:id==='shirt'?'参赛服':'奖牌',galleryYear:year,galleryYearIndex:index+1});
    else if(id==='stories')this.setData({tab:'updates',updateType:'stories',storyYear:year,storyYearIndex:index+1});
    else if(id==='route')this.setData({tab:'route',routeYear:year,routeIndex:index});
    else if(id==='participation')this.setData({tab:'results',resultsYear:year,resultsIndex:index});
    else this.setData({tab:'entry',entrySection:id==='logistics'?'guide':'registration',entryYear:year,entryIndex:index});
    this.paint();
  },
  pickFilterYear(e) {
    const scope=e.currentTarget.dataset.scope,index=Number(e.detail.value);
    if(!['gallery','story'].includes(scope)||!Number.isInteger(index)||index<0||index>=this.data.yearFilters.length)return;
    this.setData({[scope+'Year']:index?this.data.yearFilters[index]:'',[scope+'YearIndex']:index});
    this.paint();
  },
  pickEntrySection(e) { const value=e.currentTarget.dataset.id; if(['registration','guide'].includes(value))this.setData({entrySection:value}); },
  pickYear(e) { const scope=e.currentTarget.dataset.scope, index=Number(e.detail.value); if(!['entry','route','results'].includes(scope)||!this.data.years[index])return;this.setData({[scope+'Year']:this.data.years[index],[scope+'Index']:index});this.paint(); },
  setEntryYear(e) { const year=String(e.currentTarget.dataset.year);if(this.data.years.includes(year)){this.setData({entryYear:year,entryIndex:indexFor(this.data.years,year)});this.paint();} },
  pickVersion(e) { const version=this.data.routeVersions.find(item=>item.id===e.currentTarget.dataset.id); if(version){const year=version.years[0];this.setData({routeYear:year,routeIndex:indexFor(this.data.years,year)});this.paint();} },
  openGallery(e) { const galleryType=e.currentTarget.dataset.id; if(GALLERY.includes(galleryType)){this.setData({tab:'gallery',galleryType});this.paint();} },
  pickGallery(e) { const value=e.currentTarget.dataset.id; if(GALLERY.includes(value)){this.setData({galleryType:value});this.paint();} },
  pickUpdateType(e) { const value=e.currentTarget.dataset.id;if(['stories','news'].includes(value))this.setData({updateType:value,activeArticle:null}); },
  openArticle(e) { const list=e.currentTarget.dataset.type==='news'?this.data.news:this.data.stories,article=list.find(item=>item.id===e.currentTarget.dataset.id);if(article)this.setData({activeArticle:{...article,sources:this.data.sources.filter(source=>source.url && (article.sourceIds || []).includes(source.id))}}); },
  closeArticle() { this.setData({activeArticle:null}); },
  stopTap() {},
  previewImage(e) { const current=asset(e.currentTarget.dataset.url);if(!current)return;const group=e.currentTarget.dataset.images;const urls=Array.isArray(group)?group.map(item=>asset(item.url)).filter(Boolean):[current];wx.previewImage({current,urls:urls.includes(current)?urls:[current]}); },
  previewAlbum(e) { const album=this.data.albums.find(item=>item.id===e.currentTarget.dataset.id);if(album && album.media.length)wx.previewImage({current:album.media[0].url,urls:album.media.map(item=>item.url)}); },
  heroError() { this.setData({heroFailed:true}); },
  toggleHistory() { const expanded=!this.data.historyExpanded;this.setData({historyExpanded:expanded,visibleHistory:expanded?this.data.history:this.data.history.slice(0,5)}); },
  toggleSources() { this.setData({sourcesExpanded:!this.data.sourcesExpanded}); },
  toggleCoverage() { this.setData({coverageExpanded:!this.data.coverageExpanded}); },
  copyResource(e) { const url=e.currentTarget.dataset.url;if(safeSourceUrl(url))wx.setClipboardData({data:url}); },
  copySource(e) { const source=this.data.sources.find(item=>item.id===e.currentTarget.dataset.id);if(source&&safeSourceUrl(source.url))wx.setClipboardData({data:source.url}); },
  onShareAppMessage() { const tab=this.data.tab,year=tab==='entry'?this.data.entryYear:tab==='route'?this.data.routeYear:tab==='results'?this.data.resultsYear:tab==='gallery'?this.data.galleryYear:tab==='updates'&&this.data.updateType==='stories'?this.data.storyYear:'';return {title:(this.data.race && this.data.race.name || '赛事')+' · 赛事专题',path:'/pages/race-archive/race-archive?id='+encodeURIComponent(this._id)+'&tab='+tab+(year?'&year='+year:'')+(tab==='gallery'?'&category='+encodeURIComponent(this.data.galleryType):'')+(tab==='updates'?'&type='+this.data.updateType:'')+(tab==='entry'?'&section='+this.data.entrySection:'')}; }
});
