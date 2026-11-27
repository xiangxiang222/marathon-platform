'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseGuide } = require('../miniprogram/utils/guide-md');
const content = require('../miniprogram/utils/race-detail-content');
const { detailFixture } = require('./race-detail-mini-regression.cjs');
const sample = require('./race-rich-detail-fixture.cjs');

test('both clients keep dated early-bird and verified general deadlines with one next node', async () => {
  const web = await import('../web/src/race-detail-content.js');
  const now = Date.parse('2035-10-17T03:00:00+08:00');
  const race = {
    raceDate: '2035-11-04',
    registrationStatus: 'open',
    details: { registration: { verified: true, closesAt: '2035-10-19T10:00:00Z' } },
    nodes: [
      { key: 'race', label: '比赛日', at: '2035-11-04', past: false },
      { key: 'bib', label: '号码公布', at: '', past: false },
      { key: 'deadline', label: '早鸟截止', at: '2035-10-17 09:00', past: true, today: true },
      { key: 'draw', label: '出签', at: '2035-10-20T01:00:00Z', past: false }
    ]
  };
  for (const platform of [web, content]) {
    const { rows, next } = platform.raceTimeline(race, now);
    assert.deepEqual(rows.map(row => [row.label, row.at]), [
      ['早鸟截止', '2035-10-17 09:00'], ['报名截止', '2035-10-19 18:00'],
      ['出签', '2035-10-20 09:00'], ['比赛日', '2035-11-04']
    ]);
    assert.equal(rows[0].past, true, 'the supplied precise API cutoff takes precedence over the device clock');
    assert.equal(next.key, 'deadline');
    assert.equal(rows.filter(row => row.key === next.key).length, 1);
    const cancelled = platform.raceTimeline({ ...race, registrationStatus: 'cancelled' }, now);
    assert.ok(!cancelled.next, 'cancelled events do not promote future nodes');
  }
});

test('full options preserve parent-child price and distinguish branded and actual distance', async () => {
  const groups = content.groupCards(sample);
  assert.equal(groups.length, 4);
  assert.equal(groups[3].name, sample.details.groups[3].name);
  assert.ok(groups[3].fields.some(field => field.label === '亲子人数' && field.value === '1大1小'));
  assert.ok(groups[2].fields.some(field => field.label === '标称距离' && field.value === '10公里'));
  assert.ok(groups[2].fields.some(field => field.label === '实际里程' && field.value === '13.5公里'));
  assert.equal(groups[3].fees[0].text, '亲子套餐 · 196元/组');
  assert.match(groups[0].fees[1].text, /358元\/人.*2026-09-21/);
  const web = await import('../web/src/race-detail-content.js');
  assert.deepEqual(web.groupCards(sample), groups);
});

test('legacy cutoff durations never appear as clock times or erase conflicting values', async () => {
  const race = { details: { groups: [
    { name: '重复时长', cutoffAt: '5.5小时', cutoffHours: 5.5 },
    { name: '只有时长', cutoffTime: '3h30m' },
    { name: '实际时刻', cutoffAt: '2026-11-01 14:30', cutoffHours: 5.5 },
    { name: '两种来源值', cutoffAt: '6小时', cutoffHours: 5.5 },
    { name: '复合时长', cutoffAt: '3小时30分钟' }
  ] } };
  const cards = content.groupCards(race);
  assert.deepEqual(cards[0].fields.map(({ label, value }) => [label, value]), [['关门时长', '5.5小时']]);
  assert.deepEqual(cards[1].fields.map(({ label, value }) => [label, value]), [['关门时长', '3h30m']]);
  assert.deepEqual(cards[2].fields.map(({ label, value }) => [label, value]), [['关门时间', '2026-11-01 14:30'], ['关门时长', '5.5小时']]);
  assert.deepEqual(cards[3].fields.map(({ label, value }) => [label, value]), [['关门时长', '5.5小时'], ['关门时长（原时间字段）', '6小时']]);
  assert.deepEqual(cards[4].fields.map(({ label, value }) => [label, value]), [['关门时长', '3小时30分钟']]);
  const web = await import('../web/src/race-detail-content.js');
  assert.deepEqual(web.groupCards(race), cards);
});

test('guide sections and tables retain their full rows without leaking collection metadata', async () => {
  const source = content.guideSource(sample);
  assert.match(source, /参赛资格/);
  assert.equal(content.guideSource({ ...sample, guideText: '人工整理的可靠正文' }), '人工整理的可靠正文');
  const blocks = parseGuide(source + '\n<!-- race-details:v1\n{"privateSource":"secret"}\n-->', { rich: true });
  const table = blocks.find(block => block.kind === 'table');
  assert.equal(table.headers.length, 3);
  assert.equal(table.rows[0].cells[2].runs[0].text, '报到与强装检查');
  assert.equal(blocks.find(block => block.kind === 'image').src, '/marathon/api/race-sheets/71');
  assert.doesNotMatch(JSON.stringify(blocks), /privateSource|secret/);
  const web = await import('../web/src/guide-md.js');
  assert.deepEqual(web.parseGuide(source, { rich: true }), parseGuide(source, { rich: true }));
  assert.equal(parseGuide('![bad](javascript:alert(1))', { rich: true }).length, 0);
  assert.equal(parseGuide('| 原有编辑预览 | 保留段落 |\n| --- | --- |').every(block => block.kind === 'p'), true);
});

test('both clients link guide tasks to recorded content without repeating their jump targets', async () => {
  const web = await import('../web/src/race-detail-content.js');
  const race = {
    pickup: '周五在北门二层凭证件领取参赛包。',
    guideText: '## 报到\n周五在北门二层凭证件领取参赛包。\n\n## 参赛资格\n请携带报名所用证件。\n\n## 路线图\n长距离组从西门起跑。'
  };
  const blocks = parseGuide(race.guideText, { rich: true });
  for (const platform of [web, content]) {
    const layout = platform.guideLayout(race, blocks);
    const { tasks, chapters } = platform.guideNavigation(layout, { hasBody: true, originals: true });
    assert.equal(layout.pickup, '', 'verbatim pickup prose remains in the guide chapter alone');
    const pickup = layout.chapters.find(item => item.label === '报到');
    const route = layout.chapters.find(item => item.label === '路线图');
    assert.deepEqual(tasks.map(item => item.id), [pickup.id, route.id]);
    assert.ok(chapters.some(item => item.label === '参赛资格'));
    assert.equal([...tasks, ...chapters].filter(item => item.id === pickup.id).length, 1);
    assert.equal(tasks.some(item => item.id === 'pacers'), false, 'unknown pacer information creates no task');
    const combined = parseGuide('## 领物与赛道\n周五从北门领物，周六从西门起跑。', { rich: true });
    const combinedNav = platform.guideNavigation(platform.guideLayout({}, combined), { hasBody: true });
    assert.deepEqual(combinedNav.tasks.map(item => item.label), ['领物与比赛日', '赛道与路线']);
    assert.equal(new Set(combinedNav.tasks.map(item => item.kind || item.id)).size, 2, 'different task labels can share one authentic chapter and still have distinct control keys');
    assert.deepEqual(combinedNav.chapters, []);
  }
});

test('guide chapters take priority, repeated summaries disappear and distinct notes remain', async () => {
  const race = { guideText: '## 日程与领物\n11月20日领物。\n\n## 路线与补给\n| 组别 | 补给 |\n| --- | --- |\n| 亲子组 | 水<br>能量食品 |', pickup: '11月20日领物。', route: '路线仍以比赛日公告为准。', pacers: '', guide: [{ id: 81 }], details: { media: [{ sheetId: 81, caption: '日程与领物原图' }] } };
  const blocks = parseGuide(race.guideText, { rich: true });
  const layout = content.guideLayout(race, blocks);
  assert.deepEqual(layout.chapters.map(item => item.label), ['日程与领物', '路线与补给']);
  assert.equal(layout.pickup, '', 'an exact summary already in the full guide is shown once');
  assert.equal(layout.route, race.route, 'different or unconfirmed notes are never hidden by a matching chapter title');
  assert.equal(blocks.find(block => block.kind === 'table').rows[0].cells[1].runs[0].text, '水\n能量食品');
  const web = await import('../web/src/race-detail-content.js');
  assert.deepEqual(web.guideLayout(race, blocks), layout);
  assert.equal(content.sheetCaption(race, race.guide[0], '原图'), '日程与领物原图');
  const f = detailFixture({ ...sample, ...race });
  f.page.onLoad({ id: sample.id }); await f.page.load();
  assert.deepEqual(Array.from(f.page.data.guideSections, item => item.label), ['日程与领物', '路线与补给', '赛道与路线', '规程原图参考']);
  assert.equal(f.page.data.guideOriginalsOpen, false);
  f.page.goToGuide({ currentTarget: { dataset: { id: 'originals' } } });
  assert.equal(f.page.data.guideOriginalsOpen, true);
  assert.equal(f.scrolls[0].selector, '#guide-originals');
  assert.equal(f.page.data.guide[0].caption, '日程与领物原图');
  const current = f.page.data.guide[0].src;
  f.page.retryMedia({ currentTarget: { dataset: { kind: 'guide', id: 81 } } });
  f.page.previewGuide({ currentTarget: { dataset: { src: current } } });
  assert.ok(f.previews[0].urls.includes(current), 'retry keeps the canonical original available');
});

test('closed registration remains a known status without a cutoff and QR previews only the selected entry', async () => {
  const f = detailFixture({ ...sample, deadline: '', regStart: '' }, true, '2026-11-17T12:00:00+08:00');
  f.page.onLoad({ id: sample.id }); await f.page.load();
  assert.equal(f.page.data.publicStatus, '报名已截止');
  assert.equal(f.page.data.phaseTitle, '报名已截止');
  assert.equal(f.page.data.detailGroups.length, 4);
  assert.equal(f.page.data.signupHint, '最酷 · 报名已关闭，二维码可查看本届报名信息。');
  assert.ok(f.page.data.signupQr.endsWith(sample.signupQrUrl));
  f.page.previewSignupQr();
  assert.equal(f.previews[0].current, f.page.data.signupQr);
  assert.deepEqual(Array.from(f.previews[0].urls), [f.page.data.signupQr]);
  f.page.signupQrError(); f.page.previewSignupQr(); assert.equal(f.previews.length, 1);
  f.page.retrySignupQr(); f.page.previewSignupQr(); assert.equal(f.previews.length, 2);
  assert.equal(f.page.data.guideBlocks.filter(block => block.kind === 'image').length, 1);
  f.page.previewGuide({ currentTarget: { dataset: { src: f.page.data.guideBlocks.find(block => block.kind === 'image').src } } });
  assert.equal(f.previews.length, 3);
  assert.equal(f.page.data.myStatus, '');
});

test('a completed race retains lifecycle status alongside independently closed registration', async () => {
  const f = detailFixture({ ...sample, raceDate: '2026-01-01' });
  f.page.onLoad({ id: sample.id }); await f.page.load();
  assert.equal(f.page.data.publicStatus, '已结束');
  assert.equal(f.page.data.registrationLabel, '报名已截止');
  const groups = content.groupCards({ details: { groups: [{ name: '组别', status: 'unknown' }] } });
  assert.equal(groups[0].status, '');
});

test('cancelled or invalid entries cannot show a registration QR even when a URL remains', async () => {
  for (const state of ['cancelled', 'invalid']) {
    const f = detailFixture({ ...sample, registrationStatus: state, registrationLabel: state === 'cancelled' ? '赛事已取消' : '报名入口已失效' });
    f.page.onLoad({ id: sample.id }); await f.page.load();
    assert.equal(f.page.data.signupQr, '');
    f.page.previewSignupQr(); assert.equal(f.previews.length, 0);
  }
  const web = fs.readFileSync(require.resolve('../web/src/views/Race.vue'), 'utf8');
  const mini = fs.readFileSync(require.resolve('../miniprogram/pages/race/race.wxml'), 'utf8');
  const webStart = web.indexOf('class="official-actions signup-entry"');
  const webArea = web.slice(webStart, web.indexOf('</section>', webStart));
  assert.match(webArea, /signup-qr-preview/);
  const miniStart = mini.indexOf('class="official-qr signup-entry"');
  const miniArea = mini.slice(miniStart, mini.indexOf('<navigator wx:if="{{race.archiveId}}"', miniStart));
  assert.match(miniArea, /bindtap="previewSignupQr"/);
  assert.doesNotMatch(webArea, /<details|<summary|href=|官方报名|复制链接/);
  assert.doesNotMatch(miniArea, /toggleSignupQr|copyLink|官方报名|展开二维码|复制链接/);
});

module.exports = { sample };
