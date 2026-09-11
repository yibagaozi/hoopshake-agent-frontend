<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { errText, fmtMonthDay, normalizePage, sessionStatusLabel, studentDataApi } from '@hoopshake/core'
import { toast } from '../toast.js'
import TabBar from '../components/TabBar.vue'

const router = useRouter()
const loading = ref(true)
const items = ref([])
const page = ref(0)
const hasNext = ref(false)

async function load(p = 0) {
  loading.value = true
  try {
    const res = normalizePage(await studentDataApi.sessions({ page: p, size: 20 }))
    items.value = p === 0 ? res.content : [...items.value, ...res.content]
    page.value = res.page
    hasNext.value = res.hasNext
  } catch (err) {
    toast.err(errText(err, '加载训练记录失败'))
  } finally {
    loading.value = false
  }
}

onMounted(() => load(0))
</script>

<template>
  <div class="scroll-body page-pad">
    <div class="head-row">
      <div class="h1">训练报告</div>
    </div>

    <template v-if="loading && !items.length">
      <div v-for="i in 4" :key="i" class="card row"><div class="skeleton" style="height: 44px; flex: 1"></div></div>
    </template>

    <div v-else-if="!items.length" class="empty-hint">还没有课堂记录，上完课就能看到报告啦</div>

    <div
      v-for="(s, i) in items"
      :key="s.sessionId"
      class="card row"
      @click="router.push(`/report/${s.sessionId}`)"
    >
      <div class="date-chip" :class="{ hot: i === 0 }">
        <span class="d">{{ fmtMonthDay(s.recordedAt).day }}</span>
        <span class="m">{{ fmtMonthDay(s.recordedAt).month }}</span>
      </div>
      <div class="mid">
        <div class="name">{{ s.lessonTitle || '自由训练' }}</div>
        <div class="sub">
          {{ s.clipCount }} 次出手
          <template v-if="s.keyImprovementLabel"> · 改进 {{ s.keyImprovementLabel }}</template>
        </div>
      </div>
      <span class="status">{{ sessionStatusLabel(s.status) }}</span>
      <span class="chev">›</span>
    </div>

    <button v-if="hasNext" class="load-more" :disabled="loading" @click="load(page + 1)">
      {{ loading ? '加载中…' : '加载更多' }}
    </button>
    <div style="height: 104px"></div>
  </div>
  <TabBar />
</template>

<style scoped>
.page-pad {
  padding: calc(env(safe-area-inset-top, 0px) + 20px) 22px 0;
}
.head-row {
  margin-bottom: 18px;
}
.h1 {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.row {
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
.mid {
  flex: 1;
  min-width: 0;
}
.name {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sub {
  font-size: 13px;
  color: var(--gray);
  margin-top: 2px;
}
.status {
  font-size: 11px;
  font-weight: 600;
  color: var(--gray);
  background: var(--fill);
  border-radius: 99px;
  padding: 4px 9px;
  flex: none;
}
.chev {
  color: var(--gray-4);
  font-size: 20px;
}
.load-more {
  width: 100%;
  padding: 13px 0;
  border-radius: 99px;
  background: #fff;
  color: var(--ink-3);
  font-size: 14px;
  font-weight: 600;
  margin-top: 4px;
}
</style>
