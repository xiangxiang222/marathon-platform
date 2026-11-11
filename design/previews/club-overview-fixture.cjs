// Synthetic, fixed-clock records for club overview semantics and navigation.
// No transport, credentials, production imports or writes.
const now = Date.parse('2026-10-30T00:00:00Z'); // 08:00 Beijing, 20:00 New York previous day.
const makeAvatar = (initial, background, ink) => 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="' + background + '"/><text x="24" y="25" dominant-baseline="middle" text-anchor="middle" font-family="Arial,sans-serif" font-size="23" font-weight="600" fill="' + ink + '">' + initial + '</text></svg>').toString('base64');
const avatar = makeAvatar('A', '#eaf4ff', '#387cbd');
const members = [
  { id: 1, nickname: '晨光团长', owner: true, role: 'owner', roleLabel: '团长', points: 12, avatar },
  { id: 2, nickname: '河畔领跑员', role: 'manager', roleLabel: '跑团管理', points: 9, avatar: '' },
  { id: 3, nickname: '周末慢跑者', role: 'member', roleLabel: '成员', points: 8, avatar: makeAvatar('C', '#e9f7f2', '#258062') },
  { id: 4, nickname: '稳定向前', role: 'member', roleLabel: '成员', points: 7, avatar: '' },
  { id: 5, nickname: '清晨一起跑', role: 'member', roleLabel: '成员', points: 6, avatar: makeAvatar('E', '#fff0e7', '#b96a2c') },
  { id: 6, nickname: '长昵称也按自己的节奏奔跑的朋友', role: 'member', roleLabel: '成员', points: 5, avatar: '' }
];
const longName = '杭州西湖城市马拉松与周末长距离训练一起向前跑俱乐部';
const activity = (id, title, startsAt, status, endsAt = '', signed = true) => ({
  id, title, startsAt, endsAt, status, mine: { signed }, date: startsAt.slice(0, 10), dateLabel: startsAt.slice(0, 10), clockLabel: startsAt.slice(11),
  signupCount: 3, capacity: 20, place: '公园南门', plannedKm: 10, trainingType: 'easy', trainingTypeLabel: '轻松跑',
  statusLabel: ({ live: '进行中', ended: '已结束', cancelled: '已取消' })[status] || '报名中', action: { enabled: status === 'open', label: status === 'live' ? '查看活动' : '报名活动' }
});
// Boundary roles stay in IDs rather than user-visible training names:
// 101 future signed; 102 valid live; 103 years-old live; 104 cancelled;
// 105 ended; 106 invalid calendar; 107 today's live without end;
// 108 malformed end; 109 future unsigned; 110 end already passed;
// 111 yesterday's live without end; 112 past open despite a future end.
const activities = [
  activity(101, '周末长距离 · 沿河一起跑', '2026-10-31 07:00', 'open'),
  activity(102, '晨间节奏跑 · 找到自己的节奏', '2026-10-30 07:00', 'live', '2026-10-30 09:00'),
  activity(103, '秋日城市漫跑', '2024-10-30 07:00', 'live'),
  activity(104, '公园周末轻松跑', '2026-11-01 07:00', 'cancelled'),
  activity(105, '城市十公里测试跑', '2026-11-01 07:00', 'ended'),
  activity(106, '月末进阶训练', '2026-02-30 07:00', 'live'),
  activity(107, '周三轻松跑 · 一起稳稳向前', '2026-10-30 06:00', 'live'),
  activity(108, '周末山野训练', '2026-11-02 07:00', 'open', 'bad-date'),
  activity(109, '周末恢复跑', '2026-11-01 07:00', 'open', '', false),
  activity(110, '晨光热身跑', '2026-10-30 06:00', 'live', '2026-10-30 07:00'),
  activity(111, '沿河日落慢跑', '2026-10-29 07:00', 'live'),
  activity(112, '清晨有氧训练', '2026-10-30 07:00', 'open', '2026-10-30 10:00')
];
const scenarios = {
  mixed: activities,
  live: activities.filter(row => [102, 103, 110].includes(row.id)),
  future: activities.filter(row => [101, 104, 105, 108, 109].includes(row.id)),
  expired: activities.filter(row => [103, 104, 105, 106, 108, 110, 111, 112].includes(row.id)),
  empty: []
};
module.exports = { now, avatar, members, longName, activity, activities, scenarios };
