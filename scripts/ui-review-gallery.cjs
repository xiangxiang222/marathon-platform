const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const base = path.join(ROOT, 'design/previews');
function generate() {
  const web = JSON.parse(fs.readFileSync(path.join(base, 'ui-full-audit-report.json')));
  const admin = JSON.parse(fs.readFileSync(path.join(base, 'admin-ui-full-audit-report.json')));
  const mini = JSON.parse(fs.readFileSync(path.join(base, 'mini-ui-20261105/report.json')));
  const names = { home: '赛事首页', clubs: '跑团首页', sport: '运动记录', mine: '个人中心', calendar: '赛事日历', radar: '拿奖雷达', news: '赛事资讯', race: '赛事详情', 'club-overview': '跑团总览', 'activity-create': '发布训练', activity: '训练详情', 'club-create': '创建跑团', history: '我的跑史', feedback: '共创建议' };
  const entries = web.views.filter(v => v.screenshot).map(v => ({ area: '网页', width: v.width, title: names[v.id] || v.id, source: '真实本地 API · 隔离测试资料', file: '../' + v.screenshot }));
  for (const file of admin.screenshots) {
    const width = Number(file.match(/-(320|390|1024|1440)\.png$/)?.[1]);
    if (width) entries.push({ area: '后台', width, title: file.replace(/^admin-ui-/, '').replace(/\.png$/, ''), source: '浏览器交互 · 模拟接口资料', file: '../' + file });
  }
  for (const v of mini.results) entries.push({ area: '小程序', width: v.width, title: v.route.split('/').at(-1), source: 'WXML / WXSS 浏览器镜像 · 合成资料 · 非微信真机', file: '../mini-ui-20261105/' + v.route.replaceAll('/', '-') + '-' + v.width + '.png' });
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>赛历 · 全页面 UI 预览</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f5f5f5;color:#262626;font:14px/1.7 system-ui,-apple-system,"PingFang SC",sans-serif}header{padding:28px max(20px,calc((100% - 1400px)/2));background:linear-gradient(120deg,#fff2f0,#fff);border-bottom:1px solid #ededed}h1{font-size:28px;margin:0}header p{color:#737373;margin:8px 0 0}.filters{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:10px;padding:16px max(20px,calc((100% - 1400px)/2));background:#fff;border-bottom:1px solid #ededed}select,input{font:inherit;border:1px solid #ddd;border-radius:12px;min-height:44px;padding:8px 12px;background:#fff;color:#262626}input{flex:1;min-width:180px}main{max-width:1440px;margin:auto;padding:22px;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:22px}article{border:1px solid #ededed;border-radius:16px;background:#fff;overflow:hidden}h2{font-size:16px;margin:0}article>div{padding:14px 16px}small{font-size:12px;color:#737373}a{color:#e1251b}a:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #e1251b;outline-offset:3px}.image{display:block;background:#eee;height:520px;overflow:hidden;border-top:1px solid #ededed}.image img{display:block;width:100%;height:auto}#count{align-self:center;font-size:13px;color:#737373}footer{padding:25px;text-align:center;color:#737373}</style>
<header><h1>全页面 UI 预览</h1><p>2026-11-05 · 红白暖灰、清晰文字、统一表单与操作。点击截图查看完整页面。</p><p><a href="../../../docs/跑团全量测试与全页面UI改版报告.md">查看完整验收报告</a> · 网页与后台截图来自 Chromium；小程序为源码布局镜像。</p></header>
<div class="filters"><select id="area" aria-label="选择端"><option>网页</option><option>后台</option><option>小程序</option></select><select id="width" aria-label="选择宽度"><option>390</option><option>320</option><option>1024</option><option>1440</option></select><input id="search" type="search" placeholder="搜索页面名称" aria-label="搜索页面"><span id="count"></span></div><main id="pages"></main><footer>部分截图仅保存 390px 全页面，其他尺寸保留重点页；完整三宽度检查结果见 JSON 报告。</footer>
<script>const entries=${JSON.stringify(entries).replaceAll('<', '\\u003c')};const area=document.getElementById('area'),width=document.getElementById('width'),search=document.getElementById('search'),pages=document.getElementById('pages');function render(){pages.replaceChildren();const list=entries.filter(v=>v.area===area.value&&v.width===Number(width.value)&&v.title.toLowerCase().includes(search.value.toLowerCase()));document.getElementById('count').textContent=list.length+' 张截图';for(const v of list){const card=document.createElement('article'),copy=document.createElement('div'),title=document.createElement('h2'),note=document.createElement('small'),link=document.createElement('a'),img=document.createElement('img');title.textContent=v.title;note.textContent=v.source;copy.append(title,note);link.className='image';link.href=v.file;link.target='_blank';link.rel='noopener';img.src=v.file;img.alt=v.title+' '+v.width+'px';img.loading='lazy';link.append(img);card.append(copy,link);pages.append(card)}}for(const el of[area,width,search])el.addEventListener('input',render);render();</script></html>`;
  fs.writeFileSync(path.join(base, 'ui-refresh/index.html'), html);
  return { screenshots: entries.length };
}
module.exports = generate;
if (require.main === module) console.log(generate());
