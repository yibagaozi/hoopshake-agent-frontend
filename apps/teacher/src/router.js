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
  // 运维台（ops-frontend-api）：全部 ADMIN，看的是全量数据，与教师页的本人作用域互不影响
  // 运维台：侧栏只占一格（nav: 'ops'），五个页面用页内 tab 切换（meta.sub）
  { path: '/ops', name: 'ops-overview', component: () => import('./views/ops/OpsOverviewView.vue'), meta: { nav: 'ops', sub: 'overview', role: 'ADMIN' } },
  { path: '/ops/devices', name: 'ops-devices', component: () => import('./views/ops/OpsDevicesView.vue'), meta: { nav: 'ops', sub: 'devices', role: 'ADMIN' } },
  { path: '/ops/agent', name: 'ops-agent', component: () => import('./views/ops/OpsAgentView.vue'), meta: { nav: 'ops', sub: 'agent', role: 'ADMIN' } },
  { path: '/ops/system', name: 'ops-system', component: () => import('./views/ops/OpsSystemView.vue'), meta: { nav: 'ops', sub: 'system', role: 'ADMIN' } },
  { path: '/ops/chat', name: 'ops-chat', component: () => import('./views/ops/OpsChatView.vue'), meta: { nav: 'ops', sub: 'chat', role: 'ADMIN' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export function createTeacherRouter() {
  const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
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
    // ADMIN 是超集：运维老师自己也带课，教师页对它的行为与普通教师完全一致
    // （后端按 teacherId 划数据，全量只在 /api/ops 看），所以不再把 admin 挡在教师页外
    if (to.meta.role === 'ADMIN' && !auth.isAdmin && auth.isLoggedIn) return '/lessons'
    return true
  })

  return router
}
