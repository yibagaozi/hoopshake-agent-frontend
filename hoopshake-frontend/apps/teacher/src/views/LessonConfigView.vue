<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  actionLabel,
  errText,
  fromLocalInput,
  isCode,
  lessonApi,
  lessonStatusLabel,
  toLocalInput,
} from '@hoopshake/core'
import { toast } from '../toast.js'

const props = defineProps({ lessonId: { type: String, required: true } })
const router = useRouter()

const lesson = ref(null)
const saving = ref(false)

const form = ref({
  title: '',
  classCode: '',
  gradeBand: '',
  scheduledAt: '',
  durationMinutes: null,
  actionTypes: [],
  enabledCheckpoints: [],
})
const customAction = ref('')
const customCheckpoint = ref('')

const ACTION_PRESETS = ['jump_shot', 'layup', 'free_throw', 'dribble', 'pass']
const CHECKPOINT_PRESETS = ['elbow_alignment', 'release_timing', 'knee_valgus', 'follow_through', 'jump_balance']

const editable = computed(() => lesson.value?.status === 'PLANNED')
const actionOptions = computed(() => [...new Set([...ACTION_PRESETS, ...form.value.actionTypes])])
const checkpointOptions = computed(() => [...new Set([...CHECKPOINT_PRESETS, ...form.value.enabledCheckpoints])])

/** 安全类检查点的启发式标记（词表未开放时按 ID 关键词判断） */
function isSafety(id) {
  return /knee|valgus|land|safety|ankle/i.test(id)
}

function toggleAction(a) {
  if (!editable.value) return
  const arr = form.value.actionTypes
  const i = arr.indexOf(a)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(a)
}

function toggleCheckpoint(c) {
  if (!editable.value) return
  const arr = form.value.enabledCheckpoints
  const i = arr.indexOf(c)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(c)
}

function addAction() {
  const v = customAction.value.trim()
  if (!v) return
  if (!form.value.actionTypes.includes(v)) form.value.actionTypes.push(v)
  customAction.value = ''
}

function addCheckpoint() {
  const v = customCheckpoint.value.trim()
  if (!v) return
  if (!form.value.enabledCheckpoints.includes(v)) form.value.enabledCheckpoints.push(v)
  customCheckpoint.value = ''
}

async function load() {
  try {
    lesson.value = await lessonApi.detail(props.lessonId)
    const l = lesson.value
    form.value = {
      title: l.title || '',
      classCode: l.classCode || '',
      gradeBand: l.gradeBand || '',
      scheduledAt: toLocalInput(l.scheduledAt),
      durationMinutes: l.durationMinutes ?? null,
      actionTypes: [...(l.actionTypes || [])],
      enabledCheckpoints: [...(l.enabledCheckpoints || [])],
    }
  } catch (err) {
    toast.err(errText(err, '加载课程失败'))
  }
}

async function save() {
  if (!editable.value) {
    toast('仅未开课状态可修改配置')
    return
  }
  const f = form.value
  if (!f.title.trim()) {
    toast('课程名称不能为空')
    return
  }
  if (!f.actionTypes.length) {
    toast('请至少保留一个训练动作')
    return
  }
  saving.value = true
  try {
    lesson.value = await lessonApi.update(props.lessonId, {
      title: f.title.trim(),
      classCode: f.classCode.trim() || undefined,
      gradeBand: f.gradeBand.trim() || undefined,
      scheduledAt: fromLocalInput(f.scheduledAt) || undefined,
      durationMinutes: f.durationMinutes ? Number(f.durationMinutes) : undefined,
      actionTypes: f.actionTypes,
      enabledCheckpoints: f.enabledCheckpoints,
    })
    toast.ok('配置已保存并下发')
  } catch (err) {
    toast.err(isCode(err, 40910) ? '课程已开课，配置不可修改' : errText(err, '保存失败'))
  } finally {
    saving.value = false
  }
}
onMounted(load)
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div>
        <div class="head-title-row">
          <button class="btn-back-sq" @click="router.push(`/lessons/${lessonId}`)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M15 5l-7 7 7 7" stroke="#3A3A3C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <h2 class="page-title">课程配置</h2>
          <span v-if="lesson" class="pill" :class="lesson.status === 'ONGOING' ? 'ok' : 'muted'">{{ lessonStatusLabel(lesson.status) }}</span>
        </div>
        <p class="page-sub">配置本节课的训练动作与检查点，将同步到场边算法与知识库</p>
      </div>
      <div style="display: flex; gap: 12px">
        <button class="btn" @click="load">还原</button>
        <button class="btn primary" :disabled="saving || !editable" @click="save">
          {{ saving ? '保存中…' : '保存并下发' }}
        </button>
      </div>
    </div>

    <div class="content">
      <div v-if="lesson && !editable" class="wip-banner" style="margin-bottom: 20px">
        课程已{{ lesson.status === 'ONGOING' ? '开课' : '结课' }}，配置为只读（仅未开课状态可修改）。
      </div>

      <div class="cfg-grid">
        <!-- 左列 -->
        <div style="display: flex; flex-direction: column; gap: 24px">
          <div>
            <div class="sec-label">课程信息</div>
            <div class="panel soft" style="overflow: hidden">
              <div class="cfg-row">
                <span class="k">课程名称</span>
                <input v-model="form.title" class="inline-input" :disabled="!editable" />
              </div>
              <div class="cfg-row">
                <span class="k">班级</span>
                <input v-model="form.classCode" class="inline-input" placeholder="未设置" :disabled="!editable" />
              </div>
              <div class="cfg-row">
                <span class="k">年级段</span>
                <input v-model="form.gradeBand" class="inline-input" placeholder="未设置" :disabled="!editable" />
              </div>
              <div class="cfg-row">
                <span class="k">上课时间</span>
                <input v-model="form.scheduledAt" type="datetime-local" class="inline-input mono" :disabled="!editable" />
              </div>
              <div class="cfg-row" style="border-bottom: none">
                <span class="k">时长（分钟）</span>
                <input v-model="form.durationMinutes" type="number" min="10" max="240" class="inline-input" placeholder="45" :disabled="!editable" />
              </div>
            </div>
          </div>

          <div>
            <div class="sec-label">训练动作</div>
            <div class="acts-row">
              <button
                v-for="a in actionOptions"
                :key="a"
                class="act-chip"
                :class="{ on: form.actionTypes.includes(a) }"
                :disabled="!editable"
                @click="toggleAction(a)"
              >
                {{ actionLabel(a) }}
              </button>
            </div>
            <div v-if="editable" class="add-row">
              <input v-model="customAction" class="txt" style="height: 42px; border-radius: 10px" placeholder="自定义动作 ID（与后端词表一致）" @keyup.enter="addAction" />
              <button class="btn sm" @click="addAction">添加</button>
            </div>
          </div>
        </div>

        <!-- 右列：检查点 -->
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin: 0 2px 12px">
            <span class="sec-label" style="margin: 0">检查点配置 · CHECKPOINTS</span>
            <span style="font: 500 12px/1 var(--mono); color: var(--gray-3)">{{ form.enabledCheckpoints.length }} 项启用</span>
          </div>
          <div class="panel soft" style="overflow: hidden">
            <div v-for="c in checkpointOptions" :key="c" class="cp-row">
              <div style="flex: 1; display: flex; align-items: center; gap: 8px">
                <span class="cp-name">{{ c }}</span>
                <span v-if="isSafety(c)" class="safety-tag">安全</span>
              </div>
              <button
                class="switch"
                :class="{ on: form.enabledCheckpoints.includes(c) }"
                :disabled="!editable"
                @click="toggleCheckpoint(c)"
              >
                <span class="knob"></span>
              </button>
            </div>
            <div v-if="!checkpointOptions.length" class="empty-hint">暂无检查点，可在下方添加</div>
          </div>
          <div v-if="editable" class="add-row" style="margin-top: 12px">
            <input v-model="customCheckpoint" class="txt" style="height: 42px; border-radius: 10px" placeholder="自定义检查点 ID" @keyup.enter="addCheckpoint" />
            <button class="btn sm" @click="addCheckpoint">添加</button>
          </div>
          <div class="hint-row">
            <span class="i">i</span>检查点 ID 与场边算法、知识库共用同一词表（词表接口未开放，需与后端约定一致）
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cfg-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
@media (max-width: 1000px) {
  .cfg-grid {
    grid-template-columns: 1fr;
  }
}
.cfg-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 18px;
  border-bottom: 1px solid var(--line);
}
.cfg-row .k {
  font-size: 15px;
  color: var(--ink-3);
  flex: none;
}
.inline-input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  text-align: right;
  width: 60%;
  padding: 6px 0;
}
.inline-input:disabled {
  color: var(--ink);
  opacity: 1;
}
.inline-input.mono {
  font-family: var(--mono);
  font-weight: 600;
}
.inline-input::placeholder {
  color: var(--gray-2);
  font-weight: 400;
}
.acts-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.add-row {
  display: flex;
  gap: 9px;
  margin-top: 12px;
}
.cp-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
}
.cp-row:last-child {
  border-bottom: none;
}
.cp-name {
  font-size: 15px;
  font-weight: 600;
  font-family: var(--mono);
}
.safety-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--danger);
  background: var(--danger-bg);
  border-radius: 6px;
  padding: 2px 7px;
}
.hint-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 14px 2px 0;
  font-size: 13px;
  color: var(--gray-2);
  line-height: 1.5;
}
.hint-row .i {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid var(--gray-4);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  flex: none;
  margin-top: 2px;
}
</style>
