<template>
  <div class="stage" :class="{ wide: route.meta.wide }">
    <router-view :key="route.meta.viewKey || route.path" />
    <TabBar v-if="!route.meta.hideTab" />
  </div>
</template>

<script setup>
import { useRoute } from "vue-router";
import TabBar from "./components/TabBar.vue";

const route = useRoute();
</script>
