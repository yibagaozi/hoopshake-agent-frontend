<script setup>
// 教师操作台 · 现场注册。整班一次采集（edge 托管），跑完看脸绑学号。
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { edgeErrText, edgeErrorName } from "@/api/http.js";
import EnrollSkeleton from "@/components/EnrollSkeleton.vue";
import { useEdgeStore } from "@/stores/edge.js";
import * as edgeApi from "@/api/edge.js";
import { shortClock } from "@/utils/format.js";

const edge = useEdgeStore();

/**
 * session 全程用同一个值：**当前课程 id**。
 * start / status / identities / thumbnail 四个接口都要它，值不一致就互相看不见
 * —— identities 拿不到数据多半就是这里对不上。
 */
const session = computed(() => edge.lesson?.lessonId || "");

const camera = computed(() => edge.anchorCamera);
const cameraLabel = computed(() => camera.value?.role || camera.value?.camId || "主机位");
const cameraOnline = computed(() => !!(camera.value?.online && camera.value?.signal));

/* ---------------- 采集 ---------------- */

const opts = ref({ seconds: 45, expectedPersons: null });
const starting = ref(false);
/** NONE / RUNNING / SUCCEEDED / FAILED */
const runState = ref("NONE");
const runMsg = ref("");
const startedAt = ref(null);
const problemText = ref("");
const now = ref(Date.now());

let poller = null;
let ticker = null;

const running = computed(() => runState.value === "RUNNING");
const elapsed = computed(() => {
  void now.value;
  return startedAt.value ? (Date.now() - Date.parse(startedAt.value)) / 1000 : 0;
});

function applyStatus(st) {
  runState.value = st?.state || "NONE";
  runMsg.value = st?.message || "";
  if (st?.startedAt) startedAt.value = st.startedAt;
}

async function refreshStatus() {
  if (!session.value) return;
  try {
    applyStatus(await edgeApi.getEnrollStatus(session.value));
  } catch {
    // 没跑过时后端可能直接 404，当作 NONE
    runState.value = "NONE";
  }
}

/** 采集进度不走 WS，只能轮询；2.5s 一次，到终态就停 */
function watchRun() {
  clearInterval(poller);
  poller = setInterval(async () => {
    await refreshStatus();
    if (!running.value) {
      clearInterval(poller);
      if (runState.value === "SUCCEEDED") await loadIdentities();
    }
  }, 2500);
}

async function startCapture() {
  if (!session.value || starting.value) return;
  starting.value = true;
  problemText.value = "";
  try {
    applyStatus(
      await edgeApi.startEnroll(session.value, {
        enrollCamera: camera.value?.camId,
        seconds: Number(opts.value.seconds) || undefined,
        expectedPersons: Number(opts.value.expectedPersons) || undefined,
      }),
    );
    startedAt.value = startedAt.value || new Date().toISOString();
    watchRun();
  } catch (e) {
    const name = edgeErrorName(e);
    // 这三种是操作员当场能处理的，给具体的下一步而不是通用报错
    if (name === "ENROLL_BUSY") problemText.value = "已经有一轮采集在跑，等它结束再开始";
    else if (name === "ENROLL_UNAVAILABLE") problemText.value = "这台场边主机没配采集编排，请联系运维";
    else problemText.value = edgeErrText(e, "启动采集失败");
  } finally {
    starting.value = false;
  }
}

/* ---------------- 看脸绑学号 ---------------- */

const identities = ref([]);
const enrollCamera = ref("");
const loadingIdentities = ref(false);
/** localId → 输入框里的学号 */
const noInput = ref({});
/** 最近一次提交的结果，只用来出「学号不在名单」的提示 */
const lastBound = ref([]);
const binding = ref(false);

/**
 * 人脸列表 = 算法注册结果 ∪ 课中 WS 推来的 enrollNeeded。
 * 已绑的不隐藏：留在原位显示学号和姓名，输错了能直接改再提交一次覆盖。
 */
const bindRows = computed(() => {
  const byId = new Map();
  for (const p of identities.value) {
    byId.set(p.localId, {
      localId: p.localId,
      globalId: p.globalId,
      hasThumbnail: !!p.hasThumbnail,
      bound: !!p.bound,
      boundStudentNo: p.boundStudentNo || "",
      boundDisplayName: p.boundDisplayName || "",
      live: false,
    });
  }
  for (const p of edge.pendingBinds) {
    const prev = byId.get(p.studentLocalId);
    byId.set(p.studentLocalId, {
      localId: p.studentLocalId,
      globalId: p.globalId ?? prev?.globalId,
      hasThumbnail: prev?.hasThumbnail ?? !!p.hasThumbnail,
      // enrollNeeded 只对没绑学号的面孔推，所以这些一定是未绑的
      bound: prev?.bound ?? false,
      boundStudentNo: prev?.boundStudentNo || "",
      boundDisplayName: prev?.boundDisplayName || "",
      // 课中推来的标出来，老师知道这人正在场上投篮
      live: !prev || !!p.actionType,
      actionType: p.actionType,
    });
  }
  return [...byId.values()];
});

const unboundCount = computed(() => bindRows.value.filter((r) => !r.bound).length);

/** 待提交 = 填了合法学号，且与已绑的那个不一样（一样就没必要再发一次） */
function isDirty(r) {
  const v = (noInput.value[r.localId] || "").trim();
  return /^\d{10}$/.test(v) && v !== r.boundStudentNo;
}

const pendingCount = computed(() => bindRows.value.filter(isDirty).length);

const thumbUrl = (row) => edgeApi.enrollThumbnailUrl(session.value, row.localId);

async function loadIdentities() {
  if (!session.value) return;
  loadingIdentities.value = true;
  problemText.value = "";
  try {
    const res = await edgeApi.getEnrollIdentities(session.value);
    enrollCamera.value = res?.enrollCamera || "";
    identities.value = res?.people || [];
    // 已绑的把学号回填进输入框，老师一眼看到绑的是谁，要改也能直接改
    for (const p of identities.value) {
      if (p.bound && p.boundStudentNo && !noInput.value[p.localId]) {
        noInput.value = { ...noInput.value, [p.localId]: p.boundStudentNo };
      }
      // 已经绑上的就不该再留在「待绑」提醒里
      if (p.bound) edge.clearPendingBind(p.localId);
    }
    edge.mergePendingBinds(
      identities.value.filter((p) => !p.bound),
      session.value,
    );
  } catch (e) {
    // NOT_FOUND = 这个 session 没有注册产物，采集没成功或没跑过，不当错误刷屏
    if (edgeErrorName(e) !== "NOT_FOUND") problemText.value = edgeErrText(e, "拉取注册结果失败");
    identities.value = [];
  } finally {
    loadingIdentities.value = false;
  }
}

async function submitBind() {
  const payload = bindRows.value.filter(isDirty).map((r) => ({
    localId: r.localId,
    ...(r.globalId ? { globalId: r.globalId } : {}),
    studentNo: (noInput.value[r.localId] || "").trim(),
  }));
  if (!payload.length || !session.value) return;

  binding.value = true;
  problemText.value = "";
  try {
    const res = await edgeApi.bindEnroll(session.value, payload);
    lastBound.value = Array.isArray(res) ? res : [];
    for (const r of lastBound.value) edge.clearPendingBind(r.localId);
    // 绑定状态以服务端为准：重拉一次 identities，bound 字段自己会变过来
    await loadIdentities();
    if (edge.lesson?.lessonId) await edge.refreshRoster();
  } catch (e) {
    problemText.value =
      edgeErrorName(e) === "ROSTER_NOT_LOADED"
        ? "还没拉参课名单，先到「名单」页同步一次再绑"
        : edgeErrText(e, "绑定失败");
  } finally {
    binding.value = false;
  }
}

/** 刚绑的这批里学号不在名单的，单独提出来提醒 */
const offRoster = computed(() => lastBound.value.filter((r) => r.matchedInRoster === false));

/* ---------------- 步骤 ---------------- */

const step = computed(() => {
  if (running.value) return 2;
  if (bindRows.value.length || identities.value.length) return 3;
  return 1;
});

/** 首屏：把这个 session 的采集状态查回来，跑完了就顺手把注册结果拉出来 */
async function bootstrap() {
  if (!session.value) return;
  await refreshStatus();
  if (running.value) watchRun();
  else if (runState.value === "SUCCEEDED") await loadIdentities();
}

// 课程是 ConsoleLayout 连上 edge 之后才拿到的，直接打开注册页时它还是空的。
// 所以不能只在 onMounted 跑一次 —— 等 lessonId 到位（或中途换课）再跑。
watch(session, (id, prev) => {
  if (!id || id === prev) return;
  identities.value = [];
  lastBound.value = [];
  noInput.value = {};
  bootstrap();
});

onMounted(() => {
  bootstrap();
  ticker = setInterval(() => (now.value = Date.now()), 1000);
});

onUnmounted(() => {
  clearInterval(poller);
  clearInterval(ticker);
});
</script>

<template>
  <div class="wrap">
    <div class="step-row">
      <span class="step" :class="{ on: step === 1, done: step > 1 }"><span class="n">1</span>采集</span>
      <span class="step" :class="{ on: step === 2, done: step > 2 }"><span class="n">2</span>等待算法</span>
      <span class="step" :class="{ on: step === 3 }"><span class="n">3</span>看脸绑学号</span>
    </div>

    <div class="page">
      <!-- 左：机位预览 -->
      <section class="preview-col">
        <div class="col-head">
          <span class="label">注册预览 · {{ enrollCamera || cameraLabel }}</span>
          <span class="detect" :class="{ off: !cameraOnline }">
            <span class="dot pulse" />
            {{ cameraOnline ? `检测到 ${edge.personCount} 人` : "机位无信号" }}
          </span>
        </div>

        <div class="stage">
          <div class="box" />
          <div class="lock">{{ edge.personCount ? "已锁定目标" : "等待入镜" }}</div>
          <EnrollSkeleton :width="130" :height="300" />
          <div class="note mono">整班一次采集 · 跑完看脸绑学号</div>
        </div>
      </section>

      <!-- 右：采集与绑定 -->
      <section class="cap-col">
        <div v-if="!session" class="cap-card">
          <div class="cap-t">先选课</div>
          <div class="cap-need-lesson">
            采集用当前课程 id 作为 session。请先在顶部选择本节课，再开始采集。
          </div>
        </div>

        <template v-else>
          <!-- 采集控制 -->
          <div class="cap-card">
            <div class="cap-t">{{ running ? "采集中" : "开始采集" }}</div>

            <div v-if="running" class="cap-running">
              <span class="spinner" />
              <div>
                <!-- 后端的 message 常常就是「采集中」，和上面的标题重复，那就不显示 -->
                <div class="cap-state">
                  {{ runMsg && runMsg !== "采集中" ? runMsg : "算法正在采集人脸，请让学生依次入镜" }}
                </div>
                <div class="cap-elapsed">已进行 {{ shortClock(elapsed) }}</div>
              </div>
            </div>
            <div v-else class="cap-s">
              让本节课的学生依次站到{{ enrollCamera || cameraLabel }}前，点下面的按钮开始。
              算法会一次性采下全班的人脸，跑完再逐个输学号绑定 —— 不用一个个来。
            </div>

            <!-- 后端的 message 常常就是「采集完成」，和前半句重复就不再拼上 -->
            <div v-if="runState === 'SUCCEEDED' && !running" class="cap-msg ok">
              采集完成{{ runMsg && runMsg !== "采集完成" ? `：${runMsg}` : "" }}。下面是算法注册到的人，逐个输学号即可。
            </div>
            <div v-else-if="runState === 'FAILED'" class="cap-msg bad">
              采集失败{{ runMsg && runMsg !== "采集失败" ? `：${runMsg}` : "" }}。可以重新开始一轮。
            </div>
            <div v-if="problemText" class="cap-msg bad">{{ problemText }}</div>

            <div v-if="!running" class="cap-opts">
              <div class="cap-fld">
                <label>采集时长（秒）</label>
                <input v-model="opts.seconds" inputmode="numeric" placeholder="45" />
              </div>
              <div class="cap-fld">
                <label>预期人数（选填）</label>
                <input v-model="opts.expectedPersons" inputmode="numeric" placeholder="不填不核对" />
              </div>
            </div>

            <button v-if="!running" class="cap-go" :disabled="starting" @click="startCapture">
              {{ starting ? "启动中…" : runState === "NONE" ? "开始采集" : "重新采集" }}
            </button>
          </div>

          <!-- 绑定 -->
          <div class="bind-head" style="margin-top: 4px">
            <div>
              <div class="label">待绑定人脸</div>
              <div class="sub">
                算法注册到的人脸还没有学号。逐个输学号后一次提交，edge 会把学号和这张脸绑在一起。
              </div>
            </div>
            <button class="pull-btn" :disabled="loadingIdentities" @click="loadIdentities">
              {{ loadingIdentities ? "拉取中…" : "拉取注册结果" }}
            </button>
          </div>

          <div v-if="offRoster.length" class="bind-warn">
            有 {{ offRoster.length }} 人的学号不在本课名单里（{{ offRoster.map((r) => r.studentNo).join("、") }}），
            已经绑上，云端入库时会再按学号解析。若是输错，重新绑一次即可覆盖。
          </div>

          <div v-if="!bindRows.length" class="bind-empty">
            <div class="be-t">还没有人脸</div>
            <div class="be-s">
              先完成上面的采集，跑完会自动列出算法注册到的人。<br />
              课中若有没绑学号的面孔在投篮，这里也会自动出现。
            </div>
          </div>

          <div v-else class="bind-grid">
            <div
              v-for="r in bindRows"
              :key="r.localId"
              class="bind-card"
              :class="{ live: r.live, bound: r.bound }"
            >
              <div class="face">
                <img v-if="r.hasThumbnail" :src="thumbUrl(r)" :alt="r.localId" />
                <div v-else class="no-face">
                  <span class="nf-ic">?</span>
                  <span class="nf-t">无缩略图</span>
                </div>
                <span v-if="r.live" class="live-tag">场上</span>
                <span v-else-if="r.bound" class="bound-tag">已绑</span>
              </div>
              <div class="bc-id mono">
                {{ r.bound && r.boundDisplayName ? r.boundDisplayName : r.localId }}
              </div>
              <input
                v-model="noInput[r.localId]"
                class="mono bc-input"
                :class="{ dirty: isDirty(r) }"
                inputmode="numeric"
                maxlength="10"
                placeholder="10 位学号"
                @keyup.enter="submitBind"
              />
            </div>
          </div>

          <div v-if="bindRows.length" class="bind-foot">
            <span class="bf-note">
              <template v-if="unboundCount">还有 {{ unboundCount }} 张脸没绑。</template>
              <template v-else>本课的脸都绑好了。</template>
              学号不在本课名单也能绑，提交后会提示。没有缩略图的面孔只能按 stu_XX 认，
              现场确认是谁再填；已绑的改掉学号再提交即可覆盖。
            </span>
            <button class="bind-btn" :disabled="binding || !pendingCount" @click="submitBind">
              {{ binding ? "绑定中…" : `绑定 ${pendingCount} 人` }}
            </button>
          </div>
        </template>
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
  /* 底部避让放到各列自己身上：右列要内部滚动，避让必须在滚动容器**里面**，
     否则滚到底时最后一行会被浮动 dock 压住 */
  padding: 0 30px;
  gap: 22px;
  min-height: 0;
}

/* ---- 模式切换 ---- */
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

.bind-card.bound {
  background: var(--card-2);
  border-color: var(--line-2);
}

.bound-tag {
  position: absolute;
  left: 8px;
  top: 8px;
  border-radius: 99px;
  padding: 3px 9px;
  background: var(--green);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.bc-input.dirty {
  border-color: var(--brand);
  background: var(--brand-bg-2);
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
  padding-bottom: 116px;
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

/* ---- 采集（edge 托管，整班一次） ---- */
.cap-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 14px;
  /* 待绑人脸多起来这列会很长，要能自己滚 */
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-bottom: 116px;
  scrollbar-width: none;
}

.cap-col::-webkit-scrollbar {
  display: none;
}

/* 卡片在滚动容器里默认会被压扁，钉住各自的高度 */
.cap-col > * {
  flex: none;
}

.cap-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 22px;
}

.cap-t {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 8px;
}

.cap-s {
  font-size: 13px;
  line-height: 1.75;
  color: var(--ink-4);
  margin-bottom: 18px;
}

.cap-opts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.cap-fld label {
  display: block;
  font-size: 12px;
  color: var(--ink-5);
  margin-bottom: 6px;
}

.cap-fld input {
  width: 100%;
  height: 40px;
  border-radius: 11px;
  border: 1px solid var(--line-3);
  background: var(--fill);
  padding: 0 12px;
  font-size: 14px;
  color: var(--ink);
}

.cap-fld input:focus {
  outline: none;
  border-color: var(--brand);
  background: var(--card);
}

.cap-go {
  width: 100%;
  height: 50px;
  border-radius: 15px;
  background: var(--brand);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  box-shadow: var(--shadow-brand);
}

.cap-go:disabled {
  opacity: 0.45;
  box-shadow: none;
}

.cap-running {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}

.spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 3px solid var(--brand-line);
  border-top-color: var(--brand);
  animation: spin 0.9s linear infinite;
  flex: none;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.cap-state {
  font-size: 15px;
  font-weight: 600;
}

.cap-elapsed {
  font: 600 13px/1 var(--mono);
  color: var(--ink-4);
  margin-top: 5px;
}

.cap-msg {
  border-radius: 14px;
  padding: 13px 16px;
  font-size: 13px;
  line-height: 1.65;
  margin-bottom: 16px;
}

.cap-msg.ok {
  background: var(--green-bg);
  color: var(--ink-2);
}

.cap-msg.bad {
  background: var(--red-bg);
  color: var(--red-deep);
}

.cap-need-lesson {
  background: var(--brand-bg);
  color: var(--brand-deep);
  border-radius: 14px;
  padding: 13px 16px;
  font-size: 13px;
  line-height: 1.65;
}

.step-row {
  display: flex;
  gap: 8px;
  padding: 20px 30px 16px;
  flex: none;
}

.step {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 38px;
  padding: 0 16px;
  border-radius: 19px;
  background: var(--fill);
  color: var(--ink-4);
  font-size: 14px;
  font-weight: 600;
}

.step.on {
  background: var(--ink);
  color: #fff;
}

.step.done {
  background: var(--green-bg);
  color: var(--ink-2);
}

.step .n {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.08);
  font: 700 11px/20px var(--mono);
  text-align: center;
}

.step.on .n {
  background: rgba(255, 255, 255, 0.2);
}
</style>
