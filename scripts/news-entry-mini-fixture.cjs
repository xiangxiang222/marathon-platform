/* Current Page methods + existing published profile data, rendered by the source
 * mirror. The article and injected fault cases are explicitly synthetic. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..'),clone=value=>JSON.parse(JSON.stringify(value));
const athletes=require('../shared/elite-athletes.json').athletes.slice(0,6),pacers=require('../server/src/pacer-people').toPacerPeople(require('../shared/official-pacers.json')).profiles.slice(0,6);
const article={id:9001,category:'industry',title:'【合成验收】赛道上的人，也有自己的成长故事',summary:'仅用于检查资讯入口与正文列表的布局，不是真实报道。',publishedAt:'2026-11-12',featured:true};
const settle=async()=>{await Promise.resolve();await new Promise(resolve=>setImmediate(resolve));};
module.exports={
  cases:['base','empty-preview','preview-failure','long-target'].map(scenario=>({route:'pages/news/news',scenario})),
  async prepare(route,data,scenario){let definition;const app={globalData:{baseUrl:'https://preview.invalid',token:''}};
    const request=url=>{const q=new URL(url,'https://fixture.invalid');if(q.pathname==='/content/profiles'){if(scenario==='preview-failure')return Promise.reject(Error('optional preview failed'));if(scenario==='empty-preview')return Promise.resolve({profiles:[]});const isPacer=q.searchParams.get('type')==='pacer';let rows=clone(isPacer?pacers:athletes);if(isPacer&&scenario==='long-target')rows=[{id:'synthetic-target',name:'合成长格式验收',type:'pacer',primaryTargetTime:'3:45:00'}];return Promise.resolve({profiles:rows});}return Promise.resolve({articles:[article],page:1,pages:1,total:1});};
    vm.runInNewContext(fs.readFileSync(path.join(ROOT,'miniprogram',route+'.js'),'utf8'),{Page(value){definition=value;},getApp:()=>app,wx:{setNavigationBarTitle(){}},require(name){if(name==='../../utils/request')return {request};if(name==='../../utils/content')return require('../miniprogram/utils/content');throw Error('Unexpected require '+name);}});
    const page={...definition,data:clone(definition.data),setData(patch){for(const [key,value]of Object.entries(patch)){const parts=key.split('.');let target=this.data;for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)]=clone(value);}}};page.onLoad({});page.onShow();await settle();
    for(const people of Object.values(page.data.previewPhotos))for(const person of people){const image=new URL(person.image),file=path.join(ROOT,'web/public',image.pathname.replace(/^\/marathon\//,''));assert.ok(fs.existsSync(file),'Photo fixture must exist: '+file);person.image='data:image/jpeg;base64,'+fs.readFileSync(file).toString('base64');}
    return {data:page.data,components:{},css:''};
  },
  async audit({page,scenario}){const metrics=await page.evaluate(()=>({cards:[...document.querySelectorAll('.profile-entry')].map(el=>{const box=el.getBoundingClientRect(),style=getComputedStyle(el);return {height:box.height,scrollWidth:el.scrollWidth,width:el.clientWidth,align:style.alignItems};}),photos:document.querySelectorAll('.shortcut-portrait img').length,first:document.querySelector('.journal-row')?.getBoundingClientRect().y}));const errors=[];if(metrics.cards.length!==2||Math.abs(metrics.cards[0].height-metrics.cards[1].height)>1)errors.push('Both entry cards must stay equal in height');if(metrics.cards.some(card=>card.scrollWidth>card.width+1||card.align!=='flex-start'))errors.push('Entry cards must fit and keep titles left aligned: '+JSON.stringify(metrics.cards));if(!(metrics.first<650))errors.push('Actual news must appear on the opening screen');if(scenario==='base'&&!metrics.photos)errors.push('Published athlete photos must enrich the default entry');return errors;}
};
