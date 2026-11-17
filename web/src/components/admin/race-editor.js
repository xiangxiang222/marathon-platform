const tabs={name:'base',raceDate:'base',startAt:'base',province:'base',city:'base',district:'base',place:'base',organizer:'base',grade:'base',cover:'base',distances:'projects',groups:'projects',scale:'projects',fee:'projects',phone:'projects',regStart:'signup',deadline:'signup',deadlineName:'signup',drawAt:'signup',payDeadline:'signup',bibAt:'signup',nodeSource:'signup',signupUrl:'signup',drawUrl:'signup',bibUrl:'signup',resultUrl:'signup',eventUrl:'site',officialUrl:'site',route:'day',pacer:'day',pickup:'day',pacers:'day',guide:'guide',guideText:'guide',live:'live',liveUrl:'live'};
export function raceEditorError(field,message){return{field,tab:tabs[field]||'base',message};}
export function validEditorDay(value){const text=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return false;const date=new Date(text+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===text;}
export function raceEditorNodeTime(key,day,original=''){
  if(!validEditorDay(day))return NaN;
  const raw=String(original||'');
  if(raw.slice(0,10)===day&&raw.length>10&&Number.isFinite(Date.parse(raw)))return Date.parse(raw);
  return Date.parse(day+(key==='regStart'?'T00:00:00+08:00':'T23:59:59+08:00'));
}
export function validateRaceEditor(row,{nodesTouched=false,scheduleChanged=false,originalNodes={}}={}){
  const value=key=>String(row[key]||'').trim(),error=(key,text)=>raceEditorError(key,text);
  if(!value('name'))return error('name','请填写赛事名称');
  if(!validEditorDay(value('raceDate')))return error('raceDate','请填写有效的比赛日期');
  if(row.submissionId&&!value('province'))return error('province','请填写省份');
  if(row.submissionId&&!value('city'))return error('city','请填写城市');
  if(!value('city')&&!value('place'))return error('city','请填写城市或举办地点');
  if(!(row.distances||[]).length&&!(row.kinds||[]).length&&!value('groups'))return error('distances','请至少选择一个项目，或填写其他组别');
  const limits={name:100,city:20,province:20,district:40,place:80,organizer:80,fee:80,scale:80,phone:40,route:400,pickup:400,pacers:400,guideText:2000000,nodeSource:80,deadlineName:12};
  for(const [key,max]of Object.entries(limits))if(value(key).length>max)return error(key,'此项最多填写 '+max+' 个字');
  const groups=value('groups').split(/[,，、]/).map(s=>s.trim()).filter(Boolean);
  if(groups.length>128||groups.some(s=>s.length>256))return error('groups','其他组别最多 128 项，每项不超过 256 个字');
  if(value('startAt')&&!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value('startAt')))return error('startAt','起跑时间请填写为 07:00');
  for(const key of['regStart','deadline','drawAt','payDeadline','bibAt'])if(value(key)&&!validEditorDay(value(key)))return error(key,'请填写有效的日期');
  const dated=['regStart','deadline','drawAt','payDeadline',...(row.submissionId?['bibAt']:[])].some(key=>value(key));
  const effective=key=>(value(key)||originalNodes[key]||'').slice(0,10);
  if(nodesTouched||row.submissionId||scheduleChanged){
    const ordered=[['regStart','报名开始'],['deadline','报名截止'],['drawAt','中签公布'],['payDeadline','缴费截止']];
    let previous=null;
    for(const [key,label] of ordered){
      const date=effective(key);if(!date)continue;
      if(previous&&date<previous.date)return error(key,label+'不能早于'+previous.label+'，请核对时间线');
      previous={date,label};
    }
    for(const key of ['regStart','deadline','drawAt','payDeadline'])if(effective(key)&&effective(key)>value('raceDate')&&row.meet!=='online')return error(key,'此节点晚于比赛日，请核对节点或比赛日期');
  }
  if((row.submissionId?dated:nodesTouched)&&!value('nodeSource'))return error('nodeSource','修改报名时间须填写本次来源');
  if(!row.submissionId&&nodesTouched&&!dated)return error('regStart','请填写需要记录的报名时间；留空会保留已有日期');
  for(const key of['signupUrl','drawUrl','bibUrl','resultUrl','liveUrl','eventUrl','officialUrl'])if(value(key)){
    try{const url=new URL(value(key));if(url.protocol!=='https:'||!url.hostname||url.username||url.password||/\s/.test(value(key))||value(key).length>200)throw new Error();}
    catch{return error(key,'请填写 https:// 开头、200 字以内的完整链接');}
  }
  if(value('phone')&&!/^[\d+\-()（）/\s]{5,40}$/.test(value('phone')))return error('phone','咨询电话仅填写号码');
  return null;
}
