<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted, computed } from 'vue'
import { showToast } from 'vant'
import type { Html5Qrcode as Html5QrcodeType, Html5QrcodeSupportedFormats as FormatsType } from 'html5-qrcode'

const props = defineProps<{
  visible: boolean
  /** 电脑端为 false：不调用摄像头，提示使用扫码枪 */
  useCamera?: boolean
}>()

const emit = defineEmits<{
  close: []
  detected: [code: string]
}>()

const useCameraMode = computed(() => props.useCamera !== false)

const readerId = 'scan-camera-reader'
const fileInput = ref<HTMLInputElement | null>(null)
const gunInput = ref<HTMLInputElement | null>(null)
const gunCode = ref('')
const starting = ref(false)
const handling = ref(false)

let scanner: Html5QrcodeType | null = null
let Html5QrcodeCtor: typeof Html5QrcodeType | null = null
let scanFormats: FormatsType[] = []

async function loadScannerLib() {
  if (Html5QrcodeCtor) return
  const mod = await import('html5-qrcode')
  Html5QrcodeCtor = mod.Html5Qrcode
  scanFormats = [
    mod.Html5QrcodeSupportedFormats.QR_CODE,
    mod.Html5QrcodeSupportedFormats.CODE_128,
    mod.Html5QrcodeSupportedFormats.CODE_39,
    mod.Html5QrcodeSupportedFormats.CODE_93,
    mod.Html5QrcodeSupportedFormats.EAN_13,
    mod.Html5QrcodeSupportedFormats.EAN_8,
    mod.Html5QrcodeSupportedFormats.UPC_A,
    mod.Html5QrcodeSupportedFormats.UPC_E,
    mod.Html5QrcodeSupportedFormats.ITF,
    mod.Html5QrcodeSupportedFormats.CODABAR,
    mod.Html5QrcodeSupportedFormats.DATA_MATRIX,
    mod.Html5QrcodeSupportedFormats.AZTEC,
    mod.Html5QrcodeSupportedFormats.PDF_417,
  ]
}

function ensureScanner() {
  if (!scanner && Html5QrcodeCtor) {
    scanner = new Html5QrcodeCtor(readerId, {
      formatsToSupport: scanFormats,
      verbose: false,
    })
  }
  return scanner
}

async function stopScanner() {
  if (!scanner) return
  try {
    if (scanner.isScanning) await scanner.stop()
    scanner.clear()
  } catch {
    /* ignore stop race */
  }
}

async function startCamera() {
  if (starting.value || handling.value) return
  starting.value = true
  try {
    await loadScannerLib()
    await stopScanner()
    await nextTick()
    const html5 = ensureScanner()
    if (!html5) return
    const mod = await import('html5-qrcode')
    const cameras = await mod.Html5Qrcode.getCameras()
    if (!cameras.length) {
      showToast('没找到摄像头，可以用相册选图识别')
      return
    }
    const back =
      cameras.find((c) => /back|rear|environment|后置|背面/i.test(c.label)) ||
      cameras[cameras.length - 1] ||
      cameras[0]
    await html5.start(
      back.id,
      {
        fps: 12,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const width = Math.min(viewfinderWidth * 0.88, 320)
          const height = Math.min(viewfinderHeight * 0.42, 180)
          return { width, height }
        },
        aspectRatio: 1.777778,
      },
      onScanSuccess,
      () => {},
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    showToast(msg.includes('NotAllowed') ? '请允许使用摄像头' : '摄像头打不开，试试相册选图')
  } finally {
    starting.value = false
  }
}

function onScanSuccess(decodedText: string) {
  const code = String(decodedText || '').trim()
  if (!code || handling.value) return
  handling.value = true
  void stopScanner().finally(() => {
    emit('detected', code)
    handling.value = false
  })
}

function pickAlbum() {
  fileInput.value?.click()
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || handling.value) return
  handling.value = true
  try {
    await loadScannerLib()
    await stopScanner()
    const html5 = ensureScanner()
    if (!html5) throw new Error('scanner unavailable')
    const code = await html5.scanFile(file, false)
    onScanSuccess(code)
  } catch {
    showToast('这张图里没识别到条码，换一张试试')
    handling.value = false
    if (props.visible && useCameraMode.value) await startCamera()
  }
}

function submitGunCode() {
  const code = gunCode.value.trim()
  if (!code || handling.value) return
  handling.value = true
  gunCode.value = ''
  emit('detected', code)
  handling.value = false
}

function onGunEnter(e: KeyboardEvent) {
  e.preventDefault()
  submitGunCode()
}

function close() {
  void stopScanner()
  emit('close')
}

async function onOpenChange(open: boolean) {
  handling.value = false
  gunCode.value = ''
  if (!open) {
    await stopScanner()
    return
  }
  if (useCameraMode.value) {
    await nextTick()
    await startCamera()
  } else {
    await stopScanner()
    await nextTick()
    gunInput.value?.focus()
  }
}

watch(() => props.visible, (open) => {
  void onOpenChange(open)
})

onUnmounted(() => {
  void stopScanner()
  scanner = null
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="scan-camera"
      :class="{ 'scan-camera--gun': !useCameraMode }"
      data-testid="scan-camera-overlay"
    >
      <template v-if="useCameraMode">
        <div :id="readerId" class="scan-camera__reader" data-testid="scan-camera-reader" />
        <div class="scan-camera__mask scan-camera__mask--top" />
        <div class="scan-camera__mask scan-camera__mask--bottom" />
        <header class="scan-camera__head">
          <button type="button" class="scan-camera__icon-btn" aria-label="关闭" data-testid="scan-camera-close" @click="close">
            ×
          </button>
          <span class="scan-camera__title">扫码识别</span>
          <span class="scan-camera__spacer" />
        </header>
        <div class="scan-camera__frame-hint">对准二维码或条形码</div>
        <footer class="scan-camera__foot">
          <button type="button" class="scan-camera__album" data-testid="scan-camera-album" @click="pickAlbum">
            <span class="scan-camera__album-icon">🖼</span>
            <span>相册</span>
          </button>
          <p class="scan-camera__tip">支持二维码、条形码；也可从相册选图识别</p>
        </footer>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="scan-camera__file"
          data-testid="scan-camera-file-input"
          @change="onFileChange"
        />
      </template>

      <template v-else>
        <div class="scan-gun" data-testid="scan-gun-overlay">
          <header class="scan-gun__head">
            <button type="button" class="scan-camera__icon-btn" aria-label="关闭" data-testid="scan-camera-close" @click="close">
              ×
            </button>
            <span class="scan-camera__title">扫码识别</span>
            <span class="scan-camera__spacer" />
          </header>
          <div class="scan-gun__body">
            <div class="scan-gun__icon">⌁</div>
            <h3 class="scan-gun__title">请用扫码枪扫描</h3>
            <p class="scan-gun__desc">电脑端不调用摄像头。USB 扫码枪插上即用，扫一下条码会自动填入下方输入框，按回车或点识别。</p>
            <input
              ref="gunInput"
              v-model="gunCode"
              class="scan-gun__input"
              data-testid="scan-input"
              placeholder="扫码枪扫描后会自动填入，也可手动输入后回车"
              @keydown.enter="onGunEnter"
            />
            <button type="button" class="scan-gun__submit" data-testid="scan-recognize-btn" @click="submitGunCode">
              识别
            </button>
          </div>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.scan-camera {
  position: fixed;
  inset: 0;
  z-index: 5000;
  background: #000;
  color: #fff;
}
.scan-camera--gun {
  background: rgba(6, 9, 8, 0.92);
}
.scan-camera__reader {
  position: absolute;
  inset: 0;
}
.scan-camera__reader :deep(video) {
  object-fit: cover !important;
  width: 100% !important;
  height: 100% !important;
}
.scan-camera__mask {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.55), transparent);
  z-index: 1;
}
.scan-camera__mask--top {
  top: 0;
  height: 120px;
}
.scan-camera__mask--bottom {
  bottom: 0;
  height: 180px;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.72), transparent);
}
.scan-camera__head,
.scan-gun__head {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(12px + env(safe-area-inset-top)) 16px 12px;
}
.scan-camera__title {
  font-size: 16px;
  font-weight: 600;
}
.scan-camera__spacer {
  width: 40px;
}
.scan-camera__icon-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}
.scan-camera__frame-hint {
  position: absolute;
  top: 42%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  font-size: 13px;
  white-space: nowrap;
}
.scan-camera__foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 20px calc(24px + env(safe-area-inset-bottom));
}
.scan-camera__album {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 13px;
  min-width: 64px;
  min-height: 64px;
  cursor: pointer;
}
.scan-camera__album-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  font-size: 22px;
}
.scan-camera__tip {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
  text-align: center;
}
.scan-camera__file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.scan-gun {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 72px 20px 24px;
}
.scan-gun__body {
  width: min(440px, 100%);
  padding: 28px 24px;
  border-radius: 18px;
  border: 1px solid rgba(198, 161, 91, 0.28);
  background: linear-gradient(145deg, rgba(22, 30, 27, 0.96), rgba(12, 16, 14, 0.98));
  text-align: center;
}
.scan-gun__icon {
  font-size: 42px;
  line-height: 1;
  color: var(--color-gold);
  margin-bottom: 12px;
}
.scan-gun__title {
  margin: 0 0 10px;
  font-size: 20px;
  color: var(--color-text-light);
}
.scan-gun__desc {
  margin: 0 0 18px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-sub);
}
.scan-gun__input {
  width: 100%;
  box-sizing: border-box;
  padding: 14px 12px;
  min-height: 52px;
  border-radius: 12px;
  border: var(--border-glass);
  background: rgba(0, 0, 0, 0.35);
  color: var(--color-text-light);
  font-size: 16px;
  margin-bottom: 12px;
}
.scan-gun__input:focus {
  outline: none;
  border-color: var(--color-gold);
}
.scan-gun__submit {
  width: 100%;
  min-height: 48px;
  border: none;
  border-radius: 12px;
  background: rgba(78, 125, 105, 0.85);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
</style>
