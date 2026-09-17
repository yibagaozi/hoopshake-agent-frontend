<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { nameInitial } from '@hoopshake/core'
import { useAuthStore } from '../stores/auth.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

/*
 * 侧栏只放能直接点进去的一级入口。
 * 「课程配置」曾经在这里，但它没有自己的入口 —— 必须先选一门课，
 * 从课程详情页进去，路径也是 /lessons/:id/config。侧栏放一个点了
 * 只会跳回课程列表的项，是在骗人，所以撤掉；配置页打开时高亮仍落在
 * 「概览」上（见 router 里那几条的 meta.nav）。
 */
const teacherItems = [
  { key: 'lessons', label: '概览', to: '/lessons' },
  { key: 'students', label: '学生', to: '/students' },
  { key: 'plan', label: '备课', to: '/plan' },
  { key: 'assistant', label: '对话', to: '/assistant' },
  { key: 'summary', label: '课末汇总', to: '/summary' },
]

/** ADMIN 专属：知识库与运维台。admin 同时也是老师，所以是在教师那几项之后追加 */
const adminItems = [
  { key: 'knowledge', label: '知识库', to: '/knowledge', divide: true },
  { key: 'ops', label: '运维', to: '/ops' },
]

const items = computed(() => (auth.isAdmin ? [...teacherItems, ...adminItems] : teacherItems))

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
      <template v-for="item in items" :key="item.key">
        <div v-if="item.divide" class="rail-divide"></div>
        <button
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
        <!-- 运维 -->
        <svg v-else-if="item.key === 'ops'" width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3.2" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" />
          <path d="M12 3.2v2.4M12 18.4v2.4M20.8 12h-2.4M5.6 12H3.2M18.2 5.8l-1.7 1.7M7.5 16.5l-1.7 1.7M18.2 18.2l-1.7-1.7M7.5 7.5L5.8 5.8" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" stroke-linecap="round" />
        </svg>
        <!-- 知识库 -->
        <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4z" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" stroke-linejoin="round" />
          <path d="M5 16.5A2.5 2.5 0 017.5 14H19" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" />
          <line x1="9" y1="8" x2="15" y2="8" :stroke="route.meta.nav === item.key ? '#fff' : '#8A8A8E'" stroke-width="1.9" stroke-linecap="round" />
        </svg>
          <span>{{ item.label }}</span>
        </button>
      </template>
      <div class="flex1"></div>
      <button class="me" :title="auth.displayName + '（点击退出）'" @click="logout">
        {{ nameInitial(auth.displayName) }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/*
 * 侧栏槽位。底色跟右侧正文同一个（--bg）—— 之前这里是 --fill，
 * 比正文深一档，屏幕上就是一条竖着的色带把页面劈成两半。
 * 左右留白也做成对称的：原来是左 18 右 2，侧栏整个贴着正文，
 * 看上去并不在自己的色块中间。
 */
.rail-wrap {
  flex: none;
  padding: 18px 14px;
  display: flex;
  background: var(--bg);
}
.rail {
  width: 88px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 26px;
  /* 阴影按原样保留 */
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.09), 0 2px 8px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 9px;
  gap: 5px;
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
.rail-divide {
  width: 34px;
  height: 1px;
  background: var(--line);
  margin: 6px 0;
  flex: none;
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
