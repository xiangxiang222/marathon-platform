<template>
  <header class="topbar">
    <span></span>
    <h1>看看</h1>
    <span></span>
  </header>
  <div v-if="races.length" class="feed">
    <router-link v-for="race in races" :key="race.id" class="post" :to="'/races/' + race.id">
      <b>{{ race.name }}</b>
      <p><em>{{ race.regStatus }}</em>{{ race.city }}</p>
      <p>{{ race.raceDate }} · <span :class="{ soon: race.open && race.daysLeft <= 7 }">{{ race.deadlineLabel }}</span></p>
    </router-link>
  </div>
  <p v-else class="empty">还没有可看的赛历</p>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { api } from "../api";

const races = ref([]);

onMounted(async () => {
  const data = await api("/races?status=open");
  races.value = data.races;
});
</script>

