import { defineStore } from 'pinia'
import { authApi, clearAuth, loadAuth, saveAuth } from '@hoopshake/core'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    auth: loadAuth(),
    me: null,
  }),
  getters: {
    isLoggedIn: (s) => !!s.auth?.accessToken,
    user: (s) => s.me || s.auth?.user || null,
    role() {
      return this.user?.role || null
    },
    isAdmin() {
      return this.role === 'ADMIN'
    },
    displayName() {
      return this.user?.displayName || this.user?.username || '老师'
    },
    /** admin 也带课，登录后同样落在课程概览；运维台从侧栏进 */
    homePath() {
      return '/lessons'
    },
  },
  actions: {
    applyLogin(data) {
      saveAuth(data)
      this.auth = data
      this.me = null
    },
    async login(identifier, password) {
      const data = await authApi.login(identifier, password)
      if (data.user?.role === 'STUDENT') {
        throw Object.assign(new Error('学生账号请使用学生端登录'), { code: 'ROLE' })
      }
      this.applyLogin(data)
      return data
    },
    async fetchMe() {
      try {
        this.me = await authApi.me()
      } catch {
        /* 保留登录态快照 */
      }
      return this.me
    },
    async logout() {
      const rt = this.auth?.refreshToken
      try {
        if (rt) await authApi.logout(rt)
      } catch {
        /* 幂等 */
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
