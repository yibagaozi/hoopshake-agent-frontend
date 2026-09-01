<script setup>
// 品牌标记：橙色圆角方块内嵌白色圆环
defineProps({
  size: { type: Number, default: 28 },
});
</script>

<template>
  <div
    class="logo"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: `${size * 0.29}px`,
    }"
  >
    <div
      class="ring"
      :style="{
        width: `${size * 0.4}px`,
        height: `${size * 0.4}px`,
        borderWidth: `${Math.max(2, size * 0.07)}px`,
      }"
    />
  </div>
</template>

<style scoped>
.logo {
  background: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.ring {
  border-radius: 50%;
  border-style: solid;
  border-color: #fff;
}
</style>
