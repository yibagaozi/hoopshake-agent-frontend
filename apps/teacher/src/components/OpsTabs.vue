<script setup>
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const tabs = [
  { sub: 'overview', label: '总览', to: '/ops' },
  { sub: 'devices', label: '边缘设备', to: '/ops/devices' },
  { sub: 'agent', label: 'Agent 表现', to: '/ops/agent' },
  { sub: 'system', label: '系统健康', to: '/ops/system' },
  { sub: 'chat', label: '运维助手', to: '/ops/chat' },
]
</script>

<template>
  <div class="chips ops-tabs">
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
</template>

<style scoped>
.ops-tabs {
  flex: none;
  padding: 0 30px 16px;
}
</style>
