// 统一请求封装。两端响应同构：{ code, message, data, traceId, timestamp }，code=0 为成功。

/** 业务错误码，与后端 EdgeErrorCode / ErrorCode 对齐 */
export const ErrorCode = {
  PARAM_INVALID: 40000,
  UNAUTHORIZED: 40100,
  NOT_FOUND: 40400,
  STATE_CONFLICT: 40910,
  CV_STATE_CONFLICT: 40911,
  CLOUD_UNREACHABLE: 50320,
  CV_UNAVAILABLE: 50330,
  FFMPEG_UNAVAILABLE: 50340,
};

export class ApiError extends Error {
  constructor(code, message, info) {
    super(message || `请求失败（${code}）`);
    this.name = "ApiError";
    this.code = code;
    this.info = info ?? null;
  }

  /** code=0 表示连不上服务，区别于业务错误 */
  get offline() {
    return this.code === 0;
  }
}

export async function request(url, { method = "GET", body, token } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "无法连接服务，请检查网络或服务是否启动");
  }

  let envelope = null;
  try {
    envelope = await res.json();
  } catch {
    // 空响应体按成功处理
  }

  if (!envelope) {
    if (res.ok) return null;
    throw new ApiError(res.status, `HTTP ${res.status}`);
  }
  if (envelope.code !== 0) {
    throw new ApiError(envelope.code, envelope.message, envelope.data);
  }
  return envelope.data;
}
