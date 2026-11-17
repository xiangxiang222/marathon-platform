'use strict';
// Source-based values for isolated UI checks; no production data is written.
const { race: base } = require('./participation-mini-regression.cjs');
module.exports = {
  ...base, id: 'local-dianjiang-fixture', name: '2026重庆垫江明月山越野赛', raceDate: '2026-11-21',
  registrationStatus: 'closed', registrationLabel: '报名已截止', signupQrAvailable: true,
  signupQrUrl: '/marathon/api/races/zuiku-79019/signup-qr', signupHost: 'reg.zuicool.com', signupChannel: '最酷',
  details: { groups: [
    { name: '50公里雾隐牡丹组', nominalDistanceKm: 50, actualDistanceKm: 49.93, ascentM: 2984, descentM: 2984, quota: 300, startAt: '2026-11-21 08:00', cutoffAt: '2026-11-21 21:00', cutoffHours: 13, itraPoints: 3, fees: [{ label: '普通价', amount: 398, unit: '人' }, { label: '早鸟价', amount: 358, endsAt: '2026-09-21', unit: '人' }] },
    { name: '25公里盐泉皓月组', nominalDistanceKm: 25, actualDistanceKm: 24.8, ascentM: 1550, cutoffAt: '2026-11-21 16:00', cutoffHours: 8, status: 'sold_out', fees: [{ label: '普通价', amount: 198, unit: '人' }] },
    { name: '10公里梯田筑梦组（个人组）', nominalDistanceKm: 10, actualDistanceKm: 13.5, ascentM: 816, cutoffAt: '2026-11-21 13:00', cutoffHours: 5, fees: [{ label: '普通价', amount: 98, unit: '人' }] },
    { name: '10公里梯田筑梦组（亲子组1大1小）', format: '亲子', participants: '1大1小', nominalDistanceKm: 10, actualDistanceKm: 13.5, ascentM: 816, cutoffAt: '2026-11-21 13:00', cutoffHours: 5, fees: [{ label: '亲子套餐', amount: 196, unit: '组' }] }
  ], sections: [{ title: '参赛资格', text: '50公里：近三年30公里越野或全马完赛证明。' }, { title: '日程领物', text: '| 日期 | 时间 | 安排 |\n| --- | --- | --- |\n| 11月20日 | 09:00—22:00 | 报到与强装检查 |\n\n![50公里路线](/marathon/api/race-sheets/71)' }] },
  guideText: ''
};
