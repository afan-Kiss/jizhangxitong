<script setup lang="ts">
import { useRoute } from 'vue-router'
import { desktopNav, isNavActive } from '../config/nav'
import BraceletIcon from './BraceletIcon.vue'

const route = useRoute()
</script>

<template>
  <aside class="desktop-sidebar" data-testid="desktop-sidebar">
    <div class="desktop-sidebar__brand">
      <div class="desktop-sidebar__title">和田玉记账</div>
      <div class="desktop-sidebar__sub">镯子财务后台</div>
    </div>
    <nav class="desktop-sidebar__nav">
      <router-link
        v-for="item in desktopNav"
        :key="item.path"
        :to="item.path"
        class="desktop-sidebar__link"
        :class="{ 'desktop-sidebar__link--active': isNavActive(item.path, route.path) }"
      >
        <BraceletIcon v-if="item.custom" :size="18" :active="isNavActive(item.path, route.path)" />
        <van-icon v-else :name="item.icon" size="18" />
        <span>{{ item.label }}</span>
      </router-link>
    </nav>
  </aside>
</template>

<style scoped>
.desktop-sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  min-height: 100vh;
  padding: 20px 12px;
  background: linear-gradient(180deg, #152420 0%, #101614 100%);
  border-right: 1px solid rgba(198, 161, 91, 0.15);
  color: var(--color-text-light);
}

.desktop-sidebar__brand {
  padding: 8px 12px 20px;
  border-bottom: 1px solid rgba(198, 161, 91, 0.12);
  margin-bottom: 12px;
}

.desktop-sidebar__title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--color-gold-light);
}

.desktop-sidebar__sub {
  margin-top: 4px;
  font-size: 11px;
  color: rgba(248, 243, 232, 0.55);
}

.desktop-sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.desktop-sidebar__link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-radius: 12px;
  text-decoration: none;
  color: rgba(248, 243, 232, 0.75);
  font-size: 14px;
  transition: background var(--duration-fast), color var(--duration-fast);
}

.desktop-sidebar__link:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-light);
}

.desktop-sidebar__link--active {
  background: rgba(78, 125, 105, 0.35);
  color: var(--color-gold-light);
  font-weight: 500;
}

.desktop-sidebar__link--active :deep(.van-icon) {
  color: var(--color-gold);
}
</style>
