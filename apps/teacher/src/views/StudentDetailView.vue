<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  DOMINANT_HAND,
  avatarColor,
  errText,
  fmtDate,
  fmtDateTime,
  isNotOpen,
  nameInitial,
  pctNumber,
  resolveActionName,
  teacherStudentApi,
} from '@hoopshake/core'
import { toast } from '../toast.js'
import Modal from '../components/Modal.vue'

const props = defineProps({ studentId: { type: String, required: true } })
const router = useRouter()

const detail = ref(null)
const stats = ref(null)
const loading = ref(true)

const editOpen = ref(false)
const saving = ref(false)
const form = ref({ displayName: '', gradeBand: '', dominantHand: '', heightCm: '', legLengthCm: '' })

const actionRows = computed(() => {
  const by = stats.value?.byAction || []
  const max = Math.max(...by.map((a) => a.clipCount || 0), 1)
  return by.map((a) => ({
    ...a,
    rate: pctNumber(a.madeRate),
    pct: Math.max(6, Math.round(((a.clipCount || 0) / max) * 100)),
  }))
})

function openEdit() {
  const d = detail.value || {}
  form.value = {
    displayName: d.displayName || '',
    gradeBand: d.gradeBand || '',
    dominantHand: d.dominantHand || '',
    heightCm: d.heightCm ?? '',
    legLengthCm: d.legLengthCm ?? '',
  }
  editOpen.value = true
}

async function save() {
  saving.value = true
  try {
    const f = form.value
    detail.value = await teacherStudentApi.update(props.studentId, {
      displayName: f.displayName.trim() || undefined,
      gradeBand: f.gradeBand.trim() || undefined,
      dominantHand: f.dominantHand || undefined,
      heightCm: f.heightCm !== '' ? Number(f.heightCm) : undefined,
      legLengthCm: f.legLengthCm !== '' ? Number(f.legLengthCm) : undefined,
    })
    toast.ok('已保存')
    editOpen.value = false
  } catch (err) {
    toast.err(errText(err, '保存失败'))
  } finally {
    saving.value = false
  }
}

async function reid() {
  try {
    await teacherStudentApi.reidCorrection(props.studentId, {})
  } catch (err) {
    toast.err(isNotOpen(err) ? '识别纠正暂未开放，敬请期待' : errText(err))
  }
}

onMounted(async () => {
  try {
    const [d, s] = await Promise.all([
      teacherStudentApi.detail(props.studentId),
      teacherStudentApi.stats(props.studentId).catch(() => null),
    ])
    detail.value = d
    stats.value = s
  } catch (err) {
    toast.err(errText(err, '加载学生失败'))
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div class="head-title-row">
        <button class="btn-back-sq" @click="router.back()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 5l-7 7 7 7" stroke="#3A3A3C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <span class="avatar" :style="{ width: '46px', height: '46px', fontSize: '17px', background: avatarColor(studentId) }">
          {{ nameInitial(detail?.displayName, '生') }}
        </span>
        <div>
          <div style="display: flex; align-items: center; gap: 10px">
            <span style="font-size: 21px; font-weight: 700; letter-spacing: -0.01em">{{ detail?.displayName || '…' }}</span>
            <span v-if="detail?.activeGallery" class="pill ok">识别底库 v{{ detail.activeGallery.version }}</span>
          </div>
          <div style="font: 500 12px/1 var(--mono); color: var(--gray-2); margin-top: 5px">
            {{ detail?.studentNo }}<template v-if="detail?.gradeBand"> · {{ detail.gradeBand }}</template>
          </div>
        </div>
      </div>
      <div style="display: flex; gap: 12px">
        <button class="btn" @click="reid">识别纠正</button>
        <button class="btn primary" @click="openEdit">编辑资料</button>
      </div>
    </div>

    <div class="content" style="display: flex; flex-direction: column; gap: 18px">
      <!-- 统计四格 -->
      <div class="stat4">
        <div class="panel sc">
          <div class="t">累计训练</div>
          <div class="n">{{ stats?.totalSessions ?? '—' }}<span class="u">次</span></div>
        </div>
        <div class="panel sc">
          <div class="t">累计出手</div>
          <div class="n">{{ stats?.totalClips ?? '—' }}<span class="u">次</span></div>
        </div>
        <div class="panel sc">
          <div class="t">最近训练</div>
          <div class="n small">{{ stats?.lastSessionAt ? fmtDate(stats.lastSessionAt) : '—' }}</div>
        </div>
        <div class="panel sc">
          <div class="t">身体档案</div>
          <div class="n small">
            {{ DOMINANT_HAND[detail?.dominantHand] || '—' }}<template v-if="detail?.heightCm"> · {{ detail.heightCm }}cm</template>
          </div>
        </div>
      </div>

      <div class="two-col">
        <!-- 分动作统计 -->
        <div class="panel" style="padding: 22px 24px">
          <div class="pt">分动作表现</div>
          <div v-if="!actionRows.length" class="empty-hint">暂无训练数据</div>
          <div class="arow-list">
            <div v-for="a in actionRows" :key="a.actionType" class="arow">
              <div class="arow-head">
                <span class="an">{{ resolveActionName(null, a.actionType) }}</span>
                <span class="ar">
                  <template v-if="a.rate !== null">命中率 <b>{{ a.rate }}%</b> · </template>{{ a.clipCount }} 次
                </span>
              </div>
              <div class="track"><div class="fill" :style="{ width: a.pct + '%' }"></div></div>
              <div class="al" v-if="a.lastAt">最近 {{ fmtDateTime(a.lastAt) }}</div>
            </div>
          </div>
        </div>

        <!-- 档案 + 底库 -->
        <div style="display: flex; flex-direction: column; gap: 18px">
          <div class="panel" style="padding: 22px 24px">
            <div class="pt">个人档案</div>
            <div class="kv"><span>姓名</span><b>{{ detail?.displayName || '—' }}</b></div>
            <div class="kv"><span>学号</span><b style="font-family: var(--mono)">{{ detail?.studentNo || '—' }}</b></div>
            <div class="kv"><span>年级段</span><b>{{ detail?.gradeBand || '—' }}</b></div>
            <div class="kv"><span>惯用手</span><b>{{ DOMINANT_HAND[detail?.dominantHand] || '—' }}</b></div>
            <div class="kv"><span>身高</span><b>{{ detail?.heightCm ? detail.heightCm + ' cm' : '—' }}</b></div>
            <div class="kv" style="border-bottom: none"><span>腿长</span><b>{{ detail?.legLengthCm ? detail.legLengthCm + ' cm' : '—' }}</b></div>
          </div>
          <div class="panel" style="padding: 22px 24px">
            <div class="pt">识别底库</div>
            <template v-if="detail?.activeGallery">
              <div class="kv"><span>状态</span><b>{{ detail.activeGallery.status }}</b></div>
              <div class="kv"><span>版本</span><b>v{{ detail.activeGallery.version }}</b></div>
              <div class="kv"><span>样本数</span><b>{{ detail.activeGallery.sampleCount ?? '—' }}</b></div>
              <div class="kv" style="border-bottom: none"><span>采集时间</span><b>{{ fmtDateTime(detail.activeGallery.enrolledAt) }}</b></div>
            </template>
            <div v-else class="empty-hint" style="padding: 14px 0">
              尚未采集识别底库，课堂中将无法自动识别该学生
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 编辑资料 -->
  <Modal :open="editOpen" title="编辑学生资料" :width="520" @close="editOpen = false">
    <div class="egrid">
      <div class="fld"><label>姓名</label><input v-model="form.displayName" class="txt" /></div>
      <div class="fld"><label>年级段</label><input v-model="form.gradeBand" class="txt" placeholder="如 初一" /></div>
      <div class="fld">
        <label>惯用手</label>
        <select v-model="form.dominantHand" class="txt" style="appearance: auto">
          <option value="">未设置</option>
          <option value="LEFT">左手</option>
          <option value="RIGHT">右手</option>
        </select>
      </div>
      <div class="fld"><label>身高 cm</label><input v-model="form.heightCm" type="number" class="txt" /></div>
      <div class="fld"><label>腿长 cm</label><input v-model="form.legLengthCm" type="number" class="txt" /></div>
    </div>
    <template #foot>
      <button class="btn" @click="editOpen = false">取消</button>
      <button class="btn primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.stat4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
@media (max-width: 1000px) {
  .stat4 {
    grid-template-columns: repeat(2, 1fr);
  }
}
.sc {
  padding: 18px 20px;
  border-radius: 18px;
}
.sc .t {
  font-size: 13px;
  color: var(--gray);
  margin-bottom: 10px;
}
.sc .n {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.sc .n.small {
  font-size: 18px;
}
.sc .u {
  font-size: 15px;
  color: var(--gray-3);
  font-weight: 600;
  margin-left: 2px;
}
.two-col {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 18px;
  align-items: start;
}
@media (max-width: 1000px) {
  .two-col {
    grid-template-columns: 1fr;
  }
}
.pt {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 16px;
}
.arow-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.arow-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
}
.an {
  font-size: 15px;
  font-weight: 600;
}
.ar {
  font-size: 13px;
  color: var(--ink-3);
}
.track {
  height: 10px;
  border-radius: 99px;
  background: var(--fill-2);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 99px;
  background: var(--brand);
  transition: width 0.4s ease;
}
.al {
  font-size: 12px;
  color: var(--gray-2);
  margin-top: 5px;
}
.kv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--divider);
  font-size: 14px;
}
.kv span {
  color: var(--gray);
}
.egrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 18px;
}
</style>
