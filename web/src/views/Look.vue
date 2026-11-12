<template>
  <main class="look-page">
  <header class="large">
    <div>
      <h1>看看</h1>
      <p>正在报名的场次</p>
    </div>
  </header>
  <p v-if="ready" class="hint">共 {{ total }} 场</p>
  <div v-if="loadError" class="load-error" role="alert"><span>{{ loadError }}</span><button type="button" @click="load">重试</button></div>
  <p v-else-if="!ready" class="empty">正在加载赛历…</p>
  <div v-if="races.length" class="stack">
    <RaceCard v-for="race in races" :key="race.id" :race="race" />
  </div>
  <p v-else-if="ready && !loadError" class="empty">还没有可看的赛历</p>
  <Pager v-if="ready && !loadError" :page="page" :pages="pages" @update:page="turnPage" />
  </main>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { api } from "../api";
import RaceCard from "../components/RaceCard.vue";
import Pager from "../components/Pager.vue";

const races = ref([]);
const page = ref(1);
const pages = ref(1);
const total = ref(0);
const ready = ref(false);
const loadError = ref("");
let loadSeq = 0;

async function load() {
  const seq = ++loadSeq;
  ready.value = false;
  loadError.value = "";
  try {
    const data = await api("/races?status=open&page=" + page.value);
    if (seq !== loadSeq) return;
    races.value = data.races || [];
    total.value = data.total || 0;
    pages.value = data.pages || 1;
    page.value = data.page || 1;
    ready.value = true;
  } catch (err) {
    if (seq !== loadSeq) return;
    loadError.value = err.message || "赛事加载失败";
    ready.value = true;
  }
}

function turnPage(next) {
  page.value = next;
  return load();
}

onMounted(load);
</script>

<style scoped>
.look-page { padding-bottom:24px; }
.look-page .large { padding:26px 18px 8px; }
.look-page .large h1 { font-size:24px; }
.look-page > .hint { margin:8px 18px 18px; font-size:12px; color:var(--muted); }
.look-page .stack { gap:12px; }
.look-page .load-error { margin:16px; }
.look-page .load-error button { color:var(--accent); margin-left:12px; min-height:36px; }


.look-page { background:transparent; }.large { background:var(--card);border-bottom:1px solid var(--line); }.large h1 { color:var(--muted); }.stack :deep(.race-card) { box-shadow:none; }
</style>

<style scoped src="../personal-ui.css"></style>
