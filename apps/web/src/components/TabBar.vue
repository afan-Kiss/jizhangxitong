<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { mobileTabs, isNavActive } from '../config/nav'
import { useScanOverlay } from '../composables/useScanOverlay'
import BraceletIcon from './BraceletIcon.vue'

const route = useRoute()
const scan = useScanOverlay()
const cameraOpen = computed(() => scan.cameraVisible.value)
const resultOpen = computed(() => scan.resultVisible.value)

function onTabClick(tabPath: string, e: Event) {
  if (tabPath !== '/scan') return
  e.preventDefault()
  scan.openScan()
}

function tabActive(tabPath: string) {
  if (tabPath === '/scan') return cameraOpen.value || resultOpen.value
  return isNavActive(tabPath, route.path)
}
</script>

<template>
  <nav class="luxury-tabbar glass-surface" data-testid="mobile-tabbar">
    <router-link
      v-for="tab in mobileTabs"
      :key="tab.path"
      :to="tab.path === '/scan' ? route.path : tab.path"
      class="luxury-tabbar__item"
      :class="{
        'luxury-tabbar__item--active': tabActive(tab.path),
        'luxury-tabbar__item--scan': tab.path === '/scan',
      }"
      @click="onTabClick(tab.path, $event)"
    >
      <span class="luxury-tabbar__icon-wrap">
        <BraceletIcon v-if="tab.custom" :size="22" :active="isNavActive(tab.path, route.path)" />
        <van-icon v-else :name="tab.icon" size="22" />
      </span>
      <span class="luxury-tabbar__label">{{ tab.label }}</span>
      <span v-if="tabActive(tab.path)" class="luxury-tabbar__glow luxury-pulse" aria-hidden="true" />
    </router-link>
  </nav>
</template>

<style scoped>
.luxury-tabbar {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(10px + env(safe-area-inset-bottom));
  display: flex;
  justify-content: space-around;
  align-items: center;
  min-height: 60px;
  padding: 6px 6px;
  background: rgba(16, 24, 20, 0.9);
  border-radius: 22px;
  border: 1px solid rgba(215, 181, 109, 0.14);
  box-shadow: 0 12px 40px rgba(8, 12, 10, 0.5), var(--shadow-glow);
  z-index: 100;
  backdrop-filter: blur(16px);
}
.luxury-tabbar__item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  flex: 1;
  min-width: 0;
  max-width: 72px;
  min-height: 50px;
  padding: 6px 4px;
  text-decoration: none;
  color: var(--color-text-sub);
  font-size: 10px;
  transition:
    color var(--duration-fast),
    transform var(--duration-fast),
    border-color var(--duration-fast);
  border-radius: 14px;
  border: 1px solid transparent;
}
.luxury-tabbar__icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 10px;
  transition: background var(--duration-fast), box-shadow var(--duration-fast);
}
.luxury-tabbar__item--active {
  color: var(--color-gold-light);
  border-color: rgba(215, 181, 109, 0.22);
  background: rgba(90, 143, 120, 0.1);
}
.luxury-tabbar__item--active .luxury-tabbar__icon-wrap {
  background: rgba(215, 181, 109, 0.1);
  box-shadow: 0 0 12px rgba(215, 181, 109, 0.15);
}
.luxury-tabbar__item--active :deep(.van-icon) {
  color: var(--color-gold);
}
.luxury-tabbar__item--scan.luxury-tabbar__item--active .luxury-tabbar__icon-wrap {
  animation: tab-pulse 2.4s ease-in-out infinite;
}
.luxury-tabbar__glow {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, transparent, var(--color-gold), transparent);
}
.luxury-tabbar__label {
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.luxury-tabbar__item:active {
  transform: scale(0.94);
}
@media (prefers-reduced-motion: reduce) {
  .luxury-tabbar__item--scan.luxury-tabbar__item--active .luxury-tabbar__icon-wrap {
    animation: none;
  }
}
</style>
