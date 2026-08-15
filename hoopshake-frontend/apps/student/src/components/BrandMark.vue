<script setup>
defineProps({
  size: { type: Number, default: 44 },
  radius: { type: Number, default: 14 },
})
</script>

<template>
  <div
    class="brand-mark"
    :style="{ width: size + 'px', height: size + 'px', borderRadius: radius + 'px' }"
  >
    <div class="ring" :style="{ width: size * 0.43 + 'px', height: size * 0.43 + 'px' }"></div>
  </div>
</template>

<style scoped>
.brand-mark {
  background: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.ring {
  border-radius: 50%;
  border: 2.5px solid #fff;
}
</style>
