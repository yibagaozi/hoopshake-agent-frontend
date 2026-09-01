<script setup>
// 底部悬浮导航。调试页只在 VITE_SHOW_WS_DEBUG 打开时出现。
import { SHOW_WS_DEBUG } from "@/config/features.js";

const items = [
  { to: "/console/live", label: "上课", icon: "play" },
  { to: "/console/roster", label: "名单", icon: "list" },
  { to: "/console/enroll", label: "注册", icon: "user" },
  { to: "/console/record", label: "录制", icon: "rec" },
  ...(SHOW_WS_DEBUG ? [{ to: "/console/debug", label: "调试", icon: "bug" }] : []),
];
</script>

<template>
  <nav class="dock">
    <RouterLink v-for="it in items" :key="it.to" :to="it.to" class="tab" active-class="on">
      <svg v-if="it.icon === 'play'" width="19" height="19" viewBox="0 0 24 24" fill="none">
        <polygon points="7 4 20 12 7 20" fill="currentColor" />
      </svg>

      <svg
        v-else-if="it.icon === 'list'"
        width="19" height="19" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round"
      >
        <line x1="8" y1="6" x2="20" y2="6" />
        <line x1="8" y1="12" x2="20" y2="12" />
        <line x1="8" y1="18" x2="20" y2="18" />
        <circle cx="4" cy="6" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none" />
      </svg>

      <svg
        v-else-if="it.icon === 'user'"
        width="19" height="19" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      >
        <circle cx="9" cy="8" r="3.4" />
        <path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        <line x1="18.5" y1="7" x2="18.5" y2="13" />
        <line x1="15.5" y1="10" x2="21.5" y2="10" />
      </svg>

      <svg
        v-else-if="it.icon === 'rec'"
        width="19" height="19" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2"
      >
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
      </svg>

      <svg
        v-else width="19" height="19" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round"
      >
        <path d="M9 4v3M15 4v3M6 10h12v5a6 6 0 01-12 0z" />
        <line x1="3" y1="13" x2="6" y2="13" />
        <line x1="18" y1="13" x2="21" y2="13" />
      </svg>

      <span>{{ it.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.dock {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 22px;
  height: 66px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 33px;
  box-shadow: var(--shadow-dock);
  display: flex;
  align-items: center;
  padding: 8px;
  gap: 6px;
  z-index: 10;
}

.tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 50px;
  padding: 0 22px;
  border-radius: 25px;
  color: var(--ink-5);
  font-size: 14px;
  font-weight: 600;
  transition: background 0.15s ease, color 0.15s ease;
}

.tab:hover {
  color: var(--ink-2);
}

.tab.on {
  background: var(--brand);
  color: #fff;
}
</style>
