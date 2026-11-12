/* Real Vue club feed/cooperation surfaces; display API responses remain in memory. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const detail=require('./club-detail-visual-v5-fixture.cjs'),supplement=require('./club-unified-visual-fixture.cjs');
const base=(process.env.CLUB_VISUAL_URL||'http://127.0.0.1:5192/marathon').replace(/\/$/,''),out=path.resolve(process.env.CLUB_UNIFIED_OUT||'/tmp/unified-clubs-web-supplement');
const report={kind:'Real Vue / synthetic display transport, no database or external writes',checks:[],screenshots:[],errors:[],unexpected:[]};
async function main(){
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const views={base:(await supplement.prepare('pages/partner/partner',{},'base')).data.view,active:(await supplement.prepare('pages/partner/partner',{},'active')).data.view};
 const posts=(await supplement.prepare('pages/feed/feed',{},'base')).data.posts;
 try{for(const width of (process.env.CLUB_VISUAL_WIDTHS||'320,390').split(',').map(Number)){
  const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(now=>{Date.now=()=>now;localStorage.setItem('marathon_token','club-layout-fixture');},detail.now);
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));let scene;
  await page.route('**/marathon/api/**',async route=>{const url=new URL(route.request().url()),endpoint=url.pathname.replace('/marathon/api','')+url.search;try{
   let data=endpoint==='/clubs/44/partner'?views[scene==='partner-active'?'active':'base']:endpoint==='/clubs/44/posts'?{posts:scene==='feed-empty'?[]:posts}:detail.response(endpoint);
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  }catch(error){report.unexpected.push(error.message);return route.fulfill({status:500,contentType:'application/json',body:'{}'});}});
  for(const name of ['feed','feed-empty','partner-base','partner-active']){
   scene=name;await page.goto(base+'/clubs/44?tab='+(name.startsWith('feed')?'feed':'partner'),{waitUntil:'networkidle'});await page.locator('.club-hero h1').waitFor();
   if(name.startsWith('partner'))await page.getByRole('heading',{name:'活跃跑团',exact:true}).waitFor();else await page.getByRole('heading',{name:'跑团动态'}).waitFor();
   const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('.club-feed button,.block .modes button,.block .line button')].map(el=>({height:el.getBoundingClientRect().height,right:el.getBoundingClientRect().right}))}));
   assert.ok(layout.scroll<=width);assert.ok(layout.buttons.every(b=>b.height>=44&&b.right<=width));
   if(name==='feed')assert.equal(await page.locator('.feed-post').count(),1);if(name==='feed-empty')assert.equal(await page.locator('.feed-post').count(),0);
   const file=name+'-'+width+'.png';await page.screenshot({path:path.join(out,file),fullPage:true});report.screenshots.push(file);report.checks.push({name,width,passed:true,layout});
  }await context.close();
 }assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);report.passed=true;}finally{await browser.close();}
}
main().catch(error=>{report.passed=false;report.error=error.stack;process.exitCode=1;}).finally(()=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,error:report.error}));});
