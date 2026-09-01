<script setup>
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const tabs = [
  { key: 'train', label: '训练', to: '/' },
  { key: 'chat', label: '对话', to: '/chat' },
  { key: 'report', label: '报告', to: '/report' },
  { key: 'me', label: '我的', to: '/profile' },
]

function go(t) {
  if (route.meta.tab !== t.key) router.push(t.to)
}
</script>

<template>
  <div class="tabbar">
    <button
      v-for="t in tabs"
      :key="t.key"
      class="tab"
      :class="{ on: route.meta.tab === t.key }"
      @click="go(t)"
    >
      <!-- 训练：柱状图 -->
      <svg v-if="t.key === 'train'" width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="12" width="4" height="8" rx="1.5" :fill="route.meta.tab === t.key ? '#fff' : '#9A9A9E'" />
        <rect x="10" y="7" width="4" height="13" rx="1.5" :fill="route.meta.tab === t.key ? '#fff' : '#9A9A9E'" />
        <rect x="17" y="3" width="4" height="17" rx="1.5" :fill="route.meta.tab === t.key ? '#fff' : '#9A9A9E'" />
      </svg>
      <!-- 对话：气泡 -->
      <svg v-else-if="t.key === 'chat'" width="23" height="23" viewBox="0 0 24 24" fill="none">
        <path
          d="M4 5.5h16v10H9l-4 3.5v-3.5H4z"
          :stroke="route.meta.tab === t.key ? '#fff' : '#9A9A9E'"
          stroke-width="1.8"
          stroke-linejoin="round"
        />
      </svg>
      <!-- 报告：文档 -->
      <svg v-else-if="t.key === 'report'" width="23" height="23" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="3" width="14" height="18" rx="2.5" :stroke="route.meta.tab === t.key ? '#fff' : '#9A9A9E'" stroke-width="1.8" />
        <line x1="8.5" y1="8" x2="15.5" y2="8" :stroke="route.meta.tab === t.key ? '#fff' : '#9A9A9E'" stroke-width="1.8" stroke-linecap="round" />
        <line x1="8.5" y1="12" x2="15.5" y2="12" :stroke="route.meta.tab === t.key ? '#fff' : '#9A9A9E'" stroke-width="1.8" stroke-linecap="round" />
        <line x1="8.5" y1="16" x2="12.5" y2="16" :stroke="route.meta.tab === t.key ? '#fff' : '#9A9A9E'" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <!-- 我的：人 -->
      <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="3.5" :stroke="route.meta.tab === t.key ? '#fff' : '#9A9A9E'" stroke-width="1.8" />
        <path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" :stroke="route.meta.tab === t.key ? '#fff' : '#9A9A9E'" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <span v-if="route.meta.tab === t.key" class="lab">{{ t.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.tabbar {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 14px);
  height: 64px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 32px;
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  padding: 8px;
  gap: 4px;
  z-index: 20;
}
.tab {
  width: 52px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 16px;
  transition: flex 0.25s ease, background 0.25s ease;
}
.tab.on {
  flex: 1;
  background: var(--brand);
  border-radius: 24px;
}
.lab {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}
</style>
