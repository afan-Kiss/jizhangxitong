<script setup lang="ts">
defineProps<{
  title?: string
  showBack?: boolean
  noTabPad?: boolean
  fixedBottom?: boolean
}>()

const emit = defineEmits<{ back: [] }>()
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--fixed-bottom': fixedBottom, 'app-shell--no-tab': noTabPad }">
    <van-nav-bar
      v-if="title"
      :title="title"
      :left-arrow="showBack"
      @click-left="emit('back')"
    />
    <div class="app-shell__body page-enter">
      <slot />
    </div>
    <div v-if="$slots.footer" class="app-shell__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  padding-bottom: calc(64px + env(safe-area-inset-bottom));
  background: var(--color-bg);
}
.app-shell--no-tab {
  padding-bottom: env(safe-area-inset-bottom);
}
.app-shell--fixed-bottom {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}
.app-shell__body {
  padding: 0 16px 16px;
}
.app-shell__footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, transparent 0%, rgba(247, 243, 234, 0.95) 24%);
  backdrop-filter: var(--blur-glass);
  z-index: 10;
}
.app-shell--no-tab .app-shell__footer {
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
}
</style>
