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
/**
 * 动作 id → 中文名的**兜底**表，口径对齐 /api/meta/vocabulary。
 * 下面前五条是词表里真实存在的；其余是历史数据里可能出现的旧值，
 * 只为让老数据不显示成裸 id，不要用它们去配课程。
 */
export const ACTION_LABELS = {
  free_throw: '罚篮',
  jump_shot: '跳投',
  layup: '上篮',
  triple_threat: '突破',
  pass: '传球',
  // ↓ 历史遗留，词表里没有
  shooting: '投篮',
  shot: '投篮',
  dribble: '运球',
  dribbling: '运球',
  passing: '传球',
  rebound: '篮板',
  defense_slide: '防守滑步',
  crossover: '变向突破',
  three_point: '三分',
}

/** 英文名，场边大屏中英并排时用 */
export const ACTION_LABELS_EN = {
  free_throw: 'Free Throw',
  jump_shot: 'Jump Shot',
  layup: 'Layup',
  triple_threat: 'Triple Threat',
  pass: 'Pass',
  dribble: 'Dribble',
  rebound: 'Rebound',
  defense_slide: 'Defense Slide',
}

export function actionLabelEn(id) {
  if (!id) return ''
  return ACTION_LABELS_EN[id] || ACTION_LABELS_EN[String(id).toLowerCase()] || ''
}

export function actionLabel(id) {
  if (!id) return '—'
  return ACTION_LABELS[id] || ACTION_LABELS[String(id).toLowerCase()] || id
}

/** 检查点 id → 展示名（同上，词表接口开放后应改为动态拉取） */
/**
 * 检查点 id → 中文名的**兜底**表。
 *
 * 权威来源是 GET /api/meta/vocabulary（见 vocabulary.js）；渲染时应优先用
 * 事件/接口随数据带回的 label，其次查词表，最后才落到这里。
 * 这里只保留词表里真实存在的 id —— 早期那批 elbow_alignment / release_timing /
 * release_elbow_extension 之类是没有词表时编的占位，配了云端会 40000 拒掉、
 * 场边也不会触发，已全部删除。
 */
export const CHECKPOINT_LABELS = {
  'ft.load.knee': '蓄力屈膝',
  'ft.set.elbow': '设定点肘位',
  'ft.release.elbow': '出手肘伸展',
  'ft.release.wrist': '出手压腕',
  'ft.follow.elbow': '跟随伸展',
  'js.load.knee': '起跳蓄力',
  'js.release.elbow': '跳投出手肘',
  'js.release.wrist': '跳投压腕',
  'js.follow.elbow': '跳投跟随',
  'lu.takeoff.knee': '上篮起跳蹬伸',
  'lu.finish.elbow': '上篮终结伸展',
  'tt.load.knee': '三威胁重心',
  'safety.layup_landing_knee': '落地屈膝缓冲',
}

export function checkpointLabel(id) {
  if (!id) return '—'
  return CHECKPOINT_LABELS[id] || CHECKPOINT_LABELS[String(id).toLowerCase()] || id
}

/** 本地兜底表里有没有登记这个 id */
export function hasCheckpointLabel(id) {
  if (!id) return false
  return !!(CHECKPOINT_LABELS[id] || CHECKPOINT_LABELS[String(id).toLowerCase()])
}

/** 安全类检查点（触发时按安全提醒处理） */
/**
 * 是不是安全项的**兜底**判断：词表里带 safety 字段，能拿到词表就用那个
 * （vocabIsSafety）。这里只认 safety. 前缀，不按关键词模糊匹配 ——
 * 那会把 ft.load.knee（蓄力屈膝，普通检查点）也当成安全告警。
 */
export function isSafetyCheckpoint(id) {
  if (!id) return false
  return String(id).toLowerCase().startsWith('safety.')
}
