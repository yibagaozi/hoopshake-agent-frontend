/** 时间与数值格式化 */

function toDate(v) {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

const p2 = (n) => String(n).padStart(2, '0')

export function fmtDate(v) {
  const d = toDate(v)
  if (!d) return '—'
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

export function fmtTime(v) {
  const d = toDate(v)
  if (!d) return '—'
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`
}

export function fmtDateTime(v) {
  const d = toDate(v)
  if (!d) return '—'
  return `${fmtDate(d)} ${fmtTime(d)}`
}

export function fmtMonthDay(v) {
  const d = toDate(v)
  if (!d) return { day: '—', month: '' }
  return { day: p2(d.getDate()), month: `${d.getMonth() + 1}月` }
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function fmtWeekday(v) {
  const d = toDate(v)
  return d ? `周${WEEKDAYS[d.getDay()]}` : ''
}

/** 相对友好时间：今天 20:14 / 昨天 / 7月8日 */
export function fmtFriendly(v) {
  const d = toDate(v)
  if (!d) return '—'
  const now = new Date()
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000)
  if (diffDays === 0) return `今天 ${fmtTime(d)}`
  if (diffDays === 1) return '昨天'
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`
  return fmtDate(d)
}

/** 0-1 或 0-100 的比例统一转百分数整数（null 返回 null） */
export function pctNumber(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return null
  const n = Number(v)
  return Math.round(n <= 1 ? n * 100 : n)
}

export function fmtPct(v, fallback = '—') {
  const n = pctNumber(v)
  return n === null ? fallback : `${n}%`
}

/** 毫秒 → mm:ss */
export function fmtMs(ms) {
  if (ms === null || ms === undefined) return '—'
  const s = Math.floor(Number(ms) / 1000)
  return `${p2(Math.floor(s / 60))}:${p2(s % 60)}`
}

/** datetime-local 输入值 ↔ ISO */
export function toLocalInput(v) {
  const d = toDate(v)
  if (!d) return ''
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
}

export function fromLocalInput(s) {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** 姓名首字（头像用） */
export function nameInitial(name, fallback = '?') {
  const s = (name || '').trim()
  return s ? Array.from(s)[0] : fallback
}

/** 稳定的头像配色（同一人固定颜色） */
const AVATAR_COLORS = ['#FF6A2C', '#1C1C1E', '#2FB170', '#8A6BD6', '#4C8DD6', '#3FA7A0', '#7A8A3C', '#E58A3C']

export function avatarColor(seed) {
  const s = String(seed || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
