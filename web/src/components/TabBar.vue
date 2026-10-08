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
    <router-link to="/mine" class="item" :class="{ on: route.path.startsWith('/mine') }">
      <span class="glyph face">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.2" /><path d="M6.5 19.5c1-3 2.8-4.5 5.5-4.5s4.5 1.5 5.5 4.5" /></svg>
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
  bottom: 10px;
  transform: translateX(-50%);
  width: min(400px, calc(100% - 28px));
  height: 62px;
  background: #fff;
  border-radius: 31px;
  box-shadow: 0 8px 24px rgba(20, 30, 40, 0.12);
  display: flex;
  z-index: 20;
  padding: 4px;
}
.item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  color: #222;
  font-size: 11px;
  border-radius: 26px;
}
.glyph {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
}
.glyph svg { width: 22px; height: 22px; fill: none; stroke: #222; stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }
.item.home .glyph {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #2ad4cf;
}
.item.home .glyph svg { stroke: #fff; fill: #fff; }
.item.on:not(.home) { background: #eef1f4; }
.item.on .face svg { stroke: #2ad4cf; }
</style>
