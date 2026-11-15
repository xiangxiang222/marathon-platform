export const planStages = [
  { id: 'interest', label: '有意向', hint: '先记下想跑的比赛；只关注也可以。', statuses: ['想跑'] },
  { id: 'registration', label: '已报名', hint: '按实际情况记录；无需抽签的比赛可直接选择“确认参赛”。', statuses: ['已报名', '待抽签', '中签', '未中签'] },
  { id: 'confirmed', label: '确认参赛', hint: '获得参赛资格后，继续记录缴费和领物进度。', statuses: ['确认参赛', '已缴费', '已领物'] },
  { id: 'finished', label: '已完赛', hint: '记录这次比赛的结果，也可以继续填写完赛成绩。', statuses: ['完赛', '未完赛', '弃赛'] }
];
export const stageFor = status => planStages.find(stage => stage.statuses.includes(status))?.id || 'interest';
