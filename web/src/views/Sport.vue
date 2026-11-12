<template>
  <main class="clubs-page">
    <header class="clubs-header"><div><p class="page-eyebrow">一起出发</p><h1>我的跑团生活</h1></div><span class="directory-status">{{ ready && clubs.length ? clubs.length + ' 个已加入跑团' : '训练 · 赛事 · 跑友' }}</span></header>

    <section class="my-clubs service-group">
      <div class="section-heading"><h2>我的跑团</h2><span v-if="ready">{{ clubs.length }} 个</span></div>
      <p v-if="loading && !clubs.length" class="loading-state" role="status">正在载入跑团…</p>
      <div v-if="!ready" class="login-guide">
        <span class="club-letter" aria-hidden="true">团</span>
        <div><h3>登录后查看我的跑团</h3><p>团练、赛事与跑步记录都在这里</p></div>
        <router-link class="club-primary" to="/mine">登录</router-link>
      </div>
      <div v-else-if="clubs.length" class="my-club-directory">
        <div v-if="clubs.length > 4" class="my-club-search">
          <span class="search-glyph" aria-hidden="true"></span>
          <input v-model="mineQuery" aria-label="搜索我的跑团" placeholder="搜索名称、城市或团号" />
          <button v-if="mineQuery" type="button" aria-label="清空我的跑团搜索" @click="mineQuery = ''">清空</button>
        </div>
        <p v-if="searchingMine" class="my-search-count" role="status">找到 {{ matchingMyClubs.length }} 个跑团</p>
        <div id="my-club-list" class="my-club-list">
          <article v-for="club in shownMyClubs" :key="club.id" class="my-club">
            <router-link class="club-main" :to="'/clubs/' + club.id" :aria-label="'进入' + club.name"><ClubLogo class="club-letter" :src="club.logo" :name="club.name" /><div class="club-copy"><h3>{{ club.name }}</h3><small class="my-club-meta"><span class="my-club-city">{{ club.city || "城市待补充" }}</span><span v-if="club.members !== undefined">· {{ club.members }}人</span><span v-if="club.roleLabel" class="my-role" :class="{ leader: club.role === 'owner' || club.role === 'manager' }">{{ club.roleLabel }}</span></small></div></router-link>
            <div class="club-quick-actions"><router-link :to="'/clubs/' + club.id + '?tab=act'" :aria-label="club.name + '团练'"><span>团练</span></router-link><router-link :to="'/clubs/' + club.id + '?tab=race'" :aria-label="club.name + '赛事'"><span>赛事</span></router-link></div>
          </article>
        </div>
        <p v-if="searchingMine && !matchingMyClubs.length" class="my-search-empty">没有匹配的跑团，试试名称、城市或团号。</p>
        <button v-if="clubs.length > 4 && !searchingMine" class="my-clubs-toggle" type="button" :aria-expanded="mineExpanded" aria-controls="my-club-list" @click="mineExpanded = !mineExpanded">{{ mineExpanded ? '收起跑团' : '展开其余 ' + (clubs.length - 4) + ' 个跑团' }}<span aria-hidden="true">{{ mineExpanded ? '⌃' : '⌄' }}</span></button>
      </div>
      <div v-else-if="ready && !loading && !loadFailed" class="no-club"><div><strong>跑团生活，从一起出发开始</strong><span>搜一搜熟悉的跑团，或输入朋友分享的口令</span></div><a href="#discover-clubs" class="text-link">去发现 ›</a></div>
    </section>

    <router-link class="create-club" to="/clubs/new"><span class="create-mark"><RunnerIcon name="add" /></span><span><strong>{{ application ? '继续创建跑团' : '创建一个新跑团' }}</strong><small>{{ application ? '继续之前未完成的申请' : '把一起跑步的人聚在一起' }}</small></span><b>›</b></router-link>

    <section v-if="pendingClubs.length" class="pending-clubs"><div class="section-heading"><h2>入团审核</h2><span>{{ pendingClubs.length }} 个待处理</span></div><router-link v-for="club in pendingClubs" :key="club.id" class="pending-row" :to="'/clubs/' + club.id + '/public'"><span class="pending-indicator"></span><span>{{ club.name }}<small>申请已提交</small></span><b>审核中 ›</b></router-link></section>

    <section id="discover-clubs" class="discover"><div class="discovery-intro"><h2>找到一起跑的人</h2><p>按名称、城市寻找跑团，或用朋友分享的口令加入。</p></div>
      <div class="directory-heading"><h2>发现跑团</h2><span>找同城跑友</span></div>
      <div class="directory-tools">
        <div class="modes" role="tablist" aria-label="查找方式">
          <button type="button" role="tab" :aria-selected="mode === 'search'" :class="{ on: mode === 'search' }" @click="pick('search')">搜索跑团</button>
          <button type="button" role="tab" :aria-selected="mode === 'code'" :class="{ on: mode === 'code' }" @click="pick('code')">口令加入</button>
        </div>
        <div v-if="mode === 'code'" class="club-search">
          <span class="search-glyph" aria-hidden="true"></span>
          <input v-model="code" aria-label="跑团口令" placeholder="输入朋友分享的跑团口令" @keyup.enter="join" />
          <button type="button" @click="join"><span>查看</span></button>
        </div>
        <div v-else class="search-row">
          <div class="club-search">
            <span class="search-glyph" aria-hidden="true"></span>
            <input v-model="query" aria-label="搜索跑团" placeholder="跑团名称、负责人或团号" @input="onQuery" @keyup.enter="search" />
            <button type="button" @click="search"><span>搜索</span></button>
          </div>
          <div class="city-row"><label class="city-filter"><span class="city-pin" aria-hidden="true"></span><span>活动城市</span><input v-model="city" aria-label="筛选活动城市" maxlength="30" placeholder="不限城市" @input="onQuery" @keyup.enter="search" /></label><button v-if="city.trim()" class="city-reset" type="button" aria-label="清除城市筛选" @click="clearCity">不限</button><button class="city-apply" type="button" aria-label="应用城市筛选" @click="search">筛选<span aria-hidden="true">⌄</span></button></div>
        </div>
        <p v-if="mode === 'code'" class="hint">输入口令查看跑团介绍，再申请加入。</p>
        <div v-if="message" class="directory-message" :class="{ error: loadFailed }" role="status"><p>{{ message }}</p><button v-if="loadFailed" type="button" @click="search">重新加载</button></div>
        <div v-if="mode === 'search'" class="club-results">
          <div v-for="club in shownClubs" :key="club.id" class="club-hit">
            <ClubLogo class="club-letter result-letter" :src="club.logo" :name="club.name" />
            <div class="club-copy"><router-link class="result-identity" :to="club.joined ? '/clubs/' + club.id : '/clubs/' + club.id + '/public'"><strong>{{ club.name }}</strong><small>{{ club.city || "城市待补充" }}<template v-if="club.members !== undefined"> · {{ club.members }} 位成员</template></small></router-link><ClubVerificationBadge :club="club" /></div>
            <router-link class="result-action" :class="{ pending: club.pending && !club.joined, joined: club.joined }" :aria-label="club.joined ? '进入' + club.name : club.pending ? club.name + '审核中' : '查看介绍：' + club.name" :to="club.joined ? '/clubs/' + club.id : '/clubs/' + club.id + '/public'"><span>{{ club.joined ? '进入' : club.pending ? '审核中' : '查看' }}</span><RunnerIcon v-if="!club.pending || club.joined" name="arrow" /></router-link>
          </div>
          <p v-if="!loading && !loadFailed && !query.trim() && !openClubs.length" class="hint empty-directory">暂时没有其他跑团，试试朋友分享的口令。</p>
        </div>
        <button v-if="mode === 'search' && (moreCount || page < pages)" class="more" type="button" :disabled="loading" @click="more">{{ loading ? "正在加载…" : moreCount ? "查看其余 " + moreCount + " 个跑团" : "加载更多跑团" }}</button>
      </div>
    </section>

    <router-link v-if="ready" class="my-reports-link" to="/clubs/reports">跑团身份反馈与申诉 ›</router-link>
  </main>
</template>

<script setup>
import ClubLogo from "../components/ClubLogo.vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useClubSession } from "../useClubSession";
import RunnerIcon from "../components/RunnerIcon.vue";
import ClubVerificationBadge from "../components/ClubVerificationBadge.vue";
const router = useRouter();
const loading = ref(false), loadFailed = ref(false), application = ref(null), code = ref(""), query = ref(""), city = ref(""), showAll = ref(false), mode = ref("search"), clubs = ref([]), openClubs = ref([]), listedQuery = ref(""), listedCity = ref(""), message = ref(""), page = ref(1), pages = ref(1);
const mineQuery = ref(""), mineExpanded = ref(false);
let queryTimer, loadSeq = 0;
function reset() { loadSeq++; clearTimeout(queryTimer); code.value = ""; query.value = ""; city.value = ""; mineQuery.value = ""; mineExpanded.value = false; showAll.value = false; mode.value = "search"; listedQuery.value = ""; listedCity.value = ""; page.value = 1; pages.value = 1; clubs.value = []; openClubs.value = []; application.value = null; message.value = ""; loading.value = false; loadFailed.value = false; }
const { token, request, capture, current } = useClubSession(reset);
const ready = computed(() => Boolean(token.value));
const searchingMine = computed(() => Boolean(mineQuery.value.trim()));
const matchingMyClubs = computed(() => {
  const needle = mineQuery.value.trim().replace(/^#/, "").toLocaleLowerCase();
  return clubs.value.filter(club => [club.name, club.city, club.cityLabel, club.leader, club.roleLabel, club.id].some(value => String(value ?? "").toLocaleLowerCase().includes(needle)));
});
const shownMyClubs = computed(() => searchingMine.value ? matchingMyClubs.value : mineExpanded.value ? clubs.value : clubs.value.slice(0, 4));
const pendingClubs = computed(() => openClubs.value.filter(club => club.pending && !club.joined));
const shownClubs = computed(() => query.value.trim() !== listedQuery.value || city.value.trim() !== listedCity.value ? [] : showAll.value ? openClubs.value : openClubs.value.slice(0, 6));
const moreCount = computed(() => showAll.value ? 0 : Math.max(0, openClubs.value.length - 6));
async function load(append = false) {
  const seq = ++loadSeq, stamp = capture(), q = query.value.trim(), location = city.value.trim(), nextPage = append ? page.value + 1 : 1;
  loading.value = true; loadFailed.value = false;
  try {
    const jobs = [request('/clubs/directory?' + new URLSearchParams({ q, city: location, page: String(nextPage), pageSize: '20' }))];
    if (ready.value && !append) jobs.push(request('/me'));
    const [directory, me] = await Promise.all(jobs);
    if (seq !== loadSeq || !current(stamp)) return;
    listedQuery.value = q; listedCity.value = location;
    if (me) { clubs.value = (me.clubs || []).map(club => ({ ...club, members: club.members ?? club.memberCount ?? directory.clubs?.find(item => item.id === club.id)?.members })); application.value = me.applications?.[0] || null; }
    if (!ready.value) clubs.value = [];
    openClubs.value = append ? [...openClubs.value, ...(directory.clubs || [])].filter((club, index, rows) => rows.findIndex(item => item.id === club.id) === index) : directory.clubs || [];
    page.value = directory.page || 1; pages.value = directory.pages || 1;
    if (!openClubs.value.length && q) message.value = '没有找到这个跑团';
  } catch (err) { if (!err.stale && seq === loadSeq && current(stamp)) { loadFailed.value = true; message.value = err.message; } }
  finally { if (seq === loadSeq && current(stamp)) loading.value = false; }
}
function pick(next) { mode.value = next; message.value = ""; }
function onQuery() { showAll.value = false; message.value = ""; loadSeq++; clearTimeout(queryTimer); queryTimer = setTimeout(search, query.value.trim() ? 250 : 0); }
function search() { clearTimeout(queryTimer); message.value = ""; showAll.value = false; return load(); }
function clearCity() { city.value = ""; return search(); }
function more() { if (moreCount.value) { showAll.value = true; return; } if (!loading.value && page.value < pages.value) { showAll.value = true; load(true); } }
function join() { message.value = ""; if (!code.value.trim()) { message.value = '填写群里的跑团口令'; return; } router.push('/clubs/invite/' + encodeURIComponent(code.value.trim())); }
watch(token, () => load(), { immediate: true });
onBeforeUnmount(() => { clearTimeout(queryTimer); loadSeq++; });
</script>

<style scoped>
.clubs-page{--accent:#ff1838;--accent-soft:#fff0f2;--bg:#f5f5f5;--card:#fff;--ink:#1a1a1a;--muted:#777;--line:#eee;--field-bg:#f5f5f5;background:var(--bg);color:var(--ink);padding-bottom:20px;font-size:14px}
.clubs-page button,.clubs-page a{box-sizing:border-box}.clubs-page button{min-height:44px;font-weight:500}.clubs-page button:focus-visible,.clubs-page a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.clubs-header{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:20px 16px 24px;background:linear-gradient(135deg,#fff0f2 0%,#fff8f9 70%,#f5f5f5 100%);color:var(--ink)}.clubs-header h1{margin:4px 0 0;font-size:24px;font-weight:600;line-height:1.35}.page-eyebrow{margin:0;color:var(--muted);font-size:12px}.directory-status{max-width:110px;color:var(--muted);font-size:12px;text-align:right}
.my-clubs,.pending-clubs{margin:0 16px 12px;padding:16px 16px 4px;border:0;border-radius:12px;background:#fff}.directory-section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}.section-eyebrow{font-size:12px;color:var(--accent)}.section-helper{font-size:12px;color:var(--muted)}.section-heading,.directory-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}.section-heading h2,.directory-heading h2,.discovery-intro h2{margin:0;font-size:18px;font-weight:600;line-height:1.4}.section-heading>span,.directory-heading>span{font-size:12px;color:var(--muted)}.directory-heading{margin-top:20px}.discovery-intro{display:none}
.loading-state,.hint,.my-search-count,.my-search-empty{color:var(--muted);font-size:12px;line-height:1.7}.loading-state{padding:12px 0}.login-guide{display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:10px;padding:4px 0 12px}.login-guide h3{margin:0;font-size:15px;font-weight:500}.login-guide p{margin:4px 0 0;color:var(--muted);font-size:12px}.club-primary{display:flex;align-items:center;justify-content:center;min-height:44px;padding:8px 12px;border-radius:8px;color:var(--accent);background:var(--accent-soft);font-size:14px}.club-letter{display:grid;place-items:center;flex:none;width:40px;height:40px;border:0;border-radius:8px;background:var(--field-bg);color:var(--ink);font-size:18px;font-weight:500;overflow:hidden}
.my-club-search,.club-search{display:flex;align-items:center;gap:10px;min-height:46px;padding:0 8px 0 12px;border:1px solid transparent;border-radius:8px;background:var(--field-bg)}.my-club-search input,.club-search input{flex:1;width:0;min-width:0;height:44px;padding:0;border:0;outline:0;background:transparent;color:var(--ink);font-size:14px}.my-club-search button{min-width:44px;padding:0 6px;color:var(--muted);font-size:12px}.my-club-search:focus-within,.club-search:focus-within{border-color:#ffb6c0}.search-glyph{position:relative;flex:none;width:12px;height:12px;margin-right:2px;border:1.5px solid #999;border-radius:50%}.search-glyph:after{position:absolute;right:-4px;bottom:-2px;width:5px;height:1.5px;background:#999;transform:rotate(45deg);content:''}
.my-club-list{display:flex;flex-direction:column}.my-club{position:relative;display:flex;align-items:center;gap:8px;min-height:76px}.my-club+.my-club:before,.club-hit+.club-hit:before{position:absolute;top:0;right:0;left:50px;height:1px;background:var(--line);content:''}.club-main{display:flex;flex:1;align-items:center;gap:10px;min-width:0;min-height:64px;padding:8px 0}.club-copy{flex:1;min-width:0}.club-copy h3,.club-copy strong{display:block;margin:0;overflow:hidden;color:var(--ink);font-size:15px;font-weight:500;line-height:1.5;text-overflow:ellipsis;white-space:nowrap}.club-copy small{display:block;margin-top:4px;overflow:hidden;color:var(--muted);font-size:12px;line-height:1.6;text-overflow:ellipsis;white-space:nowrap}.club-copy .my-club-meta{display:flex;align-items:center;gap:4px}.my-club-meta>span{flex:none}.my-club-meta .my-club-city{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}.my-role{padding:0 4px;border-radius:3px;color:var(--muted);background:var(--field-bg);font-size:12px;line-height:18px}.my-role.leader{color:var(--accent);background:var(--accent-soft)}.club-quick-actions{display:flex;flex:none;gap:4px}.club-quick-actions a{display:flex;align-items:center;justify-content:center;width:44px;min-height:44px;font-size:12px;color:#555}.club-quick-actions a>span{display:flex;align-items:center;justify-content:center;width:42px;min-height:30px;border:1px solid var(--line);border-radius:6px}.my-clubs-toggle,.more{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:44px;border:0;border-top:1px solid var(--line);color:var(--accent);background:transparent;font-size:12px}.my-clubs-toggle span{color:var(--muted)}
.no-club{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0 16px}.no-club div{display:grid;gap:5px;min-width:0}.no-club strong{font-size:15px;font-weight:500}.no-club span{color:var(--muted);font-size:12px}.text-link{color:var(--accent);font-size:12px;white-space:nowrap}.pending-row{display:flex;align-items:center;gap:8px;min-height:52px;font-size:14px}.pending-row+ .pending-row{border-top:1px solid var(--line)}.pending-row>span:nth-child(2){display:grid;flex:1;min-width:0}.pending-row small,.pending-row b{color:var(--muted);font-size:12px;font-weight:400}.pending-indicator{width:5px;height:5px;background:var(--accent);border-radius:50%}
.create-club{display:flex;align-items:center;gap:12px;margin:0 16px 12px;padding:14px 16px;border:0;border-radius:12px;background:#fff;color:var(--ink)}.create-mark{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:8px;background:var(--accent-soft);color:var(--accent)}.create-mark svg{width:20px;height:20px}.create-club>span:nth-child(2){display:grid;flex:1;gap:4px;min-width:0}.create-club strong{font-size:15px;font-weight:500}.create-club small{font-size:12px;color:var(--muted)}.create-club>b{color:var(--muted);font-size:20px;font-weight:400}
.discover{margin:0 16px 12px}.directory-tools{padding:0 16px 4px;border:0;border-radius:12px;background:#fff}.modes{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-bottom:12px;border-bottom:1px solid var(--line)}.modes button{position:relative;min-height:48px;padding:0 8px;background:transparent;border:0;border-radius:0;color:var(--muted);font-size:14px}.modes button.on{color:var(--accent)}.modes button.on:after{position:absolute;bottom:0;left:calc(50% - 12px);height:2px;width:24px;background:var(--accent);content:''}.search-row{display:flex;flex-direction:column;gap:4px}.club-search button{display:flex;align-items:center;justify-content:center;flex:0 0 56px;width:56px;height:44px;padding:0;background:transparent;color:#fff;font-size:14px}.club-search button>span{display:flex;align-items:center;justify-content:center;width:56px;height:34px;background:var(--accent);border-radius:8px}.city-row{display:flex;align-items:center;gap:6px;min-height:44px;border-bottom:1px solid var(--line)}.city-filter{display:flex;align-items:center;flex:1;gap:8px;min-width:0;min-height:44px;color:var(--muted);font-size:12px}.city-filter>span{flex:none;white-space:nowrap}.city-filter input{flex:1;width:0;min-width:0;height:42px;padding:0;border:0;background:transparent;color:var(--ink);font-size:12px}.city-pin{width:10px;height:12px;border:1px solid #999;border-radius:7px 7px 7px 0;transform:rotate(-45deg)}.city-reset,.city-apply{display:flex;align-items:center;justify-content:center;flex:none;min-width:44px;gap:3px;padding:0;color:var(--accent);font-size:12px}.city-reset{color:var(--muted)}.club-hit{position:relative;display:flex;align-items:center;gap:10px;min-height:76px;padding:8px 0}.result-letter{width:40px;height:40px}.result-action{display:flex;align-items:center;justify-content:flex-end;gap:4px;flex:none;min-width:44px;min-height:44px;color:var(--muted);background:transparent;font-size:12px}.result-action svg{width:13px;height:13px}.result-action.joined{color:var(--accent)}.result-action.pending span{padding:4px 6px;border-radius:5px;background:var(--field-bg);font-size:12px}.directory-message{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}.directory-message p{flex:1;line-height:1.7}.directory-message.error,.directory-message button{color:var(--accent)}.directory-message button{font-size:12px}.identity-badge{min-height:44px!important;padding:0!important;font-size:12px!important}.my-reports-link{display:flex;align-items:center;justify-content:center;min-height:44px;color:var(--muted);font-size:12px}
@media(min-width:760px){.clubs-header{padding:28px 24px}.my-clubs,.pending-clubs{margin:0 24px 12px}.create-club{margin:0 24px 12px}.discover{margin:0 24px 12px}.my-club{min-height:72px}.club-quick-actions{gap:8px}}
@media(max-width:350px){.clubs-header{align-items:flex-start}.directory-status{max-width:90px;margin-top:5px}.clubs-header h1{font-size:22px}.section-helper{max-width:140px;text-align:right}.club-main{gap:8px}.club-quick-actions{gap:2px}.club-quick-actions a>span{width:40px}}
</style>
