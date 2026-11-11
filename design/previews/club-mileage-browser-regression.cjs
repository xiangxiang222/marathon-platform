// Real Vue pages, strict in-memory API routes. Never forwards business API traffic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright-core');
const fixture=require('./club-mileage-test-fixture.cjs');
const legal=require('../../shared/legal-documents.json');
const base=(process.env.MARATHON_PREVIEW_URL||'http://127.0.0.1:5174/marathon').replace(/\/$/,'');
const out=path.resolve(fixture.ROOT,process.env.MILEAGE_AUDIT_OUT||'design/previews/club-mileage-20261111');fs.mkdirSync(out,{recursive:true});
const report={kind:'Real Vue mileage/group/profile/activity flows with isolated memory transport and fixed Beijing clock; no business writes',checks:[],errors:[],unexpected:[]};
let vite,browser;
async function ready(){try{return(await fetch(base+'/')).ok;}catch{return false;}}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function check(width,name,work){await work();report.checks.push({width,name,passed:true});}
async function screenshot(page,name,width){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,`web-${name}-${width}.png`),fullPage:true});}
async function noOverflow(page){const size=await page.evaluate(()=>({document:document.documentElement.scrollWidth,width:innerWidth}));assert.ok(size.document<=size.width+1,JSON.stringify(size));const broken=await page.evaluate(()=>[...document.images].filter(img=>img.getAttribute('src')&&img.getBoundingClientRect().width&&!img.naturalWidth).length);assert.equal(broken,0);}
async function setup(width){
  const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/New_York'});
  await context.addInitScript(({now})=>{Date.now=()=>now;localStorage.setItem('marathon_token','mileage-fixture-account-a');},{now:fixture.now});
  const page=await context.newPage(),state={members:fixture.copy(fixture.members),groups:fixture.copy(fixture.groups),staff:true,requests:[],templates:[],published:[],hold:null,boardError:false,profileError:false};
  page.on('pageerror',error=>report.errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(!url.pathname.startsWith('/marathon/api/'))return url.origin===new URL(base).origin?route.continue():route.abort();
    const endpoint=url.pathname.replace('/marathon/api',''),method=route.request().method(),query=Object.fromEntries(url.searchParams),body=route.request().postDataJSON();
    state.requests.push({endpoint,method,query,body});
    const send=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(endpoint==='/legal')return send(legal);
    if(endpoint==='/me')return send({user:{id:1,nickname:state.members[0].nickname},clubs:[{id:44,name:'晨光跑团',roleLabel:'团长'},{id:45,name:'河岸跑团',roleLabel:'成员'}]});
    if(endpoint==='/me/feedback/summary')return send({total:0,unread:0});
    if(endpoint==='/me/introduction'&&method==='PUT'){state.members[0].introduction=body.introduction;return send({introduction:body.introduction});}
    const match=/^\/clubs\/(44|45)(.*)$/.exec(endpoint);
    if(match){const clubId=Number(match[1]),suffix=match[2];
      if(!suffix)return send(fixture.clubFixture(clubId,state));
      if(suffix==='/mileage/board'){
        if(state.missingGroup && query.groupId==='701')return send({error:'没有这个训练组'},404);const data=fixture.boardFixture(query,state);if(state.hold&&state.hold(query)){const done=fixture.deferred();state.release=()=>done.resolve();state.held={query,data};await done.promise;}
        return state.boardError?send({error:'暂时无法读取跑量，请重试'},503):send(data);
      }
      if(/^\/members\/\d+\/profile$/.test(suffix)){const person=Number(suffix.split('/')[2]);const data=fixture.profileFixture(person,query,state);return state.profileError?send({error:'成员已不在跑团'},404):data?send(data):send({error:'团里没有这个人'},404);}
      if(suffix==='/training-groups'&&method==='GET')return send({groups:state.groups,members:state.members,staff:state.staff});
      if(suffix==='/training-groups'&&method==='POST'){const group={...body,id:704,clubGroupId:1704,memberCount:0};state.groups.push(group);return send({group});}
      if(/^\/training-groups\/members\/\d+$/.test(suffix)&&method==='PUT'){const person=state.members.find(row=>row.id===Number(suffix.split('/').at(-1)));person.groupId=Number(body.groupId);person.groupName=state.groups.find(group=>group.id===person.groupId)?.name||'未分组';return send({ok:true});}
      if(/^\/training-groups\/\d+$/.test(suffix)){const id=Number(suffix.split('/').at(-1)),group=state.groups.find(row=>row.id===id);if(method==='PUT'){Object.assign(group,body);return send({group});}if(method==='DELETE'){state.groups=state.groups.filter(row=>row.id!==id);for(const person of state.members)if(person.groupId===id)person.groupId=0;return send({ok:true});}}
      if(suffix==='/activity-templates'&&method==='GET')return send({templates:state.templates});
      if(suffix==='/activity-templates'&&method==='POST'){const template={id:801,...body,version:1};state.templates.push(template);return send({template});}
      if(suffix==='/activities'&&method==='POST'){state.published.push(body);return send({activity:{...body,id:900}});}
      if(suffix==='/activities/900')return send({club:fixture.clubFixture(clubId,state).club,activity:{...state.published.at(-1),id:900,clubId,status:'open',statusLabel:'报名中',canEdit:true,mine:{signed:false},action:{enabled:true,label:'报名活动'}},groups:state.published.at(-1)?.groups||[],signups:[],staff:true,owner:true});
      if(suffix.startsWith('/activities/900/'))return send({rows:[],photos:[],groups:[],signups:[]});
      if(suffix==='/fees')return send({current:null,history:[]});
      if(suffix==='/calls')return send({calls:[]});if(suffix==='/meetups')return send({meetups:[],tiers:[]});if(suffix==='/internals')return send({races:[]});if(suffix==='/posts')return send({posts:[]});if(suffix==='/albums')return send({albums:[]});if(suffix==='/attendance')return send({rows:[],me:{count:0,placeLabel:'未上榜'}});
      if(suffix==='/mileage')return send({rank:[],groups:[],feed:[],members:state.members.length,totalKm:99999,totalCount:9999,staff:state.staff,owner:state.staff});
      if(suffix==='/mileage/report')return send({title:'本月',rows:[],total:{km:0,durationLabel:'00:00:00'}});
    }
    report.unexpected.push({endpoint,method});return send({error:'Unmocked fixture endpoint'},500);
  });
  return{context,page,state};
}
async function run(){
  if(!await ready()){assert.ok(!process.env.MARATHON_PREVIEW_URL,'Configured preview must run');vite=spawn(process.execPath,[path.join(fixture.ROOT,'web/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',new URL(base).port,'--strictPort'],{cwd:path.join(fixture.ROOT,'web'),stdio:'ignore'});for(let i=0;i<50&&!await ready();i++)await pause(100);assert.ok(await ready());}
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
  for(const width of [320,390,1440]){
    const{context,page,state}=await setup(width);
    await page.goto(base+'/clubs/44?tab=km');await page.locator('.volume-number').waitFor();
    await check(width,'five ranges use current-period summary, never legacy cumulative total; Beijing default survives New York timezone',async()=>{
      const nav=page.getByRole('navigation',{name:'跑量时间范围'});
      assert.equal(await page.getByLabel('选择跑量统计日期').inputValue(),'2027-01-01');
      for(const [label,value,range]of [['日','60','day'],['周','240','week'],['月','720','month'],['年','4,800','year'],['累计','12,000','all']]){await nav.getByRole('button',{name:label,exact:true}).click();await page.waitForFunction(text=>document.querySelector('.volume-number')?.textContent.includes(text),value);assert.match(await page.locator('.volume-number').innerText(),new RegExp(value));assert.equal(state.requests.filter(row=>row.endpoint.endsWith('/mileage/board')).at(-1).query.range,range);}
      await nav.getByRole('button',{name:'月',exact:true}).click();await page.getByLabel('选择跑量统计日期').fill('2026-11-11');await page.getByLabel('选择跑量统计日期').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('.period-control label span')?.textContent==='2026-11');await noOverflow(page);await screenshot(page,'mileage',width);
    });
    await check(width,'all/current/unassigned/empty training groups filter exact IDs and expose zero runners; member search composes',async()=>{
      const nav=page.getByRole('navigation',{name:'按常设训练组筛选'});assert.equal(await nav.getByRole('button',{name:'未分组',exact:true}).count(),1);
      await nav.getByRole('button',{name:'晨光轻松组',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.rank-row').length===3);assert.equal(state.requests.filter(row=>row.endpoint.endsWith('/mileage/board')).at(-1).query.groupId,'701');
      await page.getByLabel('搜索跑量排行榜成员').fill(' 河畔 ');assert.equal(await page.locator('.rank-row').count(),1);await page.getByRole('button',{name:'清空搜索'}).click();
      await nav.getByRole('button',{name:'未分组',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.rank-row').length===1);assert.match(await page.locator('.rank-row').innerText(),/长昵称/);
      await nav.getByRole('button',{name:'周末长距离训练组',exact:true}).click();await page.getByText('这里还没有成员。',{exact:true}).waitFor();assert.equal(await page.locator('.rank-row').count(),0);
      await nav.getByRole('button',{name:'全员',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.rank-row').length===6);assert.equal(await page.locator('.group-overview .group-card').count(),3);assert.equal(state.requests.filter(row=>row.endpoint.endsWith('/mileage/board')).at(-1).query.groupId,undefined);await noOverflow(page);
    });
    await check(width,'deleted selected permanent group falls back once to all members',async()=>{
      state.missingGroup=true;const before=state.requests.length;await page.getByRole('navigation',{name:'按常设训练组筛选'}).getByRole('button',{name:'晨光轻松组',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.rank-row').length===6&&document.querySelector('.group-tabs button[aria-pressed="true"]')?.textContent==='全员');state.missingGroup=false;const loads=state.requests.slice(before).filter(row=>row.endpoint.endsWith('/mileage/board'));assert.equal(loads.length,2);assert.equal(loads[0].query.groupId,'701');assert.equal(loads[1].query.groupId,undefined);
    });
    await check(width,'stale period response cannot overwrite latest period',async()=>{
      state.hold=q=>q.range==='day';await page.getByRole('navigation',{name:'跑量时间范围'}).getByRole('button',{name:'日',exact:true}).click();for(let i=0;i<40&&!state.release;i++)await pause(10);assert.equal(typeof state.release,'function');await page.getByRole('navigation',{name:'跑量时间范围'}).getByRole('button',{name:'周',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.volume-number')?.textContent.includes('240'));state.hold=null;state.release();await page.waitForLoadState('networkidle');assert.match(await page.locator('.volume-number').innerText(),/240/);delete state.release;
    });
    await check(width,'ranking opens scoped member profile with current date/range; other member has no self-edit or private runner tools',async()=>{
      await page.locator('.rank-row').filter({hasText:'河畔领跑员'}).click();await page.getByRole('heading',{name:'河畔领跑员',exact:true}).waitFor();assert.match(page.url(),/\/clubs\/44\/members\/2\?range=week&date=2026-11-11/);assert.equal(await page.getByRole('button',{name:/编辑介绍|写下介绍/}).count(),0);assert.match(await page.locator('.personal-volume').innerText(),/本期跑量/);assert.equal(await page.locator('.member-run').count(),2);assert.equal(state.requests.filter(row=>row.endpoint==='/me/runner').length,0);await noOverflow(page);await screenshot(page,'member',width);
      await page.getByRole('navigation',{name:'成员跑量时间范围'}).getByRole('button',{name:'累计',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.personal-volume')?.textContent.includes('累计跑量'));await page.getByRole('link',{name:'返回跑量看板'}).click();await page.locator('.volume-number').waitFor();assert.equal(await page.getByRole('navigation',{name:'跑量时间范围'}).getByRole('button',{name:'累计',exact:true}).getAttribute('aria-pressed'),'true');
    });
    await check(width,'own introduction can be edited; long nickname profile stays readable',async()=>{
      await page.goto(base+'/clubs/44/members/1?range=month&date=2026-11-11');await page.getByRole('button',{name:/编辑介绍|写下介绍/}).click();await page.getByLabel('跑者介绍',{exact:true}).fill('喜欢清晨出发，每周和团友一起稳稳向前。');await page.getByRole('button',{name:'保存介绍',exact:true}).click();await page.getByText('喜欢清晨出发，每周和团友一起稳稳向前。',{exact:true}).waitFor();assert.equal(state.requests.filter(row=>row.endpoint==='/me/introduction').at(-1).body.introduction,'喜欢清晨出发，每周和团友一起稳稳向前。');
      await page.goto(base+'/clubs/44/members/6?range=day&date=2027-01-01');await page.getByRole('heading',{name:fixture.members[5].nickname,exact:true}).waitFor();await noOverflow(page);await screenshot(page,'member-long',width);
    });
    await check(width,'member/profile error and mileage retry stay usable',async()=>{
      state.profileError=true;await page.goto(base+'/clubs/44/members/2');await page.getByRole('heading',{name:'暂时无法查看'}).waitFor();state.profileError=false;await page.getByRole('button',{name:'重新加载',exact:true}).click();await page.getByRole('heading',{name:'河畔领跑员',exact:true}).waitFor();
      state.boardError=true;await page.goto(base+'/clubs/44?tab=km');await page.getByRole('alert').filter({hasText:'暂时无法读取跑量'}).waitFor();state.boardError=false;await page.getByRole('button',{name:'重新加载',exact:true}).click();await page.locator('.volume-number').waitFor();
    });
    await check(width,'training group create/edit/member assignment/delete is linked to board and responsive sheet',async()=>{
      await page.getByRole('button',{name:/训练组管理/}).click();await page.getByRole('dialog',{name:'常设训练组'}).waitFor();await screenshot(page,'groups',width);await page.getByRole('button',{name:'+ 新建训练组',exact:true}).click();const form=page.locator('.group-form');await form.getByLabel('组名',{exact:true}).fill('周四间歇组');await form.getByLabel('常用配速',{exact:true}).fill('5′30″ /km');await form.getByLabel('训练组介绍',{exact:true}).fill('每周四，操场见。');await form.getByRole('button',{name:'保存训练组',exact:true}).click();await page.locator('.managed-group').filter({hasText:'周四间歇组'}).waitFor();
      await page.getByLabel('河畔领跑员的训练组',{exact:true}).selectOption('704');await page.waitForFunction(()=>document.querySelector('select[aria-label="河畔领跑员的训练组"]')?.value==='704');assert.equal(state.requests.filter(row=>row.endpoint.endsWith('/training-groups/members/2')).at(-1).body.groupId,704);
      await page.locator('.managed-group').filter({hasText:'周四间歇组'}).getByRole('button',{name:'编辑',exact:true}).click();await form.getByLabel('组名',{exact:true}).fill('周四间歇进阶组');await form.getByRole('button',{name:'保存训练组',exact:true}).click();await page.locator('.managed-group').filter({hasText:'周四间歇进阶组'}).getByRole('button',{name:'删除',exact:true}).click();await page.waitForFunction(()=>!document.body.innerText.includes('周四间歇进阶组'));assert.equal(state.members[1].groupId,0);await noOverflow(page);await page.getByRole('button',{name:'关闭训练组管理'}).click();
    });
    await check(width,'activity explicitly selects permanent training groups, permits per-event edits and serializes stable association',async()=>{
      state.groups=[...fixture.copy(fixture.groups),...Array.from({length:27},(_,i)=>({id:710+i,name:'训练伙伴 '+(i+4)+' 组',pace:'6:00 /km',description:'一起保持训练',capacity:0,sort:i+3,memberCount:0}))];await page.goto(base+'/clubs/44/activities/new');await page.getByRole('heading',{name:'发布训练',exact:true}).waitFor();await page.getByLabel(/训练标题/).fill('周末长距离 · 一起向前');await page.locator('input[type="datetime-local"]').first().fill('2027-01-03T07:00');await page.getByLabel(/训练地点/).fill('西湖绿道');await page.getByLabel(/集合点/).fill('公园南门');await page.locator('.actions .primary').click();await page.locator('.permanent-group-list button').first().waitFor();assert.equal(await page.locator('.group-editor').count(),1);assert.equal(await page.locator('.group-editor').getByLabel(/组名/).inputValue(),'全员组');assert.equal(await page.locator('.permanent-group-list button').count(),30);
      await page.locator('.permanent-group-list button').filter({hasText:'晨光轻松组'}).click();await page.locator('.permanent-group-list button').filter({hasText:'稳步进阶组'}).click();assert.equal(await page.locator('.group-editor').count(),2);if(width===390){for(let index=2;index<12;index++)await page.locator('.permanent-group-list button').nth(index).click();assert.equal(await page.locator('.group-editor').count(),12);await page.locator('.permanent-group-list button').nth(12).click();assert.equal(await page.locator('.group-editor').count(),12);for(let index=2;index<12;index++)await page.locator('.permanent-group-list button').nth(index).click();assert.equal(await page.locator('.group-editor').count(),2);}await page.locator('.group-editor').first().getByLabel(/配速或目标/).fill('6′15″ /km');await noOverflow(page);await screenshot(page,'activity-groups',width);await page.locator('.actions .primary').click();await page.getByRole('button',{name:'确认发布训练',exact:true}).click();await page.waitForURL(/\/activities\/900$/);assert.deepEqual(state.published.at(-1).groups.map(row=>row.trainingGroupId),[701,702]);assert.equal(state.published.at(-1).groups[0].pace,'6′15″ /km');assert.equal(state.groups.find(row=>row.id===701).pace,fixture.groups[0].pace);
    });
    await context.close();
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);report.passed=true;
}
run().catch(error=>{report.passed=false;report.error=error.stack||String(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(vite)vite.kill('SIGTERM');fs.writeFileSync(path.join(out,'web-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));});
