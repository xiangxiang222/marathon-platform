'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const catalog = require('../shared/race-catalog.json');
const { publicEdition } = require('../server/src/race-catalog');
const archives = Object.fromEntries(catalog.races.map(race => [race.id, require('../shared/race-archives/' + race.id + '.json')]));
const copy = value => JSON.parse(JSON.stringify(value));
const settle = async () => { await Promise.resolve(); await new Promise(resolve => setImmediate(resolve)); };
const event = (dataset, value) => ({ currentTarget: { dataset: dataset || {} }, detail: { value } });
function fixture(pageName = 'race-archive') {
  let definition, reply;
  const requests = [], previews = [], patches = [], clipboard = [];
  reply = async url => {
    if (url.startsWith('/race-catalog?')) return { races: copy(catalog.races), filterOptions: { worldAthletics: ['白金标','金标'], caa: ['A类'] } };
    const id = decodeURIComponent(url.split('/').at(-1)), race = catalog.races.find(item => item.id === id);
    if (!race) throw Error('不存在的档案');
    const raw = archives[id], archive = {...raw, editions:raw.editions.map(edition => publicEdition(edition,raw))}, years=archive.editions.map(e=>String(e.year)).sort((a,b)=>Number(b)-Number(a));
    return copy({race,archive,years,latestYear:years[0],defaultYear:years[0],relatedRaces:[{id:'full-'+id,name:'2025'+race.name,raceDate:'2025-11-01'}]});
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'miniprogram/pages',pageName,pageName+'.js'),'utf8'),{
    Page(value){definition=value;},getApp:()=>({globalData:{baseUrl:'https://runner.example'}}),
    require(name){if(name==='../../utils/race-landmarks')return require('../miniprogram/utils/race-landmarks');assert.equal(name,'../../utils/request');return {request(url){requests.push(url);return Promise.resolve().then(()=>reply(url));}};},
    wx:{setNavigationBarTitle(){},previewImage(value){previews.push(value);},setClipboardData(value){clipboard.push(value.data);}}
  },{filename:pageName+'.js'});
  const page={...definition,data:copy(definition.data),setData(patch){patches.push(copy(patch));for(const [key,value] of Object.entries(patch))this.data[key]=value;}};
  return {page,requests,previews,patches,clipboard,setReply(fn){reply=fn;}};
}

test('all published event topics expose six categories with independent local year selections', async () => {
  for(const race of catalog.races){
    const {page}=fixture();page.onLoad({id:race.id});await settle();
    assert.equal(page.data.loading,false);assert.equal(page.data.race.id,race.id);
    assert.equal(page.data.landmarkSrc,'/images/race-landmarks/'+race.id+'.png');
    assert.ok(fs.existsSync(path.join(ROOT,'miniprogram',page.data.landmarkSrc)));
    assert.deepEqual(copy(page.data.tabs.map(t=>t.id)),['overview','entry','route','results','gallery','updates']);
    assert.equal('year' in page.data,false,'No global edition selection');
    const latest=page.data.years[0],old=page.data.years.at(-1),resultYear=page.data.resultsYear;
    page.pickTab(event({id:'entry'}));page.pickYear(event({scope:'entry'},String(page.data.years.length-1)));
    assert.equal(page.data.entryYear,old);assert.equal(page.data.entryEdition.year,old);assert.equal(page.data.routeYear,latest);assert.equal(page.data.resultsYear,resultYear);
    page.pickEntrySection(event({id:'guide'}));
    for(const group of page.data.guideSections)for(const field of group.fields)assert.ok(Object.values(page.data.entryEdition.logistics[group.id]).includes(field.value));
    page.pickTab(event({id:'route'}));page.pickYear(event({scope:'route'},String(page.data.years.length-1)));
    assert.equal(page.data.routeEdition.year,old);assert.equal(page.data.entryYear,old);assert.equal(page.data.resultsYear,resultYear);
    const otherIndex=Math.min(1,page.data.years.length-1),otherYear=page.data.years[otherIndex];
    page.pickTab(event({id:'results'}));page.pickYear(event({scope:'results'},String(otherIndex)));
    assert.equal(page.data.resultsEdition.year,otherYear);assert.equal(page.data.routeYear,old);
    page.pickTab(event({id:'gallery'}));
    assert.equal(page.data.galleryGroups.length,archives[race.id].editions.filter(e=>e.gear?.some(g=>g.category==='参赛服') || e.officialResources?.some(item=>item.category==='shirt')).length);
    page.pickGallery(event({id:'奖牌'}));assert.ok(page.data.galleryGroups.every(group=>group.items.every(g=>g.category==='奖牌')));
    assert.equal(page.data.entryYear,old);assert.equal(page.data.resultsYear,otherYear);
    const archive=archives[race.id];
    page.pickTab(event({id:'updates'}));assert.equal(page.data.stories.length,new Set([...(archive.updates||[]),...(archive.stories||[])].map(item=>item.title)).size);
  }
});

test('every edition can open its own evidence and copy official links', async () => {
  for (const race of catalog.races) {
    const { page, clipboard } = fixture();
    page.onLoad({ id: race.id }); await settle();
    for (const edition of archives[race.id].editions) {
      const resources = edition.officialResources || [];
      for (const [id, selected, category, links] of [['route','routeYear','route-map','routeResources'],['participation','resultsYear','results','resultLinks'],['logistics','entryYear','guide','guideLinks']]) {
        page.openEdition(event({ id, year: edition.year }));
        assert.equal(page.data[selected], edition.year);
        for (const resource of resources.filter(item => item.category === category)) {
          assert.ok(page.data[links].some(item => new URL(item.url).href === new URL(resource.url).href), race.id + ' ' + edition.year + ' ' + category);
          const link = page.data[links].find(item => new URL(item.url).href === new URL(resource.url).href);
          page.copyResource(event({ url: link.url }));
          assert.equal(clipboard.at(-1), link.url);
        }
      }
      page.openEdition(event({ id:'shirt', year:edition.year }));
      for (const [label, category] of [['参赛服','shirt'],['奖牌','medal']]) {
        page.pickGallery(event({ id:label }));
        assert.ok(page.data.galleryGroups.every(group => group.year === edition.year));
        for (const resource of resources.filter(item => item.category === category)) assert.ok(page.data.galleryGroups.flatMap(group => group.resources).some(item => new URL(item.url).href === new URL(resource.url).href));
      }
      page.openEdition(event({ id:'stories', year:edition.year }));
      assert.ok(page.data.stories.every(item => String(item.editionYear) === edition.year));
    }
  }
});

test('results default to latest completed results, routes group only explicitly known near versions, legacy links remain usable',async()=>{
  const f=fixture();f.page.onLoad({id:'shanghai'});await settle();
  assert.equal(f.page.data.entryYear,'2026');assert.equal(f.page.data.resultsYear,'2025');
  const bj=fixture();bj.page.onLoad({id:'beijing',tab:'logistics',year:'2024',fromRaceId:'full-beijing'});await settle();
  assert.equal(bj.page.data.tab,'entry');assert.equal(bj.page.data.entrySection,'guide');assert.equal(bj.page.data.entryYear,'2024');assert.equal(bj.page.data.routeYear,'2026');assert.equal(bj.page.data.fromRace.id,'full-beijing');
  const near=bj.page.data.routeVersions.find(v=>v.years.length===2);assert.equal(near.match,'similar');assert.deepEqual(copy(near.years),['2026','2025']);assert.match(near.note,/相近/);
  const share=bj.page.onShareAppMessage();assert.ok(share.path.includes('tab=entry'));assert.ok(share.path.includes('year=2024'));assert.ok(share.path.includes('section=guide'));
  const invalid=fixture();invalid.page.onLoad({id:'beijing',tab:'unknown',year:'1900',fromRaceId:'unrelated'});await settle();assert.equal(invalid.page.data.tab,'overview');assert.equal(invalid.page.data.fromRace,null);
});

test('uploaded cover, annual multi-image groups, albums and stories use actual public media without fake placeholders',async()=>{
  const f=fixture(),media='/marathon/api/race-archive-media/beijing/'+('a'.repeat(64))+'.png',second='/marathon/api/race-archive-media/beijing/'+('b'.repeat(64))+'.jpg';
  const raw=copy(archives.beijing);raw.hero={imageUrl:media};raw.editions[0].gear.find(g=>g.category==='参赛服').images=[{url:media,caption:'正面'},{url:second,caption:'背面'}];raw.photoAlbums=[{id:'photos-2026',title:'2026赛事照片',year:'2026',media:[{url:media,caption:'起跑'},{url:second,caption:'冲线'}]}];raw.updates=[{id:'new-story',title:'后台维护的新鲜事',body:'真实内容',images:[{url:media}]}];raw.news=[{id:'new-news',title:'后台新闻',summary:'摘要',body:'正文',publishedAt:'2026-11-14'}];
  f.setReply(()=>({race:catalog.races[0],archive:raw,relatedRaces:[]}));f.page.onLoad({id:'beijing'});await settle();
  assert.equal(f.page.data.heroUrl,'https://runner.example'+media);
  const group=f.page.data.galleryGroups[0].items[0];assert.deepEqual(copy(group.images.map(i=>i.caption)),['正面','背面']);
  f.page.previewImage(event({url:group.images[1].url,images:group.images}));assert.equal(f.previews[0].current,'https://runner.example'+second);assert.equal(f.previews[0].urls.length,2);
  f.page.pickGallery(event({id:'官方图集'}));f.page.previewAlbum(event({id:'photos-2026'}));assert.equal(f.previews[1].urls.length,2);
  assert.ok(f.page.data.stories.some(story=>story.id==='new-story'));
  for(const story of raw.stories)assert.ok(f.page.data.stories.some(item=>item.title===story.title),'Admin updates and researched stories stay visible');
  f.page.openArticle(event({id:'new-story',type:'stories'}));assert.equal(f.page.data.activeArticle.body,'真实内容');f.page.closeArticle();assert.equal(f.page.data.activeArticle,null);
  f.page.pickUpdateType(event({id:'news'}));f.page.openArticle(event({id:'new-news',type:'news'}));assert.equal(f.page.data.activeArticle.body,'正文');
  const count=f.previews.length;for(const url of ['javascript:alert(1)','data:text/html,no','//evil.example/image','http://evil.example/image','/marathon/api/race-archive-media/beijing/../../secret.png'])f.page.previewImage(event({url}));assert.equal(f.previews.length,count);
  f.page.heroError();assert.equal(f.page.data.heroFailed,true);
});

test('topic load failures can retry, unloaded pages ignore late responses, empty archives stay readable',async()=>{
  const failure=fixture();failure.setReply(()=>{throw Error('连接失败');});failure.page.onLoad({id:'beijing'});await settle();assert.equal(failure.page.data.message,'连接失败');
  failure.setReply(()=>({race:catalog.races[0],archive:{intro:'空档案',editions:[],stories:[]},relatedRaces:[]}));await failure.page.load();assert.equal(failure.page.data.message,'');assert.equal(failure.page.data.entryEdition,null);assert.equal(failure.page.data.albums.length,0);
  for(const name of ['race-archive','race-catalog']){const f=fixture(name);let resolve;f.setReply(()=>new Promise(done=>{resolve=done;}));f.page.onLoad({id:'beijing'});await settle();f.page.onUnload();const before=f.patches.length;resolve({race:catalog.races[0],archive:archives.beijing,races:catalog.races});await settle();assert.equal(f.patches.length,before);}
});

test('template presents local years, collapsible evidence and no synthetic items',()=>{
  const template=fs.readFileSync(path.join(ROOT,'miniprogram/pages/race-archive/race-archive.wxml'),'utf8');
  assert.doesNotMatch(template,/本栏资料来源|activeSources|mapSourceUrl|archive-edition-bar/);
  assert.match(template,/toggleSources/);assert.match(template,/copySource/);assert.match(template,/toggleHistory/);assert.match(template,/toggleCoverage/);assert.match(template,/archive-records/);
  for(const id of ['overview','entry','route','results','gallery','updates'])assert.ok(template.includes("tab === '"+id+"'"));
  assert.match(template,/piece.images/);assert.match(template,/data-images/);assert.match(template,/previewAlbum/);assert.match(template,/非导航地图/);assert.match(template,/archive-image-credit/);
  const css=fs.readFileSync(path.join(ROOT,'miniprogram/pages/race-archive/race-archive.wxss'),'utf8');assert.doesNotMatch(css,/font-size:(?:[0-9]|1[01])px/);assert.match(css,/#ff1838/);
});

test('directory still intersects independent filters and handles failure, retry and empty lists',async()=>{
  const f=fixture('race-catalog');f.page.onLoad({});await settle();assert.equal(f.page.data.races.length,catalog.races.length);
  f.page.onQ(event({},'北马'));f.page.pickWa(event({},'1'));await settle();f.page.pickCaa(event({},'1'));await settle();const query=new URL(f.requests.at(-1),'https://local.example').searchParams;assert.equal(query.get('q'),'北马');assert.equal(query.get('wa'),'白金标');assert.equal(query.get('caa'),'A类');
  f.setReply(()=>{throw Error('不可用');});await f.page.load();assert.equal(f.page.data.message,'不可用');f.setReply(()=>({races:[]}));await f.page.load();assert.equal(f.page.data.message,'');assert.equal(f.page.data.races.length,0);
});

test('new city archive preserves history, records, year-specific advice and safe evidence without images',async()=>{
  const f=fixture(),source={id:'official',title:'2025官方公告',publisher:'赛事组委会',url:'https://official.example/notice',applicableYears:['2025'],verifiedAt:'2026-11-18'};
  const history=Array.from({length:7},(_,i)=>({date:String(2014+i),title:'历史节点'+i,body:'已核验的节点内容',sourceIds:['official']}));
  const record={group:'男子赛会纪录',project:'马拉松',athlete:'Test Runner',time:'02:08:01',editionId:'wuxi-2025',verifiedThroughEditionId:'wuxi-2025',verifiedAt:'2026-11-18'};
  const edition={year:'2025',editionName:'2025赛事',date:'2025-03-23',status:'completed',events:[{project:'马拉松',plannedParticipants:20000,fee:'以该届公告为准'}],route:{summary:'起点 → 城市公园 → 终点'},registration:{method:'2025抽签'},participation:{},results:[],gear:[],logistics:{tips:[{title:'提前安排领物',body:'依据2025公告预留本人领物时间',kind:'editorial-advice'}]}};
  const mapLink = { category:'route-map', title:'查看2025年官方赛道图', url:source.url, sourceIds:[source.id] };
  edition.officialResources = [mapLink,{...mapLink,url:'javascript:alert(1)'}];
  f.setReply(()=>({race:{id:'wuxi',name:'无锡马拉松',city:'无锡'},archive:{intro:'赛事简介',profile:{foundingYear:'2014',entryNotes:['2025报名设候补']},history,records:[record],editions:[edition],sources:[source,{...source,id:'unsafe',url:'javascript:alert(1)'}],gaps:[{reason:'历史费用待核实'}]},relatedRaces:[]}));
  f.page.onLoad({id:'wuxi',q:'锡马',wa:'金标'});await settle();
  assert.equal(f.page.data.heroUrl,'');assert.equal(f.page.data.landmarkSrc,'/images/race-landmarks/wuxi.png');assert.equal(f.page.data.visibleHistory.length,5);assert.equal(f.page.data.sourcesExpanded,false);
  f.page.toggleHistory();assert.equal(f.page.data.visibleHistory.length,7);f.page.toggleHistory();assert.equal(f.page.data.visibleHistory.length,5);
  assert.equal(f.page.data.records[0].time,'02:08:01');assert.deepEqual(copy(f.page.data.entryNotes),['2025报名设候补']);assert.equal(f.page.data.entryTips.length,1);assert.equal(f.page.data.entryEvents[0].plannedParticipants,20000);assert.equal(f.page.data.entryStatus,'已举办');
  assert.ok(f.page.data.directoryUrl.includes(encodeURIComponent('锡马')));assert.equal(f.page.data.sources[0].yearsLabel,'2025');f.page.toggleSources();assert.equal(f.page.data.sourcesExpanded,true);
  f.page.copySource(event({id:'official'}));f.page.copySource(event({id:'unsafe'}));assert.deepEqual(f.clipboard,[source.url]);
  assert.deepEqual(copy(f.page.data.routeResources),[mapLink]);
  f.page.copyResource(event({url:mapLink.url}));f.page.copyResource(event({url:'javascript:alert(1)'}));assert.deepEqual(f.clipboard,[source.url,mapLink.url]);
  f.page.toggleCoverage();assert.equal(f.page.data.coverageExpanded,true);assert.equal(f.page.data.gaps[0].reason,'历史费用待核实');
  const media='/marathon/api/race-archive-media/wuxi/'+('a'.repeat(64))+'.png';f.page.previewImage(event({url:media}));assert.equal(f.previews.at(-1).current,'https://runner.example'+media);
  const before=f.previews.length;f.page.previewImage(event({url:media.replace('/wuxi/','/unknown/')}));assert.equal(f.previews.length,before);
});

test('directory consumes full certification options and preserves non-default certification links',async()=>{
  const f=fixture('race-catalog');f.setReply(()=>({races:[],filterOptions:{worldAthletics:['白金标','金标','标牌'],caa:['A类','B类']}}));f.page.onLoad({wa:'标牌',caa:'B类'});await settle();
  assert.equal(f.page.data.waOptions[f.page.data.waIndex],'标牌');assert.equal(f.page.data.caaOptions[f.page.data.caaIndex],'B类');
  f.page.pickCaa(event({},'1'));await settle();assert.equal(new URL(f.requests.at(-1),'https://local.example').searchParams.get('caa'),'A类');
});
