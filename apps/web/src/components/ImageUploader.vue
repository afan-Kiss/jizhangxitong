<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { showToast } from 'vant'
import api, { uploadFileWithProgress } from '../api'

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
const failedCount = ref(0)
const dragOver = ref(false)
const isDesktop = ref(false)
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
    for (const key of promotedKeys) {
      const item = localItems.value.find((i) => i.key === key)
      revokePreview(item?.preview)
    }
    localItems.value = localItems.value.filter((i) => !promotedKeys.includes(i.key))
  }
  emit('update:modelValue', merged)
  emit('upload-failures', failedCount.value)
}

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

async function onAddAreaClick(e: MouseEvent) {
  if (!isDesktop.value) return
  e.preventDefault()
  if (probing.value) return
  const ok = await probeUploadChannel()
  if (!ok) return
  probePassed.value = true
  fileInput.value?.click()
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
  dragOver.value = false
  if (!isDesktop.value) return

  const ok = await probeUploadChannel()
  if (!ok) return

  const dt = e.dataTransfer
  if (!dt) return

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

  if (!files.length) {
    showToast('这张微信图片没拖出来，请先保存到电脑再上传。')
    return
  }
  addFiles(files)
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
      syncModelValue()
    } catch (err: unknown) {
      item.status = 'failed'
      item.error = (err as { userMessage?: string })?.userMessage || '上传失败，稍后再试'
      failedCount.value += 1
      emit('upload-failures', failedCount.value)
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
})
onUnmounted(() => {
  mq?.removeEventListener('change', updateDesktopFlag)
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
      :class="{ 'image-uploader__drop--active': dragOver }"
      data-testid="image-uploader-drop"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="handleDrop"
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
              <span data-testid="image-uploader-hint-desktop">点击或把微信图片拖到这里</span>
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
  background: rgba(16, 22, 20, 0.55);
  color: var(--color-gold-light);
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
