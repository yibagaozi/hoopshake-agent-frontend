<script setup>
import { toasts } from './toast.js'
</script>

<template>
  <div class="phone-viewport">
    <router-view v-slot="{ Component }">
      <component :is="Component" />
    </router-view>
    <div class="hs-toast-wrap">
      <div v-for="t in toasts" :key="t.id" class="hs-toast" :class="t.type">{{ t.text }}</div>
    </div>
  </div>
</template>
