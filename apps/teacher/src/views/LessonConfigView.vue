<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  actionVocab,
  checkpointVocab,
  checkpointsForActions,
  errText,
  fromLocalInput,
  isCode,
  lessonApi,
  lessonStatusLabel,
  loadVocabulary,
  toLocalInput,
  vocabulary,
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

/**
 * 动作与检查点的候选项全部来自 GET /api/meta/vocabulary。
 *
 * 这是强约束，不是建议：云端保存课程时会校验 actionTypes / enabledCheckpoints
 * 里的每个 id 都在词表内，有一个不在就整单 40000 PARAM_INVALID。所以这里
 * 不再提供「自定义 ID」输入框 —— 那等于引导老师填一个必然被拒的值。
 */
const vocab = ref(vocabulary())

async function refreshVocabulary() {
  vocab.value = await loadVocabulary()
}

const editable = computed(() => lesson.value?.status === 'PLANNED')

const actionOptions = computed(() => actionVocab(vocab.value))

/** 检查点按已选动作过滤：先选动作再勾检查点，比一次摊开 13 项清楚 */
const checkpointOptions = computed(() => checkpointsForActions(form.value.actionTypes, vocab.value))

/**
 * 本课存着、但词表里没有的 id。多半是早期占位值，保存时会被云端拒掉，
 * 所以单独列出来让老师先清掉，而不是等提交后看一条看不懂的 40000。
 */
const staleActions = computed(() =>
  form.value.actionTypes.filter((a) => !actionVocab(vocab.value).some((x) => x.id === a))
)
const staleCheckpoints = computed(() =>
  form.value.enabledCheckpoints.filter((c) => !checkpointVocab(vocab.value).some((x) => x.id === c))
)
const hasStale = computed(() => staleActions.value.length + staleCheckpoints.value.length > 0)

function dropStale() {
  form.value.actionTypes = form.value.actionTypes.filter((a) => !staleActions.value.includes(a))
  form.value.enabledCheckpoints = form.value.enabledCheckpoints.filter(
    (c) => !staleCheckpoints.value.includes(c)
  )
}

function toggleAction(a) {
  if (!editable.value) return
  const arr = form.value.actionTypes
  const i = arr.indexOf(a)
  if (i >= 0) {
    arr.splice(i, 1)
    // 取消动作后，只适用于它的检查点留着没意义，跟着摘掉
    const still = new Set(checkpointsForActions(arr, vocab.value).map((c) => c.id))
    form.value.enabledCheckpoints = form.value.enabledCheckpoints.filter((c) => still.has(c))
  } else {
    arr.push(a)
  }
}

function toggleCheckpoint(c) {
  if (!editable.value) return
  const arr = form.value.enabledCheckpoints
  const i = arr.indexOf(c)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(c)
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
onMounted(() => {
  load()
  refreshVocabulary()
})
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
                :key="a.id"
                class="act-chip"
                :class="{ on: form.actionTypes.includes(a.id) }"
                :disabled="!editable"
                :title="`${a.id} · 机位 ${(a.cameras || []).join('/') || '—'}`"
                @click="toggleAction(a.id)"
              >
                {{ a.label }}
              </button>
            </div>
            <div class="hint-row" style="margin-top: 12px">
              <span class="i">i</span>
              <span>候选来自词表接口，勾选后下方才会列出对应的检查点。</span>
            </div>
          </div>
        </div>

        <!-- 右列：检查点 -->
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin: 0 2px 12px">
            <span class="sec-label" style="margin: 0">检查点配置 · CHECKPOINTS</span>
            <span style="font: 500 12px/1 var(--mono); color: var(--gray-3)">{{ form.enabledCheckpoints.length }} 项启用</span>
          </div>
          <!-- 存着但词表里没有的 id：保存时会被云端 40000 拒掉，先清干净 -->
          <div v-if="hasStale" class="stale-box">
            <div class="stale-t">有 {{ staleActions.length + staleCheckpoints.length }} 个 ID 不在词表里</div>
            <div class="stale-s">
              <span v-for="x in [...staleActions, ...staleCheckpoints]" :key="x" class="stale-chip">{{ x }}</span>
            </div>
            <div class="stale-n">
              这些多半是早期的占位值。保存时云端会整单拒掉（40000），场边也不会触发。
            </div>
            <button v-if="editable" class="btn sm" @click="dropStale">全部移除</button>
          </div>

          <div class="panel soft" style="overflow: hidden">
            <div v-for="c in checkpointOptions" :key="c.id" class="cp-row">
              <div style="flex: 1; display: flex; align-items: center; gap: 8px">
                <span class="cp-name">{{ c.label }}</span>
                <span class="cp-id">{{ c.id }}</span>
                <span v-if="c.safety" class="safety-tag">安全</span>
              </div>
              <button
                class="switch"
                :class="{ on: form.enabledCheckpoints.includes(c.id) }"
                :disabled="!editable"
                @click="toggleCheckpoint(c.id)"
              >
                <span class="knob"></span>
              </button>
            </div>
            <div v-if="!checkpointOptions.length" class="empty-hint">
              {{ form.actionTypes.length ? '所选动作暂无对应检查点' : '先在左侧选训练动作' }}
            </div>
          </div>

          <div class="hint-row">
            <span class="i">i</span>
            <span>
              候选按所选动作过滤，全部来自词表接口（<code>/api/meta/vocabulary</code>）。
              这套 ID 与场边规则引擎、即时反馈落库完全一致：勾了才会在现场触发提示；
              不在词表里的 ID 保存时会被云端拒掉，所以这里不提供手填入口。
            </span>
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
}
.cp-id {
  font: 500 11px/1 var(--mono);
  color: var(--gray-2);
  background: var(--fill-2);
  border-radius: 6px;
  padding: 3px 7px;
}
.stale-box {
  background: var(--warn-bg);
  border-radius: 16px;
  padding: 16px 18px;
  margin-bottom: 14px;
}
.stale-t {
  font-size: 14px;
  font-weight: 700;
  color: var(--warn);
  margin-bottom: 10px;
}
.stale-s {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.stale-chip {
  font: 500 12px/1 var(--mono);
  background: #fff;
  border-radius: 6px;
  padding: 5px 8px;
  color: var(--ink-2);
}
.stale-n {
  font-size: 12px;
  line-height: 1.65;
  color: var(--ink-3);
  margin-bottom: 12px;
}
.hint-row code {
  font: 500 11px/1 var(--mono);
  background: var(--fill-2);
  border-radius: 5px;
  padding: 2px 5px;
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
