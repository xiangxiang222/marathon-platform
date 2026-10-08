<template>
  <div class="stage">
    <router-view />
    <TabBar v-if="!route.meta.hideTab" />
  </div>
</template>

<script setup>
import { useRoute } from "vue-router";
import TabBar from "./components/TabBar.vue";

const route = useRoute();
</script>
