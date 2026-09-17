import { http } from '../http.js'

/** §2 认证 /api/auth */
export const authApi = {
  login: (identifier, password) => http.post('/api/auth/login', { identifier, password }),
  refresh: (refreshToken) => http.post('/api/auth/refresh', { refreshToken }),
  logout: (refreshToken) => http.post('/api/auth/logout', { refreshToken }),
  me: () => http.get('/api/auth/me'),
  register: (payload) => http.post('/api/auth/register', payload),
  activate: ({ phone, newPassword, verifyCode }) =>
    http.post('/api/auth/activate', { phone, newPassword, ...(verifyCode ? { verifyCode } : {}) }),
  /**
   * 改密。40111 原密码错、40113 新密码与原密码相同、40000 带 fieldErrors。
   * 三个都要能定位到具体输入框，所以调用方别用 errText 一把兜了。
   */
  changePassword: (oldPassword, newPassword) =>
    http.post('/api/auth/password', { oldPassword, newPassword }),
}

/**
 * AI 用量 /api/me/ai-usage · 任意已登录角色，只看自己
 * 自然周窗口，周一 00:00 清零；warning 是到 80%，exceeded 之后提问会被 42911 挡回。
 */
export const aiUsageApi = {
  mine: () => http.get('/api/me/ai-usage'),
}
