<script setup lang="ts">
import { useRoute } from 'vue-router'
import { desktopNav, isNavActive } from '../config/nav'
import { useScanOverlay } from '../composables/useScanOverlay'
import BraceletIcon from './BraceletIcon.vue'

const route = useRoute()
const scan = useScanOverlay()

function onNavClick(item: { path: string }, e: MouseEvent) {
  if (item.path !== '/scan') return
  e.preventDefault()
  scan.openScan()
}

function isActive(path: string) {
  if (path === '/scan') {
    return scan.cameraVisible.value || scan.resultVisible.value || isNavActive(path, route.path)
  }
  return isNavActive(path, route.path)
}
</script>

<template>
  <aside class="desktop-sidebar glass-surface" data-testid="desktop-sidebar">
    <div class="desktop-sidebar__brand">
      <div class="desktop-sidebar__mark">◆</div>
      <div>
        <div class="desktop-sidebar__title">和田玉记账</div>
        <div class="desktop-sidebar__sub">高端珠宝经营工作台</div>
      </div>
    </div>
    <nav class="desktop-sidebar__nav">
      <router-link
        v-for="item in desktopNav"
        :key="item.path"
        :to="item.path === '/scan' ? route.path : item.path"
        class="desktop-sidebar__link"
        :class="{ 'desktop-sidebar__link--active': isActive(item.path) }"
        @click="onNavClick(item, $event)"
      >
        <BraceletIcon v-if="item.custom" :size="18" :active="isActive(item.path)" />
        <van-icon v-else :name="item.icon" size="18" />
        <span>{{ item.label }}</span>
      </router-link>
    </nav>
    <div class="desktop-sidebar__footer muted">墨玉绿 · 暖金点缀</div>
  </aside>
</template>

<style scoped>
.desktop-sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  min-height: 100vh;
  padding: 18px 10px;
  background: rgba(12, 16, 14, 0.55);
  border-right: var(--border-glass);
  color: var(--color-text-light);
  display: flex;
  flex-direction: column;
}

.desktop-sidebar__brand {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 10px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 14px;
}

.desktop-sidebar__mark {
  color: var(--color-gold);
  font-size: 14px;
  line-height: 1.4;
  opacity: 0.9;
}

.desktop-sidebar__title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--color-gold-light);
}

.desktop-sidebar__sub {
  margin-top: 3px;
  font-size: 11px;
  color: rgba(248, 243, 232, 0.5);
}

.desktop-sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.desktop-sidebar__link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border-radius: 10px;
  text-decoration: none;
  color: rgba(248, 243, 232, 0.72);
  font-size: 14px;
  transition: background var(--duration-fast), color var(--duration-fast), transform var(--duration-fast);
}

.desktop-sidebar__link:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-text-light);
  transform: translateX(2px);
}

.desktop-sidebar__link--active {
  background: rgba(78, 125, 105, 0.22);
  color: var(--color-gold-light);
  font-weight: 500;
  box-shadow: inset 0 0 0 1px rgba(198, 161, 91, 0.12);
}

.desktop-sidebar__link--active :deep(.van-icon) {
  color: var(--color-gold);
}

.desktop-sidebar__footer {
  padding: 12px 10px 4px;
  font-size: 10px;
  text-align: center;
  opacity: 0.65;
}
</style>
