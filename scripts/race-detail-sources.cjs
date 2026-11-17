'use strict';

// Discovery only: this module never writes race records, invents field values or
// treats a search result as a verified current-edition regulation.
const CAA_DETAIL_URL = 'https://api-changzheng.chinaath.com/changzheng-content-center-api/api/homePage/official/searchById';
const ROLE_PRIORITY = { official_document: 0, official_website: 1, official_announcement: 2, official_registry: 3, registration_platform: 4, discovery_platform: 5, public_article: 6, public_source: 7, official_candidate: 8 };
const PLATFORM_HOSTS = ['zuicool.com', 'mararun.com', 'malamala.com', 'iranshao.com', 'ihuipao.com', '51sai.com', 'runchina.org', 'joyrun.com', 'codoon.com', 'shuzixindong.com', 'runninginchina.org'];
const clean = value => String(value || '').trim();
const isHost = (host, domain) => host === domain || host.endsWith('.' + domain);

function publicSourceUrl(value, base) {
  try {
    const u = new URL(clean(value), base);
    const host = u.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password ||
        /^(?:localhost|0\.0\.0\.0|127\.|10\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|\[)/.test(host) ||
        /\.(?:localhost|local|internal)$/.test(host)) return '';
    // Some race sites only support HTTP; do not silently invent an HTTPS URL.
    return u.href;
  } catch (_) { return ''; }
}

function platformRole(url) {
  const safe = publicSourceUrl(url); if (!safe) return '';
  const { hostname, pathname } = new URL(safe);
  if (!PLATFORM_HOSTS.some(host => isHost(hostname, host))) return '';
  return /^reg\./.test(hostname) || /register|signup|enroll|\/reg\//i.test(pathname) ? 'registration_platform' : 'discovery_platform';
}
function registryUrl(url) {
  const safe = publicSourceUrl(url); if (!safe) return false;
  return ['runchina.org.cn', 'chinaath.com'].some(host => isHost(new URL(safe).hostname, host));
}
function sourceRole(value, { officialOrigins = [], officialUrls = [] } = {}) {
  const source = typeof value === 'string' ? { url: value } : value || {};
  const url = publicSourceUrl(source.url || source.sourceUrl);
  if (!url) return 'public_source';
  // A platform URL does not become a race website when stored in event_url or
  // returned by the association's webUrl field.
  const platform = platformRole(url); if (platform) return platform;
  if (registryUrl(url)) return 'official_registry';
  // Authority is recorded for a concrete, edition-checked document. Hosts can
  // contain archives, other publishers and other events, so no whole-origin
  // inheritance is allowed (even for a race-branded website).
  const official = source.verified === true && /^official_(?:website|document|announcement)$/.test(source.role || '') ||
    officialUrls.includes(url);
  if (official) return /\.pdf(?:[?#]|$)/i.test(url) ? 'official_document' : source.role === 'official_announcement' || new URL(url).hostname === 'mp.weixin.qq.com' ? 'official_announcement' : 'official_website';
  if (source.role === 'official_candidate') return 'official_candidate';
  if (new URL(url).hostname === 'mp.weixin.qq.com') return 'public_article';
  return 'public_source';
}
function rankSources(values = [], options = {}) {
  const seen = new Set();
  return values.map((value, index) => {
    const source = typeof value === 'string' ? { url: value } : { ...value };
    source.url = publicSourceUrl(source.url || source.sourceUrl);
    return { ...source, role: sourceRole(source, options), _order: index };
  }).filter(source => source.url && !seen.has(source.url) && seen.add(source.url))
    .sort((a, b) => ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role] || a._order - b._order)
    .map(({ _order, ...source }) => source);
}

function caaRecord(body) {
  return body?.body?.data?.ssdetails || body?.data?.ssdetails || body?.ssdetails || body || {};
}
function caaOfficialUrls(body) {
  const record = caaRecord(body);
  // Read only the association's explicitly named website field. Arbitrary
  // attachment/image URLs in its response are not website provenance.
  const url = publicSourceUrl(record.webUrl || record.web_url);
  return url && !registryUrl(url) && !platformRole(url) ? [url] : [];
}
function officialIdOf(race = {}) {
  if (race.officialId || race.official_id) return clean(race.officialId || race.official_id);
  if (Array.isArray(race.officialIds) && race.officialIds[0]) return clean(race.officialIds[0]);
  for (const value of [race.id, race.raceId, race.official_url, race.officialUrl]) {
    const match = /(?:^caa-|\/race\/v\/detail\/)(\d+)/.exec(clean(value)); if (match) return match[1];
  }
  return '';
}
async function fetchCaaSource(race, { fetchImpl = global.fetch } = {}) {
  const id = officialIdOf(race);
  if (!id) return { body: null, failures: [], attempted: false };
  try {
    const response = await fetchImpl(CAA_DETAIL_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://www.runchina.org.cn', Referer: 'https://www.runchina.org.cn/' },
      body: JSON.stringify({ id, type: 'SS' }), signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) return { body: null, attempted: true, failures: [{ url: CAA_DETAIL_URL, officialId: id, step: 'official_registry', error: 'HTTP_' + response.status }] };
    const body = await response.json();
    if (body?.success !== true || !body?.data?.ssdetails) return { body: null, attempted: true, failures: [{ url: CAA_DETAIL_URL, officialId: id, step: 'official_registry', error: 'empty_official_response' }] };
    return { body, attempted: true, failures: [] };
  } catch (error) { return { body: null, attempted: true, failures: [{ url: CAA_DETAIL_URL, officialId: id, step: 'official_registry', error: error.message || 'official_registry_unavailable' }] }; }
}

function officialCandidates(race = {}, { caaDetails, documents = [] } = {}) {
  const candidates = [], seen = new Set();
  const add = (value, provenance, sourceUrl = '') => {
    const url = publicSourceUrl(value, sourceUrl || undefined);
    if (!url || seen.has(url) || platformRole(url) || registryUrl(url)) return;
    seen.add(url); candidates.push({ url, role: 'official_candidate', provenance, sourceUrl });
  };
  caaOfficialUrls(caaDetails).forEach(url => add(url, 'caa_web_url', CAA_DETAIL_URL));
  // Existing website values are leads, not a blind assertion of authority.
  [race.webUrl, race.web_url, race.event_url, race.eventUrl, race.official_url, race.officialUrl].filter(Boolean).forEach(url => add(url, 'existing_event_url'));
  for (const doc of documents) for (const link of doc.links || []) {
    if (/赛事官网|官方网站|官网入口|official\s+(?:website|site)/i.test(link.label || link.title || '')) add(link.url, 'explicit_official_link', doc.url);
  }
  return candidates;
}

function currentEditionMatches(name, doc = {}) {
  const norm = value => clean(value).replace(/[\s·・，,。.!！:：；;（）()\-—_]/g, '').toLowerCase();
  const expected = norm(name), title = norm(doc.title), header = norm(doc.header);
  if (!expected) return false;
  const years = name.match(/20\d{2}/g) || [], titleYears = clean(doc.title).match(/20\d{2}/g) || [];
  if (years.length && titleYears.length && !years.some(year => titleYears.includes(year))) return false;
  if (title.includes(expected) || header.includes(expected)) return true;
  const body = norm(clean(doc.text).slice(0, 2500));
  if (body.includes(expected)) return true;
  const base = expected.replace(/20\d{2}/g, '');
  // A persistent official homepage may omit the year in its title, but must
  // identify this edition in its leading content before it can outrank sources.
  return base.length >= 4 && title.includes(base) && years.length > 0 && years.some(year => header.includes(year) || body.includes(year));
}
function accessIssue(doc = {}) {
  const title = clean(doc.title), text = clean(doc.text), status = Number(doc.status || doc.httpStatus || doc.capture?.status);
  if ([401, 403, 429].includes(status) || /^(?:登录|登陆|用户登录|请先登录|验证码|安全验证|访问受限|安全检查)/.test(title) ||
      text.length < 400 && /访问过于频繁|请完成验证|访问环境异常|内容因违规无法查看|该内容已被发布者删除|此内容因违规无法查看/.test(text)) return 'access_restricted';
  if (status >= 400 || doc.capture?.error && !doc.capture?.fresh) return 'unavailable';
  return '';
}
async function verifyOfficialCandidate(candidate, { name, readDocument, matchesEdition = currentEditionMatches } = {}) {
  const source = { ...candidate, role: 'official_candidate', verified: false };
  if (typeof readDocument !== 'function') return { ...source, status: 'unverified', error: 'document_reader_not_configured' };
  try {
    const doc = await readDocument(candidate.url);
    const issue = accessIssue(doc);
    if (issue) return { ...source, status: issue, error: doc.capture?.error || issue, title: doc.title || '' };
    const url = publicSourceUrl(doc.finalUrl || doc.url || candidate.url);
    if (!url || platformRole(url) || registryUrl(url)) return { ...source, status: 'rejected', error: 'redirected_to_platform_or_registry' };
    if (!matchesEdition(name, doc)) return { ...source, status: 'rejected', error: 'edition_name_or_locality_mismatch', title: doc.title || '' };
    const government = /\.gov\.cn$/.test(new URL(url).hostname);
    const claim = /赛事官网|官方网站|official\s+(?:website|site)/i.test([doc.title, doc.header, clean(doc.text).slice(0, 1500)].join('\n'));
    const anchored = ['caa_web_url', 'explicit_official_link'].includes(candidate.provenance);
    // The shared WeChat host and a self-written “official” title do not identify
    // the publisher. Only an association field or explicit official link anchors
    // this exact article; never trust every article on the WeChat origin.
    if (new URL(url).hostname === 'mp.weixin.qq.com' && !anchored || !anchored && !government && !claim) return { ...source, status: 'unverified', error: 'official_publisher_not_confirmed', title: doc.title || '', document: doc };
    return { ...source, url, role: /\.pdf(?:[?#]|$)/i.test(url) ? 'official_document' : government || new URL(url).hostname === 'mp.weixin.qq.com' ? 'official_announcement' : 'official_website', verified: true, status: 'verified', title: doc.title || '', document: doc };
  } catch (error) {
    const message = error.message || 'website_unavailable';
    return { ...source, status: /HTTP_(?:401|403|429)|captcha|verification|login_required|access_denied/i.test(message) ? 'access_restricted' : 'unavailable', error: message };
  }
}

const FIELD_TERMS = { groups: '项目 组别 实际距离 爬升 关门时间', fees: '报名费 早鸟价 收费阶段', eligibility: '参赛资格 年龄 出生日期 完赛证明', pickup: '领物须知 时间 地点 身份证', schedule: '比赛日程 多日 时间', route: '路线图 海拔 补给', equipment: '强制装备', refund: '退费 退改政策', phone: '组委会 联系方式' };
function missingSourceQueries(name, missingFields = [], { officialVerified = false } = {}) {
  const prefix = clean(name); if (!prefix) return [];
  const queries = [];
  if (!officialVerified) queries.push(prefix + ' 官方网站 官网');
  if (!missingFields.length && !officialVerified) queries.push(prefix + ' 官方 竞赛规程 报名须知');
  for (const field of [...new Set(missingFields)]) queries.push(prefix + ' 官方 ' + (FIELD_TERMS[field] || clean(field)));
  return [...new Set(queries)];
}

async function discoverRaceSources(race = {}, options = {}) {
  const name = race.name || '', failures = [], searches = [], documents = options.documents || [];
  let caaDetails = options.caaDetails;
  if (caaDetails === undefined && options.fetchCaa !== false) {
    const official = await fetchCaaSource(race, options); caaDetails = official.body; failures.push(...official.failures);
  }
  const candidates = officialCandidates(race, { caaDetails, documents });
  const checked = [];
  for (const candidate of candidates) checked.push(await verifyOfficialCandidate(candidate, { ...options, name }));
  const hasVerified = () => checked.some(source => source.verified);
  const queries = missingSourceQueries(name, options.missingFields || [], { officialVerified: hasVerified() });
  const discovered = [];
  if (queries.length && typeof options.search !== 'function') failures.push({ step: 'source_search', error: 'search_not_configured', queries });
  for (const query of queries) {
    if (typeof options.search !== 'function') break;
    try {
      const result = await options.search(query, { race, missingFields: options.missingFields || [] });
      const hits = Array.isArray(result) ? result : result?.sources || result?.results || result?.urls || [];
      if (Array.isArray(result?.failures)) failures.push(...result.failures.map(failure => ({ ...failure, query, step: failure.step || 'source_search' })));
      searches.push({ query, status: hits.length ? 'found_candidates' : result?.failures?.length ? 'failed' : 'no_results', candidates: hits.length });
      for (const hit of hits) {
        const source = typeof hit === 'string' ? { url: hit } : hit;
        const url = publicSourceUrl(source.url || source.sourceUrl); if (!url) continue;
        discovered.push({ ...source, url, discoveredBy: query, verified: false });
        // Search snippets and role claims are not publisher verification.
        if (!platformRole(url) && !registryUrl(url) && !checked.some(item => item.url === url)) checked.push(await verifyOfficialCandidate({ url, provenance: 'search_candidate', sourceUrl: source.sourceUrl || '' }, { ...options, name }));
      }
    } catch (error) { failures.push({ query, step: 'source_search', error: error.message || 'search_unavailable' }); searches.push({ query, status: 'failed', candidates: 0 }); }
  }
  for (const source of checked) if (!source.verified) failures.push({ url: source.url, step: 'official_website', status: source.status, error: source.error, provenance: source.provenance });
  let officialStatus = 'not_found';
  if (hasVerified()) officialStatus = 'verified';
  else if (checked.some(source => source.status === 'access_restricted')) officialStatus = 'access_restricted';
  else if (checked.some(source => source.status === 'unavailable')) officialStatus = 'unavailable';
  else if (checked.some(source => source.status === 'unverified')) officialStatus = 'unverified';
  else if (searches.some(search => search.status === 'failed') || failures.some(f => f.step === 'source_search')) officialStatus = 'search_incomplete';
  if (officialStatus === 'not_found') failures.push({ step: 'official_website', status: 'not_found', error: 'current_edition_official_website_not_found', queries });
  const officialUrls = checked.filter(source => source.verified).map(source => source.url);
  const existing = [race.signup_url, race.signupUrl, race.event_url, race.eventUrl, race.official_url, race.officialUrl, race.sourceUrl, race.source_url, ...(race.sourceUrls || [])].filter(Boolean);
  const sources = rankSources([...checked.filter(source => source.verified), ...documents.map(doc => ({ url: doc.url })), ...existing, ...discovered], { officialUrls });
  return { urls: sources.map(source => source.url), sources, sourceRoles: Object.fromEntries(sources.map(source => [source.url, source.role])), officialStatus, officialCandidates: checked.map(({ document, ...source }) => source), documents: checked.filter(source => source.verified && source.document).map(source => source.document), queries, searches, failures };
}

module.exports = { CAA_DETAIL_URL, ROLE_PRIORITY, publicSourceUrl, platformRole, sourceRole, rankSources, caaOfficialUrls, officialIdOf, fetchCaaSource, officialCandidates, currentEditionMatches, accessIssue, verifyOfficialCandidate, missingSourceQueries, discoverRaceSources };
