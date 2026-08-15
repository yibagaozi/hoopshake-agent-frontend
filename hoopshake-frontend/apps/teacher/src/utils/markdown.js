/** 极简 Markdown 渲染（标题/加粗/斜体/列表/段落），输入先转义，输出安全 HTML */

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function inline(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

export function renderMarkdown(md) {
  if (!md) return ''
  const lines = esc(md).split(/\r?\n/)
  const out = []
  let listOpen = false
  const closeList = () => {
    if (listOpen) {
      out.push('</ul>')
      listOpen = false
    }
  }
  for (const line of lines) {
    const t = line.trim()
    if (!t) {
      closeList()
      continue
    }
    const h = t.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      closeList()
      const lv = Math.min(h[1].length + 2, 5)
      out.push(`<h${lv}>${inline(h[2])}</h${lv}>`)
      continue
    }
    const li = t.match(/^(?:[-*•]|\d+[.、])\s+(.*)$/)
    if (li) {
      if (!listOpen) {
        out.push('<ul>')
        listOpen = true
      }
      out.push(`<li>${inline(li[1])}</li>`)
      continue
    }
    closeList()
    out.push(`<p>${inline(t)}</p>`)
  }
  closeList()
  return out.join('\n')
}
