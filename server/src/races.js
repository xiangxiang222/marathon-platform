const RACES = [
  {
    id: "caa-10k",
    name: "2026中国田径协会10公里精英赛",
    city: "无锡",
    province: "江苏",
    distances: "10k",
    raceDate: "2026-10-31",
    deadline: "2026-10-10T18:00:00+08:00",
    place: "无锡"
  },
  {
    id: "chaoyang",
    name: "2026朝阳区滨河半程马拉松",
    city: "北京",
    province: "北京",
    distances: "half",
    raceDate: "2026-11-01",
    deadline: "2026-10-08T18:00:00+08:00",
    place: "朝阳滨河"
  },
  {
    id: "tmsk",
    name: "2026图木舒克马拉松",
    city: "图木舒克",
    province: "新疆",
    distances: "full",
    raceDate: "2026-11-01",
    deadline: "2026-10-20T18:00:00+08:00",
    place: "图木舒克"
  },
  {
    id: "bishan",
    name: "2026重庆璧山马拉松",
    city: "重庆",
    province: "重庆",
    distances: "full,half",
    raceDate: "2026-11-15",
    deadline: "2026-10-28T18:00:00+08:00",
    place: "璧山"
  },
  {
    id: "songshanhu",
    name: "2026东阳光药·东莞（松山湖）马拉松",
    city: "东莞",
    province: "广东",
    distances: "full,half",
    raceDate: "2026-11-22",
    deadline: "2026-10-28T18:00:00+08:00",
    place: "松山湖"
  },
  {
    id: "yuxi",
    name: "2026玉溪抚仙湖半程马拉松",
    city: "玉溪",
    province: "云南",
    distances: "half",
    raceDate: "2026-11-22",
    deadline: "2026-10-28T18:00:00+08:00",
    place: "抚仙湖"
  },
  {
    id: "jinjiang",
    name: "2026泉州晋江马拉松",
    city: "泉州",
    province: "福建",
    distances: "full,half",
    raceDate: "2026-12-06",
    deadline: "2026-11-03T18:00:00+08:00",
    place: "晋江"
  },
  {
    id: "hailing",
    name: "2026阳江海陵岛马拉松",
    city: "阳江",
    province: "广东",
    distances: "full,half",
    raceDate: "2026-12-20",
    deadline: "2026-11-20T18:00:00+08:00",
    place: "海陵岛"
  },
  {
    id: "huangyaguan",
    name: "2027天津黄崖关长城马拉松",
    city: "天津",
    province: "天津",
    distances: "full,half",
    raceDate: "2027-05-15",
    deadline: "2026-12-01T23:59:00+08:00",
    deadlineName: "早鸟截止",
    regStart: "2026-09-07",
    place: "黄崖关",
    source: "最酷，2026-09-07",
    updatedAt: "2026-10-08"
  },
  {
    id: "closed-sample",
    name: "2025收官马拉松",
    city: "杭州",
    province: "浙江",
    distances: "full",
    raceDate: "2025-11-02",
    deadline: "2025-10-01T18:00:00+08:00",
    place: "杭州"
  }
];

const DISTANCE_LABEL = { full: "马拉松", half: "半程马拉松", "10k": "10公里组" };
const TZ = 8 * 3600 * 1000;

function dayIndex(ms) {
  return Math.floor((ms + TZ) / 86400000);
}

function instant(value) {
  if (!value) return NaN;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(text + "T23:59:59+08:00").getTime();
  return new Date(text).getTime();
}

function formatWhen(value) {
  const ms = instant(value);
  if (Number.isNaN(ms)) return "";
  const shifted = new Date(ms + TZ);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  if (String(value).includes("T")) {
    const hh = String(shifted.getUTCHours()).padStart(2, "0");
    const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  }
  return `${y}-${m}-${day}`;
}

function deadlineMeta(deadline, now = new Date()) {
  const end = instant(deadline);
  const open = end > now.getTime();
  const days = dayIndex(end) - dayIndex(now.getTime());
  let deadlineLabel = "已截止";
  if (open && days <= 0) deadlineLabel = "今日截止";
  else if (open && days === 1) deadlineLabel = "明天截止";
  else if (open) deadlineLabel = `${days}天后截止`;
  return { open, daysLeft: open ? Math.max(days, 0) : 0, deadlineLabel };
}

function reminderText(name, at, now) {
  const meta = deadlineMeta(at, now);
  if (!meta.open) return name + "已过";
  if (name === "报名截止" || name === "早鸟截止") return meta.deadlineLabel;
  if (meta.daysLeft <= 0) return "今日" + name;
  if (meta.daysLeft === 1) {
    if (name === "出签") return "明天出签";
    if (name === "缴费截止") return "缴费明天截止";
    return "明天" + name;
  }
  if (name === "出签") return `${meta.daysLeft}天后出签`;
  if (name === "缴费截止") return `缴费${meta.daysLeft}天后截止`;
  return `${meta.daysLeft}天后${name}`;
}

function field(row, camel, snake) {
  const value = row[snake] != null && row[snake] !== "" ? row[snake] : row[camel];
  return value || "";
}

function buildNodes(row, now) {
  const specs = [
    ["regStart", "报名开始", field(row, "regStart", "reg_start")],
    ["deadline", field(row, "deadlineName", "deadline_name") || "报名截止", row.deadline],
    ["draw", "出签", field(row, "drawAt", "draw_at")],
    ["pay", "缴费截止", field(row, "payDeadline", "pay_deadline")],
    ["race", "比赛日", row.race_date || row.raceDate]
  ];
  return specs
    .filter((item) => item[2])
    .map(([key, label, at]) => {
      const meta = deadlineMeta(at, now);
      return {
        key,
        label,
        at: formatWhen(at),
        past: !meta.open,
        daysLeft: meta.daysLeft,
        soon: meta.open && meta.daysLeft <= 3 && key !== "race",
        text: key === "race" ? "" : reminderText(label, at, now)
      };
    });
}

const ENTERED = ["已报名", "待抽签", "中签", "未中签", "已缴费", "已领物", "完赛", "未完赛", "弃赛"];
const GOING = ["已报名", "待抽签", "中签", "已缴费", "已领物"];

function squadOf(marks) {
  const list = marks || [];
  const going = list.filter((mark) => GOING.includes(mark.status));
  const interested = list.filter((mark) => mark.status === "想跑");
  let text = "";
  if (going.length >= 2) text = going.length + " 人可以一起去";
  else if (going.length === 1) text = "还差一个人就能凑一队";
  else if (interested.length) text = interested.length + " 人想跑，还没人报名";
  return { going, interested, size: going.length, ready: going.length >= 2, text };
}

function summarizeMarks(counts) {
  const entered = ENTERED.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const unpaid = counts["中签"] || 0;
  const want = counts["想跑"] || 0;
  const parts = [];
  if (entered) parts.push(`${entered} 人已报名`);
  if (unpaid) parts.push(`${unpaid} 人还没缴`);
  if (!entered && want) parts.push(`${want} 人想跑`);
  if (!parts.length) return "还没有人标这场";
  return parts.join("，");
}

function cardTitle(race) {
  const head = race.nextNode && race.nextNode.text ? race.nextNode.text : race.deadlineLabel;
  return `${head} · ${race.name}`;
}

function reminderHits(race) {
  const hits = [];
  for (const node of race.nodes || []) {
    if (node.past) continue;
    let reason = "";
    if (node.key === "draw" && node.daysLeft === 0) reason = node.text || "今天出签";
    else if (node.key === "race" && node.daysLeft === 1) reason = "明天比赛";
    else if (node.key !== "race" && node.daysLeft === 1) reason = node.text || "明天" + node.label;
    if (!reason) continue;
    hits.push({ key: node.key, label: node.label, text: node.text, reason, daysLeft: node.daysLeft });
  }
  return hits;
}

function raceDay(race) {
  return Date.parse(String(race.raceDate) + "T12:00:00+08:00");
}

function fullConflicts(plans, gapDays) {
  const skip = new Set(["未中签", "未完赛", "弃赛"]);
  const fulls = (plans || []).filter((plan) => (plan.race.distances || []).includes("full") && !skip.has(plan.status));
  const found = [];
  for (let i = 0; i < fulls.length; i++) {
    for (let j = i + 1; j < fulls.length; j++) {
      const pair = [fulls[i], fulls[j]].sort((a, b) => String(a.race.raceDate).localeCompare(String(b.race.raceDate)));
      const days = Math.round(Math.abs(raceDay(pair[1].race) - raceDay(pair[0].race)) / 86400000);
      if (days >= gapDays) continue;
      const races = pair.map((plan) => ({ id: plan.race.id, name: plan.race.name, raceDate: plan.race.raceDate }));
      found.push({
        days,
        gapDays,
        races,
        text: `${races[0].name} 和 ${races[1].name} 隔了 ${days} 天，全马间隔少于 ${gapDays} 天`
      });
    }
  }
  return found;
}

function shareText(card) {
  const names = (card.unpaid || [])
    .map((item) => (typeof item === "string" ? item : item.nickname))
    .filter(Boolean);
  const lines = [card.title, card.summary];
  if (names.length) lines.push("还没缴：" + names.join("、"));
  if (card.squad && card.squad.ready) {
    const who = card.squad.going.map((mark) => mark.nickname).filter(Boolean);
    if (who.length) lines.push("可以一起去：" + who.join("、"));
  }
  if (card.club && card.club.code) lines.push("跑团口令 " + card.club.code);
  lines.push("打开赛历小程序，标一下你这场的状态。");
  return lines.join("\n");
}

function presentRace(row, now) {
  const meta = deadlineMeta(row.deadline, now);
  const distances = String(row.distances).split(",").filter(Boolean);
  const nodes = buildNodes(row, now);
  const nextNode = nodes.find((node) => node.key !== "race" && !node.past) || null;
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    province: row.province,
    place: row.place,
    distances,
    distanceLabels: distances.map((d) => DISTANCE_LABEL[d] || d),
    raceDate: row.race_date || row.raceDate,
    deadline: row.deadline,
    deadlineName: field(row, "deadlineName", "deadline_name") || "报名截止",
    regStart: field(row, "regStart", "reg_start"),
    drawAt: field(row, "drawAt", "draw_at"),
    payDeadline: field(row, "payDeadline", "pay_deadline"),
    source: field(row, "source", "source"),
    updatedAt: field(row, "updatedAt", "updated_at"),
    nodes,
    nextNode,
    regStatus: phaseLabel(row.race_date || row.raceDate, meta.open, now),
    kind: KIND[row.id] || "road",
    ...meta
  };
}

const KIND = { huangyaguan: "trail" };

function phaseLabel(raceDate, open, now) {
  const today = new Date(now.getTime() + TZ).toISOString().slice(0, 10);
  if (raceDate < today) return "已结束";
  if (raceDate === today) return "比赛中";
  if (!open) return "待开赛";
  return "报名中";
}

module.exports = {
  RACES,
  DISTANCE_LABEL,
  deadlineMeta,
  presentRace,
  summarizeMarks,
  squadOf,
  cardTitle,
  shareText,
  reminderHits,
  fullConflicts
};
