'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..'), mini = path.join(root, 'miniprogram');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve=yes; reject=no; }); return { promise, resolve, reject }; };
const input = (key, value) => ({ currentTarget:{dataset:{key}}, detail:{value} });
const imageEvent = (src, id=44) => ({ currentTarget:{dataset:{src,id}} });
const club = { id:44, name:'西湖跑团', city:'杭州', intro:'每周三晚，一起绕湖慢跑。', owner:true, logo:'https://fixture.invalid/marathon/api/club-logos/44/logo.png' };
const dataLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
function fixture(name, query={id:'44'}) {
  const app={globalData:{token:'account-a',baseUrl:'https://fixture.invalid'}}, calls=[], navigation=[], choices=[];
  let definition, handler=async()=>({club}), prepare=async()=>dataLogo;
  const native={chooseMedia(options){choices.push(options)},navigateTo:options=>navigation.push(options.url),redirectTo:options=>navigation.push(options.url),navigateBack:()=>navigation.push('back'),showShareMenu(){},hideShareMenu(){},showModal(){}};
  const cache=new Map();
  function load(file) {
    file=path.resolve(file);if(!path.extname(file))file+='.js';
    if(cache.has(file))return cache.get(file).exports;
    if(file===path.join(mini,'utils/request.js'))return {request:(...args)=>{calls.push(args);return handler(...args)},ready:()=>!!app.globalData.token,clearAuth:()=>{app.globalData.token=''}};
    const module={exports:{}};cache.set(file,module);
    vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:relative=>load(path.resolve(path.dirname(file),relative)),Page:value=>definition=value,getApp:()=>app,getCurrentPages:()=>[{},{}],wx:native,setTimeout,clearTimeout,console,URL,URLSearchParams,Uint8Array},{filename:file});
    if(file===path.join(mini,'utils/avatar.js'))module.exports.prepareAvatar=(...args)=>prepare(...args);
    return module.exports;
  }
  load(path.join(mini,'pages',name,name+'.js'));
  const page={...definition,data:JSON.parse(JSON.stringify(definition.data)),setData(patch){for(const [key,value]of Object.entries(patch)){const parts=key.split('.');let target=this.data;for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)]=value}}};
  if(page.onLoad)page.onLoad(query);
  return {page,app,calls,navigation,choices,handler:fn=>handler=fn,prepare:fn=>prepare=fn,account:token=>app.globalData.token=token};
}
const checks=[];
async function check(name, fn){await fn();checks.push({name,passed:true});console.log('PASS '+name)}
async function main(){
  await check('logo URLs normalize recursively and preserve the API hostname without accepting local files as remote images',async()=>{
    const helper=require(path.join(mini,'utils/avatar'));
    const result=helper.normalizeAvatars({clubs:[{logo:'/marathon/api/club-logos/44/logo.png',avatar:'/marathon/api/avatars/2/a.png'}]},'https://fixture.invalid/');
    assert.equal(result.clubs[0].logo,club.logo);assert.equal(result.clubs[0].avatar,'https://fixture.invalid/marathon/api/avatars/2/a.png');
    assert.equal(helper.networkAvatar('wxfile://tmp/logo.png','https://fixture.invalid'),'');
  });
  await check('create selects a compressed logo, previews it and includes it in the idempotent creation request',async()=>{
    const f=fixture('club-create');f.handler(async(url,method)=>method==='POST'?{club}:{});await f.page.onShow();
    const selecting=f.page.chooseLogo();f.choices[0].success({tempFiles:[{tempFilePath:'wxfile://new.png'}]});await selecting;
    assert.equal(f.page.data.logo,dataLogo);assert.equal(f.page.data.logoPreview,'wxfile://new.png');
    f.page.setData({name:club.name,city:club.city});await f.page.create();
    assert.equal(f.calls.find(call=>call[1]==='POST')[2].logo,dataLogo);assert.equal(f.navigation[0],'/pages/club/club?id=44&created=1');
  });
  await check('remove cancels a pending image preparation; unsupported images and picker cancellation preserve the previous logo',async()=>{
    const f=fixture('club-edit');await f.page.onShow();const pending=deferred();f.prepare(()=>pending.promise);
    const selecting=f.page.chooseLogo();f.choices[0].success({tempFiles:[{tempFilePath:'wxfile://new.png'}]});await tick();f.page.removeLogo();pending.resolve(dataLogo);await selecting;
    assert.equal(f.page.data.logo,'');assert.equal(f.page.data.logoPreparing,false);assert.equal(f.page.data.logoChanged,true);
    f.page.setData({logo:club.logo,logoPreview:club.logo});f.prepare(async()=>{throw Error('请使用 JPG、PNG 或 WebP 格式的头像')});
    const invalid=f.page.chooseLogo();f.choices[1].success({tempFiles:[{tempFilePath:'wxfile://bad.gif'}]});await invalid;
    assert.equal(f.page.data.logo,club.logo);assert.match(f.page.data.logoError,/跑团标志/);
    const cancelled=f.page.chooseLogo();f.choices[2].fail({errMsg:'chooseMedia:fail cancel'});await cancelled;assert.equal(f.page.data.logo,club.logo);assert.equal(f.page.data.logoError,'');
  });
  await check('image picker and compression callbacks cannot update another account or a hidden page',async()=>{
    for(const change of ['account','hide']){
      const f=fixture('club-edit');await f.page.onShow();const pending=deferred();f.prepare(()=>pending.promise);
      const selecting=f.page.chooseLogo();f.choices[0].success({tempFiles:[{tempFilePath:'wxfile://new.png'}]});await tick();
      if(change==='account'){f.account('account-b');f.handler(async()=>({club:{...club,owner:false}}));await f.page.onShow()}else f.page.onHide();
      const before=JSON.stringify(f.page.data);pending.resolve(dataLogo);await selecting;assert.equal(JSON.stringify(f.page.data),before);
    }
  });
  await check('only the owner can edit; cancel performs no mutation, normal members and stale owner identity cannot open the editor',async()=>{
    const f=fixture('club-edit');await f.page.onShow();f.page.onField(input('name','尚未保存的名字'));f.page.cancel();assert.equal(f.calls.filter(call=>call[1]==='PUT').length,0);assert.deepEqual(f.navigation,['back']);
    const member=fixture('club-edit');member.handler(async()=>({club:{...club,owner:false}}));await member.page.onShow();member.page.onField(input('name','不能修改'));await member.page.save();assert.equal(member.page.data.name,'');assert.equal(member.calls.filter(call=>call[1]==='PUT').length,0);
    const detail=fixture('club');detail.page._identity='44:account-a';detail.page.setData({club});detail.page.openEdit();assert.equal(detail.navigation[0],'/pages/club-edit/club-edit?id=44');detail.account('account-b');detail.page.openEdit();assert.equal(detail.navigation.length,1);
    const markup=fs.readFileSync(path.join(mini,'pages/club/club.wxml'),'utf8');assert.match(markup,/wx:if="\{\{club\.owner\}\}"[^>]*bindtap="openEdit"/);
  });
  await check('editing keeps an unchanged logo, replaces or removes it explicitly, and retries failed saves without losing the draft',async()=>{
    for(const choice of ['unchanged','replace','remove']){
      const f=fixture('club-edit');let fail=true;f.handler(async(url,method)=>{if(method==='PUT'){if(fail)throw Error('网络暂不可用');return {club}}return {club}});await f.page.onShow();
      f.page.onField(input('name','更新后的跑团'));if(choice==='replace')f.page.setData({logoChanged:true,logo:dataLogo});if(choice==='remove')f.page.removeLogo();
      await f.page.save();assert.equal(f.page.data.name,'更新后的跑团');assert.equal(f.page.data.saving,false);assert.deepEqual(f.navigation,[]);
      fail=false;await f.page.save();const sent=f.calls.filter(call=>call[1]==='PUT');assert.equal(sent.length,2);assert.deepEqual(sent[0][2],sent[1][2]);assert.equal(sent[0][2].logo,choice==='unchanged'?undefined:choice==='replace'?dataLogo:'');assert.deepEqual(f.navigation,['back']);
    }
  });
  await check('double save sends once and delayed saves do not navigate after account changes or leaving the editor',async()=>{
    for(const change of ['account','hide','unload']){
      const f=fixture('club-edit');const pending=deferred();f.handler(async(url,method)=>method==='PUT'?pending.promise:{club});await f.page.onShow();
      const saving=f.page.save();f.page.save();assert.equal(f.calls.filter(call=>call[1]==='PUT').length,1);
      if(change==='account'){f.account('account-b');f.handler(async()=>({club:{...club,owner:false}}));await f.page.onShow()}else if(change==='hide')f.page.onHide();else f.page.onUnload();
      pending.resolve({club});await saving;assert.deepEqual(f.navigation,[]);if(change==='account')assert.equal(f.page.data.name,'');
    }
  });
  await check('permission revocation clears the editor and prevents another save; old image errors do not hide a new logo',async()=>{
    const f=fixture('club-edit');await f.page.onShow();f.page.logoPreviewError(imageEvent('https://fixture.invalid/old.png'));assert.equal(f.page.data.logoFailed,false);f.page.logoPreviewError(imageEvent(club.logo));assert.equal(f.page.data.logoFailed,true);
    f.handler(async()=>{throw Object.assign(Error('只有团长可以编辑'),{status:403})});await f.page.save();assert.equal(f.page.data.owner,false);assert.equal(f.page.data.name,'');await f.page.save();assert.equal(f.calls.filter(call=>call[1]==='PUT').length,1);
    const directory=fixture('clubs');directory.page._account='account-a';directory.page.setData({clubs:[{...club,initial:'西'}],openClubs:[{...club,initial:'西'}]});directory.page.clubLogoError(imageEvent('old'));assert.equal(directory.page.data.clubs[0].logoFailed,undefined);directory.page.clubLogoError(imageEvent(club.logo));assert.equal(directory.page.data.clubs[0].logoFailed,true);assert.equal(directory.page.data.openClubs[0].logoFailed,true);
  });
  const report={kind:'Mini Page VM; mocked transport/native image APIs, not device testing',passed:true,checks};fs.writeFileSync('/tmp/mini-club-logo-edit-regression-report.json',JSON.stringify(report,null,2));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1});
module.exports={fixture,club,dataLogo};
