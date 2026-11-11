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
.race-card { position: relative; align-items: center; gap: 14px; min-height: 112px; padding: 16px 14px; border-radius: var(--radius-card); background: #fff; border: 1px solid #edf0f3; box-shadow: var(--card-shadow); }
.race-card .date { display: flex; flex-direction: column; justify-content: center; align-items: center; width: 52px; height: 66px; flex: none; border-radius: 12px; background: var(--tone-soft, var(--peach-soft)); color: var(--tone, var(--accent)); }
.race-card .date span { color: var(--tone, var(--muted)); font-size: 12px; font-weight: 400; line-height: 16px; }
.race-card .date b { margin-top: 3px; font-size: 29px; font-weight: 700; line-height: 1; }
.race-card .body { flex: 1; min-width: 0; }
.race-card strong { font-size: 16px; line-height: 1.4; font-weight: 600; letter-spacing: 0; }
.race-card .meta { display: block; overflow: hidden; margin: 6px 0 0; font-size: 12px; line-height: 19px; font-weight: 400; color: var(--muted); white-space: nowrap; text-overflow: ellipsis; }
.race-card-foot { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; margin-top: 5px; min-height: 18px; }
.race-state { flex: none; padding: 2px 7px; border-radius: 6px; color: var(--tone, #666); background: var(--tone-soft, var(--bg)); font-size: 12px; font-style: normal; line-height: 17px; font-weight: 500; }
.race-state.active { color: var(--accent); background: var(--accent-soft); }
.deadline { overflow: hidden; color: var(--muted); font-size: 12px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.deadline.urgent { color: var(--accent); }
.race-chevron { flex: none; margin-left: -6px; color: var(--muted); font-size: 22px; line-height: 1; }
@media (max-width: 350px) { .race-card { gap: 10px; } .race-card strong { font-size: 15px; } .race-card .date { width: 46px; } }
</style>
