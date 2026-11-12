<template>
  <main class="journal-page">
    <header class="journal-top"><router-link :to="backLink" aria-label="返回资讯">‹</router-link><span>{{ isProfile ? '跑者档案' : '跑圈资讯' }}</span><span class="top-spacer" aria-hidden="true"></span></header>
    <div v-if="message" class="journal-state" role="alert"><span class="state-icon" aria-hidden="true">!</span><b>这一页暂时无法打开</b><p>{{ message }}</p><button type="button" @click="load">重新加载</button></div>
    <div v-else-if="!item" class="journal-state" role="status">正在打开…</div>
    <article v-else class="journal-detail">
      <template v-if="isProfile">
        <div class="profile-hero"><p class="detail-kicker">{{ item.type === 'pacer' ? '私兔人物档案' : '中国马拉松运动员' }}</p><h1>{{ item.name }}</h1><p v-if="item.nameEn" class="profile-en">{{ item.nameEn }}</p><div class="pb-panel"><span>{{ item.personalBestDisplay || item.personalBest ? '全程马拉松 · PB' : '公开资料' }}</span><b>{{ item.personalBestDisplay || item.personalBest || '持续收录' }}</b></div></div>
        <div v-if="item.rank" class="profile-fact"><span>榜单名次</span><b>{{ item.gender === 'women' ? '女子' : '男子' }} #{{ item.rank }} · 个人最佳</b></div>
        <div v-if="item.eventName" class="profile-fact"><span>PB 赛事</span><b>{{ item.eventName }}</b></div>
        <div v-if="item.eventDate" class="profile-fact"><span>比赛日期</span><b>{{ item.eventDate }}</b></div>
        <div v-if="item.birthDate" class="profile-fact"><span>出生日期</span><b>{{ item.birthDate }}</b></div>
        <div v-if="item.role" class="profile-fact"><span>人物身份</span><b>{{ item.role }}</b></div>
        <section class="profile-section"><h2>认识 {{ item.name }}</h2><p>{{ item.bio || item.summary || '目前已收录公开比赛记录，个人经历持续补充。' }}</p></section>
        <section v-if="item.careerHighlights?.length" class="profile-section"><h2>代表性大赛履历</h2><div v-for="(h,i) in item.careerHighlights" :key="i" class="evidence-card"><p>{{ h.date }} · {{ h.title }}<br />第 {{ h.position }} 名 · {{ h.result }}</p><a v-if="safeUrl(h.sourceUrl)" :href="h.sourceUrl" target="_blank" rel="noopener noreferrer">查看比赛来源 ↗</a></div></section>
        <section v-if="evidence.length" class="profile-section"><h2>带跑经历</h2><div v-for="(e,i) in evidence" :key="i" class="evidence-card"><p>{{ evidenceText(e) }}</p><a v-if="safeUrl(e.url || e.sourceUrl)" :href="e.url || e.sourceUrl" target="_blank" rel="noopener noreferrer">查看经历来源 ↗</a></div></section>
        <p v-if="item.verificationNote" class="ranking-note">{{ item.verificationNote }}</p><p class="ranking-note">{{ profileNotice }}</p>
      </template>
      <template v-else><p class="detail-kicker">{{ item.clubName || categoryName(item.category) }}</p><h1>{{ item.title }}</h1><div class="detail-meta"><span>{{ item.source }}</span><time>{{ (item.publishedAt || '').slice(0,10) }}</time></div><p v-if="item.summary" class="detail-summary">{{ item.summary }}</p><div class="guide-md"><p v-for="b in blocks" :key="b.i" :class="'md md-'+b.kind"><span v-if="b.mark" class="md-mark">{{ b.mark }}</span><template v-for="r in b.runs" :key="r.j"><strong v-if="r.strong">{{ r.text }}</strong><template v-else>{{ r.text }}</template></template></p></div></template>
      <section v-if="sources.length" class="source-box"><div>{{ isProfile ? '资料来源 · 点击查阅原始记录' : item.rights === 'link' ? '本文为原文推荐，完整内容请前往来源阅读。' : '内容来源' }}</div><a v-for="(s,i) in sources" :key="i" :href="s.url" target="_blank" rel="noopener noreferrer">{{ s.title || s.name || '查看原文' }} ↗</a></section>
      <router-link :to="backLink" class="detail-back">‹ 返回资讯列表</router-link>
    </article>
  </main>
</template>
<script setup>
import {computed,onBeforeUnmount,ref} from 'vue';
import {useRoute} from 'vue-router';
import {api} from '../api';
import {parseGuide} from '../guide-md';
const route=useRoute(),item=ref(null),message=ref(''),meta=ref({});
const isProfile=computed(()=>route.path.includes('/profiles/'));
const blocks=computed(()=>parseGuide(item.value?.body));
function safeUrl(u){try{const p=new URL(u);return p.protocol==='https:'&&!p.username&&!p.password;}catch{return false;}}
const sources=computed(()=>{const r=item.value;if(!r)return[];return (isProfile.value?(r.sources||[]):r.sourceUrl?[{title:r.source||'阅读原文',url:r.sourceUrl}]:[]).filter(s=>safeUrl(s.url));});
const evidence=computed(()=>{const e=item.value?.pacingEvidence;return Array.isArray(e)?e:e?[e]:[];});
const profileNotice=computed(()=>item.value?.type==='pacer'?(meta.value.rankingNote||meta.value.rankingNotice||'按公开带跑经历收录，展示顺序不代表全国排名。'):(meta.value.rankingNotice||meta.value.rankingBasis||'成绩以收录的榜单快照为准，非实时世界积分排名。'));
const backLink=computed(()=>isProfile.value?'/news?tab='+(item.value?.type||'athlete'):item.value?.clubId?'/clubs/'+item.value.clubId+'/news':'/news');
function categoryName(t){return({industry:'业界观察',club:'跑团来稿',stories:'跑者故事'})[t]||'跑圈资讯';}
function evidenceText(e){if(typeof e==='string')return e;return [e.date,e.event||e.eventName,e.target||e.runner||e.athlete,e.description||e.summary||e.evidence||e.note].filter(Boolean).join(' · ');}
let ticket=0,disposed=false;
async function load(){const seq=++ticket;message.value='';item.value=null;try{const d=await api('/content/'+(isProfile.value?'profiles/':'articles/')+encodeURIComponent(route.params.id));if(disposed||seq!==ticket)return;item.value=d.profile||d.article;meta.value=d.meta||{};}catch(e){if(!disposed&&seq===ticket)message.value='请稍后重试，或返回资讯列表浏览其他内容。';}}
onBeforeUnmount(()=>{disposed=true;ticket++;});
load();
</script>
<style scoped src="../journal.css"></style>
