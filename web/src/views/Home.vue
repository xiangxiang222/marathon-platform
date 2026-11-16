<template>
  <main class="home-page">
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
          <button type="button" class="filter-more" :class="{ on: advancedCount }" aria-label="更多筛选" @click="openSheet('status')"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14"/><circle cx="7" cy="5" r="2"/><circle cx="13" cy="10" r="2"/><circle cx="8" cy="15" r="2"/></svg><span>筛选</span><b v-if="advancedCount">{{ advancedCount }}</b></button>
        </div>
        <div class="filter-bar">
          <button type="button" :class="{ on: city }" :title="city || '比赛地点'" aria-label="比赛地点" @click="openSheet('city')"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13 6c0 3.5-5 8-5 8S3 9.5 3 6a5 5 0 1 1 10 0Z"/><circle cx="8" cy="6" r="1.5"/></svg><span>{{ city || '地点' }}</span><i></i></button>
          <button type="button" :class="{ on: month }" :title="monthLabel || '比赛时间'" aria-label="比赛时间" @click="openSheet('time')"><span>{{ month ? Number(month.slice(5)) + '月' : '时间' }}</span><i></i></button>
          <button type="button" :class="{ on: full }" :aria-pressed="full" aria-label="马拉松" @click="toggleDist('full')">全马</button>
          <button type="button" :class="{ on: half }" :aria-pressed="half" aria-label="半程马拉松" @click="toggleDist('half')">半马</button>
        </div>
      </div>
      <div v-if="!searching && activeFilters.length" class="active-filters"><span>{{ activeFilters.join(' · ') }}</span><button type="button" @click="resetFilters">清空筛选<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m5 5 6 6m0-6-6 6"/></svg></button></div>
      <div v-if="loadError" class="load-error" role="alert"><span>{{ loadError }}</span><button type="button" @click="load">重试</button></div>
      <p v-else-if="loading" class="results-loading" role="status">正在更新赛事…</p>
      <dialog v-if="sheet" ref="sheetDialog" class="drop home-filter-sheet" aria-labelledby="home-filter-title" @cancel.prevent="sheet = ''" @click="closeBackdrop">
        <div class="filter-sheet-heading"><div><span>查找赛事</span><h3 id="home-filter-title">{{ sheet === 'city' ? '比赛地点' : sheet === 'time' ? '比赛时间' : '更多筛选' }}</h3></div><button type="button" aria-label="关闭筛选" @click="sheet = ''"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></div>
        <div v-if="sheet === 'city'" class="loc">
          <div class="prov">
            <button v-for="item in places" :key="item.name" type="button" :class="{ on: province === item.name }" @click="province = item.name">
              {{ item.name }}
            </button>
          </div>
          <div class="cities">
            <button v-for="name in cityNames" :key="name" type="button" :class="{ on: city === name }" @click="pickCity(name)">{{ name }}</button>
          </div>
        </div>
        <div v-else-if="sheet === 'time'" class="time">
          <button type="button" class="chip" :class="{ on: !month }" @click="clearMonth">不限</button>
          <section v-for="year in years" :key="year">
            <h4>{{ year }}年</h4>
            <div class="months">
              <button v-for="m in 12" :key="year + '-' + m" type="button" :class="{ on: month === ym(year, m) }" @click="pickMonth(year, m)">{{ m }}月</button>
            </div>
          </section>
        </div>
        <div v-else class="status-sheet">
          <h4>赛事形式</h4>
          <nav class="meet-options" aria-label="赛事形式"><button v-for="item in meetKinds" :key="item.kind" type="button" :class="{ on: draftMeetKind === item.kind }" :aria-pressed="draftMeetKind === item.kind" @click="draftMeetKind = item.kind">{{ item.short }}</button></nav>
          <h4>赛事状态</h4>
          <div class="pills">
            <button v-for="item in statusOptions" :key="item.value" type="button" :class="{ on: draftStatus === item.value }" :aria-pressed="draftStatus === item.value" @click="draftStatus = item.value">
              {{ item.label }}
            </button>
          </div>
          <div class="actions">
            <button type="button" class="ghost" @click="resetDraft">重置</button>
            <button type="button" class="ok" @click="confirmStatus">确认</button>
          </div>
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
const draftStatus = ref("upcoming");
const sheet = ref("");
const sheetDialog = ref(null);
const draftMeetKind = ref("");
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
const province = ref("河北");
const currentYear = new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear();
const years = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

const places = [
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
  { label: "即将开赛", value: "upcoming" },
  { label: "报名中", value: "open" },
  { label: "待开赛", value: "wait" },
  { label: "比赛中", value: "live" },
  { label: "比赛结束", value: "closed" },
  { label: "报名未公布", value: "unannounced" }
];

const advancedCount = computed(() => Number(!!meetKind.value) + Number(status.value !== 'upcoming'));
const statusLabel = computed(() => statusOptions.find(item => item.value === status.value)?.label || '全部状态');
const activeFilters = computed(() => [
  city.value, monthLabel.value,
  full.value && '全马', half.value && '半马',
  trackKinds.find(item => item.kind && item.kind === trackKind.value)?.short,
  meetKinds.find(item => item.kind && item.kind === meetKind.value)?.short,
  status.value !== 'upcoming' && statusOptions.find(item => item.value === status.value)?.label
].filter(Boolean));

const cityNames = computed(() => places.find((item) => item.name === province.value)?.cities || []);
const monthLabel = computed(() => (month.value ? month.value.replace("-", "年") + "月" : ""));

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

async function load() {
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
    if (seq === loadSeq) loading.value = false;
  }
}

function setTrackKind(next) {
  trackKind.value = next;
  sheet.value = "";
  page.value = 1;
  load();
}

function toggleDist(which) {
  if (which === "full") { full.value = !full.value; half.value = false; }
  if (which === "half") { half.value = !half.value; full.value = false; }
  if (full.value || half.value) ten.value = false;
  page.value = 1;
  load();
}

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
  if (sheet.value && sheetDialog.value && !sheetDialog.value.open) sheetDialog.value.showModal();
});
onUnmounted(() => { if (filterBodyOverflow !== undefined) document.body.style.overflow = filterBodyOverflow; });
function closeBackdrop(event) {
  if (event.target !== sheetDialog.value) return;
  const box = sheetDialog.value.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) sheet.value = '';
}

function openSheet(name) {
  sheet.value = sheet.value === name ? "" : name;
  if (name === "status") { draftStatus.value = status.value; draftMeetKind.value = meetKind.value; }
  if (name === "city" && city.value) {
    const found = places.find((item) => item.cities.includes(city.value));
    if (found) province.value = found.name;
  }
}

function pickCity(name) {
  city.value = city.value === name ? "" : name;
  sheet.value = "";
  page.value = 1;
  load();
}

function pickMonth(year, m) {
  const value = ym(year, m);
  month.value = month.value === value ? "" : value;
  sheet.value = "";
  page.value = 1;
  load();
}

function clearMonth() {
  month.value = "";
  sheet.value = "";
  page.value = 1;
  load();
}

function resetDraft() { draftStatus.value = 'upcoming'; draftMeetKind.value = ''; }
function resetFilters() {
  city.value = ''; month.value = ''; full.value = false; half.value = false; ten.value = false;
  trackKind.value = ''; meetKind.value = ''; status.value = 'upcoming'; page.value = 1;
  sheet.value = ''; load();
}
function confirmStatus() {
  status.value = draftStatus.value;
  meetKind.value = draftMeetKind.value;
  sheet.value = "";
  page.value = 1;
  load();
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
.results-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:24px 18px 14px}
.results-heading h2{margin:0;font-size:20px;font-weight:650;line-height:1.5;letter-spacing:-.3px}
.results-heading>span{padding:4px 9px;border-radius:7px;background:#fff;color:#857781;font-size:12px;font-variant-numeric:tabular-nums}
.home-filters{position:sticky;top:0;z-index:8;margin:0 16px 14px;padding:5px 11px 11px;border:1px solid #ebe7e7;border-radius:15px;background:#fff;box-shadow:0 5px 18px #573b4004}
.filter-navigation{display:flex;align-items:center;gap:10px;min-height:53px;margin-bottom:7px;border-bottom:1px solid #f2eeee}
.race-meet-categories{display:flex;flex:1;min-width:0;gap:2px}
.race-meet-categories button{position:relative;flex:1;min-width:0;min-height:44px;padding:7px 1px;color:#8b7e86;font-size:13px;line-height:1.5;white-space:nowrap}
.race-meet-categories button.on{color:#e92546;font-weight:650}
.race-meet-categories button.on:after{position:absolute;bottom:0;left:50%;width:19px;height:3px;border-radius:3px;background:#ff1838;transform:translateX(-50%);content:''}
.filter-more{display:flex;align-items:center;justify-content:center;flex:none;gap:5px;min-width:59px;min-height:44px;padding:7px 0 7px 8px;color:#756b74;font-size:12px;line-height:1.5}
.filter-more>svg{width:17px;height:17px;stroke:currentColor;stroke-width:1.35;stroke-linecap:round}
.filter-more>svg circle{fill:#fff}
.filter-more.on{color:#e92546}
.filter-more>b{display:grid;place-items:center;min-width:16px;height:16px;padding:0 3px;border-radius:5px;background:#ff1838;color:#fff;font-size:12px;font-weight:500;line-height:1}
.home-filters .filter-bar{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding:0;overflow:visible;background:transparent}
.home-filters .filter-bar>button{display:flex;align-items:center;justify-content:center;gap:5px;min-width:0;min-height:44px;height:auto;padding:7px 6px;border:1px solid #f1eeee;border-radius:9px;background:#f7f6f5;color:#776c75;font-size:12px;font-weight:400;line-height:1.5;white-space:nowrap}
.home-filters .filter-bar>button>span{overflow:hidden;text-overflow:ellipsis}
.home-filters .filter-bar>button>svg{flex:none;width:14px;height:14px;stroke:#ae9ea6;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}
.home-filters .filter-bar>button.on{border-color:#ffd9e1;background:#fff2f5;color:#df3452}
.home-filters i{flex:none;width:5px;height:5px;margin-top:-3px;border-right:1px solid currentColor;border-bottom:1px solid currentColor;transform:rotate(45deg);opacity:.65}
.active-filters{display:flex;align-items:center;gap:8px;margin:-7px 18px 7px;color:#aa7b87;font-size:12px;line-height:1.6}
.active-filters>span{flex:1;min-width:0;overflow-wrap:anywhere}
.active-filters>button{display:flex;align-items:center;gap:3px;flex:none;min-height:44px;color:#94848c;font-size:12px}
.active-filters svg{width:15px;height:15px;stroke:currentColor;stroke-width:1.3;stroke-linecap:round}
.home-page dialog.drop.home-filter-sheet[open]{position:fixed;inset:auto 0 0;width:min(430px,100%);max-width:none;max-height:85vh;margin:0 auto;padding:0 0 env(safe-area-inset-bottom,0px);border:0;border-radius:23px 23px 0 0;transform:none;background:#fff;color:#443b43;overscroll-behavior:contain}
.home-filter-sheet::backdrop{background:#24151d70;backdrop-filter:blur(3px)}
.filter-sheet-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 20px 17px;border-bottom:1px solid #f2eeee}
.filter-sheet-heading h3{margin:3px 0 0;color:#3f343e;font-size:20px;font-weight:650;line-height:1.5}
.filter-sheet-heading>div>span{color:#b498a2;font-size:12px;line-height:1.5}
.filter-sheet-heading>button{display:grid;place-items:center;flex:none;width:44px;height:44px;border-radius:50%;background:#f7f5f5;color:#a18b96}
.filter-sheet-heading svg{width:19px;height:19px;stroke:currentColor;stroke-width:1.35;stroke-linecap:round}
.home-filter-sheet .loc{height:380px;max-height:calc(85vh - 105px);min-height:200px}
.home-filter-sheet .prov{width:100px;background:#faf8f8}
.home-filter-sheet .prov button{min-height:48px;padding:10px 15px;color:#8a7c86;font-size:13px;line-height:1.5}
.home-filter-sheet .prov button.on{position:relative;background:#fff;color:#e72c4b;font-weight:600}
.home-filter-sheet .prov button.on:before{position:absolute;top:16px;bottom:16px;left:0;width:3px;border-radius:2px;background:#ff1838;content:''}
.home-filter-sheet .cities{gap:8px;padding:14px;align-content:flex-start}
.home-filter-sheet .cities button{flex:1 0 calc(50% - 8px);min-width:44px;min-height:44px;padding:8px 6px}
.home-filter-sheet .time{padding:18px 20px 24px;max-height:calc(85vh - 108px);overflow-y:auto}
.home-filter-sheet .time h4{margin:21px 0 11px;color:#6f5b67;font-size:14px;font-weight:600}
.home-filter-sheet .months{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.home-filter-sheet .months button,.home-filter-sheet .time>.chip{min-height:44px;padding:8px 6px}
.home-filter-sheet :is(.cities,.months,.pills,.meet-options) button,.home-filter-sheet .time>.chip{border:1px solid #f0eaea;border-radius:9px;background:#f8f6f6;color:#8c7a86;font-size:13px;line-height:1.5}
.home-filter-sheet :is(.cities,.months,.pills,.meet-options) button.on,.home-filter-sheet .time>.chip.on{border-color:#ffc9d5;background:#fff0f4;color:#e72b4d;font-weight:500}
.home-filter-sheet .status-sheet{padding:0 20px 22px}
.status-sheet h4{margin:22px 0 12px;color:#8d7886;font-size:13px;font-weight:500}
.meet-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.meet-options button{min-width:0;min-height:44px;padding:9px 4px}
.home-filter-sheet .pills{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.home-filter-sheet .pills button{min-width:0;min-height:44px;padding:9px 3px;font-size:12px}
.home-filter-sheet .actions{gap:10px;margin-top:25px}
.home-filter-sheet .actions button{height:46px;border-radius:11px;font-size:14px;font-weight:500}
.home-filter-sheet .actions .ghost{background:#f6f3f4;color:#99818e}
.home-filter-sheet .actions .ok{background:#ff1838;color:#fff}
.results-loading{margin:0 18px 12px;color:#a58d99;font-size:12px;line-height:1.7}
.home-race-list{gap:12px;padding:0 16px 16px}
.home-results>.empty{margin:0 16px;padding:36px 22px;border:1px solid #eee7e9;border-radius:15px;background:#fff;color:#9c8593;font-size:13px;line-height:1.8}
.home-results>.load-error{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 16px 14px;padding:12px 16px;border:1px solid #f0dce3;border-radius:14px;background:#fff7f9;font-size:13px;line-height:1.7}
.home-results>.load-error button{flex:none;min-width:44px;min-height:44px;color:#e62b4b}
@media(max-width:350px){.home-filters{padding-right:9px;padding-left:9px}.filter-navigation{gap:5px}.race-meet-categories button{font-size:12px}.home-filters .filter-bar>button>svg{display:none}.home-filter-sheet .status-sheet{padding-right:16px;padding-left:16px}}
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
