import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'

const pkg = createRequire(import.meta.url)('./package.json')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:8080'
  return {
    // 子路径部署：构建时传 VITE_BASE_PATH=/student/ 等；缺省为根路径
    base: env.VITE_BASE_PATH || '/',
    plugins: [vue()],
    // 「我的」页显示的版本号，取 package.json，免得再硬编码成 v1.0
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
