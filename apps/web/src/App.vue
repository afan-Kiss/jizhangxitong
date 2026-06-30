<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import ResponsiveLayout from './components/ResponsiveLayout.vue'

const route = useRoute()
</script>

<template>
  <ResponsiveLayout>
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" :key="route.path" />
      </Transition>
    </RouterView>
  </ResponsiveLayout>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.24s var(--ease-out), transform 0.24s var(--ease-out);
}
.page-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.99);
}

@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active {
    transition: opacity 0.15s ease;
  }
  .page-enter-from,
  .page-leave-to {
    transform: none;
  }
}
</style>
