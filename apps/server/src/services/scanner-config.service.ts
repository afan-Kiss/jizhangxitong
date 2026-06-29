import { getSettings } from './settings.service'

export interface ScannerSettings {
  scannerApiBaseUrl: string
  localWorkerEnabled: boolean
  scannerSyncTimeoutMs: number
}

export async function getScannerSettings(): Promise<ScannerSettings> {
  const settings = await getSettings()
  return {
    scannerApiBaseUrl: settings.scanner_api_base_url || 'http://127.0.0.1:7789',
    localWorkerEnabled: settings.local_worker_enabled !== 'false',
    scannerSyncTimeoutMs: (Number(settings.scanner_sync_timeout) || 8) * 1000,
  }
}
