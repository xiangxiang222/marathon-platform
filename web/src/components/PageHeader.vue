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
.page-header { padding: 26px 18px 20px; background: var(--bg); }
.page-header-main { display: flex; align-items: center; justify-content: space-between; min-height: 34px; gap: 12px; }
.page-header h1 { margin: 0; color: var(--ink); font-size: 26px; font-weight:600; line-height: 1.3; letter-spacing: -.6px; }
.page-header p { margin: 7px 0 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
</style>
