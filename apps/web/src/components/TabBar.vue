<script setup lang="ts">
import { useRoute } from 'vue-router'
import { mobileTabs, isNavActive } from '../config/nav'
import BraceletIcon from './BraceletIcon.vue'

const route = useRoute()
</script>

<template>
  <nav class="luxury-tabbar" data-testid="mobile-tabbar">
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
  left: 12px;
  right: 12px;
  bottom: calc(8px + env(safe-area-inset-bottom));
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 58px;
  padding: 0 4px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: var(--blur-glass);
  -webkit-backdrop-filter: var(--blur-glass);
  border-radius: 20px;
  border: var(--border-gold);
  box-shadow: 0 8px 32px rgba(16, 22, 20, 0.1);
  z-index: 100;
}
.luxury-tabbar__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  text-decoration: none;
  color: var(--color-text-sub);
  font-size: 10px;
  transition: color var(--duration-fast);
  border-radius: 12px;
}
.luxury-tabbar__item--active {
  color: var(--color-jade-deep);
}
.luxury-tabbar__item--active :deep(.van-icon) {
  color: var(--color-gold);
}
.luxury-tabbar__item:active {
  transform: scale(0.95);
  transition: transform var(--duration-fast);
}
</style>
