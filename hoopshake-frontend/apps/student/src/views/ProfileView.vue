<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { DOMINANT_HAND, nameInitial } from '@hoopshake/core'
import { useAuthStore } from '../stores/auth.js'
import TabBar from '../components/TabBar.vue'

const router = useRouter()
const auth = useAuthStore()
const me = ref(null)

const heightShown = computed(() => me.value?.heightCm ?? auth.profileExtra.heightCm)
const legShown = computed(() => me.value?.legLengthCm ?? auth.profileExtra.legLengthCm)

onMounted(async () => {
  me.value = await auth.fetchMe()
})

async function logout() {
  if (!confirm('退出登录？')) return
  await auth.logout()
  router.replace('/login')
}
</script>

<template>
  <div class="scroll-body page-pad">
    <div class="head-row">
      <div class="h1">我的</div>
      <button class="gear" @click="logout" title="退出登录">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
          <path d="M15 4h3a1 1 0 011 1v14a1 1 0 01-1 1h-3M10 17l5-5-5-5M15 12H3" stroke="#3A3A3C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>

    <!-- 身份卡 -->
    <div class="id-card">
      <span class="avatar">{{ nameInitial(auth.displayName) }}</span>
      <div>
        <div class="id-name">{{ auth.displayName }}</div>
        <div class="id-no">学号 {{ me?.studentNo || auth.user?.studentNo || '—' }}</div>
      </div>
    </div>

    <div v-if="auth.isPending" class="pending-tip" @click="router.push('/activate')">
      账号待激活 · 去绑定手机并设置密码 ›
    </div>

    <!-- 账号信息 -->
    <div class="sec-title">账号信息</div>
    <div class="info-card" style="margin-bottom: 20px">
      <div class="info-row"><span class="k">用户名</span><span class="v">{{ me?.username || auth.user?.username || '—' }}</span></div>
      <div class="info-row"><span class="k">手机号</span><span class="v">{{ me?.phone || '未绑定' }}</span></div>
      <div class="info-row"><span class="k">邮箱</span><span class="v">{{ me?.email || '未绑定' }}</span></div>
    </div>

    <!-- 个人资料 -->
    <div class="pp-head">
      <span class="sec-title" style="margin: 0">个人资料</span>
      <button class="edit-link" @click="router.push('/profile/edit')">编辑<span style="font-size: 16px">›</span></button>
    </div>
    <div class="info-card">
      <div class="info-row">
        <span class="k">投篮惯用手</span>
        <span class="v">{{ DOMINANT_HAND[me?.dominantHand || auth.profileExtra.dominantHand] || '未设置' }}</span>
      </div>
      <div class="info-row">
        <span class="k">身高</span>
        <span class="v">{{ heightShown ? heightShown + ' cm' : '未设置' }}</span>
      </div>
      <div class="info-row">
        <span class="k">腿长</span>
        <span class="v">{{ legShown ? legShown + ' cm' : '未设置' }}</span>
      </div>
    </div>

    <div class="ver">Hoopshake 学生端 · v1.0</div>
    <div style="height: 104px"></div>
  </div>
  <TabBar />
</template>

<style scoped>
.page-pad {
  padding: calc(env(safe-area-inset-top, 0px) + 20px) 22px 0;
}
.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.h1 {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.gear {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
}
.id-card {
  background: var(--dark-card);
  border-radius: 26px;
  padding: 22px;
  margin-bottom: 16px;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 16px;
}
.avatar {
  width: 62px;
  height: 62px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  flex: none;
}
.id-name {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.id-no {
  font-size: 13px;
  color: var(--dark-muted);
  margin-top: 5px;
}
.pending-tip {
  background: var(--warn-bg);
  color: var(--warn);
  font-size: 13px;
  font-weight: 600;
  border-radius: 14px;
  padding: 11px 15px;
  margin-bottom: 16px;
  cursor: pointer;
}
.sec-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 12px 10px;
  display: block;
}
.pp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 2px 12px 10px;
}
.edit-link {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--brand-deep);
}
.ver {
  text-align: center;
  font: 500 12px/1 var(--mono);
  color: var(--gray-3);
  margin-top: 28px;
}
</style>
