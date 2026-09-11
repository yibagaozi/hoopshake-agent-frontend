<script setup>
import { computed, onMounted, ref } from 'vue'
import { errText, num, opsApi, pct } from '@hoopshake/core'
import { toast } from '../../toast.js'
import OpsTabs from '../../components/OpsTabs.vue'

const loading = ref(true)
const q = ref(null)
const windowHours = ref(24)
const updatedAt = ref('')

/** 告警阈值前端配（ops-frontend-api §5.3），黄=注意、红=要查 */
const THRESHOLD = {
  degradedRate: { warn: 0.05, bad: 0.2 },
  toolErrorRate: { warn: 0.03, bad: 0.1 },
}

function tone(value, key) {
  if (value === null || value === undefined) return 'muted'
  const t = THRESHOLD[key]
  if (value >= t.bad) return 'danger'
  if (value >= t.warn) return 'warn'
  return 'ok'
}

const tool = computed(() => q.value?.tool || null)
const toolTotal = computed(() => {
  const t = tool.value
  if (!t) return 0
  return (t.ok || 0) + (t.deny || 0) + (t.error || 0)
})

/** 工具调用三段条，没有样本时不画 */
const toolBars = computed(() => {
  const t = tool.value
  const total = toolTotal.value
  if (!t || !total) return []
  return [
    { k: 'ok', label: '成功', n: t.ok || 0, cls: 'ok' },
    { k: 'deny', label: '被拒', n: t.deny || 0, cls: 'warn' },
    { k: 'error', label: '出错', n: t.error || 0, cls: 'danger' },
  ].map((b) => ({ ...b, pctOf: (b.n / total) * 100 }))
})

async function load() {
  loading.value = true
  try {
    q.value = await opsApi.agentQuality(windowHours.value)
    updatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch (err) {
    toast.err(errText(err, '加载 Agent 表现失败'))
  } finally {
    loading.value = false
  }
}

function setWindow(h) {
  if (windowHours.value === h) return
  windowHours.value = h
  load()
}

onMounted(load)
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div>
        <h2 class="page-title">Agent 表现</h2>
        <p class="page-sub">
          近 {{ q?.windowHours ?? windowHours }} 小时窗口内的应答质量
          <template v-if="updatedAt"> · 更新于 {{ updatedAt }}</template>
        </p>
      </div>
      <div style="display: flex; align-items: center; gap: 10px">
        <div class="chips">
          <button class="chip" :class="{ on: windowHours === 24 }" @click="setWindow(24)">24 小时</button>
          <button class="chip" :class="{ on: windowHours === 72 }" @click="setWindow(72)">72 小时</button>
        </div>
        <button class="btn" :disabled="loading" @click="load">{{ loading ? '刷新中…' : '刷新' }}</button>
      </div>
    </div>

    <OpsTabs />

    <div class="content">
      <div v-if="loading" class="grid">
        <div v-for="i in 4" :key="i" class="panel box"><div class="skeleton" style="height: 110px"></div></div>
      </div>

      <template v-else>
        <div class="grid">
          <div class="panel box">
            <div class="b-title">降级率</div>
            <div class="b-main" :class="tone(q?.degradedRate, 'degradedRate')">{{ pct(q?.degradedRate) }}</div>
            <div class="b-sub">{{ num(q?.degradedRuns) }} / {{ num(q?.answeredRuns) }} 次应答降级</div>
          </div>
          <div class="panel box">
            <div class="b-title">RAG 命中率</div>
            <div class="b-main">{{ pct(q?.ragHitRate) }}</div>
            <div class="b-sub">{{ num(q?.ragHitRuns) }} 次命中知识库</div>
          </div>
          <div class="panel box">
            <div class="b-title">工具错误率</div>
            <div class="b-main" :class="tone(q?.toolErrorRate, 'toolErrorRate')">{{ pct(q?.toolErrorRate) }}</div>
            <div class="b-sub">{{ num(tool?.error) }} / {{ num(toolTotal) }} 次调用出错</div>
          </div>
          <div class="panel box">
            <div class="b-title">平均回答字数</div>
            <div class="b-main">{{ num(q?.avgAnswerChars) }}</div>
            <div class="b-sub">窗口内全部应答的均值</div>
          </div>
        </div>

        <div class="sec-label" style="margin-top: 26px">工具调用分布</div>
        <div class="panel tools">
          <div v-if="!toolBars.length" class="empty-hint" style="padding: 20px">窗口内没有工具调用</div>
          <template v-else>
            <div class="tbar">
              <div
                v-for="b in toolBars"
                :key="b.k"
                class="tseg"
                :class="b.cls"
                :style="{ width: b.pctOf + '%' }"
                :title="`${b.label} ${b.n}`"
              ></div>
            </div>
            <div class="tlegend">
              <span v-for="b in toolBars" :key="b.k" class="tl">
                <i :class="b.cls"></i>{{ b.label }}
                <b>{{ num(b.n) }}</b>
                <em>{{ b.pctOf.toFixed(1) }}%</em>
              </span>
            </div>
          </template>
        </div>

        <div class="note">
          数据从 <code>chat_message.detail-&gt;'quality'</code> 按窗口聚合。窗内无样本时后端返回空值，
          这里显示「—」而不是 0%，两者含义不同。<br />
          阈值是前端配的：降级率 ≥5% 黄、≥20% 红；工具错误率 ≥3% 黄、≥10% 红。
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 18px;
}
.box {
  padding: 20px 22px;
}
.b-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--gray);
  margin-bottom: 12px;
}
.b-main {
  font: 700 32px/1 var(--mono);
  letter-spacing: -0.02em;
}
.b-main.ok {
  color: var(--ok);
}
.b-main.warn {
  color: var(--warn);
}
.b-main.danger {
  color: var(--danger);
}
.b-main.muted {
  color: var(--gray-3);
}
.b-sub {
  font-size: 12px;
  color: var(--gray-2);
  margin-top: 11px;
}
.tools {
  padding: 22px;
}
.tbar {
  display: flex;
  height: 14px;
  border-radius: 99px;
  overflow: hidden;
  background: var(--fill-2);
}
.tseg.ok {
  background: var(--ok);
}
.tseg.warn {
  background: var(--warn);
}
.tseg.danger {
  background: var(--danger);
}
.tlegend {
  display: flex;
  flex-wrap: wrap;
  gap: 22px;
  margin-top: 16px;
}
.tl {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--gray);
}
.tl i {
  width: 9px;
  height: 9px;
  border-radius: 3px;
}
.tl i.ok {
  background: var(--ok);
}
.tl i.warn {
  background: var(--warn);
}
.tl i.danger {
  background: var(--danger);
}
.tl b {
  font: 600 13px/1 var(--mono);
  color: var(--ink-2);
}
.tl em {
  font-style: normal;
  font-size: 12px;
  color: var(--gray-2);
}
.note {
  margin-top: 22px;
  font-size: 12px;
  color: var(--gray-2);
  line-height: 1.8;
}
.note code {
  font: 500 11px/1 var(--mono);
  background: var(--fill-2);
  border-radius: 5px;
  padding: 2px 6px;
}
</style>
