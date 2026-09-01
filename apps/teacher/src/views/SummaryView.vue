<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  avatarColor,
  checkpointLabel,
  renderMarkdown,
  errText,
  fmtDate,
  fmtPct,
  fmtTime,
  isNotOpen,
  nameInitial,
  pctNumber,
  summaryApi,
} from '@hoopshake/core'
import { toast } from '../toast.js'
import Spark from '../components/Spark.vue'


const props = defineProps({ sessionId: { type: String, required: true } })
const router = useRouter()

const data = ref(null)
const loading = ref(true)
const error = ref('')

/** 绘图区高度（px）。柱高按像素算，避免 flex 收缩导致比例失真 */
const PLOT_H = 130

const bars = computed(() => {
  const list = data.value?.checkpointDistribution || []
  if (!list.length) return []
  const max = Math.max(...list.map((c) => c.count), 1)
  return list
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((c, i) => ({
      ...c,
      hpx: Math.max(6, Math.round((c.count / max) * PLOT_H)),
      color: c.safety ? '#E5484D' : i === 0 ? '#FF6A2C' : i === 1 ? '#F0A57A' : '#DED9D2',
      hot: i === 0,
    }))
})

const summaryHtml = computed(() => renderMarkdown(data.value?.classSummaryMarkdown))

async function exportReport() {
  try {
    await summaryApi.exportSession(props.sessionId)
    toast.ok('导出任务已提交')
  } catch (err) {
    toast.err(isNotOpen(err) ? '班级报告导出暂未开放，敬请期待' : errText(err))
  }
}

onMounted(async () => {
  try {
    data.value = await summaryApi.session(props.sessionId)
  } catch (err) {
    error.value = errText(err, '加载课末汇总失败')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div>
        <div style="display: flex; align-items: center; gap: 12px">
          <div class="head-title-row">
            <button class="btn-back-sq" @click="router.back()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M15 5l-7 7 7 7" stroke="#3A3A3C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <h2 class="page-title">{{ data?.lessonTitle || '训练会话' }} · 课末汇总</h2>
          </div>
          <span v-if="data" class="pill ok">汇总完成</span>
        </div>
        <p class="page-sub">
          {{ data?.classCode || '—' }} · {{ fmtDate(data?.recordedAt) }}
          <template v-if="data?.durationMinutes"> · {{ data.durationMinutes }} 分钟</template>
        </p>
      </div>
      <button class="btn" @click="exportReport">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 15V4M12 4L8 8M12 4l4 4" stroke="#E8551A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4" stroke="#E8551A" stroke-width="2" stroke-linecap="round" />
        </svg>
        导出班级报告
      </button>
    </div>

    <div class="content" style="display: flex; flex-direction: column; gap: 20px">
      <div v-if="loading"><div class="skeleton" style="height: 220px"></div></div>
      <div v-else-if="error" class="panel empty-hint">{{ error }}</div>

      <template v-else-if="data">
        <!-- 四格 -->
        <div class="s4">
          <div class="panel sc">
            <div class="t">出勤</div>
            <div class="n">
              {{ data.attendance?.present ?? '—' }}<span class="u"> / {{ data.attendance?.enrolled ?? '—' }}</span>
            </div>
          </div>
          <div class="panel sc">
            <div class="t">总动作数</div>
            <div class="n">{{ data.totalClips ?? 0 }}</div>
          </div>
          <div class="panel sc">
            <div class="t">平均命中率</div>
            <div class="n">
              <template v-if="pctNumber(data.avgMadeRate) !== null">{{ pctNumber(data.avgMadeRate) }}<span class="u">%</span></template>
              <template v-else>—</template>
            </div>
          </div>
          <div class="panel sc">
            <div class="t">安全提醒</div>
            <div class="n" :class="{ red: data.safetyAlertCount > 0 }">{{ data.safetyAlertCount ?? 0 }}</div>
          </div>
        </div>

        <!-- 分布 + 安全 -->
        <div class="mid-grid">
          <div class="panel" style="padding: 22px 24px">
            <div class="pt">常见问题分布 · 全班</div>
            <div class="ps">按检查点触发次数</div>
            <div v-if="!bars.length" class="empty-hint">本课没有检查点记录</div>
            <div v-else class="chart">
              <div v-for="b in bars" :key="b.checkpointId" class="col">
                <div class="plot" :style="{ height: PLOT_H + 'px' }">
                  <span class="cv" :class="{ hot: b.hot }">{{ b.count }}</span>
                  <div class="cb" :style="{ height: b.hpx + 'px', background: b.color }"></div>
                </div>
                <span class="cl">{{ b.label || checkpointLabel(b.checkpointId) }}</span>
              </div>
            </div>
          </div>
          <div class="panel" style="padding: 22px 24px">
            <div class="pt" style="margin-bottom: 18px">安全提醒</div>
            <div v-if="!(data.safetyAlerts || []).length" class="safe-ok">
              <span class="dot-ok"></span>本课无安全提醒
            </div>
            <div class="alerts">
              <div v-for="a in data.safetyAlerts" :key="a.feedbackId" class="arow">
                <span class="ad"></span>
                <div style="flex: 1">
                  <div class="at">{{ a.message || checkpointLabel(a.checkpointId) }}</div>
                  <div class="as">{{ a.displayName || '未识别学生' }} · {{ fmtTime(a.occurredAt) }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- AI 班级小结 -->
        <div v-if="summaryHtml" class="panel" style="padding: 22px 24px">
          <div class="pt">AI 班级小结</div>
          <div class="md" v-html="summaryHtml"></div>
        </div>

        <!-- 学生表 -->
        <div class="panel" style="overflow: hidden">
          <div class="gtable" style="--cols: 1.6fr 1fr 1.6fr 1.2fr 1fr">
            <div class="thead" style="padding: 16px 24px">
              <span>学生</span>
              <span>动作数</span>
              <span>主要改进点</span>
              <span>趋势</span>
              <span>识别</span>
            </div>
            <div v-if="!(data.students || []).length" class="empty-hint">暂无学生数据</div>
            <div v-for="s in data.students" :key="s.studentId" class="trow" style="padding: 15px 24px">
              <div style="display: flex; align-items: center; gap: 11px">
                <span class="avatar" :style="{ width: '32px', height: '32px', fontSize: '13px', background: avatarColor(s.studentId) }">
                  {{ nameInitial(s.displayName, '生') }}
                </span>
                <span style="font-size: 15px; font-weight: 600">{{ s.displayName || '未识别' }}</span>
              </div>
              <span style="font: 500 15px/1 var(--mono); color: var(--ink-2)">{{ s.clipCount }}</span>
              <span style="font-size: 14px; color: var(--ink-2)">{{ s.keyLabel || checkpointLabel(s.keyCheckpointId) }}</span>
              <Spark :values="(s.trend || []).map((p) => p.value)" />
              <span v-if="s.recognized" style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--ok)">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--ok)"></span>已识别
              </span>
              <span v-else style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--brand-deep)">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--brand)"></span>待确认
              </span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.s4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
@media (max-width: 1000px) {
  .s4 {
    grid-template-columns: repeat(2, 1fr);
  }
}
.sc {
  padding: 20px;
  border-radius: 16px;
}
.sc .t {
  font-size: 13px;
  color: var(--gray);
  margin-bottom: 8px;
}
.sc .n {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.sc .n.red {
  color: var(--danger);
}
.sc .u {
  font-size: 16px;
  color: var(--gray-3);
}
.mid-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 20px;
}
@media (max-width: 1000px) {
  .mid-grid {
    grid-template-columns: 1fr;
  }
}
.pt {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 4px;
}
.ps {
  font-size: 13px;
  color: var(--gray-2);
  margin-bottom: 20px;
}
.chart {
  display: flex;
  align-items: flex-end;
  gap: 20px;
  padding-left: 4px;
}
.col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
/* 固定高度的绘图区：柱子从底部生长，高度用像素给定，比例不受 flex 影响 */
.plot {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.cv {
  font: 600 13px/1 var(--mono);
  color: var(--gray);
  flex: none;
}
.cv.hot {
  color: var(--brand-deep);
}
.cb {
  width: 100%;
  flex: none;
  border-radius: 8px 8px 0 0;
  transition: height 0.4s ease;
}
.cl {
  font-size: 12px;
  color: var(--ink-3);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.safe-ok {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 14px;
  color: var(--ok);
  font-weight: 600;
  padding: 8px 0;
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
}
.arow {
  display: flex;
  gap: 13px;
  padding: 14px;
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
  font-size: 15px;
  font-weight: 600;
}
.as {
  font-size: 13px;
  color: var(--gray);
  margin-top: 3px;
}
.md :deep(h3),
.md :deep(h4),
.md :deep(h5) {
  margin: 14px 0 8px;
  font-size: 15px;
}
.md :deep(p) {
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink-2);
  margin: 6px 0;
}
.md :deep(ul) {
  padding-left: 20px;
  margin: 6px 0;
}
.md :deep(li) {
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink-2);
}
.md :deep(code) {
  font-family: var(--mono);
  background: var(--fill-2);
  border-radius: 5px;
  padding: 1px 5px;
  font-size: 13px;
}
</style>
