/* Visual pressure fixtures only. No API calls and no business data writes. */
const sport = require('../sport-visual-v3-mini-fixture.cjs');
const names = ['晨光跑团','奥森悦跑团','滨河跑团','追风跑团','城市夜跑团','周末长跑团','山海越野跑团','西湖马拉松训练营','一起向前跑步俱乐部','清晨轻松跑团'];
const clubs = names.map((name,index)=>({id:index+1,name,initial:name[0],city:'北京',cityLabel:'北京',members:42+index,memberCount:42+index,roleLabel:index<3?'团长':'成员',joined:true}));
module.exports = {
  cases: [
    {route:'pages/races/races',scenario:'base'},
    {route:'pages/sport/sport',scenario:'empty'},
    {route:'pages/mine/mine',scenario:'profile'}
  ],
  async prepare(route,data,scenario) {
    if(route==='pages/sport/sport')return sport.prepare(route,data,scenario);
    if(route==='pages/mine/mine')Object.assign(data,{nickname:'Amy123',mainTab:'profile',hasPassword:true,hasWechatLogin:false,clubs,profileOpen:false,passwordOpen:false});
    return {data,components:{},css:''};
  },
  async audit({page,route}) {
    const result=await page.evaluate(route=>{
      const issues=[];
      const buttons=[...document.querySelectorAll('.search .find,.search-action,.journal-search button')];
      for(const button of buttons){const r=button.getBoundingClientRect();if(r.width>57||r.height<43.5)issues.push('搜索按钮尺寸异常 '+JSON.stringify({width:r.width,height:r.height}));}
      if(route==='pages/sport/sport'){
        const hero=document.querySelector('.mileage-hero').getBoundingClientRect();
        if(hero.height>340)issues.push('运动首张统计卡超过340px');
        if(document.querySelector('.record-actions').getBoundingClientRect().bottom>520)issues.push('记录入口不在首屏');
      }
      if(route==='pages/mine/mine'){
        const rows=[...document.querySelectorAll('.profile-clubs-section .profile-row')];
        if(rows.length!==10)issues.push('应显示10个跑团');
        const xs=[...new Set(rows.map(row=>Math.round(row.getBoundingClientRect().left)))];
        if(xs.length!==2)issues.push('跑团应为双列');
        for(const row of rows){if(row.scrollWidth>row.clientWidth+1)issues.push('跑团卡片内容溢出');}
      }
      return issues;
    },route);
    return result;
  }
};
