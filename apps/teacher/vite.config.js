import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'
import { buildStamp } from '../../packages/core/build-stamp.js'

const pkg = createRequire(import.meta.url)('./package.json')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:8080'
  return {
    // 子路径部署：构建时传 VITE_BASE_PATH=/student/ 等；缺省为根路径
    base: env.VITE_BASE_PATH || '/',
    plugins: [vue(), buildStamp(pkg.version)],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5174,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
