const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const out=__dirname;
const data=file=>'data:image/png;base64,'+fs.readFileSync(path.join(out,file)).toString('base64');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1238,height:1870},deviceScaleFactor:1});
  const labels=['赛事','运动','我的 · 个人资料'];
  const files=[['web-races-390-viewport.png','web-sport-390-viewport.png','web-mine-390-viewport.png'],['mini/pages-races-races-390.png','mini/pages-sport-sport-empty-390.png','mini/pages-mine-mine-profile-390.png']];
  const row=(name,items)=>'<h2>'+name+'</h2><div class="row">'+items.map((file,i)=>'<div class="cell"><h3>'+labels[i]+'</h3><img src="'+data(file)+'"></div>').join('')+'</div>';
  await page.setContent('<html><head><style>*{box-sizing:border-box}body{margin:0;padding:22px;background:#e9ebef;color:#292d35;font-family:system-ui}h1{font-size:24px;margin:0 0 8px}p{font-size:14px;margin:0 0 18px;color:#60656f}h2{font-size:17px;margin:16px 0 8px}.row{display:grid;grid-template-columns:repeat(3,390px);gap:12px}.cell{overflow:hidden;border:1px solid #d9dce2;border-radius:10px;background:#fff}h3{margin:0;padding:10px;font-size:15px;font-weight:500;text-align:center}.cell img{display:block;width:390px;height:844px;object-fit:cover;object-position:top}</style></head><body><h1>本轮界面反馈 · 首页、运动、我的 390px</h1><p>最新源码；合成展示数据。小程序为当前 WXML/WXSS 浏览器源码镜像，非真机。</p>'+row('Web · 390 × 844',files[0])+row('小程序源码镜像 · 390 × 900 截取首屏',files[1])+'</body></html>');
  await page.evaluate(()=>Promise.all([...document.images].map(image=>image.decode())));await page.screenshot({path:path.join(out,'three-entries-contact-390.png'),fullPage:true});
  const mini=await browser.newPage({viewport:{width:390,height:900}});await mini.goto('file://'+path.join(out,'mini/pages-mine-mine-profile-390.html'));await mini.locator('.profile-clubs-section').screenshot({path:path.join(out,'mini-mine-clubs-10-390.png')});
  await page.setViewportSize({width:820,height:700});
  await page.setContent('<html><head><style>body{margin:0;padding:16px;background:#e9ebef;font-family:system-ui}h1{font-size:20px;margin:0 0 10px}.row{display:flex;gap:16px}.cell{width:386px}h2{font-size:15px}.cell img{display:block;width:100%;border-radius:12px}</style></head><body><h1>个人资料 · 10 个跑团 · 双列压力场景</h1><div class="row"><div class="cell"><h2>Web 390px</h2><img src="'+data('web-mine-clubs-10-390.png')+'"></div><div class="cell"><h2>小程序源码镜像 390px</h2><img src="'+data('mini-mine-clubs-10-390.png')+'"></div></div></body></html>');
  await page.evaluate(()=>Promise.all([...document.images].map(image=>image.decode())));await page.screenshot({path:path.join(out,'ten-clubs-contact-390.png'),fullPage:true});
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
