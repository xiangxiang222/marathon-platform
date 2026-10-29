<template>
  <div class="runner-bars">
    <div class="chart-caption"><span>{{ caption }}</span><span>{{ selected?.label || '轻点柱形，查看详情' }}</span></div>
    <div class="chart-plot" :class="{ compact: items.length > 15 }" role="group" :aria-label="caption">
      <div class="chart-lines" aria-hidden="true"><span>{{ format(max) }}</span><span>{{ format(max / 2) }}</span><span>0</span></div>
      <div class="chart-columns"><button v-for="(item, index) in items" :key="item.key || index" type="button" :aria-label="`${item.label}：${format(value(item))}${unit}`" :aria-pressed="picked === index" :class="{ picked: picked === index }" @click="picked = index"><span class="bar-area"><i :class="{ isZero: !value(item) }" :style="{ height: `${value(item) ? Math.max(3, value(item) / max * 100) : 2}%` }"></i></span><span class="bar-label">{{ showLabel(index) ? item.label : '·' }}</span></button></div>
    </div>
    <p class="chart-readout" aria-live="polite">{{ selected ? `${selected.label} · ${format(value(selected))}${unit}` : (empty ? '暂时没有记录，下一次出发就会点亮这里' : '每一根柱子，都是一段真实的积累') }}</p>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
const props = defineProps({ items: {type:Array,default:()=>[]}, field:{type:String,default:'km'}, unit:{type:String,default:'公里'}, caption:{type:String,default:'跑量趋势'}, format:{type:Function,default:value=>Number(value || 0).toLocaleString('zh-CN',{maximumFractionDigits:1})} });
const picked = ref(-1);
watch(() => [props.items, props.field], () => { picked.value = -1; });
const value = item => Math.max(0, Number(item[props.field]) || 0);
const max = computed(() => Math.max(1, ...props.items.map(value)));
const empty = computed(() => props.items.every(x=>!value(x)));
const selected = computed(() => props.items[picked.value]);
function showLabel(i) { const n=props.items.length; return n<=12 || i===n-1 || i%Math.ceil(n/7)===0; }
</script>
<style scoped>
.chart-caption{display:flex;justify-content:space-between;gap:8px;font-size:10px;color:#9699a4;margin-bottom:18px}.chart-caption>span:last-child{color:#a9abb4}.chart-plot{position:relative;height:160px;padding-left:27px}.chart-lines{position:absolute;inset:0 0 24px 0;display:flex;flex-direction:column;justify-content:space-between;color:#b0b2ba;font-size:9px;pointer-events:none}.chart-lines>span{display:flex;align-items:center;gap:5px}.chart-lines>span:after{content:'';flex:1;border-top:1px dashed #eeeef3}.chart-columns{position:relative;display:flex;gap:8px;height:100%;align-items:flex-end;overflow:visible}.chart-columns>button{flex:1;min-width:0;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:8px}.bar-area{height:136px;width:100%;display:flex;align-items:flex-end;justify-content:center}.bar-area i{width:min(21px,80%);border-radius:6px 6px 2px 2px;background:linear-gradient(180deg,#ff6982,#ff0a30);transition:height .35s ease,opacity .2s;opacity:.8}.bar-area i.isZero{background:#edeef3}.picked .bar-area i{opacity:1;box-shadow:0 0 0 3px #fff0f3}.bar-label{font-size:9px;color:#9d9fa9;white-space:nowrap}.picked .bar-label{color:#ff0a30}.compact .chart-columns{gap:3px}.compact .bar-area i{width:80%;border-radius:3px 3px 1px 1px}.chart-readout{font-size:10px;text-align:center;color:#979aa6;margin:15px 0 0;min-height:18px}@media(prefers-reduced-motion:reduce){.bar-area i{transition:none}}
</style>
