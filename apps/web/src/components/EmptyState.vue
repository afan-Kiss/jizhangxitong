<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  actionLabel?: string
  secondaryLabel?: string
}>()

defineEmits<{
  action: []
  secondary: []
}>()
</script>

<template>
  <div class="empty-state">
    <div class="empty-state__icon" aria-hidden="true">📋</div>
    <h3 class="empty-state__title">{{ title }}</h3>
    <p v-if="description" class="empty-state__desc">{{ description }}</p>
    <div v-if="actionLabel || secondaryLabel" class="empty-state__actions">
      <button v-if="actionLabel" type="button" class="ui-btn ui-btn--gold" @click="$emit('action')">
        {{ actionLabel }}
      </button>
      <button v-if="secondaryLabel" type="button" class="ui-btn ui-btn--ghost" @click="$emit('secondary')">
        {{ secondaryLabel }}
      </button>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.empty-state {
  text-align: center;
  padding: 40px 24px;
  background: #fbf8f1;
  border: 1px dashed #e7ddc8;
  border-radius: var(--radius-card);
}
.empty-state__icon {
  font-size: 32px;
  margin-bottom: 12px;
  opacity: 0.7;
}
.empty-state__title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-main);
}
.empty-state__desc {
  margin: 0 0 20px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-sub);
}
.empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}
</style>
