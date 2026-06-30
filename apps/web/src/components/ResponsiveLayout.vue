<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useBreakpoint } from '../composables/useBreakpoint'
import { useAuthStore } from '../stores/auth'
import DesktopSidebar from './DesktopSidebar.vue'
import DesktopHeader from './DesktopHeader.vue'
import TabBar from './TabBar.vue'
import { shouldHideMobileTab } from '../utils/mobile-tab-routes'

const route = useRoute()
const auth = useAuthStore()
const { isDesktop, isWide } = useBreakpoint()

const isLogin = computed(() => route.path === '/login')
const showChrome = computed(() => !isLogin.value && Boolean(auth.token))

const hideMobileTab = computed(() => shouldHideMobileTab(route.path, isWide.value))
</script>

<template>
  <div
    class="responsive-layout"
    :class="{ 'responsive-layout--desktop': isDesktop && showChrome }"
  >
    <DesktopSidebar v-if="isDesktop && showChrome" />
    <div class="responsive-layout__wrap">
      <DesktopHeader v-if="isDesktop && showChrome" />
      <main
        class="responsive-layout__content page-container"
        :class="{ 'responsive-layout__content--login': isLogin }"
      >
        <slot />
      </main>
    </div>
    <TabBar v-if="showChrome && !hideMobileTab" />
  </div>
</template>

<style scoped>
.responsive-layout {
  min-height: 100vh;
  background:
    radial-gradient(ellipse 90% 50% at 10% -5%, var(--color-bg-mesh-1) 0%, transparent 55%),
    radial-gradient(ellipse 60% 40% at 95% 100%, var(--color-bg-mesh-2) 0%, transparent 50%),
    var(--color-bg);
}

.responsive-layout--desktop {
  display: flex;
}

.responsive-layout__wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.responsive-layout__content {
  flex: 1;
  padding-left: 16px;
  padding-right: 16px;
  overflow-x: hidden;
}

.responsive-layout__content--login {
  max-width: none;
  padding: 0;
}

@media (min-width: 768px) {
  .responsive-layout__content:not(.responsive-layout__content--login) {
    padding-left: 24px;
    padding-right: 24px;
  }
}

@media (min-width: 1200px) {
  .responsive-layout__content:not(.responsive-layout__content--login) {
    padding-left: 32px;
    padding-right: 32px;
    padding-bottom: 24px;
  }
}
</style>
