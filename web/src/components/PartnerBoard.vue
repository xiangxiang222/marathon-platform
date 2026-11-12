<template>
  <div class="partner-board"><section class="block partner-identity">
    <header class="partner-heading"><span>跑团合作</span><h2>{{ view ? view.grade.label : "正在读取合作信息" }}</h2></header>
    <p v-if="view" class="hint">{{ view.grade.note }}</p>
    <p v-if="view" class="hint">{{ view.grade.rights }}</p>
    <div v-for="line in view ? view.grade.lines : []" :key="line.label" class="line">
      <span class="partner-fact"><span>{{ line.label }}</span><b>{{ line.text }}</b></span>
      <em>{{ line.met ? "已达到" : "未达到" }}</em>
    </div>
  </section>
  <section v-if="view" class="block">
    <h2>物资</h2>
    <p class="hint">认证跑团可按月度额度免费领取物资，核心跑团享双倍额度。领取条件按投放月份核算，数值为 0 表示不限。</p>
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
    <div v-for="item in view.claims" :key="'c' + item.id" class="line claim-row">
      <span>{{ item.nickname }} · {{ item.brand }} {{ item.name }}</span>
      <em>{{ item.statusLabel }}</em>
      <button v-if="view.staff && item.status === 'pending'" type="button" @click="give(item)">标成已发放</button>
    </div>
  </section>
  <section v-if="view" class="block">
    <h2>联赛</h2>
    <p class="hint">联赛免费参加，奖励以实物发放。核心跑团标识不影响成绩排名。</p>
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
  <p v-if="message" class="err">{{ message }}</p></div>
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
.partner-board{font-size:14px;color:var(--ink)}.partner-board .block{margin:12px 16px;padding:16px;border:0;border-radius:12px;background:#fff}.partner-board h2{margin:0;font-size:18px;font-weight:600}.partner-heading>span{font-size:12px;color:var(--muted)}.partner-heading h2{margin:5px 0 0;font-size:24px}.hint{margin:8px 0 0;color:var(--muted);font-size:12px;line-height:1.7}.modes{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.modes button,.line button{width:auto;min-height:44px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);font-size:14px;font-weight:500}.modes button:first-child{background:var(--accent-soft);color:var(--accent);border-color:transparent}.line{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:12px 0;border-bottom:1px solid var(--line)}.line:last-child{border-bottom:0}.line>span{flex:1;min-width:100px;overflow-wrap:anywhere}.line em{font-style:normal;font-size:12px;color:var(--muted);font-weight:400}.line .partner-fact{display:grid;gap:4px}.partner-fact>span{font-size:12px;color:var(--muted)}.partner-fact>b{font-size:15px;font-weight:500}.line>button{flex:none;font-size:12px}.run{padding:12px 0;border-bottom:1px solid var(--line)}.run>p:first-child{margin:0;font-size:15px;font-weight:500;line-height:1.5}.err{color:var(--accent);padding:0 16px;font-size:14px}
</style>
