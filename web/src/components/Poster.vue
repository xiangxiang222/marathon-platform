<template>
  <svg class="poster" viewBox="0 0 360 240" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img">
    <rect class="canvas" width="360" height="240" />
    <rect class="paper" x="12" y="12" width="336" height="216" rx="12" />
    <rect class="accent" x="32" y="34" width="28" height="4" rx="2" />
    <text class="year" x="32" y="70">{{ theme.year }}</text>
    <text class="city" x="32" y="106">{{ theme.city }}</text>
    <text class="title" x="32" y="160" :font-size="titleSize">{{ theme.title }}</text>
    <path class="rule" d="M32 185h296" />
    <text class="label" x="32" y="211">赛历</text>
  </svg>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  id: { type: String, required: true },
  name: { type: String, default: "" },
  city: { type: String, default: "" },
  date: { type: String, default: "" }
});

function shortTitle(name) {
  const text = String(name || "")
    .replace(/^(19|20)\d{2}/, "")
    .replace(/(半程)?马拉松|精英赛|公开赛|挑战赛|系列赛/g, "")
    .replace(/\s+/g, "")
    .trim();
  return (text || "赛历").slice(0, 6);
}

const theme = computed(() => {
  const date = props.date || "";
  return {
    year: /^\d{4}/.test(date) ? date.slice(0, 4) : "赛历",
    city: props.city || "赛历",
    title: shortTitle(props.name)
  };
});

const titleSize = computed(() => {
  const n = theme.value.title.length;
  if (n <= 3) return 44;
  if (n <= 5) return 36;
  return 32;
});
</script>

<style scoped>
.poster { display: block; width: 100%; height: auto; aspect-ratio: 3 / 2; border-radius: 12px; }
text { font-family: inherit; fill: var(--ink, #1f2026); }
.canvas { fill: var(--bg, #f5f6fa); }
.paper { fill: var(--card, #fff); }
.accent { fill: var(--accent, #ff0a30); }
.year { fill: var(--muted, #8a8e99); font-size: 15px; }
.city { font-size: 18px; font-weight: 600; }
.title { font-weight: 700; }
.rule { fill: none; stroke: var(--line, #eff0f4); }
.label { fill: var(--accent, #ff0a30); font-size: 13px; font-weight: 600; }
</style>
