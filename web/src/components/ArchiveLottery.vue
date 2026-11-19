<template>
  <section class="lottery-comparison">
    <h3>历年报名与中签</h3>
    <p>报名人数、参赛规模与抽签池分别记录，中签率只采用公布值。</p>
    <div v-if="columns.length" class="lottery-scroll" tabindex="0" aria-label="历年报名与中签对照表，可横向滚动">
      <table><thead><tr><th scope="col">年份</th><th v-for="column in columns" :key="column.key" scope="col">{{ column.label }}</th></tr></thead><tbody><tr v-for="edition in editions" :key="edition.year"><th scope="row">{{ edition.year }}</th><td v-for="column in columns" :key="column.key">{{ edition.registration?.[column.key] || '—' }}</td></tr></tbody></table>
    </div>
    <p v-else>历年统计尚未收录。</p>
  </section>
</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({ editions: { type: Array, default: () => [] } });
const columns = computed(() => [
  ['applicants', '报名人数'], ['eligibleApplicants', '有效报名'], ['lotteryPool', '抽签池人数'],
  ['drawQuota', '抽签名额'], ['directQuota', '直通名额'], ['lotteryRate', '公布中签率']
].filter(([key]) => props.editions.some(edition => edition.registration?.[key])).map(([key, label]) => ({ key, label })));
</script>
<style scoped>
.lottery-comparison{margin-top:30px;min-width:0}.lottery-comparison h3{font-size:18px;font-weight:600}.lottery-comparison>p{font-size:12px;line-height:1.9;color:#777;margin:12px 0}.lottery-scroll{max-width:100%;overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left;font-size:14px;line-height:1.9}th,td{min-width:145px;padding:14px 12px;border-top:1px solid #eee;vertical-align:top;white-space:normal}th:first-child{min-width:62px;font-weight:500}thead{color:#777;background:#f5f5f5}td{max-width:240px;overflow-wrap:anywhere}
</style>
