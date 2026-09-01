<script setup>
// 教师操作台 · 录制。录制独立于上课，可单独起停；右侧列今日已落盘的记录。
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useEdgeStore } from "@/stores/edge.js";
import * as edgeApi from "@/api/edge.js";
import { clock, hhmm, shortClock } from "@/utils/format.js";

const edge = useEdgeStore();

const busy = ref(false);
const message = ref("");
const today = ref(null);
let refresher = null;
let settler = null;

/**
 * 开录后的缓冲期。
 *
 * 各路 ffmpeg 是异步拉起的，edge 在进程 fork 出来之前把机位报成 FAILED
 * （见 RecordServiceImpl.camerasOf，只判断 alive 与否）。缓冲期内一律按
 * 「启动中」显示，到期仍是 FAILED 才算真失败。
 */
const SETTLE_MS = 8000;
const settleUntil = ref(0);

const settling = computed(() => {
  void edge.now; // 跟着 store 的秒级心跳重算
  return Date.now() < settleUntil.value;
});

const recording = computed(() => edge.record?.state === "RECORDING");
const stopping = computed(() => edge.record?.state === "STOPPING");

const failedCameras = computed(() =>
  (edge.record?.cameras || []).filter((c) => c.state === "FAILED"),
);

/** 录制中优先显示逐机位录制状态，空闲时退回机位在线情况 */
const cameraRows = computed(() => {
  const live = edge.record?.cameras || [];
  return edge.cameras.map((cam, i) => {
    const hit = live.find((c) => c.cameraId === cam.camId);
    const label = `机位 ${i + 1} ${cam.role || cam.camId}`;
    if (hit) {
      const map = {
        RECORDING: { text: "录制中", tone: cam.anchor ? "anchor" : "rec" },
        RESTARTING: { text: "重连中", tone: "anchor" },
        FAILED: settling.value
          ? { text: "启动中", tone: "anchor" }
          : { text: hit.error || "失败", tone: "fail" },
      };
      const s = map[hit.state] || { text: hit.state, tone: "idle" };
      return { key: cam.camId, label, ...s };
    }
    if (!cam.online) return { key: cam.camId, label, text: "断流", tone: "fail" };
    if (!cam.signal) return { key: cam.camId, label, text: "黑屏", tone: "anchor" };
    return { key: cam.camId, label, text: "就绪", tone: "idle" };
  });
});

const records = computed(() => today.value?.records || []);

const summary = computed(() => {
  if (!records.value.length) return "暂无记录";
  const cams = records.value[0]?.cameraCount ?? 0;
  return `${records.value.length} 段 · 每段 ${cams} 机位`;
});

/** 目录名尾段，列表里显示比全路径清爽 */
function dirTail(path) {
  if (!path) return "";
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return `/${parts.slice(-2).join("/")}`;
}

function fmtDuration(seconds) {
  return seconds >= 3600 ? clock(seconds) : shortClock(seconds);
}

async function loadToday() {
  try {
    today.value = await edgeApi.getTodayRecordings();
  } catch (e) {
    message.value = e.message;
  }
}

/** 缓冲期内每秒对账一次，到期再判定有没有真失败的机位 */
function watchSettle() {
  clearInterval(settler);
  settler = setInterval(async () => {
    await edge.refreshRecord();
    if (Date.now() < settleUntil.value) return;

    clearInterval(settler);
    settler = null;

    const failed = failedCameras.value;
    message.value = failed.length
      ? `降级录制：${failed.map((c) => c.cameraId).join("、")} 未能启动，已跳过`
      : "";
    await loadToday();
  }, 1000);
}

async function toggle() {
  busy.value = true;
  message.value = "";
  try {
    if (recording.value) {
      clearInterval(settler);
      settler = null;
      settleUntil.value = 0;
      const r = await edgeApi.stopRecord();
      message.value = `已结束，时长 ${fmtDuration(r.durationSeconds)}，落盘 ${r.files?.length ?? 0} 个文件`;
      await edge.refreshRecord();
      await loadToday();
    } else {
      // start 响应里的逐机位状态是瞬时快照，不据此告警，交给缓冲期判定
      await edgeApi.startRecord();
      settleUntil.value = Date.now() + SETTLE_MS;
      message.value = "正在拉起各机位录制进程…";
      await edge.refreshRecord();
      watchSettle();
    }
  } catch (e) {
    message.value = e.message;
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  loadToday();
  refresher = setInterval(loadToday, 15000);
});

onUnmounted(() => {
  clearInterval(refresher);
  clearInterval(settler);
});
</script>

<template>
  <div class="page">
    <!-- 左：录制主控 -->
    <section class="card control">
      <div class="label">录制控制 · 独立于上课</div>

      <div class="center">
        <div class="state" :class="{ live: recording }">
          <span class="dot" :class="{ pulse: recording }" />
          {{ recording ? "正在录制" : stopping ? "收尾中" : "未在录制" }}
        </div>

        <div class="mono big">{{ clock(edge.recordElapsed) }}</div>

        <button
          class="knob"
          :class="{ live: recording }"
          :disabled="busy || stopping"
          @click="toggle"
        >
          <span class="glyph" :class="recording ? 'square' : 'circle'" />
          <span class="cap">{{ recording ? "结束录制" : "开始录制" }}</span>
        </button>
      </div>

      <div class="cams">
        <div v-for="c in cameraRows" :key="c.key" class="cam" :class="c.tone">
          <span class="dot" :class="{ pulse: c.tone === 'rec' || c.tone === 'anchor' }" />
          <span class="mono">{{ c.label }} · {{ c.text }}</span>
        </div>
      </div>
    </section>

    <!-- 右：今日录制 -->
    <section class="today">
      <div class="head">
        <span class="label">今日录制</span>
        <span class="sum">{{ summary }}</span>
      </div>

      <div
        v-if="message"
        class="note"
        :class="{ calm: settling }"
        title="点击关闭"
        @click="message = ''"
      >
        {{ message }}
      </div>

      <div class="list">
        <div v-for="r in records" :key="r.recordingId" class="item">
          <span class="icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="6" width="13" height="12" rx="2" stroke="currentColor" stroke-width="1.8" />
              <path d="M16 10l5-3v10l-5-3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
            </svg>
          </span>

          <div class="meta">
            <div class="mono ttl">{{ r.recordingId }}</div>
            <div class="mono sub">
              {{ hhmm(r.startedAt) }} 起 · {{ dirTail(r.outputDir) }}
            </div>
          </div>

          <span class="ccount">{{ r.cameraCount }} 机位</span>

          <span v-if="r.recording" class="live-tag mono">
            <span class="dot pulse" />录制中
          </span>
          <span v-else class="mono dur">{{ fmtDuration(r.durationSeconds) }}</span>
        </div>

        <div v-if="!records.length" class="empty">今天还没有录制记录</div>
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

/* ---- 左 ---- */
.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 22px;
  box-shadow: var(--shadow-card);
}

.control {
  flex: 1;
  padding: 28px 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.control > .label {
  align-self: flex-start;
  margin-bottom: 6px;
}

.center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
}

.state {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--mono);
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-5);
  letter-spacing: 0.04em;
}

.state .dot {
  width: 11px;
  height: 11px;
  background: var(--ink-8);
}

.state.live {
  color: var(--red);
}

.state.live .dot {
  background: var(--red);
}

.big {
  font-size: 56px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
}

.knob {
  width: 170px;
  height: 170px;
  border-radius: 50%;
  background: var(--green);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 13px;
  color: #fff;
  transition: transform 0.12s ease;
}

.knob:hover:not(:disabled) {
  transform: scale(1.02);
}

.knob.live {
  background: var(--red);
}

.glyph {
  width: 52px;
  height: 52px;
  background: #fff;
}

.glyph.square {
  border-radius: 14px;
}

.glyph.circle {
  border-radius: 50%;
}

.cap {
  font-size: 21px;
  font-weight: 700;
}

.cams {
  align-self: stretch;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

.cam {
  display: flex;
  align-items: center;
  gap: 9px;
  border-radius: 11px;
  padding: 11px 13px;
  font-size: 12px;
  font-weight: 600;
  background: var(--card-2);
  border: 1px solid var(--line);
  color: var(--ink-2);
}

.cam .dot {
  background: var(--ink-8);
}

.cam.rec .dot {
  background: var(--red);
}

.cam.anchor {
  background: var(--brand-bg);
  border-color: var(--brand-line);
  color: var(--brand-deep);
}

.cam.anchor .dot {
  background: var(--brand);
}

.cam.fail {
  background: var(--red-bg-2);
  border-color: var(--red-line);
  color: var(--red-deep);
}

.cam.fail .dot {
  background: var(--red);
}

/* ---- 右 ---- */
.today {
  flex: 1.15;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.sum {
  font-size: 13px;
  color: var(--ink-4);
}

.note {
  background: var(--brand-bg-2);
  border: 1px solid var(--brand-line);
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-deep);
  margin-bottom: 12px;
  cursor: pointer;
}

/* 缓冲期的「正在拉起」是中性提示，不用橙色告警配色 */
.note.calm {
  background: var(--card-2);
  border-color: var(--line);
  color: var(--ink-4);
}

.list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding-right: 4px;
}

.item {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 13px;
  padding: 13px 16px;
}

.icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--fill);
  color: var(--ink-4);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.meta {
  flex: 1;
  min-width: 0;
}

.ttl {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub {
  font-size: 12px;
  color: var(--ink-6);
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ccount {
  font-size: 13px;
  color: var(--ink-4);
  flex: none;
}

.dur {
  width: 60px;
  text-align: right;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-2);
  flex: none;
}

.live-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--red);
  flex: none;
}

.live-tag .dot {
  background: var(--red);
}

.empty {
  background: var(--card);
  border: 1px dashed var(--line-3);
  border-radius: 13px;
  padding: 24px;
  text-align: center;
  color: var(--ink-5);
  font-size: 14px;
}
</style>
