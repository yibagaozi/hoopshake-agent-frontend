<script setup>
defineProps({
  open: Boolean,
  title: { type: String, default: '' },
})
const emit = defineEmits(['close'])
</script>

<template>
  <teleport to="body">
    <transition name="sheet">
      <div v-if="open" class="sheet-mask" @click.self="emit('close')">
        <div class="sheet">
          <div class="grabber"></div>
          <div v-if="title" class="sheet-title">{{ title }}</div>
          <div class="sheet-body">
            <slot />
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<style scoped>
.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(20, 20, 22, 0.45);
  z-index: 60;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet {
  width: 100%;
  max-width: 430px;
  max-height: 76vh;
  background: var(--page);
  border-radius: 28px 28px 0 0;
  padding: 10px 18px calc(env(safe-area-inset-bottom, 0px) + 18px);
  display: flex;
  flex-direction: column;
}
.grabber {
  width: 40px;
  height: 5px;
  border-radius: 99px;
  background: #d6d6d1;
  margin: 4px auto 10px;
  flex: none;
}
.sheet-title {
  font-size: 17px;
  font-weight: 700;
  text-align: center;
  padding: 4px 0 12px;
  flex: none;
}
.sheet-body {
  overflow-y: auto;
  scrollbar-width: none;
}
.sheet-body::-webkit-scrollbar {
  display: none;
}
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.22s ease;
}
.sheet-enter-active .sheet,
.sheet-leave-active .sheet {
  transition: transform 0.24s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .sheet,
.sheet-leave-to .sheet {
  transform: translateY(40%);
}
</style>
