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
      <div class="desktop-sidebar__mark" aria-hidden="true">
        <span class="desktop-sidebar__diamond">◆</span>
      </div>
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
        class="desktop-sidebar__link luxury-hover"
        :class="{ 'desktop-sidebar__link--active': isActive(item.path) }"
        @click="onNavClick(item, $event)"
      >
        <BraceletIcon v-if="item.custom" :size="18" :active="isActive(item.path)" />
        <van-icon v-else :name="item.icon" size="18" />
        <span>{{ item.label }}</span>
      </router-link>
    </nav>
    <div class="desktop-sidebar__footer muted">墨玉绿 · 香槟金</div>
  </aside>
</template>

<style scoped>
.desktop-sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  min-height: 100vh;
  padding: 20px 12px;
  background:
    linear-gradient(180deg, rgba(18, 28, 24, 0.88) 0%, rgba(14, 20, 18, 0.92) 100%);
  border-right: 1px solid rgba(215, 181, 109, 0.1);
  color: var(--color-text-light);
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 24px rgba(8, 12, 10, 0.25);
}

.desktop-sidebar__brand {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 10px 20px;
  border-bottom: 1px solid rgba(215, 181, 109, 0.1);
  margin-bottom: 16px;
}

.desktop-sidebar__mark {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 30% 30%, rgba(215, 181, 109, 0.25), rgba(31, 77, 58, 0.35));
  border: 1px solid rgba(215, 181, 109, 0.22);
  box-shadow: 0 0 16px rgba(215, 181, 109, 0.12);
}

.desktop-sidebar__diamond {
  color: var(--color-gold-light);
  font-size: 13px;
  line-height: 1;
}

.desktop-sidebar__title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--color-gold-light);
}

.desktop-sidebar__sub {
  margin-top: 4px;
  font-size: 11px;
  color: rgba(248, 244, 234, 0.48);
  letter-spacing: 0.06em;
}

.desktop-sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.desktop-sidebar__link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 12px;
  border-radius: 12px;
  text-decoration: none;
  color: rgba(248, 244, 234, 0.68);
  font-size: 14px;
  border: 1px solid transparent;
}

.desktop-sidebar__link:hover {
  color: var(--color-text-light);
  background: rgba(255, 255, 255, 0.04);
  transform: translateX(2px);
}

.desktop-sidebar__link--active {
  background: linear-gradient(135deg, rgba(90, 143, 120, 0.22) 0%, rgba(215, 181, 109, 0.08) 100%);
  color: var(--color-gold-light);
  font-weight: 500;
  border-color: rgba(215, 181, 109, 0.28);
  box-shadow: inset 0 0 0 1px rgba(215, 181, 109, 0.1), 0 0 20px rgba(215, 181, 109, 0.08);
}

.desktop-sidebar__link--active :deep(.van-icon) {
  color: var(--color-gold);
}

.desktop-sidebar__footer {
  padding: 14px 10px 6px;
  font-size: 10px;
  text-align: center;
  opacity: 0.55;
  letter-spacing: 0.12em;
}
</style>
