<template>
  <header class="page-header" :class="{ compact }">
    <div class="page-header-main"><h1>{{ title }}</h1><slot /></div>
    <p v-if="!compact && subtitle">{{ subtitle }}</p>
  </header>
</template>

<script setup>
defineProps({ title: { type: String, required: true }, subtitle: { type: String, default: "" }, compact: { type: Boolean, default: false } });
</script>

<style scoped>
.page-header { position: relative; padding: 12px 16px 18px; background: linear-gradient(135deg,#fff0f2,#fffafa); margin-bottom: 0; color: var(--ink); overflow: hidden; }
.page-header-main { display: flex; align-items: center; justify-content: space-between; min-height: 44px; gap: 12px; }
.page-header h1 { margin: 0; color: var(--ink); font-size: 18px; font-weight:600; line-height: 1.3; letter-spacing: normal; }
.page-header p { margin: 2px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
.page-header :deep(button) { color: var(--ink); }
.page-header.compact { padding: 0 16px; }
.compact .page-header-main { min-height: 0; justify-content: flex-start; }
.compact h1 { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
</style>
