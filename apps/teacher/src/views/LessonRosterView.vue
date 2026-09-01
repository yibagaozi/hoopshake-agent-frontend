<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ACCOUNT_STATUS,
  avatarColor,
  errText,
  fmtDate,
  fmtPct,
  lessonApi,
  nameInitial,
  teacherStudentApi,
} from '@hoopshake/core'
import { toast } from '../toast.js'

const props = defineProps({ lessonId: { type: String, required: true } })
const router = useRouter()

const lesson = ref(null)
const rows = ref([]) // enrollment + stats { ...enrollment, stats?, statsLoading }
const loading = ref(true)
const keyword = ref('')
const filter = ref('ALL')

const filtered = computed(() => {
  let list = rows.value
  if (filter.value === 'PENDING') list = list.filter((r) => r.accountStatus === 'PENDING_ACTIVATION')
  if (filter.value === 'READY') list = list.filter((r) => r.galleryReady)
  const kw = keyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(
      (r) => (r.displayName || '').toLowerCase().includes(kw) || (r.studentNo || '').includes(kw)
    )
  }
  return list
})

const pendingCount = computed(() => rows.value.filter((r) => r.accountStatus === 'PENDING_ACTIVATION').length)
const readyCount = computed(() => rows.value.filter((r) => r.galleryReady).length)

/** 限并发拉取每个学生的训练统计 */
async function loadStats() {
  const queue = [...rows.value]
  const workers = Array.from({ length: 5 }, async () => {
    for (;;) {
      const row = queue.shift()
      if (!row) return
      row.statsLoading = true
      try {
        row.stats = await teacherStudentApi.stats(row.studentId)
      } catch {
        row.stats = null
      } finally {
        row.statsLoading = false
      }
    }
  })
  await Promise.all(workers)
}

function madeRateOf(row) {
  const by = row.stats?.byAction || []
  const rates = by.filter((a) => a.madeRate !== null && a.madeRate !== undefined)
  if (!rates.length) return null
  const total = rates.reduce((s, a) => s + (a.clipCount || 0), 0)
  if (!total) return null
  const weighted = rates.reduce((s, a) => s + (Number(a.madeRate) <= 1 ? a.madeRate * 100 : a.madeRate) * (a.clipCount || 0), 0)
  return Math.round(weighted / total)
}

async function load() {
  loading.value = true
  try {
    const [l, e] = await Promise.all([lessonApi.detail(props.lessonId), lessonApi.enrollments(props.lessonId)])
    lesson.value = l
    rows.value = (e || []).map((x) => ({ ...x, stats: null, statsLoading: false }))
    loadStats()
  } catch (err) {
    toast.err(errText(err, '加载名单失败'))
  } finally {
    loading.value = false
  }
}

async function removeStudent(row) {
  if (!confirm(`将 ${row.displayName || row.studentNo} 移出本班？`)) return
  try {
    await lessonApi.unenroll(props.lessonId, row.studentId)
    rows.value = rows.value.filter((r) => r.studentId !== row.studentId)
    toast.ok('已移出')
  } catch (err) {
    toast.err(errText(err, '移除失败'))
  }
}

onMounted(load)
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div>
        <div class="crumbs">
          <router-link to="/lessons">课程管理</router-link>
          <span>›</span>
          <span class="cur">{{ lesson?.title || '…' }}<template v-if="lesson?.classCode"> · {{ lesson.classCode }}班</template></span>
        </div>
        <div class="head-title-row">
          <button class="btn-back-sq" @click="router.push(`/lessons/${lessonId}`)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M15 5l-7 7 7 7" stroke="#3A3A3C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <h2 class="page-title">学生名单　<span class="cnt">{{ rows.length }} 人</span></h2>
        </div>
      </div>
      <button class="btn" @click="router.push(`/lessons/${lessonId}/import`)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M12 15V4M12 4L8 8M12 4l4 4" stroke="#3A3A3C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4" stroke="#3A3A3C" stroke-width="2" stroke-linecap="round" />
        </svg>
        批量导入
      </button>
    </div>

    <div class="filter-bar">
      <div class="chips">
        <button class="chip" :class="{ on: filter === 'ALL' }" @click="filter = 'ALL'">全部 {{ rows.length }}</button>
        <button class="chip" :class="{ on: filter === 'PENDING' }" @click="filter = 'PENDING'">待激活 {{ pendingCount }}</button>
        <button class="chip" :class="{ on: filter === 'READY' }" @click="filter = 'READY'">识别底库就绪 {{ readyCount }}</button>
      </div>
      <div class="search-box" style="width: 220px">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="#A1A1A6" stroke-width="1.9" />
          <line x1="16" y1="16" x2="20" y2="20" stroke="#A1A1A6" stroke-width="1.9" stroke-linecap="round" />
        </svg>
        <input v-model="keyword" placeholder="搜索姓名 / 学号" />
      </div>
    </div>

    <div class="content" style="padding: 0; overflow: hidden; display: flex; flex-direction: column">
      <div class="gtable" style="flex: 1; overflow: hidden; --cols: 2.2fr 1.3fr 1fr 1.4fr 1.2fr 1.2fr 1fr">
        <div class="thead">
          <span>学生</span>
          <span>账号状态</span>
          <span>命中率</span>
          <span>出手 · 训练</span>
          <span>识别底库</span>
          <span>加入时间</span>
          <span>操作</span>
        </div>
        <div style="flex: 1; overflow-y: auto">
          <div v-if="loading" style="padding: 24px 26px">
            <div v-for="i in 5" :key="i" class="skeleton" style="height: 40px; margin-bottom: 12px"></div>
          </div>
          <div v-else-if="!filtered.length" class="empty-hint">
            {{ rows.length ? '没有匹配的学生' : '本班还没有学生，点击右上角「批量导入」添加' }}
          </div>
          <div
            v-for="r in filtered"
            :key="r.studentId"
            class="trow"
            :class="{ hl: r.justCreated }"
            style="cursor: pointer"
            @click="router.push(`/students/${r.studentId}`)"
          >
            <div style="display: flex; align-items: center; gap: 12px">
              <span class="avatar" :style="{ width: '38px', height: '38px', fontSize: '14px', background: avatarColor(r.studentId) }">
                {{ nameInitial(r.displayName, '生') }}
              </span>
              <div>
                <div style="font-size: 15px; font-weight: 600">{{ r.displayName || '未命名' }}</div>
                <div style="font: 500 12px/1 var(--mono); color: var(--gray-2); margin-top: 3px">{{ r.studentNo }}</div>
              </div>
            </div>
            <div>
              <span class="pill" :class="ACCOUNT_STATUS[r.accountStatus]?.tone === 'ok' ? 'ok' : ACCOUNT_STATUS[r.accountStatus]?.tone === 'warn' ? 'warn' : 'muted'">
                {{ ACCOUNT_STATUS[r.accountStatus]?.label || r.accountStatus }}
              </span>
            </div>
            <div style="font-size: 16px; font-weight: 700">
              <template v-if="r.statsLoading"><span class="skeleton" style="display: inline-block; width: 36px; height: 18px"></span></template>
              <template v-else-if="madeRateOf(r) !== null">{{ madeRateOf(r) }}<span style="font-size: 12px; color: var(--gray-3); font-weight: 600">%</span></template>
              <template v-else><span style="color: var(--gray-3)">—</span></template>
            </div>
            <div>
              <div style="font-size: 14px"><strong>{{ r.stats?.totalClips ?? '—' }}</strong> 次出手</div>
              <div style="font-size: 12px; color: var(--gray-2); margin-top: 2px">{{ r.stats?.totalSessions ?? '—' }} 次训练</div>
            </div>
            <div>
              <span v-if="r.galleryReady" style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--ok)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12l5 5 9-11" stroke="#2FB170" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                已就绪
              </span>
              <span v-else style="font-size: 13px; color: var(--gray-2)">未采集</span>
            </div>
            <div style="font: 500 13px/1 var(--mono); color: var(--ink-3)">{{ fmtDate(r.enrolledAt) }}</div>
            <div>
              <button class="rm" @click.stop="removeStudent(r)">移出</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cnt {
  font-size: 15px;
  font-weight: 500;
  color: var(--gray);
}
.filter-bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 32px;
  background: #fff;
  border-bottom: 1px solid var(--line);
}
.rm {
  font-size: 13px;
  font-weight: 600;
  color: var(--gray);
  border-radius: 9px;
  padding: 6px 12px;
  background: var(--fill-2);
}
.rm:hover {
  color: var(--danger);
  background: var(--danger-bg);
}
</style>
