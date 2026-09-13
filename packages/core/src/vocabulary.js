import { http } from './http.js'
import { actionLabel, checkpointLabel } from './enums.js'

/**
 * 全系统唯一权威词表 GET /api/meta/vocabulary。
 *
 * 课程的 actionTypes / enabledCheckpoints **必须**用这里的 id，
 * 云端会校验，非法值直接 40000 PARAM_INVALID；场边规则引擎与
 * instant_feedback.checkpoint_id 用的也是这同一套 id。
 *
 * 按 version 缓存到 localStorage：version 没变就不重复拉，
 * 变了自动换掉。拉不到（离线、接口挂了）退下面的兜底表。
 */

const CACHE_KEY = 'hoopshake_vocabulary'

/**
 * 兜底词表，内容照 2026-09-12 版接口逐条抄下来。
 * 只在拿不到接口时用 —— 它迟早会过期，所以任何地方都以接口返回的为准。
 */
export const FALLBACK_VOCABULARY = Object.freeze({
  version: 'fallback-2026-09-12',
  actions: [
    { id: 'free_throw', label: '罚篮', cameras: ['cam_03'] },
    { id: 'jump_shot', label: '跳投', cameras: ['cam_01', 'cam_02', 'cam_03'] },
    { id: 'layup', label: '上篮', cameras: ['cam_03'] },
    { id: 'triple_threat', label: '突破', cameras: ['cam_01', 'cam_02'] },
    { id: 'pass', label: '传球', cameras: ['cam_01', 'cam_02'] },
  ],
  checkpoints: [
    { id: 'ft.load.knee', label: '蓄力屈膝', safety: false, actionTypes: ['free_throw'] },
    { id: 'ft.set.elbow', label: '设定点肘位', safety: false, actionTypes: ['free_throw'] },
    { id: 'ft.release.elbow', label: '出手肘伸展', safety: false, actionTypes: ['free_throw'] },
    { id: 'ft.release.wrist', label: '出手压腕', safety: false, actionTypes: ['free_throw'] },
    { id: 'ft.follow.elbow', label: '跟随伸展', safety: false, actionTypes: ['free_throw'] },
    { id: 'js.load.knee', label: '起跳蓄力', safety: false, actionTypes: ['jump_shot'] },
    { id: 'js.release.elbow', label: '跳投出手肘', safety: false, actionTypes: ['jump_shot'] },
    { id: 'js.release.wrist', label: '跳投压腕', safety: false, actionTypes: ['jump_shot'] },
    { id: 'js.follow.elbow', label: '跳投跟随', safety: false, actionTypes: ['jump_shot'] },
    { id: 'lu.takeoff.knee', label: '上篮起跳蹬伸', safety: false, actionTypes: ['layup'] },
    { id: 'lu.finish.elbow', label: '上篮终结伸展', safety: false, actionTypes: ['layup'] },
    { id: 'tt.load.knee', label: '三威胁重心', safety: false, actionTypes: ['triple_threat'] },
    { id: 'safety.layup_landing_knee', label: '落地屈膝缓冲', safety: true, actionTypes: ['layup'] },
  ],
  phases: {
    byActionType: {
      free_throw: ['load', 'set', 'release', 'follow_through'],
      jump_shot: ['load', 'takeoff', 'release', 'follow_through'],
      layup: ['approach', 'gather', 'takeoff', 'release', 'finish'],
      triple_threat: ['load', 'action', 'recover'],
      pass: ['load', 'action', 'recover'],
    },
    labels: {
      load: '蓄力',
      set: '设定点',
      takeoff: '起跳',
      release: '出手',
      follow_through: '跟随',
      approach: '起步',
      gather: '收球',
      finish: '终结',
      action: '动作',
      recover: '恢复',
    },
  },
})

let current = null
let inflight = null

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const v = raw ? JSON.parse(raw) : null
    return v?.version && Array.isArray(v.checkpoints) ? v : null
  } catch {
    return null
  }
}

function writeCache(v) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(v))
  } catch {
    /* 隐私模式等场景忽略 */
  }
}

/** 当前生效的词表：内存 → 本地缓存 → 兜底。同步，可直接在渲染里用 */
export function vocabulary() {
  if (!current) current = readCache() || FALLBACK_VOCABULARY
  return current
}

/** 拿到的是不是接口真给的（而不是兜底/缓存） */
export function isVocabularyFresh() {
  return !!current && current !== FALLBACK_VOCABULARY && current.__fresh === true
}

/**
 * 拉词表。
 *
 * 一次页面会话只真拉一次：启动时拉过了，各个页面挂载时再调就直接拿现成的
 * —— 否则进一个页面发一次，白跑好几趟。版本变化靠下次刷新页面重新校验，
 * 要立刻重拉传 { force: true }。
 * 同一时刻只发一个请求；失败时保留已有的（缓存或兜底），不抛。
 *
 * @returns {Promise<object>} 生效的词表
 */
export function loadVocabulary({ force = false } = {}) {
  if (inflight) return inflight
  if (!force && isVocabularyFresh()) return Promise.resolve(vocabulary())
  inflight = (async () => {
    try {
      const v = await http.get('/api/meta/vocabulary')
      if (v?.version && Array.isArray(v.checkpoints)) {
        current = { ...v, __fresh: true }
        writeCache(v)
      }
    } catch {
      // 接口不可用时沿用缓存或兜底，不打扰使用者
    } finally {
      inflight = null
    }
    return vocabulary()
  })()
  return inflight
}

/**
 * 用外部拉到的词表覆盖当前这份。
 *
 * 给场边用：它有自己的云端客户端与 token（core 的 http 没配 baseUrl 也拿不到
 * 那个 token），所以自己拉完调这里塞进来，取值助手就都能用上了。
 * @returns {boolean} 形状不对会拒绝，返回 false
 */
export function setVocabulary(v) {
  if (!v?.version || !Array.isArray(v.checkpoints)) return false
  current = { ...v, __fresh: true }
  writeCache(v)
  return true
}

/* ---------------- 取值助手（都接受可选的 vocab，省得调用方传） ---------------- */

export function actionVocab(v = vocabulary()) {
  return v?.actions || []
}

export function checkpointVocab(v = vocabulary()) {
  return v?.checkpoints || []
}

/** 动作 id → 中文名：词表 → 本地兜底表 → 原样 id */
export function vocabActionLabel(id, v = vocabulary()) {
  if (!id) return '—'
  return actionVocab(v).find((a) => a.id === id)?.label || actionLabel(id)
}

/** 检查点 id → 中文名：词表 → 本地兜底表 → 原样 id */
export function vocabCheckpointLabel(id, v = vocabulary()) {
  if (!id) return '—'
  return checkpointVocab(v).find((c) => c.id === id)?.label || checkpointLabel(id)
}

/** 词表里登记过没有。界面靠它区分「有中文名」与「只能显示 id」 */
export function inVocabulary(id, v = vocabulary()) {
  if (!id) return false
  return checkpointVocab(v).some((c) => c.id === id) || actionVocab(v).some((a) => a.id === id)
}

/** 是不是安全项，词表的 safety 字段说了算 */
export function vocabIsSafety(id, v = vocabulary()) {
  return !!checkpointVocab(v).find((c) => c.id === id)?.safety
}

/**
 * 按已选动作过滤检查点候选。
 * 没选动作时返回空数组 —— 让老师先选动作，比一次摊开全部更清楚。
 */
export function checkpointsForActions(actionTypes, v = vocabulary()) {
  const picked = new Set(actionTypes || [])
  if (!picked.size) return []
  return checkpointVocab(v).filter((c) => (c.actionTypes || []).some((a) => picked.has(a)))
}

/** 某个动作的相位序列（有序），用来给片段打中文标签 */
export function phasesOf(actionType, v = vocabulary()) {
  const ids = v?.phases?.byActionType?.[actionType] || []
  const labels = v?.phases?.labels || {}
  return ids.map((id) => ({ id, label: labels[id] || id }))
}

/**
 * 后端随数据带回来的 label 是否**真的是个名字**。
 *
 * edge 的 actionFocus 目前把 actionLabel 回填成了 actionType（发来 "free_throw"
 * 而不是「罚篮」），这种等于 id 的值不能当名字用，否则会原样显示到界面上。
 */
function usableLabel(label, id) {
  const v = String(label ?? '').trim()
  return v && v !== String(id ?? '') ? v : ''
}

/**
 * 动作名的统一解析顺序：随数据带回的 label → 词表 → 本地兜底表 → 原样 id。
 * 三端都用这一个，免得同一个 id 在不同页面显示成不同名字。
 */
export function resolveActionName(label, id, v = vocabulary()) {
  return usableLabel(label, id) || vocabActionLabel(id, v)
}

/** 检查点名，顺序同上 */
export function resolveCheckpointName(label, id, v = vocabulary()) {
  return usableLabel(label, id) || vocabCheckpointLabel(id, v)
}

/** 相位 id → 中文名 */
export function phaseLabel(id, v = vocabulary()) {
  if (!id) return '—'
  return v?.phases?.labels?.[id] || id
}
