<template>
  <nav v-if="pages > 1" class="pager" aria-label="翻页">
    <button type="button" :disabled="page <= 1" @click="$emit('update:page', page - 1)">上一页</button>
    <span>{{ page }} / {{ pages }}</span>
    <button type="button" :disabled="page >= pages" @click="$emit('update:page', page + 1)">下一页</button>
  </nav>
</template>

<script setup>
defineProps({
  page: { type: Number, required: true },
  pages: { type: Number, required: true }
});
defineEmits(["update:page"]);
</script>
