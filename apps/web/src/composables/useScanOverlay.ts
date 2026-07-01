import { ref } from 'vue'
import { showToast } from 'vant'
import { useScanWorkbench } from './useScanWorkbench'

const cameraVisible = ref(false)
const resultVisible = ref(false)

export function useScanOverlay() {
  const workbench = useScanWorkbench()

  async function openScan() {
    const ok = await workbench.loadStatus()
    if (!ok) {
      showToast('扫码工作台未启用')
      return
    }
    workbench.resetResult()
    cameraVisible.value = true
  }

  function closeCamera() {
    cameraVisible.value = false
  }

  async function onCodeDetected(code: string) {
    closeCamera()
    const ok = await workbench.recognize(code, 'camera')
    if (ok) resultVisible.value = true
  }

  function closeResult() {
    resultVisible.value = false
    workbench.resetResult()
  }

  return {
    cameraVisible,
    resultVisible,
    openScan,
    closeCamera,
    onCodeDetected,
    closeResult,
    ...workbench,
  }
}
