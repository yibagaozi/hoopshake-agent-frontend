/**
 * 构建水印。三个应用的 vite.config.js 共用。
 *
 * 往 index.html 的 head 里塞一个 <meta name="hoopshake-build">，内容是
 * 版本号 + 提交号 + 构建时间。index.html 是 no-cache 的，所以它永远是
 * 当前容器里那一份。
 *
 * 用处很具体：线上少了个新做的功能时，第一个要排除的就是「镜像是不是旧的」。
 * 有了它，一条 curl 就能回答，不用去猜带 hash 的 chunk 文件名：
 *
 *   curl -s http://<主机>:8081/ | grep hoopshake-build
 *
 * GITHUB_SHA 由 Actions 注入；本地构建时显示 local。
 */
export function buildStamp(version) {
  const sha = (process.env.GITHUB_SHA || '').slice(0, 7) || 'local'
  const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  const content = `${version}+${sha} ${at}`
  return {
    name: 'hoopshake-build-stamp',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { name: 'hoopshake-build', content }, injectTo: 'head' }]
    },
  }
}
