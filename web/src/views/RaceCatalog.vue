<template>
  <main class="archive-page">
    <header class="archive-header"><router-link to="/" aria-label="返回赛事首页">‹</router-link><span>赛事档案</span><span></span></header>
    <section class="archive-intro"><span class="archive-kicker">一场比赛，一份年度记忆</span><h1>认识你的下一场马拉松</h1><p>从路线到中签，从完赛到奖牌，按年份读懂一场比赛。</p></section>
    <section class="archive-body">
      <form class="archive-search" role="search" @submit.prevent="search"><input v-model="draft" maxlength="80" aria-label="搜索赛事档案" placeholder="搜索赛事、简称或城市" /><button type="submit">搜索</button></form>
      <div class="archive-filters"><label>世界田联<select v-model="wa" aria-label="世界田联标牌" @change="filter"><option value="">全部标牌</option><option value="白金标">白金标</option><option value="金标">金标</option></select></label><label>中国田协<select v-model="caa" aria-label="中国田协认证" @change="filter"><option value="">全部认证</option><option value="A类">A 类赛事</option></select></label></div>
      <p class="archive-caption">两套认证分别展示，适用年份见各赛事标签。</p>
      <div v-if="error" class="archive-state" role="alert"><p>{{ error }}</p><button type="button" class="archive-secondary" @click="load">重新加载</button></div>
      <p v-else-if="loading" class="archive-state" role="status">正在整理赛事档案…</p>
      <div v-else-if="!races.length" class="archive-state"><h2>没有符合条件的档案</h2><p>试试赛事简称，或清除部分筛选。</p><button type="button" class="archive-secondary" @click="clear">清除筛选</button></div>
      <template v-else><div class="archive-list-heading"><h2>已收录赛事</h2><span>{{ races.length }} 场</span></div><div class="archive-directory"><router-link v-for="race in races" :key="race.id" class="archive-directory-card" :to="{path:'/race-catalog/'+race.id,query:{...(query?{q:query}:{}),...(wa?{wa}:{}),...(caa?{caa}:{})}}"><div class="archive-card-top"><div><h2>{{ race.name }}</h2><p>{{ race.city }} · {{ race.shortName }}</p></div><span class="archive-arrow" aria-hidden="true">›</span></div><p class="archive-card-tagline">{{ race.tagline }}</p><div class="archive-badges"><span>世界田联 {{ certification(race.worldAthletics) }}</span><span>中国田协 {{ certification(race.caa) }}</span></div><span class="archive-card-link">阅读年度档案 <span aria-hidden="true">→</span></span></router-link></div></template>
      <p v-if="selectionNote" class="archive-caption">{{ selectionNote }}</p>
    </section>
  </main>
</template>
<script setup>
import { onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
const route=useRoute(),router=useRouter();
const draft=ref(String(route.query.q||'')),query=ref(draft.value),wa=ref(['白金标','金标'].includes(route.query.wa)?route.query.wa:''),caa=ref(route.query.caa==='A类'?'A类':'');
const races=ref([]),loading=ref(false),error=ref(''),selectionNote=ref('');let sequence=0;
function certification(v){return v&&v.label?v.label+(v.year?' · '+v.year:''):'待核实';}
async function load(){const seq=++sequence;loading.value=true;error.value='';try{const p=new URLSearchParams({q:query.value,wa:wa.value,caa:caa.value});const d=await api('/race-catalog?'+p);if(seq!==sequence)return;races.value=Array.isArray(d.races)?d.races:[];selectionNote.value=d.selectionNote||'';}catch(e){if(seq===sequence)error.value=e.message||'暂时无法加载赛事档案';}finally{if(seq===sequence)loading.value=false;}}
function filter(){router.replace({path:'/race-catalog',query:{...(query.value?{q:query.value}:{}),...(wa.value?{wa:wa.value}:{}),...(caa.value?{caa:caa.value}:{})}});load();}
function search(){query.value=draft.value.trim();filter();}function clear(){draft.value='';query.value='';wa.value='';caa.value='';filter();}
onBeforeUnmount(()=>sequence++);load();
</script>
<style src="../race-archive.css"></style>
