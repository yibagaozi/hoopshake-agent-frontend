import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { createRequire } from 'node:module'
import { buildStamp } from '../../packages/core/build-stamp.js'

const pkg = createRequire(import.meta.url)('./package.json')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // 开发时 edge 服务地址。前后端分离部署，生产环境由 nginx 反代同名路径
  const edge = env.VITE_EDGE_ORIGIN || "http://127.0.0.1:8080";

  // 云端地址。留空时前端走相对 /api，开发下由这里代理，生产由 nginx 反代
  const cloud = env.VITE_CLOUD_PROXY_TARGET || "http://127.0.0.1:8080";

  const proxy = {
    // 本机业务接口
    "/local": { target: edge, changeOrigin: true },
    // WebSocket 实时通道
    "/ws": { target: edge, ws: true, changeOrigin: true },
    // 云端接口（登录 / 列课）。VITE_CLOUD_BASE_URL 填了绝对地址时不会走到这里
    "/api": { target: cloud, changeOrigin: true },
  };

  return {
    plugins: [vue(), buildStamp(pkg.version)],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
      host: true,
      port: Number(env.VITE_PORT || 5173),
      proxy,
    },
    preview: {
      host: true,
      port: Number(env.VITE_PREVIEW_PORT || 4173),
      proxy,
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
