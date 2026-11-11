<template>
  <nav class="dock" aria-label="主导航">
    <router-link v-for="item in items" :key="item.to" :to="item.to" class="item" :class="{ on: active(item) }">
      <img class="glyph" :src="active(item) ? item.selected : item.icon" alt="" />
      <span>{{ item.label }}</span><i v-if="active(item)" class="active-dot" aria-hidden="true"></i>
    </router-link>
  </nav>
</template>

<script setup>
import { useRoute } from "vue-router";
import races from "../assets/navigation/races.svg";
import racesOn from "../assets/navigation/races-on.svg";
import sport from "../assets/navigation/sport.svg";
import sportOn from "../assets/navigation/sport-on.svg";
import clubs from "../assets/navigation/clubs.svg";
import clubsOn from "../assets/navigation/clubs-on.svg";
import mine from "../assets/navigation/mine.svg";
import mineOn from "../assets/navigation/mine-on.svg";

const route = useRoute();
const items = [
  { to: "/", label: "赛事", icon: races, selected: racesOn },
  { to: "/clubs", label: "跑团", icon: clubs, selected: clubsOn },
  { to: "/sport", label: "运动", icon: sport, selected: sportOn },
  { to: "/mine", label: "我的", icon: mine, selected: mineOn }
];
const active = (item) => item.to === "/" ? route.path === "/" : route.path.startsWith(item.to);
</script>

<style scoped>
.dock {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: min(430px, 100%);
  height: calc(64px + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: #fff;
  border-top: 1px solid var(--line);
  display: flex;
  z-index: 20;
}
.item {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.25;
}
.item.on { color: var(--accent); font-weight: 600; }
.glyph { display: block; width: 24px; height: 24px; }
.active-dot { position: absolute; top: 0; width: 22px; height: 3px; border-radius: 0 0 3px 3px; background: var(--accent); }

/* The navigation remains quiet, with colour only around the current destination. */
.dock { background:#fffffff0;backdrop-filter:blur(18px);border-top-color:#e7e9f1;box-shadow:0 -6px 24px #59678a08; }
.item.on::before { content:'';position:absolute;top:7px;width:46px;height:32px;border-radius:12px;background:linear-gradient(135deg,#ffece4,#fff4ed);z-index:-1; }
.active-dot { background:linear-gradient(90deg,#f17451,var(--accent)); }
</style>
