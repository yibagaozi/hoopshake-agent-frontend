<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  errText,
  fmtFriendly,
  helpIsOpen,
  helpStatusLabel,
  helpStatusTone,
  normalizePage,
  studentHelpApi,
} from '@hoopshake/core'
import { toast } from '../toast.js'

/**
 * 我的求助。
 *
 * 之前 studentHelpApi.list 定义了却从没被调用 —— 学生在对话里点完
 * 「请求老师当面指导」就再也看不到下文，不知道老师收没收到、回没回。
 * 这页把那条闭环补上。
 */
const router = useRouter()
const loading = ref(true)
const loadErr = ref('')
const items = ref([])
const page = ref(0)
const hasNext = ref(false)

async function load(p = 0) {
  loading.value = true
  if (p === 0) loadErr.value = ''
  try {
    const res = normalizePage(await studentHelpApi.list(p, 20))
    const rows = res.content.map((r) => ({ ...r, open: helpIsOpen(r.status) }))
    items.value = p === 0 ? rows : [...items.value, ...rows]
    page.value = res.page
    hasNext.value = res.hasNext
  } catch (err) {
    if (p === 0) loadErr.value = errText(err, '加载求助记录失败')
    else toast.err(errText(err))
  } finally {
    loading.value = false
  }
}

onMounted(() => load(0))
</script>

<template>
  <div class="edit-head">
    <button class="btn-back" @click="router.back()">‹</button>
    <span class="t">我的求助</span>
    <span style="width: 40px"></span>
  </div>

  <div class="scroll-body body-pad">
    <template v-if="loading && !items.length">
      <div v-for="i in 3" :key="i" class="card row"><div class="skeleton" style="height: 62px; flex: 1"></div></div>
    </template>

    <div v-else-if="loadErr" class="load-err">
      <div class="le-t">没能加载求助记录</div>
      <div class="le-s">{{ loadErr }}</div>
      <button class="le-btn" @click="load(0)">重试</button>
    </div>

    <div v-else-if="!items.length" class="empty-hint">
      还没有求助记录。在 AI 教练对话里遇到讲不清的问题时，可以点「请求老师当面指导」。
    </div>

    <div v-for="r in items" :key="r.id" class="card hr">
      <div class="hr-top">
        <span class="pill" :class="helpStatusTone(r.status)">{{ helpStatusLabel(r.status) }}</span>
        <span class="hr-time">{{ fmtFriendly(r.createdAt) }}</span>
      </div>
      <div class="hr-q">{{ r.question }}</div>

      <div v-if="r.teacherReply" class="hr-reply">
        <div class="hr-rt">
          {{ r.teacherName || '老师' }} 的回复
          <span v-if="r.handledAt" class="hr-rtime">{{ fmtFriendly(r.handledAt) }}</span>
        </div>
        <div class="hr-rc">{{ r.teacherReply }}</div>
      </div>
      <!-- 已处理但没留文字：说清「老师看过了」，别让人以为系统吞了 -->
      <div v-else-if="!r.open" class="hr-note">
        {{ r.teacherName ? `${r.teacherName}老师已处理，没有留言` : '已处理，没有留言' }}
      </div>
      <div v-else class="hr-note">等老师查看，下次课会重点关注</div>
    </div>

    <button v-if="hasNext" class="load-more" :disabled="loading" @click="load(page + 1)">
      {{ loading ? '加载中…' : '加载更多' }}
    </button>
    <div style="height: 40px"></div>
  </div>
</template>

<style scoped>
.edit-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: calc(env(safe-area-inset-top, 0px) + 14px) 18px 12px;
}
.edit-head .t {
  font-size: 17px;
  font-weight: 700;
}
.body-pad {
  padding: 8px 22px 0;
}
.row {
  padding: 14px 16px;
  margin-bottom: 12px;
  display: flex;
}
.hr {
  padding: 16px 18px;
  margin-bottom: 12px;
}
.hr-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.pill {
  font-size: 12px;
  font-weight: 600;
  border-radius: 99px;
  padding: 4px 11px;
}
.pill.ok {
  color: var(--ok-deep);
  background: var(--ok-bg);
}
.pill.warn {
  color: var(--warn);
  background: var(--warn-bg);
}
.pill.info {
  color: #3766a0;
  background: #eaf2fb;
}
.pill.muted {
  color: var(--gray);
  background: var(--fill-2);
}
.hr-time {
  font-size: 12px;
  color: var(--gray-2);
}
.hr-q {
  font-size: 14px;
  color: var(--ink);
  line-height: 1.6;
  word-break: break-word;
}
.hr-reply {
  margin-top: 13px;
  background: var(--fill);
  border-radius: 16px;
  padding: 12px 14px;
}
.hr-rt {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--brand-deep);
  margin-bottom: 6px;
}
.hr-rtime {
  font-weight: 500;
  color: var(--gray-2);
}
.hr-rc {
  font-size: 14px;
  color: var(--ink-2);
  line-height: 1.65;
  word-break: break-word;
}
.hr-note {
  margin-top: 11px;
  font-size: 12px;
  color: var(--gray-2);
}
.load-err {
  background: #fff;
  border-radius: 22px;
  padding: 26px 20px;
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
.load-more {
  width: 100%;
  height: 46px;
  border-radius: 16px;
  background: #fff;
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 600;
  margin-top: 4px;
}
</style>
