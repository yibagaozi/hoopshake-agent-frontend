<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError, authApi, errText, isCode } from '@hoopshake/core'
import { toast } from '../toast.js'

const router = useRouter()

const oldPwd = ref('')
const pwd1 = ref('')
const pwd2 = ref('')
const saving = ref(false)
/** 后端把「原密码错」和「新密码不合规」分了错误码，所以错误要落到具体那一栏 */
const errOld = ref('')
const errNew = ref('')

const pwdStrength = computed(() => {
  const p = pwd1.value
  if (!p) return 0
  let s = p.length >= 8 ? 1 : 0
  if (/[A-Za-z]/.test(p) && /\d/.test(p)) s++
  if (/[^A-Za-z0-9]/.test(p)) s++
  return Math.min(s, 3)
})
const strengthText = ['', '弱，建议至少 8 位', '中，建议加入符号', '强']

async function save() {
  errOld.value = ''
  errNew.value = ''
  if (!oldPwd.value) {
    errOld.value = '请输入当前密码'
    return
  }
  if (!pwd1.value || pwd1.value.length < 8) {
    errNew.value = '新密码至少 8 位'
    return
  }
  if (pwd1.value !== pwd2.value) {
    errNew.value = '两次输入的新密码不一致'
    return
  }
  if (pwd1.value === oldPwd.value) {
    errNew.value = '新密码不能与当前密码相同'
    return
  }
  saving.value = true
  try {
    await authApi.changePassword(oldPwd.value, pwd1.value)
    toast.ok('密码已修改')
    router.back()
  } catch (err) {
    if (isCode(err, 40111)) {
      errOld.value = '当前密码不正确'
    } else if (isCode(err, 40113)) {
      errNew.value = '新密码不能与当前密码相同'
    } else if (err instanceof ApiError && err.code === 40000 && err.fieldErrors.length) {
      // 40000 带 fieldErrors，按 field 落到对应那一栏
      for (const f of err.fieldErrors) {
        if (String(f.field).toLowerCase().includes('old')) errOld.value = f.message
        else errNew.value = f.message
      }
      if (!errOld.value && !errNew.value) errNew.value = errText(err)
    } else {
      toast.err(errText(err, '修改失败'))
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="edit-head">
    <button class="btn-back" @click="router.back()">‹</button>
    <span class="t">修改密码</span>
    <button class="save-pill" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
  </div>

  <div class="scroll-body body-pad">
    <div class="input-label">当前密码</div>
    <input
      v-model="oldPwd"
      type="password"
      class="input-pill"
      autocomplete="current-password"
      placeholder="现在登录用的密码"
    />
    <div v-if="errOld" class="fld-err">{{ errOld }}</div>

    <div class="input-label" style="margin-top: 20px">新密码</div>
    <input
      v-model="pwd1"
      type="password"
      class="input-pill"
      autocomplete="new-password"
      placeholder="至少 8 位"
      style="margin-bottom: 11px"
    />
    <input
      v-model="pwd2"
      type="password"
      class="input-pill"
      autocomplete="new-password"
      placeholder="确认新密码"
      @keyup.enter="save"
    />
    <div v-if="errNew" class="fld-err">{{ errNew }}</div>

    <div class="strength" v-if="pwd1">
      <div class="bars">
        <span v-for="i in 3" :key="i" :class="{ lit: pwdStrength >= i }"></span>
      </div>
      <span class="strength-t">密码强度 · {{ strengthText[pwdStrength] || '弱' }}</span>
    </div>

    <div class="tip">忘记当前密码的话，找任课老师把密码重置回初始密码，再回来改。</div>
    <div style="height: 40px"></div>
  </div>
</template>

<style scoped>
.edit-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: calc(env(safe-area-inset-top, 0px) + 14px) 18px 12px;
}
.edit-head .t {
  font-size: 17px;
  font-weight: 700;
}
.save-pill {
  font-size: 15px;
  font-weight: 600;
  color: var(--brand-deep);
  padding: 6px 4px;
}
.save-pill:disabled {
  opacity: 0.5;
}
.body-pad {
  padding: 8px 22px 0;
}
.input-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--gray);
  margin: 0 0 9px 4px;
}
.input-pill {
  width: 100%;
  height: 52px;
  border: 1px solid var(--line-2);
  border-radius: 16px;
  background: #fff;
  padding: 0 16px;
  font-size: 15px;
  color: var(--ink);
  outline: none;
}
.input-pill:focus {
  border-color: var(--brand);
}
.fld-err {
  margin: 8px 0 0 4px;
  font-size: 12px;
  color: var(--danger);
}
.strength {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}
.bars {
  display: flex;
  gap: 4px;
}
.bars span {
  width: 26px;
  height: 4px;
  border-radius: 99px;
  background: var(--line-2);
}
.bars span.lit {
  background: var(--brand);
}
.strength-t {
  font-size: 12px;
  color: var(--gray-2);
}
.tip {
  margin-top: 26px;
  font-size: 12px;
  color: var(--gray-2);
  line-height: 1.7;
}
</style>
