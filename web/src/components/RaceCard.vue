<template>
  <article class="race-card-shell">
  <router-link class="race-card" :class="'tone-' + toneOf(race)" :to="'/races/' + race.id">
    <div class="date" aria-hidden="true">
      <span>{{ parts.month }}月</span>
      <b>{{ parts.day }}</b>
    </div>
    <div class="body">
      <strong>{{ race.name }}</strong>
      <p class="meta">{{ race.city }}<template v-if="projectText"> · {{ projectText }}</template></p>
      <span v-if="race.myStatus" class="my-race-status">我的状态 · {{ race.myStatus }}</span>
      <div class="race-card-foot">
        <i class="race-state" :class="{ active: race.open || toneOf(race) === 'live' }">{{ race.regStatus }}</i>
        <span v-if="race.deadlineLabel !== race.regStatus" class="deadline" :class="{ urgent: race.open && race.daysLeft <= 7 }">{{ race.deadlineLabel }}</span>
      </div>
    </div>
    <span class="race-chevron" aria-hidden="true">›</span>
  </router-link>
  <FollowRaceButton class="card-follow" :race-id="race.id" :race-name="race.name" :following="!!race.following" @change="value => $emit('follow', value)" />
  </article>
</template>

<script setup>
import { computed } from "vue";
import { dateParts, toneOf } from "../tone";
import FollowRaceButton from './FollowRaceButton.vue';
defineEmits(['follow']);

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
.race-card-shell{position:relative;min-width:0}.race-card-shell .race-card{display:flex;padding-right:88px}.card-follow{position:absolute;right:10px;top:14px}.my-race-status{display:inline-block;margin-top:6px;color:#ff1838;font-size:12px;line-height:1.6}.race-chevron{display:none}
.race-card { position: relative; align-items: center; gap: 12px; min-height: 104px; padding: 14px 12px; border-radius: var(--radius-card); background: #fff; border: 0; box-shadow: var(--card-shadow); }
.race-card .date { position: relative; display: flex; overflow: hidden; flex-direction: column; justify-content: center; align-items: center; width: 58px; height: 70px; flex: none; border: 1px solid #f4e1e3; border-radius: 8px; background: var(--card); color: var(--ink); }
.race-card .date span { position: absolute; inset: 0 0 auto; background: var(--accent-soft); color: var(--accent); font-size: 12px; font-weight: 400; line-height: 23px; text-align: center; }
.race-card .date b { margin-top: 19px; font-size: 30px; font-weight: 600; line-height: 1; }
.race-card .body { flex: 1; min-width: 0; }
.race-card strong { font-size: 15px; line-height: 1.5; font-weight: 500; letter-spacing: 0; }
.race-card .meta { display: block; overflow: hidden; margin: 6px 0 0; font-size: 12px; line-height: 19px; font-weight: 400; color: var(--muted); white-space: nowrap; text-overflow: ellipsis; }
.race-card-foot { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; margin-top: 5px; min-height: 18px; }
.race-state { flex: none; padding: 2px 7px; border-radius: 4px; color: var(--tone, #666); background: var(--tone-soft, var(--bg)); font-size: 12px; font-style: normal; line-height: 17px; font-weight: 500; }
.race-state.active { color: var(--accent); background: var(--accent-soft); }
.deadline { overflow: hidden; color: var(--muted); font-size: 12px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.deadline.urgent { color: var(--accent); }
.race-chevron { flex: none; margin-left: -6px; color: var(--muted); font-size: 22px; line-height: 1; }
@media (max-width: 350px) { .race-card { gap: 10px; } .race-card strong { font-size: 15px; } .race-card .date { width: 54px; } }
</style>
