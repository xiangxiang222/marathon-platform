<template>
  <svg class="poster" viewBox="0 0 340 230" xmlns="http://www.w3.org/2000/svg" role="img">
    <defs>
      <linearGradient :id="gid + 'a'" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" :stop-color="theme.c1" />
        <stop offset="1" :stop-color="theme.c2" />
      </linearGradient>
      <linearGradient :id="gid + 'b'" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" :stop-color="theme.c3" />
        <stop offset="1" stop-color="#fff" stop-opacity="0.15" />
      </linearGradient>
    </defs>
    <rect width="340" height="230" :fill="'url(#' + gid + 'a)'" />
    <g v-if="theme.layout === 'wave'" fill="#fff" opacity="0.9">
      <rect v-for="n in 18" :key="n" :x="12 + (n - 1) * 18" :y="150 - (n % 5) * 14" width="8" :height="40 + (n % 4) * 16" rx="4" opacity="0.35" />
    </g>
    <g v-else-if="theme.layout === 'hills'">
      <ellipse cx="250" cy="46" rx="28" ry="28" fill="#ffe08a" />
      <path d="M0 150 C70 110 120 180 180 140 C240 100 280 160 340 120 V230 H0 Z" :fill="theme.c3" opacity="0.9" />
      <path d="M0 180 C90 150 150 200 230 170 C290 150 320 180 340 168 V230 H0 Z" fill="#1f8f4e" />
    </g>
    <g v-else-if="theme.layout === 'sun'">
      <circle cx="270" cy="58" r="36" fill="#ffd36a" />
      <path d="M0 160 Q80 120 160 160 T340 140 V230 H0 Z" fill="#ff8a3d" opacity="0.85" />
      <path d="M40 190 Q120 150 200 188 T340 170 V230 H0 Z" fill="#f45d2a" />
    </g>
    <g v-else-if="theme.layout === 'bridge'">
      <path d="M20 150 Q170 40 320 150" fill="none" stroke="#fff" stroke-width="6" />
      <path d="M20 150 V190 M80 118 V190 M140 92 V190 M200 92 V190 M260 118 V190 M320 150 V190" stroke="#fff" stroke-width="3" opacity="0.8" />
      <path d="M0 190 H340 V230 H0 Z" fill="#7ec8ff" opacity="0.45" />
    </g>
    <g v-else-if="theme.layout === 'wall'">
      <path d="M0 120 H40 V80 H90 V120 H140 V70 H200 V120 H250 V90 H310 V120 H340 V230 H0 Z" fill="#c9843a" />
      <rect x="18" y="96" width="14" height="10" fill="#8d5a24" />
      <rect x="158" y="88" width="14" height="10" fill="#8d5a24" />
    </g>
    <g v-else-if="theme.layout === 'river'">
      <path d="M0 120 C60 90 110 150 170 120 C230 90 280 150 340 110 V230 H0 Z" fill="#9fd4ff" opacity="0.55" />
      <path d="M0 165 C90 130 150 190 230 155 C290 135 320 170 340 158 V230 H0 Z" fill="#1d6dff" opacity="0.55" />
    </g>
    <g v-else>
      <circle cx="280" cy="50" r="40" fill="#fff" opacity="0.18" />
      <path d="M0 170 H340 V230 H0 Z" :fill="'url(#' + gid + 'b)'" />
    </g>
    <text x="18" y="36" fill="#fff" font-size="18" font-weight="700">{{ theme.year }}</text>
    <text x="18" y="78" fill="#fff" font-size="32" font-weight="800">{{ theme.headline }}</text>
    <text x="18" y="108" fill="#fff" font-size="13" opacity="0.92">{{ theme.line }}</text>
  </svg>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({ id: { type: String, required: true } });
const gid = computed(() => "p" + props.id.replace(/[^a-z0-9]/gi, ""));

const THEMES = {
  "caa-10k": { c1: "#5b2dff", c2: "#c44bff", c3: "#fff", layout: "wave", year: "2026", headline: "报名开启", line: "10公里精英赛" },
  chaoyang: { c1: "#1a6cff", c2: "#49d2ff", c3: "#0b4ea8", layout: "river", year: "2026", headline: "滨河开跑", line: "朝阳半程马拉松" },
  tmsk: { c1: "#1278e8", c2: "#3ecf8e", c3: "#0e8f4a", layout: "hills", year: "2026", headline: "报名开启", line: "图木舒克马拉松" },
  bishan: { c1: "#1554d6", c2: "#3aa0ff", c3: "#0a3f86", layout: "river", year: "2026", headline: "璧山开跑", line: "重庆马拉松" },
  songshanhu: { c1: "#0b4db8", c2: "#2f8dff", c3: "#7ec8ff", layout: "bridge", year: "2026", headline: "松山湖", line: "东莞马拉松" },
  yuxi: { c1: "#083e86", c2: "#1a74d4", c3: "#49b6ff", layout: "bridge", year: "2026", headline: "抚仙湖", line: "半程马拉松" },
  jinjiang: { c1: "#e23b2f", c2: "#ff8a3a", c3: "#ffd36a", layout: "sun", year: "2026", headline: "晋江开跑", line: "泉州马拉松" },
  hailing: { c1: "#ffb703", c2: "#fb8500", c3: "#f45d2a", layout: "sun", year: "2026", headline: "海陵岛", line: "12月20日鸣枪" },
  huangyaguan: { c1: "#8d5a24", c2: "#e0a15a", c3: "#c9843a", layout: "wall", year: "2027", headline: "长城开跑", line: "黄崖关马拉松" },
  "closed-sample": { c1: "#5c6770", c2: "#98a2ab", c3: "#d5dbe0", layout: "river", year: "2025", headline: "已结束", line: "收官马拉松" }
};

const theme = computed(() => THEMES[props.id] || THEMES.bishan);
</script>

<style scoped>
.poster { display: block; width: 100%; height: 168px; }
text { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; }
</style>
