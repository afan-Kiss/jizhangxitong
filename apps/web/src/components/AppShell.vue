<script setup lang="ts">
import { computed, useAttrs, withDefaults } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBreakpoint } from '../composables/useBreakpoint'
import { shouldShowPageBack } from '../utils/page-back'

const props = withDefaults(
  defineProps<{
    title?: string
    hideBack?: boolean
    noTabPad?: boolean
    fixedBottom?: boolean
  }>(),
  { hideBack: false },
)

const emit = defineEmits<{ back: [] }>()
const attrs = useAttrs()
const route = useRoute()
const router = useRouter()
const { isDesktop } = useBreakpoint()

const useFixedFooter = computed(() => Boolean(props.fixedBottom) && !isDesktop.value)
const showBackButton = computed(() => {
  if (props.hideBack) return false
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
      v-if="showBackButton"
      class="app-shell__page-head"
      :class="{ 'app-shell__page-head--sticky': !isDesktop }"
    >
      <button
        type="button"
        class="app-shell__back"
        data-testid="page-back-btn"
        aria-label="返回上一页"
        @click="goBack"
      >
        ← 返回
      </button>
      <span v-if="title" class="app-shell__title">{{ title }}</span>
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
  min-height: 100%;
  padding-bottom: calc(64px + env(safe-area-inset-bottom));
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
  margin: 0 0 12px;
}
.app-shell__page-head--sticky {
  position: sticky;
  top: 0;
  z-index: 80;
  margin-left: -16px;
  margin-right: -16px;
  padding: calc(8px + env(safe-area-inset-top)) 16px 10px;
  background: rgba(246, 241, 231, 0.95);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #e7ddc8;
}
.app-shell__back {
  flex-shrink: 0;
  min-height: 36px;
  border: 1px solid #e7ddc8;
  background: #fff;
  color: var(--color-gold-deep);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 14px;
  cursor: pointer;
}
.app-shell__title {
  margin-left: 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-main);
}
.app-shell__body {
  padding: 0 0 16px;
}
.app-shell__footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: #fff;
  z-index: 90;
  box-shadow: 0 -4px 16px rgba(31, 41, 51, 0.06);
  border-top: 1px solid #e7ddc8;
}
.app-shell__footer--static {
  position: static;
  padding: 16px 0 0;
  background: transparent;
  box-shadow: none;
  border-top: none;
}
</style>
