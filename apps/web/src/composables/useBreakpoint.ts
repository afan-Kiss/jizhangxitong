import { computed, onMounted, onUnmounted, ref } from 'vue'

export type LayoutMode = 'mobile' | 'tablet' | 'desktop'

const MOBILE_MAX = 767
const DESKTOP_MIN = 1200

function resolveMode(w: number): LayoutMode {
  if (w <= MOBILE_MAX) return 'mobile'
  if (w < DESKTOP_MIN) return 'tablet'
  return 'desktop'
}

export function useBreakpoint() {
  const width = ref(typeof window !== 'undefined' ? window.innerWidth : 390)

  const mode = computed(() => resolveMode(width.value))
  const isMobile = computed(() => mode.value === 'mobile')
  const isTablet = computed(() => mode.value === 'tablet')
  const isDesktop = computed(() => mode.value === 'desktop')
  const isWide = computed(() => width.value >= DESKTOP_MIN)
  const useScannerGun = ref(typeof window !== 'undefined'
    ? window.matchMedia('(min-width: 768px) and (hover: hover)').matches
    : false)

  function update() {
    width.value = window.innerWidth
  }

  function updateScannerGun(e?: MediaQueryList | MediaQueryListEvent) {
    const mq = e && 'matches' in e ? e : window.matchMedia('(min-width: 768px) and (hover: hover)')
    useScannerGun.value = mq.matches
  }

  onMounted(() => {
    update()
    window.addEventListener('resize', update, { passive: true })
    const mq = window.matchMedia('(min-width: 768px) and (hover: hover)')
    mq.addEventListener('change', updateScannerGun)
    updateScannerGun(mq)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', update)
    window.matchMedia('(min-width: 768px) and (hover: hover)').removeEventListener('change', updateScannerGun)
  })

  return { width, mode, isMobile, isTablet, isDesktop, isWide, useScannerGun }
}
