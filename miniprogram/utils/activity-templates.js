const FIELDS = ["trainingType", "title", "plannedKm", "place", "gatherPlace", "gatherAt", "route", "workout", "notice", "note", "minPeople", "minKm", "points", "review"];
const GROUP = { name: "全员组", kind: "pace", pace: "", capacity: 0 };
const PRESETS = [
  { id: "easy", name: "轻松跑", mark: "E", tag: "轻松有氧", config: { trainingType: "easy", title: "一起轻松跑", workout: "热身：慢跑与动态活动。\n主训练：按各组约定配速，轻松完成本次跑量。\n放松：慢跑与拉伸。", notice: "按当天状态选择分组，自备饮水。", groups: [{ ...GROUP, name: "轻松跑组", pace: "轻松交流的强度" }] } },
  { id: "interval", name: "间歇跑", mark: "I", tag: "速度与节奏", config: { trainingType: "interval", title: "跑团间歇训练", workout: "热身：慢跑、动态活动与加速跑。\n主训练：填写本次间歇距离、组数及组间恢复。\n放松：慢跑与拉伸。", notice: "请根据训练计划与自身状态调整强度。", groups: [{ ...GROUP, name: "间歇训练组", pace: "按本组训练目标" }] } },
  { id: "long", name: "长距离", mark: "L", tag: "耐力积累", config: { trainingType: "long", title: "周末长距离", workout: "热身：轻松慢跑。\n主训练：按分组完成计划里程，途中安排补水。\n放松：慢跑与拉伸。", notice: "提前确认路线与补给，自备饮水。", groups: [{ ...GROUP, name: "长距离组", pace: "按本组约定配速" }] } }
];
function minutes(value) {
  const text = String(value || "").replace(" ", "T");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return null;
  const time = Date.parse(text + ":00+08:00");
  return Number.isFinite(time) && new Date(time + 8 * 3600000).toISOString().slice(0, 16) === text ? time / 60000 : null;
}
function shifted(start, amount) { return new Date((start + amount) * 60000 + 8 * 3600000).toISOString().slice(0, 16); }
function timingValue(value) { return value === "" || value == null ? null : Number(value); }
function applyTiming(draft, timing) {
  const result = { ...draft };
  const start = minutes(draft.startDate && draft.startTime ? draft.startDate + "T" + draft.startTime : "");
  if (start == null) return result;
  for (const [field, value, direction] of [["end", timing.durationMinutes, 1], ["signup", timing.signupLeadMinutes, -1], ["cancel", timing.cancelLeadMinutes, -1]]) {
    const amount = timingValue(value);
    if (amount == null || !Number.isInteger(amount) || amount < 0 || amount > (field === "end" ? 10080 : 43200)) continue;
    const stamp = shifted(start, direction * amount);
    result[field + "Date"] = stamp.slice(0, 10);
    result[field + "Time"] = stamp.slice(11);
  }
  return result;
}
function fromConfig(config, blank, keepDate) {
  const draft = { ...blank };
  for (const field of FIELDS) if (config[field] != null) draft[field] = field === "review" ? !!config[field] : String(config[field]);
  draft.issue = "";
  draft.startDate = keepDate || "";
  draft.startTime = config.startTime || "";
  const timing = { durationMinutes: config.durationMinutes == null ? "" : String(config.durationMinutes), signupLeadMinutes: config.signupLeadMinutes == null ? "" : String(config.signupLeadMinutes), cancelLeadMinutes: config.cancelLeadMinutes == null ? "" : String(config.cancelLeadMinutes) };
  return { draft: applyTiming(draft, timing), timing, groups: JSON.parse(JSON.stringify(config.groups && config.groups.length ? config.groups : [GROUP])) };
}
function toConfig(draft, groups, timing, templateMode) {
  const config = {};
  for (const field of FIELDS) config[field] = field === "review" ? !!draft[field] : String(draft[field] == null ? "" : draft[field]).trim();
  for (const field of ["minPeople", "minKm", "points"]) config[field] = Number(config[field]);
  config.plannedKm = config.plannedKm === "" ? null : Number(config.plannedKm);
  config.groups = groups.filter(g => g.enabled !== false).map(g => ({ name: g.name.trim(), kind: g.kind, pace: g.pace.trim(), capacity: Number(g.capacity) }));
  config.startTime = draft.startTime || "";
  const start = minutes(draft.startDate && draft.startTime ? draft.startDate + "T" + draft.startTime : "");
  for (const [field, key, direction] of [["end", "durationMinutes", 1], ["signup", "signupLeadMinutes", -1], ["cancel", "cancelLeadMinutes", -1]]) {
    const time = minutes(draft[field + "Date"] && draft[field + "Time"] ? draft[field + "Date"] + "T" + draft[field + "Time"] : "");
    config[key] = !templateMode && start != null && time != null ? direction * (time - start) : timingValue(timing[key]);
  }
  return config;
}
module.exports = { PRESETS, GROUP, fromConfig, toConfig, applyTiming };
