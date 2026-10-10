<template>
  <nav class="dock">
    <router-link to="/" class="item" :class="{ on: route.path === '/', home: route.path === '/' }">
      <span class="glyph">
        <svg viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" /></svg>
      </span>
      <span>首页</span>
    </router-link>
    <router-link to="/sport" class="item" :class="{ on: route.path.startsWith('/sport') || route.path.startsWith('/clubs') }">
      <span class="glyph">
        <svg viewBox="0 0 24 24"><path d="M3 14c2-1 3.2-3 4.2-5.2.4-.8 1.6-.7 1.8.2L10 13l2.2-1.2c.7-.4 1.6.2 1.5 1L13 16h3.2c.8 0 1.3.8.9 1.5l-1.2 2c-.3.4-.7.5-1.2.5H8.2c-.4 0-.8-.2-1-.6L3.6 15.2C3.2 14.6 3 14.2 3 14z" /></svg>
      </span>
      <span>运动</span>
    </router-link>
    <router-link to="/look" class="item" :class="{ on: route.path.startsWith('/look') }">
      <span class="glyph">
        <svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
      </span>
      <span>看看</span>
    </router-link>
    <router-link to="/mine" class="item" :class="{ on: route.path.startsWith('/mine'), mine: route.path.startsWith('/mine') }">
      <span class="glyph face">
        <svg v-if="route.path.startsWith('/mine')" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" fill="#0f1419" stroke="none" />
          <path d="M8.4 10.6h.01M15.6 10.6h.01M8.6 14.2c.9.8 2 1.2 3.4 1.2s2.5-.4 3.4-1.2" stroke="#fff" fill="none" />
        </svg>
        <svg v-else viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.2" /><path d="M6.5 19.5c1-3 2.8-4.5 5.5-4.5s4.5 1.5 5.5 4.5" /></svg>
      </span>
      <span>我的</span>
    </router-link>
  </nav>
</template>

<script setup>
import { useRoute } from "vue-router";
const route = useRoute();
</script>

<style scoped>
.dock {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: min(430px, 100%);
  height: calc(52px + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  border-top: 1px solid #eff3f4;
  border-radius: 0;
  box-shadow: none;
  display: flex;
  z-index: 20;
}
.item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  color: #536471;
  font-size: calc(11px * var(--s));
  border-radius: 0;
}
.item.on { color: #0f1419; font-weight: 700; }
.glyph {
  width: calc(26px * var(--s));
  height: calc(26px * var(--s));
  display: grid;
  place-items: center;
}
.glyph svg { width: calc(22px * var(--s)); height: calc(22px * var(--s)); fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }
.item.on .glyph svg { stroke: #0f1419; }
.item.home.on .glyph svg { fill: #0f1419; stroke: #0f1419; }
.item.mine.on .glyph svg { stroke: none; }
.item.mine .glyph { width: calc(28px * var(--s)); height: calc(28px * var(--s)); }
.item.mine .glyph svg { stroke: none; }
</style>
