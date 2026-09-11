<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { errText, lessonApi, lessonStatusLabel, pageItems } from '@hoopshake/core'
import { toast } from '../toast.js'

const router = useRouter()
const lessons = ref([])
const loading = ref(true)
const manualId = ref('')
const probing = ref(null) // lessonId 正在探测

async function load() {
  try {
    lessons.value = pageItems(await lessonApi.list({ size: 100 })).filter((l) => l.status !== 'PLANNED')
  } catch (err) {
    toast.err(errText(err, '加载课程失败'))
  } finally {
    loading.value = false
  }
}

/** 从课程实况取当前/最近的训练会话，跳转其课末汇总 */
async function openLesson(l) {
  probing.value = l.lessonId
  try {
    const live = await lessonApi.live(l.lessonId)
    if (live?.activeSession?.sessionId) {
      router.push(`/summary/${live.activeSession.sessionId}`)
    } else {
      toast('该课程当前没有可汇总的训练会话')
    }
  } catch (err) {
    toast.err(errText(err, '获取课程会话失败'))
  } finally {
    probing.value = null
  }
}

function openManual() {
  const id = manualId.value.trim()
  if (!id) {
    toast('请输入训练会话 ID')
    return
  }
  router.push(`/summary/${id}`)
}

onMounted(load)
</script>

<template>
  <div class="main">
    <div class="main-head">
      <div>
        <h2 class="page-title">课末汇总</h2>
        <p class="page-sub">选择一节已开课/已结课的课程，查看其当前训练会话的课末汇总</p>
      </div>
    </div>
    <div class="content" style="display: flex; flex-direction: column; gap: 20px; max-width: 860px">
      <div>
        <div class="sec-label">从课程进入</div>
        <div v-if="loading"><div class="skeleton" style="height: 64px"></div></div>
        <div v-else-if="!lessons.length" class="panel empty-hint">还没有开过课，开始上课后即可查看课末汇总</div>
        <div v-else class="panel" style="overflow: hidden">
          <div
            v-for="l in lessons"
            :key="l.lessonId"
            class="lrow"
            @click="openLesson(l)"
          >
            <div>
              <div style="font-size: 15px; font-weight: 600">{{ l.title }}</div>
              <div style="font: 500 12px/1 var(--mono); color: var(--gray-2); margin-top: 3px">
                {{ l.classCode || '未设班级' }} · {{ lessonStatusLabel(l.status) }}
              </div>
            </div>
            <span class="go">{{ probing === l.lessonId ? '获取会话中…' : '查看汇总 ›' }}</span>
          </div>
        </div>
      </div>

      <div>
        <div class="sec-label">按会话 ID 查看</div>
        <div class="panel" style="padding: 18px 20px; display: flex; gap: 12px">
          <input v-model="manualId" class="txt" style="flex: 1" placeholder="粘贴训练会话 sessionId（UUID）" @keyup.enter="openManual" />
          <button class="btn primary" @click="openManual">查看</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--divider);
  cursor: pointer;
}
.lrow:last-child {
  border-bottom: none;
}
.lrow:hover {
  background: var(--panel-soft);
}
.go {
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-deep);
}
</style>
