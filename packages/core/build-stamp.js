/**
 * 构建水印。三个应用的 vite.config.js 共用。
 *
 * 做两件事：
 *   1. 往 index.html 的 head 里塞 <meta name="hoopshake-build">，
 *      一条 curl 就能看出容器里跑的是哪个提交：
 *        curl -s http://<主机>:8081/ | grep hoopshake-build
 *   2. 定义 __BUILD_INFO__，让界面上也能显示版本号 —— 不是每个人
 *      都方便去宿主机敲 curl，页面上看得见更直接。
 *
 * 用处很具体：线上少了个新做的功能时，第一个要排除的就是「镜像是不是旧的」。
 * GITHUB_SHA 由 Actions 的 --build-arg 注入；本地构建显示 local。
 */
function info(version) {
  return {
    version,
    sha: (process.env.GITHUB_SHA || '').slice(0, 7) || 'local',
    at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  }
}

export function buildStamp(version) {
  const b = info(version)
  const content = `${b.version}+${b.sha} ${b.at}`
  return {
    name: 'hoopshake-build-stamp',
    config() {
      return { define: { __BUILD_INFO__: JSON.stringify(b) } }
    },
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { name: 'hoopshake-build', content }, injectTo: 'head' }]
    },
  }
}
