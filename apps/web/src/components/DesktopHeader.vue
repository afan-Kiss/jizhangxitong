<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { loginPath } from '../utils/base-path'
import WorkerStatus from './WorkerStatus.vue'

const auth = useAuthStore()
const router = useRouter()
const menuOpen = ref(false)
const menuRoot = ref<HTMLElement | null>(null)

onMounted(async () => {
  if (auth.token && !auth.workerStatus.online) {
    await auth.fetchWorkerStatus()
  }
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})

function onDocumentClick(e: MouseEvent) {
  if (!menuOpen.value) return
  const root = menuRoot.value
  if (root && !root.contains(e.target as Node)) menuOpen.value = false
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function goSettings() {
  menuOpen.value = false
  router.push('/settings')
}

function logout() {
  menuOpen.value = false
  auth.logout()
  router.push(loginPath())
}
</script>

<template>
  <header class="desktop-header glass-surface" data-testid="desktop-header">
    <div class="desktop-header__title">和田玉镯子记账系统</div>
    <div class="desktop-header__right">
      <WorkerStatus :status="auth.workerStatus" compact />
      <div v-if="auth.user" ref="menuRoot" class="desktop-header__menu">
        <button
          type="button"
          class="desktop-header__user"
          :class="{ 'desktop-header__user--open': menuOpen }"
          data-testid="user-menu-trigger"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          @click.stop="toggleMenu"
        >
          <van-icon name="manager-o" size="16" />
          <span>{{ auth.user.name || auth.user.username }}</span>
          <van-icon name="arrow-down" size="12" class="desktop-header__caret" :class="{ 'desktop-header__caret--open': menuOpen }" />
        </button>
        <Transition name="user-menu-fade">
          <div v-if="menuOpen" class="desktop-header__dropdown" role="menu" data-testid="user-menu-dropdown">
            <button type="button" class="desktop-header__dropdown-item" role="menuitem" data-testid="user-menu-settings" @click="goSettings">
              <van-icon name="setting-o" size="16" />
              <span>设置</span>
            </button>
            <button type="button" class="desktop-header__dropdown-item desktop-header__dropdown-item--danger" role="menuitem" data-testid="user-menu-logout" @click="logout">
              <van-icon name="revoke" size="16" />
              <span>退出</span>
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </header>
</template>

<style scoped>
.desktop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: var(--header-height);
  padding: 10px 24px;
  background: rgba(12, 16, 14, 0.72);
  border-bottom: var(--border-glass);
  position: sticky;
  top: 0;
  z-index: 50;
}

.desktop-header__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-gold-light);
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.desktop-header__right {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  flex: 1;
  justify-content: flex-end;
}

.desktop-header__right :deep(.worker-status) {
  margin-bottom: 0;
  flex: 1;
  max-width: 520px;
}

.desktop-header__right :deep(.worker-status__title) {
  display: none;
}

.desktop-header__menu {
  position: relative;
  flex-shrink: 0;
}

.desktop-header__user {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  background: rgba(78, 125, 105, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--color-text-light);
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background var(--duration-fast),
    border-color var(--duration-fast);
}

.desktop-header__user:hover,
.desktop-header__user--open {
  background: rgba(78, 125, 105, 0.24);
  border-color: rgba(198, 161, 91, 0.28);
}

.desktop-header__caret {
  opacity: 0.75;
  transition: transform var(--duration-fast);
}

.desktop-header__caret--open {
  transform: rotate(180deg);
}

.desktop-header__dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 148px;
  padding: 6px;
  border-radius: 12px;
  border: var(--border-glass);
  background: rgba(18, 24, 21, 0.96);
  box-shadow: var(--shadow-card), 0 12px 32px rgba(0, 0, 0, 0.28);
  z-index: 60;
}

.desktop-header__dropdown-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-light);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.desktop-header__dropdown-item:hover {
  background: rgba(78, 125, 105, 0.18);
}

.desktop-header__dropdown-item--danger {
  color: #e8a8a0;
}

.desktop-header__dropdown-item--danger:hover {
  background: rgba(180, 72, 60, 0.16);
}

.user-menu-fade-enter-active,
.user-menu-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.user-menu-fade-enter-from,
.user-menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
