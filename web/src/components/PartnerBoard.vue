<template>
  <section class="block">
    <h2>认证 {{ view ? view.grade.label : "" }}</h2>
    <p v-if="view" class="hint">{{ view.grade.note }}</p>
    <p v-if="view" class="hint">{{ view.grade.rights }}</p>
    <div v-for="line in view ? view.grade.lines : []" :key="line.label" class="line">
      <span>{{ line.label }} · {{ line.text }}</span>
      <em>{{ line.met ? "已达到" : "未达到" }}</em>
    </div>
  </section>
  <section v-if="view" class="block">
    <h2>物资</h2>
    <p class="hint">用户不付钱。认证跑团按额度领，核心跑团额度乘二。条件按投放的那个月算，写成 0 的不卡。</p>
    <article v-for="item in view.supplies" :key="item.id" class="run">
      <p>{{ item.brand }} · {{ item.name }}</p>
      <p class="hint">{{ item.month }} · 签到至少 {{ item.needChecks }} 天，计入跑量至少 {{ item.needKm }} 公里</p>
      <p class="hint">本团额度 {{ item.cap }}，已领 {{ item.clubUsed }}。我本月签到 {{ item.progress.checks }} 天，跑量 {{ item.progress.km }} 公里。</p>
      <p v-if="item.note" class="hint">{{ item.note }}</p>
      <p v-if="item.reason" class="hint">{{ item.reason }}</p>
      <div class="modes">
        <button v-if="item.ready" type="button" @click="claim(item)">领取</button>
        <button v-if="item.mine && item.mine.status === 'pending'" type="button" @click="cancel(item)">撤回</button>
      </div>
    </article>
    <p v-if="!view.supplies.length" class="hint">还没有可领的物资。</p>
    <div v-for="item in view.claims" :key="'c' + item.id" class="line">
      <span>{{ item.nickname }} · {{ item.brand }} {{ item.name }}</span>
      <em>{{ item.statusLabel }}</em>
      <button v-if="view.staff && item.status === 'pending'" type="button" @click="give(item)">标成已发放</button>
    </div>
  </section>
  <section v-if="view" class="block">
    <h2>联赛</h2>
    <p class="hint">免费参加。奖品是物资，不发现金。核心跑团在榜上标优先，名次不因此提前。</p>
    <template v-if="view.league">
      <p>{{ view.league.title }}<template v-if="view.league.sponsor"> · {{ view.league.sponsor }}</template><template v-if="view.league.closed"> · 已结束</template></p>
      <p v-if="view.league.prize" class="hint">奖品 {{ view.league.prize }}</p>
      <div class="modes">
        <button v-if="view.league.canJoin" type="button" @click="joinLeague">参加</button>
        <button v-if="view.league.canLeave" type="button" @click="leaveLeague">退出</button>
      </div>
      <div v-for="row in view.league.rows" :key="row.clubId" class="line">
        <span>{{ row.place }} {{ row.name }}<template v-if="row.core"> · 优先</template></span>
        <em>{{ row.km }} 公里 · 出勤 {{ row.attend }} · 完赛 {{ row.finishers }}（{{ row.finishRate }}）</em>
      </div>
      <p v-if="!view.league.rows.length" class="hint">还没有跑团参加。</p>
    </template>
    <p v-else class="hint">这个月还没有联赛。</p>
  </section>
  <section v-if="view" class="block">
    <h2>分账</h2>
    <p class="hint">{{ view.ledgerNote }}</p>
    <div v-for="item in view.ledger || []" :key="item.id" class="line">
      <span>{{ item.month }} · {{ item.kindLabel }}</span>
      <em>{{ item.yuan }} 元 · {{ item.settledLabel }}</em>
    </div>
    <p v-if="view.staff && view.ledger && !view.ledger.length" class="hint">还没有分账记录。</p>
  </section>
  <p v-if="message" class="err">{{ message }}</p>
</template>

<script setup>
import { onMounted, ref, watch } from "vue";
import { api } from "../api";

const props = defineProps({
  clubId: { type: [Number, String], required: true }
});

const view = ref(null);
const message = ref("");

async function load() {
  view.value = await api("/clubs/" + props.clubId + "/partner");
  message.value = "";
}

async function run(action) {
  message.value = "";
  try {
    await action();
    await load();
  } catch (err) {
    message.value = err.message;
  }
}

function claim(item) {
  return run(() => api("/clubs/" + props.clubId + "/supplies/" + item.id + "/claim", { method: "POST" }));
}

function cancel(item) {
  return run(() => api("/clubs/" + props.clubId + "/supplies/" + item.id + "/claims/" + item.mine.id, { method: "DELETE" }));
}

function give(item) {
  return run(() => api("/clubs/" + props.clubId + "/supplies/" + item.supplyId + "/claims/" + item.id + "/give", { method: "POST" }));
}

function joinLeague() {
  return run(() => api("/clubs/" + props.clubId + "/league/join", { method: "POST" }));
}

function leaveLeague() {
  return run(() => api("/clubs/" + props.clubId + "/league/join", { method: "DELETE" }));
}

watch(() => props.clubId, () => {
  load().catch((err) => {
    message.value = err.message;
  });
});

onMounted(() => {
  load().catch((err) => {
    message.value = err.message;
  });
});
</script>

<style scoped>
.hint { margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
.modes { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.modes button, .line button { height: 34px; padding: 0 12px; border-radius: 8px; background: var(--chip); color: var(--ink); font-weight: 600; }
.modes button:first-child { background: var(--accent); color: #fff; }
.line { display: flex; justify-content: space-between; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line); }
.line em { font-style: normal; font-weight: 600; }
.run { padding: 8px 0; border-bottom: 1px solid var(--line); }
.err { color: var(--red); padding: 0 16px; }
</style>
