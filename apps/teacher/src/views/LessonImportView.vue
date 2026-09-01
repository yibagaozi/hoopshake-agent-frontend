<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { errText, lessonApi } from '@hoopshake/core'
import { toast } from '../toast.js'

const props = defineProps({ lessonId: { type: String, required: true } })
const router = useRouter()

const lesson = ref(null)
const rawText = ref('')
const parsed = ref([]) // { studentNo, displayName }
const parseErrors = ref([]) // { line, reason }
const preview = ref(null) // { willCreate, willEnroll, alreadyEnrolled, invalid }
const step = ref(1) // 1 上传/粘贴 2 预检 3 完成
const busy = ref(false)
const importedCount = ref(0)

const totalRows = computed(() => parsed.value.length)

const previewRows = computed(() => {
  if (!preview.value) return []
  const p = preview.value
  return [
    ...(p.willCreate || []).map((x) => ({ ...x, kind: 'create' })),
    ...(p.willEnroll || []).map((x) => ({ ...x, kind: 'enroll' })),
    ...(p.alreadyEnrolled || []).map((x) => ({ ...x, kind: 'exists' })),
    ...(p.invalid || []).map((x) => ({ ...x, kind: 'invalid' })),
    // 本地解析阶段已剔除的行也要列出来，避免用户粘贴的内容被静默丢弃
    ...parseErrors.value.map((e) => ({
      studentNo: e.text,
      displayName: '',
      reason: `第 ${e.line} 行 · ${e.reason}`,
      kind: 'skipped',
    })),
  ]
})

const KIND = {
  create: { label: '新建账号', cls: 'ok' },
  enroll: { label: '加入本班', cls: 'info' },
  exists: { label: '已在班', cls: 'muted' },
  invalid: { label: '无效', cls: 'bad' },
  skipped: { label: '已跳过', cls: 'bad' },
}

/** 无效 = 服务端判定 + 本地剔除 */
const invalidCount = computed(() => (preview.value?.invalid?.length || 0) + parseErrors.value.length)

const importableCount = computed(
  () => (preview.value?.willCreate?.length || 0) + (preview.value?.willEnroll?.length || 0)
)

/** 解析粘贴/CSV 文本：每行「学号[,姓名]」，支持逗号 / Tab / 空格分隔 */
function parseText(text) {
  const rows = []
  const errors = []
  const seen = new Set()
  const lines = text.split(/\r?\n/)
  lines.forEach((line, idx) => {
    const t = line.trim()
    if (!t) return
    if (idx === 0 && /学号|studentNo/i.test(t)) return // 表头
    let parts = t.split(/[,，;；\t]+/).map((s) => s.trim()).filter(Boolean)
    if (parts.length === 1) parts = t.split(/\s+/).map((s) => s.trim()).filter(Boolean)
    const studentNo = (parts[0] || '').replace(/\D/g, '')
    const displayName = parts[1] || ''
    if (!/^\d{10}$/.test(studentNo)) {
      errors.push({ line: idx + 1, text: t, reason: '学号需为 10 位数字' })
      return
    }
    if (seen.has(studentNo)) {
      errors.push({ line: idx + 1, text: t, reason: '学号重复，已忽略' })
      return
    }
    seen.add(studentNo)
    rows.push({ studentNo, displayName: displayName || undefined })
  })
  return { rows, errors }
}

function applyParse() {
  const { rows, errors } = parseText(rawText.value)
  parsed.value = rows
  parseErrors.value = errors
  if (!rows.length) {
    toast('没有解析到有效的学号记录')
    return
  }
  if (rows.length > 500) {
    toast.err('单次最多导入 500 条，请分批')
    return
  }
  doPreview()
}

async function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  if (/\.xlsx?$/i.test(file.name)) {
    toast.err('请先在 Excel 中「另存为 CSV」再上传（或直接粘贴名单文本）')
    return
  }
  rawText.value = await file.text()
  applyParse()
}

function onDrop(e) {
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  if (/\.xlsx?$/i.test(file.name)) {
    toast.err('请先在 Excel 中「另存为 CSV」再上传（或直接粘贴名单文本）')
    return
  }
  file.text().then((t) => {
    rawText.value = t
    applyParse()
  })
}

async function doPreview() {
  busy.value = true
  try {
    preview.value = await lessonApi.previewEnroll(props.lessonId, parsed.value)
    step.value = 2
  } catch (err) {
    toast.err(errText(err, '预检失败'))
  } finally {
    busy.value = false
  }
}

async function doImport() {
  if (!importableCount.value) {
    toast('没有可导入的记录')
    return
  }
  busy.value = true
  try {
    const result = await lessonApi.enroll(props.lessonId, parsed.value)
    importedCount.value = (result || []).length
    step.value = 3
    toast.ok('导入完成')
  } catch (err) {
    toast.err(errText(err, '导入失败'))
  } finally {
    busy.value = false
  }
}

function downloadTemplate() {
  const csv = '学号,姓名\n2026030118,李晓峰\n2026030119,王浩\n'
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'hoopshake_学生导入模板.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}

onMounted(async () => {
  try {
    lesson.value = await lessonApi.detail(props.lessonId)
  } catch {
    /* 名单页会提示 */
  }
})
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div>
        <div class="crumbs">
          <router-link :to="`/lessons/${lessonId}`">课程详情</router-link>
          <span>›</span>
          <span class="cur">{{ lesson?.title || '…' }}<template v-if="lesson?.classCode"> · {{ lesson.classCode }}班</template></span>
        </div>
        <div class="head-title-row">
          <button class="btn-back-sq" @click="router.push(`/lessons/${lessonId}/roster`)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M15 5l-7 7 7 7" stroke="#3A3A3C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <h2 class="page-title">批量导入学生</h2>
        </div>
      </div>
      <button class="btn" @click="downloadTemplate">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M12 15V4M12 15l-4-4M12 15l4-4" stroke="#3A3A3C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M5 18h14" stroke="#3A3A3C" stroke-width="2" stroke-linecap="round" />
        </svg>
        下载导入模板
      </button>
    </div>

    <div class="content imp-layout">
      <!-- 左栏 -->
      <div class="left-col">
        <label
          class="dropzone"
          @dragover.prevent
          @drop.prevent="onDrop"
        >
          <span class="dz-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 16V5M12 5L7 10M12 5l5 5" stroke="#FF6A2C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M5 18h14" stroke="#FF6A2C" stroke-width="2" stroke-linecap="round" />
            </svg>
          </span>
          <div class="dz-title">拖拽 CSV 文件到此处</div>
          <div class="dz-sub">或粘贴名单文本到下方输入框<br />每行「学号,姓名」，单次最多 500 条</div>
          <span class="btn dark sm" style="margin-top: 4px">选择文件<input type="file" accept=".csv,.txt" hidden @change="onFile" /></span>
        </label>

        <div class="panel steps-panel">
          <div class="sec-label" style="margin-bottom: 14px">导入步骤</div>
          <div class="st" :class="{ done: step > 1, cur: step === 1 }">
            <span class="sn">{{ step > 1 ? '✓' : '1' }}</span>
            <div>
              <div class="st-t">粘贴 / 上传名单</div>
              <div class="st-s">{{ totalRows ? `已解析 ${totalRows} 条` : '支持 CSV 与文本粘贴' }}</div>
            </div>
          </div>
          <div class="st" :class="{ done: step > 2, cur: step === 2 }">
            <span class="sn">{{ step > 2 ? '✓' : '2' }}</span>
            <div>
              <div class="st-t">核对预检结果</div>
              <div class="st-s" v-if="preview">
                新建 {{ preview.willCreate?.length || 0 }} · 入班 {{ preview.willEnroll?.length || 0 }} · 无效 {{ invalidCount }}
              </div>
              <div class="st-s" v-else>预检不会写入任何数据</div>
            </div>
          </div>
          <div class="st" :class="{ cur: step === 3, done: step === 3 }">
            <span class="sn">{{ step === 3 ? '✓' : '3' }}</span>
            <div>
              <div class="st-t">确认导入并生成名单</div>
              <div class="st-s" v-if="step === 3">本班现有 {{ importedCount }} 人</div>
            </div>
          </div>
        </div>

        <div class="info-tip">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="flex: none; margin-top: 1px">
            <circle cx="12" cy="12" r="9" stroke="#3B7BC4" stroke-width="1.8" />
            <line x1="12" y1="11" x2="12" y2="16" stroke="#3B7BC4" stroke-width="1.8" stroke-linecap="round" />
            <circle cx="12" cy="8" r="1" fill="#3B7BC4" />
          </svg>
          <span>导入的新学号会自动创建学生账号（待激活）。学生凭学号与初始密码登录学生端，绑定手机号完成激活。</span>
        </div>
      </div>

      <!-- 右栏 -->
      <div class="panel right-col">
        <div class="rc-head">
          <div class="rc-title">
            <template v-if="step === 1">粘贴名单文本</template>
            <template v-else>
              可导入 {{ totalRows }} 条记录
              <span v-if="invalidCount" class="pill warn" style="margin-left: 6px">{{ invalidCount }} 条无效</span>
            </template>
          </div>
          <button v-if="step === 2" class="btn sm" @click="step = 1">重新编辑</button>
        </div>

        <!-- 第 1 步：文本输入 -->
        <div v-if="step === 1" class="paste-area">
          <textarea
            v-model="rawText"
            class="txt"
            style="flex: 1; min-height: 260px; font-family: var(--mono); font-size: 14px"
            placeholder="示例：&#10;2026030118,李晓峰&#10;2026030119,王浩&#10;2026030120,陈锐"
          ></textarea>
          <div v-if="parseErrors.length" class="perr">
            <div v-for="e in parseErrors.slice(0, 5)" :key="e.line">第 {{ e.line }} 行：{{ e.reason }}</div>
          </div>
        </div>

        <!-- 第 2 步：预检表 -->
        <div v-else-if="step === 2" class="gtable" style="flex: 1; overflow: hidden; --cols: 1.4fr 1fr 1.6fr">
          <div class="thead" style="padding: 12px 22px">
            <span>学号</span>
            <span>姓名</span>
            <span>状态</span>
          </div>
          <div style="flex: 1; overflow-y: auto">
            <div v-for="(r, i) in previewRows" :key="i" class="trow" style="padding: 13px 22px">
              <span style="font: 600 13px/1 var(--mono); color: var(--ink-2)">{{ r.studentNo }}</span>
              <span style="font-weight: 600">{{ r.displayName || '—' }}</span>
              <span style="display: flex; align-items: center; gap: 7px">
                <span class="k-tag" :class="KIND[r.kind].cls">{{ KIND[r.kind].label }}</span>
                <span v-if="r.reason" style="font-size: 12px; color: #b4741a">{{ r.reason }}</span>
              </span>
            </div>
          </div>
        </div>

        <!-- 第 3 步：完成 -->
        <div v-else class="done-box">
          <span class="done-ic">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M5 12l5 5 9-11" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <div class="done-t">导入完成</div>
          <div class="done-s">本班名单现有 {{ importedCount }} 人，新建账号的学生请引导其激活</div>
          <button class="btn primary" @click="router.push(`/lessons/${lessonId}/roster`)">查看学生名单</button>
        </div>

        <!-- 底部操作 -->
        <div v-if="step !== 3" class="rc-foot">
          <div class="foot-note">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="9" cy="8" r="3" stroke="#8A8A8E" stroke-width="1.7" />
              <path d="M4 18c0-2.6 2.2-4.3 5-4.3s5 1.7 5 4.3" stroke="#8A8A8E" stroke-width="1.7" stroke-linecap="round" />
            </svg>
            导入后可在 <strong style="color: var(--brand-deep)">「学生名单」</strong> 查看该班名单
          </div>
          <div style="display: flex; gap: 12px">
            <button class="btn" @click="router.push(`/lessons/${lessonId}/roster`)">取消</button>
            <button v-if="step === 1" class="btn primary" :disabled="busy || !rawText.trim()" @click="applyParse">
              {{ busy ? '预检中…' : '解析并预检' }}
            </button>
            <button v-else class="btn primary" :disabled="busy || !importableCount" @click="doImport">
              {{ busy ? '导入中…' : `确认导入 ${importableCount} 人` }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.imp-layout {
  display: flex;
  gap: 22px;
  min-height: 0;
}
.left-col {
  width: 376px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.dropzone {
  background: #fff;
  border: 2px dashed #e0d3c6;
  border-radius: 20px;
  padding: 34px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.dropzone:hover {
  border-color: var(--brand);
}
.dz-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--brand-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}
.dz-title {
  font-size: 16px;
  font-weight: 700;
}
.dz-sub {
  font-size: 13px;
  color: var(--gray);
  line-height: 1.5;
}
.steps-panel {
  padding: 18px 20px;
  border-radius: 18px;
}
.st {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
}
.st:last-child {
  margin-bottom: 0;
}
.sn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--line);
  color: var(--gray-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font: 700 12px/1 var(--mono);
  flex: none;
}
.st.cur .sn {
  background: var(--brand);
  color: #fff;
}
.st.done .sn {
  background: var(--ok);
  color: #fff;
}
.st-t {
  font-size: 14px;
  font-weight: 600;
}
.st .st-t {
  color: var(--gray-2);
}
.st.cur .st-t,
.st.done .st-t {
  color: var(--ink);
}
.st-s {
  font-size: 12px;
  color: var(--gray);
  margin-top: 2px;
}
.info-tip {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--info-bg);
  border: 1px solid var(--info-line);
  border-radius: 14px;
  padding: 13px 15px;
  font-size: 13px;
  color: var(--info-text);
  line-height: 1.5;
}
.right-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.rc-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-bottom: 1px solid var(--line);
}
.rc-title {
  font-size: 16px;
  font-weight: 700;
}
.paste-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 22px;
  min-height: 0;
}
.perr {
  font-size: 13px;
  color: #b4741a;
  background: var(--warn-bg);
  border-radius: 10px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.k-tag {
  font-size: 12px;
  font-weight: 600;
  border-radius: 99px;
  padding: 4px 10px;
}
.k-tag.ok {
  color: var(--ok);
  background: var(--ok-bg);
}
.k-tag.info {
  color: var(--info-text);
  background: var(--info-bg);
}
.k-tag.muted {
  color: var(--gray);
  background: var(--fill-2);
}
.k-tag.bad {
  color: var(--warn);
  background: var(--warn-bg);
}
.done-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 30px;
}
.done-ic {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--ok);
  display: flex;
  align-items: center;
  justify-content: center;
}
.done-t {
  font-size: 22px;
  font-weight: 700;
}
.done-s {
  font-size: 14px;
  color: var(--gray);
  margin-bottom: 8px;
}
.rc-foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 22px;
  border-top: 1px solid var(--line);
}
.foot-note {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--gray);
}
@media (max-width: 1000px) {
  .imp-layout {
    flex-direction: column;
  }
  .left-col {
    width: 100%;
  }
}
</style>
