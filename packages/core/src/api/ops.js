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
  /**
   * Grafana 嵌入地址。后端**不出图** —— 它只把 /actuator/prometheus 暴露给
   * Grafana 当数据源，面板建在各自的 Grafana 上，这里只是把配好的地址交出来。
   *
   * configured=false 不是错误，是「这套环境还没接 Grafana」，整块隐藏即可，
   * 别渲染一个空 iframe（那看着像挂了）。后端会把空白串也判成未配置。
   */
  grafana: () => http.get('/api/ops/grafana'),
}

/**
 * 边缘遥测 /api/ops/edge/telemetry/** · 全部 ADMIN · 全部 GET 无 body
 *
 * 和 /api/ops/edge/devices 的区别：devices 看的是「机器现在还在不在」，
 * 这四个看的是机器上跑出了什么 —— 日志、指标点、进程生命周期。排障时
 * 先在 devices 找到那台，再来这里翻它的日志与进程。
 *
 * 四个筛选参数都可不传（不传即全部）。空串会被 buildUrl 丢掉，所以
 * 视图里直接把「未选择」留成 '' 就行，不用手动删键。
 */
export const opsTelemetryApi = {
  /** 窗口内的总量与最近若干条，首屏一次拉全 */
  summary: ({ edgeId, windowHours = 24 } = {}) =>
    http.get('/api/ops/edge/telemetry/summary', { edgeId, windowHours }),
  /** 日志分页。keyword 走后端全文匹配，from/to 为 ISO 时间 */
  logs: (q = {}) => http.get('/api/ops/edge/telemetry/logs', { page: 0, size: 20, ...q }),
  /** 指标点分页。metricName 是精确名，dims 是自由维度对象 */
  metrics: (q = {}) => http.get('/api/ops/edge/telemetry/metrics', { page: 0, size: 20, ...q }),
  /** 进程运行记录分页。一条 = 一次进程从拉起到退出 */
  runs: (q = {}) => http.get('/api/ops/edge/telemetry/runs', { page: 0, size: 20, ...q }),
}

/**
 * 运维诊断对话 /api/ops/chat · ADMIN · SSE
 * 路径与学生对话对称，但没有 interrupt。只读诊断助手：给建议、不执行动作。
 * 事件比学生对话少两个：只有 meta/delta/tool/done/error —— 运维诊断不挂 RAG、
 * 不做求助建议，所以没有 rag/assist。
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

/**
 * 日志级别。后端目前只产 ERROR/WARN/INFO 三档（summary 也只分这三个计数），
 * DEBUG/TRACE/FATAL 一并列上：真出现了也有个中性样式，不至于掉进 undefined。
 */
export const LOG_LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE']

const LOG_LEVEL_TONE = {
  FATAL: 'danger',
  ERROR: 'danger',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'muted',
  TRACE: 'muted',
}

export function logLevelTone(level) {
  return LOG_LEVEL_TONE[String(level || '').toUpperCase()] || 'muted'
}

/**
 * 进程运行状态。文档只点名了 running / failed 两类计数，没给完整枚举，
 * 所以这里认识的词给中文，不认识的**原样显示**——硬套成「未知」会把
 * 后端新加的状态盖掉，排障时反而看不见。
 */
const RUN_STATUS = {
  RUNNING: { label: '运行中', tone: 'ok' },
  STARTING: { label: '启动中', tone: 'info' },
  SUCCEEDED: { label: '已完成', tone: 'muted' },
  SUCCESS: { label: '已完成', tone: 'muted' },
  FINISHED: { label: '已完成', tone: 'muted' },
  EXITED: { label: '已退出', tone: 'muted' },
  STOPPED: { label: '已停止', tone: 'muted' },
  FAILED: { label: '失败', tone: 'danger' },
  ERROR: { label: '失败', tone: 'danger' },
  CRASHED: { label: '崩溃', tone: 'danger' },
  KILLED: { label: '被终止', tone: 'warn' },
  TIMEOUT: { label: '超时', tone: 'warn' },
}

export function runStatusLabel(status) {
  if (!status) return '—'
  return RUN_STATUS[String(status).toUpperCase()]?.label || status
}

export function runStatusTone(status) {
  if (!status) return 'muted'
  return RUN_STATUS[String(status).toUpperCase()]?.tone || 'muted'
}

/** 对话类型（agent/quality 的 byChatType）。固定 STUDENT / TEACHER 两项 */
export const CHAT_TYPES = ['STUDENT', 'TEACHER']

const CHAT_TYPE_LABEL = { STUDENT: '学生端', TEACHER: '教师端' }

export function chatTypeLabel(t) {
  return CHAT_TYPE_LABEL[String(t || '').toUpperCase()] || t || '—'
}

/**
 * 进程时长。fmtMs 给的是 mm:ss，适合课堂里的秒表，
 * 但进程能跑几小时甚至几天，那种长度得换个写法。
 */
export function fmtDurationMs(ms) {
  if (ms === null || ms === undefined || Number.isNaN(Number(ms))) return '—'
  const n = Math.max(0, Number(ms))
  if (n < 1000) return `${Math.round(n)} 毫秒`
  const s = Math.floor(n / 1000)
  if (s < 60) return `${s} 秒`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} 分 ${s % 60} 秒`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时 ${m % 60} 分`
  return `${Math.floor(h / 24)} 天 ${h % 24} 小时`
}
