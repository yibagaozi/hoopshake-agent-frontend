<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { DOMINANT_HAND, nameInitial } from '@hoopshake/core'
import { APP_VERSION } from '../version.js'
import BottomSheet from '../components/BottomSheet.vue'
import { useAuthStore } from '../stores/auth.js'
import TabBar from '../components/TabBar.vue'

const router = useRouter()
const auth = useAuthStore()
const me = ref(null)

/*
 * 身体档案现在由 /api/auth/me 返回（后端 2026-09-17 已补齐），
 * 所以不再需要把 PUT 的返回值缓存在本机 —— 那份本地兜底换台手机就丢了。
 */
const heightShown = computed(() => me.value?.heightCm ?? auth.user?.heightCm)
const legShown = computed(() => me.value?.legLengthCm ?? auth.user?.legLengthCm)
const handShown = computed(() => me.value?.dominantHand ?? auth.user?.dominantHand)

onMounted(async () => {
  me.value = await auth.fetchMe()
})

const logoutAsk = ref(false)

async function logout() {
  logoutAsk.value = false
  await auth.logout()
  router.replace('/login')
}
</script>

<template>
  <div class="scroll-body page-pad">
    <div class="head-row">
      <!-- 退出登录挪到下面「更多」里那一行：手机上没有 hover，
           一个只有 title 的图标按钮等于没有标签 -->
      <div class="h1">我的</div>
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
        <span class="v">{{ DOMINANT_HAND[handShown] || '未设置' }}</span>
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

    <div class="sec-title" style="margin-top: 20px">更多</div>
    <div class="info-card">
      <button class="nav-row" @click="router.push('/help')">
        <span class="k">我的求助</span>
        <span class="chev">›</span>
      </button>
      <button class="nav-row" @click="router.push('/profile/password')">
        <span class="k">修改密码</span>
        <span class="chev">›</span>
      </button>
      <button class="nav-row danger" @click="logoutAsk = true">
        <span class="k">退出登录</span>
        <span class="chev">›</span>
      </button>
    </div>

    <div class="ver">Hoopshake 学生端 · v{{ APP_VERSION }}</div>
    <div style="height: 104px"></div>
  </div>

  <BottomSheet :open="logoutAsk" title="退出登录？" @close="logoutAsk = false">
    <div class="sheet-q">退出后要重新用学号和密码登录。</div>
    <div class="sheet-b">
      <button class="sh-btn ghost" @click="logoutAsk = false">取消</button>
      <button class="sh-btn danger" @click="logout">退出</button>
    </div>
  </BottomSheet>

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
.nav-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 15px 16px;
  border-bottom: 1px solid var(--divider);
  text-align: left;
}
.nav-row:last-child {
  border-bottom: none;
}
.nav-row .k {
  font-size: 15px;
  color: var(--ink);
}
.nav-row.danger .k {
  color: var(--danger);
}
.nav-row .chev {
  font-size: 18px;
  color: var(--gray-3);
}
.sheet-q {
  font-size: 14px;
  color: var(--ink-2);
  line-height: 1.7;
  margin-bottom: 18px;
}
.sheet-b {
  display: flex;
  gap: 11px;
}
.sh-btn {
  flex: 1;
  height: 48px;
  border-radius: 15px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  background: var(--brand);
}
.sh-btn.ghost {
  color: var(--ink-2);
  background: var(--fill-2);
}
.sh-btn.danger {
  background: var(--danger);
}
.ver {
  text-align: center;
  font: 500 12px/1 var(--mono);
  color: var(--gray-3);
  margin-top: 28px;
}
</style>
