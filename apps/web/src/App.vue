<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import TabBar from './components/TabBar.vue'

const route = useRoute()

const hideTab = computed(() =>
  route.path === '/login'
  || /^\/expense\/\d+/.test(route.path)
  || /^\/sales\/\d+/.test(route.path)
  || route.path === '/sales/create'
  || route.path === '/expense/create'
  || route.path === '/expense/export',
)
</script>

<template>
  <RouterView v-slot="{ Component }">
    <Transition name="page" mode="out-in">
      <component :is="Component" :key="route.path" />
    </Transition>
  </RouterView>
  <TabBar v-if="!hideTab" />
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.22s var(--ease-out), transform 0.22s var(--ease-out);
}
.page-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
