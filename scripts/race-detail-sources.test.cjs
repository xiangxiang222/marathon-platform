'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { publicSourceUrl, platformRole, sourceRole, rankSources, caaOfficialUrls, officialCandidates, officialIdOf, currentEditionMatches, verifyOfficialCandidate, fetchCaaSource, missingSourceQueries, discoverRaceSources } = require('./race-detail-sources.cjs');

const name = '2026重庆垫江明月山越野赛';
const page = (url, extra = {}) => ({ url, title: name + ' 官方网站', text: name + '\n竞赛规程\n报名时间', links: [], capture: { fresh: true }, ...extra });
const caa = (webUrl) => ({ success: true, data: { ssdetails: { name, webUrl } } });

test('association IDs must be entirely numeric and cannot be inferred from a 10k alias', () => {
  assert.equal(officialIdOf({id:'caa-10k'}),'');
  assert.equal(officialIdOf({id:'caa-1000452086'}),'1000452086');
});

test('association website field produces a lead, with official documents ranked above platforms after verification', async () => {
  const url = 'http://mingyue.example/2026/';
  const result = await discoverRaceSources({ id: 'caa-1000480022', name, event_url: 'https://zuicool.com/event/96336', signup_url: 'https://reg.zuicool.com/77675' }, {
    caaDetails: caa(url), readDocument: async value => page(value), search: async () => []
  });
  assert.equal(result.officialStatus, 'verified');
  assert.equal(result.urls[0], url);
  assert.equal(result.sourceRoles[url], 'official_website');
  assert.equal(result.sourceRoles['https://reg.zuicool.com/77675'], 'registration_platform');
  assert.deepEqual(rankSources([{ url: 'https://reg.zuicool.com/77675' }, { url: 'https://race.example/2026/rules.pdf', role: 'official_document', verified: true }]).map(s => s.role), ['official_document', 'registration_platform']);
});

test('ordinary platform URLs never become official websites through database fields, association fields or role claims', () => {
  const platform = 'https://reg.zuicool.com/77675';
  assert.deepEqual(caaOfficialUrls(caa(platform)), []);
  assert.deepEqual(officialCandidates({ event_url: platform, official_url: 'https://www.runchina.org.cn/#/race/v/detail/1000480022' }), []);
  assert.equal(sourceRole({ url: platform, role: 'official_website', verified: true }), 'registration_platform');
  assert.equal(platformRole('https://zuicool.com/event/96336'), 'discovery_platform');
  assert.equal(platformRole('https://notzuicool.com/race'), '');
});

test('only explicit association website fields are extracted, retaining HTTP when a site requires it', () => {
  assert.deepEqual(caaOfficialUrls({ body: caa('http://race.example/2026') }), ['http://race.example/2026']);
  assert.deepEqual(caaOfficialUrls({ data: { ssdetails: { imageUrl: 'https://race.example/official.jpg' } } }), []);
  assert.equal(publicSourceUrl('http://race.example/2026'), 'http://race.example/2026');
  for (const url of ['https://user:pass@race.example', 'https://localhost/race', 'http://172.16.0.1', 'http://127.1', 'http://[::1]', 'javascript:alert(1)']) assert.equal(publicSourceUrl(url), '');
});

test('official sources require the current edition identity, rejecting last year and a different locality', async () => {
  assert.equal(currentEditionMatches(name, page('https://race.example')), true);
  assert.equal(currentEditionMatches(name, { title: '2025重庆垫江明月山越野赛官网', text: '历年2026重庆垫江明月山越野赛资料' }), false);
  assert.equal(currentEditionMatches(name, { title: '2026重庆巴南越野赛官网', text: '赛事规程' }), false);
  assert.equal(currentEditionMatches(name, { title: '重庆垫江明月山越野赛', text: '2026年11月21日 本届比赛信息' }), true);
  const result = await verifyOfficialCandidate({ url: 'https://race.example', provenance: 'caa_web_url' }, { name, readDocument: async url => page(url, { title: '2025重庆垫江明月山越野赛', text: '往届规程' }) });
  assert.equal(result.status, 'rejected');
  assert.equal(result.error, 'edition_name_or_locality_mismatch');
});

test('association lookup reports access errors distinctly from an empty official response', async () => {
  let posted;
  const good = await fetchCaaSource({ id: 'caa-1000480022' }, { fetchImpl: async (url, options) => { posted = JSON.parse(options.body); return { ok: true, json: async () => caa('https://race.example') }; } });
  assert.deepEqual(posted, { id: '1000480022', type: 'SS' });
  assert.equal(good.attempted, true);
  assert.equal(good.failures.length, 0);
  const denied = await fetchCaaSource({ officialIds: ['1000480022'] }, { fetchImpl: async () => ({ ok: false, status: 403 }) });
  assert.equal(denied.failures[0].error, 'HTTP_403');
  const empty = await fetchCaaSource({ officialId: '1000480022' }, { fetchImpl: async () => ({ ok: true, json: async () => ({ success: true, data: {} }) }) });
  assert.equal(empty.failures[0].error, 'empty_official_response');
});

test('captcha, HTTP denial and search failure cannot be reported as an official website not found', async () => {
  const denied = await discoverRaceSources({ name, event_url: 'https://race.example/2026' }, { fetchCaa: false, readDocument: async () => ({ title: '安全验证', text: '请完成验证' }), search: async () => [] });
  assert.equal(denied.officialStatus, 'access_restricted');
  assert.ok(denied.failures.some(f => f.status === 'access_restricted'));
  assert.ok(!denied.failures.some(f => f.error === 'current_edition_official_website_not_found'));
  const failed = await discoverRaceSources({ name }, { fetchCaa: false, search: async () => { throw new Error('search_captcha'); } });
  assert.equal(failed.officialStatus, 'search_incomplete');
  assert.ok(failed.failures.every(f => f.error !== 'current_edition_official_website_not_found'));
  const absent = await discoverRaceSources({ name }, { fetchCaa: false, search: async () => [] });
  assert.equal(absent.officialStatus, 'not_found');
  assert.ok(absent.failures.some(f => f.error === 'current_edition_official_website_not_found'));
  const partial = await discoverRaceSources({ name }, { fetchCaa: false, missingFields: ['fees'], search: async query => query.includes('官网') ? [] : { sources: [], failures: [{ error: 'search_access_verification_required' }] } });
  assert.equal(partial.officialStatus, 'search_incomplete');
  assert.ok(!partial.failures.some(f => f.error === 'current_edition_official_website_not_found'));
});

test('a discovered platform race still searches independently for the website and every requested missing field', async () => {
  const queries = [];
  const result = await discoverRaceSources({ name, event_url: 'https://zuicool.com/event/96336' }, { fetchCaa: false, missingFields: ['fees', 'eligibility', 'pickup'], search: async query => { queries.push(query); return [{ url: 'https://www.sports.gov.cn/race/2026.html' }]; }, readDocument: async url => page(url, { title: name + '报名公告' }) });
  assert.equal(queries.length, 4);
  assert.ok(queries.some(q => q.includes('早鸟价')));
  assert.ok(queries.some(q => q.includes('出生日期')));
  assert.ok(queries.some(q => q.includes('领物须知')));
  assert.equal(result.officialStatus, 'verified');
  assert.equal(result.sourceRoles['https://www.sports.gov.cn/race/2026.html'], 'official_announcement');
  assert.equal(result.sourceRoles['https://zuicool.com/event/96336'], 'discovery_platform');
  assert.equal(missingSourceQueries(name, ['fees', 'fees'], { officialVerified: true }).length, 1);
});

test('a directory-only race can find an official site from a dated registration search', async () => {
  const name='2026测试马拉松', calendar='https://www.runchina.org.cn/#/race/v/detail/1000';
  const news='https://public.example/2026/news', site='http://www.race.example/';
  const entry='https://test-registration.mararun.com/signlist.html';
  const queries=[];
  const result=await discoverRaceSources({name,race_date:'2026-12-27',official_url:calendar},{
    fetchCaa:false,missingFields:['registration'],
    search:async query=>{queries.push(query);return query.includes('12月27日')?[news,entry]:[];},
    readDocument:async url=>page(url,{title:name+(url===site?'':'启动报名'),text:'活动公告：赛事官方网站（www.race.example）'})
  });
  assert.ok(queries.includes(name+' 报名 12月27日'));
  assert.equal(result.sourceRoles[site],'official_website');
  assert.equal(result.sourceRoles[calendar],'official_registry');
  assert.equal(result.sourceRoles[entry],'registration_platform');
  assert.equal(result.sourceRoles[news],'public_source');
});

test('WeChat official status requires a provenance anchor for the exact article, not a snippet or shared origin', async () => {
  const url = 'https://mp.weixin.qq.com/s/official-article';
  const options = { name, readDocument: async value => page(value) };
  const searched = await verifyOfficialCandidate({ url, provenance: 'search_candidate', role: 'official_announcement' }, options);
  assert.equal(searched.verified, false);
  assert.equal(searched.error, 'official_publisher_not_confirmed');
  const anchored = await verifyOfficialCandidate({ url, provenance: 'explicit_official_link' }, options);
  assert.equal(anchored.verified, true);
  assert.equal(anchored.role, 'official_announcement');
  assert.equal(sourceRole({ url: 'https://mp.weixin.qq.com/s/unrelated' }, { officialOrigins: ['https://mp.weixin.qq.com'] }), 'public_article');
  assert.equal(sourceRole({ url }, { officialUrls: [url] }), 'official_announcement');
  assert.equal(sourceRole({ url: 'https://race.example/2025/rules' }, { officialOrigins: ['https://race.example'] }), 'public_source');
});

test('existing event URL without an official publisher claim is a lead, and redirects to platforms are rejected', async () => {
  const unconfirmed = await verifyOfficialCandidate({ url: 'https://article.example/2026', provenance: 'existing_event_url' }, { name, readDocument: async url => page(url, { title: name + ' 报名信息' }) });
  assert.equal(unconfirmed.status, 'unverified');
  const redirected = await verifyOfficialCandidate({ url: 'https://race.example', provenance: 'caa_web_url' }, { name, readDocument: async () => page('https://reg.zuicool.com/77675') });
  assert.equal(redirected.status, 'rejected');
  assert.equal(redirected.error, 'redirected_to_platform_or_registry');
});

test('a public article quoting website instructions is not itself an official publisher', async () => {
  const url='https://www.163.com/dy/article/race.html';
  const result=await verifyOfficialCandidate({url,provenance:'search_candidate'}, {name,readDocument:async value=>page(value,{title:name+'报名公告',text:name+'\n请登录赛事官方网站报名。'})});
  assert.equal(result.verified,false);
  assert.equal(result.error,'official_publisher_not_confirmed');
});

test('a discovered announcement leads to its explicit current-edition website before platform prose', async () => {
  const article='https://news.example/race',website='http://race.example/2026';
  const result=await discoverRaceSources({name},{fetchCaa:false,search:async()=>[{url:article}],readDocument:async url=>url===article?page(url,{title:name+'报名公告',links:[{url:website,label:'赛事官方网站'}]}):page(url,{title:name,text:name+'\n报名费用\n参赛资格'})});
  assert.equal(result.officialStatus,'verified');
  assert.equal(result.sources[0].url,website);
  assert.equal(result.sourceRoles[article],'public_source');
  assert.equal(result.sourceRoles[website],'official_website');
});

test('a website printed in the regulation contact text is opened and edition checked', async () => {
  const result=await discoverRaceSources({name},{fetchCaa:false,documents:[{url:'https://reg.zuicool.com/123',text:'联系我们\n赛事官网：www.race.example/2026\n咨询电话：12345678',links:[]}],search:async()=>[],readDocument:async url=>page(url,{title:name})});
  assert.equal(result.officialStatus,'verified');
  assert.equal(result.sources[0].url,'http://www.race.example/2026');
});
