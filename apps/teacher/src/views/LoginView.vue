<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { errText } from '@hoopshake/core'
import { useAuthStore } from '../stores/auth.js'
import { toast } from '../toast.js'

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
    router.replace(route.query.redirect || auth.homePath)
  } catch (err) {
    toast.err(err.code === 'ROLE' ? err.message : errText(err, '登录失败'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <!-- 左侧品牌区 -->
    <div class="hero">
      <div class="brand-row">
        <div class="logo"><div class="ring"></div></div>
        <span class="brand-name">Hoopshake</span>
      </div>
      <div class="hero-mid">
        <div class="cap">教师端 · TEACHER</div>
        <div class="slogan">用 AI 看清<br />每一次投篮</div>
        <div class="desc">课程管理 · 学生数据 · 备课与课堂反馈，尽在一处。</div>
      </div>
      <div class="ver">v1.0 · 智能篮球训练系统</div>
      <div class="circle c1"></div>
      <div class="circle c2"></div>
    </div>

    <!-- 右侧表单区 -->
    <div class="form-side">
      <div class="form-box">
        <div class="h1">登录教师端</div>
        <div class="sub">欢迎回来，请使用教师或管理员账号登录</div>

        <div class="fld" style="margin-bottom: 22px">
          <label>账号</label>
          <input v-model="identifier" class="txt" placeholder="用户名 / 邮箱 / 手机号 / 工号" style="height: 54px; border-radius: 14px" @keyup.enter="submit" />
        </div>

        <div class="pwd-label">
          <span>密码</span>
          <a @click.prevent="toast('请联系管理员重置密码')">忘记密码？</a>
        </div>
        <div class="pwd-wrap">
          <input
            v-model="password"
            :type="showPwd ? 'text' : 'password'"
            class="txt"
            placeholder="密码"
            style="height: 54px; border-radius: 14px; padding-right: 60px"
            @keyup.enter="submit"
          />
          <button class="show-btn" @click="showPwd = !showPwd">{{ showPwd ? '隐藏' : '显示' }}</button>
        </div>

        <button class="btn primary submit" :disabled="loading" @click="submit">
          {{ loading ? '登录中…' : '登录' }}
        </button>
        <div class="foot">还没有账号？<router-link to="/register">申请注册</router-link></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  flex: 1;
  display: flex;
  min-height: 0;
  background: var(--dark);
}
.hero {
  width: 44%;
  min-width: 380px;
  flex: none;
  background: var(--dark);
  color: #f5f5f7;
  padding: 66px 62px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  overflow: hidden;
}
.brand-row {
  display: flex;
  align-items: center;
  gap: 15px;
  position: relative;
  z-index: 2;
}
.logo {
  width: 44px;
  height: 44px;
  border-radius: 13px;
  background: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
}
.logo .ring {
  width: 19px;
  height: 19px;
  border-radius: 50%;
  border: 2.5px solid #fff;
}
.brand-name {
  font-size: 27px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.hero-mid {
  position: relative;
  z-index: 2;
}
.cap {
  font: 600 13px/1 var(--mono);
  color: #7a7a82;
  letter-spacing: 0.16em;
  margin-bottom: 22px;
}
.slogan {
  font-size: 46px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.14;
}
.desc {
  font-size: 17px;
  color: #8a8a92;
  line-height: 1.65;
  margin-top: 24px;
  max-width: 380px;
}
.ver {
  font: 500 12px/1 var(--mono);
  color: #54545c;
  position: relative;
  z-index: 2;
}
.circle {
  position: absolute;
  border-radius: 50%;
}
.c1 {
  right: -160px;
  bottom: -160px;
  width: 480px;
  height: 480px;
  border: 1px solid #1b1b20;
}
.c2 {
  right: -80px;
  bottom: -80px;
  width: 300px;
  height: 300px;
  border: 1px solid #17171a;
}
.form-side {
  flex: 1;
  background: #f2f2ef;
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 56px;
  overflow-y: auto;
}
.form-box {
  width: 100%;
  max-width: 420px;
}
.h1 {
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 9px;
}
.sub {
  font-size: 15px;
  color: var(--gray);
  margin-bottom: 36px;
}
.pwd-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 9px;
  font-size: 13px;
  color: var(--gray);
  font-weight: 600;
}
.pwd-label a {
  font-weight: 600;
}
.pwd-wrap {
  position: relative;
  margin-bottom: 28px;
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
.submit {
  width: 100%;
  height: 56px;
  border-radius: 14px;
  font-size: 17px;
}
.foot {
  text-align: center;
  font-size: 14px;
  color: var(--gray);
  margin-top: 26px;
}
.foot a {
  font-weight: 600;
}
@media (max-width: 900px) {
  .hero {
    display: none;
  }
}
</style>
