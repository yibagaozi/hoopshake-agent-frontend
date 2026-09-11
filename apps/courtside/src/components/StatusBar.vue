<script setup>
// 四个操作台页面共用的常驻状态条。
import { computed } from "vue";
import { useRouter } from "vue-router";
import AppLogo from "./AppLogo.vue";
import LessonPicker from "./LessonPicker.vue";
import { useAuthStore } from "@/stores/auth.js";
import { useEdgeStore } from "@/stores/edge.js";
import { clock, initial } from "@/utils/format.js";

const auth = useAuthStore();
const edge = useEdgeStore();
const router = useRouter();

/** 机位在线数不足时的告警条数 */
const warnCount = computed(() => edge.camerasDegraded.length);

const chips = computed(() => [
  {
    key: "cv",
    label: "CV",
    // 通道在线以 /local/state 为准；在线但没帧单独提示，
    // 真算法当前不发实时事件（edge-frontend-api §5），这时「无帧」是预期的
    tone: !edge.cvAlive ? "warn" : edge.poseAlive ? "ok" : "warn",
    title: !edge.cvAlive
      ? "算法通道离线"
      : edge.poseAlive
        ? "正在接收骨架帧"
        : "通道在线，但未收到骨架帧",
  },
  {
    key: "media",
    label: "录制",
    tone: edge.mediamtxReady && edge.ffmpegReady ? "ok" : "bad",
    title: !edge.mediamtxReady
      ? "流媒体服务未就绪（mediamtx）"
      : !edge.ffmpegReady
        ? "录制组件不可用（ffmpeg）"
        : "录制链路就绪",
  },
  {
    key: "cam",
    label: `机位 ${edge.camerasHealthy}/${edge.camerasTotal}`,
    tone:
      edge.camerasTotal === 0
        ? "off"
        : edge.camerasHealthy === edge.camerasTotal
          ? "ok"
          : edge.camerasHealthy === 0
            ? "bad"
            : "warn",
    title: "在线且有信号的机位数",
  },
  {
    key: "net",
    label: "网络",
    tone: edge.wsStatus === "open" ? "ok" : "bad",
    title: `实时通道 ${edge.wsStatus}`,
  },
  {
    key: "cloud",
    label: "云同步",
    tone: auth.signedIn ? "ok" : "warn",
    title: auth.signedIn ? "已登录云端" : "未登录云端",
  },
]);

function signOut() {
  auth.signOut();
  router.push("/login");
}
</script>

<template>
  <header class="bar">
    <div class="left">
      <AppLogo :size="28" />
      <LessonPicker />
      <div class="timer">
        <span class="lab">上课</span>
        <span class="mono val">{{ clock(edge.elapsedSeconds) }}</span>
      </div>
    </div>

    <div class="right">
      <button v-for="c in chips" :key="c.key" class="chip" :title="c.title">
        <span class="dot" :class="c.tone" />
        <span class="mono">{{ c.label }}</span>
      </button>

      <button v-if="warnCount" class="warn" @click="router.push('/console/record')">
        <span class="dot warn" />注意 {{ warnCount }}
      </button>

      <button class="avatar" :title="auth.displayName || '未登录'" @click="signOut">
        {{ auth.signedIn ? initial(auth.displayName) : "—" }}
      </button>
    </div>
  </header>
</template>

<style scoped>
.bar {
  height: 66px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--card);
  border-bottom: 1px solid var(--line-2);
  position: relative;
  z-index: 5;
}

.left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.right {
  display: flex;
  align-items: center;
  gap: 8px;
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
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--fill);
  border: 1px solid var(--line-2);
  border-radius: 9px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
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
.dot.off {
  background: var(--ink-8);
}

.warn {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-deep);
  background: var(--brand-bg);
  border: 1px solid var(--brand-line);
  border-radius: 9px;
  padding: 7px 12px;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--ink);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex: none;
}
</style>
