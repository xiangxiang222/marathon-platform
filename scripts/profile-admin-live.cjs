'use strict';
/* Actual HTTP + built Vue acceptance, entirely inside temporary SQLite/media
 * and content snapshots. Never loads .env or connects to production. */
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright-core');
const ROOT=path.resolve(__dirname,'..');
const OUT=path.join(ROOT,'design/previews/profile-admin-20261112');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'marathon-profile-admin-'));
const contentDir=path.join(temporary,'content');fs.mkdirSync(contentDir,{recursive:true});fs.mkdirSync(OUT,{recursive:true});
for(const name of ['elite-athletes.json','elite-athletes-history.json','official-pacers.json','pacer-profiles.json']){
  const runtime=path.join(ROOT,'server/data/content',name),source=fs.existsSync(runtime)?runtime:path.join(ROOT,'shared',name);
  if(fs.existsSync(source))fs.copyFileSync(source,path.join(contentDir,name));
}
Object.assign(process.env,{NODE_ENV:'test',BASE_PATH:'/marathon',PORT:'0',MARATHON_DB:path.join(temporary,'app.sqlite'),MARATHON_MEDIA:path.join(temporary,'media'),CONTENT_DATA_DIR:contentDir,ADMIN_TOKEN:crypto.randomBytes(32).toString('hex')});
const exists=fs.existsSync;fs.existsSync=file=>path.resolve(String(file))===path.join(ROOT,'.env')?false:exists(file);
let app;try{({app}=require('../server/src/index'));}finally{fs.existsSync=exists;}
const {getDb}=require('../server/src/db');
const report={startedAt:new Date().toISOString(),isolation:'Temporary SQLite, media and copied content snapshots; localhost ephemeral HTTP; .env hidden; browser external requests blocked; no production writes.',checks:[],views:[],errors:[],limitations:['Chromium mobile viewports do not replace WeChat device testing.','All newly authored people and race assignments are disposable acceptance fixtures.']};
let server,origin,base,browser;
async function api(method,suffix,body,expected=200,admin=false){
  assert.ok(suffix.startsWith('/')&&!suffix.includes('://'));
  const options={method,headers:{},signal:AbortSignal.timeout(20000)};
  if(admin)options.headers.Authorization='Bearer '+process.env.ADMIN_TOKEN;
  if(body!=null){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
  const response=await fetch(origin+'/marathon/api'+suffix,options),data=await response.json().catch(()=>({}));
  assert.equal(response.status,expected,method+' '+suffix+': '+response.status+' '+(data.error||''));return data;
}
const adminApi=(method,suffix,body,expected=200)=>api(method,'/admin/content/profiles'+suffix,body,expected,true);
const authFields=profile=>({revision:profile.revision,baseVersion:profile.baseVersion});
async function check(name,fn){await fn();report.checks.push({name,passed:true});console.log('PASS '+name);}
async function context(width=390,admin=false){
  const ctx=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
  await ctx.route('**/*',route=>/^(https?:\/\/(127\.0\.0\.1|localhost)(:|\/)|data:|blob:)/.test(route.request().url())?route.continue():route.abort());
  if(admin)await ctx.addInitScript(token=>sessionStorage.setItem('marathon_admin',token),process.env.ADMIN_TOKEN);
  const p=await ctx.newPage();p.setDefaultTimeout(12000);
  p.on('pageerror',e=>report.errors.push({kind:'browser',message:e.message}));
  p.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=500)report.errors.push({kind:'HTTP',pathname:new URL(r.url()).pathname,status:r.status()});});
  return {ctx,p};
}
async function section(p,label){
  if(!p.url().startsWith(base+'/admin'))await p.goto(base+'/admin',{waitUntil:'networkidle'});
  const menu=p.getByRole('button',{name:'打开导航菜单',exact:true});if(await menu.isVisible())await menu.click();
  await p.locator('.navigation-item').filter({hasText:label}).click();await p.locator('.profile-admin').waitFor();
}
async function searchAndOpen(p,name){
  const input=p.locator('.profile-search input');await input.fill(name);await input.press('Enter');
  const row=p.locator('.profile-row').filter({hasText:name}).first();await row.waitFor();await row.click();await p.locator('.profile-form').waitFor();
}
async function snapshot(p,name){
  await p.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));
  await p.evaluate(()=>document.fonts.ready);
  const layout=await p.evaluate(()=>{
    const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';};
    const overflow=[...document.querySelectorAll('main,section,article,form,input,textarea,select,button')].filter(el=>visible(el)&&!el.closest('.operations-sidebar,.profile-editor-tabs')&&el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,className:String(el.className),right:el.getBoundingClientRect().right})).slice(0,8);
    return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,overflow};
  });
  assert.ok(layout.scrollWidth<=layout.width+1&&layout.bodyWidth<=layout.width+1,name+' horizontal page overflow: '+JSON.stringify(layout));assert.deepEqual(layout.overflow,[],name+' visible control overflow');
  const file=name+'-'+layout.width+'.png';await p.screenshot({path:path.join(OUT,file),fullPage:true});report.views.push({name,...layout,screenshot:file});
}
const article=(name,marker)=>({title:name+'的长跑履历',lead:'用于隔离验收的完整人物文章。',body:'## 从训练到比赛\n\n'+marker+'。这篇文章是临时验收环境中的独立编辑稿，用于核对个人资料、完整文章和比赛履历的发布效果。\n\n## 比赛与成长\n\n人物正文直接在应用内阅读，编辑者能够按段落组织训练经历和比赛表现，并在发布前检查阅读效果。'});
async function main(){
  assert.ok(fs.existsSync(path.join(ROOT,'web/dist/index.html')),'Build web/dist before acceptance');
  server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});origin='http://127.0.0.1:'+server.address().port;base=origin+'/marathon';
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const collected=(await api('GET','/content/profiles?type=athlete&gender=men&pageSize=1')).profiles[0];assert.ok(collected);
  const initial=(await adminApi('GET','/'+encodeURIComponent(collected.id))).profile;
  let existing=initial,newAthlete,newPacer;
  await check('Management requires authentication and new drafts remain private until publication',async()=>{
    await api('GET','/admin/content/profiles?type=athlete',null,401);
    await api('POST','/admin/content/profiles',{type:'athlete',name:'未授权人物',status:'draft'},401);
    const created=await adminApi('POST','',{type:'athlete',name:'验收运动员知远',nameEn:'Acceptance Runner',gender:'men',birthDate:'1999-03-12',placeOfBirth:'杭州',team:'隔离验收训练组',city:'杭州',personalBest:'2:18:36',article:article('验收运动员知远','新建运动员草稿验收'),status:'draft'});newAthlete=created.profile;
    assert.equal(newAthlete.status,'draft');assert.equal(newAthlete.isPublic,false);await api('GET','/content/profiles/'+newAthlete.id,null,404);
    newAthlete=(await adminApi('PUT','/'+newAthlete.id,{...authFields(newAthlete),status:'published'})).profile;
    assert.equal((await api('GET','/content/profiles/'+newAthlete.id)).profile.article.body,newAthlete.article.body);
  });
  await check('Editing collected profiles persists original prose, preserves public drafts and follows untouched collector fields',async()=>{
    const published=article(existing.name,'人工发布的运动员履历验收');
    existing=(await adminApi('PUT','/'+existing.id,{...authFields(existing),article:published,status:'published'})).profile;
    const pending=article(existing.name,'尚未发布的新成长故事');
    existing=(await adminApi('PUT','/'+existing.id,{...authFields(existing),article:pending,status:'draft'})).profile;
    assert.equal(existing.hasDraft,true);assert.equal((await api('GET','/content/profiles/'+existing.id)).profile.article.body,published.body);
    const file=path.join(contentDir,'elite-athletes.json'),data=JSON.parse(fs.readFileSync(file,'utf8')),person=data.athletes.find(p=>p.id===existing.id);assert.ok(person);
    person.seasonBest=person.seasonBest==='2:05:57'?'2:05:56':'2:05:57';person.name='采集刷新后的姓名验收';fs.writeFileSync(file,JSON.stringify(data));
    const refreshed=(await api('GET','/content/profiles/'+existing.id)).profile;
    assert.equal(refreshed.seasonBest,person.seasonBest);assert.equal(refreshed.name,person.name);assert.equal(refreshed.article.body,published.body);
    await adminApi('PUT','/'+existing.id,{...authFields(existing),status:'published'},409);
    existing=(await adminApi('GET','/'+existing.id)).profile;
    existing=(await adminApi('PUT','/'+existing.id,{...authFields(existing),status:'published'})).profile;
    assert.equal((await api('GET','/content/profiles/'+existing.id)).profile.article.body,pending.body);
  });
  await check('Archive hides collected profiles without deleting drafts, and explicit republishing restores them',async()=>{
    const archived=(await adminApi('DELETE','/'+existing.id,authFields(existing))).profile;
    await api('GET','/content/profiles/'+existing.id,null,404);
    const list=await api('GET','/content/profiles?type=athlete&q='+encodeURIComponent('采集刷新后的姓名验收'));assert.ok(!list.profiles.some(p=>p.id===existing.id));
    existing=archived||(await adminApi('GET','/'+existing.id)).profile;
    existing=(await adminApi('PUT','/'+existing.id,{...authFields(existing),status:'published'})).profile;
    await api('GET','/content/profiles/'+existing.id);
  });
  const operator=await context(1440,true),p=operator.p;
  let browserAthlete;
  await check('Athlete administrator creates and previews a complete article, saves a draft, then publishes and edits it',async()=>{
    await section(p,'运动员管理');const genderFilter=p.getByLabel('人物性别筛选',{exact:true});
    const filtered=p.waitForResponse(r=>r.url().includes('/admin/content/profiles?')&&new URL(r.url()).searchParams.get('gender')==='women');await genderFilter.selectOption('women');const filteredData=await(await filtered).json();assert.ok(filteredData.profiles.length&&filteredData.profiles.every(row=>row.gender==='women'));
    await genderFilter.selectOption('');await p.getByRole('button',{name:'新建运动员',exact:true}).first().click();
    await p.getByLabel('姓名',{exact:true}).fill('验收运动员晓岚');await p.locator('.profile-form').getByLabel(/^性别/).selectOption('women');await p.getByRole('button',{name:'人物文章',exact:true}).click();
    await p.getByLabel('文章标题',{exact:true}).fill('晓岚：从日常训练到个人突破');await p.getByLabel('文章导语',{exact:true}).fill('浏览器创建的隔离人物档案。');
    const prose=article('晓岚','浏览器运动员完整文章验收').body;await p.getByLabel(/^人物正文/).fill(prose);
    await p.getByRole('button',{name:'预览文章',exact:true}).click();await p.getByText('浏览器运动员完整文章验收。',{exact:false}).first().waitFor();
    await snapshot(p,'athlete-preview');
    await p.getByRole('button',{name:'人物文章',exact:true}).click();
    const created=p.waitForResponse(r=>r.url().endsWith('/admin/content/profiles')&&r.request().method()==='POST');await p.getByRole('button',{name:'存为草稿',exact:true}).click();browserAthlete=(await (await created).json()).profile;
    await api('GET','/content/profiles/'+browserAthlete.id,null,404);await p.getByRole('button',{name:'发布档案',exact:true}).click();
    await p.getByRole('status').filter({hasText:/发布/}).waitFor();assert.equal((await api('GET','/content/profiles/'+browserAthlete.id)).profile.article.body,prose);
    await p.getByLabel(/^人物正文/).fill(prose+'\n\n通过浏览器补充的训练与比赛经历。');
    const saved=p.waitForResponse(r=>r.url().endsWith('/admin/content/profiles/'+browserAthlete.id)&&r.request().method()==='PUT');await p.getByRole('button',{name:'保存并发布',exact:true}).click();browserAthlete=(await (await saved).json()).profile;
    assert.match((await api('GET','/content/profiles/'+browserAthlete.id)).profile.article.body,/通过浏览器补充/);
  });
  await check('Collector conflicts preserve local prose while merging the newest untouched season and PB results',async()=>{
    await searchAndOpen(p,'采集刷新后的姓名验收');await p.getByRole('button',{name:'人物文章',exact:true}).click();
    const body=existing.article.body+'\n\n409发生时必须保留的本地段落。';await p.getByLabel(/^人物正文/).fill(body);
    const file=path.join(contentDir,'elite-athletes.json'),data=JSON.parse(fs.readFileSync(file,'utf8')),person=data.athletes.find(row=>row.id===existing.id);assert.ok(person);person.seasonBest='2:05:54';person.personalBest='2:05:54';fs.writeFileSync(file,JSON.stringify(data));
    const conflict=p.waitForResponse(r=>r.url().endsWith('/admin/content/profiles/'+existing.id)&&r.status()===409);await p.getByRole('button',{name:'保存并发布',exact:true}).click();await conflict;
    await p.getByRole('alert').filter({hasText:/本地修改|修改已保留/}).first().waitFor();assert.equal(await p.getByLabel(/^人物正文/).inputValue(),body);
    await p.getByRole('button',{name:'查看最新版本',exact:true}).click();const continueButton=p.getByRole('button',{name:'保留我的修改，基于最新版本继续编辑',exact:true});await continueButton.waitFor();await continueButton.click();
    assert.equal(await p.getByLabel(/^人物正文/).inputValue(),body);
    const saved=p.waitForResponse(r=>r.url().endsWith('/admin/content/profiles/'+existing.id)&&r.request().method()==='PUT'&&r.status()===200);await p.getByRole('button',{name:'保存并发布',exact:true}).click();await saved;
    const shown=(await api('GET','/content/profiles/'+existing.id)).profile;assert.equal(shown.article.body,body);assert.equal(shown.seasonBest,'2:05:54');assert.equal(shown.personalBest,'2:05:54');
  });
  await check('Pacer administrator publishes one person with multiple race assignments and truthful service badges',async()=>{
    await section(p,'官兔管理');await p.getByRole('button',{name:'新建官兔',exact:true}).first().click();
    await p.getByLabel('姓名',{exact:true}).fill('验收官兔星河');await p.locator('.profile-form').getByLabel(/^性别/).selectOption('men');await p.getByRole('button',{name:'人物文章',exact:true}).click();
    await p.getByLabel('文章标题',{exact:true}).fill('星河：个人比赛与官方配速履历');await p.getByLabel(/^人物正文/).fill(article('星河','官兔按人发布的完整文章验收').body);
    await p.getByRole('button',{name:'配速履历',exact:true}).click();
    for(const [index,info]of [[1,{id:'acceptance-race-provisional',name:'验收春季半程马拉松',date:'2027-03-21',target:'1:30',distance:'21.0975',status:'provisional'}],[2,{id:'acceptance-race-completed',name:'验收秋季马拉松',date:'2026-10-18',target:'3:45:00',distance:'42.195',status:'completed'}]]){
      if(!(await p.getByLabel('赛事名称 '+index,{exact:true}).count()))await p.getByRole('button',{name:'添加配速赛事',exact:true}).click();
      await p.getByLabel('赛事名称 '+index,{exact:true}).fill(info.name);await p.getByLabel('比赛日期 '+index,{exact:true}).fill(info.date);await p.getByLabel(new RegExp('^比赛距离 '+index)).selectOption(info.distance);await p.getByLabel('目标完赛时间 '+index,{exact:true}).fill(info.target);await p.getByLabel(new RegExp('^履历状态 '+index)).selectOption(info.status);
      await p.locator('.profile-race-identity').nth(index-1).locator('summary').click();await p.getByLabel('赛事编号 '+index,{exact:true}).fill(info.id);await p.getByLabel('赛事年份 '+index,{exact:true}).fill(info.date.slice(0,4));
    }
    const created=p.waitForResponse(r=>r.url().endsWith('/admin/content/profiles')&&r.request().method()==='POST');await p.getByRole('button',{name:'发布档案',exact:true}).click();newPacer=(await (await created).json()).profile;await p.getByRole('status').filter({hasText:/发布/}).waitFor();
    const shown=(await api('GET','/content/profiles/'+newPacer.id)).profile;assert.equal(shown.assignments.length,2);assert.deepEqual(shown.verifiedPacerRaceNames,['验收秋季马拉松']);const half=shown.assignments.find(a=>a.raceId==='acceptance-race-provisional');assert.equal(Number(half.distanceKm),21.0975);assert.equal(half.pace,'4:16');assert.match(half.distanceLabel,/半程/);
    const list=await api('GET','/content/profiles?type=pacer&raceId=acceptance-race-provisional');assert.ok(list.profiles.some(row=>row.id===newPacer.id));assert.ok(list.meta.raceFilters.some(r=>r.id==='acceptance-race-completed'));
    await snapshot(p,'pacer-editor');
  });
  await check('Editing an existing H:MM pacer article preserves target time, pace and collected assignment evidence',async()=>{
    const collectedPacer=(await api('GET','/content/profiles?type=pacer&pageSize=1')).profiles[0];assert.ok(collectedPacer.assignments.length);const before=collectedPacer.assignments[0];assert.match(before.targetTime,/^\d+:\d\d(?::\d\d)?$/);
    await searchAndOpen(p,collectedPacer.name);await p.getByRole('button',{name:'人物文章',exact:true}).click();const changed=collectedPacer.article.body+'\n\n现有官兔个人文章的浏览器编辑验收。';await p.getByLabel(/^人物正文/).fill(changed);
    const saved=p.waitForResponse(r=>r.url().endsWith('/admin/content/profiles/'+collectedPacer.id)&&r.request().method()==='PUT');await p.getByRole('button',{name:'保存并发布',exact:true}).click();const response=await saved;assert.equal(response.status(),200);
    const shown=(await api('GET','/content/profiles/'+collectedPacer.id)).profile,after=shown.assignments.find(a=>a.raceId===before.raceId);assert.equal(shown.article.body,changed);assert.equal(after.targetTime,before.targetTime);assert.equal(after.pace,before.pace);assert.equal(after.sourceUrl,before.sourceUrl);
  });
  await operator.ctx.close();
  await check('Mobile editors and public readers retain complete articles without horizontal overflow or external source links',async()=>{
    for(const [width,type,name]of [[320,'运动员管理','验收运动员晓岚'],[390,'官兔管理','验收官兔星河']]){
      const editor=await context(width,true);await section(editor.p,type);await searchAndOpen(editor.p,name);if(type==='官兔管理')await editor.p.getByRole('button',{name:'配速履历',exact:true}).click();await snapshot(editor.p,type==='运动员管理'?'athlete-editor':'pacer-editor');await editor.ctx.close();
    }
    for(const [width,item,label]of [[390,browserAthlete,'athlete-reader'],[320,newPacer,'pacer-reader']]){
      const reader=await context(width);await reader.p.goto(base+'/news/profiles/'+item.id,{waitUntil:'networkidle'});await reader.p.locator('.profile-article .guide-md').waitFor();assert.ok((await reader.p.locator('.profile-article .guide-md').innerText()).length>100);assert.equal(await reader.p.locator('a[href^="http"]').count(),0);
      if(label==='pacer-reader'){assert.match(await reader.p.locator('.verified-races').innerText(),/验收秋季马拉松/);assert.doesNotMatch(await reader.p.locator('.verified-races').innerText(),/验收春季半程马拉松/);assert.match(await reader.p.locator('.pacer-assignment').filter({hasText:'验收春季半程马拉松'}).innerText(),/4:16/);}
      await snapshot(reader.p,label);await reader.ctx.close();
    }
  });
  report.fixture={collectedAthleteId:initial.id,createdAthletes:2,createdPacers:1,sourceSnapshots:'Temporary copies only'};assert.deepEqual(report.errors,[]);report.passed=true;
}
main().catch(error=>{report.passed=false;report.error=error.stack;console.error(error.stack);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));try{getDb().close();}catch{}fs.rmSync(temporary,{recursive:true,force:true});report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,views:report.views.length,errors:report.errors.length,report:path.relative(ROOT,path.join(OUT,'report.json'))}));
});
