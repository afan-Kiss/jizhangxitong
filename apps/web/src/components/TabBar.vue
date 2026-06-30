<script setup lang="ts">
import { useRoute } from 'vue-router'
import { mobileTabs, isNavActive } from '../config/nav'
import BraceletIcon from './BraceletIcon.vue'

const route = useRoute()
</script>

<template>
  <nav class="luxury-tabbar glass-surface" data-testid="mobile-tabbar">
    <router-link
      v-for="tab in mobileTabs"
      :key="tab.path"
      :to="tab.path"
      class="luxury-tabbar__item"
      :class="{ 'luxury-tabbar__item--active': isNavActive(tab.path, route.path) }"
    >
      <BraceletIcon v-if="tab.custom" :size="22" :active="isNavActive(tab.path, route.path)" />
      <van-icon v-else :name="tab.icon" size="22" />
      <span>{{ tab.label }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.luxury-tabbar {
  position: fixed;
  left: 10px;
  right: 10px;
  bottom: calc(8px + env(safe-area-inset-bottom));
  display: flex;
  justify-content: space-around;
  align-items: center;
  min-height: 58px;
  padding: 0 4px;
  background: rgba(12, 16, 14, 0.88);
  border-radius: 18px;
  border: var(--border-glass);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  z-index: 100;
}
.luxury-tabbar__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 56px;
  min-height: 48px;
  padding: 6px 8px;
  text-decoration: none;
  color: var(--color-text-sub);
  font-size: 10px;
  transition: color var(--duration-fast), transform var(--duration-fast);
  border-radius: 12px;
}
.luxury-tabbar__item--active {
  color: var(--color-gold-light);
  background: rgba(78, 125, 105, 0.12);
}
.luxury-tabbar__item--active :deep(.van-icon) {
  color: var(--color-gold);
}
.luxury-tabbar__item:active {
  transform: scale(0.94);
}
</style>
