const test = require('node:test');
const assert = require('node:assert/strict');
const { groupOf, statusOf, splitSections, uniqueText, publicUrl, sourceUrlsOf, searchResultUrls, discoverPublicSources, Collector, sameEdition, bodyIdentityConflict, scheduleOfDocuments, registrationDates, registrationOfDocuments, readableOcr, usefulMedia, reviewedImageText, assembleCollection, extractDocument } = require('./race-detail-collect.cjs');

test('actual trail distance and complete family package remain separate from advertised distance', () => {
  const group = groupOf({name:'10公里梯田筑梦组（亲子组1大1小）', description:'10公里梯田筑梦组（亲子组）：500人，出赛道里程13.5km，累计爬升816m，累计下降816m，发时间11月21日8:00，关门时间11月21日13:00，关门时长5h',price:'196.00',status:'已截止',url:'https://reg.zuicool.com/77675/244232'});
  assert.equal(group.name,'10公里梯田筑梦组（亲子组1大1小）');
  assert.equal(group.advertisedDistanceKm,10); assert.equal(group.actualDistanceKm,13.5);
  assert.deepEqual(group.participants,{adults:1,children:1});
  assert.equal(group.fees[0].amount,196); assert.equal(group.fees[0].unit,'套餐');
  assert.equal(group.ascentM,816); assert.equal(group.cutoffHours,5);
  assert.equal(groupOf({name:'25公里皓月组（已报满）',status:'已截止'}).status,'sold_out');
});
test('closed registration and a sold-out package are distinct from cancelled races', () => {
  assert.equal(statusOf('赛事名称 已关闭',{header:true}),'closed');
  assert.equal(statusOf('（已报满）'),'sold_out');
  assert.equal(statusOf('赛事取消公告'),'cancelled');
  assert.equal(statusOf('提示：因不可抗力因素，活动取消',{header:true}),'cancelled');
  assert.equal(statusOf('提示：比赛因故取消',{header:true}),'cancelled');
  assert.equal(statusOf('未携带强制装备将取消参赛资格'),'unknown');
  assert.equal(statusOf('组委会有权取消比赛'),'unknown');
  assert.equal(statusOf('可能取消本届比赛'),'unknown');
  assert.equal(statusOf('赛事取消参赛资格处罚办法'),'unknown');
});
test('edition and locality prevent wrong same-year race documents', () => {
  assert.equal(sameEdition('2026重庆巴南半程马拉松','2026重庆长嘉汇半程马拉松'),false);
  assert.equal(sameEdition('2026重庆垫江明月山越野赛','2026重庆垫江明月山越野赛 - 一键报名 - 最酷'),true);
  assert.equal(sameEdition('2026北京马拉松','2025北京马拉松'),false);
  assert.equal(sameEdition('2027建发厦门马拉松赛','2027厦门马拉松 竞赛规程'),true);
});
test('registration ranges retain exact clocks and reject elite/earlybird deadlines', () => {
  assert.deepEqual(registrationDates('报名时间\n2026年9月15日-11月10日（额满即止）'),{opensAt:'2026-09-15',closesAt:'2026-11-10'});
  assert.deepEqual(registrationDates('报名时间：2026年9月15日10:00至9月21日18:00'),{opensAt:'2026-09-15T10:00:00+08:00',closesAt:'2026-09-21T18:00:00+08:00'});
  assert.deepEqual(registrationDates('精英申请报名时间：2026年9月15日-11月10日'),{opensAt:'',closesAt:''});
  assert.deepEqual(registrationDates('报名时间与费用\n延期提示：从2026年11月15日延期至2027年1月10日举办\n比赛时间：2027年1月9日-10日'),{opensAt:'',closesAt:''});
});
test('decorative OCR does not become race regulations', () => {
  assert.equal(readableOcr({text:'ULTRA TRAIL\nMT MINGYUE\n◎\n明月召我还'}),'');
  assert.match(readableOcr({text:'报名时间\n2026年9月15日-11月10日'}),/2026/);
});
test('current registration deadline is read independently of the race-day and price-phase dates', () => {
  const documents = [{url:'https://reg.zuicool.com/64585',header:'延期提示：从2026年11月15日延期至2027年1月10日举办\n赛事日期：2027年1月10日星期日\n报名截止时间：2026年12月20日 23:59:59'}];
  const sections = [{title:'报名时间与费用',text:'延期提示：从2026年11月15日延期至2027年1月10日举办\n比赛时间：2027年1月9日-10日\n早鸟报名时间：2026年9月1日-9月2日'}];
  assert.deepEqual(registrationOfDocuments(documents,sections),{opensAt:'',closesAt:'2026-12-20T23:59:59+08:00'});
});
test('schedule comes only from an explicit current event-date header', () => {
  assert.deepEqual(scheduleOfDocuments([{header:'2026烈火英雄线上马拉松 报名中\n赛事日期：2026年11月12日星期四 ~ 2026年11月23日星期一',text:'报名时间：2026年11月1日-11月22日\n延期提示：从10月25日延期至11月12日'}]),{startDate:'2026-11-12',endDate:'2026-11-23'});
  assert.deepEqual(scheduleOfDocuments([{header:'2026赛事 报名中\n报名时间：2026年11月12日-11月23日',text:'比赛日期：2026年11月30日'}]),null);
});
test('a mismatched body event name is audited and excluded from the public guide', () => {
  const bad={url:'https://zuicool.com/event/57989',header:'2026烈火英雄线上马拉松\n场次组别',text:'主办单位：全民一起跑\n赛事名称：2026跑遍中国线上系列赛-哈尔滨站\n赛事时间：2026.11.12 08:00--2026.11.23 12:00',packages:[],images:[],links:[],capture:{at:'now',method:'html',fresh:true}};
  const good={url:'https://reg.zuicool.com/88340',header:'2026烈火英雄线上马拉松 报名中\n赛事日期：2026年11月12日星期四 ~ 2026年11月23日星期一',title:'2026烈火英雄线上马拉松',text:'赛事名称：2026烈火英雄线上马拉松\n赛事时间：2026.11.12 08:00--2026.11.23 12:00',packages:[{name:'10公里组',price:'39',status:'报名中',description:''}],images:[],links:[],capture:{at:'now',method:'html',fresh:true}};
  assert.equal(bodyIdentityConflict('2026烈火英雄线上马拉松',bad).error,'declared_race_name_mismatch');
  const result=assembleCollection({name:'2026烈火英雄线上马拉松',docs:[bad,good],groups:[groupOf(good.packages[0])] ,media:[]});
  assert.match(result.guideText,/2026烈火英雄线上马拉松/); assert.doesNotMatch(result.guideText,/哈尔滨/);
  assert.equal(result.details.audit.bodyConflicts[0].url,bad.url); assert.deepEqual(result.details.schedule,{startDate:'2026-11-12',endDate:'2026-11-23'});
});
test('OCR preserves fee-table row and column relationships and archives decorative evidence', () => {
  const table = {text:'报名费用\n25公里组\n早鸟价\n178元\n普通价\n198元',lines:[
    {text:'报名费用',x:0,y:0,width:100,height:20},
    {text:'25公里组',x:0,y:30,width:80,height:20},
    {text:'早鸟价178元',x:160,y:31,width:100,height:20},
    {text:'普通价198元',x:320,y:30,width:100,height:20}
  ]};
  assert.match(readableOcr(table),/25公里组 \| 早鸟价178元 \| 普通价198元/);
  const poster = {url:'https://example.org/poster.jpg',caption:'赛事图文资料',ocr:{text:'ULTRA TRAIL\nMT MINGYUE'}};
  assert.equal(usefulMedia(poster),false);
  assert.equal(usefulMedia({url:'https://example.org/map.jpg',context:'10公里组路线图',ocr:{text:''}}),true);
  const collection = assembleCollection({name:'测试赛',media:[poster],docs:[]});
  assert.equal(collection.details.media.length,0);
  assert.equal(collection.imageEvidence[0].ocrText,poster.ocr.text);
});
test('unreviewed OCR stays as image evidence and cannot set prose or registration dates', () => {
  const raw = {url:'https://example.org/fees.jpg',sourceUrl:'https://example.org/race',caption:'报名时间与费用',ocr:{text:'报名时间\n2026年9月15日-11月10日\n报名费用\n13.5公里 98元'},review:{questions:['早鸟与普通价表头待核对']}};
  const collection = assembleCollection({name:'测试赛',media:[raw]});
  assert.equal(collection.guideText,'');
  assert.equal(collection.details.sections.length,0);
  assert.equal(collection.details.registration.closesAt,'');
  assert.equal(collection.details.media.length,1);
  assert.equal(collection.imageEvidence[0].ocrText,raw.ocr.text);
  assert.equal(collection.details.audit.imageReviews[0].status,'pending');
  assert.equal(collection.details.audit.imageReviews[0].imageUrl,raw.url);
  assert.match(collection.details.audit.imageReviews[0].questions[0],/表头/);
  assert.equal(reviewedImageText({...raw,reviewedText:'校对正文',review:{status:'verified'}}),'');
  const checked = assembleCollection({name:'测试赛',media:[{...raw,reviewedText:'报名费用\n13.5公里 98元',review:{status:'verified',imageViewed:true}}]});
  assert.match(checked.guideText,/13.5公里 98元/);
  assert.equal(checked.details.sections[0].reviewed,true);
  assert.equal(checked.details.audit.imageReviews,undefined);
});
test('checked image text already present in a reliable text source is not appended twice', () => {
  const doc = {url:'https://example.org/race',text:'报名费用\n13.5公里 98元\n领物需本人到场',header:'',title:'测试赛',packages:[],capture:{at:'now',method:'html',fresh:true}};
  const media = [{url:'https://example.org/fees.jpg',caption:'报名费用',reviewedText:'13.5公里 98元',review:{status:'verified',imageViewed:true}}];
  const collection = assembleCollection({name:'测试赛',docs:[doc],media});
  assert.equal(collection.guideText.match(/13.5公里 98元/g).length,1);
});
test('HTML tables preserve merged group headers and repeated phase labels', async (t) => {
  const fs = require('node:fs');
  const executablePath = process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
  if (!fs.existsSync(executablePath)) return t.skip('Chrome is unavailable for the source table browser check');
  const browser = await require('playwright-core').chromium.launch({executablePath,headless:true});
  try {
    const page = await browser.newPage();
    const doc = await extractDocument(page,'<article><table><tr><th rowspan="2">组别</th><th colspan="2">报名费用</th></tr><tr><th>早鸟价</th><th>普通价</th></tr><tr><td rowspan="2">10公里</td><td>88元</td><td>98元</td></tr><tr><td>176元/亲子</td><td>196元/亲子</td></tr></table></article>','https://example.org/race');
    assert.match(doc.text,/\| 组别 \| 报名费用 \/ 早鸟价 \| 报名费用 \/ 普通价 \|/);
    assert.match(doc.text,/\| 10公里 \| 88元 \| 98元 \|/);
    assert.match(doc.text,/\| 10公里 \| 176元\/亲子 \| 196元\/亲子 \|/);
  } finally { await browser.close(); }
});
test('full source text survives chapters and duplicate summary filtering without character limits', () => {
  const long = '规则内容。'.repeat(12000);
  const sections = splitSections('一、组织机构\n本届主办方\n四、参赛资格\n' + long);
  assert.equal(sections.length,2); assert.equal(sections[1].text,long);
  assert.deepEqual(uniqueText(['A\nB','A B','C']),['A\nB','C']);
  assert.match(splitSections('三、报名\n1.报名渠道：线上小程序报名、线下单位团体报名双通道。\n2.报名周期：即日开启报名，额满即止。').map(s=>s.text).join('\n'),/报名渠道：线上小程序/);
});
test('source collector avoids non-public and non-HTTP entries', () => {
  assert.equal(publicUrl('javascript:alert(1)'),'');
  assert.equal(publicUrl('https://localhost/test'),'');
  assert.equal(publicUrl('https://192.168.1.2/a'),'');
  assert.equal(publicUrl('/77675','https://reg.zuicool.com'),'https://reg.zuicool.com/77675');
});
test('source discovery keeps official, signup and public WeChat candidates for races without Zuicool URLs', async () => {
  const race = { signup_url: '', event_url: 'https://mp.weixin.qq.com/s/gNt4D6NcPAUi16s-HelcHg', official_url: 'https://www.runchina.org.cn/#/race/v/detail/1000480022' };
  assert.deepEqual(sourceUrlsOf(race), [race.event_url, race.official_url]);
  const html = '<a href="https://weixin.sogou.com/link?url=https%3A%2F%2Fmp.weixin.qq.com%2Fs%2Fabc123">报名公告</a><a href="https://example.com/no">无关</a>';
  assert.deepEqual(searchResultUrls(html, '2026招远黄金马拉松'), ['https://mp.weixin.qq.com/s/abc123']);
  const found = await discoverPublicSources('2026招远黄金马拉松', { fetchImpl: async () => ({ ok: true, text: async () => html }) });
  assert.deepEqual(found.urls, ['https://mp.weixin.qq.com/s/abc123']);
});
test('collector preserves more than three groups and lazy image documents', async () => {
  const collector = new Collector({cacheDir: require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'race-document-test-'))});
  collector.document = async url => ({url,title:'2026测试赛',header:'2026测试赛 已关闭',text:'完整规程'.repeat(20000),packages:[0,1,2,3,4].map(i=>({name:'第'+i+'组',price:String(i+10),status:'已截止'})),images:[],links:[],capture:{at:'2026-11-17',method:'html',fresh:true}});
  const result = await collector.collect({name:'2026测试赛',urls:['https://reg.zuicool.com/123']});
  assert.equal(result.details.groups.length,5);
  assert.equal(result.guideText.includes('完整规程'.repeat(20000)),true);
  assert.equal(result.details.registration.status,'closed');
});
test('a full verified current-edition official body is primary and platform fee versions stay in review evidence', () => {
  const doc=(url,text,extra={})=>({url,title:'2026测试越野赛',header:'',text,packages:[],images:[],capture:{at:'now',method:'html',fresh:true},...extra});
  const primary=doc('https://race.example/2026/rules','一、赛事概况\n本届赛事完整规程\n二、报名费用\n50公里398元\n三、参赛资格\n须提供近三年完赛证书',{sourceRole:'official_website',completeRegulations:true});
  const platform=doc('https://reg.zuicool.com/123','二、报名费用\n50公里旧价498元\n三、参赛资格\n无需证明\n四、交通\n赛事摆渡08:00发车',{sourceRole:'registration_platform',header:'报名截止时间：2026年11月30日\n延期提示：旧版本延期到12月1日'});
  const result=assembleCollection({name:'2026测试越野赛',docs:[primary,platform]});
  assert.match(result.guideText,/398元/);assert.doesNotMatch(result.guideText,/498元|无需证明|旧版本延期/);
  assert.match(result.guideText,/赛事摆渡08:00发车/);
  assert.equal(result.details.sections.find(s=>s.title==='交通').sourceUrl,platform.url);
  assert.equal(result.details.sections.find(s=>s.title==='交通').supplemental,true);
  assert.equal(result.details.audit.primarySource.url,primary.url);
  assert.equal(result.details.audit.supplementalReview.filter(s=>s.status==='pending').length,3);
  assert.ok(result.details.audit.supplementalReview.some(s=>s.text.includes('498元')));
  assert.equal(result.details.registration.closesAt,'');
  assert.equal(result.documents[1].text,platform.text);
});
test('unknown platform prose and overlapping reviewed image text are not silently appended to primary regulations', () => {
  const primary={url:'https://race.example/2026/rules.pdf',title:'2026测试越野赛竞赛规程',header:'',text:'## 报名费用\n本届报名398元\n## 参赛资格\n提交完赛证书',packages:[],sourceRole:'official_document',completeRegulations:true,capture:{at:'now',method:'pdf-text',fresh:true}};
  const platform={url:'https://zuicool.com/event/123',title:'2026测试越野赛',header:'',text:'旧套餐498元且报名至12月31日',packages:[],capture:{at:'now',method:'html',fresh:true}};
  const image={url:'https://zuicool.com/old-fees.jpg',sourceUrl:platform.url,caption:'报名费用',reviewedText:'报名旧价498元',reviewedTitle:'报名费用',review:{status:'verified',imageViewed:true}};
  const result=assembleCollection({name:'2026测试越野赛',docs:[primary,platform],media:[image]});
  assert.doesNotMatch(result.guideText,/498元|12月31日/);
  assert.equal(result.details.audit.supplementalReview.length,2);
  assert.ok(result.details.audit.supplementalReview.some(s=>s.reason==='unknown_topic'));
  assert.ok(result.details.audit.supplementalReview.some(s=>s.imageUrl===image.url));
});
test('a short official homepage cannot erase a complete platform document when no complete official body is available', () => {
  const docs=[{url:'https://race.example',title:'2026测试越野赛',header:'',text:'欢迎参加本届赛事',packages:[],sourceRole:'official_website',capture:{at:'now',fresh:true}},{url:'https://reg.zuicool.com/123',title:'2026测试越野赛',header:'',text:'一、报名费用\n398元\n二、参赛资格\n本人持证领物',packages:[],capture:{at:'now',fresh:true}}];
  const result=assembleCollection({name:'2026测试越野赛',docs});
  assert.match(result.guideText,/398元|本人持证领物/);
  assert.equal(result.details.audit.primarySource,undefined);
});
