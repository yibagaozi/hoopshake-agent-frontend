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
}
