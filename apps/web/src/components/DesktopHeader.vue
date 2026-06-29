<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import WorkerStatus from './WorkerStatus.vue'

const auth = useAuthStore()

onMounted(async () => {
  if (auth.token && !auth.workerStatus.online) {
    await auth.fetchWorkerStatus()
  }
})
</script>

<template>
  <header class="desktop-header" data-testid="desktop-header">
    <div class="desktop-header__title">和田玉镯子记账系统</div>
    <div class="desktop-header__right">
      <WorkerStatus :status="auth.workerStatus" compact />
      <div v-if="auth.user" class="desktop-header__user">
        <van-icon name="manager-o" size="16" />
        <span>{{ auth.user.name || auth.user.username }}</span>
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
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: var(--blur-glass);
  border-bottom: var(--border-gold);
  position: sticky;
  top: 0;
  z-index: 50;
}

.desktop-header__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-jade-deep);
  letter-spacing: 0.03em;
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

.desktop-header__user {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  background: rgba(31, 77, 58, 0.08);
  color: var(--color-jade-deep);
  font-size: 13px;
  white-space: nowrap;
}
</style>
