<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { toasts } from './toast.js'
import RailNav from './components/RailNav.vue'

const route = useRoute()
const showRail = computed(() => !route.meta.public)
</script>

<template>
  <div class="shell">
    <RailNav v-if="showRail" />
    <router-view />
    <div class="hs-toast-wrap">
      <div v-for="t in toasts" :key="t.id" class="hs-toast" :class="t.type">{{ t.text }}</div>
    </div>
  </div>
</template>
