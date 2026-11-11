/* Local evidence gallery. Reads existing reports/screenshots; optional image
 * comparisons use headless Chromium without network. Never starts a seed/API.
 */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

async function generateColorfulGallery(output, options = {}) {
  const out = path.resolve(ROOT, output || process.env.UI_AUDIT_OUT || 'design/previews/colorful-ui-20261111');
  const before = path.resolve(ROOT, process.env.UI_AUDIT_BEFORE || 'design/previews/bright-ui-20261111');
  if (out === before) throw new Error('Colorful evidence must not overwrite its bright-ui baseline');
  fs.mkdirSync(out, { recursive: true });
  const read = file => fs.existsSync(path.join(out, file)) ? JSON.parse(fs.readFileSync(path.join(out, file), 'utf8')) : null;
  const exists = file => fs.existsSync(path.join(out, file));
  const href = (file, label) => exists(file) ? '<a href="' + esc(file) + '">' + esc(label) + '</a>' : esc(label) + '（待生成）';
  let comparisons = read('comparison-report.json');
  if (!options.prepare) comparisons = await require('./ui-palette-comparison.cjs').generateComparisons(out, {
    before, labels: ['调整前 · 红白浅灰', '调整后 · 清爽点缀'], kind: 'Bright-ui baseline compared with current local source render; colorful surfaces and readable text reviewed separately'
  });
  const specs = [
    ['web', 'Web 页面与角色', 'web-report.json', 'views'],
    ['mini', '小程序 28 页与关键分支', 'mini-report.json', 'results'],
    ['mini-training', '小程序训练模板场景', 'mini-training-report.json', 'results'],
    ['admin', '后台流程', 'admin-browser-report.json', 'checks'],
    ['admin', '后台页面与状态', 'admin-ui-full-audit-report.json', 'checks']
  ];
  const sections = specs.map(([platform, title, file, collection]) => {
    const report = read(file), items = report?.[collection] || [];
    return { platform, title, file, report, items };
  });
  const table = (head, rows) => '<div class="table-wrap"><table><thead><tr>' + head.map(value => '<th>' + esc(value) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map(value => '<td>' + value + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  const screenshots = [];
  for (const section of sections) for (const item of section.items) {
    let screenshot = item.screenshot;
    if (section.platform === 'mini') screenshot = 'mini/' + item.route.replaceAll('/', '-') + (item.scenario === 'base' ? '' : '-' + item.scenario) + '-' + item.width + '.png';
    if (section.platform === 'mini-training') screenshot = 'mini-training/mini-' + item.scenario + '-' + item.width + '-viewport.png';
    if (screenshot && exists(screenshot)) screenshots.push({ platform: section.platform, id: item.id || item.route || item.scenario, width: item.width, scenario: item.scenario || item.role || '', passed: item.passed, screenshot, families: item.colorRichness?.pastelFamilies || [] });
  }
  for (const section of sections.filter(section => section.platform === 'admin')) for (const screenshot of section.report?.screenshots || []) {
    const file = 'admin/' + screenshot;
    if (exists(file) && !screenshots.some(item => item.screenshot === file)) screenshots.push({ platform: 'admin', id: screenshot, screenshot: file, width: Number(screenshot.match(/-(320|390|1440)\.png$/)?.[1]) || null, scenario: '', families: [] });
  }
  const manifest = { generatedAt: new Date().toISOString(), baseline: before, output: out,
    scope: 'Independent local visual review. Web uses disposable SQLite and localhost; Mini mirrors actual WXML/WXSS using synthetic data. No production access.',
    profile: 'colorful', direction: '参考白卡、顶部分区、鲜明小图标，保留跑团红色', brand: '#e1251b', expectedPastels: ['sky', 'mint', 'lilac', 'apricot-gold', 'coral'],
    readability: 'Hero gradient stops retain luminance >=0.65, dark text <=0.3 and calculated contrast >=4.5. Gradient presence alone never causes a dark-surface failure.',
    coverage: sections.map(section => ({ platform: section.platform, title: section.title, report: section.file, checks: section.items.length, passed: section.report?.passed ?? null })),
    comparisons: comparisons?.pairs?.length || 0, screenshots: screenshots.length,
    limitations: ['Browser mirrors are not WeChat device rendering.', 'DOM family observations cover first-viewport backgrounds; screenshot samples include icons and artwork.', 'More pastel pixels alone does not prove good composition, hierarchy or readability.', 'Missing audit sections remain explicitly pending; no previous screenshots are counted as current evidence.'] };
  fs.writeFileSync(path.join(out, 'color-review-manifest.json'), JSON.stringify(manifest, null, 2));
  const coverage = table(['范围', '结果', '检查数', '报告'], sections.map(section => [esc(section.title), section.report ? section.report.passed ? '通过' : '需处理' : '等待构建后验收', esc(section.items.length || '—'), href(section.file, 'JSON')]));
  const pairs = (comparisons?.pairs || []).map(pair => '<article class="pair"><h3>' + esc(pair.title) + '</h3><div class="labels"><span>调整前 · 红白浅灰</span><span>调整后 · 清爽点缀</span></div><a href="' + esc(pair.comparison) + '"><img loading="lazy" src="' + esc(pair.comparison) + '" alt="' + esc(pair.title) + '前后对比"></a><p>' + (pair.imagePalette ? pair.imagePalette.map(value => esc(value.label) + '：浅彩色采样 ' + (value.pastelFraction * 100).toFixed(1) + '%').join(' → ') : '') + '</p><p><a href="' + esc(pair.before) + '">原图</a> · <a href="' + esc(pair.after) + '">新图</a></p></article>').join('');
  const cards = screenshots.map(item => '<figure data-platform="' + esc(item.platform) + '" data-width="' + esc(item.width) + '"><a href="' + esc(item.screenshot) + '"><img loading="lazy" src="' + esc(item.screenshot) + '" alt="' + esc(item.id) + '"></a><figcaption><strong>' + esc(item.id) + '</strong><span>' + esc(item.width || '') + 'px · ' + esc(item.scenario) + '</span><span>' + esc(item.families.join(' · ')) + '</span></figcaption></figure>').join('');
  const issues = sections.flatMap(section => section.items.filter(item => item.passed === false).map(item => [esc(section.platform), esc(item.id || item.route || item.scenario || ''), esc(item.width || ''), esc(item.error || item.branchErrors?.join('; ') || item.expressionErrors?.join('; ') || '见完整 JSON')]));
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>清爽多彩 UI · 独立验收</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f7f8fc;color:#262626;font:14px/1.7 system-ui}main{max-width:1440px;margin:auto;padding:32px 24px}h1{font-size:30px;line-height:1.3}h2{font-size:22px;margin-top:36px}h3{font-size:16px;margin:0}a{color:#c9241c}p{margin:10px 0}.intro{padding:24px;border:1px solid #e4eaf2;border-radius:20px;background:linear-gradient(120deg,#fff2f0,#eaf4ff 52%,#f2edff)}.chips,.filters{display:flex;gap:8px;flex-wrap:wrap}.chips span,.filters button{padding:7px 12px;border-radius:8px;border:1px solid #e2e5eb;background:white;color:#333;font:13px system-ui}.chips span:nth-child(2){background:#eaf4ff}.chips span:nth-child(3){background:#e9f7f2}.chips span:nth-child(4){background:#f2edff}.chips span:nth-child(5){background:#fff4d7}.filters{position:sticky;top:0;z-index:2;padding:14px 0;background:#f7f8fc}.filters button{cursor:pointer}.filters button[aria-pressed=true]{border-color:#e1251b;background:#fff2f0;color:#bc2119}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;background:white}th,td{text-align:left;vertical-align:top;padding:11px 14px;border-bottom:1px solid #e9edf4}th{white-space:nowrap}.pairs{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:20px}.pair{background:white;border:1px solid #e4e8ef;border-radius:16px;padding:18px}.pair img{display:block;width:100%;height:auto}.labels{display:flex;justify-content:space-between;font-size:12px;color:#646b78;margin-top:8px}.pair p{font-size:12px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}figure{margin:0;background:white;border:1px solid #e4e8ef;border-radius:14px;overflow:hidden}figure img{display:block;width:100%;height:400px;object-fit:cover;object-position:top}figcaption{padding:12px;font-size:12px;overflow-wrap:anywhere}figcaption span{display:block;color:#737373}figure[hidden]{display:none}details{margin:18px 0}summary{cursor:pointer;font-weight:600}.contacts{display:flex;gap:12px;flex-wrap:wrap}.pending{color:#737373}code{font-size:12px}@media(max-width:540px){main{padding:20px 12px}.intro{padding:18px}h1{font-size:25px}.pairs{grid-template-columns:1fr}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}figure img{height:280px}}
    </style><main><div class="intro"><h1>清爽多彩 UI · 独立验收</h1><p>参考白卡、顶部分区、鲜明小图标，保留跑团红色。天空蓝、薄荷、柔紫与杏金点缀图标、标签和少量顶部主卡。</p><div class="chips"><span>珊瑚红 #e1251b</span><span>天空蓝</span><span>薄荷绿</span><span>柔紫</span><span>杏金</span></div><p>隔离本地验收，不访问生产。小程序为源码浏览器镜像，原生控件和系统导航仍需微信开发工具或真机确认。</p></div>
    <h2>验收覆盖</h2>${coverage}<p>${href('color-review-manifest.json', '审计口径')} · ${href('summary.json', '执行汇总')} · ${href('comparison-report.json', '对比来源与采样')}</p>
    <h2>重点页面前后对比</h2><p>左为 bright-ui 基线，右为本轮截图。浅彩色像素采样辅助判断色彩丰富度；颜色占比不作为审美通过标准。</p><div class="pairs">${pairs || '<p class="pending">等待本轮截图后生成，未替用旧截图。</p>'}</div>
    <h2>审美复核要点</h2><p>白卡组织列表与表单，顶部有限氛围色建立视觉重心，小图标与状态标签提供彩色点缀。检查红色主操作辨识度、浅彩色区域的深色文字和页脚按钮，避免连续大块渐变抢夺注意力。</p>
    <h2>全部页面截图</h2><div class="contacts">${href('mini/contact-320.png', 'Mini 28 页 320px 联系表')} · ${href('mini/contact-390.png', 'Mini 28 页 390px 联系表')} · ${href('mini/index.html', 'Mini 完整源码镜像')}</div><div class="filters"><button data-filter="all" aria-pressed="true">全部</button><button data-filter="web">Web</button><button data-filter="mini">Mini</button><button data-filter="mini-training">训练模板</button><button data-filter="admin">后台</button><button data-filter="320">320px</button><button data-filter="390">390px</button><button data-filter="1440">1440px</button></div><div class="grid">${cards || '<p class="pending">本轮截图待生成。</p>'}</div>
    <details><summary>失败项目（${issues.length}）</summary>${table(['端', '页面 / 场景', '宽度', '问题'], issues)}</details><p>生成于 ${esc(manifest.generatedAt)}。所有证据均保存在独立 colorful-ui 目录；bright-ui 基线保持原样。</p></main><script>document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));const filter=button.dataset.filter;document.querySelectorAll('figure[data-platform]').forEach(item=>{item.hidden=filter!=='all'&&item.dataset.platform!==filter&&item.dataset.width!==filter;});}));</script></html>`;
  fs.writeFileSync(path.join(out, 'index.html'), html);
  return manifest;
}

module.exports = { generateColorfulGallery };
if (require.main === module) generateColorfulGallery(undefined, { prepare: process.argv.includes('--prepare') }).then(report => console.log(JSON.stringify(report, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
