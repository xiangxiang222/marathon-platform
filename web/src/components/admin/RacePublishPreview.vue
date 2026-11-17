<template>
  <section class="race-publish-preview" aria-labelledby="race-publish-preview-title">
    <header class="publish-preview-heading">
      <div><span class="publish-preview-eyebrow"><span aria-hidden="true"></span>实时预览</span><h3 id="race-publish-preview-title">跑者会看到什么</h3><p>按当前输入展示，尚未保存的修改不会在这里发布。</p></div>
      <span class="publish-preview-readonly"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2.5 10s2.5-5 7.5-5 7.5 5 7.5 5-2.5 5-7.5 5-7.5-5-7.5-5Z"/><circle cx="10" cy="10" r="2"/></svg>只读</span>
    </header>
    <div class="publish-preview-tabs" role="tablist" aria-label="赛事预览方式">
      <button id="publish-preview-list-tab" type="button" role="tab" :aria-selected="view === 'list'" aria-controls="publish-preview-list-panel" :tabindex="view === 'list' ? 0 : -1" :class="{ selected: view === 'list' }" @click="view = 'list'" @keydown="changeView">列表卡片</button>
      <button id="publish-preview-detail-tab" type="button" role="tab" :aria-selected="view === 'detail'" aria-controls="publish-preview-detail-panel" :tabindex="view === 'detail' ? 0 : -1" :class="{ selected: view === 'detail' }" @click="view = 'detail'" @keydown="changeView">移动详情</button>
    </div>
    <div v-show="view === 'list'" id="publish-preview-list-panel" class="publish-preview-panel" role="tabpanel" aria-labelledby="publish-preview-list-tab">
      <div class="publish-preview-context"><span>首页 · 赛事列表</span><span>当前编辑内容</span></div>
      <div class="publish-preview-card" inert aria-hidden="true"><RaceCard :race="previewRace" pending-date-label="待填写" /></div>
      <p class="publish-preview-accessible">{{ previewRace.name }}，{{ previewRace.raceDate || '比赛日期未填写' }}，{{ previewRace.city || '举办地点未填写' }}，{{ projectLabels.join('、') || '项目未填写' }}，{{ previewRace.regStatus }}。卡片中的计划和关注操作在预览中不可使用。</p>
      <p class="publish-preview-note"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 7v4m0-7v1"/></svg>计划与关注为操作示意，预览不会改动个人记录。</p>
    </div>
    <div v-show="view === 'detail'" id="publish-preview-detail-panel" class="publish-preview-panel detail-panel" role="tabpanel" aria-labelledby="publish-preview-detail-tab">
      <div class="publish-preview-context"><span>赛事详情 · 内容概要</span><span>当前编辑内容</span></div>
      <div class="publish-preview-mobile">
        <div class="preview-mobile-bar" aria-hidden="true"><span>‹</span><b>赛事详情</b><span class="preview-mobile-dots">···</span></div>
        <div v-if="cover" class="preview-cover"><img :src="cover.url" alt="当前编辑的赛事封面" /><span v-if="cover.pending" class="preview-image-status" :class="{ failed: cover.error }">{{ cover.error ? '上传失败 · 仍可预览' : '待上传封面' }}</span></div>
        <div class="preview-event-hero" :class="{ 'with-cover': cover }">
          <svg class="preview-hero-track" viewBox="0 0 430 280" aria-hidden="true" fill="none"><path d="M330-60h40a85 85 0 0 1 85 85v85a85 85 0 0 1-85 85h-40a85 85 0 0 1-85-85V25a85 85 0 0 1 85-85Z"/><path d="M330-42h40a67 67 0 0 1 67 67v85a67 67 0 0 1-67 67h-40a67 67 0 0 1-67-67V25a67 67 0 0 1 67-67Z"/><path d="M330-24h40a49 49 0 0 1 49 49v85a49 49 0 0 1-49 49h-40a49 49 0 0 1-49-49V25a49 49 0 0 1 49-49Z"/><path d="M277 248v-41h26v41m6 0v-72h23v72m8 0v-54h36v54m9 0v-92h28v92m-150 0h167"/></svg>
          <span class="preview-event-status">{{ previewRace.regStatus }}</span>
          <h4>{{ previewRace.name }}</h4>
          <p>{{ locationLine || '举办地点待填写' }}</p>
          <div v-if="projectLabels.length" class="preview-projects"><span v-for="label in projectLabels" :key="label">{{ label }}</span></div>
          <p class="preview-hero-types">{{ book.meet === 'online' ? '线上赛' : '线下赛' }} · {{ typeLabel }}</p>
          <time v-if="previewRace.raceDate" :datetime="previewRace.raceDate">{{ displayDay(previewRace.raceDate) }}<span v-if="book.startAt"> · {{ book.startAt }} 起跑</span></time>
        </div>
        <div class="preview-mobile-content">
          <section class="preview-content-card preview-summary">
            <h5>赛事速览</h5>
            <dl class="preview-facts"><div><dt>比赛日期</dt><dd>{{ previewRace.raceDate || '待填写' }}</dd></div><div><dt>举办地点</dt><dd>{{ book.place || book.city || '待填写' }}</dd></div><div><dt>比赛项目</dt><dd>{{ projectLabels.join(' / ') || '待填写' }}</dd></div><div><dt>{{ book.deadlineName || '报名截止' }}</dt><dd>{{ validDay(book.deadline) || '尚未录入' }}</dd></div></dl>
            <div class="preview-small-facts"><span>{{ book.meet === 'online' ? '线上举办' : '线下举办' }}</span><span v-if="gradeLabel">{{ gradeLabel }}</span><span v-if="book.phone">咨询 {{ book.phone }}</span></div>
          </section>
          <section class="preview-content-card">
            <div class="preview-card-heading"><h5>重要时间</h5><span>仅展示已填写节点</span></div>
            <ol v-if="nodes.length" class="preview-timeline"><li v-for="node in nodes" :key="node.key"><span class="preview-node-dot" aria-hidden="true"></span><span>{{ node.label }}</span><time :datetime="node.at">{{ node.at }}<template v-if="node.key === 'race' && book.startAt"> {{ book.startAt }}</template></time></li></ol>
            <p v-else class="preview-empty">填写比赛日期或报名节点后，将在这里显示。</p>
          </section>
          <section class="preview-content-card">
            <h5>报名与参赛</h5>
            <dl v-if="entryFacts.length" class="preview-detail-facts"><div v-for="fact in entryFacts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div></dl>
            <div class="preview-entry-state" :class="{ configured: book.signupUrl }"><span class="preview-entry-mark" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><path v-if="book.signupUrl" d="m5 10 3 3 7-7"/><path v-else d="M10 6v5m0 3v.5"/><circle v-if="!book.signupUrl" cx="10" cy="10" r="7"/></svg></span><span><strong>{{ book.signupUrl ? '报名入口已填写' : '报名入口待补充' }}</strong><small>{{ book.signupUrl ? linkHost(book.signupUrl) : '未填写时，前台不会生成报名链接。' }}</small></span></div>
            <div v-if="otherLinks.length" class="preview-link-tags"><span v-for="link in otherLinks" :key="link.label">{{ link.label }}已填写</span></div>
          </section>
          <section v-if="book.route || book.pickup || book.pacers || routeImages.length || pacerImages.length" class="preview-content-card">
            <h5>比赛日安排</h5>
            <div v-if="book.route" class="preview-text-group"><h6>路线说明</h6><p>{{ book.route }}</p></div>
            <div v-if="routeImages.length" class="preview-image-grid"><figure v-for="image in routeImages" :key="image.key"><img :src="image.url" alt="当前编辑的路线图" loading="lazy" /><figcaption v-if="image.pending">{{ image.error ? '上传失败 · 仍可预览' : '待上传路线图' }}</figcaption></figure></div>
            <div v-if="book.pickup" class="preview-text-group"><h6>领物须知</h6><p>{{ book.pickup }}</p></div>
            <div v-if="book.pacers" class="preview-text-group"><h6>配速安排</h6><p>{{ book.pacers }}</p></div>
            <div v-if="pacerImages.length" class="preview-image-grid"><figure v-for="image in pacerImages" :key="image.key"><img :src="image.url" alt="当前编辑的配速资料" loading="lazy" /><figcaption v-if="image.pending">{{ image.error ? '上传失败 · 仍可预览' : '待上传配速资料' }}</figcaption></figure></div>
          </section>
          <section v-if="book.guideText || guideImages.length" class="preview-content-card">
            <div class="preview-card-heading"><h5>竞赛规程</h5><span v-if="guideImages.length">{{ guideImages.length }} 张原页</span></div>
            <p v-if="book.guideText" class="preview-rule-text">{{ book.guideText }}</p>
            <p v-if="book.guideText" class="preview-content-caption">此处为文字概要，前台会按正文格式展示。</p>
            <div v-if="guideImages.length" class="preview-image-grid"><figure v-for="image in guideImages" :key="image.key"><img :src="image.url" alt="当前编辑的竞赛规程原页" loading="lazy" /><figcaption v-if="image.pending">{{ image.error ? '上传失败 · 仍可预览' : '待上传规程原页' }}</figcaption></figure></div>
          </section>
          <section v-if="book.liveUrl || liveImage" class="preview-content-card">
            <h5>赛事直播</h5><p v-if="book.liveUrl" class="preview-content-caption">直播地址已填写 · {{ linkHost(book.liveUrl) }}</p><div v-if="liveImage" class="preview-live-image"><img :src="liveImage.url" alt="当前编辑的直播二维码" loading="lazy" /><span v-if="liveImage.pending">{{ liveImage.error ? '上传失败 · 仍可预览' : '待上传二维码' }}</span></div>
          </section>
        </div>
      </div>
      <p class="publish-preview-note">此处预览赛事资料。个人计划、关注、跑团安排及另行保存的奖项与资讯不在此模拟。</p>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue';
import RaceCard from '../RaceCard.vue';
import { raceSheetSrc } from '../../api';
import { raceEditorNodeTime } from './race-editor';

const props = defineProps({
  book: { type: Object, required: true },
  queues: { type: Object, default: () => ({ guide: [], route: [], pacer: [], live: null, cover: null }) },
  sheetSrc: { type: Function, default: raceSheetSrc }
});

const view = ref('list');
const distanceNames = { full: '马拉松', half: '半程马拉松', '10k': '10公里', '5k': '5公里' };
const kindNames = { trail: '越野', ultra: '超马', family: '亲子跑', fun: '欢乐跑' };
const gradeNames = { A: 'A 类', B: 'B 类', C: 'C 类', TEN: '系列赛' };
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
function validDay(value) {
  const day = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const date = new Date(day + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : '';
}
function displayDay(value) { const day = validDay(value); return day ? Number(day.slice(0, 4)) + '年' + Number(day.slice(5, 7)) + '月' + Number(day.slice(8)) + '日' : ''; }
const projectLabels = computed(() => [...(props.book.distances || []).map(key => distanceNames[key] || key), ...String(props.book.groups || '').split(/[,，、]/).map(part => part.trim()).filter(Boolean)]);
const typeLabel = computed(() => (props.book.kinds || []).map(key => kindNames[key] || key).join(' / ') || '路跑');
const locationLine = computed(() => [...new Set([props.book.province, props.book.city, props.book.district].filter(Boolean))].join(' · '));
const gradeLabel = computed(() => gradeNames[props.book.grade] || '');
const previewRace = computed(() => {
  const row = props.book, now = today(), nowInstant=Date.now(), raceDate = validDay(row.raceDate), deadline = validDay(row.deadline), start = validDay(row.regStart);
  const startInstant=raceEditorNodeTime('regStart',start,row.rawNodeTimes?.regStart),deadlineInstant=raceEditorNodeTime('deadline',deadline,row.rawNodeTimes?.deadline);
  const open = !!deadline && deadlineInstant > nowInstant && (!start || startInstant <= nowInstant);
  const daysLeft = deadline ? Math.max(0, Math.round((Date.parse(deadline) - Date.parse(now)) / 86400000)) : 0;
  let regStatus = '报名时间未录入';
  if (!raceDate) regStatus = '比赛日期待填写';
  else if (raceDate < now) regStatus = '已结束';
  else if (raceDate === now) regStatus = '比赛中';
  else if (start && startInstant > nowInstant) regStatus = '未开始';
  else if (!deadline) regStatus = '报名时间未录入';
  else regStatus = open ? '报名中' : '待开赛';
  let deadlineLabel = deadline ? (deadlineInstant <= nowInstant ? '已截止' : daysLeft === 0 ? '今日截止' : daysLeft === 1 ? '明天截止' : daysLeft + '天后截止') : '报名时间未录入';
  return { id: row.id || 'publish-preview', name: String(row.name || '').trim() || '赛事名称未填写', raceDate, city: row.city || row.place || '', province: row.province || '', distanceLabels: (row.distances || []).map(key => distanceNames[key] || key), kindLabels: (row.kinds || []).map(key => kindNames[key] || key), kind: (row.kinds || []).includes('trail') ? 'trail' : 'road', regStatus, deadlineLabel, open, daysLeft };
});
const nodes = computed(() => [
  { key: 'signup', label: '报名开始', at: validDay(props.book.regStart) },
  { key: 'deadline', label: props.book.deadlineName || '报名截止', at: validDay(props.book.deadline) },
  { key: 'draw', label: '中签公布', at: validDay(props.book.drawAt) },
  { key: 'pay', label: '缴费截止', at: validDay(props.book.payDeadline) },
  { key: 'bib', label: '号码公布', at: validDay(props.book.bibAt) },
  { key: 'race', label: '比赛日', at: validDay(props.book.raceDate) }
].filter(node => node.at).sort((a, b) => a.at.localeCompare(b.at)));
const entryFacts = computed(() => [
  { label: '报名费用', value: props.book.fee },
  { label: '赛事规模', value: props.book.scale },
  { label: '主办单位', value: props.book.organizer }
].filter(fact => fact.value));
const otherLinks = computed(() => [
  { label: '中签查询', value: props.book.drawUrl },
  { label: '号码查询', value: props.book.bibUrl },
  { label: '成绩与证书', value: props.book.resultUrl },
  { label: '赛事官网', value: props.book.eventUrl },
  { label: '中国马拉松官网', value: props.book.officialUrl }
].filter(link => link.value));
function linkHost(value) { try { return new URL(value).hostname; } catch { return '地址格式待核对'; } }
function queued(kind) { const value = props.queues?.[kind]; return Array.isArray(value) ? value : value ? [value] : []; }
function queueImage(item, kind, index) { return { key: kind + '-queued-' + index, url: item.url, pending: true, error: !!item.error || item.status === 'failed' || item.status === 'error' }; }
function existingImage(sheet, kind, index) { return { key: kind + '-stored-' + (sheet.id || index), url: props.sheetSrc(sheet.id), pending: false, error: false }; }
function images(kind, field) { return [...(props.book[field] || []).map((item, index) => existingImage(item, kind, index)), ...queued(kind).map((item, index) => queueImage(item, kind, index))].filter(image => image.url); }
const cover = computed(() => queued('cover').find(item => item.url) ? queueImage(queued('cover').find(item => item.url), 'cover', 0) : props.book.coverSheet?.id ? existingImage(props.book.coverSheet, 'cover', 0) : null);
const liveImage = computed(() => queued('live').find(item => item.url) ? queueImage(queued('live').find(item => item.url), 'live', 0) : props.book.liveSheet?.id ? existingImage(props.book.liveSheet, 'live', 0) : null);
const routeImages = computed(() => images('route', 'routeSheets'));
const pacerImages = computed(() => images('pacer', 'pacerSheets'));
const guideImages = computed(() => images('guide', 'guide'));
async function changeView(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tablist = event.currentTarget?.parentElement;
  view.value = event.key === 'Home' ? 'list' : event.key === 'End' ? 'detail' : view.value === 'list' ? 'detail' : 'list';
  await nextTick();
  tablist?.querySelector('[aria-selected="true"]')?.focus();
}
</script>

<style scoped>
.race-publish-preview{--preview-ink:#3c3038;--preview-muted:#887580;min-width:0;max-width:100%;border:1px solid #eee3e7;border-radius:18px;background:#fcf9fa;color:var(--preview-ink);overflow:hidden}
.race-publish-preview *{box-sizing:border-box}.publish-preview-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:20px 20px 16px}.publish-preview-heading h3{margin:5px 0 6px;font-size:18px;font-weight:650;line-height:1.5;color:#3a2d35}.publish-preview-heading p{max-width:290px;margin:0;color:var(--preview-muted);font-size:12px;line-height:1.8}.publish-preview-eyebrow{display:flex;align-items:center;gap:6px;color:#c34b64;font-size:12px;font-weight:500;line-height:1.5}.publish-preview-eyebrow>span{width:5px;height:5px;border-radius:50%;background:#f15b74;box-shadow:0 0 0 3px #ffe8ed}.publish-preview-readonly{display:flex;align-items:center;gap:4px;flex:none;margin-top:2px;padding:5px 7px;border:1px solid #eadfe4;border-radius:7px;background:#fff;color:#8c7984;font-size:12px;line-height:1.5}.publish-preview-readonly svg{width:14px;height:14px;stroke:currentColor;stroke-width:1.25;stroke-linecap:round;stroke-linejoin:round}
.publish-preview-tabs{display:flex;gap:3px;margin:0 20px;padding:4px;border:1px solid #ece4e7;border-radius:11px;background:#f2edef}.race-publish-preview .publish-preview-tabs>button{display:flex;align-items:center;justify-content:center;flex:1;min-width:0;min-height:44px;margin:0;padding:8px 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:#8c7884;font-size:13px;font-weight:500;line-height:1.5}.race-publish-preview .publish-preview-tabs>button.selected{border-color:#f1e5e9;background:#fff;color:#d73c5b;box-shadow:0 2px 7px #4e26330a}.publish-preview-tabs>button:focus-visible{outline:2px solid #ff1838;outline-offset:2px}
.publish-preview-panel{padding:16px 16px 18px}.publish-preview-context{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px;margin:0 4px 11px;color:#8e7a86;font-size:12px;line-height:1.6}.publish-preview-context>span:last-child{color:#9b8390}.publish-preview-card{min-width:0;pointer-events:none;user-select:none}.publish-preview-card :deep(.race-card-shell){box-shadow:0 8px 24px #62404a07}.publish-preview-note{display:flex;align-items:flex-start;gap:5px;margin:14px 4px 0;color:#8a7581;font-size:12px;line-height:1.8}.publish-preview-note>svg{flex:none;width:14px;height:14px;margin-top:4px;stroke:currentColor;stroke-width:1.1;stroke-linecap:round}.publish-preview-accessible{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.publish-preview-mobile{width:100%;max-width:390px;margin:0 auto;border:1px solid #e6dce1;border-radius:18px;background:#f6f3f4;overflow:hidden;box-shadow:0 10px 28px #63344208}.preview-mobile-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:8px 17px;background:#fff;color:#6d5965;font-size:14px;line-height:1.5}.preview-mobile-bar>span{font-size:23px;line-height:1}.preview-mobile-bar>b{font-size:13px;font-weight:500}.preview-mobile-bar>.preview-mobile-dots{font-size:19px;letter-spacing:1px}.preview-cover{position:relative;aspect-ratio:16/9;background:#f2e8ed;overflow:hidden}.preview-cover>img{display:block;width:100%;height:100%;object-fit:cover}.preview-image-status{position:absolute;right:10px;bottom:10px;padding:4px 7px;border-radius:5px;background:#fffc;color:#735264;font-size:12px;line-height:1.5;backdrop-filter:blur(8px)}.preview-image-status.failed{color:#bc354f}
.preview-event-hero{position:relative;isolation:isolate;padding:22px 20px 23px;overflow:hidden;background:linear-gradient(118deg,#fff6f8,#fff 76%);color:#4b3542}.preview-event-hero.with-cover{padding-top:18px}.preview-hero-track{position:absolute;inset:0;z-index:-1;width:100%;height:100%;stroke:#f6ccd7;stroke-width:1}.preview-event-status{display:inline-flex;max-width:100%;padding:4px 7px;border:1px solid #f2ccd6;border-radius:6px;background:#fff8fa;color:#d44865;font-size:12px;line-height:1.5;overflow-wrap:anywhere}.preview-event-hero h4{margin:11px 0 8px;font-size:23px;font-weight:650;line-height:1.5;letter-spacing:-.4px;overflow-wrap:anywhere}.preview-event-hero p{margin:0;color:#a58a98;font-size:12px;line-height:1.8;overflow-wrap:anywhere}.preview-projects{display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin-top:10px}.preview-projects>span{padding:3px 6px;border-radius:5px;background:#fffafb;color:#9a788a;border:1px solid #f0e0e7;font-size:12px;line-height:1.5;overflow-wrap:anywhere}.preview-event-hero .preview-hero-types{margin-top:10px;font-size:12px;color:#a68a99}.preview-event-hero>time{display:block;margin-top:12px;color:#7f5e70;font-size:12px;line-height:1.8}
.preview-mobile-content{display:flex;flex-direction:column;gap:10px;padding:12px}.preview-content-card{min-width:0;margin:0;padding:16px;border:1px solid #eee7ea;border-radius:12px;background:#fff}.preview-content-card h5{margin:0 0 13px;color:#483641;font-size:15px;font-weight:600;line-height:1.6}.preview-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:0}.preview-facts>div{min-width:0;padding:10px;border-radius:8px;background:#faf6f7}.preview-facts dt{margin:0 0 5px;color:#9a818e;font-size:12px;line-height:1.5}.preview-facts dd{margin:0;color:#604653;font-size:12px;font-weight:550;line-height:1.75;overflow-wrap:anywhere}.preview-small-facts{display:flex;align-items:center;flex-wrap:wrap;gap:5px 10px;margin-top:11px;color:#8a7480;font-size:12px;line-height:1.7;overflow-wrap:anywhere}.preview-card-heading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px;margin-bottom:13px}.preview-card-heading h5{margin:0}.preview-card-heading>span{color:#a48d99;font-size:12px;line-height:1.5}
.preview-timeline{display:flex;flex-direction:column;gap:0;margin:0;padding:0;list-style:none}.preview-timeline>li{position:relative;display:grid;grid-template-columns:9px minmax(0,1fr);column-gap:8px;row-gap:3px;min-width:0;min-height:54px;padding-bottom:13px;color:#88707d;font-size:12px;line-height:1.6}.preview-timeline>li:before{position:absolute;left:3px;top:9px;bottom:0;width:1px;background:#f4dce3;content:''}.preview-timeline>li:last-child{min-height:0;padding-bottom:0}.preview-timeline>li:last-child:before{display:none}.preview-node-dot{z-index:1;width:7px;height:7px;margin-top:5px;border:2px solid #f47a90;border-radius:50%;background:#fff}.preview-timeline>li>time{grid-column:2;color:#57404e;font-size:12px;font-weight:550;line-height:1.6;overflow-wrap:anywhere}.preview-empty{margin:0;color:#9b8491;font-size:12px;line-height:1.8}.preview-detail-facts{display:flex;flex-direction:column;gap:10px;margin:0 0 14px}.preview-detail-facts>div{display:flex;align-items:baseline;gap:12px;min-width:0;font-size:12px;line-height:1.8}.preview-detail-facts dt{flex:none;min-width:48px;color:#99818e}.preview-detail-facts dd{min-width:0;margin:0;color:#64505d;overflow-wrap:anywhere}.preview-entry-state{display:flex;align-items:center;gap:8px;min-width:0;padding:11px;border:1px solid #efe8eb;border-radius:9px;background:#faf8f9}.preview-entry-mark{display:grid;place-items:center;flex:none;width:27px;height:27px;border-radius:8px;background:#eee7ec;color:#9b8491}.preview-entry-mark svg{width:17px;height:17px;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.preview-entry-state>span:last-child{min-width:0}.preview-entry-state strong{display:block;color:#7d6371;font-size:12px;font-weight:550;line-height:1.7}.preview-entry-state small{display:block;color:#9b8491;font-size:12px;line-height:1.7;overflow-wrap:anywhere}.preview-entry-state.configured{border-color:#f5dde5;background:#fff7f9}.configured .preview-entry-mark{background:#ffe1e9;color:#d84263}.configured strong{color:#bc4260}.preview-link-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}.preview-link-tags>span{max-width:100%;padding:4px 6px;border-radius:5px;background:#f7f1f4;color:#987b8a;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
.preview-text-group+.preview-text-group,.preview-image-grid+.preview-text-group{margin-top:16px}.preview-text-group h6{margin:0 0 7px;color:#836472;font-size:12px;font-weight:600;line-height:1.6}.preview-text-group p,.preview-rule-text{margin:0;color:#6e5663;font-size:12px;line-height:1.95;white-space:pre-wrap;overflow-wrap:anywhere}.preview-rule-text{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:12}.preview-content-caption{margin:8px 0 0;color:#a08a96;font-size:12px;line-height:1.8;overflow-wrap:anywhere}.preview-image-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:10px}.preview-image-grid figure{min-width:0;margin:0;padding:4px;border:1px solid #eee7eb;border-radius:7px;background:#faf7f9}.preview-image-grid img{display:block;width:100%;height:112px;border-radius:4px;object-fit:contain;background:#f2edf0}.preview-image-grid figcaption{margin-top:4px;color:#9b7889;font-size:12px;line-height:1.5;overflow-wrap:anywhere}.preview-live-image{position:relative;margin-top:12px;padding:9px;border:1px solid #f0e5eb;border-radius:9px;background:#fcf9fa;text-align:center}.preview-live-image>img{display:block;width:132px;max-width:100%;height:132px;object-fit:contain;margin:0 auto}.preview-live-image>span{display:block;margin-top:6px;color:#9a7c8b;font-size:12px;line-height:1.6}
@media(max-width:370px){.publish-preview-heading{padding:16px 14px 13px;gap:8px}.publish-preview-heading h3{font-size:17px}.publish-preview-tabs{margin:0 12px}.publish-preview-panel{padding:13px 10px 15px}.preview-event-hero{padding:18px 15px}.preview-event-hero h4{font-size:21px}.preview-mobile-content{padding:9px;gap:8px}.preview-content-card{padding:13px}.preview-facts>div{padding:9px 8px}.publish-preview-context{gap:3px;font-size:12px}}
</style>
