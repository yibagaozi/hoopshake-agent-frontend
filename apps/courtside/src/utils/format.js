// 展示层格式化

import { actionLabelEn, resolveActionName, resolveCheckpointName } from "@hoopshake/core";

/** 秒 → HH:MM:SS */
export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  return `${h}:${m}:${String(s % 60).padStart(2, "0")}`;
}

/** 秒 → MM:SS，提示流的课堂时刻用短式 */
export function shortClock(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** ISO 时间 → 距今秒数 */
export function since(iso) {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : (Date.now() - t) / 1000;
}

/** ISO 时间 → HH:MM */
export function hhmm(iso) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 取姓名首字作头像字 */
export function initial(name) {
  return (name || "?").trim().charAt(0);
}

/* ---------- 词表 ----------
   中文名统一走 core 的解析器，顺序是：
     1. 随事件带回的 label（cue 的 checkpointLabel、actionFocus 的 actionLabel）
     2. GET /api/meta/vocabulary 拉回来的权威词表
     3. core 里的本地兜底表（断云时用）
     4. 都没有就原样显示 id
   第 1 步有个前提：label 等于 id 时不算「给了名字」——
   edge 目前 actionLabel 回填的就是 actionType，不挡会把 free_throw 显示到大屏上。
   新增兜底条目请改 packages/core/src/enums.js。 */

export const cpName = resolveCheckpointName;
export const actName = resolveActionName;

/** 只有 id、没有 label 的场合（旧调用点）；内部同样走词表 */
export const actionCn = (id) => resolveActionName(null, id);
export const actionEn = actionLabelEn;
export const checkpointCn = (id) => resolveCheckpointName(null, id);

/** 会话状态 → 中文 */
const SESSIONS = {
  IDLE: "空闲",
  READY: "已就绪",
  RECORDING: "上课中",
  PAUSED: "已暂停",
  ENDED: "已下课",
};

export const sessionCn = (state) => SESSIONS[state] || state || "—";

/** 进程状态 → 中文 */
const PROCESSES = {
  STOPPED: "已停止",
  STARTING: "启动中",
  RUNNING: "运行中",
  DEGRADED: "降级",
  STOPPING: "停止中",
  FAILED: "失败",
};

export const processCn = (state) => PROCESSES[state] || state || "—";

/** 采集任务状态 → 中文 */
const ENROLLS = {
  PENDING: "排队中",
  CAPTURING: "采集中",
  UPLOADING: "上传中",
  REGISTERING: "登记中",
  REGISTERED: "已建档",
  FAILED: "失败",
  CANCELLED: "已取消",
};

export const enrollCn = (status) => ENROLLS[status] || status || "—";

/** 字节数 → 可读大小 */
export function bytes(n) {
  if (n == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = Number(n);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 || v >= 100 ? 0 : 1)} ${units[i]}`;
}
