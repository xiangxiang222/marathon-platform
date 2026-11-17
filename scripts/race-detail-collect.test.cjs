const test = require('node:test');
const assert = require('node:assert/strict');
const { groupOf, statusOf, splitSections, uniqueText, publicUrl, Collector, sameEdition, registrationDates, registrationOfDocuments, readableOcr, usefulMedia, assembleCollection } = require('./race-detail-collect.cjs');

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
test('collector preserves more than three groups and lazy image documents', async () => {
  const collector = new Collector({cacheDir: require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'race-document-test-'))});
  collector.document = async url => ({url,title:'2026测试赛',header:'2026测试赛 已关闭',text:'完整规程'.repeat(20000),packages:[0,1,2,3,4].map(i=>({name:'第'+i+'组',price:String(i+10),status:'已截止'})),images:[],links:[],capture:{at:'2026-11-17',method:'html',fresh:true}});
  const result = await collector.collect({name:'2026测试赛',urls:['https://reg.zuicool.com/123']});
  assert.equal(result.details.groups.length,5);
  assert.equal(result.guideText.includes('完整规程'.repeat(20000)),true);
  assert.equal(result.details.registration.status,'closed');
});
