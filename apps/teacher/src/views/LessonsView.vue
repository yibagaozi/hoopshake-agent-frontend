<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  actionLabel,
  errText,
  fmtDate,
  fmtTime,
  fmtWeekday,
  fromLocalInput,
  lessonApi,
  lessonStatusLabel,
  pageItems,
  teacherHelpApi,
} from '@hoopshake/core'
import { useAuthStore } from '../stores/auth.js'
import { toast } from '../toast.js'
import Modal from '../components/Modal.vue'

const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const lessons = ref([])
const filter = ref('ALL')
const keyword = ref('')

/**
 * 学生求助收件箱。
 * 文档（cloud-frontend-api §3.5）只给了 POST /{requestId}/handle，
 * 没写教师侧的列表端点，这里按同一前缀试 GET /api/teacher/help-requests。
 * 取不到就整块不显示 —— 宁可少一个入口，也不要在概览页挂一个常红的报错。
 */
const helpRequests = ref([])
const helpAvailable = ref(false)
const handling = ref(null)

async function loadHelpRequests() {
  try {
    const list = pageItems(await teacherHelpApi.list({ status: 'PENDING', size: 20 }))
    helpRequests.value = list
    helpAvailable.value = true
  } catch {
    helpAvailable.value = false
  }
}

async function handleHelp(r) {
  const reply = prompt(`回复「${r.studentName || r.studentNo || '学生'}」的求助`, '下次课重点帮你纠正')
  if (reply === null) return
  handling.value = r.requestId
  try {
    await teacherHelpApi.handle(r.requestId, { reply: reply.trim(), status: 'HANDLED' })
    helpRequests.value = helpRequests.value.filter((x) => x.requestId !== r.requestId)
    toast.ok('已回复')
  } catch (err) {
    toast.err(errText(err, '处理失败'))
  } finally {
    handling.value = null
  }
}

const createOpen = ref(false)
const creating = ref(false)
const form = ref({
  title: '',
  classCode: '',
  gradeBand: '',
  scheduledAt: '',
  durationMinutes: 45,
  actionTypes: [],
  enabledCheckpoints: [],
  customAction: '',
  customCheckpoint: '',
})

/** 词表接口未开放（50100），提供常用候选，可自定义补充 */
const ACTION_PRESETS = ['jump_shot', 'layup', 'free_throw', 'dribble', 'pass']
const CHECKPOINT_PRESETS = ['elbow_alignment', 'release_timing', 'knee_valgus', 'follow_through', 'jump_balance']

const counts = computed(() => {
  const c = { ALL: lessons.value.length, PLANNED: 0, ONGOING: 0, FINISHED: 0 }
  for (const l of lessons.value) c[l.status] = (c[l.status] || 0) + 1
  return c
})

const filtered = computed(() => {
  let list = lessons.value
  if (filter.value !== 'ALL') list = list.filter((l) => l.status === filter.value)
  const kw = keyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(
      (l) => (l.title || '').toLowerCase().includes(kw) || (l.classCode || '').toLowerCase().includes(kw)
    )
  }
  return list
})

const totalStudents = computed(() => lessons.value.reduce((s, l) => s + (l.enrolledCount || 0), 0))

async function load() {
  loading.value = true
  try {
    lessons.value = pageItems(await lessonApi.list({ size: 100 })).sort(
      (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
    )
  } catch (err) {
    toast.err(errText(err, '加载课程失败'))
  } finally {
    loading.value = false
  }
}

function toggleIn(arr, v) {
  const i = arr.indexOf(v)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(v)
}

function addCustom(field, listField) {
  const v = form.value[field].trim()
  if (!v) return
  if (!form.value[listField].includes(v)) form.value[listField].push(v)
  form.value[field] = ''
}

async function create() {
  const f = form.value
  if (!f.title.trim()) {
    toast('请填写课程名称')
    return
  }
  if (!f.actionTypes.length) {
    toast('请至少选择一个训练动作')
    return
  }
  creating.value = true
  try {
    const lesson = await lessonApi.create({
      title: f.title.trim(),
      classCode: f.classCode.trim() || undefined,
      actionTypes: f.actionTypes,
      enabledCheckpoints: f.enabledCheckpoints.length ? f.enabledCheckpoints : undefined,
      gradeBand: f.gradeBand.trim() || undefined,
      scheduledAt: fromLocalInput(f.scheduledAt) || undefined,
      durationMinutes: f.durationMinutes ? Number(f.durationMinutes) : undefined,
    })
    toast.ok('课程已创建')
    createOpen.value = false
    router.push(`/lessons/${lesson.lessonId}`)
  } catch (err) {
    toast.err(errText(err, '创建失败'))
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  auth.fetchMe()
  load()
  loadHelpRequests()
})
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div>
        <h2 class="page-title">课程管理</h2>
        <p class="page-sub">
          共 {{ lessons.length }} 个班级 · {{ totalStudents }} 名学生
          <template v-if="counts.ONGOING"> · <span class="hot">{{ counts.ONGOING }} 个进行中</span></template>
        </p>
      </div>
      <button class="btn primary" @click="createOpen = true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <line x1="12" y1="5" x2="12" y2="19" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
          <line x1="5" y1="12" x2="19" y2="12" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
        </svg>
        新建课程
      </button>
    </div>

    <div class="filter-bar">
      <div class="chips">
        <button class="chip" :class="{ on: filter === 'ALL' }" @click="filter = 'ALL'">全部 {{ counts.ALL }}</button>
        <button class="chip" :class="{ on: filter === 'ONGOING' }" @click="filter = 'ONGOING'">进行中 {{ counts.ONGOING || 0 }}</button>
        <button class="chip" :class="{ on: filter === 'PLANNED' }" @click="filter = 'PLANNED'">未开课 {{ counts.PLANNED || 0 }}</button>
        <button class="chip" :class="{ on: filter === 'FINISHED' }" @click="filter = 'FINISHED'">已结课 {{ counts.FINISHED || 0 }}</button>
      </div>
      <div class="search-box" style="width: 250px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="#A1A1A6" stroke-width="1.9" />
          <line x1="16" y1="16" x2="20" y2="20" stroke="#A1A1A6" stroke-width="1.9" stroke-linecap="round" />
        </svg>
        <input v-model="keyword" placeholder="搜索班级或课程" />
      </div>
    </div>

    <div class="content">
      <!-- 学生求助（§3.5），接口不可用时整块不渲染 -->
      <div v-if="helpAvailable && helpRequests.length" class="panel help-box">
        <div class="help-head">
          <span class="help-badge">{{ helpRequests.length }}</span>
          学生求助待处理
        </div>
        <div v-for="r in helpRequests" :key="r.requestId" class="help-row">
          <div class="help-mid">
            <div class="help-who">{{ r.studentName || r.studentNo || '学生' }}</div>
            <div class="help-q">{{ r.question }}</div>
          </div>
          <button class="btn sm" :disabled="handling === r.requestId" @click="handleHelp(r)">
            {{ handling === r.requestId ? '处理中…' : '回复' }}
          </button>
        </div>
      </div>

      <div v-if="loading" class="cards">
        <div v-for="i in 6" :key="i" class="panel lesson-card"><div class="skeleton" style="height: 150px"></div></div>
      </div>
      <div v-else-if="!filtered.length" class="empty-hint">
        {{ lessons.length ? '没有符合条件的课程' : '还没有课程，点击右上角「新建课程」开始' }}
      </div>
      <div v-else class="cards">
        <div v-for="l in filtered" :key="l.lessonId" class="panel lesson-card" @click="router.push(`/lessons/${l.lessonId}`)">
          <div class="lc-head">
            <div>
              <div class="lc-code">{{ l.classCode || '未设班级' }}</div>
              <div class="lc-title">{{ l.title }}</div>
            </div>
            <span class="pill" :class="l.status === 'ONGOING' ? 'ok' : 'muted'">{{ lessonStatusLabel(l.status) }}</span>
          </div>
          <div class="lc-stats">
            <div>
              <div class="n">{{ l.enrolledCount ?? 0 }}</div>
              <div class="t">参课学生</div>
            </div>
            <div>
              <div class="n">{{ (l.actionTypes || []).length }}</div>
              <div class="t">训练动作</div>
            </div>
            <div>
              <div class="n">{{ (l.enabledCheckpoints || []).length }}</div>
              <div class="t">检查点</div>
            </div>
          </div>
          <div class="lc-meta">
            <div class="meta-row">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="#A1A1A6" stroke-width="1.8" />
                <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" stroke="#A1A1A6" stroke-width="1.8" />
              </svg>
              <span>
                <template v-if="l.scheduledAt">{{ fmtDate(l.scheduledAt) }} {{ fmtWeekday(l.scheduledAt) }} {{ fmtTime(l.scheduledAt) }}</template>
                <template v-else>未排课</template>
                <template v-if="l.durationMinutes"> · {{ l.durationMinutes }} 分钟</template>
              </span>
            </div>
            <div class="meta-row">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="8.5" stroke="#FF6A2C" stroke-width="1.8" />
                <path d="M12 7.5V12l3 2" stroke="#FF6A2C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="acts">
                <template v-if="(l.actionTypes || []).length">
                  {{ l.actionTypes.slice(0, 3).map(actionLabel).join(' · ') }}<template v-if="l.actionTypes.length > 3"> 等</template>
                </template>
                <template v-else>未配置动作</template>
              </span>
            </div>
          </div>
          <div class="lc-foot">
            <span v-if="l.status === 'ONGOING'" class="pill brand"><span class="dot" style="animation: recpulse 1.6s infinite"></span>课堂进行中</span>
            <span v-else class="muted-note">{{ l.gradeBand || ' ' }}</span>
            <span class="enter">进入班级<span style="font-size: 16px">›</span></span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 新建课程 -->
  <Modal :open="createOpen" title="新建课程" :width="620" @close="createOpen = false">
    <div class="cform">
      <div class="fld">
        <label>课程名称 <span class="req">*</span></label>
        <input v-model="form.title" class="txt" placeholder="如：投篮基础课" />
      </div>
      <div class="two">
        <div class="fld">
          <label>班级编号</label>
          <input v-model="form.classCode" class="txt" placeholder="如：2026060002" />
        </div>
        <div class="fld">
          <label>年级段</label>
          <input v-model="form.gradeBand" class="txt" placeholder="如：初一 / 高二" />
        </div>
      </div>
      <div class="two">
        <div class="fld">
          <label>上课时间</label>
          <input v-model="form.scheduledAt" type="datetime-local" class="txt" />
        </div>
        <div class="fld">
          <label>时长（分钟，10–240）</label>
          <input v-model="form.durationMinutes" type="number" min="10" max="240" class="txt" />
        </div>
      </div>
      <div class="fld">
        <label>训练动作 <span class="req">*</span></label>
        <div class="pick-row">
          <button
            v-for="a in [...new Set([...ACTION_PRESETS, ...form.actionTypes])]"
            :key="a"
            class="pick"
            :class="{ on: form.actionTypes.includes(a) }"
            @click="toggleIn(form.actionTypes, a)"
          >
            {{ actionLabel(a) }}
          </button>
        </div>
        <div class="add-row">
          <input v-model="form.customAction" class="txt" style="height: 40px; border-radius: 10px" placeholder="自定义动作 ID（需与后端词表一致）" @keyup.enter="addCustom('customAction', 'actionTypes')" />
          <button class="btn sm" @click="addCustom('customAction', 'actionTypes')">添加</button>
        </div>
      </div>
      <div class="fld">
        <label>启用检查点</label>
        <div class="pick-row">
          <button
            v-for="c in [...new Set([...CHECKPOINT_PRESETS, ...form.enabledCheckpoints])]"
            :key="c"
            class="pick"
            :class="{ on: form.enabledCheckpoints.includes(c) }"
            @click="toggleIn(form.enabledCheckpoints, c)"
          >
            {{ c }}
          </button>
        </div>
        <div class="add-row">
          <input v-model="form.customCheckpoint" class="txt" style="height: 40px; border-radius: 10px" placeholder="自定义检查点 ID" @keyup.enter="addCustom('customCheckpoint', 'enabledCheckpoints')" />
          <button class="btn sm" @click="addCustom('customCheckpoint', 'enabledCheckpoints')">添加</button>
        </div>
      </div>
    </div>
    <template #foot>
      <button class="btn" @click="createOpen = false">取消</button>
      <button class="btn primary" :disabled="creating" @click="create">{{ creating ? '创建中…' : '创建课程' }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.help-box {
  padding: 18px 22px;
  margin-bottom: 18px;
  border-left: 3px solid var(--brand);
}
.help-head {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 12px;
}
.help-badge {
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 99px;
  background: var(--brand);
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.help-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 11px 0;
  border-top: 1px solid var(--divider);
}
.help-mid {
  flex: 1;
  min-width: 0;
}
.help-who {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-2);
}
.help-q {
  font-size: 13px;
  color: var(--gray);
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hot {
  color: var(--brand-deep);
  font-weight: 600;
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
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  align-content: start;
}
.lesson-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  transition: box-shadow 0.15s, transform 0.15s;
}
.lesson-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.07);
  transform: translateY(-1px);
}
.lc-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.lc-code {
  font: 600 12px/1 var(--mono);
  color: var(--gray-2);
  margin-bottom: 7px;
}
.lc-title {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.lc-stats {
  display: flex;
  gap: 26px;
}
.lc-stats .n {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.lc-stats .t {
  font-size: 12px;
  color: var(--gray);
  margin-top: 2px;
}
.lc-meta {
  display: flex;
  flex-direction: column;
  gap: 9px;
  border-top: 1px solid var(--divider);
  padding-top: 14px;
}
.meta-row {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  color: var(--ink-3);
}
.acts {
  color: var(--ink-2);
}
.lc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--divider);
  padding-top: 13px;
}
.muted-note {
  font-size: 13px;
  color: var(--gray-2);
}
.enter {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 600;
  color: var(--gray);
}
.lesson-card:hover .enter {
  color: var(--brand-deep);
}
.cform {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.req {
  color: var(--brand-deep);
}
.pick-row {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-bottom: 9px;
}
.pick {
  font-size: 13px;
  font-weight: 500;
  color: var(--gray);
  background: var(--fill-2);
  border: 1px solid var(--line-2);
  border-radius: 11px;
  padding: 9px 15px;
}
.pick.on {
  font-weight: 600;
  color: #fff;
  background: var(--brand);
  border-color: var(--brand);
}
.add-row {
  display: flex;
  gap: 9px;
}
</style>
