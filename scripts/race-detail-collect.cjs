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
const { discoverRaceSources, rankSources, publicSourceUrl } = require('./race-detail-sources.cjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clean = value => String(value || '').replace(/\r/g, '').replace(/[ \t\u00a0]+/g, ' ').replace(/\n[ \t]*\n+/g, '\n\n').trim();
const textKey = value => clean(value).replace(/[\s，,。.!！:：；;]/g, '');
function uniqueText(values) {
  const seen = new Set();
  return values.map(clean).filter(value => { const key = textKey(value); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}
function publicUrl(value, base) {
  return publicSourceUrl(value, base);
}
function sourceUrlsOf(race = {}, refs = []) {
  const values = [
    race.signup_url, race.signupUrl, race.event_url, race.eventUrl,
    race.official_url, race.officialUrl, race.source_url, race.sourceUrl,
    ...(Array.isArray(race.sourceUrls) ? race.sourceUrls : []),
    ...refs.map(ref => typeof ref === 'string' ? ref : ref && (ref.url || ref.sourceUrl)).filter(Boolean)
  ];
  return [...new Set(values.map(value => publicUrl(value)).filter(Boolean))];
}
function searchResultUrls(html, expectedName = '') {
  const urls = [];
  const source = String(html || '');
  for (const match of source.matchAll(/(?:href|url)=["']([^"']+)["']/gi)) {
    let value = match[1];
    for (let i = 0; i < 2; i++) {
      try { value = decodeURIComponent(value); } catch (_) { break; }
    }
    let nested = '';
    try { const redirect = new URL(value); nested = redirect.searchParams.get('url') || redirect.searchParams.get('u') || ''; } catch (_) { /* plain URL */ }
    const url = publicUrl(nested || value);
    if (!url) continue;
    try {
      const host = new URL(url).hostname;
      if (!/^(?:mp\.)?weixin\.qq\.com$|^mp\.weixin\.qq\.com$|^www\.runchina\.org\.cn$/i.test(host)) continue;
    } catch (_) { continue; }
    if (/mp\.weixin\.qq\.com\/s\//i.test(url) || /runchina\.org\.cn\/#\/race\/v\/detail\//i.test(url)) urls.push(url);
  }
  return [...new Set(urls)].filter(url => !expectedName || !/搜狗|搜索|search/i.test(url));
}
async function discoverPublicSources(name, { fetchImpl = global.fetch, search = true } = {}) {
  if (!search || !String(name || '').trim()) return { urls: [], failures: [] };
  const query = encodeURIComponent(String(name).trim());
  const endpoint = 'https://weixin.sogou.com/weixin?type=2&query=' + query;
  try {
    const response = await fetchImpl(endpoint, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; MarathonRaceDetail/1.0)', accept: 'text/html' }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) return { urls: [], failures: [{ url: endpoint, step: 'source_search', error: 'HTTP_' + response.status }] };
    return { urls: searchResultUrls(await response.text(), name), failures: [] };
  } catch (error) {
    return { urls: [], failures: [{ url: endpoint, step: 'source_search', error: error.message }] };
  }
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
  if (!expected) return true;
  if (!actual) return false;
  const years = value => value.match(/20\d{2}/g) || [];
  if (years(expected).length && years(actual).length && !years(expected).some(y => years(actual).includes(y))) return false;
  const key = value => value.replace(/报名须知|竞赛规程|参赛指南|比赛规程|赛事详情|报名指南|竞赛办法|官方网站|20\d{2}|马拉松|半程|赛事|越野赛|越野跑|公路跑|一键报名|报名|最酷|\s|[^\u4e00-\u9fffA-Za-z0-9]/g, '').toLowerCase();
  const a = key(expected), b = key(actual);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const bigrams = s => new Set([...s].slice(1).map((_, i) => s.slice(i, i + 2)));
  const aa = bigrams(a), bb = bigrams(b), overlap = [...aa].filter(x => bb.has(x)).length;
  return overlap / Math.max(1, Math.min(aa.size, bb.size)) >= 0.5;
}
function bodyIdentityConflict(expected, doc) {
  if (!expected) return null;
  const text = clean(doc.text);
  const labels = /(?:^|\n)\s*(?:赛事名称|比赛名称|活动名称)[：:\t ]*(?:\n[\t ]*)?([^\n]{4,160})/g;
  let match;
  while ((match = labels.exec(text))) {
    const declared = clean(match[1]);
    if (!/20\d{2}|马拉松|越野|挑战赛|骑游|长跑/.test(declared) || sameEdition(expected,declared)) continue;
    // An explicit renaming notice may legitimately quote the former title.
    if (/更名|名称.*(?:改为|变更)|名称从/.test(doc.header || '') && textKey(doc.header).includes(textKey(declared))) continue;
    return {url:doc.url,step:'body_identity',error:'declared_race_name_mismatch',declaredName:declared,expectedName:expected};
  }
  return null;
}
function scheduleOfDocuments(docs) {
  const day = (year,month,date) => {
    const stamp=year+'-'+String(month).padStart(2,'0')+'-'+String(date).padStart(2,'0'), parsed=new Date(stamp+'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===stamp ? stamp : '';
  };
  // Only the current event header is authoritative here. Body paragraphs can
  // retain an earlier date after postponement, or describe registration instead.
  for (const doc of docs) for (const line of clean(doc.header).split('\n')) {
    const match = /^\s*(?:赛事日期|比赛日期|活动日期)[：:\t ]*(20\d{2})[年.\/-]\s*(\d{1,2})[月.\/-]\s*(\d{1,2})日?(?:星期[一二三四五六日天]|[（(]周[一二三四五六日天][）)])?(?:\s*[-—～~–至]\s*(?:(20\d{2})[年.\/-]\s*)?(?:(\d{1,2})[月.\/-]\s*)?(\d{1,2})日?(?:星期[一二三四五六日天])?)?\s*$/.exec(line);
    if (!match) continue;
    const [,year,month,date,endYear,endMonth,endDay]=match;
    const startDate=day(year,month,date),endDate=endDay ? day(endYear||year,endMonth||month,endDay) : startDate;
    if (startDate && endDate && endDate>=startDate) return {startDate,endDate};
  }
  return null;
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
  const text = [image.alt,image.context,image.caption,image.textLayer,image.reviewedText,image.ocr?.text,image.ocrText].filter(Boolean).join('\n');
  if (/logo|avatar|wx-share|qrcode|icon|weixin|service|footer|bannerad/i.test(image.url || '')) return false;
  if (image.kind === 'route' || /路线|线路|赛道|海拔|爬升|日程|检录|领物|报到|报名|费用|竞赛规程|参赛资格|竞赛办法|关门|装备|奖励|退费|退赛|年龄要求|出发时间|补给|检查点|交通|停车|接驳/.test(text)) return true;
  return readableOcr(image.ocr || {text:image.ocrText}).length >= 350;
}
function reviewedImageText(image) {
  // OCR is evidence, never approved prose. A separate corrected transcription
  // and a record of actually viewing its source image are both required.
  if (image.review?.status !== 'verified' || image.review?.imageViewed !== true) return '';
  return clean(image.reviewedText);
}
function restrictedDocument(doc) {
  const text = clean([doc.title, doc.text].filter(Boolean).join('\n'));
  return /^(?:登录|登陆|用户登录|请先登录|验证码|安全验证)/.test(doc.title || '') ||
    text.length < 1500 && /环境异常|完成验证后即可继续访问|访问过于频繁|请完成(?:安全)?验证|人机验证|enable javascript and cookies/i.test(text);
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
      // Expand explicit HTML row/column spans before serialization. Joining
      // cells directly shifts later prices into the wrong project column.
      for (const table of [...clone.querySelectorAll('table')].reverse()) {
        const sourceRows = [...table.querySelectorAll('tr')].filter(tr => tr.closest('table') === table);
        const matrix = [], headerRows = [];
        sourceRows.forEach((tr, r) => {
          matrix[r] ||= [];
          let column = 0;
          const cells = [...tr.querySelectorAll(':scope > th,:scope > td')];
          if (cells.length && cells.every(cell => cell.tagName === 'TH')) headerRows.push(r);
          for (const cell of cells) {
            while (matrix[r][column] !== undefined) column++;
            const value = clean(cell.textContent).replace(/\n+/g, ' / ').replace(/\|/g, '\\|');
            const rowSpan = Math.max(1, Math.min(sourceRows.length - r, cell.rowSpan || 1));
            const colSpan = Math.max(1, cell.colSpan || 1);
            for (let y = r; y < r + rowSpan; y++) {
              matrix[y] ||= [];
              for (let x = column; x < column + colSpan; x++) matrix[y][x] = value;
            }
            column += colSpan;
          }
        });
        if (!matrix.length) continue;
        const columns = Math.max(...matrix.map(row => row.length));
        const explicitHeaders = headerRows.filter((r, i) => r === i);
        const headers = Array.from({length:columns}, (_, c) => explicitHeaders.length ? [...new Set(explicitHeaders.map(r => matrix[r][c]).filter(Boolean))].join(' / ') : '第' + (c + 1) + '列');
        const rowText = row => '| ' + Array.from({length:columns}, (_, c) => row[c] || '').join(' | ') + ' |';
        table.replaceWith('\n\n' + rowText(headers) + '\n' + rowText(Array(columns).fill('---')) + '\n' + matrix.slice(explicitHeaders.length).map(rowText).join('\n') + '\n\n');
      }
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
    const links = [...document.querySelectorAll('a[href]')].map(a => ({ url: absolute(a.getAttribute('href')), label: clean(a.textContent) })).filter(a => /更多赛事信息|竞赛规程|报名须知|参赛指南|赛事规程|比赛规程|附件|下载|赛事详情|赛事官网|官方网站|官网入口|official\s+(?:website|site)/i.test(a.label) || /\.(?:pdf|docx?)(?:\?|$)/i.test(a.url));
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
    // Processing changes must invalidate earlier low-quality cached results.
    const pipeline = process.platform === 'darwin' ? fs.readFileSync(path.join(__dirname, 'race-detail-ocr.swift')) : Buffer.from('tesseract-local-v1');
    const key = hash(Buffer.concat([fs.readFileSync(file), pipeline])), cache = path.join(this.root, 'ocr', key + '.json');
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
      return {url,title:'',header:'',text:parsed.pages.filter(p=>clean(p.text)).map(p=>p.text).join('\n\n'),packages:[],images:parsed.pages.filter(p=>p.image).map(p=>({url:url+'#page='+p.number,sourceUrl:url,localFile:p.image,alt:'PDF第'+p.number+'页',textLayer:clean(p.text),skipOcr:!!clean(p.text)})),links:[],capture:{at:new Date().toISOString(),method:'pdf-text-with-image-evidence',file:downloaded.file,fresh:!downloaded.cached}};
    }
    const page = await this.browser.newPage();
    try {
      const downloaded = await this.download(url, 'html', { cachedHtml });
      let doc = await extractDocument(page, downloaded.bytes.toString('utf8'), url);
      let mode = 'html';
      if (restrictedDocument(doc) || !doc.text || doc.text.length < 100 && !doc.images.length) {
        try { doc = await extractDocument(page, null, url, true); mode = 'rendered-scroll'; } catch (error) { this.failures.push({ url, step: 'render', error: error.message }); }
      }
      if (restrictedDocument(doc)) throw new Error('access_verification_required');
      if (mode === 'rendered-scroll') fs.writeFileSync(downloaded.file, await page.content());
      return { ...doc, ...(mode === 'rendered-scroll' ? {finalUrl: page.url()} : {}), capture: { at: new Date().toISOString(), method: mode, file: downloaded.file, fresh: mode === 'rendered-scroll' || !downloaded.cached, error: downloaded.error || '' } };
    } finally { await page.close(); }
  }
  async searchSources(query) {
    const sources = [], failures = [];
    for (const endpoint of ['https://www.bing.com/search?q=', 'https://weixin.sogou.com/weixin?type=2&query=', 'https://www.so.com/s?q=']) {
      const searchUrl = endpoint + encodeURIComponent(query), page = await this.browser.newPage();
      try {
        await page.goto(searchUrl, {waitUntil:'domcontentloaded',timeout:20000});
        const text = clean(await page.locator('body').innerText());
        if (/此验证码用于确认|请完成验证|安全验证|人机验证|访问过于频繁/.test(text)) throw new Error('search_access_verification_required');
        const hits = await page.locator('#b_results h2 a,h3 a').evaluateAll(links => links.map(a => ({url:a.getAttribute('data-mdurl') || a.href,label:a.textContent.trim()})));
        for (const hit of hits.slice(0,12)) {
          let candidate = publicUrl(hit.url); if (!candidate) continue;
          const u = new URL(candidate);
          if (/bing\.com$/.test(u.hostname) && u.pathname === '/ck/a') {
            const encoded = u.searchParams.get('u') || '';
            candidate = publicUrl(encoded.startsWith('a1') ? Buffer.from(encoded.slice(2),'base64').toString('utf8') : encoded);
          }
          if (candidate) sources.push({...hit,url:candidate,sourceUrl:searchUrl});
        }
        if (!hits.length && !/没有找到|没有搜索到|no results|did not match/i.test(text)) failures.push({url:searchUrl,step:'source_search',error:'search_results_unreadable'});
      } catch (error) { failures.push({url:searchUrl,step:'source_search',error:error.message}); }
      finally { await page.close(); }
    }
    return { sources, failures };
  }
  async collect({ name = '', id = '', urls = [], cached = {}, discoveryFailures = [], discover = false, race = {} }) {
    const failuresStart = this.failures.length, docs = [], queue = [...new Set(urls.map(u => publicUrl(u)).filter(Boolean))], visited = new Set();
    this.failures.push(...discoveryFailures);
    let discovery;
    if (discover) {
      const memo = new Map();
      const readDocument = async url => {
        if (!memo.has(url)) memo.set(url, await this.document(url,cached[url]));
        return memo.get(url);
      };
      const known = [];
      for (const url of queue) { try { const doc = await readDocument(url); if (sameEdition(name,doc.title)) known.push(doc); } catch (error) { this.failures.push({url,step:'source_probe',error:error.message}); } }
      const text = known.map(doc=>doc.text).join('\n');
      const terms = {groups:/组别|比赛项目|赛事项目/,fees:/报名费|收费标准/,eligibility:/参赛资格|年龄要求|报名条件/,pickup:/领物|物品领取|参赛物品/,refund:/退费|退款|退出机制/};
      discovery = await discoverRaceSources({...race,id,name,sourceUrls:urls},{documents:known,readDocument,search:query=>this.searchSources(query),missingFields:Object.keys(terms).filter(key=>!terms[key].test(text))});
      this.failures.push(...discovery.failures);
      queue.splice(0,queue.length,...discovery.urls);
      this._discoveryDocuments = memo;
    }
    while (queue.length) {
      const url = queue.shift(); if (visited.has(url)) continue; visited.add(url);
      try {
        const doc = this._discoveryDocuments?.get(url) || await this.document(url, cached[url]);
        // Exact title identity prevents a linked login/generic calendar from replacing this event.
        if (/^(?:登录|登陆|用户登录|请先登录|验证码|安全验证)/.test(doc.title)) { this.failures.push({ url, step: 'access', error: 'login_or_verification_required', title: doc.title }); continue; }
        if (!sameEdition(name, doc.title || clean(doc.text).slice(0,300))) { this.failures.push({ url, step: 'identity', error: 'edition_name_or_locality_mismatch', title: doc.title }); continue; }
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
    const roles = discovery?.sourceRoles || {};
    const ordered = rankSources(docs.map(doc=>({url:doc.url,role:roles[doc.url],verified:/^official_(?:website|document|announcement)$/.test(roles[doc.url]||'')})));
    docs.sort((a,b)=>ordered.findIndex(source=>source.url===a.url)-ordered.findIndex(source=>source.url===b.url));
    for (const doc of docs) doc.sourceRole = roles[doc.url] || 'public_source';
    const groups = [], groupKeys = new Map();
    for (const doc of docs) for (const raw of doc.packages) {
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
        if (this.ocr && !image.skipOcr) {
          entry.ocr = await this.recognize(downloaded.file);
          if (/赛道图|海拔图|线路图|路线图/.test(entry.ocr.text)) { entry.kind = 'route'; entry.caption = '分组路线与海拔资料'; }
          else if (/竞赛规程|参赛资格|竞赛办法/.test(entry.ocr.text)) entry.caption = '竞赛规程';
          else if (/报名时间|报名费用/.test(entry.ocr.text)) entry.caption = '报名时间与费用';
          else if (/比赛日程|检录|运动员报到/.test(entry.ocr.text)) entry.caption = '比赛日程';
        }
      } catch (error) { this.failures.push({ url: image.url, sourceUrl: doc.url, step: entry.localFile ? 'ocr' : 'image', error: error.message }); }
      media.push(entry);
    }
    this._discoveryDocuments = null;
    const result = assembleCollection({id,name,docs,groups,media,failures:this.failures.slice(failuresStart)});
    if (discovery) {
      const { documents, ...audit } = discovery;
      result.details.audit.sourceDiscovery = audit;
      result.details.sources = result.details.sources.map(source=>({...source,role:roles[source.url]||'public_source'}));
    }
    return result;
  }
}
function sourceSectionTopics(title) {
  const value = clean(title), topics = [];
  const patterns = {
    overview:/组织机构|赛事概况|比赛概况|赛事简介/,
    groups:/项目组别|比赛项目|赛事项目|项目及规模|参赛项目/,
    registration:/报名时间|报名方式|报名须知|报名流程|报名及报到|报名与费用/,
    fees:/费用|报名费|收费|精英.*优惠/,
    eligibility:/资格|年龄|健康|禁.*报名|参赛条件/,
    schedule:/日程|赛程|时间安排/,
    pickup:/领物|物品领取|参赛物品|参赛包|报到/,
    route:/路线|线路|补给|检查点|关门/,
    equipment:/装备/,
    awards:/奖励|奖金|领奖|奖项/,
    refund:/退费|退款|退改/,
    rules:/竞赛办法|竞赛规则|比赛规则|计时|寄存|存包/,
    penalties:/处罚|申诉/,
    medical:/医疗|救援/,
    insurance:/保险/,
    environment:/环保|环境保护/,
    safety:/安全|守则|特别说明|影像|版权|解释权/,
    transport:/交通|接驳|住宿/,
    contact:/联系方式|组委会联系/
  };
  for (const [topic, pattern] of Object.entries(patterns)) if (pattern.test(value)) topics.push(topic);
  return topics;
}
function sourceSectionsOf(doc, fallback = '赛事概况') {
  const sections = []; let title = fallback, lines = [];
  const flush = () => { const text = clean(lines.join('\n')); if (text) sections.push({title,text,sourceUrl:doc.url,sourceRole:doc.sourceRole || 'public_source'}); lines = []; };
  for (const raw of clean(doc.text).split('\n')) {
    const line = raw.trim(), heading = /^(?:#{1,4}\s+|[一二三四五六七八九十]+[、．.]|[（(][一二三四五六七八九十]+[）)])\s*(.+)$/.exec(line);
    if (heading && line.length < 65 && !/[：:]/.test(line) && sourceSectionTopics(heading[1]).length) { flush(); title = heading[1]; }
    else lines.push(raw);
  }
  flush(); return sections;
}
function preferredSourceSections(docs, name) {
  const supplementalReview = [];
  // Prefer one full current-edition official body. Other versions remain source
  // evidence; a different text or fee is never proof that it should be appended.
  const primary = docs.find(doc => /^official_(?:website|document|announcement)$/.test(doc.sourceRole || '') && doc.capture?.fresh !== false && sameEdition(name,doc.title) &&
    (doc.completeRegulations === true || clean(doc.text).length >= 300 && new Set(sourceSectionsOf(doc).flatMap(section=>sourceSectionTopics(section.title))).size >= 3));
  if (!primary) {
    const seen = new Set(), unique = docs.filter(doc => { const key = textKey(doc.text); if (!key || seen.has(key)) return false; seen.add(key); return true; });
    const full = unique.filter(doc => !unique.some(other => other !== doc && textKey(other.text).length > textKey(doc.text).length && textKey(other.text).includes(textKey(doc.text))));
    return {sections:full.flatMap((doc,i)=>sourceSectionsOf(doc,i?'关联赛事资料':'赛事概况')),supplementalReview,primary:null};
  }
  const sections = sourceSectionsOf(primary), covered = new Set(sections.flatMap(section=>sourceSectionTopics(section.title)));
  for (const doc of docs) {
    if (doc === primary) continue;
    const parts = sourceSectionsOf(doc,'关联赛事资料');
    for (const part of parts) {
      const topics = sourceSectionTopics(part.title), duplicate = sections.some(section=>textKey(section.text).includes(textKey(part.text)));
      const overlaps = topics.some(topic=>covered.has(topic));
      const record = {sourceUrl:doc.url,sourceRole:doc.sourceRole || 'public_source',title:part.title,text:part.text,topics,status:'pending',reason:duplicate?'duplicate_of_primary':overlaps?'overlapping_primary_topics':'unknown_topic',primarySourceUrl:primary.url};
      // A clearly labelled, unique chapter can fill an actual gap. Mixed
      // overlapping/unique chapters stay pending because separating them would
      // silently change clause context or apply an old fee to a new edition.
      if (!duplicate && topics.length && !overlaps) {
        sections.push({...part,supplemental:true}); topics.forEach(topic=>covered.add(topic));
        record.status='included_supplement';record.reason='unique_labelled_topic';
      }
      supplementalReview.push(record);
    }
  }
  return {sections,supplementalReview,primary};
}
function assembleCollection({id = '',name = '',docs = [],groups = [],media = [],failures = []}) {
    const bodyConflicts = docs.map(doc => bodyIdentityConflict(name,doc)).filter(Boolean);
    const unsafeBodyUrls = new Set(bodyConflicts.map(conflict=>conflict.url));
    const safeDocs = docs.filter(doc=>!unsafeBodyUrls.has(doc.url));
    const safeMedia = media.filter(image=>!unsafeBodyUrls.has(image.sourceUrl));
    const selected = preferredSourceSections(safeDocs,name), sections = selected.sections;
    const notices = uniqueText((selected.primary ? [selected.primary] : docs).flatMap(doc => clean(doc.header).split('\n').map(clean).filter(line => /^(?:延期)?提示[：:]/.test(line))));
    if (selected.primary) for (const doc of safeDocs.filter(doc=>doc!==selected.primary)) for (const notice of clean(doc.header).split('\n').filter(line=>/^(?:延期)?提示[：:]/.test(line))) {
      selected.supplementalReview.push({sourceUrl:doc.url,title:'赛事公告',text:notice,status:'pending',reason:'supplemental_notice_requires_current_version_review',primarySourceUrl:selected.primary.url});
    }
    if (notices.length) sections.unshift({title:'赛事公告',text:notices.join('\n')});
    const imageReviews = [];
    for (const image of safeMedia) {
      const text = reviewedImageText(image);
      if (text) {
        for (const section of splitSections(text, image.reviewedTitle || image.caption || '赛事资料')) {
          // Prefer an existing reliable text source when it already contains
          // this whole verified transcription. Do not concatenate two copies.
          if (sections.some(s => textKey(s.text).includes(textKey(section.text)))) continue;
          const topics = sourceSectionTopics(section.title), overlaps = topics.some(topic=>sections.some(s=>sourceSectionTopics(s.title).includes(topic)));
          if (selected.primary && (!topics.length || overlaps)) selected.supplementalReview.push({sourceUrl:image.sourceUrl,imageUrl:image.url,title:section.title,text:section.text,topics,status:'pending',reason:overlaps?'overlapping_primary_topics':'unknown_topic',primarySourceUrl:selected.primary.url});
          else sections.push({ ...section, sourceUrl: image.sourceUrl, imageUrl: image.url, ocr: true, reviewed: true });
        }
      } else if (usefulMedia(image)) {
        imageReviews.push({ sourceUrl:image.sourceUrl || '', imageUrl:image.url, sha256:image.sha256 || '', status:'pending',
          reason:image.textLayer ? '已优先提取PDF文字层，页面内图表仍须逐页查看校对；文字层非空不代表图表完整。' : image.ocr?.text || image.ocrText ? 'OCR未逐图校对，未加入正文；需核对表头、合并单元格、数字与单位。' : '尚未取得可靠文字，保留原图供查看。',
          questions:Array.isArray(image.review?.questions) ? image.review.questions : [] });
      }
    }
    const signupDoc = docs.find(d => /^https:\/\/reg\.zuicool\.com\/\d+\/?$/.test(d.url) && (d.packages.length || /赛事日期/.test(d.header)) && sameEdition(name,d.title));
    const headerStatus = signupDoc && statusOf(signupDoc.header, { header: true });
    const cancelled = (selected.primary ? [selected.primary] : docs).some(d => statusOf(d.title + '\n' + d.header, { header:true }) === 'cancelled');
    const status = cancelled ? 'cancelled' : headerStatus && headerStatus !== 'unknown' ? headerStatus : groups.length && groups.every(g => g.status === 'closed') ? 'closed' : groups.length && groups.every(g => g.status === 'sold_out') ? 'sold_out' : 'unknown';
    // A platform header can retain an obsolete deadline after the official
    // current-edition body changes. Only the selected official body and admitted
    // unique supplements may provide dates once a primary source is established.
    const dates = registrationOfDocuments(selected.primary ? [selected.primary] : docs, sections);
    const schedule = scheduleOfDocuments(selected.primary ? [selected.primary] : docs);
    const details = { version: 1, ...(schedule ? {schedule} : {}), registration: { status, channel: signupDoc ? '最酷' : '', url: signupDoc?.url || '', verified: !!signupDoc && signupDoc.capture.fresh, checkedAt: signupDoc?.capture.at || '', ...dates }, groups, sections,
      audit:{ ...(bodyConflicts.length ? {bodyConflicts} : {}), ...(imageReviews.length ? {imageReviews} : {}), ...(selected.primary ? {primarySource:{url:selected.primary.url,role:selected.primary.sourceRole,reason:'current_edition_complete_official_body'}} : {}), ...(selected.supplementalReview.length ? {supplementalReview:selected.supplementalReview} : {}) },
      media: safeMedia.filter(usefulMedia).map(({ ocr, ...item }) => ({ ...item, ocrText: ocr?.text || '', ocrEngine: ocr?.engine || '' })),
      sources: docs.map(d => ({ url: d.url, title: d.title, checkedAt: d.capture.at, method: d.capture.method, fresh: d.capture.fresh, error: d.capture.error })) };
    const fields = {};
    if (dates.opensAt) fields.reg_start = dates.opensAt;
    if (dates.closesAt) fields.deadline = dates.closesAt;
    const contactText = selected.primary ? selected.primary.text : signupDoc?.header || '';
    const phone = /(?:报名咨询电话|联系电话|咨询电话)[：:\s]*((?:\+?\d[\d()（） -]{5,}\d)(?:\s*[/、，]\s*\+?\d[\d()（） -]{5,}\d)*)/.exec(contactText);
    if (phone) fields.phone = phone[1].trim();
    const fee = groups.filter(g=>g.fees.length).map(g=>g.name+'：'+g.fees.map(f=>f.amount+'元/'+f.unit).join('、')).join('；');
    if (fee && fee.length <= 80) fields.fee = fee;
    return { id, name: name || docs[0]?.title || '', capturedAt: new Date().toISOString(), fields, details, guideText: sections.map(s => '## ' + s.title + '\n\n' + s.text).join('\n\n'), documents: docs,
      imageEvidence: media.map(({ocr,...item}) => ({...item,ocrText:ocr?.text || '',ocrEngine:ocr?.engine || ''})), failures:[...failures,...bodyConflicts],
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
      const result = await collector.collect({ name: args.name || '', id: args.id || '', urls: String(args.url).split(','), discover: true });
      const out = args.out || path.join(directory, 'pilot.json'); fs.writeFileSync(out, JSON.stringify(result, null, 2)); console.log(JSON.stringify({ out, coverage: result.coverage, failures: result.failures }));
    } else if (args.targets || args.inventory && args.evidence) {
      const inventory = args.inventory ? JSON.parse(fs.readFileSync(args.inventory)) : {}, evidence = args.evidence ? JSON.parse(fs.readFileSync(args.evidence)) : {};
      const index = new Map();
      for (const e of evidence.results || []) for (const ref of e.refs || []) { const key = ref.table + ':' + ref.id; if (!index.has(key)) index.set(key, []); index.get(key).push(e); }
      const targets = args.targets ? JSON.parse(fs.readFileSync(args.targets)) : [];
      if (!args.targets) for (const race of inventory.races || []) {
        const refs = index.get('races:' + race.id) || [];
        const urls = sourceUrlsOf(race, refs);
        const target = { id: race.id, name: race.name, urls, cached: Object.fromEntries(refs.map(e => [e.url, e.cachedHtml]).filter(([url]) => url)) };
        target.race = race;
        target.discover = true;
        target.urls = [...new Set(target.urls)];
        targets.push(target);
      }
      const report = [];
      for (const target of targets) {
        target.discover = true;
        const file = path.join(directory, target.id.replace(/[^\w.-]/g, '_') + '.json');
        if (!target.urls.length && !target.name) { report.push({ id: target.id, name: target.name, skipped: 'missing_race_identity', urls: [] }); continue; }
        if (args.resume && fs.existsSync(file)) { const prior = JSON.parse(fs.readFileSync(file)); report.push({ id: target.id, coverage: prior.coverage, cachedResult: true }); continue; }
        const result = await collector.collect(target); fs.writeFileSync(file, JSON.stringify(result, null, 2)); const row = { id: target.id, name: target.name, coverage: result.coverage, failures: result.failures }; report.push(row); console.log(JSON.stringify(row));
        fs.writeFileSync(path.join(directory, args.report || 'collection-report.json'), JSON.stringify(report, null, 2));
      }
    } else throw new Error('Pass --url, or --inventory plus --evidence');
  } finally { await collector.stop(); }
}
if (require.main === module) main().catch(e => { console.error(e.stack); process.exitCode = 1; });
module.exports = { Collector, groupOf, statusOf, sameEdition, bodyIdentityConflict, scheduleOfDocuments, registrationDates, registrationOfDocuments, readableOcr, ocrRows, usefulMedia, reviewedImageText, assembleCollection, splitSections, uniqueText, publicUrl, sourceUrlsOf, searchResultUrls, discoverPublicSources, extractDocument, argsOf };
