<template><template v-for="(part, index) in parts" :key="index"><strong v-if="part.kind === 'bold'">{{ part.text }}</strong><a v-else-if="part.kind === 'link'" :href="part.text" target="_blank" rel="noopener noreferrer">{{ part.text }}</a><span v-else>{{ part.text }}</span></template></template>
<script setup>
import { computed } from 'vue';
const props = defineProps({ text: { type: [String, Number], default: '' } });
const parts = computed(() => String(props.text ?? '').split(/(\*\*[^*]+\*\*|https?:\/\/[^\s<>\u3000-\u303f\uff00-\uffef]+|mailto:[^\s<>]+)/g).filter(Boolean).map(text => text.startsWith('**') && text.endsWith('**') ? { kind: 'bold', text: text.slice(2, -2) } : /^(?:https?:\/\/|mailto:)/.test(text) ? { kind: 'link', text } : { kind: 'text', text }));
</script>
<style scoped>strong{font-weight:600;color: var(--ink)}a{color:var(--accent);text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}</style>
