<template>
  <router-link class="race-card" :class="'tone-' + toneOf(race)" :to="'/races/' + race.id">
    <div class="date">
      <span>{{ parts.month }}月</span>
      <b>{{ parts.day }}</b>
    </div>
    <div class="body">
      <strong>{{ race.name }}</strong>
      <p class="meta">
        <i class="pill">{{ race.regStatus }}</i>{{ race.city }}<template v-if="race.distanceLabels && race.distanceLabels.length"> · {{ race.distanceLabels.join(" / ") }}</template>
      </p>
      <p v-if="race.deadlineLabel !== race.regStatus" class="when" :class="{ soon: race.open && race.daysLeft <= 7 }">{{ race.deadlineLabel }}</p>
    </div>
  </router-link>
</template>

<script setup>
import { computed } from "vue";
import { dateParts, toneOf } from "../tone";

const props = defineProps({
  race: { type: Object, required: true }
});

const parts = computed(() => dateParts(props.race.raceDate));
</script>
