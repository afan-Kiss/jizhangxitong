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

  function update() {
    width.value = window.innerWidth
  }

  onMounted(() => {
    update()
    window.addEventListener('resize', update, { passive: true })
  })

  onUnmounted(() => {
    window.removeEventListener('resize', update)
  })

  return { width, mode, isMobile, isTablet, isDesktop, isWide }
}
