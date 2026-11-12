/* Public-source collection. Run with --publish to insert recent news; without it
 * the command only collects snapshots. Runtime data survives code deployments. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalizeOfficial } = require('../server/src/official');
const { normalizeClock, toPacerPeople } = require('../server/src/pacer-people');
const { biographyFromRecords, buildAthleteArticle } = require('./athlete-biography.cjs');
const newsEnrichment = require('./content-news-enrichment.cjs');
function cstDay(now = new Date()) { return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0,10); }
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_DIR = path.join(ROOT, 'server/data/content');
const SOURCES = require('../shared/content-sources.json');
const CAA = 'https://api-changzheng.chinaath.com/changzheng-content-center-api/api/homePage/official/';
const CMS = 'https://user-gw.mararun.com/v2/cms/';
const clean = value => String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; } }
function writeJson(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n'); fs.renameSync(tmp, file); }
function publicUrl(raw, base) {
  try { const u = new URL(String(raw || '').replace(/&amp;/g, '&'), base); if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.') || /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(u.hostname) || u.hostname.endsWith('.local')) return ''; return u.href; } catch { return ''; }
}
async function getText(url, options = {}, fetchImpl = fetch) {
  let next = publicUrl(url); if (!next) throw new Error('Invalid public HTTPS source');
  for (let redirect = 0; redirect < 5; redirect++) {
    const response = await fetchImpl(next, { ...options, redirect: 'manual', headers: { 'User-Agent': 'MarathonPlatform/1.0 (public race results and source-linked news)', Accept: 'text/html,application/json', ...options.headers }, signal: AbortSignal.timeout(25000) });
    if ([301,302,303,307,308].includes(response.status)) { next = publicUrl(response.headers.get('location'), next); if (!next) throw new Error('Invalid source redirect'); continue; }
    if (!response.ok) throw new Error('Source HTTP ' + response.status);
    const text = await response.text(); if (text.length > 9_000_000) throw new Error('Source response too large');
    if (/环境异常|访问过于频繁|请输入验证码|captcha-container/i.test(text)) throw new Error('Source requires manual verification');
    return text;
  }
  throw new Error('Too many source redirects');
}
async function pool(items, concurrency, callback) {
  let index = 0; const results = [];
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => { for (;;) { const i = index++; if (i >= items.length) return; results[i] = await callback(items[i], i); } }));
  return results;
}
function isoDate(text) {
  const months = { JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12 };
  const m = clean(text).match(/^(\d{1,2}) ([A-Z]{3}) (\d{4})$/); if (m && months[m[2]]) return `${m[3]}-${String(months[m[2]]).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(text || '') ? text : '';
}
function parseToplist(html, { year, gender, day }) {
  const list = [], seen = new Set();
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = Object.fromEntries([...match[1].matchAll(/<td\b[^>]*data-th="([^"]+)"[^>]*>([\s\S]*?)<\/td>/gi)].map(m => [m[1], m[2]]));
    const rawId = cells.Competitor?.match(/(?:athlete=|-)(\d{7,})/i)?.[1], id = rawId ? String(Number(rawId)) : '';
    const mark = clean(cells.Mark), date = isoDate(clean(cells.Date)), nationality = clean(cells.Nat);
    if (!id || seen.has(id) || nationality !== 'CHN' || !/^\d:[0-5]\d:[0-5]\d$/.test(mark) || date.slice(0,4) !== String(year) || date > day) continue;
    seen.add(id); list.push({ worldAthleticsId:id, nameEn:clean(cells.Competitor), gender, seasonBest:mark, seasonEventDate:date, seasonEventVenue:clean(cells.Venue), seasonEventPosition:clean(cells.Pos), birthDate:isoDate(clean(cells.DOB)), sourceRank:clean(cells.Rank) });
  }
  const seconds = s => s.split(':').reduce((a,v) => a*60+Number(v),0);
  if (!list.length || list.some((r,i) => i > 0 && seconds(r.seasonBest) < seconds(list[i-1].seasonBest))) throw new Error('Unexpected or unordered World Athletics marathon table');
  return list.slice(0,100);
}
function topUrl(year, gender, day) { return `https://worldathletics.org/records/toplists/road-running/marathon/outdoor/${gender}/senior/${year}?regionType=countries&region=chn&bestResultsOnly=true&firstDay=${year}-01-01&lastDay=${day}&maxResultsByCountry=all`; }
function personUrl(row) { const slug = row.nameEn.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); return `https://worldathletics.org/athletes/pr-of-china/${slug}-${row.worldAthleticsId}`; }
function parsePerson(html, id) {
  const match = html.match(/<script\b[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  const c = match && JSON.parse(match[1]).props?.pageProps?.competitor;
  if (!c || Number(c._id) !== Number(id) || c.basicData?.countryCode !== 'CHN') throw new Error('Athlete identity not confirmed'); return c;
}
const DISCIPLINES = { Marathon:'全程马拉松', 'Half Marathon':'半程马拉松', '10 Kilometres':'10公里路跑', '10,000 Metres':'10000米', '5000 Metres':'5000米', '5,000 Metres':'5000米', '10000 Metres':'10000米' };
function enrichAthlete(row, old, competitor, index, { day, year, source }) {
  const url = personUrl(row), gender = row.gender === 'women' ? '女子' : '男子';
  const records = competitor?.personalBests?.results?.filter(r => DISCIPLINES[r.discipline] && !r.notLegal && isoDate(r.date) <= day).map(r => ({discipline:DISCIPLINES[r.discipline],mark:r.mark,date:isoDate(r.date),venue:r.venue,sourceUrl:url}));
  const pb = records?.find(r => r.discipline === '全程马拉松');
  const sameSeason = old?.seasonEventDate === row.seasonEventDate && old?.seasonBest === row.seasonBest;
  const name = old?.name || row.nameEn;
  const profile = { ...old, ...row, id:old?.id || 'athlete-' + row.worldAthleticsId, name, type:'athlete', seasonYear:year, rank:index+1, seasonRank:index+1, displayOrder:index+1, status:'active_in_' + year, statusLabel:`${year}赛季有有效全马成绩`, rankingLabel:`${year}赛季第${index+1}`, seasonEventName:sameSeason && old.seasonEventName ? old.seasonEventName : row.seasonEventVenue,
    personalBest:pb?.mark || old?.personalBest || '', eventDate:pb?.date || old?.eventDate || '', eventVenue:pb?.venue || old?.eventVenue || '', eventName:pb ? pb.venue : old?.eventName || '', personalRecords:records || old?.personalRecords || [],
    bio:`中国${gender}马拉松选手，${year}赛季已取得${row.seasonBest}的有效全马成绩，列本次中国籍${gender}榜第${index+1}；比赛日期${row.seasonEventDate}，地点${row.seasonEventVenue}。` + (pb ? `全马个人最佳${pb.mark}（${pb.date}，${pb.venue}）。` : old?.personalBest ? `已收录全马个人最佳${old.personalBest}。` : ''),
    avatar:old?.avatar || '', photoStatus:old?.photoStatus || 'awaiting_verified_public_photo', nameVerificationStatus:old?.nameVerificationStatus || 'official_romanized_name', verificationStatus:'verified', verifiedAt:day, personalDetailsCheckedAt:competitor ? day : old?.personalDetailsCheckedAt || '',
    verificationNote:old?.nameVerificationStatus === 'cross_checked_chinese_reporting' ? '' : '姓名以世界田联公开登记为准，中文姓名与照片持续核验。',
    sources:[{title:`World Athletics · ${year}中国${gender}全马赛季榜`,url:source},{title:`World Athletics · ${row.nameEn}个人资料`,url},...(old?.sources || []).filter(s => !s.url?.includes('worldathletics.org'))],
    highlights:[{date:row.seasonEventDate,title:`${year}赛季最佳 · ${row.seasonEventVenue}`,result:row.seasonBest,position:row.seasonEventPosition,sourceUrl:source}], careerHighlights:old?.careerHighlights || [] };
  if (competitor || !old?.biographySections?.length) Object.assign(profile, biographyFromRecords(profile, competitor, {asOf:day,year}));
  else {
    const overview=biographyFromRecords(profile,null,{asOf:day,year}).biographySections.find(s=>s.id==='overview');
    profile.biographySections=[overview,...old.biographySections.filter(s=>s.id!=='overview')];
    profile.article=buildAthleteArticle(profile,{asOf:day,year});
  }
  return profile;
}
async function syncAthletes(ctx) {
  const previous = readJson(path.join(ctx.dir,'elite-athletes.json'), readJson(path.join(ROOT,'shared/elite-athletes.json'),{athletes:[]}));
  const historical = readJson(path.join(ctx.dir,'elite-athletes-history.json'), readJson(path.join(ROOT,'shared/elite-athletes-history.json'),{athletes:[]}));
  const byId = new Map([...historical.athletes,...previous.athletes].map(a => [String(Number(a.worldAthleticsId)),a]));
  const profiles = [], sources = [], counts = {};
  for (const gender of ['men','women']) {
    const source = topUrl(ctx.year,gender,ctx.day); sources.push({title:`World Athletics · ${ctx.year}中国${gender==='men'?'男子':'女子'}全马榜`,url:source});
    const rows = parseToplist(await ctx.get(source),{...ctx,gender});
    if (rows.length < 100) throw new Error(`${gender}: source contains only ${rows.length} verified results; previous complete snapshot preserved`);
    const athletes = await pool(rows,4,async (row,index) => {
      const old = byId.get(row.worldAthleticsId); let competitor;
      if (!old?.personalDetailsCheckedAt || old.personalDetailsCheckedAt < ctx.weekAgo) {
        try { await new Promise(resolve=>setTimeout(resolve,250)); competitor = parsePerson(await ctx.get(personUrl(row)),row.worldAthleticsId); }
        catch (e) { ctx.warnings.push({section:'athlete-detail',id:row.worldAthleticsId,message:e.message}); }
      }
      return enrichAthlete(row,old,competitor,index,{...ctx,source});
    }); profiles.push(...athletes); counts[gender] = athletes.length;
  }
  const data = {version:3,asOf:ctx.day,updatedAt:ctx.now.toISOString(),seasonYear:ctx.year,rankingBasis:`World Athletics ${ctx.year}中国籍（CHN）成年组全程马拉松赛季最佳，男女各100名，每人一条。`,rankingNotice:`${ctx.year}赛季中国籍全马男女各100名，按赛季最佳排序，PB另列；核验至${ctx.day}。`,coverage:{requestedPerGender:100,...counts,withPhotos:profiles.filter(a=>a.avatar).length},biographyCoverage:{withSections:profiles.filter(a=>a.biographySections?.length).length,withDetailedProfiles:profiles.filter(a=>(a.biographySections||[]).reduce((n,s)=>n+s.body.length,0)>=300).length},sources,athletes:profiles};
  // Preserve links to athletes who fall outside the current top 100.
  const currentIds = new Set(profiles.map(a=>a.id));
  const history = new Map([...historical.athletes,...previous.athletes].filter(a=>!currentIds.has(a.id)).map(a=>[a.id,a]));
  writeJson(path.join(ctx.dir,'elite-athletes-history.json'),{...historical,athletes:[...history.values()]});
  writeJson(path.join(ctx.dir,'elite-athletes.json'),data);
  return {...counts,withPhotos:data.coverage.withPhotos,detailFailures:ctx.warnings.filter(w=>w.section==='athlete-detail').length};
}
function recentWindow(now, days=10) { const end = cstDay(now); const start = new Date(end+'T00:00:00+08:00'); start.setUTCDate(start.getUTCDate()-(days-1)); return {start:cstDay(start),end}; }
function parseNewsSearch(html) {
  const rows=[];
  // This publisher intentionally omits closing </li> tags in search results.
  for (const block of html.split(/<li\b[^>]*class="image"[^>]*>/gi).slice(1)) {
    const source=block.match(/lanmu1="([^"]+)"[^>]*lanmu2=[^>]*lanmu3="web_normal"/)?.[1];
    const title=clean(block.match(/<a\b[^>]*id="web_content_\d+"[^>]*>([\s\S]*?)<\/a>/)?.[1]);
    const date=block.match(/发布时间：\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/)?.[1];
    const url=publicUrl(source);
    if (!url || !new URL(url).hostname.endsWith('.cctv.com') || !title || !date || !newsEnrichment.isRunningNews(title)) continue;
    const cover=block.match(/<img[^>]*src="([^"]+)"/)?.[1];
    rows.push({title,sourceUrl:url,source:'央视网',publishedAt:date.replace(' ','T')+'+08:00',coverUrl:publicUrl(cover,'https://search.cctv.com')});
  }
  return rows;
}
function articleBody(html) { return html.match(/<!--repaste\.body\.begin-->([\s\S]*?)<!--repaste\.body\.end-->/i)?.[1] || ''; }
function articleTitle(html) { return clean(html.match(/<meta\b[^>]*property="og:title"[^>]*content="([^"]*)"/i)?.[1] || html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]).replace(/[_｜|].*(?:央视网|CCTV).*$/i,''); }
function newsSummary(row) { const title=row.title.replace(/^\[[^\]]+\]/,''); return `央视网${row.publishedAt.slice(0,10)}发布消息：${title}。本条收录该报道的赛事动态，完整赛况、成绩及现场画面请查看原文；具体参赛安排以赛事组委会公告为准。`; }
async function syncNews(ctx) {
  const window=recentWindow(ctx.now,10), found=new Map();
  for(let page=1;page<=SOURCES.news.maxPages;page++) {
    const url=SOURCES.news.searchUrl+'?'+new URLSearchParams({qtext:'马拉松',type:'web',sort:'date',page:String(page)});
    const rows=parseNewsSearch(await ctx.get(url));
    if (!rows.length && page===1) throw new Error('CCTV search layout changed or no source results');
    for(const row of rows) if(row.publishedAt.slice(0,10)>=window.start && row.publishedAt.slice(0,10)<=window.end && Date.parse(row.publishedAt)<=ctx.now.getTime()) found.set(row.sourceUrl,row);
    if(rows.length && rows.every(r=>r.publishedAt.slice(0,10)<window.start)) break;
  }
  // The publisher's video search is a public JSON endpoint used by its own page.
  try {
    for(let page=1;page<=3;page++) {
      const url='https://search.cctv.com/ifsearch.php?'+new URLSearchParams({page:String(page),qtext:'马拉松',sort:'date',pageSize:'100',type:'video',vtime:'-1',datepid:'1',channel:'',pageflag:'0',qtext_str:'马拉松'});
      const json=JSON.parse(await ctx.get(url));if(!Array.isArray(json.list))throw new Error('CCTV video search response invalid');
      for(const item of json.list){const title=clean(item.all_title||item.title),date=String(item.uploadtime||'').slice(0,10),sourceUrl=publicUrl(item.urllink);if(date>=window.start&&date<=window.end&&sourceUrl&&new URL(sourceUrl).hostname.endsWith('.cctv.com')&&newsEnrichment.isRunningNews(title))found.set(sourceUrl,{title,sourceUrl,source:'央视网',publishedAt:item.uploadtime.replace(' ','T')+'+08:00',coverUrl:publicUrl(item.imglink)});}
      if(!json.list.length||json.list.every(item=>String(item.uploadtime).slice(0,10)<window.start))break;
    }
  }catch(e){ctx.warnings.push({section:'news-video-search',message:e.message});}
  // Include already verified source-linked video reports inside this same window.
  for(const row of [...readJson(path.join(ROOT,'shared/content-starter-articles.json'),[]),...(newsEnrichment.newsCandidates?.()||[])]) if(row.publishedAt.slice(0,10)>=window.start && row.publishedAt.slice(0,10)<=window.end && Date.parse(row.publishedAt)<=ctx.now.getTime()) found.set(row.sourceUrl,{...row});
  const pending=[];
  const checked=await pool([...found.values()],4,async row=>{
    try {
      const html=await ctx.get(row.sourceUrl), title=articleTitle(html);
      if (!title || !newsEnrichment.isRunningNews(title) || /ERROR|页面不存在|404/i.test(title)) throw new Error('Article title not verified');
      const date=html.match(/(?:发布时间|来源：|class="info"|class="zebian")([\s\S]{0,400}?)(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/)?.[2];
      if (date && date!==row.publishedAt.slice(0,10)) throw new Error('Article publication date differs from search result');
      const body=articleBody(html), photo=body.match(/<img\b[^>]*src=["']([^"']+)["']/i)?.[1];
      const enriched=newsEnrichment.enrichNews({...row,title,category:'industry',coverUrl:publicUrl(photo,row.sourceUrl) || row.coverUrl || ''},html);
      if(!enriched.article){pending.push({title,sourceUrl:row.sourceUrl,publishedAt:row.publishedAt,reason:enriched.reason});return null;}
      return enriched.article;
    } catch(e) {ctx.warnings.push({section:'news',url:row.sourceUrl,message:e.message});return null;}
  });
  const articles=checked.filter(Boolean).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
  if(!articles.length)throw new Error('No verified marathon news in the last ten days; existing publications preserved');
  writeJson(path.join(ctx.dir,'recent-news.json'),{updatedAt:ctx.now.toISOString(),window,articles,pending});
  let published={inserted:0,skipped:0};
  if(ctx.publish) {
    const Database=require('../server/node_modules/better-sqlite3');
    const db=new Database(process.env.MARATHON_DB || path.join(ROOT,'server/data/app.sqlite')); db.pragma('busy_timeout = 10000');
    try { require('../server/src/content').installContent(db); published=require('./import-content-starters.cjs').importStarters(db,articles,{upgradeGenerated:true,exclude:newsEnrichment.newsExclusions()}); } finally {db.close();}
  }
  return {window,collected:articles.length,pending:pending.length,...published};
}
async function fetchClassARaces(ctx) {
  const rows=new Map();
  for(let page=1;page<=40;page++) {
    const raw=JSON.parse(await ctx.get(CAA+'searchCompetitionMls',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://www.runchina.org.cn'},body:JSON.stringify({provinceId:'',cityId:'',districtId:'',raceName:'',raceGrade:'A',raceStartTime:'',pageNo:page,pageSize:100})}));
    if(raw.success!==true||!Array.isArray(raw.data?.results))throw new Error('CAA race catalogue response invalid');
    const list=raw.data.results;
    for(const item of list){const r=normalizeOfficial(item);if(r && /^A(?:$|类|\s)/i.test(r.grade) && r.raceDate.startsWith(ctx.year+'-') && /马拉松/.test(r.name))rows.set(r.officialId,r);}
    if(page>=(Number(raw.data.pageCount)||1) || !list.length || list.every(r=>String(r.raceTime).slice(0,4)<String(ctx.year)))break;
  }
  if(!rows.size)throw new Error('No current-year A-class races verified by CAA');
  return [...rows.values()];
}
function cmsCandidates(home) {
  const all=[];
  for(const value of Object.values(home.articles||{}))if(Array.isArray(value))all.push(...value);
  return all.filter(a=>/配速员|官方领跑员|官兔|领跑兔/.test(a.title||a.name||'') && !/招募|报名|招聘/.test(a.title||a.name||''));
}
function parsePacerGroups(html) {
  const groups=[]; let current;
  for(const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells=[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>clean(m[1]));
    const first=cells[0]||'', chinese=first.match(/^([2-6])\s*小时(?:\s*(\d{1,2})\s*分)?(?!钟)/);
    const clock=first.match(/^([2-6])[：:]([0-5]\d)(?:[：:]00)?(?:\s|$)/);
    const target=clock?`${clock[1]}:${clock[2]}`:chinese&&!/秒/.test(first)?`${chinese[1]}:${String(chinese[2]||'0').padStart(2,'0')}`:'';
    if(target){current=groups.find(g=>g.targetTime===target);if(!current){current={label:target+' 完赛组',targetTime:target,names:[],members:[]};groups.push(current);}}
    const sex=cells.findIndex(v=>/^[男女]$/.test(v));
    if(current&&sex>0&&/^[\u4e00-\u9fff·]{2,12}$/.test(cells[sex-1])) {
      const name=cells[sex-1],gender=cells[sex]==='女'?'women':'men';
      if(!current.names.includes(name))current.names.push(name);
      if(!current.members.some(p=>p.name===name&&p.gender===gender))current.members.push({name,gender,personalBest:cells.slice(sex+1).map(normalizeClock).find(Boolean)||''});
    }
  }
  return [...new Map(groups.map(g=>[g.targetTime,g])).values()];
}
async function collectCmsPacer(ctx,site,race) {
  const home=JSON.parse(await ctx.get(CMS+'homeIndex?appKey='+encodeURIComponent(site.appKey)));
  let candidates=cmsCandidates(home);
  for(const topic of (home.topics||[]).filter(t=>/news|notice/.test(t.structTag||'') || /赛事新闻|比赛公告/.test(t.title||''))) {
    const url=CMS+'articles?'+new URLSearchParams({appKey:site.appKey,topicID:topic.id,limit:'[0,300]'});
    const data=JSON.parse(await ctx.get(url));
    candidates.push(...(data.datas||[]).map(a=>({...a.article?.data,id:a.article?.id,createtime:a.article?.createtime,updatetime:a.article?.updatetime})).filter(a=>/配速员|官方领跑员|官兔|领跑兔/.test(a.title||'')&&!/招募|报名|招聘/.test(a.title||'')));
  }
  candidates=[...new Map(candidates.filter(a=>(a.title||'').includes(String(ctx.year)) || String(a.tag)===String(ctx.year)).map(a=>[a.id,a])).values()];
  candidates.sort((a,b)=>String(b.createtime||'').localeCompare(String(a.createtime||'')));
  if(!candidates.length)return null;
  // A text roster is more useful than a newer announcement linking to WeChat.
  candidates.sort((a,b)=>Number(/名单公示/.test(b.title))-Number(/名单公示/.test(a.title)));
  const a=candidates[0], detailUrl=CMS+'detailArticle?articleID='+encodeURIComponent(a.id), detail=JSON.parse(await ctx.get(detailUrl)), data=detail.data||{};
  let html=data.content||data.text||data.body||data.html||'', original=publicUrl(data.URL||data.url), blocked=false;
  if(original && /mp\.weixin\.qq\.com/.test(original))try{const body=await ctx.get(original);if(/js_content|rich_media_content/.test(body))html=body;else blocked=true;}catch{blocked=true;}
  const gallery=[];
  const bannerArticle=candidates.find(c=>c.image),bannerSource=bannerArticle?CMS+'detailArticle?articleID='+encodeURIComponent(bannerArticle.id):detailUrl;
  const banner=publicUrl(data.image||a.image||bannerArticle?.image);if(banner)gallery.push({url:banner,caption:'赛事官网官兔公告配图',sourceUrl:bannerSource});
  for(const img of html.matchAll(/<img\b[^>]*(?:data-src|src)=["']([^"']+)["']/gi)){const url=publicUrl(img[1],original||detailUrl);if(url&&!/logo|icon|qrcode|二维码|wx_fmt=gif/i.test(url))gallery.push({url,caption:'官方配速员公示资料',sourceUrl:original||detailUrl});}
  const groups=parsePacerGroups(html);
  return {id:'official-pacer-'+race.officialId,type:'pacer',profileKind:'official_pacer_race',name:race.name,edition:ctx.year,seasonYear:ctx.year,city:race.city,raceDate:race.raceDate,officialRaceId:race.officialId,raceGrade:'A',role:'中国田协 A 类赛事 · 官方配速员',
    bio:`${race.name}为中国田协赛历所列A类赛事。组委会已发布“${a.title}”。`+(groups.length?`已从公示正文识别${groups.length}个目标完赛组。`:'配速组别、姓名及照片以链接中的当届官方公示为准。')+(/最终名单将在/.test(clean(html))?'此处为组委会初步公示名单，最终出赛人员以正式公告为准。':'')+(blocked?'公众号正文暂时无法自动读取，可通过原文链接查看完整名单。':''),
    announcementTitle:a.title,announcementDate:String(a.createtime||detail.createtime||'').slice(0,10),pacerGroups:groups,groupCount:groups.length,groupSummary:groups.length?groups.map(g=>g.targetTime).join(' · '):'组委会已公示 · 查看官方名单',avatar:banner,photoStatus:banner?'official_announcement_image':'awaiting_official_photo',gallery:[...new Map(gallery.map(g=>[g.url,g])).values()].slice(0,60),
    verificationStatus:'verified',verifiedAt:ctx.day,rosterStatus:/最终名单将在/.test(clean(html))?'provisional':groups.length?'text_groups_verified':'official_announcement_link',sources:[{title:'中国田径协会 · 当届赛事认证信息',url:race.detailUrl},{title:site.name+'官网官兔公告',url:detailUrl},...(bannerSource!==detailUrl?[{title:'组委会官兔集结公告与配图',url:bannerSource}]:[]),...(original?[{title:a.title,url:original}]:[])],pacingEvidence:[]};
}
function pacerLinks(html, base) {
  const host=new URL(base).hostname;
  return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({url:publicUrl(m[1],base),title:clean(m[2])})).filter(a=>a.url&&new URL(a.url).hostname===host&&/配速员|官方领跑员|官兔|领跑兔/.test(a.title)&&!/招募|报名|招聘/.test(a.title));
}
async function discoverRaceSite(ctx,race,cache) {
  const state={...cache,officialRaceId:race.officialId,name:race.name};
  const verifiedSite=(SOURCES.raceWebsites||[]).find(s=>new RegExp(s.racePattern.replace(/^\^2026/,'^'+ctx.year)).test(race.name));
  if(verifiedSite){state.webUrl=verifiedSite.url;state.detailCheckedAt=ctx.day;state.siteProvenance='verified_race_website';}
  if(!state.detailCheckedAt||state.detailCheckedAt<ctx.weekAgo){
    const raw=JSON.parse(await ctx.get(CAA+'searchById',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:race.officialId,type:'SS'})}));
    const detail=raw.data?.ssdetails;if(!detail)throw new Error('CAA detail unavailable');
    state.webUrl=publicUrl(detail.webUrl||detail.website||detail.websiteUrl);state.detailCheckedAt=ctx.day;
  }
  if(!state.webUrl){state.status='official_catalogue_has_no_website';return {state};}
  // Avoid rescanning unchanged sites repeatedly within one day.
  if(state.siteCheckedAt===ctx.day)return {state};
  const html=await ctx.get(state.webUrl);state.siteCheckedAt=ctx.day;
  if(!/马拉松|marathon/i.test(clean(html))||/澳门.*博彩|在线赌场|博彩平台/.test(clean(html)))throw new Error('Race website identity not confirmed');
  let texts=[{html,url:state.webUrl}],appKey=html.match(/appKey\s*[:=]\s*["']([a-zA-Z0-9_-]{3,50})["']/i)?.[1];
  if(!appKey){for(const s of [...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)].map(m=>publicUrl(m[1],state.webUrl)).filter(u=>u&&new URL(u).hostname===new URL(state.webUrl).hostname&&!/jquery|react|vue|vendor|polyfill/i.test(u)).slice(0,2)){
    const js=await ctx.get(s);appKey=js.match(/appKey\s*[:=]\s*["']([a-zA-Z0-9_-]{3,50})["']/i)?.[1];if(appKey)break;
  }}
  if(appKey){const profile=await collectCmsPacer(ctx,{name:race.name,homeUrl:state.webUrl,appKey},race);state.status=profile?'announcement_verified':'not_yet_published';state.appKey=appKey;return {state,profile};}
  if(!pacerLinks(html,state.webUrl).length){const newsLinks=[...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({url:publicUrl(m[1],state.webUrl),title:clean(m[2])})).filter(a=>a.url&&new URL(a.url).hostname===new URL(state.webUrl).hostname&&/新闻|公告|赛事动态/.test(a.title));for(const link of [...new Map(newsLinks.map(l=>[l.url,l])).values()].slice(0,2))texts.push({html:await ctx.get(link.url),url:link.url});}
  const candidates=texts.flatMap(t=>pacerLinks(t.html,t.url)).filter(a=>a.title.includes(String(ctx.year)));
  if(!candidates.length){state.status='no_public_roster_found';return {state};}
  const a=candidates[0],body=await ctx.get(a.url),title=articleTitle(body)||a.title;
  if(!title.includes(String(ctx.year))||!/配速员|官兔|领跑员/.test(title))throw new Error('Pacer announcement identity not confirmed');
  const content=articleBody(body)||body,groups=parsePacerGroups(content),photos=[...content.matchAll(/<img\b[^>]*(?:data-src|src)=["']([^"']+)["']/gi)].map(m=>publicUrl(m[1],a.url)).filter(u=>u&&!/logo|icon|banner|qrcode/i.test(u)).slice(0,30);
  state.status='announcement_verified';
  return {state,profile:{id:'official-pacer-'+race.officialId,type:'pacer',profileKind:'official_pacer_race',name:race.name,edition:ctx.year,seasonYear:ctx.year,city:race.city,raceDate:race.raceDate,officialRaceId:race.officialId,raceGrade:'A',role:'中国田协 A 类赛事 · 官方配速员',bio:`赛事官网已发布“${title}”，组别、配速员名单和照片以当届原始公告为准。`,pacerGroups:groups,groupCount:groups.length,groupSummary:groups.length?groups.map(g=>g.targetTime).join(' · '):'查看组委会公示',avatar:'',gallery:photos.map(url=>({url,caption:'赛事官网公示配图',sourceUrl:a.url})),verificationStatus:'verified',verifiedAt:ctx.day,rosterStatus:groups.length?'text_groups_verified':'official_announcement_link',sources:[{title:'中国田协 · 当届A类认证',url:race.detailUrl},{title,url:a.url}]}};
}
async function syncPacers(ctx) {
  const races=await fetchClassARaces(ctx), previous=readJson(path.join(ctx.dir,'official-pacers.json'),{profiles:[]});
  const profiles=new Map(previous.profiles.filter(p=>p.edition===ctx.year&&races.some(r=>r.officialId===p.officialRaceId)).map(p=>[p.id,p]));
  const watches=await pool(SOURCES.pacerSites,2,async site=>{
    const race=races.find(r=>new RegExp(site.racePattern).test(r.name));
    if(!race)return {name:site.name,status:'not_in_current_A_catalogue'};
    try{const profile=await collectCmsPacer(ctx,site,race);if(profile)profiles.set(profile.id,profile);return {name:site.name,officialRaceId:race.officialId,status:profile?'announcement_verified':'not_yet_published',checkedAt:ctx.day};}
    catch(e){ctx.warnings.push({section:'pacer',site:site.name,message:e.message});return {name:site.name,officialRaceId:race.officialId,status:'source_unavailable',checkedAt:ctx.day};}
  });
  const cache=readJson(path.join(ctx.dir,'pacer-source-watch.json'),{races:[]}),byId=new Map(cache.races.map(r=>[r.officialRaceId,r]));
  const knownIds=new Set(watches.map(w=>w.officialRaceId));
  const targets=races.filter(r=>!knownIds.has(r.officialId)).filter(r=>!byId.get(r.officialId)?.detailCheckedAt||byId.get(r.officialId).detailCheckedAt<ctx.weekAgo||(byId.get(r.officialId)?.webUrl||(SOURCES.raceWebsites||[]).some(s=>new RegExp(s.racePattern.replace(/^\^2026/,'^'+ctx.year)).test(r.name)))&&byId.get(r.officialId).siteCheckedAt!==ctx.day).sort((a,b)=>String(byId.get(a.officialId)?.detailCheckedAt||'').localeCompare(String(byId.get(b.officialId)?.detailCheckedAt||''))).slice(0,Number(process.env.CONTENT_DISCOVERY_BATCH)||40);
  await pool(targets,3,async race=>{try{const {state,profile}=await discoverRaceSite(ctx,race,byId.get(race.officialId));byId.set(race.officialId,state);if(profile)profiles.set(profile.id,profile);}catch(e){byId.set(race.officialId,{...byId.get(race.officialId),officialRaceId:race.officialId,name:race.name,detailCheckedAt:ctx.day,status:'source_unavailable',checkedAt:ctx.day});ctx.warnings.push({section:'pacer-discovery',id:race.officialId,message:e.message});}});
  writeJson(path.join(ctx.dir,'pacer-source-watch.json'),{updatedAt:ctx.now.toISOString(),races:[...byId.values()]});
  const list=[...profiles.values()].sort((a,b)=>b.raceDate.localeCompare(a.raceDate));
  const ids=new Set(list.map(p=>p.officialRaceId));
  const coverage={classARaces:races.length,monitoredSites:watches.filter(w=>w.officialRaceId).length+[...byId.values()].filter(w=>w.webUrl).length,sourceLookups:knownIds.size+byId.size,withAnnouncements:list.length,withTextGroups:list.filter(p=>p.groupCount>0).length,withPhotos:list.filter(p=>p.avatar||p.gallery?.length).length,awaitingPublicRoster:races.length-list.length};
  writeJson(path.join(ctx.dir,'a-class-races.json'),{asOf:ctx.day,seasonYear:ctx.year,source:CAA+'searchCompetitionMls',races:races.map(r=>({...r,pacerStatus:ids.has(r.officialId)?'announcement_verified':'awaiting_verified_public_roster'})),watches,coverage});
  const rosterData={version:2,asOf:ctx.day,updatedAt:ctx.now.toISOString(),seasonYear:ctx.year,rankingNotice:`跟踪中国田协${ctx.year}赛历中的${races.length}场A类马拉松赛事，已核实${list.length}场官兔公示。组别、名单与照片按当届官方公开程度展示，资料持续更新。`,coverage,profiles:list};
  const people=toPacerPeople(rosterData);
  Object.assign(coverage,{people:people.profiles.length,withPersonalBest:people.coverage.withPersonalBest,withPersonPhotos:people.coverage.withPersonPhotos});
  writeJson(path.join(ctx.dir,'official-pacers.json'),rosterData);
  return coverage;
}
async function run(options={}) {
  const now=options.now||new Date(),day=cstDay(now),dir=options.dir||process.env.CONTENT_DATA_DIR||DEFAULT_DIR;
  fs.mkdirSync(dir,{recursive:true});const lock=path.join(dir,'.sync.lock');
  try{const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,String(process.pid));fs.closeSync(fd);}catch(e){if(e.code!=='EEXIST')throw e;const pid=Number(fs.readFileSync(lock,'utf8'));try{process.kill(pid,0);throw new Error('Content collector already running');}catch(err){if(err.code!=='ESRCH')throw err;}fs.unlinkSync(lock);return run(options);}
  const week=new Date(day+'T00:00:00+08:00');week.setUTCDate(week.getUTCDate()-7);
  const ctx={now,day,year:Number(day.slice(0,4)),dir,publish:!!options.publish,weekAgo:cstDay(week),warnings:[],get:options.get||getText};
  const last=readJson(path.join(dir,'sync-status.json'),{});
  const report={startedAt:now.toISOString(),asOf:day,seasonYear:ctx.year,published:ctx.publish,sections:options.only?{...last.sections}:{},warnings:ctx.warnings};
  try{
    for(const [name,fn]of [['athletes',syncAthletes],['pacers',syncPacers],['news',syncNews]]){
      if(options.only&&options.only!==name)continue;
      try{report.sections[name]={ok:true,checkedAt:new Date().toISOString(),...await fn(ctx)};console.log(name+': '+JSON.stringify(report.sections[name]));}
      catch(e){report.sections[name]={...last.sections?.[name],ok:false,checkedAt:new Date().toISOString(),message:e.message};console.error(name+': '+e.message);}
    }
    report.finishedAt=new Date().toISOString();report.ok=Object.values(report.sections).every(s=>s.ok);writeJson(path.join(dir,'sync-status.json'),report);
    if(options.snapshot){for(const file of ['elite-athletes.json','elite-athletes-history.json','official-pacers.json','a-class-races.json'])if(fs.existsSync(path.join(dir,file)))fs.copyFileSync(path.join(dir,file),path.join(ROOT,'shared',file));}
    return report;
  }finally{fs.unlinkSync(lock);}
}
if(require.main===module){const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7);if(only&&!['athletes','pacers','news'].includes(only))throw new Error('Unknown collection section');run({publish:process.argv.includes('--publish'),snapshot:process.argv.includes('--snapshot'),only}).then(r=>{if(!(only?r.sections[only]?.ok:r.ok))process.exitCode=1;}).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={run,clean,publicUrl,getText,isoDate,parseToplist,parsePerson,enrichAthlete,recentWindow,parseNewsSearch,newsSummary,parsePacerGroups,fetchClassARaces,syncNews,syncPacers,syncAthletes};
