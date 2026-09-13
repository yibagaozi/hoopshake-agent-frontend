import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { configureApi, getAccessToken, loadVocabulary } from '@hoopshake/core'
import App from './App.vue'
import { createStudentRouter } from './router.js'
import './styles/base.css'

configureApi({
  baseUrl: import.meta.env.VITE_API_BASE_URL || '',
  storageKey: 'hoopshake_student_auth',
})

const app = createApp(App)
app.use(createPinia())

const router = createStudentRouter()
app.use(router)

configureApi({
  onUnauthorized: () => {
    import('./stores/auth.js').then(({ useAuthStore }) => {
      useAuthStore().forceLogout()
      if (router.currentRoute.value.name !== 'login') {
        router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
      }
    })
  },
})

// 词表拉一次缓存起来：动作/检查点中文名三端共用同一份，拉不到退本地兜底。
// 没登录就不拉 —— 这个接口要鉴权，未登录时的 40100 会被统一处理成「清登录态 + 跳登录」，
// 白白多一次无意义的跳转；真正用到词表的页面（课程配置、报告详情）自己会在挂载时再拉一次。
if (getAccessToken()) loadVocabulary()

app.mount('#app')
