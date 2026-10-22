<template>
  <main>
    <header class="topbar">
      <router-link :to="id ? '/news' : '/'" aria-label="返回">‹</router-link>
      <h1>资讯</h1>
      <span></span>
    </header>
    <p v-if="message" class="err">{{ message }}</p>
    <article v-if="id && item" class="news-body">
      <h2>{{ item.title }}</h2>
      <p class="src">{{ item.publishedAt }} · {{ item.source }}</p>
      <p class="sum">{{ item.summary }}</p>
      <p class="src">原文在来源页面。这里只留摘要。</p>
      <a class="go" :href="item.url" target="_blank" rel="noopener">原文</a>
      <router-link class="go" :to="'/races/' + item.raceId">{{ item.raceName }}</router-link>
    </article>
    <template v-else-if="!id">
      <router-link v-for="row in rows" :key="row.id" class="news-line" :to="'/news/' + row.id">
        <b>{{ row.title }}</b>
        <span>{{ row.publishedAt }} · {{ row.raceName }} · {{ row.source }}</span>
      </router-link>
      <p v-if="ready && !rows.length" class="empty">还没有资讯</p>
    </template>
  </main>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";

const route = useRoute();
const rows = ref([]);
const item = ref(null);
const message = ref("");
const ready = ref(false);
const id = computed(() => route.params.id || "");

async function load() {
  message.value = "";
  ready.value = false;
  item.value = null;
  try {
    if (id.value) {
      const data = await api("/news/" + id.value);
      item.value = data.news;
    } else {
      const data = await api("/news");
      rows.value = data.news || [];
    }
  } catch (err) {
    message.value = err.message;
  } finally {
    ready.value = true;
  }
}

watch(id, load, { immediate: true });
</script>
