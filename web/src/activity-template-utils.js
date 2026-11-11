// Templates contain reusable training content and relative timing only.
// All activity dates are Beijing wall times; never use the browser timezone.
export const trainingPresets = [
  { id: 'easy', mark: 'E', label: '轻松跑', hint: '轻松有氧', titleHint: '例：周三轻松跑', config: {
    trainingType: 'easy', title: '一起轻松跑',
    workout: '热身：慢跑与动态活动。\n主训练：按各组约定配速，轻松完成本次跑量。\n放松：慢跑与拉伸。',
    notice: '按当天状态选择分组，自备饮水。',
    groups: [{ name: '轻松跑组', kind: 'pace', pace: '轻松交流的强度', capacity: 0 }]
  } },
  { id: 'interval', mark: 'I', label: '间歇跑', hint: '速度与节奏', titleHint: '例：周三间歇跑', config: {
    trainingType: 'interval', title: '跑团间歇训练',
    workout: '热身：慢跑、动态活动与加速跑。\n主训练：填写本次间歇距离、组数及组间恢复。\n放松：慢跑与拉伸。',
    notice: '请根据训练计划与自身状态调整强度。',
    groups: [{ name: '间歇训练组', kind: 'pace', pace: '按本组训练目标', capacity: 0 }]
  } },
  { id: 'long', mark: 'L', label: '长距离', hint: '耐力积累', titleHint: '例：周末长距离', config: {
    trainingType: 'long', title: '周末长距离',
    workout: '热身：轻松慢跑。\n主训练：按分组完成计划里程，途中安排补水。\n放松：慢跑与拉伸。',
    notice: '提前确认路线与补给，自备饮水。',
    groups: [{ name: '长距离组', kind: 'pace', pace: '按本组约定配速', capacity: 0 }]
  } }
];

const textFields = ['trainingType', 'title', 'place', 'gatherPlace', 'gatherAt', 'route', 'workout', 'notice', 'note'];
const numberFields = ['minPeople', 'minKm', 'points'];
const relativeFields = ['durationMinutes', 'signupLeadMinutes', 'cancelLeadMinutes'];
export function blankTiming() {
  return { startTime: '', durationMinutes: null, signupLeadMinutes: null, cancelLeadMinutes: null };
}

function instant(value) {
  if (!value) return NaN;
  const local = String(value).replace(' ', 'T').slice(0, 16);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return NaN;
  const parsed = Date.parse(local + ':00+08:00');
  return Number.isFinite(parsed) && beijingLocal(parsed) === local ? parsed : NaN;
}
function beijingLocal(value) {
  return new Date(value + 8 * 3600000).toISOString().slice(0, 16);
}
function minuteDifference(later, earlier, max) {
  const result = Math.round((instant(later) - instant(earlier)) / 60000);
  return Number.isInteger(result) && result >= 0 && result <= max ? result : null;
}

export function extractTiming(form) {
  return {
    startTime: /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/.test(form.startsAt || '') ? form.startsAt.slice(11, 16) : '',
    durationMinutes: minuteDifference(form.endsAt, form.startsAt, 10080),
    signupLeadMinutes: minuteDifference(form.startsAt, form.signupUntil, 43200),
    cancelLeadMinutes: minuteDifference(form.startsAt, form.cancelUntil, 43200)
  };
}

export function templateConfig(form, timing = extractTiming(form)) {
  const config = {};
  for (const key of textFields) config[key] = String(form[key] || '').trim();
  config.plannedKm = form.plannedKm === '' || form.plannedKm == null ? null : Number(form.plannedKm);
  for (const key of numberFields) config[key] = Number(form[key]);
  config.review = !!form.review;
  config.groups = (form.groups || []).map(group => ({
    name: String(group.name || '').trim(), kind: group.kind || 'pace', pace: String(group.pace || '').trim(), capacity: Number(group.capacity) || 0
  }));
  config.startTime = timing.startTime || '';
  for (const key of relativeFields) config[key] = timing[key] === '' || timing[key] == null ? null : Number(timing[key]);
  return config;
}

export function formFromTemplate(config, base) {
  const form = { ...base };
  for (const key of textFields) form[key] = String(config[key] || '');
  form.trainingType ||= 'custom';
  form.plannedKm = config.plannedKm == null || config.plannedKm === '' ? '' : String(config.plannedKm);
  for (const key of numberFields) if (config[key] != null) form[key] = Number(config[key]);
  form.review = !!config.review;
  form.groups = (config.groups || []).map(group => ({ name: group.name || '', kind: group.kind || 'pace', pace: group.pace || '', capacity: Number(group.capacity) || 0 }));
  form.issue = '';
  form.startsAt = ''; form.endsAt = ''; form.signupUntil = ''; form.cancelUntil = '';
  return form;
}

export function timingFromTemplate(config) {
  const timing = blankTiming();
  timing.startTime = config.startTime || '';
  for (const key of relativeFields) timing[key] = config[key] == null ? null : Number(config[key]);
  return timing;
}

export function applyRelativeTiming(form, timing) {
  const start = instant(form.startsAt);
  if (!Number.isFinite(start)) return;
  for (const [field, key, sign] of [['endsAt', 'durationMinutes', 1], ['signupUntil', 'signupLeadMinutes', -1], ['cancelUntil', 'cancelLeadMinutes', -1]]) {
    form[field] = timing[key] == null || timing[key] === '' ? '' : beijingLocal(start + sign * Number(timing[key]) * 60000);
  }
}
