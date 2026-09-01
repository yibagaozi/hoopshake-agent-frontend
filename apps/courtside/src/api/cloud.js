// 云端接口：教师登录、注册、列课。由操作台浏览器直连，不经 edge。

import { request } from "./http.js";

const LS_BASE = "hoopshake.cloudBaseUrl";

/** 云端地址：优先本地覆盖，其次构建期环境变量 */
export function cloudBaseUrl() {
  const saved = localStorage.getItem(LS_BASE);
  const fallback = import.meta.env.VITE_CLOUD_BASE_URL || "";
  return (saved || fallback).replace(/\/+$/, "");
}

export function setCloudBaseUrl(url) {
  localStorage.setItem(LS_BASE, (url || "").trim().replace(/\/+$/, ""));
}

/**
 * 云端请求地址。
 *
 * 不配绝对地址时走**相对路径**，由本机 nginx 反代到云端（见 docker/edge.nginx.conf.template
 * 的 CLOUD_ORIGIN）。这样浏览器只跟本服务同源通信，云端不必为场边开 CORS，
 * 也不存在 HTTPS 页面请求 HTTP 接口的混合内容问题。
 *
 * 现场排障时仍可在登录页手填一个绝对地址临时覆盖（存 localStorage），
 * 那种情况下才需要云端放行 CORS。
 */
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

/** 本教师名下待上 / 进行中的课 */
export async function listLessons(token, status = "PLANNED,ONGOING") {
  const data = await request(
    url(`/api/teacher/lessons?status=${encodeURIComponent(status)}`),
    { token },
  );
  // 云端可能返回裸数组或分页包裹，两种都接
  if (Array.isArray(data)) return data;
  return data?.items || data?.records || data?.content || [];
}
