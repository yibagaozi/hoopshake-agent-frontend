<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { circuitLabel, circuitTone, errText, num, opsApi } from '@hoopshake/core'
import { toast } from '../../toast.js'
import OpsTabs from '../../components/OpsTabs.vue'

const loading = ref(true)
const sys = ref(null)
const updatedAt = ref('')

/*
 * Grafana 嵌入地址改由后端下发（GET /api/ops/grafana）。
 *
 * 原来是让人在页面上填一个地址存 localStorage —— 那份配置只活在这一台
 * 浏览器里，换台机器就没了，而且页面上摆个输入框会让人以为这是业务配置。
 * 现在跟 edge 的接口地址一样：读配置，页面不留输入口。
 */
const graf = ref(null)
const grafLoaded = ref(false)
/** 指标名那一大段是给「要建面板的人」看的，默认收起，别常驻占半屏 */
const metricsOpen = ref(false)

/** 没配就整块不渲染。这不是错误，是这套环境还没接 Grafana */
const grafReady = computed(() => grafLoaded.value && graf.value?.configured === true && !!graf.value?.embedUrl)
const grafHeight = computed(() => Number(graf.value?.embedHeight) || 600)

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

async function loadGrafana() {
  try {
    graf.value = await opsApi.grafana()
  } catch {
    // 拿不到就按未配置处理：宁可不显示，也别显示一个空白 iframe
    graf.value = null
  } finally {
    grafLoaded.value = true
  }
}

onMounted(() => {
  load()
  // 嵌入地址是配置项，一次就够，不跟着 15 秒轮询走
  loadGrafana()
  timer = setInterval(() => load(true), 15000)
})
onBeforeUnmount(() => clearInterval(timer))

// 老版本把地址存在这儿，现在改由后端下发，顺手清掉
try {
  localStorage.removeItem('hoopshake.ops.grafanaUrl')
} catch {
  /* 隐私模式等场景忽略 */
}
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

        <!-- 后端没配 Grafana 时整块不渲染：空 iframe 看着像挂了 -->
        <template v-if="grafReady">
          <div class="graf-head" style="margin-top: 26px">
            <span class="sec-label" style="margin: 0">时序指标</span>
            <span style="display: flex; align-items: center; gap: 10px">
              <button class="lnk" @click="metricsOpen = !metricsOpen">
                {{ metricsOpen ? '收起指标名' : '指标名' }}
              </button>
              <a
                v-if="graf?.dashboardUrl"
                class="btn sm"
                :href="graf.dashboardUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                在 Grafana 中打开
              </a>
            </span>
          </div>
          <div class="panel graf">
            <iframe
              :src="graf.embedUrl"
              class="graf-frame"
              :style="{ height: grafHeight + 'px' }"
              referrerpolicy="no-referrer"
              loading="lazy"
            ></iframe>
          </div>
        </template>

        <!-- 没配就一行说明带过，不给「填写地址」那种会误导的入口 -->
        <div v-else-if="grafLoaded" class="graf-off">
          <span>趋势曲线需要 Grafana，这套环境还没接。</span>
          <button class="lnk" @click="metricsOpen = !metricsOpen">
            {{ metricsOpen ? '收起接入说明' : '怎么接' }}
          </button>
        </div>

        <!-- 接入步骤与指标名。给要建面板的人看，默认收起 -->
        <div v-if="metricsOpen" class="panel metrics-doc">
          <div class="md-h">接入 Grafana</div>
          <div class="md-s">
            后端不出图，只把数据源 <code>{{ graf?.metricsPath || '/actuator/prometheus' }}</code>
            暴露给 Grafana 采集。抓取要带 <code>X-Service-Token</code>（人工 curl 用管理员 JWT），
            面板建在你们自己的 Grafana 上，再把单面板地址
            （<code>/d-solo/...&kiosk</code>）配进后端 <code>GRAFANA_EMBED_URL</code>，
            这里就会换成真面板。
          </div>

          <div class="md-h">建面板用的指标名</div>
          <div class="md-s">
            PromQL 里点要写成下划线。<br />
            <code>hoopshake_llm_stream_active</code> /
            <code>hoopshake_llm_stream_available</code> /
            <code>hoopshake_ask_ratelimit_keys</code> —— gauge，瞬时值。<br />
            <code>hoopshake_llm_stream_rejected_total</code> /
            <code>hoopshake_ask_ratelimit_rejected_total</code> —— counter，累计值，
            用 <code>rate()</code> / <code>increase()</code> 看。
            <b>这两个名字刚变过</b>（原来是 gauge、没有 <code>_total</code>），
            旧面板的查询会静默变成 No data。<br />
            <code>hoopshake_llm_circuit_state</code>（0=CLOSED 1=OPEN 2=HALF_OPEN）
            只在开了 agent 的环境才注册，<b>No data 不等于熔断器健康</b>，
            告警用 <code>absent()</code> 区分。
          </div>
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
.graf-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.graf-none {
  padding: 26px 24px;
  max-width: 700px;
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
.graf-frame {
  width: 100%;
  border: none;
  display: block;
}
.graf-off {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  font-size: 13px;
  color: var(--gray-2);
}
.lnk {
  font-size: 12px;
  font-weight: 600;
  color: var(--brand-deep);
  background: var(--brand-soft);
  border-radius: 8px;
  padding: 4px 10px;
}
.metrics-doc {
  margin-top: 14px;
  padding: 20px 22px;
  max-width: 760px;
}
.md-h {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-2);
  margin-bottom: 8px;
}
.md-h + .md-s {
  margin-bottom: 18px;
}
.md-s:last-child {
  margin-bottom: 0;
}
.md-s {
  font-size: 12px;
  color: var(--gray);
  line-height: 1.95;
}
.md-s code {
  font: 500 11px/1 var(--mono);
  background: var(--fill-2);
  border-radius: 5px;
  padding: 2px 6px;
}
.md-s b {
  color: var(--ink-2);
}
</style>
