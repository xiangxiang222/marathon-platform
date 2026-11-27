<template>
  <main class="journal-page journal-feed">
    <header class="journal-top"><router-link :to="clubId ? '/clubs/' + clubId : '/'" aria-label="返回">‹</router-link><span>{{ clubId ? '跑团资讯' : '跑圈资讯' }}</span><router-link v-if="clubId && canManage" :to="'/clubs/' + clubId + '/news/manage'" class="publish-link">发布</router-link><span v-else class="top-spacer" aria-hidden="true"></span></header>
    <section class="journal-intro"><img class="journal-art" :src="newsArt" alt="" /><h1>{{ journalTitle }}</h1></section>
    <section class="journal-service" aria-label="资讯检索">
      <nav v-if="!clubId" class="journal-tabs" aria-label="资讯栏目"><router-link v-for="t in tabs" :key="t.id" :to="{path:'/news',query:{tab:t.id}}" :class="{selected:tab===t.id}" :aria-current="tab===t.id?'page':undefined">{{ t.label }}</router-link></nav>
      <form class="journal-search" role="search" @submit.prevent="search"><span class="search-icon" aria-hidden="true"></span><input v-model="draftQuery" :aria-label="searchLabel" :placeholder="searchLabel" maxlength="80" /><button type="submit">搜索</button></form>
      <div v-if="query" class="journal-query"><p>关键词<strong>{{ query }}</strong></p><button type="button" aria-label="清除关键词" @click="clearQuery">清除</button></div>
    </section>
    <section class="journal-content">
      <div v-if="!clubId && tab === 'all'" class="journal-shortcuts">
        <router-link v-for="entry in profileEntries" :key="entry.id" :to="'/news?tab=' + entry.id" class="profile-entry">
          <span class="shortcut-kicker">{{ entry.kicker }}</span><b>{{ entry.title }}</b><small>{{ entry.description }}</small>
          <span class="shortcut-footer">
            <span v-if="previewPhotos[entry.id].length" class="shortcut-portraits"><span v-for="person in previewPhotos[entry.id]" :key="person.id" class="shortcut-portrait"><img :src="person.image" :alt="person.name + '照片'" @error="hidePreviewImage(entry.id, person.id)" /></span></span>
            <span v-else-if="entry.id === 'pacer' && previewTarget" class="shortcut-pace"><strong>{{ previewTarget }}</strong><span>完赛目标</span></span>
            <span class="shortcut-arrow" aria-hidden="true">↗</span>
          </span><span v-if="previewLabels[entry.id]" class="shortcut-specific">{{ previewLabels[entry.id] }}</span>
        </router-link>
      </div>
      <div class="section-caption"><h2>{{ clubId ? '跑团资讯' : tabs.find(t=>t.id===tab)?.heading }}</h2><span v-if="ready && !message && total">{{ total }} {{ tab === 'pacer' ? '位官兔' : isProfile ? '位运动员' : '篇内容' }}</span></div>
      <p v-if="tab === 'athlete'" class="athlete-season">现役人物专题 · 全程马拉松 PB</p>
      <div v-if="tab === 'athlete'" class="gender-tabs" aria-label="运动员性别"><button v-for="g in genders" :key="g.id" :class="{on:gender===g.id}" :aria-pressed="gender===g.id" type="button" @click="setGender(g.id)">{{ g.label }}</button></div>
      <details v-if="tab === 'athlete' && meta.rankingNotice" class="ranking-note"><summary>榜单口径与资料范围</summary><p>{{ meta.rankingNotice }}<br />{{ meta.activityRule }}</p></details>
      <div v-if="tab === 'pacer'" class="pacer-race-filter"><label for="pacer-race">配速赛事</label><select id="pacer-race" v-model="raceId" @change="setRace"><option value="">全部赛事</option><option v-for="race in raceFilters" :key="race.id" :value="race.id">{{ race.name }} · {{ race.count }} 位</option></select><button v-if="raceId || query" type="button" @click="resetPacerFilters">重置</button></div>
      <div v-if="message" class="journal-state" role="alert"><span class="state-icon" aria-hidden="true">!</span><b>内容暂时无法加载</b><p>{{ message }}</p><button type="button" @click="load">重新加载</button></div>
      <div v-else-if="!ready" class="journal-state" role="status"><span class="loading-dot" aria-hidden="true"></span>正在加载内容…</div>
      <template v-else>
        <div class="journal-list">
        <router-link v-for="(row,index) in rows" :key="row.id" :to="rowLink(row)" :class="['journal-row', { 'person-row': isProfile }]">
          <template v-if="isProfile">
            <span v-if="tab === 'athlete'" class="person-number" aria-hidden="true">{{ row.editorialOrigin === 'manual' && !row.seasonRank && !row.rank ? '—' : String(row.pbRank || row.seasonRank || row.rank || (page - 1) * 20 + index + 1).padStart(2,'0') }}</span>
            <span class="person-portrait"><span aria-hidden="true">{{ row.name.slice(0,1) }}</span><img v-if="row.avatar || row.photo" :src="row.avatar || row.photo" :alt="row.name + '头像'" loading="lazy" @error="$event.target.hidden = true" /></span>
            <div class="person-copy"><span class="row-kicker">{{ tab === 'pacer' ? (row.gender==='women'?'女子 · ':row.gender==='men'?'男子 · ':'')+'官方配速员' : (row.gender==='women'?'女子':'男子')+' · '+(row.editorialOrigin === 'manual' ? '运动员档案' : row.feature ? '人物专题 · PB榜' : (row.seasonYear || meta.seasonYear || currentYear)+'赛季') }}</span><h3>{{ row.name }}</h3><p v-if="tab !== 'pacer'" :class="{'feature-theme':row.feature}">{{ row.feature?.theme || row.seasonEventName || row.eventName || row.bio }}</p><template v-else><div v-if="row.raceBadges?.length" class="race-badges"><span v-for="(badge,bindex) in row.raceBadges" :key="badge.raceId + '-' + bindex" :class="{provisional:badge.status==='provisional'}">{{ badge.label || badge.raceName }} · {{ badge.status==='provisional' ? '入选公示' : badge.statusLabel || '已确认' }}</span></div><p v-else>{{ pacerRaceLabel(row) }}</p><p v-if="row.verifiedPacerRaceNames?.length" class="verified-race-label">曾任官兔 · {{ row.verifiedPacerRaceNames.join('、') }}</p></template></div>
            <div class="person-time"><b>{{ tab === 'pacer' ? row.primaryTargetTime || row.targetTimes?.[0] || '查看履历' : row.feature ? row.personalBest : row.seasonBest || row.personalBestDisplay || row.personalBest }}</b><small>{{ tab === 'pacer' ? '完赛目标' : row.feature ? '全马 PB' : row.seasonBest ? '赛季最佳' : '全马 PB' }}</small></div><span class="row-arrow" aria-hidden="true">›</span>
          </template>
          <template v-else><div class="article-copy"><span class="row-kicker">{{ row.raceName ? '赛事资讯' : categoryName(row.category) }}<i v-if="row.featured">精选</i></span><h3>{{ row.title }}</h3><p v-if="row.summary">{{ row.summary }}</p><div class="row-meta"><span>{{ row.raceName || authorLabel(row) }}</span><time>{{ contentDate(row.publishedAt) }}</time></div></div><img v-if="row.coverUrl" class="article-photo" :src="row.coverUrl" alt="" loading="lazy" @error="$event.target.hidden = true" /></template>
        </router-link>
        </div>
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
import newsArt from '../assets/quick/news.svg';
import Pager from '../components/Pager.vue';
const route=useRoute();
const currentYear=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Shanghai'}).format(new Date()));
const tabs=[{id:'all',label:'精选',heading:'精选资讯'},{id:'industry',label:'业界',heading:'业界动态'},{id:'athlete',label:'运动员',heading:'中国马拉松运动员档案'},{id:'pacer',label:'官兔',heading:'官方配速员档案'},{id:'club',label:'跑团',heading:'跑团故事'},{id:'race',label:'赛事',heading:'赛事资讯'}];
const profileEntries=[{id:'athlete',kicker:'中国马拉松',title:'运动员档案',description:'成绩履历与成长故事'},{id:'pacer',kicker:'A 类赛事',title:'官兔档案',description:'配速任务与参赛经历'}];
const previewPhotos=ref({athlete:[],pacer:[]}),previewTarget=ref(''),previewLabels=ref({athlete:'',pacer:''});
const previewLoaded={athlete:false,pacer:false};
let previewSeq=0;
function previewImage(value){
  return typeof value==='string'&&(/^\/marathon\/[\w/.-]+(?:[?#][^\s]*)?$/.test(value)||/^https:\/\/[^\s/@?#]+(?:[/?#][^\s]*)?$/i.test(value))?value:'';
}
function hidePreviewImage(type,id){
  previewPhotos.value={...previewPhotos.value,[type]:previewPhotos.value[type].filter(person=>person.id!==id)};
}
function loadPreviews(){
  const seq=++previewSeq;
  return Promise.allSettled(profileEntries.filter(entry=>!previewLoaded[entry.id]).map(async entry=>{
    const d=await api('/content/profiles?type='+entry.id+(entry.id==='athlete'?'&collection=china-marathon':'')+'&page=1&pageSize=6');
    if(disposed||seq!==previewSeq||clubId.value||tab.value!=='all')return;
    const people=(d.profiles||[]).filter(person=>person.type===entry.id);
    previewPhotos.value={...previewPhotos.value,[entry.id]:people.map(person=>({id:person.id,name:person.name,image:previewImage(person.avatar||person.photo)})).filter(person=>person.image).slice(0,3)};
    previewLabels.value={...previewLabels.value,[entry.id]:entry.id==='athlete'?[people[0]?.name,people[0]?.feature ? people[0]?.personalBest : people[0]?.seasonBest || people[0]?.personalBestDisplay || people[0]?.personalBest].filter(Boolean).join(' · '):people[0]?.assignments?.[0]?.raceName || people[0]?.verifiedPacerRaceNames?.[0] || people[0]?.name || ''};
    if(entry.id==='pacer')previewTarget.value=people.flatMap(person=>[person.primaryTargetTime,...(person.targetTimes||[])]).find(value=>/^\d:[0-5]\d(?::[0-5]\d)?$/.test(value||''))||'';
    previewLoaded[entry.id]=true;
  }));
}
const genders=[{id:'men',label:'男子'},{id:'women',label:'女子'}];
const clubId=computed(()=>route.params.id||'');
const tab=computed(()=>clubId.value?'club':tabs.some(t=>t.id===route.query.tab)?route.query.tab:'all');
const isProfile=computed(()=>['athlete','pacer'].includes(tab.value));
const rows=ref([]),page=ref(1),pages=ref(1),total=ref(0),ready=ref(false),message=ref(''),gender=ref('men'),draftQuery=ref(''),query=ref(''),meta=ref({}),clubName=ref(''),canManage=ref(false);
const journalTitle=computed(()=>clubId.value ? clubName.value || '跑团资讯' : ({race:'赛事资讯',athlete:'赛道人物',pacer:'官兔档案'})[tab.value] || '跑圈动态');
const searchLabel=computed(()=>({athlete:'搜索运动员姓名',pacer:'搜索赛事、配速组别或配速员'})[tab.value] || '搜索资讯标题');
const raceId=ref(''),raceFilters=ref([]);
let requestId=0;
async function load(){const seq=++requestId;ready.value=false;message.value='';rows.value=[];meta.value={};try{let path;
if(isProfile.value)path='/content/profiles?type='+tab.value+(tab.value==='athlete'?'&collection=china-marathon&gender='+gender.value:raceId.value?'&raceId='+encodeURIComponent(raceId.value):'');
else if(tab.value==='race')path='/news?';
else path='/content/articles?'+(clubId.value?'clubId='+encodeURIComponent(clubId.value):tab.value==='all'?'':'category='+tab.value);
const d=await api(path+(path.endsWith('?')?'':'&')+'page='+page.value+'&pageSize=20&q='+encodeURIComponent(query.value));if(seq!==requestId)return;
rows.value=d.profiles||d.articles||d.news||[];total.value=d.total||0;pages.value=d.pages||1;page.value=d.page||1;meta.value=d.meta||{};if(tab.value==='pacer'&&Array.isArray(d.meta?.raceFilters))raceFilters.value=d.meta.raceFilters;
}catch(e){if(seq===requestId)message.value='请稍后再试，或切换其他栏目继续浏览。';}finally{if(seq===requestId)ready.value=true;}}
function search(){query.value=draftQuery.value.trim();page.value=1;load();}
function clearQuery(){draftQuery.value='';search();}
function turnPage(n){page.value=n;load();}
function setGender(v){gender.value=v;page.value=1;load();}
function setRace(){page.value=1;load();}
function resetPacerFilters(){raceId.value='';query.value='';draftQuery.value='';page.value=1;load();}
function rowLink(r){return isProfile.value?'/news/profiles/'+r.id:tab.value==='race'?'/news/'+r.id:'/news/articles/'+r.id;}
function pacerRaceLabel(row){const assignments=row.assignments||[],first=assignments[0]?.raceName;return first?first+(assignments.length>1?' 等 '+(row.raceCount||assignments.length)+' 场赛事':''):row.role||'查看官方配速履历';}
function categoryName(v){return ({industry:'业界观察',club:'跑团来稿',stories:'跑者故事'})[v]||'跑圈资讯';}
function authorLabel(row){return row.rights==='digest'?'跑圈编辑部':row.category==='club'&&row.rights==='original'?(row.authorName||row.author||row.clubName||row.source||''):'';}
let disposed=false;
watch([tab,clubId],()=>{page.value=1;query.value='';draftQuery.value='';raceId.value='';raceFilters.value=[];previewSeq++;load();if(!clubId.value&&tab.value==='all')loadPreviews();},{immediate:true});
onBeforeUnmount(()=>{disposed=true;requestId++;previewSeq++;});
if(clubId.value)api('/clubs/'+clubId.value).then(d=>{if(disposed)return;clubName.value=d.club?.name||'';canManage.value=!!d.club?.staff;}).catch(()=>{});
</script>

<style scoped src="../journal.css"></style>

<style scoped>
.journal-feed{--journal-purple:#55388c;--journal-tint:#f3eefc;background:#f8f5fc;color:#22202a}
.journal-feed .journal-top{border:0;background:#e8def9;color:#22202a}.journal-feed .publish-link{color:var(--journal-purple);padding-left:8px}
.journal-feed .journal-intro{position:relative;isolation:isolate;padding:14px 20px 42px;color:#22202a;background:linear-gradient(115deg,#e8def9,#f8f5fc)}
.journal-art{position:absolute;right:14px;bottom:6px;z-index:-1;width:82px;height:82px;object-fit:contain;opacity:.2}
.journal-feed .journal-intro h1{margin:0;overflow-wrap:anywhere}
.journal-service{position:relative;margin:-24px 16px 16px;padding:10px;border-radius:20px;background:#fff;box-shadow:0 8px 25px #39276212}
.journal-service .journal-tabs{display:grid;grid-template-columns:repeat(6,minmax(44px,1fr));gap:0;margin:0 0 8px;border:0;border-radius:12px;background:var(--journal-tint)}
.journal-service .journal-tabs a{justify-content:center;min-height:44px;border-radius:12px;color:#514565;font-size:13px}
.journal-service .journal-tabs .selected{background:#e8def9;color:var(--journal-purple)}.journal-service .journal-tabs .selected:after{display:none}
.journal-service .journal-search{gap:8px;margin:0;padding:0 0 0 12px;border-radius:12px;background:#f8f5fc}
.journal-service .journal-search button{align-self:stretch;border-radius:12px;background:linear-gradient(110deg,#7453b5,#55388c)}
.journal-query{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0 0;padding-left:8px;color:var(--journal-purple)}
.journal-query p{min-width:0;margin:0;overflow-wrap:anywhere;font-size:13px;line-height:1.5}.journal-query strong{margin-left:6px;font-weight:600}
.journal-query button{flex:none;min-width:44px;min-height:44px;padding:0 5px;color:var(--journal-purple);font-size:13px}
.journal-feed .journal-content,.journal-feed .journal-list{background:transparent}
.journal-feed .journal-list{display:grid;gap:8px;padding:0;border-radius:0}
.journal-feed .journal-list:empty{display:none}
.journal-feed .journal-row{padding:13px 14px;border:1px solid #eae5f0;border-radius:16px;background:#fff}
.journal-feed .journal-row h3{display:block;overflow:visible;font-size:16px;font-weight:600}
.journal-feed :is(.row-kicker,.row-meta,.journal-row p,.section-caption>span,.shortcut-specific){color:#514565}
.journal-feed .row-meta>span{white-space:normal;overflow-wrap:anywhere}.journal-feed .row-kicker i{background:var(--journal-tint);color:var(--journal-purple)}
.journal-feed .profile-entry{min-height:146px;border:1px solid #eae5f0}.journal-feed .shortcut-kicker,.journal-feed .shortcut-arrow{color:var(--journal-purple)}.journal-feed .shortcut-kicker:before{background:var(--journal-purple)}
.journal-feed .journal-state{border-radius:16px;background:#fff}.journal-feed .journal-state :is(a,button){color:var(--journal-purple)}
.journal-feed .ranking-note{margin:0 0 8px;padding:0 12px;border:0;border-radius:12px;color:var(--journal-purple)}
.journal-feed .ranking-note summary{min-height:44px;line-height:44px;cursor:pointer}.journal-feed .ranking-note p{margin:0;padding-bottom:10px;overflow-wrap:anywhere}
.journal-feed :is(a,button):focus-visible,.journal-feed .journal-search:focus-within{outline:2px solid var(--journal-purple);outline-offset:2px}
@media(max-width:319px){.journal-service .journal-tabs{grid-template-columns:repeat(3,minmax(44px,1fr))}}

</style>
