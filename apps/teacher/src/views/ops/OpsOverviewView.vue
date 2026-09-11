<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { circuitLabel, circuitTone, errText, num, opsApi, pct } from '@hoopshake/core'
import { toast } from '../../toast.js'
import OpsTabs from '../../components/OpsTabs.vue'

const router = useRouter()
const loading = ref(true)
const data = ref(null)
const windowHours = ref(24)
const updatedAt = ref('')

let timer = null

const business = computed(() => data.value?.business || null)
const agent = computed(() => data.value?.agent || null)
const system = computed(() => data.value?.system || null)
const edge = computed(() => data.value?.edge?.summary || data.value?.edge || null)

/**
 * 四盏灯的口径，都往「有问题才变色」上靠：
 * 业务量没有健康与否之说，恒为中性；其余三项按文档里的告警意义判断。
 */
const lamps = computed(() => {
  const e = edge.value
  const a = agent.value
  const s = system.value
  return {
    business: 'ok',
    agent: !a
      ? 'muted'
      : a.degradedRate > 0.2 || a.toolErrorRate > 0.1
        ? 'danger'
        : a.degradedRate > 0.05 || a.toolErrorRate > 0.03
          ? 'warn'
          : 'ok',
    system: !s ? 'muted' : !s.llmEnabled ? 'muted' : circuitTone(s.circuit?.state),
    edge: !e ? 'muted' : e.offline > 0 ? 'danger' : e.stale > 0 ? 'warn' : 'ok',
  }
})

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    data.value = await opsApi.overview(windowHours.value)
    updatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch (err) {
    if (!silent) toast.err(errText(err, '加载运维总览失败'))
  } finally {
    loading.value = false
  }
}

function setWindow(h) {
  if (windowHours.value === h) return
  windowHours.value = h
  load()
}

onMounted(() => {
  load()
  // 设备健康是读时按 lastSeenAt 派生的，不定时重拉的话状态会停在打开页面那一刻
  timer = setInterval(() => load(true), 30000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div>
        <h2 class="page-title">运维总览</h2>
        <p class="page-sub">
          全平台现状快照 · 每 30 秒自动刷新
          <template v-if="updatedAt"> · 更新于 {{ updatedAt }}</template>
        </p>
      </div>
      <button class="btn" :disabled="loading" @click="load()">{{ loading ? '刷新中…' : '刷新' }}</button>
    </div>

    <OpsTabs />

    <div class="content">
      <div v-if="loading" class="cards">
        <div v-for="i in 4" :key="i" class="panel card"><div class="skeleton" style="height: 150px"></div></div>
      </div>

      <template v-else>
        <div class="cards">
          <!-- 业务量 -->
          <div class="panel card" @click="router.push('/lessons')">
            <div class="c-head">
              <span class="lamp" :class="lamps.business"></span>
              <span class="c-title">业务量</span>
            </div>
            <div class="big">{{ num(business?.students) }}<i> 名学生</i></div>
            <div class="rows">
              <div class="r"><span>教师</span><b>{{ num(business?.teachers) }}</b></div>
              <div class="r"><span>课程</span><b>{{ num(business?.lessons?.total) }}</b></div>
              <div class="r sub">
                <span>进行中 / 未开课 / 已结课</span>
                <b>{{ num(business?.lessons?.ongoing) }} / {{ num(business?.lessons?.planned) }} / {{ num(business?.lessons?.finished) }}</b>
              </div>
              <div class="r"><span>训练场次</span><b>{{ num(business?.trainingSessions) }}</b></div>
            </div>
          </div>

          <!-- Agent 表现 -->
          <div class="panel card" @click="router.push('/ops/agent')">
            <div class="c-head">
              <span class="lamp" :class="lamps.agent"></span>
              <span class="c-title">Agent 表现</span>
              <span class="c-win">{{ agent?.windowHours ?? windowHours }}h</span>
            </div>
            <div class="big">{{ pct(agent?.degradedRate) }}<i> 降级率</i></div>
            <div class="rows">
              <div class="r"><span>应答次数</span><b>{{ num(agent?.answeredRuns) }}</b></div>
              <div class="r"><span>RAG 命中率</span><b>{{ pct(agent?.ragHitRate) }}</b></div>
              <div class="r"><span>工具错误率</span><b>{{ pct(agent?.toolErrorRate) }}</b></div>
              <div class="r"><span>平均回答字数</span><b>{{ num(agent?.avgAnswerChars) }}</b></div>
            </div>
          </div>

          <!-- 系统健康 -->
          <div class="panel card" @click="router.push('/ops/system')">
            <div class="c-head">
              <span class="lamp" :class="lamps.system"></span>
              <span class="c-title">系统健康</span>
            </div>
            <div class="big sm">{{ circuitLabel(system?.circuit?.state) }}</div>
            <div class="rows">
              <div class="r"><span>LLM</span><b>{{ system?.llmEnabled ? '已启用' : '未启用' }}</b></div>
              <div class="r">
                <span>并发流</span>
                <b>{{ num(system?.llmStreams?.active) }} / {{ num(system?.llmStreams?.max) }}</b>
              </div>
              <div class="r"><span>流被拒</span><b>{{ num(system?.llmStreams?.rejected) }}</b></div>
              <div class="r"><span>限流拒绝</span><b>{{ num(system?.askRateLimit?.rejected) }}</b></div>
            </div>
          </div>

          <!-- 边缘设备 -->
          <div class="panel card" @click="router.push('/ops/devices')">
            <div class="c-head">
              <span class="lamp" :class="lamps.edge"></span>
              <span class="c-title">边缘设备</span>
            </div>
            <div class="big">{{ num(edge?.online) }}<i> / {{ num(edge?.total) }} 在线</i></div>
            <div class="rows">
              <div class="r"><span class="k ok">在线</span><b>{{ num(edge?.online) }}</b></div>
              <div class="r"><span class="k warn">失联中</span><b>{{ num(edge?.stale) }}</b></div>
              <div class="r"><span class="k danger">离线</span><b>{{ num(edge?.offline) }}</b></div>
            </div>
          </div>
        </div>

        <div class="sec-label" style="margin-top: 26px">数据量</div>
        <div class="panel vol">
          <div class="v" v-for="v in [
            { k: '动作片段', n: business?.dataVolume?.actionClips },
            { k: '即时反馈', n: business?.dataVolume?.instantFeedback },
            { k: '对话会话', n: business?.dataVolume?.chatSessions },
            { k: '对话消息', n: business?.dataVolume?.chatMessages },
            { k: '知识库文档', n: business?.dataVolume?.knowledgeDocuments },
          ]" :key="v.k">
            <div class="vn">{{ num(v.n) }}</div>
            <div class="vk">{{ v.k }}</div>
          </div>
        </div>

        <div class="foot-note">
          趋势曲线接 Grafana（<code>/actuator/prometheus</code>），看板只给现状快照。
          窗口：
          <button class="lnk" :class="{ on: windowHours === 24 }" @click="setWindow(24)">24h</button>
          <button class="lnk" :class="{ on: windowHours === 72 }" @click="setWindow(72)">72h</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 18px;
}
.card {
  padding: 20px 22px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.card:hover {
  border-color: var(--line-3);
  transform: translateY(-1px);
}
.c-head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 14px;
}
.c-title {
  font-size: 15px;
  font-weight: 700;
}
.c-win {
  margin-left: auto;
  font: 600 11px/1 var(--mono);
  color: var(--gray-2);
  background: var(--fill-2);
  border-radius: 99px;
  padding: 4px 8px;
}
.lamp {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
  background: var(--gray-3);
}
.lamp.ok {
  background: var(--ok);
  box-shadow: 0 0 0 3px var(--ok-bg);
}
.lamp.warn {
  background: var(--warn);
  box-shadow: 0 0 0 3px var(--warn-bg);
}
.lamp.danger {
  background: var(--danger);
  box-shadow: 0 0 0 3px var(--danger-bg);
}
.lamp.muted {
  background: var(--gray-3);
}
.big {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 14px;
}
.big.sm {
  font-size: 20px;
}
.big i {
  font-style: normal;
  font-size: 13px;
  font-weight: 500;
  color: var(--gray);
  margin-left: 5px;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.r {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--gray);
}
.r.sub {
  font-size: 12px;
  color: var(--gray-2);
}
.r b {
  font: 600 13px/1 var(--mono);
  color: var(--ink-2);
}
.r .k {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.r .k::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.r .k.ok {
  color: var(--ok);
}
.r .k.warn {
  color: var(--warn);
}
.r .k.danger {
  color: var(--danger);
}
.vol {
  display: flex;
  flex-wrap: wrap;
  padding: 18px 0;
}
.v {
  flex: 1;
  min-width: 130px;
  text-align: center;
  padding: 4px 12px;
  border-right: 1px solid var(--divider);
}
.v:last-child {
  border-right: none;
}
.vn {
  font: 700 22px/1 var(--mono);
  letter-spacing: -0.02em;
}
.vk {
  font-size: 12px;
  color: var(--gray);
  margin-top: 7px;
}
.foot-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 22px;
  font-size: 12px;
  color: var(--gray-2);
}
.foot-note code {
  font: 500 11px/1 var(--mono);
  background: var(--fill-2);
  border-radius: 5px;
  padding: 3px 6px;
}
.lnk {
  font-size: 12px;
  font-weight: 600;
  color: var(--gray);
  border-radius: 7px;
  padding: 3px 8px;
}
.lnk.on {
  color: var(--brand-deep);
  background: var(--brand-soft);
}
</style>
