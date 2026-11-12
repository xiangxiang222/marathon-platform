const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('../server/node_modules/better-sqlite3');
const { installContent } = require('../server/src/content');
const { importStarters } = require('./import-content-starters.cjs');
const { enrichNews, isRunningNews, newsExclusions, newsCandidates, extractFacts } = require('./content-news-enrichment.cjs');
const curated = require('../shared/news-enrichment.json');
const starter = (id, extra = {}) => ({title:'2026测试'+id+'马拉松',summary:'原始链接摘要',source:'央视网',sourceUrl:'https://sports.cctv.com/test-'+id+'.shtml',rights:'link',body:'',publishedAt:'2026-11-10T08:00:00+08:00',category:'industry',...extra});

test('verified reports have distinct factual bodies and preserve all supporting source links', () => {
  const reports=curated.articles.filter(a=>a.body);
  assert.ok(reports.length>=9);
  assert.equal(new Set(reports.map(a=>a.body)).size,reports.length);
  for(const item of reports){
    const row=starter(1,{...item,source:item.source || '央视网'}), result=enrichNews(row,'');
    assert.equal(result.article.rights,'digest');
    assert.ok(result.article.body.startsWith(item.body));
    assert.ok(item.body.length>=300);
    assert.deepEqual(result.article.sourceRefs,item.sources);
    assert.ok(!/央视|新华|凤凰|南昌日报|绍兴晚报|报道|原文|资料来源|查证|推断|披露|https?:\/\//.test(result.article.body+' '+result.article.summary),'reader-facing prose contains the news, while source records stay in metadata');
    assert.equal(result.article.enrichmentVersion,2);
    assert.ok(result.article.body.split('\n\n').filter(p=>!p.startsWith('#')).length>=4);
  }
  const xinyu=reports.find(a=>a.title.includes('新余'));
  assert.ok(xinyu.body.includes('枪声成绩'));
  assert.ok(xinyu.body.includes('1小时7分43秒'));
  assert.ok(xinyu.body.includes('1小时7分44秒'));
  assert.ok(newsCandidates().some(a=>a.sourceUrl.includes('news.cn')&&a.publishedAt.startsWith('2026-11-04')));
  assert.equal(newsCandidates().find(a=>a.sourceUrl.includes('ncnews.com.cn')).publishedAt,'2026-11-12T00:00:00+08:00','date-only source publication dates use the Chinese calendar, not UTC midnight');
});

test('future fact-rich news becomes connected prose rather than a field sheet', () => {
  const opening='11月8日，来自全国的12000名跑者从测试中央广场鸣枪起跑，比赛设全程马拉松和半程马拉松。本届为中国田协认证A1类赛事，终点位于测试体育中心，沿线设置23个医疗站，安排30名急救跑者，2186名志愿者参与服务，另设5处应急避雨点。';
  const divisions=[['全程马拉松男子组',['甲子','乙丑','丙寅'],'2小时10分'],['全程马拉松女子组',['丁卯','戊辰','己巳'],'2小时30分'],['半程马拉松男子组',['庚午','辛未','壬申'],'1小时05分'],['半程马拉松女子组',['癸酉','子戌','丑亥'],'1小时15分']];
  const results=divisions.map(([division,names,time])=>division+names.map((name,i)=>['冠军','亚军','季军'][i]+'由'+name+'以'+time+String(i*10).padStart(2,'0')+'秒的成绩获得').join('，')+'。');
  const html='<!--repaste.body.begin-->'+[opening,...results].map(p=>'<p>'+p+'</p>').join('')+'<!--repaste.body.end-->';
  const result=enrichNews(starter('future',{title:'2026测试城市马拉松圆满落幕'}),html);
  assert.ok(result.article,result.reason);
  assert.equal(result.article.contentDepth,'rewritten_report');
  assert.match(result.article.body,/男子全马方面，甲子以2小时10分0秒获得冠军/);
  assert.match(result.article.body,/女子半马方面，癸酉以1小时15分0秒获得冠军/);
  assert.ok(!/报道参赛规模|报道涉及项目|报道冠军成绩|比赛档案|来源|央视|：|##/.test(result.article.body));
  assert.ok(result.article.body.length>=320);
  assert.ok(result.article.sourceRefs[0].url.includes('test-future'));
  assert.ok(!result.article.body.includes(opening),'source paragraphs are not copied into the article');
  const conflict=html.replace('2小时10分10秒','2小时09分10秒');
  assert.equal(enrichNews(starter('conflict',{title:'2026测试城市马拉松圆满落幕'}),conflict).article,null,'contradictory podium results stay pending');
});

test('off-topic marathons, duplicate reports and title-only videos are not published', () => {
  assert.equal(isRunningNews('皮划艇马拉松世界杯落幕'),false);
  assert.equal(isRunningNews('阅读马拉松开跑'),false);
  assert.equal(isRunningNews('2026郴州马拉松激情开赛'),true);
  for(const item of newsExclusions())assert.equal(enrichNews(starter(2,{sourceUrl:item.sourceUrl}),'').article,null);
  const thin=enrichNews(starter(3),'<meta name="description" content="2026测试马拉松圆满完赛"><div>原始视频</div>');
  assert.equal(thin.article,null);
  assert.match(thin.reason,/缺少足够/);
  const shortFacts='<!--repaste.body.begin--><p>11月8日，来自全国的12000名跑者从中央广场鸣枪起跑。本届为中国田协认证A1类，设全程马拉松和半程马拉松。张三以2:18:30获得冠军，终点位于城市体育中心。设23处医疗站，1000名志愿者、30名急救跑者参与。'+('现场顺利。'.repeat(100))+'</p><!--repaste.body.end-->';
  assert.equal(enrichNews(starter(4),shortFacts).article,null,'padding and a handful of facts cannot pass the minimum substantive length');
});

test('automatic extraction distinguishes explicit facts from unrelated nearby numbers', () => {
  const facts=extractFacts(['11月8日上午7时30分，来自全国的12000名跑者从五岭广场鸣枪起跑。本届为中国田协认证A1类赛事。','朱昌荣以02:22:32的成绩夺得冠军。全程马拉松终点位于郴州市体育中心，设23个医疗救治站，2186名青年志愿者参与。']);
  assert.ok(facts.some(f=>f.label==='比赛日期'&&f.value==='11月8日'));
  assert.ok(facts.some(f=>f.label==='报道冠军成绩'&&f.value==='朱昌荣 · 2:22:32'));
  assert.ok(facts.some(f=>f.label==='医疗站'&&f.value==='23处'));
  assert.ok(!extractFacts(['男子组竞争激烈，2:10:00后到达终点。']).some(f=>f.group==='result'));
  assert.ok(extractFacts(['男子组冠军由王超以1小时03分59秒的成绩获得。']).some(f=>f.value==='王超 · 1:03:59'));
});

test('opt-in upgrades enrich untouched legacy links while preserving edits and withdrawals', () => {
  const db=new Database(':memory:');installContent(db);
  try {
    const originals=[starter('upgrade'),starter('manual'),starter('withdraw')];
    assert.deepEqual(importStarters(db,originals),{inserted:3,skipped:0});
    db.prepare('DELETE FROM content_import_state WHERE article_id=(SELECT id FROM content_articles WHERE source_url=?)').run(originals[0].sourceUrl);
    const manual=db.prepare('SELECT id FROM content_articles WHERE source_url=?').get(originals[1].sourceUrl);
    db.prepare("UPDATE content_articles SET summary='运营已经修改的摘要' WHERE id=?").run(manual.id);
    db.prepare("UPDATE content_articles SET status='archived' WHERE source_url=?").run(originals[2].sourceUrl);
    const enrich=a=>({...a,title:a.title+' · 完整赛况',summary:'完整摘要',body:'有可靠来源支撑的正文。',rights:'digest',sourceRefs:[{title:'补充资料',url:'https://www.runchina.org.cn/'}]});
    const result=importStarters(db,originals.map(enrich),{upgradeGenerated:true});
    assert.deepEqual(result,{inserted:0,skipped:2,upgraded:1,archived:0,protected:2});
    const saved=db.prepare('SELECT * FROM content_articles WHERE source_url=?').get(originals[0].sourceUrl);
    assert.equal(saved.rights,'digest');assert.equal(saved.body,'有可靠来源支撑的正文。');
    assert.deepEqual(JSON.parse(saved.source_refs),[{title:'补充资料',url:'https://www.runchina.org.cn/'}]);
    assert.equal(db.prepare('SELECT summary FROM content_articles WHERE id=?').get(manual.id).summary,'运营已经修改的摘要');
    assert.equal(db.prepare('SELECT status FROM content_articles WHERE source_url=?').get(originals[2].sourceUrl).status,'archived');
    assert.equal(importStarters(db,originals.map(enrich),{upgradeGenerated:true}).upgraded,0);
    db.prepare("UPDATE content_articles SET source_refs='[]' WHERE id=?").run(saved.id);
    assert.equal(importStarters(db,[enrich(originals[0])],{upgradeGenerated:true}).protected,1,'source edits also preserve operator control');
  }finally{db.close();}
});

test('exclusions archive only unchanged automatic publications', () => {
  const db=new Database(':memory:');installContent(db);
  try {
    const a=starter('paddle'), b=starter('edited-paddle');importStarters(db,[a,b]);
    db.prepare("UPDATE content_articles SET title='运营保留的原创分析' WHERE source_url=?").run(b.sourceUrl);
    const result=importStarters(db,[],{upgradeGenerated:true,exclude:[a,b]});
    assert.equal(result.archived,1);assert.equal(result.protected,1);
    assert.equal(db.prepare('SELECT status FROM content_articles WHERE source_url=?').get(a.sourceUrl).status,'archived');
    assert.equal(db.prepare('SELECT status FROM content_articles WHERE source_url=?').get(b.sourceUrl).status,'published');
  }finally{db.close();}
});
