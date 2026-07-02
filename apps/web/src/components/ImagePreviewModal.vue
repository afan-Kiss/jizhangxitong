<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  open: boolean
  src?: string | null
  images?: string[]
  startIndex?: number
  alt?: string
}>()

const emit = defineEmits<{ close: [] }>()

const scale = ref(1)
const pan = ref({ x: 0, y: 0 })
const dragging = ref(false)
const dragMoved = ref(false)
const viewportRef = ref<HTMLElement | null>(null)
const dragState = ref<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
const currentIndex = ref(0)

const imageList = computed(() => {
  if (props.images?.length) return props.images
  if (props.src) return [props.src]
  return []
})

const currentSrc = computed(() => imageList.value[currentIndex.value] || null)
const hasMultiple = computed(() => imageList.value.length > 1)

function resetView() {
  scale.value = 1
  pan.value = { x: 0, y: 0 }
}

function zoomBy(delta: number) {
  scale.value = Math.min(5, Math.max(0.25, Number((scale.value + delta).toFixed(2))))
}

function goPrev() {
  if (!hasMultiple.value) return
  currentIndex.value = (currentIndex.value - 1 + imageList.value.length) % imageList.value.length
  resetView()
}

function goNext() {
  if (!hasMultiple.value) return
  currentIndex.value = (currentIndex.value + 1) % imageList.value.length
  resetView()
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (!hasMultiple.value) return
  if (e.deltaY < 0) goPrev()
  else if (e.deltaY > 0) goNext()
}

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  dragMoved.value = false
  dragState.value = {
    startX: e.clientX,
    startY: e.clientY,
    panX: pan.value.x,
    panY: pan.value.y,
  }
  dragging.value = true
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  const drag = dragState.value
  if (!drag) return
  const dx = e.clientX - drag.startX
  const dy = e.clientY - drag.startY
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved.value = true
  pan.value = {
    x: drag.panX + dx,
    y: drag.panY + dy,
  }
}

function onMouseUp() {
  endDrag()
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

function endDrag() {
  dragState.value = null
  dragging.value = false
}

function onBackdropClick() {
  if (dragMoved.value) {
    dragMoved.value = false
    return
  }
  emit('close')
}

function onKeyDown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') emit('close')
  else if (e.key === 'ArrowLeft') goPrev()
  else if (e.key === 'ArrowRight') goNext()
}

watch(
  () => [props.open, props.startIndex] as const,
  ([open, startIndex]) => {
    if (open) {
      const max = Math.max(0, imageList.value.length - 1)
      currentIndex.value = Math.min(Math.max(0, startIndex ?? 0), max)
      resetView()
    }
  },
)

watch(
  () => props.open,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

let wheelEl: HTMLElement | null = null

function bindWheel(el: HTMLElement | null) {
  if (wheelEl) wheelEl.removeEventListener('wheel', onWheel)
  wheelEl = el
  if (wheelEl) wheelEl.addEventListener('wheel', onWheel, { passive: false })
}

watch(
  () => props.open,
  (open) => {
    if (!open) bindWheel(null)
    else if (viewportRef.value) bindWheel(viewportRef.value)
  },
)

watch(viewportRef, (el) => {
  if (props.open && el) bindWheel(el)
})

onUnmounted(() => {
  bindWheel(null)
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('keydown', onKeyDown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && currentSrc"
      class="image-preview-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="alt || '图片预览'"
      data-testid="image-preview-modal"
    >
      <div class="image-preview-modal__toolbar">
        <span class="image-preview-modal__hint">
          <template v-if="hasMultiple">滚轮切换图片 · </template>
          拖动查看 · 点击空白处关闭
        </span>
        <div class="image-preview-modal__controls">
          <button
            v-if="hasMultiple"
            type="button"
            class="image-preview-modal__nav"
            aria-label="上一张"
            data-testid="image-preview-prev"
            @click="goPrev"
          >‹</button>
          <span v-if="hasMultiple" class="image-preview-modal__counter" data-testid="image-preview-counter">
            {{ currentIndex + 1 }} / {{ imageList.length }}
          </span>
          <button
            v-if="hasMultiple"
            type="button"
            class="image-preview-modal__nav"
            aria-label="下一张"
            data-testid="image-preview-next"
            @click="goNext"
          >›</button>
          <span v-if="hasMultiple" class="image-preview-modal__divider" />
          <button
            type="button"
            class="image-preview-modal__zoom"
            aria-label="缩小"
            data-testid="image-preview-zoom-out"
            @click="zoomBy(-0.2)"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2" />
              <line x1="15" y1="15" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              <line x1="7.5" y1="10" x2="12.5" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
          <span class="image-preview-modal__scale">{{ Math.round(scale * 100) }}%</span>
          <button
            type="button"
            class="image-preview-modal__zoom"
            aria-label="放大"
            data-testid="image-preview-zoom-in"
            @click="zoomBy(0.2)"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2" />
              <line x1="15" y1="15" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              <line x1="7.5" y1="10" x2="12.5" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              <line x1="10" y1="7.5" x2="10" y2="12.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
          <button type="button" class="image-preview-modal__reset" @click="resetView">重置</button>
          <button type="button" class="image-preview-modal__close" aria-label="关闭" @click="emit('close')">×</button>
        </div>
      </div>
      <div
        ref="viewportRef"
        class="image-preview-modal__viewport"
        :class="{ 'image-preview-modal__viewport--dragging': dragging }"
        @click="onBackdropClick"
      >
        <img
          :key="currentSrc"
          :src="currentSrc"
          :alt="alt || '图片预览'"
          draggable="false"
          class="image-preview-modal__image"
          :style="{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            cursor: dragging ? 'grabbing' : 'grab',
          }"
          @click.stop
          @mousedown="onMouseDown"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.image-preview-modal {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  background: rgba(8, 12, 10, 0.92);
}
.image-preview-modal__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  color: rgba(255, 255, 255, 0.85);
  flex-shrink: 0;
}
.image-preview-modal__hint {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.image-preview-modal__controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.image-preview-modal__controls button {
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  min-width: 32px;
  height: 32px;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.image-preview-modal__controls button:hover {
  background: rgba(255, 255, 255, 0.18);
}
.image-preview-modal__nav {
  font-size: 22px !important;
  padding: 0 6px !important;
}
.image-preview-modal__counter {
  min-width: 3rem;
  text-align: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.image-preview-modal__divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.15);
  margin: 0 2px;
}
.image-preview-modal__zoom {
  padding: 0 !important;
}
.image-preview-modal__scale {
  min-width: 3rem;
  text-align: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.image-preview-modal__reset {
  font-size: 12px !important;
  padding: 0 10px;
}
.image-preview-modal__close {
  font-size: 22px !important;
}
.image-preview-modal__viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  touch-action: none;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  cursor: default;
}
.image-preview-modal__viewport--dragging {
  cursor: grabbing;
}
.image-preview-modal__image {
  max-height: calc(100vh - 4.5rem);
  max-width: min(92vw, calc((100vh - 4.5rem) * 1.2));
  object-fit: contain;
  user-select: none;
  transition: transform 0.05s linear;
}
</style>
