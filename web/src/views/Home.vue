<template>
  <main class="home-page" :style="pageMinHeight ? { minHeight: pageMinHeight + 'px' } : undefined">
    <section class="home-top">
      <div class="home-brand">
      <h1 class="home-page-title">赛事</h1>
      <router-link class="home-calendar-link" to="/calendar"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16"/></svg><span>{{ todayLabel }}</span><span aria-hidden="true">›</span></router-link>
      <form class="home-search" role="search" @submit.prevent="submitSearch">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 4.5 4.5" /></svg>
        <input v-model="q" aria-label="搜索赛事名称或城市" placeholder="搜索赛事名称 / 城市" @input="queueSearch" />
        <button type="submit"><span>搜索</span></button>
      </form>
      </div>
      <nav v-if="!searching" class="home-shortcuts" aria-label="常用功能">
        <router-link v-for="item in quickLinks" :key="item.to" :to="item.to">
          <img :src="item.icon" alt="" />
          <span>{{ item.label }}</span>
        </router-link>
      </nav>
    </section>
    <section v-if="!searching" class="home-discover" aria-label="跑步精选入口">
      <router-link to="/calendar" class="discover-calendar">
        <div class="discover-photo-copy"><span>赛事日历</span><strong>近期赛历</strong><small>{{ races[0]?.raceDate || '选择你的比赛日' }}</small><p>{{ races[0]?.name || '按日期查找，安排下一场比赛' }}</p></div>
        <img :src="base + 'images/art-calendar.png'" alt="" />
      </router-link>
      <div class="discover-side">
        <router-link to="/news?tab=athlete" class="discover-person"><div><strong>见证中国速度</strong><span>赛季成绩 · 人物履历</span></div><img :src="radarIcon" alt="" /></router-link>
        <router-link to="/news" class="discover-news"><div><strong>跑圈新鲜事</strong><span>资讯 · 官兔 · 跑团</span></div><img :src="newsIcon" alt="" /></router-link>
      </div>
    </section>
    <section v-if="!searching" class="home-catalog" aria-labelledby="catalog-heading">
      <div class="catalog-heading"><h2 id="catalog-heading">热门赛事档案</h2><router-link class="catalog-all" to="/race-catalog">全部档案 ›</router-link></div>
      <p class="catalog-intro">历年路线、中签与完赛记忆</p>
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
    <div v-if="!searching && currentReminder" class="deadline-banner">
      <span class="deadline-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2M8 2h8" /></svg></span>
      <router-link class="deadline-copy" :to="'/races/' + currentReminder.race.id">
        <span>{{ currentReminder.hit.reason }}</span>
        <strong>{{ currentReminder.race.name }}</strong>
      </router-link>
      <button type="button" class="deadline-next" :aria-label="reminders.length > 1 ? '查看下一条提醒' : '赛事提醒'" @click="nextReminder">
        <small v-if="reminders.length > 1">{{ reminderIndex % reminders.length + 1 }}/{{ reminders.length }}</small><span>›</span>
      </button>
    </div>
    <section class="home-results">
      <div class="results-heading"><h2>{{ searching ? '搜索结果' : '全部赛事' }}</h2><span><template v-if="!searching">{{ statusLabel }} · </template>{{ total }} 场</span></div>
      <div v-if="!searching" class="filter-wrap home-filters">
        <div class="filter-navigation">
          <nav class="race-meet-categories" aria-label="赛事类型">
            <button v-for="item in trackKinds" :key="item.kind" type="button" :class="{ on: trackKind === item.kind }" :aria-pressed="trackKind === item.kind" @click="setTrackKind(item.kind)">{{ item.short }}</button>
          </nav>
          <span class="filter-hint">找到你的下一场</span>
        </div>
        <div class="filter-bar">
          <button type="button" :class="{ on: city }" :title="city || '比赛地点'" aria-label="比赛地点" :aria-expanded="sheet === 'city'" @click="openSheet('city')"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M16 8c0 4-6 9-6 9S4 12 4 8a6 6 0 1 1 12 0Z"/><circle cx="10" cy="8" r="2"/></svg><span>{{ city || '比赛地点' }}</span><i></i></button>
          <button type="button" :class="{ on: month }" :title="monthLabel || '比赛时间'" aria-label="比赛时间" :aria-expanded="sheet === 'time'" @click="openSheet('time')"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="4" width="14" height="13" rx="3"/><path d="M6 2v4m8-4v4M3 9h14"/></svg><span>{{ month ? Number(month.slice(5)) + '月赛事' : '比赛时间' }}</span><i></i></button>
          <button type="button" class="filter-more" :class="{ on: advancedCount }" aria-label="更多筛选" :aria-expanded="sheet === 'status'" @click="openSheet('status')"><img :src="filterIcon" alt="" /><span>筛选</span><b v-if="advancedCount">{{ advancedCount }}</b><i v-else></i></button>
        </div>
      </div>
      <div v-if="!searching && activeFilters.length" class="active-filters" aria-label="已选筛选条件"><button v-for="item in activeFilters" :key="item.key" type="button" class="filter-tag" :aria-label="'取消' + item.category + '：' + item.label" @click="removeFilter(item.key)"><span>{{ item.label }}</span><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m5 5 6 6m0-6-6 6"/></svg></button><button type="button" class="clear-filters" @click="resetFilters">清空筛选</button></div>
      <div v-if="loadError" class="load-error" role="alert"><span>{{ loadError }}</span><button type="button" @click="load">重试</button></div>
      <p v-else-if="loading" class="results-loading" role="status">正在更新赛事…</p>
      <dialog v-if="sheet" ref="sheetDialog" class="drop home-filter-sheet" aria-labelledby="home-filter-title" @cancel.prevent="sheet = ''" @click="closeBackdrop">
        <div class="sheet-grip" aria-hidden="true"></div>
        <div class="filter-sheet-heading"><div><h3 id="home-filter-title">{{ sheet === 'city' ? '想去哪里跑' : sheet === 'time' ? '选个比赛时间' : '找到心仪赛事' }}</h3><p>点选即生效，自动收起</p></div><button type="button" autofocus aria-label="关闭筛选" @click="sheet = ''"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></div>
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
          <section class="option-group"><h4>比赛距离<span>与赛事类型独立筛选</span></h4><nav class="distance-options" aria-label="比赛距离"><button v-for="item in distanceOptions" :key="item.value" type="button" :class="{ on: distanceParam() === item.value }" :aria-pressed="distanceParam() === item.value" @click="pickDistance(item.value)">{{ item.label }}</button></nav></section>
          <section class="option-group"><h4>公开赛事状态<span>与我的参赛计划无关</span></h4>
          <div class="pills">
            <button v-for="item in statusOptions" :key="item.value" type="button" :class="{ on: status === item.value }" :aria-pressed="status === item.value" @click="pickStatus(item.value)">
              {{ item.label }}
            </button>
          </div></section>
        </div>
      </dialog>

      <div v-if="!loadError && shownQuery === q.trim() && races.length" class="stack home-race-list" :aria-busy="loading">
        <RaceCard v-for="race in races" :key="race.id" :race="race" />
      </div>
      <p v-else-if="!loading && !loadError && shownQuery === q.trim()" class="empty">{{ searching ? '没有找到这场赛事' : '这个分类还没有赛历' }}</p>
      <Pager v-if="!loading && !loadError && shownQuery === q.trim()" :page="page" :pages="pages" @update:page="turnPage" />
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
import filterIcon from "../assets/race-actions/filter.svg";
import { regions as places } from "../regions";

const base = import.meta.env.BASE_URL;
const route = useRoute();
const q = ref("");
const page = ref(1);
const pages = ref(1);
const total = ref(0);
const city = ref("");
const month = ref("");
const full = ref(false);
const half = ref(false);
const ten = ref(false);
const trackKind = ref("");
const meetKind = ref("");
const status = ref("upcoming");
const sheet = ref("");
const sheetDialog = ref(null);
const pageMinHeight = ref(0);
let filterScrollTop = 0;
const races = ref([]);
const shownQuery = ref("");
const loadError = ref("");
const loading = ref(false);
const reminders = ref([]);
const reminderIndex = ref(0);
const currentReminder = computed(() => reminders.value[reminderIndex.value % reminders.value.length] || null);
const quickLinks = [
  { to: "/calendar", label: "赛事日历", icon: calendarIcon },
  { to: "/radar", label: "拿奖雷达", icon: radarIcon },
  { to: "/clubs", label: "发现跑团", icon: clubsIcon },
  { to: "/news", label: "跑圈资讯", icon: newsIcon }
];
const catalogRaces = ref([]), catalogLoading = ref(true), catalogError = ref(false);
const failedLandmarks = ref({});
function landmarkUrl(id) { return ['beijing', 'shanghai', 'xiamen'].includes(id) ? base + 'images/race-landmarks/' + id + '.svg' : ''; }
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
    catalogRaces.value = data.races || [];
  } catch {
    catalogError.value = true;
  } finally {
    catalogLoading.value = false;
  }
}
function nextReminder() { reminderIndex.value = (reminderIndex.value + 1) % Math.max(1, reminders.value.length); }
let reminderTimer;
onMounted(() => { reminderTimer = window.setInterval(nextReminder, 5000); });
onUnmounted(() => { window.clearInterval(reminderTimer); clearTimeout(searchTimer); });
const searching = computed(() => !!q.value.trim());
let searchTimer = 0;
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
  { label: "报名未公布", value: "unannounced" }
];

const distanceOptions = [{ label: '不限距离', value: '' }, { label: '马拉松', value: 'full' }, { label: '半程马拉松', value: 'half' }, { label: '10公里', value: '10k' }];
const advancedCount = computed(() => Number(!!meetKind.value) + Number(!!distanceParam()) + Number(status.value !== 'upcoming'));
const statusLabel = computed(() => statusOptions.find(item => item.value === status.value)?.label || '全部状态');
const activeFilters = computed(() => [
  { key: 'city', category: '地点', label: city.value },
  { key: 'month', category: '时间', label: monthLabel.value },
  { key: 'distance', category: '距离', label: distanceParam() && distanceOptions.find(item => item.value === distanceParam())?.label },
  { key: 'kind', category: '类型', label: trackKinds.find(item => item.kind && item.kind === trackKind.value)?.short },
  { key: 'meet', category: '形式', label: meetKinds.find(item => item.kind && item.kind === meetKind.value)?.short },
  { key: 'status', category: '状态', label: status.value !== 'upcoming' && statusOptions.find(item => item.value === status.value)?.label }
].filter(item => item.label));

const cityNames = computed(() => province.value ? places.find((item) => item.name === province.value)?.cities || [] : availableCities.value.length ? availableCities.value : places.flatMap(item => item.cities));
const monthLabel = computed(() => (month.value ? Number(month.value.slice(0, 4)) + '年' + Number(month.value.slice(5)) + '月' : ''));

function ym(year, m) {
  return year + "-" + String(m).padStart(2, "0");
}

function distanceParam() {
  const picked = [full.value && "full", half.value && "half", ten.value && "10k"].filter(Boolean);
  return picked.length === 1 ? picked[0] : "";
}

function queueSearch() {
  if (q.value.trim()) sheet.value = "";
  page.value = 1;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 200);
}

function submitSearch() {
  clearTimeout(searchTimer);
  page.value = 1;
  return load();
}

function turnPage(next) {
  page.value = next;
  return load();
}

async function load(options = {}) {
  const seq = ++loadSeq;
  loading.value = true;
  loadError.value = "";
  const query = q.value.trim();
  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
    params.set("status", "all");
  } else {
    if (city.value) params.set("city", city.value);
    if (month.value) params.set("month", month.value);
    const distance = distanceParam();
    if (distance) params.set("distance", distance);
    if (trackKind.value) params.set("kind", trackKind.value);
    if (meetKind.value) params.set("meet", meetKind.value);
    params.set("status", status.value || "all");
  }
  params.set("page", String(page.value));
  try {
    const data = await api("/races?" + params.toString());
    if (seq !== loadSeq) return;
    races.value = data.races;
    availableCities.value = (Array.isArray(data.cities) ? data.cities : []).filter(Boolean);
    availableMonths.value = Array.isArray(data.months) ? data.months : [];
    total.value = data.total || 0;
    pages.value = data.pages || 1;
    page.value = data.page || 1;
    shownQuery.value = query;
  } catch (err) {
    if (seq !== loadSeq) return;
    races.value = [];
    shownQuery.value = query;
    loadError.value = err.message || "赛历加载失败";
  } finally {
    if (seq === loadSeq) {
      loading.value = false;
      if (Number.isFinite(options.keepScroll)) {
        await nextTick();
        if (seq === loadSeq) window.scrollTo({ top: options.keepScroll, behavior: 'auto' });
      }
    }
  }
}

function setTrackKind(next) {
  trackKind.value = next;
  applyFilters();
}

function rememberPosition() {
  const top = window.scrollY;
  const main = document.querySelector('.home-page');
  const start = main ? main.getBoundingClientRect().top + top : 0;
  pageMinHeight.value = Math.max(pageMinHeight.value, top + window.innerHeight - start);
  return top;
}
function applyFilters() {
  const keepScroll = sheet.value ? filterScrollTop : rememberPosition();
  sheet.value = '';
  page.value = 1;
  return load({ keepScroll });
}
function pickDistance(value) {
  full.value = value === 'full'; half.value = value === 'half'; ten.value = value === '10k';
  applyFilters();
}
function pickMeet(value) { meetKind.value = value; applyFilters(); }
function pickStatus(value) { status.value = value; applyFilters(); }

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
  filterScrollTop = rememberPosition();
  sheet.value = sheet.value === name ? "" : name;
  if (name === "city") {
    const found = places.find((item) => item.name === city.value || item.cities.includes(city.value));
    province.value = found?.name || '';
  }
  if (name === 'time') selectedYear.value = month.value ? Number(month.value.slice(0, 4)) : currentYear;
}

function pickCity(name) {
  city.value = name;
  applyFilters();
}

function pickMonth(year, m) {
  const value = ym(year, m);
  month.value = value;
  applyFilters();
}

function clearMonth() {
  month.value = "";
  applyFilters();
}

function resetFilters() {
  city.value = ''; month.value = ''; full.value = false; half.value = false; ten.value = false;
  trackKind.value = ''; meetKind.value = ''; status.value = 'upcoming'; page.value = 1;
  applyFilters();
}
function removeFilter(key) {
  if (key === 'city') city.value = '';
  if (key === 'month') month.value = '';
  if (key === 'distance') { full.value = false; half.value = false; ten.value = false; }
  if (key === 'kind') trackKind.value = '';
  if (key === 'meet') meetKind.value = '';
  if (key === 'status') status.value = 'upcoming';
  applyFilters();
}

onMounted(() => {
  if (trackKinds.some((item) => item.kind === route.query.kind)) trackKind.value = route.query.kind;
  loadCatalog();
  load();
  loadReminders();
  window.addEventListener('race-follow-changed', loadReminders);
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
onUnmounted(() => { reminderRequest++; window.removeEventListener('race-follow-changed', loadReminders); });
</script>

<style scoped>
.home-page { padding-bottom: 16px; }
.home-catalog { margin: 24px 16px 0; }
.catalog-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.catalog-heading h2 { margin: 0; font-size: 18px; font-weight: 600; line-height: 1.5; }
.catalog-all { display: flex; flex: none; align-items: center; min-height: 44px; color: var(--accent); font-size: 14px; }
.catalog-intro { margin: 0 0 14px; color: var(--muted); font-size: 12px; line-height: 1.7; }
.catalog-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.catalog-race { display: flex; min-width: 0; flex-direction: column; align-items: center; padding: 12px 4px 0; overflow: hidden; border: 1px solid #eaeaea; border-radius: 12px; background: #fff; text-align: center; transition: border-color .15s ease; }
@media (hover: hover) { .catalog-race:hover { border-color: #ffbac5; } }
.catalog-race:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.catalog-landmark { display: flex; align-items: center; justify-content: center; width: 80px; max-width: 100%; height: 64px; margin-bottom: 8px; }
.catalog-landmark img { display: block; width: 100%; height: 100%; object-fit: contain; }
.catalog-landmark>span { color: #555; font-size: 18px; font-weight: 600; }
.catalog-race h3 { margin: 0; max-width: 100%; font-size: 15px; font-weight: 600; line-height: 24px; white-space: nowrap; }
.catalog-certifications { display: grid; gap: 2px; width: 100%; margin-top: 8px; color: #666; font-size: 12px; line-height: 18px; }
.catalog-certifications>span { display: block; overflow-wrap: anywhere; }
.catalog-certifications small { display: block; font-size: 12px; }
.catalog-certification-year { margin-top: 4px; color: #777; font-size: 12px; line-height: 18px; }
.catalog-card-footer { display: flex; align-items: center; justify-content: center; gap: 6px; align-self: stretch; min-height: 36px; margin: 12px 4px 0; border-top: 1px solid #f0f0f0; color: #777; font-size: 12px; line-height: 18px; }
.catalog-card-arrow { color: var(--accent); font-size: 18px; }
.catalog-note { margin: 0; padding: 20px 16px; border-radius: 12px; background: #fff; color: var(--muted); font-size: 12px; line-height: 1.8; }
.catalog-error { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-radius: 12px; background: #fff; color: var(--muted); font-size: 12px; }
.catalog-error button { min-width: 44px; min-height: 44px; color: var(--accent); font-size: 14px; }
@media (min-width: 600px) { .catalog-list { gap: 12px; }.catalog-race { padding-top: 16px; }.catalog-landmark { width: 96px; height: 76px; } }
@media (prefers-reduced-motion: reduce) { .catalog-race { transition: none; } }
.home-top { background: #fff; }
.home-brand { position: relative; overflow: hidden; padding: 12px 0 16px; background: radial-gradient(ellipse at 100% 25%,#ff536a 0,transparent 70%),var(--brand-header); }
.home-brand::before,.home-brand::after { position: absolute; top: 16px; right: -80px; width: 240px; height: 240px; border: 1px solid #ffffff29; border-radius: 50%; content: ''; pointer-events: none; }
.home-brand::after { top: 32px; right: -64px; width: 208px; height: 208px; }
.home-page-title { position:absolute; width:1px; height:1px; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; }
.home-calendar-link { position:relative; z-index:1; display:flex; align-items:center; gap:6px; width:max-content; min-height:32px; margin:0 16px 6px; color:#fff; font-size:12px; }
.home-calendar-link svg { width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; }
.home-search { display: flex; align-items: center; height: 46px; margin: 0 12px; padding: 0 3px 0 12px; border: 1px solid #fff; border-radius: 10px; background: #fff; }
.home-brand .home-search { position: relative; z-index: 1; }
.home-search > svg { width: 18px; height: 18px; flex: none; fill: none; stroke: #888; stroke-width: 1.6; stroke-linecap: round; }
.home-search input { width: 0; min-width: 0; flex: 1; height: 38px; margin-left: 8px; padding: 0; border: 0; border-radius: 0; background: transparent; font-size: 14px; font-weight: 400; outline: none; }
.home-search button { display: flex; align-items: center; justify-content: center; flex: 0 0 56px; width: 56px; height: 44px; min-height: 44px; min-width: 0; padding: 0; border-radius: 7px; background: transparent; color: #fff; font-size: 13px; font-weight: 600; line-height: 1.4; }
.home-search button > span { display: flex; align-items: center; justify-content: center; width: 56px; height: 34px; border-radius: 7px; background: var(--accent); }
.home-shortcuts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0 12px; padding: 0 0 10px; }
.home-shortcuts a { display: flex; min-width: 0; min-height: 76px; padding-top:12px; gap:8px; flex-direction: column; align-items: center; color: #444; font-size: 12px; line-height: 20px; }
.home-shortcuts img { display: block; width: 44px; height: 44px; }
.home-discover { display: grid; grid-template-columns: 1.08fr 1fr; gap: 12px; min-height: 160px; margin: 12px 16px 0; }
.discover-calendar { position: relative; display: flex; overflow: hidden; border-radius: 12px; background: linear-gradient(135deg,#fff,#fff0f2); color: var(--ink); }
.discover-calendar > img { position: absolute; right: 8px; top: 8px; width: 44px; height: 44px; object-fit: contain; }
.discover-photo-copy { position: relative; padding: 12px; z-index: 1; }.discover-photo-copy>span,.discover-photo-copy>strong{padding-right:38px}.discover-side> a >div{flex:1;min-width:0}
.discover-photo-copy > span { display: inline-block; color: var(--accent); font-size: 12px; line-height: 18px; }
.discover-photo-copy strong { display: block; margin: 4px 0; font-size: 18px; font-weight: 600; line-height: 1.3; white-space: nowrap; }
.discover-photo-copy small { display: block; margin-top: 6px; color: #888; font-size: 12px; line-height: 1.5; }
.discover-photo-copy i { font-style: normal; margin-left: 2px; }
.discover-side { display: grid; grid-template-rows: 1fr 1fr; gap: 8px; min-width: 0; }
.discover-side > a { position: relative; display: flex; align-items: center; justify-content: space-between; overflow: hidden; gap: 4px; padding: 10px; border-radius: 12px; background: var(--card); }
.discover-side .discover-news { background: #fff; }
.discover-side strong { display: block; font-size: 15px; line-height: 1.5; white-space: nowrap; font-weight: 600; }
.discover-side div > span { display: block; margin-top: 4px; color: #888; font-size: 12px; line-height: 1.5; white-space: normal; }
.discover-side img { flex: none; width: 36px; height: 36px; }
.deadline-banner { display: flex; align-items: center; gap: 8px; min-height: 49px; margin: 10px 12px 0; padding: 8px 12px; border-radius: 10px; background: #fff; }
.deadline-icon { flex: none; width: 24px; height: 24px; color: var(--accent); }
.deadline-icon svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.deadline-copy { flex: 1; min-width: 0; line-height: 1.4; }
.deadline-copy > span { color: var(--accent); font-size: 12px; font-weight: 500; }
.deadline-copy strong { display: block; overflow: hidden; color: #555; font-size: 12px; font-weight: 400; white-space: nowrap; text-overflow: ellipsis; }
.deadline-next { display: flex; align-items: center; flex: none; gap: 6px; min-height: 32px; color: #999; }
.deadline-next small { font-size: 12px; font-weight: 400; }
.deadline-next > span { font-size: 22px; line-height: 1; }
/* Event discovery stays visually lighter than the editorial sections above. */
.results-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:26px 18px 4px}
.results-heading h2{margin:0;color:#302a30;font-size:21px;font-weight:650;line-height:1.5;letter-spacing:-.4px}
.results-heading>span{color:#897b83;font-size:12px;font-variant-numeric:tabular-nums}
.home-filters{position:sticky;top:0;z-index:8;padding:0 16px 12px;background:var(--bg,#f5f5f5)}
.filter-navigation{display:flex;align-items:center;gap:10px;min-height:52px}
.race-meet-categories{display:flex;flex:1;min-width:0;gap:14px}
.race-meet-categories button{position:relative;flex:none;min-width:44px;min-height:48px;padding:10px 0;color:#897b83;font-size:13px;line-height:1.5;white-space:nowrap}
.race-meet-categories button.on{color:#e83150;font-weight:650}
.race-meet-categories button.on:after{position:absolute;bottom:6px;left:50%;width:18px;height:3px;border-radius:3px;background:linear-gradient(90deg,#ff8a81,#f03553);transform:translateX(-50%);content:''}
.filter-hint{flex:none;color:#a2949b;font-size:12px;line-height:1.5}
.home-filters .filter-bar{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;padding:2px 0;overflow:visible;border-radius:12px;background:#fff;box-shadow:0 3px 12px #48303903}
.home-filters .filter-bar>button{position:relative;display:flex;align-items:center;justify-content:center;gap:6px;width:auto;min-width:0;min-height:48px;height:auto;padding:7px 8px;border:0;border-radius:0;background:transparent;color:#655861;font-size:13px;font-weight:400;line-height:1.5;white-space:normal}
.home-filters .filter-bar>button+button:before{position:absolute;left:0;top:16px;bottom:16px;width:1px;background:#f0ebed;content:''}
.home-filters .filter-bar>button>span{min-width:0;overflow-wrap:anywhere}
.home-filters .filter-bar>button>svg{flex:none;width:17px;height:17px;stroke:#ae98a3;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}
.home-filters .filter-bar>button.on{color:#df3452;font-weight:550}
.home-filters .filter-more>img{flex:none;width:27px;height:27px;object-fit:contain}
.filter-more>b{display:grid;place-items:center;flex:none;min-width:16px;height:16px;padding:0 3px;border-radius:5px;background:#e83150;color:#fff;font-size:12px;font-weight:500;line-height:1}
.home-filters i{flex:none;width:5px;height:5px;margin:0 1px 3px;border-right:1px solid currentColor;border-bottom:1px solid currentColor;transform:rotate(45deg);opacity:.55}
.active-filters{display:flex;align-items:center;flex-wrap:wrap;column-gap:6px;row-gap:0;margin:-6px 16px 8px;color:#df3452;font-size:12px;line-height:1.6}
.active-filters .filter-tag{position:relative;display:flex;align-items:center;justify-content:center;gap:4px;min-width:44px;min-height:44px;max-width:100%;padding:10px 9px;border:0;border-radius:0;background:transparent;color:#ca4c68;font-size:12px;line-height:1.6;isolation:isolate}
.filter-tag:before{position:absolute;inset:8px 0;border-radius:7px;background:#ffebf0;content:'';z-index:-1}
.filter-tag>span{min-width:0;overflow-wrap:anywhere}
.active-filters .clear-filters{min-width:44px;min-height:44px;padding:8px 5px;background:transparent;color:#91818b;font-size:12px;line-height:1.5}
.active-filters svg{flex:none;width:14px;height:14px;stroke:currentColor;stroke-width:1.3;stroke-linecap:round}
.home-page dialog.drop.home-filter-sheet[open]{position:fixed;inset:auto 0 0;width:min(430px,100%);max-width:none;max-height:calc(90dvh - env(safe-area-inset-top,0px));margin:0 auto;padding:0 0 env(safe-area-inset-bottom,0px);border:0;border-radius:23px 23px 0 0;transform:none;background:#fff;color:#443b43;overscroll-behavior:contain;overflow-y:auto}
.home-filter-sheet::backdrop{background:#261c244d;backdrop-filter:blur(3px)}
.sheet-grip{width:30px;height:4px;margin:10px auto 0;border-radius:4px;background:#e9e0e4}
.filter-sheet-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 20px 20px}
.filter-sheet-heading h3{margin:0;color:#302a30;font-size:21px;font-weight:650;line-height:1.5;letter-spacing:-.4px}
.filter-sheet-heading p{margin:4px 0 0;color:#a18d98;font-size:12px;line-height:1.5}
.filter-sheet-heading>button{display:grid;place-items:center;flex:none;width:44px;height:44px;border:0;border-radius:50%;background:#f6f3f4;color:#9b8591}
.filter-sheet-heading svg{width:19px;height:19px;stroke:currentColor;stroke-width:1.35;stroke-linecap:round}
.home-filter-sheet .loc,.home-filter-sheet .selection-layout{display:grid;grid-template-columns:94px minmax(0,1fr);height:auto;min-height:0;max-height:min(52dvh,384px);overflow:hidden}
.home-filter-sheet .prov,.home-filter-sheet .year-nav{display:flex;flex-direction:column;gap:0;width:auto;min-width:0;margin:0;padding:4px 0 12px;background:#f8f6f7;overflow-y:auto;overscroll-behavior:contain}
.home-filter-sheet :is(.prov,.year-nav) button{position:relative;display:block;flex:none;width:100%;min-width:0;min-height:48px;padding:10px 10px;border:0;border-radius:0;background:transparent;color:#897b83;font-size:13px;line-height:1.5;text-align:center;overflow-wrap:anywhere}
.home-filter-sheet :is(.prov,.year-nav) button.on{background:#fff;color:#e83150;font-weight:600}
.home-filter-sheet :is(.prov,.year-nav) button.on:before{position:absolute;top:17px;bottom:17px;left:0;width:3px;border-radius:2px;background:#f04b65;content:''}
.city-content,.month-content{min-width:0;max-height:inherit;padding:7px 16px 24px;overflow-y:auto;overscroll-behavior:contain}
.selection-caption{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px;padding:2px 0 14px}
.selection-caption h4{margin:0;color:#55434e;font-size:14px;font-weight:600;line-height:1.5}
.selection-caption>span{color:#ae9aa5;font-size:12px;line-height:1.5}
.home-filter-sheet .cities,.home-filter-sheet .months{display:grid;gap:8px;padding:0;overflow:visible;align-content:start}
.home-filter-sheet .cities{grid-template-columns:repeat(2,minmax(0,1fr))}
.home-filter-sheet .months{grid-template-columns:repeat(3,minmax(0,1fr))}
.home-filter-sheet .time{padding:0;overflow:hidden}
.home-filter-sheet :is(.cities,.months,.pills,.meet-options,.distance-options) button{position:relative;width:auto;min-width:0;min-height:44px;height:auto;margin:0;padding:11px 6px;border:1px solid transparent;border-radius:9px;background:#f7f5f6;color:#806e7a;font-size:13px;line-height:1.5;white-space:normal;overflow-wrap:anywhere}
.home-filter-sheet :is(.cities,.months,.pills,.meet-options,.distance-options) button.on{border-color:#ffc9d5;background:#fff0f3;color:#df3452;font-weight:550}
.home-filter-sheet :is(.cities,.months,.pills,.meet-options,.distance-options) button.on:after{position:absolute;right:3px;bottom:3px;width:4px;height:4px;border-radius:50%;background:#f0637c;content:''}
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
.home-results>.empty{margin:0 16px;padding:36px 22px;border:0;border-radius:15px;background:#fff;color:#9c8593;font-size:13px;line-height:1.8}
.home-results>.load-error{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 16px 14px;padding:12px 16px;border:1px solid #f0dce3;border-radius:14px;background:#fff7f9;font-size:13px;line-height:1.7}
.home-results>.load-error button{flex:none;min-width:44px;min-height:44px;color:#e62b4b}
@media(max-width:350px){.race-meet-categories{gap:11px}.filter-hint{font-size:12px}.home-filters .filter-bar>button{gap:4px;padding-right:5px;padding-left:5px;font-size:12px}.home-filter-sheet .status-sheet{padding-right:16px;padding-left:16px}.home-filter-sheet .loc,.home-filter-sheet .selection-layout{grid-template-columns:82px minmax(0,1fr)}.city-content,.month-content{padding-right:12px;padding-left:12px}}
@media (max-width: 350px) {
 .home-discover { grid-template-columns: 1fr 1fr; }
 .discover-side > a { padding:8px; }.discover-side strong { font-size:14px; }.discover-side img { width:28px;height:28px; }
 .discover-photo-copy { padding: 12px 10px; }
 .discover-photo-copy strong { font-size: 17px; }
 .discover-calendar > img { width:40px;height:40px; }
}
.discover-photo-copy { padding:14px; min-width:0; }
.discover-photo-copy strong { font-size:18px; }
.discover-photo-copy small { margin-top:8px; font-variant-numeric:tabular-nums; }
.discover-photo-copy p { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; margin:8px 0 0; font-size:12px; line-height:1.6; color:var(--muted); }


</style>
