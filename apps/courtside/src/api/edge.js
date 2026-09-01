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

export const getLesson = () => get("/lesson");

/** 把浏览器从云端拿到的课程配置透传给 edge，同时触发名单下行同步 */
export const selectLesson = (lesson) => post("/lesson/select", lesson);

export const clearLesson = () => del("/lesson");

/* ---------- 课堂会话 ---------- */

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

/** 本地缓存名单，断网可用 */
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
