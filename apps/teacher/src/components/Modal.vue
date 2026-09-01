<script setup>
defineProps({
  open: Boolean,
  title: { type: String, default: '' },
  width: { type: Number, default: 560 },
})
const emit = defineEmits(['close'])
</script>

<template>
  <teleport to="body">
    <div v-if="open" class="modal-mask" @click.self="emit('close')">
      <div class="modal" :style="{ width: width + 'px' }">
        <div class="modal-head">
          <span class="modal-title">{{ title }}</span>
          <button class="modal-x" @click="emit('close')">✕</button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
        <div v-if="$slots.foot" class="modal-foot">
          <slot name="foot" />
        </div>
      </div>
    </div>
  </teleport>
</template>
