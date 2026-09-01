<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authApi, errText, isCode, nameInitial } from '@hoopshake/core'
import { useAuthStore } from '../stores/auth.js'
import { toast } from '../toast.js'
import BrandMark from '../components/BrandMark.vue'

const router = useRouter()
const auth = useAuthStore()

/** step 1 = 核对（学号 + 初始密码登录）；step 2 = 绑定手机 + 设置密码 */
const step = ref(1)
const loading = ref(false)

const studentNo = ref('')
const initialPwd = ref('')
const verified = ref(null) // 登录返回的 user

const phone = ref('')
const verifyCode = ref('')
const pwd1 = ref('')
const pwd2 = ref('')

const pwdStrength = computed(() => {
  const p = pwd1.value
  if (!p) return 0
  let s = p.length >= 8 ? 1 : 0
  if (/[A-Za-z]/.test(p) && /\d/.test(p)) s++
  if (/[^A-Za-z0-9]/.test(p)) s++
  return Math.min(s, 3)
})
const strengthText = ['', '弱，建议至少 8 位', '中，建议加入符号', '强']

async function verify() {
  if (!studentNo.value.trim() || !initialPwd.value) {
    toast('请输入学号与初始密码')
    return
  }
  loading.value = true
  try {
    const data = await authApi.login(studentNo.value.trim(), initialPwd.value)
    if (data.user?.role !== 'STUDENT') {
      toast.err('该账号不是学生账号')
      return
    }
    auth.applyLogin(data)
    verified.value = data.user
    if (data.user.status === 'ACTIVE') {
      toast.ok('账号已激活，直接进入')
      router.replace('/')
      return
    }
    step.value = 2
  } catch (err) {
    toast.err(isCode(err, 40110) ? '学号或初始密码不正确，请与老师核对' : errText(err))
  } finally {
    loading.value = false
  }
}

async function activate() {
  if (!/^1\d{10}$/.test(phone.value.trim())) {
    toast('请输入 11 位手机号')
    return
  }
  if (!pwd1.value || pwd1.value.length < 8) {
    toast('密码至少 8 位')
    return
  }
  if (pwd1.value !== pwd2.value) {
    toast('两次输入的密码不一致')
    return
  }
  loading.value = true
  try {
    await authApi.activate({
      phone: phone.value.trim(),
      newPassword: pwd1.value,
      verifyCode: verifyCode.value.trim() || undefined,
    })
    toast.ok('激活成功，正在登录…')
    const data = await authApi.login(studentNo.value.trim(), pwd1.value)
    auth.applyLogin(data)
    router.replace('/')
  } catch (err) {
    if (isCode(err, 40910)) toast.err('账号已激活，请直接登录')
    else if (isCode(err, 40901)) toast.err('该手机号已被绑定，请更换')
    else toast.err(errText(err))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="act-page">
    <!-- step 1 -->
    <template v-if="step === 1">
      <div class="brand-row">
        <span class="brand-name">Hoopshake</span>
        <BrandMark :size="44" :radius="14" />
      </div>
      <div class="steps">
        <div class="step on"><span class="dot cur">1</span><span class="t b">核对</span></div>
        <div class="bar"></div>
        <div class="step"><span class="dot">2</span><span class="t">绑定</span></div>
        <div class="bar"></div>
        <div class="step"><span class="dot">3</span><span class="t">密码</span></div>
      </div>
      <div class="h1">激活账号</div>
      <div class="sub">首次使用请输入学号与老师发放的初始密码，核对身份后激活。</div>
      <div class="input-label" style="margin-left: 0">学号</div>
      <input
        v-model="studentNo"
        class="input-pill mono"
        placeholder="10 位学号"
        inputmode="numeric"
        style="margin-bottom: 16px"
      />
      <div class="input-label" style="margin-left: 0">初始密码</div>
      <input
        v-model="initialPwd"
        type="password"
        class="input-pill"
        placeholder="老师发放的初始密码"
        style="margin-bottom: 18px"
        @keyup.enter="verify"
      />
      <div class="spacer"></div>
      <button class="btn-primary" :disabled="loading" style="margin-bottom: 18px" @click="verify">
        {{ loading ? '核对中…' : '下一步' }}
      </button>
      <div class="foot">已激活账号？<router-link to="/login">直接登录</router-link></div>
    </template>

    <!-- step 2 -->
    <template v-else>
      <div class="nav-row">
        <button class="btn-back" @click="step = 1">‹</button>
        <span class="nav-title">激活账号</span>
      </div>
      <div class="steps">
        <div class="step"><span class="dot ok">✓</span><span class="t g">核对</span></div>
        <div class="bar fill"></div>
        <div class="step on"><span class="dot cur">2</span><span class="t b">绑定</span></div>
        <div class="bar fill"></div>
        <div class="step on"><span class="dot cur">3</span><span class="t b">密码</span></div>
      </div>
      <div class="who-card" v-if="verified">
        <span class="avatar" >{{ nameInitial(verified.displayName || verified.username) }}</span>
        <div>
          <div class="who-name">{{ verified.displayName || verified.username }}</div>
          <div class="who-no">{{ verified.studentNo || studentNo }}</div>
        </div>
      </div>
      <div class="input-label" style="margin-left: 0">绑定手机号</div>
      <input
        v-model="phone"
        class="input-pill"
        placeholder="11 位手机号"
        inputmode="tel"
        style="margin-bottom: 13px"
      />
      <input
        v-model="verifyCode"
        class="input-pill mono"
        placeholder="验证码（如无可留空）"
        inputmode="numeric"
        style="margin-bottom: 18px; letter-spacing: 0.2em"
      />
      <div class="input-label" style="margin-left: 0">设置登录密码</div>
      <input
        v-model="pwd1"
        type="password"
        class="input-pill"
        placeholder="至少 8 位"
        style="margin-bottom: 11px"
      />
      <input
        v-model="pwd2"
        type="password"
        class="input-pill"
        placeholder="确认密码"
        style="margin-bottom: 11px"
        @keyup.enter="activate"
      />
      <div class="strength" v-if="pwd1">
        <div class="bars">
          <span v-for="i in 3" :key="i" :class="{ lit: pwdStrength >= i }"></span>
        </div>
        <span class="strength-t">密码强度 · {{ strengthText[pwdStrength] || '弱' }}</span>
      </div>
      <div class="spacer"></div>
      <button class="btn-primary" :disabled="loading" @click="activate">
        {{ loading ? '激活中…' : '完成激活并登录' }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.act-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: calc(env(safe-area-inset-top, 0px) + 26px) 26px calc(env(safe-area-inset-bottom, 0px) + 28px);
  overflow-y: auto;
}
.brand-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 14px 0 30px;
}
.brand-name {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.nav-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 20px;
}
.nav-title {
  font-size: 17px;
  font-weight: 700;
}
.steps {
  display: flex;
  align-items: center;
  margin-bottom: 28px;
}
.step {
  display: flex;
  align-items: center;
  gap: 7px;
}
.dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--line-2);
  color: var(--gray-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font: 700 12px/1 var(--mono);
}
.dot.cur {
  background: var(--brand);
  color: #fff;
}
.dot.ok {
  background: var(--ok);
  color: #fff;
  font-size: 11px;
}
.t {
  font-size: 13px;
  font-weight: 600;
  color: var(--gray-2);
}
.t.b {
  color: var(--ink);
  font-weight: 700;
}
.t.g {
  color: var(--ink-2);
}
.bar {
  flex: 1;
  height: 2px;
  background: var(--line-2);
  margin: 0 8px;
}
.bar.fill {
  background: var(--brand);
}
.h1 {
  font-size: 29px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 8px;
}
.sub {
  font-size: 15px;
  color: var(--gray);
  line-height: 1.5;
  margin-bottom: 28px;
}
.mono {
  font: 600 16px/1 var(--mono);
  letter-spacing: 0.04em;
}
.who-card {
  background: var(--dark-card);
  border-radius: 20px;
  padding: 15px 17px;
  margin-bottom: 20px;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 13px;
}
.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  font-weight: 700;
  flex: none;
}
.who-name {
  font-size: 17px;
  font-weight: 700;
}
.who-no {
  font: 500 12px/1 var(--mono);
  color: var(--dark-muted);
  margin-top: 4px;
}
.strength {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-left: 6px;
}
.bars {
  display: flex;
  gap: 4px;
}
.bars span {
  width: 26px;
  height: 5px;
  border-radius: 99px;
  background: var(--line-2);
}
.bars span.lit {
  background: var(--ok);
}
.strength-t {
  font-size: 12px;
  color: var(--gray);
}
.spacer {
  flex: 1;
  min-height: 22px;
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
