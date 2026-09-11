import { http } from '../http.js'
import { sseRequest } from '../sse.js'

/**
 * 运维台 /api/ops · 全部 ADMIN（ops-frontend-api）
 *
 * 三条数据面里这里只覆盖 A（业务快照，全 GET 只读）：
 *   B 时序指标走 /actuator/prometheus 接 Grafana，不经本 API；
 *   C 边缘心跳 /api/ingest/edge/heartbeat 是机器上报，前端不调。
 */
export const opsApi = {
  /** 首屏一次拉全：business + agent + system + edge */
  overview: (agentWindowHours = 24) => http.get('/api/ops/overview', { agentWindowHours }),
  business: () => http.get('/api/ops/business'),
  agentQuality: (windowHours = 24) => http.get('/api/ops/agent/quality', { windowHours }),
  system: () => http.get('/api/ops/system'),
  /** health 可选 ONLINE / STALE / OFFLINE，不传为全部 */
  devices: (health) => http.get('/api/ops/edge/devices', { health }),
  device: (deviceId) => http.get(`/api/ops/edge/devices/${deviceId}`),
}

/**
 * 运维诊断对话 /api/ops/chat · ADMIN · SSE
 * 路径与事件同学生对话对称（无 interrupt）。只读诊断助手：给建议、不执行动作。
 * 依赖 agent 开关 + GLM key，未启用返回 50310。
 */
export const opsChatApi = {
  createSession: (payload = {}) => http.post('/api/ops/chat/sessions', payload),
  listSessions: (page = 0, size = 50) => http.get('/api/ops/chat/sessions', { page, size }),
  listMessages: (sessionId, page = 0, size = 100) =>
    http.get(`/api/ops/chat/sessions/${sessionId}/messages`, { page, size }),
  ask: (sessionId, { content }, { onEvent, signal }) =>
    sseRequest(`/api/ops/chat/sessions/${sessionId}/ask`, {
      method: 'POST',
      body: { content },
      onEvent,
      signal,
    }),
  rename: (sessionId, title) => http.patch(`/api/ops/chat/sessions/${sessionId}`, { title }),
  removeSession: (sessionId) => http.delete(`/api/ops/chat/sessions/${sessionId}`),
}

/* ---------------- 展示口径 ---------------- */

/**
 * 设备健康。后端按 lastSeenAt 读时派生（EdgeHealthEvaluator），不是存字段，
 * 所以列表要定时重拉，否则状态会停在打开页面那一刻。
 * 阈值在后端：online-within 默认 90s、offline-after 默认 10m。
 */
export const EDGE_HEALTH = {
  ONLINE: { label: '在线', tone: 'ok' },
  STALE: { label: '失联中', tone: 'warn' },
  OFFLINE: { label: '离线', tone: 'danger' },
}

export function edgeHealthLabel(health) {
  return EDGE_HEALTH[health]?.label || health || '—'
}

export function edgeHealthTone(health) {
  return EDGE_HEALTH[health]?.tone || 'muted'
}

/** 熔断器状态：LLM 未启用时为 null */
export const CIRCUIT_STATE = {
  CLOSED: { label: '闭合 · 正常', tone: 'ok' },
  HALF_OPEN: { label: '半开 · 探测中', tone: 'warn' },
  OPEN: { label: '断开 · 已熔断', tone: 'danger' },
}

export function circuitLabel(state) {
  if (!state) return '未启用'
  return CIRCUIT_STATE[state]?.label || state
}

export function circuitTone(state) {
  if (!state) return 'muted'
  return CIRCUIT_STATE[state]?.tone || 'muted'
}

/**
 * 比率格式化。窗内无样本时后端给 null，按文档要显示破折号而不是 0%
 * —— 两者含义完全不同，0% 会被当成「一次都没降级」。
 */
export function pct(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—'
  return `${(Number(v) * 100).toFixed(digits)}%`
}

/** 大数字加千分位；null 显示破折号 */
export function num(v) {
  if (v === null || v === undefined) return '—'
  return Number(v).toLocaleString('zh-CN')
}
