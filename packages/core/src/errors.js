import { ApiError } from './http.js'

/** 错误码 → 用户可读文案（cloud-frontend-api §0 错误码表） */
export const ERROR_MESSAGES = {
  40000: '参数有误，请检查输入',
  40100: '请先登录',
  40101: '登录状态已过期',
  40102: '登录凭证无效，请重新登录',
  40103: '登录已过期，请重新登录',
  40110: '账号或密码错误',
  40111: '原密码不正确',
  40112: '验证码不正确，请与老师核对',
  40113: '新密码不能与原密码相同',
  40300: '没有操作权限',
  40301: '无权查看该数据',
  40310: '账号已被停用，请联系老师或管理员',
  40311: '账号尚未激活，请先完成激活',
  40400: '内容不存在或已被删除',
  40900: '操作冲突，请刷新后重试',
  40901: '该标识已被使用',
  40910: '当前状态不允许此操作',
  40917: '本课还没有标定，请先完成球场标定',
  40918: '已有标定任务在进行中，请等它结束',
  42900: '操作过于频繁，请稍后再试',
  42910: '今日 AI 用量已用完，请明天再试',
  // 42911 是周配额：文案要说清是「本周」且会在周一清零，不能沿用 42910 的「明天再试」
  42911: '本周 AI 用量已用完，下周一自动恢复',
  50100: '该功能暂未开放，敬请期待',
  50310: 'AI 服务暂不可用，请稍后再试',
  50333: '算法机未启用标定功能，请检查边缘配置',
}

/** AI 配额用尽：周配额 42911 与旧的日配额 42910 都算 */
export function isQuotaExhausted(err) {
  return err instanceof ApiError && (err.code === 42911 || err.code === 42910)
}

/** 将任意错误转成用户可读文案（含字段校验明细） */
export function errText(err, fallback = '操作失败，请稍后重试') {
  if (err instanceof ApiError) {
    const base = ERROR_MESSAGES[err.code] || err.message || fallback
    const fields = err.fieldErrors
    if (fields.length) {
      const detail = fields.slice(0, 3).map((f) => `${f.field}: ${f.message}`).join('；')
      return `${base}（${detail}）`
    }
    return base
  }
  return err?.message || fallback
}

export function isNotOpen(err) {
  return err instanceof ApiError && err.code === 50100
}
