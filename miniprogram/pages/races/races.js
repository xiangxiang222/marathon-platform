const { request } = require("../../utils/request");

function pageNumbers(page, pages) {
  const total = Math.max(1, Number(pages) || 1);
  const current = Math.min(Math.max(1, Number(page) || 1), total);
  const width = 10;
  let start = 1;
  let end = total;
  if (total > width) {
    start = Math.max(1, current - 4);
    end = Math.min(total, start + width - 1);
    start = Math.max(1, end - width + 1);
  }
  const list = [];
  for (let n = start; n <= end; n += 1) list.push(n);
  return list;
}

const PLACES = [
  { name: "北京", cities: ["北京"] },
  { name: "天津", cities: ["天津"] },
  { name: "河北", cities: ["石家庄", "唐山", "秦皇岛", "邯郸", "邢台", "保定"] },
  { name: "山西", cities: ["太原", "大同"] },
  { name: "内蒙古", cities: ["呼和浩特", "包头"] },
  { name: "辽宁", cities: ["沈阳", "大连"] },
  { name: "吉林", cities: ["长春"] },
  { name: "黑龙江", cities: ["哈尔滨"] },
  { name: "上海", cities: ["上海"] },
  { name: "江苏", cities: ["南京", "无锡", "苏州"] },
  { name: "浙江", cities: ["杭州", "宁波"] },
  { name: "安徽", cities: ["合肥", "黄山"] },
  { name: "福建", cities: ["福州", "厦门", "泉州"] },
  { name: "山东", cities: ["济南", "青岛"] },
  { name: "广东", cities: ["广州", "深圳", "东莞", "阳江"] },
  { name: "重庆", cities: ["重庆"] },
  { name: "四川", cities: ["成都"] },
  { name: "云南", cities: ["昆明", "玉溪"] },
  { name: "陕西", cities: ["西安"] },
  { name: "新疆", cities: ["乌鲁木齐", "图木舒克"] }
];

const KINDS = [
  { short: "路跑", kind: "road" },
  { short: "线上", kind: "online" },
  { short: "线下", kind: "offline" },
  { short: "越野", kind: "trail" },
  { short: "海外", kind: "overseas" }
];

const STATUSES = [
  { label: "即将开赛", value: "upcoming" },
  { label: "报名中", value: "open" },
  { label: "待开赛", value: "wait" },
  { label: "比赛中", value: "live" },
  { label: "比赛结束", value: "closed" },
  { label: "报名未公布", value: "unannounced" }
];

function toneOf(race) {
  const status = race.regStatus || "";
  if (status === "已结束" || status === "比赛结束") return "done";
  if (status === "比赛中") return "live";
  if (race.open && Number(race.daysLeft) <= 7) return "soon";
  if (status === "报名中") return "open";
  if (status === "报名时间未公布") return "wait";
  return "next";
}

function remindTone(reason) {
  const text = reason || "";
  if (text.includes("比赛")) return "live";
  if (text.includes("截止") || text.includes("缴费") || text.includes("出签")) return "soon";
  return "next";
}

function todayInfo() {
  const shifted = new Date(Date.now() + 8 * 3600 * 1000);
  const weeks = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return {
    todayLabel: shifted.getUTCMonth() + 1 + "月" + shifted.getUTCDate() + "日 " + weeks[shifted.getUTCDay()],
    todayDay: String(shifted.getUTCDate())
  };
}

function yearBlocks(selected) {
  const blocks = [];
  for (let year = 2025; year <= 2027; year += 1) {
    const months = [];
    for (let m = 1; m <= 12; m += 1) {
      const value = year + "-" + String(m).padStart(2, "0");
      months.push({ m, value, on: selected === value });
    }
    blocks.push({ year, months });
  }
  return blocks;
}

Page({
  data: {
    q: "",
    searching: false,
    city: "",
    month: "",
    full: false,
    half: false,
    kind: "road",
    status: "upcoming",
    draftStatus: "upcoming",
    sheet: "",
    province: "河北",
    kinds: KINDS,
    races: [],
    page: 1,
    pages: 1,
    pageNumbers: [],
    total: 0,
    reminders: [],
    loaded: false,
    message: "",
    todayLabel: "",
    todayDay: "",
    cityLabel: "比赛地点",
    monthLabel: "比赛时间",
    provinces: [],
    cities: [],
    yearBlocks: [],
    statusOptions: []
  },
  onShow() {
    const today = todayInfo();
    this.setData(today);
    this.paint();
    this.load();
  },
  onQ(e) {
    const q = e.detail.value || "";
    this.data.q = q;
    this.data.page = 1;
    this.setData({ q, searching: !!q.trim(), sheet: "", races: [], loaded: false, page: 1 });
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 200);
  },
  paint(extra) {
    const next = Object.assign({}, this.data, extra || {});
    const province = next.province;
    const cities = (PLACES.find((item) => item.name === province) || { cities: [] }).cities;
    const patch = Object.assign({}, extra || {}, {
      cityLabel: next.city || "比赛地点",
      monthLabel: next.month ? next.month.replace("-", "年") + "月" : "比赛时间",
      provinces: PLACES.map((item) => ({ name: item.name, on: item.name === province })),
      cities: cities.map((name) => ({ name, on: name === next.city })),
      yearBlocks: yearBlocks(next.month),
      statusOptions: STATUSES.map((item) => ({ label: item.label, value: item.value, on: item.value === next.draftStatus }))
    });
    Object.assign(this.data, patch);
    this.setData(patch);
  },
  setKind(e) {
    this.data.kind = e.currentTarget.dataset.kind;
    this.data.sheet = "";
    this.data.page = 1;
    this.setData({ kind: this.data.kind, sheet: "", page: 1 });
    this.load();
  },
  toggleDist(e) {
    const which = e.currentTarget.dataset.which;
    this.data[which] = !this.data[which];
    const patch = {};
    patch[which] = this.data[which];
    this.data.page = 1;
    patch.page = 1;
    this.setData(patch);
    this.load();
  },
  openSheet(e) {
    const name = e.currentTarget.dataset.sheet;
    const sheet = this.data.sheet === name ? "" : name;
    const extra = { sheet };
    if (name === "status") extra.draftStatus = this.data.status;
    if (name === "city" && this.data.city) {
      const found = PLACES.find((item) => item.cities.indexOf(this.data.city) >= 0);
      if (found) extra.province = found.name;
    }
    this.paint(extra);
  },
  closeSheet() {
    this.setData({ sheet: "" });
  },
  noop() {},
  pickProvince(e) {
    this.paint({ province: e.currentTarget.dataset.name });
  },
  pickCity(e) {
    const name = e.currentTarget.dataset.name;
    const city = this.data.city === name ? "" : name;
    this.data.page = 1;
    this.paint({ city, sheet: "", page: 1 });
    this.load();
  },
  pickMonth(e) {
    const value = e.currentTarget.dataset.value;
    const month = this.data.month === value ? "" : value;
    this.data.page = 1;
    this.paint({ month, sheet: "", page: 1 });
    this.load();
  },
  clearMonth() {
    this.data.page = 1;
    this.paint({ month: "", sheet: "", page: 1 });
    this.load();
  },
  pickStatus(e) {
    this.paint({ draftStatus: e.currentTarget.dataset.value });
  },
  resetStatus() {
    this.paint({ draftStatus: "upcoming" });
  },
  confirmStatus() {
    this.data.status = this.data.draftStatus;
    this.data.sheet = "";
    this.data.page = 1;
    this.setData({ status: this.data.status, sheet: "", page: 1 });
    this.load();
  },
  prevPage() {
    if (this.data.page <= 1) return;
    this.data.page -= 1;
    this.setData({ page: this.data.page });
    this.load();
  },
  nextPage() {
    if (this.data.page >= this.data.pages) return;
    this.data.page += 1;
    this.setData({ page: this.data.page });
    this.load();
  },
  goPage(e) {
    const next = Number(e.currentTarget.dataset.page);
    if (!next || next === this.data.page) return;
    this.data.page = next;
    this.setData({ page: next });
    this.load();
  },
  load() {
    const q = (this.data.q || "").trim();
    const seq = (this.loadSeq = (this.loadSeq || 0) + 1);
    const params = [];
    if (q) {
      params.push("q=" + encodeURIComponent(q), "status=all");
    } else {
      params.push("status=" + (this.data.status || "upcoming"), "kind=" + (this.data.kind || "road"));
      if (this.data.city) params.push("city=" + encodeURIComponent(this.data.city));
      if (this.data.month) params.push("month=" + encodeURIComponent(this.data.month));
      if (this.data.full && !this.data.half) params.push("distance=full");
      if (this.data.half && !this.data.full) params.push("distance=half");
    }
    params.push("page=" + (this.data.page || 1));
    request("/reminders")
      .then((data) => {
        const reminders = (data.reminders || []).slice(0, 3).map((item) => ({
          ...item,
          key: item.race.id + item.hit.key,
          tone: remindTone(item.hit.reason)
        }));
        this.setData({ reminders });
      })
      .catch(() => {});
    request("/races?" + params.join("&"))
      .then((data) => {
        if (seq !== this.loadSeq) return;
        const races = (data.races || []).map((race) => {
          const parts = String(race.raceDate || "").split("-");
          const labels = race.distanceLabels || [];
          const kinds = [...(race.kindLabels || [])];
          if (race.kind === "trail" && !kinds.includes("越野")) kinds.unshift("越野");
          const project = labels.length && kinds.length ? labels.join(" / ") + " · " + kinds.join(" / ") : labels.length ? labels.join(" / ") : kinds.join(" / ");
          return {
            ...race,
            tone: toneOf(race),
            monthText: (Number(parts[1]) || "") + "月",
            day: Number(parts[2]) || "",
            distanceText: project ? " · " + project : "",
            showWhen: race.deadlineLabel && race.deadlineLabel !== race.regStatus,
            soon: race.open && Number(race.daysLeft) <= 7
          };
        });
        this.setData({
          races,
          loaded: true,
          message: "",
          searching: !!q,
          page: data.page || 1,
          pages: data.pages || 1,
          pageNumbers: pageNumbers(data.page || 1, data.pages || 1),
          total: data.total || 0
        });
      })
      .catch((err) => this.setData({ loaded: true, message: err.message }));
  }
});
