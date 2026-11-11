const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const names={base:'资料',mileage:'跑量',races:'赛事',results:'成绩',albums:'相册'};
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage();
  for(const width of [320,390])for(const group of ['five-tabs','reports']){
    const rows=group==='five-tabs'?Object.entries(names).map(([key,title])=>({title,file:'pages-member-profile-member-profile'+(key==='base'?'':'-'+key)+'-'+width+'.png'})):['week','month','year'].map((key,index)=>({title:['历史周报','历史月报','历史年报'][index],file:'pages-mileage-mileage-report-'+key+'-'+width+'.png'}));
    const tiles=rows.map(row=>({...row,src:'data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'mini',row.file)).toString('base64')}));
    const uri=await page.evaluate(async({tiles,width})=>{const images=await Promise.all(tiles.map(tile=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.src=tile.src})));const scale=260/width,padding=14;const canvas=document.createElement('canvas');canvas.width=tiles.length*274+14;canvas.height=Math.ceil(Math.max(...images.map(image=>image.height*scale)))+62;const ctx=canvas.getContext('2d');ctx.fillStyle='#e9ecf0';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#263b32';ctx.font='600 16px sans-serif';images.forEach((image,index)=>{const x=padding+index*274;ctx.fillText(tiles[index].title+' · '+width,x,28);ctx.drawImage(image,x,44,260,image.height*scale)});return canvas.toDataURL('image/png')},{tiles,width});
    fs.writeFileSync(path.join(__dirname,'mini','contact-'+group+'-'+width+'.png'),Buffer.from(uri.split(',')[1],'base64'));
  }
  await browser.close();
})().catch(error=>{console.error(error);process.exitCode=1});
