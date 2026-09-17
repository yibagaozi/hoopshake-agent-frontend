/**
 * 版本号。原来「我的」页硬编码成 v1.0，出问题时没法让学生报准版本。
 * 构建时由 vite 注入 __APP_VERSION__（取 package.json 的 version），
 * 开发态没注入就显示 dev。
 */
export const APP_VERSION =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
