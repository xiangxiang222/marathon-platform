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
function timelineDate(value) {
  const text = localMoment(value, false);
  const date = /^\d{4}-\d{2}-\d{2}(?: (?:[01]\d|2[0-3]):[0-5]\d)?$/.test(text) && text.slice(0, 10);
  const day = date && Date.parse(date);
  return date && Number.isFinite(day) && new Date(day).toISOString().slice(0, 10) === date ? text : "";
}
function raceTimeline(race, now = Date.now()) {
  if (!race) return { rows: [], next: null };
  const source = race.nodes || [];
  const rows = (race.nextNode && !source.some(node => node.key === race.nextNode.key) ? [...source, race.nextNode] : source)
    .map(node => ({ ...node, at: timelineDate(node.at) })).filter(node => node.at);
  const registration = race.details?.registration;
  const deadline = registration?.verified === true && timelineDate(registration.closesAt);
  const day = new Date(Number(now) + 8 * 3600000).toISOString().slice(0, 10);
  if (deadline) {
    const index = rows.findIndex(node => node.key === "deadline");
    const original = rows[index];
    const special = original && /早鸟|精英|优惠/.test(original.label);
    if (special) original.key = "special-deadline";
    else if (original) rows.splice(index, 1);
    const at = registration.closesAt.includes("T") ? Date.parse(registration.closesAt) : Date.parse(deadline.includes(" ") ? deadline.replace(" ", "T") + ":00+08:00" : deadline + "T23:59:59.999+08:00");
    let past = at <= Number(now);
    if (["closed", "sold_out"].includes(race.registrationStatus)) past = true;
    else if (!special && original?.at === deadline && typeof original.past === "boolean") past = original.past;
    else if (race.registrationStatus === "open" || race.regStatus === "报名中") past = false;
    rows.push({ key: "deadline", label: "报名截止", at: deadline, past, today: deadline.startsWith(day) });
  }
  rows.sort((a, b) => a.at.localeCompare(b.at));
  const inactive = ["cancelled", "invalid"].includes(race.registrationStatus) || /取消|入口.*失效/.test(race.registrationLabel || race.regStatus || "");
  const end = race.raceEndDate || race.raceDate;
  return { rows, next: inactive || end && end < day ? null : rows.find(node => node.past === false && node.at >= day) || null };
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
const guideTopics = [
  ["pickup", "领物与比赛日", /领物|领包|领取参赛|参赛包领取/],
  ["route", "赛道与路线", /赛道|路线|线路/],
  ["pacers", "配速资料", /配速|领跑员|官兔/]
];
const textKey = value => String(value || "").replace(/\*\*|\s|[，。；：、,.!！?？:;（）()\-—]/g, "");
function guideRecorded(value) {
  const text = textKey(value);
  return !!text && !/^(?:领物(?:安排|信息)?|赛道与路线|赛道(?:信息|路线)?|路线(?:图|信息)?|配速(?:安排|资料|信息)?)?(?:待公布|暂未公布|尚未公布|另行通知|待定|尚未录入)$/.test(text);
}
function guideLayout(race, blocks) {
  const parts = [{ id: "rules", text: "", media: false }];
  for (const block of blocks) {
    const text = (block.runs || []).map(run => run.text).join("");
    if (/^h[12]$/.test(block.kind)) parts.push({ id: "chapter-" + block.i, label: text, text: "", media: false });
    else {
      const part = parts[parts.length - 1];
      part.text += textKey(text);
      if (block.kind === "image" || block.kind === "table") part.media = true;
    }
  }
  const chapters = parts.slice(1).map(({ id, label }) => ({ id, label }));
  const prose = parts.map(part => textKey(part.label) + part.text).join("");
  const targets = {};
  const layout = { chapters, targets };
  for (const [kind,, title] of guideTopics) {
    const value = race?.[kind];
    const key = guideRecorded(value) ? textKey(value) : "";
    const duplicate = key && parts.find(part => (textKey(part.label) + part.text).includes(key));
    const labeled = parts.find(part => title.test(part.label || "") && (guideRecorded(part.text) || part.media));
    const inProse = key && prose.includes(key);
    const sheets = kind === "route" ? race?.routeSheets : kind === "pacers" ? race?.pacerSheets : [];
    const inline = sheets?.length && blocks.find(block => block.kind === "image" && sheets.some(sheet => block.src.split("?")[0].endsWith("/race-sheets/" + sheet.id)));
    targets[kind] = duplicate?.id || labeled?.id || (inProse ? "rules" : inline ? "media-" + inline.i : "");
    layout[kind] = key && !inProse ? value : "";
  }
  return layout;
}
function guideNavigation(layout, { route, pacers, originals, hasBody } = {}) {
  const tasks = guideTopics.flatMap(([id, label]) => {
    const target = layout[id] || (id === "route" ? route : id === "pacers" && pacers) ? id : layout.targets[id];
    return target ? [{ kind: id, id: target, label }] : [];
  });
  const chapters = layout.chapters.length ? layout.chapters.slice() : hasBody ? [{ id: "rules", label: "参赛指南" }] : [];
  if (originals) chapters.push({ id: "originals", label: "规程原图参考" });
  return { tasks, chapters: chapters.filter(chapter => !tasks.some(task => task.id === chapter.id)) };
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

export { groupCards, guideSource, sheetCaption, guideLayout, guideNavigation, localMoment, raceTimeline, registrationLabel, qrAvailable, qrHint };
