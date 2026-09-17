<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { errText, studentDataApi } from '@hoopshake/core'
import { useAuthStore } from '../stores/auth.js'
import { toast } from '../toast.js'

const router = useRouter()
const auth = useAuthStore()

const hand = ref(null) // LEFT | RIGHT
const height = ref('')
const legLength = ref('')
const saving = ref(false)

onMounted(async () => {
  // 这三个字段现在由 /api/auth/me 返回，换设备登录也能读回来
  const me = await auth.fetchMe()
  hand.value = me?.dominantHand ?? auth.user?.dominantHand ?? null
  height.value = me?.heightCm ?? auth.user?.heightCm ?? ''
  legLength.value = me?.legLengthCm ?? auth.user?.legLengthCm ?? ''
})

async function save() {
  const payload = {}
  if (hand.value) payload.dominantHand = hand.value
  if (height.value !== '' && height.value !== null) payload.heightCm = Number(height.value)
  if (legLength.value !== '' && legLength.value !== null) payload.legLengthCm = Number(legLength.value)
  if (payload.heightCm !== undefined && !(payload.heightCm > 50 && payload.heightCm < 260)) {
    toast('身高看起来不太对哦')
    return
  }
  // 腿长原来没校验，填错了会直接进 3D 分析
  if (payload.legLengthCm !== undefined && !(payload.legLengthCm > 30 && payload.legLengthCm < 160)) {
    toast('腿长看起来不太对哦')
    return
  }
  saving.value = true
  try {
    await studentDataApi.updateProfile(payload)
    // 保存后重新拉 me，让「我的」页立刻显示新值（不再走本机缓存）
    await auth.fetchMe()
    toast.ok('已保存')
    router.back()
  } catch (err) {
    toast.err(errText(err, '保存失败'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="edit-head">
    <button class="btn-back" @click="router.back()">‹</button>
    <span class="t">个人信息</span>
    <button class="save-pill" :disabled="saving" @click="save">保存</button>
  </div>

  <div class="scroll-body body-pad">
    <div class="input-label">投篮惯用手</div>
    <div class="segmented" style="margin-bottom: 18px">
      <button :class="{ on: hand === 'LEFT' }" @click="hand = 'LEFT'">左手</button>
      <button :class="{ on: hand === 'RIGHT' }" @click="hand = 'RIGHT'">右手</button>
    </div>

    <div class="input-label">身高</div>
    <div class="unit-wrap">
      <input v-model="height" class="input-pill" inputmode="decimal" placeholder="如 178" style="padding-right: 52px" />
      <span class="unit">cm</span>
    </div>

    <div class="input-label">腿长（用于 3D 动作分析）</div>
    <div class="unit-wrap">
      <input v-model="legLength" class="input-pill" inputmode="decimal" placeholder="选填" style="padding-right: 52px" />
      <span class="unit">cm</span>
    </div>

    <div class="tip">手机号 / 邮箱如需修改，请联系老师在教师端更新。</div>
  </div>

  <div class="bottom-act">
    <button class="btn-primary" style="height: 54px" :disabled="saving" @click="save">
      {{ saving ? '保存中…' : '保存修改' }}
    </button>
  </div>
</template>

<style scoped>
.edit-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 20px 16px;
}
.t {
  font-size: 17px;
  font-weight: 700;
}
.save-pill {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: var(--brand);
  border-radius: 999px;
  padding: 8px 18px;
}
.body-pad {
  padding: 6px 22px 0;
}
.unit-wrap {
  position: relative;
  margin-bottom: 18px;
}
.unit {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 15px;
  color: var(--gray);
}
.tip {
  font-size: 13px;
  color: var(--gray-2);
  line-height: 1.5;
  margin: 6px 4px 0;
}
.bottom-act {
  flex: none;
  padding: 10px 22px calc(env(safe-area-inset-bottom, 0px) + 16px);
}
</style>
