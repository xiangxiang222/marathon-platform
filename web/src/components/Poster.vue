<template>
  <svg class="poster" viewBox="0 0 360 240" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img">
    <defs>
      <linearGradient :id="gid + 'g'" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" :stop-color="theme.a" />
        <stop offset="1" :stop-color="theme.b" />
      </linearGradient>
    </defs>
    <rect width="360" height="240" :fill="'url(#' + gid + 'g)'" />
    <circle cx="292" cy="46" r="42" fill="#fff" opacity="0.14" />
    <path d="M0 150l64-52 62 40 58-58 54 48 48-28 74 36v104H0z" fill="#000" opacity="0.16" />
    <path d="M0 188c72-28 120 18 196-4 48-14 92 8 164-16v72H0z" fill="#000" opacity="0.22" />
    <text class="year" x="22" y="78">{{ theme.year }}</text>
    <text class="city" x="22" y="108">{{ theme.city }}</text>
    <text class="title" x="22" y="156" :font-size="titleSize">{{ theme.title }}</text>
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

const gid = computed(() => "p" + String(props.id).replace(/[^a-z0-9]/gi, ""));

const KNOWN = {
  "caa-10k": ["#1a2744", "#3d4d86"],
  chaoyang: ["#16324a", "#2f6d86"],
  tmsk: ["#3a2a16", "#8a6232"],
  bishan: ["#1a2e44", "#3d6484"],
  songshanhu: ["#12343a", "#1f6e66"],
  yuxi: ["#123044", "#2a7490"],
  jinjiang: ["#3a221c", "#8a4638"],
  hailing: ["#163044", "#3a6a78"],
  huangyaguan: ["#3a2c1c", "#8a6840"],
  "closed-sample": ["#2c3036", "#4a5158"]
};

const PALETTES = [
  ["#16345a", "#2f6f86"],
  ["#1c3a34", "#2f7a62"],
  ["#3a2a1c", "#8a5a32"],
  ["#2a2448", "#5a4a92"],
  ["#1a3048", "#3a6490"],
  ["#3a2430", "#8a4460"]
];

function shortTitle(name) {
  const text = String(name || "")
    .replace(/^(19|20)\d{2}/, "")
    .replace(/(半程)?马拉松|精英赛|公开赛|挑战赛|系列赛/g, "")
    .replace(/\s+/g, "")
    .trim();
  return (text || "赛历").slice(0, 6);
}

const theme = computed(() => {
  let n = 0;
  for (const ch of String(props.id)) n = (n * 33 + ch.charCodeAt(0)) >>> 0;
  const pair = KNOWN[props.id] || PALETTES[n % PALETTES.length];
  const date = props.date || "";
  return {
    a: pair[0],
    b: pair[1],
    year: /^\d{4}/.test(date) ? date.slice(0, 4) : "赛历",
    city: props.city || "赛历",
    title: shortTitle(props.name)
  };
});

const titleSize = computed(() => {
  const n = theme.value.title.length;
  if (n <= 3) return 52;
  if (n <= 5) return 40;
  return 32;
});
</script>

<style scoped>
.poster { display: block; width: 100%; height: 148px; border-radius: 8px; }
text { font-family: "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif; fill: #fff; }
.year { font-size: 15px; letter-spacing: 2px; opacity: 0.8; }
.city { font-size: 18px; letter-spacing: 3px; opacity: 0.92; }
.title { font-weight: 700; }
</style>
