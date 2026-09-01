<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { errText } from '@hoopshake/core'
import { useAuthStore } from '../stores/auth.js'
import { toast } from '../toast.js'
import BrandMark from '../components/BrandMark.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const identifier = ref('')
const password = ref('')
const showPwd = ref(false)
const loading = ref(false)

async function submit() {
  if (!identifier.value.trim() || !password.value) {
    toast('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    await auth.login(identifier.value.trim(), password.value)
    router.replace(route.query.redirect || '/')
  } catch (err) {
    toast.err(err.code === 'ROLE' ? err.message : errText(err, '登录失败'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="brand-row">
      <span class="brand-name">Hoopshake</span>
      <BrandMark :size="44" :radius="14" />
    </div>
    <div class="h1">欢迎回来</div>
    <div class="sub">登录查看你的训练与课堂反馈</div>

    <div class="input-label" style="margin-left: 0">账号</div>
    <input
      v-model="identifier"
      class="input-pill"
      placeholder="学号 / 用户名 / 手机号 / 邮箱"
      autocomplete="username"
      style="margin-bottom: 12px"
      @keyup.enter="submit"
    />
    <div class="pwd-wrap">
      <input
        v-model="password"
        class="input-pill"
        :type="showPwd ? 'text' : 'password'"
        placeholder="密码"
        autocomplete="current-password"
        style="padding-right: 60px"
        @keyup.enter="submit"
      />
      <button class="show-btn" @click="showPwd = !showPwd">{{ showPwd ? '隐藏' : '显示' }}</button>
    </div>

    <div class="links-row">
      <router-link to="/activate">首次使用？激活账号</router-link>
      <a @click.prevent="toast('请联系老师重置密码')">忘记密码？</a>
    </div>

    <button class="btn-primary" :disabled="loading" @click="submit">
      {{ loading ? '登录中…' : '登录' }}
    </button>

    <div class="spacer"></div>
    <div class="foot">还没有账号？<router-link to="/activate">激活入学账号</router-link></div>
  </div>
</template>

<style scoped>
.login-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: calc(env(safe-area-inset-top, 0px) + 30px) 26px calc(env(safe-area-inset-bottom, 0px) + 30px);
  overflow-y: auto;
}
.brand-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 20px 0 44px;
}
.brand-name {
  font-size: 38px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.h1 {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 8px;
}
.sub {
  font-size: 15px;
  color: var(--gray);
  margin-bottom: 30px;
}
.pwd-wrap {
  position: relative;
  margin-bottom: 14px;
}
.show-btn {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 13px;
  color: var(--gray);
  font-weight: 600;
}
.links-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 26px;
  font-size: 13px;
  font-weight: 600;
}
.spacer {
  flex: 1;
  min-height: 24px;
}
.foot {
  text-align: center;
  font-size: 14px;
  color: var(--gray);
}
.foot a {
  font-weight: 600;
}
</style>
