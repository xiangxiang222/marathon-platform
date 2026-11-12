<template>
  <main class="achievement-studio">
    <header class="studio-header"><router-link :to="backTo" aria-label="返回上一页"><RunnerIcon name="back" /></router-link><span>成绩海报</span><span class="studio-mark"><RunnerIcon name="honors" /></span></header>
    <section class="studio-intro"><span class="studio-kicker">YOUR PERSONAL HIGHLIGHTS</span><h1>制作成绩海报</h1><p>选择成绩、版式与展示信息，保存后分享。</p></section>
    <section v-if="!session.token.value" class="studio-state"><span><RunnerIcon name="lock" /></span><h2>属于你的高光，等你开启</h2><p>登录后，用自己的已记录成绩生成海报。</p><button type="button" class="primary-action" @click="login">登录并继续</button></section>
    <section v-else-if="loading" class="studio-state" role="status"><span class="loading-symbol"><RunnerIcon name="honors" /></span><h2>正在整理你的成绩</h2><p>马上就好，精彩值得稍等。</p></section>
    <section v-else-if="error" class="studio-state" role="alert"><span><RunnerIcon name="stats" /></span><h2>这次没能加载出来</h2><p>{{ error }}</p><button type="button" class="primary-action" @click="load">重新加载</button></section>
    <template v-else-if="runner">
      <nav class="poster-modes" aria-label="海报内容"><button v-for="item in MODES" :key="item.id" type="button" :class="{ on: mode === item.id }" :aria-pressed="mode === item.id" @click="mode = item.id"><RunnerIcon :name="item.id === 'pb' ? 'honors' : 'calendar'" /><span>{{ item.id === 'pb' ? 'PB 荣誉卡' : item.name }}</span><small>{{ item.id === 'pb' ? '生涯最好成绩' : '每一次完赛' }}</small></button></nav>
      <div class="studio-layout">
        <section class="preview-panel" aria-label="海报预览">
          <div class="preview-top"><span><i></i> 实时预览</span><span v-if="previewMeta">{{ previewMeta.width }} × {{ previewMeta.height }}</span></div>
          <div class="poster-stage" :class="'theme-' + style" :aria-busy="rendering">
            <img v-if="previewUrl" class="poster-image" :src="previewUrl" :alt="model.title + '，第' + (pageIndex + 1) + '张海报预览'" @click="openPreview" />
            <div v-else class="poster-placeholder"><RunnerIcon :name="visibleRows.length ? 'honors' : 'calendar'" /><h2>{{ !visibleRows.length ? mode === 'pb' ? '下一次突破，值得期待' : '每一次完赛，都值得记录' : '先选一项成绩' }}</h2><p>{{ !visibleRows.length ? mode === 'pb' ? '保存线下路跑成绩后，即可生成生涯 PB 荣誉卡。' : '这个年份还没有可用的完赛成绩。' : '在下面勾选成绩，立即生成你的海报。' }}</p><router-link v-if="!records.length" to="/">去记录一场完赛 ›</router-link></div>
          </div>
          <p v-if="renderError" class="render-error" role="alert">{{ renderError }} <button type="button" @click="renderPreview">重新生成</button></p>
          <nav v-if="pages.length > 1 && model.rows.length" class="poster-pagination" aria-label="海报分页"><button type="button" aria-label="上一张海报" :disabled="pageIndex === 0 || rendering" @click="pageIndex--">‹</button><span>第 <b>{{ pageIndex + 1 }}</b> / {{ pages.length }} 张<small>本张 {{ pages[pageIndex]?.rows.length }} 条 · 共 {{ model.rows.length }} 条</small></span><button type="button" aria-label="下一张海报" :disabled="pageIndex >= pages.length - 1 || rendering" @click="pageIndex++">›</button></nav>
          <p class="preview-hint">{{ pages.length > 1 ? '完整履历分为 ' + pages.length + ' 张，请逐张预览与保存。' : previewUrl ? '点击看原图 · 手机可长按图片保存' : '预览会随你的选择更新' }}</p>
        </section>
        <div class="studio-controls">
          <section class="control-card theme-control"><div class="control-heading"><h2>选一个心情</h2><span>浅色主题</span></div><nav class="theme-options" aria-label="海报主题"><button v-for="item in STYLES" :key="item.id" type="button" :class="['theme-option', item.id, { on: style === item.id }]" :aria-label="item.name" :aria-pressed="style === item.id" @click="style = item.id"><span class="theme-swatch" :style="{ background: item.background, color: item.accent }"><i></i><b>PB</b><small></small></span><span>{{ item.name }}</span></button></nav></section>
          <section class="control-card selection-control"><div class="control-heading"><div><h2>{{ mode === 'pb' ? '我的生涯 PB' : '挑选完赛记录' }}</h2><p>{{ mode === 'pb' ? '线下路跑 · 固定生涯口径，不受年份影响' : '只整理你已记录、日期有效的完赛成绩' }}</p></div><span>{{ selectedVisibleCount }} / {{ visibleRows.length }}</span></div><div class="selection-toolbar"><label v-if="mode === 'results'" class="year-select"><span>年份</span><select v-model="year" aria-label="完赛成绩年份"><option value="">全部年份</option><option v-for="item in years" :key="item" :value="item">{{ item }} 年</option></select></label><span v-else class="lifetime-label">生涯最佳 · 最多 4 项</span><div><button type="button" :disabled="!visibleRows.length" @click="selectAll">全选</button><span>·</span><button type="button" :disabled="!visibleRows.length" @click="selectNone">全不选</button></div></div><div class="selection-list"><label v-for="item in visibleRows" :key="item.key" class="selection-row"><input type="checkbox" :checked="isSelected(item.key)" @change="toggleRow(item.key)" /><span class="selection-check" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" /></svg></span><span class="selection-copy"><b>{{ item.distanceLabel }}<i v-if="mode === 'results' && item.pb">PB</i></b><span>{{ item.raceName }}</span><small>{{ item.raceDate }}<template v-if="item.kind !== 'road' || item.meet !== 'offline'"> · {{ item.typeLabel }}</template></small></span><strong>{{ item.clock }}</strong></label><p v-if="!visibleRows.length" class="selection-empty">{{ mode === 'pb' ? '还没有符合生涯 PB 口径的成绩。' : '这个年份还没有完赛记录。' }}</p></div><p v-if="pages.length > 1 && model.rows.length" class="pagination-note">已选 {{ model.rows.length }} 条，完整生成 {{ pages.length }} 张，每张最多 20 条。</p></section>
          <details class="control-card options-control"><summary><span><RunnerIcon name="add" /> 文案与展示信息</span><small>自由留白 <i>⌄</i></small></summary><div class="advanced-options"><label class="quote-select">海报短文案<select v-model="quote" aria-label="海报短文案"><option v-for="item in QUOTES" :key="item" :value="item">{{ item }}</option><option value="">不显示短文案</option></select></label><div class="privacy-options"><label><input v-model="showName" type="checkbox" />显示昵称</label><label><input v-model="showRace" type="checkbox" />显示赛事名</label><label><input v-model="showDate" type="checkbox" />显示比赛日期</label><label><input v-model="showCity" type="checkbox" />显示比赛城市</label></div><p>只影响这张海报，已记录成绩保持原样。</p></div></details>
          <section class="caption-card"><div><span>分享时，也给自己一句鼓励</span><button type="button" :disabled="!model.rows.length" @click="copyCaption">复制朋友圈配文 <RunnerIcon name="arrow" /></button></div><p>{{ shareCaption }}</p></section>
          <p class="local-note"><RunnerIcon name="lock" /> 图片在当前设备生成，不上传。</p>
        </div>
      </div>
      <footer class="poster-actions"><div class="action-summary"><b>{{ model.rows.length }} {{ mode === 'pb' ? '项生涯 PB' : '条完赛记录' }}</b><span>{{ pages.length > 1 ? '共 ' + pages.length + ' 张 · 当前第 ' + (pageIndex + 1) + ' 张' : '高清 PNG · 先预览，再保存' }}</span></div><div class="action-buttons"><button v-if="canShareFile" type="button" class="share-action" :disabled="!readyToExport || exporting" @click="shareImage">分享图片</button><button type="button" class="primary-action" :disabled="!readyToExport || exporting" @click="saveImage">{{ exporting ? '正在准备…' : pages.length > 1 ? '保存第 ' + (pageIndex + 1) + ' 张' : '保存高清图片' }} <RunnerIcon name="arrow" /></button></div><button v-if="pages.length > 1 && readyToExport" type="button" class="save-all-action" :disabled="exporting" @click="saveAll">下载全部 {{ pages.length }} 张 <span>也可翻页逐张保存</span></button></footer>
    </template>
    <p v-if="notice" class="studio-notice" role="status">{{ notice }}</p>
    <canvas ref="canvas" class="render-canvas" aria-hidden="true"></canvas>
    <dialog ref="previewDialog" class="image-preview" aria-label="高清海报预览" @click="closePreviewOutside"><header><span>第 {{ pageIndex + 1 }} / {{ pages.length }} 张 · 长按图片可保存</span><button type="button" aria-label="关闭高清预览" @click="previewDialog.close()">×</button></header><img v-if="previewUrl" :src="previewUrl" alt="高清成绩海报" /><footer><button type="button" class="primary-action" :disabled="!readyToExport" @click="saveImage">保存本张 PNG</button></footer></dialog>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import RunnerIcon from '../components/RunnerIcon.vue';
import { useClubSession } from '../useClubSession';
import { STYLES, MODES, QUOTES, normalizeResults, buildAchievementModel, paginateAchievement } from '../achievement-model';
import { renderAchievementPoster } from '../achievement-poster';
const route = useRoute(), router = useRouter();
const runner = ref(null), user = ref(null), loading = ref(false), error = ref('');
const mode = ref(route.query.mode === 'results' ? 'results' : 'pb'), style = ref('cream'), year = ref('');
const quote = ref(QUOTES[0]), showName = ref(true), showRace = ref(true), showDate = ref(true), showCity = ref(false);
const pbKeys = ref([]), resultKeys = ref([]), pageIndex = ref(0), canvas = ref(null), previewDialog = ref(null);
const previewUrl = ref(''), previewBlob = ref(null), previewMeta = ref(null), rendering = ref(false), renderError = ref(''), exporting = ref(false), notice = ref('');
let loadVersion = 0, renderVersion = 0, disposed = false, noticeTimer;
function clearPreview() { renderVersion++; if (previewDialog.value?.open) previewDialog.value.close(); if (previewUrl.value) URL.revokeObjectURL(previewUrl.value); previewUrl.value = ''; previewBlob.value = null; previewMeta.value = null; if (canvas.value) { canvas.value.width = 0; canvas.value.height = 0; } }
function reset() { loadVersion++; clearPreview(); runner.value = null; user.value = null; loading.value = false; error.value = ''; pbKeys.value = []; resultKeys.value = []; pageIndex.value = 0; exporting.value = false; notice.value = ''; renderError.value = ''; mode.value = route.query.mode === 'results' ? 'results' : 'pb'; style.value = 'cream'; year.value = ''; quote.value = QUOTES[0]; showName.value = showRace.value = showDate.value = true; showCity.value = false; }
const session = useClubSession(reset, () => route.fullPath);
const backTo = computed(() => { const value = route.query.returnTo; if (typeof value !== 'string' || /[\\\u0000-\u0020\u007f]/.test(value)) return '/mine'; try { const url = new URL(value, 'https://local.invalid'); if (url.origin !== 'https://local.invalid' || !['/mine', '/runner'].includes(url.pathname) && !/^\/clubs\/\d+\/members\/\d+$/.test(url.pathname)) return '/mine'; return url.pathname + url.search; } catch { return '/mine'; } });
const records = computed(() => normalizeResults(runner.value));
const pbCandidates = computed(() => buildAchievementModel(runner.value, { mode: 'pb' }).rows);
const years = computed(() => [...new Set(records.value.map(item => item.raceDate.slice(0, 4)))].sort().reverse());
const visibleRows = computed(() => mode.value === 'pb' ? pbCandidates.value : records.value.filter(item => !year.value || item.raceDate.startsWith(year.value)));
const selectedKeys = computed(() => mode.value === 'pb' ? pbKeys.value : resultKeys.value);
const selectedVisibleCount = computed(() => visibleRows.value.filter(item => selectedKeys.value.includes(item.key)).length);
const model = computed(() => buildAchievementModel(runner.value, { mode: mode.value, style: style.value, year: year.value, selectedKeys: selectedKeys.value, nickname: user.value?.nickname || '', quote: quote.value, showName: showName.value, showRace: showRace.value, showDate: showDate.value, showCity: showCity.value }));
const pages = computed(() => paginateAchievement(model.value));
const readyToExport = computed(() => !!previewBlob.value && !!model.value.rows.length && !rendering.value && !renderError.value);
const canShareFile = computed(() => { if (!previewBlob.value || !navigator.share || !navigator.canShare) return false; try { return navigator.canShare({ files: [new File([previewBlob.value], fileName(pageIndex.value), { type: 'image/png' })] }); } catch { return false; } });
const shareCaption = computed(() => { const rows = model.value.rows; if (!rows.length) return quote.value || '每一步，都在刷新自己。'; const title = mode.value === 'pb' ? '我的生涯 PB' : (year.value ? year.value + ' 年' : '我的') + '完赛履历'; return [model.value.nickname ? model.value.nickname + ' · ' + title : title, ...rows.map(item => [item.distanceLabel, item.clock, item.raceName, item.raceDate, item.city].filter(Boolean).join(' · ')), model.value.quote].filter(Boolean).join('\n'); });
function isSelected(key) { return selectedKeys.value.includes(key); }
function setKeys(keys) { if (mode.value === 'pb') pbKeys.value = keys; else resultKeys.value = keys; }
function toggleRow(key) { setKeys(isSelected(key) ? selectedKeys.value.filter(item => item !== key) : [...selectedKeys.value, key]); }
function selectAll() { setKeys([...new Set([...selectedKeys.value, ...visibleRows.value.map(item => item.key)])]); }
function selectNone() { const shown = new Set(visibleRows.value.map(item => item.key)); setKeys(selectedKeys.value.filter(key => !shown.has(key))); }
function login() { localStorage.setItem('marathon_return_after_login', route.fullPath); router.push('/mine'); }
async function load() { if (!session.token.value) return; const current = ++loadVersion; clearPreview(); runner.value = null; user.value = null; loading.value = true; error.value = ''; try { const [identity, data] = await Promise.all([session.request('/me', { cache: 'no-store' }), session.request('/me/runner', { cache: 'no-store' })]); if (current !== loadVersion || disposed) return; user.value = identity.user; if (!user.value?.id) throw Error('无法确认当前账号，请重新登录'); runner.value = data; pbKeys.value = buildAchievementModel(data, { mode: 'pb' }).rows.map(item => item.key); resultKeys.value = normalizeResults(data).map(item => item.key); } catch (e) { if (!e.stale && current === loadVersion) { runner.value = null; user.value = null; error.value = e.message || '请检查网络后重试'; } } finally { if (current === loadVersion) loading.value = false; } }
function toBlob(node) { return new Promise((resolve, reject) => node.toBlob(value => value ? resolve(value) : reject(Error('图片生成失败，请重试')), 'image/png')); }
async function renderPreview() { const current = ++renderVersion; if (previewUrl.value) URL.revokeObjectURL(previewUrl.value); previewUrl.value = ''; previewBlob.value = null; previewMeta.value = null; renderError.value = ''; if (!runner.value || !model.value.rows.length || !session.token.value) { rendering.value = false; return; } rendering.value = true; const stamp = session.capture(); try { await nextTick(); if (current !== renderVersion || !session.current(stamp) || !canvas.value) return; if (document.fonts?.ready) await document.fonts.ready; if (current !== renderVersion || !session.current(stamp)) return; const meta = renderAchievementPoster(canvas.value, model.value, { pageIndex: pageIndex.value }); const blob = await toBlob(canvas.value); if (current !== renderVersion || !session.current(stamp)) return; previewBlob.value = blob; previewUrl.value = URL.createObjectURL(blob); previewMeta.value = meta; } catch (e) { if (current === renderVersion && session.current(stamp)) renderError.value = e.message || '生成图片时遇到了问题'; } finally { if (current === renderVersion) rendering.value = false; } }
function fileName(index) { return (mode.value === 'pb' ? '我的生涯PB' : (year.value ? year.value + '年-' : '') + '完赛履历') + (pages.value.length > 1 ? '-' + (index + 1) + '共' + pages.value.length + '张' : '') + '.png'; }
function downloadBlob(blob, name) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
function saveImage() { const stamp = session.capture(); if (!session.current(stamp) || !readyToExport.value || exporting.value) return; downloadBlob(previewBlob.value, fileName(pageIndex.value)); notice.value = '已发起 PNG 下载；手机也可长按预览图片保存。'; }
async function saveAll() { if (!readyToExport.value || exporting.value) return; exporting.value = true; notice.value = ''; const stamp = session.capture(), current = renderVersion, data = model.value, count = pages.value.length; try { for (let index = 0; index < count; index++) { if (!session.current(stamp) || current !== renderVersion) return; const node = document.createElement('canvas'); renderAchievementPoster(node, data, { pageIndex: index }); const blob = await toBlob(node); if (!session.current(stamp) || current !== renderVersion) return; downloadBlob(blob, fileName(index)); node.width = node.height = 0; await new Promise(resolve => setTimeout(resolve, 100)); } if (session.current(stamp)) notice.value = '已发起 ' + count + ' 张下载；如浏览器限制多文件，请翻页逐张保存。'; } catch (e) { if (session.current(stamp)) notice.value = e.message || '批量保存未完成，请逐张保存。'; } finally { if (session.current(stamp)) exporting.value = false; } }
async function shareImage() { if (!readyToExport.value || !canShareFile.value || exporting.value) return; const stamp = session.capture(); if (!session.current(stamp) || !readyToExport.value) return; exporting.value = true; try { await navigator.share({ files: [new File([previewBlob.value], fileName(pageIndex.value), { type: 'image/png' })], title: model.value.title, text: model.value.quote }); if (session.current(stamp)) notice.value = '已打开系统分享，请选择可用的应用。'; } catch (e) { if (session.current(stamp) && e.name !== 'AbortError') notice.value = '当前浏览器未能分享文件，请保存图片后手动分享。'; } finally { if (session.current(stamp)) exporting.value = false; } }
async function copyCaption() { if (!model.value.rows.length) return; const stamp = session.capture(); if (!session.current(stamp) || !model.value.rows.length) return; const value = shareCaption.value; try { if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value); else { const node = document.createElement('textarea'); node.value = value; node.style.position = 'fixed'; node.style.opacity = '0'; document.body.append(node); node.select(); const copied = document.execCommand('copy'); node.remove(); if (!copied) throw Error('当前浏览器不能自动复制'); } if (session.current(stamp)) notice.value = '配文已复制，保存图片后可一起分享。'; } catch { if (session.current(stamp)) notice.value = '未能自动复制，可长按下面的配文手动复制。'; } }
function openPreview() { const stamp = session.capture(); if (session.current(stamp) && readyToExport.value) previewDialog.value?.showModal(); }
function closePreviewOutside(event) { if (event.target !== previewDialog.value) return; const bounds = previewDialog.value.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) previewDialog.value.close(); }
watch([model, pageIndex], () => { if (pageIndex.value >= pages.value.length) { pageIndex.value = 0; return; } void renderPreview(); }, { deep: true, flush: 'post' });
watch([mode, year], () => { pageIndex.value = 0; });
watch(() => route.fullPath, () => { reset(); void load(); }, { immediate: true });
watch(session.token, () => { void load(); });
watch(notice, value => { clearTimeout(noticeTimer); if (value) noticeTimer = setTimeout(() => notice.value = '', 6000); });
onBeforeUnmount(() => { disposed = true; loadVersion++; clearPreview(); clearTimeout(noticeTimer); });
</script>

<style scoped>
.achievement-studio { max-width: 1160px; min-height: 100dvh; margin: 0 auto; padding-bottom: calc(220px + env(safe-area-inset-bottom, 0px)); background: var(--bg); color: var(--ink); font-size:14px; letter-spacing: normal; }
.achievement-studio button { width: auto; font: inherit; cursor: pointer; }
.achievement-studio button:disabled { opacity: .4; cursor: default; }
.studio-header { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; min-height: 64px; padding: 0 16px; text-align: center; background: var(--card); font-size:24px; font-weight: 600; }
.studio-header>a { display: flex; align-items: center; justify-content: center; min-height: 44px; }
.studio-header svg { width: 22px; height: 22px; }
.studio-mark { justify-self: end; color: var(--muted); }
.studio-intro { padding: 24px 20px; background: var(--card); }
.studio-kicker { color: var(--muted); font-size:12px; }
.studio-intro h1 { font-size:24px; font-weight: 600; line-height: 1.5; margin: 8px 0; }
.studio-intro>p { color: var(--muted); font-size:14px; line-height: 1.7; margin: 0; }
.poster-modes { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; margin: 16px; }
.poster-modes button { position: relative; display: grid; grid-template-columns: 22px 1fr; align-items: center; gap: 4px 8px; padding: 12px; min-width: 0; min-height: 72px; text-align: left; border: 1px solid var(--line); border-radius:var(--radius-control); background: var(--card); color: var(--ink); }
.poster-modes svg { grid-row: span 2; width: 22px; height: 22px; color: var(--muted); }
.poster-modes button>span { font-size:14px; font-weight: 500; }
.poster-modes small { font-size:12px; color: var(--muted); }
.poster-modes button.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.poster-modes button.on svg { color: var(--accent); }
.studio-layout { padding: 0 16px; }
.preview-panel { padding: 12px; background: var(--card); border-radius:var(--radius-card); margin-bottom: 16px; }
.preview-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 2px 12px; color: var(--muted); font-size:12px; }
.preview-top>span:first-child { display: flex; align-items: center; gap: 6px; }
.preview-top i { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
.poster-stage { min-height: 350px; display: grid; place-items: center; overflow: hidden; background: var(--bg); border-radius:var(--radius-control); }
.poster-image { display: block; width: 100%; height: auto; cursor: zoom-in; }
.poster-placeholder { padding: 40px 20px; text-align: center; }
.poster-placeholder>svg { width: 34px; height: 34px; color: var(--muted); }
.poster-placeholder h2 { font-size:18px; font-weight: 600; line-height: 1.6; margin: 20px 0 10px; color: var(--ink); }
.poster-placeholder p { font-size:14px; color: var(--muted); line-height: 1.7; }
.poster-placeholder>a { display: inline-flex; align-items: center; min-height: 44px; padding: 8px; color: var(--accent); font-size:14px; }
.preview-hint { text-align: center; margin: 12px 0 0; color: var(--muted); font-size:12px; line-height: 1.7; }
.poster-pagination { display: flex; justify-content: center; align-items: center; gap: 16px; padding: 12px 0 0; }
.poster-pagination button { width: 44px; min-height: 44px; border-radius:var(--radius-control); background: var(--chip); font-size:24px; color: var(--ink); }
.poster-pagination>span { display: block; text-align: center; font-size:14px; color: var(--ink-secondary); }
.poster-pagination b { font-weight: 600; }
.poster-pagination small { display: block; font-size:12px; color: var(--muted); margin-top: 4px; }
.render-error { font-size:14px; color: var(--accent); line-height: 1.7; }
.render-error button { min-height: 44px; padding: 0 8px; color: var(--accent); text-decoration: underline; }
.control-card { padding: 16px; margin-bottom: 16px; background: var(--card); border-radius:var(--radius-card); }
.control-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.control-heading h2 { font-size:18px; font-weight: 600; margin: 0; }
.control-heading>span { flex: none; font-size:12px; color: var(--muted); }
.control-heading p { font-size:12px; color: var(--muted); line-height: 1.7; margin: 6px 0 0; }
.theme-options { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }
.theme-options button { padding: 0; min-width: 0; min-height: 44px; background: transparent; text-align: center; }
/* The swatches depict the exported artwork; keep their individual palette and typography. */
.theme-swatch { position: relative; display: block; aspect-ratio: 1.6; border: 2px solid transparent; outline: 1px solid var(--line); outline-offset: 2px; border-radius:7px; margin: 3px 3px 10px; overflow: hidden; }
.theme-swatch i { position: absolute; inset: 11px 13px auto; height: 1px; background: currentColor; opacity: .25; }
.theme-swatch b { position: absolute; left: 13px; top: 15px; font-size:20px; font-weight:600; letter-spacing:normal; }
.theme-swatch small { position: absolute; bottom: 10px; left: 13px; width: 24px; height: 4px; border-radius:2px; background: currentColor; opacity: .2; }
.theme-option>span:last-child { font-size:14px; color: var(--ink-secondary); }
.theme-option.on .theme-swatch { outline: 2px solid var(--accent); }
.theme-option.on>span:last-child { color: var(--accent); }
.selection-control { padding-bottom: 4px; }
.selection-toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 4px 8px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
.selection-toolbar>div { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size:12px; }
.selection-toolbar button { padding: 0 4px; min-height: 44px; font-size:14px; color: var(--accent); }
.lifetime-label { font-size:12px; color: var(--muted); }
.year-select { display: flex; align-items: center; gap: 8px; min-width: 0; font-size:14px; color: var(--ink-secondary); }
.year-select select { max-width: 130px; min-height: 44px; padding: 8px; border: 1px solid var(--line); border-radius:var(--radius-control); background: var(--card); font-size:14px; color: var(--ink); }
.selection-list { max-height: 460px; overflow: auto; scrollbar-width: thin; }
.selection-row { position: relative; display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 16px 0; border-bottom: 1px solid var(--line); cursor: pointer; }
.selection-row:last-child { border: 0; }
.selection-row>input { position: absolute; opacity: 0; width: 20px; height: 20px; left: 0; }
.selection-check { display: grid; place-items: center; width: 20px; height: 20px; flex: none; border: 1px solid var(--line); border-radius:5px; background: var(--card); color: #fff; }
.selection-check svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; opacity: 0; }
.selection-row input:checked+.selection-check { background: var(--accent); border-color: var(--accent); }
.selection-row input:checked+.selection-check svg { opacity: 1; }
.selection-row input:focus-visible+.selection-check { outline: 2px solid var(--accent); outline-offset: 3px; }
.selection-copy { display: grid; gap: 5px; flex: 1; min-width: 0; }
.selection-copy>b { font-size:16px; font-weight: 500; line-height: 1.5; }
.selection-copy i { display: inline-block; padding: 0 4px; margin-left: 5px; font-size:12px; font-style: normal; color: var(--accent); background: var(--accent-soft); border-radius:4px; }
.selection-copy>span { font-size:14px; line-height: 1.6; color: var(--ink-secondary); overflow-wrap: anywhere; }
.selection-copy>small { font-size:12px; color: var(--muted); }
.selection-row>strong { flex: none; max-width: 38%; font-size:16px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.selection-empty { padding: 20px 0; color: var(--muted); text-align: center; font-size:14px; line-height: 1.7; }
.pagination-note { padding: 12px 0; margin: 0; border-top: 1px solid var(--line); font-size:12px; line-height: 1.7; color: var(--muted); }
.options-control { padding-top: 0; padding-bottom: 0; }
.options-control summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 56px; list-style: none; cursor: pointer; }
.options-control summary::-webkit-details-marker { display: none; }
.options-control summary>span { display: flex; align-items: center; gap: 8px; font-size:14px; }
.options-control summary svg { width: 18px; height: 18px; color: var(--muted); }
.options-control summary>small { font-size:12px; color: var(--muted); }
.options-control summary i { display: inline-block; font-size:16px; font-style: normal; margin-left: 4px; }
.options-control[open] summary i { transform: rotate(180deg); }
.advanced-options { padding-bottom: 16px; border-top: 1px solid var(--line); }
.quote-select { display: block; padding-top: 16px; font-size:14px; color: var(--ink-secondary); }
.quote-select select { display: block; width: 100%; min-width: 0; min-height: 44px; padding: 8px; margin-top: 8px; border: 1px solid var(--line); border-radius:var(--radius-control); background: var(--card); color: var(--ink); font-size:14px; }
.privacy-options { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 4px 8px; padding-top: 12px; }
.privacy-options label { display: flex; align-items: center; gap: 8px; min-height: 44px; font-size:14px; color: var(--ink-secondary); }
.privacy-options input { accent-color: var(--accent); width: 20px; height: 20px; margin: 0; flex: none; }
.advanced-options>p { font-size:12px; color: var(--muted); line-height: 1.7; margin: 12px 0 0; }
.caption-card { padding: 0 4px; }
.caption-card>div { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 8px; }
.caption-card>div>span { font-size:12px; color: var(--muted); }
.caption-card button { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; color: var(--accent); padding: 8px 0; font-size:14px; }
.caption-card button svg { width: 16px; height: 16px; }
.caption-card>p { max-height: 140px; overflow: auto; margin: 4px 0; color: var(--ink-secondary); font-size:14px; line-height: 1.7; white-space: pre-wrap; user-select: text; overflow-wrap: anywhere; }
.local-note { display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--muted); font-size:12px; margin: 20px 0 8px; }
.local-note svg { width: 14px; height: 14px; }
.poster-actions { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); z-index: 9; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; width: min(100%,580px); padding: 12px 16px max(12px,env(safe-area-inset-bottom)); background: var(--card); border-top: 1px solid var(--line); }
.action-summary { display: grid; gap: 4px; flex: 1 1 100%; min-width: 0; }
.action-summary>b { font-size:14px; font-weight: 500; }
.action-summary>span { font-size:12px; color: var(--muted); line-height: 1.5; }
.action-buttons { display: flex; align-items: center; gap: 12px; flex: 1 1 100%; }
.achievement-studio .primary-action { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 46px; padding: 0 16px; border: 0; border-radius:var(--radius-control); background: var(--accent); color: #fff; font-size:14px; font-weight: 500; text-decoration: none; }
.action-buttons .primary-action { flex: 1; }
.primary-action svg { width: 16px; height: 16px; }
.achievement-studio .share-action { min-height: 46px; padding: 0 16px; border: 1px solid var(--line); border-radius:var(--radius-control); color: var(--ink); font-size:14px; }
.achievement-studio .save-all-action { display: block; flex-basis: 100%; min-height: 44px; text-align: center; padding: 8px 0; color: var(--accent); font-size:14px; }
.save-all-action span { display: block; color: var(--muted); font-size:12px; }
.studio-state { margin: 16px; padding: 40px 20px; border-radius:var(--radius-card); background: var(--card); text-align: center; }
.studio-state>span { display: grid; place-items: center; width: 60px; height: 60px; margin: auto; border-radius:var(--radius-card); color: var(--muted); background: var(--chip); }
.studio-state svg { width: 28px; height: 28px; }
.studio-state h2 { font-size:18px; font-weight: 600; line-height: 1.6; margin: 20px 0 8px; }
.studio-state p { font-size:14px; line-height: 1.7; color: var(--muted); }
.studio-state .primary-action { margin-top: 12px; }
.studio-notice { position: fixed; bottom: 230px; left: 50%; transform: translateX(-50%); z-index: 30; width: max-content; max-width: calc(100vw - 32px); padding: 12px 16px; background: var(--ink); border-radius:var(--radius-control); color: #fff; font-size:12px; line-height: 1.7; }
.render-canvas { display: none; }
.image-preview { width: min(640px,calc(100% - 24px)); max-height: 92dvh; padding: 0; border: 0; border-radius:var(--radius-card); background: var(--bg); overflow: auto; }
.image-preview::backdrop { background: #1a1a1a; }
.image-preview header { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 60px; padding: 8px 12px; background: var(--card); color: var(--muted); font-size:12px; }
.image-preview header button { width: 44px; height: 44px; flex: none; border-radius:var(--radius-control); font-size:24px; color: var(--ink); }
.image-preview>img { display: block; width: 100%; height: auto; }
.image-preview>footer { position: sticky; bottom: 0; padding: 12px; background: var(--card); text-align: center; }
.image-preview>footer .primary-action { width: 100%; }
.loading-symbol { animation: soft-pulse 1.6s ease-in-out infinite; }
@keyframes soft-pulse { 50% { opacity: .4; } }
@media (min-width: 1000px) {
  .achievement-studio { padding-bottom: 160px; }
  .studio-layout { display: grid; grid-template-columns: minmax(0,1.05fr) minmax(0,.95fr); align-items: start; gap: 24px; padding: 0 28px; }
  .preview-panel { position: sticky; top: 20px; }
  .studio-intro { padding: 28px; }
  .poster-modes { margin: 24px 28px; }
  .poster-actions { width: min(100%,1160px); padding: 16px 28px; }
  .action-summary { flex: 1; }
  .action-buttons { flex: none; }
  .save-all-action span { display: inline; margin-left: 8px; }
  .control-card { padding: 20px; }
  .options-control { padding-top: 0; padding-bottom: 0; }
  .poster-stage { min-height: 440px; }
  .poster-image { max-height: 75dvh; object-fit: contain; }
  .selection-list { max-height: 490px; }
  .studio-notice { bottom: 160px; }
}
@media (max-width: 350px) {
  .studio-header { padding: 0 12px; }
  .studio-intro { padding: 20px 16px; }
  .poster-modes { margin: 16px 12px; gap: 8px; }
  .poster-modes button { padding: 12px 8px; gap: 4px 6px; }
  .studio-layout { padding: 0 12px; }
  .preview-panel { padding: 10px; }
  .poster-stage { min-height: 320px; }
  .control-card { padding: 16px 12px; }
  .options-control { padding-top: 0; padding-bottom: 0; }
  .theme-options { gap: 10px; }
  .theme-swatch { aspect-ratio: 1.4; }
  .theme-swatch b { font-size:18px; left: 9px; top: 13px; }
  .theme-swatch i { left: 9px; right: 9px; top: 10px; }
  .selection-row { gap: 8px; }
  .poster-actions { padding-right: 12px; padding-left: 12px; }
  .action-buttons { gap: 8px; }
  .achievement-studio .primary-action, .achievement-studio .share-action { padding: 0 12px; }
  .studio-state { margin: 16px 12px; padding: 32px 16px; }
}
@media (prefers-reduced-motion: reduce) { .loading-symbol { animation: none; } }
</style>

<style scoped src="../personal-ui.css"></style>
