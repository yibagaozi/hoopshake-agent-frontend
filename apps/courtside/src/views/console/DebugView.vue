<script setup>
// 教师操作台 · 调试。看 WS 到底有没有推事件、推了哪些、payload 长什么样。
// 由 VITE_SHOW_WS_DEBUG 控制是否出现在导航里，联调完关掉即可。
import { computed, ref } from "vue";
import { useEdgeStore } from "@/stores/edge.js";
import { LOG_POSE_FRAMES } from "@/config/features.js";
import { hhmm } from "@/utils/format.js";

const edge = useEdgeStore();

/** 后端 WsEventType 的全部线上名，没收到过的也列出来，便于确认「一直没推」 */
const KNOWN_TYPES = [
  "poseFrame",
  "actionFocus",
  "cue",
  "safetyAlert",
  "cameraStatus",
  "sessionStatus",
  "enrollProgress",
];

const filter = ref("");
const expanded = ref(new Set());

const statusTone = computed(() => {
  if (edge.wsStatus === "open") return "ok";
  if (edge.wsStatus === "connecting" || edge.wsStatus === "reconnecting") return "warn";
  return "bad";
});

const statusText = computed(
  () =>
    ({
      open: "已连接",
      connecting: "连接中",
      reconnecting: "重连中",
      closed: "已断开",
      error: "连接错误",
    })[edge.wsStatus] || edge.wsStatus,
);

const rows = computed(() =>
  KNOWN_TYPES.map((type) => {
    const s = edge.wsStats[type];
    return {
      type,
      count: s?.count || 0,
      lastAt: s?.lastAt || 0,
      // poseFrame 默认不入日志，标注一下免得以为是丢了
      note: type === "poseFrame" && !LOG_POSE_FRAMES ? "仅计数" : "",
    };
  }),
);

/** 收到过但不在已知列表里的类型，说明前后端事件名对不上 */
const unknownTypes = computed(() =>
  Object.keys(edge.wsStats).filter((t) => !KNOWN_TYPES.includes(t)),
);

const logs = computed(() => {
  const kw = filter.value.trim().toLowerCase();
  if (!kw) return edge.wsLog;
  return edge.wsLog.filter(
    (f) =>
      f.type.toLowerCase().includes(kw) ||
      JSON.stringify(f.payload || {}).toLowerCase().includes(kw),
  );
});

const totalFrames = computed(() =>
  Object.values(edge.wsStats).reduce((n, s) => n + s.count, 0),
);

function toggle(key) {
  const next = new Set(expanded.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expanded.value = next;
}

function ago(at) {
  if (!at) return "从未";
  void edge.now;
  const s = Math.floor((Date.now() - at) / 1000);
  if (s < 1) return "刚刚";
  if (s < 60) return `${s} 秒前`;
  return `${Math.floor(s / 60)} 分前`;
}

function pretty(payload) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

/** 单行摘要，不展开也能看出个大概 */
function digest(f) {
  const p = f.payload || {};
  if (f.type === "poseFrame") return `${p.camId || "?"} · ${p.persons?.length ?? 0} 人`;
  if (f.type === "cue") return `${p.displayName || "?"} · ${p.cueText || p.checkpointId || ""}`;
  if (f.type === "safetyAlert") return `${p.displayName || "?"} · ${p.message || ""}`;
  if (f.type === "actionFocus") return `${p.displayName || "?"} · ${p.actionLabel || p.actionType || ""}`;
  if (f.type === "cameraStatus") {
    return `${p.camId} online=${p.online} signal=${p.signal} fps=${p.fps}`;
  }
  if (f.type === "sessionStatus") return `${p.state}`;
  if (f.type === "enrollProgress") return `${p.status} ${p.capturedFrames}/${p.totalFrames}`;
  return "";
}
</script>

<template>
  <div class="page">
    <!-- 左：连接与事件计数 -->
    <section class="col left">
      <div class="head">
        <span class="label">实时通道</span>
        <button class="mini" @click="edge.clearWsLog()">清空</button>
      </div>

      <div class="card conn">
        <div class="row">
          <span class="dot" :class="statusTone" />
          <span class="k">状态</span>
          <span class="v mono">{{ statusText }}</span>
        </div>
        <div class="row">
          <span class="k">通道</span>
          <span class="v mono">/ws/{{ edge.wsChannel || "—" }}</span>
        </div>
        <div class="row">
          <span class="k">累计帧</span>
          <span class="v mono">{{ totalFrames }}</span>
        </div>
        <div class="row">
          <span class="k">丢帧</span>
          <span class="v mono" :class="{ warnv: edge.wsDropped > 0 }">
            {{ edge.wsDropped }}
          </span>
        </div>
        <div class="row">
          <span class="k">会话</span>
          <span class="v mono">{{ edge.sessionState }}</span>
        </div>
      </div>

      <div class="label sub">事件类型</div>
      <div class="card types">
        <div v-for="r in rows" :key="r.type" class="trow" :class="{ mute: !r.count }">
          <span class="mono tname">{{ r.type }}</span>
          <span v-if="r.note" class="tag">{{ r.note }}</span>
          <span class="mono tcount">{{ r.count }}</span>
          <span class="tago">{{ ago(r.lastAt) }}</span>
        </div>
      </div>

      <div v-if="unknownTypes.length" class="alarm">
        收到未知事件类型：{{ unknownTypes.join("、") }}
        <div class="hint">前后端事件名可能对不上，检查 WsEventType 的 wireName</div>
      </div>

      <div v-if="!totalFrames && edge.wsStatus === 'open'" class="alarm calm">
        通道已连上，但还没收到任何事件。
        <div class="hint">
          edge 接入时只推 cameraStatus 与 sessionStatus；其余事件要等 CV 进程回调
          /internal/cv/events 才会有。
        </div>
      </div>
    </section>

    <!-- 右：原始帧日志 -->
    <section class="col right">
      <div class="head">
        <span class="label">原始帧 · 最新 {{ edge.wsLog.length }} 条</span>
        <input v-model="filter" class="search" placeholder="按类型或内容过滤" />
      </div>

      <div class="list">
        <div
          v-for="(f, i) in logs"
          :key="`${f.seq}-${i}`"
          class="frame"
          @click="toggle(`${f.seq}-${i}`)"
        >
          <div class="fhead">
            <span class="mono fseq">#{{ f.seq ?? "—" }}</span>
            <span class="mono ftype">{{ f.type }}</span>
            <span class="fdigest">{{ digest(f) }}</span>
            <span class="mono ftime">{{ hhmm(f.ts) }}</span>
          </div>
          <pre v-if="expanded.has(`${f.seq}-${i}`)" class="mono fbody">{{ pretty(f.payload) }}</pre>
        </div>

        <div v-if="!logs.length" class="empty">
          {{ edge.wsLog.length ? "没有匹配的帧" : "暂无事件" }}
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

.col {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.left {
  flex: 1;
}

.right {
  flex: 1.3;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 12px;
}

.label {
  font-size: 14px;
  color: var(--ink-5);
  letter-spacing: 0.06em;
}

.label.sub {
  margin: 18px 0 10px;
}

.mini {
  border: 1px solid var(--line-3);
  background: var(--card);
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
  border-radius: 9px;
  padding: 6px 11px;
}

.search {
  flex: 1;
  max-width: 220px;
  height: 34px;
  border: 1px solid var(--line-3);
  border-radius: 10px;
  background: var(--card);
  padding: 0 12px;
  font-size: 13px;
  outline: none;
}

.search:focus {
  border-color: var(--brand);
}

.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 6px 16px;
}

.conn .row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}

.conn .row:last-child {
  border-bottom: none;
}

.k {
  font-size: 13px;
  color: var(--ink-4);
  flex: 1;
}

.v {
  font-size: 13px;
  font-weight: 600;
}

.v.warnv {
  color: var(--brand-deep);
}

.dot.ok {
  background: var(--green);
}
.dot.warn {
  background: var(--brand);
}
.dot.bad {
  background: var(--red);
}

.types {
  padding: 6px 16px;
  overflow-y: auto;
}

.trow {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 0;
  border-bottom: 1px solid var(--line);
}

.trow:last-child {
  border-bottom: none;
}

.trow.mute .tname,
.trow.mute .tcount {
  color: var(--ink-7);
}

.tname {
  font-size: 13px;
  font-weight: 600;
  flex: 1;
}

.tag {
  font-size: 11px;
  color: var(--ink-6);
  background: var(--fill);
  border-radius: 6px;
  padding: 2px 6px;
}

.tcount {
  font-size: 13px;
  font-weight: 700;
  width: 52px;
  text-align: right;
}

.tago {
  font-size: 12px;
  color: var(--ink-6);
  width: 60px;
  text-align: right;
}

.alarm {
  margin-top: 14px;
  background: var(--brand-bg-2);
  border: 1px solid var(--brand-line);
  border-radius: 13px;
  padding: 12px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-deep);
}

.alarm.calm {
  background: var(--card-2);
  border-color: var(--line);
  color: var(--ink-4);
}

.hint {
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-5);
  margin-top: 5px;
  line-height: 1.55;
}

.list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 7px;
  overflow-y: auto;
  padding-right: 4px;
}

.frame {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 11px;
  padding: 10px 13px;
  cursor: pointer;
}

.frame:hover {
  border-color: var(--line-3);
}

.fhead {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fseq {
  font-size: 12px;
  color: var(--ink-6);
  width: 52px;
  flex: none;
}

.ftype {
  font-size: 12px;
  font-weight: 700;
  color: var(--brand-deep);
  width: 104px;
  flex: none;
}

.fdigest {
  flex: 1;
  font-size: 13px;
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ftime {
  font-size: 12px;
  color: var(--ink-6);
  flex: none;
}

.fbody {
  margin-top: 9px;
  padding: 10px 12px;
  background: var(--card-2);
  border: 1px solid var(--line);
  border-radius: 9px;
  font-size: 12px;
  line-height: 1.55;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
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
