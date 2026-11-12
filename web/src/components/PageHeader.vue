<template>
  <header class="page-header" :class="{ 'tab-page-header': tab }">
    <div class="page-header-main"><h1>{{ title }}</h1><slot /></div>
    <div v-if="tab" class="tab-header-feature">
      <div class="tab-header-copy"><span v-if="eyebrow" class="tab-header-eyebrow">{{ eyebrow }}</span><h2>{{ headline }}</h2><p v-if="subtitle">{{ subtitle }}</p></div>
      <div v-if="art" class="tab-header-art" aria-hidden="true"><img :src="art" alt="" /></div>
    </div>
    <p v-else-if="subtitle">{{ subtitle }}</p>
  </header>
</template>

<script setup>
defineProps({ title: { type: String, required: true }, subtitle: { type: String, default: "" }, tab: { type: Boolean, default: false }, eyebrow: { type: String, default: "" }, headline: { type: String, default: "" }, art: { type: String, default: "" } });
</script>

<style scoped>
.page-header { position: relative; padding: 12px 16px 18px; background: linear-gradient(135deg,#fff0f2,#fffafa); margin-bottom: 0; color: var(--ink); overflow: hidden; }
.page-header-main { display: flex; align-items: center; justify-content: space-between; min-height: 44px; gap: 12px; }
.page-header h1 { margin: 0; color: var(--ink); font-size: 24px; font-weight:600; line-height: 1.3; letter-spacing: normal; }
.page-header p { margin: 2px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
.page-header :deep(button) { color: var(--ink); }
.tab-page-header { padding-bottom: 20px; background: radial-gradient(ellipse at 100% 30%,#ffe1e7 0,transparent 66%),linear-gradient(135deg,#fff0f2,#fffafa); }
.tab-page-header::before,.tab-page-header::after { position: absolute; top: 22px; right: -80px; width: 240px; height: 240px; border: 1px solid #ffffffb3; border-radius: 50%; content: ''; pointer-events: none; }
.tab-page-header::after { top: 38px; right: -64px; width: 208px; height: 208px; }
.tab-page-header .page-header-main { position: relative; z-index: 1; }
.tab-header-feature { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 106px; margin-top: 6px; }
.tab-header-copy { flex: 1; min-width: 0; }
.tab-header-eyebrow { display: inline-flex; align-items: center; gap: 6px; color: var(--accent); font-size: 12px; line-height: 1.5; }
.tab-header-eyebrow::before { width: 3px; height: 11px; border-radius: 2px; background: currentColor; content: ''; }
.tab-header-copy h2 { margin: 6px 0; color: var(--ink); font-size: 20px; line-height: 1.4; font-weight: 600; letter-spacing: normal; }
.tab-header-copy p { max-width: 340px; margin: 0; line-height: 1.6; }
.tab-header-art { position: relative; display: flex; align-items: center; justify-content: center; flex: 0 0 104px; width: 104px; height: 104px; }
.tab-header-art::before { position: absolute; inset: 12px 2px 4px; border-radius: 50%; background: #ffffff80; content: ''; }
.tab-header-art img { position: relative; display: block; width: 104px; height: 104px; object-fit: contain; }
@media (max-width: 350px) { .tab-header-feature { gap: 8px; }.tab-header-copy h2 { font-size: 18px; }.tab-header-art { flex-basis: 84px; width: 84px; height: 92px; }.tab-header-art img { width: 88px; height: 88px; } }
</style>
