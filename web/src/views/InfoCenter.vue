<template>
  <main class="journal-page">
    <header class="journal-top"><router-link :to="clubId ? '/clubs/' + clubId : '/'" aria-label="返回">‹</router-link><span>{{ clubId ? '跑团资讯' : '跑圈资讯' }}</span><router-link v-if="clubId && canManage" :to="'/clubs/' + clubId + '/news/manage'" class="publish-link">发布</router-link><span v-else class="top-spacer" aria-hidden="true"></span></header>
    <section class="journal-intro"><h1>{{ clubId ? (clubName || '跑团资讯') : '跑圈动态' }}</h1><p>{{ clubId ? '团练记录、赛事回顾和团友的故事' : '关注赛道上的人，也关注跑圈新鲜事' }}</p><form class="journal-search" role="search" @submit.prevent="search"><span class="search-icon" aria-hidden="true"></span><input v-model="draftQuery" :aria-label="isProfile ? '搜索人物姓名' : '搜索资讯标题'" :placeholder="isProfile ? '搜索人物姓名' : '搜索资讯、赛事和跑团故事'" maxlength="80" /><button type="submit">搜索</button></form></section>
    <section class="journal-content">
      <nav v-if="!clubId" class="journal-tabs" aria-label="资讯栏目"><router-link v-for="t in tabs" :key="t.id" :to="{path:'/news',query:{tab:t.id}}" :class="{selected:tab===t.id}" :aria-current="tab===t.id?'page':undefined">{{ t.label }}</router-link></nav>
      <div v-if="!clubId && tab === 'all'" class="journal-shortcuts"><router-link to="/news?tab=athlete"><b>运动员档案</b><img :src="artworkRoot + 'art-medal.png'" alt="奖牌小插画" /><small>中国男女全马 PB</small></router-link><router-link to="/news?tab=pacer"><b>认识私兔</b><img :src="artworkRoot + 'art-shoe.png'" alt="跑鞋小插画" /><small>带跑经历与故事</small></router-link></div>
      <div class="section-caption"><h2>{{ clubId ? '跑团资讯' : tabs.find(t=>t.id===tab)?.heading }}</h2><span v-if="ready && !message && total">{{ total }} {{ isProfile ? '位人物' : '篇内容' }}</span></div>
      <div v-if="tab === 'athlete'" class="gender-tabs" aria-label="运动员性别"><button v-for="g in genders" :key="g.id" :class="{on:gender===g.id}" type="button" @click="setGender(g.id)">{{ g.label }}</button><span>全马 · 个人最佳</span></div>
      <p v-if="isProfile && ready && !message && rows.length && rankingNote" class="ranking-note">{{ rankingNote }}</p>
      <div v-if="message" class="journal-state" role="alert"><span class="state-icon" aria-hidden="true">!</span><b>内容暂时无法加载</b><p>{{ message }}</p><button type="button" @click="load">重新加载</button></div>
      <div v-else-if="!ready" class="journal-state" role="status"><span class="loading-dot" aria-hidden="true"></span>正在加载内容…</div>
      <template v-else>
        <router-link v-for="(row,index) in rows" :key="row.id" :to="rowLink(row)" :class="['journal-row', { 'person-row': isProfile }]">
          <template v-if="isProfile"><span :class="['person-number', { 'pacer-avatar': tab === 'pacer' }]" aria-hidden="true">{{ tab === 'pacer' ? row.name.slice(0,1) : row.rank ? String(row.rank).padStart(2,'0') : String((page-1)*20+index+1).padStart(2,'0') }}</span><div class="person-copy"><span class="row-kicker">{{ tab === 'pacer' ? '私兔档案' : (row.gender==='women'?'女子':'男子')+' · 中国马拉松' }}</span><h3>{{ row.name }}</h3><p>{{ row.eventName || row.role || row.bio || '公开比赛与带跑经历' }}</p></div><div class="person-time"><b>{{ row.personalBestDisplay || row.personalBest || '查看档案' }}</b><small>{{ row.personalBestDisplay || row.personalBest ? '全马 PB' : '公开履历' }}</small></div><span class="row-arrow" aria-hidden="true">›</span></template>
          <template v-else><div class="article-copy"><span class="row-kicker">{{ row.raceName ? '赛事资讯' : categoryName(row.category) }}<i v-if="row.featured">精选</i></span><h3>{{ row.title }}</h3><p v-if="row.summary">{{ row.summary }}</p><div class="row-meta"><span>{{ row.source || row.clubName || '跑圈资讯' }}</span><time>{{ (row.publishedAt || '').slice(0,10) }}</time></div></div><span class="article-cover" aria-hidden="true"><b>{{ row.raceName ? '赛事' : row.category === 'club' ? '跑团' : '跑圈' }}</b><span></span><span></span><span></span></span></template>
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
import Pager from '../components/Pager.vue';
const route=useRoute();
const artworkRoot=import.meta.env.BASE_URL+'images/';
const tabs=[{id:'all',label:'精选',heading:'精选资讯'},{id:'industry',label:'业界',heading:'业界动态'},{id:'athlete',label:'运动员',heading:'中国马拉松运动员'},{id:'pacer',label:'私兔',heading:'私兔人物档案'},{id:'club',label:'跑团',heading:'跑团故事'},{id:'race',label:'赛事',heading:'赛事资讯'}];
const genders=[{id:'men',label:'男子'},{id:'women',label:'女子'}];
const clubId=computed(()=>route.params.id||'');
const tab=computed(()=>clubId.value?'club':tabs.some(t=>t.id===route.query.tab)?route.query.tab:'all');
const isProfile=computed(()=>['athlete','pacer'].includes(tab.value));
const rows=ref([]),page=ref(1),pages=ref(1),total=ref(0),ready=ref(false),message=ref(''),gender=ref('men'),draftQuery=ref(''),query=ref(''),meta=ref({}),clubName=ref(''),canManage=ref(false);
const rankingNote=computed(()=>tab.value==='pacer'?(meta.value.rankingNote||meta.value.rankingNotice||'按公开带跑经历收录，展示顺序不代表全国排名；私兔与赛事官方配速员会分别说明。'):(meta.value.rankingNotice||meta.value.rankingBasis||'按中国运动员全马个人最佳成绩整理；以收录榜单快照为准，非实时世界积分排名。'));
let requestId=0;
async function load(){const seq=++requestId;ready.value=false;message.value='';rows.value=[];meta.value={};try{let path;
if(isProfile.value)path='/content/profiles?type='+tab.value+(tab.value==='athlete'?'&gender='+gender.value:'');
else if(tab.value==='race')path='/news?';
else path='/content/articles?'+(clubId.value?'clubId='+encodeURIComponent(clubId.value):tab.value==='all'?'':'category='+tab.value);
const d=await api(path+(path.endsWith('?')?'':'&')+'page='+page.value+'&pageSize=20&q='+encodeURIComponent(query.value));if(seq!==requestId)return;
rows.value=d.profiles||d.articles||d.news||[];total.value=d.total||0;pages.value=d.pages||1;page.value=d.page||1;meta.value=d.meta||{};
}catch(e){if(seq===requestId)message.value='请稍后再试，或切换其他栏目继续浏览。';}finally{if(seq===requestId)ready.value=true;}}
function search(){query.value=draftQuery.value.trim();page.value=1;load();}
function turnPage(n){page.value=n;load();}
function setGender(v){gender.value=v;page.value=1;load();}
function rowLink(r){return isProfile.value?'/news/profiles/'+r.id:tab.value==='race'?'/news/'+r.id:'/news/articles/'+r.id;}
function categoryName(v){return ({industry:'业界观察',club:'跑团来稿',stories:'跑者故事'})[v]||'跑圈资讯';}
watch([tab,clubId],()=>{page.value=1;query.value='';draftQuery.value='';load();},{immediate:true});
let disposed=false;
onBeforeUnmount(()=>{disposed=true;requestId++;});
if(clubId.value)api('/clubs/'+clubId.value).then(d=>{if(disposed)return;clubName.value=d.club?.name||'';canManage.value=!!d.club?.staff;}).catch(()=>{});
</script>

<style scoped src="../journal.css"></style>
