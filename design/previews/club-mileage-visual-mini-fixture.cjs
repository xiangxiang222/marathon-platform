// Real component state with isolated display data; native controls are approximated.
const fs=require('node:fs'),path=require('node:path');
const f=require('./club-mileage-test-fixture.cjs');
const base='components/mileage-board/mileage-board';
const groups=[...f.groups,...[704,705,706].map(id=>({id,name:'同频进阶与周末长距离训练伙伴第'+id+'组',pace:'按每个人自己的节奏稳定训练',memberCount:0}))];
module.exports={
 cases:['base','pressure','expanded','empty','error'].map(scenario=>({route:'pages/mileage/mileage',scenario})),
 async prepare(route,data,scenario){
  const x=f.miniFixture(base,{clubId:'44',embedded:false});
  x.setReply(async url=>{
   if(scenario==='error')throw Error('跑量暂时无法载入，请重试');
   const board=f.boardFixture(Object.fromEntries(new URL(url,'https://fixture.invalid').searchParams),{groups:scenario==='empty'?[]:scenario==='base'?f.groups:groups});
   if(scenario==='empty'){board.summary={km:0,times:0,activeMembers:0,members:0};board.rank=[];}
   if(['pressure','expanded'].includes(scenario)){board.summary.km=123456789.12;for(const group of board.groups)group.km=1234567.89;for(const row of board.rank)row.km=123456.78;}
   return board;
  });
  await x.lifecycle('attached');await f.tick();
  if(scenario==='expanded')x.instance.toggleGroups();
  Object.assign(data,{clubId:'44',toolsOpen:false});
  const source=fs.readFileSync(path.join(f.MINI,base+'.wxml'),'utf8');
  const missingHandlers=[...new Set([...source.matchAll(/(?:bind|catch)(?::?[\w-]+)\s*=\s*["']([^"']+)["']/g)].map(match=>match[1]).filter(name=>!name.includes('{{')&&typeof x.instance[name]!=='function'))];
  return{data,components:{'mileage-board':{source,data:x.instance.data,missingHandlers}},css:'button{width:calc(100% - 32px)}\n'+fs.readFileSync(path.join(f.MINI,base+'.wxss'),'utf8')};
 },
 async audit({page,scenario}){
  return page.evaluate(scenario=>{
   const issues=[];
   if(!['empty','error'].includes(scenario)){
    const grid=document.querySelector('.mb-group-cards');if(getComputedStyle(grid).gridTemplateColumns.split(' ').length!==2)issues.push('Training groups must have two columns');
    if(grid.scrollWidth>grid.clientWidth+1)issues.push('Training group grid overflow');
    const expected=scenario==='base'?3:scenario==='expanded'?6:4;if(grid.children.length!==expected)issues.push('Unexpected visible group count');
    if(document.querySelectorAll('.mb-filter').length)issues.push('Large group filter buttons must be replaced by one picker');
   }
   const small=[...document.querySelectorAll('.mileage-board button')].filter(el=>el.getBoundingClientRect().height&&el.getBoundingClientRect().height<43.5);if(small.length)issues.push('Touch control below 44px');
   const clipped=[...document.querySelectorAll('.mb-summary,.mb-group-card,.mb-person,.mb-mine,.mb-picker-row')].filter(el=>el.scrollWidth>el.clientWidth+1);if(clipped.length)issues.push('Card or row overflow');
   return issues;
  },scenario);
 }
};
