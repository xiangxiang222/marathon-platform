// Independent review: actual Mini Page VM + actual Vue/Canvas with GET-only memory fixtures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),{spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..'),{chromium}=require(path.join(ROOT,'node_modules/playwright-core'));
const report={kind:'Independent account/PNG lifecycle and album recovery checks; synthetic GET-only transport; not a WeChat device test',checks:[],networkWrites:[],pageErrors:[],passed:false};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function check(name,fn){await fn();report.checks.push({name,passed:true});}
let vite,browser;
(async()=>{try{
  const file=path.join(ROOT,'design/previews/achievement-poster-mini-regression.cjs');
  let source=fs.readFileSync(file,'utf8').split('async function check(')[0];
  source=source.replace('return { page, app, calls, state, load, cleanup:','return { wx, page, app, calls, state, load, cleanup:');
  const {fixture,wait,tick,payload}=Function('require','__dirname',source+'\nreturn {fixture,wait,tick,payload};')(createRequire(file),path.dirname(file));
  await check('Mini account change while native PNG callback is pending removes old file and regenerates only new account',async()=>{
    const f=fixture();try{await f.load();const held=wait();f.state.exportWait=held;const pending=f.page.generate();await tick();const first=f.calls.exported.length;
      f.app.globalData.token='isolated-second-account';f.state.reply=route=>Promise.resolve(route==='/me'?{user:{id:2,nickname:'第二个合成账号'}}:payload(5));await f.page.onShow();assert.equal(f.page.data.posterPath,'');
      held.resolve();f.state.exportWait=null;await pending;assert.ok(f.calls.removed.includes(f.calls.exported[first].tempFilePath));await f.page.generate();assert.equal(f.page._nickname,'第二个合成账号');assert.equal(f.page.data.posterPath,f.calls.exported.at(-1).tempFilePath);
    }finally{f.cleanup();}
  });
  await check('Mini album settings hide/show invalidates old PNG; restored permission permits explicit regenerated save',async()=>{
    const f=fixture();try{await f.load();f.state.auth=false;await f.page.savePoster();assert.equal(f.page.data.needsSetting,true);
      f.wx.openSetting=options=>{f.page.onHide();f.state.auth=true;options.success({authSetting:{'scope.writePhotosAlbum':true}});};f.page.openAlbumSettings();assert.equal(f.page.data.posterPath,'');await f.page.onShow();await f.page.generate();await f.page.savePoster();assert.equal(f.calls.saved.length,1);assert.equal(f.page.data.saved,true);
    }finally{f.cleanup();}
  });
  vite=spawn(process.execPath,[path.join(ROOT,'web/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5197','--strictPort'],{cwd:path.join(ROOT,'web'),stdio:'ignore'});
  const base='http://127.0.0.1:5197';let available=false;for(let i=0;i<80;i++){try{available=(await fetch(base+'/marathon/')).ok;}catch{}if(available)break;await pause(100);}assert.ok(available,'isolated local Vite must start');
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const context=await browser.newContext({viewport:{width:390,height:900},acceptDownloads:true});
  await context.addInitScript(()=>{
    localStorage.setItem('marathon_token','isolated-a');window.heldPng=[];window.holdFor='';window.blobOwners=new WeakMap();window.objectUrls=[];
    const toBlob=HTMLCanvasElement.prototype.toBlob,create=URL.createObjectURL;
    HTMLCanvasElement.prototype.toBlob=function(callback,...args){const owner=localStorage.getItem('marathon_token'),hold=owner===window.holdFor;return toBlob.call(this,blob=>{window.blobOwners.set(blob,owner);if(hold)window.heldPng.push(()=>callback(blob));else callback(blob);},...args);};
    URL.createObjectURL=function(blob){const result=create.call(this,blob);window.objectUrls.push({url:result,owner:window.blobOwners.get(blob)||''});return result;};
  });
  const page=await context.newPage(),downloads=[];page.on('download',value=>downloads.push(value.suggestedFilename()));page.on('pageerror',error=>report.pageErrors.push(error.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(!url.pathname.startsWith('/marathon/api/'))return url.origin===base?route.continue():route.abort();
    const endpoint=url.pathname.slice('/marathon/api'.length),actor=request.headers().authorization||'';
    if(request.method()!=='GET'){report.networkWrites.push(endpoint);return route.abort();}
    const send=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    if(endpoint==='/me')return send({user:{id:actor.endsWith('-a')?1:actor.endsWith('-b')?2:3,nickname:actor.endsWith('-a')?'甲合成账号':actor.endsWith('-b')?'乙合成账号':'丙合成账号'},clubs:[]});
    if(endpoint==='/me/runner')return send(payload(44));
    if(endpoint==='/legal')return send(require(path.join(ROOT,'shared/legal-documents.json')));
    return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'Unknown synthetic fixture endpoint'})});
  });
  const ready=async()=>{await page.locator('.poster-image').waitFor();await page.waitForFunction(()=>document.querySelector('.poster-stage')?.getAttribute('aria-busy')==='false');};
  await page.goto(base+'/marathon/achievement-poster');await ready();
  await check('Web pending old-account toBlob never installs or creates a new old-account object URL',async()=>{
    await page.evaluate(()=>window.holdFor='isolated-a');await page.locator('.theme-options button').nth(1).click();await page.waitForFunction(()=>window.heldPng.length>0);
    await page.evaluate(()=>{localStorage.setItem('marathon_token','isolated-b');dispatchEvent(new Event('focus'));});await ready();
    const current=await page.locator('.poster-image').getAttribute('src'),start=await page.evaluate(()=>window.objectUrls.length);
    await page.evaluate(()=>{window.holdFor='';const held=window.heldPng.splice(0);held.forEach(resolve=>resolve());});await pause(150);
    assert.equal(await page.locator('.poster-image').getAttribute('src'),current);assert.ok((await page.evaluate(start=>window.objectUrls.slice(start),start)).every(item=>item.owner!=='isolated-a'));
    assert.ok((await page.locator('.caption-card').innerText()).includes('乙合成账号'));
  });
  await check('Web all 44 rows remain selected and paginated as 20+20+4',async()=>{
    await page.locator('.poster-modes button').nth(1).click();await ready();assert.equal(await page.locator('.selection-row input:checked').count(),44);assert.match(await page.locator('.pagination-note').innerText(),/44.*3/);
    await page.locator('.poster-pagination button').last().click();await ready();await page.locator('.poster-pagination button').last().click();await ready();assert.match(await page.locator('.poster-pagination').innerText(),/本张 4 条/);
  });
  await check('Web account switch during batch toBlob stops every not-yet-issued download',async()=>{
    await page.evaluate(()=>window.holdFor='isolated-b');await page.locator('.save-all-action').click();await page.waitForFunction(()=>window.heldPng.length>0);
    const before=downloads.length;await page.evaluate(()=>{localStorage.setItem('marathon_token','isolated-c');dispatchEvent(new Event('focus'));});await ready();
    await page.evaluate(()=>{window.holdFor='';const held=window.heldPng.splice(0);held.forEach(resolve=>resolve());});await pause(200);assert.equal(downloads.length,before);assert.ok((await page.locator('.caption-card').innerText()).includes('丙合成账号'));
  });
  assert.deepEqual(report.networkWrites,[]);assert.deepEqual(report.pageErrors,[]);report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;}finally{if(browser)await browser.close();if(vite)vite.kill();report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(__dirname,'session-isolation-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}})();
