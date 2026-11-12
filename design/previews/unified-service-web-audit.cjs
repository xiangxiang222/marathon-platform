/* Current Vue service routes with synthetic display fixtures, isolated from production.
 * Run: MARATHON_PREVIEW_URL=http://127.0.0.1:5196/marathon node design/previews/unified-service-web-audit.cjs
 * Real HTTP permissions and mutations remain covered by club-open-creation-live.cjs.
 */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const base = process.env.MARATHON_PREVIEW_URL || 'http://127.0.0.1:5196/marathon';
const out = path.resolve(process.env.UI_AUDIT_OUT || '/tmp/unified-service-web');
const club = { id: 99, name: '【合成展示】城市晨跑团', city: '杭州', intro: '周三晨跑，周末长距离。按自己的节奏，一起训练。', leader: '合成跑者', memberCount: 36, staff: true, joined: true, publicStatus: 'normal' };
const article = { id: 901, title: '【合成展示】周末团练回顾', summary: '只用于检查内容发布、预览与错误状态的版式。', body: '## 团练回顾\n这是用于视觉验收的合成正文。\n\n**按自己的节奏出发。**', category: 'club', clubId: 99, source: club.name, sourceUrl: 'https://mp.weixin.qq.com/s/synthetic', rights: 'original', status: 'draft', publishedAt: '2026-11-11', updatedAt: '2026-11-11' };
const activity = { id: 1, title: '【合成展示】周末绿道长距离', dateLabel: '11月14日 星期六', place: '城市绿道' };
const photo = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#f5f5f5"/><path d="M0 290H640M0 310H640M0 330H640" stroke="#bbb"/><text x="320" y="190" text-anchor="middle" fill="#777" font-family="sans-serif" font-size="24">Synthetic display photo</text></svg>';
const cases = [
  ...['editor','editor-preview','editor-link','editor-error','editor-empty','editor-nonstaff','editor-guest'].map(name=>({ name, url:'/clubs/99/news/manage' })),
  ...['album','album-empty','album-error','album-manage','album-viewer'].map(name=>({ name, url:'/clubs/99/activities/1/album' })),
  { name:'create',url:'/clubs/new' },{ name:'identity',url:'/clubs/99/identity' },{ name:'report',url:'/clubs/99/report' },
  { name:'intro',url:'/clubs/99/public' },{ name:'intro-share',url:'/clubs/99/public' }
];
const report = { kind:'Current Vue source, synthetic display fixtures; no production writes', startedAt:new Date().toISOString(), views:[],errors:[],passed:false };
let browser;
async function main() {
 fs.mkdirSync(out,{recursive:true});
 browser = await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const width of [320,390]) for(const scene of cases) {
  const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  if(!scene.name.endsWith('guest'))await ctx.addInitScript(()=>{localStorage.setItem('marathon_token','synthetic-service');localStorage.setItem('marathon_name','合成跑者');});
  if(scene.name==='intro-share')await ctx.addInitScript(()=>{Object.defineProperty(navigator,'share',{value:undefined,configurable:true});});
  const page=await ctx.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',e=>report.errors.push({scene:scene.name,width,error:e.message}));
  await ctx.route('**/marathon/api/**',async route=>{
   const u=new URL(route.request().url()),url=u.pathname.slice('/marathon/api'.length); let data={},status=200;
   if(url.startsWith('/media/'))return route.fulfill({contentType:'image/svg+xml',body:photo});
   if(scene.name==='editor-error'||scene.name==='album-error'){status=503;data={error:'合成状态：内容暂时无法加载，请重试。'};}
   else if(url==='/legal')data=require('../../shared/legal-documents.json');
   else if(url==='/me')data={user:{id:1,nickname:'合成跑者'},applications:[]};
   else if(url==='/me/feedback/summary')data={total:0,unread:0};
   else if(url==='/me/club-reports')data={reports:[]};
   else if(url.startsWith('/clubs/directory'))data={clubs:[]};
   else if(url==='/clubs/99')data={club:{...club,staff:scene.name!=='editor-nonstaff'}};
   else if(url==='/clubs/99/public')data={club};
   else if(url==='/clubs/99/identity')data={club,verification:null};
   else if(url.startsWith('/clubs/99/content/articles/'))data={article};
   else if(url.startsWith('/clubs/99/content/articles'))data={articles:scene.name==='editor-empty'?[]:[article],page:1,pages:1,total:scene.name==='editor-empty'?0:1};
   else if(url.startsWith('/clubs/99/activities/1/album'))data={activity,items:scene.name==='album-empty'?[]:[{id:11,kind:'photo',nickname:'合成跑者',at:'2026-11-11',mine:true,pending:false},{id:12,kind:'photo',nickname:'合成队友',at:'2026-11-11',mine:false,pending:true}],photoCount:scene.name==='album-empty'?0:2,videoCount:0,photoLeft:398,videoLeft:20,review:true,staff:true};
   else {status=404;data={error:'Unexpected synthetic fixture URL: '+url};report.errors.push(data);}
   return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(base+scene.url,{waitUntil:'networkidle'});
  if(scene.name==='create'){await page.getByLabel(/跑团名称/).fill(club.name);await page.getByLabel(/活动城市/).fill(club.city);}
  if(scene.name==='editor-preview'||scene.name==='editor-link') {await page.locator('.editor-list>button').first().click();if(scene.name==='editor-link')await page.getByLabel('内容类型').selectOption('link');await page.getByRole('button',{name:'预览内容',exact:true}).click();}
  if(scene.name==='album-manage')await page.getByRole('button',{name:'管理',exact:true}).click();
  if(scene.name==='album-viewer')await page.locator('.shot').first().click();
  if(scene.name==='intro-share'){await page.getByRole('button',{name:'分享跑团',exact:true}).click();await page.getByRole('dialog').waitFor();}
  await page.evaluate(()=>document.fonts.ready);
  const metrics=await page.evaluate(()=>{
   const area=document.querySelector('.service-page'),visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&parseFloat(s.opacity)!==0&&r.width>0&&r.height>0;};
   const nodes=[...area.querySelectorAll('*')].filter(visible),text=nodes.filter(el=>[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));
   const badFonts=text.filter(el=>parseFloat(getComputedStyle(el).fontSize)<11.9).map(el=>({cls:el.className,text:el.textContent.trim().slice(0,30),size:getComputedStyle(el).fontSize}));
   const controls=nodes.filter(el=>el.matches('button,input:not([type=checkbox]):not([type=file]),select,textarea,.file'));
   const badControls=controls.filter(el=>el.getBoundingClientRect().height<43.8).map(el=>({cls:el.className,text:el.textContent.trim().slice(0,25),height:el.getBoundingClientRect().height}));
   const brokenImages=[...document.images].filter(el=>visible(el)&&el.src&&!el.naturalWidth).map(el=>el.src.slice(0,80));
   return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,badFonts,badControls,brokenImages};
  });
  const shot=scene.name+'-'+width+'.png';await page.screenshot({path:path.join(out,shot),fullPage:true});
  const row={...scene,...metrics,screenshot:shot,passed:metrics.scrollWidth<=width+1&&metrics.bodyWidth<=width+1&&!metrics.badFonts.length&&!metrics.badControls.length&&!metrics.brokenImages.length};report.views.push(row);console.log(width,scene.name,row.passed?'PASS':'FAIL');await ctx.close();
 }
 report.passed=!report.errors.length&&report.views.every(x=>x.passed);
 assert.equal(report.passed,true,JSON.stringify(report.views.filter(x=>!x.passed)));
}
main().catch(e=>{report.errors.push({error:e.stack});process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,views:report.views.length,errors:report.errors.length,output:out}));});
