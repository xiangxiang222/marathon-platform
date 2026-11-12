/* Source-backed athlete biographies. This module does not fetch or write data. */
const MONTHS={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
const EDITORIAL=require('../shared/athlete-editorial-biographies.json');
const DISCIPLINES={Marathon:'全程马拉松','Half Marathon':'半程马拉松','10 Kilometres':'10公里路跑','10 Kilometres Road':'10公里路跑','5 Kilometres Road':'5公里路跑','5 Kilometres':'5公里路跑','10,000 Metres':'10000米','10000 Metres':'10000米','5000 Metres':'5000米','5,000 Metres':'5000米','3000 Metres':'3000米','3,000 Metres':'3000米','3000 Metres Steeplechase':'3000米障碍','1500 Metres':'1500米'};
Object.assign(DISCIPLINES,{'3000 Metres Short Track':'室内3000米','5000 Metres Short Track':'室内5000米','1500 Metres Short Track':'室内1500米'});
const CATEGORIES={'Olympic Games':'奥运会','World Championships':'世界田径锦标赛','World Athletics Championships':'世界田径锦标赛','Asian Games':'亚运会','Asian Championships':'亚洲田径锦标赛','National Championships':'全国锦标赛','World University Games':'世界大学生运动会','World University Championships':'世界大学生锦标赛','World Half Marathon Championships':'世界半程马拉松锦标赛','World Athletics Road Running Championships':'世界田联路跑锦标赛','World Cross Country Championships':'世界越野跑锦标赛','World U20 Championships':'世界U20田径锦标赛','Asian U20 Championships':'亚洲U20田径锦标赛'};
const PLACES={Tokyo:'东京',Berlin:'柏林',London:'伦敦',Paris:'巴黎',Valencia:'瓦伦西亚',Fukuoka:'福冈',Osaka:'大阪',Nagoya:'名古屋',Seoul:'首尔',Boston:'波士顿',Chicago:'芝加哥',Shanghai:'上海',Beijing:'北京',Xiamen:'厦门',Wuxi:'无锡',Wuhan:'武汉',Chongqing:'重庆',Guangzhou:'广州',Hangzhou:'杭州',Yangzhou:'扬州',Meishan:'眉山',Renshou:'仁寿',Zhaoqing:'肇庆',Qingdao:'青岛',Chengdu:'成都',Nanjing:'南京',Hefei:'合肥',Lanzhou:'兰州',Dali:'大理',Dongying:'东营',Rizhao:'日照',Bengbu:'蚌埠',Shenzhen:'深圳',Sapporo:'札幌',Eugene:'尤金',Budapest:'布达佩斯',Doha:'多哈',Manama:'麦纳麦',Nanning:'南宁',HongKong:'香港'};
Object.assign(PLACES,{"Hong Kong":'香港',"Xi'an":'西安',"Xi’an":'西安',Fuzhou:'福州',Jilin:'吉林',Shijiazhuang:'石家庄',Hengshui:'衡水',Taiyuan:'太原',Harbin:'哈尔滨',"Huai'an":'淮安',"Nan Jing":'南京',"NanJing":'南京',Nanchang:'南昌',Guiyang:'贵阳',Shenyang:'沈阳',Yancheng:'盐城',Dalian:'大连',Yangling:'杨凌',Tianjin:'天津',Taian:'泰安',TaiAn:'泰安',Taizhou:'台州',Qinhuangdao:'秦皇岛',Huludao:'葫芦岛',Qujing:'曲靖',Nujiang:'怒江',Lushui:'泸水',Zhengzhou:'郑州',Zaozhuang:'枣庄',Quzhou:'衢州',Xuzhou:'徐州',Xianyang:'咸阳',Shaoxing:'绍兴',Yiwu:'义乌',Wenzhou:'温州',Fuyang:'阜阳',Wuhu:'芜湖',Weifang:'潍坊',Jinan:'济南',Jining:'济宁',Luoyang:'洛阳',Changsha:'长沙',Yichang:'宜昌',Zunyi:'遵义',Yibin:'宜宾',Nanchong:'南充',Guangyuan:'广元',Fangchenggang:'防城港',Yantai:'烟台',Wulai:'乌来',Chizhou:'池州',Huzhou:'湖州',Jiaxing:'嘉兴',Shaoxing:'绍兴',Baoji:'宝鸡',Tongren:'铜仁',Huanggang:'黄冈',Fuyuan:'抚远',Tonglu:'桐庐',Xichang:'西昌',Kunming:'昆明',Yuxi:'玉溪',Bangkok:'曼谷',Jakarta:'雅加达',København:'哥本哈根',Copenhagen:'哥本哈根',Riga:'里加',Gdynia:'格丁尼亚',Gwangju:'光州',Daegu:'大邱',Incheon:'仁川',Frankfurt:'法兰克福',Hamburg:'汉堡',Rotterdam:'鹿特丹',Enschede:'恩斯赫德',Amsterdam:'阿姆斯特丹',Wellington:'惠灵顿',GoldCoast:'黄金海岸',"Gold Coast":'黄金海岸',Otsu:'大津',Prague:'布拉格',Zürich:'苏黎世',Zurich:'苏黎世',Birmingham:'伯明翰',Belgrade:'贝尔格莱德',Nairobi:'内罗毕',Chandigarh:'昌迪加尔'});
Object.assign(PLACES,{Macao:'澳门',Macau:'澳门',Suzhou:'苏州',Changzhou:'常州',Changchun:'长春',Nanping:'南平',Yulin:'榆林',Daqing:'大庆',Zhuzhou:'株洲',Huangshi:'黄石',Jinhua:'金华',Yingkou:'营口',Daye:'大冶',Linfen:'临汾',Taonan:'洮南',Jinjiang:'晋江',Sevilla:'塞维利亚',Gifu:'岐阜',Philadelphia:'费城',"Palo Alto":'帕洛阿尔托',"Des Moines":'得梅因',Azusa:'阿祖萨',Walnut:'沃尔纳特',Portland:'波特兰',Bochum:'波鸿',"Los Angeles":'洛杉矶',Kavarna:'卡瓦尔纳'});
function dateOf(raw){const text=String(raw||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;const m=text.match(/^(\d{1,2}) ([A-Z]{3}) (\d{4})$/);return m&&MONTHS[m[2]]?`${m[3]}-${String(MONTHS[m[2]]).padStart(2,'0')}-${m[1].padStart(2,'0')}`:'';}
function valid(row,asOf){const date=dateOf(row.date);return !row.notLegal&&date&&date<=asOf&&row.mark&&!/^(?:DNF|DNS|DQ|NM|NH|NT)$/i.test(row.mark);}
function timeSeconds(value){const text=String(value||'');if(!/^\d+:\d{2}(?::\d{2})?(?:\.\d+)?$/.test(text))return null;return text.split(':').reduce((s,v)=>s*60+Number(v),0);}
function duration(value){const n=Math.round(Math.abs(value)),minutes=Math.floor(n/60),seconds=n%60;return (minutes?minutes+'分':'')+(seconds?seconds+'秒':'')||'0秒';}
function venueName(value){const text=String(value||'');const cities=Object.keys(PLACES).filter(k=>new RegExp('(?:^|[ ,])'+k+'(?:[ ,(]|$)','i').test(text));return cities.length?PLACES[cities.at(-1)]:text;}
function eventName(value){
  const text=String(value||'').trim();
  if(/Berlin.*Marathon|Marathon.*Berlin/i.test(text))return '柏林马拉松';
  if(/Chinese Athletics Association 10Km Elite Series/i.test(text))return '中国田径协会10公里精英赛';
  if(/Asian Indoor Athletics Championships/i.test(text))return '亚洲室内田径锦标赛';
  if(/Asian Junior Championships/i.test(text))return '亚洲青年田径锦标赛';
  if(/Asian Championships/i.test(text))return '亚洲田径锦标赛';
  if(/Hangzhou.*Marathon/i.test(text))return '杭州马拉松';
  if(/Maca[ou].*Marathon/i.test(text))return '澳门马拉松';
  if(/Zheng-Kai.*Marathon/i.test(text))return '郑开马拉松';
  if(/Miyun.*Marathon/i.test(text))return '密云马拉松';
  if(/Suzhou Taihu Marathon/i.test(text))return '苏州太湖马拉松';
  if(/Shenzen Marathon/i.test(text))return '深圳马拉松';
  if(/Yingkou.*Bayuquan Marathon/i.test(text))return '营口鲅鱼圈马拉松';
  if(/Gaochun Marathon/i.test(text))return '高淳马拉松';
  if(/Zhoushan Islands Marathon/i.test(text))return '舟山群岛马拉松';
  if(/Liupanshui.*Marathon/i.test(text))return '六盘水马拉松';
  if(/Hainan Danzhou Marathon/i.test(text))return '海南儋州马拉松';
  if(/Issyk-Kul SCO.*marathon/i.test(text))return '伊塞克湖上合组织马拉松';
  if(/Bryan Clay Invitational/i.test(text))return '布莱恩·克雷田径邀请赛';
  if(/MDC FINAL/i.test(text))return '日本中长跑系列赛总决赛';
  const known=[[/Tokyo Marathon/i,'东京马拉松'],[/Fukuoka International Marathon/i,'福冈国际马拉松'],[/Nagoya Women.s Marathon/i,'名古屋女子马拉松'],[/Hengshui Lake.*Marathon/i,'衡水湖马拉松'],[/Yellow River Estuary.*Marathon/i,'黄河口（东营）马拉松'],[/Miyun Marathon/i,'密云马拉松'],[/Pukou.*Marathon/i,'南京浦口马拉松'],[/Xianlin.*Half Marathon/i,'南京仙林半程马拉松'],[/Meishan Renshou Half Marathon/i,'眉山仁寿半程马拉松'],[/Medio Marat[oó]n Valencia/i,'瓦伦西亚半程马拉松'],[/Marat[oó]n Valencia/i,'瓦伦西亚马拉松'],[/The 15th Games of People.s Republic of China|15th National Games/i,'第十五届全运会'],[/14th National Games/i,'第十四届全运会'],[/Asian Games/i,'亚运会'],[/Olympic Games/i,'奥运会'],[/World Athletics Road Running Championships/i,'世界田联路跑锦标赛'],[/World.*(?:Half Marathon).*Championships/i,'世界半程马拉松锦标赛'],[/World.*Cross Country.*Championships/i,'世界越野跑锦标赛'],[/World.*U20.*Championships/i,'世界U20田径锦标赛'],[/World.*(?:Athletics )?Championships/i,'世界田径锦标赛'],[/Asian.*Marathon.*Championships/i,'亚洲马拉松锦标赛'],[/Asian Athletics Championships/i,'亚洲田径锦标赛'],[/Universiade|World University Games/i,'世界大学生运动会'],[/Chinese U23 Championships/i,'全国U23田径锦标赛'],[/Chinese Championships/i,'全国田径锦标赛'],[/(?:Chinese|National) Marathon Championships/i,'全国马拉松锦标赛'],[/National Athletics Grand Prix/i,'全国田径大奖赛'],[/National Middle and Long Distance Running Meeting/i,'全国中长跑比赛'],[/Regional Athletics Invitational Meeting/i,'田径邀请赛'],[/Chinese Athletics Meet/i,'全国田径比赛'],[/CAA 10Km Elite Series/i,'中国田径协会10公里精英赛']];
  for(const [re,label]of known)if(re.test(text))return label;
  if(/marathon/i.test(text)){
    const place=venueName(text);
    if(place!==text)return place+(/half marathon/i.test(text)?'半程马拉松':'马拉松');
    const city=Object.keys(PLACES).filter(k=>new RegExp('(?:^|[ ,])'+k+'(?:[ ,(]|$)','i').test(text)).at(-1);
    if(city)return PLACES[city]+(/half marathon/i.test(text)?'半程马拉松':'马拉松');
  }
  return text;
}
function athleteSource(profile){return (profile.sources||[]).find(s=>s.url&&s.url.includes('worldathletics.org/athletes/'))?.url||`https://worldathletics.org/athletes/athlete=${profile.worldAthleticsId}`;}
function flattenRecent(competitor,asOf,sourceUrl){return (competitor?.resultsByYear?.resultsByEvent||[]).filter(g=>DISCIPLINES[g.discipline]).flatMap(g=>(g.results||[]).filter(r=>valid(r,asOf)).map(r=>({date:dateOf(r.date),discipline:DISCIPLINES[g.discipline],disciplineEn:g.discipline,competition:r.competition||'',title:eventName(r.competition)||venueName(r.venue),venue:r.venue||'',result:r.mark,position:String(r.place||'').replace(/\.$/,''),sourceUrl}))).sort((a,b)=>b.date.localeCompare(a.date));}
function cnDate(value){const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[1]}年${Number(m[2])}月${Number(m[3])}日`:String(value||'');}
function raceLocation(row){const title=eventName(row.event||row.title||row.competition),venue=venueName(row.venue);if(title&&/[a-z]{3}/i.test(title)&&venue&&!/[a-z]{3}/i.test(venue))return venue+(/half marathon/i.test(title)?'半程马拉松':/marathon/i.test(title)?'马拉松':'田径赛');return title||venue;}
function placeText(value){return /^\d+$/.test(String(value||''))?`，获得第${Number(value)}名`:'';}
function articleParagraph(section){
  // Source attribution belongs to the retained evidence fields, never the story.
  return String(section.body||'').replace(/新华社(?:当年\d+月|在[^。]*?报道中|在[^。]*?赛前报道中)，?/g,'').replace(/央视报道(?:同时确认|确认|将他介绍为陕西选手|将她介绍为贵州选手)，?/g,'').replace(/当时的新华社报道同时确认，/g,'').replace(/这篇报道[^。]*。|该报道[^。]*。|央视报道[^。]*。|报道将[^。]*。/g,'').trim();
}
function buildAthleteArticle(profile,{asOf,year}={}){
  asOf=asOf||profile.biographyUpdatedAt||profile.verifiedAt||new Date().toISOString().slice(0,10);year=year||profile.seasonYear||Number(asOf.slice(0,4));
  const name=profile.name||profile.nameEn,pronoun=profile.gender==='women'?'她':'他',gender=profile.gender==='women'?'女子':'男子';
  const records=profile.personalRecords||[],pb=records.find(r=>r.discipline==='全程马拉松')||{mark:profile.personalBest,date:profile.eventDate,venue:profile.eventVenue};
  const seasons=(profile.seasonProgression||[]).filter(r=>r.date<=asOf).sort((a,b)=>a.year-b.year),recent=(profile.recentResults||[]).filter(r=>r.date<=asOf),honours=(profile.careerHighlights||[]).filter(r=>r.date<=asOf);
  const editorial=(EDITORIAL.athletes[String(profile.worldAthleticsId)]||[]).filter(s=>s.publishedAt<=asOf),background=editorial.filter(s=>s.id.startsWith('background')),career=editorial.filter(s=>!s.id.startsWith('background'));
  const lead=`${name}是中国${gender}长跑运动员。`+(profile.seasonBest?`${year}赛季，${pronoun}在${eventName(profile.seasonEventName)||venueName(profile.seasonEventVenue)}跑出${profile.seasonBest}`+(profile.seasonRank?`，位列中国籍${gender}全马赛季榜第${profile.seasonRank}`:'')+'。':'')+(pb.mark?(pb.mark===profile.seasonBest?'这一成绩也是其全程马拉松个人最佳。':`全程马拉松个人最佳为${pb.mark}。`):'');
  const chapters=[];
  const identity=`${name}${profile.nameEn&&name!==profile.nameEn?'（'+profile.nameEn+'）':''}`+(profile.birthDate?`出生于${cnDate(profile.birthDate)}，`:'，')+`参加${gender}长跑与公路跑比赛。`;
  if(background.length)chapters.push(`## 成长与长跑之路\n\n${identity}\n\n${background.map(articleParagraph).filter(Boolean).join('\n\n')}`);
  else chapters.push(identity);
  if(seasons.length){
    const earlier=seasons.filter(r=>r.year<year),trajectory=earlier.length?earlier:seasons;
    const first=trajectory[0],last=trajectory.at(-1),best=trajectory.reduce((a,b)=>timeSeconds(a.mark)<=timeSeconds(b.mark)?a:b);
    const previous=trajectory.filter(r=>r.year<best.year).at(-1),selected=[first,previous,best,last].filter((r,i,a)=>r&&a.findIndex(s=>s?.year===r.year)===i).sort((a,b)=>a.year-b.year);
    let paragraphs=[];
    if(selected.length===1&&first.year<year)paragraphs.push(`${first.year}赛季，${name}在${raceLocation(first)}以${first.mark}完成全程马拉松，比赛日期为${cnDate(first.date)}。`);
    else {
      if(selected.length>1){
        let opening=`${cnDate(first.date)}，${name}在${raceLocation(first)}跑出${first.mark}。`;
        const middle=selected.slice(1,-1);if(middle.length)opening+=middle.map(r=>`${r.year}年，${pronoun}在${raceLocation(r)}的年度最佳为${r.mark}。`).join('');
        const finish=selected.at(-1);opening+=`${finish.year}赛季的年度最佳为${finish.mark}，取得于${cnDate(finish.date)}的${raceLocation(finish)}。`;paragraphs.push(opening);
        const delta=timeSeconds(first.mark)-timeSeconds(best.mark);if(delta>0)paragraphs.push(`从${first.year}赛季到${best.year}赛季，${pronoun}把全马年度最佳从${first.mark}提高到${best.mark}，缩短了${duration(delta)}。`);
      }
    }
    if(pb.mark&&pb.date&&Number(pb.date.slice(0,4))!==year&&!seasons.some(r=>r.mark===pb.mark&&r.date===pb.date))paragraphs.push(`${cnDate(pb.date)}，${pronoun}在${venueName(pb.venue)}跑出全马个人最佳${pb.mark}。`);
    if(paragraphs.length)chapters.push(`## 全程马拉松的进阶\n\n${paragraphs.join('\n\n')}`);
  }
  const elite=honours.filter(r=>!/National Championships|全国锦标赛/.test(r.title)).slice(0,profile.seasonRank<=20?4:2);
  const careerParagraphs=career.map(articleParagraph).filter(Boolean);
  if(elite.length){const rows=elite.sort((a,b)=>a.date.localeCompare(b.date));careerParagraphs.push(rows.map((r,i)=>`${i?`${pronoun}还曾在`:`${name}在`}${cnDate(r.date)}的${eventName(r.competition)||r.title.split(' · ')[0]}参加${DISCIPLINES[r.discipline]||r.title.split(' · ')[1]||'长跑'}比赛，以${r.result}完赛${placeText(r.position)}。`).join(''));}
  if(careerParagraphs.length)chapters.push(`## 职业生涯的关键比赛\n\n${careerParagraphs.join('\n\n')}`);
  const seasonRaces=recent.filter(r=>r.date.startsWith(String(year))&&r.discipline==='全程马拉松').sort((a,b)=>a.date.localeCompare(b.date));
  if(seasonRaces.length){const best=seasonRaces.reduce((a,b)=>timeSeconds(a.result)<=timeSeconds(b.result)?a:b),first=seasonRaces[0],last=seasonRaces.at(-1),chosen=[first,best,last].filter((r,i,a)=>a.findIndex(s=>s.date===r.date&&s.result===r.result)===i).sort((a,b)=>a.date.localeCompare(b.date));let text=chosen.map((r,i)=>`${i?`${pronoun}`:name}在${cnDate(r.date)}的${raceLocation(r)}跑出${r.result}${placeText(r.position)}。`).join('');const other=recent.filter(r=>r.date.startsWith(String(year))&&r.discipline!=='全程马拉松').sort((a,b)=>a.date.localeCompare(b.date)).slice(-2);if(other.length)text+=`在全马之外，${other.map(r=>`${cnDate(r.date)}的${raceLocation(r)}，${pronoun}以${r.result}完成${r.discipline}${placeText(r.position)}`).join('；')}。`;chapters.push(`## ${year}赛季\n\n${text}`);}
  const other=records.filter(r=>r.discipline!=='全程马拉松').sort((a,b)=>a.date.localeCompare(b.date));
  if(other.length){const key=other.filter(r=>['半程马拉松','10000米','5000米','3000米障碍'].includes(r.discipline));const chosen=(key.length?key:other).slice(-3);chapters.push(`## 从其他距离看长跑履历\n\n${chosen.map((r,i)=>`${i?`${pronoun}的`:name+'的'}${r.discipline}个人最佳为${r.mark}，取得于${cnDate(r.date)}的${venueName(r.venue)}。`).join('')}`);}
  return {title:`${name}：长跑之路与赛场履历`,lead,body:chapters.join('\n\n'),version:1,updatedAt:asOf};
}
function biographyFromRecords(profile,competitor,{asOf,year}={}){
  asOf=asOf||profile.verifiedAt||new Date().toISOString().slice(0,10);year=year||profile.seasonYear||Number(asOf.slice(0,4));
  const sourceUrl=athleteSource(profile),sections=[],gender=profile.gender==='women'?'女子':'男子';
  const birth=dateOf(competitor?.basicData?.birthDate)||profile.birthDate;
  const records=(competitor?.personalBests?.results||[]).filter(r=>DISCIPLINES[r.discipline]&&valid(r,asOf)).map(r=>({discipline:DISCIPLINES[r.discipline],disciplineEn:r.discipline,mark:r.mark,date:dateOf(r.date),venue:r.venue||'',sourceUrl}));
  const sourceRecords=records.length?records:(profile.personalRecords||[]);
  const progression=(competitor?.progressionOfSeasonsBests||[]).find(g=>g.discipline==='Marathon')?.results||[];
  const seasons=progression.filter(r=>valid(r,asOf)).map(r=>({year:Number(r.season||dateOf(r.date).slice(0,4)),mark:r.mark,date:dateOf(r.date),event:eventName(r.competition)||venueName(r.venue),venue:r.venue||'',sourceUrl})).sort((a,b)=>a.year-b.year);
  const recent=flattenRecent(competitor,asOf,sourceUrl);
  const honours=(competitor?.honours||[]).flatMap(g=>(g.results||[]).filter(r=>valid(r,asOf)&&DISCIPLINES[r.discipline]).map(r=>({date:dateOf(r.date),title:(CATEGORIES[g.categoryName]||g.categoryName)+' · '+DISCIPLINES[r.discipline],competition:r.competition,discipline:r.discipline,result:r.mark,position:String(r.place||'').replace(/\.$/,''),venue:r.venue||'',sourceUrl}))).sort((a,b)=>b.date.localeCompare(a.date));
  const pb=sourceRecords.find(r=>r.discipline==='全程马拉松');
  let overview=`${profile.name}${profile.nameEn&&profile.name!==profile.nameEn?'（'+profile.nameEn+'）':''}是中国${gender}长跑选手`+(birth?`，出生于${birth}`:'')+'。';
  overview+=`${year}赛季以${profile.seasonBest}进入本次中国籍${gender}全程马拉松成绩榜第${profile.seasonRank}位，该成绩于${profile.seasonEventDate}在${profile.seasonEventName||venueName(profile.seasonEventVenue)}取得`+(profile.seasonEventPosition?`，当场名次为第${profile.seasonEventPosition}名`:'')+'。';
  if(pb)overview+=`全马个人最佳为${pb.mark}，创造时间是${pb.date}，比赛地点为${venueName(pb.venue)}。`;
  sections.push({id:'overview',title:'运动员简介',body:overview,sourceUrl});
  const editorial=(EDITORIAL.athletes[String(profile.worldAthleticsId)]||[]).filter(s=>s.publishedAt<=asOf);
  sections.push(...editorial.map(s=>({...s})));
  if(seasons.length){const first=seasons[0],last=seasons.at(-1),delta=timeSeconds(first.mark)-timeSeconds(pb?.mark||last.mark);let body=`世界田联现有全马年度最佳记录覆盖${seasons.length}个赛季。最早收录的是${first.year}年${first.event}的${first.mark}（${first.date}），这代表该资料页中的最早记录。`;if(seasons.length>1){body+=`此后的年度最佳依次为${seasons.slice(1).map(s=>`${s.year}年${s.mark}（${s.event}）`).join('；')}。`;if(delta>0)body+=`从最早收录的年度最佳到目前个人最佳，成绩提升${duration(delta)}。`;}sections.push({id:'progression',title:'全马成绩成长轨迹',body,sourceUrl});}
  const seasonRaces=recent.filter(r=>r.date.startsWith(String(year))&&r.discipline==='全程马拉松');
  if(seasonRaces.length){let body=`${year}赛季，世界田联资料页收录了${seasonRaces.length}场有效全马比赛。`;body+=seasonRaces.slice(0,8).map(r=>`${r.date}，${r.title}跑出${r.result}`+(/^[0-9]+$/.test(r.position)?`，获第${r.position}名`:'')+'。').join('');const half=recent.filter(r=>r.date.startsWith(String(year))&&r.discipline==='半程马拉松').slice(0,2);if(half.length)body+=`半马赛场另有${half.map(r=>`${r.date}在${r.title}跑出${r.result}`).join('；')}。`;sections.push({id:'season',title:`${year}赛季比赛记录`,body,sourceUrl});}
  if(honours.length){let body=honours.slice(0,7).map(r=>`${r.date}，在${CATEGORIES[(competitor.honours||[]).find(g=>(g.results||[]).some(x=>dateOf(x.date)===r.date&&x.mark===r.result))?.categoryName]||r.title.split(' · ')[0]}${eventName(r.competition)!==r.title.split(' · ')[0]?'（'+eventName(r.competition)+'）':''}的${DISCIPLINES[r.discipline]}项目中，以${r.result}获得第${r.position}名。`).join('');sections.push({id:'honours',title:'代表性大赛经历',body,sourceUrl});}
  const other=sourceRecords.filter(r=>r.discipline!=='全程马拉松');
  if(other.length){let body=`除全马以外，资料页还收录了${other.map(r=>r.discipline).join('、')}等项目成绩。`;body+=other.slice(0,6).map(r=>`${r.discipline}个人最好成绩为${r.mark}，于${r.date}在${venueName(r.venue)}取得。`).join('');sections.push({id:'disciplines',title:'半马与场地项目积累',body,sourceUrl});}
  // Current records contain no reliable coaching, hometown or training narrative;
  // never infer those biographical facts from venues or race performances.
  const enrichment={biographySections:sections,biographyUpdatedAt:asOf,biographyVersion:2,biographySource:editorial.length?'official_records_and_reviewed_reporting':'world_athletics_records',seasonProgression:seasons,recentResults:recent.slice(0,16),careerHighlights:honours.length?honours:profile.careerHighlights||[],...(birth?{birthDate:birth}:{}),...(records.length?{personalRecords:records}:{}),biographyCoverage:{sections:sections.length,characters:sections.reduce((n,s)=>n+s.body.length,0),fullMarathonSeasons:seasons.length,currentMarathonRaces:seasonRaces.length,representativeHonours:honours.length,reviewedReporting:editorial.length}};
  enrichment.article=buildAthleteArticle({...profile,...enrichment},{asOf,year});
  return enrichment;
}
module.exports={biographyFromRecords,buildAthleteArticle,dateOf,eventName,venueName,flattenRecent,timeSeconds};
