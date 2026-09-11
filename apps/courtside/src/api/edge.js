// 场边主机本机接口。页面由 edge 托管，用同源相对路径，开发时由 vite 代理转发。

import { request } from "./http.js";

const BASE = "/local";

const get = (path) => request(`${BASE}${path}`);
const post = (path, body) => request(`${BASE}${path}`, { method: "POST", body: body ?? {} });
const del = (path) => request(`${BASE}${path}`, { method: "DELETE" });

/* ---------- 状态快照 ---------- */

/** 首屏与轮询都用它：课程 / 会话 / 机位 / 采集 / 磁盘 一次返回 */
export const getState = () => get("/state");

/** 重启采集，不传 camId 则四路全部重启 */
export const restartCapture = (camId) =>
  post(`/capture/restart${camId ? `?camId=${encodeURIComponent(camId)}` : ""}`);

/* ---------- 选课 ---------- */

/**
 * 选课。
 * 按 edge-frontend-api §1，请求体只有 {lessonId} —— edge 自己去云端拉课程上下文，
 * 浏览器不再透传 title/actionTypes/enabledCheckpoints 那一串
 * （早期版本是前端透传的，传旧上下文反而可能盖掉 edge 刚拉到的那份）。
 */
export const selectLesson = (lessonId) => post("/lesson/select", { lessonId });

/**
 * 下面两个不在 §1 的端点表里，属于早期版本遗留。
 * 课程与会话的当前值都能从 /local/state 拿到，所以调用方一律走 getState，
 * 这两个只在个别场景兜底，失败按「没有」处理，不要让页面报错。
 */
export const getLesson = () => get("/lesson");
export const clearLesson = () => del("/lesson");

/* ---------- 课堂会话 ---------- */

/** 同上，非文档端点；常规读取请用 getState().session */
export const getSession = () => get("/session");

/** 开始上课，已选课时可不传 lessonId */
export const startSession = (lessonId) =>
  post("/session/start", lessonId ? { lessonId } : {});

export const pauseSession = () => post("/session/pause");
export const resumeSession = () => post("/session/resume");
export const stopSession = () => post("/session/stop");

/** 各路录制进程存活情况 */
export const getSessionHealth = () => get("/session/health");

/* ---------- 名单 ---------- */

/** 本地缓存名单，断网可用。非文档端点，取不到时名单面板留空即可 */
export const getRoster = () => get("/roster");

/** 触发重拉，现场注册完成后调用 */
export const syncRoster = (lessonId) => post("/roster/sync", { lessonId });

/** 按 10 位学号精确匹配 */
export const matchStudent = (studentNo) => post("/roster/match", { studentNo });

/* ---------- 现场注册 ---------- */

/** 开始采集，frames 缺省 5，camId 缺省取主锚点机位 */
export const startEnroll = (payload) => post("/enroll/start", payload);

export const getEnrollProgress = (taskId) => get(`/enroll/${taskId}/progress`);

/* ---------- 录制 ---------- */

export const startRecord = () => post("/record/start");
export const stopRecord = () => post("/record/stop");
export const getRecordStatus = () => get("/record/status");

/** 今日录制记录，dir 缺省取 edge 配置的 data-root */
export const getTodayRecordings = (dir) =>
  get(`/record/today${dir ? `?dir=${encodeURIComponent(dir)}` : ""}`);
