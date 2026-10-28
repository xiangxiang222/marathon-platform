<template>
  <div class="overview-page">
    <section class="overview-welcome">
      <div><span class="welcome-label">今日运营</span><h2>让每位跑者，都不错过下一场出发。</h2><p>先核准赛事与报名节点，再把可靠的信息交到跑者手中。</p></div>
      <button v-if="isAdmin" class="welcome-action" type="button" @click="$emit('action', {section:'races',action:'create'})"><AdminIcon name="plus" />新建赛事</button>
      <button v-else class="welcome-action" type="button" @click="$emit('action', {section:'joins'})">处理跑团申请<AdminIcon name="arrow" /></button>
    </section>
    <div v-if="loading && data" class="overview-refresh" role="status">正在更新运营数据…</div>
    <div v-else-if="error && data" class="overview-refresh is-error" role="alert"><span>更新失败，当前仍显示 {{ stamp }} 的数据。</span><button type="button" @click="$emit('retry')">重试</button></div>
    <div v-if="loading && !data" class="overview-loading" role="status">正在汇总运营数据…</div>
    <section v-else-if="error && !data" class="overview-error"><h3>暂时未能取得运营数据</h3><p>{{ error }}</p><button type="button" @click="$emit('retry')">重新加载</button></section>
    <template v-if="data">
      <div class="overview-stats">
        <button v-for="item in metrics" :key="item.id" class="metric-card" type="button" @click="$emit('action',item.target)"><span class="metric-label"><AdminIcon :name="item.icon" />{{ item.label }}</span><strong>{{ number(item.value) }}<small>{{ item.unit }}</small></strong><span class="metric-foot">{{ item.note }}<AdminIcon name="arrow" /></span></button>
      </div>
      <div class="overview-columns">
        <section class="overview-card todo-card"><div class="card-heading"><div><h3>待办中心 <span>{{ todoTotal }}</span></h3><p>每一项都对应当前真实的待处理记录</p></div><AdminIcon name="joins" /></div><div v-if="attention.length" class="todo-list"><button v-for="item in attention" :key="item.id" type="button" class="todo-row" @click="$emit('action',item)"><span class="todo-mark"><AdminIcon :name="item.section === 'races' ? 'races' : item.section === 'news' ? 'news' : 'clubs'" /></span><span class="todo-copy"><b>{{ item.label }}</b><small>{{ item.description }}</small></span><b class="todo-count">{{ number(item.count) }}</b><AdminIcon name="arrow" /></button></div><div v-else class="overview-empty"><AdminIcon name="check" /><b>当前待办已处理完</b><p>可以继续检查近期比赛的报名节点与规程。</p></div></section>
        <section class="overview-card shortcut-card"><div class="card-heading"><div><h3>常用操作</h3><p>赛事内容与跑团服务，各有入口</p></div></div><div class="shortcut-grid"><button v-for="item in shortcuts" :key="item.label" type="button" @click="$emit('action',item.target)"><span><AdminIcon :name="item.icon" /></span><b>{{ item.label }}</b><small>{{ item.note }}</small></button></div><p class="operating-note">{{ isAdmin ? '报名在赛事官方平台完成。这里负责信息发布、参赛记录与跑团运营。' : '按授权管理跑者、跑团及申请，赛事发布由平台管理员处理。' }}</p></section>
      </div>
      <div v-if="isAdmin" class="overview-columns lower-columns">
        <section class="overview-card calendar-card"><div class="card-heading"><div><h3>即将开赛</h3><p>按比赛日期排列，临赛前再核一次信息</p></div><button type="button" class="card-more" @click="$emit('action',{section:'races'})">全部赛事 <AdminIcon name="arrow" /></button></div><div v-if="data.upcoming?.length" class="upcoming-list"><button v-for="race in data.upcoming" :key="race.id" type="button" class="upcoming-row" @click="$emit('action',{section:'races',raceId:race.id})"><span class="calendar-date"><b>{{ day(race.raceDate) }}</b><small>{{ month(race.raceDate) }}月</small></span><span class="upcoming-copy"><b>{{ race.name }}</b><small>{{ race.city }} · {{ race.distanceLabels?.join(' / ') || '项目待补' }}</small><small>{{ race.raceDate }} · {{ race.deadlineLabel || '报名时间未公布' }}</small></span><span class="upcoming-state">{{ race.regStatus }}</span><AdminIcon name="arrow" /></button></div><div v-else class="overview-empty"><b>暂时没有即将开赛的赛事</b><p>可在赛事库查看全部记录，或审核新收到的赛事。</p></div></section>
        <section class="overview-card quality-card"><div class="card-heading"><div><h3>赛事信息体检</h3><p>检查 {{ number(data.contentQuality?.total) }} 场即将开赛的已发布赛事</p></div><AdminIcon name="check" /></div><div class="quality-list"><div v-for="item in quality" :key="item.label"><span><b>{{ item.label }}</b><small>{{ item.note }}</small></span><strong :class="{complete:item.value === 0}">{{ number(item.value) }}<small> 场</small></strong></div></div><p class="quality-note">缺少记录代表需要核实，不代表赛事方尚未公布。以可核对的官方来源为准。</p><button class="quality-link" type="button" @click="$emit('action',{section:'races'})">前往赛事库核对 <AdminIcon name="arrow" /></button></section>
      </div>
      <p class="overview-stamp">数据统计于 {{ stamp }} · 全量数据汇总，列表分页不影响统计</p>
    </template>
  </div>
</template>

<script setup>
import { computed } from "vue";
import AdminIcon from "./AdminIcon.vue";
const props = defineProps({data:{type:Object,default:null},role:{type:String,default:"admin"},loading:Boolean,error:{type:String,default:""}});
defineEmits(["action","retry"]);
const isAdmin = computed(()=>props.role === "admin");
const attention = computed(()=>(props.data?.attention || []).filter(item=>Number(item.count)>0));
const todoTotal = computed(()=>attention.value.reduce((sum,item)=>sum+Number(item.count||0),0));
const metrics = computed(()=>{const c=props.data?.counts || {};return isAdmin.value ? [
 {id:"races",label:"即将开赛",value:c.upcomingRaces,unit:"场",note:"已发布赛事",icon:"races",target:{section:"races"}},
 {id:"review",label:"赛事待审核",value:c.pendingRaces,unit:"场",note:"核实来源后发布",icon:"check",target:{section:"races",tab:"review"}},
 {id:"clubs",label:"跑团",value:c.clubs,unit:"个",note:"成员与角色管理",icon:"clubs",target:{section:"clubs"}},
 {id:"users",label:"跑者",value:c.users,unit:"人",note:"账号、计划与成绩",icon:"users",target:{section:"users"}}
] : [
 {id:"founding",label:"建团待审核",value:c.pendingFoundings,unit:"条",note:"审核后开通跑团",icon:"clubs",target:{section:"joins",tab:"foundings"}},
 {id:"joins",label:"入团待审核",value:c.pendingJoins,unit:"条",note:"核实申请者身份",icon:"joins",target:{section:"joins",tab:"joins"}},
 {id:"clubs",label:"跑团",value:c.clubs,unit:"个",note:"成员与角色管理",icon:"clubs",target:{section:"clubs"}},
 {id:"users",label:"跑者",value:c.users,unit:"人",note:"账号与参赛记录",icon:"users",target:{section:"users"}}
]});
const shortcuts = computed(()=>isAdmin.value ? [
 {label:"审核赛事",note:"检查采集内容",icon:"check",target:{section:"races",tab:"review"}},
 {label:"发布资讯",note:"关联具体赛事",icon:"news",target:{section:"news",action:"create"}},
 {label:"官网同步",note:"核对赛事变更",icon:"sync",target:{section:"races",tab:"official"}},
 {label:"跑团申请",note:"建团与入团审核",icon:"clubs",target:{section:"joins"}}
] : [
 {label:"申请审核",note:"建团与入团",icon:"joins",target:{section:"joins"}},
 {label:"跑团管理",note:"管理成员与团长",icon:"clubs",target:{section:"clubs"}},
 {label:"跑者管理",note:"查看计划与成绩",icon:"users",target:{section:"users"}},
 {label:"添加跑者",note:"创建可登录账号",icon:"plus",target:{section:"users",action:"create"}}
]);
const quality = computed(()=>{const q=props.data?.contentQuality || {};return[
 {label:"报名节点待核实",note:"报名开始、截止、中签查询和缴费节点均未记录",value:q.missingRegistrationNodes},
 {label:"竞赛规程待补全",note:"未提供正文或规程原页",value:q.missingGuide},
 {label:"信息来源待补全",note:"未记录可核对的信息来源",value:q.missingSource}
]});
const stamp=computed(()=>{const value=props.data?.generatedAt;if(!value)return"—";const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false}):"—"});
function number(value){return Number.isFinite(Number(value))?Number(value).toLocaleString("zh-CN"):"—"}
function day(date){return String(date || "").slice(8,10)}
function month(date){return Number(String(date || "").slice(5,7)) || "—"}
</script>

<style scoped>
.overview-page { min-width: 0; }
.overview-page :deep(svg) { display: block; flex: none; width: 16px; height: 16px; }
.overview-welcome { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 20px; padding: 26px 28px; border: 1px solid #fff; background: linear-gradient(115deg, #fff0f3, #fff 72%); border-radius: 12px; }
.welcome-label { color: #ff0a30; font-size: 12px; font-weight: 600; }
.overview-welcome h2 { margin: 8px 0; font-size: 24px; font-weight: 700; line-height: 1.45; letter-spacing: 0; }
.overview-welcome p { margin: 0; color: #777d89; font-size: 13px; }
.welcome-action { display: flex; flex: none; align-items: center; gap: 8px; min-height: 40px; padding: 0 18px; border-radius: 8px; background: #ff0a30; color: #fff; font-size: 14px; font-weight: 600; }
.welcome-action :deep(svg) { width: 18px; height: 18px; }
.overview-refresh { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: -8px 0 16px; padding: 10px 12px; border: 1px solid #eceef2; border-radius: 8px; background: #fff; color: #777d89; font-size: 12px; }
.overview-refresh.is-error { border-color: #ffd0d9; background: #fff7f8; color: #b51c37; }
.overview-refresh button { flex: none; color: #ff0a30; font-size: 12px; font-weight: 600; }
.overview-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 20px; }
.metric-card { min-width: 0; padding: 20px 22px; border: 1px solid #eceef2; border-radius: 12px; background: #fff; text-align: left; transition: border-color .15s; }
.metric-card:hover { border-color: #ffb7c4; }
.metric-label { display: flex; align-items: center; gap: 8px; color: #737986; font-size: 13px; }
.metric-label :deep(svg) { width: 18px; height: 18px; color: #9aa0ac; }
.metric-card strong { display: block; margin: 14px 0 12px; color: #1f2026; font-size: 32px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.15; }
.metric-card strong small { margin-left: 8px; color: #8a8e99; font-size: 12px; font-weight: 400; }
.metric-foot { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; border-top: 1px solid #f0f1f5; color: #8a8e99; font-size: 12px; }
.metric-foot :deep(svg) { width: 15px; height: 15px; }
.overview-columns { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 20px; margin-bottom: 20px; }
.overview-card { min-width: 0; padding: 22px 24px; border: 1px solid #eceef2; border-radius: 12px; background: #fff; }
.card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.card-heading h3 { margin: 0; color: #1f2026; font-size: 17px; font-weight: 600; }
.card-heading h3 span { display: inline-flex; align-items: center; justify-content: center; min-width: 23px; margin-left: 6px; padding: 0 6px; border-radius: 5px; background: #fff0f3; color: #ff0a30; font-size: 12px; line-height: 22px; }
.card-heading p { margin: 5px 0 0; color: #8a8e99; font-size: 12px; }
.card-heading > :deep(svg) { width: 22px; height: 22px; color: #a0a5b0; }
.todo-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 0; border-top: 1px solid #f0f1f5; text-align: left; }
.todo-mark { display: grid; flex: none; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: #fff0f3; color: #ff0a30; }
.todo-mark :deep(svg) { width: 19px; height: 19px; }
.todo-copy { flex: 1; min-width: 0; }
.todo-copy b, .upcoming-copy b { display: block; font-size: 14px; font-weight: 600; line-height: 1.5; }
.todo-copy small, .upcoming-copy small { display: block; margin-top: 4px; color: #8a8e99; font-size: 12px; font-weight: 400; }
.todo-count { color: #ff0a30; font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.todo-row > :deep(svg) { width: 16px; height: 16px; color: #a0a5b0; }
.shortcut-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.shortcut-grid button { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 0 10px; min-width: 0; padding: 12px 10px; border-radius: 8px; background: #f8f9fb; text-align: left; }
.shortcut-grid button > span { display: grid; grid-row: 1 / 3; place-items: center; width: 36px; height: 36px; border-radius: 9px; background: #fff; color: #ff0a30; }
.shortcut-grid button > span :deep(svg) { width: 19px; height: 19px; }
.shortcut-grid b { align-self: end; font-size: 13px; font-weight: 600; }
.shortcut-grid small { align-self: start; margin-top: 3px; color: #8a8e99; font-size: 11px; }
.operating-note { margin: 18px 0 0; padding-top: 14px; border-top: 1px solid #f0f1f5; color: #8a8e99; font-size: 12px; line-height: 1.8; }
.card-more { display: flex; flex: none; align-items: center; gap: 4px; color: #ff0a30; font-size: 12px; }
.card-more :deep(svg) { width: 15px; height: 15px; }
.upcoming-row { display: flex; align-items: center; gap: 14px; width: 100%; padding: 14px 0; border-top: 1px solid #f0f1f5; text-align: left; }
.calendar-date { display: flex; flex: none; flex-direction: column; align-items: center; justify-content: center; width: 46px; height: 52px; border-radius: 8px; background: #f5f6fa; }
.calendar-date b { color: #ff0a30; font-size: 22px; line-height: 1.15; }
.calendar-date small { margin-top: 3px; color: #8a8e99; font-size: 11px; }
.upcoming-copy { flex: 1; min-width: 0; }
.upcoming-copy small + small { margin-top: 2px; }
.upcoming-state { flex: none; padding: 3px 8px; border-radius: 5px; background: #f5f6fa; color: #777d89; font-size: 11px; }
.upcoming-row > :deep(svg) { flex: none; width: 16px; height: 16px; color: #a0a5b0; }
.quality-list > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 0; border-top: 1px solid #f0f1f5; }
.quality-list b { display: block; font-size: 14px; font-weight: 500; }
.quality-list span > small { display: block; margin-top: 5px; color: #8a8e99; font-size: 12px; }
.quality-list strong { flex: none; color: #ff0a30; font-size: 24px; font-weight: 600; }
.quality-list strong.complete { color: #19875c; }
.quality-list strong small { color: #8a8e99; font-size: 12px; font-weight: 400; }
.quality-note { margin: 8px 0 16px; padding: 12px; border-radius: 8px; background: #f8f9fb; color: #8a8e99; font-size: 12px; line-height: 1.8; }
.quality-link { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; min-height: 38px; border: 1px solid #ffcad4; border-radius: 8px; color: #ff0a30; font-size: 13px; }
.quality-link :deep(svg) { width: 16px; height: 16px; }
.overview-stamp { margin: 24px 0 0; color: #9aa0ac; font-size: 11px; text-align: center; }
.overview-empty { display: flex; min-height: 200px; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.overview-empty :deep(svg) { width: 34px; height: 34px; margin-bottom: 12px; color: #ff0a30; }
.overview-empty b { font-size: 14px; font-weight: 600; }
.overview-empty p { margin: 8px 0; color: #8a8e99; font-size: 12px; }
.overview-loading, .overview-error { padding: 32px; border-radius: 12px; background: #fff; color: #8a8e99; font-size: 14px; }
.overview-error h3 { color: #1f2026; font-size: 18px; }
.overview-error button { padding: 8px 16px; border-radius: 8px; background: #fff0f3; color: #ff0a30; }
@media (max-width: 1199px) {
  .overview-columns { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); }
  .overview-card { padding: 20px; }
  .overview-stats { gap: 12px; }
  .metric-card { padding: 18px; }
  .shortcut-grid { gap: 8px; }
  .shortcut-grid button { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
  .upcoming-state { display: none; }
}
@media (max-width: 767px) {
  .overview-welcome { align-items: flex-start; flex-direction: column; gap: 16px; padding: 20px; }
  .overview-welcome h2 { font-size: 21px; }
  .overview-welcome p { font-size: 12px; line-height: 1.8; }
  .overview-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .metric-card { padding: 16px; }
  .metric-card strong { font-size: 28px; }
  .overview-columns { grid-template-columns: minmax(0, 1fr); gap: 16px; margin-bottom: 16px; }
  .overview-card { padding: 18px; }
  .shortcut-grid button { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 0 10px; }
  .overview-stamp { line-height: 1.7; }
  .upcoming-copy b { font-size: 13px; }
  .todo-copy small { font-size: 12px; }
}
</style>
