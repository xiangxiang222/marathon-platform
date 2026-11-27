<template>
  <main class="home-page">
    <section class="home-top">
      <div class="home-brand">
        <h1 class="home-page-title">赛事</h1>
        <router-link class="home-calendar-link" to="/calendar"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16"/></svg><span>{{ todayLabel }}</span><span aria-hidden="true">›</span></router-link>
        <section class="race-finder" aria-labelledby="race-finder-title">
          <h2 id="race-finder-title">找比赛</h2>
          <div class="finder-modes" role="group" aria-label="找比赛方式">
            <button type="button" :aria-pressed="mode === 'conditions'" @click="mode = 'conditions'">按条件找赛</button>
            <button type="button" :aria-pressed="mode === 'keyword'" @click="mode = 'keyword'">搜赛事</button>
          </div>
          <form v-if="mode === 'conditions'" class="finder-form" @submit.prevent="submitConditions">
            <div class="finder-fields">
              <button type="button" :class="{ on: city }" :title="city || '比赛地点'"
                aria-label="比赛地点" :aria-expanded="sheet === 'city'" @click="openSheet('city')">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 8c0 4-6 9-6 9S4 12 4 8a6 6 0 1 1 12 0Z"/><circle cx="10" cy="8" r="2"/></svg>
                <span>{{ city || '比赛地点' }}</span><i></i>
              </button>
              <button type="button" :class="{ on: month }" :title="monthLabel || '比赛时间'"
                aria-label="比赛时间" :aria-expanded="sheet === 'time'" @click="openSheet('time')">
                <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="13" rx="3"/><path d="M6 2v4m8-4v4M3 9h14"/></svg>
                <span>{{ monthLabel || '比赛时间' }}</span><i></i>
              </button>
              <button type="button" class="filter-more" :class="{ on: advancedCount }"
                aria-label="更多筛选" :aria-expanded="sheet === 'status'" @click="openSheet('status')">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M5 10h10M8 15h4"/></svg>
                <span>更多筛选</span><b v-if="advancedCount">{{ advancedCount }}</b><i v-else></i>
              </button>
            </div>
            <nav class="race-meet-categories" aria-label="赛事类型">
              <button v-for="item in trackKinds" :key="item.kind" type="button"
                :aria-pressed="trackKind === item.kind" @click="trackKind = item.kind">{{ item.short }}</button>
            </nav>
            <div v-if="activeFilters.length" class="active-filters" aria-label="已选筛选条件">
              <button v-for="item in activeFilters" :key="item.key" type="button" class="filter-tag"
                :aria-label="'取消' + item.category + '：' + item.label" @click="removeFilter(item.key)">
                <span>{{ item.label }}</span>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m5 5 6 6m0-6-6 6"/></svg>
              </button>
              <button type="button" class="clear-filters" @click="resetFilters">清空筛选</button>
            </div>
            <button type="submit" class="finder-submit">查找比赛</button>
          </form>
          <form v-else class="finder-form home-search" role="search" @submit.prevent="submitSearch">
            <label class="finder-keyword">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 4.5 4.5" /></svg>
              <input v-model="q" aria-label="搜索赛事名称或城市" aria-describedby="finder-search-hint"
                placeholder="搜索赛事名称 / 城市" enterkeyhint="search" />
            </label>
            <p id="finder-search-hint" class="finder-search-hint">可搜索往届赛事</p>
            <button type="submit" class="finder-submit" :disabled="!q.trim()">搜索</button>
          </form>
        </section>
      </div>
      <nav v-if="!searching" class="home-shortcuts" aria-label="常用功能">
        <router-link v-for="item in quickLinks" :key="item.to" :to="item.to">
          <img :src="item.icon" alt="" />
          <span>{{ item.label }}</span>
        </router-link>
      </nav>
    </section>
    <div v-if="!searching && currentReminder" class="deadline-banner">
      <router-link class="deadline-copy" :to="'/races/' + currentReminder.race.id">
        <span class="deadline-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2M8 2h8" /></svg></span>
        <span class="deadline-text" aria-live="polite" aria-atomic="true"><span>{{ currentReminder.hit.reason }}</span><strong>{{ currentReminder.race.name }}</strong></span>
      </router-link>
      <button v-if="reminders.length > 1" type="button" class="deadline-next" aria-label="查看下一条提醒" @click="nextReminder">
        <small>{{ reminderIndex + 1 }}/{{ reminders.length }}</small><span aria-hidden="true">›</span>
      </button>
    </div>
    <section class="home-results" aria-labelledby="race-results-title">
      <div class="results-heading">
        <div><h2 id="race-results-title" ref="resultsHeading" tabindex="-1">{{ searching ? '搜索结果' : '全部赛事' }}</h2><span v-if="!loading && !loadError" class="results-total"><template v-if="!searching">{{ statusLabel }} · </template>{{ total }} 场</span></div>
        <router-link v-if="!searching" class="results-archive" to="/race-catalog">赛事档案 <span aria-hidden="true">›</span></router-link>
      </div>
      <p v-if="resultSummary" class="results-summary">{{ resultSummary }}</p>
      <div v-if="loadError" class="load-error" role="alert"><span>{{ loadError }}</span><button type="button" @click="load()">重试</button></div>
      <p v-else-if="loading" class="results-loading" role="status">正在更新赛事…</p>
      <dialog v-if="sheet" ref="sheetDialog" class="drop home-filter-sheet" aria-labelledby="home-filter-title" @cancel.prevent="sheet = ''" @click="closeBackdrop">
        <div class="sheet-grip" aria-hidden="true"></div>
        <div class="filter-sheet-heading"><div><h3 id="home-filter-title">{{ sheet === 'city' ? '想去哪里跑' : sheet === 'time' ? '选个比赛时间' : '找到心仪赛事' }}</h3><p>选好条件后，点击「查找比赛」</p></div><button type="button" autofocus aria-label="关闭筛选" @click="sheet = ''"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></div>
        <div v-if="sheet === 'city'" class="loc">
          <nav class="prov" aria-label="省份导航">
            <button type="button" :class="{ on: !province }" :aria-pressed="!province" @click="province = ''">全国</button>
            <button v-for="item in places" :key="item.name" type="button" :class="{ on: province === item.name }" :aria-pressed="province === item.name" @click="province = item.name">
              {{ item.name }}
            </button>
          </nav>
          <div class="city-content"><div class="selection-caption"><h4>{{ province || '全国' }}</h4><span>选择目的地</span></div><div class="cities">
            <button type="button" :class="{ on: !city }" :aria-pressed="!city" @click="pickCity('')">全国不限</button>
            <button v-if="province" type="button" :class="{ on: city === province }" :aria-pressed="city === province" @click="pickCity(province)">{{ province }}{{ ['北京', '天津', '上海', '重庆'].includes(province) ? '全市' : '全省' }}</button>
            <button v-for="name in cityNames.filter(name => name !== province)" :key="name" type="button" :class="{ on: city === name }" :aria-pressed="city === name" @click="pickCity(name)">{{ name }}</button>
          </div></div>
        </div>
        <div v-else-if="sheet === 'time'" class="time selection-layout">
          <nav class="year-nav" aria-label="年份导航"><button v-for="year in years" :key="year" type="button" :class="{ on: selectedYear === year }" :aria-pressed="selectedYear === year" @click="selectedYear = year">{{ year }}年</button></nav>
          <div class="month-content"><div class="selection-caption"><h4>{{ selectedYear }}年</h4><span>选择比赛月份</span></div><div class="months">
            <button type="button" class="unlimited-month" :class="{ on: !month }" :aria-pressed="!month" @click="clearMonth">不限时间</button>
            <button v-for="m in 12" :key="m" type="button" :class="{ on: month === ym(selectedYear, m) }" :aria-pressed="month === ym(selectedYear, m)" @click="pickMonth(selectedYear, m)">{{ m }}月</button>
          </div>
          </div>
        </div>
        <div v-else class="status-sheet">
          <section class="option-group"><h4>赛事形式<span>选择比赛参与方式</span></h4>
          <nav class="meet-options" aria-label="赛事形式"><button v-for="item in meetKinds" :key="item.kind" type="button" :class="{ on: meetKind === item.kind }" :aria-pressed="meetKind === item.kind" @click="pickMeet(item.kind)">{{ item.short }}</button></nav></section>
          <section class="option-group"><h4>比赛距离<span>与赛事类型独立筛选</span></h4><nav class="distance-options" aria-label="比赛距离"><button v-for="item in distanceOptions" :key="item.value" type="button" :class="{ on: distance === item.value }" :aria-pressed="distance === item.value" @click="pickDistance(item.value)">{{ item.label }}</button></nav></section>
          <section class="option-group"><h4>公开赛事状态<span>与我的参赛计划无关</span></h4>
          <div class="pills">
            <button v-for="item in statusOptions" :key="item.value" type="button" :class="{ on: status === item.value }" :aria-pressed="status === item.value" @click="pickStatus(item.value)">
              {{ item.label }}
            </button>
          </div></section>
        </div>
      </dialog>

      <div v-if="!loading && !loadError && races.length" class="stack home-race-list">
        <RaceCard v-for="race in races" :key="race.id" class="home-race-card" :race="race" />
      </div>
      <p v-else-if="!loading && !loadError" class="empty">{{ searching ? '没有找到这场赛事' : '这个分类还没有赛历' }}</p>
      <Pager v-if="!loading && !loadError" :page="page" :pages="pages" @update:page="turnPage" />
    </section>
    <section v-if="!searching" class="home-discover" aria-labelledby="discover-heading">
      <h2 id="discover-heading">赛事探索</h2>
      <div class="discover-links">
        <router-link to="/calendar" class="discover-calendar"><img :src="calendarIcon" alt="" /><strong>近期赛历</strong><span>按日期浏览</span></router-link>
        <router-link to="/news?tab=athlete" class="discover-person"><img :src="radarIcon" alt="" /><strong>赛道人物</strong><span>成绩与履历</span></router-link>
        <router-link to="/news" class="discover-news"><img :src="newsIcon" alt="" /><strong>跑圈新鲜事</strong><span>赛事与跑团</span></router-link>
      </div>
    </section>
    <section v-if="!searching" class="home-catalog" aria-labelledby="catalog-heading">
      <div class="catalog-heading"><h2 id="catalog-heading">热门赛事档案</h2><router-link class="catalog-all" to="/race-catalog">全部档案 ›</router-link></div>
      <div v-if="catalogError" class="catalog-error" role="status"><span>赛事档案暂时无法加载</span><button type="button" @click="loadCatalog">重试</button></div>
      <p v-else-if="catalogLoading" class="catalog-note" role="status">正在加载赛事档案…</p>
      <p v-else-if="!catalogRaces.length" class="catalog-note">赛事档案整理中</p>
      <div v-else class="catalog-list">
        <router-link v-for="item in catalogRaces" :key="item.id" class="catalog-race" :to="'/race-catalog/' + item.id">
          <div class="catalog-landmark" aria-hidden="true"><img v-if="landmarkUrl(item.id) && !failedLandmarks[item.id]" :src="landmarkUrl(item.id)" alt="" width="80" height="64" @error="failedLandmarks[item.id] = true" /><span v-else>{{ item.city }}</span></div>
          <h3>{{ item.name }}</h3>
          <div class="catalog-certifications">
            <span :title="'世界田联 ' + certificationLabel(item.worldAthletics)">田联 · {{ item.worldAthletics?.label || '待核实' }}<small v-if="!commonCertificationYear(item) && item.worldAthletics?.year">{{ item.worldAthletics.year }}</small></span>
            <span :title="'中国田协 ' + certificationLabel(item.caa)">田协 · {{ item.caa?.label || '待核实' }}<small v-if="!commonCertificationYear(item) && item.caa?.year">{{ item.caa.year }}</small></span>
          </div>
          <span v-if="commonCertificationYear(item)" class="catalog-certification-year">{{ commonCertificationYear(item) }} 认证</span>
          <div class="catalog-card-footer"><span>{{ item.years?.length ? item.years.length + ' 届档案' : '年度档案' }}</span><span class="catalog-card-arrow" aria-hidden="true">›</span></div>
        </router-link>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";
import RaceCard from "../components/RaceCard.vue";
import Pager from "../components/Pager.vue";
import calendarIcon from "../assets/quick/calendar.svg";
import radarIcon from "../assets/quick/radar.svg";
import clubsIcon from "../assets/quick/clubs.svg";
import newsIcon from "../assets/quick/news.svg";
import { regions as places } from "../regions";
import { landmarkUrl } from "../race-landmarks";

const route = useRoute();
const mode = ref("conditions");
const q = ref("");
const submitted = ref({ status: "upcoming", page: "1" });
const page = ref(1);
const pages = ref(1);
const total = ref(0);
const city = ref("");
const month = ref("");
const distance = ref("");
const trackKind = ref("");
const meetKind = ref("");
const status = ref("upcoming");
const sheet = ref("");
const sheetDialog = ref(null);
const resultsHeading = ref(null);
const races = ref([]);
const loadError = ref("");
const loading = ref(false);
const reminders = ref([]);
const reminderIndex = ref(0);
const currentReminder = computed(() => reminders.value[reminderIndex.value] || null);
const quickLinks = [
  { to: "/calendar", label: "赛事日历", icon: calendarIcon },
  { to: "/radar", label: "拿奖雷达", icon: radarIcon },
  { to: "/clubs", label: "发现跑团", icon: clubsIcon },
  { to: "/news", label: "跑圈资讯", icon: newsIcon }
];
const catalogRaces = ref([]), catalogLoading = ref(true), catalogError = ref(false);
const failedLandmarks = ref({});
function commonCertificationYear(race) { const year = race.worldAthletics?.year; return year && year === race.caa?.year ? year : ''; }
function certificationLabel(value) {
  if (!value || !value.label) return "待核实";
  return value.label + (value.year ? " · " + value.year : "");
}
async function loadCatalog() {
  catalogLoading.value = true;
  catalogError.value = false;
  try {
    const data = await api("/race-catalog");
    const featured = data.featuredIds || ['beijing', 'shanghai', 'xiamen'];
    catalogRaces.value = featured.map(id => (data.races || []).find(race => race.id === id)).filter(Boolean).slice(0, 3);
  } catch {
    catalogError.value = true;
  } finally {
    catalogLoading.value = false;
  }
}
function nextReminder() {
  if (reminders.value.length > 1) reminderIndex.value = (reminderIndex.value + 1) % reminders.value.length;
}
const searching = computed(() => Boolean(submitted.value.q));
let loadSeq = 0;
const province = ref("");
const availableCities = ref([]), availableMonths = ref([]);
const currentYear = new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear();
const years = computed(() => [...new Set([currentYear - 1, currentYear, currentYear + 1, currentYear + 2, ...availableMonths.value.map(value => Number(value.slice(0, 4))), ...(month.value ? [Number(month.value.slice(0, 4))] : [])])].filter(year => year > 1900).sort((a, b) => a - b));
const selectedYear = ref(currentYear);


const trackKinds = [
  { short: "全部赛事", kind: "" },
  { short: "路跑", kind: "road" },
  { short: "越野赛", kind: "trail" }
];
const meetKinds = [{ short: "全部形式", kind: "" }, { short: "线上赛", kind: "online" }, { short: "线下赛", kind: "offline" }];

const todayParts = computed(() => {
  const shifted = new Date(Date.now() + 8 * 3600 * 1000);
  const weeks = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return { month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(), week: weeks[shifted.getUTCDay()] };
});
const todayLabel = computed(() => todayParts.value.month + "月" + todayParts.value.day + "日 " + todayParts.value.week);

const statusOptions = [
  { label: "全部状态", value: "all" },
  { label: "即将开赛", value: "upcoming" },
  { label: "报名中", value: "open" },
  { label: "待开赛", value: "wait" },
  { label: "比赛中", value: "live" },
  { label: "比赛结束", value: "closed" },
  { label: "报名未录入", value: "unannounced" }
];

const distanceOptions = [{ label: '不限距离', value: '' }, { label: '马拉松', value: 'full' }, { label: '半程马拉松', value: 'half' }, { label: '10公里', value: '10k' }];
const advancedCount = computed(() => Number(!!meetKind.value) + Number(!!distance.value) + Number(status.value !== 'upcoming'));
const statusLabel = computed(() => statusOptions.find(item => item.value === submitted.value.status)?.label || '全部状态');
const resultSummary = computed(() => {
  const { q: keyword, ...filters } = submitted.value;
  if (keyword) return '关键词「' + keyword + '」';
  return filterLabels(filters).filter(item => item.key !== 'status').map(item => item.label).join(' · ');
});
const activeFilters = computed(() => filterLabels(conditionParams()));

function filterLabels(filters) {
  return [
    { key: 'city', category: '地点', label: filters.city },
    { key: 'month', category: '时间', label: formatMonth(filters.month) },
    { key: 'distance', category: '距离', label: filters.distance && distanceOptions.find(item => item.value === filters.distance)?.label },
    { key: 'kind', category: '类型', label: filters.kind && trackKinds.find(item => item.kind === filters.kind)?.short },
    { key: 'meet', category: '形式', label: filters.meet && meetKinds.find(item => item.kind === filters.meet)?.short },
    { key: 'status', category: '状态', label: filters.status !== 'upcoming' && statusOptions.find(item => item.value === filters.status)?.label }
  ].filter(item => item.label);
}

const cityNames = computed(() => province.value ? places.find((item) => item.name === province.value)?.cities || [] : availableCities.value.length ? availableCities.value : places.flatMap(item => item.cities));
const monthLabel = computed(() => formatMonth(month.value));

function formatMonth(value) {
  return value ? Number(value.slice(0, 4)) + '年' + Number(value.slice(5)) + '月' : '';
}

function ym(year, m) {
  return year + "-" + String(m).padStart(2, "0");
}

function conditionParams() {
  return Object.fromEntries(Object.entries({
    city: city.value,
    month: month.value,
    distance: distance.value,
    kind: trackKind.value,
    meet: meetKind.value,
    status: status.value
  }).filter(([, value]) => value));
}

function submitSearch() {
  const query = q.value.trim();
  if (query) return submit(keywordParams(query));
}

function submitConditions() {
  return submit(conditionParams());
}

function keywordParams(query) {
  return { q: query, status: "all" };
}

function submit(params) {
  return showResults({ ...params, page: "1" });
}

function showResults(params) {
  const request = load(params);
  nextTick(() => resultsHeading.value?.focus());
  return request;
}

function turnPage(next) {
  return showResults({ ...submitted.value, page: String(next) });
}

async function load(params = submitted.value) {
  const seq = ++loadSeq;
  submitted.value = params;
  loading.value = true;
  loadError.value = "";
  try {
    const data = await api("/races?" + new URLSearchParams(params).toString());
    if (seq !== loadSeq) return;
    races.value = data.races;
    availableCities.value = (Array.isArray(data.cities) ? data.cities : []).filter(Boolean);
    availableMonths.value = Array.isArray(data.months) ? data.months : [];
    total.value = data.total || 0;
    pages.value = data.pages || 1;
    page.value = data.page || 1;
  } catch (err) {
    if (seq !== loadSeq) return;
    races.value = [];
    loadError.value = err.message || "赛历加载失败";
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}
function pickDistance(value) {
  distance.value = value;
  sheet.value = '';
}
function pickMeet(value) { meetKind.value = value; sheet.value = ''; }
function pickStatus(value) { status.value = value; sheet.value = ''; }

let filterBodyOverflow;
watch(sheet, async (value) => {
  if (!value) {
    sheetDialog.value?.close();
    if (filterBodyOverflow !== undefined) document.body.style.overflow = filterBodyOverflow;
    filterBodyOverflow = undefined;
    return;
  }
  if (filterBodyOverflow === undefined) filterBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  await nextTick();
  if (sheet.value && sheetDialog.value && !sheetDialog.value.open) {
    sheetDialog.value.showModal();
    const selected = sheetDialog.value.querySelector('.prov .on,.year-nav .on');
    if (selected) selected.parentElement.scrollTop = selected.offsetTop - selected.parentElement.offsetTop - 48;
  }
});
onUnmounted(() => { if (filterBodyOverflow !== undefined) document.body.style.overflow = filterBodyOverflow; });
function closeBackdrop(event) {
  if (event.target !== sheetDialog.value) return;
  const box = sheetDialog.value.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) sheet.value = '';
}

function openSheet(name) {
  sheet.value = sheet.value === name ? "" : name;
  if (name === "city") {
    const found = places.find((item) => item.name === city.value || item.cities.includes(city.value));
    province.value = found?.name || '';
  }
  if (name === 'time') selectedYear.value = month.value ? Number(month.value.slice(0, 4)) : currentYear;
}

function pickCity(name) {
  city.value = name;
  sheet.value = '';
}

function pickMonth(year, m) {
  const value = ym(year, m);
  month.value = value;
  sheet.value = '';
}

function clearMonth() {
  month.value = "";
  sheet.value = '';
}

function resetFilters() {
  city.value = ''; month.value = ''; distance.value = '';
  trackKind.value = ''; meetKind.value = ''; status.value = 'upcoming';
}
function removeFilter(key) {
  if (key === 'city') city.value = '';
  if (key === 'month') month.value = '';
  if (key === 'distance') distance.value = '';
  if (key === 'kind') trackKind.value = '';
  if (key === 'meet') meetKind.value = '';
  if (key === 'status') status.value = 'upcoming';
}

function loadRouteQuery(query) {
  const text = (value) => typeof value === "string" ? value.trim() : "";
  const routeMonth = text(query.month);
  city.value = text(query.city);
  month.value = /^\d{4}-(0[1-9]|1[0-2])$/.test(routeMonth) ? routeMonth : "";
  trackKind.value = trackKinds.find(item => item.kind === query.kind)?.kind || "";
  meetKind.value = meetKinds.find(item => item.kind === query.meet)?.kind || "";
  status.value = statusOptions.find(item => item.value === query.status)?.value || "upcoming";
  distance.value = distanceOptions.find(item => item.value === query.distance)?.value || "";
  sheet.value = "";
  q.value = text(query.q);
  mode.value = q.value ? "keyword" : "conditions";
  const params = q.value ? keywordParams(q.value) : conditionParams();
  return load({ ...params, page: "1" });
}

onMounted(() => {
  loadCatalog();
  loadRouteQuery(route.query);
  loadReminders();
  window.addEventListener('race-follow-changed', loadReminders);
});
watch(() => route.query, (query) => {
  if (route.path === "/") loadRouteQuery(query);
});
let reminderRequest = 0;
async function loadReminders() {
  const ticket = ++reminderRequest, token = localStorage.getItem('marathon_token');
  try {
    const data = await api('/reminders');
    if (ticket !== reminderRequest || token !== localStorage.getItem('marathon_token')) return;
    const seen = new Set();
    reminders.value = [...(data.mine || []), ...(data.reminders || [])].filter(item => {
      const key = item.race.id + ':' + item.hit.key;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 3);
    reminderIndex.value = 0;
  } catch { /* The event list remains usable when reminders are unavailable. */ }
}
onUnmounted(() => { loadSeq++; reminderRequest++; window.removeEventListener('race-follow-changed', loadReminders); });
</script>

<style scoped>
.home-page {
  --finder-purple: #50378c;
  --finder-tint: #f1ecfa;
  --finder-muted: #625a6d;
  padding-bottom: 16px;
  background: #f5f3f7;
}
.home-catalog { margin: 24px 16px 0; padding: 12px; border-radius: 20px; background: #fff; }
.catalog-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.catalog-heading h2,.home-discover h2 { margin: 0; color: #302740; font-size: 18px; font-weight: 650; line-height: 1.5; }
.catalog-all { display: flex; flex: none; align-items: center; min-height: 44px; color: var(--finder-purple); font-size: 14px; }
.catalog-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.catalog-race { display: flex; min-width: 0; flex-direction: column; align-items: center; padding: 12px 4px 0; overflow: hidden; border: 1px solid #ede8f3; border-radius: 12px; background: #faf8fc; text-align: center; transition: border-color .15s ease; }
@media (hover: hover) { .catalog-race:hover { border-color: #d0bcea; } }
.catalog-race:focus-visible { outline: 2px solid var(--finder-purple); outline-offset: 2px; }
.catalog-landmark { display: flex; align-items: center; justify-content: center; width: 80px; max-width: 100%; height: 64px; margin-bottom: 8px; }
.catalog-landmark img { display: block; width: 100%; height: 100%; object-fit: contain; }
.catalog-landmark>span { color: #555; font-size: 18px; font-weight: 600; }
.catalog-race h3 { margin: 0; max-width: 100%; color: #302740; font-size: 14px; font-weight: 650; line-height: 1.5; overflow-wrap: anywhere; }
.catalog-certifications { display: grid; gap: 2px; width: 100%; margin-top: 8px; color: #666; font-size: 12px; line-height: 18px; }
.catalog-certifications>span { display: block; overflow-wrap: anywhere; }
.catalog-certifications small { display: block; font-size: 12px; }
.catalog-certification-year { margin-top: 4px; color: #777; font-size: 12px; line-height: 18px; }
.catalog-card-footer { display: flex; align-items: center; justify-content: center; gap: 6px; align-self: stretch; min-height: 36px; margin: auto 4px 0; padding-top: 4px; color: var(--finder-purple); font-size: 12px; line-height: 18px; }
.catalog-card-arrow { font-size: 18px; }
.catalog-note { margin: 0; padding: 20px 16px; border-radius: 12px; background: #fff; color: var(--muted); font-size: 12px; line-height: 1.8; }
.catalog-error { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-radius: 12px; background: #fff; color: var(--muted); font-size: 12px; }
.catalog-error button { min-width: 44px; min-height: 44px; color: var(--finder-purple); font-size: 14px; }
@media (min-width: 600px) { .catalog-list { gap: 12px; }.catalog-race { padding-top: 16px; }.catalog-landmark { width: 96px; height: 76px; } }
@media (prefers-reduced-motion: reduce) { .catalog-race { transition: none; } }
.home-top { background: #f5f3f7; }
.home-brand {
  position: relative;
  isolation: isolate;
  padding: 24px 16px 12px;
  background: #f4f2f7;
}
.home-brand::before {
  position: absolute;
  z-index: -1;
  inset: 0 0 auto;
  height: 258px;
  background: linear-gradient(170deg, #171a37fa, #302a4eb5 43%, #60527132 78%, #f4f2f7 100%),
    url('/images/race-archive-art/beijing-cover.svg') 62% center / cover no-repeat #34294b;
  content: '';
}
.home-page-title { margin: 14px 4px 0; color: #fff; font-size: 32px; font-weight: 650; line-height: 1.2; }
.home-calendar-link { display: inline-flex; align-items: center; gap: 7px; min-height: 44px; margin-left: 4px; color: #fff; font-size: 13px; }
.home-calendar-link svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.race-finder {
  margin-top: 28px;
  padding: 16px;
  border: 1px solid #fff;
  border-radius: 25px;
  background: #fff;
  box-shadow: 0 8px 25px #39276212;
}
.race-finder h2 { margin: 0 0 12px 2px; color: #201b28; font-size: 22px; line-height: 1.32; }
.finder-modes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 3px; gap: 4px; border-radius: 15px; background: var(--finder-tint); }
.finder-modes button { min-height: 44px; min-width: 0; padding: 5px 4px; border-radius: 12px; color: var(--finder-muted); font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
.finder-modes button[aria-pressed="true"] { background: #fff; color: var(--finder-purple); font-weight: 650; box-shadow: 0 1px 5px #50378c14; }
.finder-form { display: grid; gap: 12px; margin-top: 14px; }
.finder-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; overflow: hidden; border: 1px solid #eeebf2; border-radius: 13px; background: #eeebf2; }
.finder-fields button, .finder-keyword { background: #f8f7fa; }
.finder-fields button { display: flex; min-width: 0; min-height: 50px; align-items: center; gap: 6px; padding: 8px 10px; color: #322b3b; font-size: 14px; text-align: left; }
.finder-fields button.on { color: var(--finder-purple); font-weight: 600; }
.finder-fields svg, .finder-keyword svg { width: 18px; height: 18px; flex: none; fill: none; stroke: var(--finder-purple); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.finder-fields button > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.finder-fields i { flex: none; width: 6px; height: 6px; margin: 0 2px 3px; border-right: 1px solid currentColor; border-bottom: 1px solid currentColor; transform: rotate(45deg); }
.finder-fields .filter-more { grid-column: 1 / -1; min-height: 44px; }
.filter-more b { display: grid; flex: none; place-items: center; min-width: 20px; height: 20px; padding: 0 4px; border-radius: 12px; background: var(--finder-tint); font-size: 12px; }
.race-meet-categories { display: flex; flex-wrap: wrap; gap: 6px 8px; }
.race-meet-categories button { min-width: 44px; min-height: 44px; padding: 0 10px; border: 1px solid #eae5f0; border-radius: 22px; color: var(--finder-muted); font-size: 13px; }
.race-meet-categories button[aria-pressed="true"] { background: var(--finder-tint); border-color: var(--finder-tint); color: var(--finder-purple); font-weight: 600; }
.finder-keyword { display: flex; align-items: center; gap: 9px; min-height: 52px; padding: 0 12px; border: 1px solid #eeebf2; border-radius: 13px; }
.finder-keyword input { flex: 1; width: 0; min-width: 0; min-height: 48px; padding: 0; border: 0; background: transparent; }
.finder-search-hint { margin: 0 2px 2px; color: var(--finder-muted); font-size: 13px; }
.finder-submit {
  width: 100%;
  min-height: 49px;
  padding: 9px 16px;
  border-radius: 28px;
  background: linear-gradient(110deg, #7155ae, var(--finder-purple));
  color: #fff;
  font-size: 16px;
  font-weight: 650;
}
.finder-submit:disabled { background: #e8e1f2; color: #615272; }
.race-finder :is(button, input):focus-visible { outline-color: var(--finder-purple); outline-offset: -3px; }
.finder-keyword:focus-within { border-color: var(--finder-purple); }
.home-shortcuts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0 16px; padding: 4px; border: 1px solid #ede9f3; border-radius: 18px; background: #fff; }
.home-shortcuts a { display: flex; min-width: 0; min-height: 66px; padding: 4px; gap: 3px; flex-direction: column; justify-content: center; align-items: center; border-radius: 12px; color: #302740; font-size: 12px; line-height: 18px; text-align: center; }
.home-shortcuts img { display: block; width: 38px; height: 38px; }
.home-discover { margin: 18px 16px 0; padding: 12px; border-radius: 20px; background: #fff; }
.home-discover h2 { margin-bottom: 8px; }
.discover-links { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; }
.discover-links a { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; padding: 8px 4px; border-radius: 12px; background: #f7f4fb; color: #302740; text-align: center; font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
.discover-links img { width: 30px; height: 30px; }
.discover-links a > span { color: var(--finder-muted); font-size: 12px; }
.deadline-banner { display: flex; align-items: center; gap: 8px; margin: 10px 16px 0; padding: 6px 8px; border: 1px solid #e7def3; border-radius: 16px; background: #f0eaf8; }
.deadline-copy { display: flex; flex: 1; gap: 8px; align-items: center; min-width: 0; min-height: 48px; padding: 4px; border-radius: 10px; }
.deadline-icon { display: grid; flex: none; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: #fff; color: var(--finder-purple); }
.deadline-icon svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.deadline-text { min-width: 0; color: var(--finder-purple); font-size: 12px; line-height: 1.45; }
.deadline-text strong { display: block; color: #302740; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.deadline-next { display: flex; align-items: center; justify-content: center; flex: none; gap: 5px; min-width: 48px; min-height: 44px; border-radius: 12px; background: #fff; color: var(--finder-purple); }
.deadline-next small { font-size: 12px; }
.deadline-next > span { font-size: 20px; line-height: 1; }
.results-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 16px 10px; }
.results-heading h2 { margin: 0; color: #302740; font-size: 21px; font-weight: 650; line-height: 1.5; }
.results-total,.results-summary { color: var(--finder-muted); font-size: 13px; line-height: 1.6; }
.results-total { display: block; font-variant-numeric: tabular-nums; }
.results-summary { margin: 0 16px 10px; padding: 7px 11px; border-radius: 10px; background: var(--finder-tint); color: var(--finder-purple); overflow-wrap: anywhere; }
.results-archive { display: flex; align-items: center; gap: 5px; min-height: 44px; padding: 0 11px; border-radius: 12px; background: #fff; color: var(--finder-purple); font-size: 13px; }
.results-heading h2:focus-visible,.home-shortcuts a:focus-visible,.deadline-banner :is(a,button):focus-visible,.results-archive:focus-visible,.discover-links a:focus-visible { outline: 2px solid var(--finder-purple); outline-offset: 2px; }
.active-filters{display:flex;align-items:center;flex-wrap:wrap;column-gap:6px;margin:-5px 0 0;font-size:12px;line-height:1.6}
.active-filters .filter-tag{position:relative;display:flex;align-items:center;justify-content:center;gap:4px;min-width:44px;min-height:44px;max-width:100%;padding:10px 9px;border:0;border-radius:0;background:transparent;color:var(--finder-purple);font-size:12px;line-height:1.6;isolation:isolate}
.filter-tag:before{position:absolute;inset:8px 0;border-radius:7px;background:var(--finder-tint);content:'';z-index:-1}
.filter-tag>span{min-width:0;overflow-wrap:anywhere}
.active-filters .clear-filters{min-width:44px;min-height:44px;padding:8px 5px;background:transparent;color:var(--finder-muted);font-size:12px;line-height:1.5}
.active-filters svg{flex:none;width:14px;height:14px;stroke:currentColor;stroke-width:1.3;stroke-linecap:round}
.home-page dialog.drop.home-filter-sheet[open]{position:fixed;inset:auto 0 0;width:min(430px,100%);max-width:none;max-height:calc(90dvh - env(safe-area-inset-top,0px));margin:0 auto;padding:0 0 env(safe-area-inset-bottom,0px);border:0;border-radius:23px 23px 0 0;transform:none;background:#fff;color:#443b43;overscroll-behavior:contain;overflow-y:auto}
.home-filter-sheet::backdrop{background:#261c244d;backdrop-filter:blur(3px)}
.sheet-grip{width:30px;height:4px;margin:10px auto 0;border-radius:4px;background:#e9e0e4}
.filter-sheet-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 20px 20px}
.filter-sheet-heading h3{margin:0;color:#302a30;font-size:21px;font-weight:650;line-height:1.5;letter-spacing:-.4px}
.filter-sheet-heading p{margin:4px 0 0;color:#a18d98;font-size:12px;line-height:1.5}
.filter-sheet-heading>button{display:grid;place-items:center;flex:none;width:44px;height:44px;border:0;border-radius:50%;background:#f6f3f4;color:#9b8591}
.filter-sheet-heading svg{width:19px;height:19px;stroke:currentColor;stroke-width:1.35;stroke-linecap:round}
.home-filter-sheet .loc,.home-filter-sheet .selection-layout{display:grid;grid-template-columns:94px minmax(0,1fr);grid-template-rows:minmax(0,1fr);height:auto;min-height:0;max-height:min(52dvh,384px);overflow:hidden}
.home-filter-sheet .prov,.home-filter-sheet .year-nav{display:flex;flex-direction:column;gap:0;width:auto;min-width:0;min-height:0;max-height:inherit;margin:0;padding:4px 0 12px;background:#f8f6f7;overflow-y:auto;overscroll-behavior:contain}
.home-filter-sheet :is(.prov,.year-nav) button{position:relative;display:block;flex:none;width:100%;min-width:0;min-height:48px;padding:10px 10px;border:0;border-radius:0;background:transparent;color:#897b83;font-size:13px;line-height:1.5;text-align:center;overflow-wrap:anywhere}
.home-filter-sheet :is(.prov,.year-nav) button.on{background:#fff;color:var(--finder-purple);font-weight:600}
.home-filter-sheet :is(.prov,.year-nav) button.on:before{position:absolute;top:17px;bottom:17px;left:0;width:3px;border-radius:2px;background:var(--finder-purple);content:''}
.city-content,.month-content{min-width:0;max-height:inherit;padding:7px 16px 24px;overflow-y:auto;overscroll-behavior:contain}
.selection-caption{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px;padding:2px 0 14px}
.selection-caption h4{margin:0;color:#55434e;font-size:14px;font-weight:600;line-height:1.5}
.selection-caption>span{color:#ae9aa5;font-size:12px;line-height:1.5}
.home-filter-sheet .cities,.home-filter-sheet .months{display:grid;gap:8px;padding:0;overflow:visible;align-content:start}
.home-filter-sheet .cities{grid-template-columns:repeat(2,minmax(0,1fr))}
.home-filter-sheet .months{grid-template-columns:repeat(3,minmax(0,1fr))}
.home-filter-sheet .time{padding:0;overflow:hidden}
.home-filter-sheet :is(.cities,.months,.pills,.meet-options,.distance-options) button{position:relative;width:auto;min-width:0;min-height:44px;height:auto;margin:0;padding:11px 6px;border:1px solid transparent;border-radius:9px;background:#f7f5f6;color:#806e7a;font-size:13px;line-height:1.5;white-space:normal;overflow-wrap:anywhere}
.home-filter-sheet :is(.cities,.months,.pills,.meet-options,.distance-options) button.on{border-color:#ded3f0;background:var(--finder-tint);color:var(--finder-purple);font-weight:550}
.home-filter-sheet :is(.cities,.months,.pills,.meet-options,.distance-options) button.on:after{position:absolute;right:3px;bottom:3px;width:4px;height:4px;border-radius:50%;background:var(--finder-purple);content:''}
.home-filter-sheet .months .unlimited-month{grid-column:span 3;margin-bottom:2px}
.home-filter-sheet .status-sheet{padding:0 20px 24px;overflow-y:auto}
.option-group+.option-group{margin-top:24px}
.option-group h4{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px;margin:0 0 12px;color:#4c3d47;font-size:14px;font-weight:600;line-height:1.5}
.option-group h4>span{color:#ae9aa5;font-size:12px;font-weight:400}
.meet-options,.distance-options,.home-filter-sheet .pills{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.distance-options{grid-template-columns:repeat(4,minmax(0,1fr))}
.home-filter-sheet .distance-options button{padding-right:3px;padding-left:3px;font-size:12px}
.results-loading{margin:0 18px 12px;color:#a58d99;font-size:12px;line-height:1.7}
.home-race-list{gap:12px;padding:0 16px 16px}
.home-race-card { border-color: #ebe5f0; border-radius: 18px; box-shadow: 0 3px 12px #37264d0b; }
.home-race-card :deep(.date) { border-color: #ece4f4; background: #faf7fd; color: #50378c; }
.home-race-card :deep(.date>span) { border-color: #ece4f4; background: #f1ecfa; color: #50378c; }
.home-race-card :deep(.date>b) { color: #44316f; }
.home-race-card :deep(.race-card-actions) { border-top-color: #ede9f3; background: #faf8fc; }
.home-results :deep(.pager) { justify-content: center; margin: 0 16px 16px; }
.home-results :deep(.pager button) { min-width: 44px; }
.home-results :deep(.pager button.on) { border-color: var(--finder-purple); background: var(--finder-purple); color: #fff; }
.home-results>.empty{margin:0 16px;padding:36px 22px;border:0;border-radius:15px;background:#fff;color:#9c8593;font-size:13px;line-height:1.8}
.home-results>.load-error{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 16px 14px;padding:12px 16px;border:1px solid #f0dce3;border-radius:14px;background:#fff7f9;font-size:13px;line-height:1.7}
.home-results>.load-error button{flex:none;min-width:44px;min-height:44px;background:var(--finder-purple);color:#fff}
@media(max-width:350px){.home-filter-sheet .status-sheet{padding-right:16px;padding-left:16px}.home-filter-sheet .loc,.home-filter-sheet .selection-layout{grid-template-columns:82px minmax(0,1fr)}.city-content,.month-content{padding-right:12px;padding-left:12px}}
</style>
