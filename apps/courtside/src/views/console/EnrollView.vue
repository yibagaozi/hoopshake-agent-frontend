<script setup>
// 教师操作台 · 现场注册。输学号 → 匹配 → 采集 5 帧建档 → 重拉名单。
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { edgeErrText } from "@/api/http.js";
import { useRoute } from "vue-router";
import EnrollSkeleton from "@/components/EnrollSkeleton.vue";
import { useEdgeStore } from "@/stores/edge.js";
import * as edgeApi from "@/api/edge.js";
import { enrollCn, initial } from "@/utils/format.js";

const edge = useEdgeStore();
const route = useRoute();

const studentNo = ref("");
const matched = ref(null);
/** notFound / error / null */
const problem = ref(null);
const problemText = ref("");
const matching = ref(false);

const task = ref(null);
const progress = ref(null);
let poller = null;

const TOTAL_FRAMES = 5;

const valid = computed(() => /^\d{10}$/.test(studentNo.value));
const capturing = computed(() =>
  ["PENDING", "CAPTURING", "UPLOADING", "REGISTERING"].includes(progress.value?.status),
);
const done = computed(() => progress.value?.status === "REGISTERED");

const captured = computed(() => progress.value?.capturedFrames ?? 0);
const totalFrames = computed(() => progress.value?.totalFrames ?? TOTAL_FRAMES);

const camera = computed(() => edge.anchorCamera);
const cameraLabel = computed(() => camera.value?.role || camera.value?.camId || "主机位");
const cameraOnline = computed(() => !!(camera.value?.online && camera.value?.signal));

/** 名单里带过来的学号自动填入 */
onMounted(() => {
  const q = route.query.studentNo;
  if (typeof q === "string" && /^\d{10}$/.test(q)) {
    studentNo.value = q;
    match();
  }
});

onUnmounted(() => clearInterval(poller));

watch(studentNo, () => {
  problem.value = null;
  if (!capturing.value) matched.value = null;
});

async function match() {
  if (!valid.value) {
    problem.value = "error";
    problemText.value = "学号须为 10 位数字";
    return;
  }
  matching.value = true;
  problem.value = null;
  matched.value = null;
  try {
    const res = await edgeApi.matchStudent(studentNo.value);
    if (res?.matched) {
      matched.value = res.student;
    } else {
      problem.value = "notFound";
    }
  } catch (e) {
    problem.value = "error";
    problemText.value = edgeErrText(e);
  } finally {
    matching.value = false;
  }
}

async function startCapture() {
  if (!matched.value) return;
  problem.value = null;
  try {
    task.value = await edgeApi.startEnroll({
      studentNo: matched.value.studentNo,
      frames: TOTAL_FRAMES,
      camId: camera.value?.camId,
    });
    progress.value = {
      status: task.value.status,
      capturedFrames: 0,
      totalFrames: task.value.frames ?? TOTAL_FRAMES,
    };
    watchProgress();
  } catch (e) {
    problem.value = "error";
    problemText.value = edgeErrText(e);
  }
}

/** 注册进度只推给 /ws/registration，操作台这边用轮询 */
function watchProgress() {
  clearInterval(poller);
  poller = setInterval(async () => {
    if (!task.value?.taskId) return;
    try {
      const p = await edgeApi.getEnrollProgress(task.value.taskId);
      progress.value = p;
      if (["REGISTERED", "FAILED", "CANCELLED"].includes(p.status)) {
        clearInterval(poller);
        if (p.status === "REGISTERED" && edge.lesson?.lessonId) {
          // 建档完成后重拉名单，待注册数即时下降
          await edgeApi.syncRoster(edge.lesson.lessonId);
          await edge.refreshRoster();
        }
        if (p.status === "FAILED") {
          problem.value = "error";
          problemText.value = p.failReason || "采集失败";
        }
      }
    } catch (e) {
      clearInterval(poller);
      problem.value = "error";
      problemText.value = edgeErrText(e);
    }
  }, 800);
}

function reset() {
  clearInterval(poller);
  task.value = null;
  progress.value = null;
  matched.value = null;
  problem.value = null;
  studentNo.value = "";
}
</script>

<template>
  <div class="page">
    <!-- 左：预览与采集进度 -->
    <section class="preview-col">
      <div class="col-head">
        <span class="label">注册预览 · {{ cameraLabel }}</span>
        <span class="detect" :class="{ off: !cameraOnline }">
          <span class="dot pulse" />
          {{ cameraOnline ? `检测到 ${edge.personCount} 人` : "机位无信号" }}
        </span>
      </div>

      <div class="stage">
        <div class="box" />
        <div class="lock">{{ edge.personCount ? "已锁定目标" : "等待入镜" }}</div>
        <EnrollSkeleton :width="130" :height="300" />
        <div class="note mono">3D 骨架 17 点 · 多角度采集</div>
      </div>

      <div class="frames">
        <span class="label flat">采集帧</span>
        <div class="bars">
          <div
            v-for="i in totalFrames"
            :key="i"
            class="bar"
            :class="{
              done: i <= captured,
              live: i === captured + 1 && capturing,
            }"
          />
        </div>
        <span class="mono count">{{ captured }} / {{ totalFrames }}</span>
      </div>
    </section>

    <!-- 右：学号录入与建档 -->
    <section class="form-col">
      <div class="label">学号录入</div>

      <div class="entry">
        <input
          v-model="studentNo"
          class="mono no-input"
          inputmode="numeric"
          maxlength="10"
          placeholder="10 位学号"
          :disabled="capturing"
          @keyup.enter="match"
        />
        <button class="match" :disabled="matching || capturing" @click="match">
          {{ matching ? "匹配中" : "匹配" }}
        </button>
      </div>

      <div v-if="matched" class="matched">
        <span class="ava">{{ initial(matched.displayName) }}</span>
        <div class="grow">
          <div class="name">{{ matched.displayName }}</div>
          <div class="meta mono">
            {{ matched.studentNo }}
            <template v-if="edge.lesson?.classCode"> · {{ edge.lesson.classCode }}班</template>
          </div>
        </div>
        <span class="ok-tag"><span class="dot" />已匹配</span>
      </div>

      <p class="hint">
        请学生面向{{ cameraLabel }}站立，系统采集 {{ totalFrames }} 帧多角度姿态并绑定到该学号，
        用于本节课的身份识别。
      </p>

      <div v-if="progress" class="status" :class="{ done }">
        <span class="dot" :class="done ? 'ok' : 'brand'" />
        <span class="grow">{{ enrollCn(progress.status) }}</span>
        <span v-if="done && progress.galleryVersion" class="mono">
          特征版本 v{{ progress.galleryVersion }}
        </span>
      </div>

      <button
        class="submit"
        :disabled="!matched || capturing"
        @click="startCapture"
      >
        {{ capturing ? "采集中…" : done ? "重新采集" : "采集并建档" }}
      </button>

      <div class="pair">
        <button class="ghost" :disabled="capturing" @click="match">重新对准</button>
        <button class="ghost mute" @click="reset">取消</button>
      </div>

      <div class="spacer" />

      <div v-if="problem === 'notFound'" class="alarm">
        <span class="bang">!</span>
        <div class="grow">
          <div class="ttl">该学号未注册</div>
          <div class="sub">如学号无法匹配，请核对后重试或先在教师端建档</div>
        </div>
      </div>

      <div v-else-if="problem === 'error'" class="alarm">
        <span class="bang">!</span>
        <div class="grow">
          <div class="ttl">操作失败</div>
          <div class="sub">{{ problemText }}</div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page {
  position: absolute;
  inset: 0;
  display: flex;
  padding: 24px 30px 116px;
  gap: 22px;
  min-height: 0;
}

.label {
  font-size: 14px;
  color: var(--ink-5);
  letter-spacing: 0.06em;
}

.label.flat {
  letter-spacing: 0;
  flex: none;
  color: var(--ink-4);
}

/* ---- 左 ---- */
.preview-col {
  flex: 1.5;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.detect {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 14px;
  font-weight: 600;
  color: var(--green);
}

.detect .dot {
  width: 10px;
  height: 10px;
  background: var(--green);
}

.detect.off {
  color: var(--ink-5);
}

.detect.off .dot {
  background: var(--ink-8);
  animation: none;
}

.stage {
  flex: 1;
  background: var(--fill-2);
  border: 1px solid var(--line-3);
  border-radius: 18px;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.box {
  position: absolute;
  top: 9%;
  bottom: 9%;
  left: 50%;
  transform: translateX(-50%);
  width: 170px;
  border: 2px solid var(--brand);
  border-radius: 12px;
}

.lock {
  position: absolute;
  top: 9%;
  left: calc(50% - 85px);
  background: var(--brand);
  color: #fff;
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 600;
  padding: 5px 9px;
  border-radius: 7px 7px 7px 0;
}

.note {
  position: absolute;
  left: 18px;
  bottom: 16px;
  font-size: 12px;
  color: var(--ink-5);
}

.frames {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
}

.bars {
  flex: 1;
  display: flex;
  gap: 8px;
}

.bar {
  flex: 1;
  height: 8px;
  border-radius: 99px;
  background: var(--line-4);
}

.bar.done {
  background: var(--green);
}

.bar.live {
  background: var(--brand);
  animation: recpulse 1.4s infinite;
}

.count {
  font-size: 14px;
  font-weight: 600;
  flex: none;
}

/* ---- 右 ---- */
.form-col {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.form-col > .label {
  margin-bottom: 12px;
}

.entry {
  display: flex;
  gap: 11px;
  margin-bottom: 14px;
}

.no-input {
  flex: 1;
  background: var(--card);
  border: 1.5px solid var(--line-3);
  border-radius: 13px;
  padding: 15px 18px;
  font-size: 21px;
  font-weight: 600;
  letter-spacing: 0.06em;
  outline: none;
}

.no-input:focus {
  border-color: var(--brand);
}

.match {
  background: var(--brand);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  border-radius: 13px;
  padding: 0 22px;
  flex: none;
}

.matched {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 15px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 14px;
}

.ava {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  font-weight: 600;
  flex: none;
}

.grow {
  flex: 1;
  min-width: 0;
}

.matched .name {
  font-size: 18px;
  font-weight: 700;
}

.matched .meta {
  font-size: 13px;
  color: var(--ink-4);
  margin-top: 3px;
}

.ok-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--green);
  flex: none;
}

.ok-tag .dot {
  background: var(--green);
}

.hint {
  font-size: 13px;
  color: var(--ink-5);
  line-height: 1.6;
  margin-bottom: 18px;
}

.status {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--brand-bg-2);
  border: 1px solid var(--brand-line);
  border-radius: 13px;
  padding: 12px 15px;
  font-size: 14px;
  font-weight: 600;
  color: var(--brand-deep);
  margin-bottom: 12px;
}

.status.done {
  background: var(--green-bg);
  border-color: var(--green);
  color: var(--green);
}

.status .dot.brand {
  background: var(--brand);
}
.status .dot.ok {
  background: var(--green);
}

.submit {
  background: var(--brand);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  border-radius: 13px;
  padding: 15px;
  box-shadow: var(--shadow-brand);
  margin-bottom: 11px;
}

.pair {
  display: flex;
  gap: 11px;
}

.ghost {
  flex: 1;
  border: 1px solid var(--line-3);
  background: var(--card);
  color: var(--ink-2);
  font-size: 15px;
  font-weight: 600;
  border-radius: 13px;
  padding: 13px;
}

.ghost.mute {
  color: var(--ink-4);
}

.spacer {
  flex: 1;
}

.alarm {
  background: var(--red-bg-2);
  border: 1px solid var(--red-line);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.bang {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--red);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  flex: none;
}

.alarm .ttl {
  font-size: 14px;
  font-weight: 700;
  color: var(--red-deep);
}

.alarm .sub {
  font-size: 12px;
  color: #b0787a;
  margin-top: 2px;
}
</style>
