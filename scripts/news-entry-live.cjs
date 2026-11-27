'use strict';
/* Featured profile entrances against real public profile API files and a local,
 * disposable database. Browser faults below exercise optional preview fallbacks. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {chromium}=require('playwright-core');
const {inspectUiPalette}=require('./ui-palette-metrics.cjs');
const ROOT=path.resolve(__dirname,'..'),OUT=path.resolve(ROOT,process.env.NEWS_ENTRY_OUT||'design/previews/news-entry-20261112/web');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'marathon-news-entry-'));
Object.assign(process.env,{NODE_ENV:'test',BASE_PATH:'/marathon',PORT:'0',MARATHON_DB:path.join(temp,'app.sqlite'),MARATHON_MEDIA:path.join(temp,'media'),CONTENT_DATA_DIR:path.join(temp,'content'),ADMIN_TOKEN:crypto.randomBytes(24).toString('hex')});
const exists=fs.existsSync;fs.existsSync=file=>path.resolve(String(file))===path.join(ROOT,'.env')?false:exists(file);
let app;try{({app}=require('../server/src/index'));}finally{fs.existsSync=exists;}
const db=require('../server/src/db').getDb(),report={kind:'Real localhost API/browser profile entry checks; no production changes',checks:[],views:[],errors:[],limitations:['Mobile Chromium screenshots are not WeChat device screenshots.','The article is a temporary synthetic fixture; person previews read existing published data.']};
let browser,server,origin,base;
async function check(name,fn){await fn();report.checks.push({name,passed:true});console.log('PASS '+name);}
async function snapshot(page,name){const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,cards:[...document.querySelectorAll('.profile-entry')].map(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,left:r.left,right:r.right};})}));assert.ok(metrics.scrollWidth<=metrics.width+1,name+' viewport overflow');assert.ok(metrics.cards.every(card=>card.scrollWidth<=card.clientWidth+1&&card.left>=15&&card.right<=metrics.width-15),name+' card overflow');assert.ok(metrics.cards.length===2&&Math.abs(metrics.cards[0].height-metrics.cards[1].height)<1,name+' equal card heights');const file=name+'-'+metrics.width+'.png';await page.screenshot({path:path.join(OUT,file),fullPage:true});report.views.push({name,...metrics,screenshot:file});}
async function context(width){const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});await ctx.route('**/*',route=>/^(https?:\/\/(127\.0\.0\.1|localhost)(:|\/)|data:|blob:)/.test(route.request().url())?route.continue():route.abort());const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>report.errors.push(error.message));return {ctx,page};}
async function checkRaceNews(width){
  const {ctx,page}=await context(width);
  const raceNews={id:912,title:'【合成验收】从超长赛事标题来看官方赛道调整、领物安排与赛事服务信息',raceId:'fixture-race',raceName:'合成超长赛事名称 · 城市马拉松暨社区健康跑',body:'仅用于验证旧链接和官方赛事入口。',publishedAt:'2026-11-02'};
  const queries=[];
  await ctx.route('**/api/news?*',route=>{
    const q=new URL(route.request().url()).searchParams.get('q');queries.push(q);
    if(queries.length===2)return route.fulfill({status:503,json:{error:'synthetic failure'}});
    return route.fulfill({json:{news:[raceNews],total:1,page:1,pages:1}});
  });
  await ctx.route('**/api/news/912',route=>route.fulfill({json:{news:raceNews}}));
  try{
    await page.goto(base+'/news?tab=race',{waitUntil:'networkidle'});
    assert.equal(await page.locator('.journal-row h3').innerText(),raceNews.title);
    const problems=[];
    const verify=async(name,run)=>{try{await run();}catch(error){problems.push(new Error(name+': '+error.message));}};
    await verify('The feed hero uses a bright background and dark readable type',async()=>{
      const {activityHero:hero}=await page.evaluate(inspectUiPalette,'.journal-intro');
      assert.ok(hero?.brightReadableSurface, JSON.stringify(hero));
    });
    const search=page.getByRole('search');
    await search.getByRole('textbox').fill('  领物与赛道&  ');
    await search.getByRole('button',{name:'搜索',exact:true}).click();
    await page.getByRole('alert').waitFor();
    await search.getByRole('textbox').fill('未提交新关键词');
    await page.getByRole('button',{name:'重新加载',exact:true}).click();
    await page.locator('.journal-row').first().waitFor();
    assert.equal(queries.at(-1),'领物与赛道&');
    await verify('Submitted search is visible and can be cleared without leaving the race feed',async()=>{
      const applied=page.locator('.journal-query');
      assert.equal(await applied.count(),1);
      assert.match(await applied.innerText(),/领物与赛道&/);
      await applied.getByRole('button',{name:'清除关键词'}).click();
      await page.locator('.journal-row').first().waitFor();
      assert.equal(queries.at(-1),'');assert.match(page.url(),/tab=race$/);
    });
    await verify('Service card groups accessible channels and search; race cards show their recorded association',async()=>{
      const card=page.locator('.journal-service');assert.equal(await card.count(),1);
      assert.equal(await card.locator('.journal-tabs a').count(),6);
      assert.equal(await card.getByRole('search').count(),1);
      assert.match(await page.locator('.journal-row .row-meta').innerText(),/合成超长赛事名称/);
      const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,targets:[...document.querySelectorAll('.journal-service button,.journal-service a')].map(el=>[el.offsetWidth,el.offsetHeight])}));
      assert.ok(metrics.scrollWidth<=width+1);assert.ok(metrics.targets.every(([w,h])=>w>=44&&h>=44));
      await page.screenshot({path:path.join(OUT,`race-feed-${width}.png`),fullPage:true});
    });
    await page.locator('.journal-row').first().click();await page.waitForURL('**/news/912');
    await page.locator('.news-body').waitFor();
    await verify('Legacy detail keeps the recorded race and original reading channel',async()=>{
      assert.equal(await page.locator('.race-news-service').count(),1);
      assert.equal(await page.locator('.race-news-service a').getAttribute('href'),'/marathon/races/fixture-race?tab=news');
      assert.equal(await page.getByRole('link',{name:'返回资讯'}).getAttribute('href'),'/marathon/news?tab=race');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
      await page.screenshot({path:path.join(OUT,`race-detail-${width}.png`),fullPage:true});
    });
    await verify('The legacy article uses a bright background and dark readable type',async()=>{
      const {activityHero:hero}=await page.evaluate(inspectUiPalette,'.race-news-heading');
      assert.ok(hero?.brightReadableSurface, JSON.stringify(hero));
    });
    if(problems.length)throw new AggregateError(problems,problems.map(error=>error.message).join('\n'));
  }finally{await ctx.close();}
}
async function main(){fs.mkdirSync(OUT,{recursive:true});server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});origin='http://127.0.0.1:'+server.address().port;base=origin+'/marathon';
  const response=await fetch(base+'/api/admin/content/articles',{method:'POST',headers:{Authorization:'Bearer '+process.env.ADMIN_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({title:'【合成验收】赛道上的人，也有自己的成长故事',summary:'仅用于本地页面布局检查，不是真实报道。',body:'## 一起认识赛道上的人\n\n这是一篇本地临时验收文章。',category:'industry',rights:'original',source:'合成验收编辑部',status:'published',publishedAt:new Date().toISOString()})});assert.equal(response.status,200,await response.text());
  const pacers=await fetch(base+'/api/content/profiles?type=pacer&page=1&pageSize=6').then(r=>r.json()),actualTargets=pacers.profiles.flatMap(p=>[p.primaryTargetTime,...(p.targetTimes||[])]).filter(Boolean);
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  for(const width of [320,390])await check(width+'px race news uses a scoped search and linked article service',()=>checkRaceNews(width));
  for(const width of [320,390]){const {ctx,page}=await context(width),previews=[];page.on('request',request=>{if(request.url().includes('/content/profiles?')&&request.url().includes('pageSize=6'))previews.push(request.url());});
    await check(width+'px published previews enrich two equal cards and preserve first-screen news',async()=>{await page.goto(base+'/news',{waitUntil:'networkidle'});await page.locator('.shortcut-portrait img').first().waitFor();assert.equal(await page.locator('.profile-entry').count(),2);assert.equal(previews.length,2);assert.ok(await page.locator('.shortcut-portrait img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0)));assert.ok(actualTargets.includes(await page.locator('.shortcut-pace strong').innerText()));const news=await page.locator('.journal-row').first().boundingBox();assert.ok(news.y<650,'Actual news must stay on opening screen');await snapshot(page,'published-entries');});
    await check(width+'px both entries open their working directories without refetching cached previews',async()=>{await page.locator('.profile-entry').filter({hasText:'运动员档案'}).click();await page.waitForURL(/tab=athlete/);await page.locator('.person-row').first().waitFor();await page.getByRole('button',{name:'女子',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.person-row')?.innerText.includes('女子'));await page.locator('.journal-tabs a').filter({hasText:'精选'}).click();await page.locator('.profile-entry').first().waitFor();await page.locator('.profile-entry').filter({hasText:'官兔档案'}).click();await page.waitForURL(/tab=pacer/);await page.locator('.person-row').first().waitFor();assert.ok(await page.locator('.pacer-race-filter select option').count()>1);await page.locator('.journal-tabs a').filter({hasText:'精选'}).click();await page.locator('.profile-entry').first().waitFor();assert.equal(previews.length,2);});await ctx.close();
    const failed=await context(width);await failed.ctx.route('**/content/profiles?*pageSize=6',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"preview unavailable"}'}));await check(width+'px failed optional previews leave both entries and real news usable',async()=>{await failed.page.goto(base+'/news',{waitUntil:'networkidle'});assert.equal(await failed.page.locator('.profile-entry').count(),2);assert.ok(await failed.page.locator('.journal-row').count()>0);assert.equal(await failed.page.locator('[role="alert"]').count(),0);assert.equal(await failed.page.locator('.shortcut-pace').count(),0);await snapshot(failed.page,'preview-unavailable');await failed.page.locator('.profile-entry').filter({hasText:'官兔档案'}).click();await failed.page.locator('.person-row').first().waitFor();});await failed.ctx.close();
    const broken=await context(width);await broken.ctx.route('**/content/profiles?*pageSize=6',route=>{const type=new URL(route.request().url()).searchParams.get('type');return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({profiles:type==='athlete'?[{id:'broken-photo',type:'athlete',name:'合成图片失败',avatar:'/marathon/images/no-such-profile.jpg'},{id:'unsafe-photo',type:'athlete',name:'合成无效图片',avatar:'javascript:alert(1)'}]:[{id:'long-target',type:'pacer',name:'合成长时间格式',primaryTargetTime:'3:45:00'}]})});});await check(width+'px broken photos fall back cleanly and long targets fit inside each card',async()=>{await broken.page.goto(base+'/news',{waitUntil:'networkidle'});await broken.page.waitForFunction(()=>document.querySelectorAll('.shortcut-portrait').length===0);assert.equal(await broken.page.locator('.shortcut-pace strong').innerText(),'3:45:00');await snapshot(broken.page,'long-target-image-fallback');});await broken.ctx.close();
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
}
main().catch(error=>{report.passed=false;report.error=error.stack;console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(temp,{recursive:true,force:true});report.finishedAt=new Date().toISOString();fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,views:report.views.length,output:OUT}));});
