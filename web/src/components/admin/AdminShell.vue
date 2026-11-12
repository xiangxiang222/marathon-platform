<template>
  <div class="operations-shell" @keydown.esc="closeMenu" @keydown.tab="trapMenuFocus">
    <a class="skip-workspace" href="#operations-workspace">跳到工作区</a>
    <button v-if="menuOpen" class="nav-scrim" type="button" aria-label="关闭导航菜单" @click="closeMenu"></button>
    <aside id="operations-navigation" ref="navigation" class="operations-sidebar" :class="{ 'is-open': menuOpen }" aria-label="运营后台导航">
      <div class="sidebar-brand">
        <span class="brand-symbol"><AdminIcon name="flag" /></span>
        <div><strong>赛历</strong><span>赛事与跑团运营</span></div>
        <button class="icon-control sidebar-close" type="button" aria-label="关闭导航菜单" @click="closeMenu"><AdminIcon name="close" /></button>
      </div>
      <nav class="navigation-groups">
        <section v-for="group in navigationGroups" :key="group.label" class="navigation-group">
          <h2>{{ group.label }}</h2>
          <button v-for="item in group.items" :key="item.id" type="button" class="navigation-item" :class="{ 'is-active': active === item.id }" :aria-current="active === item.id ? 'page' : undefined" @click="navigate(item.id)">
            <AdminIcon :name="item.icon || item.id" />
            <span>{{ item.label }}</span>
            <b v-if="Number(item.badge) > 0" class="navigation-badge">{{ Number(item.badge) > 99 ? '99+' : item.badge }}</b>
          </button>
        </section>
      </nav>
      <div class="sidebar-bottom">
        <div class="operator-card"><span class="operator-avatar">{{ operatorInitial }}</span><div><strong>{{ operator || '运营账号' }}</strong><span>{{ roleLabel || '平台管理' }}</span></div></div>
        <button class="logout-control" type="button" @click="$emit('logout')"><AdminIcon name="logout" /><span>退出登录</span></button>
      </div>
    </aside>

    <div class="operations-main" :inert="menuOpen || undefined">
      <header class="operations-topbar">
        <div class="topbar-location">
          <button ref="menuButton" class="icon-control menu-trigger" type="button" aria-label="打开导航菜单" aria-controls="operations-navigation" :aria-expanded="menuOpen" @click="openMenu"><AdminIcon name="menu" /></button>
          <span class="topbar-name">赛历运营中心</span><span class="breadcrumb-separator">/</span><span class="breadcrumb-current">{{ pageTitle || activeLabel }}</span>
        </div>
        <div class="topbar-tools">
          <span class="operations-date"><AdminIcon name="calendar" />{{ dateLabel }}</span>
          <button class="icon-control refresh-control" type="button" aria-label="刷新当前页面" title="刷新当前页面" @click="$emit('refresh')"><AdminIcon name="refresh" /></button>
          <router-link to="/" class="front-link"><span>打开前台</span><AdminIcon name="external" /></router-link>
        </div>
      </header>
      <div id="operations-workspace" class="operations-content" tabindex="-1">
        <header class="operations-heading">
          <div class="heading-copy"><p class="heading-eyebrow">{{ activeGroup }}</p><h1>{{ pageTitle || activeLabel }}</h1><p v-if="pageLead" class="heading-lead">{{ pageLead }}</p></div>
          <div v-if="$slots['header-actions']" class="heading-actions"><slot name="header-actions" /></div>
        </header>
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import AdminIcon from "./AdminIcon.vue";

const props = defineProps({
  sections: { type: Array, default: () => [] },
  active: { type: String, default: "overview" },
  operator: { type: String, default: "" },
  roleLabel: { type: String, default: "" },
  pageTitle: { type: String, default: "" },
  pageLead: { type: String, default: "" }
});
const emit = defineEmits(["navigate", "logout", "refresh"]);
const menuOpen = ref(false);
const navigation = ref(null);
const menuButton = ref(null);
let previousBodyOverflow = "";
const dateLabel = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Shanghai" }).format(new Date());
const operatorInitial = computed(() => String(props.operator || "运").slice(0, 1));
const activeLabel = computed(() => props.sections.find((item) => item.id === props.active)?.label || "工作台");
const activeGroup = computed(() => props.sections.find((item) => item.id === props.active)?.group || "工作台");
const navigationGroups = computed(() => {
  const groups = [];
  for (const item of props.sections) {
    const label = item.group || "平台管理";
    let group = groups.find((entry) => entry.label === label);
    if (!group) { group = { label, items: [] }; groups.push(group); }
    group.items.push(item);
  }
  return groups;
});
async function openMenu() {
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  menuOpen.value = true;
  await nextTick();
  navigation.value?.querySelector('.navigation-item[aria-current="page"], .navigation-item')?.focus();
}
async function closeMenu() {
  if (!menuOpen.value) return;
  menuOpen.value = false;
  document.body.style.overflow = previousBodyOverflow;
  await nextTick();
  if (!menuOpen.value) menuButton.value?.focus();
}
function trapMenuFocus(event) {
  if (!menuOpen.value || !navigation.value) return;
  const elements = [...navigation.value.querySelectorAll('button:not([disabled]), a[href]')]
    .filter((element) => element.getClientRects().length > 0);
  const first = elements[0], last = elements[elements.length - 1];
  if (!first) return;
  if (event.shiftKey && (document.activeElement === first || !navigation.value.contains(document.activeElement))) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !navigation.value.contains(document.activeElement))) {
    event.preventDefault(); first.focus();
  }
}
function navigate(id) { emit("navigate", id); closeMenu(); }
onBeforeUnmount(() => { if (menuOpen.value) document.body.style.overflow = previousBodyOverflow; });
</script>

<style scoped>
.operations-shell { --admin-red: var(--accent); --admin-ink: var(--ink); --admin-muted: var(--muted); --admin-line: var(--line); min-height:100vh; color:var(--admin-ink); background: var(--bg); font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue","Microsoft YaHei",sans-serif; font-size:14px; line-height:1.6; }
.operations-shell * { box-sizing:border-box; }
.operations-shell button { font:inherit; cursor:pointer; }
.operations-shell button:focus-visible,.operations-shell a:focus-visible { outline:2px solid var(--admin-red); outline-offset:3px; }
.skip-workspace { position:fixed; top:-80px; left:250px; z-index:60; padding:10px 18px; border-radius:0 0 12px 12px; color:#fff; background:var(--admin-red); }
.skip-workspace:focus { top:0; }
.operations-sidebar { position:fixed; inset:0 auto 0 0; z-index:40; display:flex; flex-direction:column; width:224px; background:#fff; border-right:1px solid var(--admin-line); }
.sidebar-brand { display:flex; align-items:center; gap:12px; height: 92px; padding:0 24px; flex:none; border-bottom:1px solid var(--admin-line); }
.brand-symbol { display:grid; place-items:center; flex:none; width:42px; height:42px; background:var(--admin-red); color:#fff; border-radius:8px; }
.brand-symbol svg { width:26px; height:26px; }
.sidebar-brand>div { display:flex; flex-direction:column; gap:1px; }
.sidebar-brand strong { font-size: 22px; font-weight:600; line-height:1.25; letter-spacing: 0; }
.sidebar-brand>div>span { font-size:12px; color:var(--admin-muted); white-space:nowrap; }
.navigation-groups { overflow-y:auto; flex:1; padding:20px 14px; scrollbar-width:thin; }
.navigation-group+.navigation-group { margin-top:22px; }
.navigation-group h2 { margin:0 0 7px 12px; color:var(--admin-muted); font-size:12px; font-weight:500; }
.navigation-item { position:relative; display:flex; align-items:center; gap:11px; width:100%; min-height:46px; margin:3px 0; padding:0 13px; border:0; border-radius: 10px; background:transparent; color:var(--ink-secondary); text-align:left; }
.navigation-item>svg { flex:none; width:20px; height:20px; }
.navigation-item>span { flex:1; min-width:0; }
.navigation-item:hover { background:var(--field-bg); color:var(--admin-ink); }
.navigation-item.is-active { background:var(--accent-soft); color:var(--admin-red); font-weight:600; }
.navigation-item.is-active::before { position:absolute; left:-14px; top:14px; width:3px; height:18px; border-radius:0 3px 3px 0; background:var(--admin-red); content:""; }
.navigation-badge { flex:none; min-width:22px; padding:1px 6px; border-radius: 6px; background:var(--accent-soft); color:var(--admin-red); font-size:12px; font-weight:600; line-height:20px; text-align:center; font-variant-numeric:tabular-nums; }
.is-active .navigation-badge { background:var(--admin-red); color:#fff;  border-radius: 6px;}
.sidebar-bottom { flex:none; padding:16px 22px; border-top:1px solid var(--admin-line); background:var(--chip); }
.operator-card { display:flex; align-items:center; gap:11px; }
.operator-avatar { display:grid; flex:none; place-items:center; width:38px; height:38px; border-radius:50%; background:var(--accent-soft); color:var(--admin-red); font-size:15px; font-weight:600; }
.operator-card>div { min-width:0; }
.operator-card strong { display:block; overflow:hidden; color: var(--ink); font-size:13px; font-weight:600; white-space:nowrap; text-overflow:ellipsis; }
.operator-card div>span { display:block; margin-top:2px; color:var(--admin-muted); font-size:12px; }
.operations-shell .logout-control { display:flex; align-items:center; gap:8px; width:100%; min-height:38px; margin-top:10px; padding:0; border:0; background:transparent; color:var(--admin-muted); font-size:12px; text-align:left; }
.logout-control svg { width:16px; height:16px; }
.operations-main { min-width:0; margin-left:224px; }
.operations-topbar { position:sticky; top:0; z-index:25; display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:68px; padding:0 32px; border-bottom:1px solid var(--admin-line); background:#fff; }
.topbar-location,.topbar-tools { display:flex; align-items:center; gap:16px; min-width:0; }
.topbar-name { flex:none; color: var(--ink); font-size:14px; font-weight:600; }
.breadcrumb-separator { color: var(--muted); font-size:13px; }
.breadcrumb-current { overflow:hidden; color:var(--admin-muted); font-size:13px; text-overflow:ellipsis; white-space:nowrap; }
.operations-date { display:flex; align-items:center; gap:7px; color:var(--admin-muted); font-size:12px; white-space:nowrap; }
.operations-date svg { width:16px; height:16px; }
.icon-control { display:grid; place-items:center; flex:none; width:40px; height:40px; margin:0; padding:0; border:1px solid transparent; border-radius:11px; background:transparent; color:#666; }
.icon-control:hover { background:var(--bg); border-color:#eee; }
.icon-control svg { width:19px; height:19px; }
.front-link { display:flex; align-items:center; gap:7px; min-height: 36px; padding:0 12px; border:1px solid var(--line); border-radius: 10px; color:var(--ink-secondary); font-size:12px; white-space:nowrap; text-decoration:none;  border-color: var(--line);}
.front-link svg { width:14px; height:14px; }
.operations-content { min-width:0; max-width:1720px; margin:0 auto; padding:28px 32px 48px; outline:none; }
.operations-heading { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:24px; }
.heading-copy { min-width:0; }
.heading-eyebrow { margin:0 0 6px; color:var(--admin-red); font-size:12px; font-weight:600; }
.operations-heading h1 { margin:0; color:var(--admin-ink); font-size:24px; line-height:1.4; font-weight:600; letter-spacing: 0; }
.heading-lead { max-width:56em; margin:8px 0 0; color:var(--admin-muted); font-size:13px; line-height:1.8; }
.heading-actions { display:flex; align-items:center; flex-wrap:wrap; justify-content:flex-end; gap:10px; flex:none; }
.menu-trigger,.sidebar-close { display:none; }
.nav-scrim { position:fixed; inset:0; z-index:35; padding:0; border:0; border-radius:0; background:#0006; }
@media(min-width:1600px) { .operations-content { padding-right:40px; padding-left:40px; } .operations-topbar { padding-right:40px; padding-left:40px; } }
@media(max-width:1099px) { .operations-sidebar { width:200px; } .sidebar-brand { padding:0 18px; gap:10px;  height: 92px;} .brand-symbol { width:38px; height:38px; } .sidebar-brand>div>span { font-size:12px; } .operations-main { margin-left:200px; } .operations-topbar { padding:0 24px; } .operations-content { padding:24px; } .operations-date { display:none; } }
@media(max-width:767px) {
.operations-sidebar { width:min(288px,calc(100vw - 48px)); transform:translateX(-100%); transition:transform .18s ease; visibility:hidden; }
.operations-sidebar.is-open { transform:translateX(0); visibility:visible; }
.operations-main { margin-left:0; }
.operations-topbar { min-height:60px; padding:0 16px; gap:10px; }
.topbar-location,.topbar-tools { gap:8px; }
.topbar-name { font-size:14px; }
.breadcrumb-separator,.breadcrumb-current,.refresh-control { display:none; }
.front-link { padding:0 10px; font-size:12px;  border-radius: 10px; border-color: var(--line); min-height: 36px;}
.menu-trigger { display:grid; margin-left:-6px; }
.sidebar-close { display:grid; margin-left:auto; }
.sidebar-brand { height: 92px; padding:0 18px; }
.operations-content { padding:24px 16px 36px; }
.operations-heading { align-items:flex-start; flex-direction:column; gap:16px; margin-bottom:20px; }
.operations-heading h1 { font-size:24px;  font-weight:600;}
.heading-lead { font-size:13px; }
.heading-actions { justify-content:flex-start; width:100%; }
.navigation-item { min-height:46px;  border-radius: 10px;}
.skip-workspace { left:16px; }
}
@media(prefers-reduced-motion:reduce) { .operations-sidebar { transition:none; } }
</style>
