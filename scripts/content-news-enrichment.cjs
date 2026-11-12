/* Factual news digests. Never turn an unreadable video or a search snippet into
 * a purported full report. Curated reports contain independently checked facts;
 * future reports use only fields that can be extracted without guessing. */
const curated = require('../shared/news-enrichment.json');
const byUrl = new Map(curated.articles.map(item => [item.sourceUrl, item]));

function clean(value) {
  const entities = { nbsp:' ', amp:'&', quot:'"', apos:"'", ldquo:'“', rdquo:'”', lsquo:'‘', rsquo:'’', middot:'·', mdash:'—', ndash:'–', hellip:'…', lt:'<', gt:'>' };
  return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&([a-z]+);/gi,(all,key)=>entities[key.toLowerCase()] ?? all).replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';}).replace(/\s+/g,' ').trim();
}
function isRunningNews(rowOrText) {
  const text = typeof rowOrText === 'string' ? rowOrText : [rowOrText?.title,rowOrText?.summary].filter(Boolean).join(' ');
  return /马拉松|半马|全马|路跑|长跑/.test(text) && !/皮划艇|划船|划艇|龙舟|游泳|冰上|滑雪|竞走|编程|动画|马拉松王子|购物|直播马拉松|阅读马拉松|电影马拉松/.test(text);
}
function newsExclusions() { return curated.articles.filter(item=>item.excludeReason).map(item=>({sourceUrl:item.sourceUrl,reason:item.excludeReason,mergeInto:item.mergeInto || ''})); }
function newsCandidates() { return curated.articles.filter(item=>item.publishedAt && !item.excludeReason).map(item=>({title:item.title,sourceUrl:item.sourceUrl,source:item.source || '央视网',publishedAt:/^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt)?item.publishedAt+'T00:00:00+08:00':item.publishedAt,coverUrl:item.coverUrl || ''})); }
function reportArticle(row, report) {
  const sourceRefs = report.sources || [{title:row.source || '原始报道',url:row.sourceUrl}];
  return {...row,title:report.title || row.title,summary:report.summary,body:report.body,rights:'digest',category:row.category || 'industry',featured:false,sourceRefs,contentDepth:report.contentDepth || 'verified_report',enrichmentVersion:curated.version};
}
function articleParagraphs(html) {
  const body = String(html || '').match(/<!--repaste\.body\.begin-->([\s\S]*?)<!--repaste\.body\.end-->/i)?.[1] || '';
  return [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(match=>clean(match[1])).filter(Boolean);
}
function clock(value) {
  const colon = value.match(/(\d{1,2}):([0-5]\d):([0-5]\d)(?:\.(\d+))?/);
  if (colon) return `${Number(colon[1])}:${colon[2]}:${colon[3]}` + (colon[4]?'.'+colon[4]:'');
  const zh = value.match(/(\d{1,2})\s*小时\s*(\d{1,2})\s*分\s*(\d{1,2})(?:\.(\d+))?\s*秒/);
  return zh ? `${Number(zh[1])}:${zh[2].padStart(2,'0')}:${zh[3].padStart(2,'0')}` + (zh[4]?'.'+zh[4]:'') : '';
}
function extractFacts(paragraphs) {
  const text = paragraphs.join(' '), facts = [];
  const add = (group,label,value) => { if (value && !facts.some(f=>f.label===label&&f.value===value)) facts.push({group,label,value}); };
  const date = text.match(/(?:20\d{2}年)?\s*(1[0-2]|[1-9])月\s*(3[01]|[12]\d|[1-9])日[^。！？]{0,70}?(?:开跑|鸣枪|举行|起跑|开赛)/);
  if (date) add('race','比赛日期',`${Number(date[1])}月${Number(date[2])}日`);
  const scale = text.match(/(?:来自[^，。]{0,35}的|共有|吸引(?:了)?|总规模(?:为)?|参赛规模(?:为)?|迎来|汇聚(?:了)?)\s*(近?\d[\d,.]*(?:万|千)?余?)\s*(?:名|位|人)(?:跑者|跑友|选手|运动员)?/);
  if (scale) add('race','报道参赛规模',scale[1]+'人');
  const grade = text.match(/(?:中国田径协会|中国田协)(?:认证|认定|的|为|\s)*([AB][12]?)(?:类|级)/i);
  if (grade) add('race','赛事认证','中国田协'+grade[1].toUpperCase()+'类');
  const projects = [];
  if (/(?:全程马拉松|全马|(?<!半程)马拉松项目)/.test(text)) projects.push('全程马拉松');
  if (/半程马拉松|半马/.test(text)) projects.push('半程马拉松');
  if (projects.length) add('race','报道涉及项目',projects.join('、'));
  const start = text.match(/(?:从|在)\s*([\u4e00-\u9fff·]{2,22}(?:广场|体育中心|体育场|会展中心|公园|市民中心|大厦))\s*(?:出发|鸣枪|起跑|开跑)/);
  if (start) add('course','起点',start[1]);
  const finish = text.match(/(?:终点(?:设在|设于|位于|为)|抵达)\s*([\u4e00-\u9fff·]{2,22}(?:广场|体育中心|体育场|会展中心|公园|市民中心|大厦))/);
  if (finish) add('course','终点',finish[1]);
  // A person's name must be explicitly introduced. Do not infer names from the
  // last few characters before a clock, or mix men's and women's race contexts.
  for (const paragraph of paragraphs) {
    for (const m of paragraph.matchAll(/(?:^|[，。；]|冠军(?:由)?|选手|跑者|运动员)\s*([\u4e00-\u9fff·]{2,5})\s*(?:以|跑出|用时)\s*((?:\d{1,2}:[0-5]\d:[0-5]\d(?:\.\d+)?)|(?:\d{1,2}\s*小时\s*\d{1,2}\s*分\s*\d{1,2}(?:\.\d+)?\s*秒))([^。；]{0,45})/g)) {
      if ((!/夺(?:得|取|冠)|获得.{0,12}冠军|摘.{0,8}冠|赢得.{0,12}冠军/.test(m[3]) && !m[0].startsWith('冠军')) || /^(?:男子|女子|其中|最终|经过|成绩|由)/.test(m[1])) continue;
      add('result','报道冠军成绩',m[1]+' · '+clock(m[2]));
    }
  }
  const services = [
    ['医疗站',/(\d+)\s*(?:个|处|座)?\s*(?:固定)?医疗(?:救治)?站/],
    ['志愿者',/(\d[\d,]*余?)\s*(?:名|位)\s*(?:青年)?志愿者/],
    ['急救跑者',/(\d+)\s*(?:名|位)\s*急救跑者/],
    ['应急避雨点',/(\d+)\s*(?:个|处)\s*应急避雨点/]
  ];
  for (const [label,re] of services) { const m=text.match(re);if(m)add('service',label,m[1]+(/者/.test(label)?'名':'处')); }
  return facts;
}
function resultGroups(paragraphs) {
  const mark='(?:\\d{1,2}:[0-5]\\d:[0-5]\\d(?:\\.\\d+)?|\\d{1,2}\\s*小时\\s*\\d{1,2}\\s*分\\s*\\d{1,2}(?:\\.\\d+)?\\s*秒)';
  const groups=new Map();let conflict=false;
  for(const paragraph of paragraphs) {
    const mentions=[...paragraph.matchAll(/(半程马拉松|全程马拉松|马拉松|全马|半马)(?:项目)?\s*(男子|女子)(?:组)?|(男子|女子)(?:组)?\s*(全程马拉松|半程马拉松|全马|半马)/g)].map(m=>({index:m.index,label:(m[2]||m[3])+(/半/.test(m[1]||m[4])?'半马':'全马')}));
    const add=(index,name,value,rank)=>{
      const division=mentions.filter(m=>m.index<index).at(-1)?.label;
      if(!division||/^(?:男子|女子|其中|最终|成绩|由)/.test(name))return;
      const list=groups.get(division)||new Map(), record={name,mark:clock(value)};
      const old=list.get(rank);if(old&&(old.name!==name||old.mark!==record.mark))conflict=true;
      list.set(rank,record);groups.set(division,list);
    };
    for(const m of paragraph.matchAll(new RegExp('(冠军|亚军|季军)(?:由|为)?\\s*([\\u4e00-\\u9fff·]{2,5}?)\\s*(?:以|用时)?\\s*('+mark+')','g')))add(m.index,m[2],m[3],['冠军','亚军','季军'].indexOf(m[1])+1);
    for(const m of paragraph.matchAll(new RegExp('(?:^|[，。；])\\s*([\\u4e00-\\u9fff·]{2,5})\\s*(?:以|跑出|用时)\\s*('+mark+')([^，。；]{0,35})','g'))){
      const rank=/亚军|第二名/.test(m[3])?2:/季军|第三名/.test(m[3])?3:/冠军|夺冠|摘冠/.test(m[3])?1:0;
      if(rank)add(m.index,m[1],m[2],rank);
    }
  }
  for(const list of groups.values()){
    if(!list.has(1))conflict=true;
    const seconds=r=>r.mark.split(':').reduce((n,v)=>n*60+Number(v),0);
    for(const rank of [2,3])if(list.has(rank)&&list.has(rank-1)&&seconds(list.get(rank))<seconds(list.get(rank-1)))conflict=true;
  }
  return conflict?null:groups;
}
function displayClock(value) { const [h,m,s]=value.split(':');return `${Number(h)}小时${Number(m)}分${Number(s)}秒`; }
function automaticReport(row, html) {
  const paragraphs=articleParagraphs(html),facts=extractFacts(paragraphs),groups=resultGroups(paragraphs);
  const get=label=>facts.find(f=>f.label===label)?.value || '';
  const name=clean(row.title).match(/(?:20\d{2})?[\u4e00-\u9fffA-Za-z0-9“”·]{2,35}?马拉松/)?.[0];
  // Long source pages can still be thin or ambiguous. Require a coherent race,
  // explicit divisions and sufficient results before composing reader-facing prose.
  if(!name||paragraphs.join('').length<300||!groups||groups.size<2||[...groups.values()].reduce((n,list)=>n+list.size,0)<6||!get('比赛日期')||!get('起点')||!get('报道参赛规模'))return null;
  const intro=`${get('比赛日期')}，${name}从${get('起点')}起跑，参赛规模为${get('报道参赛规模')}。`+(get('报道涉及项目')?`本届设置${get('报道涉及项目')}项目。`:'')+(get('赛事认证')?`赛事为${get('赛事认证')}认证赛事。`:'');
  const results=[...groups].map(([division,list])=>{
    const winner=list.get(1);let paragraph=`${division}方面，${winner.name}以${displayClock(winner.mark)}获得冠军`;
    for(const rank of [2,3])if(list.has(rank)){const result=list.get(rank);paragraph+=`，${result.name}以${displayClock(result.mark)}获得${rank===2?'亚军':'季军'}`;}
    return paragraph+'。';
  });
  const course=get('终点')?`比赛终点设在${get('终点')}。`:'';
  const services=[];
  if(get('医疗站'))services.push(`沿线设置${get('医疗站')}医疗站`);
  if(get('急救跑者'))services.push(`安排${get('急救跑者')}急救跑者`);
  if(get('志愿者'))services.push(`${get('志愿者')}志愿者参与赛事服务`);
  if(get('应急避雨点'))services.push(`设立${get('应急避雨点')}应急避雨点`);
  const body=[intro,...results,course,services.length?'赛事保障方面，'+services.join('，')+'。':''].filter(Boolean).join('\n\n');
  // No generic advice, copied paragraphs, source introductions or repeated title
  // may pad a report. Anything that cannot form a full article stays pending.
  if(body.replace(/\s/g,'').length<320)return null;
  const winners=[...groups].map(([division,list])=>`${list.get(1).name}以${list.get(1).mark}获得${division}冠军`).join('，');
  return {title:row.title,summary:`${get('比赛日期')}，${name}迎来${get('报道参赛规模')}。${winners}。`,body,sources:[{title:(row.source || '原始报道')+' · '+row.title,url:row.sourceUrl}],contentDepth:'rewritten_report'};
}
function enrichNews(row, html) {
  const report=byUrl.get(row.sourceUrl);
  if (report?.excludeReason) return {article:null,reason:report.excludeReason,curated:true,mergeInto:report.mergeInto || ''};
  if (!isRunningNews(row)) return {article:null,reason:'非跑步马拉松资讯',curated:false};
  if (report?.body) return {article:reportArticle(row,report),reason:'',curated:true};
  const automatic=automaticReport(row,html);
  return automatic ? {article:reportArticle(row,automatic),reason:'',curated:false} : {article:null,reason:'原文缺少足够可核实的赛事事实，待补充详细报道后发布',curated:false};
}
module.exports={enrichNews,isRunningNews,newsExclusions,newsCandidates,articleParagraphs,extractFacts};
