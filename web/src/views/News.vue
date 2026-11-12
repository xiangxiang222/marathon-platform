<template>
  <main class="news-page">
    <header class="topbar">
      <router-link :to="id ? '/news' : '/'" aria-label="返回">‹</router-link>
      <h1>资讯</h1>
      <span></span>
    </header>
    <p v-if="message" class="err">{{ message }}</p>
    <article v-if="id && item" class="news-body">
      <p class="news-kicker">赛事资讯</p>
      <h2>{{ item.title }}</h2>
      <p class="src">{{ contentDate(item.publishedAt) }}</p>
      <div v-if="blocks.length" class="guide-md">
        <p v-for="block in blocks" :key="block.i" :class="'md md-' + block.kind">
          <span v-if="block.mark" class="md-mark">{{ block.mark }}</span>
          <template v-for="run in block.runs" :key="run.j">
            <strong v-if="run.strong">{{ run.text }}</strong>
            <template v-else>{{ run.text }}</template>
          </template>
        </p>
      </div>
      <router-link class="go" :to="'/races/' + item.raceId"><span>{{ item.raceName }}</span><span aria-hidden="true">›</span></router-link>
    </article>
    <template v-else-if="!id">
      <router-link v-for="row in rows" :key="row.id" class="news-line" :to="'/news/' + row.id">
        <b>{{ row.title }}</b>
        <span>{{ contentDate(row.publishedAt) }} · {{ row.raceName }}</span>
      </router-link>
      <p v-if="ready && !rows.length" class="empty">还没有资讯</p>
      <p v-if="ready" class="hint">共 {{ total }} 条</p>
      <Pager :page="page" :pages="pages" @update:page="turnPage" />
    </template>
  </main>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";
import Pager from "../components/Pager.vue";
import { parseGuide } from "../guide-md";
import { contentDate } from "../content-date";

const route = useRoute();
const rows = ref([]);
const page = ref(1);
const pages = ref(1);
const total = ref(0);
const item = ref(null);
const message = ref("");
const ready = ref(false);
const id = computed(() => route.params.id || "");
const blocks = computed(() => parseGuide(item.value && item.value.body));

async function load() {
  message.value = "";
  ready.value = false;
  item.value = null;
  try {
    if (id.value) {
      const data = await api("/news/" + id.value);
      item.value = data.news;
    } else {
      const data = await api("/news?page=" + page.value);
      rows.value = data.news || [];
      total.value = data.total || 0;
      pages.value = data.pages || 1;
      page.value = data.page || 1;
    }
  } catch (err) {
    message.value = err.message;
  } finally {
    ready.value = true;
  }
}

function turnPage(next) {
  page.value = next;
  return load();
}

watch(id, () => {
  page.value = 1;
  load();
}, { immediate: true });
</script>

<style scoped>
.news-page{padding-bottom:24px;background:var(--bg);color:var(--ink);font-size:14px}.topbar{background:#fff}.topbar h1{font-size:16px;font-weight:600}.news-body{margin:12px;padding:20px 16px;border-radius:12px;background:#fff}.news-kicker{margin:0 0 12px;color:var(--accent);font-size:12px;line-height:1.5}.news-body h2{margin:0 0 16px;font-size:24px;font-weight:600;line-height:1.5;overflow-wrap:anywhere}.news-body .src{margin:0;padding-bottom:16px;border-bottom:1px solid var(--line);color:var(--muted);font-size:12px;line-height:1.8}.news-body .guide-md .md{font-size:16px;line-height:1.9}.news-body .go{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;margin-top:24px;padding:12px;border-radius:8px;background:var(--field-bg);color:var(--accent);font-size:14px;line-height:1.6}.news-line{display:block;margin:12px 16px 0;padding:14px;border-radius:12px;background:#fff}.news-line b{display:block;font-size:15px;font-weight:600;line-height:1.6}.news-line span{display:block;margin-top:6px;color:var(--muted);font-size:12px;line-height:1.7}
</style>
