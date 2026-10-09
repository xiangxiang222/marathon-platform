<template>
  <svg class="poster" viewBox="0 0 360 220" xmlns="http://www.w3.org/2000/svg" role="img">
    <defs>
      <linearGradient :id="gid + 'g'" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" :stop-color="theme.a" />
        <stop offset="1" :stop-color="theme.b" />
      </linearGradient>
    </defs>
    <rect width="360" height="220" :fill="'url(#' + gid + 'g)'" />
    <circle cx="300" cy="36" r="70" fill="#fff" opacity="0.08" />
    <text class="kicker" x="22" y="36">{{ theme.kicker }}</text>
    <text class="title" x="22" y="108" :font-size="theme.title.length > 4 ? 34 : 46">{{ theme.title }}</text>
    <text class="sub" x="22" y="146">{{ theme.sub }}</text>
    <text class="meta" x="22" y="196">{{ theme.meta }}</text>
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

const gid = computed(() => "p" + props.id.replace(/[^a-z0-9]/gi, ""));

const THEMES = {
  "caa-10k": { a: "#1a2744", b: "#3d4d86", kicker: "无锡", title: "精英赛", sub: "10 公里", meta: "10 月 31 日" },
  chaoyang: { a: "#16324a", b: "#2f6d86", kicker: "北京", title: "滨河", sub: "半程马拉松", meta: "11 月 1 日" },
  tmsk: { a: "#3a2a16", b: "#8a6232", kicker: "新疆", title: "图木舒克", sub: "马拉松", meta: "11 月 1 日" },
  bishan: { a: "#1a2e44", b: "#3d6484", kicker: "重庆", title: "璧山", sub: "全程 / 半程", meta: "11 月 15 日" },
  songshanhu: { a: "#12343a", b: "#1f6e66", kicker: "东莞", title: "松山湖", sub: "全程 / 半程", meta: "11 月 22 日" },
  yuxi: { a: "#123044", b: "#2a7490", kicker: "玉溪", title: "抚仙湖", sub: "半程马拉松", meta: "11 月 22 日" },
  jinjiang: { a: "#3a221c", b: "#8a4638", kicker: "泉州", title: "晋江", sub: "全程 / 半程", meta: "12 月 6 日" },
  hailing: { a: "#163044", b: "#3a6a78", kicker: "阳江", title: "海陵岛", sub: "全程 / 半程", meta: "12 月 20 日" },
  huangyaguan: { a: "#3a2c1c", b: "#8a6840", kicker: "天津", title: "黄崖关", sub: "长城马拉松", meta: "5 月 15 日" },
  "closed-sample": { a: "#2c3036", b: "#4a5158", kicker: "杭州", title: "已结束", sub: "收官马拉松", meta: "2025" }
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
    .replace(/(半程)?马拉松|精英赛|公开赛|挑战赛/g, "")
    .trim();
  return (text || String(name || "赛历")).slice(0, 6);
}

function dateLabel(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return "";
  return Number(date.slice(5, 7)) + " 月 " + Number(date.slice(8, 10)) + " 日";
}

const theme = computed(() => {
  const known = THEMES[props.id];
  if (known && !props.name) return known;
  let n = 0;
  for (const ch of props.id) n = (n * 33 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = PALETTES[n % PALETTES.length];
  if (known) return { ...known, kicker: props.city || known.kicker, meta: dateLabel(props.date) || known.meta };
  return {
    a,
    b,
    kicker: props.city || "赛历",
    title: shortTitle(props.name),
    sub: props.city || "",
    meta: dateLabel(props.date)
  };
});
</script>

<style scoped>
.poster { display: block; width: 100%; height: 156px; border-radius: 10px; }
text { font-family: "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif; }
.kicker { font-size: 13px; letter-spacing: 1px; fill: rgba(255, 255, 255, 0.78); }
.title { font-weight: 650; fill: #fff; }
.sub { font-size: 14px; fill: rgba(255, 255, 255, 0.82); }
.meta { font-size: 13px; fill: rgba(255, 255, 255, 0.7); }
</style>
