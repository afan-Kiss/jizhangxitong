import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

const FILE_BASE = path.resolve(process.env.FILE_BASE_DIR || 'D:/jewelry-account-files')

const SUB_DIRS = ['expenses', 'sales', 'after-sale', 'export-cache', 'thumbs'] as const

export function getFileBaseDir() {
  return FILE_BASE
}

export function assertPathAllowed(targetPath: string): string {
  const resolved = path.resolve(targetPath)
  const base = FILE_BASE
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error('PATH_TRAVERSAL')
  }
  return resolved
}

export async function ensureBaseDirs() {
  await fs.mkdir(FILE_BASE, { recursive: true })
  for (const sub of SUB_DIRS) {
    await fs.mkdir(path.join(FILE_BASE, sub), { recursive: true })
  }
}

export async function checkWritable(): Promise<boolean> {
  try {
    await ensureBaseDirs()
    const test = path.join(FILE_BASE, '.write-test')
    await fs.writeFile(test, 'ok')
    await fs.unlink(test)
    return true
  } catch {
    return false
  }
}

function getSubDir(fileType: string): string {
  if (fileType === 'after_sale_problem' || fileType === 'chat_screenshot') return 'after-sale'
  if (fileType === 'bracelet_photo') return 'sales'
  return 'expenses'
}

export async function saveUpload(input: {
  fileType: string
  originalName: string
  mimeType: string
  base64: string
}) {
  try {
    const now = new Date()
    const year = String(now.getFullYear())
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const subDir = getSubDir(input.fileType)
    const dir = path.join(FILE_BASE, subDir, year, month)
    await fs.mkdir(dir, { recursive: true })

    const ext = path.extname(input.originalName) || (input.mimeType.includes('png') ? '.png' : '.jpg')
    const fileName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`
    const localPath = path.join(dir, fileName)
    const buffer = Buffer.from(input.base64, 'base64')
    await fs.writeFile(localPath, buffer)

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')

    // 原图字节原样落盘；缩略图路径指向同一文件，不做 resize / 重编码
    const thumbPath = localPath

    return { localPath, thumbPath, fileSize: buffer.length, sha256 }
  } catch (err) {
    throw new Error(`保存图片失败: ${(err as Error).message}`)
  }
}

export async function readFileByPath(filePath: string, allowOutsideBase = false) {
  let safe = filePath
  if (!allowOutsideBase) {
    safe = assertPathAllowed(filePath)
  } else if (filePath.includes('..')) {
    throw new Error('PATH_TRAVERSAL')
  }
  const buffer = await fs.readFile(safe)
  const ext = path.extname(safe).toLowerCase()
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
  return { buffer, mimeType }
}

export async function deleteLocalFile(localPath: string, thumbPath?: string) {
  const results: string[] = []
  for (const p of [localPath, thumbPath].filter(Boolean) as string[]) {
    try {
      const safe = assertPathAllowed(p)
      await fs.unlink(safe)
      results.push(safe)
    } catch {
      // ignore missing
    }
  }
  return results
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(assertPathAllowed(filePath))
    return true
  } catch {
    return false
  }
}
