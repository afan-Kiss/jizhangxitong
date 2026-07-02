<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBreakpoint } from '../composables/useBreakpoint'
import { shouldShowPageBack } from '../utils/page-back'

const props = defineProps<{
  title?: string
  showBack?: boolean
  noTabPad?: boolean
  fixedBottom?: boolean
}>()

const emit = defineEmits<{ back: [] }>()
const attrs = useAttrs()
const route = useRoute()
const router = useRouter()
const { isDesktop } = useBreakpoint()

const useFixedFooter = computed(() => Boolean(props.fixedBottom) && !isDesktop.value)
const showBackButton = computed(() => {
  if (props.showBack !== undefined) return props.showBack
  return shouldShowPageBack(route.path)
})

function goBack() {
  if (typeof attrs.onBack === 'function') {
    emit('back')
    return
  }
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/')
  }
}
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
    <header
      v-if="title"
      class="app-shell__page-head"
      :class="{ 'app-shell__page-head--sticky': !isDesktop }"
    >
      <button
        v-if="showBackButton"
        type="button"
        class="app-shell__back"
        data-testid="page-back-btn"
        aria-label="返回上一页"
        @click="goBack"
      >
        ← 返回
      </button>
      <h1 class="app-shell__page-title">{{ title }}</h1>
    </header>
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
.app-shell__page-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 14px;
  flex-wrap: wrap;
}
.app-shell__page-head--sticky {
  position: sticky;
  top: 0;
  z-index: 80;
  margin-left: -16px;
  margin-right: -16px;
  padding: calc(8px + env(safe-area-inset-top)) 16px 10px;
  background: linear-gradient(180deg, rgba(16, 24, 20, 0.98) 0%, rgba(16, 24, 20, 0.92) 70%, transparent 100%);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(215, 181, 109, 0.1);
}
.app-shell__back {
  flex-shrink: 0;
  min-height: 36px;
  border: 1px solid rgba(215, 181, 109, 0.35);
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-gold-light);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 14px;
  line-height: 1.2;
  cursor: pointer;
  transition:
    border-color var(--duration-fast),
    transform var(--duration-fast),
    box-shadow var(--duration-fast);
}
@media (hover: hover) {
  .app-shell__back:hover {
    border-color: var(--color-gold-border-hover);
    box-shadow: var(--shadow-glow);
    transform: translateY(-1px);
  }
}
.app-shell__page-title {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-champagne);
  line-height: 1.3;
}
.app-shell--desktop .app-shell__page-title {
  font-size: 22px;
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
  background: linear-gradient(180deg, transparent 0%, rgba(16, 24, 20, 0.96) 24%);
  backdrop-filter: var(--blur-glass);
  z-index: 90;
  box-shadow: 0 -4px 28px rgba(8, 12, 10, 0.35);
  border-top: 1px solid rgba(215, 181, 109, 0.1);
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
