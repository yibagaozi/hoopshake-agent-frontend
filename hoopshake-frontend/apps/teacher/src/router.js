import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from './stores/auth.js'

const routes = [
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  { path: '/register', name: 'register', component: () => import('./views/RegisterView.vue'), meta: { public: true } },
  { path: '/', redirect: '/lessons' },
  { path: '/lessons', name: 'lessons', component: () => import('./views/LessonsView.vue'), meta: { nav: 'lessons', role: 'TEACHER' } },
  { path: '/lessons/:lessonId', name: 'lesson-detail', component: () => import('./views/LessonDetailView.vue'), props: true, meta: { nav: 'lessons', role: 'TEACHER' } },
  { path: '/lessons/:lessonId/config', name: 'lesson-config', component: () => import('./views/LessonConfigView.vue'), props: true, meta: { nav: 'config', role: 'TEACHER' } },
  { path: '/lessons/:lessonId/roster', name: 'lesson-roster', component: () => import('./views/LessonRosterView.vue'), props: true, meta: { nav: 'students', role: 'TEACHER' } },
  { path: '/lessons/:lessonId/import', name: 'lesson-import', component: () => import('./views/LessonImportView.vue'), props: true, meta: { nav: 'config', role: 'TEACHER' } },
  { path: '/students', name: 'students', component: () => import('./views/StudentsView.vue'), meta: { nav: 'students', role: 'TEACHER' } },
  { path: '/students/:studentId', name: 'student-detail', component: () => import('./views/StudentDetailView.vue'), props: true, meta: { nav: 'students', role: 'TEACHER' } },
  { path: '/plan', name: 'plan', component: () => import('./views/PlanView.vue'), meta: { nav: 'plan', role: 'TEACHER' } },
  { path: '/assistant', name: 'assistant', component: () => import('./views/AssistantView.vue'), meta: { nav: 'assistant', role: 'TEACHER' } },
  { path: '/summary', name: 'summary-entry', component: () => import('./views/SummaryEntryView.vue'), meta: { nav: 'summary', role: 'TEACHER' } },
  { path: '/summary/:sessionId', name: 'summary', component: () => import('./views/SummaryView.vue'), props: true, meta: { nav: 'summary', role: 'TEACHER' } },
  { path: '/knowledge', name: 'knowledge', component: () => import('./views/KnowledgeView.vue'), meta: { nav: 'knowledge', role: 'ADMIN' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export function createTeacherRouter() {
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
    if ((to.name === 'login' || to.name === 'register') && auth.isLoggedIn) {
      return auth.homePath
    }
    // 角色路由隔离：管理员只看知识库，教师不进知识库
    if (to.meta.role === 'TEACHER' && auth.isAdmin) return '/knowledge'
    if (to.meta.role === 'ADMIN' && !auth.isAdmin && auth.isLoggedIn) return '/lessons'
    return true
  })

  return router
}
