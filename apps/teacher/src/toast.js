import { reactive } from 'vue'

export const toasts = reactive([])

let seq = 0

export function toast(text, type = 'info', duration = 2600) {
  const id = ++seq
  toasts.push({ id, text, type })
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id)
    if (i >= 0) toasts.splice(i, 1)
  }, duration)
}

toast.ok = (text) => toast(text, 'ok')
toast.err = (text) => toast(text, 'err', 3400)
