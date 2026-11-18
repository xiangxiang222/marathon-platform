'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseGuide } = require('../miniprogram/utils/guide-md');
const content = require('../miniprogram/utils/race-detail-content');
const { detailFixture } = require('./race-detail-mini-regression.cjs');
const sample = require('./race-rich-detail-fixture.cjs');

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
  const f = detailFixture({ ...sample, deadline: '', regStart: '' });
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
  const webArea = web.slice(web.indexOf('class="official-actions signup-entry"'), web.indexOf('<div v-if="tabs.length"'));
  const miniArea = mini.slice(mini.indexOf('class="official-qr signup-entry"'), mini.indexOf('<view class="race-follow-row">'));
  assert.doesNotMatch(webArea, /<details|<summary|href=|官方报名|复制链接/);
  assert.doesNotMatch(miniArea, /toggleSignupQr|copyLink|官方报名|展开二维码|复制链接/);
});

module.exports = { sample };
