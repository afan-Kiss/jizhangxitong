<script setup lang="ts">
import { useRoute } from 'vue-router'
import { mobileTabs, isNavActive } from '../config/nav'

const route = useRoute()

function tabActive(tabPath: string) {
  return isNavActive(tabPath, route.path)
}
</script>

<template>
  <nav class="app-tabbar" data-testid="mobile-tabbar">
    <router-link
      v-for="tab in mobileTabs"
      :key="tab.path"
      :to="tab.path"
      class="app-tabbar__item"
      :class="{ 'app-tabbar__item--active': tabActive(tab.path) }"
    >
      <van-icon :name="tab.icon" size="22" />
      <span class="app-tabbar__label">{{ tab.label }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.app-tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-around;
  align-items: center;
  min-height: 56px;
  padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1px solid #e7ddc8;
  box-shadow: 0 -4px 16px rgba(31, 41, 51, 0.06);
  z-index: 100;
}

.app-tabbar__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
  max-width: 80px;
  min-height: 48px;
  padding: 4px;
  text-decoration: none;
  color: var(--color-text-sub);
  font-size: 10px;
  border-radius: 10px;
  transition: color 0.15s, background 0.15s;
}

.app-tabbar__item--active {
  color: var(--color-gold-deep);
  font-weight: 600;
}

.app-tabbar__item--active :deep(.van-icon) {
  color: var(--color-gold);
}

.app-tabbar__label {
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
</style>
