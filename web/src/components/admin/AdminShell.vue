<template>
  <div class="operations-shell" @keydown.esc="closeMenu">
    <button v-if="menuOpen" class="nav-scrim" type="button" aria-label="关闭导航菜单" @click="closeMenu"></button>
    <aside id="operations-navigation" ref="navigation" class="operations-sidebar" :class="{ 'is-open': menuOpen }" aria-label="运营后台导航">
      <div class="sidebar-brand">
        <span class="brand-symbol"><AdminIcon name="flag" /></span>
        <div><strong>赛历</strong><span>运营中心</span></div>
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
      <div class="operations-content">
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
import { computed, nextTick, ref } from "vue";
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
  menuOpen.value = true;
  await nextTick();
  navigation.value?.querySelector('.navigation-item[aria-current="page"], .navigation-item')?.focus();
}
function closeMenu() {
  if (!menuOpen.value) return;
  menuOpen.value = false;
  menuButton.value?.focus();
}
function navigate(id) { emit("navigate", id); closeMenu(); }
</script>

<style scoped>
.operations-shell { --admin-red: #ff0a30; --admin-ink: #1f2026; --admin-muted: #8a8e99; --admin-line: #edf0f4; color: var(--admin-ink); background: #f5f6fa; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif; font-size: 14px; line-height: 1.5; }
.operations-shell * { box-sizing: border-box; }
.operations-shell button { font: inherit; cursor: pointer; }
.operations-shell button:focus-visible, .operations-shell a:focus-visible { outline: 2px solid var(--admin-red); outline-offset: 3px; }
.operations-sidebar { position: fixed; inset: 0 auto 0 0; z-index: 40; display: flex; flex-direction: column; width: 208px; background: #fff; border-right: 1px solid var(--admin-line); }
.sidebar-brand { display: flex; align-items: center; gap: 10px; height: 80px; padding: 0 24px; flex: none; }
.brand-symbol { display: grid; place-items: center; width: 36px; height: 36px; background: var(--admin-red); color: #fff; border-radius: 10px; }
.brand-symbol svg { width: 23px; height: 23px; }
.sidebar-brand > div { display: flex; align-items: baseline; gap: 6px; }
.sidebar-brand strong { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
.sidebar-brand > div > span { font-size: 12px; color: var(--admin-muted); white-space: nowrap; }
.navigation-groups { overflow-y: auto; flex: 1; padding: 8px 12px 24px; }
.navigation-group + .navigation-group { margin-top: 20px; }
.navigation-group h2 { margin: 0 0 8px 14px; color: #a0a4ae; font-size: 11px; font-weight: 400; letter-spacing: 1px; }
.navigation-item { position: relative; display: flex; align-items: center; gap: 11px; width: 100%; min-height: 42px; margin: 4px 0; padding: 0 14px; border: 0; border-radius: 8px; background: transparent; color: #626773; text-align: left; }
.navigation-item > svg { flex: none; width: 20px; height: 20px; }
.navigation-item > span { flex: 1; min-width: 0; }
.navigation-item:hover { background: #f7f8fb; color: var(--admin-ink); }
.navigation-item.is-active { background: #fff0f3; color: var(--admin-red); font-weight: 600; }
.navigation-item.is-active::before { position: absolute; left: -12px; top: 12px; width: 3px; height: 18px; border-radius: 0 3px 3px 0; background: var(--admin-red); content: ""; }
.navigation-badge { flex: none; padding: 1px 6px; border-radius: 5px; background: #fff0f3; color: var(--admin-red); font-size: 11px; font-weight: 600; line-height: 18px; }
.is-active .navigation-badge { background: #ff0a30; color: #fff; }
.sidebar-bottom { flex: none; padding: 16px 20px; border-top: 1px solid var(--admin-line); }
.operator-card { display: flex; align-items: center; gap: 10px; }
.operator-avatar { display: grid; flex: none; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: #f0f1f6; color: #626773; font-size: 14px; }
.operator-card > div { min-width: 0; }
.operator-card strong { display: block; overflow: hidden; color: #414651; font-size: 12px; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; }
.operator-card div > span { display: block; margin-top: 2px; color: var(--admin-muted); font-size: 11px; }
.logout-control { display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 14px; padding: 0; border: 0; background: transparent; color: var(--admin-muted); font-size: 12px !important; text-align: left; }
.logout-control svg { width: 16px; height: 16px; }
.operations-main { min-width: 0; margin-left: 208px; }
.operations-topbar { position: sticky; top: 0; z-index: 25; display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 64px; padding: 0 28px; border-bottom: 1px solid var(--admin-line); background: #fff; }
.topbar-location, .topbar-tools { display: flex; align-items: center; gap: 16px; min-width: 0; }
.topbar-name { flex: none; font-size: 13px; font-weight: 600; }
.breadcrumb-separator { color: #d0d3db; font-size: 12px; }
.breadcrumb-current { overflow: hidden; color: var(--admin-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.operations-date { display: flex; align-items: center; gap: 6px; color: var(--admin-muted); font-size: 12px; white-space: nowrap; }
.operations-date svg { width: 16px; height: 16px; }
.icon-control { display: grid; place-items: center; flex: none; width: 32px; height: 32px; margin: 0; padding: 0; border: 0; border-radius: 6px; background: transparent; color: #777d88; }
.icon-control:hover { background: #f5f6fa; }
.icon-control svg { width: 18px; height: 18px; }
.front-link { display: flex; align-items: center; gap: 6px; color: #555b67; font-size: 12px; white-space: nowrap; text-decoration: none; }
.front-link svg { width: 14px; height: 14px; }
.operations-content { padding: 26px 28px 40px; min-width: 0; }
.operations-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 24px; }
.heading-copy { min-width: 0; }
.heading-eyebrow { margin: 0 0 5px; color: var(--admin-muted); font-size: 11px; }
.operations-heading h1 { margin: 0; color: var(--admin-ink); font-size: 24px; line-height: 1.4; font-weight: 700; letter-spacing: -0.3px; }
.heading-lead { margin: 7px 0 0; color: var(--admin-muted); font-size: 12px; line-height: 1.7; }
.heading-actions { display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 10px; flex: none; }
.menu-trigger, .sidebar-close { display: none; }
.nav-scrim { position: fixed; inset: 0; z-index: 35; padding: 0; border: 0; background: #1f20264d; }
@media (min-width: 1600px) { .operations-content { padding-right: 40px; padding-left: 40px; } .operations-topbar { padding-right: 40px; padding-left: 40px; } }
@media (max-width: 1099px) { .operations-sidebar { width: 188px; } .sidebar-brand { padding: 0 18px; } .operations-main { margin-left: 188px; } .operations-topbar { padding: 0 20px; } .operations-content { padding: 22px 20px 36px; } .operations-date { display: none; } }
@media (max-width: 767px) {
  .operations-sidebar { width: 240px; transform: translateX(-100%); transition: transform .18s ease; visibility: hidden; }
  .operations-sidebar.is-open { transform: translateX(0); visibility: visible; }
  .operations-main { margin-left: 0; }
  .operations-topbar { min-height: 56px; padding: 0 16px; gap: 10px; }
  .topbar-location, .topbar-tools { gap: 10px; }
  .topbar-name { font-size: 13px; }
  .breadcrumb-separator, .breadcrumb-current, .refresh-control { display: none; }
  .front-link { font-size: 12px; }
  .menu-trigger { display: grid; margin-left: -6px; }
  .sidebar-close { display: grid; margin-left: auto; }
  .sidebar-brand { height: 72px; padding: 0 20px; }
  .operations-content { padding: 20px 16px 32px; }
  .operations-heading { align-items: flex-start; flex-direction: column; gap: 14px; margin-bottom: 20px; }
  .operations-heading h1 { font-size: 23px; }
  .heading-actions { justify-content: flex-start; width: 100%; }
  .navigation-item { min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) { .operations-sidebar { transition: none; } }
</style>
