// 展示层格式化

import { actionLabel, actionLabelEn, checkpointLabel } from "@hoopshake/core";

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
   中文名的**第一来源是 edge**：cue 带 checkpointLabel、actionFocus 带 actionLabel，
   那是规则引擎按 checkpoints.yaml 直接下发的，和现场算法配置永远一致。
   @hoopshake/core 里的映射表只做兜底 —— 字段缺失时才用，顺带保证同一个 id
   在场边和云端（学生端/教师端）显示成同一个名字。
   新增兜底条目请改 packages/core/src/enums.js。 */

export const actionCn = actionLabel;
export const actionEn = actionLabelEn;
export const checkpointCn = checkpointLabel;

/** 检查点名：后端给了就用后端的，没给才查本地表 */
export const cpName = (label, id) => label || checkpointLabel(id);

/** 动作名：同上 */
export const actName = (label, type) => label || actionLabel(type);

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
