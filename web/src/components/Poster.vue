<template>
  <svg class="poster" viewBox="0 0 360 240" xmlns="http://www.w3.org/2000/svg" role="img">
    <defs>
      <linearGradient :id="gid + 'g'" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" :stop-color="theme.a" />
        <stop offset="1" :stop-color="theme.b" />
      </linearGradient>
      <filter :id="gid + 'n'" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" />
        <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.16 0" />
      </filter>
    </defs>
    <rect width="360" height="240" :fill="'url(#' + gid + 'g)'" />
    <rect width="360" height="240" :filter="'url(#' + gid + 'n)'" />
    <path d="M0 176 C70 150 130 198 210 168 C270 146 310 176 360 158" fill="none" :stroke="theme.line" stroke-width="1" opacity="0.55" />
    <path d="M0 198 C90 174 150 214 240 188 C290 172 330 192 360 184" fill="none" :stroke="theme.line" stroke-width="0.7" opacity="0.28" />
    <text class="ghost" x="176" y="196">{{ theme.ghost }}</text>
    <text class="kicker" x="22" y="40">{{ theme.kicker }}</text>
    <text class="title" x="22" y="96">{{ theme.title }}</text>
    <text class="sub" x="22" y="126">{{ theme.sub }}</text>
    <line x1="22" y1="198" x2="92" y2="198" :stroke="theme.line" stroke-width="1" />
    <text class="meta" x="22" y="218">{{ theme.meta }}</text>
  </svg>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({ id: { type: String, required: true } });
const gid = computed(() => "p" + props.id.replace(/[^a-z0-9]/gi, ""));

const THEMES = {
  "caa-10k": { a: "#16141c", b: "#2a2438", line: "#cbb892", ghost: "十", kicker: "WUXI  2026", title: "精英赛", sub: "10 公里", meta: "中国田径协会" },
  chaoyang: { a: "#101820", b: "#1c3344", line: "#d5e0e8", ghost: "河", kicker: "BEIJING  2026", title: "滨河", sub: "半程马拉松", meta: "11 月 1 日" },
  tmsk: { a: "#171614", b: "#343026", line: "#c6aa78", ghost: "疆", kicker: "XINJIANG  2026", title: "图木舒克", sub: "马拉松", meta: "11 月 1 日" },
  bishan: { a: "#12161c", b: "#243044", line: "#a9b7c8", ghost: "山", kicker: "CHONGQING  2026", title: "璧山", sub: "全程 / 半程", meta: "11 月 15 日" },
  songshanhu: { a: "#10181c", b: "#163640", line: "#8ec9c2", ghost: "湖", kicker: "DONGGUAN  2026", title: "松山湖", sub: "全程 / 半程", meta: "11 月 22 日" },
  yuxi: { a: "#0e161c", b: "#16323c", line: "#9ed0dc", ghost: "湖", kicker: "YUXI  2026", title: "抚仙湖", sub: "半程马拉松", meta: "11 月 22 日" },
  jinjiang: { a: "#1c1214", b: "#3a2226", line: "#e2c2b0", ghost: "江", kicker: "QUANZHOU  2026", title: "晋江", sub: "全程 / 半程", meta: "12 月 6 日" },
  hailing: { a: "#12181e", b: "#1e3344", line: "#e0d2b4", ghost: "岛", kicker: "YANGJIANG  2026", title: "海陵岛", sub: "全程 / 半程", meta: "12 月 20 日" },
  huangyaguan: { a: "#161310", b: "#3a2c22", line: "#d4b483", ghost: "关", kicker: "TIANJIN  2027", title: "黄崖关", sub: "长城马拉松", meta: "5 月 15 日" },
  "closed-sample": { a: "#181a1c", b: "#2c3034", line: "#9aa0a6", ghost: "杭", kicker: "HANGZHOU  2025", title: "已结束", sub: "收官马拉松", meta: "2025" }
};

const theme = computed(
  () => THEMES[props.id] || { a: "#14181c", b: "#24303a", line: "#c5ced6", ghost: "赛", kicker: "RACE", title: "赛历", sub: "中国马拉松", meta: "" }
);
</script>

<style scoped>
.poster { display: block; width: 100%; height: 168px; }
text { font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
.kicker { font-size: 11px; letter-spacing: 1.5px; fill: rgba(255, 255, 255, 0.62); }
.title { font-size: 40px; font-weight: 650; fill: #fff; }
.sub { font-size: 13px; fill: rgba(255, 255, 255, 0.78); letter-spacing: 1px; }
.meta { font-size: 11px; letter-spacing: 1.5px; fill: rgba(255, 255, 255, 0.55); }
.ghost { font-size: 108px; font-weight: 700; fill: #fff; opacity: 0.07; }
</style>
