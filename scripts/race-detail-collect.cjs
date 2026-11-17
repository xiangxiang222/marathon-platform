#!/usr/bin/env node
/**
 * Collect complete public race documents, packages and image evidence.
 * No database writes. Existing source text, images and OCR are cached by URL/hash.
 * Usage: node scripts/race-detail-collect.cjs --url https://reg.zuicool.com/77675 --name '2026重庆垫江明月山越野赛' --out /tmp/race-detail/pilot.json --ocr
 * Batch: --inventory inventory.json --evidence zuicool-evidence.json --out-dir DIR [--ocr]
 * The inventory is a snapshot of the authorized published/pending scope, never a discovery feed.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clean = value => String(value || '').replace(/\r/g, '').replace(/[ \t\u00a0]+/g, ' ').replace(/\n[ \t]*\n+/g, '\n\n').trim();
const textKey = value => clean(value).replace(/[\s，,。.!！:：；;]/g, '');
function uniqueText(values) {
  const seen = new Set();
  return values.map(clean).filter(value => { const key = textKey(value); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}
function publicUrl(value, base) {
  try { const url = new URL(value, base); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || /^(localhost|127\.|0\.|169\.254\.|10\.|192\.168\.|\[::)/i.test(url.hostname)) return ''; if (url.protocol === 'http:') url.protocol = 'https:'; return url.href; } catch (_) { return ''; }
}
function statusOf(text, { header = false } = {}) {
  const value = clean(text);
  // Cancellation must be an explicit event statement; equipment/age prohibitions are not cancellation.
  if (/(?:赛事|比赛|活动)(?:正式|决定|现已|已|因故)?取消(?!参赛|资格|成绩)|(?:决定|宣布|现已|正式)取消(?:本届|本次|举办|比赛|赛事)|取消公告/.test(value)) return 'cancelled';
  if (/已报满|报名已满|名额已满|已售罄/.test(value)) return 'sold_out';
  if (/已关闭|已截止|报名结束|报名已结束|停止报名/.test(value)) return 'closed';
  if (/报名中|立即报名|我要报名|开放报名/.test(value)) return 'open';
  if (header && /报名未开始|暂未开放报名|即将报名/.test(value)) return 'not_open';
  return 'unknown';
}
function sameEdition(expected, actual) {
  if (!expected || !actual) return true;
  const years = value => value.match(/20\d{2}/g) || [];
  if (years(expected).length && years(actual).length && !years(expected).some(y => years(actual).includes(y))) return false;
  const key = value => value.replace(/报名须知|竞赛规程|参赛指南|比赛规程|赛事详情|报名指南|竞赛办法|官方网站|20\d{2}|马拉松|半程|赛事|越野赛|越野跑|公路跑|一键报名|报名|最酷|\s|[^\u4e00-\u9fffA-Za-z0-9]/g, '').toLowerCase();
  const a = key(expected), b = key(actual);
  if (!a || !b || a.includes(b) || b.includes(a)) return true;
  const bigrams = s => new Set([...s].slice(1).map((_, i) => s.slice(i, i + 2)));
  const aa = bigrams(a), bb = bigrams(b), overlap = [...aa].filter(x => bb.has(x)).length;
  return overlap / Math.max(1, Math.min(aa.size, bb.size)) >= 0.5;
}
function registrationDates(text) {
  const empty = { opensAt: '', closesAt: '' };
  const value = clean(text);
  const labels = /报名时间|报名起止(?:时间)?|报名日期/g;
  let match;
  const dateToken = '(20\\d{2})[年.\\/-]\\s*(\\d{1,2})[月.\\/-]\\s*(\\d{1,2})日?(?:[ \\t]*([0-2]?\\d)[:：]([0-5]\\d)(?:[:：]([0-5]\\d))?)?';
  const endToken = '(?:(20\\d{2})[年.\\/-]\\s*)?(?:(\\d{1,2})[月.\\/-]\\s*)?(\\d{1,2})日?(?:[ \\t]*([0-2]?\\d)[:：]([0-5]\\d)(?:[:：]([0-5]\\d))?)?';
  while ((match = labels.exec(value))) {
    const lineStart = value.lastIndexOf('\n',match.index) + 1;
    if (/精英|早鸟|早乌|缴费|退费/.test(value.slice(lineStart,match.index))) continue;
    // A date must immediately follow the registration label. Never scan into a
    // later race-date, postponement, elite-application or payment paragraph.
    const tail = value.slice(labels.lastIndex).replace(/^[ \	]*[（(][^）)\n]{0,20}[）)]/, '').replace(/^[：:\s—-]*(?:为|自|从)?\s*/, '');
    const dates = new RegExp('^'+dateToken+'\\s*[-—～~–至]\\s*'+endToken).exec(tail);
    if (!dates) continue;
    const [,y,month,d,h,mi,sec,ey,em,ed,eh,emi,esec] = dates;
    const day = (yy,mm,dd) => { const s = yy+'-'+String(mm).padStart(2,'0')+'-'+String(dd).padStart(2,'0'); const t = new Date(s+'T00:00:00Z'); return Number.isFinite(t.getTime()) && t.toISOString().slice(0,10) === s ? s : ''; };
    const start = day(y,month,d), end = day(ey || y,em || month,ed);
    const atTime = (date,h,m,s) => h == null ? date : Number(h) < 24 ? date+'T'+String(h).padStart(2,'0')+':'+m+':'+(s||'00')+'+08:00' : Number(h)===24&&m==='00'&&(!s||s==='00') ? new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10)+'T00:00:00+08:00' : '';
    if (start && end && start <= end) return {opensAt:atTime(start,h,mi,sec),closesAt:atTime(end,eh,emi,esec)};
  }
  return empty;
}
function ocrRows(ocr) {
  const source = (ocr?.lines || []).filter(line => line.confidence == null || line.confidence >= .35);
  if (!source.length || !source.every(line => Number.isFinite(line.x) && Number.isFinite(line.y))) return clean(ocr?.text).split('\n');
  const rows = [];
  for (const line of [...source].sort((a,b) => a.y - b.y || a.x - b.x)) {
    const center = line.y + line.height / 2;
    const row = rows.slice(-5).find(row => Math.abs(row.center - center) <= Math.max(4, Math.min(row.height,line.height) * .4));
    if (row) row.lines.push(line);
    else rows.push({center,height:line.height,lines:[line]});
  }
  return rows.map(row => row.lines.sort((a,b) => a.x - b.x).map((line,i,lines) => (i && line.x - (lines[i-1].x + lines[i-1].width) > Math.min(line.height,lines[i-1].height) * .7 ? ' | ' : i ? ' ' : '') + line.text).join(''));
}
function readableOcr(ocr) {
  const raw = clean(ocr?.text);
  if (!raw) return '';
  const kept = [];
  for (const line of ocrRows(ocr)) {
    const text = clean(line);
    if (!text || /^[◎○◯□■●◆◇vV√✓\s]+$/.test(text)) continue;
    if (kept.slice(-4).some(prior => textKey(prior) === textKey(text))) continue;
    kept.push(text);
  }
  const text = kept.join('\n');
  // Decorative posters/logos stay in the evidence archive, without corrupt OCR
  // mixed into the regulations. Tables retain their left-to-right row order.
  if (!/报名时间|报名费用|竞赛规程|参赛资格|竞赛办法|年龄要求|领物|关门时间|强制装备|退费|比赛日程|奖励办法|赛道|路线|海拔|爬升|补给|检查点|出发时间|报名截止/.test(text) && text.length < 350) return '';
  return text;
}
function usefulMedia(image) {
  const text = [image.alt,image.context,image.caption,image.ocr?.text,image.ocrText].filter(Boolean).join('\n');
  if (/logo|avatar|wx-share|qrcode|icon|weixin|service|footer|bannerad/i.test(image.url || '')) return false;
  if (image.kind === 'route' || /路线|线路|赛道|海拔|爬升|日程|检录|领物|报到|报名|费用|竞赛规程|参赛资格|竞赛办法|关门|装备|奖励|退费|退赛|年龄要求|出发时间|补给|检查点|交通|停车|接驳/.test(text)) return true;
  return readableOcr(image.ocr || {text:image.ocrText}).length >= 350;
}
function registrationOfDocuments(docs, sections) {
  const dates = registrationDates(sections.map(section => section.title + '\n' + section.text).join('\n'));
  // The current registration header publishes a deadline even when the full
  // start date was not supplied. A phase/elite/payment deadline never substitutes.
  const date = '(20\\d{2})[年.\\/-]\\s*(\\d{1,2})[月.\\/-]\\s*(\\d{1,2})日?(?:[ \\t]*([0-2]?\\d)[:：]([0-5]\\d)(?:[:：]([0-5]\\d))?)?';
  for (const doc of docs) {
    if (!/^https:\/\/reg\.zuicool\.com\/\d+\/?$/.test(doc.url)) continue;
    for (const line of clean(doc.header).split('\n')) {
      if (/精英|早鸟|早乌|缴费|退费/.test(line)) continue;
      const match = new RegExp('报名截止(?:时间|日期)?[：:\\s]*'+date).exec(line);
      if (!match) continue;
      const [,year,month,day,hour,minute,second] = match;
      const stamp = year + '-' + month.padStart(2,'0') + '-' + day.padStart(2,'0');
      const valid = new Date(stamp+'T00:00:00Z');
      if (!Number.isFinite(valid.getTime()) || valid.toISOString().slice(0,10) !== stamp || hour && Number(hour)>23) continue;
      dates.closesAt = stamp + (hour == null ? '' : 'T'+hour.padStart(2,'0')+':'+minute+':'+(second||'00')+'+08:00');
      break;
    }
    if (dates.closesAt) break;
  }
  return dates;
}
function groupOf(raw) {
  const description = clean(raw.description || '');
  const name = clean(raw.name).replace(/\s*[（(]已报满[）)]/g, '').trim();
  const take = regex => { const m = regex.exec(description); return m ? m[1] : ''; };
  const numeric = regex => { const s = take(regex); return s ? Number(s) : null; };
  const advertised = /([\d.]+)\s*(公里|[kK][mM]?)/.exec(name);
  const family = /([一二三四五六七八九十\d]+)大([一二三四五六七八九十\d]+)小/.exec(name);
  const price = String(raw.price || '').replace(/[,，]/g, '').match(/\d+(?:\.\d+)?/);
  const form = /亲子|家庭/.test(name) ? 'family' : /双人|情侣/.test(name) ? 'pair' : /团队|团体/.test(name) ? 'team' : /个人/.test(name) ? 'individual' : '';
  const group = { name, description, form,
    advertisedDistanceKm: advertised ? Number(advertised[1]) : null,
    actualDistanceKm: numeric(/(?:实际(?:里程|距离)|赛道(?:里程|距离)|出赛道里程)[：:\s]*([\d.]+)\s*(?:km|公里)/i),
    ascentM: numeric(/(?:累计)?爬升[：:\s]*([\d.]+)\s*(?:m|米)/i), descentM: numeric(/(?:累计)?下降[：:\s]*([\d.]+)\s*(?:m|米)/i),
    quota: take(/[：:]?\s*(\d+)\s*(?:人|组|队)/), startsAt: take(/(?:出发时间|发时间|起跑时间)[：:\s]*([^，,；;\n]+)/),
    cutoffAt: take(/关门时间[：:\s]*([^，,；;\n]+)/), cutoffHours: numeric(/关门时长[：:\s]*([\d.]+)\s*(?:h|小时)/i),
    itraPoints: numeric(/ITRA积分[：:\s]*([\d.]+)/i), status: statusOf([raw.name,raw.status || raw.text || ''].join(' '),{header:true}),
    // A live package price alone does not prove that this is the ordinary phase.
    fees: price ? [{ label: /亲子|家庭/.test(name) ? '亲子套餐价' : '报名页价格', amount: Number(price[0]), currency: 'CNY', unit: form === 'family' ? '套餐' : ['pair','team'].includes(form) ? '' : '人', sourceUrl: raw.url || '' }] : [], sourceUrl: raw.url || '' };
  const number = value => /^\d+$/.test(value) ? Number(value) : '零一二三四五六七八九十'.indexOf(value);
  if (family && family.slice(1).every(value => number(value)>0)) group.participants = { adults: number(family[1]), children: number(family[2]) };
  return group;
}
function splitSections(text, fallback = '赛事概况') {
  const output = []; let title = fallback, lines = [];
  const flush = () => { const value = clean(lines.join('\n')); if (value) output.push({ title, text: value }); lines = []; };
  for (const line of clean(text).split('\n')) {
    const heading = /^(?:[一二三四五六七八九十]+[、．.]|[（(][一二三四五六七八九十]+[）)]|\d+[、．.])\s*(?:组织机构|赛事概况|参赛资格|报名|年龄|健康|资格|禁止|领物|选手领物|比赛日程|线路情况|路线|竞赛办法|奖励|装备|物资|退|交通|住宿|精英|邮寄|参赛包)/.test(line) && line.length < 55 && !/[：:]/.test(line);
    if (heading) { flush(); title = line; } else lines.push(line);
  }
  flush(); return output;
}
async function extractDocument(page, html, url, render = false) {
  if (render) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(500);
    await page.evaluate(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); let stable = 0, previous = 0; for (let n = 0; n < 60 && stable < 3; n++) { window.scrollBy(0, 1300); await sleep(90); const height = document.body.scrollHeight; stable = window.scrollY + innerHeight >= height && height === previous ? stable + 1 : 0; previous = height; } document.querySelectorAll('details').forEach(e => e.open = true); });
  } else {
    await page.route('**/*', route => route.abort());
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.unroute('**/*');
  }
  return page.evaluate(({ url }) => {
    const clean = s => String(s || '').replace(/\r/g, '').replace(/[ \t\u00a0]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
    const absolute = value => { try { return new URL(value, url).href; } catch (_) { return ''; } };
    const textOf = node => {
      const clone = node.cloneNode(true);
      clone.querySelectorAll('script,style,noscript,nav,footer,.floating-guide,.wechat-service-btn,.navbar,.event-pkgs,.pkgs-list').forEach(x => x.remove());
      clone.querySelectorAll('br').forEach(e => e.replaceWith('\n'));
      clone.querySelectorAll('tr').forEach(tr => { const cells = [...tr.querySelectorAll(':scope > th,:scope > td')]; tr.replaceWith('\n' + cells.map(c => clean(c.textContent)).join(' | ') + '\n'); });
      clone.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li,section').forEach(e => e.append('\n'));
      return clean(clone.textContent);
    };
    const specific = [...document.querySelectorAll('.reg_race-description,.event-desc_lead,.article-content,.article_content,.rich_media_content,article')];
    const main = specific.length ? specific : [document.querySelector('main') || document.querySelector('.main-content') || document.body];
    const title = clean(document.querySelector('.reg-race-block h4,h1,.article-title,.article_title')?.textContent || document.title).replace(/\s*[-|]\s*(?:一键报名|最酷|ZUICOOL).*$/i, '').replace(/\s*(已关闭|已截止)$/, '').trim();
    const header = clean(document.querySelector('.reg-race-block,.event-nav2,.event-tab2')?.textContent || '');
    const docs = main.map(textOf);
    const packages = [...document.querySelectorAll('.reg-race-categories tbody tr,.event-pkgs .pkg2')].map(row => ({
      name: clean(row.querySelector('h5,h4.name,.name h4')?.textContent), description: clean(row.querySelector('.highlight_short')?.textContent),
      price: clean(row.querySelector('td.fee p,.price')?.textContent), status: clean(row.querySelector('strong')?.textContent || row.querySelector('.reg-btn,.fee a')?.textContent), text: clean(row.textContent),
      url: absolute(row.querySelector('a[href]')?.getAttribute('href') || '')
    })).filter(p => p.name);
    const images = main.flatMap(node => [...node.querySelectorAll('img')].map(img => ({
      url: absolute(img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src') || img.getAttribute('src') || ''),
      alt: clean(img.getAttribute('alt')), width: Number(img.getAttribute('width') || img.naturalWidth), height: Number(img.getAttribute('height') || img.naturalHeight),
      context: clean(img.parentElement?.previousElementSibling?.textContent || '').slice(-200), sourceUrl: url
    })));
    const links = [...document.querySelectorAll('a[href]')].map(a => ({ url: absolute(a.getAttribute('href')), label: clean(a.textContent) })).filter(a => /更多赛事信息|竞赛规程|报名须知|参赛指南|赛事规程|比赛规程|附件|下载|赛事详情/.test(a.label) || /\.(?:pdf|docx?)(?:\?|$)/i.test(a.url));
    return { url, title, header, text: docs.join('\n\n'), packages, images, links, rendered: !!document.querySelector('script[src]') };
  }, { url });
}
class Collector {
  constructor(options = {}) {
    this.root = options.cacheDir || path.join(os.tmpdir(), 'marathon-race-detail-cache');
    for (const dir of ['html', 'images', 'ocr', 'documents']) fs.mkdirSync(path.join(this.root, dir), { recursive: true });
    this.ocr = options.ocr || false; this.refresh = options.refresh !== false; this.failures = []; this.options = options;
  }
  async start() { const { chromium } = require('playwright-core'); this.browser = await chromium.launch({ executablePath: this.options.browser || process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome'), headless: true }); }
  async stop() { if (this.browser) await this.browser.close(); if (this.worker) await this.worker.terminate(); }
  async download(url, kind, { cachedHtml } = {}) {
    const safe = publicUrl(url); if (!safe) throw new Error('unsupported_public_url');
    const extension = kind === 'html' ? '.html' : kind === 'document' ? '.pdf' : /\.(png|webp)(?:\?|$)/i.exec(safe)?.[0].split('?')[0].toLowerCase() || '.jpg';
    const file = path.join(this.root, kind === 'html' ? 'html' : kind === 'document' ? 'documents' : 'images', hash(safe) + extension);
    if (fs.existsSync(file) && (kind !== 'html' || !this.refresh)) return { file, bytes: fs.readFileSync(file), status: 200, cached: true };
    try {
      const response = await fetch(safe, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; MarathonRaceDetail/1.0)', accept: '*/*' } });
      if (!response.ok) throw new Error('HTTP_' + response.status);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > (kind === 'html' ? 8 : 30) * 1024 * 1024) throw new Error('document_size_limit');
      const temporary = file+'.'+process.pid+'.tmp'; fs.writeFileSync(temporary, buffer); fs.renameSync(temporary,file); return { file, bytes: buffer, status: response.status, cached: false };
    } catch (error) {
      // A prior captured document is evidence, not proof of a current status.
      const fallback = fs.existsSync(file) ? file : cachedHtml && fs.existsSync(cachedHtml) ? cachedHtml : null;
      if (fallback) return { file: fallback, bytes: fs.readFileSync(fallback), status: null, cached: true, error: error.message };
      throw error;
    }
  }
  async recognize(file) {
    const key = hash(fs.readFileSync(file)), cache = path.join(this.root, 'ocr', key + '.json');
    if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache));
    let result;
    if (process.platform === 'darwin') {
      const source = path.join(__dirname, 'race-detail-ocr.swift');
      const binary = path.join(this.root, 'ocr', 'vision-' + hash(fs.readFileSync(source)).slice(0, 16));
      if (!fs.existsSync(binary)) { const temporary = binary+'.'+process.pid+'.tmp'; const build = spawnSync('swiftc', [source, '-o', temporary], { timeout: 120000, encoding: 'utf8' }); if (build.status !== 0) throw new Error('vision_build_failed:' + build.stderr); fs.renameSync(temporary,binary); }
      const run = spawnSync(binary, [file], { timeout: 120000, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
      if (run.status !== 0) throw new Error('vision_ocr_failed:' + run.stderr);
      result = JSON.parse(run.stdout);
    } else {
      if (!this.worker) {
        const { createWorker } = require('../server/node_modules/tesseract.js');
        const languageDir = path.join(this.root, 'ocr', 'languages'); fs.mkdirSync(languageDir, { recursive: true });
        for (const code of ['chi_sim', 'eng']) fs.copyFileSync(path.join(path.dirname(require.resolve('../server/node_modules/@tesseract.js-data/' + code)), '4.0.0_best_int', code + '.traineddata.gz'), path.join(languageDir, code + '.traineddata.gz'));
        this.worker = await createWorker('chi_sim+eng', 1, { langPath: languageDir, cacheMethod: 'none' });
      }
      const recognized = await this.worker.recognize(file); result = { engine: 'tesseract-local', text: recognized.data.text, confidence: recognized.data.confidence };
    }
    const temporary = cache+'.'+process.pid+'.tmp'; fs.writeFileSync(temporary, JSON.stringify(result)); fs.renameSync(temporary,cache); return result;
  }
  async document(url, cachedHtml) {
    if (/\.pdf(?:\?|$)/i.test(url)) {
      const downloaded = await this.download(url,'document');
      if (downloaded.bytes.subarray(0,4).toString() !== '%PDF') throw new Error('attachment_not_pdf');
      if (process.platform !== 'darwin') {
        const run = spawnSync('pdftotext',['-layout',downloaded.file,'-'],{encoding:'utf8',timeout:60000,maxBuffer:30*1024*1024});
        if (run.status !== 0) throw new Error('pdf_reader_unavailable');
        return {url,title:'',header:'',text:run.stdout,packages:[],images:[],links:[],capture:{at:new Date().toISOString(),method:'pdf-text',file:downloaded.file,fresh:!downloaded.cached}};
      }
      const source = path.join(__dirname,'race-detail-pdf.swift'), binary = path.join(this.root,'documents','pdf-'+hash(fs.readFileSync(source)).slice(0,16));
      if (!fs.existsSync(binary)) { const temporary=binary+'.'+process.pid+'.tmp'; const build=spawnSync('swiftc',[source,'-o',temporary],{encoding:'utf8',timeout:120000}); if(build.status!==0)throw new Error('pdf_reader_build_failed:'+build.stderr);fs.renameSync(temporary,binary); }
      const output=path.join(this.root,'documents',hash(downloaded.bytes));
      const run=spawnSync(binary,[downloaded.file,output],{encoding:'utf8',timeout:120000,maxBuffer:30*1024*1024});if(run.status!==0)throw new Error('pdf_reader_failed:'+run.stderr);
      const parsed=JSON.parse(run.stdout);
      return {url,title:'',header:'',text:parsed.pages.map(p=>'第'+p.number+'页\n'+p.text).join('\n\n'),packages:[],images:parsed.pages.filter(p=>p.image).map(p=>({url:url+'#page='+p.number,sourceUrl:url,localFile:p.image,alt:'PDF第'+p.number+'页'})),links:[],capture:{at:new Date().toISOString(),method:'pdf-full-pages',file:downloaded.file,fresh:!downloaded.cached}};
    }
    const page = await this.browser.newPage();
    try {
      const downloaded = await this.download(url, 'html', { cachedHtml });
      let doc = await extractDocument(page, downloaded.bytes.toString('utf8'), url);
      let mode = 'html';
      if (!doc.text || doc.text.length < 100 && !doc.images.length) {
        try { doc = await extractDocument(page, null, url, true); mode = 'rendered-scroll'; } catch (error) { this.failures.push({ url, step: 'render', error: error.message }); }
      }
      return { ...doc, capture: { at: new Date().toISOString(), method: mode, file: downloaded.file, fresh: !downloaded.cached, error: downloaded.error || '' } };
    } finally { await page.close(); }
  }
  async collect({ name = '', id = '', urls, cached = {} }) {
    const failuresStart = this.failures.length, docs = [], queue = [...new Set(urls.map(u => publicUrl(u)).filter(Boolean))], visited = new Set();
    const isZuicool = queue.some(u => /(?:reg\.)?zuicool\.com\//.test(u));
    while (queue.length) {
      const url = queue.shift(); if (visited.has(url)) continue; visited.add(url);
      try {
        const doc = await this.document(url, cached[url]);
        // Exact title identity prevents a linked login/generic calendar from replacing this event.
        if (/^(?:登录|登陆|用户登录|请先登录|验证码|安全验证)/.test(doc.title)) { this.failures.push({ url, step: 'access', error: 'login_or_verification_required', title: doc.title }); continue; }
        if (!sameEdition(name, doc.title)) { this.failures.push({ url, step: 'identity', error: 'edition_name_or_locality_mismatch', title: doc.title }); continue; }
        docs.push(doc);
        for (const pkg of doc.packages) {
          const reg = /^https:\/\/reg\.zuicool\.com\/\d+/.exec(pkg.url);
          if (reg && !visited.has(reg[0]) && !queue.includes(reg[0])) queue.push(reg[0]);
          if (reg && !visited.has(pkg.url) && !queue.includes(pkg.url)) queue.push(pkg.url);
        }
        for (const link of doc.links) {
          const candidate = publicUrl(link.url, url);
          if (!candidate || visited.has(candidate) || queue.includes(candidate)) continue;
          // Relevant same-site documents, or explicit official attachments. Never crawl navigation/search feeds.
          if (/\.(?:pdf)(?:\?|$)/i.test(candidate) || /\/event\/\d+\/?$/.test(new URL(candidate).pathname) || new URL(candidate).hostname === new URL(url).hostname && /规程|须知|指南|附件|下载|详情/.test(link.label)) queue.push(candidate);
        }
        if (visited.size >= 20 && queue.length) {
          const deferred = queue.filter(next => !/^https:\/\/reg\.zuicool\.com\/\d+\/\d+\/?$/.test(next));
          if (deferred.length) { this.failures.push({ url, step: 'linked_documents', error: 'linked_document_budget', remaining: deferred }); for (const next of deferred) queue.splice(queue.indexOf(next),1); }
        }
      } catch (error) { this.failures.push({ url, step: 'page', error: error.message }); }
    }
    const groups = [], groupKeys = new Map();
    for (const doc of docs.sort((a, b) => Number(/reg\.zuicool/.test(b.url)) - Number(/reg\.zuicool/.test(a.url)))) for (const raw of doc.packages) {
      const group = groupOf(raw), key = textKey(group.name);
      if (!groupKeys.has(key)) { groupKeys.set(key, groups.length); groups.push(group); }
      else { const old = groups[groupKeys.get(key)]; if (old.status === 'unknown') old.status = group.status; if (!old.fees.length) old.fees = group.fees; }
    }
    const imageKeys = new Set(), media = [];
    for (const doc of docs) for (const image of doc.images) {
      if (!image.url || imageKeys.has(image.url) || /logo|avatar|wx-share|qrcode|icon|weixin|service|footer|bannerad/i.test(image.url)) continue;
      if (image.width && image.width < 250 || image.height && image.height < 100) continue;
      imageKeys.add(image.url);
      const entry = { ...image, sourceUrl: doc.url, kind: 'guide', caption: image.alt || '赛事图文资料', localFile: '', ocr: null };
      try {
        const downloaded = image.localFile && fs.existsSync(image.localFile) ? {file:image.localFile,bytes:fs.readFileSync(image.localFile)} : await this.download(image.url, 'image'); entry.localFile = downloaded.file; entry.sha256 = hash(downloaded.bytes);
        if (this.ocr) {
          entry.ocr = await this.recognize(downloaded.file);
          if (/赛道图|海拔图|线路图|路线图/.test(entry.ocr.text)) { entry.kind = 'route'; entry.caption = '分组路线与海拔资料'; }
          else if (/竞赛规程|参赛资格|竞赛办法/.test(entry.ocr.text)) entry.caption = '竞赛规程';
          else if (/报名时间|报名费用/.test(entry.ocr.text)) entry.caption = '报名时间与费用';
          else if (/比赛日程|检录|运动员报到/.test(entry.ocr.text)) entry.caption = '比赛日程';
        }
      } catch (error) { this.failures.push({ url: image.url, sourceUrl: doc.url, step: entry.localFile ? 'ocr' : 'image', error: error.message }); }
      media.push(entry);
    }
    return assembleCollection({id,name,docs,groups,media,failures:this.failures.slice(failuresStart)});
  }
}
function assembleCollection({id = '',name = '',docs = [],groups = [],media = [],failures = []}) {
    const texts = uniqueText(docs.map(d => d.text));
    // Exact/substantial duplicate summaries are removed, full rules are never character-truncated.
    const fullTexts = texts.filter((value, i) => !texts.some((other, j) => i !== j && other.length > value.length && textKey(other).includes(textKey(value))));
    const sections = fullTexts.flatMap((text, i) => splitSections(text, i ? '关联赛事资料' : '赛事概况'));
    const notices = uniqueText(docs.flatMap(doc => clean(doc.header).split('\n').map(clean).filter(line => /^(?:延期)?提示[：:]/.test(line))));
    if (notices.length) sections.unshift({title:'赛事公告',text:notices.join('\n')});
    for (const image of media) if (image.ocr?.text) {
      const text = readableOcr(image.ocr); if (text.length < 20) continue;
      for (const section of splitSections(text, image.caption + '（原图识别）')) {
        if (!sections.some(s => textKey(s.text) === textKey(section.text))) sections.push({ ...section, sourceUrl: image.sourceUrl, imageUrl: image.url, ocr: true });
      }
    }
    const signupDoc = docs.find(d => /^https:\/\/reg\.zuicool\.com\/\d+\/?$/.test(d.url) && (d.packages.length || /赛事日期/.test(d.header)) && sameEdition(name,d.title));
    const headerStatus = signupDoc && statusOf(signupDoc.header, { header: true });
    const cancelled = docs.some(d => statusOf(d.title + '\n' + d.header, { header:true }) === 'cancelled');
    const status = cancelled ? 'cancelled' : headerStatus && headerStatus !== 'unknown' ? headerStatus : groups.length && groups.every(g => g.status === 'closed') ? 'closed' : groups.length && groups.every(g => g.status === 'sold_out') ? 'sold_out' : 'unknown';
    const dates = registrationOfDocuments(docs, sections);
    const details = { version: 1, registration: { status, channel: signupDoc ? '最酷' : '', url: signupDoc?.url || '', verified: !!signupDoc && signupDoc.capture.fresh, checkedAt: signupDoc?.capture.at || '', ...dates }, groups, sections,
      media: media.filter(usefulMedia).map(({ ocr, ...item }) => ({ ...item, ocrText: ocr?.text || '', ocrEngine: ocr?.engine || '' })),
      sources: docs.map(d => ({ url: d.url, title: d.title, checkedAt: d.capture.at, method: d.capture.method, fresh: d.capture.fresh, error: d.capture.error })) };
    const fields = {};
    if (dates.opensAt) fields.reg_start = dates.opensAt;
    if (dates.closesAt) fields.deadline = dates.closesAt;
    const phone = /(?:报名咨询电话|联系电话|咨询电话)[：:\s]*([\d()（）+ -]{7,30})/.exec(signupDoc?.header || '');
    if (phone) fields.phone = phone[1].trim();
    const fee = groups.filter(g=>g.fees.length).map(g=>g.name+'：'+g.fees.map(f=>f.amount+'元/'+f.unit).join('、')).join('；');
    if (fee && fee.length <= 80) fields.fee = fee;
    return { id, name: name || docs[0]?.title || '', capturedAt: new Date().toISOString(), fields, details, guideText: sections.map(s => '## ' + s.title + '\n\n' + s.text).join('\n\n'), documents: docs,
      imageEvidence: media.map(({ocr,...item}) => ({...item,ocrText:ocr?.text || '',ocrEngine:ocr?.engine || ''})), failures,
      coverage: { pages: docs.length, packages: groups.length, images: media.length, imagesRead: media.filter(m => m.ocr?.text).length, usefulImages: media.filter(usefulMedia).length, textCharacters: sections.reduce((n,s) => n + s.text.length,0), sourcePlatforms: [...new Set(docs.map(d => new URL(d.url).hostname))] } };
}

function argsOf(argv) { const o = {}; for (let i = 0; i < argv.length; i++) { const key = argv[i].replace(/^--/, ''); o[key] = argv[i+1] && !argv[i+1].startsWith('--') ? argv[++i] : true; } return o; }
async function main() {
  const args = argsOf(process.argv.slice(2)), directory = args['out-dir'] || path.dirname(args.out || path.join(os.tmpdir(), 'race-detail', 'pilot.json'));
  fs.mkdirSync(directory, { recursive: true });
  const collector = new Collector({ cacheDir: args.cache || path.join(directory, 'cache'), ocr: !!args.ocr, refresh: !args['use-cache'] });
  await collector.start();
  try {
    if (args.url) {
      const result = await collector.collect({ name: args.name || '', id: args.id || '', urls: String(args.url).split(',') });
      const out = args.out || path.join(directory, 'pilot.json'); fs.writeFileSync(out, JSON.stringify(result, null, 2)); console.log(JSON.stringify({ out, coverage: result.coverage, failures: result.failures }));
    } else if (args.targets || args.inventory && args.evidence) {
      const inventory = args.inventory ? JSON.parse(fs.readFileSync(args.inventory)) : {}, evidence = args.evidence ? JSON.parse(fs.readFileSync(args.evidence)) : {};
      const index = new Map();
      for (const e of evidence.results || []) for (const ref of e.refs || []) { const key = ref.table + ':' + ref.id; if (!index.has(key)) index.set(key, []); index.get(key).push(e); }
      const targets = args.targets ? JSON.parse(fs.readFileSync(args.targets)) : (inventory.races || []).map(r => ({ id: r.id, name: r.name, urls: [...new Set([r.signup_url, r.event_url, ...(index.get('races:' + r.id) || []).map(e => e.url)].filter(u => /zuicool\.com\/(?:event\/)?\d+/.test(u || '')))], cached: Object.fromEntries((index.get('races:' + r.id) || []).map(e => [e.url, e.cachedHtml])) }));
      const report = [];
      for (const target of targets) {
        const file = path.join(directory, target.id.replace(/[^\w.-]/g, '_') + '.json');
        if (!target.urls.length) { report.push({ id: target.id, name: target.name, skipped: 'no_supported_public_source', urls: [] }); continue; }
        if (args.resume && fs.existsSync(file)) { const prior = JSON.parse(fs.readFileSync(file)); report.push({ id: target.id, coverage: prior.coverage, cachedResult: true }); continue; }
        const result = await collector.collect(target); fs.writeFileSync(file, JSON.stringify(result, null, 2)); const row = { id: target.id, name: target.name, coverage: result.coverage, failures: result.failures }; report.push(row); console.log(JSON.stringify(row));
        fs.writeFileSync(path.join(directory, args.report || 'collection-report.json'), JSON.stringify(report, null, 2));
      }
    } else throw new Error('Pass --url, or --inventory plus --evidence');
  } finally { await collector.stop(); }
}
if (require.main === module) main().catch(e => { console.error(e.stack); process.exitCode = 1; });
module.exports = { Collector, groupOf, statusOf, sameEdition, registrationDates, registrationOfDocuments, readableOcr, ocrRows, usefulMedia, assembleCollection, splitSections, uniqueText, publicUrl, extractDocument, argsOf };
