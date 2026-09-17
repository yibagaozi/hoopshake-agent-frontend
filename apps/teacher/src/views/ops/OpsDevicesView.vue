<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  edgeHealthLabel,
  edgeHealthTone,
  errText,
  fmtDateTime,
  isCode,
  num,
  opsApi,
} from '@hoopshake/core'
import { toast } from '../../toast.js'
import Modal from '../../components/Modal.vue'
import OpsTabs from '../../components/OpsTabs.vue'

const router = useRouter()
const loading = ref(true)
const summary = ref(null)
const devices = ref([])
const filter = ref('ALL')
const updatedAt = ref('')

const detailOpen = ref(false)
const detailLoading = ref(false)
const detail = ref(null)

let timer = null

const filtered = computed(() =>
  filter.value === 'ALL' ? devices.value : devices.value.filter((d) => d.health === filter.value)
)

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    // 一次拉全，筛选在前端做——summary 是全量口径，按 health 查询会让计数跟着变
    const res = await opsApi.devices()
    summary.value = res?.summary || null
    devices.value = res?.devices || []
    updatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch (err) {
    if (!silent) toast.err(errText(err, '加载设备列表失败'))
  } finally {
    loading.value = false
  }
}

async function openDetail(d) {
  detailOpen.value = true
  detailLoading.value = true
  detail.value = d
  try {
    detail.value = await opsApi.device(d.deviceId)
  } catch (err) {
    if (isCode(err, 40400)) {
      toast.err('该设备已不存在，可能刚被移除')
      detailOpen.value = false
      load(true)
    } else {
      toast.err(errText(err, '加载设备详情失败'))
    }
  } finally {
    detailLoading.value = false
  }
}

/** metrics 是自由对象，键名随固件版本变，所以按拿到什么显示什么 */
const metricRows = computed(() => {
  const m = detail.value?.metrics
  if (!m || typeof m !== 'object') return []
  return Object.entries(m).map(([k, v]) => ({ k, v: typeof v === 'object' ? JSON.stringify(v) : String(v) }))
})

onMounted(() => {
  load()
  // 健康是后端读时按 lastSeenAt 派生的，不是存字段，所以必须定时重拉
  timer = setInterval(() => load(true), 20000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div>
        <h2 class="page-title">边缘设备</h2>
        <p class="page-sub">
          健康状态按最近一次心跳实时推算 · 每 20 秒刷新
          <template v-if="updatedAt"> · 更新于 {{ updatedAt }}</template>
        </p>
      </div>
      <button class="btn" :disabled="loading" @click="load()">{{ loading ? '刷新中…' : '刷新' }}</button>
    </div>

    <OpsTabs />

    <div class="filter-bar">
      <div class="chips">
        <button class="chip" :class="{ on: filter === 'ALL' }" @click="filter = 'ALL'">
          全部 {{ num(summary?.total) }}
        </button>
        <button class="chip" :class="{ on: filter === 'ONLINE' }" @click="filter = 'ONLINE'">
          在线 {{ num(summary?.online) }}
        </button>
        <button class="chip" :class="{ on: filter === 'STALE' }" @click="filter = 'STALE'">
          失联中 {{ num(summary?.stale) }}
        </button>
        <button class="chip" :class="{ on: filter === 'OFFLINE' }" @click="filter = 'OFFLINE'">
          离线 {{ num(summary?.offline) }}
        </button>
      </div>
    </div>

    <div class="content" style="padding: 0 32px 24px; overflow: hidden; display: flex; flex-direction: column">
      <div class="gtable" style="flex: 1; overflow: hidden; --cols: 1.8fr 1.2fr 1fr 1fr 1.3fr 1.4fr">
        <div class="thead">
          <span>设备</span>
          <span>场地</span>
          <span>健康</span>
          <span>版本</span>
          <span>IP</span>
          <span>最近心跳</span>
        </div>
        <div style="flex: 1; overflow-y: auto">
          <div v-if="loading" style="padding: 22px 24px">
            <div v-for="i in 5" :key="i" class="skeleton" style="height: 38px; margin-bottom: 12px"></div>
          </div>
          <div v-else-if="!filtered.length" class="empty-hint">
            {{ devices.length ? '没有该状态的设备' : '还没有设备上报心跳' }}
          </div>
          <div
            v-else
            v-for="d in filtered"
            :key="d.deviceId"
            class="trow"
            :class="{ hl: d.health === 'OFFLINE' }"
            @click="openDetail(d)"
          >
            <span class="dev">
              <b>{{ d.name || d.deviceId }}</b>
              <i>{{ d.deviceId }}</i>
            </span>
            <span>{{ d.courtId || '—' }}</span>
            <span>
              <span class="pill" :class="edgeHealthTone(d.health)">
                <span class="dot"></span>{{ edgeHealthLabel(d.health) }}
              </span>
            </span>
            <span class="mono sm">{{ d.appVersion || '—' }}</span>
            <span class="mono sm">{{ d.ipAddress || '—' }}</span>
            <span class="mono sm">{{ d.lastSeenAt ? fmtDateTime(d.lastSeenAt) : '从未上报' }}</span>
          </div>
        </div>
      </div>

      <div class="legend">
        在线 = 90 秒内有心跳 · 失联中 = 10 分钟内 · 超过即离线。阈值由后端
        <code>hoopshake.ops.edge.online-within / offline-after</code> 决定。
      </div>
    </div>

    <Modal :open="detailOpen" :title="detail?.name || detail?.deviceId || '设备详情'" @close="detailOpen = false">
      <div v-if="detailLoading" class="skeleton" style="height: 200px"></div>
      <template v-else-if="detail">
        <div class="d-top">
          <span class="pill" :class="edgeHealthTone(detail.health)">
            <span class="dot"></span>{{ edgeHealthLabel(detail.health) }}
          </span>
          <span v-if="detail.reportedStatus" class="pill muted">上报状态 {{ detail.reportedStatus }}</span>
        </div>

        <div class="kv">
          <span>设备 ID</span><b class="mono">{{ detail.deviceId }}</b>
          <span>场地</span><b>{{ detail.courtId || '—' }}</b>
          <span>应用版本</span><b class="mono">{{ detail.appVersion || '—' }}</b>
          <span>固件</span><b class="mono">{{ detail.firmware || '—' }}</b>
          <span>IP</span><b class="mono">{{ detail.ipAddress || '—' }}</b>
          <span>最近心跳</span><b class="mono">{{ detail.lastSeenAt ? fmtDateTime(detail.lastSeenAt) : '从未上报' }}</b>
        </div>

        <div class="d-act">
          <button class="btn sm" @click="router.push({ path: '/ops/telemetry', query: { edgeId: detail.deviceId } })">
            查看这台的遥测
          </button>
        </div>

        <div v-if="detail.lastError" class="err-box">
          <div class="eb-t">最近一次错误</div>
          <div class="eb-s">{{ detail.lastError }}</div>
        </div>

        <div class="sec-label" style="margin-top: 20px">设备指标</div>
        <div v-if="!metricRows.length" class="empty-hint" style="padding: 18px">本次心跳未携带指标</div>
        <div v-else class="kv">
          <template v-for="m in metricRows" :key="m.k">
            <span class="mono">{{ m.k }}</span><b class="mono">{{ m.v }}</b>
          </template>
        </div>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.dev {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.dev b {
  font-size: 14px;
  font-weight: 600;
}
.dev i {
  font: 500 11px/1 var(--mono);
  font-style: normal;
  color: var(--gray-2);
}
.mono {
  font-family: var(--mono);
}
.sm {
  font-size: 12px;
  color: var(--gray);
}
.legend {
  flex: none;
  margin-top: 14px;
  font-size: 12px;
  color: var(--gray-2);
  line-height: 1.6;
}
.legend code {
  font: 500 11px/1 var(--mono);
  background: var(--fill-2);
  border-radius: 5px;
  padding: 2px 6px;
}
.d-top {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
}
.kv {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 10px 16px;
  font-size: 13px;
  color: var(--gray);
  align-items: baseline;
}
.kv b {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-2);
  word-break: break-all;
}
.d-act {
  margin-top: 18px;
}
.err-box {
  margin-top: 18px;
  background: var(--danger-bg);
  border-radius: 14px;
  padding: 14px 16px;
}
.eb-t {
  font-size: 13px;
  font-weight: 700;
  color: var(--danger);
  margin-bottom: 6px;
}
.eb-s {
  font: 500 12px/1.6 var(--mono);
  color: var(--ink-2);
  word-break: break-all;
}
</style>
