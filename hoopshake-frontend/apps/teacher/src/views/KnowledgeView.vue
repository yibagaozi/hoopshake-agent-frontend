<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { KNOWLEDGE_STATUS, errText, fmtDateTime, knowledgeApi } from '@hoopshake/core'
import { toast } from '../toast.js'
import Modal from '../components/Modal.vue'

const loading = ref(true)
const items = ref([])
const page = ref(0)
const totalPages = ref(0)
const totalElements = ref(0)

const createOpen = ref(false)
const creating = ref(false)
const form = ref({ docId: '', source: '', domain: '', content: '' })

const searchQ = ref('')
const searchTopK = ref(5)
const searching = ref(false)
const results = ref(null)

const detailOpen = ref(false)
const detailDoc = ref(null)

let pollTimer = null

const hasProcessing = computed(() => items.value.some((d) => d.status === 'PROCESSING'))

async function load(p = page.value, silent = false) {
  if (!silent) loading.value = true
  try {
    const res = await knowledgeApi.list(p, 20)
    items.value = res?.items || []
    page.value = res?.page ?? p
    totalPages.value = res?.totalPages ?? 0
    totalElements.value = res?.totalElements ?? items.value.length
    schedulePoll()
  } catch (err) {
    if (!silent) toast.err(errText(err, '加载知识库失败'))
  } finally {
    loading.value = false
  }
}

function schedulePoll() {
  clearTimeout(pollTimer)
  if (hasProcessing.value) {
    pollTimer = setTimeout(() => load(page.value, true), 4000)
  }
}

async function create() {
  const f = form.value
  if (!f.content.trim()) {
    toast('请粘贴 Markdown 文档内容')
    return
  }
  creating.value = true
  try {
    await knowledgeApi.create({
      docId: f.docId.trim() || undefined,
      source: f.source.trim() || undefined,
      domain: f.domain.trim() || undefined,
      content: f.content,
    })
    toast.ok('文档已提交，正在异步处理')
    createOpen.value = false
    form.value = { docId: '', source: '', domain: '', content: '' }
    load(0)
  } catch (err) {
    toast.err(errText(err, '导入失败'))
  } finally {
    creating.value = false
  }
}

async function reindex(doc) {
  try {
    await knowledgeApi.reindex(doc.docId)
    toast.ok('已触发重建索引')
    load(page.value, true)
  } catch (err) {
    toast.err(errText(err, '重建索引失败'))
  }
}

async function removeDoc(doc) {
  if (!confirm(`删除文档「${doc.docId}」？该操作不可恢复`)) return
  try {
    await knowledgeApi.remove(doc.docId)
    toast.ok('已删除')
    load(page.value)
  } catch (err) {
    toast.err(errText(err, '删除失败'))
  }
}

async function openDetail(doc) {
  detailOpen.value = true
  detailDoc.value = doc
  try {
    detailDoc.value = await knowledgeApi.detail(doc.docId)
  } catch {
    /* 保留列表数据 */
  }
}

async function doSearch() {
  const q = searchQ.value.trim()
  if (!q) {
    toast('输入要检索的问题')
    return
  }
  searching.value = true
  results.value = null
  try {
    results.value = (await knowledgeApi.search(q, Number(searchTopK.value) || 5)) || []
  } catch (err) {
    toast.err(errText(err, '检索失败'))
  } finally {
    searching.value = false
  }
}

onMounted(() => load(0))
onBeforeUnmount(() => clearTimeout(pollTimer))
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div>
        <h2 class="page-title">知识库管理</h2>
        <p class="page-sub">共 {{ totalElements }} 篇文档 · 供 AI 教练与教学助手检索引用</p>
      </div>
      <button class="btn primary" @click="createOpen = true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <line x1="12" y1="5" x2="12" y2="19" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
          <line x1="5" y1="12" x2="19" y2="12" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
        </svg>
        导入文档
      </button>
    </div>

    <div class="content kn-grid">
      <!-- 文档表 -->
      <div class="panel" style="overflow: hidden; display: flex; flex-direction: column; min-height: 0">
        <div class="gtable" style="flex: 1; overflow: hidden; --cols: 1.5fr 0.95fr 0.8fr 0.6fr 1fr 2.05fr">
          <div class="thead">
            <span>docId</span>
            <span>领域 / 来源</span>
            <span>状态</span>
            <span>分块数</span>
            <span>更新时间</span>
            <span>操作</span>
          </div>
          <div style="flex: 1; overflow-y: auto">
            <div v-if="loading" style="padding: 22px 24px">
              <div v-for="i in 5" :key="i" class="skeleton" style="height: 36px; margin-bottom: 12px"></div>
            </div>
            <div v-else-if="!items.length" class="empty-hint">知识库为空，点击右上角「导入文档」</div>
            <div v-for="d in items" :key="d.id" class="trow">
              <span style="font: 600 13px/1.4 var(--mono); word-break: break-all; cursor: pointer" @click="openDetail(d)">{{ d.docId }}</span>
              <div style="min-width: 0">
                <div style="font-size: 13px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ d.domain || '—' }}</div>
                <div style="font-size: 12px; color: var(--gray-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ d.source || '' }}</div>
              </div>
              <div>
                <span class="pill" :class="KNOWLEDGE_STATUS[d.status]?.tone === 'ok' ? 'ok' : KNOWLEDGE_STATUS[d.status]?.tone === 'warn' ? 'warn' : 'danger'">
                  <span v-if="d.status === 'PROCESSING'" class="dot" style="animation: recpulse 1.4s infinite"></span>
                  {{ KNOWLEDGE_STATUS[d.status]?.label || d.status }}
                </span>
              </div>
              <span style="font: 500 13px/1 var(--mono); color: var(--ink-3)">{{ d.chunkCount ?? '—' }}</span>
              <span style="font: 500 12px/1.3 var(--mono); color: var(--gray)">{{ fmtDateTime(d.updatedAt) }}</span>
              <div style="display: flex; gap: 6px">
                <button class="op" @click="openDetail(d)">详情</button>
                <button class="op" @click="reindex(d)">重建索引</button>
                <button class="op danger" @click="removeDoc(d)">删除</button>
              </div>
            </div>
          </div>
        </div>
        <div v-if="totalPages > 1" class="pager">
          <button class="btn sm" :disabled="page <= 0" @click="load(page - 1)">上一页</button>
          <span class="pg">{{ page + 1 }} / {{ totalPages }}</span>
          <button class="btn sm" :disabled="page >= totalPages - 1" @click="load(page + 1)">下一页</button>
        </div>
      </div>

      <!-- 检索测试 -->
      <div class="panel" style="padding: 20px 22px; display: flex; flex-direction: column; min-height: 0">
        <div style="font-size: 16px; font-weight: 700; margin-bottom: 4px">检索测试</div>
        <div style="font-size: 13px; color: var(--gray-2); margin-bottom: 14px">模拟 AI 的知识库召回，验证导入效果</div>
        <div style="display: flex; gap: 9px; margin-bottom: 10px">
          <input v-model="searchQ" class="txt" style="flex: 1; height: 44px" placeholder="如：如何纠正肘部外翻？" @keyup.enter="doSearch" />
          <input v-model="searchTopK" type="number" min="1" max="20" class="txt" style="width: 72px; height: 44px" title="topK" />
        </div>
        <button class="btn primary" style="width: 100%" :disabled="searching" @click="doSearch">
          {{ searching ? '检索中…' : '检索' }}
        </button>
        <div style="flex: 1; overflow-y: auto; margin-top: 14px; display: flex; flex-direction: column; gap: 10px">
          <div v-if="results && !results.length" class="empty-hint" style="padding: 20px 0">没有召回结果</div>
          <div v-for="(r, i) in results || []" :key="i" class="hit">
            <div class="hit-head">
              <span class="hit-title">{{ r.sectionTitle || r.docId }}</span>
              <span class="hit-score">{{ Number(r.score).toFixed(3) }}</span>
            </div>
            <div class="hit-path">{{ r.docId }}<template v-if="(r.headingPath || []).length"> · {{ r.headingPath.join(' / ') }}</template></div>
            <div class="hit-text">{{ r.text }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 导入文档 -->
  <Modal :open="createOpen" title="导入知识文档" :width="640" @close="createOpen = false">
    <div style="display: flex; flex-direction: column; gap: 14px">
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px">
        <div class="fld"><label>docId（选填）</label><input v-model="form.docId" class="txt" placeholder="不填自动生成" /></div>
        <div class="fld"><label>来源（选填）</label><input v-model="form.source" class="txt" placeholder="如 校本教材" /></div>
        <div class="fld"><label>领域（选填）</label><input v-model="form.domain" class="txt" placeholder="如 shooting" /></div>
      </div>
      <div class="fld">
        <label>Markdown 内容 <span style="color: var(--brand-deep)">*</span></label>
        <textarea v-model="form.content" class="txt" rows="12" placeholder="# 标题&#10;&#10;粘贴 Markdown 文档内容…" style="font-family: var(--mono); font-size: 13px"></textarea>
      </div>
    </div>
    <template #foot>
      <button class="btn" @click="createOpen = false">取消</button>
      <button class="btn primary" :disabled="creating" @click="create">{{ creating ? '提交中…' : '提交导入' }}</button>
    </template>
  </Modal>

  <!-- 文档详情 -->
  <Modal :open="detailOpen" title="文档详情" :width="520" @close="detailOpen = false">
    <div v-if="detailDoc" style="display: flex; flex-direction: column; gap: 2px">
      <div class="dv"><span>docId</span><b style="font-family: var(--mono); word-break: break-all">{{ detailDoc.docId }}</b></div>
      <div class="dv"><span>状态</span><b>{{ KNOWLEDGE_STATUS[detailDoc.status]?.label || detailDoc.status }}</b></div>
      <div class="dv"><span>版本</span><b>v{{ detailDoc.version ?? '—' }}</b></div>
      <div class="dv"><span>分块数</span><b>{{ detailDoc.chunkCount ?? '—' }}</b></div>
      <div class="dv"><span>领域</span><b>{{ detailDoc.domain || '—' }}</b></div>
      <div class="dv"><span>来源</span><b>{{ detailDoc.source || '—' }}</b></div>
      <div class="dv"><span>导入时间</span><b>{{ fmtDateTime(detailDoc.importedAt) }}</b></div>
      <div class="dv"><span>更新时间</span><b>{{ fmtDateTime(detailDoc.updatedAt) }}</b></div>
      <div v-if="detailDoc.errorMessage" class="derr">处理失败：{{ detailDoc.errorMessage }}</div>
    </div>
    <template #foot>
      <button class="btn primary" @click="detailOpen = false">关闭</button>
    </template>
  </Modal>
</template>

<style scoped>
.kn-grid {
  display: grid;
  grid-template-columns: 1.7fr 1fr;
  gap: 20px;
  min-height: 0;
}
@media (max-width: 1100px) {
  .kn-grid {
    grid-template-columns: 1fr;
  }
}
.op {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-3);
  background: var(--fill-2);
  border-radius: 8px;
  padding: 6px 10px;
}
.op:hover {
  color: var(--brand-deep);
  background: var(--brand-soft);
}
.op.danger:hover {
  color: var(--danger);
  background: var(--danger-bg);
}
.pager {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid var(--line);
}
.pg {
  font: 600 13px/1 var(--mono);
  color: var(--gray);
}
.hit {
  background: var(--panel-soft);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 13px 15px;
}
.hit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.hit-title {
  font-size: 14px;
  font-weight: 700;
}
.hit-score {
  font: 600 12px/1 var(--mono);
  color: var(--brand-deep);
  background: var(--brand-soft);
  border-radius: 99px;
  padding: 3px 9px;
  flex: none;
}
.hit-path {
  font: 500 11px/1.4 var(--mono);
  color: var(--gray-2);
  margin: 5px 0 7px;
  word-break: break-all;
}
.hit-text {
  font-size: 13px;
  color: var(--ink-2);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dv {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 11px 0;
  border-bottom: 1px solid var(--divider);
  font-size: 14px;
}
.dv span {
  color: var(--gray);
  flex: none;
}
.dv b {
  text-align: right;
}
.derr {
  margin-top: 10px;
  font-size: 13px;
  color: var(--danger);
  background: var(--danger-bg);
  border-radius: 10px;
  padding: 10px 13px;
  line-height: 1.5;
}
</style>
