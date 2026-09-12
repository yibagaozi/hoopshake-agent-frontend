// 统一请求封装。两端响应同构：{ code, message, data, traceId, timestamp }，code=0 为成功。

/** 业务错误码，与 edge-frontend-api §0 对齐（通用码同 cloud） */
export const ErrorCode = {
  PARAM_INVALID: 40000,
  UNAUTHORIZED: 40100,
  NOT_FOUND: 40400,
  STATE_CONFLICT: 40910,
  // edge 特有
  CV_STATE_CONFLICT: 40911,
  NO_LESSON: 40912,
  ROSTER_NOT_SYNCED: 40913,
  STUDENT_NO_FEATURE: 40914,
  HANDOFF_MISSING: 40915,
  CLOUD_REJECTED: 50200,
  CLOUD_UNREACHABLE: 50320,
  CV_UNAVAILABLE: 50330,
  BATCH_UNAVAILABLE: 50331,
  FFMPEG_UNAVAILABLE: 50340,
  CAMERA_OFFLINE: 50341,
  MEDIAMTX_NOT_READY: 50350,
  DISK_LOW: 50700,
  OBJECT_STORAGE_FAILED: 50701,
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

/**
 * 错误枚举名 → 文案。
 * 新一批接口（采集/绑定）的文档是按 data.error 的**枚举名**描述的，
 * 而不是数字码，所以这里按名字兜一层；数字码那套还在下面，两者都查。
 */
export const ERROR_TEXT_BY_NAME = {
  PARAM_INVALID: "参数有误，请检查输入",
  ENROLL_BUSY: "已经有一轮采集在跑，等它结束再开始",
  ENROLL_UNAVAILABLE: "这台场边主机没配采集编排，请联系运维",
  ROSTER_NOT_LOADED: "还没拉参课名单，先同步一次名单再操作",
  NOT_FOUND: "没有找到对应的数据",
};

/** 取后端给的错误枚举名（信封 data.error），拿不到返回空串 */
export function edgeErrorName(err) {
  return (err instanceof ApiError && err.info?.error) || "";
}

/** 错误码 → 现场能看懂的文案。没登记的落到后端 message */
export const ERROR_TEXT = {
  [ErrorCode.PARAM_INVALID]: "参数有误，请检查输入",
  [ErrorCode.UNAUTHORIZED]: "请先登录",
  [ErrorCode.NOT_FOUND]: "内容不存在",
  [ErrorCode.STATE_CONFLICT]: "当前状态不允许此操作",
  [ErrorCode.CV_STATE_CONFLICT]: "算法通道状态冲突，请稍后重试",
  [ErrorCode.NO_LESSON]: "尚未选课，请先选择本节课",
  [ErrorCode.ROSTER_NOT_SYNCED]: "名单还没拉取，请先同步名单",
  [ErrorCode.STUDENT_NO_FEATURE]: "该学生还没有人脸特征，需要先现场注册",
  [ErrorCode.HANDOFF_MISSING]: "交接文件还没生成，请先跑一次批处理",
  [ErrorCode.CLOUD_REJECTED]: "云端拒绝了这次请求",
  [ErrorCode.CLOUD_UNREACHABLE]: "连不上云端，请检查网络",
  [ErrorCode.CV_UNAVAILABLE]: "算法服务不可用",
  [ErrorCode.BATCH_UNAVAILABLE]: "批处理编排未启用，无法在本机跑算法",
  [ErrorCode.FFMPEG_UNAVAILABLE]: "录制组件不可用（ffmpeg）",
  [ErrorCode.CAMERA_OFFLINE]: "机位离线，请检查采集卡与线缆",
  [ErrorCode.MEDIAMTX_NOT_READY]: "流媒体服务未就绪（mediamtx）",
  [ErrorCode.DISK_LOW]: "磁盘空间不足，请清理后重试",
  [ErrorCode.OBJECT_STORAGE_FAILED]: "对象存储写入失败",
};

/** 把任意错误转成可展示文案：先按枚举名，再按数字码，最后落到后端 message */
export function edgeErrText(err, fallback = "操作失败，请稍后重试") {
  if (err instanceof ApiError) {
    if (err.offline) return err.message;
    return (
      ERROR_TEXT_BY_NAME[edgeErrorName(err)] || ERROR_TEXT[err.code] || err.message || fallback
    );
  }
  return err?.message || fallback;
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
