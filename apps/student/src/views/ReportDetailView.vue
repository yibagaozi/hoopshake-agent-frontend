<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  SEVERITY,
  actionLabel,
  checkpointLabel,
  errText,
  fmtDate,
  fmtMs,
  isNotOpen,
  pageItems,
  studentDataApi,
} from '@hoopshake/core'
import { toast } from '../toast.js'
import BottomSheet from '../components/BottomSheet.vue'

const props = defineProps({ sessionId: { type: String, required: true } })
const router = useRouter()

const loading = ref(true)
const detail = ref(null)
const clips = ref([])
const feedback = ref([])
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
      return { ...c, label: c.label || checkpointLabel(c.id), score, tone, verdict }
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

async function exportPdf() {
  try {
    await studentDataApi.exportReport(props.sessionId)
    toast.ok('报告导出任务已提交')
  } catch (err) {
    toast.err(isNotOpen(err) ? 'PDF 报告导出暂未开放，敬请期待' : errText(err))
  }
}

onMounted(async () => {
  try {
    detail.value = await studentDataApi.sessionDetail(props.sessionId)
    const [cRes, fRes] = await Promise.all([
      studentDataApi.clips(props.sessionId, { size: 100 }),
      studentDataApi.feedback(props.sessionId, { size: 100 }),
    ])
    clips.value = pageItems(cRes)
    feedback.value = pageItems(fRes).sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))
  } catch (err) {
    toast.err(errText(err, '加载报告失败'))
  } finally {
    loading.value = false
  }
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
    <button class="dl-btn" @click="exportPdf" title="导出 PDF">
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

    <template v-else>
      <!-- 深色统计条 -->
      <div class="stat-row">
        <div class="stat">
          <div class="num">{{ detail?.clipCount ?? clips.length }}</div>
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
            <span class="ca">{{ actionLabel(c.actionType) }}</span>
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
              <div class="fb-cue">{{ f.cueText || checkpointLabel(f.checkpointId) }}</div>
              <div class="fb-sub">
                {{ actionLabel(f.actionType) }}
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
    <button class="btn-primary" style="height: 52px; font-size: 16px" @click="exportPdf">
      生成 PDF 报告
    </button>
  </div>

  <!-- 片段详情 -->
  <BottomSheet :open="clipSheet" title="出手片段详情" @close="clipSheet = false">
    <div v-if="clipLoading" class="empty-hint">加载中…</div>
    <template v-else-if="clipDetail">
      <div class="info-card" style="margin-bottom: 14px">
        <div class="info-row"><span class="k">动作</span><span class="v">{{ actionLabel(clipDetail.actionType) }} · #{{ clipDetail.clipIndex }}</span></div>
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
        <div class="info-row" v-for="p in clipDetail.phases" :key="p.name">
          <span class="k">{{ p.name }}</span>
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
