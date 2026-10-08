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
    place: "黄崖关"
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

const DISTANCE_LABEL = { full: "马拉松", half: "半程马拉松", "10k": "10公里" };
const TZ = 8 * 3600 * 1000;

function dayIndex(ms) {
  return Math.floor((ms + TZ) / 86400000);
}

function deadlineMeta(deadline, now = new Date()) {
  const end = new Date(deadline).getTime();
  const open = end > now.getTime();
  const days = dayIndex(end) - dayIndex(now.getTime());
  let deadlineLabel = "已截止";
  if (open && days <= 0) deadlineLabel = "今日截止";
  else if (open && days === 1) deadlineLabel = "明天截止";
  else if (open) deadlineLabel = `${days}天后截止`;
  return { open, daysLeft: open ? Math.max(days, 0) : 0, deadlineLabel };
}

function presentRace(row, now) {
  const meta = deadlineMeta(row.deadline, now);
  const distances = String(row.distances).split(",").filter(Boolean);
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
    regStatus: meta.open ? "报名中" : "已截止",
    ...meta
  };
}

module.exports = { RACES, DISTANCE_LABEL, deadlineMeta, presentRace };
