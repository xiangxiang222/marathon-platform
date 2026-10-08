<template>
  <div class="app">
    <router-view />
    <nav class="tabs">
      <router-link to="/" :class="{ on: route.path === '/' }">
        <span class="mark">历</span>首页
      </router-link>
      <router-link to="/clubs" :class="{ on: route.path.startsWith('/clubs') }">
        <span class="mark">团</span>跑团
      </router-link>
      <router-link to="/mine" :class="{ on: route.path === '/mine' }">
        <span class="mark">我</span>我的
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import { useRoute } from "vue-router";
const route = useRoute();
</script>

<style scoped>
.tabs a.on .mark { background: var(--teal); color: #fff; }
.mark { background: #eef2f4; color: #8b949e; }
</style>
