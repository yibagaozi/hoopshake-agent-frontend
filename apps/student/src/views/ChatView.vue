<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { errText, fmtFriendly, isCode, renderMarkdown, studentChatApi } from '@hoopshake/core'
import { useAuthStore } from '../stores/auth.js'
import { toast } from '../toast.js'
import TabBar from '../components/TabBar.vue'
import BottomSheet from '../components/BottomSheet.vue'

const router = useRouter()
const auth = useAuthStore()

const sessions = ref([])
const currentId = ref(null)
const messages = ref([]) // { id, role, content, streaming?, interrupted?, tools?: [] }
const input = ref('')
const streaming = ref(false)
const loadingMsgs = ref(false)
const suggestions = ref([])
const notActivated = ref(false)
const historyOpen = ref(false)
const listEl = ref(null)
const inputFloatEl = ref(null)
/** 消息列表底部留白 = 悬浮输入区高度 + 间距，保证最后一条消息停在输入框上方 */
const listPadBottom = ref(150)

let controller = null
let interruptFallback = null
let inputRO = null

function scrollBottom(smooth = true) {
  nextTick(() => {
    const el = listEl.value
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  })
}

function nearBottom() {
  const el = listEl.value
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 40
}

/**
 * 输入区是浮动的，高度会随「建议问题」一行的出现/消失变化，
 * 所以底部留白得跟着它量。
 * 注意用 padding 而不是占位 div —— .msg-list 是 column flex 容器，
 * 内容溢出时占位 div 会被 flex-shrink 压成 0（最后一条消息因此被压在输入框下面）。
 */
function watchInputHeight() {
  const el = inputFloatEl.value
  if (!el || typeof ResizeObserver === 'undefined') return
  inputRO = new ResizeObserver(() => {
    const stick = nearBottom()
    listPadBottom.value = el.offsetHeight + 12
    if (stick) scrollBottom(false)
  })
  inputRO.observe(el)
}

async function loadSessions() {
  try {
    const page = await studentChatApi.listSessions(0, 50)
    sessions.value = page?.items || []
    return sessions.value
  } catch (err) {
    toast.err(errText(err, '加载会话失败'))
    return []
  }
}

async function loadMessages(sessionId) {
  loadingMsgs.value = true
  messages.value = []
  try {
    const all = []
    let page = 0
    for (;;) {
      const res = await studentChatApi.listMessages(sessionId, page, 100)
      all.push(...(res?.items || []))
      if (!res?.hasNext || page >= 4) break
      page++
    }
    all.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    messages.value = all.map((m) => ({
      id: m.messageId,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    }))
    scrollBottom(false)
  } catch (err) {
    if (isCode(err, 40400)) {
      sessions.value = sessions.value.filter((s) => s.sessionId !== sessionId)
      currentId.value = null
    } else {
      toast.err(errText(err, '加载消息失败'))
    }
  } finally {
    loadingMsgs.value = false
  }
}

async function selectSession(sessionId) {
  if (streaming.value) await stopStreaming()
  currentId.value = sessionId
  suggestions.value = []
  historyOpen.value = false
  await loadMessages(sessionId)
}

async function newSession() {
  if (streaming.value) await stopStreaming()
  historyOpen.value = false
  currentId.value = null
  messages.value = []
  suggestions.value = []
}

async function ensureSession() {
  if (currentId.value) return currentId.value
  const created = await studentChatApi.createSession({})
  currentId.value = created.sessionId
  sessions.value.unshift(created)
  return created.sessionId
}

async function send(text) {
  const content = (text ?? input.value).trim()
  if (!content || streaming.value) return
  input.value = ''
  suggestions.value = []
  notActivated.value = false

  messages.value.push({ id: `u-${Date.now()}`, role: 'USER', content })
  const draft = { id: `a-${Date.now()}`, role: 'ASSISTANT', content: '', streaming: true, tools: [] }
  messages.value.push(draft)
  streaming.value = true
  scrollBottom()

  let sessionId
  try {
    sessionId = await ensureSession()
  } catch (err) {
    streaming.value = false
    messages.value = messages.value.filter((m) => m !== draft)
    toast.err(errText(err, '创建会话失败'))
    return
  }

  controller = new AbortController()
  try {
    await studentChatApi.ask(
      sessionId,
      { content },
      {
        signal: controller.signal,
        onEvent: (event, data) => {
          if (event === 'meta') {
            if (data?.messageId) draft.id = data.messageId
          } else if (event === 'tool') {
            draft.tools.push(data)
            scrollBottom()
          } else if (event === 'delta') {
            draft.content += data?.text || ''
            scrollBottom()
          } else if (event === 'done') {
            draft.streaming = false
            if (data?.finishReason === 'interrupted') draft.interrupted = true
            suggestions.value = data?.suggestions || []
          } else if (event === 'error') {
            draft.streaming = false
            draft.error = true
            toast.err(data?.message || data?.error || 'AI 回复失败')
          }
        },
      }
    )
  } catch (err) {
    draft.error = true
    if (isCode(err, 40311)) {
      notActivated.value = true
    } else if (isCode(err, 42910)) {
      toast.err('今日 AI 用量已用完，请明天再试')
    } else if (isCode(err, 50310)) {
      toast.err('AI 服务暂不可用，请稍后再试')
    } else {
      toast.err(errText(err, '发送失败'))
    }
  } finally {
    draft.streaming = false
    if (!draft.content && !draft.error) draft.content = draft.interrupted ? '（已停止）' : ''
    if (draft.error && !draft.content) messages.value = messages.value.filter((m) => m !== draft)
    streaming.value = false
    controller = null
    clearTimeout(interruptFallback)
    // 会话标题可能已由后端生成，刷新列表
    loadSessions()
    scrollBottom()
  }
}

async function stopStreaming() {
  if (!streaming.value) return
  const sid = currentId.value
  try {
    if (sid) await studentChatApi.interrupt(sid)
  } catch {
    /* 幂等，忽略 */
  }
  // 若服务端 2.5s 内未推 done，则本地断开
  interruptFallback = setTimeout(() => controller?.abort(), 2500)
}

async function removeSession(s) {
  if (!confirm(`删除会话「${s.title || '未命名对话'}」？`)) return
  try {
    await studentChatApi.removeSession(s.sessionId)
    sessions.value = sessions.value.filter((x) => x.sessionId !== s.sessionId)
    if (currentId.value === s.sessionId) newSession()
  } catch (err) {
    toast.err(errText(err))
  }
}

async function renameSession(s) {
  const title = prompt('修改会话标题', s.title || '')
  if (!title || !title.trim()) return
  try {
    const updated = await studentChatApi.rename(s.sessionId, title.trim().slice(0, 64))
    Object.assign(s, updated)
  } catch (err) {
    toast.err(errText(err))
  }
}

onMounted(() => {
  // 默认开一个新对话：只把历史列表拉回来供「对话记录」用，
  // 不自动进入上一次会话（真正的会话在第一次发送时才创建，
  // 见 ensureSession，所以空手进来不会产生垃圾会话）
  loadSessions()
  watchInputHeight()
})

onBeforeUnmount(() => {
  controller?.abort()
  clearTimeout(interruptFallback)
  inputRO?.disconnect()
})
</script>

<template>
  <!-- 头部 -->
  <div class="chat-head">
    <button class="btn-back" @click="router.push('/')">‹</button>
    <div class="head-mid">
      <div class="head-title">AI 教练</div>
      <div class="head-sub"><span class="dot"></span>Skill Coach · 在线</div>
    </div>
    <button class="head-logo" @click="historyOpen = true" title="会话记录">
      <div class="ring"></div>
    </button>
  </div>

  <!-- 消息区 -->
  <div ref="listEl" class="scroll-body msg-list" :style="{ paddingBottom: listPadBottom + 'px' }">
    <div v-if="notActivated" class="act-banner" @click="router.push('/activate')">
      账号尚未激活，暂不能使用 AI 教练。点击去激活 ›
    </div>

    <div v-if="!messages.length && !loadingMsgs" class="greet-wrap">
      <div class="bubble ai">
        你好{{ auth.displayName }}，我是你的 AI 教练。可以问我训练里的任何问题，比如「我最近投篮总是打铁，是哪里出了问题？」
      </div>
    </div>

    <template v-for="(m, i) in messages" :key="m.id">
      <div v-if="i === 0 && m.createdAt" class="time-chip">{{ fmtFriendly(m.createdAt) }}</div>
      <!-- 工具轨迹 -->
      <div v-if="m.tools?.length" class="tool-trace">
        <div v-for="(t, ti) in m.tools" :key="ti" class="tool-line">
          <span class="tool-dot">✓</span>{{ t.label || t.name }}
        </div>
      </div>
      <div class="bubble" :class="m.role === 'USER' ? 'user' : 'ai'">
        <!-- 用户输入按纯文本呈现，避免把自己打的符号解析成格式 -->
        <span v-if="m.role === 'USER'" style="white-space: pre-wrap">{{ m.content }}</span>
        <template v-else>
          <div class="md" v-html="renderMarkdown(m.content)"></div><span v-if="m.streaming" class="caret"></span>
        </template>
        <div v-if="m.interrupted" class="interrupted">已停止生成</div>
      </div>
    </template>

    <div v-if="loadingMsgs" class="empty-hint">加载对话中…</div>
  </div>

  <!-- 悬浮输入区 -->
  <div ref="inputFloatEl" class="input-float">
    <div v-if="suggestions.length" class="sugg-row">
      <button
        v-for="(s, i) in suggestions"
        :key="s"
        class="sugg"
        :class="{ hot: i === 0 }"
        @click="send(s)"
      >
        {{ s }}
      </button>
    </div>
    <div class="input-bar">
      <input
        v-model="input"
        class="real-input"
        :placeholder="messages.length ? '继续问 AI 教练…' : '问问 AI 教练…'"
        maxlength="2000"
        :disabled="streaming"
        @keyup.enter="send()"
      />
      <button v-if="!streaming" class="send-btn" @click="send()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 19V5M12 5l-6 6M12 5l6 6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <button v-else class="send-btn stop" @click="stopStreaming">
        <span class="stop-square"></span>
      </button>
    </div>
  </div>

  <!-- 会话记录 -->
  <BottomSheet :open="historyOpen" title="对话记录" @close="historyOpen = false">
    <button class="new-chat" @click="newSession">＋ 开启新对话</button>
    <div v-if="!sessions.length" class="empty-hint">还没有历史对话</div>
    <div
      v-for="s in sessions"
      :key="s.sessionId"
      class="hist-row"
      :class="{ on: s.sessionId === currentId }"
      @click="selectSession(s.sessionId)"
    >
      <div class="hist-mid">
        <div class="hist-title">{{ s.title || '未命名对话' }}</div>
        <div class="hist-sub">{{ fmtFriendly(s.updatedAt || s.createdAt) }}</div>
      </div>
      <button class="hist-op" @click.stop="renameSession(s)" title="重命名">✎</button>
      <button class="hist-op danger" @click.stop="removeSession(s)" title="删除">×</button>
    </div>
  </BottomSheet>
</template>

<style scoped>
.chat-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 13px;
  padding: calc(env(safe-area-inset-top, 0px) + 14px) 20px 14px;
  background: var(--page);
  z-index: 5;
}
.head-mid {
  flex: 1;
  text-align: center;
}
.head-title {
  font-size: 17px;
  font-weight: 700;
}
.head-sub {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: var(--gray);
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ok);
}
.head-logo {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.head-logo .ring {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2.5px solid #fff;
}
.msg-list {
  padding: 6px 18px 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.act-banner {
  background: var(--warn-bg);
  color: var(--warn);
  font-size: 13px;
  font-weight: 600;
  border-radius: 14px;
  padding: 12px 15px;
  cursor: pointer;
}
.time-chip {
  align-self: center;
  font-size: 12px;
  color: #b0b0ac;
  background: var(--line);
  border-radius: 99px;
  padding: 5px 12px;
}
.bubble {
  max-width: 84%;
  padding: 14px 16px;
  font-size: 15px;
  line-height: 1.55;
}
.bubble.ai {
  align-self: flex-start;
  background: #fff;
  border-radius: 26px 20px 20px 6px;
  color: var(--ink);
}
.bubble.user {
  align-self: flex-end;
  background: var(--brand);
  color: #fff;
  border-radius: 20px 20px 6px 20px;
}
/* 气泡内的 Markdown 排版：紧凑、跟随气泡字号 */
.md {
  font-size: 15px;
  line-height: 1.55;
}
.md :deep(> *:first-child) {
  margin-top: 0;
}
.md :deep(> *:last-child) {
  margin-bottom: 0;
}
.md :deep(p) {
  margin: 0 0 8px;
}
.md :deep(h3),
.md :deep(h4),
.md :deep(h5) {
  font-size: 15px;
  font-weight: 700;
  margin: 12px 0 6px;
}
.md :deep(ul),
.md :deep(ol) {
  margin: 6px 0 8px;
  padding-left: 20px;
}
.md :deep(li) {
  margin: 3px 0;
}
.md :deep(li)::marker {
  color: var(--gray-2);
}
.md :deep(strong) {
  font-weight: 700;
  color: var(--brand-deep);
}
.md :deep(code) {
  font-family: var(--mono);
  font-size: 13px;
  background: var(--fill-2);
  border-radius: 5px;
  padding: 1px 5px;
}
.md :deep(pre) {
  background: var(--fill);
  border-radius: 12px;
  padding: 11px 13px;
  overflow-x: auto;
  margin: 8px 0;
}
.md :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 12.5px;
  line-height: 1.5;
}
.md :deep(blockquote) {
  margin: 8px 0;
  padding: 2px 0 2px 11px;
  border-left: 3px solid var(--line-2);
  color: var(--ink-3);
}
.md :deep(a) {
  color: var(--brand-deep);
  text-decoration: underline;
}
.caret {
  display: inline-block;
  width: 2px;
  height: 16px;
  background: var(--brand);
  vertical-align: -3px;
  margin-left: 2px;
  animation: caret 1s step-end infinite;
}
.interrupted {
  margin-top: 8px;
  font-size: 12px;
  color: var(--gray-2);
}
.tool-trace {
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 2px 0 -6px 2px;
}
.tool-line {
  display: flex;
  align-items: center;
  gap: 9px;
  font: 500 12px/1 var(--mono);
  color: var(--gray);
}
.tool-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--ok);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}
.greet-wrap {
  display: flex;
}
.input-float {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 14px 16px calc(env(safe-area-inset-bottom, 0px) + 14px);
  z-index: 15;
  pointer-events: none;
}
.input-float > * {
  pointer-events: auto;
}
.sugg-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  padding-left: 18px;
  overflow-x: auto;
  scrollbar-width: none;
}
.sugg-row::-webkit-scrollbar {
  display: none;
}
.sugg {
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-2);
  background: #fff;
  border-radius: 99px;
  padding: 9px 15px;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
}
.sugg.hot {
  color: var(--brand-deep);
  font-weight: 600;
}
.input-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border-radius: 99px;
  padding: 7px 7px 7px 20px;
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.06);
}
.real-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 15px;
  color: var(--ink);
  background: transparent;
  min-width: 0;
}
.real-input::placeholder {
  color: var(--gray-2);
}
.send-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.send-btn.stop {
  background: var(--ink);
}
.stop-square {
  width: 13px;
  height: 13px;
  border-radius: 3px;
  background: #fff;
}
.new-chat {
  width: 100%;
  height: 50px;
  border-radius: 16px;
  background: var(--brand);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 14px;
  box-shadow: 0 6px 16px var(--brand-glow);
}
.hist-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border-radius: 18px;
  padding: 14px 16px;
  margin-bottom: 9px;
  cursor: pointer;
}
.hist-row.on {
  background: var(--brand-soft);
}
.hist-mid {
  flex: 1;
  min-width: 0;
}
.hist-title {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hist-sub {
  font-size: 12px;
  color: var(--gray-2);
  margin-top: 3px;
}
.hist-op {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--fill);
  color: var(--gray);
  font-size: 14px;
  flex: none;
}
.hist-op.danger {
  color: var(--danger);
  font-size: 18px;
}
</style>
