<template>
  <main class="radar-page" :data-preview="preview">
    <header class="topbar"><router-link to="/" aria-label="返回">‹</router-link><h1>拿奖雷达</h1><button type="button" class="header-help" @click="showMethod = !showMethod" :aria-expanded="showMethod">说明</button></header>
    <div v-if="preview" class="preview-bar" role="status"><span><b>模拟体验</b> · 非真实赛事</span><button type="button" @click="exitPreview">退出体验</button></div>
    <div v-if="showMethod" class="method-banner"><p>按同项目、同性别、同计时口径比较，首期最多看前八。历史奖励线取近三届奖励末位的中位数；今年阵容独立参考，不与历史重复累计。</p><p>已知阵容可能不完整，PB 不等于比赛日发挥，不生成获奖概率。</p></div>
    <div class="radar-body">
      <template v-if="!selected">
        <header class="hero">
          <div class="hero-copy"><span class="hero-kicker">成绩对照 · 选赛参考</span><h2>用成绩，选对下一场</h2><p>对照历年前八，关注今年参赛阵容</p></div>
          <img class="hero-art" :src="radarIcon" alt="" />
        </header>
        <form class="target-panel" @submit.prevent="search">
          <div class="segments project-tabs" role="group" aria-label="选择项目"><button v-for="item in distances" :key="item.key" type="button" :class="{on:distance===item.key}" :aria-pressed="distance===item.key" @click="distance=item.key">{{ item.label }}</button></div>
          <div class="condition-line"><span>目标完赛时间 <small v-if="preview">示例目标</small></span><div class="gender" role="group" aria-label="参赛性别"><button v-for="item in ['男','女']" :key="item" type="button" :class="{on:gender===item}" :aria-pressed="gender===item" @click="gender=item">{{ item }}子组</button></div></div>
          <div class="time-search-row"><div class="time-fields" role="group" aria-label="目标完赛时间"><label><input v-model="hours" inputmode="numeric" autocomplete="off" maxlength="2" @focus="$event.target.select()" aria-label="目标小时" placeholder="HH" /><span>时</span></label><i>:</i><label><input v-model="minutes" inputmode="numeric" autocomplete="off" maxlength="2" @focus="$event.target.select()" aria-label="目标分钟" placeholder="MM" /><span>分</span></label><i>:</i><label><input v-model="seconds" inputmode="numeric" autocomplete="off" maxlength="2" @focus="$event.target.select()" aria-label="目标秒" placeholder="SS" /><span>秒</span></label></div><button class="primary search-button" :disabled="busy || loading">{{ busy ? '正在寻找…' : '寻找拿奖机会' }}<span aria-hidden="true">↗</span></button></div>
          <div class="target-foot"><span>{{ preview ? '示例仅供体验，不会保存到个人资料' : '填写后按目标情景比较，留空使用已有同项目 PB' }}</span><button v-if="targets[distance]" type="button" @click="targets[distance]=''">清空</button></div>
        </form>
        <div v-if="message" class="error" role="alert">{{ message }}<button v-if="!preview && signedIn" type="button" @click="load">重试</button></div>
        <div class="results-heading"><h3>机会比赛 <span>{{ visible.length }}</span></h3><div class="filters" role="group" aria-label="筛选比赛"><button :class="{on:filter==='all'}" :aria-pressed="filter==='all'" @click="filter='all'">全部参考</button><button :class="{on:filter==='opportunity'}" :aria-pressed="filter==='opportunity'" @click="filter='opportunity'">有竞争力</button></div></div>
        <p v-if="loading" class="empty" role="status">正在比较目标与赛事资料…</p>
        <div v-else-if="!visible.length" class="empty"><span class="empty-mark" aria-hidden="true"><img :src="radarIcon" alt="" /></span><h3>{{ filter==='opportunity' ? '暂时没有匹配的拿奖机会' : '这个项目还没有收录资料' }}</h3><p>{{ filter==='opportunity' ? '调整目标，或查看全部比赛的历史奖励线。' : '资料更新后会出现在这里，也可以先体验模拟选赛。' }}</p><button v-if="filter==='opportunity'" class="text-button" @click="filter='all'">查看全部参考 →</button><button v-else-if="!preview" class="text-button" @click="enterPreview">查看模拟赛事 →</button><button v-if="!signedIn && !preview" class="outline" @click="login">登录后保存我的目标</button></div>
        <article v-for="item in visible" :key="item.id" class="radar-race-card">
          <div class="card-top"><span class="level" :class="item.level">{{ item.levelLabel }}</span><span v-if="item.demo" class="demo">演示</span></div>
          <h3>{{ item.race.name }}</h3><p class="race-meta">{{ item.race.raceDate }}<span>·</span>{{ item.race.city }}<span>·</span>{{ item.gender }}子{{ item.distanceLabel }}</p>
          <div class="metrics"><div><span>前 {{ item.awardDepth }} 名 · 历史奖励线</span><strong>{{ item.history.clock || '待收录' }}</strong></div><div><span>{{ item.ability?.scenario ? '我的目标情景' : item.ability?.label || '我的比较成绩' }}</span><strong>{{ item.ability?.clock || '—' }}</strong></div><div class="metric-gap" :class="{advantage:item.gap>0}">{{ gapLabel(item.gap) }}</div></div>
          <div v-if="scale(item)" class="performance-scale" aria-label="目标与历史奖励线的成绩比较标尺，越左越快"><div class="scale-labels"><span>更快</span><span>成绩对照，非胜率</span></div><div class="scale-track"><span class="scale-range" :style="{left:scale(item).rangeLeft+'%',width:scale(item).rangeWidth+'%'}" /><span class="scale-line" :style="{left:scale(item).line+'%'}" /><span class="scale-me" :style="{left:scale(item).me+'%'}" /></div><div class="scale-legend"><span><i />我的比较成绩</span><span><i />历史奖励线</span></div></div>
          <div class="card-bottom"><p>今年已知 <b>{{ item.competition.knownCount }}</b> 人<span v-if="item.competition.fasterCount != null"> · <b>{{ item.competition.fasterCount }}</b> 人 PB 更快</span><span v-else> · 待设置比较条件</span></p><button class="detail-button" :aria-label="'查看' + item.race.name + '的拿奖分析'" @click="open(item)">前八与阵容 <span aria-hidden="true">↗</span></button></div>
        </article>
        <p v-if="visible.length" class="list-note">奖励线取近三届同口径参考；阵容仅含已知线索，目标成绩不代表获奖承诺。</p>
        <button v-if="!preview && visible.length" type="button" class="preview-link" @click="enterPreview">体验模拟选赛 →</button>
      </template>
      <template v-else>
        <button class="back" @click="close">‹ 返回比赛列表</button>
        <header class="detail-hero"><span class="eyebrow">{{ selected.gender }}子{{ selected.distanceLabel }} · {{ timingLabel(selected.timing) }}</span><span v-if="selected.demo" class="demo">模拟数据 · 非真实成绩</span><h2>{{ selected.race.name }}</h2><p>{{ selected.race.raceDate }} · {{ selected.race.city }}</p></header>
        <section class="panel assessment"><span class="level" :class="selected.level">{{ selected.levelLabel }}</span><p>{{ selected.reason }}</p><div class="metrics"><div><span>历史奖励线</span><strong>{{ selected.history.clock || '待收录' }}</strong></div><div><span>{{ selected.ability?.label || '我的比较成绩' }}</span><strong>{{ selected.ability?.clock || '—' }}</strong></div></div><p class="gap">{{ gapLabel(selected.gap) }}</p><p v-if="selected.history.rangeLabel" class="caption">{{ selected.history.years.join(' / ') }} 年 · 奖励线范围 {{ selected.history.rangeLabel }}</p></section>
        <details class="panel reward-panel"><summary class="section-heading"><h3>奖励与资格</h3><span>前 {{ selected.awardDepth }} 名 <i aria-hidden="true">⌄</i></span></summary><p class="copy">{{ selected.eligibility || '领奖资格以当届规程为准。' }}</p><div v-for="award in selected.awards" :key="award.place" class="award-row"><span>第 {{ award.place }} 名</span><b>{{ award.amount ? award.amount.toLocaleString() + ' 元' : '非现金奖励' }}</b></div><p v-if="selected.awards.length" class="caption">现金金额为税前参考；具体发放条件以当届规程为准。</p><p class="caption">{{ selected.ruleSource }}</p></details>
        <section class="panel history-panel"><div class="section-heading"><h3>历年前八</h3><span>{{ edition ? timingLabel(edition.timing) : '成绩待收录' }}</span></div><p class="caption">逐届对照，不把历史成绩当作今年预测。</p><div class="year-tabs" role="group" aria-label="选择历史年份"><button v-for="year in selected.histories" :key="year.year" :class="{on:selectedYear===year.year}" :aria-pressed="selectedYear===year.year" @click="selectedYear=year.year">{{ year.year }}</button></div>
          <p v-if="!edition" class="empty">历届成绩待收录</p>
          <template v-else><p v-if="edition.timing!==selected.timing" class="caution">本届与该年计时口径不同，此年未计入奖励线参考。</p><table class="rank-table"><thead><tr><th>名次</th><th>选手</th><th>完赛成绩</th></tr></thead><tbody><tr v-for="row in yearRows" :key="row.place"><td :class="{rewarded:row.place<=selected.awardDepth}">{{ String(row.place).padStart(2,'0') }}</td><td>{{ row.name || '未提供姓名' }}</td><td>{{ row.clock || '—' }}</td></tr></tbody></table><div v-if="selected.ability" class="my-comparison"><span>{{ selected.ability.label }}</span><strong>{{ selected.ability.clock }}</strong></div><p class="caption">红色名次对应当届奖励范围。缺失成绩不作推算。</p><p class="caption">{{ edition.source }}</p></template>
        </section>
        <section class="panel entrants-panel"><div class="section-heading"><h3>今年已知阵容</h3><span>{{ selected.competition.knownCount }} 人</span></div><p class="copy">{{ selected.competition.notice }}</p><p v-if="!selected.competition.entrants.length" class="empty">暂无已知选手。没有人标记，不代表没有强手。</p><article v-for="person in selected.competition.entrants" :key="person.key" class="entrant"><div><b>{{ person.name || '已中签跑者' }}</b><strong>{{ person.clock }}</strong></div><p class="caption">{{ person.status }} · {{ person.sourceLabel || (person.evidence==='verified' ? '已核验资料' : '选手自报 · 待核验') }} · PB {{ person.pbDate }}</p><p v-if="person.source" class="entrant-source">{{ person.source }}</p></article>
          <p v-if="preview || selected.demo" class="caption">当前阵容为模拟资料，不接收真实参赛信息。</p>
          <button v-else-if="!preview && signedIn" class="outline" @click="openEntry">{{ selected.myEntry ? '管理我的参赛线索' : '我已中签，补充阵容' }}</button>
          <form v-if="entryOpen" class="entry-form" @submit.prevent="saveEntry"><h4>我的参赛线索</h4><p class="copy">提交本人该项目的 PB，并同步更新本场参赛状态。其他人可看到匿名 PB、日期、项目、性别和自报状态。</p><label>本人 PB<input v-model="entry.clock" placeholder="例如 2:18:30" required /></label><label>PB 日期<input v-model="entry.pbDate" type="date" required /></label><label>参赛状态<select v-model="entry.status"><option>中签</option><option>已缴费</option><option>已领物</option></select></label><label class="consent"><input v-model="consent" type="checkbox" /><span>同意将以上内容匿名用于今年阵容分析，可随时撤回。</span></label><p v-if="entryMessage" class="error" role="alert">{{ entryMessage }}</p><button class="primary" :disabled="busy">{{ busy ? '正在保存…' : '保存参赛线索' }}</button><button v-if="selected.myEntry" type="button" class="outline" :disabled="busy" @click="withdrawEntry">撤回雷达授权</button></form>
        </section>
        <router-link v-if="!preview && !selected.demo" class="primary race-link" :to="'/races/'+selected.race.id">查看赛事详情 ↗</router-link><p class="footer-note">今年阵容与历史榜单分开统计。已知人数不能代表完整参赛名单，PB 仅作竞争参考。</p>
      </template>
    </div>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { previewRadar } from '../radar-preview';
import radarIcon from '../assets/quick/radar.svg';
const router=useRouter(),route=useRoute();
const distances=[{key:'full',label:'全马'},{key:'half',label:'半马'},{key:'10k',label:'10 公里'},{key:'5k',label:'5 公里'}];
const signedIn=ref(Boolean(localStorage.getItem('marathon_token'))),loading=ref(false),busy=ref(false),message=ref(''),preview=ref(false),showMethod=ref(false);
const gender=ref(''),birth=ref(''),province=ref(''),distance=ref('full'),filter=ref('all'),rows=ref([]),targets=reactive({full:'',half:'','10k':'','5k':''});
const selected=ref(null),selectedYear=ref(0),entryOpen=ref(false),entryMessage=ref(''),consent=ref(false),entry=reactive({clock:'',pbDate:'',status:'中签'});
let sequence=0,realProfile={gender:'',birth:'',province:'',targets:{}},realRows=[];
const visible=computed(()=>rows.value.filter(item=>item.distance===distance.value&&(!gender.value||item.gender===gender.value)&&(filter.value!=='opportunity'||['priority','challenge'].includes(item.level))));
const edition=computed(()=>selected.value?.histories.find(item=>item.year===selectedYear.value));
const yearRows=computed(()=>Array.from({length:8},(_,index)=>{const found=edition.value?.rows.find(item=>item.place===index+1);return found||{place:index+1,name:'未收录',clock:''};}));
function timePart(index){return computed({get(){const raw=targets[distance.value];if(!raw)return '';const parts=raw.split(':');if(parts.length===2)parts.unshift('0');return parts[index]||'';},set(value){const raw=targets[distance.value];const parts=raw?raw.split(':'):['','',''];if(parts.length===2)parts.unshift('0');parts[index]=String(value).replace(/[^0-9]/g,'').slice(0,2);targets[distance.value]=parts.some(Boolean)?parts.map(part=>part||'00').join(':'):'';}});}
const hours=timePart(0),minutes=timePart(1),seconds=timePart(2);
function clockSeconds(raw){const p=String(raw||'').split(':').map(Number);if(p.length===2)p.unshift(0);return p.length===3&&p.every(Number.isFinite)?p[0]*3600+p[1]*60+p[2]:null;}
function scale(item){const personal=item.ability?.seconds??clockSeconds(item.ability?.clock),line=item.history.medianSeconds??clockSeconds(item.history.clock);if(personal==null||line==null||item.gap==null)return null;const values=(item.history.thresholds||[]).map(row=>row.seconds).filter(Number.isFinite);values.push(line);const low=Math.min(personal,...values),high=Math.max(personal,...values),pad=Math.max(60,(high-low)*.35),min=low-pad,max=high+pad;const position=value=>8+84*(value-min)/(max-min);return {me:position(personal),line:position(line),rangeLeft:position(Math.min(...values)),rangeWidth:Math.max(1,position(Math.max(...values))-position(Math.min(...values)))};}
function timingLabel(value){return value==='gun'?'枪声成绩':value==='net'?'净计时':'计时口径待确认';}
function gapLabel(value){if(value==null)return '待补充可比资料';if(value===0)return '与历史参考线相同';const sec=Math.abs(value);return '比奖励线'+(value>0?'快 ':'慢 ')+(sec>=60?Math.floor(sec/60)+'分':'')+(sec%60?sec%60+'秒':sec<60?'0秒':'');}
function login(){localStorage.setItem('marathon_return_after_login','/radar');router.push('/mine');}
function applyProfile(p={}){gender.value=p.gender||'';birth.value=p.birth||'';province.value=p.province||'';for(const item of distances)targets[item.key]=p.targets?.[item.key]||'';}
function syncRoute(){const item=rows.value.find(row=>row.race.id===route.query.raceId&&(!route.query.groupId||row.groupId===route.query.groupId));selected.value=item||null;if(item&&!item.histories.some(year=>year.year===selectedYear.value))selectedYear.value=item.histories[0]?.year||0;}
function open(item){entryOpen.value=false;consent.value=false;entryMessage.value='';selectedYear.value=item.histories[0]?.year||0;router.push({path:'/radar',query:{...(preview.value?{preview:'1'}:{}),raceId:item.race.id,groupId:item.groupId}});window.scrollTo({top:0});}
function close(){entryOpen.value=false;router.push({path:'/radar',query:preview.value?{preview:'1'}:{}});window.scrollTo({top:0});}
function enterPreview(){if(!preview.value){realProfile={gender:gender.value,birth:birth.value,province:province.value,targets:{...targets}};realRows=rows.value;}preview.value=true;gender.value=gender.value||'男';if(!targets.full)targets.full='2:20:00';if(!targets.half)targets.half='1:10:00';const data=previewRadar({gender:gender.value,targets:{...targets}});rows.value=data.opportunities||[];filter.value='all';entryOpen.value=false;message.value='';syncRoute();}
function exitPreview(){preview.value=false;applyProfile(realProfile);rows.value=realRows;filter.value='all';message.value='';selected.value=null;entryOpen.value=false;router.replace('/radar');}
async function load({fallback=true}={}){if(!signedIn.value){enterPreview();return;}const current=++sequence;loading.value=true;message.value='';try{const data=await api('/radar');if(current!==sequence)return;realProfile=structuredClone(data.profile||{});realRows=data.opportunities||[];if(!preview.value){applyProfile(realProfile);rows.value=realRows;}if(!realRows.length||route.query.preview==='1'){enterPreview();}else syncRoute();}catch(err){if(current!==sequence)return;if(!fallback)throw err;if(err.status===401){signedIn.value=false;localStorage.removeItem('marathon_token');realRows=[];realProfile={gender:'',targets:{}};}enterPreview();}finally{if(current===sequence)loading.value=false;}}
async function search(){if(busy.value)return;if(!gender.value){message.value='先选择男子组或女子组。';return;}const raw=targets[distance.value];if(raw){const parts=raw.split(':').map(Number);if(parts.length!==3||parts.some(value=>!Number.isFinite(value))||parts[1]>59||parts[2]>59||clockSeconds(raw)<=0||clockSeconds(raw)>43200){message.value='请填写有效时间，分钟和秒为 00—59。';return;}}busy.value=true;message.value='';try{if(preview.value){rows.value=previewRadar({gender:gender.value,targets:{...targets}}).opportunities||[];filter.value='opportunity';syncRoute();return;}if(!signedIn.value){login();return;}await api('/me/radar',{method:'PUT',body:JSON.stringify({gender:gender.value,birth:birth.value,province:province.value,targets:{...targets}})});filter.value='opportunity';await load({fallback:false});}catch(err){message.value=err.message;}finally{busy.value=false;}}
function openEntry(){if(preview.value||selected.value?.demo)return;const own=selected.value.myEntry;entry.clock=own?.clock||'';entry.pbDate=own?.pbDate||'';entry.status=['中签','已缴费','已领物'].includes(own?.status)?own.status:'中签';consent.value=false;entryMessage.value='';entryOpen.value=true;}
async function saveEntry(){if(busy.value||preview.value)return;if(!consent.value){entryMessage.value='请先确认匿名展示的内容。';return;}const item=selected.value;busy.value=true;entryMessage.value='';try{await api('/me/radar/entries/'+encodeURIComponent(item.race.id),{method:'PUT',body:JSON.stringify({distance:item.distance,gender:item.gender,...entry,consent:true})});await load({fallback:false});entryOpen.value=false;}catch(err){entryMessage.value=err.message;}finally{busy.value=false;}}
async function withdrawEntry(){if(busy.value||preview.value)return;busy.value=true;entryMessage.value='';try{await api('/me/radar/entries/'+encodeURIComponent(selected.value.race.id),{method:'DELETE'});await load({fallback:false});entryOpen.value=false;}catch(err){entryMessage.value=err.message;}finally{busy.value=false;}}
watch(()=>route.query,syncRoute);onMounted(load);onBeforeUnmount(()=>{sequence++;});
</script>
<style scoped>
.radar-page {
  --radar-line: #eeeeee;
  --radar-muted: #777777;
  min-height: 100vh;
  padding-bottom: 24px;
  color: var(--ink);
  background: var(--bg);
}
.radar-page button {
  min-width: 0;
  min-height: 44px;
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}
.radar-page .topbar {
  height: 48px;
  padding: 0 8px;
  background: var(--brand-header);
  color: #fff;
}
.radar-page .topbar > a {
  display: grid;
  min-height: 44px;
  place-items: center;
  color: #fff;
}
.header-help {
  color: #fff;
  font-size: 12px;
}
.radar-body { padding: 0 16px; }
.hero {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
  margin: 0 -16px;
  padding: 18px 16px 32px;
  background: radial-gradient(ellipse at 100% 0%, #ff536a 0, transparent 70%), var(--brand-header);
  color: #fff;
}
.hero::before,
.hero::after {
  position: absolute;
  top: -50px;
  right: -80px;
  width: 230px;
  height: 230px;
  border: 1px solid #ffffff29;
  border-radius: 50%;
  content: '';
  pointer-events: none;
}
.hero::after { top: -30px; right: -60px; width: 190px; height: 190px; }
.hero-copy { position: relative; z-index: 1; flex: 1; min-width: 0; }
.hero-kicker { font-size: 12px; color: #fff; opacity: .85; }
.hero h2 { margin: 7px 0 0; font-size: 24px; line-height: 1.45; font-weight: 600; }
.hero p { margin: 7px 0 0; font-size: 12px; line-height: 1.8; color: #fff; opacity: .9; }
.hero-art { position: relative; z-index: 1; flex: none; width: 68px; height: 68px; object-fit: contain; }
.preview-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 16px;
  background: #fff0f2;
  color: #a73c4c;
  font-size: 12px;
  line-height: 1.6;
}
.preview-bar b { font-weight: 600; }
.radar-page .preview-bar button { flex: none; padding: 0; color: #a73c4c; font-size: 12px; text-decoration: underline; text-underline-offset: 3px; white-space: nowrap; }
.method-banner { padding: 10px 16px; border-bottom: 1px solid var(--radar-line); background: #fff; color: var(--radar-muted); font-size: 12px; line-height: 1.85; }
.method-banner p { margin: 5px 0; }
.target-panel {
  position: relative;
  z-index: 1;
  margin: -12px 0 0;
  padding: 16px;
  border: 1px solid #f0f0f0;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 8px #26262605;
}
.segments { display: flex; gap: 4px; padding: 3px; border-radius: 8px; background: var(--bg); }
.segments button { flex: 1 1 0; width: 0; padding: 0 4px; border-radius: 6px; color: #777; font-size: 13px; white-space: nowrap; }
.segments button.on { background: #fff0f2; color: var(--accent); font-weight: 600; }
.condition-line { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin: 14px 0 12px; }
.condition-line > span { display: flex; flex: none; flex-direction: column; gap: 2px; color: var(--ink-secondary); font-size: 14px; white-space: nowrap; }
.condition-line small { color: var(--radar-muted); font-size: 12px; font-weight: 400; }
.gender { display: flex; flex: none; gap: 4px; }
.gender button { flex: none; width: 64px; padding: 0 6px; border: 1px solid #eeeeee; border-radius: 8px; color: #777; font-size: 12px; white-space: nowrap; }
.gender button.on { border-color: #ffd8df; background: #fff0f2; color: var(--accent); font-weight: 600; }
.time-search-row { display: flex; flex-direction: column; gap: 16px; }
.time-fields { display: flex; width: 100%; min-width: 0; align-items: center; gap: 5px; }
.time-fields label { display: flex; flex: 1 1 0; min-width: 0; min-height: 76px; flex-direction: column; align-items: center; justify-content: center; padding: 5px 0; border: 1px solid #eeeeee; border-radius: 8px; background: #f7f7f7; text-align: center; }
/* Clock digits take priority over the shared form-control typography. */
.radar-page .target-panel .time-fields label input[inputmode="numeric"][maxlength="2"] { display: block; width: 100%; min-width: 0; min-height: 44px; height: 44px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--ink); font-size: 32px; font-weight: 600; line-height: 44px; font-variant-numeric: tabular-nums; text-align: center; }
.radar-page .time-fields input::placeholder { color: #999; font-size: 24px; font-weight: 400; }
.time-fields label > span { color: var(--radar-muted); font-size: 12px; line-height: 18px; }
.time-fields > i { flex: none; padding-bottom: 17px; color: #aaa; font-size: 22px; font-style: normal; }
.radar-page .primary { display: flex; width: 100%; align-items: center; justify-content: center; gap: 10px; min-height: 48px; padding: 11px 16px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; }
.radar-page .search-button { width: 100%; min-height: 48px; }
.search-button > span { font-size: 20px; font-weight: 400; }
.radar-page button:disabled { cursor: wait; }
.target-foot { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-top: 12px; color: var(--radar-muted); font-size: 12px; line-height: 1.8; }
.target-foot > span { min-width: 0; }
.radar-page .target-foot button { flex: none; min-height: 44px; margin-top: -11px; margin-bottom: -11px; padding: 0 2px; color: var(--radar-muted); font-size: 12px; text-decoration: underline; text-underline-offset: 3px; }
.results-heading { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; padding: 16px 0 10px; }
.results-heading h3 { display: flex; flex: none; align-items: baseline; gap: 6px; margin: 0; font-size: 18px; line-height: 1.5; white-space: nowrap; }
.results-heading h3 > span { color: var(--radar-muted); font-size: 12px; font-weight: 400; }
.filters { display: flex; flex: none; gap: 4px; }
.filters button { flex: none; padding: 0 8px; border-radius: 6px; color: #777; font-size: 12px; white-space: nowrap; }
.filters button.on { background: #fff0f2; color: var(--accent); font-weight: 600; }
.radar-race-card { margin: 0 0 12px; padding: 16px; border: 1px solid #eeeeee; border-radius: 12px; background: #fff; }
.card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 22px; }
.level { display: inline-flex; align-items: center; gap: 6px; color: #777; font-size: 12px; font-weight: 500; line-height: 1.6; }
.level::before { flex: none; width: 6px; height: 6px; border-radius: 50%; background: currentColor; content: ''; }
.level.priority { color: #36705a; }
.level.challenge { color: #996e28; }
.level.pressure { color: #b44553; }
.demo { display: inline-block; flex: none; padding: 1px 6px; border: 1px solid #eedfc1; border-radius: 4px; color: #8c713b; background: #fffcf5; font-size: 12px; font-weight: 400; line-height: 1.6; }
.radar-race-card > h3 { margin: 10px 0 5px; color: var(--ink); font-size: 18px; line-height: 1.55; overflow-wrap: anywhere; }
.race-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; margin: 0; color: var(--radar-muted); font-size: 12px; line-height: 1.8; }
.race-meta > span { color: #bbb; }
.metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; margin-top: 14px; padding: 12px; border-radius: 8px; background: #f7f7f7; }
.metrics > div { min-width: 0; }
.metrics span { display: block; color: var(--radar-muted); font-size: 12px; line-height: 1.7; }
.metrics strong { display: block; margin-top: 3px; color: var(--ink); font-size: 28px; font-weight: 600; line-height: 1.4; font-variant-numeric: tabular-nums; white-space: nowrap; }
.metrics > div:nth-child(2) strong { color: var(--accent); }
.metric-gap { grid-column: 1 / -1; color: var(--radar-muted); font-size: 12px; line-height: 1.8; }
.metric-gap.advantage { color: #36705a; }
.performance-scale { margin-top: 14px; padding: 0 2px 12px; }
.scale-labels,
.scale-legend { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; color: var(--radar-muted); font-size: 12px; line-height: 1.5; }
.scale-track { position: relative; height: 4px; margin: 10px 0; border-radius: 2px; background: #ececec; }
.scale-range { position: absolute; top: -2px; min-width: 2px; height: 8px; border-radius: 3px; background: #d5d9d7; }
.scale-line { position: absolute; top: -4px; width: 2px; height: 12px; background: #7c857f; }
.scale-me { position: absolute; top: -3px; width: 10px; height: 10px; transform: translateX(-50%); border: 2px solid #fff; border-radius: 50%; background: var(--accent); }
.scale-legend { justify-content: flex-start; gap: 12px; }
.scale-legend > span { display: flex; align-items: center; gap: 5px; }
.scale-legend i { display: block; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
.scale-legend > span + span i { width: 2px; height: 9px; border-radius: 0; background: #7c857f; }
.card-bottom { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 8px; margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--radar-line); }
.card-bottom > p { flex: 1; min-width: 130px; margin: 0; color: var(--radar-muted); font-size: 12px; line-height: 1.8; }
.card-bottom b { color: var(--ink-secondary); font-weight: 600; }
.radar-page .detail-button { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 8px; padding: 0; color: var(--accent); font-size: 12px; white-space: nowrap; }
.detail-button > span { font-size: 18px; }
.list-note,
.footer-note { margin: 16px 0 0; color: var(--radar-muted); font-size: 12px; line-height: 1.9; }
.radar-page .preview-link { padding: 0; color: var(--accent); font-size: 12px; }
.empty { margin: 0; padding: 22px 16px; border: 1px solid #eeeeee; border-radius: 12px; background: #fff; color: var(--radar-muted); font-size: 14px; line-height: 1.8; text-align: center; }
.empty h3 { margin: 10px 0 0; color: var(--ink-secondary); font-size: 16px; line-height: 1.6; }
.empty p { margin: 7px 0; color: var(--radar-muted); font-size: 12px; line-height: 1.85; }
.empty-mark { display: flex; width: 64px; height: 64px; align-items: center; justify-content: center; margin: 0 auto; border-radius: 50%; background: #fff0f2; }
.empty-mark img { width: 52px; height: 52px; }
.radar-page .text-button { margin-top: 6px; padding: 0 8px; color: var(--accent); font-size: 14px; }
.error { margin: 12px 0; padding: 12px 14px; border: 1px solid #ffd8df; border-radius: 8px; background: #fff0f2; color: #b44553; font-size: 12px; line-height: 1.8; }
.radar-page .error > button { margin-left: 8px; color: #b44553; font-size: 12px; text-decoration: underline; }
.back { display: flex; width: auto; align-items: center; min-height: 44px; padding: 0; color: var(--ink-secondary); font-size: 14px; }
.detail-hero { padding: 16px; border: 1px solid #ffe0e5; border-radius: 12px; background: linear-gradient(135deg, #fff, #fff0f2); }
.eyebrow { color: var(--radar-muted); font-size: 12px; line-height: 1.8; }
.detail-hero > .eyebrow { display: block; }
.detail-hero > .demo { margin-top: 8px; }
.detail-hero h2 { margin: 10px 0 6px; color: var(--ink); font-size: 24px; line-height: 1.5; overflow-wrap: anywhere; }
.detail-hero > p { margin: 0; color: var(--radar-muted); font-size: 12px; line-height: 1.8; }
.radar-page .panel { margin: 12px 0 0; padding: 16px; border: 1px solid #eeeeee; border-radius: 12px; background: #fff; }
.section-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; }
.section-heading h3 { margin: 0; font-size: 18px; line-height: 1.6; }
.section-heading > span { color: var(--radar-muted); font-size: 12px; line-height: 1.6; }
.assessment > p,
.copy { margin: 10px 0 0; color: var(--ink-secondary); font-size: 14px; line-height: 1.85; overflow-wrap: anywhere; }
.assessment > .gap,
.gap { color: #b44553; font-size: 12px; line-height: 1.8; }
.caption { margin: 8px 0 0; color: var(--radar-muted); font-size: 12px; line-height: 1.85; overflow-wrap: anywhere; }
.radar-page .reward-panel { padding-top: 0; padding-bottom: 0; }
.reward-panel summary { min-height: 60px; cursor: pointer; list-style: none; }
.reward-panel summary::-webkit-details-marker { display: none; }
.reward-panel summary i { margin-left: 6px; font-style: normal; }
.reward-panel[open] { padding-bottom: 16px; }
.award-row { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--radar-line); font-size: 14px; line-height: 1.8; }
.award-row b { font-weight: 500; font-variant-numeric: tabular-nums; text-align: right; }
.year-tabs { display: flex; gap: 8px; overflow-x: auto; margin-top: 12px; padding-bottom: 12px; }
.year-tabs button { flex: none; padding: 0 14px; border: 1px solid #eee; border-radius: 8px; color: #777; font-size: 14px; }
.year-tabs button.on { border-color: #ffd8df; background: #fff0f2; color: var(--accent); font-weight: 600; }
.rank-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 14px; }
.rank-table th { color: var(--radar-muted); font-size: 12px; font-weight: 400; }
.rank-table th,
.rank-table td { padding: 12px 2px; border-bottom: 1px solid var(--radar-line); text-align: left; overflow-wrap: anywhere; }
.rank-table th:first-child { width: 38px; }
.rank-table th:last-child { width: 86px; text-align: right; }
.rank-table td:last-child { font-variant-numeric: tabular-nums; text-align: right; }
.rank-table td:first-child { color: #777; font-size: 12px; }
.rank-table td.rewarded { color: var(--accent); }
.my-comparison { display: flex; justify-content: space-between; gap: 10px; margin-top: 12px; padding: 12px; border-radius: 8px; background: #fff0f2; color: var(--accent); font-size: 14px; }
.my-comparison strong { font-variant-numeric: tabular-nums; }
.caution { padding: 10px 12px; border-radius: 8px; background: #fff9ed; color: #8b6b32; font-size: 12px; line-height: 1.8; }
.entrant { padding: 14px 0; border-bottom: 1px solid var(--radar-line); }
.entrant > div { display: flex; justify-content: space-between; gap: 10px; font-size: 14px; }
.entrant b { min-width: 0; font-weight: 500; overflow-wrap: anywhere; }
.entrant strong { flex: none; font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.entrant-source { margin: 5px 0 0; color: var(--radar-muted); font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }
.radar-page .outline { width: 100%; margin-top: 14px; padding: 10px 12px; border: 1px solid #e6e6e6; border-radius: 8px; background: #fff; color: var(--ink-secondary); font-size: 14px; }
.entry-form { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--radar-line); }
.entry-form h4 { margin: 0; font-size: 16px; line-height: 1.6; }
.entry-form > label:not(.consent) { display: grid; gap: 8px; margin: 16px 0; font-size: 14px; }
.entry-form input:not([type=checkbox]),
.entry-form select { width: 100%; min-width: 0; min-height: 44px; padding: 10px 12px; border: 1px solid #e6e6e6; border-radius: 8px; background: #f7f7f7; font-size: 14px; }
.consent { display: flex; align-items: flex-start; gap: 8px; margin: 18px 0; color: var(--ink-secondary); font-size: 12px; line-height: 1.9; }
.consent input { flex: none; width: 18px; height: 18px; margin: 3px 0 0; accent-color: var(--accent); }
.race-link { margin-top: 16px; }
button:focus-visible,
input:focus-visible,
select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.topbar a:focus-visible,
.topbar button:focus-visible { outline-color: #fff; }
@media (max-width: 350px) {
  .hero-art { width: 48px; height: 48px; }
  .hero h2 { font-size: 22px; }
  .hero p { max-width: 210px; }
  .target-panel { padding: 12px; }
  .condition-line > span { font-size: 13px; }
  .gender button { width: 60px; }
  .segments button { font-size: 12px; }
  .results-heading h3 { font-size: 16px; }
  .filters button { padding: 0 6px; }
  .radar-race-card { padding: 12px; }
  .metrics { padding: 10px; gap: 8px; }
  .metrics strong { font-size: 24px; }
  .detail-hero h2 { font-size: 22px; }
}
</style>
