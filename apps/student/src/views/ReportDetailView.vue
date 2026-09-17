<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  SEVERITY,
  errText,
  fmtDate,
  fmtMs,
  loadVocabulary,
  normalizePage,
  phaseLabel,
  resolveActionName,
  resolveCheckpointName,
  studentDataApi,
  vocabulary,
} from '@hoopshake/core'
import { toast } from '../toast.js'
import BottomSheet from '../components/BottomSheet.vue'

const props = defineProps({ sessionId: { type: String, required: true } })
const router = useRouter()

const loading = ref(true)
const loadErr = ref('')
const detail = ref(null)
const clips = ref([])
const feedback = ref([])
/** 真的全拉到了没有。没拉全的话命中率这些统计都不能当数 */
const complete = ref(true)
const clipSheet = ref(false)
const clipDetail = ref(null)
const clipLoading = ref(false)

/** 命中率：来自 clips 的 shotMade 统计 */
const madeRate = computed(() => {
  const judged = clips.value.filter((c) => c.shotMade !== null && c.shotMade !== undefined)
  if (!judged.length) return null
  return Math.round((judged.filter((c) => c.shotMade).length / judged.length) * 100)
})

/**
 * 检查点表现：按 checkpointId 聚合本课反馈做**相对**比较
 * （报告接口 🚧 未开放，没有绝对评分；这里用扣分权重 MAJOR=1 / MINOR=0.5，
 *  以本课最差的检查点为基准归一化，无负面反馈者记满分）
 */
const checkpointBars = computed(() => {
  const map = new Map()
  for (const f of feedback.value) {
    if (!f.checkpointId) continue
    const item = map.get(f.checkpointId) || {
      id: f.checkpointId,
      // 反馈流带了 checkpointLabel 就用它，和场边规则引擎下发的是同一个名字
      label: f.checkpointLabel || '',
      total: 0,
      major: 0,
      minor: 0,
    }
    if (!item.label && f.checkpointLabel) item.label = f.checkpointLabel
    item.total++
    if (f.severity === 'MAJOR') item.major++
    else if (f.severity === 'MINOR') item.minor++
    map.set(f.checkpointId, item)
  }
  const list = [...map.values()].map((c) => ({ ...c, penalty: c.major + c.minor * 0.5 }))
  const worst = Math.max(...list.map((c) => c.penalty), 0)
  return list
    .map((c) => {
      const score = worst > 0 ? Math.round(100 - (c.penalty / worst) * 60) : 100
      let tone = 'ok'
      let verdict = '良好'
      if (c.major > 0) {
        tone = 'bad'
        verdict = '需改进'
      } else if (c.minor > 0) {
        tone = 'mid'
        verdict = '稳定'
      }
      return { ...c, label: resolveCheckpointName(c.label, c.id), score, tone, verdict }
    })
    .sort((a, b) => b.penalty - a.penalty || b.total - a.total)
    .slice(0, 6)
})

/** 关键改进数：MAJOR 反馈的不同检查点数 */
const keyImprovements = computed(() => {
  const s = new Set(feedback.value.filter((f) => f.severity === 'MAJOR' && f.checkpointId).map((f) => f.checkpointId))
  return s.size
})

/** 教练提示：最近一条重点反馈的 cueText */
const coachCue = computed(() => {
  const majors = feedback.value.filter((f) => f.severity === 'MAJOR' && f.cueText)
  if (majors.length) return majors[majors.length - 1].cueText
  const any = feedback.value.filter((f) => f.cueText)
  return any.length ? any[any.length - 1].cueText : null
})

async function openClip(c) {
  clipSheet.value = true
  clipLoading.value = true
  clipDetail.value = null
  try {
    clipDetail.value = await studentDataApi.clipDetail(c.clipId)
  } catch (err) {
    toast.err(errText(err, '加载片段失败'))
  } finally {
    clipLoading.value = false
  }
}

/**
 * PDF 导出后端本轮没做（接口返 50100，且没有取件的那半截契约）。
 * 与其让人点一颗满屏主按钮再被告知「暂未开放」，不如按钮就摆在那儿灰着，
 * 一眼看得出还没开。接口开放时把 disabled 去掉、接上取件即可。
 */
const EXPORT_READY = false

function exportPdf() {
  toast('PDF 报告还在做，先看这页的数据')
}

const vocab = ref(vocabulary())

/** 后端分页 size 上限是 100（超出按 100 截断），所以只能按 100 一页一页翻 */
const PAGE_SIZE = 100
/** 保险丝：一节课再长也不该有这么多，防止后端分页字段异常时无限翻 */
const MAX_PAGES = 30

/**
 * 把一个分页端点整个拉完。
 *
 * 原来这里只拉第 0 页 —— 一节课超过 100 条反馈时，命中率、检查点表现、
 * 关键改进全建在被截断的数据上，而顶上的「出手 N」取的又是 detail.clipCount，
 * 同屏两个数字分母不同。
 *
 * @returns {{ items: any[], complete: boolean }}
 */
async function fetchAll(fn) {
  const items = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = normalizePage(await fn(page))
    items.push(...res.content)
    if (!res.hasNext || !res.content.length) return { items, complete: true }
  }
  return { items, complete: false }
}

async function load() {
  loading.value = true
  loadErr.value = ''
  try {
    detail.value = await studentDataApi.sessionDetail(props.sessionId)
    const [c, f] = await Promise.all([
      fetchAll((page) => studentDataApi.clips(props.sessionId, { page, size: PAGE_SIZE })),
      fetchAll((page) => studentDataApi.feedback(props.sessionId, { page, size: PAGE_SIZE })),
    ])
    clips.value = c.items
    feedback.value = f.items.sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))
    complete.value = c.complete && f.complete && countsAgree()
  } catch (err) {
    detail.value = null
    loadErr.value = errText(err, '加载报告失败')
  } finally {
    loading.value = false
  }
}

/**
 * 跟后端给的总数对一下。对不上就说明这页的统计不是全量，
 * 宁可在界面上标一句，也别让学生把一个算错的命中率当真。
 */
function countsAgree() {
  const d = detail.value
  if (!d) return true
  const okClips = d.clipCount === null || d.clipCount === undefined || d.clipCount === clips.value.length
  const okFb =
    d.feedbackCount === null || d.feedbackCount === undefined || d.feedbackCount === feedback.value.length
  return okClips && okFb
}

onMounted(() => {
  loadVocabulary().then((v) => (vocab.value = v))
  load()
})
</script>

<template>
  <!-- 头部 -->
  <div class="rep-head">
    <div class="left">
      <button class="btn-back" @click="router.back()">‹</button>
      <div>
        <div class="h1">课堂报告</div>
        <div class="sub">{{ detail?.lessonTitle || '自由训练' }} · {{ fmtDate(detail?.recordedAt) }}</div>
      </div>
    </div>
    <button class="dl-btn" :disabled="!EXPORT_READY" @click="exportPdf" title="PDF 报告暂未开放">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
        <path d="M12 15V4M12 4L8 8M12 4l4 4" stroke="#E8551A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4" stroke="#E8551A" stroke-width="2" stroke-linecap="round" />
      </svg>
    </button>
  </div>

  <div class="scroll-body rep-body">
    <template v-if="loading">
      <div class="skeleton" style="height: 96px; border-radius: 26px; margin-bottom: 18px"></div>
      <div class="skeleton" style="height: 220px; border-radius: 26px"></div>
    </template>

    <div v-else-if="loadErr" class="load-err">
      <div class="le-t">没能加载这节课的报告</div>
      <div class="le-s">{{ loadErr }}</div>
      <button class="le-btn" @click="load">重试</button>
    </div>

    <template v-else>
      <!-- 深色统计条 -->
      <div v-if="!complete" class="partial-tip">
        这节课的数据没取全，下面的命中率与检查点统计仅供参考。下拉重进可重试。
      </div>

      <div class="stat-row">
        <div class="stat">
          <!-- 用实际拉到的条数，与命中率同源。取 detail.clipCount 会出现
               「出手 120 / 命中率按 100 条算」这种同屏不同分母 -->
          <div class="num">{{ clips.length || detail?.clipCount || 0 }}</div>
          <div class="lab">出手</div>
        </div>
        <div class="stat">
          <div class="num">
            <template v-if="madeRate !== null">{{ madeRate }}<span class="unit">%</span></template>
            <template v-else>—</template>
          </div>
          <div class="lab">命中率</div>
        </div>
        <div class="stat last">
          <div class="num hot">{{ keyImprovements }}</div>
          <div class="lab">关键改进</div>
        </div>
      </div>

      <!-- 检查点表现 -->
      <div class="card block">
        <div class="block-title" style="margin-bottom: 4px">检查点表现</div>
        <div class="block-note">按本课提示次数相对比较</div>
        <div v-if="!checkpointBars.length" class="empty-hint" style="padding: 18px 0">
          本课暂无检查点反馈
        </div>
        <div class="cp-list">
          <div v-for="c in checkpointBars" :key="c.id">
            <div class="cp-head">
              <span class="cp-name">{{ c.label }}</span>
              <span class="cp-right">
                <span class="cp-cnt">{{ c.total }} 次提示</span>
                <span class="cp-verdict" :class="c.tone">{{ c.verdict }}</span>
              </span>
            </div>
            <div class="cp-track">
              <div class="cp-fill" :class="c.tone" :style="{ width: c.score + '%' }"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 教练点评 -->
      <div v-if="coachCue" class="card coach">
        <span class="coach-logo"><span class="ring"></span></span>
        <div>
          <div class="coach-t">教练提示</div>
          <div class="coach-txt">{{ coachCue }}</div>
        </div>
      </div>

      <!-- 出手片段 -->
      <div class="card block">
        <div class="block-title">
          出手片段
          <span class="block-sub">{{ clips.length }} 段</span>
        </div>
        <div v-if="!clips.length" class="empty-hint" style="padding: 18px 0">暂无片段数据</div>
        <div class="clip-grid">
          <button v-for="c in clips" :key="c.clipId" class="clip" @click="openClip(c)">
            <span class="ci">#{{ c.clipIndex }}</span>
            <span class="ca">{{ resolveActionName(null, c.actionType) }}</span>
            <span
              v-if="c.shotMade !== null && c.shotMade !== undefined"
              class="cm"
              :class="c.shotMade ? 'in' : 'out'"
              >{{ c.shotMade ? '进' : '铁' }}</span
            >
          </button>
        </div>
      </div>

      <!-- 课堂反馈 -->
      <div class="card block">
        <div class="block-title">
          课堂反馈
          <span class="block-sub">{{ feedback.length }} 条</span>
        </div>
        <div v-if="!feedback.length" class="empty-hint" style="padding: 18px 0">本课没有实时反馈</div>
        <div class="fb-list">
          <div v-for="f in feedback" :key="f.feedbackId" class="fb-row">
            <span class="fb-tag" :class="f.severity">{{ SEVERITY[f.severity]?.label || f.severity }}</span>
            <div class="fb-mid">
              <div class="fb-cue">{{ f.cueText || resolveCheckpointName(null, f.checkpointId) }}</div>
              <div class="fb-sub">
                {{ resolveActionName(null, f.actionType) }}
                <template v-if="f.timestampMs !== null && f.timestampMs !== undefined"> · {{ fmtMs(f.timestampMs) }}</template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
    <div style="height: 26px"></div>
  </div>

  <!-- 底部按钮 -->
  <div class="bottom-act">
    <button
      class="btn-primary"
      style="height: 52px; font-size: 16px"
      :disabled="!EXPORT_READY"
      @click="exportPdf"
    >
      {{ EXPORT_READY ? '生成 PDF 报告' : '生成 PDF 报告 · 即将开放' }}
    </button>
  </div>

  <!-- 片段详情 -->
  <BottomSheet :open="clipSheet" title="出手片段详情" @close="clipSheet = false">
    <div v-if="clipLoading" class="empty-hint">加载中…</div>
    <template v-else-if="clipDetail">
      <div class="info-card" style="margin-bottom: 14px">
        <div class="info-row"><span class="k">动作</span><span class="v">{{ resolveActionName(null, clipDetail.actionType) }} · #{{ clipDetail.clipIndex }}</span></div>
        <div class="info-row"><span class="k">时间段</span><span class="v" style="font-family: var(--mono)">{{ fmtMs(clipDetail.startMs) }} – {{ fmtMs(clipDetail.endMs) }}</span></div>
        <div class="info-row" v-if="clipDetail.releaseMs !== null && clipDetail.releaseMs !== undefined">
          <span class="k">出手时刻</span><span class="v" style="font-family: var(--mono)">{{ fmtMs(clipDetail.releaseMs) }}</span>
        </div>
        <div class="info-row" v-if="clipDetail.shotMade !== null && clipDetail.shotMade !== undefined">
          <span class="k">结果</span>
          <span class="v" :style="{ color: clipDetail.shotMade ? 'var(--ok)' : 'var(--danger)' }">{{ clipDetail.shotMade ? '命中' : '未中' }}</span>
        </div>
        <div class="info-row" v-if="clipDetail.zoneId"><span class="k">区域</span><span class="v">{{ clipDetail.zoneId }}</span></div>
      </div>
      <div v-if="clipDetail.phases?.length" class="info-card" style="margin-bottom: 14px">
        <!-- 相位中文名来自词表的 phases.labels，拿不到就显示原 id -->
        <div class="info-row" v-for="p in clipDetail.phases" :key="p.name">
          <span class="k">{{ phaseLabel(p.name, vocab) }}</span>
          <span class="v" style="font-family: var(--mono)">{{ fmtMs(p.start_ms) }} – {{ fmtMs(p.end_ms) }}</span>
        </div>
      </div>
      <a
        v-if="clipDetail.motionDataUrl"
        class="motion-link"
        :href="clipDetail.motionDataUrl"
        target="_blank"
        rel="noopener"
        >下载 3D 动作数据</a
      >
    </template>
  </BottomSheet>
</template>

<style scoped>
.rep-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 22px 14px;
}
.left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.h1 {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.sub {
  font-size: 13px;
  color: var(--gray);
  margin-top: 2px;
}
.dl-btn:disabled,
.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}
.dl-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
}
.rep-body {
  padding: 0 22px;
}
.stat-row {
  display: flex;
  background: var(--dark-card);
  border-radius: 26px;
  padding: 20px 8px;
  margin-bottom: 18px;
  color: #fff;
}
.stat {
  flex: 1;
  text-align: center;
  border-right: 1px solid var(--dark-track);
}
.stat.last {
  border-right: none;
}
.stat .num {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.stat .num.hot {
  color: var(--accent-light);
}
.unit {
  font-size: 15px;
  color: #8b919c;
}
.stat .lab {
  font-size: 12px;
  color: var(--dark-muted);
  margin-top: 4px;
}
.block {
  padding: 20px;
  margin-bottom: 16px;
}
.block-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.block-sub {
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-2);
}
.cp-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.cp-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 7px;
}
.block-note {
  font-size: 13px;
  color: var(--gray-2);
  margin-bottom: 16px;
}
.cp-name {
  font-size: 14px;
  color: var(--ink-2);
}
.cp-right {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.cp-cnt {
  font-size: 12px;
  color: var(--gray-2);
}
.cp-verdict {
  font-size: 13px;
  font-weight: 600;
}
.cp-verdict.ok {
  color: var(--ok);
}
.cp-verdict.bad {
  color: var(--brand-deep);
}
.cp-verdict.mid {
  color: var(--ink-2);
}
.cp-track {
  height: 8px;
  border-radius: 99px;
  background: var(--fill-2);
}
.cp-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.4s ease;
}
.cp-fill.ok {
  background: var(--ok);
}
.cp-fill.bad {
  background: var(--brand);
}
.cp-fill.mid {
  background: var(--ink);
}
.coach {
  padding: 20px;
  display: flex;
  gap: 14px;
  margin-bottom: 16px;
}
.coach-logo {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.coach-logo .ring {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2.2px solid #fff;
}
.coach-t {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 6px;
}
.coach-txt {
  font-size: 14px;
  line-height: 1.55;
  color: var(--ink-2);
}
.clip-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 9px;
}
.clip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fbfbf9;
  border: 1px solid #edede9;
  border-radius: 13px;
  padding: 10px 10px;
  font-size: 12px;
}
.ci {
  font: 600 12px/1 var(--mono);
  color: var(--gray-2);
}
.ca {
  font-weight: 600;
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cm {
  margin-left: auto;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  flex: none;
}
.cm.in {
  background: var(--ok);
}
.cm.out {
  background: var(--gray-3);
}
.fb-list {
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.fb-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.fb-tag {
  font-size: 11px;
  font-weight: 700;
  border-radius: 8px;
  padding: 5px 9px;
  flex: none;
  white-space: nowrap;
}
.fb-tag.MAJOR {
  color: #c0472c;
  background: #fbe0d8;
}
.fb-tag.MINOR {
  color: #b5771a;
  background: var(--warn-bg);
}
.fb-tag.POSITIVE {
  color: var(--ok-deep);
  background: var(--ok-bg);
}
.fb-mid {
  flex: 1;
  min-width: 0;
}
.fb-cue {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}
.fb-sub {
  font-size: 12px;
  color: var(--gray-2);
  margin-top: 2px;
}
.load-err {
  background: #fff;
  border-radius: 26px;
  padding: 30px 22px;
  text-align: center;
}
.le-t {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 7px;
}
.le-s {
  font-size: 13px;
  color: var(--gray);
  line-height: 1.6;
  margin-bottom: 18px;
}
.le-btn {
  background: var(--brand);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  border-radius: 14px;
  padding: 11px 30px;
}
.partial-tip {
  background: var(--warn-bg);
  color: var(--warn);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.6;
  border-radius: 16px;
  padding: 11px 15px;
  margin-bottom: 14px;
}
.bottom-act {
  flex: none;
  padding: 10px 22px calc(env(safe-area-inset-bottom, 0px) + 16px);
}
.motion-link {
  display: block;
  text-align: center;
  font-size: 15px;
  font-weight: 600;
  background: #fff;
  border-radius: 999px;
  padding: 14px 0;
}
</style>
