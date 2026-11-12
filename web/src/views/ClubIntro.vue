<template>
  <main class="intro-page service-page">
    <header class="topbar"><router-link to="/clubs" aria-label="返回跑团">‹</router-link><h1>跑团介绍</h1><span></span></header>
    <section v-if="loading" class="intro-state" role="status">正在打开跑团…</section>
    <section v-else-if="club && (club.publicStatus === 'restricted' || club.restricted)" class="intro-content"><div class="intro-card"><div class="intro-eyebrow">跑团公开状态</div><h2>{{ club.name }}</h2><p class="intro-tagline">{{ club.city || "城市待补充" }} · 团号 #{{ club.id }}</p><h3>暂时停止公开展示与招募</h3><p class="intro-access">{{ club.statusMessage || "团内成员和历史记录保留。团长可在跑团身份页补充说明或申请复核。" }}</p><template v-if="club.joined"><p class="intro-access" role="status">你已加入这个跑团，仍可进入查看团内记录。</p><button class="intro-primary restricted-enter" type="button" @click="enterClub">进入已加入的跑团</button></template><router-link v-if="club.canManageIdentity === true" class="intro-report-entry" :to="'/clubs/' + club.id + '/identity'" @click.capture="checkIdentityAccess">我是团长，查看说明与补充途径 ›</router-link><router-link class="intro-report-entry" :to="'/clubs/' + club.id + '/report?type=management'">向平台补充说明 ›</router-link></div></section>
    <div v-else-if="club" class="intro-content">
      <section class="intro-card" aria-label="跑团名片">
        <div class="intro-track" aria-hidden="true"></div>
        <div class="intro-eyebrow"><span></span>跑团名片</div>
        <ClubLogo class="club-letter" :src="club.logo" :name="club.name" />
        <h2>{{ club.name }}</h2><ClubVerificationBadge :club="club" /><p class="intro-tagline">{{ club.city || "城市待补充" }} · 团号 #{{ club.id }}</p><p v-if="club.intro" class="intro-tagline">{{ club.intro }}</p>
        <div class="intro-facts"><div><span>团长</span><strong>{{ club.leader || "跑团管理员" }}</strong></div><div class="intro-count"><strong>{{ club.memberCount }}</strong><span>位成员</span></div></div>
      </section>
      <section class="intro-benefits">
        <h3>加入后，一起开跑</h3>
        <div class="intro-features">
          <div><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16m-11 5 2 2 4-4"/></svg><span>团练约跑</span></div>
          <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V3m0 1h13l-3 5 3 5H6"/></svg><span>赛事同行</span></div>
          <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V12h5m0 8V5h6v15m0-9h5v9M3 20h18"/></svg><span>跑量排行</span></div>
        </div>
        <p class="intro-access">审核通过后，即可查看团内活动、成员与参赛信息。</p>
      </section>
      <div v-if="club.joined" class="intro-status joined" role="status"><span class="status-dot"></span><div><strong>你已加入这个跑团</strong><p>去看看跑友们的最新动态。</p></div></div>
      <div v-else-if="club.pending" class="intro-status pending" role="status"><span class="status-dot"></span><div><strong>申请已提交，等待审核</strong><p>团长或管理员审核通过后，即可进入跑团。</p></div></div>
      <p v-if="message" class="intro-error" role="alert">{{ message }}</p>
      <p class="intro-join-identity">你将申请加入：{{ club.name }} · {{ club.city || "城市待补充" }} · #{{ club.id }}<br>负责人 {{ club.leader || "待补充" }}</p><router-link class="intro-report-entry" :to="'/clubs/' + club.id + '/report'">名称或身份被冒用？向平台私密反馈 ›</router-link><p class="intro-foot">每一次出发，都有人同行</p>
      <footer class="intro-dock">
        <button ref="shareButton" class="intro-share" type="button" :disabled="sharing" @click="shareInvite"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6m0-6L10 14M10 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4"/></svg>分享跑团</button>
        <button v-if="club.joined" class="intro-primary" type="button" @click="enterClub">进入跑团</button>
        <button v-else-if="club.pending" class="intro-primary waiting" type="button" disabled>等待审核</button>
        <button v-else class="intro-primary" type="button" :disabled="applying" @click="apply">{{ applying ? "正在提交" : ready ? "申请加入" : "登录并申请加入" }}</button>
      </footer>
    </div>
    <section v-else class="intro-state error" role="alert"><p>{{ message || "没有找到这个跑团" }}</p><button type="button" @click="load">重新加载</button></section>
    <Teleport to="body">
      <div v-if="shareOpen" class="intro-share-overlay" :class="{ 'wechat-guide-overlay': isWeChat }" @click.self="closeShare">
        <section ref="shareDialog" class="intro-share-dialog" :class="{ 'wechat-guide': isWeChat }" role="dialog" aria-modal="true" aria-labelledby="intro-share-title" tabindex="-1" @keydown="onDialogKeydown">
          <template v-if="isWeChat">
            <svg class="guide-arrow" viewBox="0 0 72 64" aria-hidden="true"><path d="M8 56C45 56 54 35 54 8m-14 12L54 6l12 14"/></svg>
            <span class="guide-kicker">把跑团分享给跑友</span><h2 id="intro-share-title">点右上角，分享跑团</h2>
            <p class="share-description">打开微信「···」菜单，选择分享方式。</p>
            <div class="guide-options"><span>发送给朋友 <small>好友 / 微信群</small></span><span>分享到朋友圈 <small>让更多跑友看到</small></span></div>
            <p class="share-privacy">朋友打开后先看跑团介绍，申请通过后才能查看团内详情。</p>
            <button class="guide-done" type="button" @click="closeShare">我知道了</button>
          </template>
          <template v-else>
            <div class="share-dialog-heading"><h2 id="intro-share-title">分享跑团</h2><button class="share-close" type="button" aria-label="关闭分享" @click="closeShare">×</button></div>
            <div class="share-preview"><ClubLogo class="share-letter" :src="club.logo" :name="club.name" /><div><strong>{{ club.name }}</strong><p>{{ club.city || "城市待补充" }} · 负责人 {{ club.leader || "待补充" }} · #{{ club.id }}</p></div></div>
            <p class="share-description">{{ shareHint || '当前浏览器暂不支持直接转发。可复制链接，发给微信好友或微信群。' }}</p>
            <button class="share-copy" type="button" @click="copyInvite">{{ copied ? '链接已复制' : '复制链接' }}</button>
            <p class="share-feedback" role="status">{{ shareFeedback }}</p>
            <p class="share-privacy">分享仅包含公开介绍，团内详情需审核通过后查看。</p>
          </template>
        </section>
      </div>
    </Teleport>
  </main>
</template>

<script setup>
import ClubLogo from "../components/ClubLogo.vue";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api as requestApi } from "../api";
import { copyText } from "../copy";
import { clubIdentity } from "../club-identity";
import ClubVerificationBadge from "../components/ClubVerificationBadge.vue";
const route = useRoute();
const router = useRouter();
const club = ref(null), loading = ref(true), applying = ref(false), message = ref("");
const shareOpen = ref(false), sharing = ref(false), copied = ref(false), shareHint = ref(""), shareFeedback = ref("");
const shareButton = ref(null), shareDialog = ref(null);
const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
let loadVersion = 0, previousOverflow = "", scrollLocked = false;
let disposed = false, canonicalRoute = "";
const previousTitle = document.title;
const ready = ref(Boolean(localStorage.getItem("marathon_token")));
let accountToken = localStorage.getItem("marathon_token");
function syncAccount() { const next = localStorage.getItem("marathon_token"); if (next === accountToken) return false; accountToken = next; loadVersion++; club.value = null; applying.value = false; sharing.value = false; message.value = ""; ready.value = Boolean(next); closeShare(); return true; }
async function api(path, options) { if (syncAccount()) throw Object.assign(new Error("账号已切换"), { stale: true }); const account = localStorage.getItem("marathon_token"); try { const data = await requestApi(path, options); if (account !== localStorage.getItem("marathon_token")) { syncAccount(); throw Object.assign(new Error("账号已切换"), { stale: true }); } return data; } catch (err) { if (account !== localStorage.getItem("marathon_token")) { syncAccount(); err.stale = true; } throw err; } }
function onAccountEvent() { if (syncAccount()) load(); }
window.addEventListener("storage", onAccountEvent); window.addEventListener("focus", onAccountEvent);
function invitePath() {
  if (route.params.code) return "/clubs/invite/" + encodeURIComponent(route.params.code);
  return "/clubs/" + encodeURIComponent(route.params.id) + "/public";
}
function publicUrl() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return window.location.origin + base + publicPath();
}
function publicPath() { return "/clubs/" + encodeURIComponent(club.value.id) + "/public"; }
async function load() {
  syncAccount();
  const version = ++loadVersion;
  closeShare(); club.value = null; applying.value = false; message.value = ""; loading.value = true;
  const path = route.params.code ? "/clubs/invite/" + encodeURIComponent(route.params.code) : "/clubs/" + encodeURIComponent(route.params.id) + "/public";
  try {
    const data = await api(path);
    if (version !== loadVersion) return;
    club.value = data.club;
    if (route.query.apply === "1" && ready.value) await submitApplication();
    if (version !== loadVersion || disposed) return;
    document.title = clubIdentity(club.value);
    // 微信菜单分享使用当前地址，先去掉登录回跳的申请参数。
    if (route.fullPath !== publicPath()) {
      // 这是当前名片的地址规范化，保留已加载的数据，避免再请求一次。
      canonicalRoute = publicPath();
      try { await router.replace(canonicalRoute); await nextTick(); }
      finally { canonicalRoute = ""; }
    }
  } catch (err) { if (version === loadVersion) message.value = err.message; }
  finally { if (version === loadVersion) loading.value = false; }
}
async function apply() {
  if (!ready.value) {
    localStorage.setItem("marathon_return_after_login", invitePath() + "?apply=1");
    await router.push("/mine"); return;
  }
  await submitApplication();
}
function enterClub() {
  if (syncAccount()) { load(); return; }
  if (disposed || loading.value || !club.value?.joined) return;
  router.push('/clubs/' + club.value.id);
}
function checkIdentityAccess(event) {
  if (syncAccount()) { event.preventDefault(); load(); return; }
  if (disposed || loading.value || club.value?.canManageIdentity !== true) event.preventDefault();
}
async function submitApplication() {
  if (!club.value || club.value.publicStatus === "restricted" || club.value.restricted || club.value.pending || club.value.joined || applying.value) return;
  const version = loadVersion;
  const clubId = Number(club.value.id);
  const returnPath = publicPath() + "?apply=1";
  applying.value = true; message.value = "";
  try {
    const data = await api("/clubs/join", { method: "POST", body: JSON.stringify({ clubId }) });
    if (disposed || version !== loadVersion) return;
    if (data.joined) { await router.replace("/clubs/" + clubId); return; }
    club.value.pending = true;
  } catch (err) {
    if (disposed || version !== loadVersion) return;
    message.value = err.message;
    if (err.status === 401) {
      localStorage.removeItem("marathon_token"); localStorage.removeItem("marathon_name");
      localStorage.setItem("marathon_return_after_login", returnPath);
      await router.push("/mine");
    }
  } finally { if (!disposed && version === loadVersion) applying.value = false; }
}
async function shareInvite() {
  if (!club.value || club.value.publicStatus === "restricted" || club.value.restricted || loading.value || sharing.value) return;
  const version = loadVersion;
  shareHint.value = ""; shareFeedback.value = ""; copied.value = false;
  if (!isWeChat && typeof navigator.share === "function") {
    sharing.value = true;
    try {
      await navigator.share({ title: clubIdentity(club.value), text: clubIdentity(club.value) + " · 负责人 " + (club.value.leader || "待补充") + "，查看介绍后申请加入。", url: publicUrl() });
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
      shareHint.value = "暂时无法打开系统分享，可复制链接发给跑友。";
    } finally { sharing.value = false; }
  }
  if (disposed || version !== loadVersion) return;
  previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; scrollLocked = true;
  shareOpen.value = true;
  await nextTick(); shareDialog.value?.focus();
}
function closeShare() {
  const wasOpen = shareOpen.value; shareOpen.value = false;
  if (scrollLocked) { document.body.style.overflow = previousOverflow; scrollLocked = false; }
  if (wasOpen) shareButton.value?.focus();
}
function onDialogKeydown(event) {
  if (event.key === "Escape") { event.preventDefault(); closeShare(); return; }
  if (event.key !== "Tab") return;
  const controls = shareDialog.value?.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]');
  if (!controls?.length) return;
  const first = controls[0], last = controls[controls.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === shareDialog.value)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || document.activeElement === shareDialog.value)) { event.preventDefault(); first.focus(); }
}
async function copyInvite() {
  if (!club.value) return;
  try { await copyText(publicUrl()); copied.value = true; shareFeedback.value = "链接已复制，可粘贴到微信发给跑友。"; }
  catch (err) { copied.value = false; shareFeedback.value = "复制未成功，请从浏览器地址栏复制链接。"; }
}
onBeforeUnmount(() => { window.removeEventListener("storage", onAccountEvent); window.removeEventListener("focus", onAccountEvent); disposed = true; loadVersion++; closeShare(); document.title = previousTitle; });
watch(() => [route.params.id, route.params.code, route.query.apply], () => {
  if (canonicalRoute && route.fullPath === canonicalRoute) return;
  load();
}, { immediate: true });
</script>

<style scoped>
.intro-page { min-height: 100vh; padding-bottom: 76px; background: var(--bg); }
.intro-page .topbar { background: transparent; border-bottom: 0; }
.intro-content { padding: 12px 16px 24px; }
.intro-card { position: relative; overflow: hidden; padding: 24px; border-radius:12px; background: var(--card);  border: 1px solid var(--line);}
.intro-eyebrow { position: relative; display: flex; align-items: center; gap: 7px; color: var(--accent); font-size: 12px; letter-spacing: normal; }
.intro-eyebrow > span { width: 6px; height: 6px; background: currentColor; border-radius: 50%; }
.intro-track { position: absolute; top: -32px; right: -105px; width: 230px; height: 270px; border: 1px solid var(--line); border-radius:12px; transform: rotate(32deg);  border-color: var(--line);}
.intro-track::before, .intro-track::after { position: absolute; inset: 12px; border: 1px solid var(--line); border-radius:12px; content: "";  border-color: var(--line);}
.intro-track::after { inset: 24px; border-radius:12px; }
.club-letter { position: relative; display: grid; place-items: center; width: 64px; height: 64px; margin-top: 32px; color: #fff; background: var(--accent); border-radius: 14px; font-size: 30px; font-weight: 600; }
.intro-card h2 { position: relative; margin: 20px 0 0; font-size: 24px; font-weight:600; line-height: 1.4; letter-spacing: normal; overflow-wrap: anywhere; }
.intro-tagline { position: relative; margin: 10px 0 0; color: var(--muted); font-size: 14px; }
.intro-facts { position: relative; display: flex; align-items: flex-end; gap: 16px; margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--line); }
.intro-facts > div { flex: 1; min-width: 0; }
.intro-facts span { display: block; color: var(--muted); font-size: 12px; }
.intro-facts strong { display: block; margin-top: 6px; font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
.intro-facts .intro-count { flex: none; display: flex; align-items: baseline; gap: 6px; }
.intro-count strong { margin: 0; font-size: 28px; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; }
.intro-benefits { margin-top: 16px; padding: 22px 20px 18px; background: var(--card); border-radius:12px;  border: 1px solid var(--line);}
.intro-benefits h3 { margin: 0; font-size: 16px; font-weight: 600; }
.intro-features { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 24px; }
.intro-features > div { display: flex; align-items: center; flex-direction: column; gap: 10px; font-size: 14px; }
.intro-features svg { width: 26px; height: 26px; color: var(--accent); fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.intro-access { margin: 22px 0 0; padding-top: 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; line-height: 1.8; }
.intro-status { display: flex; gap: 10px; margin-top: 16px; padding: 16px; border-radius: 12px; background: var(--card); }
.status-dot { flex: none; width: 7px; height: 7px; margin-top: 6px; border-radius: 50%; background: var(--accent); }
.intro-status strong { font-size: 14px; font-weight: 500; }
.intro-status p { margin: 5px 0 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
.pending .status-dot { background: var(--accent); }
.intro-foot { margin: 24px 0 0; color: var(--muted); text-align: center; font-size: 12px; letter-spacing: normal; }
.intro-dock { position: fixed; z-index: 20; right: 0; bottom: 0; left: 0; display: flex; gap: 12px; width: min(430px, 100%); margin: 0 auto; padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px)); background: var(--card); border-top: 1px solid var(--line); }
.intro-primary, .intro-share { min-height: 48px; border-radius: 12px; font-size: 14px; font-weight: 600; }
.intro-primary { flex: 1; min-width: 0; padding: 0 12px; color: #fff; background: var(--accent); }
.intro-primary:disabled { opacity: .68; }
.intro-primary.waiting { color: var(--muted); background: var(--chip); opacity: 1; }
.restricted-enter { width: 100%; margin-top: 18px; }
.intro-share { display: flex; align-items: center; justify-content: center; gap: 7px; flex: none; padding: 0 16px; color: var(--ink); background: var(--bg); }
.intro-share svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.intro-state { padding: 100px 24px; color: var(--muted); text-align: center; font-size: 14px; }
.intro-state button { margin-top: 12px; padding: 10px 18px; border-radius: 8px; color: var(--accent); background: var(--card); }
.intro-state.error, .intro-error { color: var(--accent); }
.intro-error { margin: 16px 4px 0; font-size: 14px; }
.intro-share-overlay { position: fixed; z-index: 100; inset: 0; display: flex; align-items: flex-end; justify-content: center; background: rgba(20, 22, 30, .48); }
.intro-share-dialog { position: relative; width: min(430px, 100%); max-height: calc(100dvh - 40px); overflow-y: auto; padding: 24px 24px calc(24px + env(safe-area-inset-bottom, 0px)); border-radius:12px 12px 0 0; background: var(--card); outline: none; }
.share-dialog-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.intro-share-dialog h2 { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.5; }
.share-close { flex: none; width: 40px; height: 40px; margin: -8px -8px -8px 0; color: var(--muted); font-size: 28px; }
.share-preview { display: flex; align-items: center; gap: 12px; margin-top: 24px; padding: 16px; border-radius: 12px; background: var(--field-bg); }
.share-letter { display: grid; place-items: center; flex: none; width: 44px; height: 44px; border-radius: 12px; color: var(--accent); background: var(--field-bg); font-size: 22px; }
.share-preview > div { min-width: 0; }
.share-preview strong { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.share-preview p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
.share-description { margin: 20px 0 0; color: var(--muted); font-size: 14px; line-height: 1.8; }
.share-copy, .guide-done { width: 100%; min-height: 46px; margin-top: 20px; border-radius: 12px; color: var(--ink); background: var(--chip); font-size: 14px; font-weight: 500; }
.share-feedback { margin: 12px 0 0; color: var(--accent); font-size: 14px; }
.share-feedback:empty { display: none; }
.share-privacy { margin: 16px 0 0; color: var(--muted); font-size: 12px; line-height: 1.8; }
.wechat-guide-overlay { align-items: flex-start; padding: 80px 16px 24px; }
.intro-share-dialog.wechat-guide { width: min(398px, 100%); max-height: calc(100dvh - 104px); overflow: visible; padding: 28px 24px 24px; border-radius:12px; }
.guide-arrow { position: absolute; top: -64px; right: 20px; width: 64px; height: 56px; fill: none; stroke: var(--line); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.guide-kicker { display: block; margin-bottom: 8px; color: var(--accent); font-size: 12px; }
.guide-options { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; }
.guide-options > span { padding: 16px 8px; border-radius: 10px; background: var(--accent-soft); text-align: center; font-size: 14px; font-weight: 500; }
.guide-options small { display: block; margin-top: 6px; color: var(--muted); font-size: 12px; font-weight: 400; }
.guide-done { color: #fff; background: var(--accent); }
@media (max-height: 600px) {
  .wechat-guide-overlay { padding: 16px; }
  .intro-share-dialog.wechat-guide { max-height: calc(100dvh - 32px); overflow-y: auto; }
  .guide-arrow { display: none; }
}
@media (max-width: 350px) {
  .intro-content { padding: 8px 12px 24px; }
  .intro-card { padding: 20px;  border-radius:12px; border: 1px solid var(--line); background: var(--card);}
  .intro-card h2 { font-size: 24px; }
  .intro-share { gap: 5px; padding: 0 12px; }
  .intro-primary, .intro-share { font-size: 14px; }
  .intro-dock { gap: 10px; padding-right: 12px; padding-left: 12px; }
  .intro-share-dialog { padding-right: 20px; padding-left: 20px;  border-radius:12px 12px 0 0;}
}
.intro-join-identity{text-align:center;font-size:12px;color:var(--muted);line-height:1.9;overflow-wrap:anywhere;margin:18px 0 4px}.intro-report-entry{display:flex;align-items:center;justify-content:center;min-height:44px;font-size:12px;color:var(--muted)}


/* Public club details use the shared neutral service palette. */
.intro-page { background:transparent; }.intro-page>.topbar { background:transparent; }
.intro-card { background:var(--card);border-color:var(--line);box-shadow:none; }.intro-track { border-color:var(--line);opacity:.6; }.intro-facts { border-color:var(--line); }.intro-card .club-letter { background:var(--card);box-shadow:none; }
.intro-benefits { background:var(--card);border-color:var(--line); }.intro-features>div { color:var(--muted); }.intro-features>div:nth-child(2) { color:var(--muted); }.intro-features>div:nth-child(3) { color:var(--muted); }
.intro-status.joined { background:var(--field-bg);border-color:var(--line); }.intro-status.pending { background:var(--field-bg);border-color:var(--line); }

/* Shared typography and controls for club services. */

.intro-page { font-size:14px; background:var(--bg); color:var(--ink); }
.intro-card,.intro-benefits { border:1px solid var(--line); border-radius:12px; background:var(--card); box-shadow:none; }
.intro-card h2 { font-size:24px; font-weight:600; letter-spacing:normal; }
.intro-track { display:none; }
.intro-card .club-letter { background:var(--accent); border-radius:12px; box-shadow:none; }
.intro-features>div,.intro-features>div:nth-child(2),.intro-features>div:nth-child(3) { color:var(--muted); }
.intro-status.joined,.intro-status.pending { color:var(--ink); border-color:var(--line); background:var(--field-bg); }
.intro-primary,.intro-share,.share-copy,.guide-done { min-height:44px; border-radius:10px; font-size:14px; font-weight:500; }
.intro-benefits h3,.intro-share-dialog h2 { font-size:18px; font-weight:600; }
.intro-story,.intro-note { font-size:14px; line-height:1.7; }

</style>

<style scoped src="../service-ui.css"></style>
