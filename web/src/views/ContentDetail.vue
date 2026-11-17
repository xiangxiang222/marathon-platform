<template>
  <main class="journal-page">
    <header class="journal-top"><router-link :to="backLink" aria-label="返回资讯">‹</router-link><span>{{ isPacerPerson ? '官兔档案' : isOfficialPacer ? '赛事官兔' : isProfile ? '跑者档案' : '跑圈资讯' }}</span><span class="top-spacer" aria-hidden="true"></span></header>
    <div v-if="message" class="journal-state" role="alert"><span class="state-icon" aria-hidden="true">!</span><b>这一页暂时无法打开</b><p>{{ message }}</p><button type="button" @click="load">重新加载</button></div>
    <div v-else-if="!item" class="journal-state" role="status">正在打开…</div>
    <article v-else class="journal-detail">
      <template v-if="isProfile">
        <div class="profile-hero">
          <div class="profile-identity"><div class="profile-hero-copy"><p class="detail-kicker">{{ isOfficialPacer || isPacerPerson ? '赛事官方配速员' : item.type === 'pacer' ? '私人带跑' : '中国马拉松运动员' }}</p><h1>{{ item.name }}</h1><p v-if="item.nameEn" class="profile-en">{{ item.nameEn }}</p></div><div class="profile-portrait"><span aria-hidden="true">{{ isOfficialPacer ? '官兔' : item.name.slice(0,1) }}</span><img v-if="item.avatar || item.photo || (isOfficialPacer && item.coverUrl)" :src="item.avatar || item.photo || item.coverUrl" :alt="item.name + '照片'" @error="$event.target.hidden = true" /></div></div>
          <div class="pb-panel"><span>{{ isPacerPerson ? '官方配速 · 完赛目标' : isOfficialPacer ? (item.edition || '') + ' · 配速组别' : item.feature ? '全程马拉松 · PB' : item.seasonBest ? (item.seasonYear || meta.seasonYear || currentYear)+'赛季 · 最佳成绩' : '全程马拉松 · PB' }}</span><b>{{ isPacerPerson ? item.primaryTargetTime || item.targetTimes?.[0] || '官兔' : isOfficialPacer ? item.groupCount ? item.groupCount + ' 个配速组' : '官兔' : item.feature ? item.personalBest : item.seasonBest || item.personalBestDisplay || item.personalBest || '—' }}</b></div>
        </div>
        <div v-if="isPacerPerson && item.verifiedPacerRaceNames?.length" class="verified-races"><span>曾任官兔</span><b v-for="name in item.verifiedPacerRaceNames" :key="name">{{ name }}</b></div>
        <div v-if="isPacerPerson && raceBadges.length" class="race-badges profile-race-badges"><span v-for="(badge,index) in raceBadges" :key="badge.raceId + '-' + index" :class="{provisional:badge.status==='provisional'}">{{ badge.label || badge.raceName }} · {{ badge.status==='provisional' ? '入选公示' : badge.statusLabel || '已确认' }}</span></div>
        <template v-if="item.feature">
          <div class="feature-byline">赛道人物 · {{ item.feature.asOf }} 资料截止 · 约 {{ readingMinutes }} 分钟</div>
          <p class="feature-question">{{ item.feature.centralQuestion }}</p>
          <div class="reader-actions"><button type="button" @click="toggleSaved" :aria-pressed="saved">{{ saved ? '已收藏' : '收藏档案' }}</button><button type="button" @click="shareProfile">分享人物</button><span role="status">{{ actionMessage }}</span></div>
          <nav v-if="contents.length" class="article-contents" aria-label="文章目录"><b>本文目录</b><a v-for="entry in contents" :key="entry.i" :href="'#chapter-'+entry.i">{{ entry.text }}</a></nav>
          <figure v-if="item.feature.graphicUrl" class="career-graphic"><img :src="item.feature.graphicUrl" :alt="item.feature.graphicAlt" loading="lazy" /><figcaption>{{ item.feature.graphicCaption }}</figcaption></figure>
        </template>
        <section class="profile-article" aria-label="人物文章"><h2>{{ profileArticle.title }}</h2><p v-if="profileArticle.lead" class="profile-article-lead">{{ profileArticle.lead }}</p><div class="guide-md"><p v-for="b in profileBlocks" :key="b.i" :id="'chapter-'+b.i" :class="'md md-'+b.kind"><span v-if="b.mark" class="md-mark">{{ b.mark }}</span><template v-for="r in b.runs" :key="r.j"><a v-if="r.sourceId" class="inline-citation" :href="'#source-'+r.sourceId" :aria-label="'查看来源'+r.sourceId">{{ r.text }}</a><strong v-else-if="r.strong">{{ r.text }}</strong><template v-else>{{ r.text }}</template></template></p></div></section>
        <section v-if="item.birthDate || item.placeOfBirth || item.team" class="profile-section"><h2>个人资料</h2><div v-if="item.birthDate" class="profile-fact"><span>出生日期</span><b>{{ item.birthDate }}</b></div><div v-if="item.placeOfBirth" class="profile-fact"><span>籍贯</span><b>{{ item.placeOfBirth }}</b></div><div v-if="item.team" class="profile-fact"><span>所属队伍</span><b>{{ item.team }}</b></div></section>
        <template v-if="isPacerPerson">
          <div v-if="item.personalBest" class="profile-fact"><span>全马个人最佳</span><b>{{ item.personalBestDisplay || item.personalBest }}</b></div>
          <section v-if="assignments.length" class="profile-section"><h2>配速赛事</h2><article v-for="(assignment,index) in assignments" :key="assignment.raceId + '-' + index" class="pacer-assignment"><div class="assignment-heading"><span class="assignment-target">{{ assignment.targetTime || '官方配速员' }}<small v-if="assignment.targetTime">完赛组</small></span><span class="assignment-status">{{ assignment.status === 'provisional' ? '入选公示' : assignment.statusLabel || '已确认' }}</span></div><h3>{{ assignment.raceName }}</h3><p>{{ [assignment.raceDate,assignment.city,assignment.distanceLabel].filter(Boolean).join(' · ') }}</p><p v-if="assignment.pace">目标配速 {{ assignment.pace }} / km</p></article></section>
        </template>
        <template v-else-if="isOfficialPacer">
          <section v-if="item.pacerGroups?.length" class="profile-section"><h2>配速组别 <small>{{ item.pacerGroups.length }} 组</small></h2><div class="pacer-groups"><div v-for="group in item.pacerGroups" :key="group.label" class="pacer-group"><b class="pacer-group-title">{{ group.targetTime || group.label }}</b><span class="pacer-group-label">{{ group.label }}{{ group.pace ? ' · ' + group.pace + ' / km' : '' }}</span><p class="pacer-group-names">{{ group.names?.join('、') }}</p></div></div></section>
        </template>
        <template v-else>
          <div v-if="item.feature && item.pbRank" class="profile-fact"><span>现役全马 PB 榜</span><b>{{ item.gender === 'women' ? '女子' : '男子' }} #{{ item.pbRank }}</b></div>
          <div v-if="item.seasonRank && !item.feature" class="profile-fact"><span>{{ item.seasonYear || meta.seasonYear || currentYear }}赛季名次</span><b>{{ item.gender === 'women' ? '女子' : '男子' }} #{{ item.seasonRank }}</b></div>
          <div v-if="item.personalBest" class="profile-fact"><span>全马个人最佳</span><b>{{ item.personalBestDisplay || item.personalBest }}</b></div>
          <div v-if="item.eventName" class="profile-fact"><span>PB 赛事</span><b>{{ item.eventName }} · {{ item.eventDate }}</b></div>
          <section v-if="item.personalRecords?.length" class="profile-section"><h2>个人最好成绩</h2><div class="personal-records"><div v-for="record in item.personalRecords" :key="record.discipline" class="personal-record"><span>{{ record.discipline }}</span><b>{{ record.mark }}</b><small>{{ record.date }} · {{ record.venue }}</small></div></div></section>
          <section v-if="highlights.length" class="profile-section"><h2>代表性比赛</h2><div v-for="(h,i) in highlights" :key="i" class="evidence-card"><p>{{ h.date }} · {{ h.title }}<br />第 {{ h.position }} 名 · {{ h.result }}</p></div></section>
        </template>
        <section v-if="item.gallery?.length" class="profile-section"><h2>赛场影像</h2><figure v-for="photo in item.gallery" :key="photo.url" class="pacer-gallery-card"><img :src="photo.url" :alt="item.name + '赛场照片'" loading="lazy" /></figure></section>
      </template>
      <template v-else><p class="detail-kicker">{{ item.clubName || categoryName(item.category) }}</p><h1>{{ item.title }}</h1><div class="detail-meta"><span v-if="authorLabel">{{ authorLabel }}</span><time>{{ contentDate(item.publishedAt) }}</time></div><img v-if="item.coverUrl" class="detail-cover-photo" :src="item.coverUrl" alt="" @error="$event.target.hidden = true" /><p v-if="item.summary" class="detail-summary">{{ item.summary }}</p><div class="guide-md"><p v-for="b in blocks" :key="b.i" :class="'md md-'+b.kind"><span v-if="b.mark" class="md-mark">{{ b.mark }}</span><template v-for="r in b.runs" :key="r.j"><strong v-if="r.strong">{{ r.text }}</strong><template v-else>{{ r.text }}</template></template></p></div></template>
      <section v-if="isProfile && item.feature && profileSources.length" class="source-box" aria-label="事实来源"><h2>资料与出处</h2><p v-if="item.feature">{{ item.feature.evidenceNote }}</p><ol><li v-for="(source,index) in profileSources" :key="source.url" :id="'source-'+(source.id || index+1)"><a :href="source.url" target="_blank" rel="noopener noreferrer">[{{ source.id || index+1 }}] {{ source.title }}</a><small v-if="source.publishedAt"> · {{ source.publishedAt }}</small></li></ol><p v-if="item.avatarSourceUrl">人物照片来源：<a :href="item.avatarSourceUrl" target="_blank" rel="noopener noreferrer">{{ item.photoSourceTitle || '公开报道' }}</a></p></section>
      <router-link :to="backLink" class="detail-back">‹ 返回资讯列表</router-link>
    </article>
  </main>
</template>
<script setup>
import {computed,onBeforeUnmount,ref} from 'vue';
import {useRoute} from 'vue-router';
import {api} from '../api';
import {contentDate} from '../content-date';
import {parseGuide} from '../guide-md';
const route=useRoute(),item=ref(null),message=ref(''),meta=ref({});
const saved=ref(false),actionMessage=ref('');
const profileSources=computed(()=>(item.value?.sources||[]).filter(s=>safeSource(s.url)));
function safeSource(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}
const contents=computed(()=>profileBlocks.value.filter(b=>b.kind==='h2').map(b=>({i:b.i,text:b.runs.map(r=>r.text).join('')})));
const readingMinutes=computed(()=>Math.max(1,Math.ceil((profileArticle.value.body||'').replace(/\s/g,'').length/450)));
function savedIds(){try{const ids=JSON.parse(localStorage.getItem('marathon-athlete-saved')||'[]');return Array.isArray(ids)?ids:[];}catch{return [];}}
function toggleSaved(){try{const ids=new Set(savedIds());if(ids.has(item.value.id))ids.delete(item.value.id);else ids.add(item.value.id);localStorage.setItem('marathon-athlete-saved',JSON.stringify([...ids]));saved.value=ids.has(item.value.id);actionMessage.value=saved.value?'已保存在本设备':'已取消收藏';}catch{actionMessage.value='本设备暂时无法保存收藏';}}
async function shareProfile(){const data={title:profileArticle.value.title,url:window.location.href};try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(data.url);actionMessage.value='链接已复制';}}catch(e){if(e.name!=='AbortError')actionMessage.value='可复制浏览器地址分享';}}
const currentYear=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Shanghai'}).format(new Date()));
const isProfile=computed(()=>route.path.includes('/profiles/'));
const isOfficialPacer=computed(()=>item.value?.profileKind==='official_pacer_race');
const isPacerPerson=computed(()=>item.value?.profileKind==='official_pacer_person');
const assignments=computed(()=>item.value?.assignments||[]);
const raceBadges=computed(()=>item.value?.raceBadges||[]);
const profileArticle=computed(()=>item.value?.article?.body?item.value.article:{title:'认识 '+(item.value?.name||''),lead:'',body:item.value?.bio||''});
const profileBlocks=computed(()=>parseGuide(profileArticle.value.body).map(b=>({...b,runs:b.runs.flatMap(r=>r.text.split(/(\[S?\d+\]|〔\d+〕)/g).filter(Boolean).map((text,j)=>({...r,j:r.j+'-'+j,text,sourceId:/^(?:\[S?(\d+)\]|〔(\d+)〕)$/.test(text)?'S'+text.replace(/\D/g,''):''})))})));
const blocks=computed(()=>parseGuide(item.value?.body));
const highlights=computed(()=>item.value?.careerHighlights||item.value?.highlights||[]);
const authorLabel=computed(()=>item.value?.rights==='digest'?'跑圈编辑部':item.value?.category==='club'&&item.value?.rights==='original'?(item.value.authorName||item.value.author||item.value.clubName||item.value.source||''):'');
const backLink=computed(()=>isProfile.value?'/news?tab='+(item.value?.type||'athlete'):item.value?.clubId?'/clubs/'+item.value.clubId+'/news':'/news');
function categoryName(t){return({industry:'业界观察',club:'跑团来稿',stories:'跑者故事'})[t]||'跑圈资讯';}
let ticket=0,disposed=false;
async function load(){const seq=++ticket;message.value='';item.value=null;try{const d=await api('/content/'+(isProfile.value?'profiles/':'articles/')+encodeURIComponent(route.params.id));if(disposed||seq!==ticket)return;item.value=d.profile||d.article;meta.value=d.meta||{};saved.value=savedIds().includes(item.value?.id);}catch(e){if(!disposed&&seq===ticket)message.value='请稍后重试，或返回资讯列表浏览其他内容。';}}
onBeforeUnmount(()=>{disposed=true;ticket++;});
load();
</script>
<style scoped src="../journal.css"></style>
