<script setup lang="ts">
import { ref } from 'vue'
import { uploadFile } from '../api'

export interface UploadedItem {
  fileId: number
  fileType: string
  name: string
  preview?: string
}

const props = defineProps<{
  modelValue: UploadedItem[]
}>()

const emit = defineEmits<{
  'update:modelValue': [UploadedItem[]]
}>()

const uploading = ref<string | null>(null)
const uploadProgress = ref(0)
const uploadError = ref('')

const slots = [
  { type: 'payment_screenshot', label: '付款截图' },
  { type: 'chat_screenshot', label: '聊天截图' },
  { type: 'after_sale_problem', label: '售后问题' },
  { type: 'other', label: '其他凭证' },
]

function compressPreview(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

async function handlePick(type: string, e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''

  uploading.value = type
  uploadProgress.value = 20
  uploadError.value = ''

  try {
    uploadProgress.value = 50
    const preview = await compressPreview(file)
    uploadProgress.value = 70
    const record = await uploadFile(file, type)
    uploadProgress.value = 100
    const next = [...props.modelValue, { fileId: record.id, fileType: type, name: file.name, preview }]
    emit('update:modelValue', next)
  } catch (err: any) {
    uploadError.value = err.response?.data?.message || '上传失败'
  } finally {
    uploading.value = null
    uploadProgress.value = 0
  }
}

function remove(idx: number) {
  const next = [...props.modelValue]
  next.splice(idx, 1)
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="image-uploader">
    <div class="image-uploader__grid">
      <div v-for="item in modelValue" :key="item.fileId" class="image-uploader__thumb fade-in">
        <img v-if="item.preview" :src="item.preview" alt="" />
        <span class="image-uploader__tag">{{ item.fileType === 'payment_screenshot' ? '付款' : '凭证' }}</span>
        <button class="image-uploader__remove" type="button" @click="remove(modelValue.indexOf(item))">×</button>
      </div>
      <label v-for="slot in slots" :key="slot.type" class="image-uploader__slot">
        <input type="file" accept="image/*" hidden @change="handlePick(slot.type, $event)" />
        <span v-if="uploading === slot.type" class="image-uploader__loading">
          <span class="image-uploader__ring" />
        </span>
        <template v-else>
          <span class="image-uploader__plus">+</span>
          <span class="image-uploader__label">{{ slot.label }}</span>
        </template>
      </label>
    </div>
    <div v-if="uploading" class="image-uploader__progress">
      <div class="image-uploader__bar" :style="{ width: `${uploadProgress}%` }" />
    </div>
    <div v-if="uploadError" class="image-uploader__error">{{ uploadError }}</div>
  </div>
</template>

<style scoped>
.image-uploader__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.image-uploader__slot,
.image-uploader__thumb {
  aspect-ratio: 1;
  border-radius: 14px;
  overflow: hidden;
  position: relative;
}
.image-uploader__slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.5);
  border: 1px dashed rgba(198, 161, 91, 0.35);
  cursor: pointer;
  transition: border-color var(--duration-fast);
}
.image-uploader__slot:active { border-color: var(--color-gold); }
.image-uploader__plus { font-size: 22px; color: var(--color-gold); line-height: 1; }
.image-uploader__label { font-size: 11px; color: var(--color-text-sub); }
.image-uploader__thumb img { width: 100%; height: 100%; object-fit: cover; }
.image-uploader__tag {
  position: absolute;
  left: 6px;
  bottom: 6px;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(16, 22, 20, 0.65);
  color: var(--color-text-light);
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
.image-uploader__loading {
  display: flex;
  align-items: center;
  justify-content: center;
}
.image-uploader__ring {
  width: 28px;
  height: 28px;
  border: 2px solid rgba(198, 161, 91, 0.2);
  border-top-color: var(--color-gold);
  border-radius: 50%;
  animation: spin-soft 0.8s linear infinite;
}
.image-uploader__progress {
  margin-top: 10px;
  height: 3px;
  background: rgba(198, 161, 91, 0.15);
  border-radius: 2px;
  overflow: hidden;
}
.image-uploader__bar {
  height: 100%;
  background: linear-gradient(90deg, var(--color-jade), var(--color-gold));
  transition: width 0.2s var(--ease-out);
}
.image-uploader__error {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-danger);
}
</style>
