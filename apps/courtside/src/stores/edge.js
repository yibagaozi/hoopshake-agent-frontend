// 场边状态中枢：REST 取全量快照，WS 打增量补丁，大屏与操作台共用同一份数据。

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import * as edgeApi from "@/api/edge.js";
import { openWs } from "@/composables/useWs.js";
import { LOG_POSE_FRAMES } from "@/config/features.js";
import { since } from "@/utils/format.js";

const CUE_LIMIT = 12;
const ALERT_LIMIT = 8;
/** 超过这个毫秒数没收到骨架帧就认为 CV 停了 */
const POSE_STALE_MS = 4000;
/** WS 原始帧日志上限，供调试页查看 */
const WS_LOG_LIMIT = 200;

export const useEdgeStore = defineStore("edge", () => {
  /* ---------- 快照数据 ---------- */
  const edgeId = ref("");
  const lesson = ref(null);
  const session = ref(null);
  const cameras = ref([]);
  const capture = ref(null);
  const disk = ref(null);
  const roster = ref(null);
  const record = ref(null);

  /* ---------- 实时数据 ---------- */
  const actionFocus = ref(null);
  const cues = ref([]);
  const alerts = ref([]);
  const lastPoseAt = ref(0);
  const personCount = ref(0);
  const enrollEvent = ref(null);

  /* ---------- 连接与错误 ---------- */
  const wsStatus = ref("closed");
  const lastError = ref("");
  /** 每秒推进一次，供计时器求值 */
  const now = ref(Date.now());

  /* ---------- WS 观测，调试页用 ---------- */
  /** 原始帧日志，倒序；高频的 poseFrame 默认不入日志只计数 */
  const wsLog = ref([]);
  /** 按事件类型计数：{ [type]: { count, lastAt } } */
  const wsStats = ref({});
  const wsChannel = ref("");
  /** 服务端 seq 跳变累计，非 0 说明有丢帧 */
  const wsDropped = ref(0);

  let socket = null;
  let ticker = null;
  let poller = null;

  /* ---------- 派生 ---------- */

  const sessionState = computed(() => session.value?.state || "IDLE");
  const recording = computed(() => sessionState.value === "RECORDING");
  const paused = computed(() => sessionState.value === "PAUSED");
  const hasLesson = computed(() => !!lesson.value?.lessonId);

  /** 上课计时，从 startedAt 起算；暂停时按接口约定继续走 */
  const elapsedSeconds = computed(() => {
    void now.value;
    const startedAt = session.value?.startedAt;
    if (!startedAt) return 0;
    const end = session.value?.endedAt;
    return end
      ? Math.max(0, (Date.parse(end) - Date.parse(startedAt)) / 1000)
      : since(startedAt);
  });

  /** 录制计时，独立于上课 */
  const recordElapsed = computed(() => {
    void now.value;
    return record.value?.startedAt ? since(record.value.startedAt) : 0;
  });

  /** 机位正常数 = 在线且有信号 */
  const camerasHealthy = computed(
    () => cameras.value.filter((c) => c.online && c.signal).length,
  );

  const camerasTotal = computed(() => cameras.value.length);

  /** 有帧但黑屏 / 断流的机位，顶部要显著提示 */
  const camerasDegraded = computed(() =>
    cameras.value.filter((c) => !c.online || !c.signal),
  );

  /** CV 是否在推帧。后端暂未提供 /local/cv/status，用骨架帧活性代替 */
  const cvAlive = computed(() => {
    void now.value;
    return lastPoseAt.value > 0 && Date.now() - lastPoseAt.value < POSE_STALE_MS;
  });

  const anchorCamera = computed(
    () => cameras.value.find((c) => c.anchor) || cameras.value[0] || null,
  );

  /* ---------- 拉取 ---------- */

  /** 全量对账，首屏、轮询兜底与 WS 重连后都调它 */
  async function refresh() {
    try {
      const s = await edgeApi.getState();
      edgeId.value = s.edgeId;
      lesson.value = s.lesson?.lessonId ? s.lesson : null;
      session.value = s.session;
      cameras.value = s.cameras || [];
      capture.value = s.capture;
      disk.value = s.disk;
      lastError.value = "";
    } catch (e) {
      lastError.value = e.message;
    }
  }

  async function refreshRoster() {
    try {
      roster.value = await edgeApi.getRoster();
    } catch {
      // 未选课时无名单，静默
    }
  }

  async function refreshRecord() {
    try {
      record.value = await edgeApi.getRecordStatus();
    } catch {
      // 录制模块不可用时不阻断其他面板
    }
  }

  /* ---------- WS ---------- */

  let lastSeq = -1;

  /** 记录原始帧，只服务调试页，不参与业务渲染 */
  function observe(type, payload, frame) {
    const at = Date.now();

    const prev = wsStats.value[type];
    wsStats.value = {
      ...wsStats.value,
      [type]: { count: (prev?.count || 0) + 1, lastAt: at },
    };

    if (frame?.seq != null) {
      if (lastSeq >= 0 && frame.seq > lastSeq + 1) {
        wsDropped.value += frame.seq - lastSeq - 1;
      }
      lastSeq = frame.seq;
    }

    if (type === "poseFrame" && !LOG_POSE_FRAMES) return;

    wsLog.value = [
      { seq: frame?.seq, type, ts: frame?.ts, at, payload },
      ...wsLog.value,
    ].slice(0, WS_LOG_LIMIT);
  }

  function clearWsLog() {
    wsLog.value = [];
    wsStats.value = {};
    wsDropped.value = 0;
  }

  function applyEvent(type, payload) {
    switch (type) {
      case "poseFrame":
        lastPoseAt.value = Date.now();
        personCount.value = payload?.persons?.length || 0;
        break;

      case "actionFocus":
        actionFocus.value = payload;
        break;

      case "cue":
        cues.value = [payload, ...cues.value].slice(0, CUE_LIMIT);
        break;

      case "safetyAlert":
        alerts.value = [payload, ...alerts.value].slice(0, ALERT_LIMIT);
        break;

      case "cameraStatus": {
        const i = cameras.value.findIndex((c) => c.camId === payload.camId);
        if (i >= 0) cameras.value[i] = { ...cameras.value[i], ...payload };
        else cameras.value = [...cameras.value, payload];
        break;
      }

      case "sessionStatus":
        // WS 只带状态跃迁，startedAt 等字段仍以 REST 快照为准
        session.value = { ...(session.value || {}), ...payload };
        if (payload.state === "ENDED" || payload.state === "IDLE") {
          actionFocus.value = null;
        }
        break;

      case "enrollProgress":
        enrollEvent.value = payload;
        break;

      default:
        break;
    }
  }

  /**
   * 接入实时通道。
   * @param {"display"|"console"|"registration"} channel
   */
  function connect(channel = "console") {
    if (socket) return;
    wsChannel.value = channel;

    socket = openWs(channel, {
      onMessage: (type, payload, frame) => {
        observe(type, payload, frame);
        applyEvent(type, payload);
      },
      onStatus: (s) => (wsStatus.value = s),
      onReopen: refresh,
    });

    ticker = setInterval(() => (now.value = Date.now()), 1000);

    // WS 不覆盖课程 / 磁盘 / 录制 / 名单，这些靠轮询兜底
    poller = setInterval(() => {
      refresh();
      refreshRecord();
      refreshRoster();
    }, 10000);

    refresh();
    refreshRecord();
    refreshRoster();
  }

  function disconnect() {
    socket?.close();
    socket = null;
    clearInterval(ticker);
    clearInterval(poller);
    ticker = null;
    poller = null;
  }

  /* ---------- 课堂控制 ---------- */

  async function selectLesson(payload) {
    const res = await edgeApi.selectLesson(payload);
    await refresh();
    await refreshRoster();
    return res;
  }

  async function start() {
    const res = await edgeApi.startSession(lesson.value?.lessonId);
    session.value = res;
    await refresh();
    return res;
  }

  async function pause() {
    session.value = await edgeApi.pauseSession();
  }

  async function resume() {
    session.value = await edgeApi.resumeSession();
  }

  async function stop() {
    const res = await edgeApi.stopSession();
    await refresh();
    return res;
  }

  return {
    edgeId, lesson, session, cameras, capture, disk, roster, record,
    actionFocus, cues, alerts, personCount, enrollEvent,
    wsStatus, lastError, now,
    wsLog, wsStats, wsChannel, wsDropped, clearWsLog,
    sessionState, recording, paused, hasLesson,
    elapsedSeconds, recordElapsed,
    camerasHealthy, camerasTotal, camerasDegraded, cvAlive, anchorCamera,
    refresh, refreshRoster, refreshRecord,
    connect, disconnect,
    selectLesson, start, pause, resume, stop,
  };
});
