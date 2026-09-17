<script setup>
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const tabs = [
  { sub: 'overview', label: '总览', to: '/ops' },
  { sub: 'devices', label: '边缘设备', to: '/ops/devices' },
  { sub: 'telemetry', label: '边缘遥测', to: '/ops/telemetry' },
  { sub: 'agent', label: 'Agent 表现', to: '/ops/agent' },
  { sub: 'system', label: '系统健康', to: '/ops/system' },
  { sub: 'chat', label: '运维助手', to: '/ops/chat' },
]
</script>

<template>
  <!--
    和课程管理的筛选条同一套外观：白底 + 下边框的一整条，
    而不是直接浮在灰底上 —— 浮着时 chip 底色（--fill-2）和页面底色（--bg）
    几乎同色，看上去就像没有外框。
  -->
  <div class="filter-bar ops-tabs">
    <div class="chips">
      <button
        v-for="t in tabs"
        :key="t.sub"
        class="chip"
        :class="{ on: route.meta.sub === t.sub }"
        @click="router.push(t.to)"
      >
        {{ t.label }}
      </button>
    </div>
    <slot name="right" />
  </div>
</template>

<style scoped>
/* 右侧没有内容时 chips 仍靠左，不要被 space-between 拉开 */
.ops-tabs {
  justify-content: flex-start;
}
.chips {
  flex: 1;
}
</style>
