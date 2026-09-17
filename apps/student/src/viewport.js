/**
 * 软键盘兜底（主要给 iOS）。
 *
 * 安卓 Chrome 认 index.html 里的 interactive-widget=resizes-content，
 * 键盘弹出时布局视口自己变矮，什么都不用做。
 * iOS Safari 不认：布局视口不变，浏览器改用"滚动页面"来露出输入框，
 * 而我们的 .phone-viewport 是 height:100% + overflow:hidden，没得滚，
 * 结果就是输入条被键盘盖住。
 *
 * 所以这里监听 visualViewport，把可见高度写进 --app-h，
 * .phone-viewport 用它当高度。键盘收起时恢复成 100%。
 */
export function installViewportFix() {
  const vv = window.visualViewport
  if (!vv) return

  const root = document.documentElement
  let raf = 0

  const apply = () => {
    raf = 0
    // 只有明显变矮（>120px）才认定是键盘，避免地址栏收缩之类的小抖动
    const shrunk = window.innerHeight - vv.height > 120
    if (shrunk) {
      root.style.setProperty('--app-h', `${Math.round(vv.height)}px`)
      // iOS 会顺带把页面滚上去一截，滚回来，否则顶部会被裁掉
      if (window.scrollY !== 0) window.scrollTo(0, 0)
    } else {
      root.style.removeProperty('--app-h')
    }
  }

  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(apply)
  }

  vv.addEventListener('resize', schedule)
  vv.addEventListener('scroll', schedule)
  apply()
}
