<script setup lang="ts">
import { RouterView } from 'vue-router'
import ResponsiveLayout from './components/ResponsiveLayout.vue'

/** 左侧 Tab 主页面缓存，切换时不再重新挂载 */
const TAB_VIEWS = ['Home', 'ExpenseStats', 'Settings']
</script>

<template>
  <ResponsiveLayout>
    <RouterView v-slot="{ Component, route }">
      <div class="route-view-host">
        <Transition name="route-fade">
          <div v-if="Component" :key="route.path" class="route-view-pane">
            <KeepAlive :include="TAB_VIEWS">
              <component :is="Component" />
            </KeepAlive>
          </div>
        </Transition>
      </div>
    </RouterView>
  </ResponsiveLayout>
</template>

<style>
.route-view-host {
  position: relative;
  width: 100%;
  min-height: 1px;
}

.route-view-pane {
  width: 100%;
}

.route-fade-enter-active,
.route-fade-leave-active {
  transition:
    opacity 0.12s var(--ease-out),
    transform 0.12s var(--ease-out);
}

.route-fade-leave-active {
  position: absolute;
  inset: 0;
  width: 100%;
  pointer-events: none;
  z-index: 0;
}

.route-fade-enter-active {
  z-index: 1;
}

.route-fade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.route-fade-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}

@media (prefers-reduced-motion: reduce) {
  .route-fade-enter-active,
  .route-fade-leave-active {
    transition: opacity 0.1s ease;
  }

  .route-fade-enter-from,
  .route-fade-leave-to {
    transform: none;
  }
}
</style>
