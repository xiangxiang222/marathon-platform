<template>
  <main>
    <router-link class="back" to="/">返回赛历</router-link>
    <div v-if="!authed" class="block">
      <h2>赛历后台</h2>
      <p class="hint">口令写在服务器的 ADMIN_TOKEN，不放进页面。</p>
      <form class="check-form" @submit.prevent="enter">
        <input v-model="token" type="password" placeholder="后台口令" />
        <button class="primary" type="submit">进入</button>
      </form>
      <p v-if="message" class="err">{{ message }}</p>
    </div>
    <template v-else>
      <div class="block">
        <h2>官网赛历</h2>
        <p class="hint">只收名称、日期、地点、类别和项目。报名开始、出签、缴费截止要另写来源。已经在赛历里的场，报名时间不会被盖掉。</p>
        <form class="check-form" @submit.prevent="search">
          <input v-model="q" placeholder="向官网查名称，例如璧山" />
          <button class="primary" type="submit">查官网</button>
        </form>
        <button class="undo" type="button" @click="syncAll">拉取即将开赛的场</button>
        <div class="statuses">
          <button v-for="item in filters" :key="item.value" type="button" class="status" :class="{ on: filter === item.value }" @click="setFilter(item.value)">
            {{ item.label }}
          </button>
        </div>
        <p v-if="busy" class="hint">正在向官网要赛历。</p>
        <p v-if="message" :class="saved ? 'hint' : 'err'">{{ message }}</p>
      </div>
      <div v-for="row in rows" :key="row.officialId" class="block">
        <h2>{{ row.name }}</h2>
        <p class="hint">{{ row.raceDate }} · {{ row.province }} {{ row.city }} · {{ row.gradeLabel || "未标类别" }} · {{ row.items || "项目未写" }}</p>
        <p v-if="row.match && !row.raceId" class="hint">赛历里已有这场：{{ row.match.name }}</p>
        <p v-if="row.diffNote" class="warn">{{ row.diffNote }}</p>
        <p class="hint"><a :href="row.detailUrl" target="_blank" rel="noopener">打开官网这场</a></p>
        <button v-if="row.status !== 'published'" class="primary" type="button" @click="publish(row)">
          {{ row.match ? "对上已有赛历" : "收入赛历" }}
        </button>
        <button v-if="row.status !== 'ignored'" class="undo" type="button" @click="ignore(row)">忽略</button>
        <button v-if="row.diffNote" class="undo" type="button" @click="apply(row)">采用官网的名称和日期</button>
        <router-link v-if="row.raceId" class="hint link" :to="'/races/' + row.raceId">打开赛历这场</router-link>
        <form v-if="row.raceId" class="check-form" @submit.prevent="saveNodes(row)">
          <input v-model="row.regStart" placeholder="报名开始 2026-09-07" />
          <input v-model="row.deadline" placeholder="报名截止 2026-10-28" />
          <input v-model="row.drawAt" placeholder="出签" />
          <input v-model="row.payDeadline" placeholder="缴费截止" />
          <input v-model="row.nodeSource" placeholder="来源，例如最酷，2026-09-07" />
          <button class="primary" type="submit">保存报名节点</button>
        </form>
      </div>
      <p v-if="ready && !rows.length" class="empty">这个范围还没有场。</p>
    </template>
  </main>
</template>

<script setup>
import { ref } from "vue";
import { api } from "../api";

const token = ref(sessionStorage.getItem("marathon_admin") || "");
const authed = ref(false);
const q = ref("");
const filter = ref("pending");
const rows = ref([]);
const message = ref("");
const saved = ref(false);
const busy = ref(false);
const ready = ref(false);
const filters = [
  { label: "待确认", value: "pending" },
  { label: "已收入", value: "published" },
  { label: "已忽略", value: "ignored" }
];

function admin(path, options = {}) {
  return api(path, { ...options, adminToken: token.value });
}

function fail(err) {
  saved.value = false;
  message.value = err.message;
}

async function enter() {
  message.value = "";
  saved.value = false;
  sessionStorage.setItem("marathon_admin", token.value);
  try {
    await load();
    authed.value = true;
  } catch (err) {
    authed.value = false;
    fail(err);
  }
}

async function load() {
  const data = await admin("/admin/official?status=" + filter.value + (q.value ? "&q=" + encodeURIComponent(q.value) : ""));
  rows.value = (data.rows || []).map((row) => ({ ...row, regStart: "", deadline: "", drawAt: "", payDeadline: "", nodeSource: "" }));
  ready.value = true;
}

async function setFilter(value) {
  filter.value = value;
  message.value = "";
  saved.value = false;
  try {
    await load();
  } catch (err) {
    fail(err);
  }
}

async function search() {
  message.value = "";
  saved.value = false;
  busy.value = true;
  try {
    const data = await admin("/admin/official/sync", { method: "POST", body: JSON.stringify({ name: q.value }) });
    rows.value = (data.rows || []).map((row) => ({ ...row, regStart: "", deadline: "", drawAt: "", payDeadline: "", nodeSource: "" }));
    ready.value = true;
  } catch (err) {
    fail(err);
  } finally {
    busy.value = false;
  }
}

async function syncAll() {
  q.value = "";
  filter.value = "pending";
  await search();
}

async function publish(row) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/official/" + row.officialId + "/publish", { method: "POST", body: "{}" });
    await load();
  } catch (err) {
    fail(err);
  }
}

async function ignore(row) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/official/" + row.officialId + "/ignore", { method: "POST", body: "{}" });
    await load();
  } catch (err) {
    fail(err);
  }
}

async function apply(row) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/official/" + row.officialId + "/apply", { method: "POST", body: "{}" });
    await load();
  } catch (err) {
    fail(err);
  }
}

async function saveNodes(row) {
  message.value = "";
  saved.value = false;
  try {
    await admin("/admin/races/" + row.raceId, {
      method: "PUT",
      body: JSON.stringify({
        regStart: row.regStart,
        deadline: row.deadline,
        drawAt: row.drawAt,
        payDeadline: row.payDeadline,
        source: row.nodeSource
      })
    });
    saved.value = true;
    message.value = "报名节点已记下";
  } catch (err) {
    fail(err);
  }
}

if (token.value) enter();
</script>

<style scoped>
.hint { margin: 8px 0 0; color: #8d949c; font-size: 12px; }
.warn { margin: 8px 0 0; color: #9a5b12; font-size: 13px; }
.check-form { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.check-form input { height: 36px; border: 1px solid #e6e8ec; border-radius: 8px; padding: 0 10px; background: #fff; }
.primary { margin-top: 8px; }
.undo { margin-top: 8px; height: 32px; padding: 0 12px; background: transparent; color: #8d949c; }
.statuses { margin-top: 8px; }
.link { display: inline-block; }
a { color: #12b3ae; }
</style>
