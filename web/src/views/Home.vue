<template>
  <main class="home-page">
    <section class="home-top">
      <header class="home-heading">
        <h1>赛历</h1>
        <span>{{ todayLabel }}</span>
      </header>
      <form class="home-search" role="search" @submit.prevent="submitSearch">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 4.5 4.5" /></svg>
        <input v-model="q" aria-label="搜索赛事名称或城市" placeholder="搜索赛事名称 / 城市" @input="queueSearch" />
        <button type="submit">搜索</button>
      </form>
      <nav v-if="!searching" class="race-categories" aria-label="赛事类型">
        <button v-for="item in trackKinds" :key="item.kind" type="button" :class="{ on: trackKind === item.kind }" :aria-pressed="trackKind === item.kind" @click="setTrackKind(item.kind)">{{ item.short }}</button>
      </nav>
      <nav v-if="!searching" class="home-shortcuts" aria-label="常用功能">
        <router-link v-for="item in quickLinks" :key="item.to" :to="item.to">
          <img :src="item.icon" alt="" />
          <span>{{ item.label }}</span>
        </router-link>
      </nav>
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
      <div class="results-heading"><h2>{{ searching ? '搜索结果' : '全部赛事' }}</h2><span>共 {{ total }} 场</span></div>
      <div v-if="!searching" class="race-format-filter">
        <span class="format-label">赛事形式</span>
        <nav class="race-meet-categories" aria-label="赛事形式">
          <button v-for="item in meetKinds" :key="item.kind" type="button" :class="{ on: meetKind === item.kind }" :aria-pressed="meetKind === item.kind" @click="setMeetKind(item.kind)">{{ item.short }}</button>
        </nav>
      </div>
      <div v-if="loadError" class="load-error" role="alert"><span>{{ loadError }}</span><button type="button" @click="load">重试</button></div>
      <p v-else-if="loading" class="empty">正在加载赛历…</p>
      <div v-if="!searching" class="filter-wrap home-filters" :class="{ open: sheet }">
        <div class="filter-bar" ref="barEl">
          <button type="button" :class="{ on: city }" @click="openSheet('city')">{{ city || "比赛地点" }}<i></i></button>
          <button type="button" :class="{ on: month }" @click="openSheet('time')">{{ monthLabel || "比赛时间" }}<i></i></button>
          <button type="button" :class="{ on: full }" @click="toggleDist('full')">马拉松</button>
          <button type="button" :class="{ on: half }" @click="toggleDist('half')">半程马拉松</button>
          <button type="button" :class="{ on: sheet === 'status' }" @click="openSheet('status')">筛选<i></i></button>
        </div>
      </div>
    <div v-if="sheet" class="dim" @click="sheet = ''"></div>
    <div v-if="sheet" class="drop" :style="{ top: dropTop + 'px', maxHeight: 'calc(100vh - ' + dropTop + 'px - 12px)' }" @click.stop>
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
          <h3>赛事状态</h3>
          <div class="pills">
            <button v-for="item in statusOptions" :key="item.value" type="button" :class="{ on: draftStatus === item.value }" @click="draftStatus = item.value">
              {{ item.label }}
            </button>
          </div>
          <div class="actions">
            <button type="button" class="ghost" @click="draftStatus = 'upcoming'">重置</button>
            <button type="button" class="ok" @click="confirmStatus">确认</button>
          </div>
        </div>
      </div>

      <div v-if="!loading && !loadError && shownQuery === q.trim() && races.length" class="stack home-race-list">
        <RaceCard v-for="race in races" :key="race.id" :race="race" />
      </div>
      <p v-else-if="!loading && !loadError && shownQuery === q.trim()" class="empty">{{ searching ? '没有找到这场赛事' : '这个分类还没有赛历' }}</p>
      <Pager v-if="!loading && !loadError && shownQuery === q.trim()" :page="page" :pages="pages" @update:page="turnPage" />
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";
import RaceCard from "../components/RaceCard.vue";
import Pager from "../components/Pager.vue";
import calendarIcon from "../assets/quick/calendar.svg";
import radarIcon from "../assets/quick/radar.svg";
import clubsIcon from "../assets/quick/clubs.svg";
import newsIcon from "../assets/quick/news.svg";

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
const barEl = ref(null);
const dropTop = ref(180);
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
  { to: "/news", label: "赛事资讯", icon: newsIcon }
];
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
function setMeetKind(next) { meetKind.value = next; page.value = 1; load(); }

function toggleDist(which) {
  if (which === "full") full.value = !full.value;
  if (which === "half") half.value = !half.value;
  if (full.value || half.value) ten.value = false;
  page.value = 1;
  load();
}

function placeDrop() {
  nextTick(() => {
    if (barEl.value) dropTop.value = Math.round(barEl.value.getBoundingClientRect().bottom);
  });
}

function openSheet(name) {
  sheet.value = sheet.value === name ? "" : name;
  if (sheet.value) placeDrop();
  if (name === "status") draftStatus.value = status.value;
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

function confirmStatus() {
  status.value = draftStatus.value;
  sheet.value = "";
  page.value = 1;
  load();
}

onMounted(() => {
  if (trackKinds.some((item) => item.kind === route.query.kind)) trackKind.value = route.query.kind;
  load();
  api("/reminders").then((data) => {
    reminders.value = (data.reminders || []).slice(0, 3);
  }).catch(() => {});
});
</script>

<style scoped>
.home-page { padding-bottom: 12px; }
.home-top { background: linear-gradient(180deg, #fff1f3 0, #fff 75%); padding-bottom: 4px; }
.home-heading { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 16px 4px; }
.home-heading h1 { margin: 0; font-size: 26px; line-height: 1.2; font-weight: 700; letter-spacing: -.6px; }
.home-heading > span { color: #777b85; font-size: 12px; line-height: 1.3; }
.home-search { display: flex; align-items: center; height: 40px; margin: 4px 12px 3px; padding: 0 12px; border: 1px solid var(--accent); border-radius: 10px; background: #fff; }
.home-search > svg { width: 18px; height: 18px; flex: none; fill: none; stroke: #a3a6af; stroke-width: 1.6; stroke-linecap: round; }
.home-search input { width: 0; min-width: 0; flex: 1; height: 36px; margin-left: 8px; padding: 0; border: 0; border-radius: 0; background: transparent; font-size: 14px; font-weight: 400; outline: none; }
.home-search button { flex: none; padding-left: 12px; color: var(--accent); font-size: 15px; font-weight: 600; }
.race-categories { display: flex; align-items: stretch; gap: 24px; height: 56px; padding: 0 16px; }
.race-categories button { position: relative; flex: none; min-width: 0; color: #595d67; font-size: 18px; font-weight: 500; white-space: nowrap; }
.race-categories button.on { color: var(--accent); font-size: 20px; font-weight: 700; }
.race-categories button.on::after { position: absolute; bottom: 6px; left: calc(50% - 10px); width: 20px; height: 3px; background: var(--accent); content: ""; border-radius: 2px; }
.home-shortcuts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding: 12px 12px 16px; }
.home-shortcuts a { display: flex; min-width: 0; min-height: 58px; flex-direction: column; align-items: center; gap: 6px; color: #595d67; font-size: 12px; line-height: 20px; font-weight: 400; }
.home-shortcuts img { display: block; width: 32px; height: 32px; }
.deadline-banner { display: flex; align-items: center; gap: 10px; min-height: 52px; margin: 10px 12px 0; padding: 8px 10px; border-radius: 8px; background: #fff0f3; }
.deadline-icon { flex: none; width: 26px; height: 26px; color: var(--accent); }
.deadline-icon svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.deadline-copy { flex: 1; min-width: 0; line-height: 1.4; }
.deadline-copy > span { display: block; color: var(--accent); font-size: 11px; font-weight: 600; }
.deadline-copy strong { display: block; overflow: hidden; color: var(--ink); font-size: 13px; font-weight: 400; white-space: nowrap; text-overflow: ellipsis; }
.deadline-next { display: flex; align-items: center; flex: none; gap: 6px; min-height: 32px; color: var(--accent); }
.deadline-next small { font-size: 10px; font-weight: 400; opacity: .65; }
.deadline-next > span { font-size: 22px; line-height: 1; }
.results-heading { display: flex; align-items: center; justify-content: space-between; min-height: 46px; padding: 12px 14px 7px; }
.results-heading h2 { margin: 0; font-size: 18px; font-weight: 700; line-height: 1.5; }
.results-heading > span { color: var(--muted); font-size: 12px; }
.race-format-filter { display: flex; align-items: center; gap: 12px; margin: 0 12px 12px; }
.format-label { flex: none; color: var(--muted); font-size: 12px; line-height: 20px; }
.race-meet-categories { display: grid; flex: 1; grid-template-columns: repeat(3, minmax(0, 1fr)); max-width: 280px; padding: 3px; border-radius: 10px; background: #edeef2; }
.race-meet-categories button { min-width: 0; min-height: 36px; padding: 0 7px; border-radius: 7px; color: #777b85; font-size: 12px; line-height: 20px; font-weight: 400; white-space: nowrap; }
.race-meet-categories button.on { color: var(--ink); background: #fff; box-shadow: 0 1px 3px rgba(31,32,38,.06); font-weight: 600; }
.race-meet-categories button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.home-filters { top: 0; }
.home-filters .filter-bar { gap: 6px; padding: 0 12px 10px; }
.home-filters .filter-bar > button { display: flex; align-items: center; justify-content: center; gap: 7px; height: 30px; padding: 0 10px; border-radius: 6px; background: #fff; font-size: 12px; font-weight: 400; }
.home-filters .filter-bar > button.on { color: var(--accent); background: var(--accent-soft); }
.home-filters i { width: 5px; height: 5px; margin-top: -3px; border-right: 1px solid #777b85; border-bottom: 1px solid #777b85; transform: rotate(45deg); }
.home-race-list { gap: 8px; padding: 0 12px 8px; }
.home-race-list :deep(.race-card) { min-height: 96px; }
@media (max-width: 350px) {
  .home-heading { padding-left: 12px; gap: 8px; }
  .home-heading h1 { font-size: 24px; }
  .home-heading > span { font-size: 11px; }
  .race-categories { gap: 22px; padding-left: 12px; }
  .race-categories button { font-size: 17px; }
  .race-categories button.on { font-size: 19px; }
  .home-shortcuts a { font-size: 12px; }
  .race-format-filter { gap: 10px; }
  .race-meet-categories button { padding: 0 4px; }
}
</style>
