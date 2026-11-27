<template>
  <main class="news-page">
    <header class="topbar">
      <router-link :to="id ? {path:'/news',query:{tab:'race'}} : '/'" aria-label="返回资讯">‹</router-link>
      <span>赛事资讯</span>
      <span></span>
    </header>
    <div v-if="message" class="news-state" role="alert"><p>暂时无法加载资讯</p><button type="button" @click="load">重新加载</button></div>
    <p v-else-if="!ready" class="news-state" role="status">正在加载资讯…</p>
    <template v-if="id && item">
      <header class="race-news-heading">
        <h1>{{ item.title }}</h1>
        <time v-if="item.publishedAt" :datetime="item.publishedAt">{{ contentDate(item.publishedAt) }}</time>
      </header>
      <section v-if="item.raceId" class="race-news-service" aria-label="关联赛事">
        <router-link class="go" :to="{path:'/races/' + item.raceId,query:{tab:'news'}}"><span><small>关联赛事</small><strong>{{ item.raceName || '查看赛事资讯' }}</strong></span><span aria-hidden="true">›</span></router-link>
      </section>
      <article class="news-body">
      <div v-if="blocks.length" class="guide-md">
        <p v-for="block in blocks" :key="block.i" :class="'md md-' + block.kind">
          <span v-if="block.mark" class="md-mark">{{ block.mark }}</span>
          <template v-for="run in block.runs" :key="run.j">
            <strong v-if="run.strong">{{ run.text }}</strong>
            <template v-else>{{ run.text }}</template>
          </template>
        </p>
      </div>
      </article>
    </template>
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
let requestId = 0;

async function load() {
  const request = ++requestId;
  message.value = "";
  ready.value = false;
  item.value = null;
  try {
    if (id.value) {
      const data = await api("/news/" + encodeURIComponent(id.value));
      if (request !== requestId) return;
      item.value = data.news;
    } else {
      const data = await api("/news?page=" + page.value);
      if (request !== requestId) return;
      rows.value = data.news || [];
      total.value = data.total || 0;
      pages.value = data.pages || 1;
      page.value = data.page || 1;
    }
  } catch {
    if (request === requestId) message.value = "暂时无法加载资讯";
  } finally {
    if (request === requestId) ready.value = true;
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
.news-page{--news-purple:#55388c;min-height:100vh;padding-bottom:24px;background:#f8f5fc;color:#22202a;font-size:14px}
.topbar,.race-news-heading{background:#e8def9;color:#22202a}
.topbar{display:flex;justify-content:space-between}
.topbar a:first-child,.topbar>span:last-child{display:flex;align-items:center;width:44px;min-height:44px;color:#22202a}
.topbar>span:nth-child(2){font-size:16px;font-weight:600}
.race-news-heading{padding:12px 20px 40px;background:linear-gradient(115deg,#e8def9,#f8f5fc)}
.race-news-heading h1{margin:0 0 10px;font-size:25px;line-height:1.45;overflow-wrap:anywhere}
.race-news-heading time{color:#514565;font-size:12px}
.race-news-service,.news-body,.news-state{margin:12px 16px;padding:16px;border-radius:18px;background:#fff}
.race-news-service{position:relative;margin-top:-22px;padding:8px 14px;box-shadow:0 8px 25px #39276212}
.race-news-service .go{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:50px;color:var(--news-purple)}
.go small,.go strong{display:block;overflow-wrap:anywhere}.go small{font-size:12px}.go strong{font-size:15px;line-height:1.6}
.news-body .guide-md .md{font-size:16px;line-height:1.9;overflow-wrap:anywhere}
.news-state{text-align:center}.news-state button{min-height:44px;padding:0 18px;border-radius:12px;background:linear-gradient(110deg,#7453b5,#55388c);color:#fff}
.news-line{display:block;margin:12px 16px 0;padding:14px;border-radius:12px;background:#fff}.news-line b{display:block;font-size:15px;font-weight:600;line-height:1.6}.news-line span{display:block;margin-top:6px;color:var(--muted);font-size:12px;line-height:1.7}
</style>
