/* Visual audit of current Vue pages via Vite and synthetic HTTP fixtures.
 * Business behavior is separately covered by the real HTTP acceptance scripts. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'design/previews/reading-pages-web-jd-20261111');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'reading-ui-'));
const catalog = require('../shared/legal-documents.json');
fs.mkdirSync(output, { recursive: true });
const report = { kind: 'Current Vue rendering with synthetic HTTP display fixtures; no production writes', startedAt: new Date().toISOString(), views: [], errors: [], passed: false };
const article = { id: 901, title: '【合成展示】周末团练资讯', summary: '用于检查编辑、预览及发布状态的合成文章。', body: '## 团练回顾\n这是用于版式验收的合成正文。\n\n**按自己的节奏出发。**', category: 'club', clubId: 99, clubName: '合成跑团', source: '合成跑团', sourceUrl: 'https://mp.weixin.qq.com/s/synthetic', rights: 'original', status: 'draft', publishedAt: '2026-11-11', updatedAt: '2026-11-11' };
const athlete = { id: 'synthetic-athlete', type: 'athlete', name: '合成运动员', nameEn: 'Synthetic Runner', gender: 'women', rank: 1, personalBest: '2:23:10', eventName: '合成马拉松', eventDate: '2026-10-18', bio: '仅用于视觉验收的合成人物资料，不是真实运动员。', sources: [{ title: '合成来源', url: 'https://example.invalid/athlete' }] };
const pacer = { ...athlete, id: 'synthetic-pacer', type: 'pacer', name: '合成私兔', rank: null, personalBest: '', personalBestDisplay: '约2小时52分', pacingEvidence: [{ date: '2026', event: '合成马拉松', description: '用于检查版式的合成带跑经历。' }] };
const feedback = { id: 801, title: '【合成展示】希望训练集合信息更清楚', body: '这是用于视觉验收的合成反馈。希望集合时间、地点和分组在出发前能够一眼确认。', category: 'ui', module: 'clubs', status: 'published', statusLabel: '征集意见', votes: 18, revision: 1, createdAt: '2026-11-11', updatedAt: '2026-11-11', publishedAt: '2026-11-11', author: { nickname: '合成跑者' }, reply: '已收到建议，正在整理具体场景。', isMine: false, canWithdraw: false, voted: false, images: [], events: [{ status: 'published', statusLabel: '已公示', createdAt: '2026-11-11', reply: '已公开征集意见。' }], reward: null };
const cases = [
 ...[['hub','/news'],['athlete','/news?tab=athlete'],['pacer','/news?tab=pacer'],['empty','/news?tab=industry'],['unavailable','/news?tab=athlete'],['article-detail','/news/articles/901'],['athlete-detail','/news/profiles/synthetic-athlete'],['pacer-detail','/news/profiles/synthetic-pacer'],['detail-error','/news/articles/901'],['editor','/clubs/99/news/manage'],['editor-preview','/clubs/99/news/manage'],['editor-link','/clubs/99/news/manage'],['editor-error','/clubs/99/news/manage'],['nonstaff','/clubs/99/news/manage'],['guest-editor','/clubs/99/news/manage']].map(([name,url])=>({ name,url,group:'news' })),
 ...[['board','/feedback'],['feedback-empty','/feedback'],['feedback-error','/feedback'],['compose','/feedback'],['feedback-detail','/feedback/801'],['pending','/feedback/801'],['reward-claim','/feedback/801'],['reward-shipped','/feedback/801'],['reward-public','/feedback/801']].map(([name,url])=>({ name,url,group:'feedback' })),
 ...catalog.documents.map(d=>({name:'legal-'+d.id,url:'/legal/'+d.id,group:'legal'})),
 ...[['legal-offline','/legal/privacy'],['legal-missing','/legal/missing'],['rights-guest','/legal/rights'],['rights-record','/legal/rights'],['rights-error','/legal/rights']].map(([name,url])=>({name,url,group:'legal'}))
];
let vite, browser;
async function main() {
 const { createServer } = await import(pathToFileURL(path.join(root,'web/node_modules/vite/dist/node/index.js')).href);
 vite = await createServer({root:path.join(root,'web'),configFile:path.join(root,'web/vite.config.js'),cacheDir:path.join(tmp,'vite-cache'),server:{host:'127.0.0.1',port:0}});await vite.listen();
 const origin = 'http://127.0.0.1:'+vite.httpServer.address().port, base=origin+'/marathon';
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const width of [320,390]) for(const scene of cases) {
  const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  if(!scene.name.includes('guest'))await ctx.addInitScript(()=>{localStorage.setItem('marathon_token','synthetic-reader');localStorage.setItem('marathon_name','合成跑者');});
  const p=await ctx.newPage();p.setDefaultTimeout(10000);
  p.on('pageerror',error=>report.errors.push({name:scene.name,width,error:error.message}));
  await ctx.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(!u.pathname.startsWith('/marathon/api/'))return route.continue();
   const url=u.pathname.slice('/marathon/api'.length);let data={},status=200;
   if(['unavailable','detail-error','editor-error','feedback-error'].includes(scene.name)){status=503;data={error:'暂时无法加载，请稍后重试。'};}
   else if(url==='/legal'){if(scene.name==='legal-offline'){status=503;data={error:'offline'};}else data=catalog;}
   else if(url==='/me')data={user:{id:1,nickname:'合成跑者'}};
   else if(url==='/me/privacy-requests'){if(scene.name==='rights-error'){status=503;data={error:'申请记录暂时无法读取，请重试。'};}else data={requests:scene.name==='rights-record'?[{id:701,type:'correct',status:'completed',detail:'合成申请：请更正一条训练记录。',response:'合成回复：已核对事项。',createdAt:'2026-11-11'}]:[]};}
   else if(url==='/clubs/99')data={club:{id:99,name:'合成跑团',staff:scene.name!=='nonstaff'}};
   else if(url.startsWith('/clubs/99/content/articles/'))data={article};
   else if(url.startsWith('/clubs/99/content/articles'))data={articles:[article],total:1,page:1,pages:1};
   else if(url==='/content/profiles'){const isPacer=u.searchParams.get('type')==='pacer';data={profiles:[isPacer?pacer:athlete],total:1,page:1,pages:1,meta:{rankingNotice:isPacer?'公开带跑经历收录，顺序不代表全国排名。':'历史个人最佳成绩快照，非现役排名。'}};}
   else if(url.startsWith('/content/profiles/'))data={profile:url.includes('pacer')?pacer:athlete,meta:{rankingNotice:'合成验收资料，并非真实全国排名。'}};
   else if(url.startsWith('/content/articles/'))data={article};
   else if(url==='/content/articles')data={articles:scene.name==='empty'?[]:[article,{...article,id:902,title:'【合成展示】赛道之外的故事'}],total:scene.name==='empty'?0:2,page:1,pages:1};
   else if(url==='/feedback')data={items:scene.name==='feedback-empty'?[]:[feedback],total:scene.name==='feedback-empty'?0:1,page:1,pages:1,summary:{published:12,adopted:3},unread:1};
   else if(url.startsWith('/feedback/')){
    data=structuredClone(feedback);
    if(scene.name==='pending')Object.assign(data,{status:'pending',statusLabel:'待审核',isMine:true,canWithdraw:true,publishedAt:'',reply:'',events:[]});
    if(scene.name.startsWith('reward'))Object.assign(data,{status:'adopted',statusLabel:'已采纳',isMine:scene.name!=='reward-public',reward:{name:'合成运动礼品',status:scene.name==='reward-shipped'?'shipped':'unclaimed',statusLabel:scene.name==='reward-shipped'?'已寄出':'待领取',carrier:'合成快递',tracking:'SYNTHETIC123',receiver:'合成收件人',phone:'13800000000',address:'合成地址，仅用于视觉验收'}});
   } else {status=404;data={error:'not found'};}
   return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await p.goto(base+scene.url,{waitUntil:'networkidle'});
  if(scene.name==='compose'){await p.getByRole('button',{name:'提个建议',exact:true}).first().click();await p.locator('.feedback-dialog[open]').waitFor();await p.getByLabel(/^标题/).fill('【合成展示】集合信息更清楚');await p.getByLabel(/^具体说说/).fill('用于版式验收的合成表单内容，希望出发前能看清集合信息。');}
  if(scene.name==='reward-claim')await p.getByRole('button',{name:'填写收件信息，领取奖励',exact:true}).click();
  if(['editor-preview','editor-link'].includes(scene.name)){
   await p.locator('.editor-list>button').first().click();
   if(scene.name==='editor-link')await p.getByLabel('内容类型').selectOption('link');
   await p.getByRole('button',{name:'预览内容',exact:true}).click();
  }
  await p.evaluate(()=>document.fonts.ready);
  const metrics=await p.evaluate(()=>{
   const area=document.querySelector('.journal-page,.feedback-page,.legal-page');
   const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&parseFloat(s.opacity)!==0&&r.width>0&&r.height>0;};
   const text=[...area.querySelectorAll('*')].filter(el=>visible(el)&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));
   const badFonts=text.filter(el=>parseFloat(getComputedStyle(el).fontSize)<11.9).map(el=>({cls:el.className,text:el.textContent.trim().slice(0,30),size:getComputedStyle(el).fontSize}));
   const badSpacing=text.filter(el=>{const s=getComputedStyle(el).letterSpacing;return s!=='normal'&&Math.abs(parseFloat(s))>.01;}).map(el=>({cls:el.className,text:el.textContent.trim().slice(0,30),spacing:getComputedStyle(el).letterSpacing}));
   const controls=[...area.querySelectorAll('button,input:not([type=checkbox]):not([type=file]),select,textarea,.attachment-action')].filter(visible).filter(el=>el.getAttribute('type')!=='checkbox');
   const badControls=controls.filter(el=>{const r=el.getBoundingClientRect();return r.height<43.8||r.width<43.8;}).map(el=>({cls:el.className,text:el.textContent.trim().slice(0,25),height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width}));
   return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,badFonts,badSpacing,badControls};
  });
  const name=scene.name+'-'+width;await p.screenshot({path:path.join(output,name+'.png'),fullPage:true});
  const row={...scene,...metrics,screenshot:name+'.png',passed:metrics.scrollWidth<=width+1&&metrics.bodyWidth<=width+1&&!metrics.badFonts.length&&!metrics.badSpacing.length&&!metrics.badControls.length};report.views.push(row);console.log(width,scene.name,row.passed?'PASS':'FAIL');await ctx.close();
 }
 report.passed=!report.errors.length&&report.views.every(x=>x.passed);
}
main().catch(error=>{report.errors.push({error:error.stack});process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(vite)await vite.close();fs.rmSync(tmp,{recursive:true,force:true});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;console.log(JSON.stringify({passed:report.passed,views:report.views.length,errors:report.errors.length,report:path.relative(root,path.join(output,'report.json'))}));});
