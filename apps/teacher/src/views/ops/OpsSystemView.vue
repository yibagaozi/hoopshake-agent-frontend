<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { circuitLabel, circuitTone, errText, num, opsApi } from '@hoopshake/core'
import { toast } from '../../toast.js'
import OpsTabs from '../../components/OpsTabs.vue'

const loading = ref(true)
const sys = ref(null)
const updatedAt = ref('')
/** Grafana 面板地址存本地，不同环境各填各的，不进构建产物 */
const GRAFANA_KEY = 'hoopshake.ops.grafanaUrl'
const grafanaUrl = ref(localStorage.getItem(GRAFANA_KEY) || '')
const editingGrafana = ref(false)
const grafanaDraft = ref('')

let timer = null

const streams = computed(() => sys.value?.llmStreams || null)
const rate = computed(() => sys.value?.askRateLimit || null)

/** 并发舱壁占用比例，用来画那根条 */
const streamPct = computed(() => {
  const s = streams.value
  if (!s?.max) return 0
  return Math.min(100, Math.round(((s.active || 0) / s.max) * 100))
})

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    sys.value = await opsApi.system()
    updatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch (err) {
    if (!silent) toast.err(errText(err, '加载系统健康失败'))
  } finally {
    loading.value = false
  }
}

function saveGrafana() {
  const v = grafanaDraft.value.trim()
  grafanaUrl.value = v
  if (v) localStorage.setItem(GRAFANA_KEY, v)
  else localStorage.removeItem(GRAFANA_KEY)
  editingGrafana.value = false
}

onMounted(() => {
  load()
  timer = setInterval(() => load(true), 15000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div>
        <h2 class="page-title">系统健康</h2>
        <p class="page-sub">
          LLM 熔断、并发舱壁与限流的实时快照 · 每 15 秒刷新
          <template v-if="updatedAt"> · 更新于 {{ updatedAt }}</template>
        </p>
      </div>
      <button class="btn" :disabled="loading" @click="load()">{{ loading ? '刷新中…' : '刷新' }}</button>
    </div>

    <OpsTabs />

    <div class="content">
      <div v-if="loading" class="grid">
        <div v-for="i in 3" :key="i" class="panel box"><div class="skeleton" style="height: 120px"></div></div>
      </div>

      <template v-else>
        <div class="grid">
          <!-- 熔断器 -->
          <div class="panel box">
            <div class="b-head">
              <span class="b-title">LLM 熔断器</span>
              <span class="pill" :class="circuitTone(sys?.circuit?.state)">
                <span class="dot"></span>{{ circuitLabel(sys?.circuit?.state) }}
              </span>
            </div>
            <div class="b-main">{{ sys?.llmEnabled ? '已启用' : '未启用' }}</div>
            <div class="b-note">
              LLM 未启用时熔断状态为空。OPEN 表示已熔断，对话接口会返回 50310；
              HALF_OPEN 是恢复探测中。
            </div>
          </div>

          <!-- 并发舱壁 -->
          <div class="panel box">
            <div class="b-head">
              <span class="b-title">并发流（舱壁）</span>
              <span class="pill" :class="streamPct >= 90 ? 'danger' : streamPct >= 60 ? 'warn' : 'ok'">
                {{ streamPct }}%
              </span>
            </div>
            <div class="b-main mono">
              {{ num(streams?.active) }}<i> / {{ num(streams?.max) }}</i>
            </div>
            <div class="bar"><div class="fill" :style="{ width: streamPct + '%' }"></div></div>
            <div class="kv">
              <span>可用</span><b>{{ num(streams?.available) }}</b>
              <span>已拒绝</span><b :class="{ bad: streams?.rejected > 0 }">{{ num(streams?.rejected) }}</b>
            </div>
          </div>

          <!-- 限流 -->
          <div class="panel box">
            <div class="b-head">
              <span class="b-title">提问限流（令牌桶）</span>
              <span class="pill" :class="rate?.rejected > 0 ? 'warn' : 'ok'">
                {{ rate?.rejected > 0 ? '有拒绝' : '正常' }}
              </span>
            </div>
            <div class="b-main mono">{{ num(rate?.rejected) }}<i> 次拒绝</i></div>
            <div class="kv">
              <span>在追踪的 key</span><b>{{ num(rate?.trackedKeys) }}</b>
            </div>
          </div>
        </div>

        <div class="sec-label" style="margin-top: 26px">时序指标</div>
        <div class="panel graf">
          <div v-if="!grafanaUrl && !editingGrafana" class="graf-empty">
            <div class="ge-t">尚未接入 Grafana</div>
            <div class="ge-s">
              趋势数据在 <code>/actuator/prometheus</code>，指标名
              <code>hoopshake.llm.circuit.state</code>、<code>hoopshake.llm.stream.*</code>、
              <code>hoopshake.ask.ratelimit.*</code>。<br />
              填入一个 Grafana 面板的嵌入地址即可在这里直接看。
            </div>
            <button class="btn primary" @click="grafanaDraft = grafanaUrl; editingGrafana = true">
              填写面板地址
            </button>
          </div>

          <div v-else-if="editingGrafana" class="graf-edit">
            <div class="fld">
              <label>Grafana 嵌入地址</label>
              <input v-model="grafanaDraft" class="txt" placeholder="https://grafana.example.com/d-solo/xxx?panelId=1&kiosk" />
            </div>
            <div class="ge-s" style="margin: 10px 0 14px">
              只存在本机浏览器里，不进构建产物。面板需允许被本站内嵌
              （Grafana 侧放开 <code>allow_embedding</code> 与 <code>X-Frame-Options</code>）。
            </div>
            <div style="display: flex; gap: 10px">
              <button class="btn" @click="editingGrafana = false">取消</button>
              <button class="btn primary" @click="saveGrafana">保存</button>
            </div>
          </div>

          <template v-else>
            <div class="graf-bar">
              <span class="gb-url">{{ grafanaUrl }}</span>
              <button class="btn sm" @click="grafanaDraft = grafanaUrl; editingGrafana = true">更换</button>
            </div>
            <iframe :src="grafanaUrl" class="graf-frame" referrerpolicy="no-referrer"></iframe>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
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
  margin-bottom: 14px;
}
.b-title {
  font-size: 15px;
  font-weight: 700;
}
.b-main {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.b-main.mono {
  font-family: var(--mono);
}
.b-main i {
  font-style: normal;
  font-size: 14px;
  font-weight: 500;
  color: var(--gray);
}
.b-note {
  font-size: 12px;
  color: var(--gray-2);
  line-height: 1.6;
  margin-top: 12px;
}
.bar {
  height: 7px;
  border-radius: 99px;
  background: var(--fill-2);
  overflow: hidden;
  margin: 14px 0 12px;
}
.bar .fill {
  height: 100%;
  border-radius: 99px;
  background: var(--brand);
  transition: width 0.3s;
}
.kv {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px 12px;
  font-size: 13px;
  color: var(--gray);
}
.kv b {
  font: 600 13px/1 var(--mono);
  color: var(--ink-2);
}
.kv b.bad {
  color: var(--danger);
}
.graf {
  padding: 0;
  overflow: hidden;
}
.graf-empty,
.graf-edit {
  padding: 30px 26px;
  max-width: 620px;
}
.ge-t {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 10px;
}
.ge-s {
  font-size: 13px;
  color: var(--gray);
  line-height: 1.75;
  margin-bottom: 16px;
}
.ge-s code {
  font: 500 12px/1 var(--mono);
  background: var(--fill-2);
  border-radius: 5px;
  padding: 2px 6px;
}
.graf-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--line);
}
.gb-url {
  flex: 1;
  min-width: 0;
  font: 500 12px/1.4 var(--mono);
  color: var(--gray);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.graf-frame {
  width: 100%;
  height: 420px;
  border: none;
  display: block;
}
</style>
