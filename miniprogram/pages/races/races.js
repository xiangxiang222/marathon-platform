const { request, ready } = require("../../utils/request");
function accountToken() { return typeof getApp === "function" ? (getApp().globalData || {}).token || "" : ""; }
const landmarks = {
  beijing: '/images/race-landmarks/beijing.png',
  shanghai: '/images/race-landmarks/shanghai.png',
  xiamen: '/images/race-landmarks/xiamen.png'
};

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

const PLACES = require("../../utils/regions");

const KINDS = [
  { short: "全部赛事", kind: "" },
  { short: "路跑", kind: "road" },
  { short: "越野赛", kind: "trail" }
];
const MEETS = [
  { short: "全部形式", meet: "" },
  { short: "线上赛", meet: "online" },
  { short: "线下赛", meet: "offline" }
];

const STATUSES = [
  { label: "全部状态", value: "all" },
  { label: "即将开赛", value: "upcoming" },
  { label: "报名中", value: "open" },
  { label: "待开赛", value: "wait" },
  { label: "比赛中", value: "live" },
  { label: "比赛结束", value: "closed" },
  { label: "报名未公布", value: "unannounced" }
];

function navigationMetrics() {
  let info = {};
  try {
    info = typeof wx.getWindowInfo === "function" ? wx.getWindowInfo() : wx.getSystemInfoSync();
  } catch (err) {
    try {
      info = wx.getSystemInfoSync();
    } catch (fallbackError) {}
  }
  const windowHeight = Number(info.windowHeight) || 700;
  const statusBarHeight = Number(info.statusBarHeight) || 20;
  const windowWidth = Number(info.windowWidth) || 375;
  let capsule = null;
  try {
    capsule = wx.getMenuButtonBoundingClientRect();
  } catch (err) {}
  if (!capsule || !capsule.width || !capsule.height || capsule.top < statusBarHeight) {
    return { statusBarHeight, windowHeight, navHeight: 44, headerRight: 108 };
  }
  return {
    statusBarHeight, windowHeight,
    navHeight: Math.max(44, capsule.height + (capsule.top - statusBarHeight) * 2),
    headerRight: capsule.width + Math.max(0, windowWidth - capsule.right) + 12
  };
}

function todayInfo() {
  const shifted = new Date(Date.now() + 8 * 3600 * 1000);
  const weeks = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return { todayLabel: shifted.getUTCMonth() + 1 + "月" + shifted.getUTCDate() + "日 " + weeks[shifted.getUTCDay()] };
}

function yearBlocks(selected, dates = []) {
  const now = new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear();
  const years = [...new Set([now - 1, now, now + 1, now + 2, ...(selected ? [Number(selected.slice(0, 4))] : []), ...dates.map(value => Number(value.slice(0, 4)))])].filter(year => year > 1900).sort((a, b) => a - b);
  return years.map(year => ({ year, months: Array.from({ length: 12 }, (_, i) => {
    const m = i + 1, value = year + "-" + String(m).padStart(2, "0");
    return { m, value, on: selected === value };
  }) }));
}

Page({
  data: {
    q: "",
    searching: false,
    city: "",
    month: "",
    full: false,
    half: false,
    ten: false,
    kind: "",
    meet: "",
    status: "upcoming",
    filterTags: [],
    statusLabel: "即将开赛",
    sheet: "",
    province: "",
    selectedYear: new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear(),
    years: [],
    months: [],
    availableCities: [],
    availableMonths: [],
    distances: [{ value: "", label: "不限距离" }, { value: "full", label: "马拉松" }, { value: "half", label: "半程马拉松" }, { value: "10k", label: "10公里" }],
    distance: "",
    advancedCount: 0,
    pageFloor: 0,
    panelHeight: 300,
    windowHeight: 700,
    kinds: KINDS,
    meets: MEETS,
    races: [],
    catalogRaces: [],
    catalogLoading: false,
    catalogLoaded: false,
    catalogError: "",
    page: 1,
    pages: 1,
    pageNumbers: [],
    total: 0,
    reminders: [],
    loaded: false,
    message: "",
    followBusyId: "",
    statusBarHeight: 20,
    navHeight: 44,
    headerRight: 108,
    todayLabel: "",
    cityLabel: "比赛地点",
    monthLabel: "比赛时间",
    provinces: [],
    cities: [],
    yearBlocks: [],
    statusOptions: []
  },
  onLoad() {
    this.setData(navigationMetrics());
  },
  onPageScroll(e) { this._scrollTop = Math.max(0, Number(e.scrollTop) || 0); },
  onShow() {
    this._visible = true;
    this._viewVersion = (this._viewVersion || 0) + 1;
    const token = accountToken();
    if (this._seenToken !== token) {
      this._seenToken = token;
      this.setData({ races: this.data.races.map(race => ({ ...race, following: false, myStatus: "" })) });
    }
    this.setData({ followBusyId: "" });
    const today = todayInfo();
    this.setData(today);
    this.paint();
    this.load();
    this.loadCatalog();
  },
  onHide() { this._visible = false; this.loadSeq = (this.loadSeq || 0) + 1; this._viewVersion = (this._viewVersion || 0) + 1; },
  onUnload() { this.onHide(); },
  toggleFollow(e) {
    const id = String(e.currentTarget.dataset.id), race = this.data.races.find(item => String(item.id) === id);
    if (!race || this.data.followBusyId) return;
    if (!ready()) {
      wx.setStorageSync("marathon_return_after_login", "/pages/race/race?id=" + encodeURIComponent(id) + "&follow=1");
      wx.switchTab({ url: "/pages/mine/mine" });
      return;
    }
    const token = accountToken(), version = this._viewVersion;
    this.setData({ followBusyId: id, message: "" });
    return request("/me/races/" + encodeURIComponent(id) + "/follow", "PUT", { following: !race.following }).then(() => {
      if (token === accountToken() && version === this._viewVersion && this._visible !== false) this.setData({ races: this.data.races.map(item => String(item.id) === id ? { ...item, following: !race.following } : item) });
    }).catch(err => { if (token === accountToken() && version === this._viewVersion) this.setData({ message: err.message }); })
      .finally(() => { if (token === accountToken() && version === this._viewVersion) this.setData({ followBusyId: "" }); });
  },
  loadCatalog() {
    if (this.data.catalogLoading) return;
    this.setData({ catalogLoading: true, catalogError: "" });
    return request("/race-catalog")
      .then((data) => {
        const catalogRaces = (Array.isArray(data.races) ? data.races : []).slice(0, 3).map((race) => {
          const wa = race.worldAthletics || {}, caa = race.caa || {};
          const sameYear = wa.label && caa.label && wa.year && String(wa.year) === String(caa.year);
          return {
            ...race,
            landmarkSrc: landmarks[race.id] || "",
            waLabel: wa.label || "待核实",
            caaLabel: caa.label || "待核实",
            certificationYear: sameYear ? String(wa.year) : "",
            waYear: sameYear ? "" : String(wa.year || ""),
            caaYear: sameYear ? "" : String(caa.year || ""),
            archiveCount: Array.isArray(race.years) ? race.years.length : 0
          };
        });
        this.setData({ catalogRaces, catalogLoaded: true, catalogLoading: false });
      })
      .catch(() => {
        this.setData({ catalogLoaded: true, catalogLoading: false, catalogError: "赛事档案暂时无法加载" });
      });
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
    const province = next.province, blocks = yearBlocks(next.month, next.availableMonths);
    const cityNames = province ? (PLACES.find(item => item.name === province) || { cities: [] }).cities : next.availableCities.length ? next.availableCities : PLACES.flatMap(item => item.cities);
    const distance = next.full ? "full" : next.half ? "half" : next.ten ? "10k" : "";
    const tags = [
      { key: "kind", category: "类型", label: (KINDS.find(item => item.kind === next.kind && item.kind) || {}).short },
      { key: "city", category: "地点", label: next.city }, { key: "month", category: "时间", label: next.month && Number(next.month.slice(0, 4)) + "年" + Number(next.month.slice(5)) + "月" },
      { key: "distance", category: "距离", label: (next.distances.find(item => item.value === distance && item.value) || {}).label },
      { key: "meet", category: "形式", label: (MEETS.find(item => item.meet === next.meet && item.meet) || {}).short },
      { key: "status", category: "状态", label: next.status !== "upcoming" && (STATUSES.find(item => item.value === next.status) || {}).label }
    ].filter(item => item.label);
    const cities = [{ name: "", label: "全国不限" }, ...(province ? [{ name: province, label: province + (["北京", "天津", "上海", "重庆"].includes(province) ? "全市" : "全省") }] : []), ...cityNames.filter(name => name !== province).map(name => ({ name, label: name }))];
    const patch = Object.assign({}, extra || {}, {
      cityLabel: next.city || "比赛地点", monthLabel: next.month ? Number(next.month.slice(0, 4)) + "年" + Number(next.month.slice(5)) + "月" : "比赛时间",
      statusLabel: (STATUSES.find(item => item.value === next.status) || {}).label || "即将开赛",
      panelHeight: next.sheet === "time" ? 300 : Math.min(360, Math.max(224, Math.ceil(cities.length / 2) * 52 + 28)),
      distance, filterTags: tags, advancedCount: Number(!!next.meet) + Number(!!distance) + Number(next.status !== "upcoming"),
      provinces: [{ name: "", label: "全国", on: !province }, ...PLACES.map(item => ({ name: item.name, label: item.name, on: item.name === province }))],
      cities: cities.map(item => ({ ...item, on: item.name === next.city })), yearBlocks: blocks,
      years: blocks.map(item => ({ year: item.year, on: item.year === next.selectedYear })),
      months: (blocks.find(item => item.year === next.selectedYear) || blocks[0]).months,
      statusOptions: STATUSES.map(item => ({ ...item, on: item.value === next.status }))
    });
    Object.assign(this.data, patch);
    this.setData(patch);
  },
  applyFilter(patch) {
    const top = this._filterScrollTop == null ? this._scrollTop || 0 : this._filterScrollTop;
    this._filterScrollTop = null;
    this._keepScroll = top;
    this.paint({ ...patch, sheet: "", page: 1, pageFloor: top + this.data.windowHeight });
    return this.load();
  },
  setKind(e) { return this.applyFilter({ kind: e.currentTarget.dataset.kind }); },
  setMeet(e) { return this.applyFilter({ meet: e.currentTarget.dataset.meet || "" }); },
  setDistance(e) {
    const value = e.currentTarget.dataset.value;
    return this.applyFilter({ full: value === "full", half: value === "half", ten: value === "10k" });
  },
  toggleDist(e) {
    const which = e.currentTarget.dataset.which;
    if (!["full", "half"].includes(which)) return;
    return this.setDistance({ currentTarget: { dataset: { value: this.data[which] ? "" : which } } });
  },
  openSheet(e) {
    const name = e.currentTarget.dataset.sheet, sheet = this.data.sheet === name ? "" : name;
    this._filterScrollTop = sheet ? this._scrollTop || 0 : null;
    const extra = { sheet };
    if (name === "city") extra.province = (PLACES.find(item => item.name === this.data.city || item.cities.includes(this.data.city)) || {}).name || "";
    if (name === "time" && this.data.month) extra.selectedYear = Number(this.data.month.slice(0, 4));
    this.paint(extra);
  },
  closeSheet() { this._filterScrollTop = null; this.setData({ sheet: "" }); },
  noop() {},
  pickProvince(e) { this.paint({ province: e.currentTarget.dataset.name || "" }); },
  pickYear(e) { this.paint({ selectedYear: Number(e.currentTarget.dataset.year) }); },
  pickCity(e) { return this.applyFilter({ city: e.currentTarget.dataset.name || "" }); },
  pickMonth(e) { return this.applyFilter({ month: e.currentTarget.dataset.value || "" }); },
  clearMonth() { return this.applyFilter({ month: "" }); },
  pickStatus(e) { return this.applyFilter({ status: e.currentTarget.dataset.value }); },
  clearFilter(e) {
    const key = e.currentTarget.dataset.key;
    if (key === "distance") return this.applyFilter({ full: false, half: false, ten: false });
    if (["kind", "city", "month", "meet", "status"].includes(key)) return this.applyFilter({ [key]: key === "status" ? "upcoming" : "" });
  },
  clearFilters() { return this.applyFilter({ kind: "", city: "", month: "", full: false, half: false, ten: false, meet: "", status: "upcoming" }); },
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
    const token = accountToken();
    const keepScroll = this._keepScroll; this._keepScroll = null;
    const q = (this.data.q || "").trim();
    const seq = (this.loadSeq = (this.loadSeq || 0) + 1);
    const params = [];
    if (q) {
      params.push("q=" + encodeURIComponent(q), "status=all");
    } else {
      params.push("status=" + (this.data.status || "upcoming"));
      if (this.data.kind) params.push("kind=" + encodeURIComponent(this.data.kind));
      if (this.data.meet) params.push("meet=" + encodeURIComponent(this.data.meet));
      if (this.data.city) params.push("city=" + encodeURIComponent(this.data.city));
      if (this.data.month) params.push("month=" + encodeURIComponent(this.data.month));
      if (this.data.distance) params.push("distance=" + this.data.distance);
    }
    params.push("page=" + (this.data.page || 1));
    request("/reminders")
      .then((data) => {
        const reminders = (data.reminders || []).slice(0, 3).map((item) => ({
          ...item,
          key: item.race.id + item.hit.key
        }));
        this.setData({ reminders });
      })
      .catch(() => {});
    return request("/races?" + params.join("&"))
      .then((data) => {
        if (seq !== this.loadSeq || token !== accountToken()) return;
        const races = (data.races || []).map((race) => {
          const parts = String(race.raceDate || "").split("-");
          const labels = race.distanceLabels || [];
          const kinds = [...(race.kindLabels || [])];
          if (race.kind === "trail" && !kinds.includes("越野")) kinds.unshift("越野");
          const project = labels.length && kinds.length ? labels.join(" / ") + " · " + kinds.join(" / ") : labels.length ? labels.join(" / ") : kinds.join(" / ");
          return {
            ...race,
            displayStatus: race.regStatus || "报名未公布",
            statusMuted: !["报名中", "未开始", "比赛中"].includes(race.regStatus),
            monthText: parts[1] ? Number(parts[1]) + "月" : "待定",
            day: Number(parts[2]) || "",
            yearText: parts[0] || "",
            distanceText: project ? " · " + project : "",
            showWhen: race.deadlineLabel && race.deadlineLabel !== race.regStatus,
            soon: race.open && Number(race.daysLeft) <= 7
          };
        });
        this.paint({ availableCities: Array.isArray(data.cities) ? data.cities : [], availableMonths: Array.isArray(data.months) ? data.months : [] });
        this.setData({
          races,
          loaded: true,
          message: "",
          searching: !!q,
          page: data.page || 1,
          pages: data.pages || 1,
          pageNumbers: pageNumbers(data.page || 1, data.pages || 1),
          total: data.total || 0
        }, () => {
          if (keepScroll != null && seq === this.loadSeq && token === accountToken() && this._visible !== false) wx.pageScrollTo({ scrollTop: keepScroll, duration: 0 });
        });
      })
      .catch((err) => {
        if (seq !== this.loadSeq || token !== accountToken()) return;
        this.setData({ loaded: true, message: err.message });
      });
  }
});
