<template>
  <header class="large">
    <div>
      <h1>看看</h1>
      <p>正在报名的场次</p>
    </div>
  </header>
  <p v-if="ready" class="hint">共 {{ total }} 场</p>
  <div v-if="races.length" class="stack">
    <RaceCard v-for="race in races" :key="race.id" :race="race" />
  </div>
  <p v-else-if="ready" class="empty">还没有可看的赛历</p>
  <Pager :page="page" :pages="pages" @update:page="turnPage" />
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

async function load() {
  const data = await api("/races?status=open&page=" + page.value);
  races.value = data.races || [];
  total.value = data.total || 0;
  pages.value = data.pages || 1;
  page.value = data.page || 1;
  ready.value = true;
}

function turnPage(next) {
  page.value = next;
  return load();
}

onMounted(load);
</script>
