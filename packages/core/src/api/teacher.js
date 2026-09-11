import { http } from '../http.js'
import { sseRequest } from '../sse.js'

/** §5 课程管理 /api/teacher/lessons */
export const lessonApi = {
  create: (payload) => http.post('/api/teacher/lessons', payload),
  list: ({ status, from, to, page = 0, size = 50 } = {}) =>
    http.get('/api/teacher/lessons', { status, from, to, page, size }),
  detail: (lessonId) => http.get(`/api/teacher/lessons/${lessonId}`),
  update: (lessonId, payload) => http.put(`/api/teacher/lessons/${lessonId}`, payload),
  setStatus: (lessonId, status) => http.post(`/api/teacher/lessons/${lessonId}/status`, { status }),
  enrollments: (lessonId) => http.get(`/api/teacher/lessons/${lessonId}/enrollments`),
  enroll: (lessonId, students) => http.post(`/api/teacher/lessons/${lessonId}/enrollments`, { students }),
  unenroll: (lessonId, studentId) => http.delete(`/api/teacher/lessons/${lessonId}/enrollments/${studentId}`),
  previewEnroll: (lessonId, students) =>
    http.post(`/api/teacher/lessons/${lessonId}/enrollments/preview`, { students }),
  live: (lessonId) => http.get(`/api/teacher/lessons/${lessonId}/live`),
  /** SSE 课堂实况：events = snapshot/feedback/safety_alert/session_status */
  liveStream: (lessonId, { onEvent, signal }) =>
    sseRequest(`/api/teacher/lessons/${lessonId}/live/stream`, { method: 'GET', onEvent, signal }),
}

/** §6 学生管理 /api/teacher/students */
export const teacherStudentApi = {
  create: (payload) => http.post('/api/teacher/students', payload),
  list: ({ keyword, page = 0, size = 20 } = {}) =>
    http.get('/api/teacher/students', { keyword, page, size }),
  detail: (studentId) => http.get(`/api/teacher/students/${studentId}`),
  update: (studentId, payload) => http.put(`/api/teacher/students/${studentId}`, payload),
  stats: (studentId) => http.get(`/api/teacher/students/${studentId}/stats`),
  /** 🚧 50100 */
  reidCorrection: (studentId, payload) =>
    http.post(`/api/teacher/students/${studentId}/reid/corrections`, payload),
}

/** §8 课末汇总 /api/teacher/summary */
export const summaryApi = {
  session: (sessionId) => http.get(`/api/teacher/summary/sessions/${sessionId}`),
  /** 🚧 50100 */
  exportSession: (sessionId) => http.post(`/api/teacher/summary/sessions/${sessionId}/export`),
}

/**
 * 求助处理 /api/teacher/help-requests · TEACHER
 * 列表只返回本教师名下学生的工单；status 可空 = 全部。
 */
export const teacherHelpApi = {
  list: ({ status, page = 0, size = 20 } = {}) =>
    http.get('/api/teacher/help-requests', { status, page, size }),
  handle: (requestId, payload) =>
    http.post(`/api/teacher/help-requests/${requestId}/handle`, payload),
}

/** §7 备课工作台 /api/teacher/plan（🚧 全部 50100，前端灰置） */
export const planApi = {
  createTask: (payload) => http.post('/api/teacher/plan/tasks', payload),
  listTasks: () => http.get('/api/teacher/plan/tasks'),
}

/**
 * §3.1 教师教学助手 /api/teacher/chat
 * 路径与事件同学生端对称，agentType=teaching_agent，唯一差别是**没有 interrupt**
 * （cloud-frontend-api §3.1）。
 */
export const teacherChatApi = {
  createSession: (payload = {}) => http.post('/api/teacher/chat/sessions', payload),
  listSessions: (page = 0, size = 50) => http.get('/api/teacher/chat/sessions', { page, size }),
  listMessages: (sessionId, page = 0, size = 100) =>
    http.get(`/api/teacher/chat/sessions/${sessionId}/messages`, { page, size }),
  /** SSE 提问：events = meta/delta/tool/rag/assist/done/error */
  ask: (sessionId, { content, lessonId }, { onEvent, signal }) =>
    sseRequest(`/api/teacher/chat/sessions/${sessionId}/ask`, {
      method: 'POST',
      body: { content, ...(lessonId ? { lessonId } : {}) },
      onEvent,
      signal,
    }),
  rename: (sessionId, title) => http.patch(`/api/teacher/chat/sessions/${sessionId}`, { title }),
  removeSession: (sessionId) => http.delete(`/api/teacher/chat/sessions/${sessionId}`),
}

/** §12 词表 /api/meta（🚧 当前 404/50100，降级用本地映射） */
export const metaApi = {
  vocabulary: () => http.get('/api/meta/vocabulary'),
}
