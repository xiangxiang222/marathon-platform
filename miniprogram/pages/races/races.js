const { request, ready } = require("../../utils/request");
function accountToken() { return typeof getApp === "function" ? (getApp().globalData || {}).token || "" : ""; }
const { landmarkSrc } = require('../../utils/race-landmarks');

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
  { label: "报名未录入", value: "unannounced" }
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
  const statusBarHeight = Number(info.statusBarHeight) || 20;
  const windowWidth = Number(info.windowWidth) || 375;
  let capsule = null;
  try {
    capsule = wx.getMenuButtonBoundingClientRect();
  } catch (err) {}
  if (!capsule || !capsule.width || !capsule.height || capsule.top < statusBarHeight) {
    return { statusBarHeight, navHeight: 44, headerRight: 108 };
  }
  return {
    statusBarHeight,
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
    mode: "filters",
    q: "",
    hasKeyword: false,
    searching: false,
    resultStatusLabel: "即将开赛",
    resultSummary: "",
    city: "",
    month: "",
    kind: "",
    meet: "",
    status: "upcoming",
    filterTags: [],
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
    resultsHeight: 0,
    panelHeight: 300,
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
    reminderIndex: 0,
    loaded: false,
    message: "",
    followError: "",
    followBusyId: "",
    statusBarHeight: 20,
    navHeight: 44,
    headerRight: 108,
    todayLabel: "",
    cityLabel: "全国不限",
    monthLabel: "不限时间",
    provinces: [],
    cities: [],
    yearBlocks: [],
    statusOptions: []
  },
  onLoad() {
    this.setData(navigationMetrics());
  },
  onShow() {
    this._visible = true;
    this._viewVersion = (this._viewVersion || 0) + 1;
    const token = accountToken();
    if (this._seenToken !== token) {
      this._seenToken = token;
      this.setData({ reminders: [], reminderIndex: 0, races: this.data.races.map(race => ({ ...race, following: false, myStatus: "" })) });
    }
    this.setData({ followBusyId: "", followError: "" });
    const today = todayInfo();
    this.setData(today);
    this.paint();
    this.load();
    this.loadReminders();
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
    this.setData({ followBusyId: id, followError: "" });
    return request("/me/races/" + encodeURIComponent(id) + "/follow", "PUT", { following: !race.following }).then(() => {
      if (token === accountToken() && version === this._viewVersion && this._visible !== false) {
        this.setData({ races: this.data.races.map(item => String(item.id) === id ? { ...item, following: !race.following } : item) });
        this.loadReminders();
      }
    }).catch(err => { if (token === accountToken() && version === this._viewVersion) this.setData({ followError: err.message }); })
      .finally(() => { if (token === accountToken() && version === this._viewVersion) this.setData({ followBusyId: "" }); });
  },
  loadReminders() {
    const token = accountToken(), version = this._viewVersion;
    const seq = this._reminderSeq = (this._reminderSeq || 0) + 1;
    return request("/reminders").then((data) => {
      if (seq !== this._reminderSeq || token !== accountToken() || version !== this._viewVersion) return;
      const seen = new Set();
      const reminders = [...(data.mine || []), ...(data.reminders || [])].filter(item => {
        const key = item.race.id + ":" + item.hit.key;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 3);
      this.setData({ reminders, reminderIndex: 0 });
    }).catch(() => {});
  },
  nextReminder() {
    const { reminders, reminderIndex } = this.data;
    if (reminders.length > 1) this.setData({ reminderIndex: (reminderIndex + 1) % reminders.length });
  },
  loadCatalog() {
    if (this.data.catalogLoading) return;
    this.setData({ catalogLoading: true, catalogError: "" });
    return request("/race-catalog")
      .then((data) => {
        const featured = data.featuredIds || ['beijing', 'shanghai', 'xiamen'];
        const available = Array.isArray(data.races) ? data.races : [];
        const catalogRaces = featured.map(id => available.find(race => race.id === id)).filter(Boolean).slice(0, 3).map((race) => {
          const wa = race.worldAthletics || {}, caa = race.caa || {};
          const sameYear = wa.label && caa.label && wa.year && String(wa.year) === String(caa.year);
          return {
            ...race,
            landmarkSrc: landmarkSrc(race.id),
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
    this.setData({ q, hasKeyword: !!q.trim() });
  },
  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode, sheet: "" });
  },
  submitFind() {
    const { mode, q, status, kind, meet, city, month, distance, filterTags } = this.data;
    const searching = mode === "keyword";
    const keyword = q.trim();
    const params = [];
    if (searching) {
      if (!keyword) return;
      params.push("q=" + encodeURIComponent(keyword), "status=all");
    } else {
      params.push("status=" + status);
      if (kind) params.push("kind=" + encodeURIComponent(kind));
      if (meet) params.push("meet=" + encodeURIComponent(meet));
      if (city) params.push("city=" + encodeURIComponent(city));
      if (month) params.push("month=" + encodeURIComponent(month));
      if (distance) params.push("distance=" + distance);
    }
    this._raceQuery = params.join("&");
    const resultSummary = searching ? keyword : filterTags.filter(item => item.key !== "status").map(item => item.label).join(" · ");
    this.setData({ searching, resultSummary, resultStatusLabel: STATUSES.find(item => item.value === status).label, sheet: "", races: [], pages: 1, total: 0, followError: "" });
    return this.load(1, true);
  },
  retryFind() {
    return this.load();
  },
  paint(extra) {
    const next = Object.assign({}, this.data, extra || {});
    const province = next.province, blocks = yearBlocks(next.month, next.availableMonths);
    const cityNames = province ? (PLACES.find(item => item.name === province) || { cities: [] }).cities : next.availableCities.length ? next.availableCities : PLACES.flatMap(item => item.cities);
    const { distance } = next;
    const monthLabel = next.month && Number(next.month.slice(0, 4)) + "年" + Number(next.month.slice(5)) + "月";
    const tags = [
      { key: "kind", category: "类型", label: (KINDS.find(item => item.kind === next.kind && item.kind) || {}).short },
      { key: "city", category: "地点", label: next.city }, { key: "month", category: "时间", label: monthLabel },
      { key: "distance", category: "距离", label: (next.distances.find(item => item.value === distance && item.value) || {}).label },
      { key: "meet", category: "形式", label: (MEETS.find(item => item.meet === next.meet && item.meet) || {}).short },
      { key: "status", category: "状态", label: next.status !== "upcoming" && (STATUSES.find(item => item.value === next.status) || {}).label }
    ].filter(item => item.label);
    const cities = [{ name: "", label: "全国不限" }, ...(province ? [{ name: province, label: province + (["北京", "天津", "上海", "重庆"].includes(province) ? "全市" : "全省") }] : []), ...cityNames.filter(name => name !== province).map(name => ({ name, label: name }))];
    const patch = Object.assign({}, extra || {}, {
      cityLabel: next.city || "全国不限", monthLabel: monthLabel || "不限时间",
      panelHeight: next.sheet === "time" ? 300 : Math.min(360, Math.max(224, Math.ceil(cities.length / 2) * 52 + 28)),
      filterTags: tags, advancedCount: Number(!!next.meet) + Number(!!distance) + Number(next.status !== "upcoming"),
      provinces: [{ name: "", label: "全国", on: !province }, ...PLACES.map(item => ({ name: item.name, label: item.name, on: item.name === province }))],
      cities: cities.map(item => ({ ...item, on: item.name === next.city })), yearBlocks: blocks,
      years: blocks.map(item => ({ year: item.year, on: item.year === next.selectedYear })),
      months: (blocks.find(item => item.year === next.selectedYear) || blocks[0]).months,
      statusOptions: STATUSES.map(item => ({ ...item, on: item.value === next.status }))
    });
    this.setData(patch);
  },
  editFilter(patch) {
    this.paint({ ...patch, sheet: "" });
  },
  setKind(e) { this.editFilter({ kind: e.currentTarget.dataset.kind }); },
  setMeet(e) { this.editFilter({ meet: e.currentTarget.dataset.meet || "" }); },
  setDistance(e) { this.editFilter({ distance: e.currentTarget.dataset.value }); },
  openSheet(e) {
    const name = e.currentTarget.dataset.sheet, sheet = this.data.sheet === name ? "" : name;
    const extra = { sheet };
    if (name === "city") extra.province = (PLACES.find(item => item.name === this.data.city || item.cities.includes(this.data.city)) || {}).name || "";
    if (name === "time" && this.data.month) extra.selectedYear = Number(this.data.month.slice(0, 4));
    this.paint(extra);
  },
  closeSheet() { this.setData({ sheet: "" }); },
  noop() {},
  pickProvince(e) { this.paint({ province: e.currentTarget.dataset.name || "" }); },
  pickYear(e) { this.paint({ selectedYear: Number(e.currentTarget.dataset.year) }); },
  pickCity(e) { this.editFilter({ city: e.currentTarget.dataset.name || "" }); },
  pickMonth(e) { this.editFilter({ month: e.currentTarget.dataset.value || "" }); },
  clearMonth() { this.editFilter({ month: "" }); },
  pickStatus(e) { this.editFilter({ status: e.currentTarget.dataset.value }); },
  clearFilter(e) {
    const key = e.currentTarget.dataset.key;
    this.editFilter({ [key]: key === "status" ? "upcoming" : "" });
  },
  clearFilters() { this.editFilter({ kind: "", city: "", month: "", distance: "", meet: "", status: "upcoming" }); },
  prevPage() {
    if (this.data.page <= 1) return;
    return this.load(this.data.page - 1, true);
  },
  nextPage() {
    if (this.data.page >= this.data.pages) return;
    return this.load(this.data.page + 1, true);
  },
  goPage(e) {
    const next = Number(e.currentTarget.dataset.page);
    if (!next || next === this.data.page) return;
    return this.load(next, true);
  },
  load(page = this._racePage || 1, scroll = false) {
    const token = accountToken();
    const seq = (this.loadSeq = (this.loadSeq || 0) + 1);
    this._racePage = page;
    const resultsHeight = scroll ? this.data.statusBarHeight + this.data.navHeight : this.data.resultsHeight;
    this.setData({ page, loaded: false, message: "", resultsHeight }, () => {
      if (scroll && seq === this.loadSeq && this._visible !== false) wx.pageScrollTo({ selector: "#race-results", duration: 200, offsetTop: -resultsHeight });
    });
    return request("/races?" + (this._raceQuery || "status=upcoming") + "&page=" + page)
      .then((data) => {
        if (seq !== this.loadSeq || token !== accountToken()) return;
        this._racePage = data.page || 1;
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
          page: data.page || 1,
          pages: data.pages || 1,
          pageNumbers: pageNumbers(data.page || 1, data.pages || 1),
          total: data.total || 0
        });
      })
      .catch((err) => {
        if (seq !== this.loadSeq || token !== accountToken()) return;
        this.setData({ loaded: true, message: err.message });
      });
  }
});
