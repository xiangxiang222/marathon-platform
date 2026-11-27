function valueOf(group, keys) {
  for (const key of keys) {
    const value = group[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}
function readable(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(readable).filter(Boolean).join("；");
  if (typeof value === "object") {
    if (value.adults != null || value.children != null) return (value.adults != null ? value.adults + "大" : "") + (value.children != null ? value.children + "小" : "");
    return value.text || value.label || "";
  }
  return String(value);
}
function localMoment(value, withZone = true) {
  const text = readable(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text) && Number.isFinite(Date.parse(text))) return new Date(Date.parse(text) + 8 * 3600000).toISOString().slice(0, 16).replace("T", " ") + (withZone ? "（北京时间）" : "");
  return text;
}
function quantity(value, unit) {
  const text = readable(value);
  return text && /^\d+(?:\.\d+)?$/.test(text) ? text + unit : text;
}
function feeText(fee) {
  if (typeof fee !== "object" || fee == null) return readable(fee);
  const amount = valueOf(fee, ["amount", "price"]);
  const price = amount !== "" ? quantity(amount, fee.currency && fee.currency !== "CNY" ? " " + fee.currency : "元") + (fee.unit ? "/" + fee.unit : "") : "";
  const starts = fee.startsAt || fee.startAt, ends = fee.endsAt || fee.endAt;
  const dates = starts && ends ? localMoment(starts) + " — " + localMoment(ends) : starts ? "自 " + localMoment(starts) : ends ? "截至 " + localMoment(ends) : "";
  return [fee.label || fee.name, price, dates, fee.text].filter(Boolean).join(" · ");
}
function groupCards(race) {
  return ((race && race.details && race.details.groups) || []).map((group, index) => {
    const cutoff = readable(valueOf(group, ["cutoffAt", "cutoffTime"]));
    const duration = quantity(valueOf(group, ["cutoffHours", "cutoffDuration"]), "小时");
    const cutoffIsDuration = /^(?:\d+(?:\.\d+)?\s*(?:小时|分钟|秒|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\s*)+$/i.test(cutoff.trim());
    const durationKey = value => value.replace(/\s/g, "").replace(/(?:hours?|hrs?|h)/gi, "小时");
    const cutoffFields = cutoffIsDuration
      ? [["关门时长", duration || cutoff], ...(duration && durationKey(duration) !== durationKey(cutoff) ? [["关门时长（原时间字段）", cutoff]] : [])]
      : [["关门时间", localMoment(cutoff)], ["关门时长", duration]];
    const fields = [
      ["形式", ({ individual: "个人", family: "亲子", parent_child: "亲子", team: "团队" })[valueOf(group, ["format", "form", "type"])] || readable(valueOf(group, ["format", "form", "type"]))],
      ["亲子人数", readable(valueOf(group, ["participants", "familySize", "familyComposition"]))],
      ["名额", quantity(valueOf(group, ["quota", "capacity"]), group.quotaUnit || "人")],
      ["标称距离", quantity(valueOf(group, ["nominalDistanceKm", "advertisedDistanceKm", "nominalDistance", "distanceLabel"]), "公里")],
      ["实际里程", quantity(valueOf(group, ["actualDistanceKm", "actualDistance", "distanceKm"]), "公里")],
      ["累计爬升", quantity(valueOf(group, ["ascentM", "elevationGainM", "ascent"]), "米")],
      ["累计下降", quantity(valueOf(group, ["descentM", "elevationLossM", "descent"]), "米")],
      ["出发时间", localMoment(valueOf(group, ["startAt", "startsAt", "startTime"]))],
      ...cutoffFields,
      ["ITRA积分", quantity(valueOf(group, ["itraPoints", "itra"]), "分")],
      ["参赛条件", readable(valueOf(group, ["eligibility", "requirements"]))]
    ].filter(field => field[1] !== "").map(([label, value], i) => ({ i, label, value, wide: label === "参赛条件" || value.length > 50 }));
    const rawStatus = readable(group.registrationStatus || group.status);
    const status = ({ open: "报名中", closed: "报名已截止", sold_out: "已报满", not_open: "报名未开始", cancelled: "已取消" })[rawStatus] || (rawStatus === "unknown" ? "" : rawStatus);
    return { i: index, name: group.name || group.label || "", fields, status, fees: (Array.isArray(group.fees) ? group.fees : group.fees ? [group.fees] : group.fee ? [group.fee] : []).map(feeText).filter(Boolean).map((text, i) => ({ i, text })) };
  });
}
function guideSource(race) {
  if (race && String(race.guideText || "").trim()) return race.guideText;
  const sections = race && race.details && race.details.sections;
  const parts = Array.isArray(sections) ? sections.filter(section => section && section.text).map(section => (section.title ? "## " + section.title + "\n" : "") + section.text) : [];
  return parts.length ? parts.join("\n\n") : race && race.guideText || "";
}
function sheetCaption(race, sheet, fallback) {
  const media = race && race.details && race.details.media;
  const saved = Array.isArray(media) && media.find(item => String(item.sheetId) === String(sheet.id));
  return String(sheet.caption || saved && saved.caption || fallback || "赛事资料").trim();
}
function guideLayout(race, blocks) {
  const textKey = value => String(value || "").replace(/\*\*|\s|[，。；：、,.!！?？:;（）()\-—]/g, "");
  const prose = textKey(blocks.filter(block => block.kind !== "image").map(block => (block.runs || []).map(run => run.text).join("")).join("\n"));
  const extra = value => !textKey(value) || prose.includes(textKey(value)) ? "" : value;
  const chapters = blocks.filter(block => /^h[12]$/.test(block.kind)).map(block => ({ id: "chapter-" + block.i, label: block.runs.map(run => run.text).join("") }));
  return {
    chapters,
    route: extra(race && race.route),
    pickup: extra(race && race.pickup),
    pacers: extra(race && race.pacers)
  };
}
function registrationLabel(race) {
  const state = race && race.registrationStatus;
  return race && race.registrationLabel || ({ closed: "报名已截止", sold_out: "已报满", open: "报名中", not_open: "报名未开始", cancelled: "赛事已取消", invalid: "报名入口已失效" })[state] || "";
}
function qrAvailable(race) {
  if (!race || ["cancelled", "invalid"].includes(race.registrationStatus) || /取消|入口.*失效/.test(race.registrationLabel || race.regStatus || "")) return false;
  if (typeof race.signupQrAvailable === "boolean") return race.signupQrAvailable;
  return !!(race.signupHost && (race.links || []).some(link => link.key === "signup" && /^https:\/\/\S+$/i.test(link.url || "")));
}
function qrHint(race) {
  const channel = race && (race.signupChannel || race.signupHost);
  const closed = race && ["closed", "sold_out"].includes(race.registrationStatus);
  return (channel ? channel + " · " : "") + (closed ? "报名已关闭，二维码可查看本届报名信息。" : "点击预览，长按或扫码打开本届报名页。");
}

export { groupCards, guideSource, sheetCaption, guideLayout, localMoment, registrationLabel, qrAvailable, qrHint };
