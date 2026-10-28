const now='2026-10-27';
const race=(id,name,date,city='北京')=>({id,name,raceDate:date,province:city,city,district:'',place:city+'体育中心',distances:['full','half'],distanceLabels:['马拉松','半程马拉松'],kinds:[],kind:'road',kindLabels:[],meet:'offline',groups:[],startAt:'07:30',scale:'20000人',fee:'150元',phone:'010-12345678',links:[{key:'signup',url:'https://example.org/signup'}],eventUrl:'https://example.org',officialUrl:'',organizer:'赛事组委会',grade:'A',source:'组委会，2026-10-27',updatedAt:now,route:'城市环线',pickup:'赛前两天领物',pacers:'',guideText:'## 参赛资格\n请核对竞赛规程。',guide:[],routeSheets:[],pacerSheets:[],liveSheet:null,regStart:'2026-09-01',deadline:'2026-10-28',drawAt:'2026-10-29',payDeadline:'2026-10-30',deadlineName:'报名截止',deadlineLabel:'明天截止',regStatus:'报名中',known:true,open:true,daysLeft:1,bibAt:'',nodes:[]});
const catalog=[race('beijing-26','2026北京马拉松','2026-11-01'),race('hangzhou-26','2026杭州马拉松','2026-11-08','杭州'),race('nanjing-26','2026南京马拉松','2026-11-15','南京'),race('shanghai-26','2026上海马拉松','2026-11-29','上海'),race('guangzhou-26','2026广州马拉松','2026-12-13','广州')];
const submissions=[{...race('bot-a','2026苏州马拉松','2026-12-06','苏州'),id:71,raceId:'',status:'pending',signupUrl:'https://example.org/signup',source:'数字心动公开页面',nodeSource:'赛事组委会，2026-10-27',prizes:[],draws:[],note:''},{...race('bot-b','2026无锡半程马拉松','2026-12-20','无锡'),id:72,raceId:'',status:'pending',signupUrl:'https://example.org/signup',source:'最酷公开页面',nodeSource:'赛事组委会，2026-10-27',prizes:[],draws:[],note:''}];
const user={id:1,nickname:'奥森小鹿',createdAt:'2026-06-01',leader:true,hasPassword:true,clubs:1,plans:3};
const club={id:91,name:'北京奥森晨跑团',owner:'测试团长',code:'AOSEN26',createdAt:'2026-05-01',members:36};
const person={user,clubs:[{id:91,name:club.name,role:'member'}],plans:[{name:catalog[0].name,raceDate:catalog[0].raceDate,city:'北京',status:'已报名'},{name:catalog[1].name,raceDate:catalog[1].raceDate,city:'杭州',status:'中签'}],results:[{name:'北京半程马拉松',distance:'半马',clock:'1:39:20'}],points:[{club:club.name,points:28}]};
const members=[{id:1,nickname:'测试团长',joinedAt:'2026-05-01',role:'owner'},{id:2,nickname:user.nickname,joinedAt:'2026-06-01',role:'member'}];
const news=[{id:21,raceId:catalog[0].id,raceName:catalog[0].name,title:'北京马拉松领物须知',publishedAt:now,source:'组委会',city:'北京',body:'## 领物安排\n请携带有效证件。',status:'published',lines:[]}];
function overview(role){const counts={users:1286,clubs:32,pendingFoundings:2,pendingJoins:7};if(role==='admin')Object.assign(counts,{publishedRaces:87,upcomingRaces:58,pendingRaces:12,returnedRaces:3,publishedNews:26,pendingNews:4});const attention=[{id:'foundings',label:'建团申请',count:2,description:'核实申请人后开通跑团',section:'joins',tab:'foundings'},{id:'joins',label:'入团申请',count:7,description:'申请人等待审核',section:'joins',tab:'joins'}];if(role==='admin')attention.unshift({id:'races',label:'赛事待审核',count:12,description:'核实采集来源与报名节点',section:'races',tab:'review'},{id:'news',label:'资讯待审核',count:4,description:'核对正文与关联赛事',section:'news',tab:'review'});return{role,generatedAt:'2026-10-27T01:40:00.000Z',counts,attention,...(role==='admin'?{upcoming:catalog,contentQuality:{total:58,missingRegistrationNodes:9,missingGuide:7,missingSource:3}}:{})}}
function createState(role='admin'){return{role,writes:[],gets:[],unexpected:[],rows:structuredClone(catalog),submissions:structuredClone(submissions),news:structuredClone(news),joins:[{id:31,nickname:'晨跑小林',club:club.name,at:now}],foundings:[{id:41,nickname:'越野阿晨',name:'山野长距离跑团',at:now}],overview:overview(role)}}
async function setup(page,state){await page.route('**/marathon/api/**',async route=>{const req=route.request(),u=new URL(req.url()),p=u.pathname.replace('/marathon/api',''),m=req.method();let data;
 if(m!=='GET'){state.writes.push({method:m,path:p,body:req.postData()});
 if(p==='/admin/login')data={token:'mock-admin-token',role:state.role,username:'运营阿晨'};
 else if(p==='/admin/logout')data={ok:true};
 else if(/^\/admin\/bot-races\/\d+\/publish$/.test(p)){state.submissions=state.submissions.filter(r=>r.id!==Number(p.split('/')[3]));data={ok:true};}
 else if(/^\/admin\/bot-races\/\d+\/return$/.test(p)){const row=state.submissions.find(r=>r.id===Number(p.split('/')[3]));if(row){row.status='returned';row.note=req.postDataJSON().note}data={ok:true};}
 else if(/^\/admin\/bot-races\/\d+$/.test(p)){const row=state.submissions.find(r=>r.id===Number(p.split('/')[3]));if(row)Object.assign(row,req.postDataJSON());data={ok:true};}
 else if(p==='/admin/official/sync')data={changed:1};
 else if(/^\/admin\/club-applications\/\d+$/.test(p)){state.foundings=[];data={ok:true};}
 else if(/^\/admin\/club-requests\/\d+$/.test(p)){state.joins=[];data={ok:true};}
 else if(p==='/admin/races'){const b=req.postDataJSON();const added=race('new-race',b.name,b.raceDate,b.city);Object.assign(added,b);state.rows.unshift(added);data={id:added.id};}
 else if(p.startsWith('/admin/races/')&&p.endsWith('/guide')){const row=state.rows.find(r=>r.id===p.split('/')[3]);if(row)Object.assign(row,req.postDataJSON());data={ok:true};}
 else data={ok:true};
 }else{state.gets.push(p+u.search);
 if(p==='/admin/session')data={role:state.role,username:'运营阿晨'};
 else if(p==='/admin/overview')data=state.overview;
 else if(p==='/admin/races'){const q=u.searchParams.get('q')||'';const rows=state.rows.filter(r=>!q||r.name.includes(q)||r.city.includes(q));data={races:rows,total:rows.length,pages:1,page:1};}
 else if(p==='/admin/places')data={spots:[{province:'北京',city:'北京',district:'朝阳区',place:'奥森公园'}]};
 else if(p==='/admin/bot-races'){const rows=state.submissions.filter(r=>r.status===(u.searchParams.get('status')||'pending'));data={rows,total:rows.length,pendingCount:state.submissions.filter(r=>r.status==='pending').length,pages:1,page:1};}
 else if(/^\/admin\/bot-races\/\d+$/.test(p))data=state.submissions.find(r=>r.id===Number(p.split('/')[3]));
 else if(p==='/admin/official')data={rows:[{officialId:'caa-101',name:'2026深圳马拉松',raceDate:'2026-12-06',province:'广东',city:'深圳',gradeLabel:'A类',items:'马拉松',organizer:'组委会',scale:'20000人',webUrl:'https://example.org',detailUrl:'https://example.org/official',changes:[{id:1,label:'举办日期',oldValue:'2026-12-13',newValue:'2026-12-06'}],status:'pending',raceId:'',diffNote:'官网日期有变化'}],total:1,pages:1,page:1};
 else if(p==='/admin/users')data={users:[user],total:1,pages:1,page:1};
 else if(p==='/admin/users/1')data=person;
 else if(p==='/admin/clubs')data={clubs:[club],total:1,pages:1,page:1};
 else if(p==='/admin/clubs/91')data={club,members};
 else if(p==='/admin/club-applications')data={applications:state.foundings,total:state.foundings.length,pages:1,page:1};
 else if(p==='/admin/club-requests')data={requests:state.joins,total:state.joins.length,pages:1,page:1};
 else if(p==='/admin/runs')data={runs:[{nickname:user.nickname,km:12.5,at:now,club:club.name,title:'周末奥森团练',note:'轻松跑'}],total:1,pages:1,page:1};
 else if(p==='/admin/shop')data={gifts:[{id:1,club:club.name,name:'跑团速干T恤',cost:100,stock:12}],giftTotal:1,giftPages:1,giftPage:1,redemptions:[{nickname:user.nickname,name:'速干T恤',at:now,club:club.name,cost:100}],redemptionTotal:1,redemptionPages:1,redemptionPage:1};
 else if(p==='/admin/partner')data={supplies:[{id:1,brand:'跑步伙伴',name:'能量胶',month:'2026-10',total:500,quota:20,claimed:120,needChecks:3,needKm:50,open:true}],leagues:[{id:1,month:'2026-10',title:'秋季跑量赛',sponsor:'跑步伙伴',prize:'运动装备',clubs:12}],splits:[{id:1,club:club.name,kindLabel:'服务费',month:'2026-10',yuan:200,settledLabel:'未结',settled:false}],supplyPages:1,supplyPage:1,leaguePages:1,leaguePage:1,splitPages:1,splitPage:1};
 else if(p==='/admin/accounts')data={accounts:[{username:'运营阿晨',role:'admin',roleLabel:'管理员'},{username:'跑团小管',role:'club',roleLabel:'跑团管理员'}]};
 else if(p==='/admin/news'){const status=u.searchParams.get('status');const rows=status==='published'?state.news:[{...state.news[0],id:22,status:'pending',title:'杭州马拉松交通提示'}];data={rows,total:rows.length,pendingCount:1,pages:1,page:1};}
 else if(/^\/races\/[^/]+$/.test(p))data={race:state.rows.find(r=>r.id===p.split('/')[2])||state.rows[0]};
 else if(/^\/admin\/races\/[^/]+\/prizes$/.test(p))data={prizes:[]};
 else if(/^\/admin\/races\/[^/]+\/draws$/.test(p))data={draws:[]};
 else if(/^\/admin\/races\/[^/]+\/news$/.test(p))data={news:[],waiting:[]};
 else {state.unexpected.push(p);data={};}
 }
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data||{})});
 });}
module.exports={createState,setup,catalog};
