<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { showToast } from 'vant'
import api, { uploadFileWithProgress, fileThumbUrl } from '../api'

export interface UploadedItem {
  fileId: number
  fileType: string
  name: string
  preview?: string
  label?: string
}

type LocalItem = {
  key: string
  fileId?: number
  fileType: string
  label: string
  name: string
  preview?: string
  status: 'queued' | 'uploading' | 'success' | 'failed'
  progress: number
  error?: string
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'])
const FILE_ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,image/gif'

const props = defineProps<{
  modelValue: UploadedItem[]
  /** 电脑端：整页 Ctrl+左键 / Ctrl+V / 拖拽 添加外部图片 */
  desktopPageShortcuts?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [UploadedItem[]]
  'upload-failures': [number]
}>()

const quickTags = [
  { type: 'payment_screenshot', label: '付款截图' },
  { type: 'chat_screenshot', label: '聊天截图' },
  { type: 'after_sale_problem', label: '售后问题' },
  { type: 'other', label: '其他凭证' },
]

const selectedTag = ref('payment_screenshot')
const customLabel = ref('')
const localItems = ref<LocalItem[]>([])
const probing = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const dropZone = ref<HTMLElement | null>(null)
const uploadQueue = ref<Array<{ key: string; file: File }>>([])
const queueRunning = ref(false)
const failedCount = computed(() => localItems.value.filter((i) => i.status === 'failed').length)
const dragOver = ref(false)
const isDesktop = ref(false)
const pasteScopeActive = ref(false)
const pageMouseInside = ref(false)
const pageRoot = ref<HTMLElement | null>(null)
const probePassed = ref(false)
const addInputId = `image-uploader-input-${Math.random().toString(36).slice(2, 9)}`

const displayItems = computed(() => {
  const saved = props.modelValue.map((m, idx) => ({
    key: `saved-${m.fileId}-${idx}`,
    fileId: m.fileId,
    fileType: m.fileType,
    label: m.label || tagLabel(m.fileType),
    name: m.name,
    preview: m.preview,
    status: 'success' as const,
    progress: 100,
  }))
  return [...saved, ...localItems.value]
})

function tagLabel(type: string) {
  return quickTags.find((t) => t.type === type)?.label || type
}

function revokePreview(url?: string) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}

function syncModelValue() {
  const successLocals = localItems.value.filter((i) => i.status === 'success' && i.fileId)
  const merged = [...props.modelValue]
  const promotedKeys: string[] = []
  for (const i of successLocals) {
    if (!merged.some((m) => m.fileId === i.fileId)) {
      merged.push({
        fileId: i.fileId!,
        fileType: i.fileType,
        name: i.name,
        preview: i.preview,
        label: i.label,
      })
      promotedKeys.push(i.key)
    }
  }
  if (promotedKeys.length) {
    localItems.value = localItems.value.filter((i) => !promotedKeys.includes(i.key))
  }
  emit('update:modelValue', merged)
}

watch(failedCount, (n) => emit('upload-failures', n), { immediate: true })

async function probeUploadChannel() {
  probing.value = true
  try {
    const res = await api.post('/worker/probe-upload', { timeoutMs: 3000 })
    if (!res.data.data?.ok) {
      showToast(res.data.data?.message || '公司电脑本地助手没连上，这些图先别传；这笔账可以先保存。')
      return false
    }
    return true
  } catch {
    showToast('公司电脑本地助手没连上，这些图先别传；这笔账可以先保存。')
    return false
  } finally {
    probing.value = false
  }
}

function isImageFile(file: File) {
  if (file.type && IMAGE_TYPES.has(file.type.toLowerCase())) return true
  return /\.(png|jpe?g|webp|gif)$/i.test(file.name)
}

/** 点击上传与拖拽上传共用 */
function addFiles(files: File[]) {
  if (!files.length) return
  const label = customLabel.value.trim() || tagLabel(selectedTag.value)
  for (const file of files) {
    if (!isImageFile(file)) {
      showToast('这里只能放图片。')
      continue
    }
    const key = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    localItems.value.push({
      key,
      fileType: selectedTag.value,
      label,
      name: file.name || '图片',
      preview: URL.createObjectURL(file),
      status: 'queued',
      progress: 0,
    })
    uploadQueue.value.push({ key, file })
  }
  runUploadQueue()
}

async function triggerFilePick() {
  if (!isDesktop.value || probing.value) return
  const ok = await probeUploadChannel()
  if (!ok) return

  const w = window as Window & { showOpenFilePicker?: (opts: unknown) => Promise<Array<{ getFile: () => Promise<File> }>> }
  if (typeof w.showOpenFilePicker === 'function') {
    try {
      const handles = await w.showOpenFilePicker({
        multiple: true,
        types: [{
          description: '图片',
          accept: {
            'image/png': ['.png'],
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/webp': ['.webp'],
            'image/gif': ['.gif'],
          },
        }],
      })
      const files = await Promise.all(handles.map((h) => h.getFile()))
      addFiles(files.filter(isImageFile))
      return
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
    }
  }

  probePassed.value = true
  fileInput.value?.click()
}

function extractFilesFromDataTransfer(dt: DataTransfer | null) {
  if (!dt) return [] as File[]
  const files: File[] = []
  if (dt.files?.length) {
    files.push(...Array.from(dt.files))
  } else if (dt.items?.length) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
  }
  return files
}

function shortcutScopeActive() {
  if (pasteScopeActive.value || pageMouseInside.value) return true
  if (!props.desktopPageShortcuts || !pageRoot.value) return false
  const active = document.activeElement
  return !!(active && pageRoot.value.contains(active))
}

function shouldSkipShortcutClick(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return true
  return !!el.closest(
    'input, textarea, button, a, label, .van-popup, .van-dialog, .van-picker, .image-uploader__remove, .image-uploader__retry',
  )
}

async function ingestDropEvent(e: DragEvent) {
  dragOver.value = false
  pageRoot.value?.classList.remove('external-image-drop-target--active')
  if (!isDesktop.value) return
  const files = extractFilesFromDataTransfer(e.dataTransfer)
  if (!files.length) {
    showToast('这张微信图片没拖出来，请先保存到电脑再上传。')
    return
  }
  await ingestDesktopFiles(files)
}

function filesFromClipboard(data: DataTransfer | null) {
  if (!data) return [] as File[]
  const files: File[] = []
  if (data.files?.length) {
    for (const file of Array.from(data.files)) {
      if (isImageFile(file)) files.push(file)
    }
  }
  if (!files.length && data.items?.length) {
    for (const item of Array.from(data.items)) {
      if (item.kind !== 'file') continue
      const file = item.getAsFile()
      if (file && isImageFile(file)) files.push(file)
    }
  }
  return files
}

async function ingestDesktopFiles(files: File[]) {
  if (!files.length) return false
  const ok = await probeUploadChannel()
  if (!ok) return false
  addFiles(files)
  return true
}

async function onDocumentPaste(e: ClipboardEvent) {
  if (!isDesktop.value || !shortcutScopeActive()) return
  const files = filesFromClipboard(e.clipboardData)
  if (!files.length) return
  e.preventDefault()
  await ingestDesktopFiles(files)
}

async function onPageCtrlClick(e: MouseEvent) {
  if (!isDesktop.value || !props.desktopPageShortcuts) return
  if (!e.ctrlKey || e.button !== 0) return
  if (shouldSkipShortcutClick(e.target)) return
  e.preventDefault()
  e.stopPropagation()
  await triggerFilePick()
}

function onPageMouseEnter() {
  pageMouseInside.value = true
}

function onPageMouseLeave(e: MouseEvent) {
  if (pageRoot.value && e.relatedTarget && pageRoot.value.contains(e.relatedTarget as Node)) return
  pageMouseInside.value = false
}

function onPageDragOver(e: DragEvent) {
  if (!isDesktop.value || !props.desktopPageShortcuts) return
  e.preventDefault()
  dragOver.value = true
  pageRoot.value?.classList.add('external-image-drop-target--active')
}

function onPageDragLeave(e: DragEvent) {
  if (!isDesktop.value || !props.desktopPageShortcuts) return
  if (pageRoot.value && e.relatedTarget && pageRoot.value.contains(e.relatedTarget as Node)) return
  dragOver.value = false
  pageRoot.value?.classList.remove('external-image-drop-target--active')
}

async function onPageDrop(e: DragEvent) {
  if (!isDesktop.value || !props.desktopPageShortcuts) return
  e.preventDefault()
  e.stopPropagation()
  pageRoot.value?.classList.remove('external-image-drop-target--active')
  await ingestDropEvent(e)
}

function bindPageRoot(el: HTMLElement | null) {
  unbindPageRoot()
  if (!el || !props.desktopPageShortcuts) return
  pageRoot.value = el
  el.addEventListener('mouseenter', onPageMouseEnter)
  el.addEventListener('mouseleave', onPageMouseLeave)
  el.addEventListener('dragover', onPageDragOver)
  el.addEventListener('dragleave', onPageDragLeave)
  el.addEventListener('drop', onPageDrop)
  el.addEventListener('click', onPageCtrlClick, true)
}

function unbindPageRoot() {
  const el = pageRoot.value
  if (!el) return
  el.removeEventListener('mouseenter', onPageMouseEnter)
  el.removeEventListener('mouseleave', onPageMouseLeave)
  el.removeEventListener('dragover', onPageDragOver)
  el.removeEventListener('dragleave', onPageDragLeave)
  el.removeEventListener('drop', onPageDrop)
  el.removeEventListener('click', onPageCtrlClick, true)
  pageRoot.value = null
  pageMouseInside.value = false
}

defineExpose({ bindPageRoot, unbindPageRoot })

async function onAddAreaClick(e: MouseEvent) {
  if (!isDesktop.value) return
  e.preventDefault()
  if (e.ctrlKey) return
  await triggerFilePick()
}

async function onDropZoneClick(e: MouseEvent) {
  if (!isDesktop.value || !e.ctrlKey || e.button !== 0) return
  if (props.desktopPageShortcuts) return
  const target = e.target as HTMLElement
  if (target.closest('.image-uploader__remove, .image-uploader__retry, .image-uploader__tag-btn')) return
  e.preventDefault()
  e.stopPropagation()
  await triggerFilePick()
}

function onDropZoneMouseEnter() {
  if (isDesktop.value) pasteScopeActive.value = true
}

function onDropZoneMouseLeave(e: MouseEvent) {
  if (!dropZone.value) return
  const related = e.relatedTarget as Node | null
  if (related && dropZone.value.contains(related)) return
  pasteScopeActive.value = false
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return
  const picked = Array.from(files)
  input.value = ''

  if (isDesktop.value && probePassed.value) {
    probePassed.value = false
    addFiles(picked)
    return
  }

  const ok = await probeUploadChannel()
  if (!ok) return
  addFiles(picked)
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (props.desktopPageShortcuts) return
  await ingestDropEvent(e)
}

function onDragOver(e: DragEvent) {
  if (!isDesktop.value) return
  e.preventDefault()
  dragOver.value = true
}

function onDragLeave(e: DragEvent) {
  if (!isDesktop.value) return
  if (dropZone.value && e.relatedTarget && dropZone.value.contains(e.relatedTarget as Node)) return
  dragOver.value = false
}

async function runUploadQueue() {
  if (queueRunning.value) return
  queueRunning.value = true
  while (uploadQueue.value.length) {
    const job = uploadQueue.value.shift()!
    const item = localItems.value.find((i) => i.key === job.key)
    if (!item) continue
    item.status = 'uploading'
    item.progress = 0
    item.error = undefined
    try {
      const record = await uploadFileWithProgress(job.file, item.fileType, (pct) => {
        item.progress = pct
      })
      item.fileId = record.id
      item.status = 'success'
      item.progress = 100
      const blobPreview = item.preview
      try {
        item.preview = await fileThumbUrl(record.id)
        revokePreview(blobPreview)
      } catch {
        // 缩略图暂不可用时保留本地 blob 预览
      }
      syncModelValue()
    } catch (err: unknown) {
      item.status = 'failed'
      item.error = (err as { userMessage?: string })?.userMessage || '上传失败，稍后再试'
    }
  }
  queueRunning.value = false
}

async function retryItem(item: LocalItem) {
  const ok = await probeUploadChannel()
  if (!ok) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = FILE_ACCEPT
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    item.status = 'queued'
    item.error = undefined
    uploadQueue.value.push({ key: item.key, file })
    runUploadQueue()
  }
  input.click()
}

function removeItem(item: { key: string; fileId?: number; preview?: string }) {
  if (item.key.startsWith('saved-') && item.fileId) {
    revokePreview(item.preview)
    emit('update:modelValue', props.modelValue.filter((m) => m.fileId !== item.fileId))
    return
  }
  const local = localItems.value.find((i) => i.key === item.key)
  revokePreview(local?.preview)
  localItems.value = localItems.value.filter((i) => i.key !== item.key)
}

function updateDesktopFlag() {
  isDesktop.value = window.matchMedia('(min-width: 768px) and (hover: hover)').matches
}

let mq: MediaQueryList | null = null
onMounted(() => {
  updateDesktopFlag()
  mq = window.matchMedia('(min-width: 768px) and (hover: hover)')
  mq.addEventListener('change', updateDesktopFlag)
  document.addEventListener('paste', onDocumentPaste)
})
onUnmounted(() => {
  mq?.removeEventListener('change', updateDesktopFlag)
  document.removeEventListener('paste', onDocumentPaste)
  unbindPageRoot()
})
</script>

<template>
  <div class="image-uploader" data-testid="image-uploader">
    <div class="image-uploader__tags">
      <button
        v-for="tag in quickTags"
        :key="tag.type"
        type="button"
        class="image-uploader__tag-btn"
        :class="{ 'image-uploader__tag-btn--active': selectedTag === tag.type }"
        @click="selectedTag = tag.type"
      >
        {{ tag.label }}
      </button>
    </div>
    <van-field
      v-model="customLabel"
      label="备注"
      placeholder="可选，例如：顺丰面单"
      maxlength="30"
    />

    <div
      ref="dropZone"
      class="image-uploader__drop"
      :class="{ 'image-uploader__drop--active': dragOver, 'image-uploader__drop--desktop': isDesktop }"
      data-testid="image-uploader-drop"
      tabindex="0"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="handleDrop"
      @mouseenter="onDropZoneMouseEnter"
      @mouseleave="onDropZoneMouseLeave"
      @click="onDropZoneClick"
    >
      <div class="image-uploader__grid">
        <div
          v-for="item in displayItems"
          :key="item.key"
          class="image-uploader__thumb"
          :class="{ 'image-uploader__thumb--failed': item.status === 'failed' }"
        >
          <img v-if="item.preview" :src="item.preview" alt="" />
          <div v-if="item.status === 'uploading'" class="image-uploader__overlay">
            上传中 {{ item.progress }}%
          </div>
          <div v-else-if="item.status === 'failed'" class="image-uploader__overlay image-uploader__overlay--error">
            上传失败
          </div>
          <span class="image-uploader__label">{{ item.label }}</span>
          <button class="image-uploader__remove" type="button" @click="removeItem(item as LocalItem)">×</button>
          <button
            v-if="item.status === 'failed'"
            class="image-uploader__retry"
            type="button"
            @click="retryItem(item as LocalItem)"
          >
            重新上传
          </button>
        </div>

        <div
          class="image-uploader__add-wrap"
          data-testid="image-uploader-add"
        >
          <input
            v-if="!isDesktop"
            :id="addInputId"
            ref="fileInput"
            type="file"
            :accept="FILE_ACCEPT"
            multiple
            class="image-uploader__file-input"
            data-testid="image-uploader-file-input"
            @change="onFileChange"
          />
          <input
            v-else
            ref="fileInput"
            type="file"
            :accept="FILE_ACCEPT"
            multiple
            class="image-uploader__file-input image-uploader__file-input--hidden"
            data-testid="image-uploader-file-input"
            tabindex="-1"
            @change="onFileChange"
          />
          <div
            v-if="isDesktop"
            class="image-uploader__add"
            :class="{ 'image-uploader__add--busy': probing }"
            role="button"
            tabindex="0"
            @click="onAddAreaClick"
          >
            <span v-if="probing" class="image-uploader__ring" />
            <template v-else>
              <span class="image-uploader__plus">+</span>
              <span data-testid="image-uploader-hint-desktop">Ctrl+左键选外部图片 · Ctrl+V 粘贴 · 可拖拽</span>
            </template>
          </div>
          <label
            v-else
            :for="addInputId"
            class="image-uploader__add"
            :class="{ 'image-uploader__add--busy': probing }"
          >
            <span v-if="probing" class="image-uploader__ring" />
            <template v-else>
              <span class="image-uploader__plus">+</span>
              <span data-testid="image-uploader-hint-mobile">点这里添加图片</span>
            </template>
          </label>
        </div>
      </div>

      <p v-if="dragOver" class="image-uploader__drop-hint" data-testid="image-uploader-drop-hint">松开就上传</p>
    </div>

    <p v-if="failedCount > 0" class="image-uploader__warn">
      有 {{ failedCount }} 张图没传上，可稍后补传。
    </p>
  </div>
</template>

<style scoped>
.image-uploader__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.image-uploader__tag-btn {
  border: 1px solid rgba(198, 161, 91, 0.35);
  background: rgba(255, 255, 255, 0.5);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--color-text-sub);
}
.image-uploader__tag-btn--active {
  border-color: var(--color-gold);
  color: var(--color-jade-deep);
  background: rgba(198, 161, 91, 0.12);
}
.image-uploader__drop {
  position: relative;
  margin-top: 12px;
  border-radius: 16px;
  transition: box-shadow var(--duration-fast), border-color var(--duration-fast);
}
.image-uploader__drop--desktop:focus {
  outline: none;
}
.image-uploader__drop--desktop:focus-visible {
  box-shadow: 0 0 0 2px rgba(198, 161, 91, 0.35);
}
.image-uploader__drop--active {
  box-shadow: 0 0 0 2px rgba(198, 161, 91, 0.45), var(--shadow-glow);
}
.image-uploader__drop-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-gold-deep);
  font-size: 16px;
  font-weight: 600;
  pointer-events: none;
  z-index: 2;
}
.image-uploader__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
@media (min-width: 768px) {
  .image-uploader__grid { grid-template-columns: repeat(3, 1fr); }
}
@media (min-width: 1200px) {
  .image-uploader__grid { grid-template-columns: repeat(4, 1fr); }
}
.image-uploader__add-wrap {
  position: relative;
  aspect-ratio: 1;
}
.image-uploader__file-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  z-index: 3;
  font-size: 16px;
}
.image-uploader__file-input--hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  inset: auto;
}
.image-uploader__add,
.image-uploader__thumb {
  aspect-ratio: 1;
  border-radius: 14px;
  overflow: hidden;
  position: relative;
}
.image-uploader__add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.5);
  border: 1px dashed rgba(198, 161, 91, 0.35);
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-sub);
  padding: 8px;
  text-align: center;
}
.image-uploader__add--busy { opacity: 0.6; }
.image-uploader__plus { font-size: 22px; color: var(--color-gold); line-height: 1; }
.image-uploader__thumb img { width: 100%; height: 100%; object-fit: cover; }
.image-uploader__thumb--failed { border: 1px solid rgba(220, 80, 80, 0.5); }
.image-uploader__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(16, 22, 20, 0.55);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  padding: 8px;
  z-index: 1;
}
.image-uploader__overlay--error { background: rgba(120, 30, 30, 0.65); }
.image-uploader__label {
  position: absolute;
  left: 6px;
  bottom: 6px;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(16, 22, 20, 0.65);
  color: var(--color-text-light);
  max-width: calc(100% - 12px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  z-index: 1;
}
.image-uploader__remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(16, 22, 20, 0.55);
  color: #fff;
  font-size: 14px;
  line-height: 1;
  z-index: 2;
}
.image-uploader__retry {
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  border: none;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--color-jade-deep);
  z-index: 2;
}
.image-uploader__ring {
  width: 28px;
  height: 28px;
  border: 2px solid rgba(198, 161, 91, 0.2);
  border-top-color: var(--color-gold);
  border-radius: 50%;
  animation: spin-soft 0.8s linear infinite;
}
.image-uploader__warn {
  margin-top: 10px;
  font-size: 12px;
  color: var(--color-danger);
}
</style>
