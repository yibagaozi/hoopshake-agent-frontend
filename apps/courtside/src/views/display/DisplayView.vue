<script setup>
// 课堂大屏。纯展示无交互，视图与主题由操作台通过 BroadcastChannel 遥控。
// 版面按设计稿的 1280×720 固定布局，再整体等比缩放铺满电视屏。
import { computed, onMounted, onUnmounted, ref } from "vue";
import SkeletonFigure from "@/components/SkeletonFigure.vue";
import EnrollSkeleton from "@/components/EnrollSkeleton.vue";
import AppLogo from "@/components/AppLogo.vue";
import { useEdgeStore } from "@/stores/edge.js";
import { useScreenStore } from "@/stores/screen.js";
import {
  actName, actionEn, clock, cpName, initial, shortClock,
} from "@/utils/format.js";

const BOARD_W = 1280;
const BOARD_H = 720;

const edge = useEdgeStore();
const screen = useScreenStore();

const scale = ref(1);

function fit() {
  scale.value = Math.min(window.innerWidth / BOARD_W, window.innerHeight / BOARD_H);
}

onMounted(() => {
  edge.connect("display");
  screen.listenAsDisplay();
  fit();
  window.addEventListener("resize", fit);
});

onUnmounted(() => {
  edge.disconnect();
  window.removeEventListener("resize", fit);
});

const dark = computed(() => screen.theme === "dark");

const title = computed(() => {
  const l = edge.lesson;
  if (!l?.lessonId) return "等待选课";
  return l.classCode ? `${l.classCode}班 · ${l.title}` : l.title;
});

const focus = computed(() => {
  // 单人聚焦时优先显示操作台点名的学生
  if (screen.view === "focus" && screen.focus) {
    return { ...edge.actionFocus, displayName: screen.focus.displayName };
  }
  return edge.actionFocus;
});

const latestCue = computed(() => edge.cues[0] || null);

/** cue 的课堂时刻：发生时间减去本课开始时间 */
function classClock(iso) {
  const startedAt = edge.session?.startedAt;
  if (!iso || !startedAt) return "--:--";
  return shortClock((Date.parse(iso) - Date.parse(startedAt)) / 1000);
}

const annotation = computed(() => {
  const m = latestCue.value?.measured;
  if (!m) return "";
  return Object.entries(m)
    .slice(0, 2)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");
});

/** 课末简报的粗略统计，取本地已收到的事件 */
const brief = computed(() => ({
  duration: clock(edge.elapsedSeconds),
  cues: edge.cues.length,
  alerts: edge.alerts.length,
  roster: edge.roster?.total ?? 0,
  ready: edge.roster?.galleryReadyCount ?? 0,
}));
</script>

<template>
  <div class="stage" :class="dark ? 'dark' : 'light'">
    <div
      class="board"
      :style="{
        width: `${BOARD_W}px`,
        height: `${BOARD_H}px`,
        transform: `scale(${scale})`,
      }"
    >
      <!-- 顶栏 -->
      <header class="top">
        <div class="lhs">
          <AppLogo :size="30" />
          <span class="course">{{ title }}</span>
        </div>
        <div class="rhs">
          <div class="rec" :class="{ off: !edge.recording }">
            <span class="dot" :class="{ pulse: edge.recording }" />
            <span>{{ edge.recording ? "录制中" : edge.paused ? "已暂停" : "待上课" }}</span>
          </div>
          <span class="mono time">{{ clock(edge.elapsedSeconds) }}</span>
        </div>
      </header>

      <!-- 待机 -->
      <section v-if="screen.view === 'standby'" class="standby">
        <AppLogo :size="96" />
        <div class="sb-title">{{ title }}</div>
        <div class="sb-sub">课堂即将开始</div>
      </section>

      <!-- 课末简报 -->
      <section v-else-if="screen.view === 'brief'" class="brief">
        <div class="b-title">本节课简报</div>
        <div class="b-grid">
          <div class="b-card">
            <div class="mono b-num">{{ brief.duration }}</div>
            <div class="b-cap">上课时长</div>
          </div>
          <div class="b-card">
            <div class="mono b-num">{{ brief.cues }}</div>
            <div class="b-cap">实时提示</div>
          </div>
          <div class="b-card">
            <div class="mono b-num alarm">{{ brief.alerts }}</div>
            <div class="b-cap">安全提醒</div>
          </div>
          <div class="b-card">
            <div class="mono b-num">{{ brief.ready }}/{{ brief.roster }}</div>
            <div class="b-cap">已建档 / 应到</div>
          </div>
        </div>
        <div class="b-foot">下课后完整报告将同步至云端</div>
      </section>

      <!-- 注册镜像：让被采集的学生看到自己的姿态 -->
      <section v-else-if="screen.view === 'mirror'" class="mirror">
        <div class="m-left">
          <div class="cap">现场注册 · 姿态建档</div>
          <div class="m-title">请面向底线机站立</div>
          <div class="m-sub">系统将采集 5 帧多角度姿态，用于本节课的身份识别</div>
          <div class="m-count">
            检测到 <b>{{ edge.personCount }}</b> 人
          </div>
        </div>
        <div class="m-right">
          <EnrollSkeleton :width="220" :height="480" />
        </div>
      </section>

      <!-- 实时反馈 / 单人聚焦 -->
      <section v-else class="main">
        <div class="left">
          <div class="head">
            <div>
              <div class="cap">{{ screen.view === "focus" ? "单人聚焦" : "当前动作" }}</div>
              <div class="action" :class="{ idle: !focus?.actionType }">
                <template v-if="focus?.actionType">
                  {{ actName(focus.actionLabel, focus.actionType) }}
                  <span class="en">{{ actionEn(focus.actionType) }}</span>
                </template>
                <template v-else>等待识别</template>
              </div>
            </div>
            <div v-if="focus?.displayName" class="who">
              <span class="nm">{{ focus.displayName }}</span>
              <span class="ava">{{ initial(focus.displayName) }}</span>
            </div>
          </div>

          <SkeletonFigure
            :width="272"
            :height="344"
            :tone="dark ? 'dark' : 'light'"
            :annotation="annotation"
          />

          <div v-if="latestCue" class="hero">
            <div class="bang">!</div>
            <div>
              <div class="h-cap">检查点 · {{ cpName(latestCue.checkpointLabel, latestCue.checkpointId) }}</div>
              <div class="h-text">{{ latestCue.cueText }}</div>
            </div>
          </div>
          <div v-else class="hero muted">
            <div class="bang dim">·</div>
            <div>
              <div class="h-cap">实时反馈</div>
              <div class="h-text">等待动作识别</div>
            </div>
          </div>
        </div>

        <div class="right">
          <div class="cap">实时提示 · 最近</div>
          <div class="cues">
            <div v-for="c in edge.cues.slice(0, 4)" :key="c.eventId" class="cue">
              <span class="dot" :class="c.severity === 'POSITIVE' ? 'ok' : 'brand'" />
              <span class="mono t">{{ classClock(c.occurredAt) }}</span>
              <span class="n">{{ c.displayName }}</span>
              <span class="w">{{ cpName(c.checkpointLabel, c.checkpointId) }}</span>
            </div>
            <div v-if="!edge.cues.length" class="cue empty">暂无提示</div>
          </div>

          <div class="cap cams-cap">机位 · {{ edge.camerasTotal }}</div>
          <div class="cams">
            <div
              v-for="c in edge.cameras"
              :key="c.camId"
              class="cam"
              :class="{
                anchor: c.anchor,
                off: !c.online || !c.signal,
              }"
            >
              <span class="dot" />
              <span class="mono">{{ c.camId }} {{ c.role }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.stage {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.stage.dark {
  background: #000;
}

.stage.light {
  background: #1a1a1c;
}

.board {
  flex: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform-origin: center;
}

.dark .board {
  background: var(--dark);
  color: var(--dark-ink);
}

.light .board {
  background: var(--lite);
  color: var(--ink);
}

/* ---- 顶栏 ---- */
.top {
  height: 78px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 42px;
  border-bottom: 1px solid var(--dark-line);
}

.light .top {
  border-bottom-color: var(--lite-line);
}

.lhs {
  display: flex;
  align-items: center;
  gap: 18px;
}

.course {
  font-size: 21px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.rhs {
  display: flex;
  align-items: center;
  gap: 20px;
}

.rec {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 15px;
  font-weight: 600;
}

.rec .dot {
  width: 11px;
  height: 11px;
  background: var(--red);
}

.rec.off .dot {
  background: var(--dark-ink-6);
}

.light .rec.off .dot {
  background: var(--ink-8);
}

.time {
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

/* ---- 主区 ---- */
.main {
  flex: 1;
  display: flex;
  min-height: 0;
}

.left {
  flex: 1.65;
  padding: 38px 46px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  border-right: 1px solid var(--dark-line);
}

.light .left {
  border-right-color: var(--lite-line);
}

.head {
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cap {
  font-size: 14px;
  color: var(--dark-ink-4);
  letter-spacing: 0.06em;
  margin-bottom: 8px;
}

.light .cap {
  color: var(--ink-5);
}

.action {
  font-size: 42px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
}

/* 还没收到 actionFocus 时不要空着一行 */
.action.idle {
  font-size: 32px;
  font-weight: 600;
  color: var(--dark-ink-6);
}

.light .action.idle {
  color: var(--ink-7);
}

.en {
  color: var(--dark-ink-6);
  font-weight: 500;
  font-size: 26px;
}

.light .en {
  color: var(--ink-7);
}

.who {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--dark-2);
  border: 1px solid var(--dark-line-2);
  border-radius: 999px;
  padding: 8px 8px 8px 18px;
}

.light .who {
  background: #fff;
  border-color: #e6e6e2;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.nm {
  font-size: 17px;
  font-weight: 600;
}

.ava {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
}

.hero {
  align-self: stretch;
  background: var(--dark-2);
  border: 1px solid var(--dark-line-2);
  border-radius: 22px;
  padding: 24px 28px;
  display: flex;
  align-items: center;
  gap: 22px;
}

.light .hero {
  background: #fff;
  border-color: #edede9;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03), 0 10px 30px rgba(0, 0, 0, 0.04);
}

.bang {
  width: 56px;
  height: 56px;
  flex: none;
  border-radius: 16px;
  background: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  font-weight: 700;
  color: #fff;
}

.bang.dim {
  background: var(--dark-line-2);
  color: var(--dark-ink-5);
}

.light .bang.dim {
  background: var(--fill);
  color: var(--ink-7);
}

.h-cap {
  font-size: 15px;
  color: var(--dark-ink-3);
  margin-bottom: 6px;
}

.light .h-cap {
  color: var(--ink-4);
}

.h-text {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

/* ---- 右栏 ---- */
.right {
  flex: 1;
  padding: 34px 34px 28px;
  display: flex;
  flex-direction: column;
}

.right .cap {
  letter-spacing: 0.08em;
  margin-bottom: 20px;
}

.cues {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.cue {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--dark-1);
  border-radius: 14px;
  padding: 15px 16px;
}

.light .cue {
  background: #fff;
  border: 1px solid #edede9;
}

.cue.empty {
  justify-content: center;
  color: var(--dark-ink-5);
  font-size: 15px;
}

.light .cue.empty {
  color: var(--ink-6);
}

.cue .dot {
  width: 9px;
  height: 9px;
}

.dot.brand {
  background: var(--brand);
}

.dot.ok {
  background: var(--green);
}

.cue .t {
  font-size: 13px;
  font-weight: 500;
  color: var(--dark-ink-5);
}

.light .cue .t {
  color: var(--ink-6);
}

.cue .n {
  font-size: 16px;
  font-weight: 600;
  flex: 1;
}

.cue .w {
  font-size: 15px;
  color: var(--dark-ink-3);
}

.light .cue .w {
  color: var(--ink-4);
}

.cams-cap {
  margin: 24px 0 14px;
}

.cams {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.cam {
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--dark-1);
  border: 1px solid transparent;
  border-radius: 11px;
  padding: 11px 13px;
  font-size: 13px;
  font-weight: 500;
  color: var(--dark-ink-2);
}

.light .cam {
  background: #fff;
  border-color: #edede9;
  color: #5a5a5e;
}

.cam .dot {
  background: var(--green);
}

.cam.anchor {
  background: #1e1610;
  border-color: var(--brand);
  color: var(--brand-light);
  font-weight: 600;
}

.light .cam.anchor {
  background: var(--brand-bg);
  border-color: var(--brand);
  color: var(--brand-deep);
}

.cam.anchor .dot {
  background: var(--brand);
}

.cam.off {
  color: var(--dark-ink-4);
}

.light .cam.off {
  background: #f4f4f1;
  color: var(--ink-6);
}

.cam.off .dot {
  background: var(--dark-ink-6);
}

.light .cam.off .dot {
  background: var(--ink-8);
}

/* ---- 待机 ---- */
.standby {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
}

.sb-title {
  font-size: 48px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.sb-sub {
  font-size: 20px;
  color: var(--dark-ink-4);
}

.light .sb-sub {
  color: var(--ink-5);
}

/* ---- 简报 ---- */
.brief {
  flex: 1;
  padding: 48px 60px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 34px;
}

.b-title {
  font-size: 40px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.b-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18px;
}

.b-card {
  background: var(--dark-1);
  border-radius: 20px;
  padding: 30px 28px;
}

.light .b-card {
  background: #fff;
  border: 1px solid #edede9;
}

.b-num {
  font-size: 40px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.b-num.alarm {
  color: var(--brand);
}

.b-cap {
  font-size: 15px;
  color: var(--dark-ink-4);
  margin-top: 8px;
}

.light .b-cap {
  color: var(--ink-4);
}

.b-foot {
  font-size: 15px;
  color: var(--dark-ink-5);
}

.light .b-foot {
  color: var(--ink-6);
}

/* ---- 注册镜像 ---- */
.mirror {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 48px 60px;
  gap: 60px;
}

.m-left {
  flex: 1;
}

.m-title {
  font-size: 44px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 18px;
}

.m-sub {
  font-size: 19px;
  color: var(--dark-ink-4);
  line-height: 1.6;
}

.light .m-sub {
  color: var(--ink-4);
}

.m-count {
  margin-top: 30px;
  font-size: 20px;
  color: var(--green);
  font-weight: 600;
}

.m-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
