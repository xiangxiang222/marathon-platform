// Canvas 2D renderer shared with the generated Web ESM mirror.
// It draws only the explicit, whitelisted selection produced by achievement-model.
const { paginateAchievement, STYLES } = require('./achievement-model');
const WIDTH = 1080;
const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
const PAD = 70;
function rounded(ctx, x, y, w, h, radius, fill, stroke) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  if (fill) { ctx.fillStyle=fill; ctx.fill(); } if (stroke) { ctx.strokeStyle=stroke; ctx.lineWidth=1.5; ctx.stroke(); }
}
function font(ctx, size, weight) { ctx.font=(weight || 400)+' '+size+'px '+FONT; }
function fit(ctx, value, width) {
  const chars=Array.from(String(value || '')); if(ctx.measureText(chars.join('')).width<=width)return chars.join('');
  while(chars.length && ctx.measureText(chars.join('')+'…').width>width)chars.pop(); return chars.join('')+'…';
}
function text(ctx, value, x, y, size, color, weight, width, align) {
  font(ctx,size,weight); ctx.fillStyle=color; ctx.textAlign=align || 'left'; ctx.fillText(width ? fit(ctx,value,width) : String(value || ''),x,y); ctx.textAlign='left';
}
function lines(ctx, value, width, max) {
  const chars=Array.from(String(value || '')), out=[]; let line='';
  for(let i=0;i<chars.length;i++){
    if(ctx.measureText(line+chars[i]).width>width && line){
      out.push(line); line=''; if(out.length===max-1){out.push(fit(ctx,chars.slice(i).join(''),width));return out;}
    }
    line+=chars[i];
  }
  if(line)out.push(line);return out.slice(0,max);
}
function drawClock(ctx, clock, x, y, maximum, color, size, align) {
  let n=size; font(ctx,n,650); while(n>28 && ctx.measureText(clock).width>maximum){n--;font(ctx,n,650);}
  ctx.fillStyle=color;ctx.textAlign=align || 'left';ctx.fillText(clock,x,y);ctx.textAlign='left';
}
function line(ctx,x,y,x2,y2,color,width){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width || 1;ctx.stroke();}
function background(ctx,height,style){
  ctx.fillStyle=style.background;ctx.fillRect(0,0,WIDTH,height);
  ctx.save();ctx.globalAlpha=.55;ctx.fillStyle=style.soft;ctx.beginPath();ctx.arc(1040,70,310,0,Math.PI*2);ctx.fill();ctx.restore();
  // Track lanes carry the running theme without external photos or brand marks.
  ctx.save();ctx.globalAlpha=.22;ctx.strokeStyle=style.accent;ctx.lineWidth=1.4;
  for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(1060,95,195+i*27,Math.PI*.5,Math.PI*1.45);ctx.stroke();}
  ctx.restore();
  line(ctx,PAD,38,124,38,style.accent,5);
}
function header(ctx,model){
  const s=model.style;
  text(ctx,model.mode==='pb'?'PERSONAL BEST / 我的高光':'FINISHER’S JOURNAL / 完赛手记',PAD,89,22,s.accent,600,850);
  if(model.showName)text(ctx,model.nickname || '热爱奔跑的我',PAD,156,34,s.ink,550,755);
  if(model.pageCount>1)text(ctx,String(model.page).padStart(2,'0')+' / '+String(model.pageCount).padStart(2,'0'),WIDTH-PAD,156,25,s.accent,500,160,'right');
  text(ctx,model.title,PAD,264,78,s.ink,700,WIDTH-PAD*2);
  text(ctx,model.subtitle,PAD,322,25,s.accent,400,WIDTH-PAD*2);
  // A small signature cadence: a quiet line and one accent beat.
  line(ctx,PAD,367,WIDTH-PAD,367,s.soft,2);line(ctx,PAD,367,PAD+55,367,s.accent,4);
}
function pbTile(ctx,row,x,y,w,h,model){
  const s=model.style;rounded(ctx,x,y,w,h,26,'#ffffff');
  text(ctx,row.distanceLabel,x+30,y+48,26,s.accent,500,w-110);
  rounded(ctx,x+w-74,y+24,48,32,7,s.soft);text(ctx,'PB',x+w-50,y+47,18,s.accent,650,38,'center');
  const clockSize=w>650?(h>360?118:96):77;
  drawClock(ctx,row.clock,x+28,y+(h>360?158:139),w-56,s.ink,clockSize);
  font(ctx,26,400);const race=lines(ctx,row.raceName || (model.showRace?'我的个人最好成绩':'跑出自己的最好'),w-60,2);
  const raceY=y+(h>360?225:197);race.forEach((v,i)=>text(ctx,v,x+30,raceY+i*36,26,s.ink,400,w-60));
  const meta=[row.raceDate && row.raceDate.replace(/-/g,'.'),[row.province,row.city].filter((v,i,a)=>v && a.indexOf(v)===i).join(' · ')].filter(Boolean).join('  ·  ');
  if(meta)text(ctx,meta,x+30,y+h-29,21,s.accent,400,w-60);
}
function drawPb(ctx,model){
  const count=model.rows.length,s=model.style;
  const top=412,gap=22,w=(WIDTH-PAD*2-gap)/2;
  if(count===1){
    pbTile(ctx,model.rows[0],PAD,top,WIDTH-PAD*2,490,model);
    text(ctx,'ONE RECORD. COUNTLESS EARLY MORNINGS.',PAD,962,21,s.accent,500,WIDTH-PAD*2);
    text(ctx,'一个成绩，藏着无数次出发。',PAD,1010,31,s.ink,500,WIDTH-PAD*2);
  }else{
    const h=count<=2?395:320;
    for(let i=0;i<count;i++){
      const wide=count===3 && i===2;
      pbTile(ctx,model.rows[i],wide?PAD:PAD+(i%2)*(w+gap),top+Math.floor(i/2)*(h+gap),wide?WIDTH-PAD*2:w,h,model);
    }
    if(count===2){
      text(ctx,'MY PACE. MY PERSONAL BEST.',PAD,896,22,s.accent,500,WIDTH-PAD*2);
      text(ctx,'按自己的节奏，刷新自己的纪录。',PAD,950,31,s.ink,500,WIDTH-PAD*2);
    }
  }
  const labels=model.rows.map(r=>r.distanceLabel).join(' / ');
  text(ctx,count+' 项生涯个人最佳',PAD,1172,26,s.ink,550,WIDTH-PAD*2);
  text(ctx,labels,PAD,1219,21,s.accent,400,WIDTH-PAD*2);
}
function drawSummary(ctx,model){
  const s=model.style;rounded(ctx,PAD,407,WIDTH-PAD*2,132,22,'#ffffff');
  const values=[{n:model.summary.events,label:'场完赛'},{n:model.summary.results,label:'条成绩'},{n:model.summary.km,label:'比赛公里'}];
  const col=(WIDTH-PAD*2)/3;
  values.forEach((item,i)=>{if(i)line(ctx,PAD+i*col,432,PAD+i*col,510,s.soft,1.5);text(ctx,String(item.n),PAD+i*col+28,470,42,s.ink,650,col-56);text(ctx,item.label,PAD+i*col+28,511,21,s.accent,400,col-56);});
}
function resultRow(ctx,row,index,y,model){
  const s=model.style,x=PAD+30,leftWidth=570;
  text(ctx,String((model.page-1)*20+index+1).padStart(2,'0'),x,y+43,20,s.accent,500,40);
  text(ctx,row.distanceLabel,x+65,y+43,22,s.accent,500,leftWidth-90);
  if(row.typeLabel && row.typeLabel!=='路跑')text(ctx,row.typeLabel,x+65,y+77,20,s.accent,400,460);
  const titleY=y+(row.typeLabel && row.typeLabel!=='路跑'?109:86);
  text(ctx,row.raceName || '一次属于自己的出发',x+65,titleY,28,s.ink,500,leftWidth-70);
  const meta=[row.raceDate && row.raceDate.replace(/-/g,'.'),[row.province,row.city].filter((v,i,a)=>v && a.indexOf(v)===i).join(' · ')].filter(Boolean).join('  ·  ');
  if(meta)text(ctx,meta,x+65,y+133,20,s.accent,400,leftWidth-70);
  drawClock(ctx,row.clock,WIDTH-PAD-30,y+85,270,s.ink,56,'right');
  if(row.pb){text(ctx,'PERSONAL BEST',WIDTH-PAD-30,y+122,16,s.accent,600,260,'right');}
}
function drawResults(ctx,model){
  const s=model.style;drawSummary(ctx,model);
  const start=581,count=model.rows.length;
  rounded(ctx,PAD,start,WIDTH-PAD*2,count*158+28,24,'#ffffff');
  model.rows.forEach((row,i)=>{const y=start+10+i*158;resultRow(ctx,row,i,y,model);if(i<count-1)line(ctx,PAD+30,y+154,WIDTH-PAD-30,y+154,s.soft,1);});
}
function footer(ctx,model,height){
  const s=model.style;line(ctx,PAD,height-151,WIDTH-PAD,height-151,s.soft,2);
  text(ctx,model.quote,PAD,height-91,31,s.ink,500,WIDTH-PAD*2);
  text(ctx,'个人成绩记录 · 赛历',PAD,height-42,19,s.accent,400,WIDTH-PAD*2-160);
  if(model.pageCount>1)text(ctx,model.page+' / '+model.pageCount+'  ·  共 '+model.totalRows+' 条',WIDTH-PAD,height-42,18,s.accent,400,280,'right');
}
function renderAchievementPoster(canvas,fullModel,options){
  if(!canvas || typeof canvas.getContext!=='function')throw new Error('画布暂不可用，请重试');
  const pages=paginateAchievement(fullModel),raw=options && options.pageIndex, pageIndex=Number.isInteger(raw)?Math.max(0,Math.min(pages.length-1,raw)):0;
  const model=pages[pageIndex];if(!model.rows.length)throw new Error('先选一条成绩，再生成海报');
  model.style=STYLES.find(s=>s.id===(fullModel.style && fullModel.style.id)) || STYLES[0];
  const height=model.mode==='pb'?1440:Math.max(1440,660+model.rows.length*158+182);
  canvas.width=WIDTH;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('画布暂不可用，请重试');
  ctx.textBaseline='alphabetic';background(ctx,height,model.style);header(ctx,model);
  if(model.mode==='pb')drawPb(ctx,model);else drawResults(ctx,model);footer(ctx,model,height);
  return {width:WIDTH,height,pages:pages.length,pageIndex};
}
module.exports={renderAchievementPoster};
