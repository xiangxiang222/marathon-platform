<template>
  <router-link class="race-card" :class="'tone-' + toneOf(race)" :to="'/races/' + race.id">
    <div class="date" aria-hidden="true">
      <span>{{ parts.month }}月</span>
      <b>{{ parts.day }}</b>
    </div>
    <div class="body">
      <strong>{{ race.name }}</strong>
      <p class="meta">{{ race.city }}<template v-if="projectText"> · {{ projectText }}</template></p>
      <div class="race-card-foot">
        <i class="race-state" :class="{ active: race.open || toneOf(race) === 'live' }">{{ race.regStatus }}</i>
        <span v-if="race.deadlineLabel !== race.regStatus" class="deadline" :class="{ urgent: race.open && race.daysLeft <= 7 }">{{ race.deadlineLabel }}</span>
      </div>
    </div>
    <span class="race-chevron" aria-hidden="true">›</span>
  </router-link>
</template>

<script setup>
import { computed } from "vue";
import { dateParts, toneOf } from "../tone";

const props = defineProps({
  race: { type: Object, required: true }
});

const parts = computed(() => dateParts(props.race.raceDate));
const projectText = computed(() => {
  const distances = props.race.distanceLabels || [];
  const kinds = [...(props.race.kindLabels || [])];
  if (props.race.kind === "trail" && !kinds.includes("越野")) kinds.unshift("越野");
  if (distances.length && kinds.length) return distances.join(" / ") + " · " + kinds.join(" / ");
  if (distances.length) return distances.join(" / ");
  return kinds.join(" / ");
});
</script>

<style scoped>
.race-card { position: relative; align-items: center; gap: 12px; min-height: 96px; padding: 12px; border-radius: 12px; background: #fff; }
.race-card .date { display: flex; flex-direction: column; justify-content: center; align-items: center; width: 50px; height: 58px; flex: none; border-radius: 8px; background: #f5f6f8; color: var(--accent); }
.race-card .date span { color: #777b85; font-size: 11px; font-weight: 400; line-height: 16px; }
.race-card .date b { margin-top: 2px; font-size: 26px; font-weight: 700; line-height: 1; }
.race-card .body { flex: 1; min-width: 0; }
.race-card strong { font-size: 16px; line-height: 1.4; font-weight: 600; letter-spacing: 0; }
.race-card .meta { display: block; overflow: hidden; margin: 4px 0 0; font-size: 12px; line-height: 18px; font-weight: 400; color: var(--muted); white-space: nowrap; text-overflow: ellipsis; }
.race-card-foot { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; margin-top: 5px; min-height: 18px; }
.race-state { flex: none; padding: 1px 5px; border-radius: 4px; color: #777b85; background: #f3f4f7; font-size: 11px; font-style: normal; line-height: 16px; font-weight: 400; }
.race-state.active { color: var(--accent); background: var(--accent-soft); }
.deadline { overflow: hidden; color: var(--muted); font-size: 11px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.deadline.urgent { color: var(--accent); }
.race-chevron { flex: none; margin-left: -6px; color: #c3c6ce; font-size: 22px; line-height: 1; }
@media (max-width: 350px) { .race-card { gap: 10px; } .race-card strong { font-size: 15px; } .race-card .date { width: 46px; } }
</style>
