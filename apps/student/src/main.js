import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { configureApi } from '@hoopshake/core'
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

app.mount('#app')
