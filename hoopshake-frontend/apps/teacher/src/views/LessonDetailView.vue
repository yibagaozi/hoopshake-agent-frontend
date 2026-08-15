<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  SEVERITY,
  actionLabel,
  errText,
  fmtDate,
  fmtTime,
  fmtWeekday,
  lessonApi,
  lessonStatusLabel,
  nameInitial,
  avatarColor,
  sessionStatusLabel,
} from '@hoopshake/core'
import { toast } from '../toast.js'

const props = defineProps({ lessonId: { type: String, required: true } })
const router = useRouter()

const lesson = ref(null)
const enrollments = ref([])
const live = ref(null)
const liveOn = ref(false)
const statusBusy = ref(false)

let controller = null
let reconnectTimer = null
let closed = false

const guideCount = computed(() => (live.value?.recentFeedback || []).length)

const clipBars = computed(() => {
  const m = live.value?.clipCountByAction || {}
  const entries = Object.entries(m)
  if (!entries.length) return []
  const max = Math.max(...entries.map(([, v]) => v), 1)
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ action: k, count: v, pct: Math.max(6, Math.round((v / max) * 100)) }))
})

async function loadLesson() {
  try {
    lesson.value = await lessonApi.detail(props.lessonId)
  } catch (err) {
    toast.err(errText(err, '加载课程失败'))
  }
}

async function loadEnrollments() {
  try {
    enrollments.value = (await lessonApi.enrollments(props.lessonId)) || []
  } catch {
    enrollments.value = []
  }
}

/* ---------- 课堂实况 ---------- */

function applyEvent(event, data) {
  if (event === 'snapshot') {
    live.value = data
  } else if (event === 'feedback') {
    if (!live.value) return
    live.value.recentFeedback = [data, ...(live.value.recentFeedback || [])].slice(0, 30)
  } else if (event === 'safety_alert') {
    if (!live.value) return
    live.value.safetyAlerts = [data, ...(live.value.safetyAlerts || [])].slice(0, 20)
  } else if (event === 'session_status') {
    if (live.value?.activeSession && data?.sessionId === live.value.activeSession.sessionId) {
      live.value.activeSession.status = data.status
    } else if (live.value && data?.sessionId) {
      live.value.activeSession = { sessionId: data.sessionId, status: data.status }
    }
  }
}

async function connectLive() {
  if (closed) return
  controller = new AbortController()
  liveOn.value = true
  try {
    await lessonApi.liveStream(props.lessonId, {
      signal: controller.signal,
      onEvent: applyEvent,
    })
  } catch {
    /* 断线走重连 */
  }
  liveOn.value = false
  if (!closed) {
    reconnectTimer = setTimeout(connectLive, 4000)
  }
}

async function startLive() {
  try {
    live.value = await lessonApi.live(props.lessonId)
    connectLive()
  } catch (err) {
    toast.err(errText(err, '加载课堂实况失败'))
  }
}

function stopLive() {
  closed = true
  clearTimeout(reconnectTimer)
  controller?.abort()
}

/* ---------- 状态流转 ---------- */

async function setStatus(status) {
  const label = status === 'ONGOING' ? '开始上课' : '结束课程'
  if (!confirm(`确认${label}？`)) return
  statusBusy.value = true
  try {
    lesson.value = await lessonApi.setStatus(props.lessonId, status)
    toast.ok(`已${label}`)
    if (status === 'ONGOING') startLive()
    if (status === 'FINISHED') stopLive()
  } catch (err) {
    toast.err(errText(err, `${label}失败`))
  } finally {
    statusBusy.value = false
  }
}

onMounted(async () => {
  await loadLesson()
  loadEnrollments()
  if (lesson.value?.status === 'ONGOING') startLive()
})

onBeforeUnmount(stopLive)
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div class="head-title-row">
        <button class="btn-back-sq" @click="router.push('/lessons')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 5l-7 7 7 7" stroke="#3A3A3C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <div>
          <div style="display: flex; align-items: center; gap: 10px">
            <span class="code">{{ lesson?.classCode || '未设班级' }}</span>
            <span class="pill" :class="lesson?.status === 'ONGOING' ? 'ok' : 'muted'">{{ lessonStatusLabel(lesson?.status) }}</span>
          </div>
          <h2 class="page-title" style="margin-top: 6px">{{ lesson?.title || '加载中…' }}</h2>
        </div>
      </div>
      <div style="display: flex; gap: 12px">
        <button class="btn" @click="router.push(`/lessons/${lessonId}/config`)">课程设置</button>
        <button v-if="lesson?.status === 'PLANNED'" class="btn primary" :disabled="statusBusy" @click="setStatus('ONGOING')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M5 3v18l7-5 7 5V3z" stroke="#fff" stroke-width="1.9" stroke-linejoin="round" />
          </svg>
          开始上课
        </button>
        <button v-else-if="lesson?.status === 'ONGOING'" class="btn dark" :disabled="statusBusy" @click="setStatus('FINISHED')">
          结束课程
        </button>
      </div>
    </div>

    <div class="content" style="display: flex; flex-direction: column; gap: 20px">
      <!-- 概况条 -->
      <div>
        <div class="row-between">
          <div class="sec-label" style="margin: 0 0 12px 2px">课程概况</div>
          <span class="sched" v-if="lesson?.scheduledAt">
            {{ fmtDate(lesson.scheduledAt) }} {{ fmtWeekday(lesson.scheduledAt) }} {{ fmtTime(lesson.scheduledAt) }}
            <template v-if="lesson.durationMinutes"> · {{ lesson.durationMinutes }} 分钟</template>
          </span>
        </div>
        <div class="panel stat-strip">
          <div class="cell">
            <div class="n">{{ lesson?.enrolledCount ?? enrollments.length }}</div>
            <div class="t">参课学生</div>
          </div>
          <div class="vline"></div>
          <div class="cell">
            <div class="n">{{ (lesson?.actionTypes || []).length }}</div>
            <div class="t">训练动作</div>
          </div>
          <div class="vline"></div>
          <div class="cell">
            <div class="n">{{ (lesson?.enabledCheckpoints || []).length }}</div>
            <div class="t">检查点</div>
          </div>
          <div class="vline"></div>
          <div class="cell">
            <div class="n" :class="{ hot: live?.presentStudentCount }">
              {{ lesson?.status === 'ONGOING' ? live?.presentStudentCount ?? '—' : '—' }}
            </div>
            <div class="t">课堂在场</div>
          </div>
        </div>
      </div>

      <!-- 课堂实况（进行中） -->
      <div v-if="lesson?.status === 'ONGOING'">
        <div class="row-between" style="margin-bottom: 12px">
          <div class="sec-label" style="margin: 0 0 0 2px">
            课堂实况
            <span class="pill brand" style="margin-left: 8px">
              <span class="dot" style="animation: recpulse 1.6s infinite"></span>
              {{ liveOn ? 'LIVE' : '重连中…' }}
            </span>
          </div>
          <button
            v-if="live?.activeSession"
            class="btn sm"
            @click="router.push(`/summary/${live.activeSession.sessionId}`)"
          >
            查看课末汇总 ›
          </button>
        </div>
        <div class="live-grid">
          <!-- 左：动作统计 + 采集会话 -->
          <div class="panel live-left">
            <div class="lp-title">动作事件统计</div>
            <div v-if="live?.activeSession" class="sess-line">
              <span class="dot-live"></span>
              采集会话 · {{ sessionStatusLabel(live.activeSession.status) }}
              <span class="mono-id">{{ (live.activeSession.sessionId || '').slice(0, 8) }}</span>
            </div>
            <div v-else class="sess-line muted">尚未检测到采集会话</div>
            <div v-if="!clipBars.length" class="empty-hint" style="padding: 22px 0">暂无动作事件</div>
            <div class="bars">
              <div v-for="b in clipBars" :key="b.action" class="bar-row">
                <span class="bl">{{ actionLabel(b.action) }}</span>
                <div class="track"><div class="fill" :style="{ width: b.pct + '%' }"></div></div>
                <span class="bv">{{ b.count }}</span>
              </div>
            </div>
          </div>

          <!-- 中：实时反馈流 -->
          <div class="panel live-mid">
            <div class="lp-title">实时反馈</div>
            <div v-if="!(live?.recentFeedback || []).length" class="empty-hint" style="padding: 22px 0">
              等待课堂反馈…
            </div>
            <div class="feed">
              <div v-for="f in live?.recentFeedback || []" :key="f.feedbackId" class="feed-row">
                <span class="avatar" :style="{ width: '30px', height: '30px', fontSize: '12px', background: avatarColor(f.studentId) }">
                  {{ nameInitial(f.displayName, '生') }}
                </span>
                <div class="feed-mid">
                  <div class="feed-name">
                    {{ f.displayName || '未识别学生' }}
                    <span class="sev" :class="f.severity">{{ SEVERITY[f.severity]?.label || f.severity }}</span>
                  </div>
                  <div class="feed-cue">{{ f.cueText || f.checkpointId || actionLabel(f.actionType) }}</div>
                </div>
                <span class="feed-time">{{ fmtTime(f.occurredAt) }}</span>
              </div>
            </div>
          </div>

          <!-- 右：安全提醒 -->
          <div class="panel live-right" :class="{ alert: (live?.safetyAlerts || []).length }">
            <div class="lp-title">
              安全提醒
              <span v-if="(live?.safetyAlerts || []).length" class="pill danger">{{ live.safetyAlerts.length }}</span>
            </div>
            <div v-if="!(live?.safetyAlerts || []).length" class="safe-ok">
              <span class="dot-ok"></span>课堂安全状态正常
            </div>
            <div class="alerts">
              <div v-for="a in live?.safetyAlerts || []" :key="a.feedbackId" class="alert-row">
                <span class="ad"></span>
                <div>
                  <div class="at">{{ a.message || a.checkpointId }}</div>
                  <div class="as">{{ a.displayName || '未识别学生' }} · {{ fmtTime(a.occurredAt) }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 功能入口 -->
      <div>
        <div class="sec-label">课程功能</div>
        <div class="fn-grid">
          <div class="panel fn-card" @click="router.push(`/lessons/${lessonId}/config`)">
            <div class="fn-head">
              <span class="fn-icon hot">
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
                  <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="#E8551A" stroke-width="1.9" />
                  <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" stroke="#E8551A" stroke-width="1.9" />
                  <line x1="8" y1="3" x2="8" y2="6.5" stroke="#E8551A" stroke-width="1.9" stroke-linecap="round" />
                  <line x1="16" y1="3" x2="16" y2="6.5" stroke="#E8551A" stroke-width="1.9" stroke-linecap="round" />
                </svg>
              </span>
              <span class="chev">›</span>
            </div>
            <div>
              <div class="fn-title">课程配置</div>
              <div class="fn-desc">配置本节课的训练动作与检查点，下发至场边算法</div>
            </div>
            <div class="fn-foot hot">已配置 {{ (lesson?.actionTypes || []).length }} 个动作</div>
          </div>

          <div class="panel fn-card" @click="router.push(`/lessons/${lessonId}/roster`)">
            <div class="fn-head">
              <span class="fn-icon hot">
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
                  <circle cx="8" cy="8" r="3" stroke="#E8551A" stroke-width="1.9" />
                  <circle cx="16" cy="9" r="2.5" stroke="#E8551A" stroke-width="1.9" />
                  <path d="M3 19c0-2.8 2.2-5 5-5s5 2.2 5 5M14.5 19c0-2 1-3.8 2.5-4.6" stroke="#E8551A" stroke-width="1.9" stroke-linecap="round" />
                </svg>
              </span>
              <span class="chev">›</span>
            </div>
            <div>
              <div class="fn-title">学生名单</div>
              <div class="fn-desc">查看班级学生、训练概览与账号状态，管理参课名单</div>
            </div>
            <div class="fn-foot hot">{{ enrollments.length }} 人在班</div>
          </div>

          <div class="panel fn-card" @click="router.push(`/lessons/${lessonId}/import`)">
            <div class="fn-head">
              <span class="fn-icon">
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
                  <path d="M12 15V4M12 4L8 8M12 4l4 4" stroke="#3A3A3C" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4" stroke="#3A3A3C" stroke-width="1.9" stroke-linecap="round" />
                </svg>
              </span>
              <span class="chev">›</span>
            </div>
            <div>
              <div class="fn-title">批量导入</div>
              <div class="fn-desc">粘贴或上传名单（CSV），预检后一键建号入班</div>
            </div>
            <div class="fn-foot">支持自动创建学生账号</div>
          </div>

          <div class="panel fn-card" @click="live?.activeSession ? router.push(`/summary/${live.activeSession.sessionId}`) : router.push('/summary')">
            <div class="fn-head">
              <span class="fn-icon">
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
                  <path d="M4 17l4-5 3.5 3L18 8l2 2.5" stroke="#3A3A3C" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
                  <line x1="4" y1="20.5" x2="20" y2="20.5" stroke="#3A3A3C" stroke-width="1.9" stroke-linecap="round" />
                </svg>
              </span>
              <span class="chev">›</span>
            </div>
            <div>
              <div class="fn-title">课末汇总</div>
              <div class="fn-desc">课堂结束后查看班级统计、安全提醒与学生要点</div>
            </div>
            <div class="fn-foot">{{ live?.activeSession ? '本节课会话已就绪' : '需选择训练会话' }}</div>
          </div>

          <div class="panel fn-card" @click="router.push('/plan')">
            <div class="fn-head">
              <span class="fn-icon">
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
                  <path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" stroke="#3A3A3C" stroke-width="1.9" stroke-linejoin="round" />
                </svg>
              </span>
              <span class="wip">未开放</span>
            </div>
            <div>
              <div class="fn-title">备课</div>
              <div class="fn-desc">AI 生成教案大纲、纠正练习与讲解稿</div>
            </div>
            <div class="fn-foot">接口开放后自动启用</div>
          </div>

          <div class="panel fn-card" @click="router.push('/assistant')">
            <div class="fn-head">
              <span class="fn-icon">
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
                  <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" stroke="#3A3A3C" stroke-width="1.9" stroke-linejoin="round" />
                </svg>
              </span>
              <span class="wip">未开放</span>
            </div>
            <div>
              <div class="fn-title">教学对话</div>
              <div class="fn-desc">向教学助手提问、检索知识库并做多人分析</div>
            </div>
            <div class="fn-foot">接口开放后自动启用</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.code {
  font: 600 12px/1 var(--mono);
  color: var(--gray-2);
}
.row-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sched {
  font-size: 13px;
  color: var(--gray);
}
.stat-strip {
  display: flex;
  padding: 20px 22px;
  gap: 8px;
  border-radius: 18px;
}
.cell {
  flex: 1;
  padding: 0 4px;
}
.cell .n {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.cell .n.hot {
  color: var(--brand-deep);
}
.cell .t {
  font-size: 13px;
  color: var(--gray);
  margin-top: 4px;
}
.vline {
  width: 1px;
  background: var(--line);
}
.live-grid {
  display: grid;
  grid-template-columns: 1fr 1.3fr 1fr;
  gap: 16px;
}
@media (max-width: 1100px) {
  .live-grid {
    grid-template-columns: 1fr;
  }
}
.live-left,
.live-mid,
.live-right {
  padding: 20px 22px;
  min-height: 220px;
}
.lp-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.sess-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ink-2);
  margin-bottom: 16px;
}
.sess-line.muted {
  color: var(--gray-2);
}
.dot-live {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--brand);
  animation: recpulse 1.6s infinite;
}
.mono-id {
  font: 500 11px/1 var(--mono);
  color: var(--gray-2);
  background: var(--fill-2);
  border-radius: 6px;
  padding: 3px 7px;
}
.bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.bl {
  width: 64px;
  flex: none;
  font-size: 13px;
  color: var(--ink-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.track {
  flex: 1;
  height: 10px;
  border-radius: 99px;
  background: var(--fill-2);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 99px;
  background: var(--brand);
  transition: width 0.4s ease;
}
.bv {
  width: 30px;
  flex: none;
  text-align: right;
  font: 600 13px/1 var(--mono);
  color: var(--ink-3);
}
.feed {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 300px;
  overflow-y: auto;
}
.feed-row {
  display: flex;
  align-items: center;
  gap: 11px;
}
.feed-mid {
  flex: 1;
  min-width: 0;
}
.feed-name {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.sev {
  font-size: 11px;
  font-weight: 600;
  border-radius: 6px;
  padding: 2px 7px;
}
.sev.MAJOR {
  color: #c0472c;
  background: #fbe0d8;
}
.sev.MINOR {
  color: #b5771a;
  background: var(--warn-bg);
}
.sev.POSITIVE {
  color: var(--ok);
  background: var(--ok-bg);
}
.feed-cue {
  font-size: 13px;
  color: var(--ink-3);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.feed-time {
  font: 500 12px/1 var(--mono);
  color: var(--gray-2);
  flex: none;
}
.live-right.alert {
  background: var(--safety-bg);
  border-color: var(--safety-line);
}
.safe-ok {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 14px;
  color: var(--ok);
  font-weight: 600;
  padding: 10px 0;
}
.dot-ok {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--ok);
}
.alerts {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 280px;
  overflow-y: auto;
}
.alert-row {
  display: flex;
  gap: 13px;
  padding: 13px 14px;
  background: var(--danger-bg);
  border-radius: 14px;
}
.ad {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--danger);
  margin-top: 5px;
  flex: none;
}
.at {
  font-size: 14px;
  font-weight: 600;
}
.as {
  font-size: 13px;
  color: var(--gray);
  margin-top: 3px;
}
.fn-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
.fn-card {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  transition: box-shadow 0.15s, transform 0.15s;
}
.fn-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.07);
  transform: translateY(-1px);
}
.fn-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.fn-icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  background: var(--fill);
  display: flex;
  align-items: center;
  justify-content: center;
}
.fn-icon.hot {
  background: var(--brand-soft);
}
.chev {
  font-size: 22px;
  color: var(--gray-4);
}
.wip {
  font-size: 11px;
  font-weight: 600;
  color: var(--warn);
  background: var(--warn-bg);
  border-radius: 99px;
  padding: 4px 10px;
}
.fn-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.fn-desc {
  font-size: 13px;
  color: var(--gray);
  line-height: 1.5;
  margin-top: 6px;
}
.fn-foot {
  font: 600 12px/1 var(--mono);
  color: var(--gray);
  border-top: 1px solid var(--divider);
  padding-top: 12px;
}
.fn-foot.hot {
  color: var(--brand-deep);
}
</style>
