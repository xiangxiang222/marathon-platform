const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const { chromium } = require(ROOT + '/node_modules/playwright-core');
const { sampleConfig, clone } = require('./activity-template-fixture.cjs');
const base = (process.env.MARATHON_PREVIEW_URL || 'http://127.0.0.1:5174/marathon').replace(/\/$/, '');
const out = path.join(ROOT, 'design/previews/activity-templates-20261110');
const report = { kind: 'Training templates browser acceptance. Real Vue UI, intercepted in-memory APIs; no business database writes.', checks: [], screenshots: [], errors: [], unexpected: [] };
function state() { return { staff: true, templates: [{ id: 91, name: '周三间歇模板', config: sampleConfig(), version: 1 }], published: [], writes: [], failTemplates: false, delay: null }; }
async function mock(context, db) {
  await context.addInitScript(() => localStorage.setItem('marathon_token','template-fixture-a'));
  await context.route('**/marathon/api/**', async route => {
    const req=route.request(), endpoint=new URL(req.url()).pathname.replace('/marathon/api',''), method=req.method();
    let data, status=200;
    if(endpoint==='/legal') data=require(ROOT+'/shared/legal-documents.json');
    else if(endpoint==='/me/feedback/summary')data={total:0,unread:0};
    else if(endpoint==='/me')data={user:{id:7,nickname:'晨光团长'}};
    else if(/^\/clubs\/\d+$/.test(endpoint)) data={club:{id:Number(endpoint.split('/')[2]),name:'奥森悦跑团',staff:db.staff},groups:[{name:'常用组',pace:'轻松有氧',kind:'pace',capacity:0}]};
    else if(/\/activity-templates(?:\/\d+)?$/.test(endpoint)){
      const id=Number(endpoint.split('/').at(-1));
      if(method==='GET'){
        if(db.delay && (!db.delayClub || endpoint.includes('/clubs/' + db.delayClub + '/')))await db.delay;
        if(db.failTemplates){status=503;data={error:'模板暂时无法载入'};}
        else data={templates:clone(db.templates)};
      }else{
        const body=method==='DELETE'?null:req.postDataJSON();
        db.writes.push({endpoint,method,body});
        if(method==='POST'){
          const template={id:100+db.templates.length,name:body.name,config:body.config,version:1};db.templates.push(clone(template));data={template};
        }else if(method==='PUT'){
          const index=db.templates.findIndex(t=>t.id===id);
          if(index<0){status=404;data={error:'模板已删除'};}
          else if(body.version!==db.templates[index].version){status=409;data={error:'模板已更新，请重新载入'};}
          else {db.templates[index]={...clone(body),id,version:body.version+1};data={template:db.templates[index]};}
        }else if(method==='DELETE'){db.templates=db.templates.filter(t=>t.id!==id);data={ok:true};}
      }
    }
    else if(/\/activities$/.test(endpoint)&&method==='POST'){const body=req.postDataJSON();db.published.push(clone(body));db.writes.push({endpoint,method,body});data={activity:{id:101}};}
    else if(/\/activities\/\d+$/.test(endpoint))data={club:{id:999,name:'奥森悦跑团'},activity:{...sampleConfig(),id:101,issue:'旧期次',startsAt:'2026-11-01T06:30',status:'open',statusLabel:'报名中',mine:{signed:false},action:{enabled:false}},groups:sampleConfig().groups,signups:[],checks:[],staff:true,album:{photoCount:0,videoCount:0}};
    else{report.unexpected.push(endpoint);status=404;data={error:'Unexpected fixture endpoint: '+endpoint};}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
}
async function shot(page,name){
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => { scrollTo(0,0); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,footer:[...document.querySelectorAll('.actions button')].map(el=>({text:el.textContent.trim(),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))}));
  assert.ok(metrics.scrollWidth<=metrics.width+1,name+' overflow '+JSON.stringify(metrics));
  const file='web-'+name+'.png';await page.screenshot({path:path.join(out,file),fullPage:true});report.screenshots.push(file);report.checks.push({name,...metrics});
}
function ensurePortable(config){
  for(const key of ['startsAt','endsAt','signupUntil','cancelUntil','startDate','endDate','issue','mine','signups','checks'])assert.equal(Object.prototype.hasOwnProperty.call(config,key),false,'saved template must omit '+key);
}

async function check(name, fn){ await fn(); report.checks.push({name,passed:true}); }
const createUrl=club=>base+'/clubs/'+club+'/activities/new';
const title=page=>page.locator('input[maxlength="40"]').first();
const card=(page,name)=>page.locator('.saved-template').filter({has:page.locator('strong',{hasText:name})});
async function next(page){ await page.locator('.actions').getByRole('button',{name:/继续/}).click(); }
async function footerMetrics(page){
  const result=await page.evaluate(()=>{
    const footer=document.querySelector('.actions'),r=footer.getBoundingClientRect();
    return {top:r.top,bottom:r.bottom,height:r.height,viewport:innerHeight,buttons:[...footer.querySelectorAll('button')].map(el=>{
      const b=el.getBoundingClientRect(),range=document.createRange(); range.selectNodeContents(el);
      return {text:el.textContent.trim(),left:b.left,right:b.right,width:b.width,height:b.height,lines:[...range.getClientRects()].filter(x=>x.width>0).map(x=>Math.round(x.top))};
    })};
  });
  assert.ok(Math.abs(result.bottom-result.viewport)<=1,JSON.stringify(result));
  assert.ok(result.buttons.every(b=>b.width>=80 && b.height<=60),JSON.stringify(result));
  for(const button of result.buttons) assert.ok(Math.max(...button.lines)-Math.min(...button.lines)<12,'wrapped footer button '+JSON.stringify(button));
  report.checks.push({name:'footer geometry',...result});
}
async function newCase(browser,db,viewport={width:390,height:844}){
  const context=await browser.newContext({viewport,deviceScaleFactor:1});await mock(context,db);
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.stack));
  page.on('dialog',dialog=>dialog.accept());return {context,page};
}
async function main(){
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  try{
    const db=state(),{context,page}=await newCase(browser,db);await page.goto(createUrl(999));await card(page,'周三间歇模板').waitFor();
    await check('templates load and shared template starts a clean occurrence',async()=>{
      await shot(page,'step1-390');await card(page,'周三间歇模板').getByRole('button',{name:'使用模板',exact:true}).click();
      assert.equal(await title(page).inputValue(),'周三间歇跑');assert.equal(await page.locator('input[type="datetime-local"]').first().inputValue(),'');
      await page.getByLabel('选择本次活动日期').fill('2026-11-14');
      assert.equal(await page.locator('input[type="datetime-local"]').first().inputValue(),'2026-11-14T06:30');
      await page.locator('.basic-options summary').click();assert.equal(await page.locator('input[type="datetime-local"]').nth(1).inputValue(),'2026-11-14T08:00');
      await page.getByPlaceholder('可选，每次活动单独填写').fill('第12期');
    });
    let draftBefore;
    await check('save current training writes a portable shared template and leaves activity/draft intact',async()=>{
      await page.getByRole('button',{name:'存草稿',exact:true}).click();draftBefore=await page.evaluate(()=>localStorage.getItem('marathon_activity_draft:999:7'));
      await page.getByRole('button',{name:'将当前内容存为模板 ↗',exact:true}).click();await page.getByRole('dialog').waitFor();
      await page.getByRole('dialog').locator('input').fill('周末固定训练');await shot(page,'naming-sheet-390');
      await page.getByRole('button',{name:'保存到跑团模板',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
      const saved=db.templates.find(t=>t.name==='周末固定训练');assert.ok(saved);ensurePortable(saved.config);
      assert.equal(saved.config.startTime,'06:30');assert.equal(saved.config.durationMinutes,90);assert.equal(saved.config.signupLeadMinutes,720);
      assert.equal(await page.getByPlaceholder('可选，每次活动单独填写').inputValue(),'第12期');
      assert.equal(await page.evaluate(()=>localStorage.getItem('marathon_activity_draft:999:7')),draftBefore);
    });
    await check('reload reads server templates and restores account-scoped draft with horizontal controls',async()=>{
      await page.reload();await card(page,'周末固定训练').waitFor();await page.locator('.restore-toast').waitFor();
      for(const width of [390,320]){
        await page.setViewportSize({width,height:width===320?760:844});await shot(page,'draft-restore-'+width);
        const restore=await page.locator('.restore-toast').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,textWidth:el.querySelector('span').getBoundingClientRect().width}));
        assert.ok(restore.height<110&&restore.textWidth>120,JSON.stringify(restore));await footerMetrics(page);
      }
      await page.locator('.restore-toast').getByRole('button',{name:'恢复',exact:true}).click();assert.equal(await title(page).inputValue(),'周三间歇跑');
      assert.equal(await page.locator('input[type="datetime-local"]').first().inputValue(),'2026-11-14T06:30');
    });
    await check('group cards and fixed footer fit 320 and 390 without horizontal overflow or covered final field',async()=>{
      await next(page);await page.getByRole('heading',{name:'让每个人找到合适的节奏'}).waitFor();
      assert.equal(await page.locator('.group-editor input[maxlength="20"]').inputValue(),'A 组');
      assert.equal(await page.locator('input[type="datetime-local"]').nth(0).inputValue(),'2026-11-13T18:30');
      for(const width of [320,390]){
        await page.setViewportSize({width,height:width===320?760:844});await shot(page,'step2-'+width);await footerMetrics(page);
        const groups=await page.locator('.group-editor').evaluate(el=>({width:el.getBoundingClientRect().width,fields:[...el.querySelectorAll('input,select')].map(n=>n.getBoundingClientRect().width)}));
        assert.ok(groups.fields.every(w=>w>65),JSON.stringify(groups));
        await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
        const spacing=await page.evaluate(()=>({bottom:document.querySelector('.advanced').getBoundingClientRect().bottom,footer:document.querySelector('.actions').getBoundingClientRect().top}));
        assert.ok(spacing.bottom<=spacing.footer+1,'last form section covered '+JSON.stringify(spacing));
      }
    });
    await check('publishing a reused template produces one independent occurrence with only stable group fields',async()=>{
      await next(page);await shot(page,'preview-390');await page.getByRole('button',{name:'确认发布训练',exact:true}).click();
      await page.waitForURL(/\/activities\/101$/);assert.equal(db.published.length,1);const published=db.published[0];
      assert.equal(published.startsAt,'2026-11-14 06:30');assert.equal(published.issue,'第12期');assert.equal(published.groups[0].name,'A 组');
      assert.equal('mine' in published,false);assert.equal('signups' in published,false);assert.deepEqual(Object.keys(published.groups[0]).sort(),['capacity','kind','name','pace']);
    });
    await page.goto(createUrl(999));await card(page,'周末固定训练').waitFor();
    const snapshotPublished=clone(db.published);
    await check('apply clears old occurrence; template edit returns original unsaved activity and cannot change published activity',async()=>{
      await card(page,'周末固定训练').getByRole('button',{name:'使用模板',exact:true}).click();
      assert.equal(await page.locator('input[type="datetime-local"]').first().inputValue(),'');
      await page.locator('.basic-options summary').click();assert.equal(await page.getByPlaceholder('可选，每次活动单独填写').inputValue(),'');
      await title(page).fill('这次单独调整的标题');await page.getByRole('button',{name:'存草稿',exact:true}).click();draftBefore=await page.evaluate(()=>localStorage.getItem('marathon_activity_draft:999:7'));
      await card(page,'周末固定训练').getByRole('button',{name:'编辑',exact:true}).click();
      assert.equal(await page.locator('input[type="datetime-local"]').count(),0);await title(page).fill('编辑后的共享模板标题');
      await next(page);await page.getByPlaceholder('热身、主训练内容、放松安排…').fill('编辑后的共享训练安排');await next(page);
      await page.getByRole('button',{name:/保存训练模板/}).click();await page.getByRole('button',{name:'保存修改',exact:true}).click();
      await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await title(page).inputValue(),'这次单独调整的标题');
      const saved=db.templates.find(t=>t.name==='周末固定训练');assert.equal(saved.version,2);assert.equal(saved.config.workout,'编辑后的共享训练安排');
      assert.equal(await page.evaluate(()=>localStorage.getItem('marathon_activity_draft:999:7')),draftBefore);assert.deepEqual(db.published,snapshotPublished);
    });
    await check('deleting shared template leaves current form, local draft and published occurrence intact',async()=>{
      await card(page,'周末固定训练').getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click();
      await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await card(page,'周末固定训练').count(),0);
      assert.equal(await title(page).inputValue(),'这次单独调整的标题');assert.equal(await page.evaluate(()=>localStorage.getItem('marathon_activity_draft:999:7')),draftBefore);assert.deepEqual(db.published,snapshotPublished);
    });
    await check('custom template editor saves without dates or location and leaves activity snapshot intact',async()=>{
      await page.getByRole('button',{name:'＋ 创建模板',exact:true}).click();await page.locator('.template-editor-name input[maxlength="30"]').fill('自定义周中训练');
      await title(page).fill('周中训练');assert.equal(await page.locator('input[type="datetime-local"]').count(),0);await next(page);await next(page);
      await page.getByRole('button',{name:/保存训练模板/}).click();await page.getByRole('button',{name:'保存到跑团模板',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
      const saved=db.templates.find(t=>t.name==='自定义周中训练');assert.ok(saved);ensurePortable(saved.config);assert.equal(saved.config.place,'');assert.equal(saved.config.gatherPlace,'');
      assert.equal(await title(page).inputValue(),'这次单独调整的标题');
    });
    await context.close();
    await check('ordinary member has no template library and cannot issue writes',async()=>{
      const member=state();member.staff=false;const {context:c,page:p}=await newCase(browser,member);await p.goto(createUrl(999));await p.getByText('只有跑团管理员可以发布训练',{exact:true}).waitFor();assert.equal(await p.locator('.template-library').count(),0);assert.equal(member.writes.length,0);await c.close();
    });
    await check('template load error can retry without blocking manual form',async()=>{
      const failed=state();failed.failTemplates=true;const{context:c,page:p}=await newCase(browser,failed);await p.goto(createUrl(999));await p.locator('.template-load-error').waitFor();assert.ok(await title(p).isVisible());failed.failTemplates=false;await p.locator('.template-load-error').getByRole('button',{name:'重试'}).click();await card(p,'周三间歇模板').waitFor();await c.close();
    });
    await check('late response from previous account cannot populate current editor',async()=>{
      const account=state();let release;account.delay=new Promise(resolve=>release=resolve);const {context:c,page:p}=await newCase(browser,account);await p.goto(createUrl(999));await p.getByText('正在读取跑团模板…',{exact:true}).waitFor();
      await p.evaluate(()=>localStorage.setItem('marathon_token','new-account'));await p.getByRole('button',{name:'存草稿',exact:true}).click();release();await p.getByText('登录账号已变化，请重新打开发布页',{exact:true}).waitFor();assert.equal(await p.locator('.saved-template').count(),0);assert.equal(account.writes.length,0);await c.close();
    });
    await check('club navigation ignores previous club delayed template list',async()=>{
      const clubs=state();let release;clubs.delayClub=999;clubs.delay=new Promise(resolve=>release=resolve);const{context:c,page:p}=await newCase(browser,clubs);await p.goto(createUrl(999));await p.getByText('正在读取跑团模板…',{exact:true}).waitFor();
      await p.evaluate(()=>document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/clubs/1000/activities/new'));
      await card(p,'周三间歇模板').waitFor();clubs.templates=[{id:200,name:'旧跑团迟到模板',config:{},version:1}];release();await p.waitForTimeout(100);assert.equal(await p.getByText('旧跑团迟到模板',{exact:true}).count(),0);await c.close();
    });
    assert.equal(report.errors.length,0,JSON.stringify(report.errors));assert.equal(report.unexpected.length,0,JSON.stringify(report.unexpected));report.passed=true;
  }finally{await browser.close();}
}
main().catch(error=>{report.passed=false;report.error=error.stack;console.error(error);process.exitCode=1;}).finally(()=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));});
