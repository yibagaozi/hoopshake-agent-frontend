<script setup>
import { computed, onMounted, ref } from 'vue'
import { CHAT_TYPES, chatTypeLabel, errText, num, opsApi, pct } from '@hoopshake/core'
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

function sumTool(t) {
  if (!t) return 0
  return (t.ok || 0) + (t.deny || 0) + (t.error || 0)
}

/** 工具调用三段条，没有样本时不画 */
function barsOf(t) {
  const total = sumTool(t)
  if (!t || !total) return []
  return [
    { k: 'ok', label: '成功', n: t.ok || 0, cls: 'ok' },
    { k: 'deny', label: '被拒', n: t.deny || 0, cls: 'warn' },
    { k: 'error', label: '出错', n: t.error || 0, cls: 'danger' },
  ].map((b) => ({ ...b, pctOf: (b.n / total) * 100 }))
}

const toolTotal = computed(() => sumTool(tool.value))
const toolBars = computed(() => barsOf(tool.value))

/**
 * 按对话类型拆开的那一份。
 *
 * 文档说 byChatType 固定两项（STUDENT / TEACHER），但真缺了也不该整块消失
 * —— 所以按 CHAT_TYPES 兜底补齐，缺的那项显示成「窗口内没有样本」。
 * 教师端的 detail.tools / detail.quality 是这次才开始落库的，历史消息没有，
 * 所以刚上线时教师端这一列会是空的，不是坏了。
 */
const byType = computed(() => {
  const list = Array.isArray(q.value?.byChatType) ? q.value.byChatType : []
  const idx = new Map(list.map((r) => [String(r.chatType || r.type || '').toUpperCase(), r]))
  return CHAT_TYPES.map((t) => {
    const r = idx.get(t)
    return {
      type: t,
      label: chatTypeLabel(t),
      row: r || null,
      bars: barsOf(r?.tool),
      toolTotal: sumTool(r?.tool),
      empty: !r || !(r.answeredRuns > 0),
    }
  })
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

        <div class="sec-label" style="margin-top: 26px">按对话类型</div>
        <div class="by-grid">
          <div v-for="b in byType" :key="b.type" class="panel bt">
            <div class="bt-head">
              <span class="bt-name">{{ b.label }}</span>
              <span class="pill muted">{{ num(b.row?.answeredRuns) }} 次应答</span>
            </div>

            <div v-if="b.empty" class="empty-hint" style="padding: 26px 10px">
              窗口内没有样本
              <template v-if="b.type === 'TEACHER'">
                <br />
                <span class="eh-s">教师端的质量明细这次才开始落库，历史消息回溯不了</span>
              </template>
            </div>

            <template v-else>
              <div class="bt-metrics">
                <div class="m">
                  <span>降级率</span>
                  <b :class="tone(b.row?.degradedRate, 'degradedRate')">{{ pct(b.row?.degradedRate) }}</b>
                  <i>{{ num(b.row?.degradedRuns) }} 次</i>
                </div>
                <div class="m">
                  <span>RAG 命中率</span>
                  <b>{{ pct(b.row?.ragHitRate) }}</b>
                  <i>{{ num(b.row?.ragHitRuns) }} 次</i>
                </div>
                <div class="m">
                  <span>工具错误率</span>
                  <b :class="tone(b.row?.toolErrorRate, 'toolErrorRate')">{{ pct(b.row?.toolErrorRate) }}</b>
                  <i>{{ num(b.row?.tool?.error) }} / {{ num(b.toolTotal) }}</i>
                </div>
                <div class="m">
                  <span>平均回答字数</span>
                  <b>{{ num(b.row?.avgAnswerChars) }}</b>
                  <i>&nbsp;</i>
                </div>
              </div>

              <div v-if="b.bars.length" class="bt-tools">
                <div class="tbar">
                  <div
                    v-for="s in b.bars"
                    :key="s.k"
                    class="tseg"
                    :class="s.cls"
                    :style="{ width: s.pctOf + '%' }"
                    :title="`${s.label} ${s.n}`"
                  ></div>
                </div>
                <div class="tlegend sm">
                  <span v-for="s in b.bars" :key="s.k" class="tl">
                    <i :class="s.cls"></i>{{ s.label }}<b>{{ num(s.n) }}</b>
                  </span>
                </div>
              </div>
              <div v-else class="bt-none">窗口内没有工具调用</div>
            </template>
          </div>
        </div>

        <div class="sec-label" style="margin-top: 26px">工具调用分布（全部）</div>
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
          教师端的 <code>detail.tools</code> / <code>detail.quality</code> 是新加的落库项，
          部署前的教师消息没有这份明细、也无法回溯，所以「教师端」一列要等新会话攒起来才有数。<br />
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
.by-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 18px;
}
.bt {
  padding: 20px 22px;
}
.bt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.bt-name {
  font-size: 15px;
  font-weight: 700;
}
.bt-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 18px;
}
.bt-metrics .m {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.bt-metrics .m span {
  font-size: 12px;
  color: var(--gray);
}
.bt-metrics .m b {
  font: 700 21px/1 var(--mono);
  letter-spacing: -0.02em;
}
.bt-metrics .m b.ok {
  color: var(--ok);
}
.bt-metrics .m b.warn {
  color: var(--warn);
}
.bt-metrics .m b.danger {
  color: var(--danger);
}
.bt-metrics .m b.muted {
  color: var(--gray-3);
}
.bt-metrics .m i {
  font-style: normal;
  font-size: 11px;
  color: var(--gray-2);
}
.bt-tools {
  margin-top: 18px;
}
.bt-none {
  margin-top: 18px;
  font-size: 12px;
  color: var(--gray-2);
}
.eh-s {
  font-size: 12px;
  color: var(--gray-3);
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
.tlegend.sm {
  gap: 14px;
  margin-top: 11px;
  font-size: 12px;
}
.tlegend.sm .tl {
  gap: 5px;
  font-size: 12px;
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
