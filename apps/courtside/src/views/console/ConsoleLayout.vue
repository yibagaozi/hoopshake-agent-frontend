<script setup>
// 操作台外壳：常驻状态条 + 内容区 + 底部导航。edge 连接在这里建立，四个子页共用。
import { onMounted, onUnmounted } from "vue";
import StatusBar from "@/components/StatusBar.vue";
import DockNav from "@/components/DockNav.vue";
import { useEdgeStore } from "@/stores/edge.js";
import { useScreenStore } from "@/stores/screen.js";

const edge = useEdgeStore();
const screen = useScreenStore();

onMounted(() => {
  edge.connect("console");
  edge.refreshRoster();
  screen.listenAsConsole();
});

onUnmounted(() => edge.disconnect());
</script>

<template>
  <div class="shell">
    <StatusBar />

    <div v-if="edge.lastError" class="banner">
      {{ edge.lastError }}
    </div>

    <main class="body">
      <RouterView />
    </main>

    <DockNav />
  </div>
</template>

<style scoped>
.shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--page);
  position: relative;
  overflow: hidden;
}

.banner {
  flex: none;
  background: var(--red-bg-2);
  border-bottom: 1px solid var(--red-line);
  color: var(--red-deep);
  font-size: 13px;
  font-weight: 600;
  padding: 9px 24px;
}

.body {
  flex: 1;
  position: relative;
  min-height: 0;
}
</style>
