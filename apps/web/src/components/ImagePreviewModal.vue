<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  open: boolean
  src: string | null
  alt?: string
}>()

const emit = defineEmits<{ close: [] }>()

const scale = ref(1)
const pan = ref({ x: 0, y: 0 })
const dragging = ref(false)
const dragMoved = ref(false)
const viewportRef = ref<HTMLElement | null>(null)
const dragState = ref<{ startX: number; startY: number; panX: number; panY: number } | null>(null)

function resetView() {
  scale.value = 1
  pan.value = { x: 0, y: 0 }
}

function zoomBy(delta: number) {
  scale.value = Math.min(5, Math.max(0.25, Number((scale.value + delta).toFixed(2))))
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  e.stopPropagation()
  zoomBy(e.deltaY < 0 ? 0.12 : -0.12)
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
  if (e.key === 'Escape') emit('close')
}

watch(
  () => [props.open, props.src] as const,
  ([open]) => {
    if (open) resetView()
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

watch(
  () => props.open,
  (open) => {
    if (wheelEl) {
      wheelEl.removeEventListener('wheel', onWheel)
      wheelEl = null
    }
    if (open && viewportRef.value) {
      wheelEl = viewportRef.value
      wheelEl.addEventListener('wheel', onWheel, { passive: false })
    }
  },
)

watch(viewportRef, (el) => {
  if (!props.open || !el) return
  if (wheelEl) wheelEl.removeEventListener('wheel', onWheel)
  wheelEl = el
  wheelEl.addEventListener('wheel', onWheel, { passive: false })
})

onUnmounted(() => {
  if (wheelEl) wheelEl.removeEventListener('wheel', onWheel)
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('keydown', onKeyDown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && src"
      class="image-preview-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="alt || '图片预览'"
      data-testid="image-preview-modal"
    >
      <div class="image-preview-modal__toolbar">
        <span class="image-preview-modal__hint">滚轮缩放 · 拖动图片 · 点击空白处关闭</span>
        <div class="image-preview-modal__controls">
          <button type="button" aria-label="缩小" @click="zoomBy(-0.2)">−</button>
          <span class="image-preview-modal__scale">{{ Math.round(scale * 100) }}%</span>
          <button type="button" aria-label="放大" @click="zoomBy(0.2)">+</button>
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
          :src="src"
          :alt="alt || '图片预览'"
          draggable="false"
          class="image-preview-modal__image"
          :style="{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            cursor: dragging ? 'grabbing' : scale > 1 ? 'grab' : 'zoom-in',
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
}
.image-preview-modal__controls button:hover {
  background: rgba(255, 255, 255, 0.18);
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
  cursor: zoom-out;
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
