const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.resolve(root, process.env.UI_AUDIT_OUT || 'design/previews/bright-ui-20261111');
fs.mkdirSync(out, { recursive: true });
const read = name => { const file = path.join(out, name); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; };
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const exists = name => fs.existsSync(path.join(out, name));
const status = report => report ? report.passed ? '通过' : '发现问题，查看报告' : '等待验收';
const link = (name, title) => exists(name) ? '<a href="' + esc(name) + '">' + esc(title) + '</a>' : esc(title) + '（待生成）';
const image = (name, title) => exists(name) ? '<figure><a href="' + esc(name) + '"><img loading="lazy" src="' + esc(name) + '" alt="' + esc(title) + '"></a><figcaption>' + esc(title) + '</figcaption></figure>' : '';
const summary = read('summary.json'), comparison = read('comparison-report.json');
const web = read('web-report.json'), mini = read('mini-report.json'), training = read('mini-training-report.json');
const admin = read('admin-browser-report.json'), adminUi = read('admin-ui-full-audit-report.json');
const webItems = web?.views || [];
const miniItems = mini?.results || [];
const adminImages = [...new Set([...(admin?.screenshots || []), ...(adminUi?.screenshots || [])])];
const table = (head, rows) => '<table><thead><tr>' + head.map(value => '<th>' + esc(value) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map(value => '<td>' + value + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
const reportRows = [
  ['Web 所有路由与角色', web, 'web-report.json', web?.checkCount],
  ['后台分区与权限流程', admin, 'admin-browser-report.json', admin?.checks?.length],
  ['后台编辑、空态、错误和导航', adminUi, 'admin-ui-full-audit-report.json', adminUi?.checks?.length],
  ['Mini 28 页与关键分支', mini, 'mini-report.json', miniItems.length || null],
  ['Mini 模板实际 Page 场景', training, 'mini-training-report.json', training?.results?.length]
].map(([name, report, file, count]) => [esc(name), esc(status(report)), esc(count || '—'), link(file, 'JSON 报告')]);
const webRows = webItems.map(item => [esc(item.id), esc(item.route), esc(item.role), esc(item.width), esc(item.passed ? '通过' : item.error || '未通过'), item.screenshot ? link(item.screenshot, '截图') : '—']);
const miniRows = miniItems.map(item => {
  const base = 'mini/' + item.route.replaceAll('/', '-') + (item.scenario === 'base' ? '' : '-' + item.scenario) + '-' + item.width;
  return [esc(item.route), esc(item.scenario), esc(item.width), esc(item.passed ? '通过' : '未通过'), link(base + '.png', 'PNG') + ' · ' + link(base + '.html', 'HTML')];
});
const trainingRows = (training?.results || []).map(item => [esc(item.scenario), esc(item.width), esc(item.passed ? '通过' : '未通过'), link('mini-training/mini-' + item.scenario + '-' + item.width + '-viewport.png', '首屏') + ' · ' + link('mini-training/mini-' + item.scenario + '-' + item.width + '.png', '整页')]);
const paletteRows = [['Web', web?.views?.[0]?.palette], ['Mini', miniItems[0]?.palette]].filter(([, palette]) => palette).map(([name, palette]) => [esc(name), ...['accent', 'background', 'surface', 'ink', 'secondary', 'border'].map(key => '<code>' + esc(palette[key]) + '</code>')]);
const comparisons = (comparison?.pairs || []).map(item => image(item.comparison, item.title + '：上轮 / 当前')).join('');
const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>红白浅灰配色验收 · 20261111</title><style>' +
  'body{margin:0;background:#f5f5f5;color:#262626;font:14px/1.7 system-ui}main{max-width:1380px;margin:auto;padding:32px 24px}h1{font-size:28px}h2{margin-top:40px;font-size:22px}a{color:#e1251b}p{max-width:1000px}.note{padding:18px 22px;background:white;border:1px solid #ebebed;border-radius:14px}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;background:white}th,td{padding:10px 12px;border-bottom:1px solid #ebebed;text-align:left;vertical-align:top}th{white-space:nowrap}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}figure{margin:0;border:1px solid #ebebed;border-radius:12px;background:white;overflow:hidden}figure img{display:block;width:100%;height:360px;object-fit:cover;object-position:top}figcaption{padding:10px 12px;font-size:12px}.comparison-grid{grid-template-columns:repeat(auto-fit,minmax(360px,1fr))}.comparison-grid figure img{height:auto;object-fit:contain}.contact img{max-width:100%;height:auto;border:1px solid #ebebed}summary{cursor:pointer;padding:14px 0;font-weight:600}code{font-size:12px}@media(max-width:500px){main{padding:20px 12px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}figure img{height:260px}}' +
  '</style></head><body><main><h1>红白浅灰配色验收 · 20261111</h1><div class="note">本轮恢复原版红、白、浅灰色板并做少量视觉细调，保留现有页面布局与业务流程。截图来自本地隔离环境：Web 使用一次性真实 SQLite 和本机 API；后台 API 由内存资料响应；Mini 使用当前源码与合成展示资料。本报告未访问或修改生产环境。</div><p>' + link('README.md', '验收范围、命令与边界') + ' · ' + link('../../控件与页面规范.md', '视觉与控件规范') + '</p>' +
  '<h2>实际色板</h2><p>目标主色：<code>' + esc(summary?.expectedAccent || process.env.UI_EXPECTED_ACCENT || '#e1251b') + '</code>。下表读取当前渲染页面的 CSS 变量。</p><div class="table-wrap">' + table(['端', '主色', '背景', '卡片', '正文', '次级', '边框'], paletteRows) + '</div><h2>核心页面前后对照</h2><p>左为上轮偏暗色板，右为当前红白浅灰。取各页顶部 900px；桌面后台按比例缩小。对照用于配色检查，不代表本轮重新构建布局。</p><div class="grid comparison-grid">' + comparisons + '</div><p>' + link('comparison-report.json', '对照来源清单') + '</p><h2>结果</h2><div class="table-wrap">' + table(['范围', '状态', '检查数', '证据'], reportRows) + '</div>' +
  '<h2>Mini 全 28 页</h2><p>缩略图只截取各页顶部。每页完整截图与关键分支请在下表打开。原生选择器、输入、开关与自定义页头为浏览器近似表现。</p><div class="contact">' + (exists('mini/contact-320.png') ? '<a href="mini/contact-320.png"><img src="mini/contact-320.png" alt="28 页 320px 全页联系表"></a>' : '等待生成联系表') + '</div><p>' + link('mini/contact-390.png', '390px 全页联系表') + ' · ' + link('mini/index.html', 'Mini 源码镜像原始索引') + '</p><details><summary>Mini 路由与权限 / 空态 / 长标题分支</summary><div class="table-wrap">' + table(['路由', '状态', '宽度', '结果', '预览'], miniRows) + '</div></details>' +
  '<h2>训练发布与模板</h2><p>包含模板库、草稿、分组、预览、模板编辑、普通成员、加载失败、空模板库、长团名、保存失败与命名弹窗。</p><div class="grid">' + ['fresh', 'groups', 'sheet', 'template-error', 'long-name', 'save-error'].map(name => image('mini-training/mini-' + name + '-320-viewport.png', name + ' / 320px')).join('') + '</div><details><summary>全部训练模板分支</summary><div class="table-wrap">' + table(['场景', '宽度', '结果', '预览'], trainingRows) + '</div></details>' +
  '<h2>Web 全路由</h2><p>320px、390px、1440px；团长、管理员、成员与游客分别验收。辅助 caption 可为 11px，正文和表单标签仍需按设计层级目检。</p><div class="grid">' + ['home', 'clubs', 'club-overview', 'activity-create', 'sport', 'mine'].map(id => { const item = webItems.find(item => item.id === id && item.width === 390); return item?.screenshot ? image(item.screenshot, id + ' / 390px') : ''; }).join('') + '</div><details><summary>Web 路由与角色检查清单</summary><div class="table-wrap">' + table(['页面', '路由', '角色', '宽度', '结果', '预览'], webRows) + '</div></details>' +
  '<h2>后台全分区</h2><p>运营总览、内容审核、赛事库、官网同步、赛事资讯、跑者、跑团、申请审核、运动记录、积分礼品、合作物资、账号权限、反馈、组织身份核验、个人信息权利及登录；含窄屏菜单、编辑、加载错误、空态和权限流程。</p><details><summary>展开后台全部截图（' + adminImages.length + '）</summary><div class="grid">' + adminImages.map(file => image('admin/' + file, file.replace(/\.png$/, ''))).join('') + '</div></details><p>生成时间：' + esc(new Date().toISOString()) + '</p></main></body></html>';
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('UI gallery: ' + path.join(out, 'index.html'));
