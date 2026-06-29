<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
const tabs = [
  { path: '/', label: '首页', icon: 'home-o' },
  { path: '/expense/create', label: '记支出', icon: 'balance-pay' },
  { path: '/sales', label: '销售', icon: 'shopping-cart-o' },
  { path: '/bracelets', label: '镯子', icon: 'gem-o' },
  { path: '/settings', label: '我的', icon: 'user-o' },
]
</script>

<template>
  <nav class="luxury-tabbar">
    <router-link
      v-for="tab in tabs"
      :key="tab.path"
      :to="tab.path"
      class="luxury-tabbar__item"
      :class="{ 'luxury-tabbar__item--active': route.path === tab.path || (tab.path !== '/' && route.path.startsWith(tab.path)) }"
    >
      <van-icon :name="tab.icon" size="22" />
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
