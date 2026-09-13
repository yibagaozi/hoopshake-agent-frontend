// 云端接口：教师登录、注册、列课。由操作台浏览器直连，不经 edge。

import { request } from "./http.js";

/**
 * 云端地址只从**构建期配置**读，页面上不再提供输入框。
 *
 * 常规部署留空：浏览器走相对路径 /api，由本机 nginx 反代到云端
 * （地址在 compose 里给 nginx 的 CLOUD_ORIGIN，见 docker/edge.nginx.conf.template）。
 * 这样浏览器只跟本服务同源通信，云端不必为场边开 CORS，
 * 也不存在 HTTPS 页面请求 HTTP 接口的混合内容问题。
 *
 * 只有不经 nginx、前端直连云端时才需要填 VITE_CLOUD_BASE_URL，那时云端要放行 CORS。
 */
export function cloudBaseUrl() {
  return (import.meta.env.VITE_CLOUD_BASE_URL || "").replace(/\/+$/, "");
}

function url(path) {
  const base = cloudBaseUrl();
  return base ? `${base}${path}` : path;
}

export const login = (identifier, password) =>
  request(url("/api/auth/login"), { method: "POST", body: { identifier, password } });

export const register = (payload) =>
  request(url("/api/auth/register"), { method: "POST", body: payload });

export const refresh = (refreshToken) =>
  request(url("/api/auth/refresh"), { method: "POST", body: { refreshToken } });

export const me = (token) => request(url("/api/auth/me"), { token });

/** 权威词表。任意已登录用户可读，拿回来交给 core 缓存（见 stores/auth.js） */
export const vocabulary = (token) => request(url("/api/meta/vocabulary"), { token });

/** 本教师名下待上 / 进行中的课 */
export async function listLessons(token, status = "PLANNED,ONGOING") {
  const data = await request(
    url(`/api/teacher/lessons?status=${encodeURIComponent(status)}`),
    { token },
  );
  // 云端分页体按文档是 PageResponse{content,...}；早期实现用过 items，
  // 少数端点还会直接给裸数组，三种都接，省得字段名一变整页空白
  if (Array.isArray(data)) return data;
  return data?.content || data?.items || data?.records || [];
}
