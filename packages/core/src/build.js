/**
 * 构建信息，给界面显示用。值由 vite 的 define 在构建时写死
 * （见 packages/core/build-stamp.js）。开发态没 define 就显示 dev。
 */
const fallback = { version: '0.0.0', sha: 'dev', at: '' }

/* eslint-disable no-undef */
const raw = typeof __BUILD_INFO__ !== 'undefined' ? __BUILD_INFO__ : fallback

export const BUILD = raw

/** 界面上显示的那一小串：版本号 + 提交号 */
export const BUILD_LABEL = `v${raw.version}+${raw.sha}`

/** 鼠标悬停时的完整说明，带构建时间 */
export const BUILD_TITLE = raw.at
  ? `版本 ${raw.version} · 提交 ${raw.sha} · 构建于 ${raw.at}`
  : `版本 ${raw.version} · 本地开发构建`
