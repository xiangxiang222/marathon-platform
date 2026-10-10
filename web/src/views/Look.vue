<template>
  <div class="page-head"><h1>看看</h1></div>
  <div v-if="races.length" class="grid">
    <router-link v-for="race in races" :key="race.id" class="card" :to="'/races/' + race.id">
      <Poster :id="race.id" :name="race.name" :city="race.city" :date="race.raceDate" />
      <div class="copy">
        <p><em>{{ race.regStatus }}</em>{{ race.name }}</p>
        <div class="tags">
          <span v-for="tag in race.distanceLabels" :key="tag">{{ tag }}</span>
          <span v-if="!race.distanceLabels.length">{{ race.city }}</span>
        </div>
        <div class="foot">
          <span class="cal">{{ race.raceDate }}</span>
          <span :class="{ soon: race.open && race.daysLeft <= 7 }">{{ race.deadlineLabel }}</span>
        </div>
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

