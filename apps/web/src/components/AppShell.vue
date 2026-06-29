<script setup lang="ts">
import { computed } from 'vue'
import { useBreakpoint } from '../composables/useBreakpoint'

const props = defineProps<{
  title?: string
  showBack?: boolean
  noTabPad?: boolean
  fixedBottom?: boolean
}>()

const emit = defineEmits<{ back: [] }>()
const { isDesktop } = useBreakpoint()

const useFixedFooter = computed(() => Boolean(props.fixedBottom) && !isDesktop.value)
const showNavBar = computed(() => Boolean(props.title) && !isDesktop.value)
</script>

<template>
  <div
    class="app-shell"
    :class="{
      'app-shell--fixed-bottom': useFixedFooter,
      'app-shell--no-tab': noTabPad || isDesktop,
      'app-shell--desktop': isDesktop,
    }"
  >
    <div v-if="isDesktop && title" class="app-shell__page-title">{{ title }}</div>
    <van-nav-bar
      v-if="showNavBar"
      :title="title"
      :left-arrow="showBack"
      @click-left="emit('back')"
    />
    <div class="app-shell__body page-enter">
      <slot />
    </div>
    <div v-if="$slots.footer" class="app-shell__footer" :class="{ 'app-shell__footer--static': isDesktop }">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  padding-bottom: calc(64px + env(safe-area-inset-bottom));
  background: transparent;
}
.app-shell--no-tab {
  padding-bottom: env(safe-area-inset-bottom);
}
.app-shell--fixed-bottom {
  padding-bottom: calc(88px + env(safe-area-inset-bottom));
}
.app-shell--desktop {
  min-height: auto;
  padding-bottom: 0;
}
.app-shell__page-title {
  margin: 0 0 16px;
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text-main);
}
.app-shell__body {
  padding: 0 0 16px;
}
.app-shell--desktop .app-shell__body {
  padding: 0 0 8px;
}
.app-shell__footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, transparent 0%, rgba(247, 243, 234, 0.98) 20%);
  backdrop-filter: var(--blur-glass);
  z-index: 90;
  box-shadow: 0 -4px 24px rgba(16, 22, 20, 0.06);
}
.app-shell__footer--static {
  position: static;
  padding: 16px 0 0;
  background: transparent;
  backdrop-filter: none;
  box-shadow: none;
}
.app-shell--no-tab .app-shell__footer:not(.app-shell__footer--static) {
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
}
</style>
