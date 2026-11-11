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
.page-header { position: relative; padding: 12px 16px 18px; background: var(--brand-header); margin-bottom: 0; color: #fff; overflow: hidden; }
.page-header-main { display: flex; align-items: center; justify-content: space-between; min-height: 44px; gap: 12px; }
.page-header h1 { margin: 0; color: #fff; font-size: 24px; font-weight:600; line-height: 1.3; letter-spacing: normal; }
.page-header p { margin: 2px 0 0; color: #ffffffcf; font-size: 12px; line-height: 1.5; }
.page-header :deep(button) { color: #fff; }
</style>
