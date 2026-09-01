<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authApi, errText, isCode, isNotOpen } from '@hoopshake/core'
import { useAuthStore } from '../stores/auth.js'
import { toast } from '../toast.js'

const router = useRouter()
const auth = useAuthStore()

const form = ref({
  username: '',
  displayName: '',
  staffNo: '',
  phone: '',
  inviteCode: '',
  email: '',
  password: '',
  password2: '',
})
const agreed = ref(true)
const loading = ref(false)

async function submit() {
  const f = form.value
  if (!f.username.trim() || !f.displayName.trim() || !f.staffNo.trim() || !f.password) {
    toast('请填写带 * 的必填项')
    return
  }
  if (f.password.length < 8) {
    toast('密码至少 8 位')
    return
  }
  if (f.password !== f.password2) {
    toast('两次输入的密码不一致')
    return
  }
  if (!agreed.value) {
    toast('请先勾选同意服务协议')
    return
  }
  loading.value = true
  try {
    await authApi.register({
      username: f.username.trim(),
      password: f.password,
      displayName: f.displayName.trim(),
      staffNo: f.staffNo.trim(),
      email: f.email.trim() || undefined,
      phone: f.phone.trim() || undefined,
      inviteCode: f.inviteCode.trim() || undefined,
    })
    toast.ok('注册成功，正在登录…')
    await auth.login(f.username.trim(), f.password)
    router.replace(auth.homePath)
  } catch (err) {
    if (isNotOpen(err)) toast.err('教师注册暂未开放，请联系管理员开通账号')
    else if (isCode(err, 40300)) toast.err('邀请码无效，请与学校核对')
    else if (isCode(err, 40901)) toast.err('用户名或工号已被使用')
    else toast.err(errText(err, '注册失败'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="hero">
      <div class="brand-row">
        <div class="logo"><div class="ring"></div></div>
        <span class="brand-name">Hoopshake</span>
      </div>
      <div class="hero-mid">
        <div class="cap">教师端 · TEACHER</div>
        <div class="slogan">创建你的<br />教师账号</div>
        <div class="desc">凭学校邀请码即可加入，几分钟完成开课准备。</div>
        <div class="steps">
          <div class="step"><span>1</span>填写基本信息与邀请码</div>
          <div class="step"><span>2</span>设置登录密码</div>
          <div class="step"><span>3</span>进入操作台开课</div>
        </div>
      </div>
      <div class="ver">v1.0 · 智能篮球训练系统</div>
      <div class="circle c1"></div>
    </div>

    <div class="form-side">
      <div class="form-box">
        <div class="h1">申请注册</div>
        <div class="sub">带 <span class="req">*</span> 为必填项</div>
        <div class="grid">
          <div class="fld">
            <label>用户名 <span class="req">*</span></label>
            <input v-model="form.username" class="txt" placeholder="设置登录用户名" autocomplete="username" />
          </div>
          <div class="fld">
            <label>姓名 <span class="req">*</span></label>
            <input v-model="form.displayName" class="txt" placeholder="真实姓名" />
          </div>
          <div class="fld">
            <label>工号 <span class="req">*</span></label>
            <input v-model="form.staffNo" class="txt" placeholder="学校教工号" />
          </div>
          <div class="fld">
            <label>手机号</label>
            <input v-model="form.phone" class="txt" placeholder="常用手机号（选填）" />
          </div>
          <div class="fld">
            <label>邀请码</label>
            <input v-model="form.inviteCode" class="txt" placeholder="学校发放的邀请码（如有）" />
          </div>
          <div class="fld">
            <label>邮箱 <span class="opt">（选填）</span></label>
            <input v-model="form.email" class="txt" placeholder="用于找回密码" />
          </div>
          <div class="fld">
            <label>设置密码 <span class="req">*</span></label>
            <input v-model="form.password" type="password" class="txt" placeholder="至少 8 位" autocomplete="new-password" />
          </div>
          <div class="fld">
            <label>确认密码 <span class="req">*</span></label>
            <input v-model="form.password2" type="password" class="txt" placeholder="再次输入密码" autocomplete="new-password" @keyup.enter="submit" />
          </div>
        </div>
        <label class="agree">
          <span class="check" :class="{ on: agreed }" @click.prevent="agreed = !agreed">
            <svg v-if="agreed" width="11" height="11" viewBox="0 0 24 24" fill="none">
              <path d="M5 12l5 5 9-11" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          我已阅读并同意 <a @click.stop.prevent="toast('演示环境暂无协议文本')">《服务协议》</a> 与
          <a @click.stop.prevent="toast('演示环境暂无协议文本')">《隐私政策》</a>
        </label>
        <button class="btn primary submit" :disabled="loading" @click="submit">
          {{ loading ? '提交中…' : '注册并进入操作台' }}
        </button>
        <div class="foot">已有账号？<router-link to="/login">返回登录</router-link></div>
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
  width: 38%;
  min-width: 340px;
  flex: none;
  background: var(--dark);
  color: #f5f5f7;
  padding: 66px 56px;
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
  font-size: 40px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.16;
}
.desc {
  font-size: 16px;
  color: #8a8a92;
  line-height: 1.65;
  margin-top: 22px;
  max-width: 300px;
}
.steps {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 34px;
}
.step {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: #b4b4ba;
}
.step span {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #17171a;
  color: #ff8a4c;
  display: flex;
  align-items: center;
  justify-content: center;
  font: 700 13px/1 var(--mono);
  flex: none;
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
  width: 460px;
  height: 460px;
  border: 1px solid #1b1b20;
}
.form-side {
  flex: 1;
  background: #f2f2ef;
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 52px 60px;
  overflow-y: auto;
}
.form-box {
  width: 100%;
  max-width: 600px;
}
.h1 {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 9px;
}
.sub {
  font-size: 15px;
  color: var(--gray);
  margin-bottom: 30px;
}
.req {
  color: var(--brand-deep);
}
.opt {
  color: var(--gray-2);
  font-weight: 500;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px 22px;
}
.agree {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 14px;
  color: #5a5a5e;
  margin: 24px 0 22px;
  cursor: pointer;
  flex-wrap: wrap;
}
.check {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  background: #fff;
  border: 1px solid var(--line-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  cursor: pointer;
}
.check.on {
  background: var(--brand);
  border-color: var(--brand);
}
.agree a {
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
  margin-top: 20px;
}
.foot a {
  font-weight: 600;
}
@media (max-width: 980px) {
  .hero {
    display: none;
  }
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
