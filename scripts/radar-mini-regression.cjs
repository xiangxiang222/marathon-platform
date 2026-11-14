const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pageFile = path.resolve(__dirname, '../miniprogram/pages/radar/radar.js');
const copy = value => JSON.parse(JSON.stringify(value));
const base = { profile: { gender: '男', targets: {full:'2:20:00'} }, note:'参考', opportunities:[
  { id:'demo:full-men',race:{id:'demo',name:'模拟比赛',raceDate:'2027-03-14',city:'模拟市'},distance:'full',gender:'男',timing:'gun',demo:true,awardDepth:8,level:'challenge',history:{sampleCount:2,clock:'2:25:00'},gap:300,ability:{label:'目标成绩情景',clock:'2:20:00'},histories:[{year:2026,timing:'gun',source:'模拟2026',rows:[{place:1,name:'模拟甲',clock:'2:11:00'}]},{year:2025,timing:'net',source:'模拟2025',rows:[{place:1,name:'模拟乙',clock:'2:12:00'}]}],competition:{knownCount:1,fasterCount:1,entrants:[{key:'a',name:'模拟跑者',clock:'2:10:00',evidence:'self_reported'}]},myEntry:null },
  {id:'missing:half-women',race:{id:'missing'},distance:'half',gender:'女',level:'unknown',demo:true,timing:'gun',history:{sampleCount:0},histories:[],competition:{knownCount:0,fasterCount:null,entrants:[]},gap:null}
] };
function fixture() {
  let definition, signedIn = true, reply = async () => copy(base);
  const calls=[];
  vm.runInNewContext(fs.readFileSync(pageFile,'utf8'),{Page(value){definition=value;},wx:{pageScrollTo(){}},require(name){assert.equal(name,'../../utils/request');return {ready:()=>signedIn, request:async(endpoint,method='GET',body)=>{calls.push({endpoint,method,body});return reply(endpoint,method,body);}};}});
  const page={...definition,data:copy(definition.data),setData(patch){Object.assign(this.data,patch);}};
  return {page,calls,logout(){signedIn=false;},reply(fn){reply=fn;}};
}
async function main(){
  const f=fixture();await f.page.onShow();assert.equal(f.page.data.filtered.length,1);assert.equal(f.page.data.filtered[0].gapLabel,'比参考线快 5分');
  f.page.onTarget({detail:{value:'2:15:00'}});await f.page.save();const save=f.calls.find(x=>x.method==='PUT');assert.equal(save.body.targets.full,'2:15:00');assert.equal(f.page.data.filter,'opportunity');
  f.page.openDetail({currentTarget:{dataset:{id:'demo:full-men'}}});assert.equal(f.page.data.yearRows.length,8);assert.equal(f.page.data.yearRows[1].clock,'—');
  f.page.chooseYear({currentTarget:{dataset:{year:'2025'}}});assert.equal(f.page.data.yearRows[0].name,'模拟乙');assert.equal(f.page.data.yearTiming,'净计时');assert.equal(f.page.data.yearSource,'模拟2025');
  f.page.openEntry();assert.equal(f.page.data.consent,false);const count=f.calls.length;await f.page.saveEntry();assert.equal(f.calls.length,count);assert.match(f.page.data.entryMessage,/确认/);
  f.page.data.selected.demo=false;f.page.onEntryClock({detail:{value:'2:10:00'}});f.page.onEntryDate({detail:{value:'2026-04-12'}});f.page.onConsent({detail:{value:['agree']}});await f.page.saveEntry();const entry=f.calls.find(x=>x.endpoint==='/me/radar/entries/demo'&&x.method==='PUT');assert.ok(entry);assert.equal(entry.body.clock,'2:10:00');assert.equal(entry.body.consent,true);assert.equal(entry.body.distance,'full');assert.equal(f.page.data.entryOpen,false);
  await f.page.withdrawEntry();assert.ok(f.calls.find(x=>x.method==='DELETE'));
  f.logout();await f.page.onShow();assert.equal(f.page.data.rows.length,0);assert.equal(f.page.data.selected,null);assert.equal(f.page.data.loggedIn,false);
  const r=fixture();r.reply(async()=>{throw Object.assign(Error('登录已失效'),{status:401});});await r.page.onShow();assert.equal(r.page.data.loggedIn,false);assert.equal(r.page.data.loading,false);
  const stale=fixture();let release;stale.reply(()=>new Promise(resolve=>{release=resolve;}));const pending=stale.page.load();stale.logout();await stale.page.load();release(copy(base));await pending;assert.equal(stale.page.data.rows.length,0);
  console.log('拿奖雷达小程序：目标保存、机会筛选、历届切换、缺名次、匿名授权/撤回、退出和过期请求检查通过。');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
