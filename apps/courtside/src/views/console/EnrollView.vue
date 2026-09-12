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

/* ---------------- 看脸绑学号 ---------------- */

/** bind = 看脸绑学号（算法已注册的人）；capture = 按学号现场采集建档 */
const mode = ref("bind");

const identities = ref([]);
const enrollSession = ref("");
const enrollCamera = ref("");
const loadingIdentities = ref(false);
/** localId → 输入框里的学号 */
const noInput = ref({});
/** localId → 绑定结果 { studentNo, displayName, matchedInRoster } */
const bindResult = ref({});
const binding = ref(false);
const bindings = ref([]);

/**
 * 待绑列表 = 算法注册结果 ∪ 课中 WS 推来的 enrollNeeded。
 * 后者可能压根没注册过（enroll_preview 里没缩略图），只能按 stu_XX 绑。
 */
const bindRows = computed(() => {
  const byId = new Map();
  for (const p of identities.value) {
    byId.set(p.localId, {
      localId: p.localId,
      globalId: p.globalId,
      hasThumbnail: !!p.hasThumbnail,
      session: enrollSession.value,
      live: false,
    });
  }
  for (const p of edge.pendingBinds) {
    const prev = byId.get(p.studentLocalId);
    byId.set(p.studentLocalId, {
      localId: p.studentLocalId,
      globalId: p.globalId ?? prev?.globalId,
      hasThumbnail: prev?.hasThumbnail ?? !!p.hasThumbnail,
      session: prev?.session ?? p.session ?? enrollSession.value,
      // 课中推来的标出来，老师知道这人正在场上投篮
      live: !prev || !!p.actionType,
      actionType: p.actionType,
      occurredAt: p.occurredAt,
    });
  }
  return [...byId.values()].filter((r) => !bindResult.value[r.localId]);
});

const pendingCount = computed(
  () => bindRows.value.filter((r) => /^\d{10}$/.test((noInput.value[r.localId] || "").trim())).length,
);

function thumbUrl(row) {
  return edgeApi.enrollThumbnailUrl(row.session, row.localId);
}

async function loadIdentities() {
  loadingIdentities.value = true;
  try {
    const res = await edgeApi.getEnrollIdentities();
    enrollSession.value = res?.session || "";
    enrollCamera.value = res?.enrollCamera || "";
    identities.value = res?.people || [];
    edge.mergePendingBinds(identities.value, enrollSession.value);
  } catch (e) {
    problem.value = "error";
    problemText.value = edgeErrText(e, "拉取注册结果失败");
  } finally {
    loadingIdentities.value = false;
  }
}

async function loadBindings() {
  try {
    const res = await edgeApi.getEnrollBindings();
    bindings.value = Array.isArray(res) ? res : res?.bindings || [];
  } catch {
    // 没有已绑记录时不打扰
  }
}

async function submitBind() {
  const payload = bindRows.value
    .map((r) => ({
      localId: r.localId,
      globalId: r.globalId,
      studentNo: (noInput.value[r.localId] || "").trim(),
    }))
    .filter((b) => /^\d{10}$/.test(b.studentNo));
  if (!payload.length) return;

  binding.value = true;
  problem.value = null;
  try {
    const res = await edgeApi.bindEnroll(payload);
    for (const r of Array.isArray(res) ? res : []) {
      bindResult.value = { ...bindResult.value, [r.localId]: r };
      edge.clearPendingBind(r.localId);
      delete noInput.value[r.localId];
    }
    await loadBindings();
    // 绑完名单里的人脸状态会变，顺手刷一次
    if (edge.lesson?.lessonId) await edge.refreshRoster();
  } catch (e) {
    problem.value = "error";
    problemText.value = edgeErrText(e, "绑定失败");
  } finally {
    binding.value = false;
  }
}

/** 绑定结果里 matchedInRoster=false 的，单独提出来提醒 */
const offRoster = computed(() =>
  Object.values(bindResult.value).filter((r) => r.matchedInRoster === false),
);

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

onMounted(() => {
  loadIdentities();
  loadBindings();
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
  <div class="wrap">
    <!-- 两种注册路径：课前看脸绑、现场按学号采集 -->
    <div class="modes">
      <button class="mode" :class="{ on: mode === 'bind' }" @click="mode = 'bind'">
        看脸绑学号
        <span v-if="bindRows.length" class="cnt">{{ bindRows.length }}</span>
      </button>
      <button class="mode" :class="{ on: mode === 'capture' }" @click="mode = 'capture'">
        按学号采集
      </button>
    </div>

  <div v-if="mode === 'bind'" class="bind-page">
    <div class="bind-head">
      <div>
        <div class="label">待绑定人脸</div>
        <div class="sub">
          算法注册的人脸还没有学号。逐个输学号后一次提交，edge 会把学号和这张脸绑在一起。
          <template v-if="enrollCamera"> · 注册机位 {{ enrollCamera }}</template>
        </div>
      </div>
      <button class="pull-btn" :disabled="loadingIdentities" @click="loadIdentities">
        {{ loadingIdentities ? "拉取中…" : "拉取注册结果" }}
      </button>
    </div>

    <div v-if="problem === 'error'" class="bind-err">{{ problemText }}</div>

    <div v-if="offRoster.length" class="bind-warn">
      有 {{ offRoster.length }} 人的学号不在本课名单里（{{ offRoster.map((r) => r.studentNo).join("、") }}），
      已经绑上，云端入库时会再按学号解析。若是输错，重新绑一次即可覆盖。
    </div>

    <div v-if="!bindRows.length" class="bind-empty">
      <div class="be-t">没有待绑定的人脸</div>
      <div class="be-s">
        课前请操作员先跑算法 enroll，再点右上角「拉取注册结果」。<br />
        课中若有没绑学号的面孔在投篮，这里会自动出现。
      </div>
    </div>

    <div v-else class="bind-grid">
      <div v-for="r in bindRows" :key="r.localId" class="bind-card" :class="{ live: r.live }">
        <div class="face">
          <img v-if="r.hasThumbnail" :src="thumbUrl(r)" :alt="r.localId" />
          <div v-else class="no-face">
            <span class="nf-ic">?</span>
            <span class="nf-t">无缩略图</span>
          </div>
          <span v-if="r.live" class="live-tag">场上</span>
        </div>
        <div class="bc-id mono">{{ r.localId }}</div>
        <input
          v-model="noInput[r.localId]"
          class="mono bc-input"
          inputmode="numeric"
          maxlength="10"
          placeholder="10 位学号"
          @keyup.enter="submitBind"
        />
      </div>
    </div>

    <div v-if="bindRows.length" class="bind-foot">
      <span class="bf-note">
        学号不在本课名单也能绑，提交后会提示。没有缩略图的面孔只能按 {{ "stu_XX" }} 认，
        现场确认是谁再填。
      </span>
      <button class="bind-btn" :disabled="binding || !pendingCount" @click="submitBind">
        {{ binding ? "绑定中…" : `绑定 ${pendingCount} 人` }}
      </button>
    </div>

    <div v-if="bindings.length" class="bound">
      <div class="label flat">已绑定 · {{ bindings.length }}</div>
      <div class="bound-list">
        <span v-for="b in bindings" :key="b.globalId || b.studentNo" class="bound-chip">
          <b>{{ b.displayName || b.studentNo }}</b>
          <i class="mono">{{ b.studentNo }}</i>
        </span>
      </div>
    </div>
  </div>

  <div v-else class="page">
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
  </div>
</template>

<style scoped>
.wrap {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.page {
  flex: 1;
  display: flex;
  padding: 0 30px 116px;
  gap: 22px;
  min-height: 0;
}

/* ---- 模式切换 ---- */
.modes {
  flex: none;
  display: flex;
  gap: 8px;
  padding: 20px 30px 16px;
}

.mode {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 18px;
  border-radius: 19px;
  background: var(--fill);
  color: var(--ink-3);
  font-size: 14px;
  font-weight: 600;
}

.mode:hover {
  background: var(--fill-2);
}

.mode.on {
  background: var(--ink);
  color: #fff;
}

.mode .cnt {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--red);
  color: #fff;
  font: 700 11px/20px var(--mono);
  text-align: center;
}

.mode.on .cnt {
  background: var(--brand);
}

/* ---- 看脸绑学号 ---- */
.bind-page {
  flex: 1;
  overflow-y: auto;
  padding: 0 30px 116px;
  min-height: 0;
}

.bind-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.bind-head .sub {
  margin-top: 7px;
  max-width: 640px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink-4);
}

/* 名字别叫 .ghost —— 本文件下方采集流程已有一个同名类且 flex:1，会把这个按钮拉满 */
.pull-btn {
  flex: none;
  height: 38px;
  padding: 0 18px;
  border-radius: 12px;
  border: 1px solid var(--line-3);
  background: var(--card);
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 600;
}

.pull-btn:hover {
  border-color: var(--ink-7);
}

.pull-btn:disabled {
  opacity: 0.55;
}

.bind-err,
.bind-warn {
  border-radius: 14px;
  padding: 13px 16px;
  font-size: 13px;
  line-height: 1.65;
  margin-bottom: 16px;
}

.bind-err {
  background: var(--red-bg);
  color: var(--red-deep);
}

.bind-warn {
  background: var(--brand-bg);
  color: var(--brand-deep);
}

.bind-empty {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 44px 30px;
  text-align: center;
}

.be-t {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 10px;
}

.be-s {
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-4);
}

.bind-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 16px;
}

.bind-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 12px;
}

.bind-card.live {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-line-2);
}

.face {
  position: relative;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background: var(--fill);
  margin-bottom: 10px;
}

.face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.no-face {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--ink-6);
}

.nf-ic {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 2px dashed var(--ink-8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
}

.nf-t {
  font-size: 12px;
}

.live-tag {
  position: absolute;
  left: 8px;
  top: 8px;
  border-radius: 99px;
  padding: 3px 9px;
  background: var(--brand);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.bc-id {
  font-size: 12px;
  color: var(--ink-4);
  margin-bottom: 8px;
  text-align: center;
}

.bc-input {
  width: 100%;
  height: 38px;
  border-radius: 10px;
  border: 1px solid var(--line-3);
  background: var(--fill);
  text-align: center;
  font-size: 14px;
  letter-spacing: 0.04em;
  color: var(--ink);
}

.bc-input:focus {
  outline: none;
  border-color: var(--brand);
  background: var(--card);
}

.bind-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 20px;
}

.bf-note {
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-5);
  max-width: 560px;
}

.bind-btn {
  flex: none;
  height: 44px;
  padding: 0 26px;
  border-radius: 14px;
  background: var(--brand);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  box-shadow: var(--shadow-brand);
}

.bind-btn:disabled {
  opacity: 0.45;
  box-shadow: none;
}

.bound {
  margin-top: 30px;
}

.bound-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.bound-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 99px;
  padding: 7px 14px;
  background: var(--green-bg);
  color: var(--ink-2);
  font-size: 13px;
}

.bound-chip b {
  font-weight: 600;
}

.bound-chip i {
  font-style: normal;
  font-size: 12px;
  color: var(--ink-4);
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
