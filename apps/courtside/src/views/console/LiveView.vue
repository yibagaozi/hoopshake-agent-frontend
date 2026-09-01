<script setup>
// 教师操作台 · 上课。左侧看当前动作与反馈，右侧遥控大屏、控制课堂、盯安全提醒。
import { computed, ref } from "vue";
import SkeletonFigure from "@/components/SkeletonFigure.vue";
import { useEdgeStore } from "@/stores/edge.js";
import { useScreenStore } from "@/stores/screen.js";
import { DISPLAY_VIEWS } from "@/stores/screen.js";
import * as edgeApi from "@/api/edge.js";
import { ALLOW_NO_LESSON } from "@/config/features.js";
import {
  actionCn, actionEn, checkpointCn, clock, initial, shortClock,
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
    toast.value = e.message;
  } finally {
    busy.value = "";
  }
}

const onStart = () => run("start", () => edge.start());
const onPause = () => run("pause", () => edge.pause());
const onResume = () => run("resume", () => edge.resume());
const onStop = () =>
  run("stop", async () => {
    const r = await edge.stop();
    toast.value = `已下课，共 ${r.segmentCount ?? 0} 段录制`;
  });
const onRestartCapture = () => run("cap", () => edgeApi.restartCapture());
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
              {{ actionCn(focus.actionType) }}
              <span class="action-en">{{ actionEn(focus.actionType) }}</span>
            </template>
            <template v-else>等待识别</template>
          </div>
        </div>

        <div v-if="focus?.displayName" class="pill">
          <span class="name">{{ focus.displayName }}</span>
          <span class="ava">{{ initial(focus.displayName) }}</span>
        </div>
      </div>

      <div class="stage">
        <SkeletonFigure :width="228" :height="290" tone="light" :annotation="annotation" />
      </div>

      <div v-if="latestCue" class="cue-hero">
        <div class="bang">!</div>
        <div>
          <div class="cue-cp">检查点 · {{ checkpointCn(latestCue.checkpointId) }}</div>
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
          <span class="what">{{ checkpointCn(c.checkpointId) }}</span>
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
          </template>
        </div>

        <div class="cv">
          <div class="cv-l">
            <span class="dot" :class="edge.cvAlive ? 'ok' : 'off'" />
            <span class="cv-ttl">动作识别</span>
          </div>
          <!-- 后端暂无 /local/cv/status，这里只展示 edge 实际给得出的量 -->
          <div class="cv-m mono">
            <span>{{ edge.personCount }}<i> 人</i></span>
            <span>{{ edge.cvAlive ? "帧在推" : "无帧" }}</span>
          </div>
          <div class="cv-b">
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
  </div>
</template>

<style scoped>
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

.danger.full {
  width: 100%;
}

.cv {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--card-2);
  border: 1px solid var(--line);
  border-radius: 13px;
  padding: 12px 15px;
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
