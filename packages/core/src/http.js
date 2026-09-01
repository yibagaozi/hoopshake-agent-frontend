/**
 * HOOPSHAKE Cloud API 统一请求层
 * - 信封解包：{ code, message, data, traceId, timestamp }，code=0 成功
 * - 40101（access 过期）自动 refresh 并重放一次（单飞）
 * - 40100 / 40103 触发 onUnauthorized 回调（跳登录）
 */

const config = {
  baseUrl: '',
  storageKey: 'hoopshake_auth',
  onUnauthorized: null,
}

export function configureApi({ baseUrl, storageKey, onUnauthorized } = {}) {
  if (baseUrl !== undefined) config.baseUrl = baseUrl.replace(/\/$/, '')
  if (storageKey) config.storageKey = storageKey
  if (onUnauthorized !== undefined) config.onUnauthorized = onUnauthorized
}

/* ---------------- token 存储 ---------------- */

let memAuth = null

export function loadAuth() {
  if (memAuth) return memAuth
  try {
    const raw = localStorage.getItem(config.storageKey)
    memAuth = raw ? JSON.parse(raw) : null
  } catch {
    memAuth = null
  }
  return memAuth
}

export function saveAuth(auth) {
  memAuth = auth
  try {
    if (auth) localStorage.setItem(config.storageKey, JSON.stringify(auth))
    else localStorage.removeItem(config.storageKey)
  } catch {
    /* 私密模式等场景忽略 */
  }
}

export function clearAuth() {
  saveAuth(null)
}

export function getAccessToken() {
  return loadAuth()?.accessToken || null
}

/* ---------------- 错误对象 ---------------- */

export class ApiError extends Error {
  constructor(code, message, data, traceId) {
    super(message || `请求失败（${code}）`)
    this.name = 'ApiError'
    this.code = code
    this.data = data || null
    this.traceId = traceId || null
  }

  get fieldErrors() {
    return this.data?.fieldErrors || []
  }
}

export function isCode(err, code) {
  return err instanceof ApiError && err.code === code
}

/* ---------------- refresh 单飞 ---------------- */

let refreshing = null

async function doRefresh() {
  const auth = loadAuth()
  if (!auth?.refreshToken) {
    throw new ApiError(40103, '登录已过期，请重新登录')
  }
  const resp = await fetch(`${config.baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: auth.refreshToken }),
  })
  let env = null
  try {
    env = await resp.json()
  } catch {
    throw new ApiError(-1, '网络异常，请稍后重试')
  }
  if (env?.code === 0 && env.data?.accessToken) {
    saveAuth({ ...auth, ...env.data })
    return env.data
  }
  clearAuth()
  config.onUnauthorized?.()
  throw new ApiError(env?.code ?? 40103, env?.data?.error || env?.message || '登录已过期，请重新登录')
}

export function ensureRefreshed() {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

/* ---------------- 请求核心 ---------------- */

function buildUrl(path, params) {
  let url = `${config.baseUrl}${path}`
  if (params) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue
      qs.append(k, v)
    }
    const s = qs.toString()
    if (s) url += `${url.includes('?') ? '&' : '?'}${s}`
  }
  return url
}

async function rawRequest(method, path, { params, body } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getAccessToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let resp
  try {
    resp = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(-1, '网络异常，请检查网络连接')
  }

  let env = null
  const text = await resp.text()
  if (text) {
    try {
      env = JSON.parse(text)
    } catch {
      env = null
    }
  }
  if (!env || typeof env.code !== 'number') {
    if (resp.ok) return null
    throw new ApiError(resp.status === 404 ? 40400 : -1, `请求失败（HTTP ${resp.status}）`)
  }
  if (env.code === 0) return env.data
  throw new ApiError(env.code, env.data?.error || env.message, env.data, env.traceId)
}

export async function request(method, path, opts = {}) {
  try {
    return await rawRequest(method, path, opts)
  } catch (err) {
    if (isCode(err, 40101)) {
      await ensureRefreshed()
      return rawRequest(method, path, opts)
    }
    if (isCode(err, 40100)) {
      clearAuth()
      config.onUnauthorized?.()
    }
    throw err
  }
}

export const http = {
  get: (path, params) => request('GET', path, { params }),
  post: (path, body, params) => request('POST', path, { body, params }),
  put: (path, body) => request('PUT', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  delete: (path) => request('DELETE', path, {}),
}

export function apiBaseUrl() {
  return config.baseUrl
}
