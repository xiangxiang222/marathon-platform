<template>
  <article class="race-card-shell">
    <router-link class="race-card" :class="'tone-' + toneOf(race)" :to="'/races/' + race.id">
      <time class="date" :datetime="race.raceDate || undefined">
        <template v-if="parts.day"><span>{{ parts.month }}月</span><b>{{ parts.day }}</b><small v-if="year">{{ year }}</small></template>
        <small v-else class="date-pending">日期<br />待公布</small>
      </time>
      <div class="body">
        <strong>{{ race.name }}</strong>
        <p v-if="race.city || race.province" class="meta location"><svg viewBox="0 0 16 16" aria-hidden="true" fill="none"><path d="M13 6c0 3.5-5 8-5 8S3 9.5 3 6a5 5 0 1 1 10 0Z"/><circle cx="8" cy="6" r="1.5"/></svg><span>{{ race.city || race.province }}</span></p>
        <p v-if="projectText" class="meta projects">{{ projectText }}</p>
      </div>
    </router-link>
    <div class="race-card-foot">
      <i class="race-state" :class="{ active: race.open || toneOf(race) === 'live' }"><span class="race-state-dot" aria-hidden="true"></span>{{ race.regStatus }}</i>
      <span v-if="race.deadlineLabel && race.deadlineLabel !== race.regStatus" class="deadline" :class="{ urgent: race.open && race.daysLeft <= 7 }">{{ race.deadlineLabel }}</span>
    </div>
    <div class="race-card-actions">
      <router-link class="card-plan" :class="{ 'has-plan': race.myStatus }" :to="{ path: '/races/' + race.id, query: { plan: '1' } }">
        <img class="card-plan-symbol" :src="race.myStatus ? planActiveIcon : planIcon" alt="" aria-hidden="true" />
        <span v-if="race.myStatus" class="card-plan-copy"><span>我的计划</span><strong class="my-race-status">{{ race.myStatus }}</strong></span>
        <span v-else class="card-plan-empty">添加参赛计划</span>
        <svg class="card-plan-arrow" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>
      </router-link>
      <FollowRaceButton class="card-follow" appearance="list" :race-id="race.id" :race-name="race.name" :following="!!race.following" @change="value => $emit('follow', value)" />
    </div>
  </article>
</template>

<script setup>
import { computed } from "vue";
import { dateParts, toneOf } from "../tone";
import FollowRaceButton from './FollowRaceButton.vue';
import planIcon from '../assets/race-actions/plan.svg';
import planActiveIcon from '../assets/race-actions/plan-active.svg';
defineEmits(['follow']);

const props = defineProps({
  race: { type: Object, required: true }
});

const parts = computed(() => dateParts(props.race.raceDate));
const year = computed(() => /^(\d{4})-\d{2}-\d{2}$/.exec(props.race.raceDate || '')?.[1] || '');
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
.race-card-shell{position:relative;min-width:0;overflow:hidden;border:1px solid #ede9e8;border-radius:16px;background:#fff;box-shadow:0 3px 13px #61413f03}
.race-card-shell .race-card{position:relative;display:flex;align-items:flex-start;gap:13px;min-width:0;min-height:112px;margin:0;padding:17px 16px 10px;border:0;border-radius:0;background:transparent;box-shadow:none}
.race-card .date{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:0;flex:none;width:50px;height:auto;min-height:83px;margin:1px 0 0;padding:0 0 7px;border:1px solid #f0e6e6;border-radius:9px;overflow:hidden;background:#fffaf9;color:#6a555b}
.race-card .date>span{position:static;display:block;align-self:stretch;margin:0;padding:4px 0;border-bottom:1px solid #f4e6e8;background:#fff0f3;color:#d85a70;font-size:12px;font-weight:500;line-height:1.4;opacity:1;text-align:center}
.race-card .date>b{display:block;margin:5px 0 1px;padding:0;color:#65545a;font-size:28px;font-weight:650;line-height:1.1;letter-spacing:-.5px}
.race-card .date>small{display:block;color:#85747d;font-size:12px;line-height:1.4;font-weight:400}
.race-card .date>.date-pending{padding-top:14px;line-height:1.9;color:#85747d}
.race-card .body{flex:1;min-width:0}
.race-card .body>strong{display:block;margin:0;color:#39323b;font-size:16px;font-weight:650;line-height:1.55;letter-spacing:0;overflow:visible;overflow-wrap:anywhere;-webkit-line-clamp:unset;-webkit-box-orient:unset}
.race-card .meta{display:block;min-width:0;margin:5px 0 0;color:#847780;font-size:12px;line-height:1.75;font-weight:400;white-space:normal;overflow:visible;overflow-wrap:anywhere;text-overflow:clip}
.race-card .meta.location{display:flex;align-items:flex-start;gap:4px}
.location>svg{flex:none;width:13px;height:13px;margin-top:4px;stroke:#b69da4;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round}
.location>span{min-width:0}
.race-card .meta.projects{margin-top:2px;color:#85747d}
.race-card-foot{display:flex;align-items:baseline;flex-wrap:wrap;gap:5px 10px;min-width:0;margin:0 16px 13px 79px;font-size:12px;line-height:1.7}
.race-state{display:inline-flex;align-items:center;gap:5px;min-width:0;color:#847780;font-size:12px;line-height:1.7;font-style:normal;font-weight:400;overflow-wrap:anywhere}
.race-state-dot{flex:none;width:5px;height:5px;border-radius:50%;background:#c9bec1}
.race-state.active{color:#cf3c57}
.race-state.active .race-state-dot{background:#ef7890}
.deadline{min-width:0;color:#85747d;font-size:12px;line-height:1.7;overflow-wrap:anywhere}
.deadline.urgent{color:#cf3c57}
.race-card-actions{display:flex;align-items:center;gap:10px;min-height:64px;padding:6px 12px 6px 15px;border-top:1px solid #f1eceb;background:linear-gradient(105deg,#fffcfa,#fffdfd)}
.card-plan{display:flex;align-items:center;gap:8px;flex:1;min-width:0;min-height:48px;border-radius:8px;color:#796a72;font-size:12px;line-height:1.7}
.card-plan-symbol{display:block;flex:none;width:30px;height:30px;object-fit:contain}
.card-plan-copy{display:flex;flex-direction:column;align-items:flex-start;gap:0;min-width:0;font-size:12px;line-height:1.6}
.card-plan-copy>span{color:#85747d}
.my-race-status{display:block;color:#bc405a;font-size:12px;font-weight:600;line-height:1.6;overflow-wrap:anywhere}
.card-plan-arrow{flex:none;width:12px;height:12px;fill:none;stroke:#c0abb4;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
.card-plan-empty{min-width:0;overflow-wrap:anywhere}
.card-follow{flex:none;max-width:44%;padding-left:10px;border-left:1px solid #eee5e8}
.race-card:focus-visible,.card-plan:focus-visible{outline:2px solid #ff1838;outline-offset:-3px}
@media(max-width:350px){.race-card-shell .race-card{gap:11px;padding:15px 13px 9px}.race-card-foot{margin-right:13px;margin-left:74px}.race-card-actions{gap:7px;padding:6px 9px 6px 11px}.card-plan{gap:6px}.card-plan-symbol{width:28px;height:28px}.card-follow{padding-left:7px}}
</style>
