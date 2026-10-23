<template>
  <nav v-if="pages > 1" class="pager" aria-label="翻页">
    <button type="button" class="step" :disabled="page <= 1" @click="$emit('update:page', page - 1)">上一页</button>
    <button
      v-for="n in numbers"
      :key="n"
      type="button"
      :class="{ on: n === page }"
      :aria-current="n === page ? 'page' : undefined"
      @click="$emit('update:page', n)"
    >{{ n }}</button>
    <button type="button" class="step" :disabled="page >= pages" @click="$emit('update:page', page + 1)">下一页</button>
  </nav>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  page: { type: Number, required: true },
  pages: { type: Number, required: true }
});
defineEmits(["update:page"]);

const numbers = computed(() => {
  const total = Math.max(1, Number(props.pages) || 1);
  const current = Math.min(Math.max(1, Number(props.page) || 1), total);
  const width = 10;
  let start = 1;
  let end = total;
  if (total > width) {
    start = Math.max(1, current - 4);
    end = Math.min(total, start + width - 1);
    start = Math.max(1, end - width + 1);
  }
  const list = [];
  for (let n = start; n <= end; n += 1) list.push(n);
  return list;
});
</script>
