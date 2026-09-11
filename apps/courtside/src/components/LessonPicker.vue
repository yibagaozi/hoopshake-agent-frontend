<script setup>
// 顶部课程选择。课程列表来自云端，选定后把配置透传给 edge（POST /local/lesson/select）。
import { computed, ref } from "vue";
import { edgeErrText } from "@/api/http.js";
import { useAuthStore } from "@/stores/auth.js";
import { useEdgeStore } from "@/stores/edge.js";

const auth = useAuthStore();
const edge = useEdgeStore();

const open = ref(false);
const busy = ref(false);
const message = ref("");

// 云端未接通时的手动录入，保证断网也能开课
const manual = ref(false);
const form = ref({ lessonId: "", title: "", classCode: "" });

const title = computed(() => {
  const l = edge.lesson;
  if (!l?.lessonId) return "未选课程";
  return l.classCode ? `${l.title} · ${l.classCode}班` : l.title;
});

async function toggle() {
  open.value = !open.value;
  message.value = "";
  if (open.value && auth.signedIn && !auth.lessons.length) {
    busy.value = true;
    await auth.loadLessons();
    busy.value = false;
    // 云端没有列课接口时直接切到手动录入
    if (auth.error) manual.value = true;
  }
}

async function pick(lesson) {
  busy.value = true;
  message.value = "";
  try {
    // 只传 lessonId，课程上下文由 edge 自己去云端拉（见 api/edge.js selectLesson）
    await edge.selectLesson(lesson.lessonId);
    open.value = false;
  } catch (e) {
    message.value = edgeErrText(e);
  } finally {
    busy.value = false;
  }
}

async function submitManual() {
  if (!form.value.lessonId.trim()) {
    message.value = "请填写 lessonId";
    return;
  }
  await pick({ ...form.value });
}
</script>

<template>
  <div class="picker">
    <button class="trigger" @click="toggle">
      {{ title }}
      <span class="caret">▾</span>
    </button>

    <div v-if="open" class="menu">
      <div class="head">
        <span>选择课程</span>
        <button class="link" @click="manual = !manual">
          {{ manual ? "从云端选" : "手动录入" }}
        </button>
      </div>

      <template v-if="!manual">
        <div v-if="!auth.signedIn" class="hint">未登录，无法拉取课程列表</div>
        <div v-else-if="busy" class="hint">加载中…</div>
        <div v-else-if="!auth.lessons.length" class="hint">暂无待上课程</div>
        <ul v-else class="list">
          <li v-for="l in auth.lessons" :key="l.lessonId">
            <button class="item" :disabled="busy" @click="pick(l)">
              <span class="name">{{ l.title }}</span>
              <span class="meta mono">{{ l.classCode }} · {{ l.status }}</span>
            </button>
          </li>
        </ul>
      </template>

      <div v-else class="manual">
        <input v-model="form.lessonId" placeholder="lessonId（必填）" />
        <input v-model="form.title" placeholder="课程名称" />
        <input v-model="form.classCode" placeholder="班级号" />
        <button class="primary" :disabled="busy" @click="submitManual">确定选课</button>
      </div>

      <div v-if="message" class="err">{{ message }}</div>
    </div>

    <div v-if="open" class="backdrop" @click="open = false" />
  </div>
</template>

<style scoped>
.picker {
  position: relative;
}

.trigger {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  background: var(--fill);
  border: 1px solid var(--line-2);
  border-radius: 11px;
  padding: 8px 14px;
  max-width: 320px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.caret {
  color: var(--ink-7);
}

.backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 50;
  width: 340px;
  background: var(--card);
  border: 1px solid var(--line-2);
  border-radius: 16px;
  box-shadow: var(--shadow-dock);
  padding: 14px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--ink-4);
  font-weight: 600;
  margin-bottom: 10px;
}

.link {
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-deep);
}

.hint {
  font-size: 13px;
  color: var(--ink-6);
  padding: 14px 2px;
}

.list {
  list-style: none;
  max-height: 280px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.item {
  width: 100%;
  text-align: left;
  border-radius: 11px;
  padding: 10px 12px;
  background: var(--card-2);
  border: 1px solid var(--line);
}

.item:hover:not(:disabled) {
  border-color: var(--brand-line);
  background: var(--brand-bg-2);
}

.name {
  display: block;
  font-size: 15px;
  font-weight: 600;
}

.meta {
  display: block;
  font-size: 12px;
  color: var(--ink-6);
  margin-top: 3px;
}

.manual {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.manual input {
  height: 42px;
  border: 1px solid var(--line-3);
  border-radius: 11px;
  background: var(--card);
  padding: 0 13px;
  font-size: 14px;
  outline: none;
}

.manual input:focus {
  border-color: var(--brand);
}

.primary {
  height: 44px;
  border-radius: 11px;
  background: var(--brand);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
}

.err {
  margin-top: 10px;
  font-size: 12px;
  color: var(--red-deep);
  background: var(--red-bg-2);
  border: 1px solid var(--red-line);
  border-radius: 9px;
  padding: 8px 10px;
}
</style>
