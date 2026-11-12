<template><span class="club-logo" aria-hidden="true"><img v-if="source && failedSource !== source" :key="source" :src="source" alt="" @error="failedSource = $event.target.getAttribute('src')" /><span v-else>{{ String(name || '团').slice(0, 1) }}</span></span></template>
<script setup>
import { computed, ref } from 'vue';
import { clubLogoUrl } from '../club-logo';
const props = defineProps({ src: { type:String, default:'' }, name: { type:String, default:'团' } });
const failedSource = ref(''), source = computed(() => clubLogoUrl(props.src));
</script>
<style scoped>
.club-logo { display:inline-grid; place-items:center; flex:none; width:40px; height:40px; overflow:hidden; border:1px solid var(--line); border-radius:8px; background:var(--field-bg); color:var(--ink); font-size:18px; font-weight:500; }
.club-logo img { display:block; width:100%; height:100%; object-fit:cover; }
</style>
