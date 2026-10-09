<template>
  <div class="page-title">看看</div>
  <div v-if="races.length" class="look-list">
    <router-link v-for="race in races" :key="race.id" class="look-card" :to="'/races/' + race.id">
      <Poster :id="race.id" />
      <h2><em>{{ race.regStatus }} </em>{{ race.name }}</h2>
      <div class="tags"><span v-for="tag in race.distanceLabels" :key="tag">{{ tag }}</span><span>{{ race.city }}</span></div>
      <div class="foot">
        <span>{{ race.raceDate }}</span>
        <span :class="{ soon: race.open && race.daysLeft <= 7 }">{{ race.deadlineLabel }}</span>
      </div>
    </router-link>
  </div>
  <p v-else class="empty">还没有可看的赛历</p>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { api } from "../api";
import Poster from "../components/Poster.vue";

const races = ref([]);

onMounted(async () => {
  const data = await api("/races?status=open");
  races.value = data.races;
});
</script>

<style scoped>
.look-card :deep(.poster) { height: 168px; border-radius: 8px; }
.look-card em { color: #00b7ae; font-style: normal; font-weight: 650; }
</style>
