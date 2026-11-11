<template>
  <div class="history-fields" @input="$emit('change')" @change="$emit('change')">
    <label class="full">比赛名称<input v-model="model.name" required maxlength="160" :disabled="disabled" placeholder="写下那一场比赛的名字" /></label>
    <label>比赛日期<input v-model="model.raceDate" required type="date" :max="today" :disabled="disabled" /></label>
    <label>项目<select aria-label="项目" v-model="model.distance" :disabled="disabled"><option value="" disabled>请选择项目</option><option value="full">全马</option><option value="half">半马</option><option value="10k">10 公里</option><option value="5k">5 公里</option><option value="other">其他项目</option></select><small v-if="model.distanceText">资料中的项目：{{ model.distanceText }}</small></label>
    <label>城市<input v-model="model.city" maxlength="60" :disabled="disabled" placeholder="可不填" /></label>
    <label>省份<input v-model="model.province" maxlength="60" :disabled="disabled" placeholder="可不填" /></label>
    <label>赛事类型<select aria-label="赛事类型" v-model="model.kind" :disabled="disabled"><option value="road">路跑</option><option value="trail">越野</option><option value="other">其他</option></select></label>
    <label>参赛方式<select aria-label="参赛方式" v-model="model.meet" :disabled="disabled"><option value="offline">线下赛</option><option value="online">线上赛</option></select></label>
    <label>这场的状态<select aria-label="这场的状态" v-model="model.status" :disabled="disabled"><option value="finished">已完赛</option><option value="dnf">未完赛 · DNF</option><option value="dns">未出发 · DNS</option></select></label>
    <label>号码布<input v-model="model.bib" maxlength="40" :disabled="disabled" placeholder="可不填" /></label>
    <template v-if="model.status === 'finished'">
      <label>净计时<input v-model="model.netTime" inputmode="text" maxlength="8" :disabled="disabled" placeholder="03:45:00，可留空" /></label>
      <label>枪声时间<input v-model="model.gunTime" inputmode="text" maxlength="8" :disabled="disabled" placeholder="03:47:00，可留空" /></label>
      <label class="full">比较成绩使用<select aria-label="比较成绩使用" v-model="model.timing" :disabled="disabled"><option value="net">净计时</option><option value="gun">枪声时间</option><option value="unknown">尚不清楚计时口径</option></select></label>
      <label v-if="model.timing === 'unknown'" class="full">未标明口径的用时<input v-model="model.unknownTime" maxlength="8" :disabled="disabled" placeholder="如 03:45:00，可留空" /><small>保留这个用时，暂不与净计时或枪声时间比较。</small></label>
    </template>
    <p v-else class="field-note full">经历会留下，未完赛和未出发不会计入完赛场数或个人纪录。</p>
  </div>
</template>

<script setup>
defineEmits(['change']);
defineProps({ model: { type: Object, required: true }, disabled: Boolean, today: String });
</script>

<style scoped>
.history-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px 12px;min-width:0}.history-fields label{display:flex;flex-direction:column;gap:7px;font-size:12px;color: var(--ink-secondary);min-width:0}.history-fields .full{grid-column:1/-1}.history-fields input,.history-fields select {width:100%;max-width:100%;min-width:0;height: 46px;background: var(--field-bg);border:1px solid var(--line);border-radius: 12px;padding:9px 10px;font-size: 14px;color: var(--ink);outline-offset:2px; border-color: var(--line);}.history-fields small,.field-note{font-size:12px;line-height:1.7;color:var(--muted);margin:0}.history-fields input:focus,.history-fields select:focus{outline:1px solid var(--accent);border-color:var(--accent)}.history-fields input:disabled,.history-fields select:disabled{opacity:.65}@media(max-width:350px){.history-fields{gap:12px 9px}.history-fields input,.history-fields select {padding:8px;font-size: 14px; border-radius: 12px; border-color: var(--line); height: 46px; background: var(--field-bg);}}
</style>
