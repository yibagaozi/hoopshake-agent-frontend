import { ApiError } from './http.js'

/** 错误码 → 用户可读文案（HOOPSHAKE Cloud API v1.7） */
export const ERROR_MESSAGES = {
  40000: '参数有误，请检查输入',
  40100: '请先登录',
  40101: '登录状态已过期',
  40103: '登录已过期，请重新登录',
  40110: '账号或密码错误',
  40300: '没有操作权限',
  40301: '无权查看该数据',
  40310: '账号已被停用，请联系老师或管理员',
  40311: '账号尚未激活，请先完成激活',
  40400: '内容不存在或已被删除',
  40901: '该标识已被使用',
  40910: '当前状态不允许此操作',
  42900: '操作过于频繁，请稍后再试',
  42910: '今日 AI 用量已用完，请明天再试',
  50100: '该功能暂未开放，敬请期待',
  50310: 'AI 服务暂不可用，请稍后再试',
}

/** 将任意错误转成用户可读文案（含字段校验明细） */
export function errText(err, fallback = '操作失败，请稍后重试') {
  if (err instanceof ApiError) {
    const base = ERROR_MESSAGES[err.code] || err.message || fallback
    const fields = err.fieldErrors
    if (fields.length) {
      const detail = fields.slice(0, 3).map((f) => `${f.field}: ${f.reason}`).join('；')
      return `${base}（${detail}）`
    }
    return base
  }
  return err?.message || fallback
}

export function isNotOpen(err) {
  return err instanceof ApiError && err.code === 50100
}
