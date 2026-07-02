<script setup lang="ts">
import { useRoute } from 'vue-router'
import { desktopNav, isNavActive } from '../config/nav'

const route = useRoute()

function isActive(path: string) {
  return isNavActive(path, route.path)
}
</script>

<template>
  <aside class="desktop-sidebar" data-testid="desktop-sidebar">
    <div class="desktop-sidebar__brand">
      <div class="desktop-sidebar__mark" aria-hidden="true">◆</div>
      <div>
        <div class="desktop-sidebar__title">项目资金支出</div>
        <div class="desktop-sidebar__sub">记录 · 统计 · 报账</div>
      </div>
    </div>
    <nav class="desktop-sidebar__nav">
      <router-link
        v-for="item in desktopNav"
        :key="item.path"
        :to="item.path"
        class="desktop-sidebar__link"
        :class="{ 'desktop-sidebar__link--active': isActive(item.path) }"
      >
        <van-icon :name="item.icon" size="18" />
        <span>{{ item.label }}</span>
      </router-link>
    </nav>
    <div class="desktop-sidebar__footer">珠宝公司内部财务工具</div>
  </aside>
</template>

<style scoped>
.desktop-sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  min-height: 100vh;
  padding: 20px 12px;
  background: var(--color-sidebar);
  border-right: 1px solid #e7ddc8;
  color: var(--color-text-main);
  display: flex;
  flex-direction: column;
}

.desktop-sidebar__brand {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 10px 20px;
  border-bottom: 1px solid #e7ddc8;
  margin-bottom: 16px;
}

.desktop-sidebar__mark {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 1px solid #e7ddc8;
  color: var(--color-gold);
  font-size: 13px;
}

.desktop-sidebar__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-main);
}

.desktop-sidebar__sub {
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-text-sub);
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
  padding: 11px 12px;
  border-radius: 10px;
  text-decoration: none;
  color: var(--color-text-sub);
  font-size: 14px;
  border: 1px solid transparent;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.desktop-sidebar__link:hover {
  color: var(--color-text-main);
  background: rgba(255, 255, 255, 0.55);
}

.desktop-sidebar__link--active {
  background: #fff;
  color: var(--color-gold-deep);
  font-weight: 600;
  border-color: #e7ddc8;
  box-shadow: var(--shadow-card);
}

.desktop-sidebar__link--active :deep(.van-icon) {
  color: var(--color-gold);
}

.desktop-sidebar__footer {
  padding: 14px 10px 6px;
  font-size: 11px;
  text-align: center;
  color: var(--color-text-muted);
}
</style>
