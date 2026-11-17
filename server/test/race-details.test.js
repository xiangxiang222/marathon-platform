const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { readDetails, writeDetails, mergeGuideText } = require('../src/race-details');
const { presentRace } = require('../src/races');
const { app } = require('../src/index');
const { getDb } = require('../src/db');

const details = { version: 1, registration: { status: 'closed', verified: true, sourceUrl: 'https://reg.zuicool.com/77675' }, groups: [
  { name: '50公里雾隐牡丹组', actualDistanceKm: 49.93, fees: [{ amount: 398 }] },
  { name: '25公里盐泉皓月组', actualDistanceKm: 24.8, status: 'sold_out', fees: [{ amount: 198 }] },
  { name: '10公里梯田筑梦组（个人组）', actualDistanceKm: 13.5, fees: [{ amount: 98 }] },
  { name: '10公里梯田筑梦组（亲子组1大1小）', actualDistanceKm: 13.5, fees: [{ amount: 196 }] }
], sections: [{ title: '参赛资格', text: '近三年完赛证明' }], sources: [{ url: 'https://reg.zuicool.com/77675' }] };
const row = { id: 'detail-sample', name: '2026重庆垫江明月山越野赛', race_date: '2026-11-21', distances: '', kinds: 'trail,family', deadline: '', signup_url: 'https://reg.zuicool.com/77675', guide_text: writeDetails('# 参赛资格\n正文', details) };

test('versioned rich details retain every group and do not leak metadata into prose', () => {
  const saved = readDetails(row.guide_text);
  assert.deepEqual(saved.details, details);
  const race = presentRace(row, new Date('2026-11-17T00:00:00Z'));
  assert.equal(race.groups.length, 4);
  assert.equal(race.details.groups[3].fees[0].amount, 196);
  assert.equal(race.details.groups[2].actualDistanceKm, 13.5);
  assert.equal(race.guideText, '# 参赛资格\n正文');
  assert.equal(race.registrationLabel, '报名已截止');
  assert.equal(race.regStatus, '报名已截止');
  assert.equal(race.open, false);
  assert.equal(race.signupChannel, '最酷');
  assert.equal(race.signupQrAvailable, true);
  assert.equal(race.details.sources, undefined);
  assert.equal(race.details.registration.sourceUrl, undefined);
});

test('manual prose edits preserve group/status data and replace old collected chapters', () => {
  const unchanged = readDetails(mergeGuideText('# 参赛资格\n正文', row.guide_text));
  assert.equal(unchanged.details.sections.length, 1);
  const edited = readDetails(mergeGuideText('编辑确认的新说明', row.guide_text));
  assert.equal(edited.text, '编辑确认的新说明');
  assert.equal(edited.details.groups.length, 4);
  assert.deepEqual(edited.details.sections, []);
  assert.equal(edited.details.registration.status, 'closed');
  assert.equal(edited.details.audit.preservedEditorialGuide, true);
});

test('the displayed generated body removes exact repeated chapters and retains independent manual prose', () => {
  const sections = [{ title: '报名与费用', text: '个人98元；亲子196元。' }, { title: '报名与费用', text: '个人98元；亲子196元。' }];
  const generated = sections.map(s => '## ' + s.title + '\n\n' + s.text).join('\n\n');
  const rich = { ...details, sections };
  assert.equal(presentRace({ ...row, guide_text: writeDetails(generated, rich) }).guideText, '## 报名与费用\n\n个人98元；亲子196元。');
  assert.equal(presentRace({ ...row, guide_text: writeDetails('人工完整说明，含新领物安排。', rich) }).guideText, '人工完整说明，含新领物安排。');
});

test('public rich details remove exact OCR duplicates without merging distinct fee stages', () => {
  const duplicateGroup = { ...details.groups[2], fees: [{ amount: 98 }, { amount: 128 }], sourceUrl: 'https://example.com/guide-2' };
  const rich = writeDetails('已核对正文', {
    ...details,
    sections: [
      { title: '报名与费用', text: '个人组 98 元。' },
      { title: '报名与费用', text: '个人组 98 元。' },
      { title: '参赛资格', text: '近三年完赛证明。' },
    ],
    groups: [
      { ...details.groups[2], fees: [{ amount: 98 }, { amount: 98, sourceUrl: 'https://example.com/fee' }, { amount: 128 }] },
      duplicateGroup,
    ],
    media: [{ sheetId: 31, kind: 'guide', caption: '原图' }, { sheetId: 31, kind: 'guide', caption: '原图（重复上传记录）' }]
  });
  const race = presentRace({ ...row, guide_text: rich }, new Date('2026-11-17T00:00:00Z'));
  assert.equal(race.details.sections.length, 2);
  assert.equal(race.details.groups.length, 1);
  assert.deepEqual(race.details.groups[0].fees.map((fee) => fee.amount), [98, 128]);
  assert.equal(race.details.media.length, 1);
  assert.equal(race.groups.length, 1);
});

test('full long guides survive round trips and comment terminators cannot corrupt the trailer', () => {
  const prose = '完整规程'.repeat(14000);
  const source = writeDetails(prose, { version: 1, sections: [{ title: '说明', text: '-->' }] });
  assert.equal(readDetails(source).text, prose);
  assert.equal(readDetails(source).details.sections[0].text, '-->');
  assert.equal(readDetails('old guide\n<!-- broken -->').text, 'old guide\n<!-- broken -->');
});

test('closed registration and a legal cancellation clause do not cancel an event', () => {
  const race = presentRace({ ...row, guide_text: writeDetails('遇不可抗力组委会有权取消比赛。', details) }, new Date('2026-11-17T00:00:00Z'));
  assert.equal(race.registrationStatus, 'closed');
  const cancelled = presentRace({ ...row, guide_text: '赛事已取消。提示：活动取消' }, new Date('2026-11-17T00:00:00Z'));
  assert.equal(cancelled.registrationStatus, 'cancelled');
  assert.equal(cancelled.signupQrAvailable, false);
  assert.equal(cancelled.links.some(item => item.key === 'signup'), false);
});

test('an early-bird or elite cutoff cannot close general registration', () => {
  const source = { ...row, guide_text: '', deadline: '2026-09-21', deadline_name: '早鸟截止' };
  const race = presentRace(source, new Date('2026-11-17T00:00:00Z'));
  assert.equal(race.registrationStatus, 'unknown');
  assert.equal(race.regStatus, '报名时间未录入');
  const verified = presentRace({ ...source, guide_text: writeDetails('报名通知', { version: 1, registration: { status: 'open', verified: true, closesAt: '2026-11-20' } }) }, new Date('2026-11-17T00:00:00Z'));
  assert.equal(verified.registrationStatus, 'open');
});

test('an unverified existing entrance is retained as data without being advertised as a signup QR', () => {
  const race = presentRace({ ...row, guide_text:writeDetails('报名入口尚未核实', {version:1,registration:{status:'unknown',entranceVerified:false}}) });
  assert.equal(race.signupQrAvailable,false);
  assert.equal(race.registrationStatus,'unknown');
  assert.equal(race.links.find(link=>link.key==='signup').url,row.signup_url);
});

test('multi-day lifecycle includes both boundary days and keeps registration independent', () => {
  const schedule = { startDate: '2026-11-12', endDate: '2026-11-23' };
  const source = { ...row, race_date: schedule.startDate, guide_text: writeDetails('多日赛事规程', { ...details, schedule }) };
  for (const [instant, phase] of [
    ['2026-11-11T23:59:59+08:00', '报名已截止'],
    ['2026-11-12T00:00:00+08:00', '比赛中'],
    ['2026-11-17T12:00:00+08:00', '比赛中'],
    ['2026-11-23T23:59:59+08:00', '比赛中'],
    ['2026-11-24T00:00:00+08:00', '已结束']
  ]) {
    const race = presentRace(source, new Date(instant));
    assert.equal(race.regStatus, phase, instant);
    assert.equal(race.registrationStatus, 'closed');
    assert.equal(race.raceDateLabel, '2026-11-12 — 2026-11-23');
    assert.equal(race.raceEndDate, '2026-11-23');
  }
  for (const endDate of ['2026-11-11', '2026-11-12', '2026-02-30', 'not-a-day']) {
    const race = presentRace({ ...source, guide_text: writeDetails('规程', { ...details, schedule: { ...schedule, endDate } }) }, new Date('2026-11-17T00:00:00+08:00'));
    assert.equal(race.regStatus, '已结束');
    assert.equal(race.raceDateLabel, '2026-11-12');
  }
  assert.equal(presentRace(row, new Date('2026-11-21T12:00:00+08:00')).regStatus, '比赛中');
});

test('ongoing multi-day races remain in upcoming, live and overlapping calendar months', async () => {
  const db = getDb(), previous = db.prepare('SELECT race_date,guide_text FROM races WHERE id=?').get('chaoyang');
  const now = new Date(Date.now() + 8 * 3600000), today = now.toISOString().slice(0, 10);
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 28)).toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 2)).toISOString().slice(0, 10);
  try {
    db.prepare('UPDATE races SET race_date=?,guide_text=? WHERE id=?').run(startDate, writeDetails('多日赛', { ...details, schedule: { startDate, endDate } }), 'chaoyang');
    for (const query of ['status=upcoming', 'status=live', 'status=all&month=' + today.slice(0, 7)]) {
      const response = await request(app).get('/marathon/api/races?' + query);
      assert.equal(response.status, 200);
      const race = response.body.races.find(item => item.id === 'chaoyang');
      assert.ok(race, query);
      assert.equal(race.regStatus, '比赛中');
      assert.equal(race.raceEndDate, endDate);
    }
  } finally { db.prepare('UPDATE races SET race_date=?,guide_text=? WHERE id=?').run(previous.race_date, previous.guide_text, 'chaoyang'); }
});

test('cancelled and invalid entrances cannot serve generated signup QR codes', async () => {
  const db = getDb();
  const previous = db.prepare('SELECT signup_url,guide_text FROM races WHERE id=?').get('chaoyang');
  try {
    for (const status of ['cancelled', 'invalid']) {
      db.prepare('UPDATE races SET signup_url=?,guide_text=? WHERE id=?').run('https://reg.zuicool.com/77675', writeDetails('公告', { version: 1, registration: { status, verified: true } }), 'chaoyang');
      assert.equal((await request(app).get('/marathon/api/races/chaoyang/signup-qr')).status, 404);
    }
  } finally { db.prepare('UPDATE races SET signup_url=?,guide_text=? WHERE id=?').run(previous.signup_url, previous.guide_text, 'chaoyang'); }
});

test('calendar responses stay small while the detail API retains the complete saved guide', async () => {
  const db = getDb(), previous = db.prepare('SELECT guide_text FROM races WHERE id=?').get('chaoyang');
  const prose = '完整的图片规程与路线说明。'.repeat(10000);
  try {
    db.prepare('UPDATE races SET guide_text=? WHERE id=?').run(writeDetails(prose, { ...details, sections:[{title:'规程',text:prose}] }), 'chaoyang');
    const list = await request(app).get('/marathon/api/races?status=all');
    assert.equal(list.status,200);
    const summary = list.body.races.find(race => race.id==='chaoyang');
    assert.equal(summary.guideText,undefined);
    assert.equal(summary.details,undefined);
    assert.equal(summary.groups.length,4);
    assert.ok(Buffer.byteLength(JSON.stringify(summary))<20000);
    const detail = await request(app).get('/marathon/api/races/chaoyang');
    assert.equal(detail.status,200);
    assert.equal(detail.body.race.guideText,prose);
    assert.equal(detail.body.race.details.groups.length,4);
  } finally { db.prepare('UPDATE races SET guide_text=? WHERE id=?').run(previous.guide_text,'chaoyang'); }
});
