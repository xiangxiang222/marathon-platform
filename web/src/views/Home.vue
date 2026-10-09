<template>
  <div>
    <header class="page-head">
      <h1>赛历</h1>
      <p>报名还开着的场，和明天要处理的节点。</p>
    </header>

    <section v-if="tasks.length" class="block">
      <h2>要处理</h2>
      <router-link v-for="task in tasks" :key="task.id" class="remind" :to="task.clubId ? '/clubs/' + task.clubId : '/races/' + task.raceId">
        <b>{{ task.title }}</b>
        <span>{{ task.body }}</span>
      </router-link>
    </section>
    <section v-else-if="signedIn" class="block">
      <h2>要处理</h2>
      <p class="help">你标过的场这几天没有节点，团里也没有人卡在缴费。</p>
    </section>
    <section v-else-if="reminders.length" class="block">
      <h2>{{ reminderTitle }}</h2>
      <router-link v-for="item in reminders" :key="item.race.id + item.hit.key" class="remind" :to="'/races/' + item.race.id">
        <b>{{ item.hit.reason }}</b>
        <span>{{ item.race.name }}</span>
      </router-link>
    </section>

    <form class="search" @submit.prevent="load">
      <label class="sr" for="race-q">搜索</label>
      <input id="race-q" v-model="q" placeholder="赛事名称或城市" />
      <button type="submit">搜索</button>
    </form>

    <div class="filters" role="group" aria-label="报名状态">
      <button v-for="item in statusOptions" :key="item.value" type="button" :class="{ on: status === item.value }" @click="setStatus(item.value)">
        {{ item.label }}
      </button>
    </div>
    <div class="filters" role="group" aria-label="项目">
      <button v-for="item in distanceOptions" :key="item.value || 'all'" type="button" :class="{ on: distance === item.value }" @click="setDistance(item.value)">
        {{ item.label }}
      </button>
    </div>
    <div class="filters" role="group" aria-label="地点和月份">
      <button type="button" :class="{ on: !!city || sheet === 'city' }" @click="toggleSheet('city')">{{ city || "地点" }}</button>
      <button type="button" :class="{ on: !!month || sheet === 'month' }" @click="toggleSheet('month')">{{ monthLabel || "月份" }}</button>
    </div>
    <div v-if="sheet === 'city'" class="sheet-inline">
      <button type="button" :class="{ on: !city }" @click="pickCity('')">不限</button>
      <button v-for="name in cities" :key="name" type="button" :class="{ on: city === name }" @click="pickCity(name)">{{ name }}</button>
      <p v-if="!cities.length" class="help">还没有地点。</p>
    </div>
    <div v-if="sheet === 'month'" class="sheet-inline">
      <button type="button" :class="{ on: !month }" @click="pickMonth('')">不限</button>
      <button v-for="item in months" :key="item" type="button" :class="{ on: month === item }" @click="pickMonth(item)">{{ monthText(item) }}</button>
      <p v-if="!months.length" class="help">还没有月份。</p>
    </div>

    <p v-if="loading" class="state">正在读取赛历</p>
    <div v-else-if="error" class="state">
      <p class="err">{{ error }}</p>
      <button class="text-btn" type="button" @click="load">重试</button>
    </div>
    <div v-else-if="!races.length" class="state">
      <p>这个范围没有赛历。换个状态、地点或月份，或按比赛日查看。</p>
    </div>
    <ul v-else class="list">
      <li v-for="race in races" :key="race.id">
        <router-link class="race-row" :to="'/races/' + race.id">
          <div>
            <p class="name"><em>{{ race.regStatus }}</em>{{ race.name }}</p>
            <p class="meta">{{ race.raceDate }} · {{ race.city }}<template v-if="race.distanceLabels.length"> · {{ race.distanceLabels.join(" / ") }}</template></p>
          </div>
          <span class="trail" :class="{ soon: race.open && race.daysLeft <= 3 }">{{ race.deadlineLabel }}</span>
        </router-link>
      </li>
    </ul>
    <router-link class="text-link" to="/calendar">按比赛日查看</router-link>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";

const route = useRoute();
const q = ref("");
const city = ref("");
const month = ref("");
const distance = ref("");
const status = ref("open");
const sheet = ref("");
const races = ref([]);
const cities = ref([]);
const months = ref([]);
const reminders = ref([]);
const reminderTitle = ref("明天的节点");
const tasks = ref([]);
const signedIn = ref(false);
const loading = ref(true);
const error = ref("");

const statusOptions = [
  { label: "报名中", value: "open" },
  { label: "即将开赛", value: "upcoming" },
  { label: "待开赛", value: "wait" },
  { label: "已结束", value: "closed" },
  { label: "全部", value: "all" }
];
const distanceOptions = [
  { label: "全部项目", value: "" },
  { label: "马拉松", value: "full" },
  { label: "半程", value: "half" },
  { label: "10公里", value: "10k" }
];
const allowedStatus = new Set(statusOptions.map((item) => item.value));
const monthLabel = computed(() => (month.value ? monthText(month.value) : ""));

function monthText(value) {
  const [year, m] = String(value).split("-");
  return year + "年" + Number(m) + "月";
}

async function load() {
  loading.value = true;
  error.value = "";
  sheet.value = "";
  try {
    const params = new URLSearchParams();
    if (q.value.trim()) params.set("q", q.value.trim());
    if (city.value) params.set("city", city.value);
    if (month.value) params.set("month", month.value);
    if (distance.value) params.set("distance", distance.value);
    params.set("status", status.value || "all");
    const data = await api("/races?" + params.toString());
    races.value = data.races || [];
    cities.value = data.cities || [];
    months.value = data.months || [];
  } catch (err) {
    error.value = err.message || "赛历没有读出来";
  } finally {
    loading.value = false;
  }
}

async function loadReminders() {
  try {
    const today = await api("/today");
    signedIn.value = !!today.user;
    tasks.value = today.tasks || [];
    if (today.user) {
      reminders.value = [];
      return;
    }
  } catch (err) {
    tasks.value = [];
    signedIn.value = !!localStorage.getItem("marathon_token");
  }
  try {
    const data = await api("/reminders");
    reminders.value = (data.reminders || []).slice(0, 3);
    reminderTitle.value = "明天的节点";
  } catch (err) {
    reminders.value = [];
  }
}

function setStatus(value) {
  status.value = value;
  load();
}

function setDistance(value) {
  distance.value = value;
  load();
}

function toggleSheet(name) {
  sheet.value = sheet.value === name ? "" : name;
}

function pickCity(name) {
  city.value = name;
  load();
}

function pickMonth(value) {
  month.value = value;
  load();
}

onMounted(() => {
  const queryStatus = route.query.status;
  if (typeof queryStatus === "string" && allowedStatus.has(queryStatus)) status.value = queryStatus;
  load();
  loadReminders();
});
</script>
