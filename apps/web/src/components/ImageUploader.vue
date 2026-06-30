<script setup lang="ts">
import { ref, computed } from 'vue'
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
const uploadQueue = ref<Array<{ key: string; file: File }>>([])
const queueRunning = ref(false)
const failedCount = ref(0)

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

function syncModelValue() {
  const successLocals = localItems.value.filter((i) => i.status === 'success' && i.fileId)
  const merged = [...props.modelValue]
  for (const i of successLocals) {
    if (!merged.some((m) => m.fileId === i.fileId)) {
      merged.push({
        fileId: i.fileId!,
        fileType: i.fileType,
        name: i.name,
        preview: i.preview,
        label: i.label,
      })
    }
  }
  emit('update:modelValue', merged)
  emit('upload-failures', failedCount.value)
}

async function probeUploadChannel() {
  probing.value = true
  try {
    const res = await api.post('/worker/probe-upload', { timeoutMs: 3000 })
    if (!res.data.data?.ok) {
      showToast(res.data.data?.message || '公司电脑本地助手没连上，先重启本地助手；这笔账可以先不传图保存。')
      return false
    }
    return true
  } catch {
    showToast('公司电脑本地助手没连上，先重启本地助手；这笔账可以先不传图保存。')
    return false
  } finally {
    probing.value = false
  }
}

async function onAddClick() {
  const ok = await probeUploadChannel()
  if (!ok) return
  fileInput.value?.click()
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return
  input.value = ''
  for (const file of Array.from(files)) {
    const key = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const label = customLabel.value.trim() || tagLabel(selectedTag.value)
    localItems.value.push({
      key,
      fileType: selectedTag.value,
      label,
      name: file.name,
      preview: URL.createObjectURL(file),
      status: 'queued',
      progress: 0,
    })
    uploadQueue.value.push({ key, file })
  }
  runUploadQueue()
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
  input.accept = 'image/*'
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

function removeItem(item: { key: string; fileId?: number }) {
  if (item.key.startsWith('saved-') && item.fileId) {
    emit('update:modelValue', props.modelValue.filter((m) => m.fileId !== item.fileId))
    return
  }
  localItems.value = localItems.value.filter((i) => i.key !== item.key)
}
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

      <button
        type="button"
        class="image-uploader__add"
        :disabled="probing"
        data-testid="image-uploader-add"
        @click="onAddClick"
      >
        <span v-if="probing" class="image-uploader__ring" />
        <template v-else>
          <span class="image-uploader__plus">+</span>
          <span>添加图片</span>
        </template>
      </button>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      capture="environment"
      multiple
      hidden
      @change="onFileChange"
    />

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
.image-uploader__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-top: 12px;
}
@media (min-width: 768px) {
  .image-uploader__grid { grid-template-columns: repeat(3, 1fr); }
}
@media (min-width: 1200px) {
  .image-uploader__grid { grid-template-columns: repeat(4, 1fr); }
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
  background: rgba(255, 255, 255, 0.5);
  border: 1px dashed rgba(198, 161, 91, 0.35);
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-sub);
}
.image-uploader__add:disabled { opacity: 0.6; cursor: wait; }
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
