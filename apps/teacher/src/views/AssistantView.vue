<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  errText,
  fmtFriendly,
  isCode,
  normalizePage,
  pageItems,
  renderMarkdown,
  teacherChatApi,
} from '@hoopshake/core'
import { toast } from '../toast.js'

const sessions = ref([])
const currentId = ref(null)
const messages = ref([]) // { id, role, content, streaming?, tools?: [] }
const input = ref('')
const streaming = ref(false)
const loadingMsgs = ref(false)
const suggestions = ref([])
const bodyEl = ref(null)

let controller = null

/**
 * 会话区那一栏的标题。
 *
 * 原来这里重复写着「教学助手」—— 页头刚说过一遍，隔 60 像素再说一遍，
 * 占着整页唯一能显示「我现在开的是哪个会话」的位置什么也没说。
 * 改成当前会话名，助手身份留在下面那行副标题里（带状态点的那行）。
 */
const convTitle = computed(() => {
  if (!currentId.value) return '新对话'
  const s = sessions.value.find((x) => x.sessionId === currentId.value)
  return s?.title || '未命名对话'
})

function scrollBottom(smooth = true) {
  nextTick(() => {
    const el = bodyEl.value
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  })
}

async function loadSessions() {
  try {
    sessions.value = pageItems(await teacherChatApi.listSessions(0, 50))
  } catch (err) {
    toast.err(errText(err, '加载会话失败'))
  }
  return sessions.value
}

async function loadMessages(sessionId) {
  loadingMsgs.value = true
  messages.value = []
  try {
    const all = []
    let page = 0
    for (;;) {
      const res = normalizePage(await teacherChatApi.listMessages(sessionId, page, 100))
      all.push(...res.content)
      if (!res.hasNext || page >= 4) break
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
  if (streaming.value) return
  currentId.value = sessionId
  suggestions.value = []
  await loadMessages(sessionId)
}

function newSession() {
  if (streaming.value) return
  currentId.value = null
  messages.value = []
  suggestions.value = []
}

/** 会话在第一次发送时才建，空手点「新建对话」不会留下垃圾会话 */
async function ensureSession() {
  if (currentId.value) return currentId.value
  const created = await teacherChatApi.createSession({})
  currentId.value = created.sessionId
  sessions.value.unshift(created)
  return created.sessionId
}

async function send(text) {
  const content = (text ?? input.value).trim()
  if (!content || streaming.value) return
  input.value = ''
  suggestions.value = []

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
    await teacherChatApi.ask(
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
            suggestions.value = data?.suggestions || []
          } else if (event === 'error') {
            draft.streaming = false
            draft.error = true
            toast.err(data?.message || data?.error || 'AI 回复失败')
          }
          // rag / assist：教师端不展示，忽略
        },
      }
    )
  } catch (err) {
    draft.error = true
    if (isCode(err, 42910)) toast.err('今日 AI 用量已用完，请明天再试')
    else if (isCode(err, 50310)) toast.err('AI 服务暂不可用，请稍后再试')
    else toast.err(errText(err, '发送失败'))
  } finally {
    draft.streaming = false
    if (draft.error && !draft.content) messages.value = messages.value.filter((m) => m !== draft)
    streaming.value = false
    controller = null
    loadSessions()
    scrollBottom()
  }
}

async function removeSession(s) {
  if (!confirm(`删除会话「${s.title || '未命名对话'}」？`)) return
  try {
    await teacherChatApi.removeSession(s.sessionId)
    sessions.value = sessions.value.filter((x) => x.sessionId !== s.sessionId)
    if (currentId.value === s.sessionId) newSession()
  } catch (err) {
    toast.err(errText(err))
  }
}

onMounted(loadSessions)
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div>
        <div class="head-title-row">
          <h2 class="page-title">教学助手</h2>
        </div>
        <p class="page-sub">向助手提问、检索知识库，并基于本班课堂数据做多人分析</p>
      </div>
    </div>

    <div class="content" style="padding: 0; display: flex; overflow: hidden">
      <!-- 会话列表 -->
      <div class="threads">
        <div class="th-head">
          <div style="font-size: 19px; font-weight: 700; letter-spacing: -0.02em">对话</div>
        </div>
        <button class="new-btn" :disabled="streaming" @click="newSession">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <line x1="12" y1="5" x2="12" y2="19" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
            <line x1="5" y1="12" x2="19" y2="12" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
          </svg>
          新建对话
        </button>
        <div class="th-list">
          <div v-if="!sessions.length" class="th-empty">还没有历史对话</div>
          <div
            v-for="s in sessions"
            :key="s.sessionId"
            class="th-row"
            :class="{ on: s.sessionId === currentId }"
            @click="selectSession(s.sessionId)"
          >
            <div class="th-mid">
              <div class="tt">{{ s.title || '未命名对话' }}</div>
              <div class="ts">{{ fmtFriendly(s.updatedAt || s.createdAt) }}</div>
            </div>
            <button class="th-del" title="删除" @click.stop="removeSession(s)">×</button>
          </div>
        </div>
      </div>

      <!-- 会话区 -->
      <div class="conv">
        <div class="conv-head">
          <span class="logo"><span class="ring"></span></span>
          <div>
            <div class="conv-title">{{ convTitle }}</div>
            <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--gray)">
              <span class="live-dot"></span>
              Teaching Agent · 检索备课知识库
            </div>
          </div>
        </div>

        <div ref="bodyEl" class="conv-body">
          <div v-if="!messages.length && !loadingMsgs" class="greet">
            <div class="bubble ai">
              你好，我是教学助手。可以基于本班课堂数据帮你分析共性问题、设计纠正练习或起草讲解稿。
            </div>
          </div>

          <template v-for="m in messages" :key="m.id">
            <div v-if="m.tools?.length" class="tool-trace">
              <div v-for="(t, ti) in m.tools" :key="ti" class="tool-line">
                <span class="tool-dot">✓</span>{{ t.label || t.name }}
              </div>
            </div>
            <div class="bubble" :class="m.role === 'USER' ? 'user' : 'ai'">
              <span v-if="m.role === 'USER'" style="white-space: pre-wrap">{{ m.content }}</span>
              <template v-else>
                <div class="md" v-html="renderMarkdown(m.content)"></div><span v-if="m.streaming" class="caret"></span>
              </template>
            </div>
          </template>

          <div v-if="loadingMsgs" class="th-empty">加载对话中…</div>
        </div>

        <div v-if="suggestions.length" class="sugg-row">
          <button v-for="s in suggestions" :key="s" class="sugg" @click="send(s)">{{ s }}</button>
        </div>

        <div class="conv-input">
          <input
            v-model="input"
            :placeholder="messages.length ? '继续问教学助手…' : '向教学助手提问，或让它帮你备课…'"
            maxlength="2000"
            :disabled="streaming"
            @keyup.enter="send()"
          />
          <button class="send" :disabled="streaming" @click="send()">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path d="M12 19V5M12 5l-6 6M12 5l6 6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.conv-title {
  font-size: 16px;
  font-weight: 700;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.threads {
  width: 288px;
  flex: none;
  background: #fff;
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.th-head {
  padding: 24px 22px 16px;
}
.new-btn {
  margin: 0 22px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: var(--brand);
  border-radius: 14px;
  padding: 12px 16px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  box-shadow: 0 5px 14px var(--brand-glow);
}
.new-btn:disabled {
  opacity: 0.55;
}
.th-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.th-empty {
  padding: 18px 15px;
  font-size: 13px;
  color: var(--gray-2);
  text-align: center;
}
.th-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 15px;
  border-radius: 14px;
  cursor: pointer;
}
.th-row:hover {
  background: var(--fill);
}
.th-row.on {
  background: var(--brand-soft);
}
.th-mid {
  flex: 1;
  min-width: 0;
}
.th-del {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  color: var(--gray-2);
  font-size: 18px;
  line-height: 1;
}
.th-del:hover {
  background: var(--danger-bg);
  color: var(--danger);
}
.tt {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ts {
  font-size: 13px;
  color: var(--gray-2);
  margin-top: 4px;
}
.conv {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--bg);
}
.conv-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 30px;
  background: #fff;
  border-bottom: 1px solid var(--line);
}
.logo {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
}
.logo .ring {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2.2px solid #fff;
}
.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ok);
}
.conv-body {
  flex: 1;
  overflow-y: auto;
  padding: 26px 30px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.greet {
  display: flex;
}
.bubble {
  max-width: 76%;
  padding: 14px 17px;
  font-size: 15px;
  line-height: 1.6;
}
.bubble.ai {
  align-self: flex-start;
  background: #fff;
  color: var(--ink);
  border-radius: 22px 20px 20px 6px;
}
.bubble.user {
  align-self: flex-end;
  background: var(--brand);
  color: #fff;
  border-radius: 20px 20px 6px 20px;
}
/* 气泡内的 Markdown 排版：与学生端同一套，紧凑、跟随气泡字号 */
.md {
  font-size: 15px;
  line-height: 1.6;
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
  height: 15px;
  margin-left: 2px;
  background: var(--brand);
  vertical-align: -2px;
  animation: blink 1s steps(2, start) infinite;
}
@keyframes blink {
  to {
    visibility: hidden;
  }
}
.tool-trace {
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
  color: var(--gray);
}
.tool-line {
  display: flex;
  align-items: center;
  gap: 7px;
}
.tool-dot {
  color: var(--ok);
  font-weight: 700;
}
.sugg-row {
  flex: none;
  display: flex;
  gap: 8px;
  margin: 0 30px 12px;
  overflow-x: auto;
}
.sugg {
  flex: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-2);
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 99px;
  padding: 9px 15px;
  white-space: nowrap;
}
.sugg:hover {
  border-color: var(--brand);
  color: var(--brand-deep);
}
.conv-input {
  flex: none;
  margin: 0 30px 26px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-radius: 26px;
  padding: 12px 12px 12px 20px;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.05);
}
.conv-input input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 15px;
  background: transparent;
  color: var(--ink);
}
.conv-input input::placeholder {
  color: var(--gray-2);
}
.send {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.send:disabled {
  opacity: 0.55;
}
</style>
