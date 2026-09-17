import { http } from '../http.js'
import { sseRequest } from '../sse.js'

/** §3 学生对话 /api/student/chat */
export const studentChatApi = {
  createSession: (payload = {}) => http.post('/api/student/chat/sessions', payload),
  listSessions: (page = 0, size = 50) => http.get('/api/student/chat/sessions', { page, size }),
  listMessages: (sessionId, page = 0, size = 100) =>
    http.get(`/api/student/chat/sessions/${sessionId}/messages`, { page, size }),
  /** SSE 提问：events = meta/delta/tool/rag/assist/done/error（cloud-frontend-api §2.1） */
  ask: (sessionId, { content }, { onEvent, signal }) =>
    sseRequest(`/api/student/chat/sessions/${sessionId}/ask`, {
      method: 'POST',
      body: { content },
      onEvent,
      signal,
    }),
  interrupt: (sessionId) => http.post(`/api/student/chat/sessions/${sessionId}/interrupt`),
  removeSession: (sessionId) => http.delete(`/api/student/chat/sessions/${sessionId}`),
  rename: (sessionId, title) => http.patch(`/api/student/chat/sessions/${sessionId}`, { title }),
}

/** §2.3 学生求助 /api/student/help-requests */
export const studentHelpApi = {
  /** SSE 的 assist 事件建议求助时调它，question 用 assist.question */
  create: (payload) => http.post('/api/student/help-requests', payload),
  /** 每条含 id/question/status/teacherName/teacherReply/createdAt/handledAt */
  list: (page = 0, size = 20) => http.get('/api/student/help-requests', { page, size }),
}

/**
 * 求助工单状态。枚举全集就这四个（后端 2026-09-17 确认），
 * 之前前端猜的 HANDLED/CLOSED/DONE/REPLIED 都不存在。
 */
export const HELP_STATUS = {
  PENDING: { label: '待查看', tone: 'warn' },
  VIEWED: { label: '老师已查看', tone: 'info' },
  RESOLVED: { label: '已答复', tone: 'ok' },
  DISMISSED: { label: '已关闭', tone: 'muted' },
}

export function helpStatusLabel(s) {
  return HELP_STATUS[s]?.label || s || '—'
}

export function helpStatusTone(s) {
  return HELP_STATUS[s]?.tone || 'muted'
}

/** 还没处理完的，学生端据此排在前面 */
export function helpIsOpen(s) {
  return s === 'PENDING' || s === 'VIEWED'
}

/** §4 学生训练数据 /api/student/data */
export const studentDataApi = {
  overview: () => http.get('/api/student/data/overview'),
  sessions: ({ from, to, page = 0, size = 20 } = {}) =>
    http.get('/api/student/data/sessions', { from, to, page, size }),
  sessionDetail: (sessionId) => http.get(`/api/student/data/sessions/${sessionId}`),
  clips: (sessionId, { actionType, page = 0, size = 100 } = {}) =>
    http.get(`/api/student/data/sessions/${sessionId}/clips`, { actionType, page, size }),
  clipDetail: (clipId) => http.get(`/api/student/data/clips/${clipId}`),
  feedback: (sessionId, { severity, page = 0, size = 100 } = {}) =>
    http.get(`/api/student/data/sessions/${sessionId}/feedback`, { severity, page, size }),
  trend: ({ actionType, metric, limit = 10 } = {}) =>
    http.get('/api/student/data/trend', { actionType, metric, limit }),
  updateProfile: (payload) => http.put('/api/student/profile', payload),
  /** 🚧 50100 */
  report: (sessionId) => http.get(`/api/student/data/sessions/${sessionId}/report`),
  exportReport: (sessionId) => http.post(`/api/student/data/sessions/${sessionId}/report/export`),
}
