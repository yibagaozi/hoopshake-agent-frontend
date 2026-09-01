<script setup>
// 投篮姿态骨架示意图。当前阶段为静态图，后续接 WS poseFrame 后改为按关键点绘制。
// tone 控制配色：dark 用于大屏深色档，light 用于大屏浅色档与操作台。
const props = defineProps({
  width: { type: Number, default: 272 },
  height: { type: Number, default: 344 },
  tone: { type: String, default: "light" },
  /** 高亮标注文案，来自 cue 的 measured 字段 */
  annotation: { type: String, default: "" },
});

const colors = {
  dark: { bone: "#34343b", head: "#5a5a62", joint: "#6e6e76" },
  light: { bone: "#d4d4ce", head: "#bebeb8", joint: "#b0b0aa" },
};

const c = () => colors[props.tone] || colors.light;
</script>

<template>
  <div class="figure">
    <svg :width="width" :height="height" viewBox="0 0 300 380" fill="none">
      <!-- 躯干与四肢 -->
      <g :stroke="c().bone" stroke-width="5" stroke-linecap="round">
        <line x1="150" y1="100" x2="150" y2="66" />
        <line x1="112" y1="100" x2="188" y2="100" />
        <line x1="112" y1="100" x2="126" y2="206" />
        <line x1="188" y1="100" x2="174" y2="206" />
        <line x1="126" y1="206" x2="174" y2="206" />
        <line x1="112" y1="100" x2="96" y2="150" />
        <line x1="96" y1="150" x2="104" y2="196" />
        <line x1="126" y1="206" x2="120" y2="286" />
        <line x1="120" y1="286" x2="116" y2="356" />
        <line x1="174" y1="206" x2="180" y2="286" />
        <line x1="180" y1="286" x2="184" y2="356" />
      </g>

      <!-- 出手侧手臂，橙色高亮 -->
      <g stroke="#FF6A2C" stroke-width="6" stroke-linecap="round">
        <line x1="188" y1="100" x2="208" y2="66" />
        <line x1="208" y1="66" x2="196" y2="32" />
      </g>

      <circle cx="150" cy="50" r="16" :stroke="c().head" stroke-width="5" />
      <!-- 球 -->
      <circle cx="196" cy="26" r="19" stroke="#FF6A2C" stroke-width="4" />

      <!-- 关节点 -->
      <g :fill="c().joint">
        <circle cx="150" cy="100" r="5" />
        <circle cx="112" cy="100" r="5" />
        <circle cx="188" cy="100" r="5" />
        <circle cx="96" cy="150" r="5" />
        <circle cx="104" cy="196" r="5" />
        <circle cx="126" cy="206" r="5" />
        <circle cx="174" cy="206" r="5" />
        <circle cx="120" cy="286" r="5" />
        <circle cx="116" cy="356" r="5" />
        <circle cx="180" cy="286" r="5" />
        <circle cx="184" cy="356" r="5" />
        <circle cx="196" cy="32" r="5" />
      </g>

      <!-- 被检查的肘关节 -->
      <circle
        cx="208"
        cy="66"
        r="16"
        fill="none"
        stroke="#FF6A2C"
        stroke-width="2.5"
        opacity="0.55"
      />
      <circle cx="208" cy="66" r="9" fill="#FF6A2C" />
    </svg>

    <div v-if="annotation" class="tag mono" :class="tone">{{ annotation }}</div>
  </div>
</template>

<style scoped>
.figure {
  position: relative;
  align-self: center;
  /* 父级是 flex 容器，不加会被压扁 */
  flex: none;
}

.figure svg {
  display: block;
}

.tag {
  position: absolute;
  top: 12%;
  left: 78%;
  white-space: nowrap;
  font-weight: 600;
  font-size: 13px;
  line-height: 1;
  color: var(--brand);
  border: 1px solid var(--brand);
  border-radius: 8px;
  padding: 6px 9px;
  background: rgba(255, 106, 44, 0.08);
}

.tag.light {
  color: var(--brand-deep);
  background: var(--brand-bg);
}
</style>
