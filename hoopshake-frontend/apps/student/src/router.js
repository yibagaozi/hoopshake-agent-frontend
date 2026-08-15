import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from './stores/auth.js'

const routes = [
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  { path: '/activate', name: 'activate', component: () => import('./views/ActivateView.vue'), meta: { public: true } },
  { path: '/', name: 'overview', component: () => import('./views/OverviewView.vue'), meta: { tab: 'train' } },
  { path: '/chat', name: 'chat', component: () => import('./views/ChatView.vue'), meta: { tab: 'chat' } },
  { path: '/report', name: 'reports', component: () => import('./views/ReportListView.vue'), meta: { tab: 'report' } },
  {
    path: '/report/:sessionId',
    name: 'report-detail',
    component: () => import('./views/ReportDetailView.vue'),
    props: true,
  },
  { path: '/profile', name: 'profile', component: () => import('./views/ProfileView.vue'), meta: { tab: 'me' } },
  { path: '/profile/edit', name: 'profile-edit', component: () => import('./views/ProfileEditView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export function createStudentRouter() {
  const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior: () => ({ top: 0 }),
  })

  router.beforeEach((to) => {
    const auth = useAuthStore()
    if (!to.meta.public && !auth.isLoggedIn) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    if (to.name === 'login' && auth.isLoggedIn) {
      return { name: 'overview' }
    }
    return true
  })

  return router
}
