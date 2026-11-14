<template>
  <main class="archive-page">
    <header class="archive-header"><router-link :to="directoryTo" aria-label="返回赛事档案目录">‹</router-link><span>年度赛事档案</span><router-link :to="directoryTo" class="archive-header-directory">目录</router-link></header>
    <div v-if="error" class="archive-state" role="alert"><p>{{ error }}</p><button type="button" class="archive-secondary" @click="load">重新加载</button><router-link class="archive-text-link" :to="directoryTo">返回赛事目录</router-link></div>
    <p v-else-if="loading" class="archive-state" role="status">正在加载年度档案…</p>
    <template v-else-if="race && archive">
      <section class="archive-intro archive-event-hero"><img v-if="landmarkUrl" class="archive-hero-landmark" :src="landmarkUrl" alt="" width="96" height="80" /><span class="archive-kicker">{{ race.city }} · {{ race.shortName }}</span><h1>{{ race.name }}</h1><p>{{ race.tagline }}</p><div class="archive-badges" aria-label="最近核验的认证，适用年份见标签"><span>世界田联 {{ certification(race.worldAthletics) }}</span><span>中国田协 {{ certification(race.caa) }}</span></div></section>
      <div class="archive-edition-bar"><label>年度档案<select v-model="year" aria-label="选择档案年份" @change="chooseYear"><option v-for="y in years" :key="y" :value="y">{{ y }} 年</option></select></label><span>{{ edition?.date || '比赛日期待核验' }}</span></div>
      <nav class="archive-tabs" aria-label="档案栏目"><button v-for="t in tabs" :key="t.id" type="button" :class="{selected:tab===t.id}" :aria-pressed="tab===t.id" @click="chooseTab(t.id)">{{ t.label }}</button></nav>
      <div class="archive-body archive-detail-body">
        <router-link v-if="fromRace" class="archive-return" :to="'/races/'+fromRace.id"><span><small>你正在了解这场报名赛事</small><strong>{{ fromRace.name }}</strong></span><span aria-hidden="true">›</span></router-link>
        <p v-if="!edition" class="archive-state">该年度资料尚未收录。</p>
        <template v-else>
          <template v-if="tab==='overview'">

            <section v-if="edition.logistics?.tips?.length" class="archive-panel"><h2>本届跑前提醒</h2><article v-for="tip in edition.logistics.tips" :key="tip.title" class="archive-editorial"><h3>{{ tip.title }}</h3><p>{{ tip.body }}</p></article></section>
            <section class="archive-panel"><h2>关于这场比赛</h2><p class="archive-prose">{{ archive.intro || race.summary || race.tagline }}</p><dl class="archive-facts"><div><dt>档案年份</dt><dd>{{ year }} 年</dd></div><div><dt>比赛日期</dt><dd>{{ edition.date || '待核验' }}</dd></div><div><dt>比赛项目</dt><dd>{{ edition.distance || '待核验' }}</dd></div></dl></section><section v-if="archive.highlights?.length" class="archive-panel"><h2>跑之前，先了解</h2><div v-for="h in archive.highlights" :key="h.title" class="archive-editorial"><h3>{{ h.title }}</h3><p>{{ h.body }}</p></div></section><section v-if="edition.notes?.length" class="archive-panel"><h2>{{ year }} 年资料说明</h2><p v-for="note in edition.notes" :key="note" class="archive-prose">{{ note }}</p></section>            <section v-if="edition.coverage" class="archive-panel archive-coverage"><h2>继续了解</h2><div class="archive-coverage-links"><button v-for="section in edition.coverage.available" :key="section.id" type="button" :aria-label="'查看'+section.label+'资料'" @click="chooseTab(section.id)">{{ section.label }} <span aria-hidden="true">›</span></button></div><details v-if="edition.coverage.missing.length"><summary>收录说明 · {{ edition.coverage.missing.length }} 项资料待核验</summary><p class="archive-caption">{{ edition.coverage.missing.join('、') }}。取得可靠来源后补充。</p></details><p v-if="edition.coverage.upcoming" class="archive-caption">本届尚未举行，起跑、完赛人数及成绩待赛后收录。</p></section></template>
          <template v-if="tab==='route'">
            <section class="archive-panel"><div class="archive-section-heading"><h2>{{ year }} 年赛道</h2><span>42.195 km</span></div>
              <div class="archive-route-terminals"><div><span class="archive-route-dot">起</span><small>起点</small><strong>{{ edition.route?.start || '待核验' }}</strong></div><div><span class="archive-route-dot finish">终</span><small>终点</small><strong>{{ edition.route?.finish || '待核验' }}</strong></div></div>
              <ol v-if="routeStages.length" class="archive-road-order" aria-label="比赛道路顺序"><li v-for="(stage,index) in routeStages" :key="index"><span>{{ String(index+1).padStart(2,'0') }}</span><p>{{ stage }}</p></li></ol>
              <p v-else class="archive-prose">{{ edition.route?.summary || '本届路线资料整理中。' }}</p>
              <p v-if="routeStages.length" class="archive-caption">按比赛道路顺序整理，非导航地图。</p>
              <a v-if="safeUrl(edition.route?.mapUrl) && !failedImage('route')" class="archive-map-link" :href="edition.route.mapUrl" target="_blank" rel="noopener noreferrer"><img :src="edition.route.mapUrl" :alt="year+'年'+race.name+'路线图'" @error="markImageFailed('route')" /><span>放大路线图 ↗</span></a><p v-if="edition.route?.mapUrl && edition.route.mediaRights?.attribution" class="archive-caption">{{ edition.route.mediaRights.attribution }}</p>
            </section>
            <section v-if="edition.route?.changes || edition.route?.analysis?.length" class="archive-panel"><h2>路线变化与跑法参考</h2><p v-if="edition.route.changes" class="archive-prose">{{ edition.route.changes }}</p><p v-for="(line,i) in edition.route.analysis||[]" :key="i" class="archive-prose">{{ line }}</p><p class="archive-caption">跑法分析为编辑参考。</p></section>
          </template>
          <template v-if="tab==='registration'"><section class="archive-panel"><h2>{{ year }} 年报名与中签</h2><p class="archive-prose">{{ edition.registration?.method || '报名方式待核验' }}</p><dl class="archive-facts"><div v-for="f in registrationFacts" :key="f.label"><dt>{{ f.label }}</dt><dd>{{ f.value }}</dd></div></dl><p v-if="edition.registration?.lotteryNote" class="archive-callout">{{ edition.registration.lotteryNote }}</p><p v-if="edition.registration?.note" class="archive-prose">{{ edition.registration.note }}</p></section><section class="archive-panel"><h2>历年中签情况</h2><p class="archive-caption">报名人数、抽签池与参赛规模口径不同。缺失数据不参与推算，中签率仅展示已核验公布值。</p><div v-if="lotteryColumns.length" class="archive-table-scroll" tabindex="0" role="region" aria-label="历年报名中签表，可横向滚动"><table class="archive-table" :style="{minWidth:(70+lotteryColumns.length*160)+'px'}"><thead><tr><th>年份</th><th v-for="column in lotteryColumns" :key="column.key">{{ column.label }}</th></tr></thead><tbody><tr v-for="e in editions" :key="e.year" :class="{current:String(e.year)===year}"><th><button type="button" @click="setYear(String(e.year))">{{ e.year }}</button></th><td v-for="column in lotteryColumns" :key="column.key">{{ e.registration?.[column.key] || '—' }}</td></tr></tbody></table></div><p v-else class="archive-caption">暂未收录历年公开统计。</p><p class="archive-caption">选择年份查看对应口径说明。</p></section></template>
          <template v-if="tab==='logistics'">
            <section class="archive-panel"><h2>{{ year }} 年参赛指南</h2><p class="archive-caption">以下为这一届的领物与比赛日安排；历年交通管制、开放入口及服务不自动沿用到下一届。时间均为北京时间。</p><p v-if="!logisticsSections.length" class="archive-prose">本届领物、交通与比赛日服务尚无已收录资料。</p></section>
            <section v-for="section in logisticsSections" :key="section.id" class="archive-panel"><h2>{{ section.title }}</h2><dl class="archive-facts"><div v-for="field in section.fields" :key="field.label"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></div></dl></section>
          </template>
          <template v-if="tab==='participation'"><section class="archive-panel"><h2>{{ year }} 年参赛与完赛</h2><dl class="archive-facts"><div v-for="f in participationFacts" :key="f.label"><dt>{{ f.label }}</dt><dd>{{ f.value }}</dd></div></dl><p v-if="edition.participation?.note" class="archive-prose">{{ edition.participation.note }}</p></section><section class="archive-panel"><h2>本届成绩</h2><p v-if="!edition.results?.length" class="archive-prose">暂无本届已核验成绩。</p><div v-for="(r,i) in edition.results||[]" :key="i" class="archive-result"><div><strong>{{ r.group }}</strong><span>{{ r.athlete }}</span><small>{{ r.timing || '计时口径待核验' }}</small></div><b>{{ r.time }}</b></div></section></template>
          <template v-if="tab==='gear'"><section class="archive-panel"><h2>{{ year }} 年赛事物品</h2><p class="archive-caption">把属于这一年的参赛包、完赛包、参赛服与奖牌，逐件留存。</p><p v-if="!edition.gear?.length" class="archive-prose">本届赛事物品资料尚未核验收录。</p><article v-for="(g,i) in edition.gear||[]" :key="i" class="archive-gear"><div class="archive-gear-heading"><span class="archive-gear-number" aria-hidden="true">{{ String(i+1).padStart(2,'0') }}</span><span class="archive-kicker">{{ g.category }}</span></div><h3>{{ g.name || g.category }}</h3><p>{{ g.description }}</p><a v-if="safeUrl(g.imageUrl) && !failedImage('gear-'+i)" class="archive-gear-image" :href="g.imageUrl" target="_blank" rel="noopener noreferrer"><img :src="g.imageUrl" :alt="year+'年'+race.name+' '+(g.name||g.category)" loading="lazy" @error="markImageFailed('gear-'+i)" /><span>查看物品大图 ↗</span></a><p v-if="failedImage('gear-'+i)" class="archive-caption">图片暂时无法显示。</p><ul v-if="g.items?.length" class="archive-items"><li v-for="item in g.items" :key="item">{{ item }}</li></ul><p v-if="g.imageUrl && g.mediaRights?.attribution" class="archive-caption">{{ g.mediaRights.attribution }}</p></article></section></template>
          <template v-if="tab==='stories'"><section class="archive-panel"><h2>赛道之外的故事</h2><p class="archive-caption">这里保留有公开出处的赛事掌故与城市记忆。</p><p v-if="!archive.stories?.length" class="archive-prose">赛事故事整理中。</p><article v-for="(s,i) in archive.stories||[]" :key="i" class="archive-editorial"><h3>{{ s.title }}</h3><p>{{ s.body }}</p></article></section></template>
        </template>

        <section v-if="relatedRaces.length" class="archive-panel"><h2>单届赛事与报名信息</h2><router-link v-for="r in relatedRaces" :key="r.id" class="archive-related" :to="'/races/'+r.id"><span><strong>{{ r.name }}</strong><small>{{ r.raceDate }}</small></span><span aria-hidden="true">›</span></router-link></section>
        <p class="archive-caption archive-updated">资料更新 {{ archive.updatedAt || '整理中' }} · 不同年份的资料分别记录</p>
      </div>
    </template>
  </main>
</template>
<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {api} from '../api';
const route=useRoute(),router=useRouter(),race=ref(null),archive=ref(null),relatedRaces=ref([]),years=ref([]),defaultYear=ref(''),year=ref(''),loading=ref(true),error=ref(''),imageFailures=ref([]);
const tabs=[{id:'overview',label:'概览'},{id:'route',label:'赛道'},{id:'registration',label:'报名中签'},{id:'logistics',label:'参赛指南'},{id:'participation',label:'参赛完赛'},{id:'gear',label:'装备收藏'},{id:'stories',label:'赛事故事'}];
const tab=ref(tabs.some(t=>t.id===route.query.tab)?route.query.tab:'overview');let seq=0;
function safeUrl(v){return /^https:\/\/[^\s/@?#]+(?:[/?#][^\s]*)?$/i.test(String(v||'')) || /^\/marathon\/images\/race-archives\/[a-z0-9_/-]+\.(?:png|jpe?g|webp)$/i.test(String(v||''));}
function certification(v){return v?.label?v.label+(v.year?' · '+v.year:''):'待核实';}
const landmarkUrl=computed(()=>['beijing','shanghai','xiamen'].includes(race.value?.id)?import.meta.env.BASE_URL+'images/race-landmarks/'+race.value.id+'.svg':'');
const routeStages=computed(()=>String(edition.value?.route?.summary||'').includes('→')?String(edition.value.route.summary).split('→').map(part=>part.trim().replace(/[。；]$/,'')).filter(Boolean):[]);
const directoryTo=computed(()=>({path:'/race-catalog',query:Object.fromEntries(['q','wa','caa'].filter(key=>route.query[key]).map(key=>[key,route.query[key]]))}));
const editions=computed(()=>[...(archive.value?.editions||[])].sort((a,b)=>Number(b.year)-Number(a.year)));
const edition=computed(()=>editions.value.find(e=>String(e.year)===year.value));
const fromRace=computed(()=>relatedRaces.value.find(r=>String(r.id)===String(route.query.fromRaceId||'')));
const fields=(value,labels)=>labels.filter(([key])=>value?.[key]).map(([key,label])=>({label,value:value[key]}));
const lotteryColumns=computed(()=>[['lotteryRate','公布中签率'],['applicants','报名人数'],['eligibleApplicants','有效报名'],['lotteryPool','抽签人数'],['drawQuota','抽签名额'],['directQuota','直通名额']].filter(([key])=>editions.value.some(e=>e.registration?.[key])).map(([key,label])=>({key,label})));
const registrationFacts=computed(()=>fields(edition.value?.registration,[['opens','报名开始'],['closes','报名截止'],['drawDate','抽签公布'],['fee','报名费用'],['qualification','报名资格'],['applicants','报名人数'],['eligibleApplicants','有效报名'],['lotteryPool','实际抽签人数'],['drawQuota','抽签名额'],['directQuota','直通名额'],['lotteryRate','公布中签率']]));
const participationFacts=computed(()=>fields(edition.value?.participation,[['planned','计划规模'],['starters','实际起跑'],['finishers','完赛人数'],['finishRate','完赛率']]));
const logisticsSections=computed(()=>[
  {id:'collection',title:'领物安排',labels:[['time','领物时间'],['place','领物地点'],['requirements','领取要求']]},
  {id:'transport',title:'交通与离场',labels:[['expo','领物交通'],['start','前往起点'],['finish','终点离场']]},
  {id:'raceDay',title:'比赛日服务',labels:[['startTime','发枪与分区'],['timeLimit','关门安排'],['bagDrop','存取包'],['aidStations','补给与饮水'],['toilets','卫生间'],['medical','医疗服务']]}
].map(section=>({...section,fields:section.labels.filter(([key])=>edition.value?.logistics?.[section.id]?.[key]).map(([key,label])=>({label,value:edition.value.logistics[section.id][key]}))})).filter(section=>section.fields.length));

function updateQuery(){router.replace({query:{...route.query,year:year.value,tab:tab.value}});}
function chooseYear(){imageFailures.value=[];updateQuery();}function setYear(value){year.value=value;chooseYear();}function chooseTab(value){tab.value=value;updateQuery();}
function failedImage(key){return imageFailures.value.includes(year.value+'-'+key);}function markImageFailed(key){imageFailures.value=[...imageFailures.value,year.value+'-'+key];}
async function load(){const request=++seq;loading.value=true;error.value='';race.value=null;archive.value=null;try{const d=await api('/race-catalog/'+encodeURIComponent(String(route.params.id)));if(request!==seq)return;if(!d.race||!d.archive)throw Error('这场赛事尚无已收录档案');race.value=d.race;archive.value=d.archive;relatedRaces.value=d.relatedRaces||[];years.value=(d.years||d.archive.editions.map(e=>String(e.year))).map(String);const linkedYear=String(relatedRaces.value.find(r=>String(r.id)===String(route.query.fromRaceId||''))?.raceDate||'').slice(0,4);const preferred=String(route.query.year||linkedYear);defaultYear.value=String(d.defaultYear||d.latestYear||years.value[0]||'');year.value=years.value.includes(preferred)?preferred:defaultYear.value;imageFailures.value=[];}catch(e){if(request===seq)error.value=e.message||'赛事档案暂时无法加载';}finally{if(request===seq)loading.value=false;}}
watch(()=>route.params.id,load,{immediate:true});
watch(()=>[route.query.year,route.query.tab],([requestedYear,requestedTab])=>{const linkedYear=String(relatedRaces.value.find(r=>String(r.id)===String(route.query.fromRaceId||''))?.raceDate||'').slice(0,4);const preferred=String(requestedYear||linkedYear);year.value=years.value.includes(preferred)?preferred:defaultYear.value;tab.value=tabs.some(t=>t.id===requestedTab)?requestedTab:'overview';imageFailures.value=[];});
onBeforeUnmount(()=>seq++);
</script>
<style src="../race-archive.css"></style>
