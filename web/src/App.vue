<template>
  <div class="stage" data-ui="jd" :data-scene="scene" :class="{ wide: route.meta.wide }">
    <router-view :key="route.meta.viewKey || route.path" />
    <TabBar v-if="!route.meta.hideTab" />
  </div>
</template>

<script setup>
import { useRoute } from "vue-router";
import { computed } from "vue";
import TabBar from "./components/TabBar.vue";

const route = useRoute();
const scene = computed(() => {
  const path = route.path;
  if (path.startsWith('/admin')) return 'admin';
  if (/^\/(mine|runner|history)(\/|$)/.test(path)) return 'personal';
  if (path.startsWith('/sport')) return 'sport';
  if (path.startsWith('/calendar')) return 'calendar';
  if (path.startsWith('/radar')) return 'radar';
  if (/^\/(feedback|news|look)(\/|$)/.test(path)) return 'community';
  if (path.startsWith('/clubs')) return 'club';
  return 'race';
});
</script>
