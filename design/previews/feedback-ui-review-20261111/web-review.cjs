/* Focused UI review using synthetic local API replies. No business data writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { trainingOf, careerOf } = require('../../../server/src/runner-center');
const legal = require('../../../shared/legal-documents.json');
const out = __dirname;
const origin = process.env.MARATHON_PREVIEW_URL || 'http://127.0.0.1:5174/marathon';
const names = ['晨光跑团','奥森悦跑团','滨河跑团','追风跑团','城市夜跑团','周末长跑团','山海越野跑团','西湖马拉松训练营','一起向前跑步俱乐部','清晨轻松跑团'];
const clubs = names.map((name,index)=>({id:index+1,name,city:'北京',members:42+index,roleLabel:index<3?'团长':'成员',joined:true}));
const races = [{id:'review-1',name:'2026中国田径协会10公里精英赛（厦门·翔安）',city:'厦门',raceDate:'2026-11-14',kind:'road',meet:'offline',distanceLabels:['10公里'],regStatus:'报名时间未公布',deadlineLabel:'报名时间未公布'}, {id:'review-2',name:'2026重庆璧山马拉松',city:'重庆',raceDate:'2026-11-15',kind:'road',meet:'offline',distanceLabels:['马拉松','半程马拉松'],regStatus:'待开赛',deadlineLabel:'已截止'}];
const account = {user:{id:1,nickname:'Amy123',avatar:'',leader:true,hasPassword:true},clubs,plans:races.map((race,index)=>({status:['想跑','待抽签'][index],race})),results:[],career:{finished:0,provinces:[],cities:[],pb:{full:'',half:''},yearKm:0},reminders:[],conflicts:[]};
const training = trainingOf([], 'week',0,new Date('2026-11-11T12:00:00Z'));
const runner = {asOf:'2026-11-11',overview:{weekKm:0,weekCount:0,weekDurationSec:0,monthKm:0,totalKm:0,totalCount:0},training,career:careerOf([],'2026-11-11'),results:[],media:[],devices:[]};
const summary = {month:{id:'2026-11',km:0,count:0,days:0,paceLabel:'',target:0,canFlag:true,observe:true},runs:[],year:{km:0},total:{km:0,count:0}};
const report = {kind:'Home search/filter, exercise and personal profile UI checks with synthetic local replies; no business data writes',scenes:[],interactions:[],errors:[],unexpected:[]};
async function metrics(page, selector) {
  return page.locator(selector).evaluate(button=>{
    const rect=button.getBoundingClientRect(),input=button.parentElement.querySelector('input'),fill=button.querySelector('span'),ir=input?.getBoundingClientRect(),fr=fill?.getBoundingClientRect();
    return {buttonWidth:rect.width,hitHeight:rect.height,fillHeight:fr?.height,inputWidth:ir?.width};
  });
}
async function searchCheck(page,selector,input,keyword,requests,prefix) {
  const geometry=await metrics(page,selector);
  assert.ok(geometry.buttonWidth<=57&&geometry.hitHeight>=44&&geometry.fillHeight===34&&geometry.inputWidth>90,JSON.stringify(geometry));
  await page.locator(input).fill(keyword);await page.locator(selector).click();await page.waitForLoadState('networkidle');
  assert.ok(requests.some(url=>url.startsWith(prefix)&&new URL(url,'https://local.invalid').searchParams.get('q')===keyword));
  report.interactions.push({name:prefix+' search',keyword,...geometry,passed:true});
}
(async()=>{
  const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  try {
    for(const width of [320,390]) {
      const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
      await context.addInitScript(()=>{localStorage.clear();localStorage.setItem('marathon_token','review-fixture');localStorage.setItem('marathon_name','Amy123');});
      const page=await context.newPage(),requests=[];page.on('pageerror',error=>report.errors.push(error.message));
      await page.route('**/marathon/api/**',route=>{
        const url=new URL(route.request().url()),key=url.pathname.replace('/marathon/api','');requests.push(key+url.search);
        let body;
        if(key==='/races')body={races,total:races.length,page:1,pages:1};
        else if(key==='/reminders')body={reminders:[]};
        else if(key==='/me')body=account;
        else if(key==='/me/runner')body=runner;
        else if(key==='/me/feedback/summary')body={unread:0};
        else if(key==='/meta')body={company:'北京华创科技有限公司',icp:'京ICP备2026060284号-2'};
        else if(key==='/legal')body=legal;
        else if(key==='/clubs/directory')body={clubs:clubs.slice(2,8),page:1,pages:1};
        else if(key==='/clubs/invite/RUN123')body={club:clubs[0]};
        else if(key==='/runs')body=summary;
        else if(key==='/content/articles')body={articles:[{id:1,title:'跑圈资讯版面验证',summary:'本条为界面审查使用的合成数据。',source:'界面审查',publishedAt:'2026-11-11'}],total:1,page:1,pages:1};
        else { report.unexpected.push(key);body={}; }
        return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
      });
      for(const [name,route,ready] of [['races','/','.home-search'],['sport','/sport','.mileage-hero'],['mine','/mine','.main-tabs']]){
        await page.goto(origin+route);await page.locator(ready).waitFor();await page.waitForLoadState('networkidle');
        if(name==='mine')await page.getByRole('button',{name:'个人资料',exact:true}).click();
        const geometry=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,brokenImages:[...document.images].filter(img=>img.getBoundingClientRect().width&&!img.naturalWidth).map(img=>img.src)}));
        assert.ok(geometry.scrollWidth<=width&&!geometry.brokenImages.length,JSON.stringify(geometry));
        if(width===390){await page.screenshot({path:path.join(out,'web-'+name+'-390.png'),fullPage:true});await page.screenshot({path:path.join(out,'web-'+name+'-390-viewport.png')});}
        if(name==='races'){
          assert.equal(await page.locator('.home-top .race-meet-categories').count(),0);assert.equal(await page.locator('.home-results [aria-label="赛事类型"]').count(),1);
          await searchCheck(page,'.home-search button','.home-search input','杭州',requests,'/races');
        }
        if(name==='sport'){
          const hero=await page.locator('.mileage-hero').boundingBox(),record=await page.locator('.record-actions').boundingBox();assert.ok(hero.height<340&&record.y+record.height<520);
          await page.getByRole('button',{name:'设置目标 ›',exact:true}).click();await page.getByRole('button',{name:'保存目标',exact:true}).waitFor();await page.getByRole('button',{name:'＋ 记录跑步',exact:true}).click();await page.getByRole('button',{name:'保存记录',exact:true}).waitFor();report.interactions.push({name:'sport first screen and editors',width,heroHeight:hero.height,recordBottom:record.y+record.height,passed:true});
        }
        if(name==='mine'){
          const grid=await page.locator('.profile-clubs-section').evaluate(section=>{const cards=[...section.querySelectorAll('.profile-row')];return{count:cards.length,columns:[...new Set(cards.map(card=>Math.round(card.getBoundingClientRect().x)))].length,minWidth:Math.min(...cards.map(card=>card.getBoundingClientRect().width)),overflow:cards.filter(card=>card.scrollWidth>card.clientWidth+1).length};});
          assert.equal(grid.count,10);assert.equal(grid.columns,2);assert.equal(grid.overflow,0);
          if(width===390)await page.locator('.profile-clubs-section').screenshot({path:path.join(out,'web-mine-clubs-10-390.png'),style:'.dock{visibility:hidden!important}'});
          await page.getByRole('button',{name:/^修改头像与昵称/}).click();await page.locator('.profile-form input[autocomplete="nickname"]').waitFor();await page.getByRole('button',{name:/^修改密码/}).click();await page.getByRole('button',{name:'保存密码',exact:true}).waitFor();report.interactions.push({name:'profile editors and ten club cards',width,...grid,passed:true});
        }
        report.scenes.push({name,width,...geometry,passed:true});
      }
      await context.close();
    }
    assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpected,[]);report.passed=true;
  } finally { await browser.close();fs.writeFileSync(path.join(out,'web-report.json'),JSON.stringify(report,null,2)); }
  console.log(JSON.stringify({passed:report.passed,scenes:report.scenes.length,interactions:report.interactions.length}));
})().catch(error=>{console.error(error);process.exitCode=1});
