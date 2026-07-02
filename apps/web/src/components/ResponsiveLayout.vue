<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useBreakpoint } from '../composables/useBreakpoint'
import { useAuthStore } from '../stores/auth'
import { useScanOverlay } from '../composables/useScanOverlay'
import DesktopSidebar from './DesktopSidebar.vue'
import DesktopHeader from './DesktopHeader.vue'
import TabBar from './TabBar.vue'
import ScanCameraOverlay from './ScanCameraOverlay.vue'
import ScanResultSheet from './ScanResultSheet.vue'
import { shouldHideMobileTab } from '../utils/mobile-tab-routes'

const route = useRoute()
const auth = useAuthStore()
const { isDesktop, isWide, useScannerGun } = useBreakpoint()
const scan = useScanOverlay()
const cameraOpen = computed(() => scan.cameraVisible.value)
const resultOpen = computed(() => scan.resultVisible.value)
const useCameraForScan = computed(() => !useScannerGun.value)

const isLogin = computed(() => route.path === '/login' || route.path.startsWith('/finance-share/'))
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
    <ScanCameraOverlay
      :visible="cameraOpen"
      :use-camera="useCameraForScan"
      @close="scan.closeCamera()"
      @detected="scan.onCodeDetected"
    />
    <ScanResultSheet
      :visible="resultOpen"
      :scan="scan"
      @close="scan.closeResult()"
    />
  </div>
</template>

<style scoped>
.responsive-layout {
  min-height: 100vh;
  background: var(--color-bg);
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
  background: var(--color-bg);
}

.responsive-layout__content {
  flex: 1;
  padding: 16px;
  overflow-x: hidden;
}

.responsive-layout__content--login {
  max-width: none;
  padding: 0;
}

@media (min-width: 768px) {
  .responsive-layout__content:not(.responsive-layout__content--login) {
    padding: 20px 28px 28px;
  }
}

@media (min-width: 1200px) {
  .responsive-layout__content:not(.responsive-layout__content--login) {
    padding: 24px 32px 32px;
  }
}
</style>
