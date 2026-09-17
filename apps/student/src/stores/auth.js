import { defineStore } from 'pinia'
import { authApi, clearAuth, loadAuth, saveAuth } from '@hoopshake/core'

/**
 * 曾经这里有个 profileExtra：/api/auth/me 不返回惯用手/身高/腿长，
 * 只能把 PUT 的返回值缓存在本机。后端 2026-09-17 把这三个字段补进 me 之后
 * 这份缓存就是负担了（换设备即丢、且会和服务端不一致），整块删掉。
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    auth: loadAuth(),
    me: null,
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
      // 旧版本留下的本地档案缓存，顺手清掉
      try {
        localStorage.removeItem('hoopshake_student_profile')
      } catch {
        /* ignore */
      }
    },
  },
})
