<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ACCOUNT_STATUS,
  DOMINANT_HAND,
  avatarColor,
  errText,
  isCode,
  nameInitial,
  teacherStudentApi,
} from '@hoopshake/core'
import { toast } from '../toast.js'
import Modal from '../components/Modal.vue'

const router = useRouter()

const loading = ref(true)
const items = ref([])
const keyword = ref('')
const page = ref(0)
const totalPages = ref(0)
const totalElements = ref(0)
const size = 20

const createOpen = ref(false)
const creating = ref(false)
const createdInfo = ref(null)
const form = ref({
  studentNo: '',
  displayName: '',
  username: '',
  password: '',
  phone: '',
  email: '',
  gradeBand: '',
  dominantHand: '',
  heightCm: '',
})

let searchTimer = null

async function load(p = 0) {
  loading.value = true
  try {
    const res = await teacherStudentApi.list({ keyword: keyword.value.trim() || undefined, page: p, size })
    items.value = res?.items || []
    page.value = res?.page ?? p
    totalPages.value = res?.totalPages ?? 0
    totalElements.value = res?.totalElements ?? items.value.length
  } catch (err) {
    toast.err(errText(err, '加载学生失败'))
  } finally {
    loading.value = false
  }
}

function onSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => load(0), 350)
}

async function create() {
  const f = form.value
  if (!/^\d{10}$/.test(f.studentNo.trim())) {
    toast('学号需为 10 位数字')
    return
  }
  if (!f.displayName.trim()) {
    toast('请填写学生姓名')
    return
  }
  creating.value = true
  try {
    const res = await teacherStudentApi.create({
      studentNo: f.studentNo.trim(),
      displayName: f.displayName.trim(),
      username: f.username.trim() || undefined,
      password: f.password || undefined,
      phone: f.phone.trim() || undefined,
      email: f.email.trim() || undefined,
      gradeBand: f.gradeBand.trim() || undefined,
      dominantHand: f.dominantHand || undefined,
      heightCm: f.heightCm ? Number(f.heightCm) : undefined,
    })
    createdInfo.value = res
    toast.ok('学生账号已创建')
    load(0)
  } catch (err) {
    toast.err(isCode(err, 40901) ? '学号或用户名已存在' : errText(err, '创建失败'))
  } finally {
    creating.value = false
  }
}

function closeCreate() {
  createOpen.value = false
  createdInfo.value = null
  form.value = { studentNo: '', displayName: '', username: '', password: '', phone: '', email: '', gradeBand: '', dominantHand: '', heightCm: '' }
}

onMounted(() => load(0))
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div>
        <h2 class="page-title">学生</h2>
        <p class="page-sub">共 {{ totalElements }} 名学生 · 点击学生查看训练详情</p>
      </div>
      <button class="btn primary" @click="createOpen = true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <line x1="12" y1="5" x2="12" y2="19" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
          <line x1="5" y1="12" x2="19" y2="12" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
        </svg>
        新建学生
      </button>
    </div>

    <div class="filter-bar">
      <div class="search-box" style="width: 280px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="#A1A1A6" stroke-width="1.9" />
          <line x1="16" y1="16" x2="20" y2="20" stroke="#A1A1A6" stroke-width="1.9" stroke-linecap="round" />
        </svg>
        <input v-model="keyword" placeholder="搜索姓名 / 学号" @input="onSearch" />
      </div>
      <div class="pager" v-if="totalPages > 1">
        <button class="btn sm" :disabled="page <= 0" @click="load(page - 1)">上一页</button>
        <span class="pg">{{ page + 1 }} / {{ totalPages }}</span>
        <button class="btn sm" :disabled="page >= totalPages - 1" @click="load(page + 1)">下一页</button>
      </div>
    </div>

    <div class="content" style="padding: 0; overflow: hidden; display: flex; flex-direction: column">
      <div class="gtable" style="flex: 1; overflow: hidden; --cols: 2.4fr 1.2fr 1fr 1.2fr 1.4fr 1fr">
        <div class="thead">
          <span>学生</span>
          <span>年级段</span>
          <span>惯用手</span>
          <span>账号状态</span>
          <span>识别底库</span>
          <span></span>
        </div>
        <div style="flex: 1; overflow-y: auto">
          <div v-if="loading" style="padding: 24px 26px">
            <div v-for="i in 6" :key="i" class="skeleton" style="height: 40px; margin-bottom: 12px"></div>
          </div>
          <div v-else-if="!items.length" class="empty-hint">
            {{ keyword ? '没有匹配的学生' : '还没有学生，点击右上角「新建学生」或在课程里批量导入' }}
          </div>
          <div v-for="s in items" :key="s.studentId" class="trow" style="cursor: pointer" @click="router.push(`/students/${s.studentId}`)">
            <div style="display: flex; align-items: center; gap: 12px">
              <span class="avatar" :style="{ width: '38px', height: '38px', fontSize: '14px', background: avatarColor(s.studentId) }">
                {{ nameInitial(s.displayName, '生') }}
              </span>
              <div>
                <div style="font-size: 15px; font-weight: 600">{{ s.displayName || '未命名' }}</div>
                <div style="font: 500 12px/1 var(--mono); color: var(--gray-2); margin-top: 3px">{{ s.studentNo }}</div>
              </div>
            </div>
            <span style="color: var(--ink-3)">{{ s.gradeBand || '—' }}</span>
            <span style="color: var(--ink-3)">{{ DOMINANT_HAND[s.dominantHand] || '—' }}</span>
            <div>
              <span class="pill" :class="ACCOUNT_STATUS[s.accountStatus]?.tone === 'ok' ? 'ok' : ACCOUNT_STATUS[s.accountStatus]?.tone === 'warn' ? 'warn' : 'muted'">
                {{ ACCOUNT_STATUS[s.accountStatus]?.label || s.accountStatus }}
              </span>
            </div>
            <div>
              <span v-if="s.galleryReady" style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--ok)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12l5 5 9-11" stroke="#2FB170" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                已就绪
              </span>
              <span v-else style="font-size: 13px; color: var(--gray-2)">未采集</span>
            </div>
            <span style="font-size: 20px; color: var(--gray-4); text-align: right">›</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 新建学生 -->
  <Modal :open="createOpen" title="新建学生" :width="580" @close="closeCreate">
    <template v-if="!createdInfo">
      <div class="cgrid">
        <div class="fld">
          <label>学号（10 位） <span style="color: var(--brand-deep)">*</span></label>
          <input v-model="form.studentNo" class="txt" placeholder="如 2026030118" maxlength="10" />
        </div>
        <div class="fld">
          <label>姓名 <span style="color: var(--brand-deep)">*</span></label>
          <input v-model="form.displayName" class="txt" placeholder="学生姓名" />
        </div>
        <div class="fld">
          <label>用户名（选填）</label>
          <input v-model="form.username" class="txt" placeholder="默认使用学号" />
        </div>
        <div class="fld">
          <label>初始密码（选填）</label>
          <input v-model="form.password" class="txt" placeholder="不填由系统生成" />
        </div>
        <div class="fld">
          <label>手机号（选填）</label>
          <input v-model="form.phone" class="txt" placeholder="学生手机号" />
        </div>
        <div class="fld">
          <label>年级段（选填）</label>
          <input v-model="form.gradeBand" class="txt" placeholder="如 初一" />
        </div>
        <div class="fld">
          <label>惯用手（选填）</label>
          <select v-model="form.dominantHand" class="txt" style="appearance: auto">
            <option value="">未设置</option>
            <option value="LEFT">左手</option>
            <option value="RIGHT">右手</option>
          </select>
        </div>
        <div class="fld">
          <label>身高 cm（选填）</label>
          <input v-model="form.heightCm" type="number" class="txt" placeholder="如 172" />
        </div>
      </div>
    </template>
    <template v-else>
      <div class="created-box">
        <div class="cb-t">账号已创建</div>
        <div class="cb-row"><span>学号</span><b style="font-family: var(--mono)">{{ createdInfo.studentNo }}</b></div>
        <div class="cb-row"><span>登录用户名</span><b style="font-family: var(--mono)">{{ createdInfo.username }}</b></div>
        <div class="cb-row"><span>账号状态</span><b>{{ ACCOUNT_STATUS[createdInfo.accountStatus]?.label || createdInfo.accountStatus }}</b></div>
        <div class="cb-tip" v-if="createdInfo.initialPassword">
          系统已生成初始密码，请通过学校渠道告知学生；学生首次登录学生端后需绑定手机激活。
        </div>
        <div class="cb-tip" v-else>请将你设置的初始密码告知学生，学生首次登录学生端后需绑定手机激活。</div>
      </div>
    </template>
    <template #foot>
      <template v-if="!createdInfo">
        <button class="btn" @click="closeCreate">取消</button>
        <button class="btn primary" :disabled="creating" @click="create">{{ creating ? '创建中…' : '创建账号' }}</button>
      </template>
      <button v-else class="btn primary" @click="closeCreate">完成</button>
    </template>
  </Modal>
</template>

<style scoped>
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
.pager {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pg {
  font: 600 13px/1 var(--mono);
  color: var(--gray);
}
.cgrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 18px;
}
.created-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cb-t {
  font-size: 17px;
  font-weight: 700;
  color: var(--ok);
  margin-bottom: 4px;
}
.cb-row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: var(--ink-3);
  background: var(--panel-soft);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 15px;
}
.cb-tip {
  font-size: 13px;
  color: var(--info-text);
  background: var(--info-bg);
  border: 1px solid var(--info-line);
  border-radius: 12px;
  padding: 12px 15px;
  line-height: 1.5;
}
</style>
