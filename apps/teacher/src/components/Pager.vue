<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** normalizePage 的结果：{ page, size, total, totalPages, hasNext } */
  page: { type: Object, default: null },
  loading: { type: Boolean, default: false },
})
const emit = defineEmits(['go'])

const cur = computed(() => Number(props.page?.page ?? 0))
const totalPages = computed(() => Number(props.page?.totalPages ?? 0))
const total = computed(() => Number(props.page?.total ?? 0))
const canPrev = computed(() => cur.value > 0 && !props.loading)
/* 后端给了 hasNext 就信它；只给 totalPages 时自己算 */
const canNext = computed(
  () => !props.loading && (props.page?.hasNext ?? cur.value + 1 < totalPages.value)
)
</script>

<template>
  <div class="pager">
    <span class="p-count">
      共 {{ total.toLocaleString('zh-CN') }} 条
      <template v-if="totalPages"> · 第 {{ cur + 1 }} / {{ totalPages }} 页</template>
    </span>
    <div class="p-btns">
      <button class="btn sm" :disabled="!canPrev" @click="emit('go', cur - 1)">上一页</button>
      <button class="btn sm" :disabled="!canNext" @click="emit('go', cur + 1)">下一页</button>
    </div>
  </div>
</template>

<style scoped>
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px;
  border-top: 1px solid var(--divider);
}
.p-count {
  font-size: 12px;
  color: var(--gray-2);
}
.p-btns {
  display: flex;
  gap: 8px;
}
</style>
