<template>
  <div class="runner-dashboard">
    <section v-if="error" class="dash-card dash-error" role="alert"><p>运动摘要暂时没有加载出来</p><button type="button" @click="$emit('retry')">重新加载</button></section>
    <section v-else class="dash-card week-card" :aria-busy="loading">
      <div class="dash-heading"><h3>本周运动</h3><router-link to="/runner?view=stats" aria-label="查看运动数据">数据详情 <span>›</span></router-link></div>
      <div class="week-main"><div><span class="muted">本周跑步</span><div class="week-number">{{ loading ? '—' : number(overview.weekKm) }}<small>公里</small></div><p>{{ loading ? '正在整理记录' : `${overview.weekCount || 0} 次运动 · ${minutes(overview.weekDurationSec)} 分钟` }}</p></div><div class="mini-chart" aria-label="本周每日跑量"><div v-for="(bar, i) in bars" :key="bar.key || i" class="mini-day"><div class="mini-track"><i :class="{ today: bar.key === data?.asOf, zero: !bar.km }" :style="{ height: `${bar.km ? Math.max(8, bar.km / maxKm * 100) : 5}%` }"></i></div><span>{{ ['一','二','三','四','五','六','日'][i] }}</span></div></div></div>
      <router-link class="week-foot" to="/runner?view=stats&report=1"><span>{{ overview.weekCount ? '每一次出发，都算数' : '从一次轻松跑开始' }}</span><b>查看运动周报 <span>›</span></b></router-link>
    </section>
    <router-link v-if="nextRace" class="next-race dash-card" :to="'/races/' + nextRace.race.id"><span class="next-date"><b>{{ nextRace.race.raceDate.slice(8, 10) }}</b><span>{{ nextRace.race.raceDate.slice(5, 7) }} 月</span></span><div><span class="overline">下一场期待 · {{ nextRace.status }}</span><h3>{{ nextRace.race.name }}</h3><p>{{ nextRace.race.city || '比赛地点待公布' }} · {{ nextRace.race.raceDate }}</p></div><RunnerIcon name="arrow"/></router-link>
    <section class="dash-card career-card"><div class="dash-heading"><h3 class="career-heading">我的完赛成绩</h3><router-link to="/runner?view=career">赛事生涯 <span>›</span></router-link></div><div class="pb-grid"><router-link v-for="item in pbs" :key="item.distance" to="/runner?view=career"><span><i>PB</i>{{ item.label }}</span><b :class="{ 'awaiting-pb': !item.clock }">{{ item.clock || '暂无成绩' }}</b><small>{{ item.clock ? '个人最好成绩' : '记录完赛成绩后展示' }}</small></router-link></div><div class="career-numbers"><div><b>{{ loading || !data ? '—' : data?.career?.finished || 0 }}</b><span>场完赛</span></div><div><b>{{ loading || !data ? '—' : data?.career?.cities?.length || 0 }}</b><span>座城市</span></div><div><b>{{ loading || !data ? '—' : number(data?.career?.totalKm) }}</b><span>比赛里程 · 公里</span></div></div><slot name="career-actions" /></section>
    <section class="archive-workbench"><div class="dash-heading archive-heading"><h3>跑者工作台</h3><span>个人运动档案</span></div><nav class="dash-entries" aria-label="跑者档案"><router-link v-for="entry in entries" :key="entry.id" :to="'/runner?view=' + entry.id"><span class="entry-icon" :class="entry.id"><RunnerIcon :name="entry.id"/></span><div><b>{{ entry.title }}</b><span>{{ entry.subtitle }}</span></div><RunnerIcon name="arrow" class="entry-arrow"/></router-link></nav><router-link class="history-entry" to="/history"><div><span class="overline">历史赛事记录</span><h3>我的跑史 <span>↗</span></h3><p>导入历史成绩，管理参赛履历。</p></div></router-link></section>
    <p class="private-note"><RunnerIcon name="lock"/>个人运动、收藏与影像，仅自己可见</p>
    <router-link class="dash-help" to="/runner?view=help">使用帮助 <span>›</span></router-link>
  </div>
</template>
<script setup>
import { computed } from 'vue';
import RunnerIcon from './RunnerIcon.vue';
const props = defineProps({ data: Object, plans: { type: Array, default: () => [] }, loading: Boolean, error: String });
const historyImage = `${import.meta.env.BASE_URL}images/art-passport.png`;
const medalImage = `${import.meta.env.BASE_URL}images/art-medal.png`;
defineEmits(['retry']);
const overview = computed(() => props.data?.overview || {});
const bars = computed(() => props.data?.training?.bars?.slice(0, 7) || Array.from({ length: 7 }, (_, i) => ({ key: i, km: 0 })));
const maxKm = computed(() => Math.max(1, ...bars.value.map(x => x.km)));
const nextRace = computed(() => props.plans.filter(x => x.race?.raceDate >= (props.data?.asOf || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })) && !['未中签','弃赛','未完赛','完赛'].includes(x.status)).sort((a,b) => a.race.raceDate.localeCompare(b.race.raceDate))[0]);
const pbs = computed(() => [{distance:'full',label:'全马最好成绩'},{distance:'half',label:'半马最好成绩'}].map(x => ({...x,clock:props.data?.career?.pb?.find(p => p.distance === x.distance)?.clock})));
const entries = [ {id:'stats',title:'运动数据',subtitle:'跑量与趋势'}, {id:'career',title:'赛事生涯',subtitle:'成绩与 PB'}, {id:'footprints',title:'城市足迹',subtitle:'我的城市护照'}, {id:'honors',title:'荣誉收藏',subtitle:'证书与奖牌'}, {id:'media',title:'赛事影像',subtitle:'留住高光时刻'}, {id:'devices',title:'数据来源',subtitle:'导入与设备'} ];
function number(value) { return Number(value || 0).toLocaleString('zh-CN',{maximumFractionDigits:2}); }
function minutes(value) { return Math.round(Number(value || 0) / 60); }
</script>
<style scoped>
.runner-dashboard{display:grid}.dash-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}.dash-heading>a{display:flex;align-items:center;flex:none}.overline{font-size:12px;font-weight:500;color:var(--muted)}.muted{font-size:12px;color:var(--muted)}.week-main{display:grid}.week-number{white-space:nowrap;font-variant-numeric:tabular-nums}.week-number small{font-weight:400;margin-left:7px;color:var(--muted)}.week-main p{color:var(--muted)}.mini-chart{display:flex;justify-content:space-between}.mini-day{text-align:center;color:var(--muted)}.mini-track{display:flex;align-items:flex-end;overflow:hidden}.mini-track i{width:100%;animation:grow .45s ease-out;transform-origin:bottom}.mini-day>span{display:block}.week-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid var(--line);color:var(--muted)}.week-foot b{color:var(--accent);white-space:nowrap}.week-foot b span{margin-left:6px}.next-race{display:flex;align-items:center}.next-date{display:flex;flex:none;flex-direction:column;align-items:center;justify-content:center;border:1px solid var(--line);color:var(--accent)}.next-date b{line-height:1.1}.next-date span{margin-top:3px}.next-race>div{min-width:0;flex:1}.next-race .overline{color:var(--accent)}.next-race h3{margin:3px 0;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}.next-race p{margin:0;color:var(--muted)}.next-race>svg{width:15px;flex:none;color:var(--muted)}.career-numbers{display:grid}.career-numbers>div{display:flex;flex-direction:column}.career-numbers b{font-variant-numeric:tabular-nums}.career-numbers span{color:var(--muted)}.pb-grid{display:grid;grid-template-columns:1fr 1fr}.pb-grid>a{min-width:0}.pb-grid span{display:flex;align-items:center;gap:4px}.pb-grid i{font-style:normal}.pb-grid b{display:block;font-variant-numeric:tabular-nums}.dash-entries{display:grid}.entry-icon{display:grid;place-items:center;flex:none}.dash-entries b,.dash-entries div>span{display:block}.dash-entries div>span{color:var(--muted)}.entry-arrow{display:none}.private-note{display:flex;align-items:center;justify-content:center;gap:5px;color:var(--muted)}.private-note svg{width:12px;height:12px}.dash-help{display:flex;align-items:center;justify-content:center;color:var(--muted)}.dash-help span{padding-left:5px}.dash-error p{font-size:14px;color:var(--muted)}.dash-error button{min-height:44px;font-size:14px;color:var(--accent)}.history-entry h3 span{float:right;color:var(--accent);font-weight:400}.history-entry p{margin:0}@keyframes grow{from{transform:scaleY(.1)}to{transform:scaleY(1)}}@media(prefers-reduced-motion:reduce){.mini-track i{animation:none}}
/* Compact dashboard modules use distinct layouts instead of repeated feature cards. */
.runner-dashboard{gap:14px;padding:0}
.dash-card{padding:16px;border:1px solid var(--line);border-radius:10px;background:var(--card)}
.dash-heading h3{margin:0;font-size:18px;line-height:1.4;font-weight:600}
.dash-heading>a{gap:4px;min-height:44px;font-size:12px;color:var(--muted)}
.week-main{grid-template-columns:minmax(0,1fr) 128px;gap:12px;align-items:end;margin:8px 0 10px}
.week-number{margin-top:2px;font-size:32px;line-height:1.15;font-weight:600;letter-spacing:normal;color:var(--ink)}
.week-number small{font-size:12px;letter-spacing:0}
.week-main p{margin-top:7px;font-size:12px;line-height:1.5}
.mini-chart{gap:7px;padding-bottom:2px}
.mini-day{width:12px;font-size:12px}
.mini-track{height:54px;border-radius:3px;background:#f5f5f5}
.mini-track i{border-radius:3px;background:#ff1838}
.mini-track i.today{background:var(--accent)}.mini-track i.zero{background:var(--line)}
.mini-day>span{margin-top:6px}
.week-foot{padding-top:7px;min-height:42px;font-size:12px;border-color:var(--line)}
.week-foot b{font-size:12px;font-weight:500}
.next-race{gap:11px;padding:12px 14px;background:#f5f5f5;border-color:#f5f5f5}
.next-date{width:43px;height:47px;background:#fff;border-color:#eee;border-radius:7px}
.next-date b{font-size:22px}.next-date span{font-size:12px}
.next-race .overline{font-size:12px;font-weight:500}.next-race h3{font-size:15px;line-height:1.45;font-weight:500}.next-race p{font-size:12px;line-height:1.5}
.career-card{padding-bottom:3px}
.pb-grid{gap:10px;margin-top:10px}
.pb-grid>a{position:relative;overflow:hidden;padding:12px 10px;background:#f5f5f5;border:1px solid #f5f5f5;border-radius:8px}
.pb-grid>a::after{position:absolute;right:-18px;bottom:-26px;width:70px;height:70px;border:12px solid rgba(255,24,56,.045);border-radius:50%;content:'';pointer-events:none}
.pb-grid span{color:#ff1838;font-size:12px}.pb-grid i{padding:1px 4px;border-radius:3px;background:#f5f5f5;color:var(--accent);font-size:12px;font-weight:600;line-height:1.5}
.pb-grid b{position:relative;z-index:1;margin-top:6px;color:var(--accent);font-size:24px;line-height:1.2;font-weight:600;letter-spacing:normal}
.pb-grid b.awaiting-pb{font-size:16px;letter-spacing:0}
.pb-grid small{display:block;margin-top:6px;color:#ff1838;font-size:12px;line-height:1.4}
.career-numbers{grid-template-columns:.85fr .85fr 1.3fr;gap:10px;margin:15px 0 0;padding-bottom:14px}
.career-numbers>div{gap:4px}.career-numbers b{font-size:20px;line-height:1.2;letter-spacing:0;font-weight:600}.career-numbers span{font-size:12px;line-height:1.5}
.career-card :deep(.compact-poster){margin-top:0;padding-top:3px;gap:10px;min-height:49px}
.career-card :deep(.compact-poster>span){max-width:48%;font-size:12px;line-height:1.5}
.career-card :deep(.compact-poster>a),.career-card :deep(.compact-poster>button){font-size:13px}
.archive-workbench{overflow:hidden;border:1px solid var(--line);border-radius:10px;background:var(--card)}
.archive-heading{padding:10px 16px 0}.archive-heading>span{color:var(--muted);font-size:12px}
.dash-entries{grid-template-columns:repeat(3,minmax(0,1fr));gap:0;padding:9px 5px 11px}
.dash-entries>a{display:flex;flex-direction:column;gap:7px;align-items:center;justify-content:center;min-height:92px;padding:10px 3px;border:0;border-radius:0;background:transparent;text-align:center}
.dash-entries a:nth-child(-n+3){border-bottom:1px solid var(--line)}
.entry-icon{width:35px;height:35px;border-radius:9px;color:var(--accent);background:#f5f5f5}
.entry-icon svg{width:23px;height:23px}
.entry-icon.honors{background:#f5f5f5;color:#ff1838}.entry-icon.media{background:#f5f5f5;color:#777}.entry-icon.devices{background:#f5f5f5;color:#777}.entry-icon.footprints{background:#f5f5f5;color:#777}
.dash-entries b{font-size:13px;line-height:1.4;font-weight:500;white-space:nowrap}
.dash-entries div>span{margin-top:4px;font-size:12px;line-height:1.4;white-space:nowrap}
.history-entry{display:flex;align-items:center;gap:12px;margin:0 12px 12px;padding:0 0 0 0;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#f5f5f5}
.history-entry>img{display:block;flex:none;width:85px;height:88px;object-fit:cover;object-position:center}
.history-entry>div{flex:1;min-width:0;padding:9px 11px 9px 0}.history-entry .overline{font-size:12px;font-weight:500;letter-spacing:normal}
.history-entry h3{margin:4px 0;font-size:16px;line-height:1.4;font-weight:600}.history-entry h3 span{font-size:17px}
.history-entry p{font-size:12px;line-height:1.5;color:var(--muted)}
.private-note{margin:0;font-size:12px;line-height:1.5}.dash-help{min-height:44px;padding:0;font-size:12px}
@media(max-width:350px){.dash-card{padding:14px}.week-main{grid-template-columns:minmax(0,1fr) 111px;gap:7px}.week-number{font-size:30px}.mini-chart{gap:5px}.mini-track{height:49px}.mini-day{width:11px}.week-foot{font-size:12px}.week-foot b{font-size:12px}.pb-grid{gap:7px}.pb-grid>a{padding:11px 8px}.pb-grid b{font-size:21px}.pb-grid b.awaiting-pb{font-size:14px}.pb-grid span{font-size:12px}.career-numbers b{font-size:18px}.career-numbers span{font-size:12px}.archive-heading{padding:11px 14px 0}.archive-heading>span{display:none}.dash-entries b{font-size:12px}.dash-entries div>span{font-size:12px}.history-entry>img{width:74px}.history-entry p{font-size:12px}.career-card :deep(.compact-poster>span){font-size:12px}.career-card :deep(.compact-poster>a),.career-card :deep(.compact-poster>button){font-size:12px}}
.mini-day{font-size:12px}.next-date span,.next-race .overline,.next-race p{font-size:12px}
.pb-grid span,.pb-grid small,.career-numbers span,.archive-heading>span,.private-note{font-size:12px}
.dash-entries b{font-size:14px}.dash-entries div>span{font-size:12px}.history-entry p{font-size:12px}
@media(max-width:350px){.week-foot,.week-foot b,.pb-grid span,.career-numbers span,.dash-entries div>span,.history-entry p{font-size:12px}.dash-entries b{font-size:14px}.career-numbers b{font-size:18px}}
.career-heading{display:flex;align-items:center;gap:6px}.career-heading>img{width:34px;height:38px;object-fit:contain}
.history-entry{flex-direction:row;gap:4px;padding:10px 12px;background:#f5f5f5;border-color:#f5f5f5}.history-entry>div{padding:0;flex:1;min-width:0}.history-entry>img{width:70px;height:74px;object-fit:contain}.history-entry .overline{font-size:12px;letter-spacing:normal}.history-entry h3{font-size:16px}.history-entry p{font-size:12px}.career-card :deep(.compact-poster>span){max-width:none;font-size:12px;line-height:1.5}.career-card :deep(.compact-poster>a),.career-card :deep(.compact-poster>button){font-size:13px}
@media(max-width:350px){.career-heading{gap:4px;font-size:17px}.career-heading>img{width:29px;height:34px}.history-entry{padding:10px}.history-entry>img{width:64px;height:70px}.career-card :deep(.compact-poster>a),.career-card :deep(.compact-poster>button){font-size:12px}}
</style>

<style scoped src="../personal-ui.css"></style>
