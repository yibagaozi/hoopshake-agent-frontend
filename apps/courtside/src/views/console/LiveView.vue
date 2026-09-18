<script setup>
// 教师操作台 · 上课。左侧看当前动作与反馈，右侧遥控大屏、控制课堂、盯安全提醒。
import { computed, ref } from "vue";
import { edgeErrText } from "@/api/http.js";
import SkeletonFigure from "@/components/SkeletonFigure.vue";
import { useEdgeStore } from "@/stores/edge.js";
import { useScreenStore } from "@/stores/screen.js";
import { DISPLAY_VIEWS } from "@/stores/screen.js";
import * as edgeApi from "@/api/edge.js";
import { ALLOW_NO_LESSON } from "@/config/features.js";
import {
  actName, actionEn, clock, cpName, hhmm, initial, shortClock,
} from "@/utils/format.js";

const edge = useEdgeStore();
const screen = useScreenStore();

const busy = ref("");
const toast = ref("");

const focus = computed(() => edge.actionFocus);
const latestCue = computed(() => edge.cues[0] || null);
const recentCues = computed(() => edge.cues.slice(0, 2));

/** 从 cue 的 measured 里凑一句标注文案 */
const annotation = computed(() => {
  const m = latestCue.value?.measured;
  if (!m) return "";
  return Object.entries(m)
    .slice(0, 2)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");
});

const statePill = computed(() => {
  if (edge.recording) return { tone: "ok", text: "系统就绪 · 录制中" };
  if (edge.paused) return { tone: "warn", text: "已暂停 · 录制挂起" };
  if (edge.hasLesson) return { tone: "ok", text: "已选课 · 待开始" };
  if (ALLOW_NO_LESSON) return { tone: "warn", text: "未选课 · 可纯录制" };
  return { tone: "off", text: "未选课" };
});

/** 没选课时能否开录，取决于开关；纯录制 edge 是支持的 */
const canStart = computed(() => edge.hasLesson || ALLOW_NO_LESSON);

const startLabel = computed(() => {
  if (edge.hasLesson) return "开始上课 · 录制";
  if (ALLOW_NO_LESSON) return "开始纯录制 · 无课程";
  return "请先选择课程";
});

const unavailable = computed(() => edge.session?.unavailableCameras || []);

/* ---------------- 球场标定 ---------------- */

/**
 * 标定产物在不在，决定这节课能不能做真三角化。
 * 缺产物时 edge 默认不启动 CV（block-cv-when-missing），但**录制照常** ——
 * 所以这不是「上不了课」，是「这节课没有动作提示」，文案上必须分清，
 * 否则老师会以为课都上不了。
 */
const calibTone = computed(() => {
  if (!edge.hasLesson) return "off";
  if (edge.calibRunning) return "warn";
  if (!edge.calibKnown) return "off";
  return edge.calibReady ? "ok" : "bad";
});

const calibText = computed(() => {
  if (!edge.hasLesson) return "未选课";
  if (edge.calibRunning) return "标定中";
  if (!edge.calibKnown) return "状态未知";
  return edge.calibReady ? "已标定" : "未标定";
});

/**
 * 产物最后更新时刻，老师据此判断「这是不是这次摆位之后标的」。
 * 用 hhmm 而不是 clock —— clock 收的是秒数（课堂计时那种时长），
 * 传一个时间点进去会算出天文数字。
 */
const calibAtText = computed(() => {
  const v = edge.calibratedAt;
  if (!v) return "";
  const t = hhmm(v);
  return t === "--:--" ? "" : `标于 ${t}`;
});

/** 上次标定任务失败时，把 edge 给的原因原样带出来，别自己改写 */
const calibFailMsg = computed(() => {
  if (edge.calibRunState !== "FAILED") return "";
  return edge.calibRun?.message || "标定未完成";
});

/** 开课前的提示条：只在「明确知道没标定」时出，状态未知时不吓人 */
const calibBlocking = computed(() => edge.hasLesson && edge.calibKnown && !edge.calibReady);

const onCalibrate = (force) =>
  run("calib", async () => {
    await edge.runCalibration(force);
    toast.value =
      "已在算法机上拉起标定进程。接下来要有人到算法机前完成控制点标注，这一步没法远程替你点。";
  });

/** 事件的课堂时刻：发生时间减去本课开始时间，与大屏口径一致 */
function classClock(iso) {
  const startedAt = edge.session?.startedAt;
  if (!iso || !startedAt) return "--:--";
  return shortClock((Date.parse(iso) - Date.parse(startedAt)) / 1000);
}

async function run(key, fn) {
  busy.value = key;
  toast.value = "";
  try {
    await fn();
  } catch (e) {
    toast.value = edgeErrText(e);
  } finally {
    busy.value = "";
  }
}

const onStart = () => run("start", () => edge.start());
const onPause = () => run("pause", () => edge.pause());
const onResume = () => run("resume", () => edge.resume());
const onStop = () =>
  run("stop", async () => {
    // 下课前把 sessionId 记下来：stop 之后 /local/state 里的会话会转成 ENDED，
    // 课后处理要拿它去调 process / publish
    const before = edge.session?.sessionId;
    const r = await edge.stop();
    endedSession.value = {
      sessionId: r?.sessionId || before,
      segmentCount: r?.segmentCount ?? 0,
      durationSeconds: r?.durationSeconds ?? edge.elapsedSeconds,
    };
    postOpen.value = true;
    toast.value = `已下课，共 ${endedSession.value.segmentCount} 段录制`;
  });

/* ---------------- 课后处理 ---------------- */

/**
 * 下课之后要跑算法批处理，把这节课切分、评分并出云。
 * process 是异步的，edge 立即返回 accepted，没有进度回调，也没有完成事件推给前端
 * （sessionProcessed 走的是 CV→edge 的内部通道），所以这里只报「已提交」。
 */
const endedSession = ref(null);
const postOpen = ref(false);
/** idle / running / accepted / failed */
const postState = ref("idle");
const postMsg = ref("");
const postKind = ref("");

/** 离开页面再回来时，会话还是 ENDED 就还能重新打开课后处理 */
const canReopenPost = computed(
  () => edge.sessionState === "ENDED" && !!(endedSession.value?.sessionId || edge.session?.sessionId),
);

function openPost() {
  if (!endedSession.value) {
    endedSession.value = {
      sessionId: edge.session?.sessionId,
      segmentCount: edge.session?.segmentCount ?? 0,
      durationSeconds: edge.elapsedSeconds,
    };
  }
  postState.value = "idle";
  postMsg.value = "";
  postOpen.value = true;
}

async function runPost(kind) {
  const sid = endedSession.value?.sessionId;
  if (!sid || postState.value === "running") return;
  postKind.value = kind;
  postState.value = "running";
  postMsg.value = "";
  try {
    if (kind === "process") await edgeApi.processSession(sid);
    else await edgeApi.publishSession(sid);
    postState.value = "accepted";
  } catch (e) {
    postState.value = "failed";
    postMsg.value = edgeErrText(e);
  }
}
const onRestartCapture = () => run("cap", () => edgeApi.restartCapture());

/* ---------------- 算法进程 ---------------- */

const onStartCv = () => run("cvStart", () => edge.startCv());
const onStopCv = () => run("cvStop", () => edge.stopCv());
const onRestartCv = () => run("cvRestart", () => edge.restartCv());

/** 算法状态的中文说法；认不出的状态词原样显示，别硬套 */
const cvText = computed(() => {
  if (!edge.cvStateKnown) return edge.cvState || "状态未知";
  return edge.cvAlive ? "运行中" : "已停止";
});
</script>

<template>
  <div class="page">
    <!-- 左：当前动作与实时反馈 -->
    <section class="card focus">
      <div class="head">
        <div>
          <div class="label-row">
            <span class="label">当前动作</span>
            <span v-if="screen.displayOnline" class="sync">
              <span class="dot pulse" />与大屏同步
            </span>
          </div>
          <div class="action" :class="{ idle: !focus?.actionType }">
            <template v-if="focus?.actionType">
              {{ actName(focus.actionLabel, focus.actionType) }}
              <span class="action-en">{{ actionEn(focus.actionType) }}</span>
            </template>
            <template v-else>等待识别</template>
          </div>
        </div>

        <!-- 没绑学号时 displayName 是空的。这时候不该把整块藏掉：
             「有人在投篮但不知道是谁」正是要老师去补绑的信号 -->
        <div v-if="focus?.actionType" class="pill">
          <span class="name">{{ focus.displayName || "未识别" }}</span>
          <span class="ava">{{ initial(focus.displayName || "?") }}</span>
        </div>
      </div>

      <div class="stage">
        <SkeletonFigure :width="228" :height="290" tone="light" :annotation="annotation" />
      </div>

      <div v-if="latestCue" class="cue-hero">
        <div class="bang">!</div>
        <div>
          <div class="cue-cp">检查点 · {{ cpName(latestCue.checkpointLabel, latestCue.checkpointId) }}</div>
          <div class="cue-text">{{ latestCue.cueText }}</div>
        </div>
      </div>
      <div v-else class="cue-hero empty">
        <div class="bang muted">·</div>
        <div>
          <div class="cue-cp">暂无提示</div>
          <div class="cue-text muted">开始上课后，实时反馈会显示在这里</div>
        </div>
      </div>

      <div class="cue-row">
        <div v-for="c in recentCues" :key="c.eventId" class="cue-chip">
          <span class="dot" :class="c.severity === 'POSITIVE' ? 'ok' : 'brand'" />
          <span class="mono time">{{ classClock(c.occurredAt) }}</span>
          <span class="who">{{ c.displayName }}</span>
          <span class="what">{{ cpName(c.checkpointLabel, c.checkpointId) }}</span>
        </div>
        <div v-if="!recentCues.length" class="cue-chip muted">等待 CV 事件…</div>
      </div>
    </section>

    <!-- 右：遥控 / 控制 / 安全 -->
    <section class="side">
      <div class="card remote">
        <div class="card-head">
          <span class="ttl">大屏遥控</span>
          <div class="seg">
            <button
              :class="{ on: screen.theme === 'dark' }"
              @click="screen.setTheme('dark')"
            >
              深色
            </button>
            <button
              :class="{ on: screen.theme === 'light' }"
              @click="screen.setTheme('light')"
            >
              浅色
            </button>
          </div>
        </div>

        <div class="views">
          <button
            v-for="v in DISPLAY_VIEWS"
            :key="v.id"
            :class="{ on: screen.view === v.id }"
            @click="screen.setView(v.id)"
          >
            {{ v.label }}
          </button>
        </div>

        <div class="now" :class="{ off: !screen.displayOnline }">
          <span class="dot pulse" />
          <span class="txt">大屏正在显示：</span>
          <span class="val">{{ screen.viewLabel }} · {{ screen.themeLabel }}</span>
          <button v-if="!screen.displayOnline" class="open" @click="screen.openDisplayWindow">
            打开大屏
          </button>
        </div>
      </div>

      <div class="card control">
        <div class="card-head">
          <span class="state" :class="statePill.tone">
            <span class="dot pulse" />{{ statePill.text }}
          </span>
          <div class="timer">
            <span class="lab">上课</span>
            <span class="mono val">{{ clock(edge.elapsedSeconds) }}</span>
          </div>
        </div>

        <div v-if="unavailable.length" class="degraded">
          降级录制：{{ unavailable.join("、") }} 离线已跳过
        </div>

        <div class="actions">
          <template v-if="edge.recording">
            <button class="ghost" :disabled="busy === 'pause'" @click="onPause">暂停</button>
            <button class="danger" :disabled="busy === 'stop'" @click="onStop">
              下课 · 结束录制
            </button>
          </template>
          <template v-else-if="edge.paused">
            <button class="ghost" :disabled="busy === 'resume'" @click="onResume">继续</button>
            <button class="danger" :disabled="busy === 'stop'" @click="onStop">
              下课 · 结束录制
            </button>
          </template>
          <template v-else>
            <button
              class="danger full"
              :disabled="busy === 'start' || !canStart"
              @click="onStart"
            >
              {{ startLabel }}
            </button>
            <button v-if="canReopenPost" class="ghost full" @click="openPost">
              课后处理
            </button>
          </template>
        </div>

        <!-- 球场标定。放在动作识别上面：没有标定就没有三角化，
             动作识别即便起来了也只会出噪声提示 -->
        <div class="cv calib">
          <div class="cv-head">
            <div class="cv-l">
              <span class="dot" :class="calibTone" />
              <span class="cv-ttl">球场标定</span>
            </div>
            <div class="cv-m mono">
              <span>{{ calibText }}</span>
              <span v-if="calibAtText">{{ calibAtText }}</span>
            </div>
          </div>

          <!-- 没标定：说清后果，也说清什么照常 -->
          <div v-if="calibBlocking" class="cv-warn">
            本课还没有标定，开课后<b>不会</b>启动动作识别，这节课不出实时提示；
            <b>录制照常</b>，留档不受影响。
            <span v-if="edge.calibMissing.length" class="miss mono">
              缺：{{ edge.calibMissing.join("、") }}
            </span>
          </div>

          <div v-else-if="!edge.hasLesson" class="cv-note">
            标定产物是按课程分开存的，先在「课程」里选本节课，才能查和做标定。
          </div>

          <div v-else-if="!edge.calibKnown" class="cv-note">
            拿不到标定状态（算法机没开标定功能，或这版 edge 还没有这个接口）。
            开课前请人工确认一下。
          </div>

          <div v-if="edge.calibRunning" class="cv-note run">
            标定进程已拉起 —— <b>还要有人到算法机前完成控制点标注</b>，
            这一步是 GUI 操作，远程点不了。标完这里会自动变成「已标定」。
          </div>

          <div v-else-if="calibFailMsg" class="cv-warn">
            上次标定没成：{{ calibFailMsg }}
          </div>

          <div class="cv-b">
            <button
              v-if="!edge.calibReady"
              class="mini go"
              :disabled="busy === 'calib' || !edge.hasLesson || edge.calibRunning"
              :title="edge.hasLesson ? '' : '先选本节课'"
              @click="onCalibrate(false)"
            >
              {{ busy === "calib" ? "拉起中…" : edge.calibRunning ? "标定进行中…" : "开始标定" }}
            </button>
            <button
              v-else
              class="mini"
              :disabled="busy === 'calib' || edge.calibRunning"
              title="镜头动过或换了场地才需要重标"
              @click="onCalibrate(true)"
            >
              {{ busy === "calib" ? "拉起中…" : "重新标定" }}
            </button>
            <button
              class="mini"
              :disabled="busy === 'calibChk' || !edge.hasLesson"
              :title="edge.hasLesson ? '' : '先选本节课'"
              @click="run('calibChk', () => edge.refreshCalibration())"
            >
              重新检查
            </button>
          </div>
        </div>

        <div class="cv">
          <div class="cv-head">
            <div class="cv-l">
              <span class="dot" :class="edge.cvAlive ? 'ok' : 'off'" />
              <span class="cv-ttl">动作识别</span>
            </div>
            <!-- 进程状态（/local/cv/status）与是否真在推帧分开看：
                 进程起着但不推帧是两回事，混在一起排查不了 -->
            <div class="cv-m mono">
              <span>{{ cvText }}</span>
              <span>{{ edge.personCount }}<i> 人</i></span>
              <span>{{ edge.poseAlive ? "帧在推" : "无帧" }}</span>
            </div>
          </div>

          <!-- 算法跑在别的 session 上：它会去错 gallery 认人，
               识别结果里 student_id 会全是 null，现象很隐蔽 -->
          <div v-if="edge.cvSessionMismatch" class="cv-warn">
            算法跑的是另一节课的 session（<span class="mono">{{ edge.cvSession }}</span>），
            认不出本课的学生。点「以本课重启」切过来。
          </div>

          <div class="cv-b">
            <button
              v-if="!edge.cvAlive"
              class="mini go"
              :disabled="busy === 'cvStart' || !edge.hasLesson"
              :title="
                !edge.hasLesson
                  ? '先选本节课'
                  : calibBlocking
                    ? '本课未标定，算法机可能会拒绝启动'
                    : ''
              "
              @click="onStartCv"
            >
              {{ busy === "cvStart" ? "启动中…" : "启动算法" }}
            </button>
            <template v-else>
              <button class="mini" :disabled="busy === 'cvRestart'" @click="onRestartCv">
                {{ busy === "cvRestart" ? "重启中…" : edge.cvSessionMismatch ? "以本课重启" : "重启算法" }}
              </button>
              <button class="mini" :disabled="busy === 'cvStop'" @click="onStopCv">
                {{ busy === "cvStop" ? "停止中…" : "停止算法" }}
              </button>
            </template>
            <button class="mini" :disabled="busy === 'cap'" @click="onRestartCapture">
              重启采集
            </button>
          </div>
        </div>
      </div>

      <div class="card safety">
        <div class="card-head">
          <span class="label">安全提醒 · 实时</span>
          <span class="count">{{ edge.alerts.length }} 待关注</span>
        </div>
        <div class="alist">
          <div v-for="a in edge.alerts" :key="a.eventId" class="alert">
            <span class="badge">!</span>
            <span class="mono time">{{ classClock(a.occurredAt) }}</span>
            <span class="who">{{ a.displayName }}</span>
            <span class="what">{{ a.message }}</span>
          </div>
          <div v-if="!edge.alerts.length" class="alert calm">
            <span class="badge ok">✓</span>
            <span class="what grow">暂无安全告警</span>
          </div>
        </div>
      </div>

      <div v-if="toast" class="toast">{{ toast }}</div>
    </section>
    <!-- 下课后的批处理。放在这里而不是录制页：下课是老师本来就在做的动作，
         顺手把「跑算法出云」接在后面，不用再记得去别处点一次 -->
    <div v-if="postOpen" class="post-mask" @click.self="postOpen = false">
      <div class="post">
        <div class="post-head">
          <div>
            <div class="post-t">本节课已结束</div>
            <div class="post-s mono">
              {{ endedSession?.sessionId || "—" }}
            </div>
          </div>
          <button class="post-x" @click="postOpen = false">✕</button>
        </div>

        <div class="post-meta">
          <span><i>时长</i>{{ clock(endedSession?.durationSeconds || 0) }}</span>
          <span><i>录制</i>{{ endedSession?.segmentCount ?? 0 }} 段</span>
          <span v-if="edge.lesson?.title"><i>课程</i>{{ edge.lesson.title }}</span>
        </div>

        <p class="post-note">
          接下来要跑算法批处理：把这节课的动作切分、评分，再同步到云端，学生和老师才能在
          报告里看到本节课。处理在场边主机后台进行，需要一段时间，
          <b>提交后可以直接关掉这个窗口</b>，不用守着。
        </p>

        <div v-if="postState === 'accepted'" class="post-ok">
          <span class="dot" />
          {{ postKind === "process" ? "批处理已提交，正在后台跑" : "已提交出云" }}。
          完成后学生端与教师端才会出现本节课的数据。
        </div>
        <div v-else-if="postState === 'failed'" class="post-err">{{ postMsg }}</div>

        <div class="post-acts">
          <button
            class="post-primary"
            :disabled="postState === 'running' || postState === 'accepted'"
            @click="runPost('process')"
          >
            {{ postState === "running" && postKind === "process" ? "提交中…" : "跑批处理并出云" }}
          </button>
          <button
            class="post-second"
            :disabled="postState === 'running' || postState === 'accepted'"
            @click="runPost('publish')"
          >
            {{ postState === "running" && postKind === "publish" ? "提交中…" : "已跑过批处理，直接出云" }}
          </button>
        </div>

        <div class="post-hint">
          批处理没在这台机器上配（50331）时，用「直接出云」把已经跑好的结果发上去；
          反过来交接文件还没生成（40915）就得先跑批处理。
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---- 课后处理 ---- */
.post-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(12, 12, 14, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30px;
  backdrop-filter: blur(2px);
}

.post {
  width: 520px;
  max-width: 100%;
  background: var(--card);
  border-radius: 24px;
  padding: 26px 28px 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.24);
}

.post-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.post-t {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.post-s {
  margin-top: 5px;
  font-size: 12px;
  color: var(--ink-5);
}

.post-x {
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--fill);
  color: var(--ink-4);
  font-size: 14px;
}

.post-x:hover {
  background: var(--fill-2);
  color: var(--ink-2);
}

.post-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}

.post-meta span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border-radius: 99px;
  padding: 6px 13px;
  background: var(--fill);
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-2);
}

.post-meta i {
  font-style: normal;
  font-weight: 500;
  color: var(--ink-5);
}

.post-note {
  font-size: 13px;
  line-height: 1.75;
  color: var(--ink-3);
  margin-bottom: 18px;
}

.post-note b {
  color: var(--ink);
}

.post-ok,
.post-err {
  border-radius: 14px;
  padding: 12px 15px;
  font-size: 13px;
  line-height: 1.65;
  margin-bottom: 16px;
}

.post-ok {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  background: var(--green-bg);
  color: var(--ink-2);
}

.post-ok .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
  flex: none;
  margin-top: 6px;
}

.post-err {
  background: var(--red-bg);
  color: var(--red-deep);
}

.post-acts {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.post-primary {
  height: 50px;
  border-radius: 15px;
  background: var(--brand);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  box-shadow: var(--shadow-brand);
}

.post-second {
  height: 44px;
  border-radius: 14px;
  border: 1px solid var(--line-3);
  background: var(--card);
  color: var(--ink-2);
  font-size: 14px;
  font-weight: 600;
}

.post-second:hover:not(:disabled) {
  border-color: var(--ink-7);
}

.post-primary:disabled,
.post-second:disabled {
  opacity: 0.45;
  box-shadow: none;
}

.post-hint {
  margin-top: 16px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-5);
}

.page {
  position: absolute;
  inset: 0;
  display: flex;
  gap: 20px;
  padding: 22px 24px 116px;
  min-height: 0;
}

.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 24px;
  box-shadow: var(--shadow-card);
}

/* ---- 左侧 ---- */
.focus {
  flex: 1.7;
  padding: 26px 32px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.label-row {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 9px;
}

.label {
  font-size: 13px;
  color: var(--ink-5);
  letter-spacing: 0.06em;
}

.sync {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--brand-deep);
  background: var(--brand-bg);
  border-radius: 99px;
  padding: 5px 10px;
}

.sync .dot {
  width: 7px;
  height: 7px;
  background: var(--brand);
}

.action {
  font-size: 36px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
}

/* 还没收到 actionFocus 时不要空着一行 */
.action.idle {
  font-size: 28px;
  font-weight: 600;
  color: var(--ink-7);
}

.action-en {
  color: var(--ink-7);
  font-weight: 500;
  font-size: 22px;
}

.pill {
  display: flex;
  align-items: center;
  gap: 11px;
  background: var(--fill);
  border: 1px solid var(--line-2);
  border-radius: 999px;
  padding: 7px 7px 7px 16px;
}

.pill .name {
  font-size: 16px;
  font-weight: 600;
}

.pill .ava {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}

.stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.cue-hero {
  background: var(--brand-bg-2);
  border: 1px solid var(--brand-line);
  border-radius: 18px;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 13px;
}

.cue-hero.empty {
  background: var(--card-2);
  border-color: var(--line);
}

.bang {
  width: 48px;
  height: 48px;
  flex: none;
  border-radius: 14px;
  background: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 700;
  color: #fff;
}

.bang.muted {
  background: var(--fill);
  color: var(--ink-7);
}

.cue-cp {
  font-size: 14px;
  color: var(--ink-4);
  margin-bottom: 4px;
}

.cue-text {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.cue-text.muted {
  font-size: 16px;
  font-weight: 500;
  color: var(--ink-5);
}

.cue-row {
  display: flex;
  gap: 11px;
}

.cue-chip {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--card-2);
  border: 1px solid var(--line);
  border-radius: 13px;
  padding: 10px 14px;
  min-width: 0;
}

.cue-chip.muted {
  color: var(--ink-6);
  font-size: 13px;
}

.cue-chip .time {
  font-size: 12px;
  color: var(--ink-6);
}

.cue-chip .who {
  font-size: 14px;
  font-weight: 600;
  flex: 1;
}

.cue-chip .what {
  font-size: 13px;
  color: var(--ink-4);
}

.dot.ok {
  background: var(--green);
}
.dot.brand {
  background: var(--brand);
}
.dot.off {
  background: var(--ink-8);
}
/* 标定用：bad = 明确没标定（红），warn = 标定进行中（品牌橙） */
.dot.bad {
  background: var(--red);
}
.dot.warn {
  background: var(--brand);
}

/* ---- 右侧 ---- */
.side {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 13px;
}

.ttl {
  font-size: 15px;
  font-weight: 700;
}

.remote,
.control {
  flex: none;
  padding: 18px 20px;
  border-radius: 20px;
}

.seg {
  display: flex;
  background: var(--fill);
  border-radius: 10px;
  padding: 3px;
}

.seg button {
  border-radius: 8px;
  padding: 6px 13px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-4);
}

.seg button.on {
  background: var(--ink);
  color: #fff;
}

.views {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}

.views button {
  border: 1px solid var(--line-2);
  border-radius: 12px;
  padding: 11px 0;
  font-size: 13px;
  font-weight: 600;
  background: var(--fill);
  color: var(--ink-2);
}

.views button.on {
  background: var(--ink);
  color: #fff;
  border-color: var(--ink);
}

.now {
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--brand-bg-2);
  border: 1px solid var(--brand-line-2);
  border-radius: 12px;
  padding: 11px 14px;
  font-size: 13px;
}

.now .dot {
  background: var(--brand);
}

.now.off {
  background: var(--fill);
  border-color: var(--line-2);
}

.now.off .dot {
  background: var(--ink-8);
  animation: none;
}

.now .txt {
  color: #8a6a55;
}

.now .val {
  font-weight: 700;
  color: var(--brand-deep);
  flex: 1;
}

.now.off .txt,
.now.off .val {
  color: var(--ink-5);
}

.open {
  font-size: 12px;
  font-weight: 700;
  color: var(--brand-deep);
}

.state {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 999px;
  padding: 6px 12px;
}

.state.ok {
  color: var(--green);
  background: var(--green-bg);
}
.state.ok .dot {
  background: var(--green);
}

.state.warn {
  color: var(--brand-deep);
  background: var(--brand-bg);
}
.state.warn .dot {
  background: var(--brand);
}

.state.off {
  color: var(--ink-5);
  background: var(--fill);
}
.state.off .dot {
  background: var(--ink-8);
  animation: none;
}

.timer {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.timer .lab {
  font-size: 12px;
  color: var(--ink-6);
}

.timer .val {
  font-size: 19px;
  font-weight: 600;
}

.degraded {
  background: var(--brand-bg);
  border: 1px solid var(--brand-line);
  border-radius: 11px;
  padding: 9px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--brand-deep);
  margin-bottom: 11px;
}

.actions {
  display: flex;
  gap: 11px;
  margin-bottom: 12px;
}

.ghost {
  border: 1px solid var(--line-3);
  background: var(--card);
  color: var(--ink-2);
  font-size: 15px;
  font-weight: 600;
  border-radius: 13px;
  padding: 13px 20px;
}

.danger {
  flex: 1;
  background: var(--brand);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  border-radius: 13px;
  padding: 13px 0;
  box-shadow: var(--shadow-brand);
}

.danger.full,
.ghost.full {
  width: 100%;
}

.cv {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--card-2);
  border: 1px solid var(--line);
  border-radius: 13px;
  padding: 12px 15px;
}

.cv-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cv-warn {
  background: var(--brand-bg);
  color: var(--brand-deep);
  border-radius: 10px;
  padding: 9px 11px;
  font-size: 12px;
  line-height: 1.6;
}

.cv-b {
  display: flex;
  gap: 8px;
}

/* ---- 球场标定 ---- */
.calib .cv-warn {
  background: var(--red-bg);
  color: var(--red-deep);
}
.cv-note {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 9px 11px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-3);
}
.cv-note.run {
  background: var(--brand-bg);
  border-color: transparent;
  color: var(--brand-deep);
}
.miss {
  display: block;
  margin-top: 5px;
  font-size: 11px;
  opacity: 0.85;
}

.mini.go {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}

.cv-l {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.cv-ttl {
  font-size: 13px;
  font-weight: 600;
}

.cv-m {
  display: flex;
  gap: 12px;
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.cv-m i {
  color: var(--ink-7);
  font-style: normal;
}

.mini {
  border: 1px solid var(--line-3);
  background: var(--card);
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
  border-radius: 9px;
  padding: 7px 11px;
}

.safety {
  flex: 1;
  padding: 18px 20px;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.count {
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-deep);
}

.alist {
  display: flex;
  flex-direction: column;
  gap: 9px;
  overflow-y: auto;
}

.alert {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--brand-bg-2);
  border: 1px solid var(--brand-line);
  border-radius: 12px;
  padding: 11px 14px;
}

.alert.calm {
  background: var(--card-2);
  border-color: var(--line);
}

.badge {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--brand);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  flex: none;
}

.badge.ok {
  background: var(--green-bg);
  color: var(--green);
}

.alert .time {
  font-size: 12px;
  color: var(--ink-6);
}

.alert .who {
  font-size: 14px;
  font-weight: 600;
  flex: 1;
}

.alert .what {
  font-size: 13px;
  color: var(--brand-deep);
  font-weight: 600;
}

.alert .what.grow {
  flex: 1;
  color: var(--ink-4);
  font-weight: 500;
}

.toast {
  flex: none;
  background: var(--ink);
  color: #fff;
  border-radius: 12px;
  padding: 11px 14px;
  font-size: 13px;
}
</style>
