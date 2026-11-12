<template>
  <main class="journal-page">
    <header class="journal-top"><router-link :to="clubId ? '/clubs/' + clubId : '/'" aria-label="返回">‹</router-link><span>{{ clubId ? '跑团资讯' : '跑圈资讯' }}</span><router-link v-if="clubId && canManage" :to="'/clubs/' + clubId + '/news/manage'" class="publish-link">发布</router-link><span v-else class="top-spacer" aria-hidden="true"></span></header>
    <section class="journal-intro"><h1>{{ clubId ? (clubName || '跑团资讯') : '跑圈动态' }}</h1><p>{{ clubId ? '团练记录、赛事回顾和团友的故事' : '关注赛道上的人，也关注跑圈新鲜事' }}</p><form class="journal-search" role="search" @submit.prevent="search"><span class="search-icon" aria-hidden="true"></span><input v-model="draftQuery" :aria-label="isProfile ? tab === 'pacer' ? '搜索赛事、配速组别或配速员' : '搜索运动员姓名' : '搜索资讯标题'" :placeholder="isProfile ? tab === 'pacer' ? '搜索赛事、配速组别或配速员' : '搜索运动员姓名' : '搜索资讯、赛事和跑团故事'" maxlength="80" /><button type="submit"><span>搜索</span></button></form></section>
    <section class="journal-content">
      <nav v-if="!clubId" class="journal-tabs" aria-label="资讯栏目"><router-link v-for="t in tabs" :key="t.id" :to="{path:'/news',query:{tab:t.id}}" :class="{selected:tab===t.id}" :aria-current="tab===t.id?'page':undefined">{{ t.label }}</router-link></nav>
      <div v-if="!clubId && tab === 'all'" class="journal-shortcuts"><router-link to="/news?tab=athlete"><b>运动员档案</b><span class="shortcut-arrow" aria-hidden="true">›</span><small>当年男女各 100 位</small></router-link><router-link to="/news?tab=pacer"><b>官兔档案</b><span class="shortcut-arrow" aria-hidden="true">›</span><small>认识 A 类赛事配速员</small></router-link></div>
      <div class="section-caption"><h2>{{ clubId ? '跑团资讯' : tabs.find(t=>t.id===tab)?.heading }}</h2><span v-if="ready && !message && total">{{ total }} {{ tab === 'pacer' ? '位官兔' : isProfile ? '位运动员' : '篇内容' }}</span></div>
      <p v-if="tab === 'athlete'" class="athlete-season">{{ meta.seasonYear || currentYear }}赛季 · 全程马拉松</p>
      <div v-if="tab === 'athlete'" class="gender-tabs" aria-label="运动员性别"><button v-for="g in genders" :key="g.id" :class="{on:gender===g.id}" :aria-pressed="gender===g.id" type="button" @click="setGender(g.id)">{{ g.label }}</button></div>
      <div v-if="tab === 'pacer'" class="pacer-race-filter"><label for="pacer-race">配速赛事</label><select id="pacer-race" v-model="raceId" @change="setRace"><option value="">全部赛事</option><option v-for="race in raceFilters" :key="race.id" :value="race.id">{{ race.name }} · {{ race.count }} 位</option></select><button v-if="raceId || query" type="button" @click="resetPacerFilters">重置</button></div>
      <div v-if="message" class="journal-state" role="alert"><span class="state-icon" aria-hidden="true">!</span><b>内容暂时无法加载</b><p>{{ message }}</p><button type="button" @click="load">重新加载</button></div>
      <div v-else-if="!ready" class="journal-state" role="status"><span class="loading-dot" aria-hidden="true"></span>正在加载内容…</div>
      <template v-else>
        <router-link v-for="(row,index) in rows" :key="row.id" :to="rowLink(row)" :class="['journal-row', { 'person-row': isProfile }]">
          <template v-if="isProfile">
            <span v-if="tab === 'athlete'" class="person-number" aria-hidden="true">{{ row.editorialOrigin === 'manual' && !row.seasonRank && !row.rank ? '—' : String(row.seasonRank || row.rank || (page - 1) * 20 + index + 1).padStart(2,'0') }}</span>
            <span class="person-portrait"><span aria-hidden="true">{{ row.name.slice(0,1) }}</span><img v-if="row.avatar || row.photo" :src="row.avatar || row.photo" :alt="row.name + '头像'" loading="lazy" @error="$event.target.hidden = true" /></span>
            <div class="person-copy"><span class="row-kicker">{{ tab === 'pacer' ? (row.gender==='women'?'女子 · ':row.gender==='men'?'男子 · ':'')+'官方配速员' : (row.gender==='women'?'女子':'男子')+' · '+(row.editorialOrigin === 'manual' ? '运动员档案' : (row.seasonYear || meta.seasonYear || currentYear)+'赛季') }}</span><h3>{{ row.name }}</h3><p v-if="tab !== 'pacer'">{{ row.seasonEventName || row.eventName || row.bio }}</p><template v-else><div v-if="row.raceBadges?.length" class="race-badges"><span v-for="(badge,bindex) in row.raceBadges" :key="badge.raceId + '-' + bindex" :class="{provisional:badge.status==='provisional'}">{{ badge.label || badge.raceName }} · {{ badge.status==='provisional' ? '入选公示' : badge.statusLabel || '已确认' }}</span></div><p v-else>{{ pacerRaceLabel(row) }}</p><p v-if="row.verifiedPacerRaceNames?.length" class="verified-race-label">曾任官兔 · {{ row.verifiedPacerRaceNames.join('、') }}</p></template></div>
            <div class="person-time"><b>{{ tab === 'pacer' ? row.primaryTargetTime || row.targetTimes?.[0] || '查看履历' : row.seasonBest || row.personalBestDisplay || row.personalBest }}</b><small>{{ tab === 'pacer' ? '完赛目标' : row.seasonBest ? '赛季最佳' : '全马 PB' }}</small></div><span class="row-arrow" aria-hidden="true">›</span>
          </template>
          <template v-else><div class="article-copy"><span class="row-kicker">{{ row.raceName ? '赛事资讯' : categoryName(row.category) }}<i v-if="row.featured">精选</i></span><h3>{{ row.title }}</h3><p v-if="row.summary">{{ row.summary }}</p><div class="row-meta"><span>{{ authorLabel(row) }}</span><time>{{ contentDate(row.publishedAt) }}</time></div></div><img v-if="row.coverUrl" class="article-photo" :src="row.coverUrl" alt="" loading="lazy" @error="$event.target.hidden = true" /></template>
        </router-link>
        <div v-if="!rows.length" class="journal-state"><span class="state-icon" aria-hidden="true">＋</span><b>{{ query ? '还没找到相关内容' : clubId ? '还没有发布跑团资讯' : isProfile ? '人物资料正在整理' : '这个栏目还没有新内容' }}</b><p>{{ query ? '换一个关键词试试。' : clubId ? '分享团练心得、赛事回顾或公众号好文。' : '稍后再来看看，或先逛逛其他栏目。' }}</p><router-link v-if="clubId && canManage" :to="'/clubs/'+clubId+'/news/manage'">发布第一篇</router-link><router-link v-else-if="!isProfile && !clubId" to="/news?tab=athlete">浏览运动员档案</router-link></div>
        <Pager :page="page" :pages="pages" @update:page="turnPage" />
      </template>
    </section>
  </main>
</template>

<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {useRoute} from 'vue-router';
import {api} from '../api';
import {contentDate} from '../content-date';
import Pager from '../components/Pager.vue';
const route=useRoute();
const currentYear=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Shanghai'}).format(new Date()));
const tabs=[{id:'all',label:'精选',heading:'精选资讯'},{id:'industry',label:'业界',heading:'业界动态'},{id:'athlete',label:'运动员',heading:'中国马拉松运动员'},{id:'pacer',label:'官兔',heading:'官方配速员档案'},{id:'club',label:'跑团',heading:'跑团故事'},{id:'race',label:'赛事',heading:'赛事资讯'}];
const genders=[{id:'men',label:'男子'},{id:'women',label:'女子'}];
const clubId=computed(()=>route.params.id||'');
const tab=computed(()=>clubId.value?'club':tabs.some(t=>t.id===route.query.tab)?route.query.tab:'all');
const isProfile=computed(()=>['athlete','pacer'].includes(tab.value));
const rows=ref([]),page=ref(1),pages=ref(1),total=ref(0),ready=ref(false),message=ref(''),gender=ref('men'),draftQuery=ref(''),query=ref(''),meta=ref({}),clubName=ref(''),canManage=ref(false);
const raceId=ref(''),raceFilters=ref([]);
let requestId=0;
async function load(){const seq=++requestId;ready.value=false;message.value='';rows.value=[];meta.value={};try{let path;
if(isProfile.value)path='/content/profiles?type='+tab.value+(tab.value==='athlete'?'&gender='+gender.value:raceId.value?'&raceId='+encodeURIComponent(raceId.value):'');
else if(tab.value==='race')path='/news?';
else path='/content/articles?'+(clubId.value?'clubId='+encodeURIComponent(clubId.value):tab.value==='all'?'':'category='+tab.value);
const d=await api(path+(path.endsWith('?')?'':'&')+'page='+page.value+'&pageSize=20&q='+encodeURIComponent(query.value));if(seq!==requestId)return;
rows.value=d.profiles||d.articles||d.news||[];total.value=d.total||0;pages.value=d.pages||1;page.value=d.page||1;meta.value=d.meta||{};if(tab.value==='pacer'&&Array.isArray(d.meta?.raceFilters))raceFilters.value=d.meta.raceFilters;
}catch(e){if(seq===requestId)message.value='请稍后再试，或切换其他栏目继续浏览。';}finally{if(seq===requestId)ready.value=true;}}
function search(){query.value=draftQuery.value.trim();page.value=1;load();}
function turnPage(n){page.value=n;load();}
function setGender(v){gender.value=v;page.value=1;load();}
function setRace(){page.value=1;load();}
function resetPacerFilters(){raceId.value='';query.value='';draftQuery.value='';page.value=1;load();}
function rowLink(r){return isProfile.value?'/news/profiles/'+r.id:tab.value==='race'?'/news/'+r.id:'/news/articles/'+r.id;}
function pacerRaceLabel(row){const assignments=row.assignments||[],first=assignments[0]?.raceName;return first?first+(assignments.length>1?' 等 '+(row.raceCount||assignments.length)+' 场赛事':''):row.role||'查看官方配速履历';}
function categoryName(v){return ({industry:'业界观察',club:'跑团来稿',stories:'跑者故事'})[v]||'跑圈资讯';}
function authorLabel(row){return row.rights==='digest'?'跑圈编辑部':row.category==='club'&&row.rights==='original'?(row.authorName||row.author||row.clubName||row.source||''):'';}
watch([tab,clubId],()=>{page.value=1;query.value='';draftQuery.value='';raceId.value='';raceFilters.value=[];load();},{immediate:true});
let disposed=false;
onBeforeUnmount(()=>{disposed=true;requestId++;});
if(clubId.value)api('/clubs/'+clubId.value).then(d=>{if(disposed)return;clubName.value=d.club?.name||'';canManage.value=!!d.club?.staff;}).catch(()=>{});
</script>

<style scoped src="../journal.css"></style>
