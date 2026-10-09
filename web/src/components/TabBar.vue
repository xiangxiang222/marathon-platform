<template>
  <nav class="dock">
    <router-link to="/" class="item" :class="{ on: route.path === '/' }">赛历</router-link>
    <router-link to="/clubs" class="item" :class="{ on: route.path.startsWith('/clubs') }">跑团</router-link>
    <router-link to="/mine" class="item" :class="{ on: route.path.startsWith('/mine') }">我的</router-link>
  </nav>
</template>

<script setup>
import { useRoute } from "vue-router";

const route = useRoute();
</script>
