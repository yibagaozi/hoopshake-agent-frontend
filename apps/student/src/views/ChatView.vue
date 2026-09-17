<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  aiUsageApi,
  errText,
  fmtFriendly,
  isCode,
  isQuotaExhausted,
  normalizePage,
  pageItems,
  renderMarkdown,
  studentChatApi,
  studentHelpApi,
} from '@hoopshake/core'
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
/** SSE 的 assist 事件：多轮未解时后端建议转人工，{show,question,reason} */
const assist = ref(null)
const assistSending = ref(false)
const assistSent = ref(null)
const listEl = ref(null)
const inputFloatEl = ref(null)
/**
 * 上一条发失败/被截断的提问。留着它，学生点「重试」就不用重打一遍。
 * 手机上断流是常态（锁屏、切 4G、进电梯），清空输入框等于每次都罚他重新组织语言。
 */
const retryText = ref('')
/** 正在做断线恢复（重新拉这轮的完整答案） */
const recovering = ref(false)
/** GET /api/me/ai-usage，周配额；exceeded 之后提问会被 42911 挡回 */
const usage = ref(null)
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

const quotaExceeded = computed(() => usage.value?.exceeded === true)
const quotaWarning = computed(() => usage.value?.warning === true && !quotaExceeded.value)

/** 剩余额度那句话，只在接近上限或超限时才出现，平时不打扰 */
const quotaText = computed(() => {
  const u = usage.value
  if (!u) return ''
  if (u.exceeded) return '本周 AI 用量已用完，下周一自动恢复'
  const pct = Math.round((Number(u.ratio) || 0) * 100)
  return `本周 AI 用量已用 ${pct}%，省着点问`
})

async function loadUsage() {
  try {
    usage.value = await aiUsageApi.mine()
  } catch {
    // 配额只是提示，拿不到就不显示，别挡着提问
  }
}

/**
 * finishReason → 气泡下方的那行小字。
 * 后端保证只有这几种；null 是本字段上线前的历史消息，按正常结束处理。
 */
function finishNote(reason) {
  if (reason === 'interrupted') return '已停止生成'
  if (reason === 'error') return '这条回答生成时出错了'
  if (reason === 'truncated') return '回答达到长度上限被截断'
  return ''
}

/**
 * 输入区是浮动的，高度会随「建议问题」一行的出现/消失变化，
 * 所以底部留白得跟着它量。
 * 注意用 padding 而不是占位 div —— .msg-list 是 column flex 容器，
 * 内容溢出时占位 div 会被 flex-shrink 压成 0（最后一条消息因此被压在输入框下面）。
 */
function measurePad() {
  const el = inputFloatEl.value
  const list = listEl.value
  if (!el || !list) return
  // 按几何量：列表底边到输入区顶边的距离。这样不管输入区怎么定位、
  // 底下还压着什么（现在多了个 TabBar），留白都对得上
  const gap = list.getBoundingClientRect().bottom - el.getBoundingClientRect().top
  listPadBottom.value = Math.max(0, Math.round(gap)) + 12
}

function watchInputHeight() {
  const el = inputFloatEl.value
  if (!el || typeof ResizeObserver === 'undefined') return
  inputRO = new ResizeObserver(() => {
    const stick = nearBottom()
    measurePad()
    if (stick) scrollBottom(false)
  })
  inputRO.observe(el)
  measurePad()
}

async function loadSessions() {
  try {
    sessions.value = pageItems(await studentChatApi.listSessions(0, 50))
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
      const res = normalizePage(await studentChatApi.listMessages(sessionId, page, 100))
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
      // 仅 ASSISTANT 有值；null 是字段上线前的历史消息，按 stop 处理
      finishReason: m.finishReason || null,
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
  assist.value = null
  assistSent.value = null
  historyOpen.value = false
  await loadMessages(sessionId)
}

async function newSession() {
  if (streaming.value) await stopStreaming()
  historyOpen.value = false
  currentId.value = null
  messages.value = []
  suggestions.value = []
  assist.value = null
  assistSent.value = null
}

async function ensureSession() {
  if (currentId.value) return currentId.value
  const created = await studentChatApi.createSession({})
  currentId.value = created.sessionId
  sessions.value.unshift(created)
  return created.sessionId
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 断线恢复。
 *
 * 后端确认过：SSE 断开**不会**中止生成，服务端会跑到自然结束并整篇落库。
 * 所以流断了不代表答案没了 —— 重新拉这个会话的消息，按 meta 给的 messageId
 * 把完整那份换回来就行，学生不用重问。
 *
 * finishReason 有值才算生成到了终态；轮询几轮还没有就保留现有内容并标成可重拉。
 */
async function recoverAnswer(sessionId, draft) {
  if (!sessionId || !draft.id || draft.id.startsWith('a-')) return false
  recovering.value = true
  try {
    // 第一次几乎立刻查：服务端多半已经写完了，干等一秒只是白白显示「拉取中」
    for (const wait of [200, 900, 2000, 3500, 5000, 8000]) {
      await sleep(wait)
      let res
      try {
        res = normalizePage(await studentChatApi.listMessages(sessionId, 0, 100))
      } catch {
        continue
      }
      const hit = res.content.find((m) => m.messageId === draft.id)
      if (!hit) continue
      if (hit.content) draft.content = hit.content
      if (hit.finishReason) {
        draft.finishReason = hit.finishReason
        draft.broken = false
        scrollBottom()
        return true
      }
    }
    return false
  } finally {
    recovering.value = false
  }
}

/** 气泡上那颗「重新拉取」：生成还没结束时再试一次 */
async function pullAgain(m) {
  if (recovering.value || !currentId.value) return
  const ok = await recoverAnswer(currentId.value, m)
  if (!ok) toast('还没生成完，过一会儿再试')
}

async function send(text) {
  const content = (text ?? input.value).trim()
  if (!content || streaming.value) return
  if (quotaExceeded.value) {
    toast.err('本周 AI 用量已用完，下周一自动恢复')
    return
  }
  input.value = ''
  retryText.value = ''
  suggestions.value = []
  notActivated.value = false
  assist.value = null

  messages.value.push({ id: `u-${Date.now()}`, role: 'USER', content })
  /*
   * key 是这条草稿的稳定标识，专门用来从列表里删它。
   *
   * 不能用对象引用比：push 进 ref 数组之后，再读出来的是 Vue 的响应式代理，
   * proxy !== 原对象，所以 filter(m => m !== draft) 一条都删不掉 —— 之前
   * 「失败后留下一个空白灰气泡」就是这么来的。id 会被 meta 事件改写成
   * 真正的 messageId，所以另起一个不变的 key。
   */
  const key = `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const draft = { key, id: `a-${Date.now()}`, role: 'ASSISTANT', content: '', streaming: true, tools: [] }
  messages.value.push(draft)
  const dropDraft = () => {
    messages.value = messages.value.filter((m) => m.key !== key)
  }
  streaming.value = true
  scrollBottom()

  let sessionId
  try {
    sessionId = await ensureSession()
  } catch (err) {
    streaming.value = false
    dropDraft()
    retryText.value = content
    toast.err(errText(err, '创建会话失败'))
    return
  }

  controller = new AbortController()
  /** 收到 done/error 事件 = 服务端给了终态 */
  let done = false
  /** 业务错误（未激活/配额/服务不可用），这类重试也没用，直接把问题还给学生 */
  let failed = false
  /** 网络层断了，但服务端还在生成，可以恢复 */
  let netBroke = false
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
          } else if (event === 'assist') {
            // 后端判定多轮没讲清楚，建议转人工；show=false 时不弹
            assist.value = data?.show ? data : null
            if (assist.value) scrollBottom()
          } else if (event === 'done') {
            draft.streaming = false
            done = true
            draft.finishReason = data?.finishReason || 'stop'
            if (draft.finishReason === 'interrupted') draft.interrupted = true
            suggestions.value = data?.suggestions || []
          } else if (event === 'error') {
            draft.streaming = false
            done = true
            draft.error = true
            draft.finishReason = 'error'
            toast.err(data?.message || data?.error || 'AI 回复失败')
          }
        },
      }
    )
  } catch (err) {
    draft.error = true
    failed = true
    if (isCode(err, 40311)) {
      notActivated.value = true
    } else if (isQuotaExhausted(err)) {
      toast.err(errText(err))
      loadUsage()
    } else if (isCode(err, 50310)) {
      toast.err('AI 服务暂不可用，请稍后再试')
    } else {
      // 网络中断走这里（sse.js 抛「连接中断，请重试」），但答案在服务端还在生成，
      // 下面的恢复逻辑会把它拉回来，所以先不弹错
      netBroke = true
    }
  } finally {
    draft.streaming = false
    streaming.value = false
    controller = null
    clearTimeout(interruptFallback)

    /*
     * 流结束但没收到 done —— 服务端崩、代理超时、手机切网都会这样。
     * 以前这里什么都不做：学生看到半句话，和正常回答长得一模一样。
     * 现在先标成「未完成」，再去把服务端那份完整的拉回来。
     */
    if (!done && !failed) {
      draft.broken = true
      const ok = await recoverAnswer(sessionId, draft)
      if (!ok && !draft.content) {
        toast.err('回答没能取回来，点重试重新问一次')
        retryText.value = content
      }
    } else if (netBroke) {
      draft.broken = true
      const ok = await recoverAnswer(sessionId, draft)
      if (!ok) {
        toast.err(draft.content ? '连接中断，这条可能不完整' : '连接中断，请重试')
        if (!draft.content) retryText.value = content
      }
    }

    // 一个字都没有的气泡不留在对话里 —— 空白灰条比没有更让人困惑
    if (!draft.content) {
      dropDraft()
      if (failed) retryText.value = content
    }

    // 会话标题可能已由后端生成，刷新列表
    loadSessions()
    loadUsage()
    scrollBottom()
  }
}

async function requestTeacher() {
  if (assistSending.value || !assist.value) return
  assistSending.value = true
  try {
    const res = await studentHelpApi.create({
      question: assist.value.question || lastUserQuestion(),
      sessionId: currentId.value || undefined,
      reason: assist.value.reason || undefined,
    })
    assistSent.value = res || {}
    assist.value = null
    scrollBottom()
  } catch (err) {
    toast.err(errText(err, '发送失败，请稍后再试'))
  } finally {
    assistSending.value = false
  }
}

/** assist 没带 question 时兜底用最后一条用户提问 */
function lastUserQuestion() {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i].role === 'USER') return messages.value[i].content
  }
  return ''
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

/*
 * 删除/重命名原来用浏览器原生 confirm / prompt。
 * iOS Safari 上那两个弹窗带域名、字体也不是 app 的，和整页设计完全脱节，
 * 而且 prompt 在部分 WebView 里直接被禁掉 —— 换成页内的小面板。
 */
const confirmTarget = ref(null)
const renameTarget = ref(null)
const renameText = ref('')

function askRemove(s) {
  confirmTarget.value = s
}

async function doRemove() {
  const s = confirmTarget.value
  confirmTarget.value = null
  if (!s) return
  try {
    await studentChatApi.removeSession(s.sessionId)
    sessions.value = sessions.value.filter((x) => x.sessionId !== s.sessionId)
    if (currentId.value === s.sessionId) newSession()
  } catch (err) {
    toast.err(errText(err))
  }
}

function askRename(s) {
  renameTarget.value = s
  renameText.value = s.title || ''
}

async function doRename() {
  const s = renameTarget.value
  const title = renameText.value.trim()
  renameTarget.value = null
  if (!s || !title) return
  try {
    const updated = await studentChatApi.rename(s.sessionId, title.slice(0, 64))
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
  loadUsage()
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

    <!-- 周配额。以前只有用完那一刻才知道，现在到 80% 就提前说 -->
    <div v-if="quotaExceeded" class="quota-banner over">{{ quotaText }}</div>
    <div v-else-if="quotaWarning" class="quota-banner">{{ quotaText }}</div>

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
        <!-- 截断/中断/出错都在气泡里明说，不能和正常回答长一个样 -->
        <div v-if="m.broken" class="bub-note broken">
          回答可能不完整
          <button class="bub-act" :disabled="recovering" @click="pullAgain(m)">
            {{ recovering ? '拉取中…' : '重新拉取' }}
          </button>
        </div>
        <div v-else-if="finishNote(m.finishReason)" class="bub-note">
          {{ finishNote(m.finishReason) }}
        </div>
      </div>
    </template>

    <!-- 发失败了就把问题还给学生，别让他重打一遍 -->
    <div v-if="retryText" class="retry-card">
      <div class="rc-q">{{ retryText }}</div>
      <div class="rc-b">
        <button class="rc-btn ghost" @click="retryText = ''">算了</button>
        <button class="rc-btn" :disabled="streaming" @click="send(retryText)">重新发送</button>
      </div>
    </div>

    <!-- SSE assist 事件：建议转人工 -->
    <div v-if="assist" class="assist-card">
      <div class="assist-top">
        <span class="assist-ic">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="7.5" r="3.4" stroke="currentColor" stroke-width="1.9" />
            <path d="M5.5 20c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
          </svg>
        </span>
        <div>
          <div class="assist-t">需要老师进一步指导？</div>
          <div class="assist-s">{{ assist.reason || '把这段对话与你的动作数据一并发给老师，下次课重点帮你纠正。' }}</div>
        </div>
      </div>
      <button class="assist-btn" :disabled="assistSending" @click="requestTeacher">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" stroke="#fff" stroke-width="1.9" stroke-linejoin="round" />
        </svg>
        {{ assistSending ? '发送中…' : '请求老师当面指导' }}
      </button>
    </div>

    <div v-if="assistSent" class="assist-done">
      <span class="assist-dot"></span>
      已发送给 {{ assistSent.teacherName || '任课' }} 老师 · 下次课重点关注
    </div>

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
        :placeholder="
          quotaExceeded
            ? '本周用量已用完，下周一恢复'
            : messages.length
              ? '继续问 AI 教练…'
              : '问问 AI 教练…'
        "
        maxlength="2000"
        :disabled="streaming || quotaExceeded"
        @keyup.enter="send()"
      />
      <button v-if="!streaming" class="send-btn" :disabled="quotaExceeded" @click="send()">
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
      <button class="hist-op" @click.stop="askRename(s)" title="重命名">✎</button>
      <button class="hist-op danger" @click.stop="askRemove(s)" title="删除">×</button>
    </div>
  </BottomSheet>

  <!-- 删除确认 -->
  <BottomSheet :open="!!confirmTarget" title="删除这段对话？" @close="confirmTarget = null">
    <div class="sheet-q">「{{ confirmTarget?.title || '未命名对话' }}」删了就找不回来了。</div>
    <div class="sheet-b">
      <button class="sh-btn ghost" @click="confirmTarget = null">取消</button>
      <button class="sh-btn danger" @click="doRemove">删除</button>
    </div>
  </BottomSheet>

  <!-- 重命名 -->
  <BottomSheet :open="!!renameTarget" title="修改标题" @close="renameTarget = null">
    <input
      v-model="renameText"
      class="sheet-input"
      maxlength="64"
      placeholder="给这段对话起个名字"
      @keyup.enter="doRename"
    />
    <div class="sheet-b">
      <button class="sh-btn ghost" @click="renameTarget = null">取消</button>
      <button class="sh-btn" :disabled="!renameText.trim()" @click="doRename">保存</button>
    </div>
  </BottomSheet>

  <!-- 原来 import 了 TabBar 却没渲染：进了对话就只能靠左上角「‹」回首页，
       去不了报告和我的 -->
  <TabBar />
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
.assist-card {
  align-self: stretch;
  background: var(--card);
  border: 1.5px solid var(--brand);
  border-radius: 22px;
  padding: 17px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.assist-top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.assist-ic {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: var(--brand-soft);
  color: var(--brand-deep);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.assist-t {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 3px;
}
.assist-s {
  font-size: 13px;
  color: var(--gray);
  line-height: 1.5;
}
.assist-btn {
  width: 100%;
  height: 50px;
  border: none;
  border-radius: 14px;
  background: var(--brand);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 6px 16px var(--brand-glow);
}
.assist-btn:disabled {
  opacity: 0.6;
}
.assist-done {
  align-self: center;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: #7c7c80;
  background: var(--line);
  border-radius: 99px;
  padding: 6px 13px;
}
.assist-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ok);
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
.bub-note {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 9px;
  font-size: 12px;
  color: var(--gray-2);
}
.bub-note.broken {
  color: var(--warn);
  font-weight: 600;
}
.bub-act {
  font-size: 12px;
  font-weight: 600;
  color: var(--brand-deep);
  background: var(--brand-soft);
  border-radius: 8px;
  padding: 4px 10px;
}
.bub-act:disabled {
  opacity: 0.55;
}
/* 发失败后把问题还给学生，省得重打 */
.retry-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 14px 16px;
  margin: 4px 0 10px;
}
.rc-q {
  font-size: 13px;
  color: var(--ink-2);
  line-height: 1.6;
  word-break: break-word;
  margin-bottom: 12px;
}
.rc-b {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.rc-btn {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--brand);
  border-radius: 11px;
  padding: 8px 16px;
}
.rc-btn.ghost {
  color: var(--gray);
  background: var(--fill-2);
}
.rc-btn:disabled {
  opacity: 0.5;
}
.quota-banner {
  background: var(--warn-bg);
  color: var(--warn);
  font-size: 12px;
  font-weight: 600;
  border-radius: 14px;
  padding: 10px 14px;
  margin-bottom: 12px;
}
.sheet-q {
  font-size: 14px;
  color: var(--ink-2);
  line-height: 1.7;
  margin-bottom: 18px;
  word-break: break-word;
}
.sheet-input {
  width: 100%;
  height: 50px;
  border: 1px solid var(--line-2);
  border-radius: 15px;
  background: #fff;
  padding: 0 15px;
  font-size: 15px;
  color: var(--ink);
  outline: none;
  margin-bottom: 18px;
}
.sheet-input:focus {
  border-color: var(--brand);
}
.sheet-b {
  display: flex;
  gap: 11px;
}
.sh-btn {
  flex: 1;
  height: 48px;
  border-radius: 15px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  background: var(--brand);
}
.sh-btn.ghost {
  color: var(--ink-2);
  background: var(--fill-2);
}
.sh-btn.danger {
  background: var(--danger);
}
.sh-btn:disabled {
  opacity: 0.5;
}
.quota-banner.over {
  background: var(--danger-bg);
  color: var(--danger);
}
.send-btn:disabled,
.real-input:disabled {
  opacity: 0.5;
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
/* TabBar 高 64、离底 14，所以输入区整体抬 78 —— 两者不再叠在一起。
   消息列表的底部留白靠 measurePad 实测，不写死 */
.input-float {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 78px);
  padding: 14px 16px 10px;
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
