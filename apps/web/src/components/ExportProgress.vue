<script setup lang="ts">
import { computed } from 'vue'
import StatusPill from './StatusPill.vue'

const props = defineProps<{
  steps: Array<{ key: string; label: string; status: 'pending' | 'active' | 'done' | 'error' }>
}>()

const currentIndex = computed(() => props.steps.findIndex((s) => s.status === 'active'))
</script>

<template>
  <div class="export-progress">
    <div v-for="(step, i) in steps" :key="step.key" class="export-progress__step">
      <div class="export-progress__indicator">
        <span
          class="export-progress__dot"
          :class="{
            'export-progress__dot--done': step.status === 'done',
            'export-progress__dot--active': step.status === 'active',
            'export-progress__dot--error': step.status === 'error',
          }"
        >
          <span v-if="step.status === 'active'" class="export-progress__pulse" />
          <span v-else-if="step.status === 'done'">✓</span>
          <span v-else-if="step.status === 'error'">!</span>
          <span v-else>{{ i + 1 }}</span>
        </span>
        <span v-if="i < steps.length - 1" class="export-progress__line" :class="{ 'export-progress__line--done': step.status === 'done' }" />
      </div>
      <div class="export-progress__content">
        <div class="export-progress__label">{{ step.label }}</div>
        <StatusPill v-if="step.status === 'active'" type="gold">进行中</StatusPill>
        <StatusPill v-else-if="step.status === 'done'" type="success">完成</StatusPill>
        <StatusPill v-else-if="step.status === 'error'" type="danger">失败</StatusPill>
      </div>
    </div>
  </div>
</template>

<style scoped>
.export-progress__step {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.export-progress__indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 28px;
  flex-shrink: 0;
}
.export-progress__dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  background: rgba(111, 119, 114, 0.12);
  color: var(--color-text-sub);
  position: relative;
}
.export-progress__dot--active {
  background: rgba(198, 161, 91, 0.2);
  color: var(--color-gold);
}
.export-progress__dot--done {
  background: rgba(47, 125, 87, 0.15);
  color: var(--color-success);
}
.export-progress__dot--error {
  background: rgba(185, 74, 72, 0.12);
  color: var(--color-danger);
}
.export-progress__pulse {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-gold);
  animation: pulse-soft 1.2s ease-in-out infinite;
}
.export-progress__line {
  flex: 1;
  width: 2px;
  min-height: 20px;
  margin: 4px 0;
  background: rgba(198, 161, 91, 0.15);
}
.export-progress__line--done { background: var(--color-success); opacity: 0.4; }
.export-progress__content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 4px;
}
.export-progress__label {
  font-size: 14px;
  color: var(--color-text-main);
}
</style>
