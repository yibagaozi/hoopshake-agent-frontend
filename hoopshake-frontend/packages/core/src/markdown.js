/**
 * 极简 Markdown → 安全 HTML
 *
 * 覆盖 AI 回复里实际会用到的语法：标题、有序/无序列表、加粗、斜体、
 * 行内代码、代码块、引用、链接、段落内换行。
 *
 * 安全性：不接受任何原始 HTML —— 块级结构在**原文**上识别，文本内容
 * 一律先 esc() 再拼接标签；链接只放行 http/https。因此后端或模型返回
 * 的内容无法注入脚本。
 *
 * 注意：转义必须发生在块级解析之后，否则 `>` 会变成 `&gt;` 导致引用块
 * 匹配不到（这是重写前踩过的坑）。
 */

function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 转义 + 行内标记 */
function inline(raw) {
  return (
    esc(raw)
      // 行内代码先处理，避免其中的 * 被当作强调
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      // [文字](链接)：只放行 http/https
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, text, href) => {
        const url = href.replace(/&amp;/g, '&')
        return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`
      })
  )
}

const RE_HEADING = /^(#{1,4})\s+(.*)$/
const RE_UL = /^[-*•]\s+(.*)$/
const RE_OL = /^(\d+)[.、)]\s+(.*)$/
const RE_QUOTE = /^>\s?(.*)$/
const RE_FENCE = /^```/

export function renderMarkdown(md) {
  if (!md) return ''
  const lines = String(md).split(/\r?\n/)
  const out = []

  let list = null // 'ul' | 'ol'
  let para = []
  let quote = []
  let fence = null

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`)
      list = null
    }
  }
  const closePara = () => {
    if (para.length) {
      out.push(`<p>${para.map(inline).join('<br>')}</p>`)
      para = []
    }
  }
  const closeQuote = () => {
    if (quote.length) {
      out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`)
      quote = []
    }
  }
  const closeAll = () => {
    closePara()
    closeList()
    closeQuote()
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')

    // 代码块内容整段保留（流式时可能还没收到收尾 ```，末尾兜底闭合）
    if (fence !== null) {
      if (RE_FENCE.test(line.trim())) {
        out.push(`<pre><code>${esc(fence.join('\n'))}</code></pre>`)
        fence = null
      } else {
        fence.push(line)
      }
      continue
    }
    if (RE_FENCE.test(line.trim())) {
      closeAll()
      fence = []
      continue
    }

    const t = line.trim()
    if (!t) {
      closeAll()
      continue
    }

    const h = t.match(RE_HEADING)
    if (h) {
      closeAll()
      const lv = Math.min(h[1].length + 2, 5) // # → h3，不抢正文标题层级
      out.push(`<h${lv}>${inline(h[2])}</h${lv}>`)
      continue
    }

    const q = t.match(RE_QUOTE)
    if (q) {
      closePara()
      closeList()
      quote.push(q[1])
      continue
    }
    closeQuote()

    const ol = t.match(RE_OL)
    if (ol) {
      closePara()
      if (list !== 'ol') {
        closeList()
        out.push('<ol>')
        list = 'ol'
      }
      out.push(`<li>${inline(ol[2])}</li>`)
      continue
    }

    const ul = t.match(RE_UL)
    if (ul) {
      closePara()
      if (list !== 'ul') {
        closeList()
        out.push('<ul>')
        list = 'ul'
      }
      out.push(`<li>${inline(ul[1])}</li>`)
      continue
    }

    closeList()
    para.push(t)
  }

  if (fence !== null) out.push(`<pre><code>${esc(fence.join('\n'))}</code></pre>`)
  closeAll()
  return out.join('\n')
}
