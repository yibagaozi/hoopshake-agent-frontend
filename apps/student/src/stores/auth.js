import { defineStore } from 'pinia'
import { authApi, clearAuth, loadAuth, saveAuth } from '@hoopshake/core'

const PROFILE_KEY = 'hoopshake_student_profile'

function loadProfileExtra() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}
  } catch {
    return {}
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    auth: loadAuth(),
    me: null,
    // 身体档案（me 接口不含这些字段，PUT /api/student/profile 的响应缓存于本地）
    profileExtra: loadProfileExtra(),
  }),
  getters: {
    isLoggedIn: (s) => !!s.auth?.accessToken,
    user: (s) => s.me || s.auth?.user || null,
    displayName() {
      return this.user?.displayName || this.user?.username || '同学'
    },
    isPending() {
      return this.user?.status === 'PENDING_ACTIVATION'
    },
  },
  actions: {
    /** 登录成功后保存；要求学生角色 */
    applyLogin(data) {
      saveAuth(data)
      this.auth = data
      this.me = null
    },
    async login(identifier, password) {
      const data = await authApi.login(identifier, password)
      if (data.user?.role !== 'STUDENT') {
        throw Object.assign(new Error('该账号不是学生账号，请前往教师端登录'), { code: 'ROLE' })
      }
      this.applyLogin(data)
      return data
    },
    async fetchMe() {
      try {
        this.me = await authApi.me()
      } catch {
        /* 保留登录态中的 user 快照 */
      }
      return this.me
    },
    setProfileExtra(data) {
      const extra = {
        dominantHand: data?.dominantHand ?? null,
        heightCm: data?.heightCm ?? null,
        legLengthCm: data?.legLengthCm ?? null,
      }
      this.profileExtra = extra
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(extra))
      } catch {
        /* ignore */
      }
    },
    async logout() {
      const rt = this.auth?.refreshToken
      try {
        if (rt) await authApi.logout(rt)
      } catch {
        /* 幂等，忽略 */
      }
      this.forceLogout()
    },
    forceLogout() {
      clearAuth()
      this.auth = null
      this.me = null
    },
  },
})
