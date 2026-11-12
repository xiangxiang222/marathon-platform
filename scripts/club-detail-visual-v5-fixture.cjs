/* Synthetic display records shared by both club-detail visual previews. */
'use strict';
const overview = require('../design/previews/club-overview-fixture.cjs');
const harness = require('../design/previews/club-mileage-test-fixture.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const now = harness.now;
const activities = [
  { id: 91, title: '周末长距离 · 沿河一起跑', startsAt: '2027-01-01 07:00', endsAt: '2027-01-01 09:00', dateLabel: '1月1日 周五', clockLabel: '07:00–09:00', status: 'open', statusLabel: '报名中', place: '西湖柳浪闻莺南门', signupCount: 18, capacity: 30, plannedKm: 16, mine: { signed: true } },
  { id: 92, title: '晨间节奏跑 · 找到自己的节奏', startsAt: '2027-01-02 06:30', endsAt: '2027-01-02 08:00', dateLabel: '1月2日 周六', clockLabel: '06:30–08:00', status: 'open', statusLabel: '报名中', place: '滨河公园跑步道', signupCount: 8, capacity: 20, plannedKm: 10, mine: { signed: false } },
  { id: 93, title: '上周末恢复跑', startsAt: '2026-12-28 07:00', endsAt: '2026-12-28 09:00', dateLabel: '12月28日 周一', clockLabel: '07:00–09:00', status: 'ended', statusLabel: '已结束', place: '滨河公园', signupCount: 16, capacity: 20, plannedKm: 8, mine: { signed: true } },
  { id: 94, title: '雨天取消的晨练', startsAt: '2027-01-03 07:00', endsAt: '2027-01-03 09:00', dateLabel: '1月3日 周日', clockLabel: '07:00–09:00', status: 'cancelled', statusLabel: '已取消', place: '城市运动公园', signupCount: 12, capacity: 20, plannedKm: 10, mine: { signed: true } }
];
const race = { id: 'visual-race', name: '2027杭州西湖城市马拉松与春日健康跑', city: '杭州', raceDate: '2027-03-28', deadlineLabel: '报名中', distanceText: '全程 / 半程马拉松' };
const board = [{ race, title: race.name, text: '杭州西湖城市马拉松\n已报名：晨光团长、河畔领跑员\n想跑：周末慢跑者', summary: '已报名 2 人 · 想跑 1 人', counts: { 已报名: 2, 想跑: 1 }, marks: [{ userId: 1, nickname: '晨光团长', status: '已报名' }, { userId: 2, nickname: '河畔领跑员', status: '已报名' }, { userId: 3, nickname: '周末慢跑者', status: '想跑' }], squad: { text: '半程 1:45–2:00 目标组 · 2 位团友' }, unpaid: [], alternatives: [] }];
const fee = { id: 7, name: '2027 年度跑团会费', amount: 100, startsOn: '2027-01-01', endsOn: '2027-12-31', open: true, note: '用于日常团练补给与公共物料。', mine: { label: '已收到' }, copyText: '已收到：晨光团长、河畔领跑员', groups: [{ status: 'paid', label: '已收到', people: overview.members.slice(0, 2).map(m => ({ userId: m.id, nickname: m.nickname })) }, { status: 'unpaid', label: '未收到', people: overview.members.slice(2, 4).map(m => ({ userId: m.id, nickname: m.nickname })) }], blockSignup: false };
const calls = [{ id: 1, title: '杭州西湖马拉松成绩接龙', filled: 8, closed: false, deadlineLabel: '3月30日截止' }];
const meetups = [{ id: 1, date: '2027-01-03', dateLabel: '1月3日 周日', place: '周日西湖慢跑 · 柳浪闻莺南门', checkCount: 5, statusLabel: '报名中' }];
const internals = [{ id: 1, title: '春日队内 10 公里测试跑', signupCount: 12, statusLabel: '报名中' }];
function payload(scenario = '') { const staff = scenario !== 'ordinary'; return { club: { id: 44, name: scenario === 'long-title' ? overview.longName : '晨光跑团', city: '杭州', owner: staff, staff, role: staff ? 'owner' : 'member', roleLabel: staff ? '团长' : '成员', publicStatus: 'active', code: 'DISPLAY-ONLY' }, members: clone(overview.members), board: clone(board), ranks: [{ distance: 'full', label: '全程马拉松', rows: [{ userId: 1, nickname: '晨光团长', place: 1, clock: '3:18:28', raceId: race.id }] }], groups: [{ id: 1, name: '周末轻松组', pace: '6′00″–6′30″', capacity: 30 }], activities: clone(activities), gifts: [{ id: 1, name: '跑团训练速干背心', cost: 100, stock: 8 }], requests: staff ? [{ id: 11, nickname: '新来的晨跑伙伴' }] : [], checkins: [], checkedIn: false, myPoints: 128 }; }
function response(endpoint, scenario = '') {
  const pathname = new URL(endpoint, 'https://fixture.invalid').pathname;
  if (pathname === '/clubs/44') return payload(scenario);
  if (pathname === '/clubs/44/fees') return { current: clone(fee), history: [clone(fee), { ...clone(fee), id: 6, name: '2026 年度会费', open: false }] };
  if (pathname === '/clubs/44/calls') return { calls: clone(calls) };
  if (pathname === '/clubs/44/meetups') return { meetups: clone(meetups), tiers: [] };
  if (pathname === '/clubs/44/internals') return { races: clone(internals) };
  if (pathname === '/clubs/44/albums') return { albums: [{ id: 91, title: '周末长距离 · 沿河一起跑', dateLabel: '1月1日', photoCount: 18, videoCount: 2 }] };
  if (pathname === '/clubs/44/posts') return { posts: [{ id: 1, nickname: '晨光团长', at: '1月1日 10:30', body: '今天的 16 公里，每个人都跑出了自己的节奏。下周见！', likes: 12, liked: false, comments: [], canDelete: true }] };
  if (pathname === '/clubs/44/attendance') return { rows: [], me: { placeLabel: '第 3 名', count: 8 } };
  if (pathname === '/clubs/44/partner') return { grade: { label: '城市跑步伙伴' } };
  if (pathname === '/clubs/44/mileage') return { rank: [], totalKm: 324.8, totalCount: 30 };
  if (pathname === '/me') return { user: { id: 1, nickname: '晨光团长' }, clubs: [{ id: 44, name: '晨光跑团' }] };
  if (pathname === '/me/feedback/summary') return { total: 0, unread: 0 };
  if (pathname === '/legal') return require('../shared/legal-documents.json');
  throw Error('Unexpected visual fixture endpoint ' + endpoint);
}
module.exports = {
  now, payload, response,
  cases: ['overview', 'activities', 'meetups', 'internals', 'races', 'members', 'fees', 'services', 'service-form', 'albums', 'gifts', 'ordinary', 'long-title'].map(scenario => ({ route: 'pages/club/club', scenario })),
  async prepare(route, initial, scenario) {
    const f = harness.miniFixture(route), p = f.instance; f.setReply(url => Promise.resolve(response(url, scenario))); p.onLoad({ id: '44' }); await p.load();
    const tab = ['activities', 'meetups', 'internals'].includes(scenario) ? 'training' : scenario === 'races' ? 'matches' : ['members', 'fees', 'services', 'service-form', 'ordinary'].includes(scenario) ? 'members' : 'overview';
    p.changeSection(harness.event({ tab })); if (scenario === 'meetups') p.pickActivity(harness.event({ kind: 'meetup' })); if (scenario === 'internals') p.pickActivity(harness.event({ kind: 'internal' })); if (scenario === 'fees') p.pickMemberArea(harness.event({ area: 'fees' })); if (['services', 'service-form'].includes(scenario)) p.pickMemberArea(harness.event({ area: 'manage' })); if (['albums', 'gifts'].includes(scenario)) p.openService(harness.event({ area: scenario })); if (scenario === 'service-form') { p.pickMemberArea(harness.event({ area: 'fees' })); p.toggleForm(harness.event({ form: 'fee' })); }
    const data = clone(p.data); p.onUnload(); return { data, components: {}, css: 'button{width:calc(100% - 32px)}' };
  },
  async audit({ page, scenario, metrics }) {
    const errors = [], layout = await page.evaluate(() => ({ brand: getComputedStyle(document.querySelector('.club-page')).getPropertyValue('--brand').trim(), tabs: [...document.querySelectorAll('.club-tab')].map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, height: r.height }; }), memberButtons: [...document.querySelectorAll('.member-manage')].map(el => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height, shrink: getComputedStyle(el).flexShrink }; }), filters: document.querySelector('.member-filters') ? [...document.querySelector('.member-filters').children].map(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, right: r.right }; }) : [] })); metrics.clubLayout = layout;
    if (layout.brand !== '#ff1838') errors.push('Page-local club palette missing'); if (layout.tabs.some(r => r.height < 44 || r.left < 15 || r.right > metrics.width - 15)) errors.push('Primary segment must retain 16px inset and 44px targets');
    if (layout.memberButtons.some(b => b.width > 75 || b.width < 44 || b.height < 44 || b.shrink !== '0')) errors.push('Member manage button must be compact with explicit nonshrinking width');
    if (layout.filters.length && Math.max(...layout.filters.map(r => (r.top + r.bottom) / 2)) - Math.min(...layout.filters.map(r => (r.top + r.bottom) / 2)) > 1) errors.push('Member filter count must remain on the same row');
    if (scenario === 'activities') { const status = await page.locator('.training-status').allTextContents(); if (JSON.stringify(status) !== JSON.stringify(['报名中', '报名中', '已结束', '已取消'])) errors.push('Actual activity states must remain visible for signed activities'); if (await page.locator('.training-registration').count() !== 3) errors.push('Registration is a separate auxiliary badge'); }
    if (scenario === 'ordinary' && await page.locator('.member-manage,.approval-banner').count()) errors.push('Ordinary members must not see staff controls');
    if (scenario === 'races') { if (await page.locator('.match-title').first().innerText() !== (await page.locator('.match-main').first().innerText()).split('\n')[0]) errors.push('Race title layout invalid'); const date = await page.locator('.match-date').first().evaluate(el => ({ height: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight) })); if (date.height > date.line + 2) errors.push('Race date must stay on one line'); }
    return errors;
  }
};
