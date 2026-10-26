<template>
  <header class="page-header">
    <div class="page-header-main"><h1>{{ title }}</h1><slot /></div>
    <p v-if="subtitle">{{ subtitle }}</p>
  </header>
</template>

<script setup>
defineProps({ title: { type: String, required: true }, subtitle: { type: String, default: "" } });
</script>

<style scoped>
.page-header { padding: 16px 12px 10px; background: linear-gradient(180deg, #fff1f3, var(--bg)); }
.page-header-main { display: flex; align-items: center; justify-content: space-between; min-height: 34px; gap: 12px; }
.page-header h1 { margin: 0; color: var(--ink); font-size: 24px; font-weight: 700; line-height: 1.25; }
.page-header p { margin: 4px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
</style>
