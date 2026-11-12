/* Current Page logic with synthetic data. Source mirrors are not WeChat device tests. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const sport=require('./sport-visual-v3-mini-fixture.cjs'),mine=require('./mine-visual-v3-fixture.cjs'),reading=require('../../scripts/reading-pages-mini-fixture.cjs'),poster=require('./achievement-poster-mini-fixture.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
function harness(name,exports){const file=path.join(__dirname,name),source=fs.readFileSync(file,'utf8').split('async function main()')[0],module={exports:{}};vm.runInNewContext(source+'\nmodule.exports={'+exports+'};',{module,exports:module.exports,require:createRequire(file),__dirname,console,setTimeout,clearTimeout,setImmediate,Buffer,URL,Date,process},{filename:file});return module.exports;}
const runner=harness('runner-mini-regression.cjs','fixture,base,tick'),history=harness('race-history-mini-regression.cjs','fixture,tick');
const runnerCases=['stats','career','footprints','honors','media','devices','guest','empty','error'].map(scenario=>({route:'pages/runner/runner',scenario}));
const historyCases=['base','memory','detail','import','guest','empty'].map(scenario=>({route:'pages/history/history',scenario}));
const otherCases=reading.cases.filter(c=>['pages/feedback/feedback','pages/legal/legal','pages/privacy/privacy'].includes(c.route));
module.exports={cases:[...sport.cases,...mine.cases,{route:'pages/mine/mine',scenario:'help'},...runnerCases,...historyCases,...poster.cases,...otherCases],async prepare(route,data,scenario){let result;
if(route==='pages/sport/sport')result=await sport.prepare(route,data,scenario);
else if(route==='pages/mine/mine'){result=await mine.prepare(route,data,scenario==='help'?'base':scenario);if(scenario==='help')result.data.helpOpen=true;}
else if(route==='pages/achievement-poster/achievement-poster')result=await poster.prepare(route,data,scenario);
else if(route==='pages/runner/runner'){
 const f=runner.fixture();
 if(scenario==='guest')f.app.globalData.token='';
 if(scenario==='error')f.setReply(()=>Promise.reject(Error('档案暂时无法加载，请重试。')));
 if(scenario==='empty')f.setReply(()=>Promise.resolve({...copy(runner.base),overview:{},training:{bars:[],runs:[]},career:{pb:[],cities:[],provinces:[],byDistance:[],trends:[],years:[]},results:[],media:[]}));
 f.page.onLoad({view:runnerCases.some(c=>c.scenario===scenario)&&!['guest','empty','error'].includes(scenario)?scenario:'stats'});await f.page.onShow();await runner.tick();
 result={data:f.page.data,components:{},css:''};
}else if(route==='pages/history/history'){
 const f=history.fixture();if(scenario==='guest')f.app.globalData.token='';if(scenario==='empty')f.setReply(()=>Promise.resolve({summary:{},entries:[]}));await f.page.onShow();await history.tick();
 if(scenario==='memory')f.page.setData({mode:'memory'});
 if(scenario==='detail')await f.page.openEntry({currentTarget:{dataset:{id:f.page.data.entries[0].id}}});
 if(scenario==='import')f.page.openImport();
 result={data:f.page.data,components:{},css:''};
}else result=await reading.prepare(route,data,scenario);
// Private media remains synthetic and local in the browser mirror.
const picture='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cX1kAAAAASUVORK5CYII=';
function localPictures(value){if(Array.isArray(value))return value.map(localPictures);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,['src','proofSrc'].includes(key)&&typeof item==='string'&&item.startsWith('https://runner.example')?picture:localPictures(item)]));return value;}
result.data=localPictures(result.data);
// Approximate the native default width so small actions must override it explicitly.
result.css='button{width:calc(100% - 32px)}\n'+(result.css||'');return result;
},async audit({page,route,scenario}){const errors=[];
if(route==='pages/mine/mine'&&scenario==='base'){
 const rows=await page.locator('.runner-entry').evaluateAll(es=>es.map(e=>({height:e.getBoundingClientRect().height,direction:getComputedStyle(e).flexDirection})));
 if(rows.some(row=>row.height>90||row.direction!=='row'))errors.push('Archive links must remain compact vertical rows');
 const settings=page.locator('.header-settings');if(await settings.count()){const bounds=await settings.boundingBox();const size=await settings.evaluate(e=>({height:e.clientHeight,lineHeight:parseFloat(getComputedStyle(e).lineHeight),whiteSpace:getComputedStyle(e).whiteSpace}));if(bounds.height<44||bounds.width<44||size.whiteSpace!=='nowrap')errors.push('Settings must remain a single line with 44px hit target');}
 if(await page.locator('.profile-art,.poster-art').count())errors.push('Personal UI must not render ornamental bitmap art');
}
if(route==='pages/sport/sport'&&scenario==='base'){
 if(await page.locator('.runner-strip').count())errors.push('Monthly summary must prioritize training data without an illustration rail');
 const sizes=await page.locator('.record-actions button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));if(sizes.some(h=>h<44))errors.push('Primary recording actions need 44px targets');
}return errors;}};
