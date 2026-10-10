<template>
  <header class="large">
    <div>
      <h1>看看</h1>
      <p>正在报名的场次</p>
    </div>
  </header>
  <div v-if="races.length" class="stack">
    <RaceCard v-for="race in races" :key="race.id" :race="race" />
  </div>
  <p v-else class="empty">还没有可看的赛历</p>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { api } from "../api";
import RaceCard from "../components/RaceCard.vue";

const races = ref([]);

onMounted(async () => {
  const data = await api("/races?status=open");
  races.value = data.races;
});
</script>
