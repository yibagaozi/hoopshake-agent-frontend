<script setup>
// 教师操作台 · 名单。看本地缓存的参课名单，未建档的学生一键跳去现场注册。
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useEdgeStore } from "@/stores/edge.js";
import { useScreenStore } from "@/stores/screen.js";
import * as edgeApi from "@/api/edge.js";
import { hhmm, initial } from "@/utils/format.js";

const edge = useEdgeStore();
const screen = useScreenStore();
const router = useRouter();

const syncing = ref(false);
const message = ref("");

const students = computed(() => edge.roster?.students || []);
const total = computed(() => edge.roster?.total ?? students.value.length);
const ready = computed(
  () => edge.roster?.galleryReadyCount ?? students.value.filter((s) => s.galleryReady).length,
);
const pending = computed(() => Math.max(0, total.value - ready.value));

const subtitle = computed(() => {
  const l = edge.lesson;
  if (!l?.lessonId) return "未选课程";
  return l.classCode ? `${l.title} · ${l.classCode}班` : l.title;
});

onMounted(() => edge.refreshRoster());

async function resync() {
  if (!edge.lesson?.lessonId) {
    message.value = "请先选择课程";
    return;
  }
  syncing.value = true;
  message.value = "";
  try {
    await edgeApi.syncRoster(edge.lesson.lessonId);
    await edge.refreshRoster();
  } catch (e) {
    message.value = e.message;
  } finally {
    syncing.value = false;
  }
}

/** 把这名学生推到大屏做单人聚焦 */
function focus(student) {
  screen.focusStudent(student);
}

/** 带着学号跳到注册页，省去重新输入 */
function goEnroll(student) {
  router.push({ path: "/console/enroll", query: { studentNo: student.studentNo } });
}
</script>

<template>
  <div class="page">
    <div class="head">
      <div class="titles">
        <span class="h1">参课名单</span>
        <span class="sub">{{ subtitle }}</span>
        <span v-if="edge.roster?.syncedAt" class="sync mono">
          同步于 {{ hhmm(edge.roster.syncedAt) }}
        </span>
      </div>
      <button class="resync" :disabled="syncing" @click="resync">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path
            d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6"
            stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"
          />
        </svg>
        {{ syncing ? "同步中…" : "重新同步名单" }}
      </button>
    </div>

    <div v-if="message" class="err">{{ message }}</div>

    <div class="stats">
      <div class="stat">
        <div class="num">{{ total }}</div>
        <div class="cap">应到总数</div>
      </div>
      <div class="stat">
        <div class="num green">{{ ready }}</div>
        <div class="cap">已建档</div>
      </div>
      <div class="stat warn">
        <div class="num brand">{{ pending }}</div>
        <div class="cap brand-cap">待注册</div>
      </div>
    </div>

    <div v-if="!students.length" class="empty">
      <div class="etitle">暂无名单数据</div>
      <div class="ehint">
        名单由 edge 选课时从云端下行同步（<span class="mono">GET /api/ingest/reid/gallery</span>）。
        云端该接口未就绪时，<span class="mono">POST /local/lesson/select</span> 会整体失败，
        课程也选不上——这条链路目前是隔离的，不影响开课与录制。
      </div>
      <div class="ehint">
        要先联调 WS 与录制，请在 <span class="mono">.env</span> 里设
        <span class="mono">VITE_ALLOW_NO_LESSON=true</span>，
        上课页就能直接开「纯录制」。
      </div>
    </div>

    <div v-else class="grid">
      <div v-for="s in students" :key="s.studentId" class="row">
        <span class="ava" :class="{ dim: !s.galleryReady }">{{ initial(s.displayName) }}</span>
        <div class="who">
          <div class="name">{{ s.displayName }}</div>
          <div class="no mono">{{ s.studentNo }}</div>
        </div>
        <span class="tag" :class="s.galleryReady ? 'ok' : 'todo'">
          <span class="dot" />{{ s.galleryReady ? "已建档" : "待注册" }}
        </span>
        <button v-if="s.galleryReady" class="ghost" @click="focus(s)">聚焦到大屏</button>
        <button v-else class="primary" @click="goEnroll(s)">去注册</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 24px 30px 116px;
  min-height: 0;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.titles {
  display: flex;
  align-items: baseline;
  gap: 14px;
}

.h1 {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.sub {
  font-size: 15px;
  color: var(--ink-4);
}

.sync {
  font-size: 12px;
  color: var(--ink-6);
}

.resync {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--line-3);
  background: var(--card);
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 600;
  border-radius: 12px;
  padding: 11px 16px;
}

.err {
  background: var(--red-bg-2);
  border: 1px solid var(--red-line);
  color: var(--red-deep);
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 14px;
}

.stats {
  display: flex;
  gap: 12px;
  margin-bottom: 18px;
}

.stat {
  flex: 1;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px 20px;
}

.stat.warn {
  background: var(--brand-bg-2);
  border-color: var(--brand-line);
}

.num {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.num.green {
  color: var(--green);
}
.num.brand {
  color: var(--brand-deep);
}

.cap {
  font-size: 13px;
  color: var(--ink-4);
  margin-top: 2px;
}

.cap.brand-cap {
  color: #b08160;
}

.empty {
  background: var(--card);
  border: 1px dashed var(--line-3);
  border-radius: 16px;
  padding: 28px 32px;
  color: var(--ink-5);
  font-size: 14px;
}

.etitle {
  font-size: 16px;
  font-weight: 700;
  color: var(--ink-2);
  margin-bottom: 10px;
}

.ehint {
  font-size: 13px;
  line-height: 1.75;
  max-width: 720px;
}

.ehint + .ehint {
  margin-top: 8px;
}

.ehint .mono {
  font-size: 12px;
  background: var(--fill);
  border-radius: 5px;
  padding: 1px 5px;
  color: var(--ink-3);
}

.grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: min-content;
  gap: 11px;
  overflow-y: auto;
  align-content: start;
  padding-right: 4px;
}

.row {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px 16px;
}

.ava {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--ink);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex: none;
}

.ava.dim {
  background: var(--ink-8);
}

.who {
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 16px;
  font-weight: 600;
}

.no {
  font-size: 12px;
  color: var(--ink-6);
  margin-top: 3px;
}

.tag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  flex: none;
}

.tag.ok {
  color: var(--green);
}
.tag.ok .dot {
  background: var(--green);
}

.tag.todo {
  color: var(--brand-deep);
}
.tag.todo .dot {
  background: var(--brand);
}

.ghost {
  flex: none;
  border: 1px solid var(--line-3);
  background: var(--card);
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 600;
  border-radius: 10px;
  padding: 9px 13px;
}

.primary {
  flex: none;
  background: var(--brand);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  border-radius: 10px;
  padding: 9px 13px;
}
</style>
