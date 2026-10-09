<template>
  <nav class="dock">
    <router-link to="/" class="item" :class="{ on: route.path === '/', home: route.path === '/' }">
      <span class="glyph">
        <svg viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" /></svg>
      </span>
      <span>赛历</span>
    </router-link>
    <router-link to="/clubs" class="item" :class="{ on: route.path.startsWith('/clubs') }">
      <span class="glyph">
        <svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="2.2" /><circle cx="16" cy="9" r="2.2" /><path d="M4.8 17.5c.5-2.2 2-3.4 3.2-3.4s2.6 1.2 3.2 3.4M12.8 17.5c.5-2.2 2-3.4 3.2-3.4s2.6 1.2 3.2 3.4" /></svg>
      </span>
      <span>跑团</span>
    </router-link>
    <router-link to="/mine" class="item" :class="{ on: route.path.startsWith('/mine'), mine: route.path.startsWith('/mine') }">
      <span class="glyph face">
        <svg v-if="route.path.startsWith('/mine')" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" fill="#00d1c7" stroke="none" />
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
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #00d1c7;
}
.item.home .glyph svg { stroke: #fff; fill: #fff; }
.item.on:not(.home) .glyph svg { stroke: #00b7ae; }
.item.mine.on .glyph svg { stroke: none; }
.item.mine .glyph { width: 28px; height: 28px; }
</style>
