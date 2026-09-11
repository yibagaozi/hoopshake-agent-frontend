/**
 * 分页响应归一化。
 *
 * 文档（cloud-frontend-api §0）约定分页端点的 data 为
 *   PageResponse{ content[], page, size, total, totalPages }
 * 早期实现按 { items[], page, hasNext } 读，两种字段名在不同端点上都出现过。
 * 这里两种都接：字段名对不上时整页会静默空白，那种故障很难排查，
 * 多几行容错比在每个视图里猜字段名划算。
 *
 * 也接受后端直接返回裸数组的情况（少数非分页列表端点）。
 */
export function normalizePage(data) {
  const empty = { content: [], page: 0, size: 0, total: 0, totalPages: 0, hasNext: false }
  if (!data) return empty

  if (Array.isArray(data)) {
    return { content: data, page: 0, size: data.length, total: data.length, totalPages: 1, hasNext: false }
  }

  const content = data.content ?? data.items ?? data.records ?? []
  if (!Array.isArray(content)) return empty

  const page = Number(data.page ?? 0)
  const size = Number(data.size ?? content.length)
  // totalElements 是 Spring Data 的原生名，后端若直接序列化 Page 会是它
  const total = Number(data.total ?? data.totalElements ?? content.length)
  const totalPages = Number(data.totalPages ?? (size > 0 ? Math.ceil(total / size) : 0))
  const hasNext = data.hasNext ?? (totalPages > 0 ? page + 1 < totalPages : false)

  return { content, page, size, total, totalPages, hasNext: !!hasNext }
}

/** 只要列表时的快捷方式 */
export function pageItems(data) {
  return normalizePage(data).content
}
