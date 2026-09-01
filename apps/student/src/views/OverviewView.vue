<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  actionLabel,
  errText,
  fmtMonthDay,
  fmtPct,
  nameInitial,
  pctNumber,
  studentDataApi,
} from '@hoopshake/core'
import { useAuthStore } from '../stores/auth.js'
import { toast } from '../toast.js'
import TabBar from '../components/TabBar.vue'
import TrendChart from '../components/TrendChart.vue'

const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const data = ref(null)
const trendPoints = ref([])
const trendAction = ref('')

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 13) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

const focusProgress = computed(() => {
  const p = data.value?.focusCheckpoint?.progress
  return p === null || p === undefined ? 0 : Math.max(0, Math.min(100, pctNumber(p) ?? 0))
})

async function loadTrend(actionType) {
  trendAction.value = actionType
  try {
    const t = await studentDataApi.trend({ actionType, metric: 'made_rate', limit: 8 })
    trendPoints.value = (t?.points || []).map((p) => ({ value: pctNumber(p.value), label: p.recordedAt }))
  } catch {
    trendPoints.value = []
  }
}

onMounted(async () => {
  auth.fetchMe()
  try {
    data.value = await studentDataApi.overview()
    const firstAction = data.value?.actionTypeStats?.[0]?.actionType
    if (firstAction) loadTrend(firstAction)
  } catch (err) {
    toast.err(errText(err, '加载训练概览失败'))
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="scroll-body page-pad">
    <!-- 顶部问候 -->
    <div class="head-row">
      <div>
        <div class="hello">{{ greeting }}</div>
        <div class="uname">{{ data?.displayName || auth.displayName }}</div>
      </div>
      <span class="avatar">{{ nameInitial(data?.displayName || auth.displayName) }}</span>
    </div>

    <!-- 待激活提醒 -->
    <div v-if="auth.isPending" class="pending-tip" @click="router.push('/activate')">
      账号尚未激活，绑定手机后才能使用 AI 教练 ›
    </div>

    <template v-if="loading">
      <div class="tiles">
        <div v-for="i in 3" :key="i" class="tile"><div class="skeleton" style="height: 52px"></div></div>
      </div>
      <div class="card" style="padding: 20px; margin-bottom: 18px">
        <div class="skeleton" style="height: 130px"></div>
      </div>
    </template>

    <template v-else>
      <!-- 本周三格 -->
      <div class="tiles">
        <div class="tile">
          <div class="num">{{ data?.weekly?.sessions ?? 0 }}</div>
          <div class="lab">本周训练</div>
        </div>
        <div class="tile">
          <div class="num">{{ data?.weekly?.clips ?? 0 }}</div>
          <div class="lab">出手次数</div>
        </div>
        <div class="tile">
          <div class="num">
            <template v-if="pctNumber(data?.weekly?.madeRate) !== null">
              {{ pctNumber(data?.weekly?.madeRate) }}<span class="unit">%</span>
            </template>
            <template v-else>—</template>
          </div>
          <div class="lab">命中率</div>
        </div>
      </div>

      <!-- 趋势卡 -->
      <div class="card trend-card">
        <div class="tc-head">
          <span class="tc-title">命中率趋势</span>
          <span class="tc-more" v-if="trendPoints.length >= 2">近 {{ trendPoints.length }} 课 ↑</span>
        </div>
        <div class="tc-sub">课后 3D 评分 · {{ actionLabel(trendAction) }}</div>
        <TrendChart :points="trendPoints" :height="112" />
        <div v-if="(data?.actionTypeStats || []).length > 1" class="action-chips">
          <button
            v-for="a in data.actionTypeStats"
            :key="a.actionType"
            class="chip"
            :class="{ on: a.actionType === trendAction }"
            @click="loadTrend(a.actionType)"
          >
            {{ actionLabel(a.actionType) }}
          </button>
        </div>
      </div>

      <!-- 本阶段重点 -->
      <div v-if="data?.focusCheckpoint" class="focus-card">
        <div class="fc-cap">本阶段重点</div>
        <div class="fc-title">{{ data.focusCheckpoint.label }}</div>
        <div class="fc-track">
          <div class="fc-fill" :style="{ width: focusProgress + '%' }"></div>
        </div>
        <div class="fc-note">
          较上周改善
          <span class="fc-pct">{{ (data.focusCheckpoint.improvementPct >= 0 ? '+' : '') + Math.round(data.focusCheckpoint.improvementPct) }}%</span>
          · 继续保持
        </div>
      </div>

      <!-- 最近课堂 -->
      <div class="sec-title">最近课堂</div>
      <div v-if="!(data?.recentSessions || []).length" class="empty-hint">
        还没有训练记录，上完第一节课就能在这里看到啦
      </div>
      <div
        v-for="(s, i) in data?.recentSessions || []"
        :key="s.sessionId"
        class="card sess-row"
        @click="router.push(`/report/${s.sessionId}`)"
      >
        <div class="date-chip" :class="{ hot: i === 0 }">
          <span class="d">{{ fmtMonthDay(s.recordedAt).day }}</span>
          <span class="m">{{ fmtMonthDay(s.recordedAt).month }}</span>
        </div>
        <div class="sess-mid">
          <div class="sess-name">{{ s.lessonTitle || '自由训练' }}</div>
          <div class="sess-sub">
            {{ s.keyImprovementLabel ? '改进 · ' + s.keyImprovementLabel : `${s.clipCount} 次出手` }}
          </div>
        </div>
        <span class="chev">›</span>
      </div>
    </template>

    <div style="height: 104px"></div>
  </div>
  <TabBar />
</template>

<style scoped>
.page-pad {
  padding: calc(env(safe-area-inset-top, 0px) + 20px) 22px 0;
}
.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
}
.hello {
  font-size: 15px;
  color: var(--gray);
}
.uname {
  font-size: 27px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.avatar {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
}
.pending-tip {
  background: var(--warn-bg);
  color: var(--warn);
  font-size: 13px;
  font-weight: 600;
  border-radius: 14px;
  padding: 11px 15px;
  margin-bottom: 16px;
  cursor: pointer;
}
.tiles {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 11px;
  margin-bottom: 18px;
}
.tile {
  background: #fff;
  border-radius: 22px;
  padding: 16px 14px;
}
.num {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.unit {
  font-size: 16px;
  color: var(--gray-2);
}
.lab {
  font-size: 13px;
  color: var(--gray);
  margin-top: 3px;
}
.trend-card {
  padding: 20px 20px 16px;
  margin-bottom: 18px;
}
.tc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.tc-title {
  font-size: 16px;
  font-weight: 700;
}
.tc-more {
  font-size: 13px;
  font-weight: 600;
  color: var(--ok);
}
.tc-sub {
  font-size: 13px;
  color: var(--gray-2);
  margin-bottom: 14px;
}
.action-chips {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.chip {
  font-size: 12px;
  font-weight: 600;
  color: var(--gray);
  background: var(--fill);
  border-radius: 99px;
  padding: 7px 13px;
}
.chip.on {
  color: #fff;
  background: var(--brand);
}
.focus-card {
  background: var(--dark-card);
  border-radius: 26px;
  padding: 20px;
  margin-bottom: 18px;
  color: #fff;
}
.fc-cap {
  font-size: 13px;
  color: var(--dark-muted);
  letter-spacing: 0.04em;
  margin-bottom: 14px;
}
.fc-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 14px;
}
.fc-track {
  height: 8px;
  border-radius: 99px;
  background: var(--dark-track);
  overflow: hidden;
  margin-bottom: 8px;
}
.fc-fill {
  height: 100%;
  background: var(--brand);
  border-radius: 99px;
  transition: width 0.4s ease;
}
.fc-note {
  font-size: 13px;
  color: var(--dark-muted);
}
.fc-pct {
  color: var(--accent-light);
  font-weight: 600;
}
.sec-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 12px 10px;
}
.sess-row {
  padding: 16px 18px;
  margin-bottom: 11px;
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
}
.date-chip {
  width: 44px;
  height: 44px;
  border-radius: 13px;
  background: var(--fill);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: none;
}
.date-chip .d {
  font-size: 16px;
  font-weight: 700;
  color: var(--ink-3);
  line-height: 1;
}
.date-chip .m {
  font-size: 10px;
  color: var(--gray);
}
.date-chip.hot {
  background: var(--brand-soft);
}
.date-chip.hot .d,
.date-chip.hot .m {
  color: var(--brand-deep);
}
.sess-mid {
  flex: 1;
  min-width: 0;
}
.sess-name {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sess-sub {
  font-size: 13px;
  color: var(--gray);
  margin-top: 2px;
}
.chev {
  color: var(--gray-4);
  font-size: 20px;
}
</style>
