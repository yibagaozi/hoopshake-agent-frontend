<script setup>
import { computed } from 'vue'

/**
 * 设计稿风格折线图：三条浅灰基线 + 橙色折线 + 空心圆点（末点实心）
 * points: [{ label?, value }]
 */
const props = defineProps({
  points: { type: Array, default: () => [] },
  height: { type: Number, default: 112 },
})

const W = 300

const layout = computed(() => {
  const pts = props.points.filter((p) => p.value !== null && p.value !== undefined)
  if (pts.length === 0) return null
  const vals = pts.map((p) => Number(p.value))
  let min = Math.min(...vals)
  let max = Math.max(...vals)
  if (min === max) {
    min -= 1
    max += 1
  }
  const pad = (max - min) * 0.18
  min -= pad
  max += pad
  const top = 14
  const bottom = props.height - 18
  const left = 12
  const right = W - 8
  const n = pts.length
  const xy = pts.map((p, i) => ({
    x: n === 1 ? (left + right) / 2 : left + ((right - left) * i) / (n - 1),
    y: bottom - ((Number(p.value) - min) * (bottom - top)) / (max - min),
    v: Number(p.value),
    label: p.label,
  }))
  return { xy, poly: xy.map((p) => `${p.x},${p.y}`).join(' ') }
})
</script>

<template>
  <svg
    v-if="layout"
    width="100%"
    :height="height"
    :viewBox="`0 0 ${W} ${height}`"
    preserveAspectRatio="none"
    style="overflow: visible"
  >
    <line x1="0" :y1="height - 18" :x2="W" :y2="height - 18" stroke="#EDEDE9" stroke-width="1.5" />
    <line x1="0" :y1="height / 2 - 2" :x2="W" :y2="height / 2 - 2" stroke="#F2F2EF" stroke-width="1.5" />
    <line x1="0" y1="14" :x2="W" y2="14" stroke="#F2F2EF" stroke-width="1.5" />
    <polyline
      :points="layout.poly"
      fill="none"
      stroke="#FF6A2C"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <template v-for="(p, i) in layout.xy" :key="i">
      <circle
        v-if="i < layout.xy.length - 1"
        :cx="p.x"
        :cy="p.y"
        r="4"
        fill="#fff"
        stroke="#FF6A2C"
        stroke-width="3"
      />
      <circle v-else :cx="p.x" :cy="p.y" r="5" fill="#FF6A2C" />
    </template>
  </svg>
  <div v-else class="chart-empty">暂无趋势数据</div>
</template>

<style scoped>
.chart-empty {
  height: 92px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--gray-2);
  font-size: 13px;
}
</style>
