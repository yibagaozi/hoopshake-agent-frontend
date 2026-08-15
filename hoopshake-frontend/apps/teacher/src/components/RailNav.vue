<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { nameInitial } from '@hoopshake/core'
import { useAuthStore } from '../stores/auth.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const teacherItems = [
  { key: 'lessons', label: '概览', to: '/lessons' },
  { key: 'config', label: '课程配置', to: '/lessons' },
  { key: 'students', label: '学生', to: '/students' },
  { key: 'plan', label: '备课', to: '/plan' },
  { key: 'assistant', label: '对话', to: '/assistant' },
  { key: 'summary', label: '课末汇总', to: '/summary' },
]

const adminItems = [{ key: 'knowledge', label: '知识库', to: '/knowledge' }]

const items = computed(() => (auth.isAdmin ? adminItems : teacherItems))

function go(item) {
  router.push(item.to)
}

async function logout() {
  if (!confirm('退出登录？')) return
  await auth.logout()
  router.replace('/login')
}
</script>

<template>
  <div class="rail-wrap">
    <div class="rail">
      <div class="logo">
        <div class="ring"></div>
      </div>
      <button
        v-for="item in items"
        :key="item.key"
        class="nav-item"
        :class="{ on: route.meta.nav === item.key }"
        @click="go(item)"
      >
        <!-- 概览 -->
        <svg v-if="item.key === 'lessons'" width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="7" height="7" rx="1.5" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" />
        </svg>
        <!-- 课程配置 -->
        <svg v-else-if="item.key === 'config'" width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" />
          <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" />
          <line x1="8" y1="3" x2="8" y2="6.5" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" stroke-linecap="round" />
          <line x1="16" y1="3" x2="16" y2="6.5" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" stroke-linecap="round" />
        </svg>
        <!-- 学生 -->
        <svg v-else-if="item.key === 'students'" width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="8" cy="8" r="3" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" />
          <circle cx="16" cy="9" r="2.5" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" />
          <path d="M3 19c0-2.8 2.2-5 5-5s5 2.2 5 5M14.5 19c0-2 1-3.8 2.5-4.6" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" stroke-linecap="round" />
        </svg>
        <!-- 备课 -->
        <svg v-else-if="item.key === 'plan'" width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" stroke-linejoin="round" />
        </svg>
        <!-- 对话 -->
        <svg v-else-if="item.key === 'assistant'" width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" stroke-linejoin="round" />
        </svg>
        <!-- 课末汇总 -->
        <svg v-else-if="item.key === 'summary'" width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M4 17l4-5 3.5 3L18 8l2 2.5" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
          <line x1="4" y1="20.5" x2="20" y2="20.5" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" stroke-linecap="round" />
        </svg>
        <!-- 知识库 -->
        <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4z" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" stroke-linejoin="round" />
          <path d="M5 16.5A2.5 2.5 0 017.5 14H19" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" />
          <line x1="9" y1="8" x2="15" y2="8" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" stroke-linecap="round" />
        </svg>
        <span>{{ item.label }}</span>
      </button>
      <div class="flex1"></div>
      <button class="me" :title="auth.displayName + '（点击退出）'" @click="logout">
        {{ nameInitial(auth.displayName) }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.rail-wrap {
  flex: none;
  padding: 18px 2px 18px 18px;
  display: flex;
  background: var(--fill);
}
.rail {
  width: 88px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 26px;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.09), 0 2px 8px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 9px;
  gap: 5px;
}
.logo {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
  flex: none;
}
.logo .ring {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 2.4px solid #fff;
}
.nav-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 0;
  border-radius: 16px;
  transition: background 0.15s;
}
.nav-item span {
  font-size: 10px;
  font-weight: 500;
  color: var(--gray);
  white-space: nowrap;
}
.nav-item:hover {
  background: var(--panel-soft);
}
.nav-item.on {
  background: var(--brand);
  border-radius: 14px;
}
.nav-item.on span {
  font-weight: 600;
  color: #fff;
}
.flex1 {
  flex: 1;
}
.me {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--ink);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
</style>
