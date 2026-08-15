/** 枚举 → 中文标签与语义色 */

export const ROLE_LABEL = {
  STUDENT: '学生',
  TEACHER: '教师',
  ADMIN: '管理员',
}

export const ACCOUNT_STATUS = {
  PENDING_ACTIVATION: { label: '待激活', tone: 'warn' },
  ACTIVE: { label: '已激活', tone: 'ok' },
  DISABLED: { label: '已停用', tone: 'muted' },
}

export const LESSON_STATUS = {
  PLANNED: { label: '未开课', tone: 'muted' },
  ONGOING: { label: '进行中', tone: 'ok' },
  FINISHED: { label: '已结课', tone: 'muted' },
}

export const SESSION_STATUS = {
  CREATED: { label: '已创建', done: false },
  RECORDED: { label: '已录制', done: false },
  PERCEPTION_DONE: { label: '感知完成', done: false },
  SYNC_DONE: { label: '同步完成', done: false },
  POSE3D_DONE: { label: '3D 姿态完成', done: false },
  ACTION_DONE: { label: '动作识别完成', done: false },
  SHOT_OUTCOME_DONE: { label: '命中判定完成', done: false },
  SCORED: { label: '已评分', done: true },
  REPORT_READY: { label: '报告就绪', done: true },
}

export const SEVERITY = {
  MINOR: { label: '轻微', tone: 'warn' },
  MAJOR: { label: '重点', tone: 'danger' },
  POSITIVE: { label: '表扬', tone: 'ok' },
}

export const DOMINANT_HAND = {
  LEFT: '左手',
  RIGHT: '右手',
}

export const KNOWLEDGE_STATUS = {
  PROCESSING: { label: '处理中', tone: 'warn' },
  DONE: { label: '已完成', tone: 'ok' },
  FAILED: { label: '失败', tone: 'danger' },
}

export function sessionStatusLabel(s) {
  return SESSION_STATUS[s]?.label || s || '—'
}

export function lessonStatusLabel(s) {
  return LESSON_STATUS[s]?.label || s || '—'
}

/** 训练动作 id → 展示名（词表接口未开放前的常用映射，未命中原样展示） */
export const ACTION_LABELS = {
  jump_shot: '跳投',
  shooting: '投篮',
  shot: '投篮',
  free_throw: '罚球',
  layup: '上篮',
  dribble: '运球',
  dribbling: '运球',
  pass: '传球',
  passing: '传球',
  crossover: '变向突破',
  three_point: '三分',
}

export function actionLabel(id) {
  if (!id) return '—'
  return ACTION_LABELS[id] || ACTION_LABELS[String(id).toLowerCase()] || id
}

/** 检查点 id → 展示名（同上，词表接口开放后应改为动态拉取） */
export const CHECKPOINT_LABELS = {
  elbow_alignment: '肘部对齐',
  elbow_under_ball: '肘在球下',
  elbow_flare: '肘部外翻',
  release_timing: '出手时机',
  early_release: '出手偏早',
  follow_through: '跟随动作',
  wrist_snap: '手腕下压',
  arc: '投篮弧线',
  balance: '身体平衡',
  jump_balance: '起跳平衡',
  jump_forward: '起跳偏前',
  knee_valgus: '落地膝内扣',
  landing_buffer: '落地缓冲',
  center_of_gravity: '重心控制',
  footwork: '脚步',
}

export function checkpointLabel(id) {
  if (!id) return '—'
  return CHECKPOINT_LABELS[id] || CHECKPOINT_LABELS[String(id).toLowerCase()] || id
}

/** 安全类检查点（触发时按安全提醒处理） */
const SAFETY_CHECKPOINTS = new Set(['knee_valgus', 'landing_buffer'])

export function isSafetyCheckpoint(id) {
  if (!id) return false
  return SAFETY_CHECKPOINTS.has(String(id).toLowerCase()) || /knee|valgus|land|safety|ankle/i.test(id)
}
