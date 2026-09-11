/**
 * SSE 客户端（基于 fetch，支持 Authorization 头与 POST 请求体）
 * 事件流格式：event:/data: 行，空行分隔；`: ping` 心跳注释自动忽略。
 * 非 2xx 或 JSON 响应视为信封错误；40101 自动刷新并重试一次，
 * 40100/40102/40103 清登录态并跳登录。
 * 事件词表见 cloud-frontend-api §2.1：meta/delta/tool/rag/assist/done/error。
 */
import {
  ApiError,
  apiBaseUrl,
  clearAuth,
  ensureRefreshed,
  getAccessToken,
  isCode,
  onUnauthorized,
} from './http.js'

function parseEventBlock(block, onEvent) {
  let event = 'message'
  const dataLines = []
  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
  }
  if (!dataLines.length && event === 'message') return
  let data = dataLines.join('\n')
  try {
    data = JSON.parse(data)
  } catch {
    /* 保留原始文本 */
  }
  onEvent(event, data)
}

async function openStream(path, { method, body, signal }) {
  const headers = { Accept: 'text/event-stream' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getAccessToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })
}

/**
 * @returns {Promise<{aborted:boolean}>} 流正常/中断结束后 resolve；信封错误抛 ApiError
 */
export async function sseRequest(path, { method = 'POST', body, onEvent, signal, _retried } = {}) {
  let resp
  try {
    resp = await openStream(path, { method, body, signal })
  } catch (err) {
    if (err?.name === 'AbortError') return { aborted: true }
    throw new ApiError(-1, '网络异常，请检查网络连接')
  }

  const ctype = resp.headers.get('content-type') || ''
  if (!resp.ok || !ctype.includes('text/event-stream')) {
    let env = null
    try {
      env = await resp.json()
    } catch {
      /* ignore */
    }
    if (env && typeof env.code === 'number' && env.code !== 0) {
      const err = new ApiError(env.code, env.data?.error || env.message, env.data, env.traceId)
      if (isCode(err, 40101) && !_retried) {
        await ensureRefreshed()
        return sseRequest(path, { method, body, onEvent, signal, _retried: true })
      }
      // 与 http.js 的 request 保持同一套登录态处理，否则 SSE 失效时
      // 页面会一直停在对话页反复报错，不跳登录
      if (isCode(err, 40100) || isCode(err, 40102) || isCode(err, 40103)) {
        clearAuth()
        onUnauthorized()
      }
      throw err
    }
    throw new ApiError(-1, `连接失败（HTTP ${resp.status}）`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let idx
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        parseEventBlock(block, onEvent)
      }
    }
    if (buf.trim()) parseEventBlock(buf, onEvent)
  } catch (err) {
    if (err?.name === 'AbortError') return { aborted: true }
    throw new ApiError(-1, '连接中断，请重试')
  }
  return { aborted: false }
}
