<script setup>
import { computed } from 'vue'

/** 迷你趋势线（表格内 72×24） */
const props = defineProps({
  values: { type: Array, default: () => [] },
  width: { type: Number, default: 72 },
  height: { type: Number, default: 24 },
  color: { type: String, default: '' },
})

const line = computed(() => {
  const vals = props.values.map(Number).filter((v) => !Number.isNaN(v))
  if (vals.length < 2) return null
  let min = Math.min(...vals)
  let max = Math.max(...vals)
  if (min === max) {
    min -= 1
    max += 1
  }
  const n = vals.length
  const pts = vals.map((v, i) => {
    const x = 2 + ((props.width - 4) * i) / (n - 1)
    const y = props.height - 4 - ((v - min) * (props.height - 8)) / (max - min)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const rising = vals[vals.length - 1] >= vals[0]
  return { points: pts.join(' '), color: props.color || (rising ? '#2FB170' : '#8A8A8E') }
})
</script>

<template>
  <svg v-if="line" :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" fill="none">
    <polyline :points="line.points" :stroke="line.color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
  <span v-else style="color: var(--gray-3); font-size: 12px">—</span>
</template>
