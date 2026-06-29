export interface ScannerBraceletData {
  scannerProductId: string
  braceletCode: string
  certificateNo: string
  imagePath?: string
  inboundAt?: string
  inboundCost: number
  status: string
}

export interface FileSaveResult {
  localPath: string
  thumbPath: string
  fileSize: number
  sha256: string
}

export interface FileReadResult {
  fileId: number
  buffer: string
  mimeType: string
  originalName: string
  fileType: string
}
