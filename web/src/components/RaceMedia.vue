<template>
  <figure class="race-media" :class="{ 'is-loading': loading, 'is-failed': failed }">
    <button v-if="!failed" type="button" class="race-media-open" :aria-label="'放大查看' + alt" @click="$emit('open')">
      <span v-if="loading" class="race-media-loading" role="status">正在加载图片…</span>
      <img :src="src" :alt="alt" loading="lazy" decoding="async" @load="loaded" @error="broken" />
      <span class="race-media-caption"><span class="race-media-caption-text">{{ alt }}</span><span aria-hidden="true">查看原图 ↗</span></span>
    </button>
    <div v-else class="race-media-error" role="status"><span><strong>{{ alt }}</strong>图片暂时无法加载</span><button type="button" @click="retry">重新加载</button></div>
  </figure>
</template>
<script setup>
import { ref, watch } from 'vue';
const props = defineProps({ src: String, alt: { type: String, default: '赛事图片' } });
defineEmits(['open']);
const failed = ref(false), loading = ref(true);
function loaded() { loading.value = false; }
function broken() { loading.value = false; failed.value = true; }
function retry() { failed.value = false; loading.value = true; }
watch(() => props.src, () => { failed.value = false; loading.value = true; });
</script>
<style scoped>
.race-media{min-width:0;margin:12px 0 0;overflow:hidden;border:1px solid #f0e7ed;border-radius:11px;background:#faf8fa}
.race-media-open{position:relative;display:block;width:100%;min-height:44px;padding:0;border:0;background:transparent;color:#947586;text-align:left}
.race-media-open>img{display:block;width:100%;height:auto;object-fit:contain;background:#fff}
.race-media.is-loading .race-media-open>img{min-height:120px}
.race-media-loading{position:absolute;top:45px;right:12px;left:12px;z-index:1;text-align:center;color:#b2a0ae;font-size:12px;pointer-events:none}
.race-media-caption{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px;font-size:12px;line-height:1.6}
.race-media-caption>span:last-child{flex:none;color:#b84465;font-size:12px}.race-media-caption .race-media-caption-text{min-width:0;color:#806f79;overflow-wrap:anywhere}
.race-media-error{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;min-height:112px;padding:14px;font-size:12px;line-height:1.8;color:#b09aa8}
.race-media-error strong{display:block;margin-bottom:4px;color:#947586;font-size:12px;font-weight:500}
.race-media-error>button{min-width:66px;min-height:44px;padding:10px 0;border:0;background:transparent;color:#d35073;font-size:12px}
.race-media button:focus-visible{outline:2px solid #ed3c5b;outline-offset:-3px}
</style>
