<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  errText,
  fmtDateTime,
  fmtDurationMs,
  fromLocalInput,
  logLevelTone,
  LOG_LEVELS,
  normalizePage,
  num,
  opsApi,
  opsTelemetryApi,
  runStatusLabel,
  runStatusTone,
} from '@hoopshake/core'
import { toast } from '../../toast.js'
import Modal from '../../components/Modal.vue'
import OpsTabs from '../../components/OpsTabs.vue'
import Pager from '../../components/Pager.vue'

/**
 * 边缘遥测 · /api/ops/edge/telemetry/**
 *
 * 和「边缘设备」页分工：那边回答「机器还在不在」，这边回答「机器上跑出了什么」。
 * 四段对四个端点 —— 概要一次拉总量与最近若干条，另外三段是各自的分页查询。
 *
 * edgeId 是四段公用的筛选，选了就一直带着；同时写进地址栏 query，
 * 这样设备详情里那颗「查看遥测」能直接把人送到某台机器的遥测上。
 */

const route = useRoute()
const router = useRouter()

const SEGS = [
  { key: 'summary', label: '概要' },
  { key: 'logs', label: '日志' },
  { key: 'metrics', label: '指标' },
  { key: 'runs', label: '进程' },
]

const seg = ref('summary')
const edgeId = ref('')
const windowHours = ref(24)
const devices = ref([])

/** 每段各自的加载态与数据，切段时不互相清空 */
const summary = ref(null)
const loadingSummary = ref(false)

const logs = reactive({ loading: false, page: null, rows: [], more: false })
const metrics = reactive({ loading: false, page: null, rows: [], more: false })
const runs = reactive({ loading: false, page: null, rows: [], more: false })

const logQ = reactive({
  level: '', keyword: '', source: '', processType: '', processName: '',
  runId: '', sessionId: '', lessonId: '', cameraId: '', from: '', to: '',
})
const metricQ = reactive({
  metricName: '', sessionId: '', lessonId: '', cameraId: '',
  processType: '', processName: '', from: '', to: '',
})
const runQ = reactive({ processType: '', processName: '', status: '', from: '', to: '' })

const detail = ref(null)
const detailKind = ref('')

/*
 * 各种 id 类筛选（runId / sessionId / lessonId / cameraId …）平时收起来。
 * 全摊开是 11 个输入框，占掉大半屏，真正天天用的只有级别、关键词和时间范围。
 * 收起时若还有值，按钮上会挂个数字 —— 免得筛选悄悄生效却看不见。
 */
const advOpen = ref(false)
const ADV_KEYS = {
  logs: ['source', 'processType', 'processName', 'runId', 'sessionId', 'lessonId', 'cameraId'],
  metrics: ['processType', 'processName', 'sessionId', 'lessonId', 'cameraId'],
  runs: ['processType', 'processName'],
}

function advCount(q, keys) {
  return keys.filter((k) => String(q[k] ?? '').trim()).length
}

const logAdvCount = computed(() => advCount(logQ, ADV_KEYS.logs))
const metricAdvCount = computed(() => advCount(metricQ, ADV_KEYS.metrics))
const runAdvCount = computed(() => advCount(runQ, ADV_KEYS.runs))

const busy = computed(
  () => loadingSummary.value || logs.loading || metrics.loading || runs.loading
)

/** datetime-local 是本地时间，接口要 ISO，空串保持空串（buildUrl 会丢掉） */
function range(q) {
  return { from: fromLocalInput(q.from) || '', to: fromLocalInput(q.to) || '' }
}

async function loadDevices() {
  try {
    const res = await opsApi.devices()
    devices.value = res?.devices || []
  } catch {
    // 设备列表只用来填下拉框，拉不到就退成「全部设备」，不打断遥测本身
  }
}

async function loadSummary() {
  loadingSummary.value = true
  try {
    summary.value = await opsTelemetryApi.summary({
      edgeId: edgeId.value,
      windowHours: windowHours.value,
    })
  } catch (err) {
    toast.err(errText(err, '加载遥测概要失败'))
  } finally {
    loadingSummary.value = false
  }
}

async function loadLogs(page = 0) {
  logs.loading = true
  try {
    const res = normalizePage(
      await opsTelemetryApi.logs({ edgeId: edgeId.value, ...logQ, ...range(logQ), page, size: 20 })
    )
    logs.page = res
    logs.rows = res.content
  } catch (err) {
    toast.err(errText(err, '加载日志失败'))
  } finally {
    logs.loading = false
  }
}

async function loadMetrics(page = 0) {
  metrics.loading = true
  try {
    const res = normalizePage(
      await opsTelemetryApi.metrics({
        edgeId: edgeId.value, ...metricQ, ...range(metricQ), page, size: 20,
      })
    )
    metrics.page = res
    metrics.rows = res.content
  } catch (err) {
    toast.err(errText(err, '加载指标失败'))
  } finally {
    metrics.loading = false
  }
}

async function loadRuns(page = 0) {
  runs.loading = true
  try {
    const res = normalizePage(
      await opsTelemetryApi.runs({ edgeId: edgeId.value, ...runQ, ...range(runQ), page, size: 20 })
    )
    runs.page = res
    runs.rows = res.content
  } catch (err) {
    toast.err(errText(err, '加载进程记录失败'))
  } finally {
    runs.loading = false
  }
}

/** 当前这一段重新拉一次 */
function reload() {
  if (seg.value === 'summary') return loadSummary()
  if (seg.value === 'logs') return loadLogs(0)
  if (seg.value === 'metrics') return loadMetrics(0)
  return loadRuns(0)
}

function goSeg(k) {
  if (seg.value === k) return
  seg.value = k
  // 换段才拉，切回已经拉过的那段不重复请求
  if (k === 'summary' && !summary.value) loadSummary()
  else if (k === 'logs' && !logs.page) loadLogs(0)
  else if (k === 'metrics' && !metrics.page) loadMetrics(0)
  else if (k === 'runs' && !runs.page) loadRuns(0)
}

function resetFilters(q) {
  Object.keys(q).forEach((k) => {
    q[k] = ''
  })
  reload()
}

function setWindow(h) {
  if (windowHours.value === h) return
  windowHours.value = h
  loadSummary()
}

/** 概要里的「最近错误」点一下，直接跳到日志段并按那条的 runId 过滤 */
function drillToRun(runId) {
  resetFilters(logQ)
  logQ.runId = runId || ''
  seg.value = 'logs'
  // 展开筛选区：不然列表突然只剩几条，而「为什么」藏在收起来的框里
  advOpen.value = true
  loadLogs(0)
}

function openDetail(row, kind) {
  detail.value = row
  detailKind.value = kind
}

/** attrs / dims 都是自由对象，键名随固件版本变，拿到什么显示什么 */
function kvRows(obj) {
  if (!obj || typeof obj !== 'object') return []
  return Object.entries(obj).map(([k, v]) => ({
    k,
    v: v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v),
  }))
}

/** 指标值带单位；unit 缺省时只显示数值 */
function metricValue(m) {
  const v = m?.value
  if (v === null || v === undefined) return '—'
  const n = typeof v === 'number' ? Number(v.toFixed(4)).toString() : String(v)
  return m.unit ? `${n} ${m.unit}` : n
}

// 换设备时四段都作废，当前段立刻重拉，其余等切过去再拉
watch(edgeId, (v) => {
  summary.value = null
  logs.page = null
  logs.rows = []
  metrics.page = null
  metrics.rows = []
  runs.page = null
  runs.rows = []
  router.replace({ query: v ? { ...route.query, edgeId: v } : omitEdge(route.query) })
  reload()
})

function omitEdge(q) {
  const { edgeId: _drop, ...rest } = q
  return rest
}

onMounted(() => {
  const fromUrl = route.query.edgeId
  if (typeof fromUrl === 'string' && fromUrl) edgeId.value = fromUrl
  loadDevices()
  // edgeId 从地址栏带进来时 watch 已经发过一轮了，别再发一次
  if (!edgeId.value) loadSummary()
})
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div>
        <h2 class="page-title">边缘遥测</h2>
        <p class="page-sub">
          边缘机上报的日志、指标与进程记录
          <template v-if="summary?.generatedAt"> · 统计于 {{ fmtDateTime(summary.generatedAt) }}</template>
        </p>
      </div>
      <button class="btn" :disabled="busy" @click="reload">{{ busy ? '刷新中…' : '刷新' }}</button>
    </div>

    <OpsTabs />

    <div class="filter-bar seg-bar">
      <div class="chips">
        <button
          v-for="s in SEGS"
          :key="s.key"
          class="chip"
          :class="{ on: seg === s.key }"
          @click="goSeg(s.key)"
        >
          {{ s.label }}
        </button>
      </div>
      <label class="dev-pick">
        <span>设备</span>
        <select v-model="edgeId" class="f-in">
          <option value="">全部设备</option>
          <option v-for="d in devices" :key="d.deviceId" :value="d.deviceId">
            {{ d.name || d.deviceId }}
          </option>
        </select>
      </label>
    </div>

    <div class="content">
      <!-- ============ 概要 ============ -->
      <template v-if="seg === 'summary'">
        <div v-if="loadingSummary" class="grid">
          <div v-for="i in 3" :key="i" class="panel box"><div class="skeleton" style="height: 110px"></div></div>
        </div>

        <template v-else>
          <div class="grid">
            <div class="panel box">
              <div class="b-head">
                <span class="b-title">日志</span>
                <span class="pill" :class="summary?.errorLogs > 0 ? 'danger' : 'ok'">
                  {{ summary?.errorLogs > 0 ? '有错误' : '无错误' }}
                </span>
              </div>
              <div class="b-main mono">{{ num(summary?.totalLogs) }}</div>
              <div class="kv">
                <span class="k danger">ERROR</span><b>{{ num(summary?.errorLogs) }}</b>
                <span class="k warn">WARN</span><b>{{ num(summary?.warnLogs) }}</b>
                <span class="k info">INFO</span><b>{{ num(summary?.infoLogs) }}</b>
              </div>
            </div>

            <div class="panel box">
              <div class="b-head"><span class="b-title">指标点</span></div>
              <div class="b-main mono">{{ num(summary?.totalMetrics) }}</div>
              <div class="b-note">窗口内上报的指标采样条数，明细在「指标」段按名字查。</div>
            </div>

            <div class="panel box">
              <div class="b-head">
                <span class="b-title">进程</span>
                <span class="pill" :class="summary?.failedRuns > 0 ? 'danger' : 'ok'">
                  {{ summary?.failedRuns > 0 ? '有失败' : '正常' }}
                </span>
              </div>
              <div class="b-main mono">{{ num(summary?.totalRuns) }}</div>
              <div class="kv">
                <span class="k ok">运行中</span><b>{{ num(summary?.runningRuns) }}</b>
                <span class="k danger">失败</span><b>{{ num(summary?.failedRuns) }}</b>
              </div>
            </div>
          </div>

          <div class="win-row">
            <span>统计窗口</span>
            <button class="lnk" :class="{ on: windowHours === 24 }" @click="setWindow(24)">24h</button>
            <button class="lnk" :class="{ on: windowHours === 72 }" @click="setWindow(72)">72h</button>
            <template v-if="summary?.since"> · 起自 {{ fmtDateTime(summary.since) }}</template>
            <template v-if="summary?.edgeId"> · 设备 {{ summary.edgeId }}</template>
          </div>

          <div class="sec-label" style="margin-top: 24px">最近进程</div>
          <div class="panel">
            <div v-if="!summary?.latestRuns?.length" class="empty-hint">窗口内没有进程记录</div>
            <div v-else class="gtable" style="--cols: 1.6fr 0.9fr 1.2fr 0.9fr 0.7fr">
              <div class="thead">
                <span>进程</span><span>状态</span><span>开始</span><span>时长</span><span>退出码</span>
              </div>
              <div v-for="r in summary.latestRuns" :key="r.runId" class="trow" @click="openDetail(r, 'run')">
                <span class="two">
                  <b>{{ r.processName || r.processType || r.runId }}</b>
                  <i>{{ r.runId }}</i>
                </span>
                <span><span class="pill" :class="runStatusTone(r.status)">{{ runStatusLabel(r.status) }}</span></span>
                <span class="mono sm">{{ r.startedAt ? fmtDateTime(r.startedAt) : '—' }}</span>
                <span class="sm">{{ fmtDurationMs(r.durationMs) }}</span>
                <span class="mono sm" :class="{ bad: r.exitCode }">{{ r.exitCode ?? '—' }}</span>
              </div>
            </div>
          </div>

          <div class="sec-label" style="margin-top: 24px">最近错误日志</div>
          <div class="panel">
            <div v-if="!summary?.latestErrorLogs?.length" class="empty-hint">窗口内没有 ERROR 级日志</div>
            <div v-else>
              <div
                v-for="l in summary.latestErrorLogs"
                :key="l.eventId"
                class="err-row"
                @click="openDetail(l, 'log')"
              >
                <div class="er-top">
                  <span class="pill" :class="logLevelTone(l.level)">{{ l.level }}</span>
                  <span class="mono sm">{{ l.occurredAt ? fmtDateTime(l.occurredAt) : '—' }}</span>
                  <span class="er-src">{{ l.source || l.logger || '—' }}</span>
                  <button v-if="l.runId" class="lnk go" @click.stop="drillToRun(l.runId)">查这次运行的日志 →</button>
                </div>
                <div class="er-msg">{{ l.errorMessage || l.message || '—' }}</div>
                <div v-if="l.errorClass" class="er-cls mono">{{ l.errorClass }}</div>
              </div>
            </div>
          </div>
        </template>
      </template>

      <!-- ============ 日志 ============ -->
      <template v-else-if="seg === 'logs'">
        <div class="panel filters">
          <div class="f-grid">
            <label class="f"><span>级别</span>
              <select v-model="logQ.level" class="f-in">
                <option value="">全部</option>
                <option v-for="lv in LOG_LEVELS" :key="lv" :value="lv">{{ lv }}</option>
              </select>
            </label>
            <label class="f wide"><span>关键词</span>
              <input v-model="logQ.keyword" class="f-in" placeholder="按消息内容匹配" @keyup.enter="loadLogs(0)" />
            </label>
            <label class="f"><span>起</span><input v-model="logQ.from" type="datetime-local" class="f-in" /></label>
            <label class="f"><span>止</span><input v-model="logQ.to" type="datetime-local" class="f-in" /></label>
            <template v-if="advOpen">
              <label class="f"><span>来源 source</span><input v-model="logQ.source" class="f-in" /></label>
              <label class="f"><span>进程类型</span><input v-model="logQ.processType" class="f-in" /></label>
              <label class="f"><span>进程名</span><input v-model="logQ.processName" class="f-in" /></label>
              <label class="f"><span>runId</span><input v-model="logQ.runId" class="f-in mono" /></label>
              <label class="f"><span>sessionId</span><input v-model="logQ.sessionId" class="f-in mono" /></label>
              <label class="f"><span>lessonId</span><input v-model="logQ.lessonId" class="f-in mono" /></label>
              <label class="f"><span>cameraId</span><input v-model="logQ.cameraId" class="f-in mono" /></label>
            </template>
          </div>
          <div class="f-act">
            <button class="btn sm adv" @click="advOpen = !advOpen">
              {{ advOpen ? '收起筛选' : '更多筛选' }}
              <em v-if="!advOpen && logAdvCount">{{ logAdvCount }}</em>
            </button>
            <div class="f-sp"></div>
            <button class="btn sm" @click="resetFilters(logQ)">清空</button>
            <button class="btn sm primary" :disabled="logs.loading" @click="loadLogs(0)">查询</button>
          </div>
        </div>

        <div class="panel" style="margin-top: 18px; overflow: hidden">
          <div v-if="logs.loading" style="padding: 22px 24px">
            <div v-for="i in 6" :key="i" class="skeleton" style="height: 34px; margin-bottom: 11px"></div>
          </div>
          <div v-else-if="!logs.rows.length" class="empty-hint">没有符合条件的日志</div>
          <div v-else class="gtable" style="--cols: 1.15fr 0.6fr 1fr 2.4fr 1fr">
            <div class="thead">
              <span>时间</span><span>级别</span><span>来源</span><span>消息</span><span>进程 / run</span>
            </div>
            <div v-for="l in logs.rows" :key="l.eventId" class="trow" @click="openDetail(l, 'log')">
              <span class="mono sm">{{ l.occurredAt ? fmtDateTime(l.occurredAt) : '—' }}</span>
              <span><span class="pill" :class="logLevelTone(l.level)">{{ l.level || '—' }}</span></span>
              <span class="two">
                <b class="sm">{{ l.source || '—' }}</b>
                <i>{{ l.logger || '' }}</i>
              </span>
              <span class="msg">{{ l.message || l.errorMessage || '—' }}</span>
              <span class="two">
                <b class="sm">{{ l.pid ? `pid ${l.pid}` : '—' }}</b>
                <i>{{ l.runId || '' }}</i>
              </span>
            </div>
          </div>
          <Pager :page="logs.page" :loading="logs.loading" @go="loadLogs" />
        </div>
      </template>

      <!-- ============ 指标 ============ -->
      <template v-else-if="seg === 'metrics'">
        <div class="panel filters">
          <div class="f-grid">
            <label class="f wide"><span>指标名</span>
              <input v-model="metricQ.metricName" class="f-in mono" placeholder="精确匹配" @keyup.enter="loadMetrics(0)" />
            </label>
            <label class="f"><span>起</span><input v-model="metricQ.from" type="datetime-local" class="f-in" /></label>
            <label class="f"><span>止</span><input v-model="metricQ.to" type="datetime-local" class="f-in" /></label>
            <template v-if="advOpen">
              <label class="f"><span>进程类型</span><input v-model="metricQ.processType" class="f-in" /></label>
              <label class="f"><span>进程名</span><input v-model="metricQ.processName" class="f-in" /></label>
              <label class="f"><span>sessionId</span><input v-model="metricQ.sessionId" class="f-in mono" /></label>
              <label class="f"><span>lessonId</span><input v-model="metricQ.lessonId" class="f-in mono" /></label>
              <label class="f"><span>cameraId</span><input v-model="metricQ.cameraId" class="f-in mono" /></label>
            </template>
          </div>
          <div class="f-act">
            <button class="btn sm adv" @click="advOpen = !advOpen">
              {{ advOpen ? '收起筛选' : '更多筛选' }}
              <em v-if="!advOpen && metricAdvCount">{{ metricAdvCount }}</em>
            </button>
            <div class="f-sp"></div>
            <button class="btn sm" @click="resetFilters(metricQ)">清空</button>
            <button class="btn sm primary" :disabled="metrics.loading" @click="loadMetrics(0)">查询</button>
          </div>
        </div>

        <div class="panel" style="margin-top: 18px; overflow: hidden">
          <div v-if="metrics.loading" style="padding: 22px 24px">
            <div v-for="i in 6" :key="i" class="skeleton" style="height: 34px; margin-bottom: 11px"></div>
          </div>
          <div v-else-if="!metrics.rows.length" class="empty-hint">没有符合条件的指标点</div>
          <div v-else class="gtable" style="--cols: 1.15fr 1.5fr 1fr 2.2fr">
            <div class="thead"><span>时间</span><span>指标名</span><span>值</span><span>维度</span></div>
            <div
              v-for="(m, i) in metrics.rows"
              :key="m.eventId || `${m.metricName}-${m.occurredAt}-${i}`"
              class="trow"
              @click="openDetail(m, 'metric')"
            >
              <span class="mono sm">{{ m.occurredAt ? fmtDateTime(m.occurredAt) : '—' }}</span>
              <span class="mono sm">{{ m.metricName || '—' }}</span>
              <span class="mono val">{{ metricValue(m) }}</span>
              <span class="dims">
                <template v-if="kvRows(m.dims).length">
                  <span v-for="d in kvRows(m.dims)" :key="d.k" class="dim">{{ d.k }}={{ d.v }}</span>
                </template>
                <template v-else>—</template>
              </span>
            </div>
          </div>
          <Pager :page="metrics.page" :loading="metrics.loading" @go="loadMetrics" />
        </div>
      </template>

      <!-- ============ 进程 ============ -->
      <template v-else>
        <div class="panel filters">
          <div class="f-grid">
            <label class="f"><span>状态</span><input v-model="runQ.status" class="f-in" placeholder="如 RUNNING / FAILED" @keyup.enter="loadRuns(0)" /></label>
            <label class="f"><span>起</span><input v-model="runQ.from" type="datetime-local" class="f-in" /></label>
            <label class="f"><span>止</span><input v-model="runQ.to" type="datetime-local" class="f-in" /></label>
            <template v-if="advOpen">
              <label class="f"><span>进程类型</span><input v-model="runQ.processType" class="f-in" /></label>
              <label class="f"><span>进程名</span><input v-model="runQ.processName" class="f-in" /></label>
            </template>
          </div>
          <div class="f-act">
            <button class="btn sm adv" @click="advOpen = !advOpen">
              {{ advOpen ? '收起筛选' : '更多筛选' }}
              <em v-if="!advOpen && runAdvCount">{{ runAdvCount }}</em>
            </button>
            <div class="f-sp"></div>
            <button class="btn sm" @click="resetFilters(runQ)">清空</button>
            <button class="btn sm primary" :disabled="runs.loading" @click="loadRuns(0)">查询</button>
          </div>
        </div>

        <div class="panel" style="margin-top: 18px; overflow: hidden">
          <div v-if="runs.loading" style="padding: 22px 24px">
            <div v-for="i in 6" :key="i" class="skeleton" style="height: 34px; margin-bottom: 11px"></div>
          </div>
          <div v-else-if="!runs.rows.length" class="empty-hint">没有符合条件的进程记录</div>
          <div v-else class="gtable" style="--cols: 1.5fr 0.8fr 1.15fr 0.9fr 0.6fr 0.6fr">
            <div class="thead">
              <span>进程</span><span>状态</span><span>开始</span><span>时长</span><span>退出码</span><span>重启</span>
            </div>
            <div v-for="r in runs.rows" :key="r.runId" class="trow" @click="openDetail(r, 'run')">
              <span class="two">
                <b class="sm">{{ r.processName || r.processType || '—' }}</b>
                <i>{{ r.runId }}</i>
              </span>
              <span><span class="pill" :class="runStatusTone(r.status)">{{ runStatusLabel(r.status) }}</span></span>
              <span class="mono sm">{{ r.startedAt ? fmtDateTime(r.startedAt) : '—' }}</span>
              <span class="sm">{{ fmtDurationMs(r.durationMs) }}</span>
              <span class="mono sm" :class="{ bad: r.exitCode }">{{ r.exitCode ?? '—' }}</span>
              <span class="mono sm" :class="{ bad: r.restartCount > 0 }">{{ num(r.restartCount) }}</span>
            </div>
          </div>
          <Pager :page="runs.page" :loading="runs.loading" @go="loadRuns" />
        </div>
      </template>
    </div>

    <!-- ============ 明细 ============ -->
    <Modal
      :open="!!detail"
      :width="700"
      :title="detailKind === 'log' ? '日志明细' : detailKind === 'metric' ? '指标明细' : '进程明细'"
      @close="detail = null"
    >
      <template v-if="detailKind === 'log' && detail">
        <div class="d-top">
          <span class="pill" :class="logLevelTone(detail.level)">{{ detail.level || '—' }}</span>
          <span class="mono sm">{{ detail.occurredAt ? fmtDateTime(detail.occurredAt) : '—' }}</span>
        </div>
        <div class="d-msg">{{ detail.message || '—' }}</div>
        <div class="dkv">
          <span>来源</span><b>{{ detail.source || '—' }}</b>
          <span>logger</span><b class="mono">{{ detail.logger || '—' }}</b>
          <span>runId</span><b class="mono">{{ detail.runId || '—' }}</b>
          <span>pid</span><b class="mono">{{ detail.pid ?? '—' }}</b>
          <span>eventId</span><b class="mono">{{ detail.eventId || '—' }}</b>
        </div>
        <template v-if="detail.errorClass || detail.errorMessage">
          <div class="sec-label" style="margin-top: 18px">异常</div>
          <div class="err-box">
            <div class="eb-t mono">{{ detail.errorClass || '—' }}</div>
            <div class="eb-s">{{ detail.errorMessage || '—' }}</div>
          </div>
        </template>
        <template v-if="detail.stackTrace">
          <div class="sec-label" style="margin-top: 18px">调用栈</div>
          <pre class="stack">{{ detail.stackTrace }}</pre>
        </template>
        <template v-if="kvRows(detail.attrs).length">
          <div class="sec-label" style="margin-top: 18px">附加属性</div>
          <div class="dkv">
            <template v-for="a in kvRows(detail.attrs)" :key="a.k">
              <span class="mono">{{ a.k }}</span><b class="mono">{{ a.v }}</b>
            </template>
          </div>
        </template>
      </template>

      <template v-else-if="detailKind === 'metric' && detail">
        <div class="d-msg mono">{{ detail.metricName || '—' }}</div>
        <div class="dkv">
          <span>值</span><b class="mono">{{ metricValue(detail) }}</b>
          <span>时间</span><b class="mono">{{ detail.occurredAt ? fmtDateTime(detail.occurredAt) : '—' }}</b>
        </div>
        <div class="sec-label" style="margin-top: 18px">维度</div>
        <div v-if="!kvRows(detail.dims).length" class="empty-hint" style="padding: 16px">这条没有带维度</div>
        <div v-else class="dkv">
          <template v-for="d in kvRows(detail.dims)" :key="d.k">
            <span class="mono">{{ d.k }}</span><b class="mono">{{ d.v }}</b>
          </template>
        </div>
      </template>

      <template v-else-if="detail">
        <div class="d-top">
          <span class="pill" :class="runStatusTone(detail.status)">{{ runStatusLabel(detail.status) }}</span>
          <span class="sm">{{ fmtDurationMs(detail.durationMs) }}</span>
        </div>
        <div class="dkv">
          <span>runId</span><b class="mono">{{ detail.runId || '—' }}</b>
          <span>pid</span><b class="mono">{{ detail.pid ?? '—' }}</b>
          <span>开始</span><b class="mono">{{ detail.startedAt ? fmtDateTime(detail.startedAt) : '—' }}</b>
          <span>结束</span><b class="mono">{{ detail.finishedAt ? fmtDateTime(detail.finishedAt) : '仍在运行' }}</b>
          <span>退出码</span><b class="mono">{{ detail.exitCode ?? '—' }}</b>
          <span>重启次数</span><b class="mono">{{ num(detail.restartCount) }}</b>
        </div>
        <template v-if="detail.command">
          <div class="sec-label" style="margin-top: 18px">启动命令</div>
          <pre class="stack">{{ detail.command }}</pre>
        </template>
        <template v-if="kvRows(detail.attrs).length">
          <div class="sec-label" style="margin-top: 18px">附加属性</div>
          <div class="dkv">
            <template v-for="a in kvRows(detail.attrs)" :key="a.k">
              <span class="mono">{{ a.k }}</span><b class="mono">{{ a.v }}</b>
            </template>
          </div>
        </template>
        <div v-if="detail.runId" style="margin-top: 20px">
          <button class="btn sm" @click="drillToRun(detail.runId); detail = null">查这次运行的日志</button>
        </div>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.dev-pick {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  color: var(--gray);
  flex: none;
}
.dev-pick .f-in {
  width: 190px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
}
.box {
  padding: 20px 22px;
}
.b-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.b-title {
  font-size: 15px;
  font-weight: 700;
}
.b-main {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 12px;
}
.b-main.mono {
  font-family: var(--mono);
}
.b-note {
  font-size: 12px;
  color: var(--gray-2);
  line-height: 1.6;
}
.kv {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 7px 12px;
  font-size: 13px;
  color: var(--gray);
}
.kv b {
  font: 600 13px/1.4 var(--mono);
  color: var(--ink-2);
}
.k {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.k::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 3px;
  background: currentColor;
}
.k.ok {
  color: var(--ok);
}
.k.warn {
  color: var(--warn);
}
.k.danger {
  color: var(--danger);
}
.k.info {
  color: var(--info);
}
.win-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  font-size: 12px;
  color: var(--gray-2);
  flex-wrap: wrap;
}
.lnk {
  font-size: 12px;
  font-weight: 600;
  color: var(--gray);
  background: var(--fill-2);
  border-radius: 8px;
  padding: 3px 9px;
}
.lnk.on {
  color: #fff;
  background: var(--ink);
}
/* 跳转型，不是选中态：用品牌色文字而不是实心黑块 */
.lnk.go {
  color: var(--brand-deep);
  background: var(--brand-soft);
}
.lnk.go:hover {
  background: #ffe6d6;
}
.filters {
  padding: 18px 20px;
}
.f-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 12px 14px;
}
.f {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.f.wide {
  grid-column: span 2;
}
.f > span {
  font-size: 12px;
  font-weight: 600;
  color: var(--gray);
}
.f-in {
  width: 100%;
  height: 36px;
  border: 1px solid var(--line-3);
  border-radius: 10px;
  background: #fff;
  padding: 0 11px;
  font-size: 13px;
  color: var(--ink);
  outline: none;
}
.f-in:focus {
  border-color: var(--brand);
}
.f-in.mono {
  font-family: var(--mono);
  font-size: 12px;
}
.f-act {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
}
.f-sp {
  flex: 1;
}
.btn.sm.adv em {
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: var(--brand);
  border-radius: 99px;
  padding: 1px 6px;
  margin-left: 6px;
}
.two {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.two b {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.two b.sm {
  font-size: 13px;
}
.two i {
  font: 500 11px/1.3 var(--mono);
  font-style: normal;
  color: var(--gray-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mono {
  font-family: var(--mono);
}
.sm {
  font-size: 12px;
  color: var(--gray);
}
.bad {
  color: var(--danger);
  font-weight: 600;
}
.msg {
  font-size: 13px;
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.val {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-2);
}
.dims {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  overflow: hidden;
}
.dim {
  font: 500 11px/1 var(--mono);
  color: var(--gray);
  background: var(--fill-2);
  border-radius: 6px;
  padding: 4px 7px;
  white-space: nowrap;
}
.gtable .trow:last-child {
  border-bottom: none;
}
.err-row {
  padding: 14px 20px;
  border-bottom: 1px solid var(--divider);
  cursor: pointer;
}
.err-row:last-child {
  border-bottom: none;
}
.err-row:hover {
  background: var(--panel-soft);
}
.er-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 7px;
  flex-wrap: wrap;
}
.er-src {
  font: 500 12px/1 var(--mono);
  color: var(--gray-2);
}
.er-msg {
  font-size: 13px;
  color: var(--ink-2);
  line-height: 1.6;
  word-break: break-word;
}
.er-cls {
  font-size: 11px;
  color: var(--danger);
  margin-top: 5px;
}
.d-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.d-msg {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.6;
  margin-bottom: 16px;
  word-break: break-word;
}
.dkv {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 9px 16px;
  font-size: 13px;
  color: var(--gray);
  align-items: baseline;
}
.dkv b {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-2);
  word-break: break-all;
}
.err-box {
  background: var(--danger-bg);
  border-radius: 14px;
  padding: 13px 15px;
}
.eb-t {
  font-size: 12px;
  font-weight: 700;
  color: var(--danger);
  margin-bottom: 6px;
  word-break: break-all;
}
.eb-s {
  font-size: 13px;
  color: var(--ink-2);
  line-height: 1.6;
  word-break: break-word;
}
.stack {
  font: 500 11.5px/1.65 var(--mono);
  color: var(--ink-2);
  background: var(--fill-2);
  border-radius: 12px;
  padding: 13px 15px;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
