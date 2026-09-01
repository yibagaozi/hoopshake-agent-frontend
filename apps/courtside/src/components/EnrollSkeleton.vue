<script setup>
// 现场注册预览里的站立姿态骨架，静态示意图。
defineProps({
  width: { type: Number, default: 130 },
  height: { type: Number, default: 300 },
});
</script>

<template>
  <svg class="skeleton" :width="width" :height="height" viewBox="0 0 160 380" fill="none">
    <g stroke="#2FB170" stroke-width="4.5" stroke-linecap="round">
      <line x1="80" y1="96" x2="80" y2="58" />
      <line x1="48" y1="96" x2="112" y2="96" />
      <line x1="48" y1="96" x2="56" y2="200" />
      <line x1="112" y1="96" x2="104" y2="200" />
      <line x1="56" y1="200" x2="104" y2="200" />
      <line x1="48" y1="96" x2="30" y2="158" />
      <line x1="30" y1="158" x2="26" y2="214" />
      <line x1="112" y1="96" x2="130" y2="158" />
      <line x1="130" y1="158" x2="134" y2="214" />
      <line x1="56" y1="200" x2="50" y2="290" />
      <line x1="50" y1="290" x2="46" y2="366" />
      <line x1="104" y1="200" x2="110" y2="290" />
      <line x1="110" y1="290" x2="114" y2="366" />
    </g>
    <circle cx="80" cy="42" r="16" stroke="#2FB170" stroke-width="4.5" />
    <g fill="#2FB170">
      <circle cx="80" cy="96" r="4.5" />
      <circle cx="48" cy="96" r="4.5" />
      <circle cx="112" cy="96" r="4.5" />
      <circle cx="30" cy="158" r="4.5" />
      <circle cx="26" cy="214" r="4.5" />
      <circle cx="130" cy="158" r="4.5" />
      <circle cx="134" cy="214" r="4.5" />
      <circle cx="56" cy="200" r="4.5" />
      <circle cx="104" cy="200" r="4.5" />
      <circle cx="50" cy="290" r="4.5" />
      <circle cx="46" cy="366" r="4.5" />
      <circle cx="110" cy="290" r="4.5" />
      <circle cx="114" cy="366" r="4.5" />
    </g>
  </svg>
</template>

<style scoped>
/* 父级是 flex 容器，不加会被压扁 */
.skeleton {
  flex: none;
  display: block;
}
</style>
